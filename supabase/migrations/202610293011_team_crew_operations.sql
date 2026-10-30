-- Q17 (lane C, 2026-10-29) 1/2 — team, crew logins, my shifts, substitution, leave, check-in, notifications (domains 57–58).
-- Additive and backward-compatible with the deployed code:
--   * crew_notes: notes about a person are NOT crew/shift writes. Q12 restricted crew_members writes to owner/manager, which
--     broke organizer addNote for plain members. Decision (Q17): any active member of the workspace may add notes about its
--     people; notes are append-only for others (author or manager may delete). Legacy details.notes stay readable.
--   * crew ↔ login: workspace_invites.crew_id. When the invited person accepts (respond_to_invite), a trigger links
--     crew_members.user_id to the accepting account — the crew record and the login become one person.
--   * shifts gain attendance (check-in/out) + shift_changes history; my_shifts() for Staff logins; member_respond_shift();
--     shift_check(); reassign_shift() (substitution under the Q12 crew advisory lock, so concurrent reassignment cannot
--     double-book); leave_requests (machine leave_request) whose approval creates an availability block.
--   * Notifications through notify(): shift assigned/reassigned (trigger, so deployed assignShift notifies too), availability
--     requests, leave decisions, shift responses.
--   * crew_private: emergency contact / medical notes readable only by owner/manager and the person themself.

-- ═══ 1. Notes ═══
create table if not exists public.crew_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  crew_id uuid not null references public.crew_members(id) on delete cascade,
  body text not null check (length(btrim(body)) between 2 and 1000),
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  author_name text not null default '' check (length(author_name) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists crew_notes_crew_idx on public.crew_notes(crew_id, created_at desc);
alter table public.crew_notes enable row level security;
drop policy if exists crew_notes_read on public.crew_notes;
drop policy if exists crew_notes_insert on public.crew_notes;
drop policy if exists crew_notes_delete on public.crew_notes;
create policy crew_notes_read on public.crew_notes for select to authenticated using (public.is_workspace_member(workspace_id));
create policy crew_notes_insert on public.crew_notes for insert to authenticated with check (
  public.is_workspace_member(workspace_id) and author_id = (select auth.uid())
  and exists (select 1 from public.crew_members m where m.id = crew_id and m.workspace_id = crew_notes.workspace_id));
create policy crew_notes_delete on public.crew_notes for delete to authenticated using (author_id = (select auth.uid()) or public.has_workspace_role(workspace_id, array['owner','manager']));
revoke all on table public.crew_notes from public, anon, authenticated;
grant select, insert, delete on table public.crew_notes to authenticated;
grant all on table public.crew_notes to service_role;

-- ═══ 2. Sensitive person details ═══
create table if not exists public.crew_private (
  crew_id uuid primary key references public.crew_members(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  emergency_name text not null default '' check (length(emergency_name) <= 120),
  emergency_phone text not null default '' check (length(emergency_phone) <= 40),
  medical_notes text not null default '' check (length(medical_notes) <= 1000),
  updated_at timestamptz not null default now()
);
alter table public.crew_private enable row level security;
drop policy if exists crew_private_rw on public.crew_private;
create policy crew_private_rw on public.crew_private for all to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','manager']) or exists (select 1 from public.crew_members m where m.id = crew_id and m.user_id = (select auth.uid())))
  with check ((public.has_workspace_role(workspace_id, array['owner','manager']) or exists (select 1 from public.crew_members m where m.id = crew_id and m.user_id = (select auth.uid())))
    and exists (select 1 from public.crew_members m where m.id = crew_id and m.workspace_id = crew_private.workspace_id));
revoke all on table public.crew_private from public, anon, authenticated;
grant select, insert, update, delete on table public.crew_private to authenticated;
grant all on table public.crew_private to service_role;

create index if not exists crew_members_user_idx on public.crew_members(user_id) where user_id is not null;
create index if not exists crew_members_skills_idx on public.crew_members using gin (skills);
alter table public.crew_members add column if not exists hourly_rate numeric(10,2) check (hourly_rate is null or hourly_rate >= 0);

-- ═══ 3. Crew ↔ login link ═══
alter table public.workspace_invites add column if not exists crew_id uuid references public.crew_members(id) on delete set null;
create or replace function public.trg_invite_crew_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare m public.crew_members;
begin
  if new.crew_id is null then return new; end if;
  select * into m from public.crew_members where id = new.crew_id;
  if not found or m.workspace_id <> new.workspace_id then raise exception 'crew_not_in_workspace' using errcode = '42501'; end if;
  if m.user_id is not null then raise exception 'crew_already_linked' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists workspace_invites_crew_guard on public.workspace_invites;
create trigger workspace_invites_crew_guard before insert or update of crew_id on public.workspace_invites for each row execute function public.trg_invite_crew_guard();

create or replace function public.trg_invite_crew_link() returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if new.crew_id is null or new.accepted_at is null or old.accepted_at is not null or uid is null then return null; end if;
  update public.crew_members set user_id = uid, member_type = 'member', status = case when status = 'deactivated' then status else 'active' end
    where id = new.crew_id and workspace_id = new.workspace_id and (user_id is null or user_id = uid);
  if found then
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, new.workspace_id, 'team.crew_linked', jsonb_build_object('crew_id', new.crew_id, 'invite_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists workspace_invites_crew_link on public.workspace_invites;
create trigger workspace_invites_crew_link after update of accepted_at on public.workspace_invites for each row execute function public.trg_invite_crew_link();

-- ═══ 4. Shift attendance + history ═══
alter table public.shifts add column if not exists attendance text not null default 'not_arrived';
alter table public.shifts add column if not exists checked_in_at timestamptz;
alter table public.shifts add column if not exists checked_out_at timestamptz;
alter table public.shifts add column if not exists responded_at timestamptz;
alter table public.shifts add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table public.shifts add constraint shifts_attendance_check check (attendance in ('not_arrived','checked_in','checked_out','no_show'));
exception when duplicate_object then null; end $$;
create index if not exists shifts_crew_time_idx on public.shifts(crew_id, starts_at) where crew_id is not null;
create index if not exists shifts_event_idx on public.shifts(event_id, starts_at) where event_id is not null;

create table if not exists public.shift_changes (
  id bigint generated always as identity primary key,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('assigned','reassigned','accepted','declined','check_in','check_out','no_show','availability_requested')),
  from_crew uuid, to_crew uuid,
  reason text not null default '' check (length(reason) <= 500),
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  at timestamptz not null default now()
);
create index if not exists shift_changes_shift_idx on public.shift_changes(shift_id, at desc);
alter table public.shift_changes enable row level security;
drop policy if exists shift_changes_read on public.shift_changes;
create policy shift_changes_read on public.shift_changes for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on table public.shift_changes from public, anon, authenticated;
grant select on table public.shift_changes to authenticated;
grant all on table public.shift_changes to service_role;

-- Where a Staff login sees its shifts: organizer workspaces → /organizer/team/my-shifts, providers → /provider/team/my-shifts.
create or replace function public.my_shifts_link(p_ws uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when (select kind from public.workspaces where id = p_ws) = 'provider' then '/provider/team/my-shifts' else '/organizer/team/my-shifts' end;
$$;

-- Assignment notifications for every writer (deployed assignShift, provider_assign_crew, reassign_shift).
create or replace function public.trg_shift_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare u uuid; ev text;
begin
  if new.crew_id is null or new.status not in ('draft','pending','confirmed') then return null; end if;
  if TG_OP = 'UPDATE' and new.crew_id is not distinct from old.crew_id then return null; end if;
  select user_id into u from public.crew_members where id = new.crew_id;
  if u is null then return null; end if;
  select name into ev from public.events where id = new.event_id;
  perform public.notify(u, 'shift_assigned', 'New shift: ' || coalesce(nullif(new.title, ''), ev, new.role),
    new.role || ' · ' || to_char(new.starts_at at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || '–' || to_char(new.ends_at at time zone 'Europe/London', 'HH24:MI') || coalesce(' · ' || nullif(new.location, ''), ''),
    public.my_shifts_link(new.workspace_id), 'shift.assigned:' || new.id || ':' || new.crew_id);
  if TG_OP = 'INSERT' then insert into public.shift_changes(shift_id, workspace_id, kind, to_crew) values (new.id, new.workspace_id, 'assigned', new.crew_id); end if;
  return null;
end $$;
drop trigger if exists shifts_notify on public.shifts;
create trigger shifts_notify after insert or update of crew_id on public.shifts for each row execute function public.trg_shift_notify();

-- Staff "my shifts" (any workspace where this login is linked to a crew record).
create or replace function public.my_shifts(p_from timestamptz default null, p_to timestamptz default null)
returns table(id uuid, workspace_id uuid, workspace_name text, event_id uuid, event_name text, role text, title text, location text,
  starts_at timestamptz, ends_at timestamptz, status text, attendance text, checked_in_at timestamptz, checked_out_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.workspace_id, w.name, s.event_id, e.name, s.role, s.title, s.location, s.starts_at, s.ends_at, s.status, s.attendance, s.checked_in_at, s.checked_out_at
  from public.shifts s join public.crew_members m on m.id = s.crew_id join public.workspaces w on w.id = s.workspace_id
  left join public.events e on e.id = s.event_id
  where m.user_id = (select auth.uid()) and m.status <> 'deactivated' and w.status = 'active'
    and s.ends_at >= coalesce(p_from, now() - interval '1 day') and s.starts_at <= coalesce(p_to, now() + interval '120 days')
    and exists (select 1 from public.workspace_members wm where wm.workspace_id = s.workspace_id and wm.user_id = m.user_id and wm.status = 'active'
                union all select 1 from public.workspaces ow where ow.id = s.workspace_id and ow.owner_id = m.user_id)
  order by s.starts_at;
$$;

create or replace function public.shift_for_self(p_shift uuid) returns public.shifts language plpgsql volatile security definer set search_path = '' as $$
declare s public.shifts;
begin
  select sh.* into s from public.shifts sh join public.crew_members m on m.id = sh.crew_id where sh.id = p_shift and m.user_id = auth.uid() and m.status <> 'deactivated' for update of sh;
  if not found or not public.is_workspace_member(s.workspace_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return s;
end $$;

-- Staff accept / decline their own pending shift.
create or replace function public.member_respond_shift(p_shift uuid, p_accept boolean, p_note text default '') returns text
language plpgsql volatile security definer set search_path = '' as $$
declare s public.shifts; st text;
begin
  s := public.shift_for_self(p_shift);
  if s.status not in ('pending','draft') then raise exception 'shift_not_pending' using errcode = '22023'; end if;
  st := case when p_accept then 'confirmed' else 'unavailable' end;
  update public.shifts set status = st, responded_at = now(), updated_at = now() where id = s.id;
  insert into public.shift_changes(shift_id, workspace_id, kind, from_crew, reason) values (s.id, s.workspace_id, case when p_accept then 'accepted' else 'declined' end, s.crew_id, left(coalesce(p_note, ''), 500));
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), s.workspace_id, case when p_accept then 'team.shift_accepted' else 'team.shift_declined' end,
    jsonb_build_object('shift_id', s.id, 'event_id', s.event_id, 'crew_id', s.crew_id));
  if not p_accept then
    perform public.notify_workspace(s.workspace_id, array['owner','manager'], 'shift_declined', 'Shift declined: ' || coalesce(nullif(s.title, ''), s.role),
      coalesce(nullif(p_note, ''), 'Reassign this shift.'), case when (select kind from public.workspaces where id = s.workspace_id) = 'provider' then '/provider/team' else '/organizer/team?tab=assignments' end);
  end if;
  return st;
end $$;

-- Check-in / check-out: the person themself (from 2 hours before the start) or a manager (any time).
create or replace function public.shift_check(p_shift uuid, p_action text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare s public.shifts; manager boolean; self boolean;
begin
  if p_action not in ('in','out','no_show') then raise exception 'invalid_action' using errcode = '22023'; end if;
  select * into s from public.shifts where id = p_shift for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  manager := public.has_workspace_role(s.workspace_id, array['owner','manager']);
  self := exists (select 1 from public.crew_members m where m.id = s.crew_id and m.user_id = auth.uid() and m.status <> 'deactivated') and public.is_workspace_member(s.workspace_id);
  if not (manager or self) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_action = 'no_show' and not manager then raise exception 'not_authorized' using errcode = '42501'; end if;
  if s.status not in ('pending','confirmed') then raise exception 'shift_not_live' using errcode = '22023'; end if;
  if p_action = 'in' then
    if not manager and now() < s.starts_at - interval '2 hours' then raise exception 'too_early' using errcode = '22023'; end if;
    if s.attendance = 'checked_in' then return 'checked_in'; end if;
    update public.shifts set attendance = 'checked_in', checked_in_at = now(), status = 'confirmed', updated_at = now() where id = s.id;
  elsif p_action = 'out' then
    if s.attendance <> 'checked_in' then raise exception 'not_checked_in' using errcode = '22023'; end if;
    update public.shifts set attendance = 'checked_out', checked_out_at = now(), updated_at = now() where id = s.id;
  else
    update public.shifts set attendance = 'no_show', updated_at = now() where id = s.id;
  end if;
  insert into public.shift_changes(shift_id, workspace_id, kind, from_crew) values (s.id, s.workspace_id, case p_action when 'in' then 'check_in' when 'out' then 'check_out' else 'no_show' end, s.crew_id);
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), s.workspace_id, 'team.shift_' || case p_action when 'in' then 'checked_in' when 'out' then 'checked_out' else 'no_show' end,
    jsonb_build_object('shift_id', s.id, 'event_id', s.event_id, 'crew_id', s.crew_id));
  return case p_action when 'in' then 'checked_in' when 'out' then 'checked_out' else 'no_show' end;
end $$;

-- Substitution: move a shift to another person. enforce_crew_capacity runs under the target's advisory lock, so two
-- concurrent reassignments onto the same person cannot both succeed.
create or replace function public.reassign_shift(p_shift uuid, p_to_crew uuid, p_reason text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.shifts; m public.crew_members; old_user uuid;
begin
  select * into s from public.shifts where id = p_shift for update;
  if not found or not public.has_workspace_role(s.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if s.crew_id = p_to_crew then return jsonb_build_object('shift_id', s.id, 'changed', false); end if;
  if s.attendance in ('checked_in','checked_out') then raise exception 'shift_in_progress' using errcode = '22023'; end if;
  select * into m from public.crew_members where id = p_to_crew;
  if not found or m.workspace_id <> s.workspace_id then raise exception 'crew_not_in_workspace' using errcode = '42501'; end if;
  if m.status in ('deactivated','unavailable') then raise exception 'crew_unavailable' using errcode = '22023'; end if;
  select user_id into old_user from public.crew_members where id = s.crew_id;
  update public.shifts set crew_id = p_to_crew, status = 'pending', attendance = 'not_arrived', responded_at = null, updated_at = now() where id = s.id;
  insert into public.shift_changes(shift_id, workspace_id, kind, from_crew, to_crew, reason) values (s.id, s.workspace_id, 'reassigned', s.crew_id, p_to_crew, left(coalesce(p_reason, ''), 500));
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), s.workspace_id, 'team.shift_reassigned',
    jsonb_build_object('shift_id', s.id, 'event_id', s.event_id, 'from_crew', s.crew_id, 'to_crew', p_to_crew));
  if old_user is not null then
    perform public.notify(old_user, 'shift_reassigned', 'Shift reassigned: ' || coalesce(nullif(s.title, ''), s.role), 'You are no longer on this shift.', public.my_shifts_link(s.workspace_id), 'shift.unassigned:' || s.id || ':' || s.crew_id);
  end if;
  return jsonb_build_object('shift_id', s.id, 'changed', true, 'from_crew', s.crew_id, 'to_crew', p_to_crew);
end $$;

-- Availability request (replaces the task-only version): task for the manager view + in-app notification to the person.
create or replace function public.request_crew_availability(p_crew uuid, p_from timestamptz, p_to timestamptz, p_note text default '') returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare m public.crew_members; tid uuid;
begin
  select * into m from public.crew_members where id = p_crew;
  if not found or not public.has_workspace_role(m.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to <= p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  insert into public.tasks(workspace_id, owner_id, title, detail, category, assignee_name, due_at, priority, status)
    values (m.workspace_id, auth.uid(), 'Availability request — ' || m.name, left(coalesce(p_note, ''), 400) || E'\ncrew:' || m.id || E'\nfrom:' || p_from || E'\nto:' || p_to,
      'availability_request', m.name, p_from - interval '2 days', 'medium', 'todo') returning id into tid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), m.workspace_id, 'team.availability_requested', jsonb_build_object('crew_id', m.id, 'task_id', tid));
  if m.user_id is not null then
    perform public.notify(m.user_id, 'availability_request', 'Are you available?', to_char(p_from at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || ' – ' || to_char(p_to at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || coalesce(E'\n' || nullif(p_note, ''), ''),
      public.my_shifts_link(m.workspace_id), 'availability.request:' || tid);
  end if;
  return tid;
end $$;

-- ═══ 5. Leave requests ═══
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  crew_id uuid not null references public.crew_members(id) on delete cascade,
  kind text not null default 'annual' check (kind in ('annual','sick','unpaid','other')),
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  note text not null default '' check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '' check (length(decision_note) <= 500),
  block_id uuid references public.availability_blocks(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists leave_requests_ws_idx on public.leave_requests(workspace_id, status, starts_at);
alter table public.leave_requests enable row level security;
drop policy if exists leave_requests_read on public.leave_requests;
create policy leave_requests_read on public.leave_requests for select to authenticated using (
  public.has_workspace_role(workspace_id, array['owner','manager']) or exists (select 1 from public.crew_members m where m.id = crew_id and m.user_id = (select auth.uid())));
revoke all on table public.leave_requests from public, anon, authenticated;
grant select on table public.leave_requests to authenticated;
grant all on table public.leave_requests to service_role;

insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('leave_request', 'leave_requests', 'status', 'enforce', array['pending'], array['rejected','cancelled'])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'leave_request';
insert into public.state_transitions(machine, from_state, to_state) values
  ('leave_request','pending','approved'), ('leave_request','pending','rejected'), ('leave_request','pending','cancelled'), ('leave_request','approved','cancelled');
drop trigger if exists leave_requests_state_guard on public.leave_requests;
create trigger leave_requests_state_guard before insert or update of status on public.leave_requests
  for each row execute function public.enforce_state_transition('leave_request', 'status');

create or replace function public.request_leave(p_ws uuid, p_from timestamptz, p_to timestamptz, p_kind text default 'annual', p_note text default '', p_crew uuid default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare m public.crew_members; rid uuid; manager boolean := public.has_workspace_role(p_ws, array['owner','manager']);
begin
  if p_crew is null then select * into m from public.crew_members where workspace_id = p_ws and user_id = auth.uid() and status <> 'deactivated' limit 1;
  else select * into m from public.crew_members where id = p_crew and workspace_id = p_ws; end if;
  if not found or not public.is_workspace_member(p_ws) or (m.user_id is distinct from auth.uid() and not manager) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to <= p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  if p_kind not in ('annual','sick','unpaid','other') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  insert into public.leave_requests(workspace_id, crew_id, kind, starts_at, ends_at, note) values (p_ws, m.id, p_kind, p_from, p_to, left(coalesce(p_note, ''), 500)) returning id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'team.leave_requested', jsonb_build_object('leave_id', rid, 'crew_id', m.id));
  perform public.notify_workspace(p_ws, array['owner','manager'], 'leave_request', 'Leave request: ' || m.name,
    to_char(p_from at time zone 'Europe/London', 'DD Mon') || ' – ' || to_char(p_to at time zone 'Europe/London', 'DD Mon') || ' (' || p_kind || ')',
    case when (select kind from public.workspaces where id = p_ws) = 'provider' then '/provider/team' else '/organizer/team?tab=leave' end);
  return rid;
end $$;

-- Approve → availability block (blocks new assignments via enforce_crew_capacity) + list of already-assigned shifts to reassign.
create or replace function public.decide_leave(p_request uuid, p_approve boolean, p_note text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.leave_requests; m public.crew_members; bid uuid; clashes jsonb;
begin
  select * into r from public.leave_requests where id = p_request for update;
  if not found or not public.has_workspace_role(r.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'already_decided' using errcode = '22023'; end if;
  select * into m from public.crew_members where id = r.crew_id;
  if p_approve then
    insert into public.availability_blocks(workspace_id, crew_id, kind, starts_at, ends_at, note, created_by)
      values (r.workspace_id, r.crew_id, 'blocked', r.starts_at, r.ends_at, 'Leave (' || r.kind || ')', auth.uid()) returning id into bid;
  end if;
  update public.leave_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = left(coalesce(p_note, ''), 500), block_id = bid where id = r.id;
  select coalesce(jsonb_agg(jsonb_build_object('shift_id', s.id, 'title', s.title, 'starts_at', s.starts_at) order by s.starts_at), '[]') into clashes
    from public.shifts s where p_approve and s.crew_id = r.crew_id and s.status in ('draft','pending','confirmed') and tstzrange(s.starts_at, s.ends_at) && tstzrange(r.starts_at, r.ends_at);
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), r.workspace_id, case when p_approve then 'team.leave_approved' else 'team.leave_rejected' end,
    jsonb_build_object('leave_id', r.id, 'crew_id', r.crew_id, 'conflicting_shifts', jsonb_array_length(clashes)));
  if m.user_id is not null then
    perform public.notify(m.user_id, 'leave_decision', 'Leave ' || case when p_approve then 'approved' else 'not approved' end,
      to_char(r.starts_at at time zone 'Europe/London', 'DD Mon') || ' – ' || to_char(r.ends_at at time zone 'Europe/London', 'DD Mon') || coalesce('. ' || nullif(p_note, ''), ''),
      public.my_shifts_link(r.workspace_id), 'leave.decided:' || r.id);
  end if;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end, 'block_id', bid, 'conflicting_shifts', clashes);
end $$;

create or replace function public.cancel_leave(p_request uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.leave_requests;
begin
  select * into r from public.leave_requests where id = p_request for update;
  if not found or not (public.has_workspace_role(r.workspace_id, array['owner','manager'])
     or exists (select 1 from public.crew_members m where m.id = r.crew_id and m.user_id = auth.uid())) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.status not in ('pending','approved') then raise exception 'not_cancellable' using errcode = '22023'; end if;
  update public.leave_requests set status = 'cancelled', decided_at = coalesce(decided_at, now()) where id = r.id;
  if r.block_id is not null then delete from public.availability_blocks where id = r.block_id; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), r.workspace_id, 'team.leave_cancelled', jsonb_build_object('leave_id', r.id, 'crew_id', r.crew_id));
end $$;

-- ═══ 6. Domain events + grants ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description) values
  ('team.crew_linked', 1, 'crew', 'A crew record was linked to the login that accepted its invitation.'),
  ('team.shift_reassigned', 1, 'shift', 'A shift moved to another person (substitution).'),
  ('team.shift_accepted', 1, 'shift', 'A staff member accepted their shift.'),
  ('team.shift_declined', 1, 'shift', 'A staff member declined their shift.'),
  ('team.shift_checked_in', 1, 'shift', 'A staff member checked in for a shift.'),
  ('team.shift_checked_out', 1, 'shift', 'A staff member checked out of a shift.'),
  ('team.shift_no_show', 1, 'shift', 'A manager marked a shift as no-show.'),
  ('team.leave_requested', 1, 'leave_request', 'Leave was requested.'),
  ('team.leave_approved', 1, 'leave_request', 'Leave was approved (availability block created).'),
  ('team.leave_rejected', 1, 'leave_request', 'Leave was not approved.'),
  ('team.leave_cancelled', 1, 'leave_request', 'Leave was cancelled (block removed).'),
  ('team.availability_requested', 1, 'crew', 'A manager asked a person for availability.')
on conflict (event_type) do update set aggregate = excluded.aggregate, description = excluded.description, updated_at = now();

revoke all on function public.trg_invite_crew_guard(), public.trg_invite_crew_link(), public.trg_shift_notify(), public.my_shifts_link(uuid), public.shift_for_self(uuid) from public, anon, authenticated;
grant execute on function public.my_shifts_link(uuid), public.shift_for_self(uuid) to service_role;
revoke all on function public.my_shifts(timestamptz, timestamptz), public.member_respond_shift(uuid, boolean, text), public.shift_check(uuid, text), public.reassign_shift(uuid, uuid, text),
  public.request_crew_availability(uuid, timestamptz, timestamptz, text), public.request_leave(uuid, timestamptz, timestamptz, text, text, uuid), public.decide_leave(uuid, boolean, text), public.cancel_leave(uuid) from public, anon;
grant execute on function public.my_shifts(timestamptz, timestamptz), public.member_respond_shift(uuid, boolean, text), public.shift_check(uuid, text), public.reassign_shift(uuid, uuid, text),
  public.request_crew_availability(uuid, timestamptz, timestamptz, text), public.request_leave(uuid, timestamptz, timestamptz, text, text, uuid), public.decide_leave(uuid, boolean, text), public.cancel_leave(uuid) to authenticated, service_role;
