-- Break-glass conversation access (release-readiness §5, step-up per §7). Replaces free browsing from 202610250001:
--   • permission support.break_glass_conversation.read (not granted to default support staff)
--   • access starts from an existing support/trust case, with a reason, written justification and the case
--   • high-risk reasons need a second admin's approval; grants are time-limited (default 2h) and read-only
--   • every conversation opened is logged individually (open, close → duration) and to audit_events
--   • opening requires step-up: an authenticator (TOTP/WebAuthn) verification within the last 10 minutes
--   • reports: per-admin usage, suspicious-access flags; optional notification of affected users at closure
begin;

create table if not exists public.break_glass_grants (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id),
  approver_id uuid references auth.users(id),
  reason text not null check (reason in ('safeguarding','fraud','abuse','payment_dispute','legal_request','critical_support')),
  justification text not null check (length(justification) between 20 and 2000),
  case_type text not null check (case_type in ('support','trust')),
  case_id uuid not null,
  case_reference text not null default '',
  affected_user_ids uuid[] not null default '{}',
  conversation_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','active','rejected','expired','closed','revoked')),
  requires_approval boolean not null default false,
  decision_note text,
  duration_minutes integer not null default 120 check (duration_minutes between 15 and 480),
  created_at timestamptz not null default now(),
  decided_at timestamptz, starts_at timestamptz, expires_at timestamptz, closed_at timestamptz,
  notify_affected boolean, notify_withheld_reason text, notified_at timestamptz,
  check (approver_id is null or approver_id <> requester_id)
);
create index if not exists bg_grants_requester on public.break_glass_grants(requester_id, created_at desc);
alter table public.break_glass_grants enable row level security;
drop policy if exists bg_grants_read on public.break_glass_grants;
create policy bg_grants_read on public.break_glass_grants for select to authenticated
  using (public.has_admin_permission('support.break_glass_conversation.read') or public.has_admin_permission('audit'));

create table if not exists public.break_glass_access_log (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.break_glass_grants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  last_seen_at timestamptz not null default now()
);
create index if not exists bg_log_grant on public.break_glass_access_log(grant_id, opened_at);
alter table public.break_glass_access_log enable row level security;
drop policy if exists bg_log_read on public.break_glass_access_log;
create policy bg_log_read on public.break_glass_access_log for select to authenticated
  using (public.has_admin_permission('support.break_glass_conversation.read') or public.has_admin_permission('audit'));

-- Free browsing from 202610250001 is withdrawn.
drop function if exists public.admin_list_conversations(text, text, integer, integer);
drop function if exists public.admin_open_conversation(uuid, text);

-- Support staff may still read conversations through can_access_conversation? No: only participants, or an active grant.
create or replace function public.can_access_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_participants p where p.conversation_id = p_conv and p.left_at is null
    and (p.user_id = (select auth.uid()) or (p.workspace_id is not null and public.is_workspace_member(p.workspace_id))));
$$;

create or replace function public.bg_step_up_ok() returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('totp', 'webauthn', 'mfa/totp', 'mfa/webauthn') and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 600);
$$;

create or replace function public.bg_expire() returns void language sql security definer set search_path = '' as $$
  update public.break_glass_grants set status = 'expired' where status = 'active' and expires_at < now();
  update public.break_glass_access_log l set closed_at = least(l.last_seen_at, g.expires_at) from public.break_glass_grants g
    where g.id = l.grant_id and l.closed_at is null and (g.status <> 'active' or l.last_seen_at < now() - interval '30 minutes');
$$;

/** Conversations involving a case's people (metadata only) — used to scope a request. */
create or replace function public.admin_case_conversations(p_case_type text, p_case uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare users uuid[];
begin
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_case_type = 'support' then select array_remove(array[requester_id], null) into users from public.support_cases where id = p_case;
  elsif p_case_type = 'trust' then select array_remove(array[case when subject_type = 'user' then subject_id end], null) into users from public.trust_cases where id = p_case;
  else raise exception 'bad_case_type' using errcode = '22023'; end if;
  if users is null then raise exception 'case_not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('affected_users', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.full_name, ''), 'Member'))), '[]') from public.profiles p where p.id = any(users)),
    'conversations', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'subject', c.subject, 'last_message_at', c.last_message_at,
        'messages', (select count(*) from public.conversation_messages m where m.conversation_id = c.id)) order by c.last_message_at desc), '[]')
      from public.conversations c where exists (select 1 from public.conversation_participants p where p.conversation_id = c.id and p.user_id = any(users))));
end $$;

create or replace function public.admin_request_break_glass(p_case_type text, p_case uuid, p_reason text, p_justification text, p_conversations uuid[], p_minutes integer default 120)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare users uuid[]; ref text; g public.break_glass_grants; high boolean := p_reason in ('safeguarding', 'legal_request', 'abuse');
begin
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_justification, ''))) < 20 then raise exception 'justification_required' using errcode = '22023'; end if;
  if coalesce(array_length(p_conversations, 1), 0) = 0 or array_length(p_conversations, 1) > 20 then raise exception 'choose_conversations' using errcode = '22023'; end if;
  if p_case_type = 'support' then select array_remove(array[requester_id], null), reference into users, ref from public.support_cases where id = p_case and status not in ('resolved', 'closed');
  elsif p_case_type = 'trust' then select array_remove(array[case when subject_type = 'user' then subject_id end], null), reference into users, ref from public.trust_cases where id = p_case;
  end if;
  if ref is null then raise exception 'open_case_required' using errcode = 'P0002'; end if;
  -- Only conversations that involve the case's people can be requested.
  if exists (select 1 from unnest(p_conversations) cid where not exists (select 1 from public.conversation_participants p where p.conversation_id = cid and p.user_id = any(users))) then
    raise exception 'conversation_out_of_scope' using errcode = '42501'; end if;
  insert into public.break_glass_grants(requester_id, reason, justification, case_type, case_id, case_reference, affected_user_ids, conversation_ids, status, requires_approval, duration_minutes, decided_at, starts_at, expires_at)
    values (auth.uid(), p_reason, trim(p_justification), p_case_type, p_case, ref,
      (select array_agg(distinct p.user_id) from public.conversation_participants p where p.conversation_id = any(p_conversations) and p.user_id is not null),
      p_conversations, case when high then 'pending' else 'active' end, high, least(greatest(coalesce(p_minutes, 120), 15), 480),
      case when high then null else now() end, case when high then null else now() end, case when high then null else now() + make_interval(mins => least(greatest(coalesce(p_minutes, 120), 15), 480)) end)
    returning * into g;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.break_glass_requested',
    jsonb_build_object('grant_id', g.id, 'reason', p_reason, 'case', ref, 'conversations', p_conversations, 'requires_approval', high));
  return jsonb_build_object('id', g.id, 'status', g.status, 'expires_at', g.expires_at);
end $$;

create or replace function public.admin_decide_break_glass(p_grant uuid, p_approve boolean, p_note text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare g public.break_glass_grants;
begin
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into g from public.break_glass_grants where id = p_grant for update;
  if g.id is null or g.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  if g.requester_id = auth.uid() then raise exception 'cannot_approve_own_request' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'note_required' using errcode = '22023'; end if;
  update public.break_glass_grants set status = case when p_approve then 'active' else 'rejected' end, approver_id = auth.uid(), decision_note = trim(p_note), decided_at = now(),
    starts_at = case when p_approve then now() end, expires_at = case when p_approve then now() + make_interval(mins => duration_minutes) end where id = g.id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', case when p_approve then 'admin.break_glass_approved' else 'admin.break_glass_rejected' end,
    jsonb_build_object('grant_id', g.id, 'requester', g.requester_id, 'note', trim(p_note)));
end $$;

/** Read one conversation under an active grant. Step-up required; logged individually (returns log id for close/heartbeat). */
create or replace function public.admin_open_conversation(p_grant uuid, p_conv uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare g public.break_glass_grants; c public.conversations; log_id uuid;
begin
  perform public.bg_expire();
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into g from public.break_glass_grants where id = p_grant;
  if g.id is null or g.requester_id <> auth.uid() then raise exception 'no_grant' using errcode = '42501'; end if;
  if g.status <> 'active' or g.expires_at <= now() then raise exception 'grant_not_active' using errcode = '42501'; end if;
  if not (p_conv = any(g.conversation_ids)) then raise exception 'conversation_out_of_scope' using errcode = '42501'; end if;
  if not public.bg_step_up_ok() then raise exception 'step_up_required' using errcode = '42501'; end if;
  select * into c from public.conversations where id = p_conv;
  insert into public.break_glass_access_log(grant_id, conversation_id, admin_id) values (g.id, c.id, auth.uid()) returning id into log_id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.break_glass_conversation_opened',
    jsonb_build_object('grant_id', g.id, 'conversation_id', c.id, 'case', g.case_reference, 'reason', g.reason, 'log_id', log_id));
  return jsonb_build_object('log_id', log_id, 'expires_at', g.expires_at,
    'conversation', jsonb_build_object('id', c.id, 'kind', c.kind, 'subject', c.subject, 'created_at', c.created_at),
    'participants', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(nullif(p.label, ''), w.name, pr.full_name, 'Member'), 'type', case when p.workspace_id is null then 'person' else 'workspace' end, 'left', p.left_at is not null) order by p.created_at), '[]')
       from public.conversation_participants p left join public.workspaces w on w.id = p.workspace_id left join public.profiles pr on pr.id = p.user_id where p.conversation_id = c.id),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sender', coalesce(nullif(m.sender_name, ''), pr.full_name, 'Member'), 'body', case when m.deleted_at is null then m.body else '' end,
       'deleted', m.deleted_at is not null, 'edited', m.edited_at is not null, 'attachments', jsonb_array_length(m.attachments), 'created_at', m.created_at) order by m.created_at), '[]')
       from public.conversation_messages m left join public.profiles pr on pr.id = m.sender_id where m.conversation_id = c.id));
end $$;

create or replace function public.admin_touch_conversation(p_log uuid, p_close boolean default false) returns void
language sql volatile security definer set search_path = '' as $$
  update public.break_glass_access_log set last_seen_at = now(), closed_at = case when p_close then now() else closed_at end
    where id = p_log and admin_id = auth.uid() and closed_at is null;
$$;

/** Close a grant. Affected users are notified unless withheld with a reason (fraud/safety/legal prejudice). */
create or replace function public.admin_close_break_glass(p_grant uuid, p_notify boolean, p_withheld_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare g public.break_glass_grants;
begin
  if not public.has_admin_permission('support.break_glass_conversation.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into g from public.break_glass_grants where id = p_grant for update;
  if g.id is null or g.status not in ('active', 'expired', 'pending') then raise exception 'not_open' using errcode = '22023'; end if;
  if not p_notify and length(trim(coalesce(p_withheld_reason, ''))) < 10 then raise exception 'withheld_reason_required' using errcode = '22023'; end if;
  update public.break_glass_access_log set closed_at = coalesce(closed_at, least(last_seen_at, now())) where grant_id = g.id;
  update public.break_glass_grants set status = case when status = 'pending' then 'revoked' else 'closed' end, closed_at = now(), notify_affected = p_notify,
    notify_withheld_reason = case when p_notify then null else trim(p_withheld_reason) end, notified_at = case when p_notify then now() end where id = g.id;
  if p_notify then
    insert into public.notifications(user_id, title, body, kind)
      select u, 'An administrator reviewed some of your messages',
        'As part of a ' || replace(g.reason, '_', ' ') || ' investigation (case ' || g.case_reference || '), authorised Gala Dock staff reviewed messages in a conversation you are part of. Contact support if you have questions.', 'system'
      from unnest(g.affected_user_ids) u;
  end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.break_glass_closed',
    jsonb_build_object('grant_id', g.id, 'notified', p_notify, 'withheld_reason', p_withheld_reason));
end $$;

/** Compliance report: grants in a period with duration, conversations opened and suspicious-access flags. */
create or replace function public.admin_break_glass_report(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_admin_permission('support.break_glass_conversation.read') or public.has_admin_permission('audit')) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
    select g.id, g.created_at, g.status, g.reason, g.case_type, g.case_reference, g.requires_approval, g.expires_at, g.closed_at, g.notify_affected, g.notify_withheld_reason,
      coalesce(rq.full_name, 'Admin') requester, ap.full_name approver, cardinality(g.conversation_ids) requested, cardinality(g.affected_user_ids) affected_users,
      (select count(*) from public.break_glass_access_log l where l.grant_id = g.id) opens,
      (select coalesce(round(sum(extract(epoch from (coalesce(l.closed_at, l.last_seen_at) - l.opened_at))) / 60.0, 1), 0) from public.break_glass_access_log l where l.grant_id = g.id) minutes,
      array_remove(array[
        case when (select count(*) from public.break_glass_grants g2 where g2.requester_id = g.requester_id and g2.created_at > g.created_at - interval '7 days' and g2.created_at <= g.created_at) >= 5 then 'frequent_requests' end,
        case when extract(hour from g.created_at at time zone 'Europe/London') not between 7 and 20 then 'out_of_hours' end,
        case when g.requester_id = any(g.affected_user_ids) then 'self_involved' end,
        case when (select count(distinct l.conversation_id) from public.break_glass_access_log l where l.grant_id = g.id) = cardinality(g.conversation_ids) and cardinality(g.conversation_ids) >= 10 then 'broad_access' end,
        case when g.status = 'closed' and g.notify_affected is false then 'notification_withheld' end], null) flags
    from public.break_glass_grants g left join public.profiles rq on rq.id = g.requester_id left join public.profiles ap on ap.id = g.approver_id
    where g.created_at between p_from and p_to) x), '[]'::jsonb);
end $$;

revoke all on function public.admin_case_conversations(text, uuid), public.admin_request_break_glass(text, uuid, text, text, uuid[], integer), public.admin_decide_break_glass(uuid, boolean, text),
  public.admin_open_conversation(uuid, uuid), public.admin_touch_conversation(uuid, boolean), public.admin_close_break_glass(uuid, boolean, text), public.admin_break_glass_report(timestamptz, timestamptz),
  public.bg_expire(), public.bg_step_up_ok() from public, anon;
grant execute on function public.admin_case_conversations(text, uuid), public.admin_request_break_glass(text, uuid, text, text, uuid[], integer), public.admin_decide_break_glass(uuid, boolean, text),
  public.admin_open_conversation(uuid, uuid), public.admin_touch_conversation(uuid, boolean), public.admin_close_break_glass(uuid, boolean, text), public.admin_break_glass_report(timestamptz, timestamptz)
  to authenticated;

alter table public.platform_admins drop constraint if exists platform_admins_permissions_check;
alter table public.platform_admins add constraint platform_admins_permissions_check check (permissions <@ array['support','trust','commerce','users','workspaces','events','marketplace','tickets','partners','settings','agent_ops','analytics','audit','support.break_glass_conversation.read']::text[]);

-- The platform-admin demo account holds the permission; the support-only demo account does not (default support staff can't browse).
update public.platform_admins set permissions = array_append(permissions, 'support.break_glass_conversation.read')
  where user_id = (select id from auth.users where email = 'admin.demo@example.com') and not ('support.break_glass_conversation.read' = any(permissions));
commit;
