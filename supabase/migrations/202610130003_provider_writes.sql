-- Phase 3: validated write functions for Provider wizards and profiles (venues, services, spaces, packages, venue map, Agent runs).
-- Tables stay read-only to clients; these functions authorise (owner/manager), validate and audit every write.
begin;

-- Draft-save / update a venue or service listing. Publication stays behind publish_listing() readiness checks.
create or replace function public.provider_save_listing(p_ws uuid, p_listing uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.listings; lid uuid; k text; ws public.workspaces; d jsonb;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  select * into ws from public.workspaces where id = p_ws;
  if p_listing is not null then
    select * into l from public.listings where id = p_listing and workspace_id = p_ws for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if l.review_status in ('restricted','suspended') then raise exception 'restricted_by_platform' using errcode = '42501'; end if;
    k := l.kind;
  else
    k := p->>'kind';
    if k not in ('venue','service') then raise exception 'invalid_kind' using errcode = '22023'; end if;
    if not (k = any(ws.capabilities)) then raise exception 'capability_disabled' using errcode = '22023'; end if;
  end if;
  if p ? 'name' and length(trim(coalesce(p->>'name', ''))) not between 2 and 100 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p ? 'booking_mode' and p->>'booking_mode' not in ('instant','request','enquiry') then raise exception 'invalid_booking_mode' using errcode = '22023'; end if;
  if p ? 'response_hours' and (p->>'response_hours')::int not in (2,4,8,12,24) then raise exception 'invalid_response_window' using errcode = '22023'; end if;
  if p ? 'price_from' and (p->>'price_from')::numeric < 0 then raise exception 'invalid_price' using errcode = '22023'; end if;
  if p ? 'capacity_min' and p ? 'capacity_max' and (p->>'capacity_min')::int > (p->>'capacity_max')::int then raise exception 'invalid_capacity' using errcode = '22023'; end if;
  -- Instant booking requires a published price; contradictory commercial settings are refused.
  if coalesce(p->>'booking_mode', l.booking_mode) = 'instant' and coalesce((p->>'price_from')::numeric, l.price_from) is null then raise exception 'instant_requires_price' using errcode = '22023'; end if;
  d := coalesce(l.details, '{}'::jsonb) || coalesce(p->'details', '{}'::jsonb);
  if p_listing is null then
    insert into public.listings(workspace_id, name, kind, description, location, details, category, city, image, gallery, price_from, price_unit, capacity_min, capacity_max,
        response_hours, booking_mode, instant_book, emergency_supply, tags, slug)
      values (p_ws, trim(p->>'name'), k, coalesce(p->>'description', ''), coalesce(p->>'location', ''), d, coalesce(p->>'category', ''), coalesce(p->>'city', ''),
        coalesce(p->>'image', ''), coalesce((select array_agg(x) from jsonb_array_elements_text(p->'gallery') x), '{}'), (p->>'price_from')::numeric,
        coalesce(p->>'price_unit', 'per event'), (p->>'capacity_min')::int, (p->>'capacity_max')::int, coalesce((p->>'response_hours')::int, 8),
        coalesce(p->>'booking_mode', 'request'), coalesce(p->>'booking_mode', 'request') = 'instant', coalesce((p->>'emergency_supply')::boolean, false),
        coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), '{}'),
        lower(regexp_replace(trim(p->>'name'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))
      returning id into lid;
  else
    update public.listings set
      name = coalesce(trim(p->>'name'), name), description = coalesce(p->>'description', description), location = coalesce(p->>'location', location),
      category = coalesce(p->>'category', category), city = coalesce(p->>'city', city), image = coalesce(p->>'image', image),
      gallery = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'gallery') x), gallery),
      price_from = case when p ? 'price_from' then (p->>'price_from')::numeric else price_from end, price_unit = coalesce(p->>'price_unit', price_unit),
      capacity_min = case when p ? 'capacity_min' then (p->>'capacity_min')::int else capacity_min end,
      capacity_max = case when p ? 'capacity_max' then (p->>'capacity_max')::int else capacity_max end,
      response_hours = coalesce((p->>'response_hours')::int, response_hours), booking_mode = coalesce(p->>'booking_mode', booking_mode),
      instant_book = coalesce(p->>'booking_mode', booking_mode) = 'instant', emergency_supply = coalesce((p->>'emergency_supply')::boolean, emergency_supply),
      tags = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), tags), details = d, updated_at = now()
    where id = p_listing returning id into lid;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), p_ws, case when p_listing is null then 'listing.created' else 'listing.updated' end, jsonb_build_object('listing_id', lid, 'kind', k));
  return lid;
end $$;

-- Create/update a space with capacity and exclusivity validation. Existing booking snapshots are unaffected.
create or replace function public.provider_save_space(p_ws uuid, p_venue uuid, p_space uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid; v public.listings; seated int; standing int; st text;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  select * into v from public.listings where id = p_venue and workspace_id = p_ws and kind = 'venue';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_space is not null and not exists(select 1 from public.spaces where id = p_space and venue_id = p_venue) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p ? 'name' and length(trim(coalesce(p->>'name', ''))) not between 1 and 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
  seated := (p->>'capacity_seated')::int; standing := (p->>'capacity_standing')::int;
  if coalesce(seated, 0) < 0 or coalesce(standing, 0) < 0 then raise exception 'invalid_capacity' using errcode = '22023'; end if;
  -- Layout capacities may not exceed the room's maximum safe capacity.
  if p ? 'layouts' and exists(select 1 from jsonb_each_text(p->'layouts') kv where kv.value::int > greatest(coalesce(standing, 0), coalesce(seated, 0), 0) and greatest(coalesce(standing, 0), coalesce(seated, 0)) > 0) then
    raise exception 'layout_exceeds_capacity' using errcode = '22023';
  end if;
  if (p->>'turnaround_minutes')::int < 0 or (p->>'min_hours')::numeric <= 0 then raise exception 'invalid_rules' using errcode = '22023'; end if;
  st := coalesce(p->>'status', 'draft');
  if st not in ('draft','published','paused') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if st = 'published' and (coalesce(seated, standing) is null and p_space is null) then raise exception 'capacity_required' using errcode = '22023'; end if;
  if p_space is null then
    insert into public.spaces(workspace_id, venue_id, name, status, indoor, area_sqm, capacity_standing, capacity_seated, layouts, amenities, turnaround_minutes, min_hours,
        exclusive_group, rate_hourly, image, details)
      values (p_ws, p_venue, trim(p->>'name'), st, coalesce((p->>'indoor')::boolean, true), (p->>'area_sqm')::numeric, standing, seated, coalesce(p->'layouts', '{}'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(p->'amenities') x), '{}'), coalesce((p->>'turnaround_minutes')::int, 60), coalesce((p->>'min_hours')::numeric, 2),
        nullif(p->>'exclusive_group', ''), (p->>'rate_hourly')::numeric, coalesce(p->>'image', ''), coalesce(p->'details', '{}'))
      returning id into sid;
  else
    update public.spaces set name = coalesce(trim(p->>'name'), name), status = st, indoor = coalesce((p->>'indoor')::boolean, indoor),
      area_sqm = case when p ? 'area_sqm' then (p->>'area_sqm')::numeric else area_sqm end,
      capacity_standing = case when p ? 'capacity_standing' then standing else capacity_standing end,
      capacity_seated = case when p ? 'capacity_seated' then seated else capacity_seated end,
      layouts = coalesce(p->'layouts', layouts), amenities = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'amenities') x), amenities),
      turnaround_minutes = coalesce((p->>'turnaround_minutes')::int, turnaround_minutes), min_hours = coalesce((p->>'min_hours')::numeric, min_hours),
      exclusive_group = case when p ? 'exclusive_group' then nullif(p->>'exclusive_group', '') else exclusive_group end,
      rate_hourly = case when p ? 'rate_hourly' then (p->>'rate_hourly')::numeric else rate_hourly end, image = coalesce(p->>'image', image),
      details = details || coalesce(p->'details', '{}')
    where id = p_space returning id into sid;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), p_ws, case when p_space is null then 'space.created' else 'space.updated' end, jsonb_build_object('space_id', sid, 'venue_id', p_venue));
  return sid;
end $$;

-- Create/update a package. Packages reference canonical listings/spaces; price changes never touch accepted snapshots.
create or replace function public.provider_save_package(p_ws uuid, p_package uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid; lid uuid; st text;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  lid := coalesce((p->>'listing_id')::uuid, (select listing_id from public.packages where id = p_package));
  if not exists(select 1 from public.listings where id = lid and workspace_id = p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_package is not null and not exists(select 1 from public.packages where id = p_package and workspace_id = p_ws) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p ? 'space_ids' and exists(select 1 from jsonb_array_elements_text(p->'space_ids') s where not exists(select 1 from public.spaces sp where sp.id = s::uuid and sp.workspace_id = p_ws)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p ? 'name' and length(trim(coalesce(p->>'name', ''))) not between 2 and 100 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if (p->>'base_price')::numeric < 0 or (p->>'deposit_pct')::int not between 0 and 100 then raise exception 'invalid_price' using errcode = '22023'; end if;
  if (p->>'min_guests')::int > (p->>'max_guests')::int then raise exception 'invalid_capacity' using errcode = '22023'; end if;
  st := coalesce(p->>'status', 'draft');
  if st not in ('draft','published','paused') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if st = 'published' and coalesce((p->>'base_price')::numeric, (select base_price from public.packages where id = p_package), 0) <= 0 then raise exception 'price_required' using errcode = '22023'; end if;
  if p_package is null then
    insert into public.packages(workspace_id, listing_id, name, status, description, base_price, price_basis, min_guests, max_guests, duration_hours, deposit_pct, booking_mode,
        inclusions, add_ons, space_ids, image, details)
      values (p_ws, lid, trim(p->>'name'), st, coalesce(p->>'description', ''), coalesce((p->>'base_price')::numeric, 0), coalesce(p->>'price_basis', 'fixed'),
        (p->>'min_guests')::int, (p->>'max_guests')::int, (p->>'duration_hours')::numeric, coalesce((p->>'deposit_pct')::int, 30), coalesce(p->>'booking_mode', 'request'),
        coalesce(p->'inclusions', '[]'), coalesce(p->'add_ons', '[]'), coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p->'space_ids') x), '{}'),
        coalesce(p->>'image', ''), coalesce(p->'details', '{}'))
      returning id into pid;
  else
    update public.packages set name = coalesce(trim(p->>'name'), name), status = st, description = coalesce(p->>'description', description),
      base_price = coalesce((p->>'base_price')::numeric, base_price), price_basis = coalesce(p->>'price_basis', price_basis),
      min_guests = case when p ? 'min_guests' then (p->>'min_guests')::int else min_guests end, max_guests = case when p ? 'max_guests' then (p->>'max_guests')::int else max_guests end,
      duration_hours = case when p ? 'duration_hours' then (p->>'duration_hours')::numeric else duration_hours end, deposit_pct = coalesce((p->>'deposit_pct')::int, deposit_pct),
      booking_mode = coalesce(p->>'booking_mode', booking_mode), inclusions = coalesce(p->'inclusions', inclusions), add_ons = coalesce(p->'add_ons', add_ons),
      space_ids = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p->'space_ids') x), space_ids), image = coalesce(p->>'image', image),
      details = details || coalesce(p->'details', '{}')
    where id = p_package returning id into pid;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), p_ws, case when p_package is null then 'package.created' else 'package.updated' end, jsonb_build_object('package_id', pid));
  return pid;
end $$;

-- Saves a new venue-structure version; publishing archives the previous published version (feeds Organizer map permissions).
create or replace function public.provider_save_structure(p_ws uuid, p_venue uuid, p_elements jsonb, p_publish boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  if not exists(select 1 from public.listings where id = p_venue and workspace_id = p_ws and kind = 'venue') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_elements) <> 'array' then raise exception 'invalid_elements' using errcode = '22023'; end if;
  -- Protected exits and locked elements cannot be removed from a structure that already has them.
  if p_publish and exists(select 1 from public.venue_structures s, jsonb_array_elements(s.elements) e where s.venue_id = p_venue and s.status = 'published'
      and (e->>'protected')::boolean and not exists(select 1 from jsonb_array_elements(p_elements) n where n->>'label' = e->>'label' and n->>'type' = e->>'type')) then
    raise exception 'protected_element_removed' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v from public.venue_structures where venue_id = p_venue;
  if p_publish then update public.venue_structures set status = 'archived' where venue_id = p_venue and status = 'published'; end if;
  insert into public.venue_structures(workspace_id, venue_id, version, status, elements, created_by, published_at)
    values (p_ws, p_venue, v, case when p_publish then 'published' else 'draft' end, p_elements, auth.uid(), case when p_publish then now() end);
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), p_ws, case when p_publish then 'structure.published' else 'structure.saved' end, jsonb_build_object('venue_id', p_venue, 'version', v));
  return v;
end $$;

-- Starts a durable Agent run with an explicit, permission-scoped tool list (never granted because the model asks).
create or replace function public.start_agent_run(p_ws uuid, p_surface text, p_goal text, p_tools text[], p_constraints jsonb, p_idempotency text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare rid uuid; allowed text[];
begin
  if p_surface = 'provider' then
    perform public.require_provider_role(p_ws, array['owner','manager']);
    allowed := array['opportunities','availability','quotes','holds','bookings','spaces','services','packages','team','money','reliability'];
  elsif p_surface = 'admin' then
    if not public.has_admin_permission('agent_ops') then raise exception 'not_authorized' using errcode = '42501'; end if;
    allowed := array['queues','connectors','trust','support','marketplace','reconciliation','analytics'];
    p_ws := null;
  else raise exception 'unsupported_surface' using errcode = '22023'; end if;
  if length(trim(coalesce(p_goal, ''))) < 3 then raise exception 'goal_required' using errcode = '22023'; end if;
  if exists(select 1 from unnest(coalesce(p_tools, '{}')) t where not (t = any(allowed))) then raise exception 'tool_not_permitted' using errcode = '42501'; end if;
  select id into rid from public.agent_runs where idempotency_key = p_idempotency;
  if found then return rid; end if;
  insert into public.agent_runs(workspace_id, user_id, surface, goal, scope, status, plan, idempotency_key, waiting_reason)
    values (p_ws, auth.uid(), p_surface, left(trim(p_goal), 2000), coalesce(p_tools, allowed), 'queued', '[]', p_idempotency, coalesce(p_constraints->>'note', ''))
    returning id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'agent.started', jsonb_build_object('run_id', rid, 'surface', p_surface));
  return rid;
end $$;

revoke all on function public.provider_save_listing(uuid, uuid, jsonb), public.provider_save_space(uuid, uuid, uuid, jsonb), public.provider_save_package(uuid, uuid, jsonb),
  public.provider_save_structure(uuid, uuid, jsonb, boolean), public.start_agent_run(uuid, text, text, text[], jsonb, text) from public, anon;
grant execute on function public.provider_save_listing(uuid, uuid, jsonb), public.provider_save_space(uuid, uuid, uuid, jsonb), public.provider_save_package(uuid, uuid, jsonb),
  public.provider_save_structure(uuid, uuid, jsonb, boolean), public.start_agent_run(uuid, text, text, text[], jsonb, text) to authenticated;
commit;
