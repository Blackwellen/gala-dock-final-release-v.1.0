-- Q09 follow-up (lane A, 2026-10-29): without a guest count, a per-person package showed its per-guest price as the listing
-- estimate (e.g. £65 for a £65/head package). Per-person packages now only feed the estimate when guests are known; the
-- package row says per_guest=true instead. Same contract otherwise.
-- Event recommendations also cover the optional categories the customer asked for (events.priorities), not only
-- foundation/required ones.
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
             'per_guest', k.price_basis in ('per_person','per_guest','per_head') and v_guests is null,
             'min_guests', k.min_guests, 'max_guests', k.max_guests) order by k.base_price) pkgs,
           min(case when k.price_basis in ('per_person','per_guest','per_head') then case when v_guests is null then null else k.base_price * v_guests end else k.base_price end) best
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

revoke all on function public.marketplace_search(jsonb) from public, anon;
grant execute on function public.marketplace_search(jsonb) to authenticated, service_role;

create or replace function public.marketplace_recommendations(p_mode text, p_id uuid, p_limit integer default 3)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare e public.events; b public.build_items; l public.listings; n integer := greatest(1, least(coalesce(p_limit, 3), 10)); v_out jsonb := '[]'; c record; r jsonb;
begin
  if p_mode = 'event' then
    select * into e from public.events where id = p_id;
    if not found or not public.can_access_event(p_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
    for c in select x.category, x.need from public.build_categories_for(e.event_type) x
              where (x.need in ('foundation','required') or x.category = any(coalesce(e.priorities, '{}'))) and not exists (select 1 from public.build_items i where i.event_id = p_id and i.category = x.category and i.role = 'primary'
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

revoke all on function public.marketplace_recommendations(text,uuid,integer) from public, anon;
grant execute on function public.marketplace_recommendations(text,uuid,integer) to authenticated, service_role;
