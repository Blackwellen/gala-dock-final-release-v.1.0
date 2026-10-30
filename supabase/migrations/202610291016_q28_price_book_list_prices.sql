-- Q28 follow-up (owner delegated commercial decisions, 2026-10-28; owner: Gala Dock's AI is Azure OpenAI ONLY). Additive.
-- Price book: Azure rows → source 'list_price'. Source note (ai_model_prices has no note column, so it is recorded here):
--   2026-10-28 — published list price, padded. Verified published rates Oct 2026 (OpenAI announcement for gpt-5.4 mini / nano).
--   Padding so credits never under-charge: +10% Azure regional uplift; fx_to_gbp 0.80 (above spot).
--   standard (gpt-5.4-mini): 0.825 / 0.0825 / 4.95 USD per Mtok (input / cached / output)
--   fast (gpt-5.4-nano):     0.22 / 0.022 / 1.375
--   deep: no deployment configured → priced at the ceiling 5.00 / 0.50 / 25.00
-- Claude rows (claude-opus-5-5, claude-opus-5, claude-opus-4-8) stay in the table but are marked unused (active=false): no product
-- code calls Anthropic any more, and the pack guard / report only consider active rows, so packs depend on the Azure rows alone.
-- Then the three repriced packs (£25 / £89 / £219 ex VAT, 202610291015) are activated; credit_packs_guard re-checks no active
-- estimate rows and ≥75% net margin after card fees (7770 / 7580 / 7557 bps) — any refusal rolls the whole migration back.
-- Stripe test-mode prices only (live prices are an owner action).

alter table public.ai_model_prices add column if not exists active boolean not null default true;
comment on column public.ai_model_prices.active is 'Q28: false = row kept for history only (not called by product code); ignored by the pack guard and price_book_estimate flag.';

update public.ai_model_prices p set input_per_mtok = v.i, cached_input_per_mtok = v.c, output_per_mtok = v.o, fx_to_gbp = 0.80, currency = 'USD',
       source = 'list_price', active = true, updated_at = now()
  from (values ('standard', 0.825, 0.0825, 4.95), ('fast', 0.22, 0.022, 1.375), ('deep', 5.00, 0.50, 25.00)) as v(model, i, c, o)
 where p.model = v.model and p.provider = 'azure_openai';
update public.ai_model_prices set active = false, updated_at = now() where provider = 'anthropic' and active;

create or replace function public.credit_packs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.ai_economics_settings; m integer;
begin
  select * into s from public.ai_economics_settings;
  new.worst_case_cost_minor := ceil(new.credits * s.credit_cost_minor)::integer;   -- derived, never typed in
  if new.active and (tg_op = 'INSERT' or not old.active or new.price_minor <> old.price_minor or new.credits <> old.credits or new.target_margin_bps <> old.target_margin_bps) then
    if exists (select 1 from public.ai_model_prices where source = 'estimate' and active) then
      raise exception 'price_book_unverified: enter contract or list prices for every model before activating a credit pack' using errcode = 'P0001';
    end if;
    m := public.ai_pack_margin_bps(new.credits, new.price_minor);
    if m < greatest(new.target_margin_bps, s.target_margin_bps) then
      raise exception 'pack_below_margin: % bps after card fees, target % bps', m, greatest(new.target_margin_bps, s.target_margin_bps) using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.credit_packs_guard() from public, anon, authenticated;

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

  select count(*) into est from public.ai_model_prices where source = 'estimate' and active;
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

do $$ begin
  if exists (select 1 from public.ai_model_prices where source = 'estimate' and active) then raise exception 'price_book_still_estimate'; end if;
end $$;
update public.credit_packs set active = true
 where name in ('Top-up S', 'Top-up M', 'Top-up L') and not active and stripe_price_test is not null and price_minor in (2500, 8900, 21900);
