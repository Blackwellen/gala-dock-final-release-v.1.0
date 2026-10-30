-- Q19 Venue / Event Map Engine (lane A, 2026-10-29; backend domains 85–91). Additive and backward compatible.
-- Reuses the existing model: venue_structures (venue-owned structural map, versioned, one published) and venue_maps
-- (event overlay, versioned, organizer-owned; overlay = plan-v2 elements). Adds:
--   * map_asset_palettes (event + structural palettes; capacity / egress-blocking / safety flags) and map_rule_packs
--     (data-driven, versioned safety rules: density, exit clearance, aisle width, exits by capacity, exit width per person,
--     accessible allocation) — UK default seeded;
--   * structure metadata: rule pack, calibration (scale units per metre, rotation, origin, underlay ref), capacity_max,
--     based_on_version; overlay metadata: based_on_version, structure_version, validation, validated_at;
--   * server-side venue locks: an overlay may not redefine/move/hide locked, protected or critical structural elements;
--   * validation engine (capacity per venue/room, standing density, exits + egress width, exit clearance, accessible and
--     emergency routes, aisle widths, overlaps, accessible allocation, ticket-tier and Q18 access-zone bindings);
--   * publish refuses on critical findings; event_map_blockers(event) for Q14's event_lifecycle_blockers to call;
--   * optimistic versions for both sessions (stale_version instead of a silent overwrite), restore and compare;
--   * read-only Gala Agent tools map.validate / map.bindings (R0, no runs started here).
-- Geometry is axis-aligned bounding boxes (rotation ignored) — conservative for clearance checks.

-- ═══ 1. Palettes and rule packs ═══
create table if not exists public.map_asset_palettes (
  key text primary key check (key ~ '^[a-z_:0-9]+$'),
  label text not null,
  category text not null,
  kind text not null check (kind in ('seating','table','area','point','line')),
  mode text not null default 'both' check (mode in ('venue','event','both')),
  has_capacity boolean not null default false,
  blocks_egress boolean not null default false,
  safety boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true
);
insert into public.map_asset_palettes(key, label, category, kind, mode, has_capacity, blocks_egress, safety, sort) values
  ('seat_block', 'Seating block', 'Seating & tables', 'seating', 'both', false, true, false, 1),
  ('tiered_stand', 'Tiered stand', 'Seating & tables', 'seating', 'both', false, true, false, 2),
  ('round_table', 'Round table', 'Seating & tables', 'table', 'both', false, true, false, 3),
  ('banquet_table', 'Banquet table', 'Seating & tables', 'table', 'both', false, true, false, 4),
  ('cocktail_table', 'Cocktail table', 'Seating & tables', 'table', 'both', false, true, false, 5),
  ('vip_booth', 'VIP booth', 'Seating & tables', 'table', 'both', false, true, false, 6),
  ('lounge', 'Lounge seating', 'Seating & tables', 'area', 'both', true, false, false, 7),
  ('accessible_seating', 'Accessible seating', 'Seating & tables', 'area', 'both', true, false, true, 8),
  ('stage', 'Stage', 'Stages & production', 'area', 'both', false, true, false, 9),
  ('catwalk', 'Catwalk', 'Stages & production', 'area', 'both', false, true, false, 10),
  ('dj_booth', 'DJ booth', 'Stages & production', 'area', 'both', false, true, false, 11),
  ('foh', 'Sound desk (FOH)', 'Stages & production', 'area', 'both', false, true, false, 12),
  ('screen', 'Screen / LED wall', 'Stages & production', 'area', 'both', false, true, false, 13),
  ('camera', 'Camera platform', 'Stages & production', 'point', 'both', false, false, false, 14),
  ('lighting_tower', 'Lighting tower', 'Stages & production', 'point', 'both', false, false, false, 15),
  ('backstage', 'Backstage', 'Stages & production', 'area', 'both', false, true, false, 16),
  ('green_room', 'Green room', 'Stages & production', 'area', 'both', false, true, false, 17),
  ('bar', 'Bar', 'Food & drink', 'area', 'both', false, true, false, 18),
  ('food_stall', 'Food stall', 'Food & drink', 'area', 'both', false, true, false, 19),
  ('food_truck', 'Food truck', 'Food & drink', 'area', 'both', false, true, false, 20),
  ('coffee', 'Coffee point', 'Food & drink', 'point', 'both', false, false, false, 21),
  ('catering', 'Catering / kitchen', 'Food & drink', 'area', 'both', false, true, false, 22),
  ('water_point', 'Water refill', 'Food & drink', 'point', 'both', false, false, false, 23),
  ('standing_area', 'Standing area', 'Zones & areas', 'area', 'both', true, false, false, 24),
  ('vip_area', 'VIP area', 'Zones & areas', 'area', 'both', true, false, false, 25),
  ('dance_floor', 'Dance floor', 'Zones & areas', 'area', 'both', true, false, false, 26),
  ('smoking_area', 'Smoking area', 'Zones & areas', 'area', 'both', false, false, false, 27),
  ('accessible_viewing', 'Accessible viewing', 'Zones & areas', 'area', 'both', true, false, true, 28),
  ('family_area', 'Family area', 'Zones & areas', 'area', 'both', false, false, false, 29),
  ('quiet_room', 'Quiet / sensory room', 'Zones & areas', 'area', 'both', false, false, false, 30),
  ('merch', 'Merch stand', 'Zones & areas', 'area', 'both', false, true, false, 31),
  ('market_stall', 'Market stall', 'Zones & areas', 'area', 'both', false, true, false, 32),
  ('sponsor', 'Sponsor activation', 'Zones & areas', 'area', 'both', false, true, false, 33),
  ('box_office', 'Box office', 'Zones & areas', 'area', 'both', false, true, false, 34),
  ('cloakroom', 'Cloakroom', 'Zones & areas', 'area', 'both', false, true, false, 35),
  ('info_point', 'Info point', 'Zones & areas', 'point', 'both', false, false, false, 36),
  ('toilets', 'Toilets', 'Facilities', 'area', 'both', false, true, false, 37),
  ('accessible_toilet', 'Accessible toilet', 'Facilities', 'point', 'both', false, false, true, 38),
  ('showers', 'Showers', 'Facilities', 'area', 'both', false, true, false, 39),
  ('baby_change', 'Baby change', 'Facilities', 'point', 'both', false, false, false, 40),
  ('first_aid', 'First aid', 'Facilities', 'area', 'both', false, true, true, 41),
  ('lost_property', 'Lost property', 'Facilities', 'point', 'both', false, false, false, 42),
  ('charging', 'Charging station', 'Facilities', 'point', 'both', false, false, false, 43),
  ('atm', 'Cash machine', 'Facilities', 'point', 'both', false, false, false, 44),
  ('lockers', 'Lockers', 'Facilities', 'area', 'both', false, true, false, 45),
  ('entrance', 'Entrance', 'Safety & access', 'area', 'both', false, false, true, 46),
  ('exit', 'Exit', 'Safety & access', 'area', 'both', false, false, true, 47),
  ('fire_exit', 'Fire exit', 'Safety & access', 'area', 'both', false, false, true, 48),
  ('security', 'Security check', 'Safety & access', 'area', 'both', false, true, true, 49),
  ('gate', 'Gate', 'Safety & access', 'point', 'both', false, false, true, 50),
  ('assembly_point', 'Assembly point', 'Safety & access', 'point', 'both', false, false, true, 51),
  ('extinguisher', 'Fire extinguisher', 'Safety & access', 'point', 'both', false, false, true, 52),
  ('cctv', 'CCTV', 'Safety & access', 'point', 'both', false, false, true, 53),
  ('control_room', 'Event control', 'Safety & access', 'area', 'both', false, true, true, 54),
  ('car_park', 'Car park', 'Transport & parking', 'area', 'both', true, false, false, 55),
  ('accessible_parking', 'Accessible parking', 'Transport & parking', 'area', 'both', true, false, true, 56),
  ('bus_stop', 'Bus stop', 'Transport & parking', 'point', 'both', false, false, false, 57),
  ('coach_drop', 'Coach drop-off', 'Transport & parking', 'area', 'both', false, false, false, 58),
  ('taxi_rank', 'Taxi rank', 'Transport & parking', 'area', 'both', false, false, false, 59),
  ('rideshare', 'Rideshare pick-up', 'Transport & parking', 'point', 'both', false, false, false, 60),
  ('train', 'Train station', 'Transport & parking', 'point', 'both', false, false, false, 61),
  ('shuttle', 'Shuttle stop', 'Transport & parking', 'point', 'both', false, false, false, 62),
  ('bike_rack', 'Bike rack', 'Transport & parking', 'area', 'both', false, false, false, 63),
  ('grass', 'Grass / lawn', 'Landscape & outdoor', 'area', 'both', false, false, false, 64),
  ('park', 'Park', 'Landscape & outdoor', 'area', 'both', false, false, false, 65),
  ('tree', 'Tree', 'Landscape & outdoor', 'point', 'both', false, false, false, 66),
  ('water', 'Water', 'Landscape & outdoor', 'area', 'both', false, false, false, 67),
  ('marquee', 'Marquee / tent', 'Landscape & outdoor', 'area', 'both', false, true, false, 68),
  ('camping', 'Camping area', 'Landscape & outdoor', 'area', 'both', true, false, false, 69),
  ('square', 'Plaza / hard standing', 'Landscape & outdoor', 'area', 'both', false, false, false, 70),
  ('walk_route', 'Walking route', 'Routes & barriers', 'line', 'both', false, false, false, 71),
  ('step_free', 'Step-free route', 'Routes & barriers', 'line', 'both', false, false, true, 72),
  ('emergency_route', 'Emergency route', 'Routes & barriers', 'line', 'both', false, false, true, 73),
  ('vehicle_route', 'Vehicle route', 'Routes & barriers', 'line', 'both', false, false, false, 74),
  ('queue_lane', 'Queue lane', 'Routes & barriers', 'line', 'both', false, false, false, 75),
  ('fence', 'Fence / barrier', 'Routes & barriers', 'line', 'both', false, true, false, 76),
  ('trail', 'Trail / path', 'Routes & barriers', 'line', 'both', false, false, false, 77),
  ('struct:room', 'Room / space', 'Structure', 'area', 'venue', false, false, false, 1000),
  ('struct:stage', 'Fixed stage', 'Structure', 'area', 'venue', false, true, false, 1001),
  ('struct:bar', 'Fixed bar', 'Structure', 'area', 'venue', false, true, false, 1002),
  ('struct:exit', 'Fire exit', 'Structure', 'area', 'venue', false, false, true, 1003),
  ('struct:entrance', 'Entrance', 'Structure', 'area', 'venue', false, false, true, 1004),
  ('struct:toilets', 'Toilets', 'Structure', 'area', 'venue', false, true, false, 1005),
  ('struct:loading', 'Loading bay', 'Structure', 'area', 'venue', false, false, false, 1006),
  ('struct:accessible_route', 'Step-free route', 'Structure', 'line', 'venue', false, false, true, 1007),
  ('struct:water', 'Water edge', 'Structure', 'area', 'venue', false, false, true, 1008),
  ('struct:wall', 'Wall', 'Structure', 'line', 'venue', false, true, false, 1009)
on conflict (key) do update set label = excluded.label, category = excluded.category, kind = excluded.kind, mode = excluded.mode, has_capacity = excluded.has_capacity,
  blocks_egress = excluded.blocks_egress, safety = excluded.safety, sort = excluded.sort, active = true;

create table if not exists public.map_rule_packs (
  key text not null check (key ~ '^[a-z_0-9]+$'),
  version integer not null check (version >= 1),
  label text not null,
  jurisdiction text not null default 'GB',
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (key, version)
);
insert into public.map_rule_packs(key, version, label, jurisdiction, rules) values
  ('uk_default', 1, 'UK events — default safety pack', 'GB', jsonb_build_object(
    'standing_density_per_m2', 2.0,          -- max persons per m² in a standing area
    'exit_clearance_m', 1.0,                 -- clear zone kept around every exit
    'min_aisle_m', 1.1,                      -- minimum gap between adjacent physical assets
    'exit_width_mm_per_person', 5,           -- total exit width needed per person
    'min_exits', jsonb_build_array(jsonb_build_array(60, 1), jsonb_build_array(600, 2), jsonb_build_array(1000000000, 3)),
    'accessible_pct', 0.02,                  -- accessible / companion allocation as a share of capacity
    'critical', jsonb_build_array('venue_lock','capacity_exceeded','room_capacity_exceeded','room_seated_exceeded','density_exceeded',
      'insufficient_exits','exit_width_insufficient','exit_blocked','route_blocked','invalid_tier','tier_over_capacity','invalid_zone','zone_over_capacity')))
on conflict (key, version) do nothing;

create or replace function public.map_rule_packs_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.rules is distinct from old.rules or new.key <> old.key or new.version <> old.version then
    raise exception 'map_rule_pack_immutable' using errcode = '42501', hint = 'Publish a new version instead.';
  end if;
  return new;
end $$;
drop trigger if exists map_rule_packs_immutable on public.map_rule_packs;
create trigger map_rule_packs_immutable before update or delete on public.map_rule_packs for each row execute function public.map_rule_packs_immutable();

alter table public.map_asset_palettes enable row level security;
alter table public.map_rule_packs enable row level security;
drop policy if exists map_asset_palettes_read on public.map_asset_palettes;
create policy map_asset_palettes_read on public.map_asset_palettes for select using (true);
drop policy if exists map_rule_packs_read on public.map_rule_packs;
create policy map_rule_packs_read on public.map_rule_packs for select using (true);

-- ═══ 2. Structure + overlay metadata ═══
alter table public.venue_structures add column if not exists rule_pack text not null default 'uk_default';
alter table public.venue_structures add column if not exists calibration jsonb not null default '{}';
alter table public.venue_structures add column if not exists capacity_max integer;
alter table public.venue_structures add column if not exists based_on_version integer;
do $$ begin
  alter table public.venue_structures add constraint venue_structures_capacity_check check (capacity_max is null or capacity_max between 1 and 1000000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.venue_structures add constraint venue_structures_calibration_check check (jsonb_typeof(calibration) = 'object');
exception when duplicate_object then null; end $$;
alter table public.venue_maps add column if not exists based_on_version integer;
alter table public.venue_maps add column if not exists structure_version integer;
alter table public.venue_maps add column if not exists validation jsonb;
alter table public.venue_maps add column if not exists validated_at timestamptz;

-- Event overlays are written only through the map commands (venue locks and publish validation are enforced there).
create or replace function public.venue_maps_client_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'map_write_requires_command' using errcode = '42501', hint = 'Use event_map_save / organizer_save_event_plan.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists venue_maps_client_guard on public.venue_maps;
create trigger venue_maps_client_guard before insert or update or delete on public.venue_maps for each row execute function public.venue_maps_client_guard();

-- ═══ 3. Geometry helpers ═══
create or replace function public.map_bbox(e jsonb) returns numeric[] language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(e->'points') = 'array' and jsonb_array_length(e->'points') > 0 then
      (select array[min((p->>0)::numeric), min((p->>1)::numeric), max((p->>0)::numeric), max((p->>1)::numeric)] from jsonb_array_elements(e->'points') p)
    when jsonb_typeof(e->'x') = 'number' and jsonb_typeof(e->'y') = 'number' then
      array[(e->>'x')::numeric, (e->>'y')::numeric, (e->>'x')::numeric + greatest(coalesce((e->>'w')::numeric, 0), 0), (e->>'y')::numeric + greatest(coalesce((e->>'h')::numeric, 0), 0)]
  end
$$;
-- Seat count of a seating block / table (exact inventory comes from the saved seats when available).
create or replace function public.map_el_seats(e jsonb) returns integer language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(e->'seating') = 'object' and jsonb_typeof(e->'seating'->'rows') = 'number' and jsonb_typeof(e->'seating'->'cols') = 'number' then
      greatest((e->'seating'->>'rows')::int * (e->'seating'->>'cols')::int
        - coalesce((select count(*)::int from jsonb_each_text(case when jsonb_typeof(e->'seatFlags') = 'object' then e->'seatFlags' else '{}' end) f where f.value = 'blocked'), 0), 0)
    when jsonb_typeof(e->'table') = 'object' and jsonb_typeof(e->'table'->'seats') = 'number' then greatest((e->'table'->>'seats')::int, 0)
    else 0 end
$$;
create or replace function public.map_boxes_touch(a numeric[], b numeric[], pad numeric default 0) returns boolean language sql immutable set search_path = '' as $$
  select a is not null and b is not null and a[1] - pad < b[3] and b[1] < a[3] + pad and a[2] - pad < b[4] and b[2] < a[4] + pad
$$;

-- The event's venue: explicit venue listing, else the confirmed venue booking line.
create or replace function public.event_map_venue(p_event uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce((select e.venue_listing_id from public.events e where e.id = p_event),
    (select b.listing_id from public.build_items b where b.event_id = p_event and b.category = 'venue' and b.status in ('confirmed','fulfilled','completed') and b.listing_id is not null
      order by b.created_at limit 1))
$$;

-- ═══ 4. Venue locks ═══
-- Overlay elements that try to redefine a structural element: same id as a locked/protected/critical element of the
-- venue's published structure (an overlay copy with moved coordinates, hidden flag or new label would override it).
create or replace function public.event_map_lock_violations(p_event uuid, p_overlay jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(distinct o->>'id'), '[]')
    from public.venue_structures s, jsonb_array_elements(s.elements) se, jsonb_array_elements(case when jsonb_typeof(p_overlay) = 'array' then p_overlay else '[]' end) o
   where s.venue_id = public.event_map_venue(p_event) and s.status = 'published'
     and coalesce(se->>'id', '') <> '' and o->>'id' = se->>'id'
     and (coalesce((se->>'locked')::boolean, false) or coalesce((se->>'protected')::boolean, false)
          or se->>'type' in ('exit','entrance','accessible_route','room','wall','water'))
$$;

-- ═══ 5. Validation engine ═══
-- p_seats: the exact seat inventory being published ([{key, tier, accessible, blocked}]); null = derive from the overlay.
create or replace function public.map_validate_core(p_event uuid, p_overlay jsonb, p_seats jsonb default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  venue uuid; st public.venue_structures; rp public.map_rule_packs; r jsonb; upm numeric; ov jsonb; sv jsonb; f jsonb := '[]';
  seats integer; area_cap integer; total integer; venue_cap integer; acc integer; n_exits integer; need_exits integer; exit_mm numeric; crit text[];
  clear numeric; aisle numeric; dens numeric; x record;
begin
  venue := public.event_map_venue(p_event);
  select * into st from public.venue_structures where venue_id = venue and status = 'published';
  select * into rp from public.map_rule_packs where key = coalesce(st.rule_pack, 'uk_default') and active order by version desc limit 1;
  r := coalesce(rp.rules, '{}');
  crit := array(select jsonb_array_elements_text(coalesce(r->'critical', '[]')));
  upm := coalesce(nullif(st.calibration->>'units_per_m', '')::numeric, 10);
  clear := coalesce((r->>'exit_clearance_m')::numeric, 1) * upm;
  aisle := coalesce((r->>'min_aisle_m')::numeric, 1.1) * upm;
  dens := coalesce((r->>'standing_density_per_m2')::numeric, 2);

  -- Normalised overlay (drawn, visible elements only).
  select coalesce(jsonb_agg(jsonb_build_object('id', coalesce(o->>'id', 'el' || i), 'label', coalesce(o->>'label', ''), 'asset', o->>'asset', 'type', o->>'type',
      'bb', to_jsonb(public.map_bbox(o)), 'seats', public.map_el_seats(o),
      'cap', case when coalesce(p.has_capacity, false) and jsonb_typeof(o->'capacity') = 'number' then (o->>'capacity')::int else 0 end,
      'tier', nullif(o->>'tier', ''), 'zone', nullif(o->>'zone', ''), 'physical', coalesce(p.blocks_egress, false),
      'exit', coalesce(o->>'asset', '') in ('exit','fire_exit'), 'route', coalesce(o->>'asset', '') in ('step_free','emergency_route'),
      'accessible_cap', case when coalesce(o->>'asset', '') in ('accessible_seating','accessible_viewing') and jsonb_typeof(o->'capacity') = 'number' then (o->>'capacity')::int else 0 end,
      'accessible_seats', coalesce((select count(*)::int from jsonb_each_text(case when jsonb_typeof(o->'seatFlags') = 'object' then o->'seatFlags' else '{}' end) fl
                                    where fl.value in ('accessible','companion')), 0))), '[]')
    into ov
    from jsonb_array_elements(case when jsonb_typeof(p_overlay) = 'array' then p_overlay else '[]' end) with ordinality t(o, i)
    left join public.map_asset_palettes p on p.key = o->>'asset'
   where not coalesce((o->>'hidden')::boolean, false)
     and coalesce(o->>'type', '') not in ('layer','basemap','underlay','label','text','glyph','shape','curve','widget');
  select coalesce(jsonb_agg(jsonb_build_object('id', se->>'id', 'type', se->>'type', 'label', coalesce(se->>'label', ''), 'bb', to_jsonb(public.map_bbox(se)),
      'space', nullif(se->>'space', ''), 'capacity', case when jsonb_typeof(se->'capacity') = 'number' then (se->>'capacity')::int end)), '[]')
    into sv from jsonb_array_elements(coalesce(st.elements, '[]')) se where not coalesce((se->>'hidden')::boolean, false);

  -- Locks.
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'venue_lock', 'element_id', x2, 'text', 'This element is fixed by the venue and can’t be moved, hidden or replaced.'))
         from jsonb_array_elements_text(public.event_map_lock_violations(p_event, p_overlay)) x2), '[]');

  -- Capacity.
  seats := case when p_seats is not null and jsonb_typeof(p_seats) = 'array'
                then (select count(*)::int from jsonb_array_elements(p_seats) s where not coalesce((s->>'blocked')::boolean, false))
                else (select coalesce(sum((o->>'seats')::int), 0) from jsonb_array_elements(ov) o) end;
  area_cap := (select coalesce(sum((o->>'cap')::int), 0) from jsonb_array_elements(ov) o);
  total := seats + area_cap;
  venue_cap := coalesce(st.capacity_max, (select l.capacity_max from public.listings l where l.id = venue),
    (select nullif(sum(greatest(coalesce(sp.capacity_standing, 0), coalesce(sp.capacity_seated, 0))), 0)::int from public.spaces sp where sp.venue_id = venue));
  if venue_cap is not null and total > venue_cap then
    f := f || jsonb_build_array(jsonb_build_object('code', 'capacity_exceeded', 'total', total, 'max', venue_cap,
      'text', 'The layout holds ' || total || ' people; the venue''s licensed capacity is ' || venue_cap || '.'));
  end if;
  -- Per room (multi-room venues): overlay elements whose centre lies in a structural room count against its space.
  for x in
    select rm->>'id' rid, rm->>'label' rlabel, sp.name sname, sp.capacity_standing cs, sp.capacity_seated cse, (rm->>'capacity')::int rcap,
           coalesce(sum((o->>'seats')::int + (o->>'cap')::int), 0) n, coalesce(sum((o->>'seats')::int), 0) n_seated
      from jsonb_array_elements(sv) rm
      left join public.spaces sp on sp.id = case when rm->>'space' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (rm->>'space')::uuid end and sp.venue_id = venue
      join jsonb_array_elements(ov) o on jsonb_typeof(o->'bb') = 'array' and jsonb_typeof(rm->'bb') = 'array'
        and ((o->'bb'->>0)::numeric + (o->'bb'->>2)::numeric) / 2 between (rm->'bb'->>0)::numeric and (rm->'bb'->>2)::numeric
        and ((o->'bb'->>1)::numeric + (o->'bb'->>3)::numeric) / 2 between (rm->'bb'->>1)::numeric and (rm->'bb'->>3)::numeric
     where rm->>'type' = 'room'
     group by 1, 2, 3, 4, 5, 6
  loop
    if coalesce(greatest(x.cs, x.cse), x.rcap) is not null and x.n > coalesce(greatest(coalesce(x.cs, 0), coalesce(x.cse, 0)), x.rcap) then
      f := f || jsonb_build_array(jsonb_build_object('code', 'room_capacity_exceeded', 'element_id', x.rid, 'total', x.n,
        'max', coalesce(greatest(coalesce(x.cs, 0), coalesce(x.cse, 0)), x.rcap), 'text', coalesce(x.sname, x.rlabel) || ' would hold ' || x.n || ' people; its capacity is '
        || coalesce(greatest(coalesce(x.cs, 0), coalesce(x.cse, 0)), x.rcap) || '.'));
    end if;
    if x.cse is not null and x.n_seated > x.cse then
      f := f || jsonb_build_array(jsonb_build_object('code', 'room_seated_exceeded', 'element_id', x.rid, 'total', x.n_seated, 'max', x.cse,
        'text', coalesce(x.sname, x.rlabel) || ' has ' || x.n_seated || ' seats; its seated capacity is ' || x.cse || '.'));
    end if;
  end loop;
  -- Standing density.
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'density_exceeded', 'element_id', o->>'id', 'per_m2', round((o->>'cap')::numeric / a.m2, 2), 'max', dens,
            'text', (o->>'label') || ': ' || (o->>'cap') || ' people in ' || round(a.m2, 1) || ' m² exceeds ' || dens || ' per m².'))
          from jsonb_array_elements(ov) o
          cross join lateral (select (((o->'bb'->>2)::numeric - (o->'bb'->>0)::numeric) * ((o->'bb'->>3)::numeric - (o->'bb'->>1)::numeric)) / (upm * upm) m2) a
         where (o->>'cap')::int > 0 and jsonb_typeof(o->'bb') = 'array' and a.m2 > 0 and (o->>'cap')::numeric / a.m2 > dens), '[]');
  -- Exits: number by capacity band and total width per person.
  select count(*)::int, coalesce(sum(greatest((e->'bb'->>2)::numeric - (e->'bb'->>0)::numeric, (e->'bb'->>3)::numeric - (e->'bb'->>1)::numeric) / upm * 1000), 0)
    into n_exits, exit_mm
    from (select s2 e from jsonb_array_elements(sv) s2 where s2->>'type' = 'exit' union all select o2 from jsonb_array_elements(ov) o2 where (o2->>'exit')::boolean) q
   where jsonb_typeof(e->'bb') = 'array';
  select coalesce(min((b->>1)::int), 1) into need_exits from jsonb_array_elements(coalesce(r->'min_exits', '[]')) b where total <= (b->>0)::int;
  if total > 0 and (n_exits > 0 or st.id is not null) and n_exits < need_exits then
    f := f || jsonb_build_array(jsonb_build_object('code', 'insufficient_exits', 'exits', n_exits, 'required', need_exits,
      'text', total || ' people need at least ' || need_exits || ' exits; the plan has ' || n_exits || '.'));
  end if;
  if total > 0 and n_exits > 0 and exit_mm > 0 and exit_mm < total * coalesce((r->>'exit_width_mm_per_person')::numeric, 5) then
    f := f || jsonb_build_array(jsonb_build_object('code', 'exit_width_insufficient', 'width_mm', round(exit_mm), 'required_mm', round(total * coalesce((r->>'exit_width_mm_per_person')::numeric, 5)),
      'text', 'Total exit width ' || round(exit_mm) || ' mm is below the ' || round(total * coalesce((r->>'exit_width_mm_per_person')::numeric, 5)) || ' mm needed for ' || total || ' people.'));
  end if;
  -- Exit clearance and protected routes: no physical asset inside an exit's clear zone or across an accessible/emergency route.
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'exit_blocked', 'element_id', o->>'id', 'exit_id', ex->>'id',
            'text', (o->>'label') || ' blocks the exit ' || coalesce(nullif(ex->>'label', ''), 'exit') || ' (keep ' || coalesce(r->>'exit_clearance_m', '1') || ' m clear).'))
          from jsonb_array_elements(ov) o,
               (select s2 ex from jsonb_array_elements(sv) s2 where s2->>'type' = 'exit' union all select o2 from jsonb_array_elements(ov) o2 where (o2->>'exit')::boolean) xs
         where (o->>'physical')::boolean and o->>'id' is distinct from ex->>'id'
           and public.map_boxes_touch(array(select jsonb_array_elements_text(o->'bb'))::numeric[], array(select jsonb_array_elements_text(ex->'bb'))::numeric[], clear)), '[]');
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'route_blocked', 'element_id', o->>'id', 'route_id', rt->>'id',
            'text', (o->>'label') || ' blocks the ' || coalesce(nullif(rt->>'label', ''), 'protected route') || '.'))
          from jsonb_array_elements(ov) o,
               (select s2 rt from jsonb_array_elements(sv) s2 where s2->>'type' = 'accessible_route' union all select o2 from jsonb_array_elements(ov) o2 where (o2->>'route')::boolean) rs
         where (o->>'physical')::boolean and o->>'id' is distinct from rt->>'id'
           and public.map_boxes_touch(array(select jsonb_array_elements_text(o->'bb'))::numeric[], array(select jsonb_array_elements_text(rt->'bb'))::numeric[], 0)), '[]');
  -- Aisles and overlaps between physical assets (warnings).
  f := f || coalesce((select jsonb_agg(z) from (select jsonb_build_object('code', case when g.dx < 0 and g.dy < 0 then 'overlap' else 'aisle_narrow' end, 'element_id', g.aid, 'other_id', g.bid,
            'gap_m', round(greatest(g.dx, g.dy) / upm, 2), 'text', case when g.dx < 0 and g.dy < 0 then g.al || ' overlaps ' || g.bl || '.'
              else 'Aisle between ' || g.al || ' and ' || g.bl || ' is ' || round(greatest(g.dx, g.dy) / upm, 2) || ' m (minimum ' || coalesce(r->>'min_aisle_m', '1.1') || ' m).' end) z
          from (select a->>'id' aid, b->>'id' bid, a->>'label' al, b->>'label' bl,
                       greatest((b->'bb'->>0)::numeric - (a->'bb'->>2)::numeric, (a->'bb'->>0)::numeric - (b->'bb'->>2)::numeric) dx,
                       greatest((b->'bb'->>1)::numeric - (a->'bb'->>3)::numeric, (a->'bb'->>1)::numeric - (b->'bb'->>3)::numeric) dy
                  from jsonb_array_elements(ov) a join jsonb_array_elements(ov) b on (a->>'id') < (b->>'id')
                 where (a->>'physical')::boolean and (b->>'physical')::boolean and jsonb_typeof(a->'bb') = 'array' and jsonb_typeof(b->'bb') = 'array') g
         where (g.dx < 0 and g.dy < 0) or (g.dx >= 0 and g.dy < 0 and g.dx < aisle) or (g.dy >= 0 and g.dx < 0 and g.dy < aisle)
         limit 50) q), '[]');
  -- Accessible allocation.
  acc := (select coalesce(sum((o->>'accessible_cap')::int), 0) from jsonb_array_elements(ov) o)
       + case when p_seats is not null and jsonb_typeof(p_seats) = 'array' then (select count(*)::int from jsonb_array_elements(p_seats) s where coalesce((s->>'accessible')::boolean, false))
              else (select coalesce(sum((o->>'accessible_seats')::int), 0) from jsonb_array_elements(ov) o) end;
  if total > 0 and acc < ceil(total * coalesce((r->>'accessible_pct')::numeric, 0.02)) then
    f := f || jsonb_build_array(jsonb_build_object('code', 'accessible_allocation', 'allocated', acc, 'recommended', ceil(total * coalesce((r->>'accessible_pct')::numeric, 0.02)),
      'text', 'Accessible allocation ' || acc || ' is below the recommended ' || ceil(total * coalesce((r->>'accessible_pct')::numeric, 0.02)) || '.'));
  end if;
  -- Ticket bindings (tiers) and Q18 access zones (lane D's access_zones / access_rules, read only).
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'invalid_tier', 'tier_id', t, 'text', 'A ticket tier on the plan doesn’t belong to this event.'))
          from (select o->>'tier' t from jsonb_array_elements(ov) o where o->>'tier' is not null
                union select s->>'tier' from jsonb_array_elements(case when jsonb_typeof(p_seats) = 'array' then p_seats else '[]' end) s where nullif(s->>'tier', '') is not null) q
         where case when t ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then not exists (select 1 from public.ticket_tiers tt where tt.id = t::uuid and tt.event_id = p_event) else true end), '[]');
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'tier_over_capacity', 'tier_id', tt.id, 'quantity', tt.quantity, 'bound', b.n,
            'text', tt.name || ': ' || tt.quantity || ' tickets but only ' || b.n || ' places on the plan.'))
          from public.ticket_tiers tt
          join lateral (select (select coalesce(sum((o->>'cap')::int), 0) from jsonb_array_elements(ov) o where o->>'tier' = tt.id::text)
                       + case when p_seats is not null and jsonb_typeof(p_seats) = 'array'
                              then (select count(*)::int from jsonb_array_elements(p_seats) s where s->>'tier' = tt.id::text and not coalesce((s->>'blocked')::boolean, false))
                              else (select coalesce(sum((o->>'seats')::int), 0) from jsonb_array_elements(ov) o where o->>'tier' = tt.id::text) end n) b on true
         where tt.event_id = p_event and coalesce(tt.quantity, 0) > 0 and b.n > 0 and tt.quantity > b.n), '[]');
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'tier_unbound', 'tier_id', tt.id, 'text', tt.name || ' isn’t placed on the plan yet.'))
          from public.ticket_tiers tt
         where tt.event_id = p_event and coalesce(tt.quantity, 0) > 0 and tt.status <> 'archived'
           and exists (select 1 from jsonb_array_elements(ov) o where o->>'tier' is not null)
           and not exists (select 1 from jsonb_array_elements(ov) o where o->>'tier' = tt.id::text)
           and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_seats) = 'array' then p_seats else '[]' end) s where s->>'tier' = tt.id::text)), '[]');
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'invalid_zone', 'element_id', o->>'id', 'text', (o->>'label') || ' is linked to an access zone that isn’t on this event.'))
          from jsonb_array_elements(ov) o
         where o->>'zone' is not null and case when o->>'zone' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then not exists (select 1 from public.access_zones z where z.id = (o->>'zone')::uuid and z.event_id = p_event) else true end), '[]');
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'zone_over_capacity', 'zone_id', z.id, 'capacity', z.capacity, 'bound', q.n,
            'text', z.name || ': the plan places ' || q.n || ' people in a zone licensed for ' || z.capacity || '.'))
          from public.access_zones z
          join (select case when o->>'zone' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (o->>'zone')::uuid end zid, sum((o->>'seats')::int + (o->>'cap')::int) n from jsonb_array_elements(ov) o group by 1) q on q.zid = z.id
         where z.event_id = p_event and z.capacity is not null and q.n > z.capacity), '[]');
  f := f || coalesce((select jsonb_agg(jsonb_build_object('code', 'tier_zone_mismatch', 'element_id', o->>'id',
            'text', (o->>'label') || ': its ticket tier has no access rule for the linked zone.'))
          from jsonb_array_elements(ov) o
         where case when o->>'zone' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and o->>'tier' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
                 exists (select 1 from public.access_rules ar where ar.zone_id = (o->>'zone')::uuid and ar.tier_id is not null)
                 and not exists (select 1 from public.access_rules ar where ar.zone_id = (o->>'zone')::uuid and ar.tier_id = (o->>'tier')::uuid) else false end), '[]');

  -- Severity from the rule pack (data-driven).
  select coalesce(jsonb_agg(x2 || jsonb_build_object('severity', case when x2->>'code' = any(crit) then 'error' else 'warning' end)), '[]') into f from jsonb_array_elements(f) x2;
  return jsonb_build_object('ok', not exists (select 1 from jsonb_array_elements(f) x3 where x3->>'severity' = 'error'),
    'errors', (select coalesce(jsonb_agg(x3), '[]') from jsonb_array_elements(f) x3 where x3->>'severity' = 'error'),
    'warnings', (select coalesce(jsonb_agg(x3), '[]') from jsonb_array_elements(f) x3 where x3->>'severity' = 'warning'),
    'stats', jsonb_build_object('total', total, 'seats', seats, 'area_capacity', area_cap, 'venue_capacity', venue_cap, 'exits', n_exits, 'required_exits', need_exits,
      'exit_width_mm', round(exit_mm), 'accessible', acc, 'elements', jsonb_array_length(ov)),
    'rule_pack', jsonb_build_object('key', rp.key, 'version', rp.version), 'venue_id', venue, 'structure_version', st.version, 'validated_at', now());
end $$;

-- Validates a saved version (default: latest) — or the latest published seats when that version is published.
create or replace function public.event_map_validate_internal(p_event uuid, p_version integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.venue_maps; seats jsonb;
begin
  select * into m from public.venue_maps where event_id = p_event and (p_version is null or version = p_version) order by version desc limit 1;
  if not found then return jsonb_build_object('ok', true, 'errors', '[]'::jsonb, 'warnings', '[]'::jsonb, 'map', false); end if;
  if m.status = 'published' and m.version = (select max(version) from public.venue_maps where event_id = p_event and status = 'published') then
    select coalesce(jsonb_agg(jsonb_build_object('key', s.seat_key, 'tier', s.tier_id, 'accessible', s.accessible, 'blocked', s.status = 'blocked')), '[]') into seats
      from public.event_seats s where s.event_id = p_event;
    if seats = '[]'::jsonb then seats := null; end if;
  end if;
  return public.map_validate_core(p_event, m.overlay, seats) || jsonb_build_object('version', m.version, 'status', m.status, 'map', true);
end $$;
create or replace function public.event_map_validate(p_event uuid, p_version integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.event_map_validate_internal(p_event, p_version);
end $$;

-- Lifecycle integration: Q14 event_lifecycle_blockers(event, to) can append these ([{key,label,fix}]) for publish/on-sale.
-- No caller check: definer-to-definer use only (service-only grant). Clients use event_map_validate.
create or replace function public.event_map_blockers(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.venue_maps; v jsonb;
begin
  select * into m from public.venue_maps where event_id = p_event and status = 'published' order by version desc limit 1;
  if not found then return '[]'; end if;
  v := public.event_map_validate_internal(p_event, m.version);
  return coalesce((select jsonb_agg(jsonb_build_object('key', 'map_' || (x->>'code'), 'label', x->>'text', 'fix', '/organizer/events/' || p_event || '/map'))
                     from jsonb_array_elements(v->'errors') x), '[]');
end $$;

-- ═══ 6. Commands ═══
-- Legacy/primary save (deployed editor): same signature and return. Adds shape checks, venue locks, publish validation and
-- records which structure version and validation the overlay was saved against.
create or replace function public.organizer_save_event_plan(p_event uuid, p_structure jsonb, p_overlay jsonb, p_seats jsonb, p_publish boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer; locked text; viol jsonb; val jsonb; sv integer;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform 1 from public.events where id = p_event for update;
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_overlay) <> 'array' or jsonb_typeof(p_seats) <> 'array' then raise exception 'invalid_elements' using errcode = '22023'; end if;
  if jsonb_array_length(p_overlay) > 5000 then raise exception 'too_many_elements' using errcode = '22023'; end if;
  if jsonb_array_length(p_seats) > 60000 then raise exception 'too_many_seats' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_overlay) o where jsonb_typeof(o) <> 'object'
             or exists (select 1 from unnest(array['x','y','w','h','capacity','rot']) k where o ? k and jsonb_typeof(o->k) not in ('number','null'))
             or (o ? 'points' and jsonb_typeof(o->'points') <> 'array')) then
    raise exception 'invalid_elements' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_seats) s where (s->>'tier') is not null and not exists(select 1 from public.ticket_tiers t where t.id = (s->>'tier')::uuid and t.event_id = p_event)) then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;
  -- Venue locks (server-side; the editor greys them out but a client can't be trusted).
  viol := public.event_map_lock_violations(p_event, p_overlay);
  if jsonb_array_length(viol) > 0 then
    raise exception 'venue_lock' using errcode = '42501', detail = left((select string_agg(x, ', ') from jsonb_array_elements_text(viol) x), 200),
      hint = 'Locked venue elements belong to the venue''s structural map; ask the venue to change them.';
  end if;
  select s.version into sv from public.venue_structures s where s.venue_id = public.event_map_venue(p_event) and s.status = 'published';
  if p_publish then
    val := public.map_validate_core(p_event, p_overlay, p_seats);
    if not (val->>'ok')::boolean then
      raise exception 'map_validation_failed' using errcode = '22023',
        detail = left((select string_agg(x->>'text', ' | ') from (select x from jsonb_array_elements(val->'errors') x limit 3) q), 400);
    end if;
  end if;
  select coalesce(max(version), 0) + 1 into v from public.venue_maps where event_id = p_event;
  insert into public.venue_maps(event_id, version, status, structure, overlay, created_by, structure_version, validation, validated_at, based_on_version)
    values (p_event, v, case when p_publish then 'published' else 'draft' end, coalesce(p_structure, '{}'), p_overlay, auth.uid(), sv, val, case when val is not null then now() end, v - 1);
  if p_publish then
    select string_agg(es.seat_key, ', ') into locked from public.event_seats es
      where es.event_id = p_event and es.status in ('sold','held')
        and not exists(select 1 from jsonb_array_elements(p_seats) s where s->>'key' = es.seat_key and (s->>'tier')::uuid is not distinct from es.tier_id);
    if locked is not null then raise exception 'seats_in_use' using errcode = '23P01', detail = left(locked, 200); end if;
    delete from public.event_seats es where es.event_id = p_event and es.status in ('available','blocked')
      and not exists(select 1 from jsonb_array_elements(p_seats) s where s->>'key' = es.seat_key);
    insert into public.event_seats(event_id, seat_key, label, section, kind, tier_id, accessible, status)
      select p_event, s->>'key', left(coalesce(s->>'label', ''), 120), left(coalesce(s->>'section', ''), 60), coalesce(s->>'kind', 'seat'), (s->>'tier')::uuid,
        coalesce((s->>'accessible')::boolean, false), case when coalesce((s->>'blocked')::boolean, false) then 'blocked' else 'available' end
      from jsonb_array_elements(p_seats) s
    on conflict (event_id, seat_key) do update set label = excluded.label, section = excluded.section, kind = excluded.kind, accessible = excluded.accessible,
      tier_id = case when public.event_seats.status in ('sold','held') then public.event_seats.tier_id else excluded.tier_id end,
      status = case when public.event_seats.status in ('sold','held') then public.event_seats.status else excluded.status end, updated_at = now();
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), (select workspace_id from public.events where id = p_event), case when p_publish then 'event_plan.published' else 'event_plan.saved' end,
      jsonb_build_object('event_id', p_event, 'version', v, 'seats', jsonb_array_length(p_seats), 'structure_version', sv));
  return v;
end $$;

-- Version-checked save for the new editor: p_base_version = the version the session opened (0 for a first save).
create or replace function public.event_map_save(p_event uuid, p_overlay jsonb, p_seats jsonb, p_publish boolean, p_base_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur integer; v integer;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform 1 from public.events where id = p_event for update;
  select coalesce(max(version), 0) into cur from public.venue_maps where event_id = p_event;
  if p_base_version is null or p_base_version <> cur then raise exception 'stale_version:%', cur using errcode = '22023', hint = 'Another session saved first; reload and merge.'; end if;
  v := public.organizer_save_event_plan(p_event, jsonb_build_object('format', 'plan-v2'), p_overlay, coalesce(p_seats, '[]'), p_publish);
  return jsonb_build_object('version', v, 'status', case when p_publish then 'published' else 'draft' end,
    'validation', coalesce((select validation from public.venue_maps where event_id = p_event and version = v), public.map_validate_core(p_event, p_overlay, p_seats)));
end $$;

-- Restore: a new draft copied from an earlier version (history is never rewritten).
create or replace function public.event_map_restore(p_event uuid, p_version integer, p_base_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.venue_maps;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into m from public.venue_maps where event_id = p_event and version = p_version;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return public.event_map_save(p_event, m.overlay, '[]', false, p_base_version) || jsonb_build_object('restored_from', p_version);
end $$;

create or replace function public.event_map_compare(p_event uuid, p_a integer, p_b integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a jsonb; b jsonb;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select overlay into a from public.venue_maps where event_id = p_event and version = p_a;
  select overlay into b from public.venue_maps where event_id = p_event and version = p_b;
  if a is null or b is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('from', p_a, 'to', p_b,
    'added', coalesce((select jsonb_agg(y->>'id') from jsonb_array_elements(b) y where not exists (select 1 from jsonb_array_elements(a) x where x->>'id' = y->>'id')), '[]'),
    'removed', coalesce((select jsonb_agg(x->>'id') from jsonb_array_elements(a) x where not exists (select 1 from jsonb_array_elements(b) y where y->>'id' = x->>'id')), '[]'),
    'changed', coalesce((select jsonb_agg(y->>'id') from jsonb_array_elements(b) y join jsonb_array_elements(a) x on x->>'id' = y->>'id' where x is distinct from y), '[]'));
end $$;

-- Venue structural map save (version-checked). p_meta: {rule_pack, capacity_max, calibration:{units_per_m, rotation_deg, origin:[x,y],
-- underlay:{file_ref, kind:'image'|'pdf', opacity}}}. Locked/protected elements of the published version can't be dropped.
create or replace function public.venue_structure_save(p_venue uuid, p_elements jsonb, p_publish boolean, p_base_version integer, p_meta jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ws uuid; cur integer; v integer; pub public.venue_structures; cal jsonb; rp text; cap integer;
begin
  select l.workspace_id into ws from public.listings l where l.id = p_venue and l.kind = 'venue';
  if ws is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(ws, array['owner','manager']);
  perform 1 from public.listings where id = p_venue for update;
  if jsonb_typeof(p_elements) <> 'array' or jsonb_array_length(p_elements) > 5000 then raise exception 'invalid_elements' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_elements) o where jsonb_typeof(o) <> 'object'
             or exists (select 1 from unnest(array['x','y','w','h','capacity','rot']) k where o ? k and jsonb_typeof(o->k) not in ('number','null'))) then
    raise exception 'invalid_elements' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) into cur from public.venue_structures where venue_id = p_venue;
  if p_base_version is null or p_base_version <> cur then raise exception 'stale_version:%', cur using errcode = '22023', hint = 'Another session saved first; reload and merge.'; end if;
  select * into pub from public.venue_structures where venue_id = p_venue and status = 'published';
  if p_publish and pub.id is not null and exists (select 1 from jsonb_array_elements(pub.elements) e
       where (coalesce((e->>'protected')::boolean, false) or coalesce((e->>'locked')::boolean, false))
         and not exists (select 1 from jsonb_array_elements(p_elements) n where (e ? 'id' and n->>'id' = e->>'id') or (not e ? 'id' and n->>'label' = e->>'label' and n->>'type' = e->>'type'))) then
    raise exception 'protected_element_removed' using errcode = '22023';
  end if;
  cal := coalesce(p_meta->'calibration', pub.calibration, '{}');
  if jsonb_typeof(cal) <> 'object'
     or (cal ? 'units_per_m' and (jsonb_typeof(cal->'units_per_m') <> 'number' or (cal->>'units_per_m')::numeric not between 1 and 1000))
     or (cal ? 'rotation_deg' and (jsonb_typeof(cal->'rotation_deg') <> 'number' or (cal->>'rotation_deg')::numeric not between -360 and 360))
     or (cal ? 'origin' and (jsonb_typeof(cal->'origin') <> 'array' or jsonb_array_length(cal->'origin') <> 2))
     or (cal ? 'underlay' and (jsonb_typeof(cal->'underlay') <> 'object' or coalesce(cal->'underlay'->>'kind', 'image') not in ('image','pdf'))) then
    raise exception 'invalid_calibration' using errcode = '22023';
  end if;
  rp := coalesce(p_meta->>'rule_pack', pub.rule_pack, 'uk_default');
  if not exists (select 1 from public.map_rule_packs where key = rp and active) then raise exception 'invalid_rule_pack' using errcode = '22023'; end if;
  cap := coalesce((p_meta->>'capacity_max')::int, pub.capacity_max);
  v := cur + 1;
  if p_publish then update public.venue_structures set status = 'archived' where venue_id = p_venue and status = 'published'; end if;
  insert into public.venue_structures(workspace_id, venue_id, version, status, elements, created_by, published_at, rule_pack, calibration, capacity_max, based_on_version)
    values (ws, p_venue, v, case when p_publish then 'published' else 'draft' end, p_elements, auth.uid(), case when p_publish then now() end, rp, cal, cap, cur);
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), ws, case when p_publish then 'structure.published' else 'structure.saved' end, jsonb_build_object('venue_id', p_venue, 'version', v, 'rule_pack', rp));
  return jsonb_build_object('version', v, 'status', case when p_publish then 'published' else 'draft' end);
end $$;

-- ═══ 7. Ticket bindings (seats/areas ↔ tiers ↔ Q18 access zones) ═══
create or replace function public.event_map_bindings_internal(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.venue_maps; published boolean;
begin
  select * into m from public.venue_maps where event_id = p_event and status = 'published' order by version desc limit 1;
  published := found;
  if not published then select * into m from public.venue_maps where event_id = p_event order by version desc limit 1; end if;
  return jsonb_build_object('event_id', p_event, 'map_version', m.version, 'published', published,
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('tier_id', t.id, 'name', t.name, 'quantity', t.quantity,
        'seats', (select count(*) from public.event_seats s where s.event_id = p_event and s.tier_id = t.id and s.status <> 'blocked'),
        'area_capacity', (select coalesce(sum((o->>'capacity')::int), 0) from jsonb_array_elements(coalesce(m.overlay, '[]')) o
                           join public.map_asset_palettes p on p.key = o->>'asset' and p.has_capacity where o->>'tier' = t.id::text and jsonb_typeof(o->'capacity') = 'number'),
        'elements', (select coalesce(jsonb_agg(o->>'id'), '[]') from jsonb_array_elements(coalesce(m.overlay, '[]')) o where o->>'tier' = t.id::text),
        'zones', (select coalesce(jsonb_agg(distinct ar.zone_id), '[]') from public.access_rules ar where ar.tier_id = t.id)) order by t.sort, t.name)
      from public.ticket_tiers t where t.event_id = p_event), '[]'),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('zone_id', z.id, 'name', z.name, 'kind', z.kind, 'capacity', z.capacity,
        'elements', (select coalesce(jsonb_agg(o->>'id'), '[]') from jsonb_array_elements(coalesce(m.overlay, '[]')) o where o->>'zone' = z.id::text))
      order by z.sort, z.name) from public.access_zones z where z.event_id = p_event), '[]'));
end $$;
create or replace function public.event_map_bindings(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.event_map_bindings_internal(p_event);
end $$;

-- ═══ 8. Gala Agent: read-only map tools (R0; registry rows here, handlers in agent_invoke_ext) ═══
insert into public.agent_tools(id, version, title, description, surface, risk, permission, mutation, reversible, idempotent, timeout_ms, retries, approval_note) values
  ('map.validate', 1, 'Validate event map', 'Capacity, exits, clear routes, aisles, accessibility and ticket/zone bindings for an event''s layout. Read only.', 'organizer', 0, 'events.read', false, true, true, 15000, 2, ''),
  ('map.bindings', 1, 'Map ticket bindings', 'Which seats and areas on the published layout belong to each ticket tier and access zone. Read only.', 'organizer', 0, 'events.read', false, true, true, 15000, 2, '')
on conflict (id) do update set version = excluded.version, title = excluded.title, description = excluded.description, surface = excluded.surface, risk = excluded.risk,
  permission = excluded.permission, mutation = excluded.mutation, reversible = excluded.reversible, idempotent = excluded.idempotent, timeout_ms = excluded.timeout_ms,
  retries = excluded.retries, approval_note = excluded.approval_note;

create or replace function public.agent_invoke_ext(p_workspace uuid, p_tool text, p_args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb; v uuid;
begin
  -- Event-scoped tools: the event must belong to the workspace the agent is acting in.
  if p_tool in ('media.event_poster', 'venues.rank', 'event.break_even', 'seating.suggest', 'map.validate', 'map.bindings')
     and not exists (select 1 from public.events e where e.id = (p_args->>'event_id')::uuid and e.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  case p_tool
  when 'media.list_designs' then
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'status', d.status, 'source', d.source, 'updated_at', d.updated_at, 'link', '/studio/' || d.id) order by d.updated_at desc), '[]') into out
      from (select * from public.designs x where x.workspace_id = p_workspace and x.deleted_at is null
              and (p_args->>'event_id' is null or x.event_id = (p_args->>'event_id')::uuid) order by x.updated_at desc limit 30) d;
  when 'media.event_poster' then
    v := public.create_design(p_workspace, (p_args->>'event_id')::uuid, coalesce(p_args->>'title', 'Agent draft poster'), p_args->'document', 'agent', null, null);
    out := jsonb_build_object('design_id', v, 'status', 'draft', 'link', '/studio/' || v);
  when 'venues.rank' then out := public.rank_venues_for_event((p_args->>'event_id')::uuid, coalesce((p_args->>'limit')::int, 8));
  when 'event.break_even' then out := public.event_break_even((p_args->>'event_id')::uuid, coalesce((p_args->>'extra_costs')::numeric, 0), nullif(p_args->>'fee_pct', '')::numeric);
  when 'seating.suggest' then out := public.suggest_seating((p_args->>'event_id')::uuid, coalesce((p_args->>'table_size')::int, 10), coalesce((p_args->>'include_pending')::boolean, true));
  when 'map.validate' then out := public.event_map_validate_internal((p_args->>'event_id')::uuid, nullif(p_args->>'version', '')::int)
      || jsonb_build_object('link', '/organizer/events/' || (p_args->>'event_id') || '/map');
  when 'map.bindings' then out := public.event_map_bindings_internal((p_args->>'event_id')::uuid);
  else raise exception 'tool_not_executable:%', p_tool using errcode = '22023';
  end case;
  return out;
end $$;

-- ═══ 9. Grants ═══
revoke all on table public.map_asset_palettes, public.map_rule_packs from public, anon, authenticated;
grant select on table public.map_asset_palettes, public.map_rule_packs to anon, authenticated;
grant all on table public.map_asset_palettes, public.map_rule_packs to service_role;

revoke all on function public.map_rule_packs_immutable(), public.venue_maps_client_guard(), public.map_bbox(jsonb), public.map_el_seats(jsonb),
  public.map_boxes_touch(numeric[], numeric[], numeric), public.event_map_venue(uuid), public.event_map_lock_violations(uuid, jsonb), public.map_validate_core(uuid, jsonb, jsonb),
  public.event_map_validate(uuid, integer), public.event_map_blockers(uuid), public.event_map_save(uuid, jsonb, jsonb, boolean, integer), public.event_map_restore(uuid, integer, integer),
  public.event_map_compare(uuid, integer, integer), public.venue_structure_save(uuid, jsonb, boolean, integer, jsonb), public.event_map_bindings(uuid),
  public.event_map_validate_internal(uuid, integer), public.event_map_bindings_internal(uuid) from public, anon;
revoke all on function public.event_map_venue(uuid), public.event_map_lock_violations(uuid, jsonb), public.map_validate_core(uuid, jsonb, jsonb),
  public.event_map_validate_internal(uuid, integer), public.event_map_bindings_internal(uuid), public.event_map_blockers(uuid) from authenticated;
grant execute on function public.map_bbox(jsonb), public.map_el_seats(jsonb), public.map_boxes_touch(numeric[], numeric[], numeric) to authenticated, service_role;
grant execute on function public.event_map_venue(uuid), public.event_map_lock_violations(uuid, jsonb), public.map_validate_core(uuid, jsonb, jsonb),
  public.event_map_validate_internal(uuid, integer), public.event_map_bindings_internal(uuid), public.event_map_blockers(uuid) to service_role;
grant execute on function public.event_map_validate(uuid, integer), public.event_map_save(uuid, jsonb, jsonb, boolean, integer),
  public.event_map_restore(uuid, integer, integer), public.event_map_compare(uuid, integer, integer), public.venue_structure_save(uuid, jsonb, boolean, integer, jsonb),
  public.event_map_bindings(uuid) to authenticated, service_role;
-- organizer_save_event_plan and agent_invoke_ext keep their existing grants (create or replace preserves ACLs).
