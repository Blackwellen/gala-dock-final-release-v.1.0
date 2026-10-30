-- Q41 Agent Runtime / Governance (lane D). Domains 1, 3–15. Additive and backward-compatible with the deployed runtime:
--   * agent_tools gains exposure (organizer / provider / admin / api / mcp — never customer), a plan capability and a per-tool
--     rate; the registry generator (scripts/gen-agent-tools.mjs) now emits them, so registry = seed = live stays checkable.
--   * agent_execute_tool(): the single governed entry point for a run's tool call. It re-checks, in the database, everything
--     the TypeScript planner decided: kill switches, surface exposure, plan entitlement, membership + tool permission, R5 never,
--     R3/R4 only with a live approval (or an explicit policy auto-rule), the run's own workspace (never one from the args),
--     a per-workspace tool rate, and an idempotency key so a retried step returns the recorded result instead of acting twice.
--     Every call — refused, failed or succeeded — is a row in agent_tool_calls (append-only audit per step).
--   * agent_runs: status CHECK widened to the states the runtime and the agent_run machine already use (awaiting_plan_confirmation,
--     retrying, scheduled_wait, partially_completed were rejected by the old CHECK, leaving runs stuck in planning); a BEFORE INSERT
--     guard refuses new runs for customers, under a kill switch, beyond the hourly run rate, or when a hard-capped workspace has no
--     credits left (refuse-before-spend; ai_preflight still guards every model call).
--   * Kill switches: platform (agent_runtime_controls, agent_ops + MFA + reason) and per workspace (agent_policies.kill_switch).
--   * Approvals: R4 above the workspace booking authority needs the owner and a fresh step-up; approvals expire in the database
--     even if the worker is down (job agent.approval_expiry). Admin-path run control needs MFA.
-- Nothing here calls a model: AI stays Azure-only through src/lib/agent/llm.ts.

-- ── 1. Tool registry governance ──
alter table public.agent_tools
  add column if not exists exposure text[] not null default array['organizer']::text[],
  add column if not exists plan_capability text,
  add column if not exists rate_per_minute integer not null default 30;
alter table public.agent_tools drop constraint if exists agent_tools_exposure_check;
alter table public.agent_tools add constraint agent_tools_exposure_check
  check (exposure <@ array['organizer','provider','admin','api','mcp']::text[] and cardinality(exposure) >= 1 and not ('customer' = any(exposure)));
alter table public.agent_tools drop constraint if exists agent_tools_rate_check;
alter table public.agent_tools add constraint agent_tools_rate_check check (rate_per_minute between 1 and 600);
-- Backfill from the declared surface (the generator now writes these explicitly). API/MCP: R0–R3 only (R4 → approval_required, R5 never).
update public.agent_tools set
  exposure = (case surface when 'both' then array['organizer','provider'] else array[surface] end) || case when risk <= 3 then array['api','mcp'] else array[]::text[] end,
  plan_capability = case when risk >= 3 then 'agent.actions' else null end,
  rate_per_minute = case when risk >= 3 then 10 when risk >= 1 then 30 else 60 end;

-- Plan entitlement for external / commercial agent actions (R3/R4). Enabled on every plan today (owner decision pending on
-- whether Starter keeps them); a workspace override in workspaces.settings.entitlements can switch it off for one tenant.
insert into public.plan_entitlements(kind, plan, capability, value)
  select k, p, 'agent.actions', 'true'::jsonb from unnest(array['organizer','provider']) k cross join unnest(array['starter','pro','business','enterprise']) p
on conflict do nothing;

-- ── 2. Kill switches and run limits ──
create table if not exists public.agent_runtime_controls (
  id smallint primary key default 1 check (id = 1),
  kill_switch boolean not null default false,
  reason text not null default '',
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now()
);
insert into public.agent_runtime_controls(id) values (1) on conflict do nothing;
alter table public.agent_runtime_controls enable row level security;
revoke all on public.agent_runtime_controls from anon, authenticated;
grant select on public.agent_runtime_controls to authenticated;
drop policy if exists agent_runtime_controls_read on public.agent_runtime_controls;
create policy agent_runtime_controls_read on public.agent_runtime_controls for select using (auth.uid() is not null);

alter table public.agent_policies
  add column if not exists kill_switch boolean not null default false,
  add column if not exists max_runs_per_hour integer not null default 30;
alter table public.agent_policies drop constraint if exists agent_policies_runs_per_hour_check;
alter table public.agent_policies add constraint agent_policies_runs_per_hour_check check (max_runs_per_hour between 1 and 500);

-- ── 3. Run lifecycle: CHECK matches the agent_run machine ──
alter table public.agent_runs drop constraint if exists agent_runs_status_check;
alter table public.agent_runs add constraint agent_runs_status_check check (status in ('queued','planning','awaiting_plan_confirmation','running','waiting_external',
  'waiting_approval','scheduled','scheduled_wait','paused','retrying','partially_completed','completed','failed','cancelled'));

-- Kill switches and admin control must be able to pause a run from every active state (the agent_run machine lacked
-- retrying → paused and awaiting_plan_confirmation → paused). Mirrored in src/lib/domain/state-machines.ts.
insert into public.state_transitions(machine, from_state, to_state) values ('agent_run','retrying','paused'), ('agent_run','awaiting_plan_confirmation','paused')
on conflict do nothing;

-- ── 4. Tool-call ledger (append-only audit per step; idempotency) ──
create table if not exists public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs(id) on delete cascade,
  step_id uuid references public.agent_run_steps(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  surface text not null,
  tool_id text not null,
  tool_version integer not null,
  risk smallint not null,
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  approval_id uuid references public.agent_approvals(id) on delete set null,
  decision text not null check (decision in ('auto','approved','policy_auto','refused')),
  status text not null check (status in ('running','succeeded','failed','refused')),
  refusal text,
  args_hash text not null,
  output jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer
);
create index if not exists agent_tool_calls_run_idx on public.agent_tool_calls(run_id, started_at);
create index if not exists agent_tool_calls_ws_idx on public.agent_tool_calls(workspace_id, started_at desc);
alter table public.agent_tool_calls enable row level security;
revoke all on public.agent_tool_calls from anon, authenticated;
grant select on public.agent_tool_calls to authenticated;
drop policy if exists agent_tool_calls_read on public.agent_tool_calls;
create policy agent_tool_calls_read on public.agent_tool_calls for select using (
  (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner','manager'])) or public.has_admin_permission('agent_ops'));

create or replace function public.agent_tool_calls_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Only the open call row may be completed once; history is never rewritten.
  if TG_OP = 'DELETE' then return old; end if;   -- cascades from run/workspace deletion (retention) only; no client can delete (no policy)
  if old.status <> 'running' or new.id <> old.id or new.idempotency_key <> old.idempotency_key or new.tool_id <> old.tool_id or new.actor_id is distinct from old.actor_id
     or new.workspace_id is distinct from old.workspace_id or new.args_hash <> old.args_hash then
    raise exception 'agent_tool_calls_append_only' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists agent_tool_calls_guard on public.agent_tool_calls;
create trigger agent_tool_calls_guard before update on public.agent_tool_calls for each row execute function public.agent_tool_calls_guard();

-- ── 5. Governance check (service only) ──
-- Returns null when the call may proceed, else a machine-readable refusal reason.
create or replace function public.agent_governance_refusal(p_run public.agent_runs, p_actor uuid, p_tool public.agent_tools, p_approval uuid, p_policy_auto boolean)
returns text language plpgsql stable security definer set search_path = '' as $$
declare w public.workspaces; pol public.agent_policies; ap public.agent_approvals; disabled jsonb; amount_minor bigint;
begin
  if (select kill_switch from public.agent_runtime_controls where id = 1) then return 'platform_kill_switch'; end if;
  select value -> 'tools_disabled' into disabled from public.setting_at('agent', now());
  if disabled is not null and disabled ? p_tool.id then return 'tool_disabled'; end if;
  if p_run.surface = 'customer' or p_run.surface is null then return 'surface_not_allowed'; end if;
  if not (p_run.surface = any(p_tool.exposure)) then return 'tool_not_exposed'; end if;
  if p_tool.risk >= 5 then return 'risk_r5_never'; end if;
  if p_run.workspace_id is null then return 'workspace_required'; end if;   -- admin-surface runs have no executable workspace tools
  select * into w from public.workspaces where id = p_run.workspace_id;
  if not found or w.status <> 'active' then return 'workspace_inactive'; end if;
  if w.kind <> p_run.surface then return 'surface_mismatch'; end if;
  select * into pol from public.agent_policies where workspace_id = p_run.workspace_id;
  if coalesce(pol.kill_switch, false) then return 'workspace_kill_switch'; end if;
  if p_tool.plan_capability is not null and not public.has_capability(p_run.workspace_id, p_tool.plan_capability) then return 'plan_not_entitled'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_run.workspace_id and m.user_id = p_actor and m.status = 'active') then return 'not_a_member'; end if;
  if pol.allowed_tools is not null and not (p_tool.id = any(pol.allowed_tools)) then return 'policy_blocks_tool'; end if;
  if p_tool.risk >= 3 then
    if p_approval is not null then
      select * into ap from public.agent_approvals where id = p_approval;
      if not found or ap.run_id is distinct from p_run.id or ap.tool_id is distinct from p_tool.id then return 'approval_mismatch'; end if;
      if ap.status <> 'approved' then return 'approval_not_approved'; end if;
      if ap.decided_by is distinct from p_actor then return 'approval_actor_mismatch'; end if;   -- executes as the approver
    elsif coalesce(p_policy_auto, false) then
      -- Policy auto-execution must be configured explicitly: operational R3 tools in auto_tools, or an autopilot rule for R3/R4.
      if not ((p_tool.risk = 3 and pol.mode in ('operational','policy_autopilot') and p_tool.id = any(coalesce(pol.auto_tools, '{}')))
              or (pol.mode = 'policy_autopilot' and exists (select 1 from jsonb_array_elements(coalesce(pol.autopilot_rules, '[]')) r where r->>'tool' = p_tool.id))) then
        return 'approval_required';
      end if;
    else
      return 'approval_required';
    end if;
  end if;
  return null;
end $$;

-- ── 6. Governed execution ──
create or replace function public.agent_execute_tool(p_run uuid, p_step uuid, p_actor uuid, p_tool text, p_args jsonb, p_idempotency text, p_approval uuid default null, p_policy_auto boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs; t public.agent_tools; prev public.agent_tool_calls; refusal text; cid uuid; out jsonb; err text; t0 timestamptz := clock_timestamp();
  h text := md5(coalesce(p_args, '{}'::jsonb)::text);
begin
  if length(coalesce(p_idempotency, '')) < 8 then raise exception 'idempotency_key_required' using errcode = '22023'; end if;
  -- Idempotent replay: a retried step returns the recorded outcome and never acts twice.
  select * into prev from public.agent_tool_calls where idempotency_key = p_idempotency;
  if found then
    if prev.args_hash <> h or prev.tool_id <> p_tool then raise exception 'idempotency_key_reused' using errcode = '22023'; end if;
    if prev.status = 'running' then raise exception 'call_in_progress' using errcode = '55P03'; end if;
    return jsonb_build_object('ok', prev.status = 'succeeded', 'replayed', true, 'status', prev.status, 'output', prev.output, 'error', coalesce(prev.error, prev.refusal), 'call_id', prev.id);
  end if;
  select * into r from public.agent_runs where id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  select * into t from public.agent_tools where id = p_tool;
  if not found then raise exception 'unknown_tool' using errcode = '22023'; end if;
  if r.status in ('cancelled','completed','failed','paused') then refusal := 'run_' || r.status; end if;
  if refusal is null then refusal := public.agent_governance_refusal(r, p_actor, t, p_approval, p_policy_auto); end if;
  if refusal is null and not public.hit_rate_limit('agent:tool:' || r.workspace_id || ':' || t.id, t.rate_per_minute, 60) then refusal := 'rate_limited'; end if;
  if refusal is not null then
    insert into public.agent_tool_calls(run_id, step_id, workspace_id, actor_id, surface, tool_id, tool_version, risk, idempotency_key, approval_id, decision, status, refusal, args_hash, finished_at, duration_ms)
      values (r.id, p_step, r.workspace_id, p_actor, coalesce(r.surface, 'unknown'), t.id, t.version, t.risk, p_idempotency, p_approval, 'refused', 'refused', refusal, h, now(), 0) returning id into cid;
    insert into public.audit_events(actor_id, actor_type, workspace_id, agent_run_id, event, metadata)
      values (p_actor, 'agent', r.workspace_id, r.id, 'agent.tool_refused', jsonb_build_object('tool', t.id, 'risk', t.risk, 'reason', refusal, 'call_id', cid));
    return jsonb_build_object('ok', false, 'refused', true, 'error', refusal, 'call_id', cid);
  end if;
  insert into public.agent_tool_calls(run_id, step_id, workspace_id, actor_id, surface, tool_id, tool_version, risk, idempotency_key, approval_id, decision, status, args_hash)
    values (r.id, p_step, r.workspace_id, p_actor, r.surface, t.id, t.version, t.risk, p_idempotency, p_approval,
      case when p_approval is not null then 'approved' when t.risk >= 3 then 'policy_auto' else 'auto' end, 'running', h) returning id into cid;
  begin
    -- The run's own workspace, never one taken from the arguments; agent_invoke re-checks membership + the tool's permission
    -- and runs every domain function as this human (auth.uid() = p_actor), so a tool can never widen the human's scope.
    out := public.agent_invoke(p_actor, r.workspace_id, t.id, coalesce(p_args, '{}'::jsonb));
  exception when others then err := left(sqlerrm, 500);   -- the failed tool's side effects roll back to this savepoint
  end;
  update public.agent_tool_calls set status = case when err is null then 'succeeded' else 'failed' end, output = case when err is null then out end, error = err,
    finished_at = clock_timestamp(), duration_ms = greatest(0, (extract(epoch from clock_timestamp() - t0) * 1000)::int) where id = cid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, agent_run_id, event, metadata)
    values (p_actor, 'agent', r.workspace_id, r.id, case when err is null then 'agent.tool_called' else 'agent.tool_failed' end,
      jsonb_build_object('tool', t.id, 'risk', t.risk, 'call_id', cid, 'step_id', p_step, 'approval_id', p_approval));
  return jsonb_build_object('ok', err is null, 'replayed', false, 'output', out, 'error', err, 'call_id', cid);
end $$;

-- ── 7. New-run guard: customers never; kill switches; hourly rate; refuse-before-spend ──
create or replace function public.agent_runs_governance() returns trigger language plpgsql security definer set search_path = '' as $$
declare pol public.agent_policies; s jsonb; n int;
begin
  if new.surface = 'customer' then raise exception 'agent_not_available_for_customers' using errcode = '42501'; end if;
  if new.status not in ('queued','running') then return new; end if;   -- ask-mode records and imports are written after the fact
  if (select kill_switch from public.agent_runtime_controls where id = 1) then raise exception 'agent_disabled' using errcode = '42501'; end if;
  if new.workspace_id is null then return new; end if;
  select * into pol from public.agent_policies where workspace_id = new.workspace_id;
  if coalesce(pol.kill_switch, false) then raise exception 'agent_paused_for_workspace' using errcode = '42501'; end if;
  select count(*) into n from public.agent_runs where workspace_id = new.workspace_id and created_at > now() - interval '1 hour' and mode <> 'ask';
  if n >= coalesce(pol.max_runs_per_hour, 30) then raise exception 'agent_run_rate_limited' using errcode = '54000'; end if;
  s := public.ai_credit_status(new.workspace_id);
  if s is not null and coalesce((s->>'hard_cap')::boolean, false) and coalesce((s->>'available')::numeric, 0) < 1 then
    raise exception 'ai_hard_cap' using errcode = 'P0001', hint = 'No Gala Agent credits left this month: buy credits or enable approved overage.';
  end if;
  return new;
end $$;
drop trigger if exists agent_runs_governance on public.agent_runs;
create trigger agent_runs_governance before insert on public.agent_runs for each row execute function public.agent_runs_governance();

-- ── 8. Commands ──
create or replace function public.admin_set_agent_kill_switch(p_on boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('agent_ops', p_reason);
  update public.agent_runtime_controls set kill_switch = coalesce(p_on, false), reason = left(p_reason, 300), set_by = auth.uid(), set_at = now() where id = 1;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'agent.kill_switch_changed', jsonb_build_object('on', coalesce(p_on, false), 'scope', 'platform', 'reason', left(p_reason, 300)));
end $$;

create or replace function public.set_agent_kill_switch(p_workspace uuid, p_on boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(p_workspace);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  insert into public.agent_policies(workspace_id, kill_switch, updated_by, updated_at) values (p_workspace, coalesce(p_on, false), auth.uid(), now())
    on conflict (workspace_id) do update set kill_switch = excluded.kill_switch, updated_by = excluded.updated_by, updated_at = now();
  if coalesce(p_on, false) then   -- stop in-flight work immediately; nothing is deleted
    update public.agent_runs set status = 'paused', waiting_reason = 'Paused: Gala Agent switched off for this workspace', lease_until = null, updated_at = now()
      where workspace_id = p_workspace and status in ('queued','planning','running','retrying','scheduled','scheduled_wait','waiting_external');
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'agent.kill_switch_changed', jsonb_build_object('on', coalesce(p_on, false), 'scope', 'workspace', 'reason', left(p_reason, 300)));
end $$;

-- Approval decision: + R4 above the booking authority needs the owner; R4 needs a fresh step-up; expiry re-checked.
create or replace function public.decide_agent_approval(p_approval uuid, p_approve boolean, p_edited jsonb default null)
returns public.agent_approvals language plpgsql security definer set search_path = '' as $$
declare a public.agent_approvals; pol public.agent_policies;
begin
  select * into a from public.agent_approvals where id = p_approval for update;
  if not found or not public.has_workspace_role(a.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if a.status <> 'pending' then raise exception 'already_decided' using errcode = '22023'; end if;
  if a.expires_at is not null and a.expires_at < now() then update public.agent_approvals set status = 'expired' where id = a.id; raise exception 'expired' using errcode = '22023'; end if;
  if p_approve and coalesce(a.risk, 0) >= 4 then
    perform public.require_step_up(a.workspace_id);
    select * into pol from public.agent_policies where workspace_id = a.workspace_id;
    if coalesce(pol.booking_authority_minor, 0) > 0 and round(coalesce(a.amount, 0) * 100) > pol.booking_authority_minor
       and not public.has_workspace_role(a.workspace_id, array['owner']) then
      raise exception 'owner_approval_required' using errcode = '42501';
    end if;
  end if;
  update public.agent_approvals set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
    edited_payload = case when p_approve then p_edited end where id = a.id returning * into a;
  insert into public.audit_events(actor_id, actor_type, workspace_id, agent_run_id, event, metadata)
    values (auth.uid(), 'user', a.workspace_id, a.run_id, case when p_approve then 'agent.approval_approved' else 'agent.approval_rejected' end,
      jsonb_build_object('approval_id', a.id, 'tool', a.tool_id, 'amount', a.amount, 'edited', p_edited is not null));
  return a;
end $$;

-- Admin-path run control needs MFA like every admin mutation (owners / managers / the requester are unaffected).
create or replace function public.agent_control_run(p_run uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs; as_admin boolean := false;
begin
  select * into r from public.agent_runs where id = p_run for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ((r.workspace_id is not null and public.has_workspace_role(r.workspace_id, array['owner','manager'])) or r.user_id = auth.uid()) then
    if r.surface = 'admin' and public.has_admin_permission('agent_ops') then as_admin := true;
    else raise exception 'not_authorized' using errcode = '42501'; end if;
  end if;
  if as_admin then perform public.admin_mfa_required(); end if;
  if p_action = 'pause' and r.status in ('queued','planning','running','waiting_external','scheduled','scheduled_wait','retrying','awaiting_plan_confirmation') then
    update public.agent_runs set status = 'paused', lease_until = null, updated_at = now() where id = r.id;
  elsif p_action = 'resume' and r.status = 'paused' then
    if (select kill_switch from public.agent_runtime_controls where id = 1) then raise exception 'agent_disabled' using errcode = '42501'; end if;
    if exists (select 1 from public.agent_policies p where p.workspace_id = r.workspace_id and p.kill_switch) then raise exception 'agent_paused_for_workspace' using errcode = '42501'; end if;
    update public.agent_runs set status = 'queued', updated_at = now() where id = r.id;
  elsif p_action = 'cancel' and r.status not in ('completed','failed','cancelled') then
    update public.agent_runs set status = 'cancelled', finished_at = now(), lease_until = null, updated_at = now() where id = r.id;
    update public.agent_approvals set status = 'expired' where run_id = r.id and status = 'pending';
  else raise exception 'invalid_run_action' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, agent_run_id, event, metadata)
    values (auth.uid(), case when as_admin then 'admin' else 'user' end, r.workspace_id, r.id, 'agent.' || p_action, jsonb_build_object('run_id', r.id));
end $$;

-- start_agent_run: admin path needs MFA; customers refused explicitly (the insert guard enforces the rest).
create or replace function public.start_agent_run(p_ws uuid, p_surface text, p_goal text, p_tools text[], p_constraints jsonb, p_idempotency text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid; allowed text[];
begin
  if p_surface = 'provider' then
    perform public.require_provider_role(p_ws, array['owner','manager']);
    allowed := array['opportunities','availability','quotes','holds','bookings','spaces','services','packages','team','money','reliability'];
  elsif p_surface = 'admin' then
    perform public.admin_mfa_required();
    if not public.has_admin_permission('agent_ops') then raise exception 'not_authorized' using errcode = '42501'; end if;
    allowed := array['queues','connectors','trust','support','marketplace','reconciliation','analytics'];
    p_ws := null;
  elsif p_surface = 'customer' then raise exception 'agent_not_available_for_customers' using errcode = '42501';
  else raise exception 'unsupported_surface' using errcode = '22023'; end if;
  if length(trim(coalesce(p_goal, ''))) < 3 then raise exception 'goal_required' using errcode = '22023'; end if;
  if exists(select 1 from unnest(coalesce(p_tools, '{}')) t where not (t = any(allowed))) then raise exception 'tool_not_permitted' using errcode = '42501'; end if;
  select id into rid from public.agent_runs where idempotency_key = p_idempotency;
  if found then return rid; end if;
  insert into public.agent_runs(workspace_id, user_id, surface, goal, scope, status, plan, idempotency_key, waiting_reason)
    values (p_ws, auth.uid(), p_surface, left(trim(p_goal), 2000), coalesce(p_tools, allowed), 'queued', '[]', p_idempotency, coalesce(p_constraints->>'note', ''))
    returning id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'agent.started', jsonb_build_object('run_id', rid, 'surface', p_surface));
  return rid;
end $$;

-- Approvals expire in the database even when the worker is not running (the worker then skips the step and resumes the run).
create or replace function public.job_agent_approval_expiry(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with x as (update public.agent_approvals set status = 'expired' where status = 'pending' and expires_at < now() returning id, workspace_id, run_id, tool_id)
  insert into public.audit_events(actor_type, workspace_id, agent_run_id, event, metadata)
    select 'system', x.workspace_id, x.run_id, 'agent.approval_expired', jsonb_build_object('approval_id', x.id, 'tool', x.tool_id) from x;
  get diagnostics n = row_count;
  return jsonb_build_object('expired', n);
end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('agent.approval_expiry', 'db', 'public.job_agent_approval_expiry', 3, 'Q41: every 15 min; expire pending Gala Agent approvals past their expiry')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
select cron.unschedule('agent-approval-expiry') where exists (select 1 from cron.job where jobname = 'agent-approval-expiry');
select cron.schedule('agent-approval-expiry', '*/15 * * * *',
  $$select public.enqueue_job(p_kind => 'agent.approval_expiry', p_payload => '{}'::jsonb, p_dedupe_key => 'agent.approval_expiry:' || to_char(date_trunc('minute', now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI'))$$);

-- Per-run cost read model (credits from metered usage at the price book in force; no model calls).
create or replace function public.agent_run_cost(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.agent_runs;
begin
  select * into r from public.agent_runs where id = p_run;
  if not found or not (public.can_see_agent_run(p_run) or public.has_admin_permission('agent_ops')) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select jsonb_build_object('run_id', p_run, 'calls', count(*), 'credits', coalesce(sum(u.credits), 0), 'input_tokens', coalesce(sum(u.input_tokens), 0),
    'output_tokens', coalesce(sum(u.output_tokens), 0), 'by_purpose', coalesce(jsonb_object_agg(u.purpose, u.credits) filter (where u.purpose is not null), '{}'),
    'tool_calls', (select count(*) from public.agent_tool_calls c where c.run_id = p_run), 'refused_calls', (select count(*) from public.agent_tool_calls c where c.run_id = p_run and c.status = 'refused'))
    from public.ai_usage_events u where u.run_id = p_run);
end $$;

-- ── 9. Domain events ──
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('agent.tool_called', 1, 'agent_run', 'A governed Gala Agent tool call succeeded (payload: tool, risk, call_id, step_id, approval_id).', null),
  ('agent.tool_refused', 1, 'agent_run', 'The governance layer refused a Gala Agent tool call (payload: tool, risk, reason, call_id).', null),
  ('agent.tool_failed', 1, 'agent_run', 'A Gala Agent tool call failed and its side effects were rolled back (payload: tool, risk, call_id).', null),
  ('agent.approval_expired', 1, 'agent_approval', 'A pending Gala Agent approval expired (payload: approval_id, tool).', null),
  ('agent.kill_switch_changed', 1, 'agent_runtime', 'Gala Agent was switched off or on for the platform or a workspace (payload: on, scope, reason).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate, active = true, updated_at = now();

-- ── 10. Grants ──
revoke all on function public.agent_tool_calls_guard(), public.agent_governance_refusal(public.agent_runs, uuid, public.agent_tools, uuid, boolean),
  public.agent_execute_tool(uuid, uuid, uuid, text, jsonb, text, uuid, boolean), public.agent_runs_governance(), public.job_agent_approval_expiry(public.job_queue)
  from public, anon, authenticated;
grant execute on function public.agent_execute_tool(uuid, uuid, uuid, text, jsonb, text, uuid, boolean), public.job_agent_approval_expiry(public.job_queue),
  public.agent_governance_refusal(public.agent_runs, uuid, public.agent_tools, uuid, boolean) to service_role;
revoke all on function public.admin_set_agent_kill_switch(boolean, text), public.set_agent_kill_switch(uuid, boolean, text), public.decide_agent_approval(uuid, boolean, jsonb),
  public.agent_control_run(uuid, text), public.start_agent_run(uuid, text, text, text[], jsonb, text), public.agent_run_cost(uuid) from public, anon;
grant execute on function public.admin_set_agent_kill_switch(boolean, text), public.set_agent_kill_switch(uuid, boolean, text), public.decide_agent_approval(uuid, boolean, jsonb),
  public.agent_control_run(uuid, text), public.start_agent_run(uuid, text, text, text[], jsonb, text), public.agent_run_cost(uuid) to authenticated;
