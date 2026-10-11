-- §95 global search (one system, permission-scoped, geospatial for the marketplace) and §94 review responses + moderation.
create extension if not exists pg_trgm;
create extension if not exists cube;
create extension if not exists earthdistance;
begin;

create index if not exists events_name_trgm on public.events using gin (name gin_trgm_ops);
create index if not exists listings_name_trgm on public.listings using gin (name gin_trgm_ops);
create index if not exists leads_name_trgm on public.leads using gin (name gin_trgm_ops);
create index if not exists guests_name_trgm on public.guests using gin (name gin_trgm_ops);

-- Every branch enforces the same access helpers the app uses; results are links into the right portal.
create or replace function public.global_search(p_q text, p_workspace uuid default null, p_limit integer default 30, p_lat double precision default null, p_lng double precision default null, p_radius_km integer default null)
returns table(kind text, id uuid, title text, subtitle text, link text, score real)
-- search_path public: pg_trgm / earthdistance are installed there.
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare q text := trim(coalesce(p_q, '')); lim integer := greatest(1, least(coalesce(p_limit, 30), 100)); ws public.workspaces; portal text;
begin
  if length(q) < 2 then return; end if;
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_workspace is not null then
    if not public.is_workspace_member(p_workspace) then raise exception 'not_authorized' using errcode = '42501'; end if;
    select * into ws from public.workspaces where id = p_workspace;
  end if;
  portal := case when ws.kind = 'provider' then 'provider' when ws.kind = 'organizer' then 'organizer' else 'account' end;
  return query
  (select 'event'::text, e.id, e.name, coalesce(to_char(e.starts_at, 'DD Mon YYYY'), 'Date TBC') || coalesce(' · ' || e.venue_name, ''),
      case when e.workspace_id is not null then '/organizer/events/' || e.id else '/account/events/' || e.id end, similarity(e.name, q)
    from public.events e where (e.name ilike '%' || q || '%' or e.name % q) and public.can_access_event(e.id)
      and (p_workspace is null or e.workspace_id = p_workspace or ws.kind = 'provider')
    order by similarity(e.name, q) desc limit 8)
  union all
  (select 'person', g.id, g.name, coalesce(g.email, '') || ' · ' || e.name, case when e.workspace_id is not null then '/organizer/events/' || e.id || '?tab=plan&section=guests' else '/account/events/' || e.id || '/guests-tickets' end, similarity(g.name, q)
    from public.guests g join public.events e on e.id = g.event_id where (g.name ilike '%' || q || '%' or g.email ilike '%' || q || '%') and public.can_access_event(e.id) and (p_workspace is null or e.workspace_id = p_workspace) limit 6)
  union all
  (select case when l.kind = 'venue' then 'venue' else 'service' end, l.id, l.name, coalesce(l.category, '') || coalesce(' · ' || l.city, '') ||
      case when p_lat is not null and l.lat is not null then ' · ' || round((earth_distance(ll_to_earth(p_lat, p_lng), ll_to_earth(l.lat, l.lng)) / 1000)::numeric, 1) || ' km' else '' end,
      case when portal = 'provider' and l.workspace_id = p_workspace then '/provider/listings' else '/' || case when l.kind = 'venue' then 'venues' else 'services' end || '/' || coalesce(l.slug, l.id::text) end,
      similarity(l.name, q)
    from public.listings l where (l.published or l.workspace_id = p_workspace) and (l.name ilike '%' || q || '%' or l.name % q or l.category ilike '%' || q || '%' or l.city ilike '%' || q || '%')
      and (p_lat is null or p_radius_km is null or l.lat is null or earth_distance(ll_to_earth(p_lat, p_lng), ll_to_earth(l.lat, l.lng)) <= p_radius_km * 1000)
    order by similarity(l.name, q) desc limit 8)
  union all
  (select 'provider', w.id, w.name, 'Provider', '/organizers/' || w.id, similarity(w.name, q)
    from public.workspaces w where w.kind = 'provider' and w.name ilike '%' || q || '%' and exists (select 1 from public.listings l where l.workspace_id = w.id and l.published) limit 4)
  union all
  (select 'booking', b.id, b.title, b.status || ' · ' || e.name,
      case when portal = 'provider' then '/provider/opportunities/' || b.id when e.workspace_id is not null then '/organizer/marketplace/bookings/' || b.id else '/account/events/' || e.id || '/bookings/' || b.id end,
      similarity(b.title, q)
    from public.build_items b join public.events e on e.id = b.event_id left join public.listings l on l.id = b.listing_id
    where b.listing_id is not null and b.status not in ('suggested','draft') and (b.title ilike '%' || q || '%' or e.name ilike '%' || q || '%')
      and ((portal = 'provider' and l.workspace_id = p_workspace) or (portal <> 'provider' and public.can_access_event(e.id) and (p_workspace is null or e.workspace_id = p_workspace))) limit 8)
  union all
  (select 'ticket', t.id, e.name || ' · ' || coalesce(tr.name, 'Ticket'), t.code || ' · ' || t.status, '/account/tickets/' || t.id, 0.5::real
    from public.tickets t join public.events e on e.id = t.event_id left join public.ticket_tiers tr on tr.id = t.tier_id
    where t.holder_id = auth.uid() and (e.name ilike '%' || q || '%' or t.code ilike '%' || q || '%') limit 5)
  union all
  (select 'lead', ld.id, ld.name, coalesce(ld.client_name, '') || ' · ' || ld.stage, '/organizer/sales/leads/' || ld.id, similarity(ld.name, q)
    from public.leads ld where p_workspace is not null and ld.workspace_id = p_workspace and public.has_permission(p_workspace, 'sales.read')
      and (ld.name ilike '%' || q || '%' or ld.client_name ilike '%' || q || '%' or ld.contact_name ilike '%' || q || '%') limit 6)
  union all
  (select 'client', ld.id, ld.client_name, coalesce(ld.contact_name, '') || coalesce(' · ' || ld.contact_email, ''), '/organizer/sales/leads/' || ld.id, similarity(ld.client_name, q)
    from public.leads ld where p_workspace is not null and ld.workspace_id = p_workspace and ld.client_name is not null and public.has_permission(p_workspace, 'sales.read')
      and ld.client_name ilike '%' || q || '%' limit 4)
  union all
  (select 'proposal', pr.id, pr.title, coalesce(pr.client_name, '') || ' · ' || pr.status, '/organizer/proposals/' || pr.id, similarity(pr.title, q)
    from public.proposals pr where p_workspace is not null and pr.workspace_id = p_workspace and public.has_permission(p_workspace, 'sales.read')
      and (pr.title ilike '%' || q || '%' or pr.client_name ilike '%' || q || '%' or pr.number ilike '%' || q || '%') limit 6)
  union all
  (select 'invoice', i.id, coalesce(i.number, 'Invoice'), coalesce(i.client_name, '') || ' · ' || i.status, '/organizer/money/invoices/' || i.id, 0.6::real
    from public.invoices i where p_workspace is not null and i.workspace_id = p_workspace and public.has_permission(p_workspace, 'finance.read')
      and (i.number ilike '%' || q || '%' or i.client_name ilike '%' || q || '%') limit 6)
  union all
  (select 'file', m.id, m.title, coalesce(m.kind, 'File'), case when m.event_id is not null then '/organizer/events/' || m.event_id || '?tab=plan&section=files' else '/organizer' end, similarity(m.title, q)
    from public.media_assets m where m.title ilike '%' || q || '%' and ((m.event_id is not null and public.can_access_event(m.event_id)) or (m.workspace_id is not null and m.workspace_id = p_workspace)) limit 6)
  order by 6 desc nulls last
  limit lim;
end $$;
revoke all on function public.global_search(text, uuid, integer, double precision, double precision, integer) from public, anon;
grant execute on function public.global_search(text, uuid, integer, double precision, double precision, integer) to authenticated, service_role;

-- §94 reviews: provider responses and moderation that preserves audit and requires a policy reason.
alter table public.reviews
  add column if not exists provider_response text check (provider_response is null or length(provider_response) <= 2000),
  add column if not exists responded_at timestamptz,
  add column if not exists moderation_reason text,
  add column if not exists moderated_by uuid references auth.users(id),
  add column if not exists moderated_at timestamptz;

create or replace function public.respond_to_review(p_review uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reviews; ws uuid;
begin
  select * into r from public.reviews where id = p_review for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := public.listing_workspace(r.listing_id);
  perform public.require_provider_role(ws, array['owner','manager']);
  if length(trim(coalesce(p_body, ''))) < 2 then raise exception 'empty' using errcode = '22023'; end if;
  update public.reviews set provider_response = left(trim(p_body), 2000), responded_at = now(), updated_at = now() where id = r.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', ws, 'review.responded', jsonb_build_object('review_id', r.id));
end $$;

create or replace function public.moderate_review(p_review uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reviews;
begin
  if not (public.has_admin_permission('trust') or public.has_admin_permission('marketplace')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into r from public.reviews where id = p_review for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.reviews set status = p_status, moderation_reason = left(p_reason, 500), moderated_by = auth.uid(), moderated_at = now(), updated_at = now() where id = r.id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'review.moderated', jsonb_build_object('review_id', r.id, 'from', r.status, 'to', p_status, 'reason', left(p_reason, 500)));
end $$;
revoke all on function public.respond_to_review(uuid, text), public.moderate_review(uuid, text, text) from public, anon;
grant execute on function public.respond_to_review(uuid, text), public.moderate_review(uuid, text, text) to authenticated, service_role;
commit;
