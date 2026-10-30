-- Q09 Marketplace Listings / Search / Ranking (lane A, 2026-10-29; domains 103–107, backend §13.14/§13.17). Additive.
-- Venue/space and supplier/service listings with packages; date/availability, price and capacity filters; a versioned,
-- explainable organic ranking model (ranking_reasons per result); reliability weighting (Q08 band, read only);
-- requirement matching with persisted runs; non-personalised recommendations; public category/location discovery.
-- Sponsorship is NEVER an input: listings.sponsored, promotion_boosts and ad_* tables are not read here (Q23 serves
-- sponsored slots separately and labels them).

-- ───────────── Versioned ranking model ─────────────
create table if not exists public.ranking_models (
  version integer primary key,
  weights jsonb not null,
  params jsonb not null default '{}',
  description text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists ranking_models_one_active on public.ranking_models(active) where active;
alter table public.ranking_models enable row level security;
revoke all on table public.ranking_models from public, anon, authenticated;
grant select on table public.ranking_models to anon, authenticated;
grant all on table public.ranking_models to service_role;
drop policy if exists ranking_models_read on public.ranking_models;
create policy ranking_models_read on public.ranking_models for select to anon, authenticated using (true);

create or replace function public.ranking_models_immutable() returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'ranking_model_immutable' using errcode = '42501'; end if;
  if new.weights is distinct from old.weights or new.params is distinct from old.params or new.version is distinct from old.version then
    raise exception 'ranking_model_immutable' using errcode = '42501', hint = 'Add a new version instead.';
  end if;
  return new;
end $$;
drop trigger if exists ranking_models_immutable on public.ranking_models;
create trigger ranking_models_immutable before update or delete on public.ranking_models for each row execute function public.ranking_models_immutable();

insert into public.ranking_models(version, weights, params, description, active) values
  (1, '{"text":0.20,"distance":0.15,"availability":0.20,"reliability":0.15,"rating":0.15,"response":0.10,"budget":0.05}',
   '{"rating_prior":4.0,"rating_prior_weight":5,"default_radius_km":50,"band_values":{"excellent":1,"good":0.8,"developing":0.6,"new":0.5,"at_risk":0.2},
     "availability_values":{"available":1,"limited":0.6,"unknown":0.5,"unavailable":0},"excluded_inputs":["sponsored","promotion_boosts","ad_impressions","ad_placements"]}',
   'v1: organic marketplace ranking. Hard filters first (published, kind, category, location, capacity, price, verified, availability when excluded), then a weighted score over text relevance, distance, availability fit, reliability band (Q08), smoothed rating, response SLA and budget fit. Features without input (no query, no location, no date, no budget) are omitted and the remaining weights renormalised. Sponsorship is never an input.',
   true)
on conflict (version) do nothing;

-- Coarse availability of a listing for a window, using the same commitments as the Q10 conflict rules (confirmed/active
-- jobs, held jobs, availability blocks, hard holds). For multi-space venues a venue is unavailable only when no space
-- that fits the guests is free. Exposes a state, never another customer's booking.
create or replace function public.listing_window_availability(p_listing uuid, p_start timestamptz, p_end timestamptz, p_guests integer default null)
returns text language plpgsql stable security definer set search_path to '' as $$
declare v_base text; v_kind text; v_spaces integer; v_free integer;
begin
  v_base := public.listing_availability(p_listing, p_start, p_end);
  if v_base in ('unknown', 'unavailable') then return v_base; end if;
  select l.kind into v_kind from public.listings l where l.id = p_listing;
  if v_kind <> 'venue' then return v_base; end if;
  select count(*), count(*) filter (where not exists (
            select 1 from public.provider_jobs j where j.space_id = s.id and j.status in ('confirmed','active','held')
               and tstzrange(j.starts_at, j.ends_at) && tstzrange(p_start - make_interval(mins => coalesce(s.turnaround_minutes, 0)), p_end + make_interval(mins => coalesce(s.turnaround_minutes, 0))))
          and not exists (select 1 from public.availability_blocks a where a.space_id = s.id and a.kind in ('blocked','closed','maintenance')
               and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_start, p_end)))
    into v_spaces, v_free
    from public.spaces s where s.venue_id = p_listing and coalesce(s.status, 'published') not in ('archived','draft')
     and (p_guests is null or greatest(coalesce(s.capacity_seated, 0), coalesce(s.capacity_standing, 0)) >= p_guests
          or (s.capacity_seated is null and s.capacity_standing is null));
  if v_spaces > 0 and v_free = 0 then return 'unavailable'; end if;
  return v_base;
end $$;

-- ───────────── Organic search + ranking ─────────────
-- p: {q, kind, category, city, lat, lng, radius_km, starts_at, ends_at, guests, min_price, max_price, budget, verified,
--     instant_book, has_package, availability: 'rank'|'exclude', exclude_listings[], exclude_workspaces[], limit, offset}
-- Returns {model_version, total, results[{…, score, ranking_reasons[], availability, packages[]}], excluded_inputs}.
create or replace function public.marketplace_search(p jsonb)
returns jsonb language plpgsql stable security definer set search_path to public, pg_temp as $$
declare m public.ranking_models; w jsonb; prm jsonb;
  v_q text := lower(trim(coalesce(p->>'q', ''))); v_tq tsquery; v_kind text := nullif(p->>'kind', ''); v_cat text := lower(nullif(p->>'category', ''));
  v_city text := lower(nullif(trim(p->>'city'), '')); v_lat double precision := (p->>'lat')::double precision; v_lng double precision := (p->>'lng')::double precision;
  v_radius numeric := (p->>'radius_km')::numeric; v_start timestamptz := (p->>'starts_at')::timestamptz; v_end timestamptz := (p->>'ends_at')::timestamptz;
  v_guests integer := (p->>'guests')::integer; v_min numeric := (p->>'min_price')::numeric; v_max numeric := (p->>'max_price')::numeric;
  v_budget numeric := (p->>'budget')::numeric; v_mode text := coalesce(nullif(p->>'availability', ''), 'rank');
  v_limit integer := greatest(1, least(coalesce((p->>'limit')::integer, 20), 50)); v_offset integer := greatest(0, least(coalesce((p->>'offset')::integer, 0), 1000));
  v_ex uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p->'exclude_listings', '[]')) x), '{}');
  v_exw uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p->'exclude_workspaces', '[]')) x), '{}');
  v_res jsonb; v_total integer;
begin
  select * into m from public.ranking_models where active limit 1;
  w := m.weights; prm := m.params;
  if v_kind is not null and v_kind not in ('venue','service') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if v_mode not in ('rank','exclude') then raise exception 'invalid_availability_mode' using errcode = '22023'; end if;
  if v_end is null and v_start is not null then v_end := v_start + interval '6 hours'; end if;
  if v_start is not null and (v_end <= v_start or v_end - v_start > interval '7 days') then raise exception 'invalid_window' using errcode = '22023'; end if;
  if v_q <> '' then v_tq := public.search_query(v_q); end if;
  if v_radius is null and v_lat is not null then v_radius := (prm->>'default_radius_km')::numeric; end if;

  with base as (
    select l.*, lt.build_category, lt.service_category, d.tsv,
           (l.price_unit ~* '(guest|person|head)') per_head
      from public.listings l
      left join public.listing_taxonomy lt on lt.listing_id = l.id
      left join public.search_documents d on d.doc_id = l.id and d.doc_type in ('venue','service')
     where public.search_listing_is_public(l)
       and not exists (select 1 from public.trust_listing_holds h where h.listing_id = l.id and h.released_at is null)
       and (v_kind is null or l.kind = v_kind)
       and (v_cat is null or v_cat in (lower(coalesce(lt.build_category, '')), lower(coalesce(lt.service_category, '')), lower(coalesce(l.category, ''))))
       and (v_city is null or lower(coalesce(l.city, '')) = v_city or lower(coalesce(l.location, '')) like '%' || v_city || '%')
       and (v_lat is null or v_lng is null or (l.lat is not null and earth_distance(ll_to_earth(v_lat, v_lng), ll_to_earth(l.lat, l.lng)) <= v_radius * 1000.0))
       and (v_q = '' or (v_tq is not null and d.tsv @@ v_tq) or lower(l.name) % v_q or lower(l.name) like '%' || v_q || '%' or lower(coalesce(l.category, '')) like '%' || v_q || '%')
       and (coalesce((p->>'verified')::boolean, false) = false or l.verified)
       and (coalesce((p->>'instant_book')::boolean, false) = false or l.instant_book)
       and not (l.id = any(v_ex)) and not (l.workspace_id = any(v_exw))
       -- Capacity: a venue (or one of its spaces) must hold the guests when the capacity is stated.
       and (v_guests is null or l.kind <> 'venue' or (l.capacity_max is null and not exists (select 1 from public.spaces s where s.venue_id = l.id))
            or l.capacity_max >= v_guests
            or exists (select 1 from public.spaces s where s.venue_id = l.id and greatest(coalesce(s.capacity_seated, 0), coalesce(s.capacity_standing, 0)) >= v_guests))
  ),
  pk as (   -- packages that fit the guest count (package listings)
    select b.id listing_id, jsonb_agg(jsonb_build_object('package_id', k.id, 'name', k.name, 'price_basis', k.price_basis,
             'price_minor', round(case when k.price_basis in ('per_person','per_guest','per_head') then k.base_price * greatest(coalesce(v_guests, 1), 1) else k.base_price end * 100)::bigint,
             'min_guests', k.min_guests, 'max_guests', k.max_guests) order by k.base_price) pkgs,
           min(case when k.price_basis in ('per_person','per_guest','per_head') then k.base_price * greatest(coalesce(v_guests, 1), 1) else k.base_price end) best
      from base b join public.packages k on k.listing_id = b.id and k.status = 'published'
     where v_guests is null or ((k.min_guests is null or v_guests >= k.min_guests) and (k.max_guests is null or v_guests <= k.max_guests))
     group by b.id
  ),
  priced as (
    select b.*, pk.pkgs, least(pk.best, case when b.price_from is null then null when b.per_head then b.price_from * greatest(coalesce(v_guests, 1), 1) else b.price_from end) est,
           case when v_lat is not null and v_lng is not null and b.lat is not null then round((earth_distance(ll_to_earth(v_lat, v_lng), ll_to_earth(b.lat, b.lng)) / 1000)::numeric, 1) end dist,
           coalesce((select s.band from public.reliability_snapshots s where s.workspace_id = b.workspace_id order by s.computed_at desc limit 1), public.reliability_band(b.workspace_id)) band
      from base b left join pk on pk.listing_id = b.id
     where (coalesce((p->>'has_package')::boolean, false) = false or pk.pkgs is not null)
  ),
  filtered as (
    select x.* from (
      select pr.*, case when v_start is null then null else public.listing_window_availability(pr.id, v_start, v_end, v_guests) end avail from priced pr
       where (v_min is null or coalesce(pr.est, pr.price_from) >= v_min) and (v_max is null or coalesce(pr.est, pr.price_from) <= v_max)
    ) x where v_mode <> 'exclude' or coalesce(x.avail, 'unknown') <> 'unavailable'
  ),
  feat as (
    select f.*, jsonb_strip_nulls(jsonb_build_object(
        'text', case when v_q <> '' then jsonb_build_object('value', round(greatest(similarity(lower(f.name), v_q), least(1, coalesce(case when v_tq is not null and f.tsv is not null then ts_rank(f.tsv, v_tq) end, 0) * 5))::numeric, 4),
                 'text', 'Matches "' || left(v_q, 40) || '"') end,
        'distance', case when f.dist is not null then jsonb_build_object('value', round(greatest(0, 1 - f.dist / greatest(v_radius, 1))::numeric, 4), 'text', f.dist || ' km away')
                         when v_city is not null then jsonb_build_object('value', case when lower(coalesce(f.city, '')) = v_city then 1 else 0.6 end, 'text', 'In ' || coalesce(nullif(f.city, ''), initcap(v_city))) end,
        'availability', case when v_start is not null then jsonb_build_object('value', coalesce((prm->'availability_values'->>coalesce(f.avail, 'unknown'))::numeric, 0.5),
                 'text', case f.avail when 'available' then 'Calendar open for your date' when 'limited' then 'Limited on your date (another hold overlaps)'
                                     when 'unavailable' then 'Unavailable on your date' else 'Availability not published' end) end,
        'reliability', jsonb_build_object('value', coalesce((prm->'band_values'->>f.band)::numeric, 0.5), 'text', 'Reliability: ' || replace(f.band, '_', ' ')),
        'rating', jsonb_build_object('value', round((((prm->>'rating_prior')::numeric * (prm->>'rating_prior_weight')::numeric + coalesce(f.rating, 0) * coalesce(f.review_count, 0))
                   / ((prm->>'rating_prior_weight')::numeric + coalesce(f.review_count, 0)) - 1) / 4, 4),
                 'text', case when coalesce(f.review_count, 0) > 0 then round(f.rating, 1) || '★ from ' || f.review_count || ' review' || case when f.review_count = 1 then '' else 's' end else 'No reviews yet' end),
        'response', jsonb_build_object('value', case when f.response_hours is null then 0.5 when f.response_hours <= 2 then 1 when f.response_hours <= 4 then 0.85
                   when f.response_hours <= 24 then 0.6 when f.response_hours <= 48 then 0.4 else 0.2 end,
                 'text', case when f.response_hours is null then 'Response time not yet known' else 'Usually responds within ' || f.response_hours || 'h' end),
        'budget', case when v_budget is not null and v_budget > 0 and f.est is not null then jsonb_build_object('value', round(case when f.est <= v_budget then 1 else greatest(0, 1 - (f.est - v_budget) / v_budget) end, 4),
                 'text', case when f.est <= v_budget then 'Within your budget' else 'Above your budget' end) end)) fv
      from filtered f
  ),
  scored as (
    select ft.*, (select sum((e.value->>'value')::numeric * (w->>e.key)::numeric) from jsonb_each(ft.fv) e) num,
           (select sum((w->>e.key)::numeric) from jsonb_each(ft.fv) e) den
      from feat ft
  ),
  ranked as (
    select s.*, round(100 * s.num / nullif(s.den, 0), 2) score, count(*) over () total_n from scored s
     order by round(100 * s.num / nullif(s.den, 0), 2) desc nulls last, s.rating desc nulls last, s.name, s.id
     limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'listing_id', r.id, 'kind', r.kind, 'name', r.name, 'category', r.category, 'build_category', r.build_category, 'city', r.city, 'location', r.location,
      'image', r.image, 'slug', r.slug, 'price_from', r.price_from, 'price_unit', r.price_unit, 'estimate_minor', case when r.est is null then null else round(r.est * 100)::bigint end,
      'capacity_max', r.capacity_max, 'verified', r.verified, 'instant_book', r.instant_book, 'rating', r.rating, 'review_count', r.review_count,
      'response_hours', r.response_hours, 'distance_km', r.dist, 'availability', coalesce(r.avail, 'unknown'), 'reliability_band', r.band,
      'packages', coalesce(r.pkgs, '[]'), 'score', r.score, 'model_version', m.version,
      'ranking_reasons', (select jsonb_agg(jsonb_build_object('feature', e.key, 'value', (e.value->>'value')::numeric, 'weight', (w->>e.key)::numeric,
            'contribution', round(100 * (e.value->>'value')::numeric * (w->>e.key)::numeric / nullif(r.den, 0), 2), 'text', e.value->>'text')
            order by (e.value->>'value')::numeric * (w->>e.key)::numeric desc, e.key) from jsonb_each(r.fv) e))
      order by r.score desc nulls last, r.rating desc nulls last, r.name, r.id), '[]'), max(r.total_n)
    into v_res, v_total from ranked r;

  return jsonb_build_object('model_version', m.version, 'total', coalesce(v_total, 0), 'limit', v_limit, 'offset', v_offset, 'results', v_res,
    'excluded_inputs', prm->'excluded_inputs', 'organic_only', true,
    'filters', jsonb_strip_nulls(jsonb_build_object('q', nullif(v_q, ''), 'kind', v_kind, 'category', v_cat, 'city', v_city, 'starts_at', v_start, 'ends_at', v_end,
      'guests', v_guests, 'min_price', v_min, 'max_price', v_max, 'budget', v_budget, 'availability', v_mode)));
end $$;

-- ───────────── Matching (requirements → candidates with reasons; persisted) ─────────────
create table if not exists public.marketplace_match_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,
  model_version integer not null references public.ranking_models(version),
  requirements jsonb not null,
  results jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_match_runs_event_idx on public.marketplace_match_runs(event_id, created_at desc);
alter table public.marketplace_match_runs enable row level security;
revoke all on table public.marketplace_match_runs from public, anon, authenticated;
grant select on table public.marketplace_match_runs to authenticated;
grant all on table public.marketplace_match_runs to service_role;
drop policy if exists marketplace_match_runs_read on public.marketplace_match_runs;
create policy marketplace_match_runs_read on public.marketplace_match_runs for select to authenticated using (public.can_access_event(event_id));

-- Requirements derived from the event (date window, guests, city, category budget share) plus optional overrides; hard filters
-- exclude lines already in the build, dismissed suggestions and (by default) listings unavailable for the window.
create or replace function public.marketplace_requirements(p_event uuid, p_category text, p_overrides jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare e public.events; v_budget numeric; v_target bigint; v_share numeric;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.budget_total is not null then
    v_target := coalesce(((public.event_budget_summary(p_event))->'category_targets_minor'->>p_category)::bigint, null);
    if v_target is null then
      select c.share_pct::numeric / nullif((select sum(x.share_pct) from public.build_categories_for(e.event_type) x), 0) into v_share
        from public.build_categories_for(e.event_type) c where c.category = p_category;
      v_budget := round(e.budget_total * coalesce(v_share, 0.1), 2);
    else v_budget := v_target / 100.0; end if;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('kind', case when p_category = 'venue' then 'venue' else 'service' end, 'category', p_category,
      'city', nullif(e.city, ''), 'starts_at', e.starts_at, 'ends_at', coalesce(e.ends_at, e.starts_at + interval '6 hours'),
      'guests', nullif(greatest(coalesce(e.guest_count, 0), coalesce(e.capacity, 0)), 0), 'budget', v_budget, 'availability', 'exclude',
      'exclude_listings', coalesce((select jsonb_agg(distinct b.listing_id) from public.build_items b where b.event_id = p_event and b.listing_id is not null
            and public.build_budget_bucket(b.status) <> 'excluded'), '[]')
        || coalesce((select jsonb_agg(f.listing_id) from public.build_suggestion_feedback f where f.event_id = p_event and f.action <> 'saved'), '[]')))
    || coalesce(p_overrides, '{}');
end $$;

create or replace function public.marketplace_match(p_event uuid, p_category text, p_limit integer default 10, p_overrides jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare req jsonb; res jsonb; rid uuid;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.taxonomy_terms t where t.taxonomy = 'build_category' and t.key = p_category) then raise exception 'unknown_category' using errcode = '22023'; end if;
  req := public.marketplace_requirements(p_event, p_category, coalesce(p_overrides, '{}')) || jsonb_build_object('limit', greatest(1, least(coalesce(p_limit, 10), 50)));
  res := public.marketplace_search(req);
  insert into public.marketplace_match_runs(event_id, category, model_version, requirements, results, created_by)
    values (p_event, p_category, (res->>'model_version')::int, req,
      coalesce((select jsonb_agg(jsonb_build_object('listing_id', r->'listing_id', 'score', r->'score', 'availability', r->'availability', 'ranking_reasons', r->'ranking_reasons'))
                  from jsonb_array_elements(res->'results') r), '[]'), auth.uid())
    returning id into rid;
  return res || jsonb_build_object('match_run_id', rid, 'requirements', req);
end $$;

-- ───────────── Recommendations (non-personalised; no viewing history, no profile) ─────────────
-- mode 'event' (p_id = event): top eligible candidates per foundation/required category the build has not filled.
-- mode 'backup' (p_id = build line): alternatives for a line — same category, another provider, free on the date.
-- mode 'similar' (p_id = listing): same kind/category/city, other providers (public data only).
create or replace function public.marketplace_recommendations(p_mode text, p_id uuid, p_limit integer default 3)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare e public.events; b public.build_items; l public.listings; n integer := greatest(1, least(coalesce(p_limit, 3), 10)); v_out jsonb := '[]'; c record; r jsonb;
begin
  if p_mode = 'event' then
    select * into e from public.events where id = p_id;
    if not found or not public.can_access_event(p_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
    for c in select x.category, x.need from public.build_categories_for(e.event_type) x
              where x.need in ('foundation','required') and not exists (select 1 from public.build_items i where i.event_id = p_id and i.category = x.category and i.role = 'primary'
                    and public.build_budget_bucket(i.status) <> 'excluded') order by x.sort loop
      r := public.marketplace_search(public.marketplace_requirements(p_id, c.category, '{}') || jsonb_build_object('limit', n));
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', case when c.category = 'venue' then 'venue_suggestion' else 'supplier_suggestion' end, 'category', c.category,
        'reason', 'Your ' || replace(c.category, '_', ' ') || ' is not chosen yet', 'source', 'ranking_model_v' || (r->>'model_version'), 'results', r->'results'));
    end loop;
  elsif p_mode = 'backup' then
    select * into b from public.build_items where id = p_id;
    if not found or not public.can_access_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
    r := public.marketplace_search(public.marketplace_requirements(b.event_id, b.category, jsonb_build_object('budget', b.amount))
         || jsonb_build_object('limit', n, 'exclude_workspaces', case when b.listing_id is null then '[]'::jsonb else jsonb_build_array(public.listing_workspace(b.listing_id)) end));
    v_out := jsonb_build_array(jsonb_build_object('kind', 'backup_suggestion', 'category', b.category, 'for_build_item_id', b.id,
      'reason', 'Free on your date if ' || b.title || ' falls through', 'source', 'ranking_model_v' || (r->>'model_version'), 'results', r->'results'));
  elsif p_mode = 'similar' then
    select * into l from public.listings where id = p_id and published and paused_at is null;
    if not found then return '[]'; end if;
    r := public.marketplace_search(jsonb_strip_nulls(jsonb_build_object('kind', l.kind, 'category', coalesce((select lt.build_category from public.listing_taxonomy lt where lt.listing_id = l.id), l.category),
         'city', nullif(lower(l.city), ''), 'limit', n, 'exclude_workspaces', jsonb_build_array(l.workspace_id))));
    v_out := jsonb_build_array(jsonb_build_object('kind', 'similar_providers', 'for_listing_id', l.id, 'reason', 'Similar ' || case when l.kind = 'venue' then 'venues' else 'providers' end || ' nearby',
      'source', 'ranking_model_v' || (r->>'model_version'), 'results', r->'results'));
  else raise exception 'invalid_mode' using errcode = '22023';
  end if;
  return v_out;
end $$;

-- ───────────── Public category / location discovery (W01: /events/london-style) ─────────────
-- Service-only (reads the search index); every row is re-checked against its live public predicate like public_search.
create or replace function public.public_discover(p_city text default null, p_category text default null, p_types text[] default null,
    p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 24, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path to public, pg_temp as $$
declare v_city text := lower(replace(trim(coalesce(p_city, '')), '-', ' ')); v_cat text := lower(replace(trim(coalesce(p_category, '')), '-', '_'));
  v_lim integer := greatest(1, least(coalesce(p_limit, 24), 50)); v_res jsonb; v_total integer; v_facets jsonb;
  v_labels text[];
begin
  if p_types is not null and not (p_types <@ array['event','venue','service','organizer','provider']) then raise exception 'invalid_type' using errcode = '22023'; end if;
  -- Category keys, labels and spellings from Q02 master data (e.g. "music" → live_music / entertainment labels).
  select array_agg(distinct lower(x)) into v_labels from (
    select t.key x from public.taxonomy_terms t where v_cat <> '' and (t.key = v_cat or lower(t.label) = replace(v_cat, '_', ' ') or t.parent_key = v_cat or t.meta->>'build' = v_cat)
    union select t.label from public.taxonomy_terms t where v_cat <> '' and (t.key = v_cat or t.parent_key = v_cat or t.meta->>'build' = v_cat)
    union select replace(v_cat, '_', ' ') where v_cat <> '' union select v_cat where v_cat <> '') s;
  with docs as (
    select d.* from public.search_documents d
     where d.is_public and (p_types is null or d.doc_type = any(p_types))
       and (v_city = '' or lower(coalesce(d.city, '')) = v_city)
       and (v_cat = '' or lower(coalesce(d.category, '')) = any(v_labels) or lower(replace(coalesce(d.category, ''), ' ', '_')) = any(v_labels)
            or exists (select 1 from unnest(coalesce(d.tags, '{}')) tg where lower(tg) = any(v_labels)))
       and (p_from is null or d.doc_type <> 'event' or d.starts_at >= p_from) and (p_to is null or d.doc_type <> 'event' or d.starts_at < p_to)
       and (d.doc_type <> 'event' or d.starts_at is null or d.starts_at > now() - interval '6 hours')
       and case d.doc_type
             when 'event' then exists (select 1 from public.events e where e.id = d.doc_id and public.search_event_is_public(e))
             when 'venue' then exists (select 1 from public.listings l where l.id = d.doc_id and public.search_listing_is_public(l))
             when 'service' then exists (select 1 from public.listings l where l.id = d.doc_id and public.search_listing_is_public(l))
             when 'provider' then exists (select 1 from public.listings l where l.workspace_id = d.doc_id and public.search_listing_is_public(l))
             when 'organizer' then exists (select 1 from public.events e where e.workspace_id = d.doc_id and public.search_event_is_public(e))
             else false end),
  page as (
    select d.*, count(*) over () n from docs d
     order by case d.doc_type when 'event' then 0 when 'venue' then 1 when 'service' then 2 else 3 end, d.starts_at nulls last, d.rating desc nulls last, d.title, d.doc_id
     limit v_lim offset greatest(0, least(coalesce(p_offset, 0), 1000)))
  select coalesce(jsonb_agg(jsonb_build_object('doc_type', pg.doc_type, 'doc_id', pg.doc_id, 'title', pg.title, 'subtitle', pg.subtitle, 'link', pg.link, 'image', pg.image,
           'city', pg.city, 'category', pg.category, 'starts_at', pg.starts_at, 'price_from', pg.price_from, 'rating', pg.rating)
           order by case pg.doc_type when 'event' then 0 when 'venue' then 1 when 'service' then 2 else 3 end, pg.starts_at nulls last, pg.rating desc nulls last, pg.title, pg.doc_id), '[]'), max(pg.n)
    into v_res, v_total from page pg;
  -- Facets for the city (categories and types with counts) so a /events/<city> page can render its chips.
  select coalesce(jsonb_agg(jsonb_build_object('doc_type', f.doc_type, 'category', f.category, 'count', f.k) order by f.k desc, f.category), '[]') into v_facets from (
    select d.doc_type, coalesce(nullif(d.category, ''), 'other') category, count(*) k from public.search_documents d
     where d.is_public and (v_city = '' or lower(coalesce(d.city, '')) = v_city) and (p_types is null or d.doc_type = any(p_types))
       and (d.doc_type <> 'event' or d.starts_at is null or d.starts_at > now() - interval '6 hours')
     group by 1, 2) f;
  return jsonb_build_object('city', nullif(v_city, ''), 'category', nullif(v_cat, ''), 'total', coalesce(v_total, 0), 'results', v_res, 'facets', v_facets, 'organic_only', true);
end $$;

do $$ declare f text; begin
  foreach f in array array['public.marketplace_search(jsonb)', 'public.listing_window_availability(uuid,timestamp with time zone,timestamp with time zone,integer)',
      'public.marketplace_requirements(uuid,text,jsonb)', 'public.marketplace_match(uuid,text,integer,jsonb)', 'public.marketplace_recommendations(text,uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.public_discover(text,text,text[],timestamp with time zone,timestamp with time zone,integer,integer)', 'public.ranking_models_immutable()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
