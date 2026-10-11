-- Messaging between accounts and portals (user addition; spec §89 communications).
-- Conversations have user and/or workspace participants; a workspace participant is visible to its active members.
-- Contact rules prevent unsolicited spam: you may open a conversation only with someone you share a relationship with.
begin;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct','enquiry','event','booking','team','support')),
  subject text not null default '' check (length(subject) <= 140),
  event_id uuid references public.events(id) on delete set null,
  build_item_id uuid references public.build_items(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text not null default ''
);
create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  label text not null default '',
  last_read_at timestamptz,
  muted boolean not null default false,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (workspace_id is null))
);
create unique index if not exists conv_part_user on public.conversation_participants(conversation_id, user_id) where user_id is not null;
create unique index if not exists conv_part_ws on public.conversation_participants(conversation_id, workspace_id) where workspace_id is not null;
create index if not exists conv_part_lookup_user on public.conversation_participants(user_id) where user_id is not null;
create index if not exists conv_part_lookup_ws on public.conversation_participants(workspace_id) where workspace_id is not null;
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_workspace_id uuid references public.workspaces(id) on delete set null,
  sender_name text not null default '',
  body text not null default '' check (length(body) <= 8000),
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  edited_at timestamptz, deleted_at timestamptz
);
create index if not exists conv_msgs_idx on public.conversation_messages(conversation_id, created_at desc);

-- Membership: a direct user participant, or an active member of a participant workspace.
create or replace function public.can_access_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_participants p where p.conversation_id = p_conv and p.left_at is null
    and (p.user_id = (select auth.uid()) or (p.workspace_id is not null and public.is_workspace_member(p.workspace_id))))
  or public.has_admin_permission('support');
$$;
revoke all on function public.can_access_conversation(uuid) from public, anon;
grant execute on function public.can_access_conversation(uuid) to authenticated, service_role;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.conversation_messages enable row level security;
drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations for select using (public.can_access_conversation(id));
drop policy if exists conv_parts_read on public.conversation_participants;
create policy conv_parts_read on public.conversation_participants for select using (public.can_access_conversation(conversation_id));
drop policy if exists conv_msgs_read on public.conversation_messages;
create policy conv_msgs_read on public.conversation_messages for select using (public.can_access_conversation(conversation_id));

-- Contact rules (anti-spam): target a workspace with a published listing (an enquiry), a workspace or user you share an event,
-- booking or workspace with, or anyone when you're platform support.
create or replace function public.may_contact(p_type text, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when public.has_admin_permission('support') then true
    when p_type = 'workspace' then
      exists (select 1 from public.listings l where l.workspace_id = p_target and l.published)
      or public.is_workspace_member(p_target)
      or exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where l.workspace_id = p_target and public.can_access_event(b.event_id))
      or exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
                 where e.workspace_id = p_target and public.is_workspace_member(l.workspace_id))
      or exists (select 1 from public.promoters pr join public.events e on e.id = pr.event_id where e.workspace_id = p_target and pr.user_id = (select auth.uid()))
    when p_type = 'user' then
      p_target = (select auth.uid())
      or exists (select 1 from public.workspace_members a join public.workspace_members b on b.workspace_id = a.workspace_id
                 where a.user_id = (select auth.uid()) and b.user_id = p_target and a.status = 'active' and b.status = 'active')
      or exists (select 1 from public.events e where e.owner_id = p_target and exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id
                 where b.event_id = e.id and public.is_workspace_member(l.workspace_id) and b.status not in ('suggested','draft')))
      or exists (select 1 from public.promoters pr join public.events e on e.id = pr.event_id where pr.user_id = p_target and public.can_access_event(e.id))
    else false end;
$$;
revoke all on function public.may_contact(text, uuid) from public, anon;
grant execute on function public.may_contact(text, uuid) to authenticated, service_role;

-- Starts (or reuses, for direct/enquiry between the same parties and context) a conversation and posts the first message.
-- p_as_workspace lets a member speak for their workspace (provider/organizer inbox); otherwise they speak as themselves.
create or replace function public.start_conversation(p_kind text, p_subject text, p_to_type text, p_to uuid, p_body text,
  p_as_workspace uuid default null, p_event uuid default null, p_listing uuid default null, p_item uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; me uuid := auth.uid(); my_label text; to_label text;
begin
  if me is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_kind not in ('direct','enquiry','event','booking','team','support') or p_to_type not in ('user','workspace') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_as_workspace is not null and not public.is_workspace_member(p_as_workspace) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not public.may_contact(p_to_type, p_to) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_event is not null and not public.can_access_event(p_event) and not (p_as_workspace is not null and exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where b.event_id = p_event and l.workspace_id = p_as_workspace)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'empty_message' using errcode = '22023'; end if;
  if (select count(*) from public.conversations c where c.created_by = me and c.created_at > now() - interval '1 hour') >= 20 then raise exception 'rate_limited' using errcode = '54000'; end if;
  select coalesce(p.full_name, split_part(u.email, '@', 1)) into my_label from auth.users u left join public.profiles p on p.id = u.id where u.id = me;
  if p_as_workspace is not null then select name into my_label from public.workspaces where id = p_as_workspace; end if;
  if p_to_type = 'workspace' then select name into to_label from public.workspaces where id = p_to;
  else select coalesce(p.full_name, 'Member') into to_label from public.profiles p where p.id = p_to; end if;
  -- Reuse an existing thread between the same two parties in the same context.
  select c.id into cid from public.conversations c
    where c.kind = p_kind and c.event_id is not distinct from p_event and c.listing_id is not distinct from p_listing and c.build_item_id is not distinct from p_item
      and exists (select 1 from public.conversation_participants x where x.conversation_id = c.id and (x.user_id = case when p_as_workspace is null then me end or x.workspace_id = p_as_workspace))
      and exists (select 1 from public.conversation_participants y where y.conversation_id = c.id and (case when p_to_type = 'user' then y.user_id = p_to else y.workspace_id = p_to end))
    order by c.last_message_at desc limit 1;
  if cid is null then
    insert into public.conversations(kind, subject, event_id, listing_id, build_item_id, created_by) values (p_kind, left(trim(coalesce(p_subject, '')), 140), p_event, p_listing, p_item, me) returning id into cid;
    insert into public.conversation_participants(conversation_id, user_id, workspace_id, label, last_read_at)
      values (cid, case when p_as_workspace is null then me end, p_as_workspace, coalesce(my_label, ''), now());
    insert into public.conversation_participants(conversation_id, user_id, workspace_id, label)
      values (cid, case when p_to_type = 'user' then p_to end, case when p_to_type = 'workspace' then p_to end, coalesce(to_label, ''));
  end if;
  perform public.post_message(cid, p_body, '[]'::jsonb, p_as_workspace);
  return cid;
end $$;

create or replace function public.post_message(p_conv uuid, p_body text, p_attachments jsonb default '[]', p_as_workspace uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mid uuid; me uuid := auth.uid(); name text; prev timestamptz; r record; c public.conversations;
begin
  if not public.can_access_conversation(p_conv) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_as_workspace is not null and not (public.is_workspace_member(p_as_workspace) and exists (select 1 from public.conversation_participants x where x.conversation_id = p_conv and x.workspace_id = p_as_workspace)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 and jsonb_array_length(coalesce(p_attachments, '[]')) = 0 then raise exception 'empty_message' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p_attachments, '[]')) > 10 or exists (select 1 from jsonb_array_elements(coalesce(p_attachments, '[]')) a
     where coalesce(a->>'path', '') !~ ('^' || me::text || '/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$')) then raise exception 'invalid_attachment' using errcode = '22023'; end if;
  if (select count(*) from public.conversation_messages m where m.sender_id = me and m.created_at > now() - interval '1 minute') >= 30 then raise exception 'rate_limited' using errcode = '54000'; end if;
  select coalesce(p.full_name, 'Member') into name from public.profiles p where p.id = me;
  select * into c from public.conversations where id = p_conv;
  prev := c.last_message_at;
  insert into public.conversation_messages(conversation_id, sender_id, sender_workspace_id, sender_name, body, attachments)
    values (p_conv, me, p_as_workspace, coalesce(name, '') || coalesce(' · ' || (select w.name from public.workspaces w where w.id = p_as_workspace), ''), left(trim(coalesce(p_body, '')), 8000), coalesce(p_attachments, '[]'))
    returning id into mid;
  update public.conversations set last_message_at = now(), last_message_preview = left(regexp_replace(trim(coalesce(p_body, '')), '\s+', ' ', 'g'), 140) where id = p_conv;
  update public.conversation_participants set last_read_at = now() where conversation_id = p_conv and (user_id = me or workspace_id = p_as_workspace);
  -- Notify the other side, throttled to one notification per conversation per 10 minutes.
  if prev < now() - interval '10 minutes' or c.created_at > now() - interval '5 seconds' then
    for r in select distinct u from (
        select p.user_id u from public.conversation_participants p where p.conversation_id = p_conv and p.user_id is not null and not p.muted and p.left_at is null
        union select m.user_id from public.conversation_participants p join public.workspace_members m on m.workspace_id = p.workspace_id and m.status = 'active' and m.role in ('owner','manager')
          where p.conversation_id = p_conv and p.workspace_id is not null and not p.muted and p.left_at is null and p.workspace_id is distinct from p_as_workspace) x where u is distinct from me loop
      insert into public.notifications(user_id, kind, title, body, link) values (r.u, 'message', 'New message from ' || coalesce(name, 'Gala Dock'), left(trim(coalesce(p_body, '')), 160), '/messages/' || p_conv);
    end loop;
  end if;
  return mid;
end $$;

create or replace function public.mark_conversation_read(p_conv uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_participants set last_read_at = now()
  where conversation_id = p_conv and public.can_access_conversation(p_conv)
    and (user_id = (select auth.uid()) or (workspace_id is not null and public.is_workspace_member(workspace_id)));
$$;

-- Inbox for the caller: personal conversations, plus those of a workspace they act for. Unread is per participant row.
create or replace function public.my_conversations(p_workspace uuid default null, p_limit integer default 50) returns table(
  id uuid, kind text, subject text, last_message_at timestamptz, last_message_preview text, unread boolean, counterpart text, event_id uuid, listing_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.subject, c.last_message_at, c.last_message_preview,
    coalesce(me.last_read_at, 'epoch'::timestamptz) < c.last_message_at and exists (select 1 from public.conversation_messages m where m.conversation_id = c.id and m.created_at > coalesce(me.last_read_at, 'epoch') and m.sender_id is distinct from (select auth.uid())),
    (select string_agg(o.label, ', ') from public.conversation_participants o where o.conversation_id = c.id and o.id <> me.id),
    c.event_id, c.listing_id
  from public.conversation_participants me join public.conversations c on c.id = me.conversation_id
  where me.left_at is null and ((p_workspace is null and me.user_id = (select auth.uid())) or (p_workspace is not null and me.workspace_id = p_workspace and public.is_workspace_member(p_workspace)))
  order by c.last_message_at desc limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.start_conversation(text, text, text, uuid, text, uuid, uuid, uuid, uuid), public.post_message(uuid, text, jsonb, uuid), public.mark_conversation_read(uuid), public.my_conversations(uuid, integer) from public, anon;
grant execute on function public.start_conversation(text, text, text, uuid, text, uuid, uuid, uuid, uuid), public.post_message(uuid, text, jsonb, uuid), public.mark_conversation_read(uuid), public.my_conversations(uuid, integer) to authenticated, service_role;
grant select on public.conversations, public.conversation_participants, public.conversation_messages to authenticated;
grant all on public.conversations, public.conversation_participants, public.conversation_messages to service_role;
commit;

-- Realtime delivery (RLS still applies to subscribers).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'conversation_messages') then
    execute 'alter publication supabase_realtime add table public.conversation_messages';
  end if;
end $$;

-- Contacts you can message from a given seat (personal or a workspace), derived from real relationships (§89 / anti-spam).
create or replace function public.my_contacts(p_workspace uuid default null) returns table(kind text, id uuid, label text, context text)
language sql stable security definer set search_path = '' as $$
  -- Providers booked on events I can access (organizer/customer seat).
  select distinct 'workspace'::text, l.workspace_id, w.name, 'Supplier · ' || l.name
    from public.build_items b join public.listings l on l.id = b.listing_id join public.workspaces w on w.id = l.workspace_id
    where public.can_access_event(b.event_id) and b.status not in ('suggested','draft') and (p_workspace is null or l.workspace_id <> p_workspace)
  union
  -- Clients of my provider workspace: organizer workspaces and customer event owners.
  select distinct case when e.workspace_id is not null then 'workspace' else 'user' end, coalesce(e.workspace_id, e.owner_id),
    coalesce(w.name, p.full_name, 'Client'), 'Client · ' || e.name
    from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
    left join public.workspaces w on w.id = e.workspace_id left join public.profiles p on p.id = e.owner_id
    where p_workspace is not null and l.workspace_id = p_workspace and public.is_workspace_member(p_workspace) and b.status not in ('suggested','draft')
  union
  -- Teammates in the seat's workspace (or any of mine for the personal seat).
  select distinct 'user'::text, m2.user_id, coalesce(p.full_name, 'Teammate'), 'Team · ' || w.name
    from public.workspace_members m1 join public.workspace_members m2 on m2.workspace_id = m1.workspace_id and m2.user_id <> m1.user_id and m2.status = 'active'
    join public.workspaces w on w.id = m1.workspace_id left join public.profiles p on p.id = m2.user_id
    where m1.user_id = (select auth.uid()) and m1.status = 'active' and (p_workspace is null or m1.workspace_id = p_workspace)
  union
  -- Promoters on my events, and the organizers of events I promote.
  select distinct 'user'::text, pr.user_id, pr.name, 'Promoter · ' || e.name from public.promoters pr join public.events e on e.id = pr.event_id
    where pr.user_id is not null and public.can_access_event(e.id)
  union
  select distinct 'workspace'::text, e.workspace_id, w.name, 'Organizer · ' || e.name from public.promoters pr join public.events e on e.id = pr.event_id join public.workspaces w on w.id = e.workspace_id
    where pr.user_id = (select auth.uid()) and e.workspace_id is not null;
$$;
revoke all on function public.my_contacts(uuid) from public, anon;
grant execute on function public.my_contacts(uuid) to authenticated, service_role;
