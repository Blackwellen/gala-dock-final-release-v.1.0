-- Gala Agent economics (release spec §15–20): model price book, metered usage, AI Credits ledger, workspace budgets and caps.
-- Customers see credits, never raw provider-token economics. Provider cost (normalised to GBP pence) and credits are stored side by side
-- so model/provider pricing can change without changing plans. One credit = credit_value_minor of provider cost (default 1p).

create table if not exists public.ai_model_prices (
  model text primary key,                               -- deployment key: fast | standard | deep (maps to AGENT_MODEL_* env)
  tier text not null check (tier in ('fast','standard','deep')),
  provider text not null default 'azure_openai',
  currency text not null default 'USD',
  input_per_mtok numeric(12,4) not null,                -- provider currency per 1M tokens
  cached_input_per_mtok numeric(12,4) not null default 0,
  output_per_mtok numeric(12,4) not null,
  fx_to_gbp numeric(10,6) not null default 0.79,        -- normalisation rate, reviewed with the price book
  source text not null default 'estimate' check (source in ('estimate','contract','list_price')),
  updated_at timestamptz not null default now()
);
-- List-price ESTIMATES for the configured deployments; replace with the Azure contract price book (economics.md §AI cost model).
insert into public.ai_model_prices(model, tier, input_per_mtok, cached_input_per_mtok, output_per_mtok, source) values
  ('fast', 'fast', 0.10, 0.025, 0.40, 'estimate'), ('standard', 'standard', 0.40, 0.10, 1.60, 'estimate'), ('deep', 'deep', 2.00, 0.50, 8.00, 'estimate')
on conflict (model) do nothing;

create table if not exists public.ai_budgets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  monthly_allowance numeric(12,3) not null default 500,  -- credits included with the plan each calendar month (UTC)
  soft_caps integer[] not null default '{70,85,95}',
  hard_cap boolean not null default true,
  allow_overage boolean not null default false,          -- owner-approved overage, billed explicitly (never a hidden negative balance)
  overage_limit numeric(12,3) not null default 0,
  daily_limit numeric(12,3),
  per_run_limit numeric(12,3) not null default 50,
  deep_allowed boolean not null default false,
  tool_limits jsonb not null default '{}',               -- {tool_id: max calls per day}
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);

create table if not exists public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('grant','purchase','promo','usage','overage','refund','reversal','expiry')),
  credits numeric(12,3) not null,                        -- signed: grants positive, usage negative
  reference text not null default '',
  pack_id uuid, payment_ref text,
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists ai_credit_ledger_ws_idx on public.ai_credit_ledger(workspace_id, created_at desc);
create unique index if not exists ai_credit_ledger_payment_uq on public.ai_credit_ledger(payment_ref) where payment_ref is not null;

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  purpose text not null,                                 -- plan | ask | summary | compile | tool_pick | answer
  model text not null, tier text not null,
  input_tokens integer not null default 0, cached_tokens integer not null default 0, output_tokens integer not null default 0,
  provider_cost numeric(14,6) not null default 0, provider_currency text not null default 'USD',
  cost_gbp_minor numeric(14,4) not null default 0,       -- normalised internal cost, pence
  credits numeric(12,3) not null default 0,
  from_allowance numeric(12,3) not null default 0, from_balance numeric(12,3) not null default 0, overage numeric(12,3) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_ws_idx on public.ai_usage_events(workspace_id, created_at desc);
create index if not exists ai_usage_run_idx on public.ai_usage_events(run_id);

create table if not exists public.credit_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null, credits numeric(12,3) not null check (credits > 0),
  price_minor integer not null check (price_minor > 0), currency text not null default 'GBP',
  vat_treatment text not null default 'standard_rated' check (vat_treatment in ('standard_rated','reverse_charge','exempt','outside_scope')),
  worst_case_cost_minor integer not null,                -- provider cost if every credit is spent on the most expensive allowed tier
  target_margin_bps integer not null,
  expiry_days integer,                                   -- null = no expiry
  workspace_kinds text[] not null default '{organizer,provider}',
  active boolean not null default false,                 -- packs are created inactive; finance activates after economics sign-off
  created_at timestamptz not null default now()
);

alter table public.ai_model_prices enable row level security;
alter table public.ai_budgets enable row level security;
alter table public.ai_credit_ledger enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.credit_packs enable row level security;
drop policy if exists ai_budgets_read on public.ai_budgets;
create policy ai_budgets_read on public.ai_budgets for select using (public.is_workspace_member(workspace_id) or public.has_admin_permission('agent_ops'));
drop policy if exists ai_ledger_read on public.ai_credit_ledger;
create policy ai_ledger_read on public.ai_credit_ledger for select using (public.has_workspace_role(workspace_id, array['owner','manager','finance']) or public.has_admin_permission('agent_ops'));
drop policy if exists ai_usage_read on public.ai_usage_events;
create policy ai_usage_read on public.ai_usage_events for select using (public.has_workspace_role(workspace_id, array['owner','manager','finance']) or user_id = (select auth.uid()) or public.has_admin_permission('agent_ops'));
drop policy if exists credit_packs_read on public.credit_packs;
create policy credit_packs_read on public.credit_packs for select using (active or public.has_admin_permission('agent_ops') or public.has_admin_permission('commerce'));
drop policy if exists ai_prices_read on public.ai_model_prices;
create policy ai_prices_read on public.ai_model_prices for select using (public.has_admin_permission('agent_ops') or public.has_admin_permission('commerce'));

-- Current position for a workspace (UTC calendar month).
create or replace function public.ai_credit_status(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.ai_budgets; month_allow numeric; month_used numeric; day_used numeric; bal numeric; od numeric;
begin
  if auth.uid() is not null and not public.is_workspace_member(p_workspace) and not public.has_admin_permission('agent_ops') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into b from public.ai_budgets where workspace_id = p_workspace;
  if not found then b.monthly_allowance := 500; b.soft_caps := '{70,85,95}'; b.hard_cap := true; b.allow_overage := false; b.overage_limit := 0; b.per_run_limit := 50; b.deep_allowed := false; end if;
  select coalesce(sum(from_allowance), 0), coalesce(sum(credits), 0), coalesce(sum(overage), 0) into month_allow, month_used, od from public.ai_usage_events
    where workspace_id = p_workspace and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  select coalesce(sum(credits), 0) into day_used from public.ai_usage_events where workspace_id = p_workspace and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  select coalesce(sum(credits), 0) into bal from public.ai_credit_ledger where workspace_id = p_workspace and kind <> 'overage' and (expires_at is null or expires_at > now() or credits < 0);
  return jsonb_build_object('allowance', b.monthly_allowance, 'allowance_used', month_allow, 'allowance_left', greatest(b.monthly_allowance - month_allow, 0),
    'balance', greatest(bal, 0), 'used_this_month', month_used, 'used_today', day_used, 'overage_this_month', od,
    'pct', case when b.monthly_allowance > 0 then round(100 * month_allow / b.monthly_allowance) else 100 end,
    'soft_caps', to_jsonb(b.soft_caps), 'hard_cap', b.hard_cap, 'allow_overage', b.allow_overage, 'overage_limit', b.overage_limit,
    'daily_limit', b.daily_limit, 'per_run_limit', b.per_run_limit, 'deep_allowed', b.deep_allowed,
    'available', greatest(b.monthly_allowance - month_allow, 0) + greatest(bal, 0) + case when b.allow_overage then greatest(b.overage_limit - od, 0) else 0 end);
end $$;
revoke all on function public.ai_credit_status(uuid) from public, anon;
grant execute on function public.ai_credit_status(uuid) to authenticated, service_role;

-- Preflight before a paid model call: raises when the call would exceed a cap. Service role only (called by the runtime).
create or replace function public.ai_preflight(p_workspace uuid, p_run uuid, p_tier text, p_estimate numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare s jsonb; run_used numeric;
begin
  if p_workspace is null then return; end if;   -- personal (customer) asks are rate-limited per user instead
  s := public.ai_credit_status(p_workspace);
  if p_tier = 'deep' and not (s->>'deep_allowed')::boolean then raise exception 'ai_deep_not_allowed' using errcode = 'P0001'; end if;
  if (s->>'daily_limit') is not null and (s->>'used_today')::numeric + p_estimate > (s->>'daily_limit')::numeric then raise exception 'ai_daily_limit' using errcode = 'P0001'; end if;
  if p_run is not null then
    select coalesce(sum(credits), 0) into run_used from public.ai_usage_events where run_id = p_run;
    if run_used + p_estimate > (s->>'per_run_limit')::numeric then raise exception 'ai_run_limit' using errcode = 'P0001'; end if;
  end if;
  if (s->>'hard_cap')::boolean and (s->>'available')::numeric < p_estimate then raise exception 'ai_hard_cap' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.ai_preflight(uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.ai_preflight(uuid, uuid, text, numeric) to service_role;

-- Records one model call: prices it from the price book, converts to credits, draws allowance → purchased balance → approved overage,
-- writes the ledger, updates the run, and notifies owners when a soft cap is first crossed this month.
create or replace function public.record_ai_usage(p_workspace uuid, p_user uuid, p_run uuid, p_purpose text, p_model text, p_input integer, p_cached integer, p_output integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pr public.ai_model_prices; cost numeric; gbp numeric; cr numeric; s jsonb; a numeric := 0; bpart numeric := 0; o numeric := 0; before_pct numeric; after_pct numeric; cap integer; credit_value numeric := 1;
begin
  select * into pr from public.ai_model_prices where model = p_model;
  if not found then select * into pr from public.ai_model_prices where model = 'standard'; end if;
  cost := (greatest(p_input - p_cached, 0) * pr.input_per_mtok + p_cached * pr.cached_input_per_mtok + p_output * pr.output_per_mtok) / 1000000.0;
  gbp := cost * pr.fx_to_gbp * 100;                               -- pence
  cr := round(gbp / credit_value, 3);
  if p_workspace is not null then
    s := public.ai_credit_status(p_workspace);
    a := least(cr, (s->>'allowance_left')::numeric);
    bpart := least(cr - a, (s->>'balance')::numeric);
    o := cr - a - bpart;                                            -- only possible when overage is allowed or hard cap is off; recorded openly
    before_pct := (s->>'pct')::numeric;
  end if;
  insert into public.ai_usage_events(workspace_id, user_id, run_id, purpose, model, tier, input_tokens, cached_tokens, output_tokens, provider_cost, provider_currency, cost_gbp_minor, credits, from_allowance, from_balance, overage)
    values (p_workspace, p_user, p_run, left(p_purpose, 40), p_model, pr.tier, p_input, p_cached, p_output, cost, pr.currency, gbp, cr, a, bpart, o);
  if p_workspace is not null and bpart > 0 then insert into public.ai_credit_ledger(workspace_id, kind, credits, reference) values (p_workspace, 'usage', -bpart, coalesce(p_run::text, p_purpose)); end if;
  if p_workspace is not null and o > 0 then insert into public.ai_credit_ledger(workspace_id, kind, credits, reference) values (p_workspace, 'overage', -o, coalesce(p_run::text, p_purpose)); end if;
  if p_run is not null then update public.agent_runs set tokens = tokens + p_input + p_output where id = p_run; end if;
  if p_workspace is not null and (s->>'allowance')::numeric > 0 then
    after_pct := round(100 * ((s->>'allowance_used')::numeric + a) / (s->>'allowance')::numeric);
    foreach cap in array (select array(select jsonb_array_elements_text(s->'soft_caps')::int)) loop
      if before_pct < cap and after_pct >= cap then
        insert into public.notifications(user_id, kind, title, body, link)
          select m.user_id, 'agent', 'Gala Agent credits ' || cap || '% used', 'Your workspace has used ' || cap || '% of this month’s AI credit allowance.', '/organizer/settings?tab=agent'
          from public.workspace_members m where m.workspace_id = p_workspace and m.status = 'active' and m.role in ('owner','manager','finance');
        insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', p_workspace, 'ai.soft_cap_reached', jsonb_build_object('cap', cap));
      end if;
    end loop;
  end if;
  return jsonb_build_object('credits', cr, 'cost_gbp_minor', gbp, 'from_allowance', a, 'from_balance', bpart, 'overage', o);
end $$;
revoke all on function public.record_ai_usage(uuid, uuid, uuid, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, uuid, uuid, text, text, integer, integer, integer) to service_role;

-- Owners/managers configure the workspace budget; turning on overage is owner-only.
create or replace function public.set_ai_budget(p_workspace uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare cur public.ai_budgets;
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into cur from public.ai_budgets where workspace_id = p_workspace;
  if coalesce((p->>'allow_overage')::boolean, false) and not coalesce(cur.allow_overage, false) and not public.has_workspace_role(p_workspace, array['owner']) then raise exception 'owner_only' using errcode = '42501'; end if;
  insert into public.ai_budgets(workspace_id, soft_caps, hard_cap, allow_overage, overage_limit, daily_limit, per_run_limit, deep_allowed, tool_limits, updated_by, updated_at)
  values (p_workspace, coalesce(array(select jsonb_array_elements_text(p->'soft_caps')::int), '{70,85,95}'), coalesce((p->>'hard_cap')::boolean, true),
    coalesce((p->>'allow_overage')::boolean, false), least(greatest(coalesce((p->>'overage_limit')::numeric, 0), 0), 100000),
    nullif(p->>'daily_limit', '')::numeric, least(greatest(coalesce((p->>'per_run_limit')::numeric, 50), 1), 10000), coalesce((p->>'deep_allowed')::boolean, false),
    coalesce(p->'tool_limits', '{}'), auth.uid(), now())
  on conflict (workspace_id) do update set soft_caps = excluded.soft_caps, hard_cap = excluded.hard_cap, allow_overage = excluded.allow_overage, overage_limit = excluded.overage_limit,
    daily_limit = excluded.daily_limit, per_run_limit = excluded.per_run_limit, deep_allowed = excluded.deep_allowed, tool_limits = excluded.tool_limits, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'ai.budget_changed', p);
end $$;
revoke all on function public.set_ai_budget(uuid, jsonb) from public, anon;
grant execute on function public.set_ai_budget(uuid, jsonb) to authenticated;
-- monthly_allowance is plan-driven: only admins change it.
create or replace function public.admin_grant_credits(p_workspace uuid, p_credits numeric, p_kind text, p_reference text, p_expires timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('agent_ops') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_kind not in ('grant','promo','refund','reversal') or length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'invalid' using errcode = '22023'; end if;
  insert into public.ai_credit_ledger(workspace_id, kind, credits, reference, expires_at, created_by) values (p_workspace, p_kind, p_credits, p_reference, p_expires, auth.uid());
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', p_workspace, 'ai.credits_' || p_kind, jsonb_build_object('credits', p_credits, 'reference', p_reference));
end $$;
revoke all on function public.admin_grant_credits(uuid, numeric, text, text, timestamptz) from public, anon;
grant execute on function public.admin_grant_credits(uuid, numeric, text, text, timestamptz) to authenticated;

-- Quality mode per run (spec §15): fast | standard | deep. Deep is still gated by ai_budgets.deep_allowed at call time.
alter table public.agent_runs add column if not exists quality text not null default 'standard';
do $$ begin
  alter table public.agent_runs add constraint agent_runs_quality_chk check (quality in ('fast','standard','deep'));
exception when duplicate_object then null; end $$;

-- Autonomy levels (spec §21): add always_ask and operational. Existing execute_with_approval policies that pre-authorised R3 tools
-- become 'operational' so their behaviour is unchanged.
alter table public.agent_policies drop constraint if exists agent_policies_mode_check;
alter table public.agent_policies add constraint agent_policies_mode_check check (mode in ('always_ask','suggest','draft','execute_with_approval','operational','policy_autopilot'));
update public.agent_policies set mode = 'operational' where mode = 'execute_with_approval' and cardinality(auto_tools) > 0;
