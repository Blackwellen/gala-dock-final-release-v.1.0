-- Q28 (lane A): Gala Agent profitability assurance (docs/commercial/economics.md §2, §4, §5; target 75% gross margin on AI products).
-- Supersedes the unapplied 202610280039 draft (reviewed against the live schema after Q01/Q03/Q07). Changes from the draft:
--   * no bulk rewrite of agent_runs.cost_cents (538 of 632 historic rows would have changed and finished runs are state-guarded);
--     the trigger fills new runs, and the report reads cost from ai_usage_events, the source of truth, for every month;
--   * Q01 least privilege: no anon access to the new tables, client writes revoked (writes go through definer RPCs / triggers),
--     every new function revoked from public/anon; service-only workers revoked from authenticated too;
--   * Anthropic price-book rows (source 'estimate') for the provider assistant / onboarding paths that are now metered;
--   * provider invoices are per provider, and the report reconciles each provider's invoice against its own metered cost;
--   * the report is callable by the service role (daily alert job) as well as agent_ops/commerce admins;
--   * daily job 'ai.profitability_alert' on job_queue notifies platform admins when the report carries a 'high' flag.
-- Additive and backward-compatible with the deployed code (no existing function signature or table is changed).
-- 1 credit = 1p of metered provider cost, so margin only exists in what credits are SOLD for. This migration makes that provable:
--   1. agent_runs.cost_cents of new runs is the metered provider cost (GBP pence, rounded up) from ai_usage_events.
--   2. A credit pack cannot be activated on estimated model prices, or below its target margin after card fees.
--   3. Owner-approved overage accrues a receivable at the documented rate (Top-up S unit rate) instead of vanishing as unbilled cost.
--   4. Finance records each provider's actual invoice; the report shows metered vs invoiced cost (price-book drift).
--   5. ai_profitability_report(month) returns cost, recognisable revenue, margin and explicit flags.

-- 0. Price book: Anthropic models used by the provider assistant and onboarding helper (estimates until contract prices). --------
-- USD per 1M tokens, Anthropic first-party list prices (claude-api reference, cached 2026-10-06). The fallback models are priced
-- too, because a server-side refusal fallback bills the request on the model that served it.
insert into public.ai_model_prices(model, tier, provider, currency, input_per_mtok, cached_input_per_mtok, output_per_mtok, fx_to_gbp, source)
values ('claude-opus-5-5', 'standard', 'anthropic', 'USD', 4.00, 0.20, 20.00, 0.79, 'estimate'),
       ('claude-opus-5',   'standard', 'anthropic', 'USD', 5.00, 0.50, 25.00, 0.79, 'estimate'),
       ('claude-opus-4-8', 'standard', 'anthropic', 'USD', 5.00, 0.50, 25.00, 0.79, 'estimate')
on conflict (model) do nothing;

-- 1. Run cost from the meter -------------------------------------------------------------------------------------------------
create or replace function public.ai_usage_roll_run_cost() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.run_id is not null then
    update public.agent_runs set cost_cents = ceil((select coalesce(sum(u.cost_gbp_minor), 0) from public.ai_usage_events u where u.run_id = new.run_id))::integer
      where id = new.run_id and cost_cents is distinct from ceil((select coalesce(sum(u.cost_gbp_minor), 0) from public.ai_usage_events u where u.run_id = new.run_id))::integer;
  end if;
  return new;
end $$;
drop trigger if exists ai_usage_roll_run_cost on public.ai_usage_events;
create trigger ai_usage_roll_run_cost after insert on public.ai_usage_events for each row execute function public.ai_usage_roll_run_cost();

-- 2. Pack margin guard ---------------------------------------------------------------------------------------------------------
-- Finance-owned commercial assumptions, editable without a deploy. Card fee defaults to Stripe UK standard cards (1.5% + 20p).
create table if not exists public.ai_economics_settings (
  id boolean primary key default true check (id),
  credit_cost_minor numeric(10,4) not null default 1,        -- provider cost one credit represents (pence); must match record_ai_usage
  overage_rate_minor numeric(10,4) not null default 4,       -- what one overage credit is billed at, ex VAT (economics.md §5)
  card_fee_bps integer not null default 150,
  card_fee_fixed_minor integer not null default 20,
  target_margin_bps integer not null default 7500,
  invoice_variance_bps integer not null default 500,         -- flag when the provider invoice exceeds metered cost by more than this
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
insert into public.ai_economics_settings(id) values (true) on conflict (id) do nothing;
alter table public.ai_economics_settings enable row level security;
drop policy if exists ai_econ_read on public.ai_economics_settings;
create policy ai_econ_read on public.ai_economics_settings for select to authenticated using (public.has_admin_permission('agent_ops') or public.has_admin_permission('commerce'));

-- Net margin of a pack in basis points, after card fees, assuming every credit is spent (worst case). Prices are ex VAT.
create or replace function public.ai_pack_margin_bps(p_credits numeric, p_price_minor integer) returns integer
language sql stable security definer set search_path = '' as $$
  select case when p_price_minor <= 0 then -100000 else
    floor(10000 * (p_price_minor - (p_price_minor * s.card_fee_bps / 10000.0 + s.card_fee_fixed_minor) - p_credits * s.credit_cost_minor) / p_price_minor)::integer end
  from public.ai_economics_settings s;
$$;

create or replace function public.credit_packs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.ai_economics_settings; m integer;
begin
  select * into s from public.ai_economics_settings;
  new.worst_case_cost_minor := ceil(new.credits * s.credit_cost_minor)::integer;   -- derived, never typed in
  if new.active and (tg_op = 'INSERT' or not old.active or new.price_minor <> old.price_minor or new.credits <> old.credits or new.target_margin_bps <> old.target_margin_bps) then
    if exists (select 1 from public.ai_model_prices where source = 'estimate') then
      raise exception 'price_book_unverified: enter contract or list prices for every model before activating a credit pack' using errcode = 'P0001';
    end if;
    m := public.ai_pack_margin_bps(new.credits, new.price_minor);
    if m < greatest(new.target_margin_bps, s.target_margin_bps) then
      raise exception 'pack_below_margin: % bps after card fees, target % bps', m, greatest(new.target_margin_bps, s.target_margin_bps) using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists credit_packs_guard on public.credit_packs;
create trigger credit_packs_guard before insert or update on public.credit_packs for each row execute function public.credit_packs_guard();

-- 3. Overage receivable ----------------------------------------------------------------------------------------------------------
create table if not exists public.ai_overage_charges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period date not null,                                     -- first day of the UTC month
  credits numeric(12,3) not null default 0,
  rate_minor numeric(10,4) not null,
  amount_minor integer not null default 0,                  -- ex VAT
  status text not null default 'accrued' check (status in ('accrued','invoiced','paid','waived')),
  invoice_ref text, waived_reason text,
  updated_at timestamptz not null default now(),
  unique (workspace_id, period)
);
alter table public.ai_overage_charges enable row level security;
drop policy if exists ai_overage_read on public.ai_overage_charges;
create policy ai_overage_read on public.ai_overage_charges for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','finance']) or public.has_admin_permission('commerce') or public.has_admin_permission('agent_ops'));

create or replace function public.ai_usage_accrue_overage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r numeric; p date;
begin
  if new.workspace_id is null or coalesce(new.overage, 0) <= 0 then return new; end if;
  select overage_rate_minor into r from public.ai_economics_settings;
  p := date_trunc('month', new.created_at at time zone 'utc')::date;
  insert into public.ai_overage_charges(workspace_id, period, credits, rate_minor, amount_minor)
    values (new.workspace_id, p, new.overage, r, ceil(new.overage * r)::integer)
  on conflict (workspace_id, period) do update set credits = public.ai_overage_charges.credits + excluded.credits,
    amount_minor = ceil((public.ai_overage_charges.credits + excluded.credits) * public.ai_overage_charges.rate_minor)::integer, updated_at = now()
    where public.ai_overage_charges.status = 'accrued';
  return new;
end $$;
drop trigger if exists ai_usage_accrue_overage on public.ai_usage_events;
create trigger ai_usage_accrue_overage after insert on public.ai_usage_events for each row execute function public.ai_usage_accrue_overage();
-- No backfill: live ai_usage_events had no overage rows at review time (2026-10-28).

-- 4. Provider invoices (finance enters the real bill, per provider) -----------------------------------------------------------
create table if not exists public.ai_provider_invoices (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'azure_openai',
  period date not null,                                     -- first day of the UTC month
  amount numeric(14,4) not null check (amount >= 0),
  currency text not null default 'USD',
  fx_to_gbp numeric(10,6) not null,
  reference text not null,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  unique (provider, period)
);
alter table public.ai_provider_invoices enable row level security;
drop policy if exists ai_invoices_read on public.ai_provider_invoices;
create policy ai_invoices_read on public.ai_provider_invoices for select to authenticated using (public.has_admin_permission('agent_ops') or public.has_admin_permission('commerce'));

-- Q01: the three tables are read through RLS by admins only; every write goes through a definer RPC or trigger.
revoke all on table public.ai_economics_settings, public.ai_overage_charges, public.ai_provider_invoices from anon;
revoke insert, update, delete, truncate, references, trigger on table public.ai_economics_settings, public.ai_overage_charges, public.ai_provider_invoices from authenticated;
grant select on table public.ai_economics_settings, public.ai_overage_charges, public.ai_provider_invoices to authenticated;

create or replace function public.admin_record_ai_provider_invoice(p_period date, p_amount numeric, p_currency text, p_fx numeric, p_reference text, p_provider text default 'azure_openai') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_amount is null or p_amount < 0 or p_fx is null or p_fx <= 0 or p_period is null or length(trim(coalesce(p_reference, ''))) < 3
     or coalesce(p_provider, '') !~ '^[a-z][a-z0-9_]{1,40}$' or coalesce(p_currency, '') !~* '^[a-z]{3}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  insert into public.ai_provider_invoices(provider, period, amount, currency, fx_to_gbp, reference, created_by)
    values (p_provider, date_trunc('month', p_period)::date, p_amount, upper(p_currency), p_fx, left(trim(p_reference), 200), auth.uid())
  on conflict (provider, period) do update set amount = excluded.amount, currency = excluded.currency, fx_to_gbp = excluded.fx_to_gbp, reference = excluded.reference, created_by = excluded.created_by, created_at = now();
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'ai.provider_invoice_recorded',
    jsonb_build_object('provider', p_provider, 'period', date_trunc('month', p_period)::date, 'amount', p_amount, 'currency', upper(p_currency), 'fx', p_fx, 'reference', left(trim(p_reference), 200)));
end $$;

-- 5. Report --------------------------------------------------------------------------------------------------------------------
-- Revenue recognised per credit drawn from a purchased balance = weighted ex-VAT price per credit of packs bought (payment_ref set).
-- Allowance credits are paid for by the plan subscription; plan revenue is reported separately. Asks with no workspace
-- (pre-workspace onboarding helper) are platform-absorbed cost.
create or replace function public.ai_profitability_report(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m date := date_trunc('month', coalesce(p_month, (now() at time zone 'utc')::date))::date; s public.ai_economics_settings;
  m0 timestamptz; m1 timestamptz;
  per_credit numeric; tot jsonb; rows jsonb; flags jsonb := '[]'::jsonb; inv record; est integer; unbilled_runs integer; invoices jsonb := '[]'::jsonb;
  by_provider jsonb; unbilled_plan numeric := 0;
begin
  -- Admins with agent_ops/commerce, or the service role (daily alert job). anon cannot execute this function at all.
  if auth.uid() is not null and not (public.has_admin_permission('agent_ops') or public.has_admin_permission('commerce')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  m0 := m::timestamp at time zone 'utc'; m1 := (m + interval '1 month')::timestamp at time zone 'utc';
  select * into s from public.ai_economics_settings;
  select coalesce(sum(p.price_minor) / nullif(sum(p.credits), 0), 0) into per_credit
    from public.ai_credit_ledger l join public.credit_packs p on p.id = l.pack_id where l.kind = 'purchase' and l.payment_ref is not null;

  with u as (
    select workspace_id, sum(cost_gbp_minor) cost, sum(credits) credits, sum(from_allowance) allow, sum(from_balance) bal, sum(overage) od, count(*) calls,
           count(distinct run_id) runs
    from public.ai_usage_events where created_at >= m0 and created_at < m1
    group by workspace_id
  ), w as (
    select u.*, ws.name, ws.kind, ws.plan,
      round(u.bal * per_credit, 2) pack_revenue,
      coalesce((select o.amount_minor from public.ai_overage_charges o where o.workspace_id = u.workspace_id and o.period = m and o.status <> 'waived'), 0) overage_revenue
    from u left join public.workspaces ws on ws.id = u.workspace_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('workspace_id', workspace_id, 'name', coalesce(name, 'Platform-absorbed (no workspace)'), 'kind', kind, 'plan', plan,
           'calls', calls, 'runs', runs, 'cost_minor', round(cost, 2), 'credits', credits, 'from_allowance', allow, 'from_balance', bal, 'overage', od,
           'pack_revenue_minor', pack_revenue, 'overage_revenue_minor', overage_revenue,
           'margin_bps', case when pack_revenue + overage_revenue > 0 then floor(10000 * (pack_revenue + overage_revenue - round(cost * (bal + od) / nullif(credits, 0), 4)) / (pack_revenue + overage_revenue)) end)
           order by cost desc), '[]'::jsonb),
         jsonb_build_object('cost_minor', round(coalesce(sum(cost), 0), 2), 'absorbed_cost_minor', round(coalesce(sum(cost) filter (where workspace_id is null), 0), 2),
           'allowance_cost_minor', round(coalesce(sum(cost * allow / nullif(credits, 0)) filter (where workspace_id is not null), 0), 2),
           'pack_revenue_minor', coalesce(sum(pack_revenue), 0), 'overage_revenue_minor', coalesce(sum(overage_revenue), 0), 'calls', coalesce(sum(calls), 0))
    into rows, tot from w;

  -- Metered cost per provider (price-book provider of the model that was billed).
  select coalesce(jsonb_object_agg(provider, cost), '{}'::jsonb) into by_provider from (
    select coalesce(p.provider, 'unknown') provider, round(sum(u.cost_gbp_minor), 2) cost
      from public.ai_usage_events u left join public.ai_model_prices p on p.model = u.model
     where u.created_at >= m0 and u.created_at < m1 group by 1) x;

  select count(*) into est from public.ai_model_prices where source = 'estimate';
  if est > 0 then flags := flags || jsonb_build_object('code', 'price_book_estimate', 'severity', 'high', 'detail', est || ' model price(s) are estimates; credits may under-charge real cost'); end if;
  for inv in select * from public.ai_provider_invoices where period = m order by provider loop
    invoices := invoices || jsonb_build_object('provider', inv.provider, 'amount', inv.amount, 'currency', inv.currency, 'fx_to_gbp', inv.fx_to_gbp, 'reference', inv.reference,
      'invoiced_minor', round(inv.amount * inv.fx_to_gbp * 100, 2), 'metered_minor', coalesce((by_provider ->> inv.provider)::numeric, 0));
    if inv.amount * inv.fx_to_gbp * 100 > coalesce((by_provider ->> inv.provider)::numeric, 0) * (1 + s.invoice_variance_bps / 10000.0) then
      flags := flags || jsonb_build_object('code', 'invoice_exceeds_meter', 'severity', 'high', 'detail',
        format('%s invoice %s pence vs metered %s pence', inv.provider, round(inv.amount * inv.fx_to_gbp * 100), round(coalesce((by_provider ->> inv.provider)::numeric, 0))));
    end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(by_provider) k where not exists (select 1 from public.ai_provider_invoices i where i.period = m and i.provider = k)) then
    flags := flags || jsonb_build_object('code', 'provider_invoice_missing', 'severity', 'medium', 'detail', 'No provider invoice recorded for this month for: ' ||
      (select string_agg(k, ', ' order by k) from jsonb_object_keys(by_provider) k where not exists (select 1 from public.ai_provider_invoices i where i.period = m and i.provider = k)));
  end if;
  if exists (select 1 from public.ai_overage_charges where period = m and status = 'accrued' and amount_minor > 0) then
    flags := flags || jsonb_build_object('code', 'overage_not_invoiced', 'severity', 'medium', 'detail', 'Overage is accrued but not yet invoiced');
  end if;
  -- Allowance consumed on a PAID plan with no active subscription is unbilled cost (Starter allowance is acquisition cost).
  select coalesce(sum(u.cost_gbp_minor * u.from_allowance / nullif(u.credits, 0)), 0) into unbilled_plan
    from public.ai_usage_events u join public.workspaces ws on ws.id = u.workspace_id
   where u.created_at >= m0 and u.created_at < m1 and coalesce(ws.plan, 'starter') <> 'starter'
     and not public.workspace_has_paid_subscription(ws.id);
  if unbilled_plan > 0 then
    flags := flags || jsonb_build_object('code', 'plan_revenue_not_billed', 'severity', 'high', 'detail',
      format('Paid-plan allowances consumed %s pence of AI cost in workspaces with no active subscription', round(unbilled_plan, 2)));
  end if;
  if exists (select 1 from public.credit_packs where active and public.ai_pack_margin_bps(credits, price_minor) < greatest(target_margin_bps, s.target_margin_bps)) then
    flags := flags || jsonb_build_object('code', 'active_pack_below_margin', 'severity', 'high', 'detail', 'An active credit pack is below target margin');
  end if;
  select count(*) into unbilled_runs from public.agent_runs r
    where r.created_at >= m0 and r.created_at < m1 and r.tokens > 0
      and not exists (select 1 from public.ai_usage_events u where u.run_id = r.id);
  if unbilled_runs > 0 then flags := flags || jsonb_build_object('code', 'unmetered_runs', 'severity', 'high', 'detail', unbilled_runs || ' run(s) used tokens with no metered usage'); end if;

  return jsonb_build_object('month', m, 'settings', to_jsonb(s) - 'id' - 'updated_by', 'revenue_per_pack_credit_minor', round(per_credit, 4),
    'totals', tot || jsonb_build_object('by_provider', by_provider, 'unbilled_plan_cost_minor', round(unbilled_plan, 2)), 'workspaces', rows, 'flags', flags,
    'packs', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'active', active, 'credits', credits, 'price_minor', price_minor,
      'margin_bps', public.ai_pack_margin_bps(credits, price_minor), 'target_bps', greatest(target_margin_bps, s.target_margin_bps)) order by credits), '[]'::jsonb) from public.credit_packs),
    'invoices', invoices);
end $$;

-- Subscription hook used by the report. Until subscription billing ships (202610291013) no workspace has one.
create or replace function public.workspace_has_paid_subscription(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select false $$;

-- 6. Daily alert: a 'high' flag notifies every platform admin with agent_ops or commerce (job_queue, runtime db). ----------------
create or replace function public.job_ai_profitability_alert(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; hi jsonb; n integer := 0; m date := coalesce((p_job.payload ->> 'month')::date, (now() at time zone 'utc')::date);
begin
  r := public.ai_profitability_report(m);
  select coalesce(jsonb_agg(f), '[]'::jsonb) into hi from jsonb_array_elements(r -> 'flags') f where f ->> 'severity' = 'high';
  if jsonb_array_length(hi) = 0 then return jsonb_build_object('month', r ->> 'month', 'high', 0, 'notified', 0); end if;
  insert into public.notifications(user_id, kind, title, body, link)
    select a.user_id, 'admin.ai_profitability', 'AI profitability: ' || jsonb_array_length(hi) || ' high flag' || case when jsonb_array_length(hi) = 1 then '' else 's' end,
           left((select string_agg(f ->> 'code', ', ') from jsonb_array_elements(hi) f), 400), '/admin/agent-integrations/credits'
      from public.platform_admins a
     where a.permissions && array['agent_ops','commerce']
       and not exists (select 1 from public.notifications x where x.user_id = a.user_id and x.link = '/admin/agent-integrations/credits'
                         and x.title like 'AI profitability:%' and x.created_at >= date_trunc('day', now()));   -- at most one per admin per day
  get diagnostics n = row_count;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'ai.profitability_flagged', jsonb_build_object('month', r ->> 'month', 'flags', hi, 'notified', n));
  return jsonb_build_object('month', r ->> 'month', 'high', jsonb_array_length(hi), 'notified', n);
end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description)
values ('ai.profitability_alert', 'db', 'public.job_ai_profitability_alert', 3, 'Q28: daily AI profitability report; notifies platform admins (agent_ops/commerce) when a high-severity flag is present')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, description = excluded.description, updated_at = now();
select cron.unschedule('ai-profitability-alert') where exists (select 1 from cron.job where jobname = 'ai-profitability-alert');
select cron.schedule('ai-profitability-alert', '10 7 * * *',
  $$select public.enqueue_job(p_kind => 'ai.profitability_alert', p_payload => '{}'::jsonb, p_dedupe_key => 'ai.profitability_alert:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);

-- Grants (Q01): nothing here is anon-callable. Trigger and worker functions are service-only.
revoke all on function public.ai_usage_roll_run_cost(), public.credit_packs_guard(), public.ai_usage_accrue_overage() from public, anon, authenticated;
revoke all on function public.job_ai_profitability_alert(public.job_queue) from public, anon, authenticated;
grant execute on function public.job_ai_profitability_alert(public.job_queue) to service_role;
revoke all on function public.workspace_has_paid_subscription(uuid) from public, anon, authenticated;
grant execute on function public.workspace_has_paid_subscription(uuid) to service_role;
revoke all on function public.admin_record_ai_provider_invoice(date, numeric, text, numeric, text, text) from public, anon;
grant execute on function public.admin_record_ai_provider_invoice(date, numeric, text, numeric, text, text) to authenticated;
revoke all on function public.ai_profitability_report(date) from public, anon;
grant execute on function public.ai_profitability_report(date) to authenticated, service_role;
revoke all on function public.ai_pack_margin_bps(numeric, integer) from public, anon;
grant execute on function public.ai_pack_margin_bps(numeric, integer) to authenticated, service_role;
