-- Q52 messaging + Q64 notifications bug hunt (lane bughunt-messaging). Additive: CREATE OR REPLACE with unchanged signatures, new
-- tables/RPCs/triggers, two RESTRICTIVE policies. Deployed code keeps working before the matching build ships.
--  1. Unread: a teammate's message in a shared workspace inbox (and deleted messages) no longer count as unread for the team.
--  2. post_message: the 10-minute throttle was per CONVERSATION (any message by either side), so in a live back-and-forth the
--     replies were never notified (or emailed). Now per RECIPIENT: one alert per unread burst, re-armed when the conversation is read.
--     Workspace-side alerts carry the workspace (the organiser in-app/email switches now apply to messages). Attachment-only
--     messages get a preview. Blocks are enforced (either direction).
--  3. Reading a conversation also clears its bell notification (it stayed unread forever; emails were then throttled away).
--  4. Online Safety Act: report a message (reason code, note, excerpt snapshot, trust case, admin alert, audit) and block a
--     contact (seat-scoped, like saved contacts). Admin decision RPC (dismiss / action, optionally remove the message).
--  5. Legacy event threads (threads/messages): replies notified nobody; the customer's "mark read" always failed RLS (the WITH
--     CHECK needs sender_id = caller) so unread badges never cleared; a participant could post as "the provider", rewrite
--     another sender's message or delete the provider's messages. Fixed with a definer mark-read RPC, a BEFORE INSERT guard and
--     two RESTRICTIVE policies (update/delete own rows only).
--  6. Notifications fire once: the same alert inserted twice in one transaction (e.g. provider cancellation → apply_cancellation
--     AND build_item_primary_failed both sent "Replacement needed") is dropped.
--  7. Provider per-kind notification settings (enquiries / bookings / agent / mentions × email / in-app) were saved but never
--     applied (the prefs trigger skipped provider workspaces). Now honoured; mandatory kinds always go.
--  8. Email categories: team leave/shift/availability requests were filed as "Bookings & quotes" (so muting quotes muted rota
--     mail); expiring licences/documents, contracts, weather/rider/safety alerts sent no email at all; trust enforcement (a P2B
--     statement of reasons) is now a mandatory service email.

-- 1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.my_conversations(p_workspace uuid default null::uuid, p_limit integer default 50)
 returns table(id uuid, kind text, subject text, last_message_at timestamp with time zone, last_message_preview text, unread boolean, counterpart text, event_id uuid, listing_id uuid, counterpart_type text, counterpart_id uuid, counterpart_avatar text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select c.id, c.kind, c.subject, c.last_message_at, c.last_message_preview,
    coalesce(me.last_read_at, 'epoch'::timestamptz) < c.last_message_at and exists (select 1 from public.conversation_messages m
      where m.conversation_id = c.id and m.deleted_at is null and m.created_at > coalesce(me.last_read_at, 'epoch')
        and case when me.workspace_id is not null then m.sender_workspace_id is distinct from me.workspace_id
                 else m.sender_id is distinct from (select auth.uid()) end),
    (select string_agg(o.label, ', ') from public.conversation_participants o where o.conversation_id = c.id and o.id <> me.id),
    c.event_id, c.listing_id,
    case when o1.workspace_id is not null then 'workspace' when o1.user_id is not null then 'user' end,
    coalesce(o1.workspace_id, o1.user_id),
    coalesce(nullif(w.settings #>> '{brand,logo}', ''), w.cover_image, p.avatar_url)
  from public.conversation_participants me join public.conversations c on c.id = me.conversation_id
  left join lateral (select o.user_id, o.workspace_id from public.conversation_participants o where o.conversation_id = c.id and o.id <> me.id order by o.created_at limit 1) o1 on true
  left join public.workspaces w on w.id = o1.workspace_id
  left join public.profiles p on p.id = o1.user_id
  where me.left_at is null and ((p_workspace is null and me.user_id = (select auth.uid())) or (p_workspace is not null and me.workspace_id = p_workspace and public.is_workspace_member(p_workspace)))
  order by c.last_message_at desc limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

-- 4a (needed by 2) ─ blocks ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.message_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_user uuid references auth.users(id) on delete cascade,
  owner_workspace uuid references public.workspaces(id) on delete cascade,
  target_type text not null check (target_type in ('user','workspace')),
  target_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((owner_user is null) <> (owner_workspace is null))
);
create unique index if not exists message_blocks_user_uq on public.message_blocks(owner_user, target_type, target_id) where owner_user is not null;
create unique index if not exists message_blocks_ws_uq on public.message_blocks(owner_workspace, target_type, target_id) where owner_workspace is not null;
create index if not exists message_blocks_target_idx on public.message_blocks(target_type, target_id);
alter table public.message_blocks enable row level security;
revoke all on table public.message_blocks from public, anon, authenticated;
grant select on table public.message_blocks to authenticated;
grant all on table public.message_blocks to service_role;
drop policy if exists message_blocks_read on public.message_blocks;
create policy message_blocks_read on public.message_blocks for select to authenticated
  using (owner_user = (select auth.uid()) or (owner_workspace is not null and public.is_workspace_member(owner_workspace)));

-- 2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.post_message(p_conv uuid, p_body text, p_attachments jsonb default '[]'::jsonb, p_as_workspace uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare mid uuid; me uuid := auth.uid(); name text; label text; r record; n_att int := jsonb_array_length(coalesce(p_attachments, '[]')); preview text; lnk text := '/messages/' || p_conv;
begin
  if not public.can_access_conversation(p_conv) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_as_workspace is not null and not (public.is_workspace_member(p_as_workspace) and exists (select 1 from public.conversation_participants x where x.conversation_id = p_conv and x.workspace_id = p_as_workspace)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 and n_att = 0 then raise exception 'empty_message' using errcode = '22023'; end if;
  if n_att > 10 or exists (select 1 from jsonb_array_elements(coalesce(p_attachments, '[]')) a
     where coalesce(a->>'path', '') !~ ('^' || me::text || '/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$')) then raise exception 'invalid_attachment' using errcode = '22023'; end if;
  if (select count(*) from public.conversation_messages m where m.sender_id = me and m.created_at > now() - interval '1 minute') >= 30 then raise exception 'rate_limited' using errcode = '54000'; end if;
  -- Q52 blocks: the other side blocked this person/workspace, or this seat blocked the other side.
  if exists (select 1 from public.conversation_participants o join public.message_blocks b on (b.owner_user = o.user_id or b.owner_workspace = o.workspace_id)
             where o.conversation_id = p_conv and o.left_at is null
               and not (o.user_id is not distinct from me and p_as_workspace is null) and o.workspace_id is distinct from p_as_workspace
               and ((b.target_type = 'user' and b.target_id = me) or (b.target_type = 'workspace' and b.target_id = p_as_workspace))) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if exists (select 1 from public.conversation_participants o join public.message_blocks b
               on (case when p_as_workspace is null then b.owner_user = me else b.owner_workspace = p_as_workspace end)
              and ((b.target_type = 'user' and b.target_id = o.user_id) or (b.target_type = 'workspace' and b.target_id = o.workspace_id))
             where o.conversation_id = p_conv and o.left_at is null) then
    raise exception 'blocked_by_you' using errcode = '42501';
  end if;
  select coalesce(p.full_name, 'Member') into name from public.profiles p where p.id = me;
  label := coalesce(name, '') || coalesce(' · ' || (select w.name from public.workspaces w where w.id = p_as_workspace), '');
  insert into public.conversation_messages(conversation_id, sender_id, sender_workspace_id, sender_name, body, attachments)
    values (p_conv, me, p_as_workspace, label, left(trim(coalesce(p_body, '')), 8000), coalesce(p_attachments, '[]'))
    returning id into mid;
  preview := left(regexp_replace(trim(coalesce(p_body, '')), '\s+', ' ', 'g'), 140);
  if preview = '' and n_att > 0 then preview := '📎 ' || n_att || case when n_att = 1 then ' attachment' else ' attachments' end; end if;
  update public.conversations set last_message_at = now(), last_message_preview = preview where id = p_conv;
  update public.conversation_participants set last_read_at = now() where conversation_id = p_conv and (user_id = me or workspace_id = p_as_workspace);
  -- Q52: one alert per recipient per unread burst (re-armed when they read the conversation), at most one per 10 minutes.
  for r in select distinct on (u) u, ws from (
        select p.user_id u, null::uuid ws from public.conversation_participants p where p.conversation_id = p_conv and p.user_id is not null and not p.muted and p.left_at is null
        union all select m.user_id, p.workspace_id from public.conversation_participants p join public.workspace_members m on m.workspace_id = p.workspace_id and m.status = 'active' and m.role in ('owner','manager')
          where p.conversation_id = p_conv and p.workspace_id is not null and not p.muted and p.left_at is null and p.workspace_id is distinct from p_as_workspace) x
      where u is distinct from me order by u, ws nulls first loop
    if not exists (select 1 from public.notifications n where n.user_id = r.u and n.kind = 'message' and n.link = lnk
                   and (n.read_at is null or n.created_at > now() - interval '10 minutes')) then
      insert into public.notifications(user_id, kind, title, body, link, workspace_id)
        values (r.u, 'message', left('New message from ' || coalesce(nullif(label, ''), 'Gala Dock'), 200), coalesce(nullif(left(trim(coalesce(p_body, '')), 160), ''), preview), lnk, r.ws);
    end if;
  end loop;
  return mid;
end $function$;

-- 3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.mark_conversation_read(p_conv uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.can_access_conversation(p_conv) then return; end if;
  update public.conversation_participants set last_read_at = now()
  where conversation_id = p_conv
    and (user_id = (select auth.uid()) or (workspace_id is not null and public.is_workspace_member(workspace_id)));
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and kind = 'message' and link = '/messages/' || p_conv and read_at is null;
end $function$;

-- 4b ─ block / unblock ─────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.block_contact(p_type text, p_id uuid, p_seat uuid default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_type not in ('user','workspace') or p_id is null then raise exception 'invalid_target' using errcode = '22023'; end if;
  if p_seat is not null and not public.is_workspace_member(p_seat) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if (p_type = 'user' and p_id = me) or (p_type = 'workspace' and (p_id = p_seat or public.is_workspace_member(p_id))) then raise exception 'cannot_block_self' using errcode = '22023'; end if;
  -- Only someone you have actually been in a conversation with (nobody can probe or pre-block arbitrary ids).
  if not public.shares_conversation(p_type, p_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not public.hit_rate_limit('message_block:' || me, 30, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  if p_seat is null then
    insert into public.message_blocks(owner_user, target_type, target_id, created_by) values (me, p_type, p_id, me) on conflict do nothing;
  else
    insert into public.message_blocks(owner_workspace, target_type, target_id, created_by) values (p_seat, p_type, p_id, me) on conflict do nothing;
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (me, 'user', p_seat, 'message.contact_blocked', jsonb_build_object('target_type', p_type, 'target_id', p_id));
end $function$;

create or replace function public.unblock_contact(p_type text, p_id uuid, p_seat uuid default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare me uuid := auth.uid(); n int;
begin
  if me is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_seat is not null and not public.is_workspace_member(p_seat) then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from public.message_blocks b where b.target_type = p_type and b.target_id = p_id
    and (case when p_seat is null then b.owner_user = me else b.owner_workspace = p_seat end);
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
      values (me, 'user', p_seat, 'message.contact_unblocked', jsonb_build_object('target_type', p_type, 'target_id', p_id));
  end if;
end $function$;

-- 4c ─ reports ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'conversation' check (source in ('conversation','thread')),
  message_id uuid not null,
  conversation_id uuid,
  thread_id uuid,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reporter_workspace uuid references public.workspaces(id) on delete set null,
  reported_user uuid references auth.users(id) on delete set null,
  reported_workspace uuid references public.workspaces(id) on delete set null,
  reported_name text not null default '',
  reason_code text not null references public.moderation_reason_codes(code),
  note text not null default '' check (length(note) <= 1000),
  excerpt text not null default '' check (length(excerpt) <= 2400),
  message_at timestamptz,
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  case_id uuid references public.trust_cases(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '',
  message_removed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source, message_id, reporter_id)
);
create index if not exists message_reports_status_idx on public.message_reports(status, created_at desc);
alter table public.message_reports enable row level security;
revoke all on table public.message_reports from public, anon, authenticated;
grant select on table public.message_reports to authenticated;
grant all on table public.message_reports to service_role;
drop policy if exists message_reports_read on public.message_reports;
create policy message_reports_read on public.message_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.has_admin_permission('trust'));

create or replace function public.report_message(p_message uuid, p_reason_code text, p_note text default '', p_source text default 'conversation', p_block boolean default false, p_seat uuid default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare me uuid := auth.uid(); s_user uuid; s_ws uuid; s_name text; v_body text; v_att jsonb; v_at timestamptz; v_conv uuid; v_thread uuid; rid uuid; cid uuid; n int; subj_name text;
begin
  if me is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_source not in ('conversation','thread') then raise exception 'invalid_source' using errcode = '22023'; end if;
  if p_seat is not null and not public.is_workspace_member(p_seat) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_source = 'conversation' then
    select m.sender_id, m.sender_workspace_id, m.sender_name, m.body, m.attachments, m.created_at, m.conversation_id into s_user, s_ws, s_name, v_body, v_att, v_at, v_conv
      from public.conversation_messages m where m.id = p_message and m.deleted_at is null;
    if v_conv is null or not public.can_access_conversation(v_conv) then raise exception 'not_found' using errcode = 'P0002'; end if;
  else
    select m.sender_id, m.sender_name, m.body, m.attachments, m.created_at, m.thread_id into s_user, s_name, v_body, v_att, v_at, v_thread
      from public.messages m join public.threads t on t.id = m.thread_id
     where m.id = p_message and (public.can_access_event(t.event_id) or (t.listing_id is not null and public.is_listing_provider(t.listing_id)));
    if v_thread is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    select l.workspace_id into s_ws from public.messages m join public.threads t on t.id = m.thread_id join public.listings l on l.id = t.listing_id where m.id = p_message and m.from_provider;
  end if;
  if s_user = me or (s_ws is not null and public.is_workspace_member(s_ws)) then raise exception 'cannot_report_own_message' using errcode = '22023'; end if;
  if not exists (select 1 from public.moderation_reason_codes c where c.code = p_reason_code and c.active and 'message' = any(c.applies_to)) then raise exception 'invalid_reason_code' using errcode = '22023'; end if;
  if not public.hit_rate_limit('message_report:' || me, 20, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.message_reports(source, message_id, conversation_id, thread_id, reporter_id, reporter_workspace, reported_user, reported_workspace, reported_name, reason_code, note, excerpt, message_at)
    values (p_source, p_message, v_conv, v_thread, me, p_seat, s_user, s_ws, left(coalesce(s_name, ''), 200), p_reason_code, left(coalesce(trim(p_note), ''), 1000),
            left(coalesce(v_body, '') || coalesce(nullif(' [attachments: ' || (select string_agg(a->>'name', ', ') from jsonb_array_elements(coalesce(v_att, '[]')) a) || ']', ' [attachments: ]'), ''), 2400), v_at)
    on conflict (source, message_id, reporter_id) do nothing returning id into rid;
  if rid is null then raise exception 'already_reported' using errcode = '23505'; end if;
  -- One open Fraud/Abuse case per reported sender collects every message report (subject = the sender's account).
  subj_name := left('Messages from ' || coalesce(nullif(s_name, ''), 'a member'), 160);
  if s_user is not null then
    select id into cid from public.trust_cases where subject_type = 'user' and subject_id = s_user and category = 'Message report' and status in ('open','in_review') limit 1;
  end if;
  if cid is null then
    select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 8600) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
    insert into public.trust_cases(reference, queue, category, subject_type, subject_id, subject_name, risk_score, status, reason, evidence, related)
      values ('TS-' || n, 'fraud', 'Message report', case when s_user is null then 'workspace' else 'user' end, coalesce(s_user, s_ws), subj_name,
        case when p_reason_code in ('abusive_content') then 50 else 30 end, 'open',
        (select label from public.moderation_reason_codes where code = p_reason_code),
        jsonb_build_array(jsonb_build_object('kind', 'report', 'label', 'Message reported: ' || p_reason_code, 'report_id', rid, 'at', now())),
        jsonb_build_object('message_id', p_message, 'source', p_source, 'conversation_id', v_conv, 'thread_id', v_thread, 'workspace_id', s_ws))
      returning id into cid;
    insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
      select pa.user_id, 'admin.message_report', 'Message reported', left(subj_name || ' — ' || coalesce((select label from public.moderation_reason_codes where code = p_reason_code), p_reason_code), 300),
             '/admin/trust/message-reports', 'msg-report-case:' || cid || ':' || pa.user_id
        from public.platform_admins pa where 'trust' = any(pa.permissions)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
  else
    update public.trust_cases set evidence = evidence || jsonb_build_array(jsonb_build_object('kind', 'report', 'label', 'Message reported: ' || p_reason_code, 'report_id', rid, 'at', now())),
      risk_score = least(100, risk_score + 10), updated_at = now() where id = cid;
  end if;
  update public.message_reports set case_id = cid where id = rid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (me, 'user', p_seat, 'message.reported',
    jsonb_build_object('message_id', p_message, 'source', p_source, 'report_id', rid, 'reason_code', p_reason_code, 'case_id', cid));
  if p_block and p_source = 'conversation' then
    perform public.block_contact(case when s_ws is not null then 'workspace' else 'user' end, coalesce(s_ws, s_user), p_seat);
  end if;
  return rid;
end $function$;

create or replace function public.admin_decide_message_report(p_report uuid, p_decision text, p_note text, p_remove boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.message_reports; me uuid := auth.uid();
begin
  if not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_decision not in ('actioned','dismissed') then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into r from public.message_reports where id = p_report for update;
  if not found then raise exception 'record_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'open' then raise exception 'case_closed' using errcode = '22023'; end if;
  update public.message_reports set status = p_decision, decided_by = me, decided_at = now(), decision_note = left(trim(p_note), 1000),
    message_removed = coalesce(p_remove, false) and p_decision = 'actioned'
   where (source, message_id) = (r.source, r.message_id) and status = 'open';   -- every open report on the same message
  if coalesce(p_remove, false) and p_decision = 'actioned' then
    if r.source = 'conversation' then
      update public.conversation_messages set deleted_at = now() where id = r.message_id and deleted_at is null;
      update public.conversations c set last_message_preview = 'Message removed by Gala Dock'
        where c.id = r.conversation_id and not exists (select 1 from public.conversation_messages m where m.conversation_id = c.id and m.deleted_at is null and m.created_at > r.message_at);
    else
      update public.messages set body = '[Removed by Gala Dock moderation]', attachments = '[]'::jsonb where id = r.message_id;
    end if;
  end if;
  if r.case_id is not null and not exists (select 1 from public.message_reports x where x.case_id = r.case_id and x.status = 'open') then
    update public.trust_cases set status = p_decision, decision = left(trim(p_note), 1000), decided_by = me, decided_at = now(), updated_at = now()
      where id = r.case_id and status in ('open','in_review');
  end if;
  -- Tell each reporter the outcome (Online Safety Act complaints procedure); never who decided or what else was found.
  insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
    select x.reporter_id, 'report_outcome', 'We reviewed the message you reported',
      case when p_decision = 'actioned' then 'Thanks for telling us. We took action under our community rules' || case when p_remove then ' and removed the message.' else '.' end
           else 'Thanks for telling us. We reviewed it and it didn’t break our community rules. You can still block the sender from the conversation.' end,
      coalesce('/messages/' || x.conversation_id, '/help'), 'msg-report-outcome:' || x.id
    from public.message_reports x where (x.source, x.message_id) = (r.source, r.message_id) and x.decided_at = now()
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (me, 'admin', 'message.report_decided',
    jsonb_build_object('report_id', p_report, 'message_id', r.message_id, 'source', r.source, 'decision', p_decision, 'removed', coalesce(p_remove, false), 'reason', left(trim(p_note), 500)));
end $function$;

-- 5 ─ legacy event threads ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.mark_thread_read(p_thread uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare n int := 0;
begin
  if not exists (select 1 from public.threads t where t.id = p_thread and public.can_access_event(t.event_id)) then return 0; end if;
  update public.messages set read_at = now() where thread_id = p_thread and from_provider and read_at is null;
  get diagnostics n = row_count;
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and kind = 'message' and read_at is null
    and link like '%/messages?thread=' || p_thread::text;
  return n;
end $function$;

create or replace function public.legacy_message_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare me uuid := auth.uid(); ws uuid; wname text;
begin
  if me is null then return new; end if;   -- service role / definer RPCs (provider_send_message) set their own names
  select l.workspace_id, w.name into ws, wname from public.threads t join public.listings l on l.id = t.listing_id join public.workspaces w on w.id = l.workspace_id where t.id = new.thread_id;
  new.sender_id := me;
  if new.from_provider and ws is not null and public.is_workspace_member(ws) then
    new.sender_name := coalesce(nullif(wname, ''), 'Provider');
  else
    new.from_provider := false;
    new.sender_name := coalesce((select nullif(trim(p.full_name), '') from public.profiles p where p.id = me), (select split_part(u.email, '@', 1) from auth.users u where u.id = me), 'Member');
  end if;
  new.read_at := null;
  return new;
end $function$;
drop trigger if exists legacy_message_guard on public.messages;
create trigger legacy_message_guard before insert on public.messages for each row execute function public.legacy_message_guard();

drop policy if exists messages_own_update on public.messages;
create policy messages_own_update on public.messages as restrictive for update to authenticated using (sender_id = (select auth.uid()));
drop policy if exists messages_own_delete on public.messages;
create policy messages_own_delete on public.messages as restrictive for delete to authenticated using (sender_id = (select auth.uid()));

create or replace function public.legacy_message_notify()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare t public.threads; e public.events; ws uuid; lnk text; r record;
begin
  begin
    select * into t from public.threads where id = new.thread_id;
    if t.id is null then return null; end if;
    -- The first message of a thread is the quote request itself, which has its own "request received" alert.
    if not exists (select 1 from public.messages m where m.thread_id = t.id and m.id <> new.id) then return null; end if;
    select * into e from public.events where id = t.event_id;
    if new.from_provider then
      lnk := case when e.workspace_id is null then '/account/events/' || e.id || '/messages?thread=' || t.id else '/organizer/events/' || e.id end;
      for r in select distinct on (u) u, w from (select e.owner_id u, null::uuid w union all
                 select m.user_id, e.workspace_id from public.workspace_members m where m.workspace_id = e.workspace_id and m.status = 'active' and m.role in ('owner','manager')) x
               where u is not null and u is distinct from new.sender_id order by u, w nulls last loop
        if not exists (select 1 from public.notifications n where n.user_id = r.u and n.kind = 'message' and n.link = lnk and (n.read_at is null or n.created_at > now() - interval '10 minutes')) then
          insert into public.notifications(user_id, kind, title, body, link, workspace_id) values (r.u, 'message', left('New message from ' || coalesce(nullif(new.sender_name, ''), t.title, 'your provider'), 200), left(coalesce(new.body, ''), 160), lnk, r.w);
        end if;
      end loop;
    else
      select l.workspace_id into ws from public.listings l where l.id = t.listing_id;
      if ws is null then return null; end if;
      lnk := '/provider/messages/' || t.id;
      for r in select distinct m.user_id u from public.workspace_members m where m.workspace_id = ws and m.status = 'active' and m.role in ('owner','manager') and m.user_id is distinct from new.sender_id loop
        if not exists (select 1 from public.notifications n where n.user_id = r.u and n.kind = 'message' and n.link = lnk and (n.read_at is null or n.created_at > now() - interval '10 minutes')) then
          insert into public.notifications(user_id, kind, title, body, link, workspace_id) values (r.u, 'message', left('New message from ' || coalesce(nullif(new.sender_name, ''), 'a client'), 200), left(coalesce(new.body, ''), 160), lnk, ws);
        end if;
      end loop;
    end if;
  exception when others then
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'notify.failed', jsonb_build_object('source', 'legacy_message', 'error', left(sqlerrm, 200)));
  end;
  return null;
end $function$;
drop trigger if exists legacy_message_notify on public.messages;
create trigger legacy_message_notify after insert on public.messages for each row execute function public.legacy_message_notify();

-- 6 ─ same-transaction duplicate guard ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_notification_txn_dedupe()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.dedupe_key is not null then return new; end if;
  if exists (select 1 from public.notifications n where n.user_id = new.user_id and n.created_at = now() and n.kind = new.kind
             and n.title is not distinct from new.title and n.link is not distinct from new.link) then
    return null;
  end if;
  return new;
end $function$;
drop trigger if exists gd_notification_txn_dedupe on public.notifications;
create trigger gd_notification_txn_dedupe before insert on public.notifications for each row execute function public.trg_notification_txn_dedupe();

-- 7 ─ provider notification preferences ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.provider_notification_pref_key(p_kind text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when p_kind = 'agent' or p_kind like 'agent%' then 'agent'
    when p_kind ~ 'mention' then 'mentions'
    when p_kind ~ '(booking|beo|job|confirmed)' then 'bookings'
    when p_kind ~ '(request|quote|enquir|opportunit|hold|availability|emergency|standby)' then 'enquiries'
    else null end;
$function$;

create or replace function public.notification_provider_workspace(p_user uuid, p_link text)
 returns uuid
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v uuid; n int;
begin
  if coalesce(p_link, '') !~ '^/provider([/?#]|$)' then return null; end if;
  select count(*), min(m.workspace_id::text)::uuid into n, v from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
   where m.user_id = p_user and m.status = 'active' and w.kind = 'provider' and w.status = 'active';
  return case when n = 1 then v else null end;
end $function$;

create or replace function public.trg_notification_workspace_prefs()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare ws uuid; w record; prefs jsonb; k text;
begin
  begin
    ws := public.notification_workspace(new.user_id, new.link, new.workspace_id);
    if ws is null then ws := public.notification_provider_workspace(new.user_id, new.link); end if;
    if ws is null then return new; end if;
    select kind, settings into w from public.workspaces where id = ws;
    if w.kind = 'organizer' then
      new.workspace_id := ws;
      if public.notification_mandatory(new.kind) then return new; end if;
      prefs := coalesce(w.settings -> 'notifications', '{}'::jsonb);
      if (new.kind = 'agent' or new.kind like 'agent.%') and coalesce((prefs ->> 'agent')::boolean, true) = false then return null; end if;
      if coalesce((prefs ->> 'in_app')::boolean, true) = false then
        if coalesce((prefs ->> 'email')::boolean, true) = false then return null; end if;
        new.muted := true; new.read_at := coalesce(new.read_at, now());
      end if;
    elsif w.kind = 'provider' then
      new.workspace_id := ws;
      if public.notification_mandatory(new.kind) then return new; end if;
      k := public.provider_notification_pref_key(new.kind);
      if k is null then return new; end if;
      prefs := coalesce(w.settings -> 'notifications' -> k, '{}'::jsonb);
      if coalesce((prefs ->> 'in_app')::boolean, true) = false then
        if coalesce((prefs ->> 'email')::boolean, true) = false then return null; end if;
        new.muted := true; new.read_at := coalesce(new.read_at, now());
      end if;
    end if;
    return new;
  exception when others then return new;   -- preferences must never lose a notification by accident
  end;
end $function$;

-- 8 ─ email categories ────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.email_category(p_kind text)
 returns table(category text, mandatory boolean)
 language sql
 immutable
as $function$
  select case
    when p_kind in ('security', 'trust_enforcement') or p_kind ~ '(legal|terms|policy)' then 'security'
    when p_kind ~ '(payment|payout|refund|invoice|dispute|cancellation|billing|chargeback)' then 'payments'
    when p_kind ~ '(ticket|waitlist|transfer)' then 'tickets'
    when p_kind ~ '^(leave_|shift_|availability_request)' then 'event_updates'
    when p_kind ~ '(quote|request|hold|booking|standby|emergency|opportunit|contract_(approval|signed))' then 'quotes'
    when p_kind ~ '(message)' then 'messages'
    when p_kind ~ '(reminder|deadline|expir)' then 'reminders'
    when p_kind ~ '(event|incident|agent|weather|rider|safety_plan)' then 'event_updates'
    else null end,
  p_kind in ('security', 'trust_enforcement') or p_kind ~ '(payment|payout|refund|invoice|dispute|cancellation|billing|chargeback|legal|terms|policy)';
$function$;

create or replace function public.trg_notification_email()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare c record; addr text; prefs jsonb; v_body text; k text;
begin
  select * into c from public.email_category(new.kind);
  if c.category is null then return new; end if;
  select u.email, p.notifications into addr, prefs from auth.users u left join public.profiles p on p.id = u.id where u.id = new.user_id;
  if addr is null then return new; end if;
  if not c.mandatory and coalesce((prefs ->> c.category)::boolean, true) = false then return new; end if;
  -- Q67: the organiser workspace "Email notifications" switch (mandatory kinds always go).
  if not c.mandatory and new.workspace_id is not null
     and coalesce(((select w.settings -> 'notifications' from public.workspaces w where w.id = new.workspace_id and w.kind = 'organizer') ->> 'email')::boolean, true) = false then
    return new;
  end if;
  -- Q64: the provider per-kind Email column.
  k := public.provider_notification_pref_key(new.kind);
  if not c.mandatory and new.workspace_id is not null and k is not null
     and coalesce(((select w.settings -> 'notifications' -> k from public.workspaces w where w.id = new.workspace_id and w.kind = 'provider') ->> 'email')::boolean, true) = false then
    return new;
  end if;
  v_body := case when c.category = 'messages'
                 then 'You have a new message on Gala Dock. Open your inbox to read and reply. For your privacy, message text is never included in emails.'
                 else left(coalesce(new.body, ''), 4000) end;
  insert into public.email_outbox(user_id, to_email, category, subject, body, link, notification_id)
    values (new.user_id, addr, c.category, left(new.title, 200), v_body, new.link, new.id) on conflict (notification_id) do nothing;
  return new;
exception when others then return new;   -- email must never block the in-app notification
end $function$;

-- grants ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.block_contact(text, uuid, uuid) from public, anon;
grant execute on function public.block_contact(text, uuid, uuid) to authenticated, service_role;
revoke all on function public.unblock_contact(text, uuid, uuid) from public, anon;
grant execute on function public.unblock_contact(text, uuid, uuid) to authenticated, service_role;
revoke all on function public.report_message(uuid, text, text, text, boolean, uuid) from public, anon;
grant execute on function public.report_message(uuid, text, text, text, boolean, uuid) to authenticated, service_role;
revoke all on function public.admin_decide_message_report(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_decide_message_report(uuid, text, text, boolean) to authenticated, service_role;
revoke all on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid) to authenticated, service_role;
revoke all on function public.legacy_message_guard() from public, anon;
grant execute on function public.legacy_message_guard() to authenticated, service_role;
revoke all on function public.legacy_message_notify() from public, anon;
grant execute on function public.legacy_message_notify() to authenticated, service_role;
revoke all on function public.trg_notification_txn_dedupe() from public, anon;
grant execute on function public.trg_notification_txn_dedupe() to authenticated, service_role;
revoke all on function public.notification_provider_workspace(uuid, text) from public, anon;
grant execute on function public.notification_provider_workspace(uuid, text) to authenticated, service_role;
grant execute on function public.provider_notification_pref_key(text) to authenticated, service_role;
