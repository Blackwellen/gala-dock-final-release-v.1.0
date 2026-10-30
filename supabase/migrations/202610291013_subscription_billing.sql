-- Q28 (lane A): subscription billing lifecycle (domain cards 176–180) as Gala Dock's OWN platform sales (not Connect).
-- Before this, plans and entitlements were configuration only: nothing charged for plans, AI credit packs or approved overage.
--   * plan_prices: the plan catalogue (prices from docs/commercial/economics.md §3, ex VAT) with Stripe Product/Price ids per mode.
--   * billing_customers / workspace_subscriptions / subscription_invoices: Stripe mirror, written only by the webhook (service role).
--   * billing_apply_subscription(): webhook-authoritative entitlement changes — workspaces.plan follows the subscription state,
--     with end-of-period downgrades, cancel-at-period-end, and a 14-day dunning grace before falling back to Starter.
--   * billing_credit_pack_paid(): a paid credit-pack Checkout Session adds ledger credits exactly once (unique payment_ref).
--   * billing_overage_due() / billing_mark_overage_invoiced(): accrued AI overage becomes a Stripe invoice item (app job).
--   * workspace_has_paid_subscription(): replaces the 202610291012 stub so ai_profitability_report flags unbilled plan cost.
-- Additive: new tables/functions, two nullable columns on credit_packs, one partial unique index. Existing code paths unchanged.

-- 1. Plan catalogue -------------------------------------------------------------------------------------------------------------
create table if not exists public.plan_prices (
  kind text not null check (kind in ('organizer','provider')),
  plan text not null check (plan in ('pro','business','enterprise')),
  billing_interval text not null check (billing_interval in ('month','year')),
  price_minor integer not null check (price_minor > 0),          -- ex VAT
  currency text not null default 'GBP',
  self_serve boolean not null default true,                      -- enterprise is a contract, not a self-serve checkout
  stripe_product_test text, stripe_price_test text unique,
  stripe_product_live text, stripe_price_live text unique,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (kind, plan, billing_interval)
);
insert into public.plan_prices(kind, plan, billing_interval, price_minor, self_serve) values
  ('organizer','pro','month', 5900, true), ('organizer','pro','year', 59000, true),
  ('organizer','business','month', 22900, true), ('organizer','business','year', 229000, true),
  ('organizer','enterprise','month', 89900, false),
  ('provider','pro','month', 4900, true), ('provider','pro','year', 49000, true),
  ('provider','business','month', 14900, true), ('provider','business','year', 149000, true),
  ('provider','enterprise','month', 59900, false)
on conflict (kind, plan, billing_interval) do nothing;
alter table public.plan_prices enable row level security;
drop policy if exists plan_prices_read on public.plan_prices;
create policy plan_prices_read on public.plan_prices for select using (active or public.has_admin_permission('commerce'));

alter table public.credit_packs add column if not exists stripe_price_test text;
alter table public.credit_packs add column if not exists stripe_price_live text;

-- 2. Stripe mirror ---------------------------------------------------------------------------------------------------------------
create table if not exists public.billing_customers (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text not null unique,
  livemode boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text, stripe_price_id text,
  kind text not null, plan text not null, billing_interval text not null,
  status text not null check (status in ('incomplete','incomplete_expired','trialing','active','past_due','unpaid','canceled','paused')),
  current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean not null default false, canceled_at timestamptz, ended_at timestamptz,
  pending_plan text, pending_effective_at timestamptz,          -- end-of-period downgrade: entitlements stay until then
  dunning_since timestamptz,
  livemode boolean not null default false,
  last_event_created bigint not null default 0,                -- order tolerance: older events never overwrite newer state
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.subscription_invoices (
  stripe_invoice_id text primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  stripe_subscription_id text,
  status text not null,
  billing_reason text,
  amount_due integer not null default 0, amount_paid integer not null default 0, currency text not null default 'GBP',
  attempt_count integer not null default 0, next_payment_attempt timestamptz,
  hosted_invoice_url text, period_start timestamptz, period_end timestamptz,
  livemode boolean not null default false, last_event_created bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists subscription_invoices_ws_idx on public.subscription_invoices(workspace_id, period_end desc);
alter table public.billing_customers enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
drop policy if exists billing_customers_read on public.billing_customers;
create policy billing_customers_read on public.billing_customers for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','finance']) or public.has_admin_permission('commerce'));
drop policy if exists workspace_subscriptions_read on public.workspace_subscriptions;
create policy workspace_subscriptions_read on public.workspace_subscriptions for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','manager','finance']) or public.has_admin_permission('commerce'));
drop policy if exists subscription_invoices_read on public.subscription_invoices;
create policy subscription_invoices_read on public.subscription_invoices for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','finance']) or public.has_admin_permission('commerce'));

-- Q01 least privilege: catalogue is public read-only; the mirror is read by members through RLS, written by the service role only.
revoke all on table public.plan_prices from anon, authenticated;
grant select on table public.plan_prices to anon, authenticated;
revoke all on table public.billing_customers, public.workspace_subscriptions, public.subscription_invoices from anon, authenticated;
grant select on table public.billing_customers, public.workspace_subscriptions, public.subscription_invoices to authenticated;

-- One ledger purchase per payment (Checkout Session id): the webhook can be replayed safely.
create unique index if not exists ai_credit_ledger_purchase_ref_uidx on public.ai_credit_ledger(payment_ref) where kind = 'purchase' and payment_ref is not null;

-- 3. Entitlement engine hook --------------------------------------------------------------------------------------------------
create or replace function public.workspace_has_paid_subscription(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_subscriptions s where s.workspace_id = p_workspace and s.status in ('active','trialing','past_due'));
$$;

create or replace function public.billing_link_customer(p_workspace uuid, p_customer text, p_livemode boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_workspace is null or coalesce(p_customer, '') !~ '^cus_[A-Za-z0-9]+$' then raise exception 'invalid_customer' using errcode = '22023'; end if;
  insert into public.billing_customers(workspace_id, stripe_customer_id, livemode) values (p_workspace, p_customer, coalesce(p_livemode, false))
  on conflict (workspace_id) do nothing;
end $$;

-- Applies a Stripe Subscription object (from a signed customer.subscription.* event) to the mirror and the workspace plan.
create or replace function public.billing_apply_subscription(p_sub jsonb, p_event_created bigint, p_livemode boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ws public.workspaces; cur public.workspace_subscriptions; pp public.plan_prices; item jsonb := p_sub -> 'items' -> 'data' -> 0;
  v_price text := coalesce(item -> 'price' ->> 'id', item -> 'plan' ->> 'id'); v_status text := p_sub ->> 'status';
  v_ws uuid; v_cust text := coalesce(p_sub ->> 'customer', p_sub -> 'customer' ->> 'id');
  pstart timestamptz; pend timestamptz; prev_plan text := p_sub -> 'metadata' ->> 'gd_previous_plan';
  down_at timestamptz := to_timestamp(nullif(p_sub -> 'metadata' ->> 'gd_downgrade_at', '')::double precision);
  effective text; before_plan text; v_pending text; v_pending_at timestamptz; prev_status text;
begin
  if coalesce(p_sub ->> 'id', '') !~ '^sub_[A-Za-z0-9_]+$' then raise exception 'invalid_subscription' using errcode = '22023'; end if;
  v_ws := nullif(p_sub -> 'metadata' ->> 'workspace_id', '')::uuid;
  if v_ws is null then select workspace_id into v_ws from public.billing_customers where stripe_customer_id = v_cust; end if;
  select * into ws from public.workspaces where id = v_ws;
  if not found then raise exception 'unknown_workspace' using errcode = 'P0002'; end if;
  select * into pp from public.plan_prices where (case when p_livemode then stripe_price_live else stripe_price_test end) = v_price;
  if not found then raise exception 'unknown_price %', v_price using errcode = 'P0002'; end if;
  if pp.kind <> ws.kind then raise exception 'plan_kind_mismatch' using errcode = '22023'; end if;
  pstart := to_timestamp(coalesce(p_sub ->> 'current_period_start', item ->> 'current_period_start')::double precision);
  pend := to_timestamp(coalesce(p_sub ->> 'current_period_end', item ->> 'current_period_end')::double precision);

  select * into cur from public.workspace_subscriptions where workspace_id = ws.id for update;
  if found then prev_status := cur.status; end if;
  if found and cur.stripe_subscription_id = p_sub ->> 'id' and p_event_created < cur.last_event_created then
    return jsonb_build_object('applied', false, 'reason', 'stale_event');
  end if;
  -- A different subscription only replaces the current one when the current one is no longer live.
  if found and cur.stripe_subscription_id <> p_sub ->> 'id' and cur.status in ('active','trialing','past_due') and v_status not in ('active','trialing') then
    return jsonb_build_object('applied', false, 'reason', 'superseded');
  end if;
  if v_cust is not null and v_cust ~ '^cus_' then perform public.billing_link_customer(ws.id, v_cust, p_livemode); end if;

  -- End-of-period downgrade: Gala Dock sets gd_previous_plan + gd_downgrade_at when it moves the price down; the higher
  -- entitlements stay until that time, then billing_sweep() applies the pending plan.
  if prev_plan is not null and down_at is not null and down_at > now() and v_status in ('active','trialing') then
    v_pending := pp.plan; v_pending_at := down_at; effective := prev_plan;
  else
    effective := pp.plan;
  end if;

  insert into public.workspace_subscriptions(workspace_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, kind, plan, billing_interval, status,
      current_period_start, current_period_end, cancel_at_period_end, canceled_at, ended_at, pending_plan, pending_effective_at, dunning_since, livemode, last_event_created)
    values (ws.id, p_sub ->> 'id', v_cust, v_price, pp.kind, pp.plan, pp.billing_interval, v_status, pstart, pend,
      coalesce((p_sub ->> 'cancel_at_period_end')::boolean, false), to_timestamp(nullif(p_sub ->> 'canceled_at', '')::double precision),
      to_timestamp(nullif(p_sub ->> 'ended_at', '')::double precision), v_pending, v_pending_at,
      case when v_status in ('past_due','unpaid') then now() end, coalesce(p_livemode, false), coalesce(p_event_created, 0))
  on conflict (workspace_id) do update set stripe_subscription_id = excluded.stripe_subscription_id, stripe_customer_id = excluded.stripe_customer_id,
      stripe_price_id = excluded.stripe_price_id, kind = excluded.kind, plan = excluded.plan, billing_interval = excluded.billing_interval, status = excluded.status,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
      canceled_at = excluded.canceled_at, ended_at = excluded.ended_at, pending_plan = excluded.pending_plan, pending_effective_at = excluded.pending_effective_at,
      dunning_since = case when excluded.status in ('past_due','unpaid') then coalesce(public.workspace_subscriptions.dunning_since, now()) end,
      livemode = excluded.livemode, last_event_created = excluded.last_event_created, updated_at = now()
  returning * into cur;

  before_plan := coalesce(ws.plan, 'starter');
  if v_status in ('active','trialing') then
    update public.workspaces set plan = effective where id = ws.id and plan is distinct from effective;
  elsif v_status = 'past_due' then
    -- Dunning grace: keep the plan while Stripe retries; billing_sweep() drops to Starter after 14 days.
    if cur.dunning_since < now() - interval '14 days' then update public.workspaces set plan = 'starter' where id = ws.id and plan is distinct from 'starter'; end if;
  elsif v_status in ('unpaid','canceled','incomplete_expired','paused') then
    update public.workspaces set plan = 'starter' where id = ws.id and plan is distinct from 'starter';
  end if;   -- 'incomplete': first payment not taken yet, entitlements unchanged

  if v_status = 'past_due' and prev_status is distinct from 'past_due' then
    perform public.notify_workspace(ws.id, array['owner','finance'], 'billing', 'Payment failed for your Gala Dock plan',
      'We couldn’t take your subscription payment. Update your card to keep your plan; Stripe will retry automatically.', case when ws.kind = 'provider' then '/provider/settings' else '/organizer/settings?tab=billing' end);
  end if;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', ws.id, 'billing.subscription_synced',
    jsonb_build_object('subscription', p_sub ->> 'id', 'status', v_status, 'plan', pp.plan, 'interval', pp.billing_interval, 'from_plan', before_plan,
      'to_plan', (select plan from public.workspaces where id = ws.id), 'pending_plan', v_pending, 'livemode', coalesce(p_livemode, false)));
  return jsonb_build_object('applied', true, 'workspace', ws.id, 'status', v_status, 'plan', (select plan from public.workspaces where id = ws.id), 'pending_plan', v_pending);
end $$;

-- Stripe Invoice (invoice.paid / invoice.payment_failed / invoice.finalized). Paid invoices settle the overage items they carry.
create or replace function public.billing_record_invoice(p_inv jsonb, p_event_created bigint, p_livemode boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_sub text := coalesce(p_inv ->> 'subscription', p_inv -> 'parent' -> 'subscription_details' ->> 'subscription'); n integer := 0;
begin
  if coalesce(p_inv ->> 'id', '') !~ '^in_[A-Za-z0-9_]+$' then raise exception 'invalid_invoice' using errcode = '22023'; end if;
  select workspace_id into v_ws from public.billing_customers where stripe_customer_id = coalesce(p_inv ->> 'customer', p_inv -> 'customer' ->> 'id');
  if v_ws is null then select workspace_id into v_ws from public.workspace_subscriptions where stripe_subscription_id = v_sub; end if;
  if v_ws is null then return jsonb_build_object('recorded', false, 'reason', 'unknown_customer'); end if;
  insert into public.subscription_invoices(stripe_invoice_id, workspace_id, stripe_subscription_id, status, billing_reason, amount_due, amount_paid, currency,
      attempt_count, next_payment_attempt, hosted_invoice_url, period_start, period_end, livemode, last_event_created)
    values (p_inv ->> 'id', v_ws, v_sub, coalesce(p_inv ->> 'status', 'open'), p_inv ->> 'billing_reason', coalesce((p_inv ->> 'amount_due')::integer, 0),
      coalesce((p_inv ->> 'amount_paid')::integer, 0), upper(coalesce(p_inv ->> 'currency', 'gbp')), coalesce((p_inv ->> 'attempt_count')::integer, 0),
      to_timestamp(nullif(p_inv ->> 'next_payment_attempt', '')::double precision), p_inv ->> 'hosted_invoice_url',
      to_timestamp(nullif(p_inv ->> 'period_start', '')::double precision), to_timestamp(nullif(p_inv ->> 'period_end', '')::double precision),
      coalesce(p_livemode, false), coalesce(p_event_created, 0))
  on conflict (stripe_invoice_id) do update set status = excluded.status, amount_due = excluded.amount_due, amount_paid = excluded.amount_paid,
      attempt_count = excluded.attempt_count, next_payment_attempt = excluded.next_payment_attempt, hosted_invoice_url = excluded.hosted_invoice_url,
      last_event_created = excluded.last_event_created, updated_at = now()
    where public.subscription_invoices.last_event_created <= excluded.last_event_created;
  if p_inv ->> 'status' = 'paid' then
    update public.ai_overage_charges o set status = 'paid', updated_at = now()
     where o.workspace_id = v_ws and o.status = 'invoiced'
       and o.invoice_ref in (select coalesce(l ->> 'invoice_item', l -> 'parent' -> 'invoice_item_details' ->> 'invoice_item', l ->> 'id')
                               from jsonb_array_elements(coalesce(p_inv -> 'lines' -> 'data', '[]'::jsonb)) l);
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('recorded', true, 'workspace', v_ws, 'overage_settled', n);
end $$;

-- A paid credit-pack Checkout Session (mode=payment, metadata.purpose=ai_credits). Idempotent on the session id.
create or replace function public.billing_credit_pack_paid(p_session jsonb, p_livemode boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.credit_packs; v_ws uuid := nullif(p_session -> 'metadata' ->> 'workspace_id', '')::uuid; ws public.workspaces; v_id uuid;
begin
  if coalesce(p_session ->> 'id', '') !~ '^cs_[A-Za-z0-9_]+$' or p_session -> 'metadata' ->> 'purpose' <> 'ai_credits' then raise exception 'invalid_session' using errcode = '22023'; end if;
  if p_session ->> 'payment_status' <> 'paid' then return jsonb_build_object('credited', false, 'reason', 'not_paid'); end if;
  select * into k from public.credit_packs where id = nullif(p_session -> 'metadata' ->> 'pack_id', '')::uuid;
  if not found then raise exception 'unknown_pack' using errcode = 'P0002'; end if;
  select * into ws from public.workspaces where id = v_ws;
  if not found or not (ws.kind = any (k.workspace_kinds)) then raise exception 'pack_not_for_workspace' using errcode = '22023'; end if;
  if coalesce((p_session ->> 'amount_subtotal')::integer, (p_session ->> 'amount_total')::integer, -1) <> k.price_minor
     or upper(coalesce(p_session ->> 'currency', '')) <> upper(k.currency) then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;
  insert into public.ai_credit_ledger(workspace_id, kind, credits, reference, pack_id, payment_ref, expires_at)
    values (ws.id, 'purchase', k.credits, 'Credit pack ' || k.name, k.id, p_session ->> 'id', case when k.expiry_days is not null then now() + make_interval(days => k.expiry_days) end)
  on conflict (payment_ref) where kind = 'purchase' and payment_ref is not null do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('credited', false, 'reason', 'duplicate'); end if;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', ws.id, 'billing.credit_pack_paid',
    jsonb_build_object('session', p_session ->> 'id', 'pack', k.name, 'credits', k.credits, 'amount_minor', k.price_minor, 'livemode', coalesce(p_livemode, false)));
  return jsonb_build_object('credited', true, 'credits', k.credits, 'ledger_id', v_id);
end $$;

-- 4. Overage → invoice items (app job 'billing.invoice_overage', Stripe call in TypeScript) -------------------------------------
create or replace function public.billing_overage_due(p_before date default null) returns table (id uuid, workspace_id uuid, period date, credits numeric, amount_minor integer, stripe_customer_id text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.workspace_id, o.period, o.credits, o.amount_minor, c.stripe_customer_id
    from public.ai_overage_charges o join public.billing_customers c on c.workspace_id = o.workspace_id
   where o.status = 'accrued' and o.amount_minor > 0 and o.period < coalesce(p_before, date_trunc('month', now() at time zone 'utc')::date)
   order by o.period, o.workspace_id limit 200;
$$;
create or replace function public.billing_mark_overage_invoiced(p_id uuid, p_item text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_item, '') !~ '^ii_[A-Za-z0-9_]+$' then raise exception 'invalid_item' using errcode = '22023'; end if;
  update public.ai_overage_charges set status = 'invoiced', invoice_ref = p_item, updated_at = now() where id = p_id and status = 'accrued';
  return found;
end $$;

-- 5. Daily sweep: due end-of-period downgrades and expired dunning grace (job_queue, runtime db). --------------------------------
create or replace function public.job_billing_sweep(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d integer := 0; g integer := 0;
begin
  with due as (update public.workspace_subscriptions s set plan = s.pending_plan, pending_plan = null, pending_effective_at = null, updated_at = now()
                where s.pending_plan is not null and s.pending_effective_at <= now() and s.status in ('active','trialing') returning s.workspace_id, s.plan)
  update public.workspaces w set plan = due.plan from due where w.id = due.workspace_id and w.plan is distinct from due.plan;
  get diagnostics d = row_count;
  update public.workspaces w set plan = 'starter' from public.workspace_subscriptions s
   where s.workspace_id = w.id and s.status in ('past_due','unpaid') and s.dunning_since < now() - interval '14 days' and w.plan is distinct from 'starter';
  get diagnostics g = row_count;
  if d + g > 0 then insert into public.audit_events(actor_type, event, metadata) values ('system', 'billing.sweep_applied', jsonb_build_object('downgrades', d, 'dunning_expired', g)); end if;
  return jsonb_build_object('downgrades', d, 'dunning_expired', g);
end $$;

insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('billing.sweep', 'db', 'public.job_billing_sweep', 3, 'Q28: apply due end-of-period plan downgrades and expired 14-day dunning grace'),
  ('billing.invoice_overage', 'app', null, 5, 'Q28: turn accrued AI overage of closed months into Stripe invoice items on the workspace customer (test mode only)')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, description = excluded.description, updated_at = now();
select cron.unschedule('billing-daily') where exists (select 1 from cron.job where jobname = 'billing-daily');
select cron.schedule('billing-daily', '25 6 * * *', $$
  select public.enqueue_job(p_kind => 'billing.sweep', p_payload => '{}'::jsonb, p_dedupe_key => 'billing.sweep:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
  select public.enqueue_job(p_kind => 'billing.invoice_overage', p_payload => '{}'::jsonb, p_dedupe_key => 'billing.invoice_overage:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
$$);

-- Grants (Q01): every function here is service-only (webhook, jobs, server actions with the admin client).
revoke all on function public.workspace_has_paid_subscription(uuid), public.billing_link_customer(uuid, text, boolean),
  public.billing_apply_subscription(jsonb, bigint, boolean), public.billing_record_invoice(jsonb, bigint, boolean),
  public.billing_credit_pack_paid(jsonb, boolean), public.billing_overage_due(date), public.billing_mark_overage_invoiced(uuid, text),
  public.job_billing_sweep(public.job_queue) from public, anon, authenticated;
grant execute on function public.workspace_has_paid_subscription(uuid), public.billing_link_customer(uuid, text, boolean),
  public.billing_apply_subscription(jsonb, bigint, boolean), public.billing_record_invoice(jsonb, bigint, boolean),
  public.billing_credit_pack_paid(jsonb, boolean), public.billing_overage_due(date), public.billing_mark_overage_invoiced(uuid, text),
  public.job_billing_sweep(public.job_queue) to service_role;
