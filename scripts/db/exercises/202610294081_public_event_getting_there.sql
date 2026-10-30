-- Dry-run exercise for 202610294081 (always rolled back by migrate.mjs).
--   client-role write: Neon Nights manager (authenticated + JWT claims) saves notes + one general area + one shuttle through
--     event_getting_there_save (exercises the events update triggers as the client role)
--   staff / talent area or a talent movement cannot be made public (parking_not_public / transport_not_public)
--   anon read: only public notes, public active general/accessible/mixed areas and public shuttles, safe fields only; secrets planted in
--     access routes, vehicle labels, notes, permits and transport_private never appear
--   outsider: same payload as anon; save refused (not_authorized)
--   notes with public = false → {} (items still listed); closed area / cancelled shuttle hidden; private / draft event → null
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

do $$
declare neon uuid := '392fdf17-4e5c-4473-987c-251dc0a97228'; ws uuid; mgr uuid; outsider uuid;
  gen uuid; tal uuid; shut uuid; talmove uuid; drf uuid; priv uuid; j jsonb; t text; ok boolean;
begin
  select workspace_id into ws from public.events where id = neon;
  select m.user_id into mgr from public.workspace_members m where m.workspace_id = ws and m.role in ('owner', 'manager') order by m.role desc limit 1;
  select id into outsider from auth.users u where not exists (select 1 from public.workspace_members m where m.user_id = u.id and m.workspace_id = ws) order by created_at limit 1;
  if mgr is null or outsider is null then raise exception 'exercise: need a manager and an outsider'; end if;

  -- Fixtures inside the rolled-back transaction, each carrying a secret that must never be returned.
  insert into public.parking_areas(event_id, workspace_id, name, kind, capacity, accessible_spaces, access_route, opens_at, closes_at)
    values (neon, ws, 'EX4081 Public Car Park', 'general', 200, 12, 'EX4081 gate code 4081', now() + interval '30 days', now() + interval '30 days 8 hours') returning id into gen;
  insert into public.parking_areas(event_id, workspace_id, name, kind, capacity, accessible_spaces, access_route)
    values (neon, ws, 'EX4081 Crew Lot', 'staff', 20, 0, 'EX4081 crew route') returning id into tal;
  insert into public.parking_permits(area_id, event_id, holder_kind, holder_name, vehicle_reg, code, status, valid_from, valid_to)
    values (gen, neon, 'staff', 'EX4081 Permit Holder', 'EX81REG', 'EX4081P', 'issued', now() + interval '30 days', now() + interval '30 days 2 hours');
  insert into public.transport_movements(event_id, workspace_id, kind, passengers, from_place, to_place, pickup_point, departs_at, arrives_at, vehicle_label, notes, status)
    values (neon, ws, 'shuttle', 40, 'Stratford Station', 'Riverside Arena', 'Bus stop C', now() + interval '30 days', now() + interval '30 days 30 minutes', 'EX4081 Coach AB12CDE', 'EX4081 driver Dave 07700 900481', 'planned') returning id into shut;
  insert into public.transport_private(movement_id, event_id, passenger_names, contact_phone, notes) values (shut, neon, 'EX4081 Passenger', '+44 7700 904081', 'EX4081 private');
  insert into public.transport_movements(event_id, workspace_id, kind, passengers, from_place, to_place, departs_at, arrives_at, status)
    values (neon, ws, 'talent', 2, 'EX4081 Talent Hotel', 'Backstage', now() + interval '30 days', now() + interval '30 days 1 hour', 'planned') returning id into talmove;

  -- Client-role write as the event manager.
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.event_getting_there_save(neon, jsonb_build_object('public', true, 'transit', 'Stratford (Elizabeth line) 8 min walk', 'dropoff', 'Gate 2 lay-by',
         'accessible', 'Blue badge bays by Gate 1', 'cycle', '', 'parking_ids', jsonb_build_array(gen), 'shuttle_ids', jsonb_build_array(shut)));
  if (j->>'parking')::int <> 1 or (j->>'shuttles')::int < 1 or (j->>'notes')::int <> 3 then raise exception 'save: unexpected result %', j; end if;
  ok := false; begin perform public.event_getting_there_save(neon, jsonb_build_object('parking_ids', jsonb_build_array(tal))); exception when sqlstate '22023' then ok := sqlerrm = 'parking_not_public'; end;
  if not ok then raise exception 'save: staff area accepted as public'; end if;
  ok := false; begin perform public.event_getting_there_save(neon, jsonb_build_object('shuttle_ids', jsonb_build_array(talmove))); exception when sqlstate '22023' then ok := sqlerrm = 'transport_not_public'; end;
  if not ok then raise exception 'save: talent movement accepted as public'; end if;
  ok := false; begin perform public.event_getting_there_save(neon, jsonb_build_object('transit', repeat('x', 501))); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'save: over-long note accepted'; end if;
  reset role;
  if not (select public_page from public.parking_areas where id = gen) or (select public_page from public.parking_areas where id = tal) then raise exception 'save: flags not applied'; end if;
  if (select settings -> 'getting_there' ? 'cycle' from public.events where id = neon) then raise exception 'save: empty note stored'; end if;
  insert into _ex values ('client_write', 'manager saved notes=3 parking=1 shuttle; staff/talent refused');

  -- anon
  set local role anon;
  j := public.public_event_getting_there(neon);
  reset role;
  if j is null then raise exception 'anon: Neon returned null'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(j) k) <> array['notes','parking','shuttles'] then raise exception 'anon: top-level keys'; end if;
  if j->'notes'->>'transit' is null or j->'notes' ? 'public' or j->'notes' ? 'updated_at' then raise exception 'anon: notes wrong %', j->'notes'; end if;
  if exists (select 1 from jsonb_array_elements(j->'parking') a where a->>'name' = 'EX4081 Crew Lot' or a->>'kind' not in ('general','accessible','mixed')) then raise exception 'anon: private parking listed'; end if;
  if not exists (select 1 from jsonb_array_elements(j->'parking') a where a->>'name' = 'EX4081 Public Car Park') then raise exception 'anon: public area missing'; end if;
  if exists (select 1 from jsonb_array_elements(j->'parking') a where (select array_agg(k order by k) from jsonb_object_keys(a) k) <> array['accessible_spaces','closes_at','kind','name','opens_at']) then raise exception 'anon: parking keys'; end if;
  if exists (select 1 from jsonb_array_elements(j->'shuttles') a where (select array_agg(k order by k) from jsonb_object_keys(a) k) <> array['arrives_at','departs_at','from','pickup','to']) then raise exception 'anon: shuttle keys'; end if;
  if not exists (select 1 from jsonb_array_elements(j->'shuttles') a where a->>'pickup' = 'Bus stop C') then raise exception 'anon: public shuttle missing'; end if;
  t := j::text;
  if t ~* 'gate code|crew route|Permit Holder|EX81REG|EX4081P|Coach|AB12CDE|driver|07700|7700 904081|EX4081 Passenger|EX4081 private|Talent Hotel|Backstage|vehicle|phone|passenger|"route"|access_route|permit|cost|rate' then
    raise exception 'anon: private value or key leaked: %', left(t, 400); end if;
  insert into _ex values ('anon', 'notes + public general area + public shuttle only; no secrets');

  -- outsider
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.public_event_getting_there(neon)::text is distinct from j::text then raise exception 'outsider: payload differs from anon'; end if;
  ok := false; begin perform public.event_getting_there_save(neon, '{"public": true}'::jsonb); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'outsider: save not refused'; end if;
  reset role;
  insert into _ex values ('outsider', 'same as anon; save refused');

  -- Notes switched off, closed area, cancelled shuttle.
  update public.events set settings = jsonb_set(settings, '{getting_there,public}', 'false') where id = neon;
  update public.parking_areas set status = 'closed' where id = gen;
  update public.transport_movements set status = 'cancelled' where id = shut;
  set local role anon;
  j := public.public_event_getting_there(neon);
  reset role;
  if j->'notes' <> '{}'::jsonb then raise exception 'notes shown while not public'; end if;
  if exists (select 1 from jsonb_array_elements(j->'parking') a where a->>'name' = 'EX4081 Public Car Park') then raise exception 'closed area shown'; end if;
  if exists (select 1 from jsonb_array_elements(j->'shuttles') a where a->>'pickup' = 'Bus stop C') then raise exception 'cancelled shuttle shown'; end if;
  insert into _ex values ('hidden', 'notes off, closed area, cancelled shuttle');

  -- Private and draft events → null (borrow existing rows, as 4060 does).
  select id into priv from public.events where id <> neon and workspace_id is not null and visibility <> 'public' order by created_at limit 1;
  select id into drf from public.events where id not in (neon, coalesce(priv, neon)) and workspace_id is not null and status = 'draft' order by created_at limit 1;
  if priv is null or drf is null then raise exception 'exercise: need a private and a draft event'; end if;
  perform set_config('request.jwt.claims', '', true);   -- anon has no JWT subject
  update public.events set settings = coalesce(settings, '{}'::jsonb) || '{"getting_there": {"public": true, "transit": "EX4081 hidden"}}'::jsonb where id in (priv, drf);
  set local role anon;
  if public.public_event_getting_there(priv) is not null or public.public_event_getting_there(drf) is not null or public.public_event_getting_there(gen_random_uuid()) is not null then raise exception 'anon: private/draft/unknown returned data'; end if;
  reset role;
  insert into _ex values ('private_draft', 'null');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
