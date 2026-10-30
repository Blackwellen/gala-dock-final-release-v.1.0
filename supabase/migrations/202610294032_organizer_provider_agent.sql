-- Q42 Organizer Agent + Q43 Provider Agent (lane D, 2026-10-29). Domains 1 (organizer/provider tools) and 2 (skills), plus
-- memory (9), model routing (11) and mission waits, on top of Q41 governance (4029). Additive and backward-compatible:
--   * agent_skills: typed skill registry (bindings, mission template, tier, plan gate), seeded from src/lib/agent/skills.ts by
--     scripts/gen-agent-tools.mjs; never customer (CHECK); a binding must be a live tool exposed to the skill's surface.
--   * agent_memories: data-minimised working preferences/facts (workspace or own-user scope), retention (expires_at, daily job),
--     user-visible list / forget / reset RPCs, audited. Refuses contact, payment, health/dietary and secret-looking values.
--   * Mission waits: agent_waits gains aggregate refs; agent_mission_wait() parks a run (no tokens) until a build item changes
--     status (provider response, hold, quote) or a domain event arrives, then wakes it (queued) — durable pause/resume.
--   * Plan entitlements: coordinator decision 2026-10-29 — Starter keeps R0–R2; agent.actions (R3/R4) is Pro and above.
--   * Governance: autopilot amount limits enforced in the DB; amounts above the booking/pricing authority need the owner's
--     approval and can't policy-auto-run; an approval only authorises the arguments it was granted for.
--   * agent_invoke dispatches the new Q42/Q43 tools through agent_invoke_d3 (then agent_invoke_ext, lane A's map/media tools).
--   * suggest_seating reads guest_care (legacy guests.dietary is scrubbed, 4021) — only for owners/managers who may see it.
-- Nothing here calls a model: AI stays Azure-only through src/lib/agent/llm.ts.

-- ── 1. Skill registry ──
create table if not exists public.agent_skills (
  id text primary key check (id ~ '^(org|pro)\.[a-z_]{2,60}$'),
  version integer not null default 1 check (version >= 1),
  title text not null check (length(title) between 2 and 140),
  description text not null default '' check (length(description) <= 600),
  surface text not null check (surface in ('organizer','provider')),
  level text not null check (level in ('basic','medium','advanced','enterprise')),
  category text not null check (category in ('organizer','provider','venue','supplier','ticket','finance','promotion','operations','emergency')),
  tools text[] not null default '{}',
  mission text[] not null default '{}',
  tier text not null default 'standard' check (tier in ('fast','standard','deep')),
  max_risk smallint not null default 0 check (max_risk between 0 and 4),
  plan_capability text,
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mission <@ tools),
  check ((max_risk >= 3) = (plan_capability is not null))
);
alter table public.agent_skills enable row level security;
revoke all on public.agent_skills from anon, authenticated;
grant select on public.agent_skills to authenticated;
drop policy if exists agent_skills_read on public.agent_skills;
create policy agent_skills_read on public.agent_skills for select to authenticated using (true);   -- catalogue metadata, no tenant data

create or replace function public.agent_skills_bindings_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare bad text;
begin
  select string_agg(b, ', ') into bad from unnest(new.tools) b
    where not exists (select 1 from public.agent_tools t where t.id = b and new.surface = any(t.exposure) and t.risk < 5);
  if bad is not null then raise exception 'skill_binding_invalid: %', bad using errcode = '22023'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists agent_skills_bindings_guard on public.agent_skills;
create trigger agent_skills_bindings_guard before insert or update on public.agent_skills for each row execute function public.agent_skills_bindings_guard();

-- Skills a workspace can use right now (plan-gated, active), for the planner and Settings → Agent.
create or replace function public.agent_available_skills(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare w public.workspaces;
begin
  select * into w from public.workspaces where id = p_workspace;
  if not found or not public.has_permission(p_workspace, 'agent.use') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'description', k.description, 'level', k.level, 'category', k.category, 'tier', k.tier,
      'max_risk', k.max_risk, 'available', k.plan_capability is null or public.has_capability(p_workspace, k.plan_capability),
      'locked_reason', case when k.plan_capability is not null and not public.has_capability(p_workspace, k.plan_capability) then 'plan' end) order by k.level, k.id)
    from public.agent_skills k where k.status = 'active' and k.surface = w.kind), '[]');
end $$;

-- ── 2. Memory ──
create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null default 'workspace' check (scope in ('workspace','user')),
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null default 'preference' check (kind in ('preference','fact','summary')),
  key text not null check (key ~ '^[a-z][a-z0-9_.]{1,59}$'),
  value text not null check (length(value) between 1 and 500),
  source_run_id uuid references public.agent_runs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '180 days',
  check ((scope = 'user') = (user_id is not null))
);
create unique index if not exists agent_memories_key on public.agent_memories(workspace_id, scope, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
create index if not exists agent_memories_expiry on public.agent_memories(expires_at);
alter table public.agent_memories enable row level security;
revoke all on public.agent_memories from anon, authenticated;
grant select on public.agent_memories to authenticated;
drop policy if exists agent_memories_read on public.agent_memories;
create policy agent_memories_read on public.agent_memories for select to authenticated using (
  (scope = 'workspace' and public.has_permission(workspace_id, 'agent.use')) or (scope = 'user' and user_id = (select auth.uid())));

-- Same rules as memoryRefusal() in src/lib/agent/skills.ts.
create or replace function public.agent_memory_refusal(p_value text) returns text language sql immutable set search_path = '' as $$
  select case
    when length(trim(coalesce(p_value, ''))) = 0 then 'memory_empty'
    when p_value ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+' then 'memory_sensitive_data'
    when p_value ~ '([0-9][[:space:]().-]?){10,}' then 'memory_sensitive_data'   -- phone / card / account numbers (10+ digits)
    when p_value ~* '\m(allerg|dietary|vegan|halal|kosher|medical|diagnos|disabilit|pregnan|medication|health)' then 'memory_sensitive_data'
    when p_value ~* '\m(password|passcode|api[_ -]?key|secret|token|sort code|iban)\M' then 'memory_sensitive_data'
  end
$$;

create or replace function public.agent_memory_remember(p_workspace uuid, p_key text, p_value text, p_kind text default 'preference', p_scope text default 'workspace', p_run uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); why text; ret int; mid uuid;
begin
  if uid is null or not public.has_permission(p_workspace, 'agent.use') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if coalesce(p_scope, 'workspace') = 'workspace' and not public.has_workspace_role(p_workspace, array['owner','manager']) and p_run is null then
    raise exception 'not_authorized' using errcode = '42501';   -- members save workspace facts only through a run they started
  end if;
  why := public.agent_memory_refusal(p_value);
  if why is not null then raise exception '%', why using errcode = '22023'; end if;
  select greatest(1, least(coalesce(retention_days, 365), 365)) into ret from public.agent_policies where workspace_id = p_workspace;
  insert into public.agent_memories(workspace_id, scope, user_id, kind, key, value, source_run_id, created_by, expires_at)
    values (p_workspace, coalesce(p_scope, 'workspace'), case when p_scope = 'user' then uid end, coalesce(p_kind, 'preference'), lower(p_key), left(trim(p_value), 500), p_run, uid,
      now() + make_interval(days => least(coalesce(ret, 180), 180)))
  on conflict (workspace_id, scope, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
    do update set value = excluded.value, kind = excluded.kind, source_run_id = excluded.source_run_id, created_by = excluded.created_by, updated_at = now(), expires_at = excluded.expires_at
  returning id into mid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, agent_run_id, event, metadata)
    values (uid, case when p_run is null then 'user' else 'agent' end, p_workspace, p_run, 'agent.memory_saved', jsonb_build_object('memory_id', mid, 'key', lower(p_key), 'scope', coalesce(p_scope, 'workspace')));
  return jsonb_build_object('memory_id', mid, 'key', lower(p_key), 'scope', coalesce(p_scope, 'workspace'));
end $$;

create or replace function public.agent_memory_list(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or not public.has_permission(p_workspace, 'agent.use') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'scope', m.scope, 'kind', m.kind, 'key', m.key, 'value', m.value, 'updated_at', m.updated_at, 'expires_at', m.expires_at,
      'from_run', m.source_run_id is not null) order by m.updated_at desc)
    from public.agent_memories m where m.workspace_id = p_workspace and m.expires_at > now() and (m.scope = 'workspace' or m.user_id = uid)), '[]');
end $$;

-- Forget one item (own user memory, or workspace memory as owner/manager) or reset a whole scope. Hard delete: memory is not history.
create or replace function public.agent_memory_forget(p_workspace uuid, p_memory uuid default null, p_scope text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); n int; mgr boolean;
begin
  if uid is null or not public.has_permission(p_workspace, 'agent.use') then raise exception 'not_authorized' using errcode = '42501'; end if;
  mgr := public.has_workspace_role(p_workspace, array['owner','manager']);
  if p_memory is null and p_scope not in ('workspace','user','all') then raise exception 'scope_required' using errcode = '22023'; end if;
  if p_memory is null and p_scope in ('workspace','all') and not mgr then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from public.agent_memories m where m.workspace_id = p_workspace
    and (p_memory is null or m.id = p_memory)
    and (case when p_memory is not null then (m.scope = 'user' and m.user_id = uid) or (m.scope = 'workspace' and mgr)
              when p_scope = 'user' then m.scope = 'user' and m.user_id = uid
              when p_scope = 'workspace' then m.scope = 'workspace'
              else m.scope = 'workspace' or m.user_id = uid end);
  get diagnostics n = row_count;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', p_workspace, 'agent.memory_reset', jsonb_build_object('memory_id', p_memory, 'scope', p_scope, 'deleted', n));
  return n;
end $$;

create or replace function public.job_agent_memory_retention(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.agent_memories where expires_at <= now();
  get diagnostics n = row_count;
  return jsonb_build_object('expired', n);
end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('agent.memory_retention', 'db', 'public.job_agent_memory_retention', 3, 'Q42/Q43: daily; delete Gala Agent memories past their retention')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
select cron.unschedule('agent-memory-retention') where exists (select 1 from cron.job where jobname = 'agent-memory-retention');
select cron.schedule('agent-memory-retention', '25 3 * * *',
  $$select public.enqueue_job(p_kind => 'agent.memory_retention', p_payload => '{}'::jsonb, p_dedupe_key => 'agent.memory_retention:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);

-- ── 3. Mission waits (durable pause / resume without model tokens) ──
alter table public.agent_waits
  add column if not exists step_id uuid references public.agent_run_steps(id) on delete cascade,
  add column if not exists aggregate_type text,
  add column if not exists aggregate_id text,
  add column if not exists event_type text,
  add column if not exists from_status text,
  add column if not exists outcome text check (outcome is null or outcome in ('responded','event','expired','cancelled')),
  add column if not exists outcome_detail jsonb;
create index if not exists agent_waits_open_ref on public.agent_waits(aggregate_type, aggregate_id) where satisfied_at is null and aggregate_id is not null;

-- Parks the run on a build item (provider response / hold / quote) until its status changes or p_hours pass. Idempotent per step:
-- returns {waiting} while open, then {satisfied, outcome, status} once — the runtime marks the step done with that outcome.
-- Never collapses outcomes: responded (with the new status), expired (no response in time) and cancelled stay distinct.
create or replace function public.agent_mission_wait(p_run uuid, p_step uuid, p_item uuid, p_hours integer default 72) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs; w public.agent_waits; b public.build_items;
begin
  select * into r from public.agent_runs where id = p_run for update;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  select * into b from public.build_items where id = p_item;
  if not found or not exists (select 1 from public.events e where e.id = b.event_id and e.workspace_id = r.workspace_id)
     and not exists (select 1 from public.listings l where l.id = b.listing_id and l.workspace_id = r.workspace_id) then
    raise exception 'not_found' using errcode = 'P0002';   -- only items of the run's own workspace (as organiser or provider)
  end if;
  select * into w from public.agent_waits where run_id = p_run and step_id is not distinct from p_step and kind = 'external' order by created_at desc limit 1;
  if found and w.satisfied_at is not null then
    return jsonb_build_object('satisfied', true, 'outcome', w.outcome, 'detail', w.outcome_detail, 'wait_id', w.id);
  end if;
  if found and w.until_at is not null and w.until_at <= now() then
    update public.agent_waits set satisfied_at = now(), outcome = 'expired', outcome_detail = jsonb_build_object('status', b.status) where id = w.id;
    insert into public.audit_events(actor_type, workspace_id, agent_run_id, event, metadata)
      values ('system', r.workspace_id, r.id, 'agent.mission_resumed', jsonb_build_object('wait_id', w.id, 'outcome', 'expired', 'item', p_item));
    return jsonb_build_object('satisfied', true, 'outcome', 'expired', 'detail', jsonb_build_object('status', b.status), 'wait_id', w.id);
  end if;
  if not found then
    insert into public.agent_waits(run_id, step_id, kind, until_at, ref_id, aggregate_type, aggregate_id, from_status)
      values (p_run, p_step, 'external', now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 72), 336))), p_item, 'build_item', p_item::text, b.status) returning * into w;
    insert into public.audit_events(actor_type, workspace_id, agent_run_id, event, metadata)
      values ('agent', r.workspace_id, r.id, 'agent.mission_waiting', jsonb_build_object('wait_id', w.id, 'item', p_item, 'from_status', b.status, 'until', w.until_at));
  end if;
  if r.status not in ('waiting_external','cancelled','completed','failed','paused') then
    update public.agent_runs set status = 'waiting_external', waiting_reason = 'Waiting for a response on a request', next_wake_at = w.until_at, lease_until = null, updated_at = now() where id = r.id;
  end if;
  return jsonb_build_object('waiting', true, 'until', w.until_at, 'wait_id', w.id, 'from_status', w.from_status);
end $$;

-- Wakes parked runs when the record changes (provider responded, hold placed, quote sent, cancelled …).
create or replace function public.agent_waits_wake_build_item() returns trigger language plpgsql security definer set search_path = '' as $$
declare x record;
begin
  for x in update public.agent_waits w set satisfied_at = now(), outcome = case when new.status in ('cancelled','withdrawn') then 'cancelled' else 'responded' end,
        outcome_detail = jsonb_build_object('status', new.status, 'from', old.status)
      where w.aggregate_type = 'build_item' and w.aggregate_id = new.id::text and w.satisfied_at is null returning w.id, w.run_id
  loop
    update public.agent_runs set status = 'queued', waiting_reason = '', next_wake_at = null, updated_at = now() where id = x.run_id and status = 'waiting_external';
    insert into public.audit_events(actor_type, workspace_id, agent_run_id, event, metadata)
      select 'system', r.workspace_id, r.id, 'agent.mission_resumed', jsonb_build_object('wait_id', x.id, 'outcome', 'responded', 'status', new.status, 'item', new.id)
      from public.agent_runs r where r.id = x.run_id;
  end loop;
  return null;
end $$;
drop trigger if exists agent_waits_wake_build_item on public.build_items;
create trigger agent_waits_wake_build_item after update of status on public.build_items for each row
  when (old.status is distinct from new.status) execute function public.agent_waits_wake_build_item();

-- ── 4. Plan entitlements: Starter = R0–R2 (coordinator decision 2026-10-29, profitability); Pro+ keep R3/R4 actions ──
update public.plan_entitlements set value = 'false'::jsonb, updated_at = now()
  where capability = 'agent.actions' and plan = 'starter' and kind in ('organizer','provider') and value is distinct from 'false'::jsonb;

-- ── 5. Governance: amounts, authority and approved arguments ──
create or replace function public.agent_tool_amount_minor(p_tool text, p_args jsonb) returns bigint language sql immutable set search_path = '' as $$
  select case when p_tool in ('quote.send','quote.draft') and jsonb_typeof(p_args -> 'items') = 'array' then
    (select coalesce(round(sum(coalesce((x->>'qty')::numeric, 0) * coalesce((x->>'unit_price')::numeric, 0)) * 100), 0)::bigint from jsonb_array_elements(p_args -> 'items') x)
  else 0 end
$$;

create or replace function public.agent_governance_refusal(p_run public.agent_runs, p_actor uuid, p_tool public.agent_tools, p_approval uuid, p_policy_auto boolean, p_args jsonb)
returns text language plpgsql stable security definer set search_path = '' as $$
declare w public.workspaces; pol public.agent_policies; ap public.agent_approvals; disabled jsonb; amount bigint := public.agent_tool_amount_minor(p_tool.id, p_args);
begin
  if (select kill_switch from public.agent_runtime_controls where id = 1) then return 'platform_kill_switch'; end if;
  select value -> 'tools_disabled' into disabled from public.setting_at('agent', now());
  if disabled is not null and disabled ? p_tool.id then return 'tool_disabled'; end if;
  if p_run.surface = 'customer' or p_run.surface is null then return 'surface_not_allowed'; end if;
  if not (p_run.surface = any(p_tool.exposure)) then return 'tool_not_exposed'; end if;
  if p_tool.risk >= 5 then return 'risk_r5_never'; end if;
  if p_run.workspace_id is null then return 'workspace_required'; end if;
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
      -- An approval authorises exactly what was shown: every executed argument must be in the approved (or edited) payload.
      if p_args is not null and not (coalesce(ap.edited_payload, ap.payload, '{}'::jsonb) @> p_args) then return 'approval_args_mismatch'; end if;
      -- Above the configured booking / pricing authority only the owner can approve (decide_agent_approval checks the card's
      -- amount; this re-checks the amount computed from the arguments actually executed).
      if coalesce(pol.booking_authority_minor, 0) > 0 and amount > pol.booking_authority_minor
         and not exists (select 1 from public.workspaces o where o.id = p_run.workspace_id and o.owner_id = p_actor)
         and not exists (select 1 from public.workspace_members m where m.workspace_id = p_run.workspace_id and m.user_id = p_actor and m.role = 'owner' and m.status = 'active') then
        return 'exceeds_booking_authority';
      end if;
    elsif coalesce(p_policy_auto, false) then
      if coalesce(pol.booking_authority_minor, 0) > 0 and amount > pol.booking_authority_minor then return 'exceeds_booking_authority'; end if;
      if not ((p_tool.risk = 3 and pol.mode in ('operational','policy_autopilot') and p_tool.id = any(coalesce(pol.auto_tools, '{}')))
              or (pol.mode = 'policy_autopilot' and exists (select 1 from jsonb_array_elements(coalesce(pol.autopilot_rules, '[]')) r
                    where r->>'tool' = p_tool.id and (r->>'max_amount_minor' is null or amount <= (r->>'max_amount_minor')::bigint)))) then
        return 'approval_required';
      end if;
    else
      return 'approval_required';
    end if;
  end if;
  return null;
end $$;
-- The 5-argument form (4029) stays callable and now applies the same rules without arguments.
create or replace function public.agent_governance_refusal(p_run public.agent_runs, p_actor uuid, p_tool public.agent_tools, p_approval uuid, p_policy_auto boolean)
returns text language sql stable security definer set search_path = '' as $$
  select public.agent_governance_refusal(p_run, p_actor, p_tool, p_approval, p_policy_auto, null::jsonb)
$$;

create or replace function public.agent_execute_tool(p_run uuid, p_step uuid, p_actor uuid, p_tool text, p_args jsonb, p_idempotency text, p_approval uuid default null, p_policy_auto boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs; t public.agent_tools; prev public.agent_tool_calls; refusal text; cid uuid; out jsonb; err text; t0 timestamptz := clock_timestamp();
  h text := md5(coalesce(p_args, '{}'::jsonb)::text);
begin
  if length(coalesce(p_idempotency, '')) < 8 then raise exception 'idempotency_key_required' using errcode = '22023'; end if;
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
  if refusal is null then refusal := public.agent_governance_refusal(r, p_actor, t, p_approval, p_policy_auto, coalesce(p_args, '{}'::jsonb)); end if;
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
    out := public.agent_invoke(p_actor, r.workspace_id, t.id, coalesce(p_args, '{}'::jsonb) || case when t.id = 'memory.remember' then jsonb_build_object('_run', r.id) else '{}'::jsonb end);
  exception when others then err := left(sqlerrm, 500);
  end;
  update public.agent_tool_calls set status = case when err is null then 'succeeded' else 'failed' end, output = case when err is null then out end, error = err,
    finished_at = clock_timestamp(), duration_ms = greatest(0, (extract(epoch from clock_timestamp() - t0) * 1000)::int) where id = cid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, agent_run_id, event, metadata)
    values (p_actor, 'agent', r.workspace_id, r.id, case when err is null then 'agent.tool_called' else 'agent.tool_failed' end,
      jsonb_build_object('tool', t.id, 'risk', t.risk, 'call_id', cid, 'step_id', p_step, 'approval_id', p_approval));
  return jsonb_build_object('ok', err is null, 'replayed', false, 'output', out, 'error', err, 'call_id', cid);
end $$;

-- ── 6. Q42/Q43 tool dispatch (runs as the human set by agent_invoke; the run's workspace only) ──
create or replace function public.agent_invoke_d3(p_actor uuid, p_workspace uuid, p_tool text, p_args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb; v uuid; ev uuid := nullif(p_args->>'event_id', '')::uuid; days int := coalesce((p_args->>'within_days')::int, 30); x jsonb;
begin
  -- Event-scoped tools: the event must belong to the workspace the agent is acting in.
  if p_tool in ('event.conflicts','event.ops_readiness','compliance.overview','hospitality.summary','logistics.overview','partners.overview','virtual.attendance')
     and not exists (select 1 from public.events e where e.id = ev and e.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_tool in ('listing.readiness','listing.availability') and not exists (select 1 from public.listings l where l.id = (p_args->>'listing_id')::uuid and l.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_tool in ('crew.assign','equipment.allocate') and not exists (select 1 from public.provider_jobs j where j.id = (p_args->>'job_id')::uuid and j.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_tool = 'stock.report' and ev is not null and not exists (select 1 from public.events e where e.id = ev and e.workspace_id = p_workspace) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  case p_tool
  -- Organizer reads
  when 'calendar.upcoming' then
    out := jsonb_build_object(
      'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'status', e.status, 'venue', e.venue_name, 'link', '/organizer/events/' || e.id) order by e.starts_at)
        from public.events e where e.workspace_id = p_workspace and e.status not in ('cancelled') and e.starts_at between now() - interval '1 day' and now() + make_interval(days => days)), '[]'),
      'conflicts', coalesce((select jsonb_agg(to_jsonb(c)) from public.operational_conflicts(p_workspace, now(), now() + make_interval(days => days)) c), '[]'));
  when 'event.conflicts' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into out from public.event_conflicts(ev) c;
  when 'event.ops_readiness' then out := public.event_ops_readiness(ev);
  when 'compliance.overview' then out := public.event_compliance_overview(ev);
  when 'hospitality.summary' then out := public.hospitality_event_summary(ev);
  when 'logistics.overview' then out := public.event_logistics_overview(ev);
  when 'partners.overview' then out := public.event_parties_overview(ev);
  when 'virtual.attendance' then out := public.virtual_attendance_summary(ev);
  when 'campaigns.calendar' then out := public.promotion_calendar(p_workspace, now(), now() + make_interval(days => days));
  when 'campaigns.report' then
    if not exists (select 1 from public.promotion_campaigns c where c.id = (p_args->>'campaign_id')::uuid and c.workspace_id = p_workspace) then raise exception 'not_found' using errcode = 'P0002'; end if;
    out := public.campaign_report((p_args->>'campaign_id')::uuid);
  when 'sales.client' then
    if not exists (select 1 from public.clients c where c.id = (p_args->>'client_id')::uuid and c.workspace_id = p_workspace) then raise exception 'not_found' using errcode = 'P0002'; end if;
    out := public.client_overview((p_args->>'client_id')::uuid);
  when 'comms.inbox' then
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'subject', c.subject, 'counterpart', c.counterpart, 'unread', c.unread, 'last_message_at', c.last_message_at, 'link', '/messages/' || c.id)), '[]') into out
      from public.my_conversations(p_workspace, least(coalesce((p_args->>'limit')::int, 20), 50)) c;
  -- Provider reads
  when 'bookings.upcoming' then
    select coalesce(jsonb_agg(jsonb_build_object('job_id', j.id, 'reference', j.reference, 'event', j.event_name, 'client', j.client_org, 'starts_at', j.starts_at, 'ends_at', j.ends_at, 'space_id', j.space_id,
        'guests', j.guests, 'status', j.status, 'payment_status', j.payment_status, 'next_action', j.next_action, 'next_action_due', j.next_action_due, 'link', '/provider/bookings/' || j.id) order by j.starts_at), '[]') into out
      from public.provider_jobs j where j.workspace_id = p_workspace and j.status in ('held','confirmed','active') and j.starts_at between now() - interval '1 day' and now() + make_interval(days => days);
  when 'opportunities.sla' then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', b.id, 'event', e.name, 'status', b.status, 'response_deadline', b.response_deadline,
        'hours_left', case when b.response_deadline is not null then round((extract(epoch from b.response_deadline - now()) / 3600)::numeric, 1) end,
        'overdue', b.response_deadline is not null and b.response_deadline < now(), 'starts_at', e.starts_at, 'link', '/provider/opportunities/' || b.id) order by b.response_deadline nulls last), '[]') into out
      from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
      where l.workspace_id = p_workspace and b.status in ('sent','awaiting','awaiting_provider','clarification','conditional_hold_requested');
  when 'listing.readiness' then out := public.listing_readiness((p_args->>'listing_id')::uuid);
  when 'listing.availability' then
    out := jsonb_build_object('listing_id', p_args->>'listing_id', 'availability', public.listing_window_availability((p_args->>'listing_id')::uuid, (p_args->>'starts_at')::timestamptz,
      (p_args->>'ends_at')::timestamptz, nullif(p_args->>'guests', '')::int));
  when 'trust.summary' then out := public.trust_summary(p_workspace);
  when 'money.payout_ready' then
    select jsonb_build_object('payout_eligible', public.payout_eligible(p_workspace),
      'protected', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'protected_pending_delivery'), 0) / 100.0,
      'releasing', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'eligible_for_provider_transfer'), 0) / 100.0,
      'released', coalesce(sum(transferred_minor) filter (where status in ('transfer_created','paid_out')), 0) / 100.0) into out
      from public.payment_orders where payee_workspace_id = p_workspace;
  when 'stock.report' then out := public.stock_report(p_workspace, ev);   -- organizer stock (bar / consumables / merchandise)
  -- Provider R1/R2/R3
  when 'quote.draft' then
    v := public.provider_issue_quote((p_args->>'item_id')::uuid, p_args->'items', coalesce((p_args->>'tax_bps')::int, 0), coalesce((p_args->>'deposit_pct')::int, 30),
      coalesce((p_args->>'valid_days')::int, 14), '{}'::jsonb, coalesce(p_args->>'message', ''), false);
    out := jsonb_build_object('quote_id', v, 'status', 'draft', 'link', '/provider/opportunities/' || (p_args->>'item_id'));
  when 'crew.assign' then
    v := public.provider_assign_crew((p_args->>'job_id')::uuid, (p_args->>'crew_id')::uuid, coalesce(p_args->>'role', 'crew'));
    out := jsonb_build_object('assignment_id', v, 'link', '/provider/bookings/' || (p_args->>'job_id'));
  when 'equipment.allocate' then
    v := public.provider_allocate_equipment((p_args->>'job_id')::uuid, (p_args->>'equipment_id')::uuid, (p_args->>'quantity')::int);
    out := jsonb_build_object('allocation_id', v, 'link', '/provider/bookings/' || (p_args->>'job_id'));
  when 'availability.emergency_window' then
    v := public.provider_set_availability(p_workspace, 'emergency_window', (p_args->>'starts_at')::timestamptz, (p_args->>'ends_at')::timestamptz,
      nullif(p_args->>'listing_id', '')::uuid, nullif(p_args->>'space_id', '')::uuid, null, coalesce(p_args->>'note', ''));
    out := jsonb_build_object('block_id', v, 'kind', 'emergency_window');
  -- Memory (both surfaces)
  when 'memory.recall' then
    select coalesce(jsonb_agg(jsonb_build_object('key', m.key, 'value', m.value, 'kind', m.kind, 'scope', m.scope, 'updated_at', m.updated_at) order by m.updated_at desc), '[]') into out
      from (select * from public.agent_memories m where m.workspace_id = p_workspace and m.expires_at > now() and (m.scope = 'workspace' or m.user_id = p_actor)
              and (p_args->>'kind' is null or m.kind = p_args->>'kind') order by m.updated_at desc limit 40) m;
  when 'memory.remember' then
    out := public.agent_memory_remember(p_workspace, p_args->>'key', p_args->>'value', coalesce(p_args->>'kind', 'preference'), coalesce(p_args->>'scope', 'workspace'), nullif(p_args->>'_run', '')::uuid);
  when 'mission.wait_for' then raise exception 'runtime_control_tool' using errcode = '22023', hint = 'mission.wait_for is handled by the run engine (agent_mission_wait), not executed as a domain action.';
  else out := public.agent_invoke_ext(p_workspace, p_tool, p_args);   -- lane A media / map / planning tools
  end case;
  return out;
end $$;


-- ── 7. Existing functions re-pointed (live definitions, one change each) ──
CREATE OR REPLACE FUNCTION public.agent_invoke(p_actor uuid, p_workspace uuid, p_tool text, p_args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.agent_tools; out jsonb; v uuid; perm_ok boolean;
begin
  select * into t from public.agent_tools where id = p_tool;
  if not found then raise exception 'unknown_tool' using errcode = '22023'; end if;
  -- Become the human for this transaction: auth.uid() now returns p_actor in every domain function.
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = p_actor and m.status = 'active') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select public.has_permission(p_workspace, t.permission) into perm_ok;
  if not perm_ok then raise exception 'permission_denied:%', t.permission using errcode = '42501'; end if;

  case p_tool
  -- ── R0 reads (organizer)
  when 'events.list' then
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'status', e.status, 'guests', e.guest_count, 'venue', e.venue_name, 'link', '/organizer/events/' || e.id) order by e.starts_at nulls last), '[]') into out
      from public.events e where e.workspace_id = p_workspace and e.status <> 'cancelled'
        and (p_args->>'within_days' is null or e.starts_at between now() and now() + make_interval(days => (p_args->>'within_days')::int)) limit 50;
  when 'event.readiness' then out := public.event_readiness((p_args->>'event_id')::uuid);
  when 'event.feasibility' then out := public.event_feasibility((p_args->>'event_id')::uuid);
  when 'event.budget' then out := public.event_build_budget((p_args->>'event_id')::uuid);
  when 'marketplace.open_requests' then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', b.id, 'title', b.title, 'event', e.name, 'status', b.status, 'response_deadline', b.response_deadline, 'link', '/organizer/marketplace/bookings/' || b.id) order by b.response_deadline nulls last), '[]') into out
      from public.build_items b join public.events e on e.id = b.event_id where e.workspace_id = p_workspace and b.status in ('sent','awaiting','awaiting_provider','quoted','available','held','conditional_hold_requested') limit 60;
  when 'marketplace.search' then
    select coalesce(jsonb_agg(jsonb_build_object('listing_id', l.id, 'workspace_id', l.workspace_id, 'name', l.name, 'category', l.category, 'city', l.city, 'price_from', l.price_from, 'rating', l.rating, 'capacity_max', l.capacity_max, 'response_hours', l.response_hours, 'emergency', l.emergency_supply)), '[]') into out
      from (select * from public.listings l where l.published and l.paused_at is null
        and (p_args->>'category' is null or l.category ilike '%' || (p_args->>'category') || '%' or l.kind = lower(p_args->>'category'))
        and (p_args->>'city' is null or l.city ilike '%' || (p_args->>'city') || '%')
        and (p_args->>'guests' is null or coalesce(l.capacity_max, 100000) >= (p_args->>'guests')::int)
        and (p_args->>'max_price' is null or coalesce(l.price_from, 0) <= (p_args->>'max_price')::numeric)
        order by l.rating desc nulls last limit 12) l;
  when 'team.conflicts' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into out from public.team_conflicts(p_workspace) c;
  when 'tickets.sales' then
    select coalesce(jsonb_agg(jsonb_build_object('tier', t2.name, 'sold', t2.sold, 'held', t2.held, 'quantity', t2.quantity, 'price', t2.price, 'status', t2.status, 'revenue', t2.sold * t2.price)), '[]') into out
      from public.ticket_tiers t2 join public.events e on e.id = t2.event_id where e.id = (p_args->>'event_id')::uuid and e.workspace_id = p_workspace;
  when 'money.payables' then
    select coalesce(jsonb_agg(jsonb_build_object('payee', p.payee, 'kind', p.kind, 'amount', p.amount, 'status', p.status, 'due_at', p.due_at, 'event', e.name) order by p.due_at), '[]') into out
      from public.payments p join public.events e on e.id = p.event_id where e.workspace_id = p_workspace and p.status in ('due','scheduled','overdue') limit 60;
  -- ── R2 internal writes
  when 'task.create' then
    if not public.can_edit_event((p_args->>'event_id')::uuid) then raise exception 'not_authorized' using errcode = '42501'; end if;
    insert into public.tasks(event_id, workspace_id, owner_id, title, detail, category, due_at, priority, status)
      values ((p_args->>'event_id')::uuid, p_workspace, p_actor, left(p_args->>'title', 200), left(coalesce(p_args->>'detail', ''), 2000), 'agent',
        nullif(p_args->>'due_at', '')::timestamptz, coalesce(p_args->>'priority', 'medium'), 'todo') returning id into v;
    out := jsonb_build_object('task_id', v, 'link', '/organizer/events/' || (p_args->>'event_id') || '?tab=plan&section=tasks');
  -- ── R3 external, non-binding
  when 'message.party' then
    v := public.start_conversation(coalesce(p_args->>'kind', 'direct'), coalesce(p_args->>'subject', ''), p_args->>'to_type', (p_args->>'to')::uuid, p_args->>'body', p_workspace,
      nullif(p_args->>'event_id', '')::uuid, null, nullif(p_args->>'item_id', '')::uuid);
    out := jsonb_build_object('conversation_id', v, 'link', '/messages/' || v);
  when 'marketplace.request_hold' then
    v := public.request_conditional_hold((p_args->>'item_id')::uuid, (p_args->>'hours')::int, nullif(p_args->>'depends_on', '')::uuid, coalesce(p_args->>'conditions', ''));
    out := jsonb_build_object('hold_id', v, 'link', '/organizer/marketplace/bookings/' || (p_args->>'item_id'));
  when 'marketplace.request_standby' then
    v := public.request_standby((p_args->>'item_id')::uuid, nullif(p_args->>'primary_id', '')::uuid, (p_args->>'window_start')::timestamptz, (p_args->>'window_end')::timestamptz, coalesce(p_args->>'note', ''));
    out := jsonb_build_object('standby_id', v, 'link', '/organizer/marketplace/bookings/' || (p_args->>'item_id'));
  when 'emergency.create' then
    v := public.create_emergency_request((p_args->>'event_id')::uuid, p_args - 'event_id');
    out := jsonb_build_object('request_id', v, 'link', '/organizer/marketplace/emergency/' || v);
  -- ── R4 commitments (only ever executed after human approval)
  when 'standby.activate' then perform public.activate_standby((p_args->>'standby_id')::uuid, p_args->>'reason'); out := jsonb_build_object('activated', true);
  when 'cancellation.request' then
    v := public.request_cancellation((p_args->>'item_id')::uuid, 'customer', coalesce(p_args->>'kind', 'full'), p_args->>'reason');
    out := jsonb_build_object('cancellation_id', v, 'link', '/organizer/marketplace/bookings/' || (p_args->>'item_id'));
  when 'tickets.publish_tier' then
    update public.ticket_tiers t3 set status = 'on_sale' from public.events e where t3.id = (p_args->>'tier_id')::uuid and e.id = t3.event_id and e.workspace_id = p_workspace and t3.status in ('draft','scheduled','paused')
      returning t3.id into v;
    if v is null then raise exception 'not_publishable' using errcode = '22023'; end if;
    out := jsonb_build_object('tier_id', v, 'status', 'on_sale');
  -- ── Provider reads
  when 'opportunities.list' then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', b.id, 'title', e.name, 'status', b.status, 'response_deadline', b.response_deadline, 'amount', b.amount, 'starts_at', e.starts_at, 'link', '/provider/opportunities/' || b.id) order by b.response_deadline nulls last), '[]') into out
      from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
      where l.workspace_id = p_workspace and b.status in ('sent','awaiting','awaiting_provider','clarification','conditional_hold_requested') limit 60;
  when 'calendar.conflicts' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into out from public.space_conflicts((p_args->>'space_id')::uuid, (p_args->>'starts_at')::timestamptz, (p_args->>'ends_at')::timestamptz) c;
  when 'money.provider_summary' then
    select jsonb_build_object('protected', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'protected_pending_delivery'), 0) / 100.0,
      'releasing', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'eligible_for_provider_transfer'), 0) / 100.0,
      'released', coalesce(sum(transferred_minor) filter (where status in ('transfer_created','paid_out')), 0) / 100.0) into out
      from public.payment_orders where payee_workspace_id = p_workspace;
  when 'reliability.get' then select to_jsonb(r) into out from public.reliability_metrics r where r.workspace_id = p_workspace;
  -- ── Provider R3/R4
  when 'opportunity.respond' then
    out := jsonb_build_object('status', public.provider_respond((p_args->>'item_id')::uuid, p_args->>'response', coalesce(p_args->>'note', '')));
  when 'venue.hold' then
    v := public.venue_place_hold((p_args->>'item_id')::uuid, (p_args->>'space_id')::uuid, (p_args->>'starts_at')::timestamptz, (p_args->>'ends_at')::timestamptz, (p_args->>'hours')::int, coalesce(p_args->>'blocking', 'soft'), coalesce(p_args->>'note', ''));
    out := jsonb_build_object('hold_id', v);
  when 'quote.send' then
    v := public.provider_issue_quote((p_args->>'item_id')::uuid, p_args->'items', coalesce((p_args->>'tax_bps')::int, 0), coalesce((p_args->>'deposit_pct')::int, 30),
      coalesce((p_args->>'valid_days')::int, 14), coalesce(p_args->'terms', '{}'), coalesce(p_args->>'message', ''), true);
    out := jsonb_build_object('quote_id', v, 'link', '/provider/opportunities/' || (p_args->>'item_id'));
  else out := public.agent_invoke_d3(p_actor, p_workspace, p_tool, p_args);   -- Q42/Q43 tools, then agent_invoke_ext (media, maps, planning); same transaction, same human
  end case;
  return coalesce(out, 'null'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.suggest_seating(p_event uuid, p_table_size integer DEFAULT 10, p_include_pending boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; size int := greatest(2, least(coalesce(p_table_size, 10), 30)); grp record; g record;
  tables jsonb := '[]'; free int[] := '{}'; i int; placed boolean; seats int; total int := 0; n int; care boolean := public.can_read_guest_care(p_event);
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_found' using errcode = 'P0002'; end if;
  for grp in
    -- Q42 (4032): dietary needs come from guest_care (legacy guests.dietary is scrubbed, 4021) and only for people who may read it.
    select coalesce(nullif(trim(gu.group_name), ''), 'guest:' || gu.id) k, nullif(trim(gu.group_name), '') label,
           sum(1 + case when gu.plus_one then 1 else 0 end)::int seats,
           jsonb_agg(jsonb_build_object('name', gu.name, 'plus_one', gu.plus_one, 'dietary', case when care then nullif(gc.dietary, '') end) order by gu.name) people
    from public.guests gu left join public.guest_care gc on gc.guest_id = gu.id
    where gu.event_id = p_event and (gu.status = 'confirmed' or (p_include_pending and gu.status in ('pending','invited')))
    group by 1, 2 order by 3 desc, 1
  loop
    total := total + grp.seats; placed := false;
    if grp.seats <= size then
      for i in 1 .. coalesce(array_length(free, 1), 0) loop
        if free[i] >= grp.seats then
          tables := jsonb_set(tables, array[(i - 1)::text, 'guests'], (tables->(i - 1)->'guests') || grp.people);
          if grp.label is not null then tables := jsonb_set(tables, array[(i - 1)::text, 'groups'], (tables->(i - 1)->'groups') || to_jsonb(grp.label)); end if;
          free[i] := free[i] - grp.seats; placed := true; exit;
        end if;
      end loop;
    end if;
    if not placed then
      -- New table(s); a large group fills whole tables, its remainder starts one more.
      seats := grp.seats; n := 0;
      for g in select value v, ordinality o from jsonb_array_elements(grp.people) with ordinality loop
        if n = 0 or (n + 1 + case when (g.v->>'plus_one')::boolean then 1 else 0 end) > size then
          tables := tables || jsonb_build_array(jsonb_build_object('guests', '[]'::jsonb, 'groups', case when grp.label is null then '[]'::jsonb else jsonb_build_array(grp.label) end));
          free := free || size; n := 0;
        end if;
        i := jsonb_array_length(tables) - 1;
        tables := jsonb_set(tables, array[i::text, 'guests'], (tables->i->'guests') || jsonb_build_array(g.v));
        n := n + 1 + case when (g.v->>'plus_one')::boolean then 1 else 0 end;
        free[i + 1] := size - n;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('event', e.name, 'table_size', size, 'seats_needed', total, 'tables_needed', jsonb_array_length(tables),
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('table', o, 'seats_used', size - free[o::int], 'groups', t->'groups', 'guests', t->'guests',
        'dietary', (select coalesce(jsonb_agg(distinct x->>'dietary'), '[]') from jsonb_array_elements(t->'guests') x where x->>'dietary' is not null)) order by o), '[]')
      from jsonb_array_elements(tables) with ordinality as a(t, o)),
    'note', 'Suggestion only — nothing is saved. Groups stay together where they fit at one table.',
    'link', '/organizer/events/' || p_event || '?tab=guests');
end $function$;

-- ── 8. Per-run cost for owners (credits, tokens, tool calls, £ at 1 credit = 1p) ──
create or replace function public.agent_workspace_run_costs(p_workspace uuid, p_limit integer default 25) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
    select jsonb_build_object('run_id', r.id, 'goal', left(r.goal, 140), 'status', r.status, 'mission', r.mission, 'quality', r.quality, 'created_at', r.created_at,
      'credits', coalesce((select sum(u.credits) from public.ai_usage_events u where u.run_id = r.id), 0),
      'cost_gbp', round(coalesce((select sum(u.credits) from public.ai_usage_events u where u.run_id = r.id), 0) / 100.0, 4),
      'tokens', coalesce((select sum(u.input_tokens + u.output_tokens) from public.ai_usage_events u where u.run_id = r.id), 0),
      'tool_calls', (select count(*) from public.agent_tool_calls c where c.run_id = r.id),
      'refused_calls', (select count(*) from public.agent_tool_calls c where c.run_id = r.id and c.status = 'refused')) x
    from public.agent_runs r where r.workspace_id = p_workspace and r.mode <> 'ask' order by r.created_at desc limit least(greatest(coalesce(p_limit, 25), 1), 100)) s), '[]');
end $$;

-- ── 9. Domain events ──
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('agent.memory_saved', 1, 'agent_memory', 'Gala Agent saved a working preference or fact (payload: memory_id, key, scope).', null),
  ('agent.memory_reset', 1, 'agent_memory', 'A user forgot one Gala Agent memory or reset a scope (payload: memory_id, scope, deleted).', null),
  ('agent.mission_waiting', 1, 'agent_run', 'A Gala Agent mission paused until a request changes status (payload: wait_id, item, from_status, until).', null),
  ('agent.mission_resumed', 1, 'agent_run', 'A paused Gala Agent mission resumed (payload: wait_id, outcome responded|expired|cancelled, status).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate, active = true, updated_at = now();

-- ── 10. Grants ──
revoke all on function public.agent_skills_bindings_guard(), public.agent_waits_wake_build_item(), public.job_agent_memory_retention(public.job_queue),
  public.agent_mission_wait(uuid, uuid, uuid, integer), public.agent_invoke_d3(uuid, uuid, text, jsonb),
  public.agent_governance_refusal(public.agent_runs, uuid, public.agent_tools, uuid, boolean, jsonb), public.agent_governance_refusal(public.agent_runs, uuid, public.agent_tools, uuid, boolean),
  public.agent_execute_tool(uuid, uuid, uuid, text, jsonb, text, uuid, boolean), public.agent_tool_amount_minor(text, jsonb), public.agent_memory_refusal(text)
  from public, anon, authenticated;
grant execute on function public.job_agent_memory_retention(public.job_queue), public.agent_mission_wait(uuid, uuid, uuid, integer),
  public.agent_governance_refusal(public.agent_runs, uuid, public.agent_tools, uuid, boolean, jsonb), public.agent_governance_refusal(public.agent_runs, uuid, public.agent_tools, uuid, boolean),
  public.agent_execute_tool(uuid, uuid, uuid, text, jsonb, text, uuid, boolean), public.agent_tool_amount_minor(text, jsonb), public.agent_memory_refusal(text) to service_role;
revoke all on function public.agent_available_skills(uuid), public.agent_memory_remember(uuid, text, text, text, text, uuid), public.agent_memory_list(uuid),
  public.agent_memory_forget(uuid, uuid, text), public.agent_workspace_run_costs(uuid, integer) from public, anon;
grant execute on function public.agent_available_skills(uuid), public.agent_memory_remember(uuid, text, text, text, text, uuid), public.agent_memory_list(uuid),
  public.agent_memory_forget(uuid, uuid, text), public.agent_workspace_run_costs(uuid, integer) to authenticated, service_role;
