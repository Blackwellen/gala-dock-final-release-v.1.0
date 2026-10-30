-- Q24 (lane C, 2026-10-29) — Sponsors / exhibitors / talent / riders (domains 150–153).
-- Additive and backward-compatible with the deployed code (new tables/functions only, plus two lane-C function bodies extended):
--   * event_parties: ONE canonical event-scoped record for every external commercial/talent party (sponsor, exhibitor, artist,
--     speaker, performer, host). Sponsors/exhibitors link to the Q16 CRM client; talent links to a reusable workspace
--     talent_profiles row. Lifecycle machine `event_party` (prospect → negotiating → confirmed → completed; cancelled/withdrawn).
--   * event_party_packages + event_package_benefits: sponsorship / exhibitor packages with structured benefits and a sell limit.
--     Confirming a party allocates the package under a row lock (package_sold_out), snapshots package + benefits onto the party
--     (later package edits never rewrite the deal) and generates deliverables and pass requests from the benefits.
--   * event_party_deliverables (+ append-only evidence): due dates, owed_by organiser|party, machine `party_deliverable`;
--     submission needs evidence when required; approval is a manager decision. Sponsor assets = deliverables owed by the party.
--   * exhibitor_booths: booth = Q19 map element BY REFERENCE (venue_map_id + map_element_ref; validated by the replaceable hook
--     map_element_exists()); one booth per element (booth/map conflict), optional Q18 access zone; allocation under lock.
--   * event_party_pass_requests: pass-allocation interface onto lane D's Q18 passes (issue_access_pass) — never writes their tables.
--   * talent schedule = event_party_slots → programme_items (tentative vs confirmed; confirmed double-booking refused under a
--     per-talent lock; blackout periods in talent_unavailability).
--   * talent_riders + talent_rider_items: structured technical / hospitality / travel riders, versioned, immutable once submitted,
--     accepted by the organiser (machine `talent_rider`); acceptance propagates required items into event tasks.
--   * contracts reuse Q16 (event_parties.contract_id, party_create_contract → contract_create); money reuses Q07 invoices /
--     event payments by reference (event_party_money) — payment behaviour unchanged.
--   * event_ops_checks(): one internal checker (Q24 now; Q25/Q26 migrations extend it). Feeds event_feasibility() (→ readiness),
--     operational_conflicts_internal() (→ Home / Calendar / Event / Agent) and event_ops_blockers() (hook for lane D's lifecycle).

-- ═══ 0. Shared helpers ═══
create or replace function public.ops_event_require(p_event uuid) returns public.events
language plpgsql stable security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_manage_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.workspace_id is null then raise exception 'organizer_events_only' using errcode = '22023'; end if;
  return e;
end $$;

create or replace function public.ops_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ═══ 1. Talent profiles (reusable roster) + blackout periods ═══
create table if not exists public.talent_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null default 'artist' check (kind in ('artist','band','dj','speaker','performer','host','other')),
  name text not null check (length(btrim(name)) between 1 and 160),
  bio text not null default '' check (length(bio) <= 4000),
  agent_name text not null default '' check (length(agent_name) <= 160),
  agent_email text not null default '' check (length(agent_email) <= 200),
  agent_phone text not null default '' check (length(agent_phone) <= 60),
  website text not null default '' check (length(website) <= 300),
  genres text[] not null default '{}',
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists talent_profiles_ws_name_idx on public.talent_profiles(workspace_id, lower(btrim(name))) where status = 'active';
alter table public.talent_profiles enable row level security;
drop policy if exists talent_profiles_read on public.talent_profiles;
create policy talent_profiles_read on public.talent_profiles for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists talent_profiles_write on public.talent_profiles;
create policy talent_profiles_write on public.talent_profiles for all to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','manager'])) with check (public.has_workspace_role(workspace_id, array['owner','manager']));
revoke all on table public.talent_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.talent_profiles to authenticated;
grant all on table public.talent_profiles to service_role;
drop trigger if exists talent_profiles_touch on public.talent_profiles;
create trigger talent_profiles_touch before update on public.talent_profiles for each row execute function public.ops_touch();

create table if not exists public.talent_unavailability (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  talent_profile_id uuid not null references public.talent_profiles(id) on delete cascade,
  kind text not null default 'blackout' check (kind in ('blackout','external_calendar','travel')),
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  note text not null default '' check (length(note) <= 300),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists talent_unavailability_profile_idx on public.talent_unavailability(talent_profile_id, starts_at);
alter table public.talent_unavailability enable row level security;
drop policy if exists talent_unavailability_read on public.talent_unavailability;
create policy talent_unavailability_read on public.talent_unavailability for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists talent_unavailability_write on public.talent_unavailability;
create policy talent_unavailability_write on public.talent_unavailability for all to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','manager']))
  with check (public.has_workspace_role(workspace_id, array['owner','manager'])
    and exists (select 1 from public.talent_profiles t where t.id = talent_profile_id and t.workspace_id = talent_unavailability.workspace_id));
revoke all on table public.talent_unavailability from public, anon, authenticated;
grant select, insert, update, delete on table public.talent_unavailability to authenticated;
grant all on table public.talent_unavailability to service_role;

-- ═══ 2. Packages + benefits ═══
create table if not exists public.event_party_packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('sponsorship','exhibitor')),
  name text not null check (length(btrim(name)) between 1 and 120),
  tier text not null default '' check (length(tier) <= 60),
  description text not null default '' check (length(description) <= 2000),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  quantity integer check (quantity is null or quantity between 1 and 10000),
  status text not null default 'active' check (status in ('draft','active','retired')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_party_packages_event_idx on public.event_party_packages(event_id, kind);
create table if not exists public.event_package_benefits (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.event_party_packages(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('logo_placement','booth','passes','stage_mention','speaking_slot','social_post','email_feature','hospitality','parking','signage','asset','other')),
  title text not null check (length(btrim(title)) between 1 and 160),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  pass_type text check (pass_type is null or pass_type in ('guest','staff','supplier','artist','vip','backstage','press')),
  owed_by text not null default 'organizer' check (owed_by in ('organizer','party')),
  due_days_before integer check (due_days_before is null or due_days_before between 0 and 365),
  evidence_required boolean not null default true,
  sort integer not null default 0,
  check (kind <> 'passes' or pass_type is not null)
);
create index if not exists event_package_benefits_pkg_idx on public.event_package_benefits(package_id, sort);

-- ═══ 3. Parties ═══
create table if not exists public.event_parties (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('sponsor','exhibitor','artist','speaker','performer','host')),
  name text not null check (length(btrim(name)) between 1 and 160),
  client_id uuid references public.clients(id) on delete set null,
  talent_profile_id uuid references public.talent_profiles(id) on delete set null,
  status text not null default 'prospect' check (status in ('prospect','negotiating','confirmed','completed','cancelled','withdrawn')),
  package_id uuid references public.event_party_packages(id) on delete restrict,
  package_snapshot jsonb,
  contract_id uuid references public.contracts(id) on delete set null,
  fee numeric(12,2) not null default 0 check (fee >= 0),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  contact_name text not null default '' check (length(contact_name) <= 160),
  contact_email text not null default '' check (length(contact_email) <= 200),
  contact_phone text not null default '' check (length(contact_phone) <= 60),
  portal_user_id uuid references auth.users(id) on delete set null,
  arrival_buffer_minutes integer not null default 60 check (arrival_buffer_minutes between 0 and 1440),
  notes text not null default '' check (length(notes) <= 2000),
  status_reason text not null default '' check (length(status_reason) <= 500),
  version integer not null default 1,
  confirmed_at timestamptz, closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind in ('sponsor','exhibitor') or package_id is null)
);
create index if not exists event_parties_event_idx on public.event_parties(event_id, kind, status);
create index if not exists event_parties_portal_idx on public.event_parties(portal_user_id) where portal_user_id is not null;
create index if not exists event_parties_talent_idx on public.event_parties(talent_profile_id) where talent_profile_id is not null;
drop trigger if exists event_parties_touch on public.event_parties;
create trigger event_parties_touch before update on public.event_parties for each row execute function public.ops_touch();

insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('event_party', 'event_parties', 'status', 'enforce', array['prospect','negotiating'], array['completed','cancelled','withdrawn'])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'event_party';
insert into public.state_transitions(machine, from_state, to_state) values
  ('event_party','prospect','negotiating'), ('event_party','prospect','confirmed'), ('event_party','prospect','withdrawn'), ('event_party','prospect','cancelled'),
  ('event_party','negotiating','prospect'), ('event_party','negotiating','confirmed'), ('event_party','negotiating','withdrawn'), ('event_party','negotiating','cancelled'),
  ('event_party','confirmed','completed'), ('event_party','confirmed','cancelled');
drop trigger if exists event_parties_state_guard on public.event_parties;
create trigger event_parties_state_guard before insert or update of status on public.event_parties for each row execute function public.enforce_state_transition('event_party', 'status');

create or replace function public.party_portal_user(p_party uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_parties p where p.id = p_party and p.portal_user_id = (select auth.uid()) and p.status not in ('cancelled','withdrawn'));
$$;

-- ═══ 4. Deliverables + evidence ═══
create table if not exists public.event_party_deliverables (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.event_parties(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  benefit_id uuid,
  kind text not null default 'other',
  title text not null check (length(btrim(title)) between 1 and 160),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  owed_by text not null default 'organizer' check (owed_by in ('organizer','party')),
  due_at timestamptz,
  evidence_required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','in_progress','submitted','approved','rejected','waived')),
  decision_note text not null default '' check (length(decision_note) <= 1000),
  decided_by uuid references auth.users(id) on delete set null, decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_party_deliverables_party_idx on public.event_party_deliverables(party_id, status);
create index if not exists event_party_deliverables_due_idx on public.event_party_deliverables(event_id, due_at) where status not in ('approved','waived');
create unique index if not exists event_party_deliverables_benefit_idx on public.event_party_deliverables(party_id, benefit_id) where benefit_id is not null;
drop trigger if exists event_party_deliverables_touch on public.event_party_deliverables;
create trigger event_party_deliverables_touch before update on public.event_party_deliverables for each row execute function public.ops_touch();

insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('party_deliverable', 'event_party_deliverables', 'status', 'enforce', array['pending'], array[]::text[])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'party_deliverable';
insert into public.state_transitions(machine, from_state, to_state) values
  ('party_deliverable','pending','in_progress'), ('party_deliverable','pending','submitted'), ('party_deliverable','pending','waived'),
  ('party_deliverable','in_progress','pending'), ('party_deliverable','in_progress','submitted'), ('party_deliverable','in_progress','waived'),
  ('party_deliverable','submitted','approved'), ('party_deliverable','submitted','rejected'),
  ('party_deliverable','rejected','in_progress'), ('party_deliverable','rejected','submitted'), ('party_deliverable','rejected','waived'),
  ('party_deliverable','waived','pending');
drop trigger if exists event_party_deliverables_state_guard on public.event_party_deliverables;
create trigger event_party_deliverables_state_guard before insert or update of status on public.event_party_deliverables for each row execute function public.enforce_state_transition('party_deliverable', 'status');

create table if not exists public.event_deliverable_evidence (
  id bigint generated always as identity primary key,
  deliverable_id uuid not null references public.event_party_deliverables(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('file','media','url','note')),
  storage_path text check (storage_path is null or length(storage_path) <= 500),
  media_asset_id uuid references public.media_assets(id) on delete set null,
  url text check (url is null or (length(url) <= 600 and url ~* '^https://')),
  note text not null default '' check (length(note) <= 1000),
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  at timestamptz not null default now()
);
create index if not exists event_deliverable_evidence_idx on public.event_deliverable_evidence(deliverable_id, at);

-- ═══ 5. Booths (map element by reference) ═══
-- Hook for lane A's Q19 map engine: replace this body when elements move out of venue_maps.structure/overlay.
create or replace function public.map_element_exists(p_map uuid, p_ref text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.venue_maps m where m.id = p_map and (
    jsonb_path_exists(m.structure, '$.** ? (@.id == $r)', jsonb_build_object('r', p_ref))
    or jsonb_path_exists(m.overlay, '$.** ? (@.id == $r)', jsonb_build_object('r', p_ref))));
$$;

create table if not exists public.exhibitor_booths (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null check (length(btrim(code)) between 1 and 40),
  name text not null default '' check (length(name) <= 120),
  package_id uuid references public.event_party_packages(id) on delete set null,
  width_m numeric(6,2) check (width_m is null or width_m > 0),
  depth_m numeric(6,2) check (depth_m is null or depth_m > 0),
  power_kw numeric(6,2) check (power_kw is null or power_kw >= 0),
  features text[] not null default '{}',
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  venue_map_id uuid references public.venue_maps(id) on delete set null,
  map_element_ref text check (map_element_ref is null or length(map_element_ref) between 1 and 120),
  zone_id uuid references public.access_zones(id) on delete set null,
  party_id uuid references public.event_parties(id) on delete set null,
  status text not null default 'available' check (status in ('available','reserved','allocated','blocked','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('reserved','allocated')) = (party_id is not null)),
  check (map_element_ref is null or venue_map_id is not null)
);
create unique index if not exists exhibitor_booths_code_idx on public.exhibitor_booths(event_id, lower(code)) where status <> 'retired';
create unique index if not exists exhibitor_booths_element_idx on public.exhibitor_booths(venue_map_id, map_element_ref) where map_element_ref is not null and status <> 'retired';
create index if not exists exhibitor_booths_party_idx on public.exhibitor_booths(party_id) where party_id is not null;
drop trigger if exists exhibitor_booths_touch on public.exhibitor_booths;
create trigger exhibitor_booths_touch before update on public.exhibitor_booths for each row execute function public.ops_touch();

create or replace function public.exhibitor_booths_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.venue_map_id is not null and not exists (select 1 from public.venue_maps m where m.id = new.venue_map_id and m.event_id = new.event_id) then
    raise exception 'map_not_in_event' using errcode = '22023'; end if;
  if new.map_element_ref is not null and (TG_OP = 'INSERT' or new.map_element_ref is distinct from old.map_element_ref or new.venue_map_id is distinct from old.venue_map_id)
     and not public.map_element_exists(new.venue_map_id, new.map_element_ref) then
    raise exception 'map_element_not_found' using errcode = '22023'; end if;
  if new.zone_id is not null and not exists (select 1 from public.access_zones z where z.id = new.zone_id and z.event_id = new.event_id) then
    raise exception 'zone_not_in_event' using errcode = '22023'; end if;
  if new.party_id is not null and not exists (select 1 from public.event_parties p where p.id = new.party_id and p.event_id = new.event_id) then
    raise exception 'party_not_in_event' using errcode = '22023'; end if;
  if new.package_id is not null and not exists (select 1 from public.event_party_packages k where k.id = new.package_id and k.event_id = new.event_id and k.kind = 'exhibitor') then
    raise exception 'package_not_in_event' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists exhibitor_booths_guard on public.exhibitor_booths;
create trigger exhibitor_booths_guard before insert or update on public.exhibitor_booths for each row execute function public.exhibitor_booths_guard();

-- ═══ 6. Pass requests (interface onto lane D's Q18 passes) ═══
create table if not exists public.event_party_pass_requests (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.event_parties(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pass_type text not null check (pass_type in ('guest','staff','supplier','artist','vip','backstage','press')),
  quantity integer not null check (quantity between 1 and 500),
  zone_ids uuid[] not null default '{}',
  valid_from timestamptz, valid_to timestamptz,
  source text not null default 'manual' check (source in ('manual','package')),
  benefit_id uuid,
  status text not null default 'requested' check (status in ('requested','partially_issued','issued','cancelled')),
  issued_pass_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index if not exists event_party_pass_requests_idx on public.event_party_pass_requests(event_id, status);
create unique index if not exists event_party_pass_requests_benefit_idx on public.event_party_pass_requests(party_id, benefit_id) where benefit_id is not null;
drop trigger if exists event_party_pass_requests_touch on public.event_party_pass_requests;
create trigger event_party_pass_requests_touch before update on public.event_party_pass_requests for each row execute function public.ops_touch();

-- ═══ 7. Talent schedule (programme slots) ═══
create table if not exists public.event_party_slots (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.event_parties(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  programme_item_id uuid not null references public.programme_items(id) on delete cascade,
  role text not null default 'performer' check (role in ('headline','support','performer','speaker','panelist','host','soundcheck','other')),
  status text not null default 'tentative' check (status in ('tentative','confirmed','cancelled')),
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (party_id, programme_item_id)
);
create index if not exists event_party_slots_item_idx on public.event_party_slots(programme_item_id);
create index if not exists event_party_slots_event_idx on public.event_party_slots(event_id, status);
drop trigger if exists event_party_slots_touch on public.event_party_slots;
create trigger event_party_slots_touch before update on public.event_party_slots for each row execute function public.ops_touch();

-- ═══ 8. Riders ═══
create table if not exists public.talent_riders (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.event_parties(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('technical','hospitality','travel')),
  version integer not null check (version >= 1),
  status text not null default 'submitted' check (status in ('draft','submitted','accepted','changes_requested','superseded','withdrawn')),
  summary text not null default '' check (length(summary) <= 2000),
  submitted_by uuid references auth.users(id) on delete set null, submitted_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null, decided_at timestamptz,
  decision_note text not null default '' check (length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  unique (party_id, kind, version)
);
create index if not exists talent_riders_event_idx on public.talent_riders(event_id, status);
create table if not exists public.talent_rider_items (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.talent_riders(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null check (category in ('backline','audio','lighting','video','power','staging','dressing_room','catering','drinks','accommodation','ground_transport','flights','parking','guest_list','security','other')),
  description text not null check (length(btrim(description)) between 1 and 500),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  required boolean not null default true,
  spec jsonb not null default '{}' check (jsonb_typeof(spec) = 'object' and length(spec::text) <= 2000),
  fulfilment_status text not null default 'pending' check (fulfilment_status in ('pending','confirmed','substituted','declined','not_needed')),
  fulfilment_note text not null default '' check (length(fulfilment_note) <= 500),
  build_item_id uuid references public.build_items(id) on delete set null,
  equipment_id uuid references public.provider_equipment(id) on delete set null,
  space_id uuid references public.spaces(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  sort integer not null default 0
);
create index if not exists talent_rider_items_rider_idx on public.talent_rider_items(rider_id, sort);

insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('talent_rider', 'talent_riders', 'status', 'enforce', array['draft','submitted'], array['superseded','withdrawn'])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'talent_rider';
insert into public.state_transitions(machine, from_state, to_state) values
  ('talent_rider','draft','submitted'), ('talent_rider','draft','withdrawn'),
  ('talent_rider','submitted','accepted'), ('talent_rider','submitted','changes_requested'), ('talent_rider','submitted','superseded'), ('talent_rider','submitted','withdrawn'),
  ('talent_rider','changes_requested','superseded'), ('talent_rider','changes_requested','withdrawn'),
  ('talent_rider','accepted','superseded');
drop trigger if exists talent_riders_state_guard on public.talent_riders;
create trigger talent_riders_state_guard before insert or update of status on public.talent_riders for each row execute function public.enforce_state_transition('talent_rider', 'status');

-- Submitted riders are immutable: only status/decision columns move; items only change fulfilment.
create or replace function public.talent_riders_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_TABLE_NAME = 'talent_riders' then
    if TG_OP = 'DELETE' then raise exception 'rider_immutable' using errcode = '22023'; end if;
    if old.status <> 'draft' and (new.summary is distinct from old.summary or new.kind is distinct from old.kind or new.version is distinct from old.version or new.party_id is distinct from old.party_id) then
      raise exception 'rider_immutable' using errcode = '22023'; end if;
    return new;
  end if;
  if exists (select 1 from public.talent_riders r where r.id = coalesce(new.rider_id, old.rider_id) and r.status <> 'draft') then
    if TG_OP <> 'UPDATE' or new.category is distinct from old.category or new.description is distinct from old.description or new.quantity is distinct from old.quantity
       or new.required is distinct from old.required or new.spec is distinct from old.spec or new.rider_id is distinct from old.rider_id then
      raise exception 'rider_immutable' using errcode = '22023'; end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists talent_riders_immutable on public.talent_riders;
create trigger talent_riders_immutable before update or delete on public.talent_riders for each row execute function public.talent_riders_immutable();
drop trigger if exists talent_rider_items_immutable on public.talent_rider_items;
create trigger talent_rider_items_immutable before update or delete on public.talent_rider_items for each row execute function public.talent_riders_immutable();

-- ═══ 9. Money links (by reference to Q07 invoices / event payments) ═══
create table if not exists public.event_party_money (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.event_parties(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  direction text not null check (direction in ('receivable','payable')),
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  due_at timestamptz,
  note text not null default '' check (length(note) <= 300),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists event_party_money_party_idx on public.event_party_money(party_id);
create unique index if not exists event_party_money_invoice_idx on public.event_party_money(invoice_id) where invoice_id is not null;
create unique index if not exists event_party_money_payment_idx on public.event_party_money(payment_id) where payment_id is not null;

-- ═══ 10. RLS: event team reads; the party's portal user reads only its own agreement; writes go through commands ═══
do $$ declare t text; begin
  foreach t in array array['event_party_packages','event_package_benefits','event_parties','event_party_deliverables','event_deliverable_evidence','exhibitor_booths',
    'event_party_pass_requests','event_party_slots','talent_riders','talent_rider_items','event_party_money'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
drop policy if exists event_party_packages_read on public.event_party_packages;
create policy event_party_packages_read on public.event_party_packages for select to authenticated using (public.can_access_event(event_id));
drop policy if exists event_package_benefits_read on public.event_package_benefits;
create policy event_package_benefits_read on public.event_package_benefits for select to authenticated using (public.can_access_event(event_id));
drop policy if exists event_parties_read on public.event_parties;
create policy event_parties_read on public.event_parties for select to authenticated using (public.can_access_event(event_id) or portal_user_id = (select auth.uid()));
drop policy if exists event_party_deliverables_read on public.event_party_deliverables;
create policy event_party_deliverables_read on public.event_party_deliverables for select to authenticated using (public.can_access_event(event_id) or public.party_portal_user(party_id));
drop policy if exists event_deliverable_evidence_read on public.event_deliverable_evidence;
create policy event_deliverable_evidence_read on public.event_deliverable_evidence for select to authenticated using (public.can_access_event(event_id)
  or exists (select 1 from public.event_party_deliverables d where d.id = deliverable_id and public.party_portal_user(d.party_id)));
drop policy if exists exhibitor_booths_read on public.exhibitor_booths;
create policy exhibitor_booths_read on public.exhibitor_booths for select to authenticated using (public.can_access_event(event_id) or (party_id is not null and public.party_portal_user(party_id)));
drop policy if exists event_party_pass_requests_read on public.event_party_pass_requests;
create policy event_party_pass_requests_read on public.event_party_pass_requests for select to authenticated using (public.can_access_event(event_id) or public.party_portal_user(party_id));
drop policy if exists event_party_slots_read on public.event_party_slots;
create policy event_party_slots_read on public.event_party_slots for select to authenticated using (public.can_access_event(event_id) or public.party_portal_user(party_id));
drop policy if exists talent_riders_read on public.talent_riders;
create policy talent_riders_read on public.talent_riders for select to authenticated using (public.can_access_event(event_id) or public.party_portal_user(party_id));
drop policy if exists talent_rider_items_read on public.talent_rider_items;
create policy talent_rider_items_read on public.talent_rider_items for select to authenticated using (public.can_access_event(event_id)
  or exists (select 1 from public.talent_riders r where r.id = rider_id and public.party_portal_user(r.party_id)));
drop policy if exists event_party_money_read on public.event_party_money;
create policy event_party_money_read on public.event_party_money for select to authenticated using (public.has_workspace_role(workspace_id, array['owner','manager','finance']));

-- ═══ 11. Commands ═══
create or replace function public.package_save(p_event uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; k public.event_party_packages; b jsonb; n integer := 0;
begin
  e := public.ops_event_require(p_event);
  if p_id is null then
    insert into public.event_party_packages(event_id, workspace_id, kind, name, tier, description, price, currency, quantity, status)
      values (e.id, e.workspace_id, p ->> 'kind', btrim(coalesce(p ->> 'name', '')), coalesce(p ->> 'tier', ''), coalesce(p ->> 'description', ''),
        coalesce(nullif(p ->> 'price', '')::numeric, 0), coalesce(nullif(p ->> 'currency', ''), e.currency, 'GBP'), nullif(p ->> 'quantity', '')::int, coalesce(nullif(p ->> 'status', ''), 'active'))
      returning * into k;
  else
    select * into k from public.event_party_packages where id = p_id and event_id = e.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if nullif(p ->> 'quantity', '')::int < (select count(*) from public.event_parties x where x.package_id = k.id and x.status in ('confirmed','completed')) then
      raise exception 'quantity_below_allocated' using errcode = '22023'; end if;
    update public.event_party_packages set name = coalesce(nullif(btrim(p ->> 'name'), ''), name), tier = coalesce(p ->> 'tier', tier), description = coalesce(p ->> 'description', description),
      price = coalesce(nullif(p ->> 'price', '')::numeric, price), quantity = case when p ? 'quantity' then nullif(p ->> 'quantity', '')::int else quantity end,
      status = coalesce(nullif(p ->> 'status', ''), status), version = version + 1 where id = k.id returning * into k;
  end if;
  if jsonb_typeof(p -> 'benefits') = 'array' then
    if jsonb_array_length(p -> 'benefits') > 50 then raise exception 'too_many_benefits' using errcode = '22023'; end if;
    delete from public.event_package_benefits where package_id = k.id;
    for b in select * from jsonb_array_elements(p -> 'benefits') loop
      insert into public.event_package_benefits(package_id, event_id, kind, title, quantity, pass_type, owed_by, due_days_before, evidence_required, sort)
        values (k.id, e.id, b ->> 'kind', btrim(coalesce(b ->> 'title', '')), coalesce(nullif(b ->> 'quantity', '')::int, 1), nullif(b ->> 'pass_type', ''),
          coalesce(nullif(b ->> 'owed_by', ''), 'organizer'), nullif(b ->> 'due_days_before', '')::int, coalesce((b ->> 'evidence_required')::boolean, true), n);
      n := n + 1;
    end loop;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'event_party.package_saved',
    jsonb_build_object('event_id', e.id, 'package_id', k.id, 'version', k.version));
  return jsonb_build_object('id', k.id, 'version', k.version);
end $$;

create or replace function public.party_save(p_event uuid, p jsonb, p_id uuid default null, p_expected_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; r public.event_parties; pkg uuid := nullif(p ->> 'package_id', '')::uuid; cl uuid := nullif(p ->> 'client_id', '')::uuid;
  tp uuid := nullif(p ->> 'talent_profile_id', '')::uuid; v_kind text;
begin
  e := public.ops_event_require(p_event);
  if p_id is not null then
    select * into r from public.event_parties where id = p_id and event_id = e.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_expected_version is not null and r.version <> p_expected_version then return jsonb_build_object('ok', false, 'conflict', true, 'current_version', r.version); end if;
    v_kind := r.kind;
  else
    v_kind := p ->> 'kind';
  end if;
  if cl is not null and not exists (select 1 from public.clients c where c.id = cl and c.workspace_id = e.workspace_id) then raise exception 'client_not_in_workspace' using errcode = '42501'; end if;
  if tp is not null and not exists (select 1 from public.talent_profiles t where t.id = tp and t.workspace_id = e.workspace_id) then raise exception 'talent_not_in_workspace' using errcode = '42501'; end if;
  if pkg is not null and not exists (select 1 from public.event_party_packages k where k.id = pkg and k.event_id = e.id and k.status = 'active'
       and k.kind = case v_kind when 'sponsor' then 'sponsorship' when 'exhibitor' then 'exhibitor' else '-' end) then raise exception 'package_not_available' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.event_parties(event_id, workspace_id, kind, name, client_id, talent_profile_id, status, package_id, fee, currency, contact_name, contact_email, contact_phone, arrival_buffer_minutes, notes)
      values (e.id, e.workspace_id, v_kind, btrim(coalesce(p ->> 'name', '')), cl, tp, coalesce(nullif(p ->> 'status', ''), 'prospect'), pkg,
        coalesce(nullif(p ->> 'fee', '')::numeric, 0), coalesce(nullif(p ->> 'currency', ''), e.currency, 'GBP'), coalesce(p ->> 'contact_name', ''),
        lower(btrim(coalesce(p ->> 'contact_email', ''))), coalesce(p ->> 'contact_phone', ''), coalesce(nullif(p ->> 'arrival_buffer_minutes', '')::int, 60), coalesce(p ->> 'notes', ''))
      returning * into r;
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'event_party.created', jsonb_build_object('event_id', e.id, 'party_id', r.id, 'kind', r.kind));
  else
    if pkg is distinct from r.package_id and p ? 'package_id' and r.status in ('confirmed','completed') then raise exception 'package_locked' using errcode = '22023'; end if;
    update public.event_parties set name = coalesce(nullif(btrim(p ->> 'name'), ''), name),
      client_id = case when p ? 'client_id' then cl else client_id end, talent_profile_id = case when p ? 'talent_profile_id' then tp else talent_profile_id end,
      package_id = case when p ? 'package_id' then pkg else package_id end, fee = coalesce(nullif(p ->> 'fee', '')::numeric, fee),
      contact_name = coalesce(p ->> 'contact_name', contact_name), contact_email = coalesce(lower(btrim(p ->> 'contact_email')), contact_email),
      contact_phone = coalesce(p ->> 'contact_phone', contact_phone), arrival_buffer_minutes = coalesce(nullif(p ->> 'arrival_buffer_minutes', '')::int, arrival_buffer_minutes),
      notes = coalesce(p ->> 'notes', notes), version = version + 1
      where id = r.id returning * into r;
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'event_party.updated', jsonb_build_object('event_id', e.id, 'party_id', r.id, 'version', r.version));
  end if;
  return jsonb_build_object('ok', true, 'id', r.id, 'version', r.version, 'status', r.status);
end $$;

-- Confirmation allocates the package (row lock), snapshots it, and generates deliverables + pass requests from its benefits.
create or replace function public.party_transition(p_party uuid, p_to text, p_reason text default null, p_expected text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.event_parties; e public.events; k public.event_party_packages; used integer; res jsonb; b public.event_package_benefits;
begin
  select * into r from public.event_parties where id = p_party;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(r.event_id);
  if p_to = 'confirmed' and r.package_id is not null and r.status <> 'confirmed' then
    select * into k from public.event_party_packages where id = r.package_id for update;
    if k.status <> 'active' then raise exception 'package_not_available' using errcode = '22023'; end if;
    select count(*) into used from public.event_parties x where x.package_id = k.id and x.status in ('confirmed','completed') and x.id <> r.id;
    if k.quantity is not null and used >= k.quantity then raise exception 'package_sold_out' using errcode = '23P01', detail = k.name || ': ' || used || ' of ' || k.quantity || ' allocated'; end if;
  end if;
  res := public.transition_state('event_party', r.id, p_to, p_expected, auth.uid(), 'user', p_reason, null);
  if not coalesce((res ->> 'ok')::boolean, false) or not coalesce((res ->> 'changed')::boolean, false) then return res; end if;
  update public.event_parties set status_reason = coalesce(left(p_reason, 500), ''), version = version + 1,
    confirmed_at = case when p_to = 'confirmed' then now() else confirmed_at end, closed_at = case when p_to in ('completed','cancelled','withdrawn') then now() else closed_at end
    where id = r.id;
  if p_to = 'confirmed' and k.id is not null then
    update public.event_parties set package_snapshot = jsonb_build_object('package_id', k.id, 'version', k.version, 'name', k.name, 'tier', k.tier, 'price', k.price, 'currency', k.currency,
      'benefits', coalesce((select jsonb_agg(to_jsonb(x) - 'package_id' - 'event_id' order by x.sort) from public.event_package_benefits x where x.package_id = k.id), '[]'), 'at', now())
      where id = r.id;
    for b in select * from public.event_package_benefits where package_id = k.id order by sort loop
      if b.kind = 'passes' then
        insert into public.event_party_pass_requests(party_id, event_id, workspace_id, pass_type, quantity, source, benefit_id, valid_from, valid_to)
          values (r.id, e.id, e.workspace_id, b.pass_type, b.quantity, 'package', b.id, e.starts_at - interval '1 day', coalesce(e.ends_at, e.starts_at + interval '1 day'))
          on conflict (party_id, benefit_id) where benefit_id is not null do nothing;
      else
        insert into public.event_party_deliverables(party_id, event_id, workspace_id, benefit_id, kind, title, quantity, owed_by, due_at, evidence_required)
          values (r.id, e.id, e.workspace_id, b.id, b.kind, b.title, b.quantity, b.owed_by,
            case when b.due_days_before is not null and e.starts_at is not null then e.starts_at - make_interval(days => b.due_days_before) else e.starts_at end, b.evidence_required)
          on conflict (party_id, benefit_id) where benefit_id is not null do nothing;
      end if;
    end loop;
  end if;
  if p_to in ('cancelled','withdrawn') then
    update public.exhibitor_booths set party_id = null, status = 'available' where party_id = r.id and status in ('reserved','allocated');
    update public.event_party_pass_requests set status = 'cancelled' where party_id = r.id and status = 'requested';
    update public.event_party_slots set status = 'cancelled' where party_id = r.id and status <> 'cancelled';
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'event_party.status_changed',
    jsonb_build_object('event_id', e.id, 'party_id', r.id, 'from', res ->> 'from', 'to', p_to, 'package_id', r.package_id));
  return res;
end $$;

create or replace function public.party_link_portal_user(p_party uuid, p_email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.event_parties; e public.events; u uuid;
begin
  select * into r from public.event_parties where id = p_party;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(r.event_id);
  if p_email is null then update public.event_parties set portal_user_id = null where id = r.id; return jsonb_build_object('linked', false); end if;
  select id into u from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if u is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  update public.event_parties set portal_user_id = u where id = r.id;
  perform public.notify(u, 'event_party_portal', 'You have access to ' || e.name, r.name || ' — view your agreement, deliverables, riders and passes.', '/portal/parties/' || r.id, 'party.portal:' || r.id || ':' || u);
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'event_party.portal_linked', jsonb_build_object('event_id', e.id, 'party_id', r.id));
  return jsonb_build_object('linked', true);
end $$;

create or replace function public.deliverable_save(p_party uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.event_parties; e public.events; d public.event_party_deliverables;
begin
  select * into r from public.event_parties where id = p_party;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(r.event_id);
  if p_id is null then
    insert into public.event_party_deliverables(party_id, event_id, workspace_id, kind, title, quantity, owed_by, due_at, evidence_required)
      values (r.id, e.id, e.workspace_id, coalesce(nullif(p ->> 'kind', ''), 'other'), btrim(coalesce(p ->> 'title', '')), coalesce(nullif(p ->> 'quantity', '')::int, 1),
        coalesce(nullif(p ->> 'owed_by', ''), 'organizer'), nullif(p ->> 'due_at', '')::timestamptz, coalesce((p ->> 'evidence_required')::boolean, true)) returning * into d;
  else
    update public.event_party_deliverables set title = coalesce(nullif(btrim(p ->> 'title'), ''), title), due_at = case when p ? 'due_at' then nullif(p ->> 'due_at', '')::timestamptz else due_at end,
      owed_by = coalesce(nullif(p ->> 'owed_by', ''), owed_by), evidence_required = coalesce((p ->> 'evidence_required')::boolean, evidence_required)
      where id = p_id and party_id = r.id returning * into d;
    if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', d.id, 'status', d.status);
end $$;

create or replace function public.deliverable_add_evidence(p_deliverable uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d public.event_party_deliverables; uid uuid := (select auth.uid()); ws text; path text := nullif(p ->> 'storage_path', ''); eid bigint;
begin
  select * into d from public.event_party_deliverables where id = p_deliverable for update;
  if not found or not (public.can_manage_event(d.event_id) or (d.owed_by = 'party' and public.party_portal_user(d.party_id))) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status in ('approved','waived') then raise exception 'deliverable_closed' using errcode = '22023'; end if;
  ws := d.workspace_id::text;
  -- Files must already live in the uploader's own Q04 folder (workspace or user prefix); the path is a reference, never a copy.
  if path is not null and not (path like ws || '/%' or path like uid::text || '/%') then raise exception 'invalid_storage_path' using errcode = '22023'; end if;
  if nullif(p ->> 'media_asset_id', '') is not null and not exists (select 1 from public.media_assets m where m.id = (p ->> 'media_asset_id')::uuid and (m.workspace_id = d.workspace_id or m.event_id = d.event_id)) then
    raise exception 'media_not_in_event' using errcode = '42501'; end if;
  insert into public.event_deliverable_evidence(deliverable_id, event_id, kind, storage_path, media_asset_id, url, note, actor_id)
    values (d.id, d.event_id, coalesce(nullif(p ->> 'kind', ''), case when path is not null then 'file' when p ? 'url' then 'url' else 'note' end), path,
      nullif(p ->> 'media_asset_id', '')::uuid, nullif(p ->> 'url', ''), coalesce(p ->> 'note', ''), uid) returning id into eid;
  if d.status = 'pending' then perform public.transition_state('party_deliverable', d.id, 'in_progress', null, uid, 'user', 'evidence added', null); end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, d.workspace_id, 'event_party.deliverable_evidence', jsonb_build_object('event_id', d.event_id, 'deliverable_id', d.id, 'evidence_id', eid));
  return jsonb_build_object('evidence_id', eid);
end $$;

create or replace function public.deliverable_transition(p_deliverable uuid, p_to text, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d public.event_party_deliverables; uid uuid := (select auth.uid()); mgr boolean; res jsonb;
begin
  select * into d from public.event_party_deliverables where id = p_deliverable for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  mgr := public.can_manage_event(d.event_id);
  if not (mgr or (d.owed_by = 'party' and public.party_portal_user(d.party_id) and p_to in ('in_progress','submitted'))) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to = 'submitted' and d.evidence_required and not exists (select 1 from public.event_deliverable_evidence x where x.deliverable_id = d.id) then
    raise exception 'evidence_required' using errcode = '22023'; end if;
  if p_to in ('rejected','waived') and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  res := public.transition_state('party_deliverable', d.id, p_to, null, uid, 'user', p_note, null);
  if p_to in ('approved','rejected','waived') then
    update public.event_party_deliverables set decided_by = uid, decided_at = now(), decision_note = coalesce(left(p_note, 1000), '') where id = d.id;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, d.workspace_id, 'event_party.deliverable_changed',
    jsonb_build_object('event_id', d.event_id, 'deliverable_id', d.id, 'party_id', d.party_id, 'from', d.status, 'to', p_to));
  return res;
end $$;

create or replace function public.booth_save(p_event uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; bo public.exhibitor_booths;
begin
  e := public.ops_event_require(p_event);
  if p_id is null then
    insert into public.exhibitor_booths(event_id, workspace_id, code, name, package_id, width_m, depth_m, power_kw, features, price, currency, venue_map_id, map_element_ref, zone_id, status)
      values (e.id, e.workspace_id, btrim(coalesce(p ->> 'code', '')), coalesce(p ->> 'name', ''), nullif(p ->> 'package_id', '')::uuid, nullif(p ->> 'width_m', '')::numeric,
        nullif(p ->> 'depth_m', '')::numeric, nullif(p ->> 'power_kw', '')::numeric, coalesce(array(select jsonb_array_elements_text(p -> 'features')), '{}'),
        coalesce(nullif(p ->> 'price', '')::numeric, 0), coalesce(nullif(p ->> 'currency', ''), e.currency, 'GBP'), nullif(p ->> 'venue_map_id', '')::uuid,
        nullif(p ->> 'map_element_ref', ''), nullif(p ->> 'zone_id', '')::uuid, coalesce(nullif(p ->> 'status', ''), 'available')) returning * into bo;
  else
    update public.exhibitor_booths set code = coalesce(nullif(btrim(p ->> 'code'), ''), code), name = coalesce(p ->> 'name', name),
      package_id = case when p ? 'package_id' then nullif(p ->> 'package_id', '')::uuid else package_id end,
      venue_map_id = case when p ? 'venue_map_id' then nullif(p ->> 'venue_map_id', '')::uuid else venue_map_id end,
      map_element_ref = case when p ? 'map_element_ref' then nullif(p ->> 'map_element_ref', '') else map_element_ref end,
      zone_id = case when p ? 'zone_id' then nullif(p ->> 'zone_id', '')::uuid else zone_id end,
      price = coalesce(nullif(p ->> 'price', '')::numeric, price), power_kw = coalesce(nullif(p ->> 'power_kw', '')::numeric, power_kw),
      status = case when nullif(p ->> 'status', '') in ('available','blocked','retired') and party_id is null then p ->> 'status' else status end
      where id = p_id and event_id = e.id returning * into bo;
    if bo.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', bo.id, 'status', bo.status);
exception when unique_violation then
  raise exception 'booth_map_conflict' using errcode = '23505', detail = 'Another booth already uses this code or map element.';
end $$;

create or replace function public.booth_allocate(p_booth uuid, p_party uuid, p_reserve_only boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare bo public.exhibitor_booths; r public.event_parties;
begin
  select * into bo from public.exhibitor_booths where id = p_booth for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.ops_event_require(bo.event_id);
  select * into r from public.event_parties where id = p_party and event_id = bo.event_id;
  if not found or r.kind not in ('exhibitor','sponsor') or r.status not in ('prospect','negotiating','confirmed') then raise exception 'party_not_eligible' using errcode = '22023'; end if;
  if bo.party_id is not null and bo.party_id <> r.id then raise exception 'booth_taken' using errcode = '23P01'; end if;
  if bo.status in ('blocked','retired') then raise exception 'booth_unavailable' using errcode = '22023'; end if;
  update public.exhibitor_booths set party_id = r.id, status = case when p_reserve_only then 'reserved' else 'allocated' end where id = bo.id returning * into bo;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), bo.workspace_id, 'event_party.booth_allocated',
    jsonb_build_object('event_id', bo.event_id, 'booth_id', bo.id, 'party_id', r.id, 'map_element_ref', bo.map_element_ref));
  return jsonb_build_object('id', bo.id, 'status', bo.status);
end $$;

create or replace function public.booth_release(p_booth uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare bo public.exhibitor_booths;
begin
  select * into bo from public.exhibitor_booths where id = p_booth for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.ops_event_require(bo.event_id);
  update public.exhibitor_booths set party_id = null, status = 'available' where id = bo.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), bo.workspace_id, 'event_party.booth_released', jsonb_build_object('event_id', bo.event_id, 'booth_id', bo.id, 'party_id', bo.party_id));
  return jsonb_build_object('id', bo.id, 'status', 'available');
end $$;

create or replace function public.pass_request_save(p_party uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.event_parties; e public.events; q public.event_party_pass_requests; z uuid[] := coalesce(array(select jsonb_array_elements_text(p -> 'zone_ids'))::uuid[], '{}');
begin
  select * into r from public.event_parties where id = p_party;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(r.event_id);
  if exists (select 1 from unnest(z) x where not exists (select 1 from public.access_zones a where a.id = x and a.event_id = e.id)) then raise exception 'zone_not_in_event' using errcode = '22023'; end if;
  insert into public.event_party_pass_requests(party_id, event_id, workspace_id, pass_type, quantity, zone_ids, valid_from, valid_to)
    values (r.id, e.id, e.workspace_id, p ->> 'pass_type', coalesce(nullif(p ->> 'quantity', '')::int, 1), z, nullif(p ->> 'valid_from', '')::timestamptz, nullif(p ->> 'valid_to', '')::timestamptz)
    returning * into q;
  return jsonb_build_object('id', q.id, 'status', q.status);
end $$;

-- Issues passes through lane D's issue_access_pass (Q18). Exhibitors' booth zones are added automatically. Never over-issues.
create or replace function public.party_issue_passes(p_request uuid, p_holders jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare q public.event_party_pass_requests; r public.event_parties; h jsonb; zones uuid[]; res jsonb; ids uuid[] := '{}'; left_n integer;
begin
  select * into q from public.event_party_pass_requests where id = p_request for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.ops_event_require(q.event_id);
  select * into r from public.event_parties where id = q.party_id;
  if r.status <> 'confirmed' then raise exception 'party_not_confirmed' using errcode = '22023'; end if;
  if q.status in ('issued','cancelled') then raise exception 'request_closed' using errcode = '22023'; end if;
  if to_regprocedure('public.issue_access_pass(uuid,text,text,text,uuid[],timestamptz,timestamptz,uuid,uuid,uuid,uuid)') is null then
    raise exception 'passes_unavailable' using errcode = '0A000', detail = 'Q18 access passes are not installed.'; end if;
  if jsonb_typeof(p_holders) <> 'array' or jsonb_array_length(p_holders) = 0 then raise exception 'holders_required' using errcode = '22023'; end if;
  left_n := q.quantity - cardinality(q.issued_pass_ids);
  if jsonb_array_length(p_holders) > left_n then raise exception 'pass_quantity_exceeded' using errcode = '23P01', detail = left_n || ' pass(es) left on this request'; end if;
  zones := array(select distinct x from unnest(q.zone_ids || coalesce(array(select b.zone_id from public.exhibitor_booths b where b.party_id = r.id and b.zone_id is not null and b.status = 'allocated'), '{}')) x);
  for h in select * from jsonb_array_elements(p_holders) loop
    if length(btrim(coalesce(h ->> 'name', ''))) < 2 then raise exception 'holder_name_required' using errcode = '22023'; end if;
    res := public.issue_access_pass(q.event_id, q.pass_type, btrim(h ->> 'name'), coalesce(h ->> 'email', ''), zones, q.valid_from, q.valid_to, null, null, null, null);
    ids := ids || (res ->> 'id')::uuid;
  end loop;
  update public.event_party_pass_requests set issued_pass_ids = issued_pass_ids || ids,
    status = case when cardinality(issued_pass_ids) + cardinality(ids) >= quantity then 'issued' else 'partially_issued' end where id = q.id returning * into q;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), q.workspace_id, 'event_party.passes_issued',
    jsonb_build_object('event_id', q.event_id, 'party_id', q.party_id, 'request_id', q.id, 'count', cardinality(ids)));
  return jsonb_build_object('status', q.status, 'pass_ids', to_jsonb(ids), 'issued', cardinality(q.issued_pass_ids), 'quantity', q.quantity);
end $$;

create or replace function public.pass_request_cancel(p_request uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare q public.event_party_pass_requests;
begin
  select * into q from public.event_party_pass_requests where id = p_request for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.ops_event_require(q.event_id);
  update public.event_party_pass_requests set status = 'cancelled' where id = q.id and status in ('requested','partially_issued');
end $$;

-- Talent schedule. Confirmed slots: no overlap for the same talent across the workspace (lock per talent) and no blackout clash.
create or replace function public.party_slot_set(p_party uuid, p_item uuid, p_role text default 'performer', p_status text default 'tentative', p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.event_parties; it public.programme_items; s public.event_party_slots; rng tstzrange; clash text;
begin
  select * into r from public.event_parties where id = p_party;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.ops_event_require(r.event_id);
  select * into it from public.programme_items where id = p_item and event_id = r.event_id;
  if not found then raise exception 'item_not_in_event' using errcode = '22023'; end if;
  if p_status not in ('tentative','confirmed','cancelled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if r.status in ('cancelled','withdrawn','completed') and p_status <> 'cancelled' then raise exception 'party_closed' using errcode = '22023'; end if;
  rng := tstzrange(it.starts_at, it.starts_at + make_interval(mins => greatest(coalesce(it.duration_minutes, 0), 1)), '[)');
  if p_status = 'confirmed' and r.talent_profile_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('talent:' || r.talent_profile_id::text, 0));
    select x.title || ' (' || ev.name || ')' into clash from public.event_party_slots o join public.event_parties op on op.id = o.party_id
      join public.programme_items x on x.id = o.programme_item_id join public.events ev on ev.id = x.event_id
      where op.talent_profile_id = r.talent_profile_id and o.status = 'confirmed' and o.programme_item_id <> it.id
        and tstzrange(x.starts_at, x.starts_at + make_interval(mins => greatest(coalesce(x.duration_minutes, 0), 1)), '[)') && rng limit 1;
    if clash is not null then raise exception 'talent_double_booked' using errcode = '23P01', detail = 'Already confirmed for ' || clash; end if;
    if exists (select 1 from public.talent_unavailability u where u.talent_profile_id = r.talent_profile_id and tstzrange(u.starts_at, u.ends_at, '[)') && rng) then
      raise exception 'talent_unavailable' using errcode = '23P01'; end if;
  end if;
  insert into public.event_party_slots(party_id, event_id, programme_item_id, role, status, note) values (r.id, r.event_id, it.id, coalesce(p_role, 'performer'), p_status, coalesce(p_note, ''))
    on conflict (party_id, programme_item_id) do update set role = excluded.role, status = excluded.status, note = coalesce(p_note, public.event_party_slots.note)
    returning * into s;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), r.workspace_id, 'event_party.slot_set',
    jsonb_build_object('event_id', r.event_id, 'party_id', r.id, 'item_id', it.id, 'status', p_status));
  return jsonb_build_object('id', s.id, 'status', s.status);
end $$;

-- Riders: organiser or the talent's portal user submits a new version; the organiser accepts or requests changes.
create or replace function public.rider_submit(p_party uuid, p_kind text, p_summary text, p_items jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.event_parties; uid uuid := (select auth.uid()); v integer; rid uuid; x jsonb; n integer := 0;
begin
  select * into r from public.event_parties where id = p_party for update;
  if not found or not (public.can_manage_event(r.event_id) or public.party_portal_user(r.id)) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.kind not in ('artist','speaker','performer','host') then raise exception 'riders_for_talent_only' using errcode = '22023'; end if;
  if r.status in ('cancelled','withdrawn','completed') then raise exception 'party_closed' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 200 then raise exception 'invalid_items' using errcode = '22023'; end if;
  select coalesce(max(version), 0) + 1 into v from public.talent_riders where party_id = r.id and kind = p_kind;
  update public.talent_riders set status = 'superseded' where party_id = r.id and kind = p_kind and status in ('submitted','changes_requested');
  insert into public.talent_riders(party_id, event_id, workspace_id, kind, version, status, summary, submitted_by, submitted_at)
    values (r.id, r.event_id, r.workspace_id, p_kind, v, 'submitted', coalesce(left(p_summary, 2000), ''), uid, now()) returning id into rid;
  for x in select * from jsonb_array_elements(p_items) loop
    insert into public.talent_rider_items(rider_id, event_id, category, description, quantity, required, spec, sort)
      values (rid, r.event_id, x ->> 'category', btrim(coalesce(x ->> 'description', '')), coalesce(nullif(x ->> 'quantity', '')::int, 1), coalesce((x ->> 'required')::boolean, true),
        coalesce(case when jsonb_typeof(x -> 'spec') = 'object' then x -> 'spec' end, '{}'), n);
    n := n + 1;
  end loop;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, r.workspace_id, 'event_party.rider_submitted',
    jsonb_build_object('event_id', r.event_id, 'party_id', r.id, 'rider_id', rid, 'kind', p_kind, 'version', v, 'items', n));
  if not public.can_manage_event(r.event_id) then
    perform public.notify_workspace(r.workspace_id, array['owner','manager'], 'rider_submitted', r.name || ' sent a ' || p_kind || ' rider (v' || v || ')', 'Review and accept it or request changes.', '/organizer/events/' || r.event_id || '?tab=plan&section=partners');
  end if;
  return jsonb_build_object('id', rid, 'version', v, 'items', n);
end $$;

create or replace function public.rider_decide(p_rider uuid, p_decision text, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare rd public.talent_riders; r public.event_parties; e public.events; uid uuid := (select auth.uid()); it public.talent_rider_items; tid uuid; tasks_n integer := 0; prev public.talent_rider_items;
begin
  select * into rd from public.talent_riders where id = p_rider for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(rd.event_id);
  if p_decision not in ('accepted','changes_requested') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  if p_decision = 'changes_requested' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  if rd.status <> 'submitted' then raise exception 'rider_not_pending' using errcode = '22023', detail = 'Rider is ' || rd.status; end if;
  select * into r from public.event_parties where id = rd.party_id;
  if p_decision = 'accepted' then
    update public.talent_riders set status = 'superseded' where party_id = rd.party_id and kind = rd.kind and status = 'accepted' and id <> rd.id;
  end if;
  perform public.transition_state('talent_rider', rd.id, p_decision, 'submitted', uid, 'user', p_note, null);
  update public.talent_riders set decided_by = uid, decided_at = now(), decision_note = coalesce(left(p_note, 1000), '') where id = rd.id;
  if p_decision = 'accepted' then
    -- Propagation: carry fulfilment forward from the previous accepted version for unchanged items; open a task for every other required item.
    for it in select * from public.talent_rider_items where rider_id = rd.id order by sort loop
      select i.* into prev from public.talent_rider_items i join public.talent_riders o on o.id = i.rider_id
        where o.party_id = rd.party_id and o.kind = rd.kind and o.id <> rd.id and o.status = 'superseded' and o.decided_at is not null
          and i.category = it.category and lower(i.description) = lower(it.description) and i.quantity >= it.quantity and i.fulfilment_status in ('confirmed','substituted','not_needed')
        order by o.version desc limit 1;
      if prev.id is not null then
        update public.talent_rider_items set fulfilment_status = prev.fulfilment_status, fulfilment_note = prev.fulfilment_note, build_item_id = prev.build_item_id,
          equipment_id = prev.equipment_id, space_id = prev.space_id, task_id = prev.task_id where id = it.id;
      elsif it.required then
        insert into public.tasks(event_id, workspace_id, owner_id, title, detail, category, assignee_name, due_at, priority, status, milestone)
          values (rd.event_id, rd.workspace_id, uid, left('Rider: ' || r.name || ' — ' || it.description, 200), initcap(rd.kind) || ' rider v' || rd.version || ' · ' || it.category || ' × ' || it.quantity,
            'rider', '', coalesce(e.starts_at - interval '2 days', now() + interval '7 days'), case when rd.kind = 'technical' then 'high' else 'medium' end, 'todo', false)
          returning id into tid;
        update public.talent_rider_items set task_id = tid where id = it.id;
        tasks_n := tasks_n + 1;
      end if;
    end loop;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, rd.workspace_id, 'event_party.rider_decided',
    jsonb_build_object('event_id', rd.event_id, 'party_id', rd.party_id, 'rider_id', rd.id, 'decision', p_decision, 'tasks', tasks_n));
  if r.portal_user_id is not null then
    perform public.notify(r.portal_user_id, 'rider_decided', 'Your ' || rd.kind || ' rider was ' || replace(p_decision, '_', ' '), coalesce(p_note, ''), '/portal/parties/' || r.id, 'rider.decided:' || rd.id);
  end if;
  return jsonb_build_object('status', p_decision, 'tasks', tasks_n);
end $$;

create or replace function public.rider_item_fulfil(p_item uuid, p_status text, p_note text default null, p_build_item uuid default null, p_equipment uuid default null, p_space uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare it public.talent_rider_items; rd public.talent_riders; e public.events;
begin
  select * into it from public.talent_rider_items where id = p_item for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into rd from public.talent_riders where id = it.rider_id;
  e := public.ops_event_require(rd.event_id);
  if rd.status <> 'accepted' then raise exception 'rider_not_accepted' using errcode = '22023'; end if;
  if p_build_item is not null and not exists (select 1 from public.build_items b where b.id = p_build_item and b.event_id = e.id) then raise exception 'booking_not_in_event' using errcode = '22023'; end if;
  if p_equipment is not null and not exists (select 1 from public.provider_equipment q where q.id = p_equipment and q.workspace_id = e.workspace_id) then raise exception 'equipment_not_in_workspace' using errcode = '42501'; end if;
  if p_space is not null and not public.event_space_ok(e.id, p_space) then raise exception 'space_not_at_venue' using errcode = '22023'; end if;
  update public.talent_rider_items set fulfilment_status = p_status, fulfilment_note = coalesce(left(p_note, 500), fulfilment_note),
    build_item_id = coalesce(p_build_item, build_item_id), equipment_id = coalesce(p_equipment, equipment_id), space_id = coalesce(p_space, space_id) where id = it.id;
  if p_status in ('confirmed','substituted','not_needed') and it.task_id is not null then update public.tasks set status = 'done' where id = it.task_id and status <> 'done'; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), rd.workspace_id, 'event_party.rider_item_fulfilled',
    jsonb_build_object('event_id', rd.event_id, 'rider_id', rd.id, 'item_id', it.id, 'status', p_status));
  return jsonb_build_object('id', it.id, 'status', p_status);
end $$;

-- Dressing rooms etc. must be a room at the event's venue (same rule as programme_items_integrity), or any space when no venue is fixed.
create or replace function public.event_space_ok(p_event uuid, p_space uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.spaces s join public.events e on e.id = p_event
    where s.id = p_space and (e.venue_listing_id is null or s.venue_id = e.venue_listing_id
      or exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'venue' and b.listing_id = s.venue_id)));
$$;

create or replace function public.party_link_contract(p_party uuid, p_contract uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.event_parties; e public.events; c public.contracts;
begin
  select * into r from public.event_parties where id = p_party for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(r.event_id);
  select * into c from public.contracts where id = p_contract and workspace_id = e.workspace_id and (event_id is null or event_id = e.id);
  if not found then raise exception 'contract_not_in_event' using errcode = '42501'; end if;
  update public.event_parties set contract_id = c.id, version = version + 1 where id = r.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'event_party.contract_linked', jsonb_build_object('event_id', e.id, 'party_id', r.id, 'contract_id', c.id));
  return jsonb_build_object('contract_id', c.id, 'status', c.status);
end $$;

-- Talent / sponsor contract through the Q16 contract engine (no parallel model).
create or replace function public.party_create_contract(p_party uuid, p_title text default null, p_body text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.event_parties; e public.events; cid uuid; val numeric; parties jsonb;
begin
  select * into r from public.event_parties where id = p_party for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(r.event_id);
  if r.contract_id is not null and exists (select 1 from public.contracts c where c.id = r.contract_id and c.status not in ('void','declined','expired')) then raise exception 'contract_exists' using errcode = '22023'; end if;
  val := case when r.kind in ('sponsor','exhibitor') then coalesce((r.package_snapshot ->> 'price')::numeric, (select k.price from public.event_party_packages k where k.id = r.package_id), r.fee) else r.fee end;
  parties := case when r.contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then jsonb_build_array(
      jsonb_build_object('role', 'organizer', 'name', (select w.name from public.workspaces w where w.id = e.workspace_id), 'signs', true, 'signing_order', 1),
      jsonb_build_object('role', 'client', 'name', coalesce(nullif(r.contact_name, ''), r.name), 'email', r.contact_email, 'organisation', r.name, 'signs', true, 'signing_order', 2)) end;
  cid := public.contract_create(e.workspace_id, jsonb_build_object('title', coalesce(nullif(btrim(p_title), ''), initcap(r.kind) || ' agreement — ' || r.name), 'client_id', r.client_id,
    'event_id', e.id, 'value', val, 'currency', r.currency, 'body', coalesce(p_body, ''), 'parties', parties));
  update public.event_parties set contract_id = cid, version = version + 1 where id = r.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'event_party.contract_linked', jsonb_build_object('event_id', e.id, 'party_id', r.id, 'contract_id', cid));
  return jsonb_build_object('contract_id', cid);
end $$;

create or replace function public.party_link_money(p_party uuid, p_direction text, p_invoice uuid default null, p_payment uuid default null, p_amount numeric default null, p_due timestamptz default null, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.event_parties; e public.events; inv public.invoices; pay public.payments; mid uuid;
begin
  select * into r from public.event_parties where id = p_party;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(r.event_id);
  if (p_invoice is null) = (p_payment is null) then raise exception 'one_reference_required' using errcode = '22023'; end if;
  if p_invoice is not null then
    select * into inv from public.invoices where id = p_invoice and workspace_id = e.workspace_id and (event_id is null or event_id = e.id);
    if not found then raise exception 'invoice_not_in_event' using errcode = '42501'; end if;
  else
    select * into pay from public.payments where id = p_payment and event_id = e.id;
    if not found then raise exception 'payment_not_in_event' using errcode = '42501'; end if;
  end if;
  insert into public.event_party_money(party_id, event_id, workspace_id, direction, invoice_id, payment_id, amount, currency, due_at, note)
    values (r.id, e.id, e.workspace_id, p_direction, inv.id, pay.id, coalesce(p_amount, inv.total, pay.amount, 0), coalesce(inv.currency, r.currency), coalesce(p_due, inv.due_date::timestamptz, pay.due_at), coalesce(p_note, ''))
    returning id into mid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'event_party.money_linked',
    jsonb_build_object('event_id', e.id, 'party_id', r.id, 'direction', p_direction, 'invoice_id', inv.id, 'payment_id', pay.id));
  return jsonb_build_object('id', mid);
exception when unique_violation then raise exception 'money_already_linked' using errcode = '23505';
end $$;

-- ═══ 12. Read models ═══
create or replace function public.event_parties_overview(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; fin boolean;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  fin := e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager','finance']);
  return jsonb_build_object(
    'parties', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'name', p.name, 'status', p.status, 'package', p.package_snapshot ->> 'name',
        'contract_status', (select c.status from public.contracts c where c.id = p.contract_id),
        'deliverables', (select jsonb_build_object('total', count(*), 'approved', count(*) filter (where d.status in ('approved','waived')),
            'overdue', count(*) filter (where d.status not in ('approved','waived') and d.due_at < now())) from public.event_party_deliverables d where d.party_id = p.id),
        'booths', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'map_element_ref', b.map_element_ref)), '[]') from public.exhibitor_booths b where b.party_id = p.id),
        'passes', (select jsonb_build_object('requested', coalesce(sum(q.quantity), 0), 'issued', coalesce(sum(cardinality(q.issued_pass_ids)), 0)) from public.event_party_pass_requests q where q.party_id = p.id and q.status <> 'cancelled'),
        'slots', (select count(*) from public.event_party_slots s where s.party_id = p.id and s.status <> 'cancelled'),
        'riders', (select coalesce(jsonb_object_agg(z.kind, z.status), '{}') from (select distinct on (t.kind) t.kind, t.status from public.talent_riders t where t.party_id = p.id order by t.kind, t.version desc) z),
        'money', case when fin then (select jsonb_build_object('receivable', coalesce(sum(m.amount) filter (where m.direction = 'receivable'), 0),
            'received', coalesce(sum(least(i.amount_paid, m.amount)) filter (where m.direction = 'receivable'), 0),
            'payable', coalesce(sum(m.amount) filter (where m.direction = 'payable'), 0),
            'paid', coalesce(sum(m.amount) filter (where m.direction = 'payable' and y.status = 'paid'), 0))
          from public.event_party_money m left join public.invoices i on i.id = m.invoice_id left join public.payments y on y.id = m.payment_id where m.party_id = p.id) end)
        order by p.kind, p.name) from public.event_parties p where p.event_id = e.id), '[]'),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'kind', k.kind, 'name', k.name, 'price', k.price, 'quantity', k.quantity,
        'allocated', (select count(*) from public.event_parties x where x.package_id = k.id and x.status in ('confirmed','completed'))) order by k.kind, k.price desc)
      from public.event_party_packages k where k.event_id = e.id and k.status <> 'retired'), '[]'),
    'booths', (select jsonb_build_object('total', count(*), 'allocated', count(*) filter (where b.status = 'allocated'), 'available', count(*) filter (where b.status = 'available'))
      from public.exhibitor_booths b where b.event_id = e.id and b.status <> 'retired'));
end $$;

-- Scoped portal read for a party's own linked login: only its agreement, deliverables, riders, slots, booth and passes.
create or replace function public.my_party_portal() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'name', p.name, 'status', p.status, 'event', jsonb_build_object('id', e.id, 'name', e.name, 'starts_at', e.starts_at),
    'package', p.package_snapshot, 'contract_status', (select c.status from public.contracts c where c.id = p.contract_id),
    'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'owed_by', d.owed_by, 'due_at', d.due_at, 'status', d.status) order by d.due_at nulls last), '[]') from public.event_party_deliverables d where d.party_id = p.id),
    'slots', (select coalesce(jsonb_agg(jsonb_build_object('title', i.title, 'starts_at', i.starts_at, 'minutes', i.duration_minutes, 'role', s.role, 'status', s.status) order by i.starts_at), '[]')
      from public.event_party_slots s join public.programme_items i on i.id = s.programme_item_id where s.party_id = p.id and s.status <> 'cancelled'),
    'booths', (select coalesce(jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name)), '[]') from public.exhibitor_booths b where b.party_id = p.id),
    'passes', (select coalesce(sum(cardinality(q.issued_pass_ids)), 0) from public.event_party_pass_requests q where q.party_id = p.id),
    'riders', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'version', t.version, 'status', t.status, 'note', t.decision_note) order by t.kind, t.version desc), '[]') from public.talent_riders t where t.party_id = p.id))), '[]')
  from public.event_parties p join public.events e on e.id = p.event_id
  where p.portal_user_id = (select auth.uid()) and p.status not in ('cancelled','withdrawn');
$$;

-- ═══ 13. Unified ops checks (Q24 part; Q25/Q26 extend) → feasibility, readiness, conflicts, lifecycle hook ═══
create or replace function public.event_ops_checks(p_event uuid)
returns table(domain text, key text, severity text, message text, fix text, ref_id uuid, conflict boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare e public.events; base text; days numeric;
begin
  select * into e from public.events ev where ev.id = p_event;
  if not found or e.workspace_id is null then return; end if;
  base := '/organizer/events/' || e.id;
  days := case when e.starts_at is null then null else extract(epoch from (e.starts_at - now())) / 86400 end;
  -- Contracts: confirmed paid parties need a signed Q16 contract.
  return query select 'partners', 'party_contract_unsigned', case when days is not null and days < 7 then 'blocker' else 'warning' end,
      p.name || ' (' || p.kind || ') is confirmed without a signed contract.', base || '?tab=plan&section=partners', p.id, false
    from public.event_parties p left join public.contracts c on c.id = p.contract_id
    where p.event_id = e.id and p.status = 'confirmed' and (p.fee > 0 or coalesce((p.package_snapshot ->> 'price')::numeric, 0) > 0) and coalesce(c.status, '') <> 'signed';
  -- Deliverables past due.
  return query select 'partners', 'deliverable_overdue', case when days is not null and days < 3 then 'blocker' else 'warning' end,
      d.title || ' for ' || p.name || ' was due ' || to_char(d.due_at at time zone coalesce(nullif(e.timezone, ''), 'Europe/London'), 'FMDD Mon') || ' (' || d.status || ').', base || '?tab=plan&section=partners', d.id, false
    from public.event_party_deliverables d join public.event_parties p on p.id = d.party_id
    where d.event_id = e.id and p.status = 'confirmed' and d.status not in ('approved','waived') and d.due_at < now();
  -- Riders: latest version waiting for the organiser; accepted riders with unmet required items.
  return query select 'partners', 'rider_pending', case when days is not null and days < 7 then 'blocker' else 'warning' end,
      p.name || '''s ' || t.kind || ' rider v' || t.version || ' is waiting for your decision.', base || '?tab=plan&section=partners', t.id, false
    from public.talent_riders t join public.event_parties p on p.id = t.party_id
    where t.event_id = e.id and t.status = 'submitted' and p.status in ('negotiating','confirmed');
  return query select 'partners', 'rider_item_unmet', case when days is not null and days < 3 then 'blocker' else 'warning' end,
      p.name || ': ' || i.description || ' (' || i.category || ') is not arranged yet.', base || '?tab=plan&section=partners', i.id, false
    from public.talent_rider_items i join public.talent_riders t on t.id = i.rider_id join public.event_parties p on p.id = t.party_id
    where t.event_id = e.id and t.status = 'accepted' and p.status = 'confirmed' and i.required and i.fulfilment_status in ('pending','declined');
  -- Exhibitors without a booth; confirmed talent without a programme slot; passes not issued close to the event.
  return query select 'partners', 'exhibitor_no_booth', case when days is not null and days < 2 then 'blocker' else 'warning' end,
      p.name || ' is a confirmed exhibitor with no booth allocated.', base || '?tab=plan&section=partners', p.id, false
    from public.event_parties p where p.event_id = e.id and p.kind = 'exhibitor' and p.status = 'confirmed'
      and not exists (select 1 from public.exhibitor_booths b where b.party_id = p.id and b.status = 'allocated');
  return query select 'partners', 'talent_unscheduled', 'warning', p.name || ' is confirmed but not on the programme.', base || '?tab=plan&section=programme', p.id, false
    from public.event_parties p where p.event_id = e.id and p.kind in ('artist','speaker','performer','host') and p.status = 'confirmed'
      and not exists (select 1 from public.event_party_slots s where s.party_id = p.id and s.status <> 'cancelled');
  return query select 'partners', 'passes_not_issued', 'warning', p.name || ': ' || (q.quantity - cardinality(q.issued_pass_ids)) || ' ' || q.pass_type || ' pass(es) not issued.', base || '?tab=operations&section=access', q.id, false
    from public.event_party_pass_requests q join public.event_parties p on p.id = q.party_id
    where q.event_id = e.id and p.status = 'confirmed' and q.status in ('requested','partially_issued') and days is not null and days < 3;
  -- Talent double-booked (any overlapping slot of the same talent profile, this or another event in the workspace) or in a blackout.
  return query select distinct on (s.id) 'partners', 'talent_double_booked', case when s.status = 'confirmed' and o.status = 'confirmed' then 'blocker' else 'warning' end,
      p.name || ' overlaps ' || x.title || case when x.event_id <> e.id then ' at ' || (select ev.name from public.events ev where ev.id = x.event_id) else '' end || '.', base || '?tab=plan&section=programme', s.id, true
    from public.event_party_slots s join public.event_parties p on p.id = s.party_id join public.programme_items i on i.id = s.programme_item_id
      join public.event_parties op on op.talent_profile_id = p.talent_profile_id and op.status not in ('cancelled','withdrawn')
      join public.event_party_slots o on o.party_id = op.id and o.id <> s.id and o.status <> 'cancelled'
      join public.programme_items x on x.id = o.programme_item_id
    where s.event_id = e.id and s.status <> 'cancelled' and p.talent_profile_id is not null
      and tstzrange(i.starts_at, i.starts_at + make_interval(mins => greatest(i.duration_minutes, 1)), '[)') && tstzrange(x.starts_at, x.starts_at + make_interval(mins => greatest(x.duration_minutes, 1)), '[)');
  return query select 'partners', 'talent_unavailable', 'blocker', p.name || ' is unavailable (' || u.kind || ') during ' || i.title || '.', base || '?tab=plan&section=programme', s.id, true
    from public.event_party_slots s join public.event_parties p on p.id = s.party_id join public.programme_items i on i.id = s.programme_item_id
      join public.talent_unavailability u on u.talent_profile_id = p.talent_profile_id
    where s.event_id = e.id and s.status <> 'cancelled' and tstzrange(u.starts_at, u.ends_at, '[)') && tstzrange(i.starts_at, i.starts_at + make_interval(mins => greatest(i.duration_minutes, 1)), '[)');
  -- Money: linked receivable invoices overdue.
  return query select 'partners', 'party_invoice_overdue', 'warning', p.name || ' has an overdue invoice (' || i.number || ').', base || '?tab=money', m.id, false
    from public.event_party_money m join public.invoices i on i.id = m.invoice_id join public.event_parties p on p.id = m.party_id
    where m.event_id = e.id and m.direction = 'receivable' and (i.status = 'overdue' or (i.status in ('sent','viewed','partial') and i.due_date < current_date));
end $$;

-- Public read of the combined checks for the event team (Operations / Plan panels).
create or replace function public.event_ops_readiness(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare items jsonb;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('domain', c.domain, 'key', c.key, 'severity', c.severity, 'message', c.message, 'fix', c.fix, 'ref_id', c.ref_id, 'conflict', c.conflict)
    order by case c.severity when 'blocker' then 0 else 1 end, c.domain, c.key), '[]') into items from public.event_ops_checks(p_event) c;
  return jsonb_build_object('state', case when exists (select 1 from jsonb_array_elements(items) x where x ->> 'severity' = 'blocker') then 'blocked'
      when jsonb_array_length(items) > 0 then 'attention' else 'ready' end,
    'blockers', (select count(*) from jsonb_array_elements(items) x where x ->> 'severity' = 'blocker'), 'items', items);
end $$;

-- Hook for lane D's event_lifecycle_blockers(): required (blocker) failures in lifecycle shape [{key,label,fix}].
create or replace function public.event_ops_blockers(p_event uuid, p_to text default 'ready') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.can_access_event(p_event) or (select auth.uid()) is null) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to not in ('ready','published','on_sale','live') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', 'ops_' || c.key, 'label', c.message, 'fix', c.fix, 'domain', c.domain)) from public.event_ops_checks(p_event) c where c.severity = 'blocker'), '[]');
end $$;

-- event_feasibility (readiness input since Q15 operations): unchanged body + the ops checks appended at the end.
create or replace function public.event_feasibility(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; out jsonb := '[]'; vj public.provider_jobs; sp public.spaces; cap integer; tickets integer; guests integer; r record; need integer; have integer; base text;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  base := case when e.workspace_id is null then '/account/events/' || e.id else '/organizer/events/' || e.id end;
  guests := coalesce(e.guest_count, 0);
  -- Venue space for this event: the confirmed venue booking's job space, else the venue listing.
  select j.* into vj from public.provider_jobs j join public.build_items b on b.id = j.build_item_id
    where b.event_id = e.id and b.category = 'venue' and b.status in ('confirmed','active','fulfilled','held') order by j.created_at desc limit 1;
  if vj.space_id is not null then select * into sp from public.spaces where id = vj.space_id; end if;
  cap := coalesce(greatest(sp.capacity_standing, sp.capacity_seated), (select l.capacity_max from public.listings l where l.id = e.venue_listing_id));
  if cap is not null and cap > 0 and guests > cap then
    out := out || jsonb_build_object('key', 'guests_over_capacity', 'severity', 'blocker', 'message', 'Guest count ' || guests || ' exceeds the venue capacity of ' || cap || '.', 'fix', base || case when e.workspace_id is null then '/build' else '?tab=plan&section=guests' end);
  end if;
  select coalesce(sum(t.quantity), 0) into tickets from public.ticket_tiers t where t.event_id = e.id;
  if tickets > 0 and coalesce(e.capacity, cap) is not null and tickets > coalesce(e.capacity, cap) then
    out := out || jsonb_build_object('key', 'tickets_over_capacity', 'severity', 'blocker', 'message', tickets || ' tickets on sale but the approved capacity is ' || coalesce(e.capacity, cap) || '.', 'fix', base || '?tab=sell&section=tickets');
  end if;
  -- Supplier setup time vs the venue's access (setup) window.
  if sp.id is not null then
    for r in select b.title, (l.details->>'setup_minutes')::int need_min from public.build_items b join public.listings l on l.id = b.listing_id
             where b.event_id = e.id and b.category <> 'venue' and b.status in ('confirmed','held','quoted') and (l.details->>'setup_minutes') ~ '^\d+$'
               and (l.details->>'setup_minutes')::int > coalesce((sp.details->>'setup_minutes')::int, 0) loop
      out := out || jsonb_build_object('key', 'setup_window', 'severity', 'warning', 'message', r.title || ' needs ' || trim(trailing '.' from trim(trailing '0' from round(r.need_min / 60.0, 1)::text)) || 'h to set up but ' || sp.name || ' gives ' || trim(trailing '.' from trim(trailing '0' from round(coalesce((sp.details->>'setup_minutes')::int, 0) / 60.0, 1)::text)) || 'h access.', 'fix', base || '?tab=plan&section=suppliers');
    end loop;
    -- Power and ceiling constraints when both sides publish them.
    for r in select b.title, l.details from public.build_items b join public.listings l on l.id = b.listing_id where b.event_id = e.id and b.category <> 'venue' and b.status in ('confirmed','held','quoted') loop
      if (r.details->>'power_kw') ~ '^[0-9.]+$' and (sp.details->>'power_kw') ~ '^[0-9.]+$' and (r.details->>'power_kw')::numeric > (sp.details->>'power_kw')::numeric then
        out := out || jsonb_build_object('key', 'power', 'severity', 'blocker', 'message', r.title || ' needs ' || (r.details->>'power_kw') || 'kW; ' || sp.name || ' supplies ' || (sp.details->>'power_kw') || 'kW.', 'fix', base || '?tab=plan&section=suppliers');
      end if;
      if (r.details->>'min_ceiling_m') ~ '^[0-9.]+$' and (sp.details->>'ceiling_m') ~ '^[0-9.]+$' and (r.details->>'min_ceiling_m')::numeric > (sp.details->>'ceiling_m')::numeric then
        out := out || jsonb_build_object('key', 'ceiling', 'severity', 'blocker', 'message', r.title || ' needs ' || (r.details->>'min_ceiling_m') || 'm of headroom; the ceiling is ' || (sp.details->>'ceiling_m') || 'm.', 'fix', base || '?tab=plan&section=suppliers');
      end if;
    end loop;
    -- Programme runs past the venue's closing time.
    if jsonb_typeof(sp.details->'hours') = 'object' and e.starts_at is not null then
      select max(p.starts_at + make_interval(mins => coalesce(p.duration_minutes, 0))) into r from public.programme_items p where p.event_id = e.id;
    end if;
  end if;
  -- Programme vs bar hours from the BEO bar section is free text, so use the latest programme end vs event end.
  if exists (select 1 from public.programme_items p where p.event_id = e.id and e.ends_at is not null and p.starts_at + make_interval(mins => coalesce(p.duration_minutes, 0)) > e.ends_at + interval '1 minute') then
    out := out || jsonb_build_object('key', 'programme_overrun', 'severity', 'warning', 'message', 'The programme runs past the event end time — venue, bar and staff bookings may end first.', 'fix', base || '?tab=plan&section=programme');
  end if;
  -- Supplier travel: the same provider booked elsewhere too close to this event (or overlapping).
  for r in select b.title, o.event_name, o.starts_at from public.build_items b join public.listings l on l.id = b.listing_id
           join public.provider_jobs o on o.workspace_id = l.workspace_id and o.build_item_id is distinct from b.id and o.status in ('confirmed','active','held')
           where b.event_id = e.id and b.status in ('confirmed','held') and l.kind = 'service' and e.starts_at is not null and o.starts_at is not null
             and tstzrange(o.starts_at - interval '90 minutes', coalesce(o.ends_at, o.starts_at + interval '4 hours') + interval '90 minutes') && tstzrange(e.starts_at - interval '2 hours', coalesce(e.ends_at, e.starts_at + interval '5 hours'))
           limit 5 loop
    out := out || jsonb_build_object('key', 'supplier_travel', 'severity', 'warning', 'message', r.title || ' has another booking (' || r.event_name || ') too close to yours to travel between.', 'fix', base || '?tab=plan&section=suppliers');
  end loop;
  -- Security coverage: configurable ratio (events.settings.security_ratio, default 1 per 100 guests over 100).
  if guests > 100 then
    need := ceil(guests / coalesce(nullif((e.settings->>'security_ratio')::int, 0), 100)::numeric);
    select coalesce(sum(s.headcount), 0) into have from public.shifts s where s.event_id = e.id and s.role ilike '%secur%' and s.status <> 'unavailable';
    if have = 0 and exists (select 1 from public.build_items b where b.event_id = e.id and b.category in ('security','staff') and b.status in ('confirmed','held') and b.title ilike '%secur%') then have := need; end if;
    if have < need then
      out := out || jsonb_build_object('key', 'security_coverage', 'severity', 'warning', 'message', 'Security coverage: ' || have || ' of ' || need || ' required for ' || guests || ' guests.', 'fix', base || '?tab=operations&section=team');
    end if;
  end if;
  -- Hold expires before the organiser can realistically confirm (expires within 24h).
  for r in select b.title, h.expires_at from public.conditional_holds h join public.build_items b on b.id = h.build_item_id where h.event_id = e.id and h.status = 'held' and h.expires_at < now() + interval '24 hours' loop
    out := out || jsonb_build_object('key', 'hold_expiring', 'severity', 'warning', 'message', 'Hold on ' || r.title || ' expires ' || to_char(r.expires_at at time zone 'Europe/London', 'Dy HH24:MI') || '.', 'fix', base || '?tab=plan&section=suppliers');
  end loop;
  -- Catering final numbers.
  for r in select b.title, c.guest_count, c.final_numbers_due, c.status from public.catering_selections c join public.build_items b on b.id = c.build_item_id where c.event_id = e.id loop
    if guests > 0 and r.guest_count <> guests then
      out := out || jsonb_build_object('key', 'catering_numbers', 'severity', 'warning', 'message', r.title || ' is catering for ' || r.guest_count || ' but the event has ' || guests || ' guests.', 'fix', base || '?tab=plan&section=suppliers');
    end if;
  end loop;
  -- Q24–Q26 (lane C): sponsors/talent/riders, logistics and compliance checks (organiser events only; [] otherwise).
  out := out || coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'severity', c.severity, 'message', c.message, 'fix', c.fix, 'domain', c.domain)
    order by case c.severity when 'blocker' then 0 else 1 end) from public.event_ops_checks(p_event) c), '[]');
  return out;
end $function$;

-- Conflicts (Q17 lane C engine) gain the ops conflicts (talent double-booking/unavailability; Q25 adds bays/parking/arrivals).
create or replace function public.operational_conflicts_internal(p_ws uuid, p_from timestamptz, p_to timestamptz, p_event uuid default null)
returns table(kind text, severity text, event_id uuid, event_name text, ref_id uuid, starts_at timestamptz, message text)
language sql stable security definer set search_path = '' as $$
  with sh as (
    select s.*, m.name as crew_name, m.status as crew_status, e.name as ev_name from public.shifts s
      join public.crew_members m on m.id = s.crew_id left join public.events e on e.id = s.event_id
    where s.workspace_id = p_ws and s.status in ('draft','pending','confirmed') and s.ends_at >= p_from and s.starts_at <= p_to
      and (p_event is null or s.event_id = p_event))
  -- Crew conflicts come from the existing team conflict engine (team_conflicts, §85) — one source, not a second detector.
  select 'crew_' || t.kind, case t.severity when 'blocker' then 'high' else 'medium' end, t.event_id, e.name, coalesce(t.shift_id, t.crew_id, t.event_id),
         (select s.starts_at from public.shifts s where s.id = t.shift_id), t.message
    from public.team_conflicts(p_ws, p_from, p_to) t left join public.events e on e.id = t.event_id
    where p_event is null or t.event_id = p_event
  union all
  select 'crew_deactivated', 'high', a.event_id, a.ev_name, a.id, a.starts_at, a.crew_name || ' was deactivated but still holds this shift' from sh a where a.crew_status = 'deactivated'
  union all
  select case when q.status <> 'active' then 'resource_unavailable' else 'resource_over_allocated' end, case when q.status <> 'active' then 'high' else 'medium' end,
         coalesce(a.event_id, j.event_id), e.name, a.id, a.starts_at,
         q.name || case when q.status <> 'active' then ' is in ' || q.status else ' is over-allocated (' || coalesce(a.warning, 'capacity exceeded') || ')' end
    from public.job_equipment_allocations a join public.provider_equipment q on q.id = a.equipment_id
      left join public.provider_jobs j on j.id = a.job_id left join public.events e on e.id = coalesce(a.event_id, j.event_id)
    where a.workspace_id = p_ws and a.status = 'reserved' and a.ends_at >= p_from and a.starts_at <= p_to and (q.status <> 'active' or a.warning is not null)
      and (p_event is null or coalesce(a.event_id, j.event_id) = p_event)
  union all
  select 'run_sheet_delayed', case when t.delay_minutes >= 30 then 'high' else 'medium' end, e.id, e.name, i.id, i.starts_at, i.title || ' is running ' || t.delay_minutes || ' min late'
    from public.run_sheet_tracking t join public.programme_items i on i.id = t.item_id join public.events e on e.id = t.event_id
    where e.workspace_id = p_ws and t.delay_minutes >= 10 and i.status <> 'done' and i.starts_at between p_from and p_to and (p_event is null or e.id = p_event)
  union all
  select 'incident_open', i.severity, e.id, e.name, i.id, i.created_at, initcap(i.severity) || ' incident open: ' || i.title
    from public.incidents i join public.events e on e.id = i.event_id
    where e.workspace_id = p_ws and i.status <> 'resolved' and i.severity in ('high','critical') and (p_event is null or e.id = p_event)
  union all
  select 'risk_high', case when r.residual_score >= 20 then 'high' else 'medium' end, e.id, e.name, r.id, e.starts_at, 'High residual risk: ' || r.title || ' (' || r.residual_score || '/25)'
    from public.event_risks r join public.events e on e.id = r.event_id
    where e.workspace_id = p_ws and r.status = 'open' and r.residual_score >= 15 and (e.starts_at is null or e.starts_at <= p_to) and coalesce(e.ends_at, e.starts_at, now()) >= p_from
      and (p_event is null or e.id = p_event)
  union all
  select 'ops_' || c.key, case c.severity when 'blocker' then 'high' else 'medium' end, e.id, e.name, c.ref_id, e.starts_at, c.message
    from public.events e cross join lateral public.event_ops_checks(e.id) c
    where e.workspace_id = p_ws and c.conflict and (p_event is null or e.id = p_event)
      and e.status not in ('completed','closed','cancelled','archived') and (e.starts_at is null or e.starts_at <= p_to) and coalesce(e.ends_at, e.starts_at, now()) >= p_from;
$$;

-- ═══ 14. Catalogue + grants ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description) values
  ('event_party.created', 1, 'event_party', 'A sponsor / exhibitor / talent record was added to an event (payload: event_id, party_id, kind).'),
  ('event_party.updated', 1, 'event_party', 'An event party record changed (payload: event_id, party_id, version).'),
  ('event_party.status_changed', 1, 'event_party', 'An event party moved through its lifecycle; confirmation allocates the package (payload: event_id, party_id, from, to).'),
  ('event_party.state_changed', 1, 'event_party', 'Machine transition of an event party (transition_state).'),
  ('event_party.package_saved', 1, 'event_party', 'A sponsorship / exhibitor package was created or revised (payload: event_id, package_id, version).'),
  ('party_deliverable.state_changed', 1, 'party_deliverable', 'A sponsor/exhibitor deliverable moved through its lifecycle.'),
  ('event_party.deliverable_changed', 1, 'event_party', 'A deliverable was submitted, approved, rejected or waived (payload: event_id, deliverable_id, from, to).'),
  ('event_party.deliverable_evidence', 1, 'event_party', 'Evidence was attached to a deliverable (payload: event_id, deliverable_id).'),
  ('event_party.booth_allocated', 1, 'event_party', 'An exhibitor booth (map element by reference) was allocated (payload: event_id, booth_id, party_id, map_element_ref).'),
  ('event_party.booth_released', 1, 'event_party', 'An exhibitor booth was released.'),
  ('event_party.passes_issued', 1, 'event_party', 'Access passes were issued for a party through Q18 (payload: event_id, party_id, request_id, count).'),
  ('event_party.slot_set', 1, 'event_party', 'A talent programme slot was set (payload: event_id, party_id, item_id, status).'),
  ('event_party.rider_submitted', 1, 'event_party', 'A new technical / hospitality / travel rider version was submitted.'),
  ('talent_rider.state_changed', 1, 'talent_rider', 'A rider moved through its lifecycle.'),
  ('event_party.rider_decided', 1, 'event_party', 'The organiser accepted a rider or requested changes (payload: event_id, rider_id, decision, tasks).'),
  ('event_party.rider_item_fulfilled', 1, 'event_party', 'A rider item was arranged, substituted or declined.'),
  ('event_party.contract_linked', 1, 'event_party', 'A Q16 contract was linked to an event party.'),
  ('event_party.money_linked', 1, 'event_party', 'An invoice or event payment was linked to an event party (reference only).'),
  ('event_party.portal_linked', 1, 'event_party', 'A login was given scoped portal access to its own party record.')
on conflict (event_type) do update set aggregate = excluded.aggregate, description = excluded.description, updated_at = now();

revoke all on function public.ops_event_require(uuid), public.ops_touch(), public.exhibitor_booths_guard(), public.talent_riders_immutable(),
  public.map_element_exists(uuid, text), public.event_space_ok(uuid, uuid), public.event_ops_checks(uuid) from public, anon, authenticated;
grant execute on function public.ops_event_require(uuid), public.map_element_exists(uuid, text), public.event_space_ok(uuid, uuid), public.event_ops_checks(uuid) to service_role;
revoke all on function public.party_portal_user(uuid), public.package_save(uuid, jsonb, uuid), public.party_save(uuid, jsonb, uuid, integer), public.party_transition(uuid, text, text, text),
  public.party_link_portal_user(uuid, text), public.deliverable_save(uuid, jsonb, uuid), public.deliverable_add_evidence(uuid, jsonb), public.deliverable_transition(uuid, text, text),
  public.booth_save(uuid, jsonb, uuid), public.booth_allocate(uuid, uuid, boolean), public.booth_release(uuid), public.pass_request_save(uuid, jsonb), public.party_issue_passes(uuid, jsonb),
  public.pass_request_cancel(uuid), public.party_slot_set(uuid, uuid, text, text, text), public.rider_submit(uuid, text, text, jsonb), public.rider_decide(uuid, text, text),
  public.rider_item_fulfil(uuid, text, text, uuid, uuid, uuid), public.party_link_contract(uuid, uuid), public.party_create_contract(uuid, text, text),
  public.party_link_money(uuid, text, uuid, uuid, numeric, timestamptz, text), public.event_parties_overview(uuid), public.my_party_portal(),
  public.event_ops_readiness(uuid), public.event_ops_blockers(uuid, text) from public, anon;
grant execute on function public.party_portal_user(uuid), public.package_save(uuid, jsonb, uuid), public.party_save(uuid, jsonb, uuid, integer), public.party_transition(uuid, text, text, text),
  public.party_link_portal_user(uuid, text), public.deliverable_save(uuid, jsonb, uuid), public.deliverable_add_evidence(uuid, jsonb), public.deliverable_transition(uuid, text, text),
  public.booth_save(uuid, jsonb, uuid), public.booth_allocate(uuid, uuid, boolean), public.booth_release(uuid), public.pass_request_save(uuid, jsonb), public.party_issue_passes(uuid, jsonb),
  public.pass_request_cancel(uuid), public.party_slot_set(uuid, uuid, text, text, text), public.rider_submit(uuid, text, text, jsonb), public.rider_decide(uuid, text, text),
  public.rider_item_fulfil(uuid, text, text, uuid, uuid, uuid), public.party_link_contract(uuid, uuid), public.party_create_contract(uuid, text, text),
  public.party_link_money(uuid, text, uuid, uuid, numeric, timestamptz, text), public.event_parties_overview(uuid), public.my_party_portal(),
  public.event_ops_readiness(uuid), public.event_ops_blockers(uuid, text) to authenticated, service_role;
