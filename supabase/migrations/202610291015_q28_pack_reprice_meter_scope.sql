-- Q28 follow-ups (owner decisions 2026-10-28). Additive and backward-compatible with the deployed code.
-- 1. Credit packs repriced to £25 / £89 / £219 ex VAT. They stay INACTIVE: credit_packs_guard keeps refusing activation while
--    any model price is an 'estimate' (owner supplies contract prices). New Stripe test Prices come from
--    scripts/billing/stripe-test-catalogue.mjs (re-run after this migration; the old test Prices are archived by that script).
-- 2. unmetered_runs is scoped to runs created after the meter went live. The setting lives in ai_economics_settings so finance can
--    move it without a deploy; historic agent_runs are not modified.

update public.credit_packs set price_minor = v.price
  from (values ('Top-up S', 500::numeric, 2500), ('Top-up M', 2000::numeric, 8900), ('Top-up L', 5000::numeric, 21900)) as v(name, credits, price)
 where credit_packs.name = v.name and credit_packs.credits = v.credits and not credit_packs.active and credit_packs.price_minor <> v.price;

alter table public.ai_economics_settings add column if not exists meter_live_on date not null default date '2026-10-11';
comment on column public.ai_economics_settings.meter_live_on is
  'UTC day the AI usage meter went live (Q28). Runs created AFTER this day with tokens but no ai_usage_events raise unmetered_runs; earlier runs are historic.';

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
      and r.created_at >= ((s.meter_live_on + 1)::timestamp at time zone 'utc')   -- only runs after meter go-live (historic runs kept as-is)
      and not exists (select 1 from public.ai_usage_events u where u.run_id = r.id);
  if unbilled_runs > 0 then flags := flags || jsonb_build_object('code', 'unmetered_runs', 'severity', 'high', 'detail', unbilled_runs || ' run(s) after meter go-live used tokens with no metered usage'); end if;

  return jsonb_build_object('month', m, 'settings', to_jsonb(s) - 'id' - 'updated_by', 'revenue_per_pack_credit_minor', round(per_credit, 4),
    'totals', tot || jsonb_build_object('by_provider', by_provider, 'unbilled_plan_cost_minor', round(unbilled_plan, 2)), 'workspaces', rows, 'flags', flags,
    'packs', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'active', active, 'credits', credits, 'price_minor', price_minor,
      'margin_bps', public.ai_pack_margin_bps(credits, price_minor), 'target_bps', greatest(target_margin_bps, s.target_margin_bps)) order by credits), '[]'::jsonb) from public.credit_packs),
    'invoices', invoices);
end $$;

revoke all on function public.ai_profitability_report(date) from public, anon;
grant execute on function public.ai_profitability_report(date) to authenticated, service_role;
