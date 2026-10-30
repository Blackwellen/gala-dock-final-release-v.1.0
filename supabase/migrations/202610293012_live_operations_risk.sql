-- Q17 (lane C, 2026-10-29) 2/2 — resources, run sheet, live mode, incidents, risks and server-side conflict detection (59–63).
-- Additive and backward-compatible with the deployed code:
--   * Resources reuse Q12 inventory: provider_equipment is the workspace's resource register (category = equipment / vehicle /
--     room / staff_kit …) and job_equipment_allocations gains event_id, so an organiser can lock a resource to an event window.
--     The Q12 enforce_equipment_capacity trigger (advisory lock per resource) keeps one rule for jobs and events.
--   * run_sheet_tracking: delays, actual start/end, dependencies, owner per run item (programme_items stays the item);
--     run_sheet_update() replaces the live page's direct write (which tried an invalid 'delayed' status).
--   * Supplier arrivals reuse provider_checkins (already live); crew check-in is Q17 shifts.attendance.
--   * incidents: lifecycle machine (open → acknowledged → investigating → mitigated → resolved, reopen allowed; legacy
--     open → resolved still valid), owner, category, corrective actions, closure note, append-only timeline
--     (incident_updates), restricted details (incident_private). High/critical incidents notify the workspace managers.
--   * event_risks: register with likelihood × impact, controls, contingency, owner, residual score.
--   * operational_conflicts(): crew double-booking, crew on leave/blocked, deactivated crew, unconfirmed shifts close to
--     start, over-allocated / unavailable resources, run-sheet delays, open serious incidents, high residual risks —
--     surfaced on Organizer Home, Event, Calendar and the Agent context.

-- ═══ 1. Resources on events ═══
alter table public.job_equipment_allocations add column if not exists event_id uuid references public.events(id) on delete cascade;
alter table public.job_equipment_allocations alter column job_id drop not null;
do $$ begin
  alter table public.job_equipment_allocations add constraint job_equipment_allocations_target check (job_id is not null or event_id is not null);
exception when duplicate_object then null; end $$;
create index if not exists job_equipment_alloc_event_idx on public.job_equipment_allocations(event_id) where event_id is not null;
drop policy if exists job_equipment_event_read on public.job_equipment_allocations;
create policy job_equipment_event_read on public.job_equipment_allocations for select to authenticated using (event_id is not null and public.can_access_event(event_id));

create or replace function public.event_allocate_resource(p_event uuid, p_equipment uuid, p_quantity integer default 1, p_starts timestamptz default null, p_ends timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; aid uuid; s timestamptz; f timestamptz; w text; err text; det text;
begin
  select * into e from public.events where id = p_event;
  if not found or e.workspace_id is null or not public.has_workspace_role(e.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.provider_equipment q where q.id = p_equipment and q.workspace_id = e.workspace_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  s := coalesce(p_starts, e.starts_at); f := coalesce(p_ends, e.ends_at, e.starts_at + interval '1 day');
  if s is null or f is null or f <= s then raise exception 'event_window_required' using errcode = '22023'; end if;
  insert into public.job_equipment_allocations(workspace_id, event_id, equipment_id, quantity, starts_at, ends_at, created_by)
    values (e.workspace_id, e.id, p_equipment, greatest(coalesce(p_quantity, 1), 1), s, f, auth.uid()) returning id, warning into aid, w;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'resource.allocated', jsonb_build_object('event_id', e.id, 'equipment_id', p_equipment, 'quantity', p_quantity, 'warning', w));
  return jsonb_build_object('allocation_id', aid, 'warning', w);
exception when exclusion_violation then
  get stacked diagnostics err = message_text, det = pg_exception_detail;
  raise exception '%', err using errcode = '23P01', detail = coalesce(det, '');
end $$;
create or replace function public.event_release_resource(p_allocation uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare a public.job_equipment_allocations;
begin
  select * into a from public.job_equipment_allocations where id = p_allocation for update;
  if not found or a.event_id is null or not public.has_workspace_role(a.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.job_equipment_allocations set status = 'released' where id = a.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), a.workspace_id, 'resource.released', jsonb_build_object('allocation_id', a.id, 'event_id', a.event_id));
end $$;

-- ═══ 2. Run sheet tracking ═══
create table if not exists public.run_sheet_tracking (
  item_id uuid primary key references public.programme_items(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  delay_minutes integer not null default 0 check (delay_minutes between -1440 and 1440),
  actual_start timestamptz, actual_end timestamptz,
  depends_on uuid[] not null default '{}',
  owner_crew_id uuid references public.crew_members(id) on delete set null,
  note text not null default '' check (length(note) <= 500),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists run_sheet_tracking_event_idx on public.run_sheet_tracking(event_id);
alter table public.run_sheet_tracking enable row level security;
drop policy if exists run_sheet_tracking_read on public.run_sheet_tracking;
create policy run_sheet_tracking_read on public.run_sheet_tracking for select to authenticated using (public.can_access_event(event_id));
revoke all on table public.run_sheet_tracking from public, anon, authenticated;
grant select on table public.run_sheet_tracking to authenticated;
grant all on table public.run_sheet_tracking to service_role;

-- Anyone working the event may move a run item; dependencies must be done before an item starts.
create or replace function public.run_sheet_update(p_item uuid, p_status text, p_delay integer default null, p_note text default null, p_depends_on uuid[] default null, p_owner_crew uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare it public.programme_items; t public.run_sheet_tracking; st text; pending integer; ws uuid;
begin
  select * into it from public.programme_items where id = p_item for update;
  if not found or not public.can_access_event(it.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_status not in ('upcoming','in_progress','done','delayed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select workspace_id into ws from public.events where id = it.event_id;
  insert into public.run_sheet_tracking(item_id, event_id) values (it.id, it.event_id) on conflict (item_id) do nothing;
  select * into t from public.run_sheet_tracking where item_id = it.id for update;
  if p_depends_on is not null then
    if exists (select 1 from unnest(p_depends_on) d where d = it.id or not exists (select 1 from public.programme_items x where x.id = d and x.event_id = it.event_id)) then raise exception 'invalid_dependency' using errcode = '22023'; end if;
    t.depends_on := p_depends_on;
  end if;
  if p_status = 'in_progress' then
    select count(*) into pending from public.programme_items x where x.id = any(t.depends_on) and x.status <> 'done';
    if pending > 0 then raise exception 'dependency_pending' using errcode = '22023', detail = pending || ' dependency item(s) not done'; end if;
  end if;
  if p_owner_crew is not null and not exists (select 1 from public.crew_members m where m.id = p_owner_crew and m.workspace_id = ws) then raise exception 'crew_not_in_workspace' using errcode = '42501'; end if;
  st := case when p_status = 'delayed' then case when it.status = 'done' then 'done' else it.status end else p_status end;
  update public.programme_items set status = st where id = it.id;
  update public.run_sheet_tracking set
      delay_minutes = coalesce(p_delay, case when p_status = 'delayed' then greatest(t.delay_minutes, 5) else t.delay_minutes end),
      actual_start = case when p_status = 'in_progress' then coalesce(t.actual_start, now()) else t.actual_start end,
      actual_end = case when p_status = 'done' then coalesce(t.actual_end, now()) else t.actual_end end,
      depends_on = t.depends_on, owner_crew_id = coalesce(p_owner_crew, t.owner_crew_id), note = coalesce(left(p_note, 500), t.note),
      updated_by = auth.uid(), updated_at = now()
    where item_id = it.id returning * into t;
  if ws is not null then
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), ws, 'live.run_item_updated',
      jsonb_build_object('event_id', it.event_id, 'item_id', it.id, 'status', p_status, 'delay_minutes', t.delay_minutes));
  end if;
  return jsonb_build_object('status', st, 'delay_minutes', t.delay_minutes, 'actual_start', t.actual_start, 'actual_end', t.actual_end);
end $$;

-- ═══ 3. Incidents ═══
alter table public.incidents drop constraint if exists incidents_status_check;
alter table public.incidents add constraint incidents_status_check check (status in ('open','acknowledged','investigating','mitigated','resolved'));
alter table public.incidents add column if not exists category text not null default 'general';
alter table public.incidents add column if not exists location text not null default '';
alter table public.incidents add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.incidents add column if not exists owner_name text not null default '';
alter table public.incidents add column if not exists corrective_actions text not null default '';
alter table public.incidents add column if not exists closure_note text not null default '';
alter table public.incidents add column if not exists acknowledged_at timestamptz;
alter table public.incidents add column if not exists resolved_at timestamptz;
alter table public.incidents add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table public.incidents add constraint incidents_category_check check (category in ('general','medical','security','safety','crowd','weather','technical','supplier','guest','other'));
exception when duplicate_object then null; end $$;
create index if not exists incidents_event_status_idx on public.incidents(event_id, status, severity);

insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('incident', 'incidents', 'status', 'enforce', array['open'], array[]::text[])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'incident';
insert into public.state_transitions(machine, from_state, to_state) values
  ('incident','open','acknowledged'), ('incident','open','investigating'), ('incident','open','mitigated'), ('incident','open','resolved'),
  ('incident','acknowledged','investigating'), ('incident','acknowledged','mitigated'), ('incident','acknowledged','resolved'),
  ('incident','investigating','mitigated'), ('incident','investigating','resolved'),
  ('incident','mitigated','investigating'), ('incident','mitigated','resolved'),
  ('incident','resolved','investigating');
drop trigger if exists incidents_state_guard on public.incidents;
create trigger incidents_state_guard before insert or update of status on public.incidents for each row execute function public.enforce_state_transition('incident', 'status');

create table if not exists public.incident_updates (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('reported','status','note','evidence','action','owner')),
  body text not null default '' check (length(body) <= 2000),
  from_status text, to_status text,
  storage_path text check (storage_path is null or length(storage_path) <= 500),
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  at timestamptz not null default now()
);
create index if not exists incident_updates_incident_idx on public.incident_updates(incident_id, at);
alter table public.incident_updates enable row level security;
drop policy if exists incident_updates_read on public.incident_updates;
create policy incident_updates_read on public.incident_updates for select to authenticated using (public.can_access_event(event_id));
revoke all on table public.incident_updates from public, anon, authenticated;
grant select on table public.incident_updates to authenticated;
grant all on table public.incident_updates to service_role;

create table if not exists public.incident_private (
  incident_id uuid primary key references public.incidents(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  detail text not null default '' check (length(detail) <= 4000),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create or replace function public.can_manage_event(p_event uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and (
    (e.workspace_id is null and e.owner_id = (select auth.uid())) or (e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager']))));
$$;
alter table public.incident_private enable row level security;
drop policy if exists incident_private_rw on public.incident_private;
create policy incident_private_rw on public.incident_private for all to authenticated using (public.can_manage_event(event_id))
  with check (public.can_manage_event(event_id) and exists (select 1 from public.incidents i where i.id = incident_id and i.event_id = incident_private.event_id));
revoke all on table public.incident_private from public, anon, authenticated;
grant select, insert, update, delete on table public.incident_private to authenticated;
grant all on table public.incident_private to service_role;

-- Every insert / status change lands on the timeline; serious incidents page the managers.
create or replace function public.trg_incident_timeline() returns trigger language plpgsql security definer set search_path = '' as $$
declare ws uuid; ev text;
begin
  if TG_OP = 'INSERT' then
    insert into public.incident_updates(incident_id, event_id, kind, body, to_status, actor_id) values (new.id, new.event_id, 'reported', left(new.title, 2000), new.status, coalesce(new.reported_by, auth.uid()));
    if new.severity in ('high','critical') then
      select workspace_id, name into ws, ev from public.events where id = new.event_id;
      if ws is not null then
        perform public.notify_workspace(ws, array['owner','manager'], 'incident_alert', upper(new.severity) || ' incident: ' || left(new.title, 120), ev || coalesce(' · ' || nullif(new.location, ''), ''), '/organizer/events/' || new.event_id || '/live');
      end if;
    end if;
  elsif new.status is distinct from old.status then
    insert into public.incident_updates(incident_id, event_id, kind, from_status, to_status) values (new.id, new.event_id, 'status', old.status, new.status);
  end if;
  return null;
end $$;
drop trigger if exists incidents_timeline on public.incidents;
create trigger incidents_timeline after insert or update of status on public.incidents for each row execute function public.trg_incident_timeline();
create or replace function public.trg_incident_stamp() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'acknowledged' and new.acknowledged_at is null then new.acknowledged_at := now(); end if;
  if new.status = 'resolved' then new.resolved_at := coalesce(new.resolved_at, now()); else new.resolved_at := null; end if;
  return new;
end $$;
drop trigger if exists incidents_stamp on public.incidents;
create trigger incidents_stamp before insert or update on public.incidents for each row execute function public.trg_incident_stamp();

-- Lifecycle command: closure needs a note; owner/category/actions can change with it.
create or replace function public.incident_transition(p_incident uuid, p_to text, p_note text default '', p jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare i public.incidents; ws uuid;
begin
  select * into i from public.incidents where id = p_incident for update;
  if not found or not public.can_access_event(i.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to = 'resolved' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'closure_note_required' using errcode = '22023'; end if;
  if p_to <> i.status and not public.state_transition_allowed('incident', i.status, p_to) then raise exception 'illegal incident transition % -> %', i.status, p_to using errcode = '22023'; end if;
  update public.incidents set status = p_to,
      closure_note = case when p_to = 'resolved' then left(p_note, 2000) else closure_note end,
      corrective_actions = coalesce(left(p ->> 'corrective_actions', 2000), corrective_actions),
      owner_name = coalesce(left(p ->> 'owner_name', 120), owner_name),
      owner_id = coalesce(nullif(p ->> 'owner_id', '')::uuid, owner_id),
      category = coalesce(nullif(p ->> 'category', ''), category)
    where id = i.id;
  if btrim(coalesce(p_note, '')) <> '' and p_to <> 'resolved' then
    insert into public.incident_updates(incident_id, event_id, kind, body) values (i.id, i.event_id, 'note', left(p_note, 2000));
  end if;
  if p ? 'corrective_actions' then insert into public.incident_updates(incident_id, event_id, kind, body) values (i.id, i.event_id, 'action', left(p ->> 'corrective_actions', 2000)); end if;
  select workspace_id into ws from public.events where id = i.event_id;
  if ws is not null then
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), ws, 'incident.state_changed', jsonb_build_object('incident_id', i.id, 'event_id', i.event_id, 'from', i.status, 'to', p_to));
  end if;
  return jsonb_build_object('status', p_to);
end $$;
create or replace function public.incident_add_update(p_incident uuid, p_kind text, p_body text, p_storage_path text default null) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare i public.incidents; uid bigint;
begin
  select * into i from public.incidents where id = p_incident;
  if not found or not public.can_access_event(i.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_kind not in ('note','evidence','action') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_kind = 'evidence' and (p_storage_path is null or p_storage_path !~ '^[0-9a-f-]{36}/') then raise exception 'evidence_path_required' using errcode = '22023'; end if;
  insert into public.incident_updates(incident_id, event_id, kind, body, storage_path) values (i.id, i.event_id, p_kind, left(coalesce(p_body, ''), 2000), p_storage_path) returning id into uid;
  return uid;
end $$;

-- ═══ 4. Risk register ═══
create table if not exists public.event_risks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (length(btrim(title)) between 3 and 160),
  category text not null default 'general' check (category in ('general','safety','security','medical','weather','crowd','financial','supplier','technical','legal','reputation')),
  likelihood integer not null default 3 check (likelihood between 1 and 5),
  impact integer not null default 3 check (impact between 1 and 5),
  score integer generated always as (likelihood * impact) stored,
  controls text not null default '' check (length(controls) <= 2000),
  contingency text not null default '' check (length(contingency) <= 2000),
  owner_name text not null default '' check (length(owner_name) <= 120),
  owner_crew_id uuid references public.crew_members(id) on delete set null,
  residual_likelihood integer check (residual_likelihood between 1 and 5),
  residual_impact integer check (residual_impact between 1 and 5),
  residual_score integer generated always as (coalesce(residual_likelihood, likelihood) * coalesce(residual_impact, impact)) stored,
  status text not null default 'open' check (status in ('open','mitigated','accepted','closed')),
  review_at date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_risks_event_idx on public.event_risks(event_id, status, residual_score desc);
alter table public.event_risks enable row level security;
drop policy if exists event_risks_read on public.event_risks;
drop policy if exists event_risks_write on public.event_risks;
drop policy if exists event_risks_update on public.event_risks;
drop policy if exists event_risks_delete on public.event_risks;
create policy event_risks_read on public.event_risks for select to authenticated using (public.can_access_event(event_id));
create policy event_risks_write on public.event_risks for insert to authenticated with check (public.can_manage_event(event_id));
create policy event_risks_update on public.event_risks for update to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));
create policy event_risks_delete on public.event_risks for delete to authenticated using (public.can_manage_event(event_id));
revoke all on table public.event_risks from public, anon, authenticated;
grant select, insert, update, delete on table public.event_risks to authenticated;
grant all on table public.event_risks to service_role;

-- ═══ 5. Conflict detection (server-side) ═══
create or replace function public.operational_conflicts_internal(p_ws uuid, p_from timestamptz, p_to timestamptz, p_event uuid default null)
returns table(kind text, severity text, event_id uuid, event_name text, ref_id uuid, starts_at timestamptz, message text)
language sql stable security definer set search_path = '' as $$
  with sh as (
    select s.*, m.name as crew_name, m.status as crew_status, e.name as ev_name from public.shifts s
      join public.crew_members m on m.id = s.crew_id left join public.events e on e.id = s.event_id
    where s.workspace_id = p_ws and s.status in ('draft','pending','confirmed') and s.ends_at >= p_from and s.starts_at <= p_to
      and (p_event is null or s.event_id = p_event))
  select 'crew_double_booked', 'high', a.event_id, a.ev_name, a.id, a.starts_at,
         a.crew_name || ' is on two overlapping shifts (' || coalesce(nullif(a.title, ''), a.role) || ' and ' || coalesce(nullif(b.title, ''), b.role) || ')'
    from sh a join public.shifts b on b.crew_id = a.crew_id and b.id <> a.id and b.status in ('draft','pending','confirmed')
      and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at) and (a.starts_at, a.id) < (b.starts_at, b.id)
  union all
  select 'crew_unavailable', 'high', a.event_id, a.ev_name, a.id, a.starts_at, a.crew_name || ' is unavailable then (' || coalesce(nullif(x.note, ''), x.kind) || ')'
    from sh a join public.availability_blocks x on x.crew_id = a.crew_id and x.kind in ('blocked','maintenance') and tstzrange(x.starts_at, x.ends_at) && tstzrange(a.starts_at, a.ends_at)
  union all
  select 'crew_deactivated', 'high', a.event_id, a.ev_name, a.id, a.starts_at, a.crew_name || ' was deactivated but still holds this shift' from sh a where a.crew_status = 'deactivated'
  union all
  select 'shift_unconfirmed', 'medium', a.event_id, a.ev_name, a.id, a.starts_at, a.crew_name || ' has not confirmed ' || coalesce(nullif(a.title, ''), a.role)
    from sh a where a.status = 'pending' and a.starts_at between now() and now() + interval '48 hours'
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
      and (p_event is null or e.id = p_event);
$$;
create or replace function public.operational_conflicts(p_ws uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table(kind text, severity text, event_id uuid, event_name text, ref_id uuid, starts_at timestamptz, message text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_workspace_member(p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query select * from public.operational_conflicts_internal(p_ws, coalesce(p_from, now() - interval '1 day'), coalesce(p_to, now() + interval '60 days'), null)
    order by case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, starts_at nulls last limit 200;
end $$;
create or replace function public.event_conflicts(p_event uuid)
returns table(kind text, severity text, event_id uuid, event_name text, ref_id uuid, starts_at timestamptz, message text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare ws uuid;
begin
  select e.workspace_id into ws from public.events e where e.id = p_event;
  if ws is null or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query select * from public.operational_conflicts_internal(ws, now() - interval '3650 days', now() + interval '3650 days', p_event)
    order by case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, starts_at nulls last limit 100;
end $$;

-- ═══ 6. Live mode snapshot (60.1–60.9) ═══
create or replace function public.event_live_snapshot(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; r jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'now', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'area', i.area, 'starts_at', i.starts_at, 'delay_minutes', coalesce(t.delay_minutes, 0), 'actual_start', t.actual_start) order by i.starts_at)
             from public.programme_items i left join public.run_sheet_tracking t on t.item_id = i.id where i.event_id = e.id and i.status = 'in_progress'), '[]'),
    'next', coalesce((select jsonb_agg(x order by x->>'starts_at') from (select jsonb_build_object('id', i.id, 'title', i.title, 'area', i.area, 'starts_at', i.starts_at, 'delay_minutes', coalesce(t.delay_minutes, 0),
               'blocked_by', (select count(*) from public.programme_items d where d.id = any(coalesce(t.depends_on, '{}')) and d.status <> 'done')) x
             from public.programme_items i left join public.run_sheet_tracking t on t.item_id = i.id where i.event_id = e.id and i.status = 'upcoming' order by i.starts_at limit 5) n), '[]'),
    'delays', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'delay_minutes', t.delay_minutes)) from public.run_sheet_tracking t join public.programme_items i on i.id = t.item_id
             where t.event_id = e.id and t.delay_minutes > 0 and i.status <> 'done'), '[]'),
    'crew', (select jsonb_build_object('scheduled', count(*), 'checked_in', count(*) filter (where s.attendance = 'checked_in'), 'checked_out', count(*) filter (where s.attendance = 'checked_out'),
               'no_show', count(*) filter (where s.attendance = 'no_show'), 'late', count(*) filter (where s.attendance = 'not_arrived' and s.starts_at < now()))
             from public.shifts s where s.event_id = e.id and s.status in ('pending','confirmed')),
    'suppliers', (select jsonb_build_object('expected', count(*), 'arrived', count(*) filter (where c.status in ('arrived','checked_in')), 'late', count(*) filter (where c.status = 'late'), 'absent', count(*) filter (where c.status = 'absent'))
             from public.provider_checkins c where c.event_id = e.id),
    'entry', jsonb_build_object('admitted', (select count(*) from public.check_ins c where c.event_id = e.id and c.result = 'admitted'),
               'rejected', (select count(*) from public.check_ins c where c.event_id = e.id and c.result <> 'admitted'),
               'issued', (select count(*) from public.tickets t where t.event_id = e.id and t.status in ('valid','used','transferred','resale_listed','resold')), 'capacity', e.capacity),
    'incidents', (select jsonb_build_object('open', count(*) filter (where i.status <> 'resolved'), 'critical', count(*) filter (where i.status <> 'resolved' and i.severity = 'critical'),
               'high', count(*) filter (where i.status <> 'resolved' and i.severity = 'high')) from public.incidents i where i.event_id = e.id),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('at', a.created_at, 'event', a.event) order by a.created_at desc) from (select * from public.audit_events a
             where a.workspace_id = e.workspace_id and a.metadata ->> 'event_id' = e.id::text order by a.created_at desc limit 20) a), '[]'),
    'as_of', now()) into r;
  return r;
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description) values
  ('resource.allocated', 1, 'resource', 'A resource was locked to an event window (payload: event_id, equipment_id, quantity, warning).'),
  ('resource.released', 1, 'resource', 'An event resource allocation was released.'),
  ('live.run_item_updated', 1, 'run_sheet', 'A run-sheet item changed status or delay during live operations.'),
  ('incident.state_changed', 1, 'incident', 'An incident moved through its lifecycle (payload: incident_id, event_id, from, to).')
on conflict (event_type) do update set aggregate = excluded.aggregate, description = excluded.description, updated_at = now();

revoke all on function public.operational_conflicts_internal(uuid, timestamptz, timestamptz, uuid), public.trg_incident_timeline(), public.trg_incident_stamp() from public, anon, authenticated;
grant execute on function public.operational_conflicts_internal(uuid, timestamptz, timestamptz, uuid) to service_role;
revoke all on function public.event_allocate_resource(uuid, uuid, integer, timestamptz, timestamptz), public.event_release_resource(uuid), public.run_sheet_update(uuid, text, integer, text, uuid[], uuid),
  public.can_manage_event(uuid), public.incident_transition(uuid, text, text, jsonb), public.incident_add_update(uuid, text, text, text), public.operational_conflicts(uuid, timestamptz, timestamptz),
  public.event_conflicts(uuid), public.event_live_snapshot(uuid) from public, anon;
grant execute on function public.event_allocate_resource(uuid, uuid, integer, timestamptz, timestamptz), public.event_release_resource(uuid), public.run_sheet_update(uuid, text, integer, text, uuid[], uuid),
  public.can_manage_event(uuid), public.incident_transition(uuid, text, text, jsonb), public.incident_add_update(uuid, text, text, text), public.operational_conflicts(uuid, timestamptz, timestamptz),
  public.event_conflicts(uuid), public.event_live_snapshot(uuid) to authenticated, service_role;
