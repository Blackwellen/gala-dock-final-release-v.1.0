-- Q25 (lane C, 2026-10-29) — Travel / parking / accommodation / logistics (domains 154–157).
-- Additive and backward-compatible (new tables/functions; event_ops_checks becomes a union of per-domain checkers):
--   * transport_movements (+ restricted transport_private for passenger names / flight numbers / phones): talent, crew, guest,
--     supplier and shuttle movements with pickup points. A vehicle is a Q12 provider_equipment row locked through the Q17
--     event_allocate_resource() (one capacity rule for jobs and events); seats checked against equipment.details.seats.
--   * parking_areas (+ Q19 map element by reference) and parking_permits: capacity and accessible-space limits enforced under an
--     area lock with machine-readable errors (parking_full / accessible_parking_full); one live permit per vehicle per window
--     (exclusion constraint).
--   * accommodation_blocks + room_allocations: per-night room capacity under a block lock, duplicate occupant guard, cut-off
--     dates, nightly rate + cost snapshot on every allocation (later rate edits never rewrite history).
--   * loading_bays (venue-owned per listing, or event-scoped) + logistics_windows (delivery / collection / load-in / load-out /
--     storage, access route, storage area): no two live windows on one bay overlap — across events and tenants (exclusion
--     constraint; the error never reveals the other event).
--   * Constraints feed schedule / feasibility / readiness through event_ops_checks(): talent arriving after their slot (minus
--     buffer), talent without transport for an accepted travel rider, rooms unallocated near cut-off, talent rooms missing,
--     supplier deliveries after doors, confirmed suppliers without an access slot. Conflicts surface on Home / Calendar / Event.
--   * Attendees see only public shuttle information or their own assignments (my_event_travel).

-- ═══ 1. Transport ═══
create table if not exists public.transport_movements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('talent','crew','guest','supplier','shuttle','vip')),
  party_id uuid references public.event_parties(id) on delete set null,
  crew_id uuid references public.crew_members(id) on delete set null,
  build_item_id uuid references public.build_items(id) on delete set null,
  passengers integer not null default 1 check (passengers between 1 and 500),
  from_place text not null default '' check (length(from_place) <= 200),
  to_place text not null default '' check (length(to_place) <= 200),
  pickup_point text not null default '' check (length(pickup_point) <= 200),
  departs_at timestamptz not null,
  arrives_at timestamptz not null,
  vehicle_equipment_id uuid references public.provider_equipment(id) on delete set null,
  vehicle_allocation_id uuid references public.job_equipment_allocations(id) on delete set null,
  vehicle_label text not null default '' check (length(vehicle_label) <= 120),
  public_info boolean not null default false,
  status text not null default 'planned' check (status in ('planned','confirmed','en_route','completed','cancelled')),
  notes text not null default '' check (length(notes) <= 1000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (arrives_at > departs_at),
  check (public_info = false or kind in ('shuttle','guest'))
);
create index if not exists transport_movements_event_idx on public.transport_movements(event_id, departs_at);
create index if not exists transport_movements_party_idx on public.transport_movements(party_id) where party_id is not null;
drop trigger if exists transport_movements_touch on public.transport_movements;
create trigger transport_movements_touch before update on public.transport_movements for each row execute function public.ops_touch();

create table if not exists public.transport_private (
  movement_id uuid primary key references public.transport_movements(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  passenger_names text not null default '' check (length(passenger_names) <= 2000),
  flight_number text not null default '' check (length(flight_number) <= 40),
  contact_phone text not null default '' check (length(contact_phone) <= 60),
  notes text not null default '' check (length(notes) <= 1000),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

-- ═══ 2. Parking ═══
create table if not exists public.parking_areas (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null default 'general' check (kind in ('general','staff','supplier','talent','accessible','vip','mixed')),
  capacity integer not null check (capacity between 0 and 100000),
  accessible_spaces integer not null default 0 check (accessible_spaces >= 0),
  opens_at timestamptz, closes_at timestamptz,
  access_route text not null default '' check (length(access_route) <= 500),
  venue_map_id uuid references public.venue_maps(id) on delete set null,
  map_element_ref text check (map_element_ref is null or length(map_element_ref) between 1 and 120),
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (accessible_spaces <= capacity),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);
create index if not exists parking_areas_event_idx on public.parking_areas(event_id);
drop trigger if exists parking_areas_touch on public.parking_areas;
create trigger parking_areas_touch before update on public.parking_areas for each row execute function public.ops_touch();

create table if not exists public.parking_permits (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.parking_areas(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  holder_kind text not null check (holder_kind in ('staff','supplier','talent','guest','vip','accessible','other')),
  holder_name text not null check (length(btrim(holder_name)) between 2 and 160),
  party_id uuid references public.event_parties(id) on delete set null,
  crew_id uuid references public.crew_members(id) on delete set null,
  build_item_id uuid references public.build_items(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  vehicle_reg text not null default '' check (vehicle_reg ~ '^[A-Z0-9]{0,12}$'),
  accessible boolean not null default false,
  valid_from timestamptz not null, valid_to timestamptz not null,
  code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  status text not null default 'issued' check (status in ('issued','revoked','used')),
  revoked_reason text not null default '' check (length(revoked_reason) <= 300),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (valid_to > valid_from)
);
create index if not exists parking_permits_area_idx on public.parking_permits(area_id, status);
do $$ begin
  alter table public.parking_permits add constraint parking_permits_one_vehicle exclude using gist (event_id with =, vehicle_reg with =, tstzrange(valid_from, valid_to, '[)') with &&)
    where (status = 'issued' and vehicle_reg <> '');
exception when duplicate_object then null; end $$;

-- ═══ 3. Accommodation ═══
create table if not exists public.accommodation_blocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  hotel_name text not null check (length(btrim(hotel_name)) between 1 and 160),
  address text not null default '' check (length(address) <= 300),
  contact text not null default '' check (length(contact) <= 200),
  rooms_total integer not null check (rooms_total between 1 and 5000),
  check_in date not null, check_out date not null,
  cutoff_date date,
  nightly_rate numeric(10,2) not null default 0 check (nightly_rate >= 0),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'provisional' check (status in ('provisional','confirmed','released','cancelled')),
  rate_version integer not null default 1,
  notes text not null default '' check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in),
  check (cutoff_date is null or cutoff_date <= check_in)
);
create index if not exists accommodation_blocks_event_idx on public.accommodation_blocks(event_id);
drop trigger if exists accommodation_blocks_touch on public.accommodation_blocks;
create trigger accommodation_blocks_touch before update on public.accommodation_blocks for each row execute function public.ops_touch();

create table if not exists public.room_allocations (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.accommodation_blocks(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  occupant_kind text not null check (occupant_kind in ('talent','crew','staff','guest','vip','other')),
  occupant_name text not null check (length(btrim(occupant_name)) between 2 and 160),
  party_id uuid references public.event_parties(id) on delete set null,
  crew_id uuid references public.crew_members(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  room_type text not null default '' check (length(room_type) <= 60),
  nights_from date not null, nights_to date not null,
  status text not null default 'held' check (status in ('held','confirmed','cancelled')),
  nightly_rate numeric(10,2) not null,
  currency text not null,
  rate_version integer not null,
  cost numeric(12,2) not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (nights_to > nights_from)
);
create index if not exists room_allocations_block_idx on public.room_allocations(block_id, status);
create index if not exists room_allocations_party_idx on public.room_allocations(party_id) where party_id is not null;

-- ═══ 4. Loading bays + logistics windows ═══
create table if not exists public.loading_bays (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  max_vehicle text not null default '' check (length(max_vehicle) <= 80),
  max_length_m numeric(5,2) check (max_length_m is null or max_length_m > 0),
  turnaround_minutes integer not null default 0 check (turnaround_minutes between 0 and 240),
  access_route text not null default '' check (length(access_route) <= 500),
  notes text not null default '' check (length(notes) <= 500),
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  check (listing_id is not null or event_id is not null)
);
create index if not exists loading_bays_listing_idx on public.loading_bays(listing_id) where listing_id is not null;
create index if not exists loading_bays_event_idx on public.loading_bays(event_id) where event_id is not null;

create table if not exists public.logistics_windows (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bay_id uuid references public.loading_bays(id) on delete set null,
  kind text not null check (kind in ('delivery','collection','load_in','load_out','storage')),
  party_id uuid references public.event_parties(id) on delete set null,
  build_item_id uuid references public.build_items(id) on delete set null,
  supplier_name text not null default '' check (length(supplier_name) <= 160),
  starts_at timestamptz not null, ends_at timestamptz not null,
  busy_until timestamptz not null,
  vehicle text not null default '' check (length(vehicle) <= 80),
  access_route text not null default '' check (length(access_route) <= 500),
  storage_area text not null default '' check (length(storage_area) <= 160),
  status text not null default 'requested' check (status in ('requested','confirmed','completed','cancelled')),
  notes text not null default '' check (length(notes) <= 500),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and busy_until >= ends_at)
);
create index if not exists logistics_windows_event_idx on public.logistics_windows(event_id, starts_at);
do $$ begin
  alter table public.logistics_windows add constraint logistics_windows_bay_no_overlap exclude using gist (bay_id with =, tstzrange(starts_at, busy_until, '[)') with &&)
    where (bay_id is not null and status in ('requested','confirmed'));
exception when duplicate_object then null; end $$;
drop trigger if exists logistics_windows_touch on public.logistics_windows;
create trigger logistics_windows_touch before update on public.logistics_windows for each row execute function public.ops_touch();

-- ═══ 5. RLS ═══
do $$ declare t text; begin
  foreach t in array array['transport_movements','transport_private','parking_areas','parking_permits','accommodation_blocks','room_allocations','loading_bays','logistics_windows'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
drop policy if exists transport_movements_read on public.transport_movements;
create policy transport_movements_read on public.transport_movements for select to authenticated using (public.can_access_event(event_id) or (party_id is not null and public.party_portal_user(party_id)));
-- Passenger names / flights / phones: managers and the party's own portal login only.
drop policy if exists transport_private_read on public.transport_private;
create policy transport_private_read on public.transport_private for select to authenticated using (public.can_manage_event(event_id)
  or exists (select 1 from public.transport_movements m where m.id = movement_id and m.party_id is not null and public.party_portal_user(m.party_id)));
drop policy if exists parking_areas_read on public.parking_areas;
create policy parking_areas_read on public.parking_areas for select to authenticated using (public.can_access_event(event_id));
drop policy if exists parking_permits_read on public.parking_permits;
create policy parking_permits_read on public.parking_permits for select to authenticated using (public.can_access_event(event_id) or (party_id is not null and public.party_portal_user(party_id)));
drop policy if exists accommodation_blocks_read on public.accommodation_blocks;
create policy accommodation_blocks_read on public.accommodation_blocks for select to authenticated using (public.can_access_event(event_id));
drop policy if exists room_allocations_read on public.room_allocations;
create policy room_allocations_read on public.room_allocations for select to authenticated using (public.can_access_event(event_id) or (party_id is not null and public.party_portal_user(party_id)));
-- Bays: the venue's own team, the event team for event-scoped bays, and organisers whose event is at that venue.
drop policy if exists loading_bays_read on public.loading_bays;
create policy loading_bays_read on public.loading_bays for select to authenticated using (public.is_workspace_member(workspace_id)
  or (event_id is not null and public.can_access_event(event_id))
  or (listing_id is not null and exists (select 1 from public.events e where e.venue_listing_id = loading_bays.listing_id and public.can_access_event(e.id))));
drop policy if exists logistics_windows_read on public.logistics_windows;
create policy logistics_windows_read on public.logistics_windows for select to authenticated using (public.can_access_event(event_id)
  or exists (select 1 from public.loading_bays b where b.id = bay_id and b.listing_id is not null and public.has_workspace_role(b.workspace_id, array['owner','manager','member'])));

-- ═══ 6. Commands ═══
create or replace function public.transport_save(p_event uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; m public.transport_movements; veh uuid := nullif(p ->> 'vehicle_equipment_id', '')::uuid; seats integer; alloc jsonb; dep timestamptz; arr timestamptz;
  pax integer; party uuid := nullif(p ->> 'party_id', '')::uuid; crew uuid := nullif(p ->> 'crew_id', '')::uuid; bi uuid := nullif(p ->> 'build_item_id', '')::uuid;
begin
  e := public.ops_event_require(p_event);
  if p_id is not null then
    select * into m from public.transport_movements where id = p_id and event_id = e.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if m.status in ('completed','cancelled') then raise exception 'movement_closed' using errcode = '22023'; end if;
    if not (p ? 'vehicle_equipment_id') then veh := m.vehicle_equipment_id; end if;
    if not (p ? 'party_id') then party := m.party_id; end if;
    if not (p ? 'crew_id') then crew := m.crew_id; end if;
    if not (p ? 'build_item_id') then bi := m.build_item_id; end if;
  end if;
  dep := coalesce(nullif(p ->> 'departs_at', '')::timestamptz, m.departs_at); arr := coalesce(nullif(p ->> 'arrives_at', '')::timestamptz, m.arrives_at);
  pax := coalesce(nullif(p ->> 'passengers', '')::int, m.passengers, 1);
  if dep is null or arr is null or arr <= dep then raise exception 'invalid_window' using errcode = '22023'; end if;
  if party is not null and not exists (select 1 from public.event_parties x where x.id = party and x.event_id = e.id) then raise exception 'party_not_in_event' using errcode = '22023'; end if;
  if crew is not null and not exists (select 1 from public.crew_members x where x.id = crew and x.workspace_id = e.workspace_id) then raise exception 'crew_not_in_workspace' using errcode = '42501'; end if;
  if bi is not null and not exists (select 1 from public.build_items x where x.id = bi and x.event_id = e.id) then raise exception 'booking_not_in_event' using errcode = '22023'; end if;
  if veh is not null then
    select nullif(q.details ->> 'seats', '')::int into seats from public.provider_equipment q where q.id = veh and q.workspace_id = e.workspace_id;
    if not found then raise exception 'equipment_not_in_workspace' using errcode = '42501'; end if;
    if seats is not null and pax > seats then raise exception 'vehicle_capacity_exceeded' using errcode = '23P01', detail = pax || ' passengers, ' || seats || ' seats'; end if;
  end if;
  -- Vehicle lock: release the previous allocation when vehicle or time moves, then allocate through the Q12/Q17 resource lock.
  if m.vehicle_allocation_id is not null and (veh is distinct from m.vehicle_equipment_id or dep is distinct from m.departs_at or arr is distinct from m.arrives_at) then
    perform public.event_release_resource(m.vehicle_allocation_id);
    m.vehicle_allocation_id := null;
  end if;
  if veh is not null and m.vehicle_allocation_id is null then
    alloc := public.event_allocate_resource(e.id, veh, 1, dep - interval '30 minutes', arr + interval '30 minutes');
  end if;
  if p_id is null then
    insert into public.transport_movements(event_id, workspace_id, kind, party_id, crew_id, build_item_id, passengers, from_place, to_place, pickup_point, departs_at, arrives_at,
        vehicle_equipment_id, vehicle_allocation_id, vehicle_label, public_info, status, notes)
      values (e.id, e.workspace_id, p ->> 'kind', party, crew, bi, pax, coalesce(p ->> 'from_place', ''), coalesce(p ->> 'to_place', ''), coalesce(p ->> 'pickup_point', ''), dep, arr,
        veh, (alloc ->> 'allocation_id')::uuid, coalesce(p ->> 'vehicle_label', ''), coalesce((p ->> 'public_info')::boolean, false), coalesce(nullif(p ->> 'status', ''), 'planned'), coalesce(p ->> 'notes', ''))
      returning * into m;
  else
    update public.transport_movements set party_id = party, crew_id = crew, build_item_id = bi, passengers = pax, departs_at = dep, arrives_at = arr,
      from_place = coalesce(p ->> 'from_place', from_place), to_place = coalesce(p ->> 'to_place', to_place), pickup_point = coalesce(p ->> 'pickup_point', pickup_point),
      vehicle_equipment_id = veh, vehicle_allocation_id = coalesce((alloc ->> 'allocation_id')::uuid, m.vehicle_allocation_id),
      vehicle_label = coalesce(p ->> 'vehicle_label', vehicle_label), public_info = coalesce((p ->> 'public_info')::boolean, public_info),
      status = coalesce(nullif(p ->> 'status', ''), status), notes = coalesce(p ->> 'notes', notes)
      where id = m.id returning * into m;
    if m.status = 'cancelled' and m.vehicle_allocation_id is not null then perform public.event_release_resource(m.vehicle_allocation_id); end if;
  end if;
  if p ? 'private' and jsonb_typeof(p -> 'private') = 'object' then
    insert into public.transport_private(movement_id, event_id, passenger_names, flight_number, contact_phone, notes)
      values (m.id, e.id, coalesce(p -> 'private' ->> 'passenger_names', ''), coalesce(p -> 'private' ->> 'flight_number', ''), coalesce(p -> 'private' ->> 'contact_phone', ''), coalesce(p -> 'private' ->> 'notes', ''))
      on conflict (movement_id) do update set passenger_names = excluded.passenger_names, flight_number = excluded.flight_number, contact_phone = excluded.contact_phone,
        notes = excluded.notes, updated_by = auth.uid(), updated_at = now();
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'logistics.transport_saved',
    jsonb_build_object('event_id', e.id, 'movement_id', m.id, 'kind', m.kind, 'status', m.status, 'vehicle_warning', alloc ->> 'warning'));
  return jsonb_build_object('id', m.id, 'status', m.status, 'allocation_id', m.vehicle_allocation_id, 'warning', alloc ->> 'warning');
end $$;

create or replace function public.parking_area_save(p_event uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; a public.parking_areas; used integer;
begin
  e := public.ops_event_require(p_event);
  if nullif(p ->> 'venue_map_id', '') is not null and not exists (select 1 from public.venue_maps v where v.id = (p ->> 'venue_map_id')::uuid and v.event_id = e.id) then raise exception 'map_not_in_event' using errcode = '22023'; end if;
  if nullif(p ->> 'map_element_ref', '') is not null and not public.map_element_exists((p ->> 'venue_map_id')::uuid, p ->> 'map_element_ref') then raise exception 'map_element_not_found' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.parking_areas(event_id, workspace_id, name, kind, capacity, accessible_spaces, opens_at, closes_at, access_route, venue_map_id, map_element_ref)
      values (e.id, e.workspace_id, btrim(coalesce(p ->> 'name', '')), coalesce(nullif(p ->> 'kind', ''), 'general'), coalesce(nullif(p ->> 'capacity', '')::int, 0),
        coalesce(nullif(p ->> 'accessible_spaces', '')::int, 0), nullif(p ->> 'opens_at', '')::timestamptz, nullif(p ->> 'closes_at', '')::timestamptz, coalesce(p ->> 'access_route', ''),
        nullif(p ->> 'venue_map_id', '')::uuid, nullif(p ->> 'map_element_ref', '')) returning * into a;
  else
    select * into a from public.parking_areas where id = p_id and event_id = e.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    select count(*) into used from public.parking_permits x where x.area_id = a.id and x.status = 'issued';
    if nullif(p ->> 'capacity', '')::int < used then raise exception 'capacity_below_issued' using errcode = '22023', detail = used || ' permits issued'; end if;
    update public.parking_areas set name = coalesce(nullif(btrim(p ->> 'name'), ''), name), kind = coalesce(nullif(p ->> 'kind', ''), kind), capacity = coalesce(nullif(p ->> 'capacity', '')::int, capacity),
      accessible_spaces = coalesce(nullif(p ->> 'accessible_spaces', '')::int, accessible_spaces), opens_at = coalesce(nullif(p ->> 'opens_at', '')::timestamptz, opens_at),
      closes_at = coalesce(nullif(p ->> 'closes_at', '')::timestamptz, closes_at), access_route = coalesce(p ->> 'access_route', access_route),
      venue_map_id = case when p ? 'venue_map_id' then nullif(p ->> 'venue_map_id', '')::uuid else venue_map_id end,
      map_element_ref = case when p ? 'map_element_ref' then nullif(p ->> 'map_element_ref', '') else map_element_ref end,
      status = coalesce(nullif(p ->> 'status', ''), status) where id = a.id returning * into a;
  end if;
  return jsonb_build_object('id', a.id, 'capacity', a.capacity, 'accessible_spaces', a.accessible_spaces);
end $$;

-- Capacity is checked against permits overlapping the requested window, under the area lock (no check-then-insert race).
create or replace function public.parking_issue_permit(p_area uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a public.parking_areas; e public.events; f timestamptz; t timestamptz; used integer; used_acc integer; acc boolean := coalesce((p ->> 'accessible')::boolean, false); pm public.parking_permits;
  reg text := upper(regexp_replace(coalesce(p ->> 'vehicle_reg', ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into a from public.parking_areas where id = p_area for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(a.event_id);
  if a.status <> 'active' then raise exception 'parking_closed' using errcode = '22023'; end if;
  f := coalesce(nullif(p ->> 'valid_from', '')::timestamptz, a.opens_at, e.starts_at - interval '4 hours');
  t := coalesce(nullif(p ->> 'valid_to', '')::timestamptz, a.closes_at, coalesce(e.ends_at, e.starts_at + interval '12 hours') + interval '2 hours');
  if f is null or t is null or t <= f then raise exception 'invalid_window' using errcode = '22023'; end if;
  if (a.opens_at is not null and f < a.opens_at) or (a.closes_at is not null and t > a.closes_at) then raise exception 'outside_opening_hours' using errcode = '22023'; end if;
  select count(*), count(*) filter (where x.accessible) into used, used_acc from public.parking_permits x
    where x.area_id = a.id and x.status = 'issued' and tstzrange(x.valid_from, x.valid_to, '[)') && tstzrange(f, t, '[)');
  if acc and used_acc >= a.accessible_spaces then
    raise exception 'accessible_parking_full' using errcode = '23P01', detail = json_build_object('area', a.name, 'accessible_spaces', a.accessible_spaces, 'used', used_acc)::text; end if;
  if not acc and used - used_acc >= a.capacity - a.accessible_spaces then
    raise exception 'parking_full' using errcode = '23P01', detail = json_build_object('area', a.name, 'capacity', a.capacity - a.accessible_spaces, 'used', used - used_acc)::text; end if;
  insert into public.parking_permits(area_id, event_id, holder_kind, holder_name, party_id, crew_id, build_item_id, guest_id, vehicle_reg, accessible, valid_from, valid_to)
    values (a.id, a.event_id, coalesce(nullif(p ->> 'holder_kind', ''), 'other'), btrim(coalesce(p ->> 'holder_name', '')), nullif(p ->> 'party_id', '')::uuid, nullif(p ->> 'crew_id', '')::uuid,
      nullif(p ->> 'build_item_id', '')::uuid, nullif(p ->> 'guest_id', '')::uuid, reg, acc, f, t) returning * into pm;
  if pm.party_id is not null and not exists (select 1 from public.event_parties x where x.id = pm.party_id and x.event_id = a.event_id) then raise exception 'party_not_in_event' using errcode = '22023'; end if;
  if pm.guest_id is not null and not exists (select 1 from public.guests x where x.id = pm.guest_id and x.event_id = a.event_id) then raise exception 'guest_not_in_event' using errcode = '22023'; end if;
  if pm.crew_id is not null and not exists (select 1 from public.crew_members x where x.id = pm.crew_id and x.workspace_id = e.workspace_id) then raise exception 'crew_not_in_workspace' using errcode = '42501'; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'logistics.parking_permit_issued',
    jsonb_build_object('event_id', e.id, 'area_id', a.id, 'permit_id', pm.id, 'accessible', acc));
  return jsonb_build_object('id', pm.id, 'code', pm.code, 'remaining', case when acc then a.accessible_spaces - used_acc - 1 else a.capacity - a.accessible_spaces - (used - used_acc) - 1 end);
exception when exclusion_violation then
  if sqlerrm like '%parking_permits_one_vehicle%' then raise exception 'duplicate_permit' using errcode = '23P01', detail = 'This vehicle already has a permit for an overlapping time.'; end if;
  raise;
end $$;

create or replace function public.parking_revoke_permit(p_permit uuid, p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare pm public.parking_permits;
begin
  select * into pm from public.parking_permits where id = p_permit for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.ops_event_require(pm.event_id);
  update public.parking_permits set status = 'revoked', revoked_reason = coalesce(left(p_reason, 300), '') where id = pm.id and status = 'issued';
end $$;

create or replace function public.accommodation_block_save(p_event uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; b public.accommodation_blocks; peak integer;
begin
  e := public.ops_event_require(p_event);
  if p_id is null then
    insert into public.accommodation_blocks(event_id, workspace_id, hotel_name, address, contact, rooms_total, check_in, check_out, cutoff_date, nightly_rate, currency, status, notes)
      values (e.id, e.workspace_id, btrim(coalesce(p ->> 'hotel_name', '')), coalesce(p ->> 'address', ''), coalesce(p ->> 'contact', ''), coalesce(nullif(p ->> 'rooms_total', '')::int, 0),
        (p ->> 'check_in')::date, (p ->> 'check_out')::date, nullif(p ->> 'cutoff_date', '')::date, coalesce(nullif(p ->> 'nightly_rate', '')::numeric, 0),
        coalesce(nullif(p ->> 'currency', ''), e.currency, 'GBP'), coalesce(nullif(p ->> 'status', ''), 'provisional'), coalesce(p ->> 'notes', '')) returning * into b;
  else
    select * into b from public.accommodation_blocks where id = p_id and event_id = e.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    select coalesce(max(c), 0) into peak from (select count(*) c from public.room_allocations r cross join lateral generate_series(r.nights_from, r.nights_to - 1, interval '1 day') n
      where r.block_id = b.id and r.status <> 'cancelled' group by n) z;
    if nullif(p ->> 'rooms_total', '')::int < peak then raise exception 'rooms_below_allocated' using errcode = '22023', detail = peak || ' rooms allocated on the busiest night'; end if;
    update public.accommodation_blocks set hotel_name = coalesce(nullif(btrim(p ->> 'hotel_name'), ''), hotel_name), address = coalesce(p ->> 'address', address),
      rooms_total = coalesce(nullif(p ->> 'rooms_total', '')::int, rooms_total), cutoff_date = case when p ? 'cutoff_date' then nullif(p ->> 'cutoff_date', '')::date else cutoff_date end,
      nightly_rate = coalesce(nullif(p ->> 'nightly_rate', '')::numeric, nightly_rate),
      rate_version = rate_version + case when nullif(p ->> 'nightly_rate', '')::numeric is distinct from nightly_rate and p ? 'nightly_rate' then 1 else 0 end,
      status = coalesce(nullif(p ->> 'status', ''), status), notes = coalesce(p ->> 'notes', notes) where id = b.id returning * into b;
  end if;
  return jsonb_build_object('id', b.id, 'rate_version', b.rate_version);
end $$;

create or replace function public.room_allocate(p_block uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare b public.accommodation_blocks; e public.events; nf date; nt date; full_night date; ra public.room_allocations; who text;
  party uuid := nullif(p ->> 'party_id', '')::uuid; crew uuid := nullif(p ->> 'crew_id', '')::uuid; guest uuid := nullif(p ->> 'guest_id', '')::uuid;
begin
  select * into b from public.accommodation_blocks where id = p_block for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(b.event_id);
  if b.status in ('released','cancelled') then raise exception 'block_closed' using errcode = '22023'; end if;
  if b.cutoff_date is not null and current_date > b.cutoff_date then raise exception 'block_past_cutoff' using errcode = '22023', detail = 'Cut-off was ' || b.cutoff_date; end if;
  nf := coalesce(nullif(p ->> 'nights_from', '')::date, b.check_in); nt := coalesce(nullif(p ->> 'nights_to', '')::date, b.check_out);
  if nf < b.check_in or nt > b.check_out or nt <= nf then raise exception 'outside_block_dates' using errcode = '22023'; end if;
  if party is not null and not exists (select 1 from public.event_parties x where x.id = party and x.event_id = e.id) then raise exception 'party_not_in_event' using errcode = '22023'; end if;
  if crew is not null and not exists (select 1 from public.crew_members x where x.id = crew and x.workspace_id = e.workspace_id) then raise exception 'crew_not_in_workspace' using errcode = '42501'; end if;
  if guest is not null and not exists (select 1 from public.guests x where x.id = guest and x.event_id = e.id) then raise exception 'guest_not_in_event' using errcode = '22023'; end if;
  who := lower(btrim(coalesce(p ->> 'occupant_name', '')));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rooms:' || e.id::text, 0));
  if exists (select 1 from public.room_allocations r where r.event_id = e.id and r.status <> 'cancelled' and daterange(r.nights_from, r.nights_to, '[)') && daterange(nf, nt, '[)')
      and ((party is not null and r.party_id = party and lower(btrim(r.occupant_name)) = who) or (crew is not null and r.crew_id = crew) or (guest is not null and r.guest_id = guest)
           or (party is null and crew is null and guest is null and lower(btrim(r.occupant_name)) = who))) then
    raise exception 'duplicate_room_allocation' using errcode = '23P01'; end if;
  select n::date into full_night from generate_series(nf, nt - 1, interval '1 day') n
    where (select count(*) from public.room_allocations r where r.block_id = b.id and r.status <> 'cancelled' and n::date >= r.nights_from and n::date < r.nights_to) >= b.rooms_total
    order by n limit 1;
  if full_night is not null then raise exception 'rooms_full' using errcode = '23P01', detail = json_build_object('night', full_night, 'rooms_total', b.rooms_total)::text; end if;
  insert into public.room_allocations(block_id, event_id, occupant_kind, occupant_name, party_id, crew_id, guest_id, room_type, nights_from, nights_to, status, nightly_rate, currency, rate_version, cost)
    values (b.id, e.id, coalesce(nullif(p ->> 'occupant_kind', ''), 'other'), btrim(coalesce(p ->> 'occupant_name', '')), party, crew, guest, coalesce(p ->> 'room_type', ''), nf, nt,
      coalesce(nullif(p ->> 'status', ''), 'held'), b.nightly_rate, b.currency, b.rate_version, b.nightly_rate * (nt - nf)) returning * into ra;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'logistics.room_allocated',
    jsonb_build_object('event_id', e.id, 'block_id', b.id, 'allocation_id', ra.id, 'nights', nt - nf, 'cost', ra.cost));
  return jsonb_build_object('id', ra.id, 'cost', ra.cost, 'currency', ra.currency);
end $$;

create or replace function public.room_cancel(p_allocation uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare ra public.room_allocations;
begin
  select * into ra from public.room_allocations where id = p_allocation for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.ops_event_require(ra.event_id);
  update public.room_allocations set status = 'cancelled' where id = ra.id;
end $$;

-- Venue bays are managed by the venue's own team (listing workspace); event-scoped bays by the event's managers.
create or replace function public.loading_bay_save(p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare b public.loading_bays; ws uuid; lst uuid := nullif(p ->> 'listing_id', '')::uuid; ev uuid := nullif(p ->> 'event_id', '')::uuid;
begin
  if p_id is not null then
    select * into b from public.loading_bays where id = p_id for update;
    if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
    lst := b.listing_id; ev := b.event_id;
  end if;
  if lst is not null then
    select l.workspace_id into ws from public.listings l where l.id = lst;
    if ws is null or not public.has_workspace_role(ws, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
    ev := null;
  elsif ev is not null then
    ws := (public.ops_event_require(ev)).workspace_id;
  else raise exception 'listing_or_event_required' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.loading_bays(workspace_id, listing_id, event_id, name, max_vehicle, max_length_m, turnaround_minutes, access_route, notes)
      values (ws, lst, ev, btrim(coalesce(p ->> 'name', '')), coalesce(p ->> 'max_vehicle', ''), nullif(p ->> 'max_length_m', '')::numeric,
        coalesce(nullif(p ->> 'turnaround_minutes', '')::int, 0), coalesce(p ->> 'access_route', ''), coalesce(p ->> 'notes', '')) returning * into b;
  else
    update public.loading_bays set name = coalesce(nullif(btrim(p ->> 'name'), ''), name), max_vehicle = coalesce(p ->> 'max_vehicle', max_vehicle),
      max_length_m = coalesce(nullif(p ->> 'max_length_m', '')::numeric, max_length_m), turnaround_minutes = coalesce(nullif(p ->> 'turnaround_minutes', '')::int, turnaround_minutes),
      access_route = coalesce(p ->> 'access_route', access_route), notes = coalesce(p ->> 'notes', notes), status = coalesce(nullif(p ->> 'status', ''), status)
      where id = b.id returning * into b;
  end if;
  return jsonb_build_object('id', b.id);
end $$;

create or replace function public.logistics_window_book(p_event uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; w public.logistics_windows; bay public.loading_bays; v_bay uuid := nullif(p ->> 'bay_id', '')::uuid; s timestamptz; f timestamptz;
begin
  e := public.ops_event_require(p_event);
  if p_id is not null then
    select * into w from public.logistics_windows where id = p_id and event_id = e.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not (p ? 'bay_id') then v_bay := w.bay_id; end if;
  end if;
  if v_bay is not null then
    select * into bay from public.loading_bays b where b.id = v_bay and b.status = 'active' and (b.event_id = e.id or (b.listing_id is not null and (b.listing_id = e.venue_listing_id
      or exists (select 1 from public.build_items x where x.event_id = e.id and x.category = 'venue' and x.listing_id = b.listing_id and x.status not in ('cancelled','declined','unavailable','expired')))));
    if not found then raise exception 'bay_not_at_venue' using errcode = '22023'; end if;
  end if;
  s := coalesce(nullif(p ->> 'starts_at', '')::timestamptz, w.starts_at); f := coalesce(nullif(p ->> 'ends_at', '')::timestamptz, w.ends_at);
  if s is null or f is null or f <= s then raise exception 'invalid_window' using errcode = '22023'; end if;
  if nullif(p ->> 'build_item_id', '') is not null and not exists (select 1 from public.build_items x where x.id = (p ->> 'build_item_id')::uuid and x.event_id = e.id) then raise exception 'booking_not_in_event' using errcode = '22023'; end if;
  if nullif(p ->> 'party_id', '') is not null and not exists (select 1 from public.event_parties x where x.id = (p ->> 'party_id')::uuid and x.event_id = e.id) then raise exception 'party_not_in_event' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.logistics_windows(event_id, workspace_id, bay_id, kind, party_id, build_item_id, supplier_name, starts_at, ends_at, busy_until, vehicle, access_route, storage_area, status, notes)
      values (e.id, e.workspace_id, v_bay, p ->> 'kind', nullif(p ->> 'party_id', '')::uuid, nullif(p ->> 'build_item_id', '')::uuid, coalesce(p ->> 'supplier_name', ''), s, f,
        f + make_interval(mins => coalesce(bay.turnaround_minutes, 0)), coalesce(p ->> 'vehicle', ''), coalesce(nullif(p ->> 'access_route', ''), bay.access_route, ''),
        coalesce(p ->> 'storage_area', ''), coalesce(nullif(p ->> 'status', ''), 'requested'), coalesce(p ->> 'notes', '')) returning * into w;
  else
    update public.logistics_windows set bay_id = v_bay, starts_at = s, ends_at = f, busy_until = f + make_interval(mins => coalesce(bay.turnaround_minutes, 0)),
      kind = coalesce(nullif(p ->> 'kind', ''), kind), supplier_name = coalesce(p ->> 'supplier_name', supplier_name), vehicle = coalesce(p ->> 'vehicle', vehicle),
      access_route = coalesce(p ->> 'access_route', access_route), storage_area = coalesce(p ->> 'storage_area', storage_area),
      status = coalesce(nullif(p ->> 'status', ''), status), notes = coalesce(p ->> 'notes', notes) where id = w.id returning * into w;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'logistics.window_booked',
    jsonb_build_object('event_id', e.id, 'window_id', w.id, 'bay_id', w.bay_id, 'kind', w.kind, 'status', w.status));
  return jsonb_build_object('id', w.id, 'status', w.status, 'busy_until', w.busy_until);
exception when exclusion_violation then
  raise exception 'loading_slot_taken' using errcode = '23P01', detail = 'The bay is already booked (including turnaround) for an overlapping time.';
end $$;

-- ═══ 7. Read models ═══
create or replace function public.event_logistics_overview(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; mgr boolean;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  mgr := public.can_manage_event(p_event);
  return jsonb_build_object(
    'transport', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'status', m.status, 'from', m.from_place, 'to', m.to_place, 'pickup', m.pickup_point,
        'departs_at', m.departs_at, 'arrives_at', m.arrives_at, 'passengers', m.passengers, 'vehicle', coalesce(nullif(m.vehicle_label, ''), (select q.name from public.provider_equipment q where q.id = m.vehicle_equipment_id)),
        'party', (select x.name from public.event_parties x where x.id = m.party_id), 'private', case when mgr then (select to_jsonb(t) - 'movement_id' - 'event_id' - 'updated_by' from public.transport_private t where t.movement_id = m.id) end)
        order by m.departs_at) from public.transport_movements m where m.event_id = e.id and m.status <> 'cancelled'), '[]'),
    'parking', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'capacity', a.capacity, 'accessible_spaces', a.accessible_spaces,
        'issued', (select count(*) from public.parking_permits x where x.area_id = a.id and x.status = 'issued'),
        'accessible_issued', (select count(*) from public.parking_permits x where x.area_id = a.id and x.status = 'issued' and x.accessible), 'access_route', a.access_route) order by a.name)
        from public.parking_areas a where a.event_id = e.id), '[]'),
    'accommodation', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'hotel', b.hotel_name, 'rooms_total', b.rooms_total, 'check_in', b.check_in, 'check_out', b.check_out, 'cutoff', b.cutoff_date, 'status', b.status,
        'room_nights_allocated', (select coalesce(sum(r.nights_to - r.nights_from), 0) from public.room_allocations r where r.block_id = b.id and r.status <> 'cancelled'),
        'room_nights_total', b.rooms_total * (b.check_out - b.check_in),
        'cost', (select coalesce(sum(r.cost), 0) from public.room_allocations r where r.block_id = b.id and r.status <> 'cancelled'), 'currency', b.currency) order by b.check_in)
        from public.accommodation_blocks b where b.event_id = e.id), '[]'),
    'windows', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'kind', w.kind, 'status', w.status, 'bay', (select y.name from public.loading_bays y where y.id = w.bay_id),
        'starts_at', w.starts_at, 'ends_at', w.ends_at, 'supplier', coalesce(nullif(w.supplier_name, ''), (select x.title from public.build_items x where x.id = w.build_item_id)),
        'access_route', w.access_route, 'storage_area', w.storage_area) order by w.starts_at) from public.logistics_windows w where w.event_id = e.id and w.status <> 'cancelled'), '[]'));
end $$;

-- Attendee / portal view: public shuttle information for ticket holders and guests, plus the caller's own assignments.
create or replace function public.my_event_travel(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); em text; attendee boolean;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select lower(email) into em from auth.users where id = uid;
  attendee := exists (select 1 from public.tickets t where t.event_id = p_event and t.holder_id = uid and t.status in ('valid','used','transferred'))
    or exists (select 1 from public.guests g where g.event_id = p_event and lower(g.email) = em and g.status <> 'declined')
    or public.can_access_event(p_event);
  return jsonb_build_object(
    'shuttles', case when attendee then coalesce((select jsonb_agg(jsonb_build_object('from', m.from_place, 'to', m.to_place, 'pickup', m.pickup_point, 'departs_at', m.departs_at, 'arrives_at', m.arrives_at) order by m.departs_at)
      from public.transport_movements m where m.event_id = p_event and m.public_info and m.status in ('planned','confirmed')), '[]') else '[]' end,
    'my_transport', coalesce((select jsonb_agg(jsonb_build_object('from', m.from_place, 'to', m.to_place, 'pickup', m.pickup_point, 'departs_at', m.departs_at, 'arrives_at', m.arrives_at, 'status', m.status) order by m.departs_at)
      from public.transport_movements m join public.event_parties x on x.id = m.party_id where m.event_id = p_event and x.portal_user_id = uid and m.status <> 'cancelled'), '[]'),
    'my_rooms', coalesce((select jsonb_agg(jsonb_build_object('hotel', b.hotel_name, 'address', b.address, 'nights_from', r.nights_from, 'nights_to', r.nights_to, 'status', r.status))
      from public.room_allocations r join public.accommodation_blocks b on b.id = r.block_id join public.event_parties x on x.id = r.party_id where r.event_id = p_event and x.portal_user_id = uid and r.status <> 'cancelled'), '[]'),
    'my_parking', coalesce((select jsonb_agg(jsonb_build_object('area', a.name, 'code', pm.code, 'valid_from', pm.valid_from, 'valid_to', pm.valid_to, 'access_route', a.access_route))
      from public.parking_permits pm join public.parking_areas a on a.id = pm.area_id join public.event_parties x on x.id = pm.party_id where pm.event_id = p_event and x.portal_user_id = uid and pm.status = 'issued'), '[]'));
end $$;

-- ═══ 8. Checks: logistics constraints → feasibility / readiness / conflicts ═══
create or replace function public.event_ops_checks_logistics(p_event uuid)
returns table(domain text, key text, severity text, message text, fix text, ref_id uuid, conflict boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare e public.events; base text; days numeric;
begin
  select * into e from public.events ev where ev.id = p_event;
  if not found or e.workspace_id is null then return; end if;
  base := '/organizer/events/' || e.id;
  days := case when e.starts_at is null then null else extract(epoch from (e.starts_at - now())) / 86400 end;
  -- Talent arrival vs first slot (minus the party's buffer).
  return query select 'logistics', 'talent_late_arrival', 'blocker',
      p.name || ' arrives ' || to_char(a.arr at time zone coalesce(nullif(e.timezone, ''), 'Europe/London'), 'HH24:MI') || ' but is on at ' || to_char(sl.first_start at time zone coalesce(nullif(e.timezone, ''), 'Europe/London'), 'HH24:MI')
        || ' (needs ' || p.arrival_buffer_minutes || ' min before).', base || '?tab=operations&section=logistics', p.id, true
    from public.event_parties p
      join lateral (select min(i.starts_at) first_start from public.event_party_slots s join public.programme_items i on i.id = s.programme_item_id where s.party_id = p.id and s.status <> 'cancelled') sl on sl.first_start is not null
      join lateral (select max(m.arrives_at) arr from public.transport_movements m where m.party_id = p.id and m.status <> 'cancelled' and m.arrives_at <= sl.first_start + interval '12 hours') a on a.arr is not null
    where p.event_id = e.id and p.status = 'confirmed' and a.arr > sl.first_start - make_interval(mins => p.arrival_buffer_minutes);
  -- Accepted travel rider needs transport / rooms.
  return query select distinct on (p.id) 'logistics', 'talent_no_transport', case when days is not null and days < 3 then 'blocker' else 'warning' end,
      p.name || '''s travel rider asks for ' || i.category || ' but no transport is planned.', base || '?tab=operations&section=logistics', p.id, false
    from public.event_parties p join public.talent_riders t on t.party_id = p.id and t.status = 'accepted' join public.talent_rider_items i on i.rider_id = t.id
    where p.event_id = e.id and p.status = 'confirmed' and i.required and i.category in ('ground_transport','flights') and i.fulfilment_status not in ('confirmed','substituted','not_needed')
      and not exists (select 1 from public.transport_movements m where m.party_id = p.id and m.status <> 'cancelled');
  return query select distinct on (p.id) 'logistics', 'talent_no_room', case when days is not null and days < 7 then 'blocker' else 'warning' end,
      p.name || '''s rider asks for accommodation but no room is allocated.', base || '?tab=operations&section=logistics', p.id, false
    from public.event_parties p join public.talent_riders t on t.party_id = p.id and t.status = 'accepted' join public.talent_rider_items i on i.rider_id = t.id
    where p.event_id = e.id and p.status = 'confirmed' and i.required and i.category = 'accommodation' and i.fulfilment_status not in ('confirmed','substituted','not_needed')
      and not exists (select 1 from public.room_allocations r where r.party_id = p.id and r.status <> 'cancelled');
  -- Room blocks near cut-off with unallocated room-nights.
  return query select 'logistics', 'rooms_cutoff', case when b.cutoff_date - current_date <= 1 then 'blocker' else 'warning' end,
      b.hotel_name || ': ' || (b.rooms_total * (b.check_out - b.check_in) - coalesce(z.used, 0)) || ' room-night(s) unallocated, cut-off ' || to_char(b.cutoff_date, 'FMDD Mon') || '. Allocate or release them.',
      base || '?tab=operations&section=logistics', b.id, false
    from public.accommodation_blocks b left join lateral (select sum(r.nights_to - r.nights_from) used from public.room_allocations r where r.block_id = b.id and r.status <> 'cancelled') z on true
    where b.event_id = e.id and b.status in ('provisional','confirmed') and b.cutoff_date is not null and b.cutoff_date between current_date and current_date + 3
      and b.rooms_total * (b.check_out - b.check_in) > coalesce(z.used, 0);
  -- Deliveries / load-in finishing after doors; collections before the event ends.
  return query select 'logistics', 'delivery_after_start', 'warning',
      initcap(replace(w.kind, '_', '-')) || ' for ' || coalesce(nullif(w.supplier_name, ''), (select x.title from public.build_items x where x.id = w.build_item_id), 'a supplier') || ' ends after the event starts.',
      base || '?tab=operations&section=logistics', w.id, true
    from public.logistics_windows w where w.event_id = e.id and w.status in ('requested','confirmed') and w.kind in ('delivery','load_in') and e.starts_at is not null and w.ends_at > e.starts_at;
  return query select 'logistics', 'collection_before_end', 'warning',
      initcap(replace(w.kind, '_', '-')) || ' for ' || coalesce(nullif(w.supplier_name, ''), (select x.title from public.build_items x where x.id = w.build_item_id), 'a supplier') || ' starts before the event ends.',
      base || '?tab=operations&section=logistics', w.id, true
    from public.logistics_windows w where w.event_id = e.id and w.status in ('requested','confirmed') and w.kind in ('collection','load_out') and e.ends_at is not null and w.starts_at < e.ends_at;
  -- Requested (unconfirmed) windows close to the event; confirmed suppliers without an access slot once logistics are planned.
  return query select 'logistics', 'window_unconfirmed', case when days is not null and days < 1 then 'blocker' else 'warning' end,
      'Access slot ' || to_char(w.starts_at at time zone coalesce(nullif(e.timezone, ''), 'Europe/London'), 'Dy HH24:MI') || ' is not confirmed by the venue yet.', base || '?tab=operations&section=logistics', w.id, false
    from public.logistics_windows w where w.event_id = e.id and w.status = 'requested' and days is not null and days < 3;
  return query select 'logistics', 'supplier_no_access_slot', 'warning', b.title || ' has no delivery / load-in slot.', base || '?tab=operations&section=logistics', b.id, false
    from public.build_items b where b.event_id = e.id and b.category <> 'venue' and b.status in ('confirmed','active') and days is not null and days < 7
      and exists (select 1 from public.logistics_windows w where w.event_id = e.id and w.status <> 'cancelled')
      and not exists (select 1 from public.logistics_windows w where w.build_item_id = b.id and w.status <> 'cancelled' and w.kind in ('delivery','load_in'));
  -- Same person on overlapping movements.
  return query select distinct on (m.id) 'logistics', 'transport_overlap', 'warning',
      coalesce((select x.name from public.event_parties x where x.id = m.party_id), (select c.name from public.crew_members c where c.id = m.crew_id)) || ' has overlapping transport.',
      base || '?tab=operations&section=logistics', m.id, true
    from public.transport_movements m join public.transport_movements o on o.id <> m.id and o.status <> 'cancelled'
      and ((m.party_id is not null and o.party_id = m.party_id) or (m.crew_id is not null and o.crew_id = m.crew_id))
      and tstzrange(o.departs_at, o.arrives_at, '[)') && tstzrange(m.departs_at, m.arrives_at, '[)')
    where m.event_id = e.id and m.status <> 'cancelled';
end $$;

-- event_ops_checks (Q24) becomes the partners checker; the dispatcher unions the per-domain checkers (Q26 adds compliance).
do $$ begin
  if to_regprocedure('public.event_ops_checks_partners(uuid)') is null then
    alter function public.event_ops_checks(uuid) rename to event_ops_checks_partners;
  end if;
end $$;
create or replace function public.event_ops_checks(p_event uuid)
returns table(domain text, key text, severity text, message text, fix text, ref_id uuid, conflict boolean)
language sql stable security definer set search_path = '' as $$
  select * from public.event_ops_checks_partners(p_event)
  union all select * from public.event_ops_checks_logistics(p_event);
$$;

-- ═══ 9. Catalogue + grants ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description) values
  ('logistics.transport_saved', 1, 'logistics', 'A transport movement was planned or changed; vehicles are locked via the Q12 resource lock (payload: event_id, movement_id, kind, status).'),
  ('logistics.parking_permit_issued', 1, 'logistics', 'A parking permit was issued within area / accessible capacity (payload: event_id, area_id, permit_id, accessible).'),
  ('logistics.room_allocated', 1, 'logistics', 'A room was allocated from a block with a cost snapshot (payload: event_id, block_id, allocation_id, nights, cost).'),
  ('logistics.window_booked', 1, 'logistics', 'A delivery / collection / load-in / load-out / storage window was booked (payload: event_id, window_id, bay_id, kind, status).')
on conflict (event_type) do update set aggregate = excluded.aggregate, description = excluded.description, updated_at = now();

revoke all on function public.event_ops_checks_partners(uuid), public.event_ops_checks_logistics(uuid), public.event_ops_checks(uuid) from public, anon, authenticated;
grant execute on function public.event_ops_checks_partners(uuid), public.event_ops_checks_logistics(uuid), public.event_ops_checks(uuid) to service_role;
revoke all on function public.transport_save(uuid, jsonb, uuid), public.parking_area_save(uuid, jsonb, uuid), public.parking_issue_permit(uuid, jsonb), public.parking_revoke_permit(uuid, text),
  public.accommodation_block_save(uuid, jsonb, uuid), public.room_allocate(uuid, jsonb), public.room_cancel(uuid), public.loading_bay_save(jsonb, uuid),
  public.logistics_window_book(uuid, jsonb, uuid), public.event_logistics_overview(uuid), public.my_event_travel(uuid) from public, anon;
grant execute on function public.transport_save(uuid, jsonb, uuid), public.parking_area_save(uuid, jsonb, uuid), public.parking_issue_permit(uuid, jsonb), public.parking_revoke_permit(uuid, text),
  public.accommodation_block_save(uuid, jsonb, uuid), public.room_allocate(uuid, jsonb), public.room_cancel(uuid), public.loading_bay_save(jsonb, uuid),
  public.logistics_window_book(uuid, jsonb, uuid), public.event_logistics_overview(uuid), public.my_event_travel(uuid) to authenticated, service_role;
