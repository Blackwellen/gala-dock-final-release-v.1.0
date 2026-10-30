-- Q14 Event Core 5/5 — private event guest page (W02/Q18 finding; domains 32.9 visibility, 33.14 private events) and
-- the event timeline (domain 44).
-- A private event is shared with guests through a revocable, expiring link. Only the SHA-256 hash of the 256-bit token
-- is stored (token generated server-side by createInviteToken()). The guest projection is resolved by the trusted
-- server route /guest/[token] through event_guest_view(), which is service-only (no anonymous RPC surface): it returns
-- one event's guest-safe fields (no guests, money, bookings, files, contacts or other events) and nothing at all for
-- unknown, revoked or expired links, archived events or events Gala Dock has restricted.

create table if not exists public.event_guest_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default '' check (length(label) <= 80),
  show_location boolean not null default true,
  show_programme boolean not null default true,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  open_count integer not null default 0,
  last_opened_at timestamptz
);
create index if not exists event_guest_links_event_idx on public.event_guest_links(event_id, created_at desc);
alter table public.event_guest_links enable row level security;
revoke all on table public.event_guest_links from public, anon, authenticated;
grant select on table public.event_guest_links to authenticated;
grant all on table public.event_guest_links to service_role;
drop policy if exists event_guest_links_read on public.event_guest_links;
create policy event_guest_links_read on public.event_guest_links for select to authenticated using (public.can_access_event(event_id));

create or replace function public.create_event_guest_link(p_event uuid, p_token_hash text, p_label text default '', p_expires_at timestamptz default null,
  p_show_location boolean default true, p_show_programme boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; uid uuid := (select auth.uid()); v_exp timestamptz; v_id uuid;
begin
  select * into e from public.events where id = p_event;
  if not found or uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.workspace_id is null then
    if e.owner_id is distinct from uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  elsif not public.has_permission(e.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.status in ('archived', 'cancelled') or (e.settings ? 'admin_restriction') then raise exception 'event_not_shareable' using errcode = '22023'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_token' using errcode = '22023'; end if;
  if (select count(*) from public.event_guest_links l where l.event_id = e.id and l.revoked_at is null and l.expires_at > now()) >= 20 then
    raise exception 'too_many_links: revoke an old link first' using errcode = '54000';
  end if;
  v_exp := coalesce(p_expires_at, coalesce(e.ends_at, e.starts_at + interval '1 day', now()) + interval '30 days');
  if v_exp <= now() then raise exception 'expiry_in_past' using errcode = '22023'; end if;
  v_exp := least(v_exp, now() + interval '400 days');
  insert into public.event_guest_links(event_id, token_hash, label, show_location, show_programme, expires_at, created_by)
    values (e.id, p_token_hash, left(coalesce(p_label, ''), 80), coalesce(p_show_location, true), coalesce(p_show_programme, true), v_exp, uid)
    returning id into v_id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (uid, e.workspace_id, 'event.guest_link_created', jsonb_build_object('event_id', e.id, 'link_id', v_id, 'expires_at', v_exp));
  perform public.emit_domain_event('event.guest_link_created', e.workspace_id, jsonb_build_object('id', e.id, 'link_id', v_id), uid, 'user', 'event', e.id::text, null, null);
  return jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_exp);
end $$;

create or replace function public.revoke_event_guest_link(p_link uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.event_guest_links; e public.events; uid uuid := (select auth.uid());
begin
  select * into l from public.event_guest_links where id = p_link for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.events where id = l.event_id;
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.workspace_id is null then
    if e.owner_id is distinct from uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  elsif not public.has_permission(e.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if l.revoked_at is not null then return jsonb_build_object('ok', true, 'changed', false); end if;
  update public.event_guest_links set revoked_at = now(), revoked_by = uid where id = l.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (uid, e.workspace_id, 'event.guest_link_revoked', jsonb_build_object('event_id', e.id, 'link_id', l.id));
  perform public.emit_domain_event('event.guest_link_revoked', e.workspace_id, jsonb_build_object('id', e.id, 'link_id', l.id), uid, 'user', 'event', e.id::text, null, null);
  return jsonb_build_object('ok', true, 'changed', true);
end $$;

-- Service-only: called by the server route with the hash of the URL token.
create or replace function public.event_guest_view(p_token_hash text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.event_guest_links; e public.events; v_host text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into l from public.event_guest_links where token_hash = p_token_hash;
  if not found or l.revoked_at is not null or l.expires_at <= now() then return null; end if;
  select * into e from public.events where id = l.event_id;
  if not found or e.status = 'archived' or (e.settings ? 'admin_restriction') then return null; end if;
  if not public.hit_rate_limit('guest:view:' || l.id, 600, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  update public.event_guest_links set open_count = open_count + 1, last_opened_at = now() where id = l.id;
  select coalesce(nullif(w.name, ''), 'Your host') into v_host from public.workspaces w where w.id = e.workspace_id;
  return jsonb_build_object(
    'link', jsonb_build_object('label', l.label, 'expires_at', l.expires_at),
    'host', coalesce(v_host, 'Your host'),
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'event_type', e.event_type, 'status', e.status, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
      'timezone', e.timezone, 'description', e.description, 'cover_image', e.cover_image,
      'venue_name', case when l.show_location then e.venue_name else '' end,
      'location', case when l.show_location then e.location else '' end,
      'city', case when l.show_location then e.city else '' end,
      'online', exists (select 1 from public.event_virtual v where v.event_id = e.id)),
    'programme', case when l.show_programme then coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'detail', x.detail, 'area', x.area,
        'starts_at', x.starts_at, 'duration_minutes', x.duration_minutes, 'segment', x.segment) order by x.starts_at)
      from public.programme_items x where x.event_id = e.id and x.kind = 'programme'), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Activity timeline (domain 44; extends the existing audit-only event_activity()): audit trail + lifecycle/outbox events + incidents for one event, newest first.
create index if not exists audit_events_event_idx on public.audit_events((metadata ->> 'event_id'), created_at desc) where metadata ? 'event_id';
create index if not exists domain_outbox_aggregate_idx on public.domain_outbox(aggregate_type, aggregate_id, emitted_at desc) where aggregate_id is not null;
create or replace function public.event_timeline(p_event uuid, p_limit integer default 50, p_before timestamptz default null)
returns table(at timestamptz, kind text, action text, actor_id uuid, actor_type text, detail jsonb)
language sql stable security definer set search_path = '' as $$
  with ok as (select public.can_access_event(p_event) as allowed)
  select * from (
    select a.created_at, 'audit'::text, a.event, a.actor_id, coalesce(a.actor_type, case when a.actor_id is null then 'system' else 'user' end),
           (a.metadata - 'ip' - 'user_agent' - 'email')
      from public.audit_events a where a.metadata ? 'event_id' and a.metadata ->> 'event_id' = p_event::text
    union all
    select o.emitted_at, 'event', o.event_type, o.actor_id, o.actor_type, o.payload
      from public.domain_outbox o where o.aggregate_type = 'event' and o.aggregate_id = p_event::text
    union all
    select i.created_at, 'incident', 'incident.' || i.status, i.reported_by, 'user', jsonb_build_object('title', i.title, 'severity', i.severity)
      from public.incidents i where i.event_id = p_event
  ) t(at, kind, action, actor_id, actor_type, detail)
  where (select allowed from ok) and (p_before is null or t.at < p_before)
  order by t.at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.create_event_guest_link(uuid, text, text, timestamptz, boolean, boolean) from public, anon, authenticated;
revoke all on function public.revoke_event_guest_link(uuid) from public, anon, authenticated;
revoke all on function public.event_guest_view(text) from public, anon, authenticated;
revoke all on function public.event_timeline(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.create_event_guest_link(uuid, text, text, timestamptz, boolean, boolean), public.revoke_event_guest_link(uuid),
  public.event_timeline(uuid, integer, timestamptz) to authenticated, service_role;
grant execute on function public.event_guest_view(text) to service_role;
