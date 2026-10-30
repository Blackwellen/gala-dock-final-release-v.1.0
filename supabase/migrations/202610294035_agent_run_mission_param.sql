-- Q42 ask (lane D S1, 2026-10-29): start_agent_run can record the chosen skill as the run's mission (agent_runs.mission, mode =
-- 'mission'), so the run engine follows that skill's bound tools and mission template (runtime.ts reads run.mission).
-- Additive: a NEW 7-argument overload with a REQUIRED p_mission. The 6-argument function (4029) is untouched, and because the new
-- parameter has no default, existing 6-argument calls (provider + admin pages, specs) still resolve to the original — no ambiguity.
-- The overload validates the skill (exists, same surface, active, plan gate) and then delegates to the original for every
-- existing rule (surface, role / MFA, goal, tools, idempotency, insert guard, audit). A refusal raised after the delegate's insert
-- aborts the whole call, so a refused mission never leaves a run behind. Organiser runs are created by the app (Agent.startRun,
-- which already writes mission); start_agent_run itself still refuses the organiser surface (unsupported_surface).

create or replace function public.start_agent_run(p_ws uuid, p_surface text, p_goal text, p_tools text[], p_constraints jsonb, p_idempotency text, p_mission text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid; k public.agent_skills; existed boolean;
begin
  if p_mission is null or btrim(p_mission) = '' then
    return public.start_agent_run(p_ws, p_surface, p_goal, p_tools, p_constraints, p_idempotency);
  end if;
  -- Same early refusals as the original, before the skill lookup (customers never learn which skills exist).
  if p_surface = 'customer' then raise exception 'agent_not_available_for_customers' using errcode = '42501'; end if;
  if p_surface is null or p_surface not in ('provider', 'admin') then raise exception 'unsupported_surface' using errcode = '22023'; end if;
  select * into k from public.agent_skills where id = p_mission;
  if not found or k.surface <> p_surface then raise exception 'unknown_skill' using errcode = '22023'; end if;   -- admin has no skills
  if k.status <> 'active' then raise exception 'skill_retired' using errcode = '22023'; end if;
  existed := p_idempotency is not null and exists (select 1 from public.agent_runs where idempotency_key = p_idempotency);
  rid := public.start_agent_run(p_ws, p_surface, p_goal, p_tools, p_constraints, p_idempotency);   -- role, goal, tools, idempotency
  if k.plan_capability is not null and not public.has_capability(p_ws, k.plan_capability) then
    raise exception 'plan_not_entitled' using errcode = '42501', hint = 'This skill needs ' || k.plan_capability || ' on the workspace plan.';
  end if;
  if not existed then
    update public.agent_runs set mission = k.id, mode = 'mission', updated_at = now() where id = rid and mission is null;
    insert into public.audit_events(actor_id, workspace_id, agent_run_id, event, metadata)
      values ((select auth.uid()), p_ws, rid, 'agent.mission_selected', jsonb_build_object('run_id', rid, 'skill', k.id, 'skill_version', k.version));
  end if;
  return rid;
end $$;

revoke all on function public.start_agent_run(uuid, text, text, text[], jsonb, text, text) from public, anon;
grant execute on function public.start_agent_run(uuid, text, text, text[], jsonb, text, text) to authenticated, service_role;
