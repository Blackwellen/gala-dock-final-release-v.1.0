-- Dry-run exercise for 202610294080 (always rolled back by migrate.mjs).
--   anon on an opted-in venue (Riverside Arena) and service (Riverside DJ & Sound) → day statuses only (date + status), no private values
--   listing-wide block → that day booked; one-space block → venue limited, that space booked, another space not booked
--   service: confirmed job with per_day = 1 → booked; held job → limited; Sundays (week.sun = null) → closed
--   range: past from / far to → starts today, 120 days max
--   opt-out (false / missing), unpublished, paused, unknown id, a space of another venue → null
--   outsider (authenticated, not a member) → identical payload to anon
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

do $$
declare
  arena uuid := '327451a6-0693-47f6-bbec-a480fe805db5'; dj uuid := '7319d6b6-7d4f-41b2-b638-d2d6171ca7d1';
  ws uuid := '960fab34-54fc-40a0-85ab-cc4ea6197701'; hall uuid := '2bc82343-c905-43dc-8f6b-f341a369fd7a'; suite uuid := '745d3e04-8723-491a-8098-d379e8b84ab3';
  today date := (now() at time zone 'Europe/London')::date; d0 date; d1 date; d3 date; d4 date;
  j jsonb; j2 jsonb; t text; n int; outsider uuid; other_space uuid;
  st text;
begin
  -- Pick fixture days that are open for both listings (DJ is closed on Sundays) and currently free of anything else.
  select min(x)::date into d0 from generate_series((today + 30)::timestamp, (today + 60)::timestamp, interval '1 day') x where extract(isodow from x) between 1 and 4;
  d1 := d0 + 1; d3 := d0 + 7; d4 := d0 + 8;   -- same weekdays one week on
  update public.listings set details = details || jsonb_build_object('public_availability', true) where id in (arena, dj);
  update public.listings set details = jsonb_set(details, '{service,capacity,per_day}', '1') where id = dj;

  -- Fixtures (rolled back): a listing-wide block on d0, a Main Hall-only block on d1, DJ confirmed job d3, DJ held job d4.
  insert into public.availability_blocks(workspace_id, listing_id, kind, starts_at, ends_at, note)
    values (ws, arena, 'blocked', d0::timestamp at time zone 'Europe/London', (d0 + 1)::timestamp at time zone 'Europe/London', 'EX4080 secret block reason');
  insert into public.availability_blocks(workspace_id, space_id, kind, starts_at, ends_at, note)
    values (ws, hall, 'maintenance', d1::timestamp at time zone 'Europe/London', (d1 + 1)::timestamp at time zone 'Europe/London', 'EX4080 hall works');
  insert into public.provider_jobs(reference, workspace_id, listing_id, mode, client_name, client_email, event_name, starts_at, ends_at, status, value, currency)
    values ('EX4080-J1', ws, dj, 'service', 'EX4080 Secret Client', 'ex4080-client@example.com', 'EX4080 Secret Wedding',
            (d3 + time '18:00') at time zone 'Europe/London', (d3 + time '23:00') at time zone 'Europe/London', 'confirmed', 4080.08, 'GBP');
  insert into public.provider_jobs(reference, workspace_id, listing_id, mode, client_name, event_name, starts_at, ends_at, status, value)
    values ('EX4080-J2', ws, dj, 'service', 'EX4080 Held Client', 'EX4080 Held Party',
            (d4 + time '18:00') at time zone 'Europe/London', (d4 + time '23:00') at time zone 'Europe/London', 'held', 4080.09);

  set local role anon;
  j := public.public_listing_availability(arena, today - 30, today + 400);
  if j is null then raise exception 'anon: opted-in venue returned null'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(j) k) <> array['days','from','spaces','timezone','to'] then raise exception 'anon: unexpected top-level keys %', (select array_agg(k) from jsonb_object_keys(j) k); end if;
  if (j->>'from')::date <> today then raise exception 'range: from not clamped to today (%)', j->>'from'; end if;
  if jsonb_array_length(j->'days') <> 120 then raise exception 'range: % days returned (cap is 120)', jsonb_array_length(j->'days'); end if;
  select count(*) into n from jsonb_array_elements(j->'days') x where (select array_agg(k order by k) from jsonb_object_keys(x) k) <> array['date','status'] or x->>'status' not in ('free','limited','booked','closed');
  if n <> 0 then raise exception 'anon: % day objects carry more than date + status', n; end if;
  select count(*) into n from jsonb_array_elements(j->'days') x where (x->>'date')::date < today;
  if n <> 0 then raise exception 'range: past days returned'; end if;
  t := j::text;
  if t ~* 'EX4080|secret|client|price|value|amount|currency|reference|note|reason|starts_at|ends_at|event_name|email|booking' then raise exception 'anon: private value or key leaked: %', left(t, 300); end if;
  select x->>'status' into st from jsonb_array_elements(j->'days') x where x->>'date' = d0::text;
  if st <> 'booked' then raise exception 'listing-wide block: % is % (want booked)', d0, st; end if;
  select x->>'status' into st from jsonb_array_elements(j->'days') x where x->>'date' = d1::text;
  if st <> 'limited' then raise exception 'one-space block: venue % is % (want limited)', d1, st; end if;
  if jsonb_array_length(j->'spaces') < 2 or exists (select 1 from jsonb_array_elements(j->'spaces') s where (select array_agg(k order by k) from jsonb_object_keys(s) k) <> array['id','name']) then raise exception 'spaces: wrong shape'; end if;
  j2 := public.public_listing_availability(arena, d1, d1, hall);
  if j2->'days'->0->>'status' <> 'booked' then raise exception 'space filter: hall % is % (want booked)', d1, j2->'days'->0->>'status'; end if;
  if j2->'spaces' <> '[]'::jsonb then raise exception 'space filter: spaces list should be empty'; end if;
  j2 := public.public_listing_availability(arena, d1, d1, suite);
  if j2->'days'->0->>'status' = 'booked' then raise exception 'space filter: suite booked by the hall block'; end if;
  j2 := public.public_listing_availability(arena, d0, d0, suite);
  if j2->'days'->0->>'status' <> 'booked' then raise exception 'space filter: listing-wide block not applied to suite'; end if;

  j2 := public.public_listing_availability(dj, today, today + 119);
  if j2 is null then raise exception 'anon: opted-in service returned null'; end if;
  select x->>'status' into st from jsonb_array_elements(j2->'days') x where x->>'date' = d3::text;
  if st <> 'booked' then raise exception 'service: confirmed job day % is % (want booked)', d3, st; end if;
  select x->>'status' into st from jsonb_array_elements(j2->'days') x where x->>'date' = d4::text;
  if st <> 'limited' then raise exception 'service: held job day % is % (want limited)', d4, st; end if;
  select count(*) into n from jsonb_array_elements(j2->'days') x where extract(isodow from (x->>'date')::date) = 7 and x->>'status' <> 'closed';
  if n <> 0 then raise exception 'service: % Sundays not closed', n; end if;
  if j2::text ~* 'EX4080|client|4080\.0|wedding|party' then raise exception 'service: private value leaked'; end if;
  if public.public_listing_availability(dj, today, today + 5, hall) is not null then raise exception 'service with a space id returned data'; end if;
  if public.public_listing_availability(gen_random_uuid(), today, today + 5) is not null then raise exception 'unknown listing returned data'; end if;
  if public.public_listing_availability(arena, null, today) is not null then raise exception 'null range returned data'; end if;
  reset role;
  insert into _ex values ('anon_venue', 'days=120 from=today keys=date,status no_private'), ('block_booked', d0::text), ('space_block', 'venue limited, hall booked, suite not'),
                         ('service', 'confirmed=booked held=limited sundays=closed');

  -- Space of a different venue.
  select s.id into other_space from public.spaces s where s.venue_id <> arena and s.status = 'published' limit 1;
  if other_space is not null then
    set local role anon;
    if public.public_listing_availability(arena, today, today + 5, other_space) is not null then raise exception 'foreign space returned data'; end if;
    reset role;
  end if;

  -- Outsider: same payload as anon.
  select id into outsider from auth.users u where not exists (select 1 from public.workspace_members m where m.user_id = u.id and m.workspace_id = ws) order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.public_listing_availability(arena, today - 30, today + 400)::text is distinct from j::text then raise exception 'outsider: payload differs from anon'; end if;
  reset role;
  insert into _ex values ('outsider', 'same as anon');

  -- Opt-out, missing flag, unpublished, paused → null.
  update public.listings set details = details || '{"public_availability": false}'::jsonb where id = arena;
  set local role anon; if public.public_listing_availability(arena, today, today + 10) is not null then raise exception 'opted-out venue returned data'; end if; reset role;
  update public.listings set details = details - 'public_availability' where id = arena;
  set local role anon; if public.public_listing_availability(arena, today, today + 10) is not null then raise exception 'default (no flag) returned data'; end if; reset role;
  update public.listings set paused_at = now() where id = dj;
  set local role anon; if public.public_listing_availability(dj, today, today + 10) is not null then raise exception 'paused listing returned data'; end if; reset role;
  update public.listings set paused_at = null, published = false where id = dj;
  set local role anon; if public.public_listing_availability(dj, today, today + 10) is not null then raise exception 'unpublished listing returned data'; end if; reset role;
  insert into _ex values ('null_cases', 'opt-out, default, paused, unpublished, unknown, foreign space');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
