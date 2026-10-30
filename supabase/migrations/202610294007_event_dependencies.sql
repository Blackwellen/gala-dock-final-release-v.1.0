-- Q14 Event Core 7 — dependency graph (domain 36) and task dependencies / recurrence (domain 42.5, 42.7).
-- Additive: one new table, three nullable task columns, guard triggers that only act when a dependency or recurrence exists.
--
-- event_dependencies: "dependent waits for prerequisite". Dependents: task, milestone (a task with milestone = true), ticket_tier
-- (release), booking (build_items). Prerequisites: the same plus payment (a booking's payment order), team (a shift), venue,
-- compliance and approval (a persisted decision on the edge itself). Every id must belong to the same event.
--   * cycle prevention: insert/update trigger walks the graph under an event advisory lock (dependency_cycle, 22023);
--   * hard edges block: a task can't be marked done, and a ticket tier can't go on sale, while a hard prerequisite is unmet;
--   * readiness: unmet hard dependencies appear as a "Dependencies" readiness domain (blocked when due within 7 days / overdue);
--   * commands write audit_events + domain_outbox (event.dependency_added / _removed / _approval_decided).

create table if not exists public.event_dependencies (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  dependent_kind text not null check (dependent_kind in ('task','milestone','ticket_tier','booking')),
  dependent_id uuid not null,
  prerequisite_kind text not null check (prerequisite_kind in ('task','milestone','ticket_tier','booking','payment','team','venue','compliance','approval')),
  prerequisite_id uuid,
  hard boolean not null default true,
  lag_minutes integer not null default 0 check (lag_minutes between 0 and 525600),
  note text not null default '' check (length(note) <= 500),
  -- Approval prerequisite (36.6): requester, approver, reason, expiry and decision live on the edge; history in audit_events.
  approval_status text check (approval_status in ('pending','approved','rejected','expired')),
  approval_requested_by uuid references auth.users(id) on delete set null,
  approval_decided_by uuid references auth.users(id) on delete set null,
  approval_decided_at timestamptz,
  approval_reason text not null default '' check (length(approval_reason) <= 500),
  approval_expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((prerequisite_kind in ('venue','compliance','approval')) = (prerequisite_id is null)),
  check ((prerequisite_kind = 'approval') = (approval_status is not null)),
  check (not (dependent_kind in ('task','milestone') and prerequisite_kind in ('task','milestone') and dependent_id = prerequisite_id)
     and not (dependent_kind = prerequisite_kind and dependent_id = prerequisite_id))
);
create unique index if not exists event_dependencies_edge on public.event_dependencies
  (event_id, dependent_kind, dependent_id, prerequisite_kind, coalesce(prerequisite_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where prerequisite_kind <> 'approval';
create index if not exists event_dependencies_dependent on public.event_dependencies(dependent_id);
create index if not exists event_dependencies_prereq on public.event_dependencies(prerequisite_id) where prerequisite_id is not null;
create index if not exists event_dependencies_event on public.event_dependencies(event_id);

alter table public.event_dependencies enable row level security;
drop policy if exists event_dependencies_read on public.event_dependencies;
create policy event_dependencies_read on public.event_dependencies for select to authenticated using (public.can_access_event(event_id));
revoke all on public.event_dependencies from anon, authenticated;
grant select on public.event_dependencies to authenticated;
grant all on public.event_dependencies to service_role;

-- Tasks: recurrence (42.7). Completing a recurring task creates the next occurrence once (idempotent per due date).
alter table public.tasks
  add column if not exists recurrence text check (recurrence in ('daily','weekly','fortnightly','monthly')),
  add column if not exists recurrence_until timestamptz,
  add column if not exists recurrence_parent_id uuid references public.tasks(id) on delete set null;
create unique index if not exists tasks_recurrence_once on public.tasks(recurrence_parent_id, due_at) where recurrence_parent_id is not null;

-- Node identity: milestones are tasks, so a milestone and a task with the same id are one node.
create or replace function public.event_dependency_node(p_kind text, p_id uuid) returns text
language sql immutable set search_path = '' as $$
  select case when p_kind in ('task','milestone') then 'task' else p_kind end || ':' || coalesce(p_id::text, '');
$$;

-- Is a prerequisite satisfied right now? (approval edges pass their own row id.)
create or replace function public.event_dependency_met(p_event uuid, p_kind text, p_id uuid, p_edge uuid default null) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare e public.events;
begin
  case p_kind
    when 'task', 'milestone' then return exists (select 1 from public.tasks t where t.id = p_id and t.status = 'done');
    when 'booking' then return exists (select 1 from public.build_items b where b.id = p_id and b.status in ('confirmed','active','fulfilled','completed'));
    when 'ticket_tier' then return exists (select 1 from public.ticket_tiers t where t.id = p_id and t.status in ('on_sale','sold_out'));
    when 'payment' then return exists (select 1 from public.payment_orders p where p.build_item_id = p_id
      and p.status in ('payment_succeeded','protected_pending_delivery','eligible_for_provider_transfer','transfer_created','payout_pending','paid_out'));
    when 'team' then return exists (select 1 from public.shifts s where s.id = p_id and s.crew_id is not null and s.status not in ('pending','draft','unavailable'));
    when 'venue' then
      select * into e from public.events where id = p_event;
      return coalesce((e.settings->>'venue_confirmed')::boolean, false)
        or exists (select 1 from public.build_items b where b.event_id = p_event and b.category = 'venue' and b.status in ('confirmed','active','fulfilled','completed'));
    when 'compliance' then
      return not exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id
        where b.event_id = p_event and b.status in ('confirmed','held') and (exists (select 1 from public.trust_credential_rows(l.workspace_id, null) c where c.blocking)
          or exists (select 1 from public.trust_credential_rows(l.workspace_id, l.id) c where c.blocking)));
    when 'approval' then
      return exists (select 1 from public.event_dependencies d where d.id = p_edge and d.approval_status = 'approved'
        and (d.approval_expires_at is null or d.approval_expires_at > now()));
    else return false;
  end case;
end $$;

-- Validates kinds/ids belong to the event and rejects cycles. Runs for every writer (service role included).
create or replace function public.event_dependencies_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean; target text; start text; hit boolean;
begin
  new.updated_at := now();
  perform public.advisory_xact_lock('event_dependencies', new.event_id::text);
  for i in 1..2 loop
    declare k text := case when i = 1 then new.dependent_kind else new.prerequisite_kind end; x uuid := case when i = 1 then new.dependent_id else new.prerequisite_id end;
    begin
      ok := case k
        when 'task' then exists (select 1 from public.tasks t where t.id = x and t.event_id = new.event_id)
        when 'milestone' then exists (select 1 from public.tasks t where t.id = x and t.event_id = new.event_id and t.milestone)
        when 'ticket_tier' then exists (select 1 from public.ticket_tiers t where t.id = x and t.event_id = new.event_id)
        when 'booking' then exists (select 1 from public.build_items b where b.id = x and b.event_id = new.event_id)
        when 'payment' then exists (select 1 from public.build_items b where b.id = x and b.event_id = new.event_id)
        when 'team' then exists (select 1 from public.shifts s where s.id = x and s.event_id = new.event_id)
        else x is null end;
      if not ok then raise exception 'dependency_item_not_in_event' using errcode = '22023', detail = k; end if;
    end;
  end loop;
  if new.prerequisite_kind in ('venue','compliance','approval','payment','team') then return new; end if;   -- leaves: cannot close a cycle
  target := public.event_dependency_node(new.dependent_kind, new.dependent_id);
  start := public.event_dependency_node(new.prerequisite_kind, new.prerequisite_id);
  with recursive walk(node, depth) as (
    select start, 0
    union
    select public.event_dependency_node(d.prerequisite_kind, d.prerequisite_id), w.depth + 1
      from walk w join public.event_dependencies d on d.event_id = new.event_id and d.id <> new.id
       and public.event_dependency_node(d.dependent_kind, d.dependent_id) = w.node and d.prerequisite_id is not null
     where w.depth < 200)
  select exists (select 1 from walk where node = target) into hit;
  if hit or start = target then raise exception 'dependency_cycle' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists trg_event_dependencies_guard on public.event_dependencies;
create trigger trg_event_dependencies_guard before insert or update on public.event_dependencies for each row execute function public.event_dependencies_guard();

-- Unmet hard prerequisites for a dependent (labels for errors and the UI).
create or replace function public.event_dependency_blockers(p_kind text, p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.prerequisite_kind, 'ref', d.prerequisite_id)), '[]'::jsonb)
    from public.event_dependencies d
   where public.event_dependency_node(d.dependent_kind, d.dependent_id) = public.event_dependency_node(p_kind, p_id)
     and d.hard and not public.event_dependency_met(d.event_id, d.prerequisite_kind, d.prerequisite_id, d.id);
$$;

-- Hard dependencies block completion of a task and the on-sale switch of a tier; recurring tasks spawn their next occurrence.
create or replace function public.tasks_dependency_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b jsonb; step interval; nxt timestamptz; ev timestamptz;
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.event_id is not null then
    b := public.event_dependency_blockers('task', new.id);
    if jsonb_array_length(b) > 0 then raise exception 'blocked_by_dependencies' using errcode = '22023', detail = b::text; end if;
    if new.recurrence is not null and new.due_at is not null then
      step := case new.recurrence when 'daily' then interval '1 day' when 'weekly' then interval '7 days' when 'fortnightly' then interval '14 days' else interval '1 month' end;
      nxt := new.due_at + step;
      select starts_at into ev from public.events where id = new.event_id;
      if (new.recurrence_until is null or nxt <= new.recurrence_until) and (ev is null or nxt <= ev) then
        insert into public.tasks(event_id, workspace_id, owner_id, title, detail, category, assignee_name, due_at, priority, status, milestone, recurrence, recurrence_until, recurrence_parent_id)
          values (new.event_id, new.workspace_id, new.owner_id, new.title, new.detail, new.category, new.assignee_name, nxt, new.priority, 'todo', new.milestone,
                  new.recurrence, new.recurrence_until, coalesce(new.recurrence_parent_id, new.id))
          on conflict (recurrence_parent_id, due_at) where recurrence_parent_id is not null do nothing;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_tasks_dependency_guard on public.tasks;
create trigger trg_tasks_dependency_guard before update of status on public.tasks for each row execute function public.tasks_dependency_guard();

create or replace function public.ticket_tier_dependency_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b jsonb;
begin
  if new.status = 'on_sale' and old.status is distinct from 'on_sale' and old.status <> 'sold_out' then
    b := public.event_dependency_blockers('ticket_tier', new.id);
    if jsonb_array_length(b) > 0 then raise exception 'blocked_by_dependencies' using errcode = '22023', detail = b::text; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_ticket_tier_dependency_guard on public.ticket_tiers;
create trigger trg_ticket_tier_dependency_guard before update of status on public.ticket_tiers for each row execute function public.ticket_tier_dependency_guard();

-- ── Commands ─────────────────────────────────────────────────────────────────
create or replace function public.event_dependency_can_write(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and (
    (e.workspace_id is null and e.owner_id = (select auth.uid())) or (e.workspace_id is not null and public.has_permission(e.workspace_id, 'events.write'))));
$$;

create or replace function public.add_event_dependency(p_event uuid, p_dependent_kind text, p_dependent_id uuid, p_prerequisite_kind text,
  p_prerequisite_id uuid default null, p_hard boolean default true, p_lag_minutes integer default 0, p_note text default '', p_approval_expires_at timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); v_id uuid; ws uuid;
begin
  if uid is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select workspace_id into ws from public.events where id = p_event;
  insert into public.event_dependencies(event_id, dependent_kind, dependent_id, prerequisite_kind, prerequisite_id, hard, lag_minutes, note,
      approval_status, approval_requested_by, approval_expires_at, created_by)
    values (p_event, p_dependent_kind, p_dependent_id, p_prerequisite_kind, case when p_prerequisite_kind in ('venue','compliance','approval') then null else p_prerequisite_id end,
      coalesce(p_hard, true), greatest(coalesce(p_lag_minutes, 0), 0), left(coalesce(p_note, ''), 500),
      case when p_prerequisite_kind = 'approval' then 'pending' end, case when p_prerequisite_kind = 'approval' then uid end, p_approval_expires_at, uid)
    on conflict (event_id, dependent_kind, dependent_id, prerequisite_kind, coalesce(prerequisite_id, '00000000-0000-0000-0000-000000000000'::uuid)) where prerequisite_kind <> 'approval'
    do update set hard = excluded.hard, lag_minutes = excluded.lag_minutes, note = excluded.note
    returning id into v_id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, ws, 'event.dependency_added',
    jsonb_build_object('event_id', p_event, 'dependency_id', v_id, 'dependent', p_dependent_kind, 'prerequisite', p_prerequisite_kind));
  perform public.emit_domain_event('event.dependency_added', ws, jsonb_build_object('event_id', p_event, 'id', v_id, 'dependent_kind', p_dependent_kind,
    'dependent_id', p_dependent_id, 'prerequisite_kind', p_prerequisite_kind, 'prerequisite_id', p_prerequisite_id), uid, 'user', 'event', p_event::text, null, null);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.remove_event_dependency(p_dependency uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); d public.event_dependencies; ws uuid;
begin
  select * into d from public.event_dependencies where id = p_dependency;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if uid is null or not public.event_dependency_can_write(d.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select workspace_id into ws from public.events where id = d.event_id;
  delete from public.event_dependencies where id = d.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, ws, 'event.dependency_removed', jsonb_build_object('event_id', d.event_id, 'dependency', to_jsonb(d)));
  perform public.emit_domain_event('event.dependency_removed', ws, jsonb_build_object('event_id', d.event_id, 'id', d.id), uid, 'user', 'event', d.event_id::text, null, null);
  return jsonb_build_object('ok', true);
end $$;

-- Task "depends on" list (42.5): replaces the task's task/milestone prerequisites in one call.
create or replace function public.set_task_dependencies(p_task uuid, p_prerequisites uuid[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare t public.tasks; x uuid; n integer := 0;
begin
  select * into t from public.tasks where id = p_task;
  if not found or t.event_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.event_dependency_can_write(t.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if coalesce(array_length(p_prerequisites, 1), 0) > 50 then raise exception 'too_many_dependencies' using errcode = '22023'; end if;
  delete from public.event_dependencies d where d.dependent_kind in ('task','milestone') and d.dependent_id = t.id and d.prerequisite_kind in ('task','milestone')
    and not (d.prerequisite_id = any(coalesce(p_prerequisites, '{}')));
  foreach x in array coalesce(p_prerequisites, '{}') loop
    perform public.add_event_dependency(t.event_id, 'task', t.id, 'task', x);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- Approval decision (36.6): owners/managers (or the customer owner); immutable history in audit_events.
create or replace function public.decide_event_dependency_approval(p_dependency uuid, p_approve boolean, p_reason text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); d public.event_dependencies; e public.events; st text;
begin
  select * into d from public.event_dependencies where id = p_dependency and prerequisite_kind = 'approval' for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.events where id = d.event_id;
  if uid is null or not ((e.workspace_id is null and e.owner_id = uid) or (e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager']))) then
    raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.approval_status <> 'pending' then raise exception 'already_decided' using errcode = '22023'; end if;
  if d.approval_expires_at is not null and d.approval_expires_at <= now() then
    update public.event_dependencies set approval_status = 'expired' where id = d.id; raise exception 'approval_expired' using errcode = '22023'; end if;
  st := case when p_approve then 'approved' else 'rejected' end;
  update public.event_dependencies set approval_status = st, approval_decided_by = uid, approval_decided_at = now(), approval_reason = left(coalesce(p_reason, ''), 500) where id = d.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, e.workspace_id, 'event.dependency_approval_decided',
    jsonb_build_object('event_id', e.id, 'dependency_id', d.id, 'decision', st, 'reason', left(coalesce(p_reason, ''), 500), 'requested_by', d.approval_requested_by));
  perform public.emit_domain_event('event.dependency_approval_decided', e.workspace_id, jsonb_build_object('event_id', e.id, 'id', d.id, 'decision', st), uid, 'user', 'event', e.id::text, null, null);
  return jsonb_build_object('ok', true, 'status', st);
end $$;

-- Graph query (36.8): nodes, edges, blocked-by lists and the critical path (longest chain of unmet hard prerequisites).
create or replace function public.event_dependency_graph(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare edges jsonb; nodes jsonb; blocked jsonb; path jsonb;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  with e as (
    select d.*, public.event_dependency_node(d.dependent_kind, d.dependent_id) dn,
           case when d.prerequisite_kind = 'approval' then 'approval:' || d.id else public.event_dependency_node(d.prerequisite_kind, d.prerequisite_id) end pn,
           public.event_dependency_met(d.event_id, d.prerequisite_kind, d.prerequisite_id, d.id) met
      from public.event_dependencies d where d.event_id = p_event)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'dependent', dn, 'prerequisite', pn, 'hard', hard, 'lag_minutes', lag_minutes, 'met', met,
           'note', note, 'approval_status', approval_status, 'approval_expires_at', approval_expires_at) order by created_at), '[]') into edges from e;

  with keys as (
    select distinct k from (select x->>'dependent' k from jsonb_array_elements(edges) x union all select x->>'prerequisite' from jsonb_array_elements(edges) x) z),
  lab as (
    select k, split_part(k, ':', 1) kind, nullif(split_part(k, ':', 2), '') ref from keys)
  select coalesce(jsonb_agg(jsonb_build_object('key', l.k, 'kind', l.kind, 'id', l.ref,
      'label', case l.kind when 'task' then (select t.title from public.tasks t where t.id::text = l.ref)
                           when 'ticket_tier' then (select t.name from public.ticket_tiers t where t.id::text = l.ref)
                           when 'booking' then (select b.title from public.build_items b where b.id::text = l.ref)
                           when 'payment' then (select 'Payment: ' || b.title from public.build_items b where b.id::text = l.ref)
                           when 'team' then (select 'Shift: ' || s.role from public.shifts s where s.id::text = l.ref)
                           when 'venue' then 'Venue confirmed' when 'compliance' then 'Provider compliance' when 'approval' then 'Approval' end,
      'due_at', case l.kind when 'task' then (select t.due_at from public.tasks t where t.id::text = l.ref) end,
      'met', case when l.kind = 'approval' then public.event_dependency_met(p_event, 'approval', null, l.ref::uuid)
                  else public.event_dependency_met(p_event, l.kind, l.ref::uuid) end)), '[]') into nodes from lab l;

  select coalesce(jsonb_agg(jsonb_build_object('key', d, 'blocked_by', bl)), '[]') into blocked from (
    select x->>'dependent' d, jsonb_agg(x->>'prerequisite') bl from jsonb_array_elements(edges) x
     where (x->>'hard')::boolean and not (x->>'met')::boolean group by 1) z;

  with recursive ue as (
    select x->>'dependent' d, x->>'prerequisite' p, (x->>'lag_minutes')::int lag from jsonb_array_elements(edges) x where (x->>'hard')::boolean and not (x->>'met')::boolean),
  chain(head, tail, nodes, lag) as (
    select d, p, array[d, p], lag from ue
    union all
    select c.head, u.p, c.nodes || u.p, c.lag + u.lag from chain c join ue u on u.d = c.tail where not u.p = any(c.nodes) and array_length(c.nodes, 1) < 60)
  select to_jsonb(nodes) into path from chain order by array_length(nodes, 1) desc, lag desc, head limit 1;

  return jsonb_build_object('nodes', nodes, 'edges', edges, 'blocked', blocked, 'critical_path', coalesce(path, '[]'::jsonb));
end $$;

-- Readiness rows for unmet hard dependencies (used by event_readiness and the UI).
create or replace function public.event_dependency_readiness(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n integer; urgent integer; e public.events;
begin
  select * into e from public.events where id = p_event;
  select count(*), count(*) filter (where
      (d.dependent_kind in ('task','milestone') and exists (select 1 from public.tasks t where t.id = d.dependent_id and t.status <> 'done' and t.due_at is not null and t.due_at < now() + interval '7 days'))
      or (e.starts_at is not null and e.starts_at < now() + interval '7 days'))
    into n, urgent
    from public.event_dependencies d
   where d.event_id = p_event and d.hard and not public.event_dependency_met(d.event_id, d.prerequisite_kind, d.prerequisite_id, d.id)
     and not (d.dependent_kind in ('task','milestone') and exists (select 1 from public.tasks t where t.id = d.dependent_id and t.status = 'done'));
  if not exists (select 1 from public.event_dependencies d where d.event_id = p_event) then
    return jsonb_build_object('state', 'not_required', 'reason', 'No dependencies set.', 'unmet', 0, 'urgent', 0);
  end if;
  return jsonb_build_object('state', case when urgent > 0 then 'blocked' when n > 0 then 'attention' else 'ready' end,
    'reason', case when urgent > 0 then urgent || ' hard dependenc' || case when urgent = 1 then 'y' else 'ies' end || ' unmet and due within 7 days.'
                   when n > 0 then n || ' hard dependenc' || case when n = 1 then 'y' else 'ies' end || ' not met yet.' else 'All hard dependencies met.' end,
    'unmet', n, 'urgent', urgent);
end $$;

revoke all on function public.event_dependency_node(text, uuid), public.event_dependency_met(uuid, text, uuid, uuid), public.event_dependencies_guard(),
  public.event_dependency_blockers(text, uuid), public.tasks_dependency_guard(), public.ticket_tier_dependency_guard(), public.event_dependency_can_write(uuid),
  public.event_dependency_readiness(uuid) from public, anon, authenticated;
grant execute on function public.event_dependency_node(text, uuid), public.event_dependency_met(uuid, text, uuid, uuid), public.event_dependency_blockers(text, uuid),
  public.event_dependency_can_write(uuid), public.event_dependency_readiness(uuid) to service_role;
revoke all on function public.add_event_dependency(uuid, text, uuid, text, uuid, boolean, integer, text, timestamptz), public.remove_event_dependency(uuid),
  public.set_task_dependencies(uuid, uuid[]), public.decide_event_dependency_approval(uuid, boolean, text), public.event_dependency_graph(uuid) from public, anon;
grant execute on function public.add_event_dependency(uuid, text, uuid, text, uuid, boolean, integer, text, timestamptz), public.remove_event_dependency(uuid),
  public.set_task_dependencies(uuid, uuid[]), public.decide_event_dependency_approval(uuid, boolean, text), public.event_dependency_graph(uuid) to authenticated, service_role;

-- event_readiness: body identical to 202610294006 plus a "Dependencies" domain (unmet hard dependencies) before the feasibility escalation.
CREATE OR REPLACE FUNCTION public.event_readiness(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; d jsonb := '[]'; checks jsonb := '[]'; base text; days numeric; feas jsonb; n integer; m integer; st text; why text;
  procedure_dummy integer;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  base := case when e.workspace_id is null then '/account/events/' || e.id else '/organizer/events/' || e.id end;
  days := case when e.starts_at is null then null else extract(epoch from (e.starts_at - now())) / 86400 end;

  -- Venue
  if exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'venue' and b.status in ('confirmed','active','fulfilled','completed')) or coalesce((e.settings->>'venue_confirmed')::boolean, false) then st := 'ready'; why := 'Venue confirmed.';
  elsif exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'venue' and b.status in ('replacement_required','cancelled_by_provider')) then st := 'blocked'; why := 'The venue cancelled — find a replacement.';
  elsif exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'venue' and b.status in ('held','conditionally_held','quoted','available','sent','awaiting')) then st := case when days is not null and days < 21 then 'blocked' else 'attention' end; why := 'Venue not confirmed yet.';
  elsif e.venue_name is not null and length(e.venue_name) > 0 then st := 'attention'; why := 'Venue named but not booked through Gala Dock — confirm it to count it.';
  else st := case when days is not null and days < 30 then 'blocked' else 'attention' end; why := 'No venue yet.'; end if;
  d := d || jsonb_build_object('key', 'venue', 'label', 'Venue', 'state', st, 'reason', why, 'fix', base || case when e.workspace_id is null then '/build' else '?tab=plan&section=venue' end);

  -- Suppliers
  select count(*) filter (where b.status in ('replacement_required','cancelled_by_provider')), count(*) filter (where b.status not in ('confirmed','active','fulfilled','completed'))
    into n, m from public.build_items b where b.event_id = e.id and b.role = 'primary' and b.category <> 'venue' and b.status not in ('suggested','draft','cancelled','declined','unavailable','expired');
  st := case when n > 0 then 'blocked' when m > 0 then 'attention' when exists (select 1 from public.build_items b where b.event_id = e.id and b.category <> 'venue' and b.role = 'primary' and b.status in ('confirmed','active','fulfilled')) then 'ready' else 'not_required' end;
  d := d || jsonb_build_object('key', 'suppliers', 'label', 'Suppliers', 'state', st, 'reason', case st when 'blocked' then n || ' supplier(s) need replacing.' when 'attention' then m || ' supplier(s) not confirmed yet.' when 'ready' then 'All booked suppliers confirmed.' else 'No suppliers needed so far.' end,
    'fix', base || case when e.workspace_id is null then '/build' else '?tab=plan&section=suppliers' end);

  -- Staff (shifts)
  select count(*) filter (where s.crew_id is null or s.status in ('pending','draft','unavailable')), count(*) into n, m from public.shifts s where s.event_id = e.id;
  st := case when m = 0 then 'not_required' when n > 0 then case when days is not null and days < 3 then 'blocked' else 'attention' end else 'ready' end;
  d := d || jsonb_build_object('key', 'staff', 'label', 'Staff', 'state', st, 'reason', case when m = 0 then 'No shifts planned.' when n > 0 then n || ' of ' || m || ' shifts unfilled or unconfirmed.' else 'All shifts staffed.' end, 'fix', base || '?tab=operations&section=team');

  -- Tickets
  if not exists (select 1 from public.ticket_tiers t where t.event_id = e.id) then st := 'not_required'; why := 'No tickets for this event.';
  elsif exists (select 1 from public.ticket_tiers t where t.event_id = e.id and t.status = 'on_sale') then st := 'ready'; why := 'Tickets on sale.';
  else st := case when days is not null and days < 14 then 'attention' else 'ready' end; why := 'Tickets set up but not on sale.'; end if;
  d := d || jsonb_build_object('key', 'tickets', 'label', 'Tickets', 'state', st, 'reason', why, 'fix', base || '?tab=sell&section=tickets');

  -- Guests
  st := case when exists (select 1 from public.guests g where g.event_id = e.id) or exists (select 1 from public.ticket_tiers t where t.event_id = e.id) then 'ready' else 'attention' end;
  d := d || jsonb_build_object('key', 'guests', 'label', 'Guests', 'state', st, 'reason', case st when 'ready' then 'Guest list or tickets in place.' else 'Add a guest list or tickets.' end, 'fix', base || case when e.workspace_id is null then '/guests-tickets' else '?tab=plan&section=guests' end);

  -- Money
  if exists (select 1 from public.payments p where p.event_id = e.id and p.status = 'overdue') then st := 'blocked'; why := 'Overdue payments.';
  elsif exists (select 1 from public.payment_orders po where po.event_id = e.id and po.status = 'failed') or exists (select 1 from public.payments p where p.event_id = e.id and p.status in ('due','scheduled') and p.due_at < now() + interval '7 days') then st := 'attention'; why := 'Payments due within 7 days or a payment failed.';
  else st := 'ready'; why := 'Nothing overdue.'; end if;
  d := d || jsonb_build_object('key', 'money', 'label', 'Money', 'state', st, 'reason', why, 'fix', base || case when e.workspace_id is null then '/money' else '?tab=money' end);

  -- Compliance: confirmed providers missing required credentials; client-held bar licence.
  select count(*) into n from public.build_items b join public.listings l on l.id = b.listing_id
    where b.event_id = e.id and b.status in ('confirmed','held') and (exists (select 1 from public.trust_credential_rows(l.workspace_id, null) c where c.blocking)
           or exists (select 1 from public.trust_credential_rows(l.workspace_id, l.id) c where c.blocking));
  st := case when n > 0 then 'attention' else 'ready' end;
  d := d || jsonb_build_object('key', 'compliance', 'label', 'Compliance', 'state', st, 'reason', case when n > 0 then n || ' booked provider(s) have required documents outstanding.' else 'Booked providers meet document requirements.' end, 'fix', base || '?tab=plan&section=suppliers');

  -- Risk: open disputes / incidents.
  select count(*) into n from public.incidents i where i.event_id = e.id and i.status <> 'resolved' and i.severity in ('high','critical');
  select count(*) into m from public.booking_disputes x where x.event_id = e.id and x.status <> 'resolved';
  st := case when n > 0 then 'blocked' when m > 0 then 'attention' else 'ready' end;
  d := d || jsonb_build_object('key', 'risk', 'label', 'Risk', 'state', st, 'reason', case when n > 0 then n || ' serious incident(s) open.' when m > 0 then m || ' booking dispute(s) open.' else 'No open incidents or disputes.' end, 'fix', base || '?tab=operations&section=risk');

  -- Logistics: BEO approval and catering numbers ahead of the event.
  select count(*) into n from public.event_orders o where o.event_id = e.id and o.status in ('sent','revised');
  select count(*) into m from public.catering_selections c where c.event_id = e.id and c.status in ('draft') and c.final_numbers_due is not null and c.final_numbers_due <= current_date + 3;
  st := case when n + m > 0 then 'attention' else 'ready' end;
  d := d || jsonb_build_object('key', 'logistics', 'label', 'Logistics', 'state', st, 'reason', case when n > 0 then n || ' event order(s) awaiting your approval.' when m > 0 then 'Catering final numbers due.' else 'Event orders and catering in hand.' end, 'fix', base || '?tab=operations&section=logistics');

  -- Promotion
  st := case when coalesce(e.visibility, 'private') <> 'public' then 'not_required' when e.status in ('published','live','on_sale') then 'ready' else 'attention' end;
  d := d || jsonb_build_object('key', 'promotion', 'label', 'Promotion', 'state', st, 'reason', case st when 'not_required' then 'Private event.' when 'ready' then 'Public page live.' else 'Public event not published yet.' end, 'fix', base || '?tab=sell&section=public');

  -- Operations: run sheet in the final fortnight.
  st := case when exists (select 1 from public.programme_items p where p.event_id = e.id) then 'ready' when days is not null and days < 14 then 'attention' else 'not_required' end;
  d := d || jsonb_build_object('key', 'operations', 'label', 'Operations', 'state', st, 'reason', case st when 'ready' then 'Run sheet in place.' when 'attention' then 'No run sheet yet.' else 'Run sheet not needed yet.' end, 'fix', base || '?tab=operations&section=runsheet');

  -- Dependencies (Q14, domain 36): unmet hard dependencies; blocked when one is due within 7 days or the event is within 7 days.
  feas := public.event_dependency_readiness(p_event);
  if feas->>'state' <> 'not_required' then
    d := d || jsonb_build_object('key', 'dependencies', 'label', 'Dependencies', 'state', feas->>'state', 'reason', feas->>'reason', 'fix', base || case when e.workspace_id is null then '/plan' else '?tab=plan&section=tasks' end);
  end if;

  -- Feasibility blockers escalate the relevant picture.
  feas := public.event_feasibility(p_event);
  if exists (select 1 from jsonb_array_elements(feas) f where f->>'severity' = 'blocker') then
    d := d || jsonb_build_object('key', 'feasibility', 'label', 'Feasibility', 'state', 'blocked', 'reason', (select f->>'message' from jsonb_array_elements(feas) f where f->>'severity' = 'blocker' limit 1), 'fix', (select f->>'fix' from jsonb_array_elements(feas) f where f->>'severity' = 'blocker' limit 1));
  elsif jsonb_array_length(feas) > 0 then
    d := d || jsonb_build_object('key', 'feasibility', 'label', 'Feasibility', 'state', 'attention', 'reason', jsonb_array_length(feas) || ' warning(s): ' || (feas->0->>'message'), 'fix', feas->0->>'fix');
  end if;

  -- Backwards-compatible checks list (ok = ready or not required), plus an explainable score.
  select jsonb_agg(jsonb_build_object('key', x->>'key', 'label', x->>'label', 'ok', x->>'state' in ('ready','not_required'), 'severity', case x->>'state' when 'blocked' then 'critical' when 'attention' then 'high' else 'medium' end, 'reason', x->>'reason', 'fix', x->>'fix'))
    into checks from jsonb_array_elements(d) x;
  select count(*) filter (where x->>'state' = 'ready'), count(*) filter (where x->>'state' <> 'not_required') into n, m from jsonb_array_elements(d) x;
  return jsonb_build_object('score', round(100.0 * n / greatest(m, 1)), 'checks', checks, 'domains', d, 'feasibility', feas,
    'state', case when exists (select 1 from jsonb_array_elements(d) x where x->>'state' = 'blocked') then 'blocked' when exists (select 1 from jsonb_array_elements(d) x where x->>'state' = 'attention') then 'attention' else 'ready' end);
end $function$;
