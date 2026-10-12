-- Messaging v2 (user request): avatars and identity for the other party, saved contacts, and a profile card.
-- Anyone you already share a conversation with stays reachable (so a saved contact can always be messaged again).
begin;

-- Who is on the other side of a conversation, with a picture. Workspaces use their brand logo, else their cover image.
drop function if exists public.my_conversations(uuid, integer);
create function public.my_conversations(p_workspace uuid default null, p_limit integer default 50) returns table(
  id uuid, kind text, subject text, last_message_at timestamptz, last_message_preview text, unread boolean, counterpart text, event_id uuid, listing_id uuid,
  counterpart_type text, counterpart_id uuid, counterpart_avatar text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.subject, c.last_message_at, c.last_message_preview,
    coalesce(me.last_read_at, 'epoch'::timestamptz) < c.last_message_at and exists (select 1 from public.conversation_messages m where m.conversation_id = c.id and m.created_at > coalesce(me.last_read_at, 'epoch') and m.sender_id is distinct from (select auth.uid())),
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
$$;
revoke all on function public.my_conversations(uuid, integer) from public, anon;
grant execute on function public.my_conversations(uuid, integer) to authenticated, service_role;

-- Shared-conversation helper: the caller (personally or through any of their workspaces) and the target are in one conversation.
create or replace function public.shares_conversation(p_type text, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_participants a join public.conversation_participants b on b.conversation_id = a.conversation_id and b.id <> a.id
    where (a.user_id = (select auth.uid()) or (a.workspace_id is not null and public.is_workspace_member(a.workspace_id)))
      and case when p_type = 'user' then b.user_id = p_target else b.workspace_id = p_target end);
$$;
revoke all on function public.shares_conversation(text, uuid) from public, anon;
grant execute on function public.shares_conversation(text, uuid) to authenticated, service_role;

create or replace function public.may_contact(p_type text, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when public.has_admin_permission('support') then true
    when public.shares_conversation(p_type, p_target) then true
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

-- Saved contacts: per seat (a person's own address book, or a workspace's shared one). Only people you may contact can be saved.
create table if not exists public.saved_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user uuid references auth.users(id) on delete cascade,
  owner_workspace uuid references public.workspaces(id) on delete cascade,
  target_type text not null check (target_type in ('user','workspace')),
  target_id uuid not null,
  label text not null default '' check (length(label) <= 120),
  note text not null default '' check (length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((owner_user is null) <> (owner_workspace is null))
);
create unique index if not exists saved_contacts_user_uq on public.saved_contacts(owner_user, target_type, target_id) where owner_user is not null;
create unique index if not exists saved_contacts_ws_uq on public.saved_contacts(owner_workspace, target_type, target_id) where owner_workspace is not null;
alter table public.saved_contacts enable row level security;
drop policy if exists saved_contacts_rw on public.saved_contacts;
create policy saved_contacts_rw on public.saved_contacts for all
  using (owner_user = (select auth.uid()) or (owner_workspace is not null and public.is_workspace_member(owner_workspace)))
  with check ((owner_user = (select auth.uid()) or (owner_workspace is not null and public.is_workspace_member(owner_workspace))) and public.may_contact(target_type, target_id));
grant select, insert, update, delete on public.saved_contacts to authenticated;
grant all on public.saved_contacts to service_role;

-- Contacts list: saved contacts first, then past conversation partners, then relationship-derived contacts.
create or replace function public.my_contacts(p_workspace uuid default null) returns table(kind text, id uuid, label text, context text)
language sql stable security definer set search_path = '' as $$
  select s.target_type, s.target_id, s.label, 'Saved contact' from public.saved_contacts s
    where (p_workspace is null and s.owner_user = (select auth.uid())) or (p_workspace is not null and s.owner_workspace = p_workspace and public.is_workspace_member(p_workspace))
  union
  select distinct case when b.workspace_id is not null then 'workspace' else 'user' end, coalesce(b.workspace_id, b.user_id), b.label, 'Conversation'
    from public.conversation_participants a join public.conversation_participants b on b.conversation_id = a.conversation_id and b.id <> a.id
    where ((p_workspace is null and a.user_id = (select auth.uid())) or (p_workspace is not null and a.workspace_id = p_workspace and public.is_workspace_member(p_workspace))) and b.label <> ''
  union
  select distinct 'workspace'::text, l.workspace_id, w.name, 'Supplier · ' || l.name
    from public.build_items b join public.listings l on l.id = b.listing_id join public.workspaces w on w.id = l.workspace_id
    where public.can_access_event(b.event_id) and b.status not in ('suggested','draft') and (p_workspace is null or l.workspace_id <> p_workspace)
  union
  select distinct case when e.workspace_id is not null then 'workspace' else 'user' end, coalesce(e.workspace_id, e.owner_id),
    coalesce(w.name, p.full_name, 'Client'), 'Client · ' || e.name
    from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
    left join public.workspaces w on w.id = e.workspace_id left join public.profiles p on p.id = e.owner_id
    where p_workspace is not null and l.workspace_id = p_workspace and public.is_workspace_member(p_workspace) and b.status not in ('suggested','draft')
  union
  select distinct 'user'::text, m2.user_id, coalesce(p.full_name, 'Teammate'), 'Team · ' || w.name
    from public.workspace_members m1 join public.workspace_members m2 on m2.workspace_id = m1.workspace_id and m2.user_id <> m1.user_id and m2.status = 'active'
    join public.workspaces w on w.id = m1.workspace_id left join public.profiles p on p.id = m2.user_id
    where m1.user_id = (select auth.uid()) and m1.status = 'active' and (p_workspace is null or m1.workspace_id = p_workspace)
  union
  select distinct 'user'::text, pr.user_id, pr.name, 'Promoter · ' || e.name from public.promoters pr join public.events e on e.id = pr.event_id
    where pr.user_id is not null and public.can_access_event(e.id)
  union
  select distinct 'workspace'::text, e.workspace_id, w.name, 'Organizer · ' || e.name from public.promoters pr join public.events e on e.id = pr.event_id join public.workspaces w on w.id = e.workspace_id
    where pr.user_id = (select auth.uid()) and e.workspace_id is not null;
$$;

-- Profile card for someone you may contact: name, picture, about, and (for businesses) their public listings and events.
create or replace function public.contact_profile(p_type text, p_id uuid, p_seat uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; saved boolean;
begin
  if (select auth.uid()) is null or p_type not in ('user','workspace') or not public.may_contact(p_type, p_id) then return null; end if;
  if p_seat is not null and not public.is_workspace_member(p_seat) then return null; end if;
  select exists (select 1 from public.saved_contacts s where s.target_type = p_type and s.target_id = p_id
    and ((p_seat is null and s.owner_user = (select auth.uid())) or s.owner_workspace = p_seat)) into saved;
  if p_type = 'user' then
    select jsonb_build_object('type', 'user', 'id', p.id, 'name', coalesce(nullif(p.full_name, ''), 'Member'), 'avatar', p.avatar_url, 'about', coalesce(p.bio, ''),
      'since', to_char(p.created_at, 'FMMonth YYYY'),
      'roles', coalesce((select jsonb_agg(distinct w.name) from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
        where m.user_id = p.id and m.status = 'active' and (public.is_workspace_member(w.id) or exists (select 1 from public.listings l where l.workspace_id = w.id and l.published))), '[]'))
      into r from public.profiles p where p.id = p_id;
  else
    select jsonb_build_object('type', 'workspace', 'id', w.id, 'name', w.name, 'kind', w.kind, 'avatar', coalesce(nullif(w.settings #>> '{brand,logo}', ''), w.cover_image),
      'cover', w.cover_image, 'about', coalesce(w.settings #>> '{profile,about}', w.settings ->> 'description', ''), 'location', coalesce(w.settings ->> 'location', ''),
      'verified', w.verification_status = 'verified', 'since', to_char(w.created_at, 'FMMonth YYYY'),
      'listings', coalesce((select jsonb_agg(x) from (select l.id, l.name, l.kind, l.slug from public.listings l where l.workspace_id = w.id and l.published order by l.created_at limit 6) x), '[]'),
      'events', coalesce((select jsonb_agg(x) from (select e.id, e.name, e.slug, e.starts_at from public.events e where e.workspace_id = w.id and e.visibility = 'public'
        and e.status in ('published','on_sale','live') and e.starts_at > now() order by e.starts_at limit 4) x), '[]'))
      into r from public.workspaces w where w.id = p_id;
  end if;
  return r || jsonb_build_object('saved', saved);
end $$;
revoke all on function public.contact_profile(text, uuid, uuid) from public, anon;
grant execute on function public.contact_profile(text, uuid, uuid) to authenticated, service_role;
commit;
