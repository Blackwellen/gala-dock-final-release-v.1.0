-- Q63 global search bug hunt (lane bughunt-search). Additive: create-or-replace of global_search with the SAME signature and grants,
-- two new helpers, and a new admin-only admin_global_search. No table changes.
--
-- Fixes (live probe scripts/qa/search-isolation.mjs, before → after in artifacts/release/q63-search-isolation.json):
--  * paused / demo-hidden listings and suspended providers were returned (global search used `published` only; the public predicate
--    is search_listing_is_public + not demo_hidden_for_viewer, as listings_public_read / events_public do).
--  * LIKE wildcards in the query were live: q = '%%' or '__' matched every accessible record. Now escaped.
--  * proposal results linked to /organizer/proposals/<id> (404); now /organizer/sales/proposals/<id>.
--  * "client" results were a duplicate of each lead (leads.client_name), never the real Clients (contacts) table; now public.clients
--    → /organizer/sales/clients/<id>. Contracts added (sales.read).
--  * provider results linked to /organizers/<workspace id>, which 404s for providers (public_workspace needs public events); now the
--    provider's best public listing page.
--  * seat mixing: the provider seat returned the user's personal events and other organiser workspaces' events with /organizer
--    links, and media files linked to /organizer; the customer seat returned organiser-workspace records with /organizer links.
--    Each seat now only returns its own records (provider: its listings, bookings on them and its media; organiser: that
--    workspace; customer: personal events/guests/bookings + own tickets) plus the public marketplace.
--  * the customer seat could not find public events at all (only events they own); upcoming public on-sale events now appear
--    and link to the public event page.
--  * relevance: similarity() over the whole title ranked an exact or prefix hit in a long title below fuzzy noise and fixed
--    scores (tickets 0.5, invoices 0.6) outranked exact title matches. Now search_rank(): exact > prefix > word prefix >
--    substring > all words present > fuzzy. Multi-word queries match when every word is present in any order; queries of 4+
--    characters also tolerate typos (word_similarity >= 0.45).
--  * replaced (transferred/resold) tickets were listed and opened as void; now only the current credential.
-- New: admin_global_search (platform admin at aal2 only, per-area admin permissions) for the admin console top bar, which
-- previously searched only the admin's personal records.

-- admin ticket lookup by code / order ref (17.9k rows: was a 54 ms sequential scan per keystroke)
create index if not exists tickets_code_trgm on public.tickets using gin (code gin_trgm_ops);
create index if not exists tickets_order_ref_trgm on public.tickets using gin (order_ref gin_trgm_ops) where order_ref is not null;

create or replace function public.search_like_escape(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- 0..1 relevance of p_text for the query p_q. Case-insensitive; never errors on nulls.
create or replace function public.search_rank(p_text text, p_q text) returns real
language sql immutable parallel safe set search_path = public, pg_temp as $$
  with s as (select lower(coalesce(p_text, '')) t, lower(btrim(coalesce(p_q, ''))) q)
  select (case
    when s.q = '' or s.t = '' then 0
    when s.t = s.q then 1.0
    when strpos(s.t, s.q) = 1 then 0.9
    when strpos(s.t, ' ' || s.q) > 0 or strpos(s.t, '-' || s.q) > 0 then 0.8
    when strpos(s.t, s.q) > 0 then 0.7
    when not exists (select 1 from unnest(regexp_split_to_array(s.q, '\s+')) w where w <> '' and strpos(s.t, w) = 0) then 0.65
    else 0.6 * greatest(word_similarity(s.q, s.t), similarity(s.q, s.t)) end)::real
  from s
$$;

create or replace function public.global_search(p_q text, p_workspace uuid default null, p_limit integer default 30, p_lat double precision default null, p_lng double precision default null, p_radius_km integer default null)
returns table(kind text, id uuid, title text, subtitle text, link text, score real)
-- search_path public: pg_trgm / earthdistance are installed there.
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  q text := left(btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g')), 80);
  lim integer := greatest(1, least(coalesce(p_limit, 30), 100));
  uid uuid := auth.uid();
  ws public.workspaces; portal text := 'account';
  pats text[]; fuzzy boolean;
begin
  if length(q) < 2 then return; end if;
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_workspace is not null then
    if not public.is_workspace_member(p_workspace) then raise exception 'not_authorized' using errcode = '42501'; end if;
    select * into ws from public.workspaces where id = p_workspace;
    portal := case when ws.kind = 'provider' then 'provider' when ws.kind = 'organizer' then 'organizer' else 'account' end;
  end if;
  -- every word must be present (any order); wildcards in the query are literal
  select array_agg('%' || public.search_like_escape(w) || '%') into pats from unnest(string_to_array(q, ' ')) w where w <> '';
  fuzzy := length(q) >= 4;

  return query
  with sc as (   -- the events this seat may search inside
    select e.* from public.events e
    where (portal = 'organizer' and e.workspace_id = p_workspace)
       or (portal = 'account' and e.workspace_id is null and e.owner_id = uid)
  )
  (select 'event'::text, e.id, e.name, coalesce(to_char(e.starts_at, 'DD Mon YYYY'), 'Date TBC') || coalesce(' · ' || e.venue_name, ''),
      case when portal = 'organizer' then '/organizer/events/' || e.id else '/account/events/' || e.id end, public.search_rank(e.name, q)
    from sc e where e.name ilike all (pats) or (fuzzy and word_similarity(q, e.name) >= 0.45)
    order by 6 desc, e.starts_at desc nulls last limit 8)
  union all
  (select 'event'::text, e.id, e.name, coalesce(to_char(e.starts_at, 'DD Mon YYYY'), 'Date TBC') || coalesce(' · ' || coalesce(e.venue_name, e.city), ''),
      '/events/' || coalesce(e.slug, e.id::text), public.search_rank(e.name, q) * 0.95::real
    from public.events e
    where portal = 'account' and public.search_event_is_public(e) and not public.demo_hidden_for_viewer(e.workspace_id)
      and coalesce(e.ends_at, e.starts_at, now()) >= now() - interval '1 day'
      and not (e.workspace_id is null and e.owner_id = uid)
      and (e.name ilike all (pats) or (fuzzy and e.name %> q and word_similarity(q, e.name) >= 0.45))
    order by 6 desc, e.starts_at nulls last limit 8)
  union all
  (select 'person'::text, g.id, g.name, coalesce(nullif(g.email, '') || ' · ', '') || e.name,
      case when portal = 'organizer' then '/organizer/events/' || e.id || '?tab=plan&section=guests' else '/account/events/' || e.id || '/guests-tickets' end,
      greatest(public.search_rank(g.name, q), public.search_rank(g.email, q) * 0.9::real)
    from public.guests g join sc e on e.id = g.event_id
    where g.name ilike all (pats) or g.email ilike all (pats) or (fuzzy and word_similarity(q, g.name) >= 0.45)
    order by 6 desc limit 6)
  union all
  (select case when l.kind = 'venue' then 'venue' else 'service' end, l.id, l.name, coalesce(l.category, '') || coalesce(' · ' || l.city, '') ||
      case when p_lat is not null and p_lng is not null and l.lat is not null then ' · ' || round((earth_distance(ll_to_earth(p_lat, p_lng), ll_to_earth(l.lat, l.lng)) / 1000)::numeric, 1) || ' km' else '' end,
      case when portal = 'provider' and l.workspace_id = p_workspace then '/provider/' || case when l.kind = 'venue' then 'venues' else 'services' end || '/' || l.id
           else '/' || case when l.kind = 'venue' then 'venues' else 'services' end || '/' || coalesce(l.slug, l.id::text) end,
      greatest(public.search_rank(l.name, q), public.search_rank(l.category, q) * 0.7::real, public.search_rank(l.city, q) * 0.6::real)
    from public.listings l
    where ((public.search_listing_is_public(l) and not public.demo_hidden_for_viewer(l.workspace_id)
            and exists (select 1 from public.workspaces w where w.id = l.workspace_id and w.status = 'active'))
           or (portal = 'provider' and l.workspace_id = p_workspace))
      and (l.name ilike all (pats) or l.category ilike all (pats) or l.city ilike all (pats) or (fuzzy and word_similarity(q, l.name) >= 0.45))
      and (p_lat is null or p_lng is null or p_radius_km is null or l.lat is null or earth_distance(ll_to_earth(p_lat, p_lng), ll_to_earth(l.lat, l.lng)) <= p_radius_km * 1000)
    order by 6 desc limit 8)
  union all
  (select 'provider'::text, w.id, w.name, 'Provider' || coalesce(' · ' || best.city, ''),
      '/' || case when best.kind = 'venue' then 'venues' else 'services' end || '/' || coalesce(best.slug, best.id::text), public.search_rank(w.name, q) * 0.9::real
    from public.workspaces w
    cross join lateral (select l.id, l.kind, l.slug, l.city from public.listings l where l.workspace_id = w.id and public.search_listing_is_public(l)
                          and not public.demo_hidden_for_viewer(l.workspace_id) order by l.review_count desc nulls last, l.created_at limit 1) best
    where w.kind = 'provider' and w.status = 'active' and (w.name ilike all (pats) or (fuzzy and word_similarity(q, w.name) >= 0.45))
    order by 6 desc limit 4)
  union all
  (select 'booking'::text, b.id, b.title, b.status || ' · ' || e.name,
      case when portal = 'provider' then '/provider/opportunities/' || b.id when portal = 'organizer' then '/organizer/marketplace/bookings/' || b.id
           else '/account/events/' || e.id || '/bookings/' || b.id end,
      greatest(public.search_rank(b.title, q), public.search_rank(e.name, q) * 0.8::real, public.search_rank(l.name, q) * 0.8::real)
    from public.build_items b join public.events e on e.id = b.event_id join public.listings l on l.id = b.listing_id
    where b.status not in ('suggested', 'draft')
      and (b.title ilike all (pats) or e.name ilike all (pats) or l.name ilike all (pats))
      and ((portal = 'provider' and l.workspace_id = p_workspace)
        or (portal = 'organizer' and e.workspace_id = p_workspace)
        or (portal = 'account' and e.workspace_id is null and e.owner_id = uid))
    order by 6 desc limit 8)
  union all
  (select 'ticket'::text, t.id, e.name || ' · ' || coalesce(tr.name, 'Ticket'), t.code || ' · ' || t.status, '/account/tickets/' || t.id,
      greatest(public.search_rank(e.name, q), public.search_rank(t.code, q)) * 0.9::real
    from public.tickets t join public.events e on e.id = t.event_id left join public.ticket_tiers tr on tr.id = t.tier_id
    where t.holder_id = uid and t.replaced_by is null and (e.name ilike all (pats) or t.code ilike all (pats))
    order by 6 desc, t.created_at desc limit 5)
  union all
  (select 'lead'::text, ld.id, ld.name, concat_ws(' · ', nullif(ld.client_name, ''), ld.stage), '/organizer/sales/leads/' || ld.id,
      greatest(public.search_rank(ld.name, q), public.search_rank(ld.client_name, q) * 0.85::real, public.search_rank(ld.contact_name, q) * 0.8::real)
    from public.leads ld where portal = 'organizer' and ld.workspace_id = p_workspace and public.has_permission(p_workspace, 'sales.read')
      and (ld.name ilike all (pats) or ld.client_name ilike all (pats) or ld.contact_name ilike all (pats) or (fuzzy and word_similarity(q, ld.name) >= 0.45))
    order by 6 desc limit 6)
  union all
  (select 'client'::text, cl.id, cl.name, concat_ws(' · ', nullif(cl.email, ''), cl.kind), '/organizer/sales/clients/' || cl.id,
      greatest(public.search_rank(cl.name, q), public.search_rank(cl.email, q) * 0.85::real)
    from public.clients cl where portal = 'organizer' and cl.workspace_id = p_workspace and cl.status = 'active' and public.has_permission(p_workspace, 'sales.read')
      and (cl.name ilike all (pats) or cl.email ilike all (pats) or (fuzzy and word_similarity(q, cl.name) >= 0.45))
    order by 6 desc limit 5)
  union all
  (select 'proposal'::text, pr.id, pr.title, concat_ws(' · ', nullif(pr.client_name, ''), pr.status), '/organizer/sales/proposals/' || pr.id,
      greatest(public.search_rank(pr.title, q), public.search_rank(pr.number, q), public.search_rank(pr.client_name, q) * 0.85::real)
    from public.proposals pr where portal = 'organizer' and pr.workspace_id = p_workspace and public.has_permission(p_workspace, 'sales.read')
      and (pr.title ilike all (pats) or pr.client_name ilike all (pats) or pr.number ilike all (pats))
    order by 6 desc limit 6)
  union all
  (select 'contract'::text, ct.id, coalesce(nullif(ct.title, ''), ct.number), concat_ws(' · ', ct.number, ct.status), '/organizer/sales/contracts/' || ct.id,
      greatest(public.search_rank(ct.title, q), public.search_rank(ct.number, q))
    from public.contracts ct where portal = 'organizer' and ct.workspace_id = p_workspace and public.has_permission(p_workspace, 'sales.read')
      and (ct.title ilike all (pats) or ct.number ilike all (pats))
    order by 6 desc limit 5)
  union all
  (select 'invoice'::text, i.id, coalesce(i.number, 'Invoice'), concat_ws(' · ', nullif(i.client_name, ''), i.status), '/organizer/money/invoices/' || i.id,
      greatest(public.search_rank(i.number, q), public.search_rank(i.client_name, q) * 0.85::real)
    from public.invoices i where portal = 'organizer' and i.workspace_id = p_workspace and public.has_permission(p_workspace, 'finance.read')
      and (i.number ilike all (pats) or i.client_name ilike all (pats))
    order by 6 desc limit 6)
  union all
  (select 'file'::text, m.id, m.title, coalesce(m.kind, 'File'),
      case when portal = 'provider' then '/provider/media'
           when m.event_id is not null and portal = 'organizer' then '/organizer/events/' || m.event_id || '/media'
           when portal = 'organizer' then '/organizer/media'
           else '/account/events/' || m.event_id end,
      public.search_rank(m.title, q)
    from public.media_assets m
    where m.title ilike all (pats)
      and ((portal = 'provider' and m.workspace_id = p_workspace)
        or (portal = 'organizer' and (m.workspace_id = p_workspace or m.event_id in (select sc.id from sc)))
        or (portal = 'account' and m.event_id in (select sc.id from sc)))
    order by 6 desc limit 6)
  order by 6 desc nulls last, 1, 3
  limit lim;
end $$;
revoke all on function public.global_search(text, uuid, integer, double precision, double precision, integer) from public, anon;
grant execute on function public.global_search(text, uuid, integer, double precision, double precision, integer) to authenticated, service_role;

-- Admin console top-bar search. Platform admin at aal2 (is_platform_admin); each area also needs its admin permission, matching the
-- console pages the links open. Links never leave /admin.
create or replace function public.admin_global_search(p_q text, p_limit integer default 40)
returns table(kind text, id uuid, title text, subtitle text, link text, score real)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  q text := left(btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g')), 80);
  lim integer := greatest(1, least(coalesce(p_limit, 40), 100));
  pats text[]; fuzzy boolean;
  tpat text;   -- ticket code / order ref pattern (trigram-indexed), null when tickets are out of scope
  can_users boolean; can_ws boolean; can_events boolean; can_tickets boolean; can_market boolean; can_support boolean;
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(q) < 2 then return; end if;
  select array_agg('%' || public.search_like_escape(w) || '%') into pats from unnest(string_to_array(q, ' ')) w where w <> '';
  fuzzy := length(q) >= 4;
  can_users := public.has_admin_permission('users') or public.has_admin_permission('support');
  can_ws := public.has_admin_permission('workspaces');
  can_events := public.has_admin_permission('events') or public.has_admin_permission('tickets');
  can_tickets := public.has_admin_permission('tickets');
  can_market := public.has_admin_permission('marketplace');
  can_support := public.has_admin_permission('support');
  if can_tickets and length(q) >= 4 then tpat := '%' || public.search_like_escape(q) || '%'; end if;

  return query
  (select 'user'::text, u.id, coalesce(nullif(p.full_name, ''), u.email::text), concat_ws(' · ', u.email::text, coalesce(p.status, 'active')), '/admin/users/' || u.id,
      greatest(public.search_rank(p.full_name, q), public.search_rank(u.email::text, q))
    from auth.users u left join public.profiles p on p.id = u.id
    where can_users and (u.email::text ilike all (pats) or p.full_name ilike all (pats) or u.id::text = q)
    order by 6 desc limit 6)
  union all
  (select 'workspace'::text, w.id, w.name, initcap(w.kind) || ' · ' || w.status, '/admin/workspaces/' || w.id, public.search_rank(w.name, q)
    from public.workspaces w where can_ws and (w.name ilike all (pats) or w.id::text = q or (fuzzy and word_similarity(q, w.name) >= 0.45))
    order by 6 desc limit 6)
  union all
  (select 'event'::text, e.id, e.name, concat_ws(' · ', coalesce(to_char(e.starts_at, 'DD Mon YYYY'), 'Date TBC'), e.status, e.visibility), '/admin/events?sel=' || e.id,
      public.search_rank(e.name, q)
    from public.events e where can_events and (e.name ilike all (pats) or e.id::text = q or (fuzzy and e.name %> q and word_similarity(q, e.name) >= 0.45))
    order by 6 desc, e.starts_at desc nulls last limit 8)
  union all
  (select case when l.kind = 'venue' then 'venue' else 'service' end, l.id, l.name,
      concat_ws(' · ', nullif(l.city, ''), case when l.paused_at is not null then 'paused' when l.published then 'published' else 'unpublished' end), '/admin/marketplace/listings/' || l.id,
      public.search_rank(l.name, q)
    from public.listings l where can_market and (l.name ilike all (pats) or l.id::text = q or (fuzzy and word_similarity(q, l.name) >= 0.45))
    order by 6 desc limit 6)
  union all
  (select 'ticket'::text, t.id, t.code, concat_ws(' · ', e.name, t.status), '/admin/tickets?q=' || t.code,
      greatest(public.search_rank(t.code, q), public.search_rank(t.order_ref, q) * 0.9::real)
    from public.tickets t join public.events e on e.id = t.event_id
    where tpat is not null and (t.code ilike tpat or t.order_ref ilike tpat or lower(t.attendee_email) = lower(q))
    order by 6 desc, t.created_at desc limit 6)
  union all
  (select 'case'::text, s.id, coalesce(nullif(s.subject, ''), s.reference), concat_ws(' · ', s.reference, s.status, s.priority), '/admin/support/' || s.id,
      greatest(public.search_rank(s.subject, q), public.search_rank(s.reference, q))
    from public.support_cases s where can_support and (s.subject ilike all (pats) or s.reference ilike all (pats) or s.requester_name ilike all (pats))
    order by 6 desc, s.created_at desc limit 6)
  order by 6 desc nulls last, 1, 3
  limit lim;
end $$;
revoke all on function public.admin_global_search(text, integer) from public, anon;
grant execute on function public.admin_global_search(text, integer) to authenticated, service_role;
revoke all on function public.search_rank(text, text), public.search_like_escape(text) from public, anon;
grant execute on function public.search_rank(text, text), public.search_like_escape(text) to authenticated, service_role;
