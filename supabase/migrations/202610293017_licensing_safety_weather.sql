-- Q26 (lane C, 2026-10-29) — Licensing / compliance / safety / accessibility / weather (domains 158–162).
-- Additive and backward-compatible (new tables/functions; event_ops_checks gains the compliance checker):
--   * Jurisdiction rule packs are DATA: compliance_rule_packs (per country / region, versioned) → compliance_rules with
--     applicability conditions (event types, attendance, facts such as alcohol / live or recorded music / late night /
--     children performing / outdoor / in person / public) and what satisfies them (event licence types, a verified Q08 venue
--     credential, verified security-supplier credentials, approved safety-plan kinds, accessibility, weather contingency).
--     Seeded: England & Wales (Licensing Act 2003 premises licence / TEN incl. the 499 cap, late-night refreshment,
--     PRS for Music + PPL, children's performance licences, SIA door supervision, event safety / crowd plans, children's
--     safeguarding, outdoor weather contingency, accessibility information, event insurance). Nothing UK-specific in the schema.
--   * event_compliance_profiles: the organiser's answers; facts not answered are derived (attendance, late finish, outdoor
--     spaces, bar/catering bookings, booked talent, online format, visibility). Country default: workspace settings.country,
--     else 'GB' (platform default).
--   * event_licences (machine `event_licence`): draft → submitted → granted | refused …; granted → expired | revoked;
--     not_required needs a reason. Evidence path is a private Q04 reference. Expiry monitoring: daily job
--     compliance.expiry_daily (Q08 pattern: expire, 30/14/7/1-day reminders deduplicated, review dates).
--   * safety_plans (machine `safety_plan`): kinds event_safety / crowd / fire / evacuation / first_aid / medical / security /
--     safeguarding / weather; versioned, immutable once submitted, approval by a manager other than the author (owner may).
--   * event_accessibility: provisions, accessible / companion seating counts, accessible route = Q19 map element refs
--     (validated through map_element_exists); public summary only after approval. Guest requirements come from lane D's
--     guest_care flags (counts only).
--   * Weather: weather_watches + weather_alerts + contingency_plans; provider adapter lives in src/lib/weather (env contract +
--     health). No provider configured → watches report not_configured (BLOCKED_EXTERNAL) and readiness says so.
--     weather_record_forecast() (service only) evaluates thresholds and alerts managers through notify().
--   * Every failed REQUIRED rule becomes a readiness blocker with fix text (event_ops_checks → event_feasibility /
--     event_ops_readiness / event_ops_blockers), never a hidden warning.

-- ═══ 1. Licence types + rule packs (data) ═══
create table if not exists public.licence_types (
  key text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  label text not null,
  category text not null check (category in ('premises','temporary','alcohol','music','late_night','children','security','safety','insurance','other')),
  expires boolean not null default true,
  description text not null default ''
);
create table if not exists public.compliance_rule_packs (
  key text primary key check (key ~ '^[a-z0-9_-]{2,60}$'),
  country text not null check (country ~ '^[A-Z]{2}$'),
  region text,
  name text not null,
  version integer not null default 1,
  effective_from date not null default current_date,
  active boolean not null default true,
  source_note text not null default '',
  updated_at timestamptz not null default now()
);
create unique index if not exists compliance_rule_packs_active_idx on public.compliance_rule_packs(country, coalesce(region, '')) where active;
create table if not exists public.compliance_rules (
  id uuid primary key default gen_random_uuid(),
  pack_key text not null references public.compliance_rule_packs(key) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,60}$'),
  label text not null,
  description text not null default '',
  requirement_kind text not null check (requirement_kind in ('licence','notice','plan','certificate','insurance','registration','information')),
  applies jsonb not null default '{}' check (jsonb_typeof(applies) = 'object'),
  satisfied_by jsonb not null default '{}' check (jsonb_typeof(satisfied_by) = 'object'),
  severity text not null default 'required' check (severity in ('required','recommended')),
  lead_days integer not null default 0 check (lead_days between 0 and 365),
  fix_text text not null default '',
  sort integer not null default 0,
  active boolean not null default true,
  unique (pack_key, key)
);

-- ═══ 2. Profiles, licences ═══
create table if not exists public.event_compliance_profiles (
  event_id uuid primary key references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  region text,
  alcohol boolean, live_music boolean, recorded_music boolean, late_night boolean, hot_food boolean,
  children_performing boolean, outdoor boolean, expected_attendance integer check (expected_attendance is null or expected_attendance >= 0),
  notes text not null default '' check (length(notes) <= 2000),
  answered_by uuid references auth.users(id) on delete set null,
  answered_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.event_licences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  licence_type text not null references public.licence_types(key),
  status text not null default 'draft' check (status in ('draft','submitted','granted','refused','withdrawn','expired','revoked','not_required')),
  holder text not null default 'organizer' check (holder in ('organizer','venue','supplier','other')),
  authority text not null default '' check (length(authority) <= 160),
  reference text not null default '' check (length(reference) <= 120),
  applied_at timestamptz, decided_at timestamptz,
  valid_from timestamptz, valid_to timestamptz,
  conditions text not null default '' check (length(conditions) <= 2000),
  document_path text check (document_path is null or length(document_path) <= 500),
  reason text not null default '' check (length(reason) <= 500),
  last_reminder_days integer,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);
create index if not exists event_licences_event_idx on public.event_licences(event_id, licence_type, status);
create index if not exists event_licences_expiry_idx on public.event_licences(valid_to) where status = 'granted' and valid_to is not null;
drop trigger if exists event_licences_touch on public.event_licences;
create trigger event_licences_touch before update on public.event_licences for each row execute function public.ops_touch();

insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('event_licence', 'event_licences', 'status', 'enforce', array['draft','submitted','granted','not_required'], array['withdrawn','revoked'])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'event_licence';
insert into public.state_transitions(machine, from_state, to_state) values
  ('event_licence','draft','submitted'), ('event_licence','draft','granted'), ('event_licence','draft','withdrawn'), ('event_licence','draft','not_required'),
  ('event_licence','submitted','granted'), ('event_licence','submitted','refused'), ('event_licence','submitted','withdrawn'), ('event_licence','submitted','not_required'),
  ('event_licence','refused','submitted'), ('event_licence','refused','withdrawn'),
  ('event_licence','granted','expired'), ('event_licence','granted','revoked'),
  ('event_licence','expired','submitted'), ('event_licence','not_required','draft');
drop trigger if exists event_licences_state_guard on public.event_licences;
create trigger event_licences_state_guard before insert or update of status on public.event_licences for each row execute function public.enforce_state_transition('event_licence', 'status');

-- ═══ 3. Safety plans ═══
create table if not exists public.safety_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('event_safety','crowd','fire','evacuation','first_aid','medical','security','safeguarding','weather')),
  version integer not null check (version >= 1),
  status text not null default 'draft' check (status in ('draft','submitted','approved','changes_requested','superseded','withdrawn')),
  title text not null default '' check (length(title) <= 160),
  sections jsonb not null default '[]' check (jsonb_typeof(sections) = 'array' and length(sections::text) <= 60000),
  stewards integer check (stewards is null or stewards >= 0),
  first_aiders integer check (first_aiders is null or first_aiders >= 0),
  medical_provider text not null default '' check (length(medical_provider) <= 160),
  document_path text check (document_path is null or length(document_path) <= 500),
  review_due date,
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  submitted_at timestamptz,
  approver_id uuid references auth.users(id) on delete set null, approved_at timestamptz,
  decision_note text not null default '' check (length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  unique (event_id, kind, version)
);
create index if not exists safety_plans_event_idx on public.safety_plans(event_id, kind, status);
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('safety_plan', 'safety_plans', 'status', 'enforce', array['draft'], array['superseded','withdrawn'])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'safety_plan';
insert into public.state_transitions(machine, from_state, to_state) values
  ('safety_plan','draft','submitted'), ('safety_plan','draft','withdrawn'),
  ('safety_plan','submitted','approved'), ('safety_plan','submitted','changes_requested'), ('safety_plan','submitted','withdrawn'),
  ('safety_plan','changes_requested','superseded'), ('safety_plan','changes_requested','withdrawn'),
  ('safety_plan','approved','superseded');
drop trigger if exists safety_plans_state_guard on public.safety_plans;
create trigger safety_plans_state_guard before insert or update of status on public.safety_plans for each row execute function public.enforce_state_transition('safety_plan', 'status');
create or replace function public.safety_plans_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    if old.status <> 'draft' then raise exception 'plan_immutable' using errcode = '22023'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (new.sections is distinct from old.sections or new.title is distinct from old.title or new.kind is distinct from old.kind or new.version is distinct from old.version
     or new.stewards is distinct from old.stewards or new.first_aiders is distinct from old.first_aiders or new.document_path is distinct from old.document_path or new.medical_provider is distinct from old.medical_provider) then
    raise exception 'plan_immutable' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists safety_plans_immutable on public.safety_plans;
create trigger safety_plans_immutable before update or delete on public.safety_plans for each row execute function public.safety_plans_immutable();

-- ═══ 4. Accessibility ═══
create table if not exists public.event_accessibility (
  event_id uuid primary key references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  step_free boolean,
  accessible_toilets integer not null default 0 check (accessible_toilets >= 0),
  changing_places boolean not null default false,
  hearing_loop boolean not null default false,
  bsl_interpretation boolean not null default false,
  captioning boolean not null default false,
  quiet_space boolean not null default false,
  assistance_dogs boolean not null default true,
  accessible_seating integer not null default 0 check (accessible_seating >= 0),
  companion_seats integer not null default 0 check (companion_seats >= 0),
  venue_map_id uuid references public.venue_maps(id) on delete set null,
  accessible_route_refs text[] not null default '{}',
  route_note text not null default '' check (length(route_note) <= 1000),
  public_summary text not null default '' check (length(public_summary) <= 2000),
  summary_status text not null default 'draft' check (summary_status in ('draft','approved')),
  approved_by uuid references auth.users(id) on delete set null, approved_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ═══ 5. Weather + contingency ═══
create table if not exists public.weather_watches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  location_label text not null default '' check (length(location_label) <= 160),
  thresholds jsonb not null default '{"wind_kph": 50, "gust_kph": 65, "rain_mm_h": 8, "temp_max_c": 30, "temp_min_c": 0, "lightning": true}' check (jsonb_typeof(thresholds) = 'object'),
  window_from timestamptz, window_to timestamptz,
  status text not null default 'active' check (status in ('active','paused','ended')),
  provider text,
  provider_status text not null default 'pending' check (provider_status in ('pending','ok','not_configured','error')),
  last_checked_at timestamptz,
  last_forecast jsonb,
  last_error text not null default '' check (length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.weather_alerts (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.weather_watches(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  metric text not null check (metric in ('wind_kph','gust_kph','rain_mm_h','temp_max_c','temp_min_c','lightning')),
  value numeric, threshold numeric,
  forecast_for timestamptz not null,
  severity text not null check (severity in ('advisory','warning','severe')),
  message text not null,
  dedupe_key text not null unique,
  acknowledged_by uuid references auth.users(id) on delete set null, acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists weather_alerts_event_idx on public.weather_alerts(event_id, forecast_for);
create table if not exists public.contingency_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  trigger_kind text not null check (trigger_kind in ('wind','rain','heat','cold','lightning','flood','other')),
  threshold_text text not null default '' check (length(threshold_text) <= 200),
  action text not null check (action in ('delay','move_indoors','shelter','reduce_capacity','cancel','other')),
  action_detail text not null default '' check (length(action_detail) <= 2000),
  decision_owner text not null default '' check (length(decision_owner) <= 160),
  decision_deadline_hours integer check (decision_deadline_hours is null or decision_deadline_hours between 0 and 720),
  comms_note text not null default '' check (length(comms_note) <= 1000),
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  approved_by uuid references auth.users(id) on delete set null, approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contingency_plans_event_idx on public.contingency_plans(event_id, trigger_kind, status);

-- ═══ 6. RLS (event team reads; managers write through commands; reference data readable) ═══
do $$ declare t text; begin
  foreach t in array array['licence_types','compliance_rule_packs','compliance_rules','event_compliance_profiles','event_licences','safety_plans','event_accessibility',
    'weather_watches','weather_alerts','contingency_plans'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
drop policy if exists licence_types_read on public.licence_types;
create policy licence_types_read on public.licence_types for select to authenticated using (true);
drop policy if exists compliance_rule_packs_read on public.compliance_rule_packs;
create policy compliance_rule_packs_read on public.compliance_rule_packs for select to authenticated using (true);
drop policy if exists compliance_rules_read on public.compliance_rules;
create policy compliance_rules_read on public.compliance_rules for select to authenticated using (true);
do $$ declare t text; begin
  foreach t in array array['event_compliance_profiles','event_licences','safety_plans','event_accessibility','weather_watches','weather_alerts','contingency_plans'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_event(event_id))', t || '_read', t);
  end loop;
end $$;

-- ═══ 7. Facts + rule evaluation ═══
create or replace function public.event_compliance_facts(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; pr public.event_compliance_profiles; tz text; late boolean; outdoor boolean; att integer; online boolean;
begin
  select * into e from public.events where id = p_event;
  if not found then return null; end if;
  select * into pr from public.event_compliance_profiles where event_id = p_event;
  tz := coalesce(nullif(e.timezone, ''), 'Europe/London');
  late := e.ends_at is not null and ((e.ends_at at time zone tz)::time > time '23:00' or (e.ends_at at time zone tz)::time < time '05:00'
    or (e.ends_at at time zone tz)::date > (coalesce(e.starts_at, e.ends_at) at time zone tz)::date);
  outdoor := exists (select 1 from public.programme_items i join public.spaces s on s.id = i.space_id where i.event_id = e.id and not s.indoor)
    or exists (select 1 from public.provider_jobs j join public.build_items b on b.id = j.build_item_id join public.spaces s on s.id = j.space_id where b.event_id = e.id and b.category = 'venue' and not s.indoor);
  online := exists (select 1 from public.event_type_profiles t where t.event_type = e.event_type and t.online)
    or exists (select 1 from public.event_virtual v where v.event_id = e.id and v.format <> 'hybrid');
  att := coalesce(pr.expected_attendance, nullif(e.capacity, 0), nullif(e.guest_count, 0), 0);
  return jsonb_build_object(
    'country', coalesce(pr.country, nullif(upper((select w.settings ->> 'country' from public.workspaces w where w.id = e.workspace_id)), ''), 'GB'),
    'region', pr.region,
    'event_type', e.event_type,
    'attendance', att,
    'in_person', not online,
    'public', coalesce(e.visibility, 'private') = 'public',
    'alcohol', coalesce(pr.alcohol, exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'drinks' and b.status not in ('cancelled','declined','unavailable','expired','suggested'))),
    'hot_food', coalesce(pr.hot_food, exists (select 1 from public.build_items b where b.event_id = e.id and b.category in ('catering','food') and b.status not in ('cancelled','declined','unavailable','expired','suggested'))),
    'live_music', coalesce(pr.live_music, exists (select 1 from public.event_parties x where x.event_id = e.id and x.kind in ('artist','performer') and x.status in ('negotiating','confirmed'))
       or exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'entertainment' and b.status not in ('cancelled','declined','unavailable','expired','suggested'))),
    'recorded_music', coalesce(pr.recorded_music, exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'dj' and b.status not in ('cancelled','declined','unavailable','expired','suggested'))),
    'late_night', coalesce(pr.late_night, late),
    'children_performing', coalesce(pr.children_performing, false),
    'outdoor', coalesce(pr.outdoor, outdoor),
    'answered', pr.event_id is not null);
end $$;

-- Applicability: {event_types:[...], min_attendance, max_attendance, all:[fact...], any:[fact...], public:bool}. Missing keys match.
create or replace function public.compliance_rule_applies(p_applies jsonb, p_facts jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select (not (p_applies ? 'event_types') or (p_facts ->> 'event_type') in (select jsonb_array_elements_text(p_applies -> 'event_types')))
    and (not (p_applies ? 'min_attendance') or coalesce((p_facts ->> 'attendance')::int, 0) >= (p_applies ->> 'min_attendance')::int)
    and (not (p_applies ? 'max_attendance') or coalesce((p_facts ->> 'attendance')::int, 0) <= (p_applies ->> 'max_attendance')::int)
    and (not (p_applies ? 'public') or (p_facts ->> 'public')::boolean = (p_applies ->> 'public')::boolean)
    and (not (p_applies ? 'all') or not exists (select 1 from jsonb_array_elements_text(p_applies -> 'all') f where coalesce((p_facts ->> f)::boolean, false) = false))
    and (not (p_applies ? 'any') or exists (select 1 from jsonb_array_elements_text(p_applies -> 'any') f where coalesce((p_facts ->> f)::boolean, false)));
$$;

-- One row per applicable rule: status met | waived | pending | missing | expired | refused, with the reason and the fix.
create or replace function public.event_compliance_requirements_internal(p_event uuid)
returns table(rule_key text, label text, requirement_kind text, severity text, status text, reason text, fix text, link text, due_date date, pack_key text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare e public.events; facts jsonb; r public.compliance_rules; venue_ws uuid; lic text[]; st text; why text; base text; end_at timestamptz; n_sec integer; n_ok integer; kinds text[];
begin
  select * into e from public.events where id = p_event;
  if not found or e.workspace_id is null then return; end if;
  facts := public.event_compliance_facts(p_event);
  base := '/organizer/events/' || e.id;
  end_at := coalesce(e.ends_at, e.starts_at + interval '12 hours');
  select l.workspace_id into venue_ws from public.listings l where l.id = coalesce(e.venue_listing_id,
    (select b.listing_id from public.build_items b where b.event_id = e.id and b.category = 'venue' and b.status in ('confirmed','active','fulfilled','completed') order by b.updated_at desc limit 1));
  for r in select x.* from public.compliance_rules x join public.compliance_rule_packs k on k.key = x.pack_key
           where k.active and x.active and k.country = facts ->> 'country' and (k.region is null or k.region = facts ->> 'region') and k.effective_from <= current_date
           order by x.sort, x.key loop
    if not public.compliance_rule_applies(r.applies, facts) then continue; end if;
    st := 'missing'; why := null;
    lic := coalesce(array(select jsonb_array_elements_text(r.satisfied_by -> 'licence_types')), '{}');
    if cardinality(lic) > 0 then
      select case
          when bool_or(x.status = 'granted' and (x.valid_to is null or x.valid_to >= end_at)) then 'met'
          when bool_or(x.status = 'not_required') then 'waived'
          when bool_or(x.status = 'submitted') then 'pending'
          when bool_or(x.status = 'granted' or x.status = 'expired') then 'expired'
          when bool_or(x.status = 'refused') then 'refused' else 'missing' end,
        max(x.reason) filter (where x.status = 'not_required')
        into st, why from public.event_licences x where x.event_id = e.id and x.licence_type = any(lic);
      st := coalesce(st, 'missing');
    end if;
    if st not in ('met','waived') and r.satisfied_by ? 'venue_credential' and venue_ws is not null
       and exists (select 1 from public.trust_credential_eval(venue_ws, r.satisfied_by ->> 'venue_credential', null) c where c.status = 'verified') then
      st := 'met'; why := 'Venue holds a verified ' || replace(r.satisfied_by ->> 'venue_credential', '_', ' ') || '.';
    end if;
    if st not in ('met','waived') and r.satisfied_by ? 'supplier_credential' then
      select count(*), count(*) filter (where exists (select 1 from public.trust_credential_eval(l.workspace_id, r.satisfied_by ->> 'supplier_credential', null) c where c.status = 'verified'))
        into n_sec, n_ok from public.build_items b join public.listings l on l.id = b.listing_id
        where b.event_id = e.id and b.category = 'security' and b.status in ('confirmed','active','held');
      if n_sec > 0 and n_ok = n_sec then st := 'met'; why := 'Booked security supplier(s) hold verified licences.';
      elsif n_sec > 0 then why := (n_sec - n_ok) || ' booked security supplier(s) without a verified licence.'; end if;
    end if;
    kinds := coalesce(array(select jsonb_array_elements_text(r.satisfied_by -> 'safety_plans')), '{}');
    if cardinality(kinds) > 0 and st not in ('met','waived') then
      if not exists (select 1 from unnest(kinds) k where not exists (select 1 from public.safety_plans p where p.event_id = e.id and p.kind = k and p.status = 'approved')) then st := 'met';
      elsif exists (select 1 from public.safety_plans p where p.event_id = e.id and p.kind = any(kinds) and p.status = 'submitted') then st := 'pending'; why := 'Safety plan submitted for approval.';
      else st := 'missing'; end if;
    end if;
    if coalesce((r.satisfied_by ->> 'contingency')::boolean, false) then
      st := case when exists (select 1 from public.contingency_plans c where c.event_id = e.id and c.status = 'approved')
                  and exists (select 1 from public.weather_watches w where w.event_id = e.id and w.status = 'active') then 'met'
                 when exists (select 1 from public.contingency_plans c where c.event_id = e.id) then 'pending' else 'missing' end;
      if st = 'pending' then why := 'Contingency plan or weather watch not in place yet.'; end if;
    end if;
    if coalesce((r.satisfied_by ->> 'accessibility')::boolean, false) then
      st := case when exists (select 1 from public.event_accessibility a where a.event_id = e.id and a.summary_status = 'approved') then 'met'
                 when exists (select 1 from public.event_accessibility a where a.event_id = e.id) then 'pending' else 'missing' end;
    end if;
    if r.satisfied_by ? 'organizer_credential' and st not in ('met','waived')
       and exists (select 1 from public.trust_credential_eval(e.workspace_id, r.satisfied_by ->> 'organizer_credential', null) c where c.status = 'verified') then
      st := 'met'; why := 'Verified on your workspace documents.';
    end if;
    return query select r.key, r.label, r.requirement_kind, r.severity, st,
      coalesce(why, case st when 'missing' then r.description when 'expired' then 'The licence on file has expired or ends before the event.' when 'refused' then 'The application was refused.' when 'pending' then 'Submitted — awaiting a decision.' else null end),
      coalesce(nullif(r.fix_text, ''), r.label) || case when r.lead_days > 0 and e.starts_at is not null and st in ('missing','refused','expired') then ' Deadline: ' || to_char((e.starts_at - make_interval(days => r.lead_days)) at time zone 'UTC', 'FMDD Mon YYYY') || '.' else '' end,
      base || '?tab=plan&section=' || case when r.requirement_kind = 'information' then 'accessibility' else 'compliance' end,
      case when r.lead_days > 0 and e.starts_at is not null then (e.starts_at - make_interval(days => r.lead_days))::date end, r.pack_key;
  end loop;
end $$;

create or replace function public.event_ops_checks_compliance(p_event uuid)
returns table(domain text, key text, severity text, message text, fix text, ref_id uuid, conflict boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare e public.events; base text; days numeric; facts jsonb; acc public.event_accessibility; wheel integer; hear integer; park integer; comp integer; acc_park integer;
begin
  select * into e from public.events ev where ev.id = p_event;
  if not found or e.workspace_id is null or e.status in ('completed','closed','cancelled','archived') or (e.starts_at is not null and e.starts_at < now() - interval '1 day') then return; end if;
  base := '/organizer/events/' || e.id;
  days := case when e.starts_at is null then null else extract(epoch from (e.starts_at - now())) / 86400 end;
  facts := public.event_compliance_facts(p_event);
  -- Rule packs: failed REQUIRED rules are blockers with the fix text; pending close to the event escalates.
  return query select 'compliance', 'rule_' || q.rule_key,
      case when q.severity = 'required' and q.status in ('missing','expired','refused') then 'blocker'
           when q.severity = 'required' and q.status = 'pending' and days is not null and days < 2 then 'blocker' else 'warning' end,
      q.label || ' — ' || coalesce(q.reason, q.status) || ' Fix: ' || q.fix, q.link, null::uuid, false
    from public.event_compliance_requirements_internal(p_event) q where q.status not in ('met','waived');
  if not coalesce((facts ->> 'answered')::boolean, false) and days is not null and days < 90 and coalesce((facts ->> 'in_person')::boolean, true) then
    return query select 'compliance', 'compliance_profile_missing', 'warning', 'Answer the licensing questions (alcohol, music, late finish, children performing, outdoor) so the right licences are checked.',
      base || '?tab=plan&section=compliance', null::uuid, false;
  end if;
  -- Licences that lapse before the event ends.
  return query select 'compliance', 'licence_expires_before_event', 'blocker', t.label || ' (' || coalesce(nullif(l.reference, ''), 'no reference') || ') expires ' || to_char(l.valid_to, 'FMDD Mon YYYY') || ', before the event ends. Renew it.',
      base || '?tab=plan&section=compliance', l.id, false
    from public.event_licences l join public.licence_types t on t.key = l.licence_type
    where l.event_id = e.id and l.status = 'granted' and l.valid_to is not null and l.valid_to < coalesce(e.ends_at, e.starts_at + interval '12 hours');
  -- Safety plans waiting on a decision / sent back.
  return query select 'compliance', 'safety_plan_' || p.status, case when p.status = 'submitted' and days is not null and days < 3 then 'blocker' else 'warning' end,
      initcap(replace(p.kind, '_', ' ')) || ' plan v' || p.version || case p.status when 'submitted' then ' is waiting for approval.' else ' needs changes: ' || p.decision_note end,
      base || '?tab=plan&section=compliance', p.id, false
    from public.safety_plans p where p.event_id = e.id and p.status in ('submitted','changes_requested')
      and not exists (select 1 from public.safety_plans n where n.event_id = p.event_id and n.kind = p.kind and n.version > p.version);
  -- Accessibility vs guest requirements (lane D guest_care flags, counted only).
  select * into acc from public.event_accessibility where event_id = e.id;
  select count(*) filter (where exists (select 1 from unnest(c.access_flags) f where f ilike '%wheelchair%' or f ilike '%step%free%') or c.accessibility ilike '%wheelchair%'),
         count(*) filter (where exists (select 1 from unnest(c.access_flags) f where f ilike '%hearing%' or f ilike '%loop%' or f ilike '%deaf%')),
         count(*) filter (where exists (select 1 from unnest(c.access_flags) f where f ilike '%parking%' or f ilike '%blue%badge%')),
         count(*) filter (where exists (select 1 from unnest(c.access_flags) f where f ilike '%companion%' or f ilike '%carer%'))
    into wheel, hear, park, comp
    from public.guest_care c join public.guests g on g.id = c.guest_id where c.event_id = e.id and g.status <> 'declined';
  if wheel > 0 and (acc.event_id is null or coalesce(acc.step_free, false) = false) then
    return query select 'compliance', 'step_free_access_missing', 'blocker', wheel || ' guest(s) need step-free access but step-free access is not confirmed.', base || '?tab=plan&section=accessibility', null::uuid, false;
  end if;
  if wheel > coalesce(acc.accessible_seating, 0) then
    return query select 'compliance', 'accessible_seating_short', 'blocker', wheel || ' wheelchair user(s) registered; ' || coalesce(acc.accessible_seating, 0) || ' accessible space(s) provided.', base || '?tab=plan&section=accessibility', null::uuid, false;
  end if;
  if comp > coalesce(acc.companion_seats, 0) then
    return query select 'compliance', 'companion_seats_short', 'warning', comp || ' guest(s) need a companion seat; ' || coalesce(acc.companion_seats, 0) || ' provided.', base || '?tab=plan&section=accessibility', null::uuid, false;
  end if;
  if hear > 0 and not coalesce(acc.hearing_loop, false) and not coalesce(acc.captioning, false) then
    return query select 'compliance', 'hearing_support_missing', 'warning', hear || ' guest(s) asked for hearing support (loop or captions).', base || '?tab=plan&section=accessibility', null::uuid, false;
  end if;
  select coalesce(sum(a.accessible_spaces), 0) into acc_park from public.parking_areas a where a.event_id = e.id and a.status = 'active';
  if park > acc_park then
    return query select 'compliance', 'accessible_parking_short', 'warning', park || ' guest(s) need accessible parking; ' || acc_park || ' space(s) set aside.', base || '?tab=operations&section=logistics', null::uuid, false;
  end if;
  -- Weather: provider not configured (BLOCKED_EXTERNAL) is visible, severe alerts without an approved contingency block.
  return query select 'compliance', 'weather_provider_unavailable', 'warning', 'Weather monitoring is not connected (no provider configured — BLOCKED_EXTERNAL). Check the forecast manually and keep the contingency plan ready.',
      base || '?tab=operations&section=weather', w.id, false
    from public.weather_watches w where w.event_id = e.id and w.status = 'active' and w.provider_status in ('pending','not_configured','error');
  return query select distinct on (a.metric) 'compliance', 'weather_alert_' || a.metric,
      case when a.severity = 'severe' and not exists (select 1 from public.contingency_plans c where c.event_id = e.id and c.status = 'approved'
             and c.trigger_kind = case a.metric when 'wind_kph' then 'wind' when 'gust_kph' then 'wind' when 'rain_mm_h' then 'rain' when 'temp_max_c' then 'heat' when 'temp_min_c' then 'cold' else 'lightning' end) then 'blocker' else 'warning' end,
      a.message, base || '?tab=operations&section=weather', a.id, true
    from public.weather_alerts a where a.event_id = e.id and a.acknowledged_at is null and a.forecast_for between now() - interval '3 hours' and now() + interval '72 hours'
    order by a.metric, case a.severity when 'severe' then 0 when 'warning' then 1 else 2 end;
end $$;

-- Dispatcher: partners (Q24) + logistics (Q25) + compliance (Q26).
create or replace function public.event_ops_checks(p_event uuid)
returns table(domain text, key text, severity text, message text, fix text, ref_id uuid, conflict boolean)
language sql stable security definer set search_path = '' as $$
  select * from public.event_ops_checks_partners(p_event)
  union all select * from public.event_ops_checks_logistics(p_event)
  union all select * from public.event_ops_checks_compliance(p_event);
$$;

-- ═══ 8. Commands ═══
create or replace function public.compliance_profile_save(p_event uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events;
begin
  e := public.ops_event_require(p_event);
  insert into public.event_compliance_profiles(event_id, workspace_id, country, region, alcohol, live_music, recorded_music, late_night, hot_food, children_performing, outdoor, expected_attendance, notes, answered_by, answered_at)
    values (e.id, e.workspace_id, nullif(upper(p ->> 'country'), ''), nullif(p ->> 'region', ''), (p ->> 'alcohol')::boolean, (p ->> 'live_music')::boolean, (p ->> 'recorded_music')::boolean,
      (p ->> 'late_night')::boolean, (p ->> 'hot_food')::boolean, (p ->> 'children_performing')::boolean, (p ->> 'outdoor')::boolean, nullif(p ->> 'expected_attendance', '')::int,
      coalesce(p ->> 'notes', ''), auth.uid(), now())
    on conflict (event_id) do update set country = coalesce(excluded.country, public.event_compliance_profiles.country), region = case when p ? 'region' then excluded.region else public.event_compliance_profiles.region end,
      alcohol = case when p ? 'alcohol' then excluded.alcohol else public.event_compliance_profiles.alcohol end,
      live_music = case when p ? 'live_music' then excluded.live_music else public.event_compliance_profiles.live_music end,
      recorded_music = case when p ? 'recorded_music' then excluded.recorded_music else public.event_compliance_profiles.recorded_music end,
      late_night = case when p ? 'late_night' then excluded.late_night else public.event_compliance_profiles.late_night end,
      hot_food = case when p ? 'hot_food' then excluded.hot_food else public.event_compliance_profiles.hot_food end,
      children_performing = case when p ? 'children_performing' then excluded.children_performing else public.event_compliance_profiles.children_performing end,
      outdoor = case when p ? 'outdoor' then excluded.outdoor else public.event_compliance_profiles.outdoor end,
      expected_attendance = case when p ? 'expected_attendance' then excluded.expected_attendance else public.event_compliance_profiles.expected_attendance end,
      notes = coalesce(p ->> 'notes', public.event_compliance_profiles.notes), answered_by = auth.uid(), answered_at = now(), updated_at = now();
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.profile_saved', jsonb_build_object('event_id', e.id));
  return public.event_compliance_facts(e.id);
end $$;

create or replace function public.licence_save(p_event uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; l public.event_licences; path text := nullif(p ->> 'document_path', '');
begin
  e := public.ops_event_require(p_event);
  if path is not null and not (path like e.workspace_id::text || '/%' or path like auth.uid()::text || '/%') then raise exception 'invalid_storage_path' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.event_licences(event_id, workspace_id, licence_type, holder, authority, reference, valid_from, valid_to, conditions, document_path)
      values (e.id, e.workspace_id, p ->> 'licence_type', coalesce(nullif(p ->> 'holder', ''), 'organizer'), coalesce(p ->> 'authority', ''), coalesce(p ->> 'reference', ''),
        nullif(p ->> 'valid_from', '')::timestamptz, nullif(p ->> 'valid_to', '')::timestamptz, coalesce(p ->> 'conditions', ''), path) returning * into l;
  else
    select * into l from public.event_licences where id = p_id and event_id = e.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.event_licences set holder = coalesce(nullif(p ->> 'holder', ''), holder), authority = coalesce(p ->> 'authority', authority), reference = coalesce(p ->> 'reference', reference),
      valid_from = case when p ? 'valid_from' then nullif(p ->> 'valid_from', '')::timestamptz else valid_from end,
      valid_to = case when p ? 'valid_to' then nullif(p ->> 'valid_to', '')::timestamptz else valid_to end,
      conditions = coalesce(p ->> 'conditions', conditions), document_path = coalesce(path, document_path), last_reminder_days = null where id = l.id returning * into l;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.licence_saved', jsonb_build_object('event_id', e.id, 'licence_id', l.id, 'licence_type', l.licence_type));
  return jsonb_build_object('id', l.id, 'status', l.status);
end $$;

create or replace function public.licence_transition(p_licence uuid, p_to text, p_note text default null, p jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.event_licences; e public.events; res jsonb; t public.licence_types;
begin
  select * into l from public.event_licences where id = p_licence for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(l.event_id);
  select * into t from public.licence_types where key = l.licence_type;
  if p_to = 'not_required' and length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'reason_required' using errcode = '22023', detail = 'Explain why this licence is not needed (min 10 characters).'; end if;
  if p_to = 'granted' then
    update public.event_licences set valid_from = coalesce(nullif(p ->> 'valid_from', '')::timestamptz, valid_from), valid_to = coalesce(nullif(p ->> 'valid_to', '')::timestamptz, valid_to),
      reference = coalesce(nullif(p ->> 'reference', ''), reference) where id = l.id returning * into l;
    if btrim(l.reference) = '' then raise exception 'reference_required' using errcode = '22023'; end if;
    if t.expires and l.valid_to is null then raise exception 'valid_to_required' using errcode = '22023'; end if;
  end if;
  res := public.transition_state('event_licence', l.id, p_to, null, auth.uid(), 'user', p_note, null);
  update public.event_licences set reason = case when p_to = 'not_required' then left(p_note, 500) else reason end,
    applied_at = case when p_to = 'submitted' then now() else applied_at end, decided_at = case when p_to in ('granted','refused') then now() else decided_at end where id = l.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.licence_changed',
    jsonb_build_object('event_id', e.id, 'licence_id', l.id, 'licence_type', l.licence_type, 'from', l.status, 'to', p_to));
  return res;
end $$;

create or replace function public.safety_plan_save(p_event uuid, p_kind text, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; sp public.safety_plans; v integer; path text := nullif(p ->> 'document_path', '');
begin
  e := public.ops_event_require(p_event);
  if path is not null and not (path like e.workspace_id::text || '/%' or path like auth.uid()::text || '/%') then raise exception 'invalid_storage_path' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('safety_plan:' || e.id::text || ':' || p_kind, 0));
  select * into sp from public.safety_plans where event_id = e.id and kind = p_kind and status = 'draft' order by version desc limit 1;
  if sp.id is null then
    select coalesce(max(version), 0) + 1 into v from public.safety_plans where event_id = e.id and kind = p_kind;
    insert into public.safety_plans(event_id, workspace_id, kind, version, title, sections, stewards, first_aiders, medical_provider, document_path, review_due)
      values (e.id, e.workspace_id, p_kind, v, coalesce(p ->> 'title', ''), coalesce(case when jsonb_typeof(p -> 'sections') = 'array' then p -> 'sections' end, '[]'),
        nullif(p ->> 'stewards', '')::int, nullif(p ->> 'first_aiders', '')::int, coalesce(p ->> 'medical_provider', ''), path, nullif(p ->> 'review_due', '')::date) returning * into sp;
  else
    update public.safety_plans set title = coalesce(p ->> 'title', title), sections = coalesce(case when jsonb_typeof(p -> 'sections') = 'array' then p -> 'sections' end, sections),
      stewards = coalesce(nullif(p ->> 'stewards', '')::int, stewards), first_aiders = coalesce(nullif(p ->> 'first_aiders', '')::int, first_aiders),
      medical_provider = coalesce(p ->> 'medical_provider', medical_provider), document_path = coalesce(path, document_path), review_due = coalesce(nullif(p ->> 'review_due', '')::date, review_due)
      where id = sp.id returning * into sp;
  end if;
  return jsonb_build_object('id', sp.id, 'version', sp.version, 'status', sp.status);
end $$;

create or replace function public.safety_plan_submit(p_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare sp public.safety_plans; e public.events;
begin
  select * into sp from public.safety_plans where id = p_plan for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(sp.event_id);
  if jsonb_array_length(sp.sections) = 0 and sp.document_path is null then raise exception 'plan_empty' using errcode = '22023'; end if;
  update public.safety_plans set status = 'superseded' where event_id = sp.event_id and kind = sp.kind and status = 'changes_requested' and version < sp.version;
  perform public.transition_state('safety_plan', sp.id, 'submitted', 'draft', auth.uid(), 'user', null, null);
  update public.safety_plans set submitted_at = now() where id = sp.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.safety_plan_submitted', jsonb_build_object('event_id', e.id, 'plan_id', sp.id, 'kind', sp.kind, 'version', sp.version));
  perform public.notify_workspace(e.workspace_id, array['owner','manager'], 'safety_plan_submitted', initcap(replace(sp.kind, '_', ' ')) || ' plan v' || sp.version || ' needs approval', e.name, '/organizer/events/' || e.id || '?tab=plan&section=compliance');
  return jsonb_build_object('status', 'submitted');
end $$;

-- Approval: a manager other than the author (the workspace owner may approve their own). Approval supersedes the previous approved version.
create or replace function public.safety_plan_decide(p_plan uuid, p_decision text, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare sp public.safety_plans; e public.events; uid uuid := (select auth.uid()); is_owner boolean;
begin
  select * into sp from public.safety_plans where id = p_plan for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(sp.event_id);
  if p_decision not in ('approved','changes_requested') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  if sp.status <> 'submitted' then raise exception 'plan_not_submitted' using errcode = '22023'; end if;
  is_owner := exists (select 1 from public.workspaces w where w.id = e.workspace_id and w.owner_id = uid);
  if sp.author_id = uid and not is_owner then raise exception 'self_approval_not_allowed' using errcode = '42501'; end if;
  if p_decision = 'changes_requested' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  if p_decision = 'approved' then
    update public.safety_plans set status = 'superseded' where event_id = sp.event_id and kind = sp.kind and status = 'approved' and id <> sp.id;
  end if;
  perform public.transition_state('safety_plan', sp.id, p_decision, 'submitted', uid, 'user', p_note, null);
  update public.safety_plans set approver_id = uid, approved_at = case when p_decision = 'approved' then now() end, decision_note = coalesce(left(p_note, 1000), '') where id = sp.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, e.workspace_id, 'compliance.safety_plan_decided',
    jsonb_build_object('event_id', e.id, 'plan_id', sp.id, 'kind', sp.kind, 'version', sp.version, 'decision', p_decision));
  return jsonb_build_object('status', p_decision);
end $$;

create or replace function public.accessibility_save(p_event uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; refs text[] := coalesce(array(select jsonb_array_elements_text(p -> 'accessible_route_refs')), '{}'); mp uuid := nullif(p ->> 'venue_map_id', '')::uuid; a public.event_accessibility;
begin
  e := public.ops_event_require(p_event);
  if mp is not null and not exists (select 1 from public.venue_maps v where v.id = mp and v.event_id = e.id) then raise exception 'map_not_in_event' using errcode = '22023'; end if;
  if cardinality(refs) > 0 and (mp is null or exists (select 1 from unnest(refs) x where not public.map_element_exists(mp, x))) then raise exception 'map_element_not_found' using errcode = '22023'; end if;
  insert into public.event_accessibility(event_id, workspace_id) values (e.id, e.workspace_id) on conflict (event_id) do nothing;
  update public.event_accessibility set step_free = case when p ? 'step_free' then (p ->> 'step_free')::boolean else step_free end,
    accessible_toilets = coalesce(nullif(p ->> 'accessible_toilets', '')::int, accessible_toilets), changing_places = coalesce((p ->> 'changing_places')::boolean, changing_places),
    hearing_loop = coalesce((p ->> 'hearing_loop')::boolean, hearing_loop), bsl_interpretation = coalesce((p ->> 'bsl_interpretation')::boolean, bsl_interpretation),
    captioning = coalesce((p ->> 'captioning')::boolean, captioning), quiet_space = coalesce((p ->> 'quiet_space')::boolean, quiet_space),
    assistance_dogs = coalesce((p ->> 'assistance_dogs')::boolean, assistance_dogs),
    accessible_seating = coalesce(nullif(p ->> 'accessible_seating', '')::int, accessible_seating), companion_seats = coalesce(nullif(p ->> 'companion_seats', '')::int, companion_seats),
    venue_map_id = coalesce(mp, venue_map_id), accessible_route_refs = case when p ? 'accessible_route_refs' then refs else accessible_route_refs end,
    route_note = coalesce(p ->> 'route_note', route_note),
    public_summary = coalesce(p ->> 'public_summary', public_summary),
    summary_status = case when p ? 'public_summary' and (p ->> 'public_summary') is distinct from public_summary then 'draft' else summary_status end,
    updated_at = now() where event_id = e.id returning * into a;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.accessibility_saved', jsonb_build_object('event_id', e.id));
  return to_jsonb(a) - 'workspace_id';
end $$;

create or replace function public.accessibility_approve_summary(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events;
begin
  e := public.ops_event_require(p_event);
  update public.event_accessibility set summary_status = 'approved', approved_by = auth.uid(), approved_at = now() where event_id = e.id and btrim(public_summary) <> '';
  if not found then raise exception 'summary_required' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.accessibility_approved', jsonb_build_object('event_id', e.id));
  return jsonb_build_object('summary_status', 'approved');
end $$;

create or replace function public.weather_watch_save(p_event uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; w public.weather_watches; lat double precision; lng double precision;
begin
  e := public.ops_event_require(p_event);
  select l.lat, l.lng into lat, lng from public.listings l where l.id = e.venue_listing_id;
  insert into public.weather_watches(event_id, workspace_id, latitude, longitude, location_label, window_from, window_to)
    values (e.id, e.workspace_id, coalesce(nullif(p ->> 'latitude', '')::float8, lat), coalesce(nullif(p ->> 'longitude', '')::float8, lng), coalesce(p ->> 'location_label', e.city, ''),
      coalesce(nullif(p ->> 'window_from', '')::timestamptz, e.starts_at - interval '6 hours'), coalesce(nullif(p ->> 'window_to', '')::timestamptz, coalesce(e.ends_at, e.starts_at + interval '12 hours')))
    on conflict (event_id) do update set latitude = coalesce(nullif(p ->> 'latitude', '')::float8, public.weather_watches.latitude), longitude = coalesce(nullif(p ->> 'longitude', '')::float8, public.weather_watches.longitude),
      location_label = coalesce(p ->> 'location_label', public.weather_watches.location_label), status = coalesce(nullif(p ->> 'status', ''), public.weather_watches.status),
      window_from = coalesce(nullif(p ->> 'window_from', '')::timestamptz, public.weather_watches.window_from), window_to = coalesce(nullif(p ->> 'window_to', '')::timestamptz, public.weather_watches.window_to), updated_at = now()
    returning * into w;
  if jsonb_typeof(p -> 'thresholds') = 'object' then update public.weather_watches set thresholds = thresholds || (p -> 'thresholds') where id = w.id returning * into w; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.weather_watch_saved', jsonb_build_object('event_id', e.id, 'watch_id', w.id));
  return jsonb_build_object('id', w.id, 'status', w.status, 'provider_status', w.provider_status, 'has_location', w.latitude is not null);
end $$;

create or replace function public.contingency_plan_save(p_event uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; c public.contingency_plans;
begin
  e := public.ops_event_require(p_event);
  if p_id is null then
    insert into public.contingency_plans(event_id, workspace_id, trigger_kind, threshold_text, action, action_detail, decision_owner, decision_deadline_hours, comms_note)
      values (e.id, e.workspace_id, p ->> 'trigger_kind', coalesce(p ->> 'threshold_text', ''), p ->> 'action', coalesce(p ->> 'action_detail', ''), coalesce(p ->> 'decision_owner', ''),
        nullif(p ->> 'decision_deadline_hours', '')::int, coalesce(p ->> 'comms_note', '')) returning * into c;
  else
    update public.contingency_plans set trigger_kind = coalesce(nullif(p ->> 'trigger_kind', ''), trigger_kind), threshold_text = coalesce(p ->> 'threshold_text', threshold_text),
      action = coalesce(nullif(p ->> 'action', ''), action), action_detail = coalesce(p ->> 'action_detail', action_detail), decision_owner = coalesce(p ->> 'decision_owner', decision_owner),
      decision_deadline_hours = coalesce(nullif(p ->> 'decision_deadline_hours', '')::int, decision_deadline_hours), comms_note = coalesce(p ->> 'comms_note', comms_note),
      status = case when p ? 'status' and p ->> 'status' in ('draft','retired') then p ->> 'status' when p - 'status' <> '{}'::jsonb then 'draft' else status end, updated_at = now()
      where id = p_id and event_id = e.id returning * into c;
    if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', c.id, 'status', c.status);
end $$;

create or replace function public.contingency_plan_approve(p_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contingency_plans;
begin
  select * into c from public.contingency_plans where id = p_plan for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.ops_event_require(c.event_id);
  if btrim(c.decision_owner) = '' then raise exception 'decision_owner_required' using errcode = '22023'; end if;
  update public.contingency_plans set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now() where id = c.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), c.workspace_id, 'compliance.contingency_approved', jsonb_build_object('event_id', c.event_id, 'plan_id', c.id, 'trigger', c.trigger_kind));
  return jsonb_build_object('status', 'approved');
end $$;

create or replace function public.weather_alert_acknowledge(p_alert uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare a public.weather_alerts;
begin
  select * into a from public.weather_alerts where id = p_alert for update;
  if not found or not public.can_manage_event(a.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.weather_alerts set acknowledged_by = auth.uid(), acknowledged_at = now() where id = a.id and acknowledged_at is null;
end $$;

-- Provider adapter output (service only): {"hours":[{"at":iso,"wind_kph","gust_kph","rain_mm_h","temp_c","lightning"}]}.
create or replace function public.weather_record_forecast(p_watch uuid, p_provider text, p_forecast jsonb, p_error text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w public.weather_watches; e public.events; h jsonb; at_ts timestamptz; m text; v numeric; thr numeric; breach boolean; sev text; msg text; n integer := 0; aid uuid; plan text;
begin
  select * into w from public.weather_watches where id = p_watch for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.events where id = w.event_id;
  if p_error is not null then
    update public.weather_watches set provider = p_provider, provider_status = 'error', last_error = left(p_error, 500), last_checked_at = now(), updated_at = now() where id = w.id;
    return jsonb_build_object('alerts', 0, 'status', 'error');
  end if;
  update public.weather_watches set provider = p_provider, provider_status = 'ok', last_error = '', last_checked_at = now(), last_forecast = p_forecast, updated_at = now() where id = w.id;
  for h in select * from jsonb_array_elements(coalesce(p_forecast -> 'hours', '[]')) loop
    at_ts := (h ->> 'at')::timestamptz;
    if at_ts is null or (w.window_from is not null and at_ts < w.window_from) or (w.window_to is not null and at_ts > w.window_to) then continue; end if;
    foreach m in array array['wind_kph','gust_kph','rain_mm_h','temp_max_c','temp_min_c','lightning'] loop
      thr := case when m = 'lightning' then null else nullif(w.thresholds ->> m, '')::numeric end; breach := false; v := null;
      if m = 'lightning' then breach := coalesce((w.thresholds ->> 'lightning')::boolean, false) and coalesce((h ->> 'lightning')::boolean, false); thr := null;
      elsif m = 'temp_max_c' then v := nullif(h ->> 'temp_c', '')::numeric; breach := thr is not null and v is not null and v >= thr;
      elsif m = 'temp_min_c' then v := nullif(h ->> 'temp_c', '')::numeric; breach := thr is not null and v is not null and v <= thr;
      else v := nullif(h ->> m, '')::numeric; breach := thr is not null and v is not null and v >= thr; end if;
      if not breach then continue; end if;
      sev := case when m = 'lightning' then 'severe' when m in ('temp_min_c') then 'warning' when thr is not null and thr > 0 and v >= thr * 1.3 then 'severe' else 'warning' end;
      select c.action || coalesce(' — ' || nullif(c.decision_owner, '') || ' decides', '') into plan from public.contingency_plans c where c.event_id = e.id and c.status = 'approved'
        and c.trigger_kind = case m when 'wind_kph' then 'wind' when 'gust_kph' then 'wind' when 'rain_mm_h' then 'rain' when 'temp_max_c' then 'heat' when 'temp_min_c' then 'cold' else 'lightning' end limit 1;
      msg := initcap(sev) || ' weather for ' || e.name || ': ' || replace(replace(m, '_kph', ''), '_', ' ') || coalesce(' ' || v::text, '') || coalesce(' (limit ' || thr::text || ')', '') || ' at '
        || to_char(at_ts at time zone coalesce(nullif(e.timezone, ''), 'Europe/London'), 'Dy HH24:MI') || '. ' || coalesce('Contingency: ' || replace(plan, '_', ' ') || '.', 'No approved contingency plan for this.');
      insert into public.weather_alerts(watch_id, event_id, metric, value, threshold, forecast_for, severity, message, dedupe_key)
        values (w.id, e.id, m, v, thr, at_ts, sev, msg, w.id || ':' || m || ':' || to_char(at_ts at time zone 'UTC', 'YYYY-MM-DD'))
        on conflict (dedupe_key) do nothing returning id into aid;
      if aid is not null then
        n := n + 1;
        perform public.notify_workspace(e.workspace_id, array['owner','manager'], 'weather_alert', left(msg, 120), msg, '/organizer/events/' || e.id || '?tab=operations&section=weather');
        insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', e.workspace_id, 'compliance.weather_alert', jsonb_build_object('event_id', e.id, 'alert_id', aid, 'metric', m, 'severity', sev));
      end if;
      aid := null;
    end loop;
  end loop;
  return jsonb_build_object('alerts', n, 'status', 'ok');
end $$;

-- App job when no adapter / env is configured: mark active watches BLOCKED_EXTERNAL (visible in readiness), never silent.
create or replace function public.weather_provider_unavailable(p_reason text default 'not_configured') returns integer
language sql volatile security definer set search_path = '' as $$
  with u as (update public.weather_watches set provider_status = 'not_configured', last_error = left(coalesce(p_reason, ''), 500), last_checked_at = now(), updated_at = now()
    where status = 'active' and provider_status <> 'not_configured' returning 1) select count(*)::int from u;
$$;

-- ═══ 9. Expiry monitoring job (Q08 pattern) ═══
create or replace function public.job_compliance_expiry_daily(p_job public.job_queue) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l record; expired integer := 0; reminders integer := 0; reviews integer := 0; thr integer; ended integer;
begin
  for l in select x.id, x.workspace_id, x.event_id, x.valid_to, t.label from public.event_licences x join public.licence_types t on t.key = x.licence_type
           where x.status = 'granted' and x.valid_to is not null and x.valid_to < now() for update of x skip locked loop
    perform public.transition_state('event_licence', l.id, 'expired', 'granted', null, 'system', 'valid_to passed', null);
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', l.workspace_id, 'compliance.licence_expired', jsonb_build_object('event_id', l.event_id, 'licence_id', l.id));
    perform public.trust_notify_workspace(l.workspace_id, 'licence_expired', l.label || ' has expired', 'Renew it or record a replacement — readiness now shows a blocker.', '/organizer/events/' || l.event_id || '?tab=plan&section=compliance', 'licence.expired:' || l.id);
    expired := expired + 1;
  end loop;
  for l in select x.id, x.workspace_id, x.event_id, x.valid_to, x.last_reminder_days, t.label, (x.valid_to::date - current_date) as left_days
           from public.event_licences x join public.licence_types t on t.key = x.licence_type join public.events e on e.id = x.event_id
           where x.status = 'granted' and x.valid_to is not null and x.valid_to >= now() and x.valid_to::date - current_date <= 30
             and e.status not in ('completed','closed','cancelled','archived') loop
    select min(v) into thr from unnest(array[30,14,7,1]) v where v >= l.left_days;
    if thr is null or (l.last_reminder_days is not null and l.last_reminder_days <= thr) then continue; end if;
    perform public.trust_notify_workspace(l.workspace_id, 'licence_expiring', l.label || ' expires in ' || l.left_days || ' day' || case when l.left_days = 1 then '' else 's' end,
      'Renew before ' || to_char(l.valid_to, 'FMDD Mon YYYY') || '.', '/organizer/events/' || l.event_id || '?tab=plan&section=compliance', 'licence.expiring:' || l.id || ':' || thr);
    update public.event_licences set last_reminder_days = thr where id = l.id;
    reminders := reminders + 1;
  end loop;
  for l in select p.id, p.workspace_id, p.event_id, p.kind from public.safety_plans p join public.events e on e.id = p.event_id
           where p.status = 'approved' and p.review_due is not null and p.review_due <= current_date and e.status not in ('completed','closed','cancelled','archived') loop
    perform public.trust_notify_workspace(l.workspace_id, 'safety_plan_review', initcap(replace(l.kind, '_', ' ')) || ' plan is due for review', 'Revise and resubmit it.', '/organizer/events/' || l.event_id || '?tab=plan&section=compliance', 'safety.review:' || l.id || ':' || current_date);
    reviews := reviews + 1;
  end loop;
  with u as (update public.weather_watches w set status = 'ended', updated_at = now() from public.events e
             where e.id = w.event_id and w.status = 'active' and coalesce(w.window_to, e.ends_at, e.starts_at + interval '1 day') < now() - interval '1 day' returning 1) select count(*) into ended from u;
  return jsonb_build_object('licences_expired', expired, 'reminders', reminders, 'plan_reviews', reviews, 'watches_ended', ended);
end $$;

insert into public.job_kinds(kind, runtime, handler, max_attempts, backoff_seconds, lease_seconds, description) values
  ('compliance.expiry_daily', 'db', 'public.job_compliance_expiry_daily', 5, '{60,300,1800,7200,21600}', 300, 'Q26: expire lapsed event licences, 30/14/7/1-day reminders, safety-plan review dates, end past weather watches.'),
  ('weather.poll', 'app', null, 3, '{300,1800,7200}', 300, 'Q26: poll the configured weather provider for active watches; without one, marks watches not_configured (BLOCKED_EXTERNAL).')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, backoff_seconds = excluded.backoff_seconds,
  lease_seconds = excluded.lease_seconds, description = excluded.description, updated_at = now();
select cron.unschedule(jobid) from cron.job where jobname in ('compliance-expiry-daily', 'weather-poll');
select cron.schedule('compliance-expiry-daily', '35 2 * * *', $$select public.enqueue_job('compliance.expiry_daily', '{}'::jsonb, 'compliance.expiry_daily:' || current_date::text)$$);
select cron.schedule('weather-poll', '10 */3 * * *', $$select public.enqueue_job('weather.poll', '{}'::jsonb, 'weather.poll:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD-HH24')) where exists (select 1 from public.weather_watches where status = 'active')$$);

-- ═══ 10. Read models ═══
create or replace function public.event_compliance_overview(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'facts', public.event_compliance_facts(p_event),
    'requirements', coalesce((select jsonb_agg(to_jsonb(q)) from public.event_compliance_requirements_internal(p_event) q), '[]'),
    'licences', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'type', l.licence_type, 'label', t.label, 'status', l.status, 'holder', l.holder, 'reference', l.reference,
        'authority', l.authority, 'valid_from', l.valid_from, 'valid_to', l.valid_to, 'has_document', l.document_path is not null) order by t.label)
        from public.event_licences l join public.licence_types t on t.key = l.licence_type where l.event_id = e.id), '[]'),
    'safety_plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'version', p.version, 'status', p.status, 'title', p.title, 'approved_at', p.approved_at, 'review_due', p.review_due) order by p.kind, p.version desc)
        from public.safety_plans p where p.event_id = e.id), '[]'),
    'accessibility', (select to_jsonb(a) - 'workspace_id' from public.event_accessibility a where a.event_id = e.id),
    'weather', (select jsonb_build_object('id', w.id, 'status', w.status, 'provider_status', w.provider_status, 'last_checked_at', w.last_checked_at, 'thresholds', w.thresholds,
        'alerts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'metric', a.metric, 'severity', a.severity, 'message', a.message, 'forecast_for', a.forecast_for, 'acknowledged', a.acknowledged_at is not null) order by a.forecast_for)
          from public.weather_alerts a where a.watch_id = w.id and a.forecast_for > now() - interval '1 day'), '[]')) from public.weather_watches w where w.event_id = e.id),
    'contingency', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'trigger', c.trigger_kind, 'action', c.action, 'status', c.status, 'decision_owner', c.decision_owner) order by c.trigger_kind)
        from public.contingency_plans c where c.event_id = e.id), '[]'));
end $$;

-- Public projection: only an APPROVED accessibility summary and the licensing headline (granted licence labels), for public events.
-- Granted to authenticated only; making it anon-callable for public event pages needs coordinator approval (tenant-security allowlist).
create or replace function public.event_compliance_public(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'accessibility', (select jsonb_build_object('summary', a.public_summary, 'step_free', a.step_free, 'accessible_toilets', a.accessible_toilets, 'hearing_loop', a.hearing_loop,
        'bsl', a.bsl_interpretation, 'captioning', a.captioning, 'quiet_space', a.quiet_space, 'accessible_seating', a.accessible_seating > 0)
      from public.event_accessibility a where a.event_id = e.id and a.summary_status = 'approved'),
    'licensing', coalesce((select jsonb_agg(distinct t.label) from public.event_licences l join public.licence_types t on t.key = l.licence_type
      where l.event_id = e.id and l.status = 'granted' and (l.valid_to is null or l.valid_to > now()) and t.category in ('premises','temporary','alcohol','late_night')), '[]'))
  from public.events e where e.id = p_event and e.visibility = 'public' and e.status in ('published','on_sale','live');
$$;

-- ═══ 11. Seed: licence types + England & Wales rule pack ═══
insert into public.licence_types(key, label, category, expires, description) values
  ('premises_licence', 'Premises licence', 'premises', false, 'Licensing Act 2003 premises licence covering the licensable activities and hours.'),
  ('ten', 'Temporary Event Notice (TEN)', 'temporary', true, 'Up to 499 people at any one time, max 168 hours; given to the council (standard: 10 working days, late: 5).'),
  ('late_night_refreshment', 'Late-night refreshment authorisation', 'late_night', true, 'Hot food or drink between 23:00 and 05:00.'),
  ('alcohol_authorisation', 'Alcohol sale authorisation (DPS / personal licence)', 'alcohol', true, 'Designated premises supervisor or personal licence holder for alcohol sales.'),
  ('prs_ppl', 'Music licence (PRS for Music + PPL / TheMusicLicence)', 'music', true, 'Playing or performing copyright music in public.'),
  ('children_performance_licence', 'Child performance licence', 'children', true, 'Local-authority licence for children performing (apply at least 21 days ahead).'),
  ('sia_door_supervision', 'SIA-licensed door supervision', 'security', true, 'Door supervisors licensed by the Security Industry Authority.'),
  ('safety_advisory_group', 'Safety Advisory Group notification', 'safety', false, 'Local SAG notified / consulted for large or higher-risk events.'),
  ('event_insurance', 'Event public liability insurance', 'insurance', true, 'Public liability cover for the event organiser.')
on conflict (key) do update set label = excluded.label, category = excluded.category, expires = excluded.expires, description = excluded.description;

insert into public.compliance_rule_packs(key, country, region, name, version, effective_from, active, source_note) values
  ('gb-eng-wal', 'GB', null, 'England & Wales — Licensing Act 2003 and event safety', 1, date '2026-01-01', true,
   'Licensing Act 2003 (TENs: ≤499 people, 10/5 working days), Licensing Act late-night refreshment 23:00–05:00, PRS for Music + PPL, Children and Young Persons Act 1963 performance licences, Private Security Industry Act 2001 (SIA), HSE Purple Guide, Equality Act 2010. Data only — legal/owner review before relying on it.')
on conflict (key) do update set name = excluded.name, version = excluded.version, source_note = excluded.source_note, updated_at = now();

insert into public.compliance_rules(pack_key, key, label, description, requirement_kind, applies, satisfied_by, severity, lead_days, fix_text, sort) values
  ('gb-eng-wal', 'premises_or_ten', 'Premises licence or Temporary Event Notice', 'Alcohol, regulated entertainment or late-night refreshment needs a premises licence that covers it, or a TEN.', 'licence',
   '{"all":["in_person"],"any":["alcohol","live_music","recorded_music","late_night"]}', '{"licence_types":["premises_licence","ten"],"venue_credential":"premises_licence"}', 'required', 14,
   'Confirm the venue''s premises licence covers this event (ask the venue to upload it), or give a TEN to the council (max 499 people).', 10),
  ('gb-eng-wal', 'ten_capacity', 'Premises licence needed above 499 people', 'A TEN cannot cover 500 or more people at one time.', 'licence',
   '{"all":["in_person"],"any":["alcohol","live_music","recorded_music","late_night"],"min_attendance":500}', '{"licence_types":["premises_licence"],"venue_credential":"premises_licence"}', 'required', 60,
   'Use a venue whose premises licence covers this capacity, or apply for a time-limited premises licence.', 20),
  ('gb-eng-wal', 'alcohol_supervision', 'Alcohol sales supervised by a DPS / personal licence holder', 'Alcohol sales must be authorised by a personal licence holder.', 'licence',
   '{"all":["in_person","alcohol"]}', '{"licence_types":["alcohol_authorisation","ten"],"venue_credential":"alcohol_permission"}', 'required', 7,
   'Record the bar operator''s personal licence / DPS, or the TEN premises user.', 30),
  ('gb-eng-wal', 'late_night_refreshment', 'Late-night refreshment', 'Hot food or drink after 23:00 needs authorisation.', 'licence',
   '{"all":["in_person","late_night","hot_food"]}', '{"licence_types":["late_night_refreshment","premises_licence","ten"],"venue_credential":"premises_licence"}', 'required', 14,
   'Check the premises licence covers late-night refreshment, or include it on the TEN.', 40),
  ('gb-eng-wal', 'music_licence', 'Music licence (PRS for Music + PPL)', 'Copyright music played or performed in public needs TheMusicLicence (or the venue''s cover).', 'licence',
   '{"any":["live_music","recorded_music"],"public":true}', '{"licence_types":["prs_ppl"]}', 'required', 7,
   'Confirm the venue''s TheMusicLicence covers the event, or buy an event licence and record the reference.', 50),
  ('gb-eng-wal', 'children_performance', 'Child performance licences', 'Children taking part in a performance need a local-authority licence.', 'licence',
   '{"all":["children_performing"]}', '{"licence_types":["children_performance_licence"]}', 'required', 21,
   'Apply to the child''s home local authority at least 21 days before.', 60),
  ('gb-eng-wal', 'sia_security', 'SIA-licensed door supervision', 'Late-night alcohol events need SIA-licensed door supervisors.', 'licence',
   '{"all":["in_person","alcohol","late_night"]}', '{"licence_types":["sia_door_supervision"],"supplier_credential":"security_licence"}', 'required', 7,
   'Book an SIA-licensed security supplier (verified licence on Gala Dock) or record your contractor''s SIA details.', 70),
  ('gb-eng-wal', 'event_safety_plan', 'Event safety management plan', 'Events of 500+ people need an approved event safety plan.', 'plan',
   '{"all":["in_person"],"min_attendance":500}', '{"safety_plans":["event_safety"]}', 'required', 28,
   'Write the event safety plan (Purple Guide structure) and have a manager approve it.', 80),
  ('gb-eng-wal', 'outdoor_safety_plan', 'Outdoor event safety plan', 'Outdoor events need an approved event safety plan.', 'plan',
   '{"all":["in_person","outdoor"]}', '{"safety_plans":["event_safety"]}', 'required', 21,
   'Write the event safety plan including the site, weather and evacuation sections, then approve it.', 85),
  ('gb-eng-wal', 'crowd_plan', 'Crowd management plan', 'Events of 2,000+ people need an approved crowd management plan.', 'plan',
   '{"all":["in_person"],"min_attendance":2000}', '{"safety_plans":["crowd"]}', 'required', 42,
   'Add a crowd management plan (density, ingress/egress, stewarding ratios) and approve it.', 90),
  ('gb-eng-wal', 'sag_notification', 'Safety Advisory Group', 'Large events should be notified to the local Safety Advisory Group.', 'notice',
   '{"all":["in_person"],"min_attendance":5000}', '{"licence_types":["safety_advisory_group"]}', 'recommended', 90,
   'Contact the council''s Safety Advisory Group and record the reference.', 95),
  ('gb-eng-wal', 'safeguarding', 'Children''s safeguarding plan', 'Events for children need a safeguarding plan (DBS-checked staff, lost-child procedure).', 'plan',
   '{"event_types":["childrens_party"],"all":["in_person"]}', '{"safety_plans":["safeguarding"]}', 'required', 7,
   'Add a safeguarding plan and approve it.', 100),
  ('gb-eng-wal', 'weather_contingency', 'Weather watch and contingency plan', 'Outdoor events need an approved weather contingency plan and an active weather watch.', 'plan',
   '{"all":["in_person","outdoor"]}', '{"contingency":true}', 'required', 7,
   'Add a contingency plan (trigger, action, decision owner), approve it and start a weather watch.', 110),
  ('gb-eng-wal', 'accessibility_info', 'Accessibility information', 'Public events should publish accurate accessibility information (Equality Act reasonable adjustments).', 'information',
   '{"all":["in_person"],"public":true}', '{"accessibility":true}', 'recommended', 0,
   'Fill in accessibility provisions and approve the public summary.', 120),
  ('gb-eng-wal', 'event_insurance', 'Event public liability insurance', 'Organisers of 100+ person events should hold public liability cover.', 'insurance',
   '{"all":["in_person"],"min_attendance":100}', '{"licence_types":["event_insurance"],"organizer_credential":"event_insurance"}', 'recommended', 14,
   'Upload your event insurance in Settings › Documents, or record the policy here.', 130)
on conflict (pack_key, key) do update set label = excluded.label, description = excluded.description, requirement_kind = excluded.requirement_kind, applies = excluded.applies,
  satisfied_by = excluded.satisfied_by, severity = excluded.severity, lead_days = excluded.lead_days, fix_text = excluded.fix_text, sort = excluded.sort, active = true;

-- ═══ 12. Catalogue + grants ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description) values
  ('compliance.profile_saved', 1, 'compliance', 'The organiser answered the event licensing questions (payload: event_id).'),
  ('compliance.licence_saved', 1, 'compliance', 'An event licence record was created or edited (payload: event_id, licence_id, licence_type).'),
  ('compliance.licence_changed', 1, 'compliance', 'An event licence moved through its lifecycle (payload: event_id, licence_id, from, to).'),
  ('event_licence.state_changed', 1, 'event_licence', 'Machine transition of an event licence.'),
  ('compliance.licence_expired', 1, 'compliance', 'The daily job expired a licence past its valid_to (payload: event_id, licence_id).'),
  ('safety_plan.state_changed', 1, 'safety_plan', 'Machine transition of a safety plan version.'),
  ('compliance.safety_plan_submitted', 1, 'compliance', 'A safety plan version was submitted for approval (payload: event_id, plan_id, kind, version).'),
  ('compliance.safety_plan_decided', 1, 'compliance', 'A safety plan version was approved or sent back (payload: event_id, plan_id, kind, version, decision).'),
  ('compliance.accessibility_saved', 1, 'compliance', 'Event accessibility provisions changed (payload: event_id).'),
  ('compliance.accessibility_approved', 1, 'compliance', 'The public accessibility summary was approved (payload: event_id).'),
  ('compliance.weather_watch_saved', 1, 'compliance', 'A weather watch was started or changed (payload: event_id, watch_id).'),
  ('compliance.contingency_approved', 1, 'compliance', 'A weather / contingency plan was approved (payload: event_id, plan_id, trigger).'),
  ('compliance.weather_alert', 1, 'compliance', 'A forecast breached a watch threshold (payload: event_id, alert_id, metric, severity).')
on conflict (event_type) do update set aggregate = excluded.aggregate, description = excluded.description, updated_at = now();

revoke all on function public.event_compliance_facts(uuid), public.compliance_rule_applies(jsonb, jsonb), public.event_compliance_requirements_internal(uuid),
  public.event_ops_checks_compliance(uuid), public.event_ops_checks(uuid), public.safety_plans_immutable(), public.weather_record_forecast(uuid, text, jsonb, text),
  public.weather_provider_unavailable(text), public.job_compliance_expiry_daily(public.job_queue) from public, anon, authenticated;
grant execute on function public.event_compliance_facts(uuid), public.compliance_rule_applies(jsonb, jsonb), public.event_compliance_requirements_internal(uuid),
  public.event_ops_checks_compliance(uuid), public.event_ops_checks(uuid), public.weather_record_forecast(uuid, text, jsonb, text),
  public.weather_provider_unavailable(text), public.job_compliance_expiry_daily(public.job_queue) to service_role;
revoke all on function public.compliance_profile_save(uuid, jsonb), public.licence_save(uuid, jsonb, uuid), public.licence_transition(uuid, text, text, jsonb),
  public.safety_plan_save(uuid, text, jsonb), public.safety_plan_submit(uuid), public.safety_plan_decide(uuid, text, text), public.accessibility_save(uuid, jsonb),
  public.accessibility_approve_summary(uuid), public.weather_watch_save(uuid, jsonb), public.contingency_plan_save(uuid, jsonb, uuid), public.contingency_plan_approve(uuid),
  public.weather_alert_acknowledge(uuid), public.event_compliance_overview(uuid), public.event_compliance_public(uuid) from public, anon;
grant execute on function public.compliance_profile_save(uuid, jsonb), public.licence_save(uuid, jsonb, uuid), public.licence_transition(uuid, text, text, jsonb),
  public.safety_plan_save(uuid, text, jsonb), public.safety_plan_submit(uuid), public.safety_plan_decide(uuid, text, text), public.accessibility_save(uuid, jsonb),
  public.accessibility_approve_summary(uuid), public.weather_watch_save(uuid, jsonb), public.contingency_plan_save(uuid, jsonb, uuid), public.contingency_plan_approve(uuid),
  public.weather_alert_acknowledge(uuid), public.event_compliance_overview(uuid), public.event_compliance_public(uuid) to authenticated, service_role;
