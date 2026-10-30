-- Q11 Venue / Q12 Supplier management (lane A, 2026-10-29). Additive. Seeds nothing (demo data is Q38).
--  1. Equipment (card 78): provider_equipment inventory + job_equipment_allocations with a locked availability check
--     (overlapping reserved quantity ≤ stock; maintenance/retired stock is unavailable; per-item block|warn policy).
--  2. Service areas + travel fees (cards 76.3, 79.1–79.3): service_areas and service_area_quote() (haversine distance).
--  3. Job evidence (80.6–80.7): provider_job_evidence (delivery/completion/damage), written by RPC.
--  4. Job profitability (80.8): view provider_job_profitability (security_invoker) = net payout − crew cost − equipment cost.
--  5. Q01 finding: workspaces.capabilities was writable by any owner via REST. Client writes are now limited to valid values
--     and to onboarding; afterwards capabilities change only through provider_save_settings (which checks published listings).

-- ─── 1. Equipment ───────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.provider_equipment (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  category text not null default 'general' check (length(category) <= 60),
  quantity integer not null default 1 check (quantity between 0 and 100000),
  day_cost numeric not null default 0 check (day_cost >= 0),
  status text not null default 'active' check (status in ('active','maintenance','retired')),
  conflict_policy text not null default 'block' check (conflict_policy in ('block','warn')),
  details jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists provider_equipment_ws_idx on public.provider_equipment(workspace_id, status);
create table if not exists public.job_equipment_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.provider_jobs(id) on delete cascade,
  equipment_id uuid not null references public.provider_equipment(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 100000),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'reserved' check (status in ('reserved','released')),
  warning text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists job_equipment_alloc_equipment_idx on public.job_equipment_allocations(equipment_id, starts_at) where status = 'reserved';
create index if not exists job_equipment_alloc_job_idx on public.job_equipment_allocations(job_id);

create or replace function public.enforce_equipment_capacity()
returns trigger language plpgsql set search_path to '' as $$
declare eq public.provider_equipment; used integer;
begin
  if new.status <> 'reserved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'reserved' and old.quantity >= new.quantity and old.starts_at = new.starts_at and old.ends_at = new.ends_at
     and old.equipment_id = new.equipment_id then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('equipment_capacity:' || new.equipment_id::text, 0));
  select * into eq from public.provider_equipment where id = new.equipment_id;
  if eq.workspace_id <> new.workspace_id then raise exception 'not_authorized' using errcode = '42501'; end if;
  if eq.status <> 'active' then raise exception 'equipment_unavailable' using errcode = '23P01', detail = eq.status; end if;
  select coalesce(sum(a.quantity), 0) into used from public.job_equipment_allocations a
    where a.equipment_id = new.equipment_id and a.status = 'reserved' and a.id <> new.id and tstzrange(a.starts_at, a.ends_at) && tstzrange(new.starts_at, new.ends_at);
  new.warning := null;
  if used + new.quantity > eq.quantity then
    if eq.conflict_policy = 'block' then raise exception 'equipment_conflict' using errcode = '23P01', detail = format('%s of %s in use', used, eq.quantity); end if;
    new.warning := format('over-allocated: %s of %s in use', used + new.quantity, eq.quantity);
  end if;
  return new;
end $$;
drop trigger if exists job_equipment_capacity on public.job_equipment_allocations;
create trigger job_equipment_capacity before insert or update on public.job_equipment_allocations for each row execute function public.enforce_equipment_capacity();

-- ─── 2. Service areas ───────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.service_areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  label text not null default '' check (length(label) <= 120),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_km numeric not null check (radius_km > 0 and radius_km <= 2000),
  free_radius_km numeric not null default 0 check (free_radius_km >= 0),
  fee_per_km numeric not null default 0 check (fee_per_km >= 0),
  min_travel_fee numeric not null default 0 check (min_travel_fee >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_areas_ws_idx on public.service_areas(workspace_id, listing_id) where active;

create or replace function public.geo_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path to '' as $$
  select 6371.0 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Coverage + travel fee for a service listing at a location: nearest active area for the listing (or workspace-wide).
create or replace function public.service_area_quote(p_listing uuid, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare ws uuid; a record;
begin
  select l.workspace_id into ws from public.listings l where l.id = p_listing and (l.published or public.is_workspace_member(l.workspace_id));
  if ws is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select s.*, public.geo_distance_km(s.lat, s.lng, p_lat, p_lng) d into a from public.service_areas s
    where s.workspace_id = ws and s.active and (s.listing_id = p_listing or s.listing_id is null) order by (s.listing_id is null), d limit 1;
  if a.id is null then return jsonb_build_object('configured', false, 'covered', null); end if;
  return jsonb_build_object('configured', true, 'covered', a.d <= a.radius_km, 'distance_km', round(a.d::numeric, 1), 'area', a.label,
    'travel_fee', case when a.d <= a.free_radius_km then 0 else greatest(a.min_travel_fee, round(((a.d - a.free_radius_km) * a.fee_per_km)::numeric, 2)) end);
end $$;

-- ─── 3. Job evidence ────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.provider_job_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.provider_jobs(id) on delete cascade,
  kind text not null check (kind in ('delivery','setup','completion','damage','other')),
  note text not null default '' check (length(note) <= 2000),
  storage_path text check (storage_path is null or (length(storage_path) <= 500 and storage_path !~ '\.\.')),
  captured_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists provider_job_evidence_job_idx on public.provider_job_evidence(job_id, created_at);

-- ─── RLS / grants for new tables (reads: workspace members; evidence also the booking's buyer) ──────────────────────
alter table public.provider_equipment enable row level security;
alter table public.job_equipment_allocations enable row level security;
alter table public.service_areas enable row level security;
alter table public.provider_job_evidence enable row level security;
drop policy if exists provider_equipment_member_read on public.provider_equipment;
create policy provider_equipment_member_read on public.provider_equipment for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists job_equipment_member_read on public.job_equipment_allocations;
create policy job_equipment_member_read on public.job_equipment_allocations for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists service_areas_member_read on public.service_areas;
create policy service_areas_member_read on public.service_areas for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists provider_job_evidence_read on public.provider_job_evidence;
create policy provider_job_evidence_read on public.provider_job_evidence for select to authenticated using (public.is_workspace_member(workspace_id)
  or exists(select 1 from public.provider_jobs j where j.id = job_id and j.event_id is not null and public.can_access_event(j.event_id)));
revoke all on table public.provider_equipment, public.job_equipment_allocations, public.service_areas, public.provider_job_evidence from public, anon, authenticated;
grant select on table public.provider_equipment, public.job_equipment_allocations, public.service_areas, public.provider_job_evidence to authenticated;
grant all on table public.provider_equipment, public.job_equipment_allocations, public.service_areas, public.provider_job_evidence to service_role;

-- ─── Commands ───────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.provider_save_equipment(p_ws uuid, p_equipment uuid, p jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare eid uuid;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  if p_equipment is null then
    insert into public.provider_equipment(workspace_id, name, category, quantity, day_cost, status, conflict_policy, details, created_by)
      values (p_ws, trim(p->>'name'), coalesce(nullif(p->>'category', ''), 'general'), coalesce((p->>'quantity')::int, 1), coalesce((p->>'day_cost')::numeric, 0),
        coalesce(nullif(p->>'status', ''), 'active'), coalesce(nullif(p->>'conflict_policy', ''), 'block'), coalesce(p->'details', '{}'), auth.uid())
      returning id into eid;
  else
    update public.provider_equipment set name = coalesce(trim(p->>'name'), name), category = coalesce(nullif(p->>'category', ''), category),
        quantity = coalesce((p->>'quantity')::int, quantity), day_cost = coalesce((p->>'day_cost')::numeric, day_cost), status = coalesce(nullif(p->>'status', ''), status),
        conflict_policy = coalesce(nullif(p->>'conflict_policy', ''), conflict_policy), details = coalesce(p->'details', details), updated_at = now()
      where id = p_equipment and workspace_id = p_ws returning id into eid;
    if eid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'equipment.saved', jsonb_build_object('equipment_id', eid));
  return eid;
end $$;

create or replace function public.provider_allocate_equipment(p_job uuid, p_equipment uuid, p_quantity integer default 1)
returns uuid language plpgsql security definer set search_path to '' as $$
declare j public.provider_jobs; aid uuid; err text; det text;
begin
  select * into j from public.provider_jobs where id = p_job;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(j.workspace_id, array['owner','manager']);
  if not exists(select 1 from public.provider_equipment where id = p_equipment and workspace_id = j.workspace_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if j.status not in ('held','confirmed','active') then raise exception 'job_not_live' using errcode = '22023'; end if;
  insert into public.job_equipment_allocations(workspace_id, job_id, equipment_id, quantity, starts_at, ends_at, created_by)
    values (j.workspace_id, j.id, p_equipment, greatest(coalesce(p_quantity, 1), 1), j.starts_at, j.ends_at, auth.uid()) returning id into aid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), j.workspace_id, 'equipment.allocated', jsonb_build_object('job_id', j.id, 'equipment_id', p_equipment, 'quantity', p_quantity));
  return aid;
exception when exclusion_violation then
  get stacked diagnostics err = message_text, det = pg_exception_detail;
  raise exception '%', err using errcode = '23P01', detail = coalesce(det, '');
end $$;

create or replace function public.provider_release_equipment(p_allocation uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare a public.job_equipment_allocations;
begin
  select * into a from public.job_equipment_allocations where id = p_allocation for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(a.workspace_id, array['owner','manager']);
  update public.job_equipment_allocations set status = 'released' where id = a.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), a.workspace_id, 'equipment.released', jsonb_build_object('allocation_id', a.id));
end $$;

-- Equipment and staff are freed when a job ends early (cancelled / completed / no-show).
create or replace function public.provider_job_release_resources()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status is distinct from old.status and new.status in ('cancelled','cancelled_by_customer','cancelled_by_provider','no_show') then
    update public.job_equipment_allocations set status = 'released' where job_id = new.id and status = 'reserved';
  end if;
  return null;
end $$;
drop trigger if exists provider_jobs_release_resources on public.provider_jobs;
create trigger provider_jobs_release_resources after update of status on public.provider_jobs for each row execute function public.provider_job_release_resources();

create or replace function public.provider_save_service_area(p_ws uuid, p_area uuid, p jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare sid uuid; lid uuid := nullif(p->>'listing_id', '')::uuid;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  if lid is not null and not exists(select 1 from public.listings where id = lid and workspace_id = p_ws and kind = 'service') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_area is null then
    insert into public.service_areas(workspace_id, listing_id, label, lat, lng, radius_km, free_radius_km, fee_per_km, min_travel_fee, active)
      values (p_ws, lid, coalesce(p->>'label', ''), (p->>'lat')::float8, (p->>'lng')::float8, (p->>'radius_km')::numeric, coalesce((p->>'free_radius_km')::numeric, 0),
        coalesce((p->>'fee_per_km')::numeric, 0), coalesce((p->>'min_travel_fee')::numeric, 0), coalesce((p->>'active')::boolean, true))
      returning id into sid;
  else
    update public.service_areas set listing_id = lid, label = coalesce(p->>'label', label), lat = coalesce((p->>'lat')::float8, lat), lng = coalesce((p->>'lng')::float8, lng),
        radius_km = coalesce((p->>'radius_km')::numeric, radius_km), free_radius_km = coalesce((p->>'free_radius_km')::numeric, free_radius_km),
        fee_per_km = coalesce((p->>'fee_per_km')::numeric, fee_per_km), min_travel_fee = coalesce((p->>'min_travel_fee')::numeric, min_travel_fee),
        active = coalesce((p->>'active')::boolean, active), updated_at = now()
      where id = p_area and workspace_id = p_ws returning id into sid;
    if sid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'service_area.saved', jsonb_build_object('area_id', sid));
  return sid;
end $$;

create or replace function public.provider_add_job_evidence(p_job uuid, p_kind text, p_note text default '', p_path text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare j public.provider_jobs; eid uuid;
begin
  select * into j from public.provider_jobs where id = p_job;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(j.workspace_id, array['owner','manager','member']);
  if p_path is not null and split_part(p_path, '/', 1) <> j.workspace_id::text and split_part(p_path, '/', 2) <> j.workspace_id::text then
    raise exception 'path_not_in_workspace' using errcode = '42501';  -- evidence must point at this workspace's own storage prefix
  end if;
  insert into public.provider_job_evidence(workspace_id, job_id, kind, note, storage_path, created_by)
    values (j.workspace_id, j.id, p_kind, left(coalesce(p_note, ''), 2000), p_path, auth.uid()) returning id into eid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), j.workspace_id, 'job.evidence_added', jsonb_build_object('job_id', j.id, 'kind', p_kind));
  return eid;
end $$;

-- ─── 4. Job profitability ───────────────────────────────────────────────────────────────────────────────────────────
create or replace view public.provider_job_profitability with (security_invoker = true) as
  select j.id as job_id, j.workspace_id, j.reference, j.mode, j.status, j.starts_at, j.value, j.platform_fee, j.net_payout,
    coalesce(c.crew_cost, 0) as crew_cost, coalesce(q.equipment_cost, 0) as equipment_cost,
    j.net_payout - coalesce(c.crew_cost, 0) - coalesce(q.equipment_cost, 0) as margin,
    case when j.value > 0 then round(((j.net_payout - coalesce(c.crew_cost, 0) - coalesce(q.equipment_cost, 0)) / j.value * 100)::numeric, 1) end as margin_pct
  from public.provider_jobs j
  left join lateral (
    -- Crew day rate, pro rata on an 8-hour day, minimum half a day per shift.
    select sum(coalesce(m.day_rate, 0) * greatest(0.5, extract(epoch from (s.ends_at - s.starts_at)) / 28800.0)) as crew_cost
    from public.shifts s join public.crew_members m on m.id = s.crew_id where s.job_id = j.id and s.status in ('pending','confirmed')) c on true
  left join lateral (
    select sum(a.quantity * e.day_cost * greatest(1, ceil(extract(epoch from (a.ends_at - a.starts_at)) / 86400.0))) as equipment_cost
    from public.job_equipment_allocations a join public.provider_equipment e on e.id = a.equipment_id where a.job_id = j.id and a.status = 'reserved') q on true;
revoke all on table public.provider_job_profitability from public, anon, authenticated;
grant select on table public.provider_job_profitability to authenticated, service_role;

-- ─── 5. Capabilities only through the validated path ────────────────────────────────────────────────────────────────
create or replace function public.guard_workspace_capabilities()
returns trigger language plpgsql set search_path to '' as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;  -- definer RPCs (provider_save_settings) and the service role
  if not (coalesce(new.capabilities, '{}') <@ array['venue','service']::text[]) or (new.kind <> 'provider' and cardinality(coalesce(new.capabilities, '{}')) > 0) then
    raise exception 'invalid_capabilities' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.capabilities is distinct from old.capabilities and coalesce(old.onboarding_complete, false) then
    raise exception 'capabilities_use_settings' using errcode = '42501', hint = 'Change capabilities with provider_save_settings';
  end if;
  return new;
end $$;
drop trigger if exists workspaces_capability_guard on public.workspaces;
create trigger workspaces_capability_guard before insert or update on public.workspaces for each row execute function public.guard_workspace_capabilities();

do $$ declare f text; begin
  foreach f in array array['public.enforce_equipment_capacity()', 'public.provider_job_release_resources()', 'public.guard_workspace_capabilities()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.provider_save_equipment(uuid,uuid,jsonb)', 'public.provider_allocate_equipment(uuid,uuid,integer)', 'public.provider_release_equipment(uuid)',
      'public.provider_save_service_area(uuid,uuid,jsonb)', 'public.provider_add_job_evidence(uuid,text,text,text)', 'public.service_area_quote(uuid,double precision,double precision)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('equipment.allocated', 1, 'job', 'Equipment was allocated to a provider job.', null),
  ('job.evidence_added', 1, 'job', 'Delivery/completion evidence was added to a provider job.', null)
on conflict (event_type) do update set schema_version = excluded.schema_version, aggregate = excluded.aggregate, description = excluded.description, public_type = excluded.public_type, active = true, updated_at = now();
