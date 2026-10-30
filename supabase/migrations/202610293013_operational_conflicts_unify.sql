-- Q17 (lane C, 2026-10-29) follow-up to 202610293012: operational_conflicts reuses the existing team conflict engine
-- (team_conflicts, §85: overlap / travel / unavailable / unfilled / unconfirmed / qualification / missing role) for crew rows
-- instead of re-detecting them, and adds the Q17 kinds on top (deactivated crew, resources, run-sheet delays, serious
-- incidents, high residual risks). Same signature and grants.
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
      and (p_event is null or e.id = p_event);
$$;
