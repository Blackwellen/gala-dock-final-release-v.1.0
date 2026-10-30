-- Lane A2 · Stripe test → live go-live safety. Additive only; nothing is deleted or rewritten except bounded, idempotent backfills of
-- NEW shadow columns and of NULL livemode flags (→ false = test). Existing rows are all Stripe TEST MODE (no live payment has ever been
-- taken: webhook_events.livemode = true count is 0 at authoring time).
--
-- HOW THE MODE REACHES THE DATABASE (single source of truth = the app's platform key prefix, src/lib/payments/stripe-mode.ts):
--   1. Per request: the service-role client (src/lib/supabase/admin.ts) sends `x-gala-stripe-mode: live|test`, derived from the key.
--      public.stripe_livemode() honours that header ONLY for role service_role (a browser cannot choose the mode).
--   2. Platform record: public.stripe_platform_mode (singleton) holds the PRODUCTION deployment's mode. Only the production server
--      writes it (src/instrumentation.ts register() → stripe_set_platform_mode, VERCEL_ENV=production only); preview/local never do.
--      It is the fallback for every caller without the header (anon/authenticated page reads, pg_cron jobs, SQL editor).
--   stripe_livemode() = header (service_role) ?? platform record ?? false (test).
--
-- CONNECTED ACCOUNTS PER MODE (smallest safe change — no new table, no PK change, every existing reader keeps working in test):
--   workspaces.stripe_account_id        = TEST account id (historic column, unchanged)
--   workspaces.stripe_account_id_live   = LIVE account id (new; filled only by live onboarding)
--   connect_accounts.livemode           = which mode the one snapshot row belongs to (existing rows = test)
--   A live snapshot may replace a test one; a test snapshot can never replace a live one (trigger), so a test-mode server sharing
--   this database can never downgrade a live seller. Every readiness / checkout / payout function below only accepts a row whose
--   livemode = stripe_livemode(): a test account in live mode reads as "not ready — set up payouts", never as an error.
--   workspaces.payout_status (read widely) becomes the mirror of the PLATFORM mode: per-mode shadows payout_status_test/_live are
--   kept by the sync and copied in by stripe_set_platform_mode() when the platform flips (and back on rollback).
--
-- MONEY ROWS PER MODE: every payment/ledger/payout/refund/reconciliation table gets livemode (existing rows false = test); new rows
-- default to stripe_livemode(); live dashboards, reconciliation and refunds filter on it. Rows are never deleted.
begin;

-- ───────────────────────── 1. platform mode record ─────────────────────────
create table if not exists public.stripe_platform_mode (
  id boolean primary key default true check (id),
  livemode boolean not null default false,
  source text not null default 'migration',
  updated_at timestamptz not null default now()
);
alter table public.stripe_platform_mode enable row level security;
revoke all on public.stripe_platform_mode from anon, authenticated;
grant select on public.stripe_platform_mode to authenticated;
drop policy if exists stripe_platform_mode_admin_read on public.stripe_platform_mode;
create policy stripe_platform_mode_admin_read on public.stripe_platform_mode for select to authenticated using (public.is_platform_admin());
insert into public.stripe_platform_mode(id, livemode, source) values (true, false, 'migration') on conflict (id) do nothing;

create or replace function public.stripe_platform_livemode() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select m.livemode from public.stripe_platform_mode m where m.id), false);
$$;

create or replace function public.stripe_livemode() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_mode text;
begin
  begin
    v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
    if v_role = 'service_role' then
      v_mode := lower(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-gala-stripe-mode', ''));
      if v_mode = 'live' then return true; elsif v_mode = 'test' then return false; end if;
    end if;
  exception when others then null;   -- malformed GUC: fall back to the platform record
  end;
  return public.stripe_platform_livemode();
end $$;
grant execute on function public.stripe_platform_livemode(), public.stripe_livemode() to anon, authenticated, service_role;

-- ───────────────────────── 2. per-mode ids and shadows ─────────────────────────
alter table public.workspaces
  add column if not exists stripe_account_id_live text,
  add column if not exists payout_status_test text,
  add column if not exists payout_status_live text;
do $$ begin
  alter table public.workspaces add constraint workspaces_payout_test_check check (payout_status_test is null or payout_status_test in ('not_connected','incomplete','pending','active','restricted'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.workspaces add constraint workspaces_payout_live_check check (payout_status_live is null or payout_status_live in ('not_connected','incomplete','pending','active','restricted'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.workspaces add constraint workspaces_stripe_account_modes_distinct check (stripe_account_id_live is null or stripe_account_id_live is distinct from stripe_account_id);
exception when duplicate_object then null; end $$;
create unique index if not exists workspaces_stripe_account_live_unique on public.workspaces(stripe_account_id_live) where stripe_account_id_live is not null;
-- Backfill: today's payout_status is test-derived (bounded: only rows not yet shadowed).
update public.workspaces set payout_status_test = payout_status where payout_status_test is null;

alter table public.connect_accounts add column if not exists livemode boolean not null default false;
-- Customer (saved cards) id per mode: profiles.stripe_customer_id stays the test one.
alter table public.profiles add column if not exists stripe_customer_id_live text;

-- A test snapshot can never overwrite a live one (a test-mode server shares this database).
create or replace function public.connect_accounts_live_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.livemode and not new.livemode then raise exception 'connect_live_row_protected' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists connect_accounts_live_guard on public.connect_accounts;
create trigger connect_accounts_live_guard before update on public.connect_accounts for each row execute function public.connect_accounts_live_guard();

-- ───────────────────────── 3. money rows flagged by mode ─────────────────────────
-- New columns: existing rows get false (test) at add time; new rows default to the request's mode.
alter table public.transactions add column if not exists livemode boolean not null default false;
alter table public.ledger_transactions add column if not exists livemode boolean not null default false;
alter table public.checkout_orders add column if not exists livemode boolean not null default false;
alter table public.payments add column if not exists livemode boolean not null default false;
alter table public.payment_refunds add column if not exists livemode boolean not null default false;
alter table public.resale_payouts add column if not exists livemode boolean not null default false;
alter table public.reconciliation_runs add column if not exists livemode boolean not null default false;
alter table public.merch_card_refunds add column if not exists livemode boolean not null default false;
alter table public.transactions alter column livemode set default public.stripe_livemode();
alter table public.ledger_transactions alter column livemode set default public.stripe_livemode();
alter table public.checkout_orders alter column livemode set default public.stripe_livemode();
alter table public.payments alter column livemode set default public.stripe_livemode();
alter table public.payment_refunds alter column livemode set default public.stripe_livemode();
alter table public.resale_payouts alter column livemode set default public.stripe_livemode();
alter table public.reconciliation_runs alter column livemode set default public.stripe_livemode();
alter table public.merch_card_refunds alter column livemode set default public.stripe_livemode();
-- Existing nullable livemode columns: NULL → false (test) backfill, then the same default. Explicit webhook values still win.
update public.payment_orders set livemode = false where livemode is null;
update public.connected_payouts set livemode = false where livemode is null;
update public.application_fee_records set livemode = false where livemode is null;
update public.stripe_disputes set livemode = false where livemode is null;
update public.invoice_card_payments set livemode = false where livemode is null;
update public.merch_orders set livemode = false where livemode is null;
alter table public.payment_orders alter column livemode set default public.stripe_livemode();
alter table public.connected_payouts alter column livemode set default public.stripe_livemode();
alter table public.application_fee_records alter column livemode set default public.stripe_livemode();
alter table public.stripe_disputes alter column livemode set default public.stripe_livemode();
alter table public.invoice_card_payments alter column livemode set default public.stripe_livemode();
alter table public.merch_orders alter column livemode set default public.stripe_livemode();
create index if not exists transactions_livemode_occurred on public.transactions(livemode, occurred_at desc);
create index if not exists reconciliation_runs_livemode on public.reconciliation_runs(livemode, started_at desc);

-- ───────────────────────── 4. platform mode switch (production server only) ─────────────────────────
create or replace function public.stripe_set_platform_mode(p_livemode boolean, p_source text default 'app') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare prev boolean; n integer := 0;
begin
  if p_livemode is null then raise exception 'mode_required' using errcode = '22023'; end if;
  select m.livemode into prev from public.stripe_platform_mode m where m.id for update;
  if prev is not distinct from p_livemode then return jsonb_build_object('changed', false, 'livemode', p_livemode); end if;
  insert into public.stripe_platform_mode(id, livemode, source, updated_at) values (true, p_livemode, left(coalesce(p_source, 'app'), 40), now())
    on conflict (id) do update set livemode = excluded.livemode, source = excluded.source, updated_at = now();
  -- payout_status mirrors the new mode: its shadow, or not_connected when the workspace has no account in that mode.
  update public.workspaces w set payout_status = coalesce(case when p_livemode then w.payout_status_live else w.payout_status_test end, 'not_connected')
    where w.payout_status is distinct from coalesce(case when p_livemode then w.payout_status_live else w.payout_status_test end, 'not_connected');
  get diagnostics n = row_count;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'stripe.platform_mode_changed',
    jsonb_build_object('from', case when prev then 'live' else 'test' end, 'to', case when p_livemode then 'live' else 'test' end, 'source', left(coalesce(p_source, 'app'), 40), 'workspaces_updated', n));
  return jsonb_build_object('changed', true, 'livemode', p_livemode, 'workspaces_updated', n);
end $$;
revoke all on function public.stripe_set_platform_mode(boolean, text) from public, anon, authenticated;
grant execute on function public.stripe_set_platform_mode(boolean, text) to service_role;

-- Sync of one workspace's payout status for a mode: always the shadow; payout_status only when it is the platform mode.
create or replace function public.stripe_workspace_payout_sync(p_workspace uuid, p_livemode boolean, p_status text, p_account text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('not_connected','incomplete','pending','active','restricted') then raise exception 'bad_status' using errcode = '22023'; end if;
  if p_account is not null and p_account !~ '^acct_[A-Za-z0-9_]+$' then raise exception 'bad_account' using errcode = '22023'; end if;
  if p_livemode then
    update public.workspaces set payout_status_live = p_status, stripe_account_id_live = coalesce(p_account, stripe_account_id_live) where id = p_workspace;
  else
    update public.workspaces set payout_status_test = p_status, stripe_account_id = coalesce(p_account, stripe_account_id) where id = p_workspace;
  end if;
  if p_livemode = public.stripe_platform_livemode() then
    update public.workspaces set payout_status = p_status where id = p_workspace and payout_status is distinct from p_status;
  end if;
end $$;
revoke all on function public.stripe_workspace_payout_sync(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.stripe_workspace_payout_sync(uuid, boolean, text, text) to service_role;

-- ───────────────────────── 5. readiness / checkout / payouts read the current mode only ─────────────────────────
-- Bodies are the 202610291009 / 202610291047 / 202610294019 versions with one added predicate: ca.livemode = stripe_livemode().
create or replace function public.event_seller_workspace(p_event uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(e.workspace_id, (select w.id from public.workspaces w join public.connect_accounts ca on ca.workspace_id = w.id and ca.livemode = public.stripe_livemode()
    where w.owner_id = e.owner_id order by ca.charges_enabled desc, w.created_at limit 1))
  from public.events e where e.id = p_event;
$$;
create or replace function public.user_seller_workspace(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select w.id from public.workspaces w join public.connect_accounts ca on ca.workspace_id = w.id and ca.livemode = public.stripe_livemode()
  where w.owner_id = p_user and w.status = 'active' order by ca.charges_enabled desc, (ca.card_payments_capability = 'active') desc, w.created_at limit 1;
$$;
create or replace function public.seller_payment_account(p_workspace uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('workspace_id', w.id, 'name', w.name, 'stripe_account_id', ca.stripe_account_id,
    'charges_enabled', coalesce(ca.charges_enabled, false), 'card_payments', coalesce(ca.card_payments_capability, 'inactive'),
    'details_submitted', coalesce(ca.details_submitted, false), 'disabled_reason', ca.disabled_reason,
    'past_due', to_jsonb(coalesce(ca.requirements_past_due, '{}'::text[])), 'country', ca.country, 'default_currency', ca.default_currency,
    'livemode', public.stripe_livemode())
  from public.workspaces w left join public.connect_accounts ca on ca.workspace_id = w.id and ca.livemode = public.stripe_livemode() where w.id = p_workspace;
$$;
create or replace function public.event_payment_readiness(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.connect_accounts ca where ca.workspace_id = public.event_seller_workspace(p_event)
      and ca.livemode = public.stripe_livemode()
      and ca.stripe_account_id is not null and ca.charges_enabled and ca.card_payments_capability = 'active' and ca.disabled_reason is null
      and coalesce(array_length(ca.requirements_past_due, 1), 0) = 0) then 'ready' else 'seller_not_ready' end;
$$;

create or replace function public.payment_order_direct_prepare(p_ref text, p_account text, p_merchant jsonb, p_terms jsonb, p_group text default null)
returns public.payment_orders language plpgsql security definer set search_path = '' as $$
declare po public.payment_orders; ca public.connect_accounts;
begin
  select * into po from public.payment_orders where reference = p_ref for update;
  if not found then raise exception 'unknown_order' using errcode = 'P0002'; end if;
  if po.kind not in ('deposit','balance_payment','standby_fee','emergency_service','supplier_booking','venue_hire') then raise exception 'not_marketplace' using errcode = '22023'; end if;
  if po.status not in ('amount_due','payment_pending','failed') then raise exception 'already_paid' using errcode = '22023'; end if;
  select * into ca from public.connect_accounts where workspace_id = po.payee_workspace_id and livemode = public.stripe_livemode();
  if not found or ca.stripe_account_id is distinct from p_account or not ca.charges_enabled or ca.card_payments_capability <> 'active'
     or ca.disabled_reason is not null or coalesce(array_length(ca.requirements_past_due, 1), 0) > 0 then
    raise exception 'seller_not_ready' using errcode = '22023';
  end if;
  -- Recovery keeps the same merchant (123.7): an order already bound to another account is never silently re-pointed.
  if po.strategy = 'direct' and po.payee_connected_account_id is distinct from p_account and po.stripe_checkout_session is not null then
    raise exception 'merchant_changed' using errcode = '22023';
  end if;
  update public.payment_orders set strategy = 'direct', payee_connected_account_id = p_account,
    application_fee_minor = least(po.platform_fee_minor + po.customer_fee_minor, po.amount_minor + po.customer_fee_minor),
    merchant_of_record = coalesce(p_merchant, '{}'::jsonb) || jsonb_build_object('stripe_account_id', p_account, 'snapshotted_at', now()),
    terms_snapshot = coalesce(po.terms_snapshot, p_terms), order_group = coalesce(po.order_group, p_group),
    -- A platform-context Checkout Session from before the switch can never be reused for a connected-account charge.
    stripe_checkout_session = case when po.strategy = 'direct' then po.stripe_checkout_session end,
    livemode = public.stripe_livemode(),
    updated_at = now()
  where id = po.id returning * into po;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', po.payee_workspace_id, 'payment.direct_prepared',
    jsonb_build_object('payment_order', po.reference, 'stripe_account', p_account, 'application_fee_minor', po.application_fee_minor));
  return po;
end $$;

create or replace function public.checkout_order_direct_prepare(p_ref text, p_seller uuid, p_account text, p_fee_minor bigint, p_merchant jsonb, p_fee_rule jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.checkout_orders; ca public.connect_accounts;
begin
  select * into o from public.checkout_orders where order_ref = p_ref for update;
  if not found then raise exception 'unknown_order' using errcode = 'P0002'; end if;
  if o.status <> 'pending' or o.stripe_session is not null then raise exception 'not_pending' using errcode = '22023'; end if;
  select * into ca from public.connect_accounts where workspace_id = p_seller and livemode = public.stripe_livemode();
  if not found or ca.stripe_account_id is distinct from p_account or not ca.charges_enabled or ca.card_payments_capability <> 'active'
     or ca.disabled_reason is not null or coalesce(array_length(ca.requirements_past_due, 1), 0) > 0 then
    raise exception 'seller_not_ready' using errcode = '22023';
  end if;
  update public.checkout_orders set strategy = 'direct', seller_workspace_id = p_seller, connected_account_id = p_account, application_fee_minor = p_fee_minor,
    merchant_of_record = coalesce(p_merchant, '{}'::jsonb) || jsonb_build_object('stripe_account_id', p_account, 'snapshotted_at', now()),
    fee_rule_snapshot = p_fee_rule, livemode = public.stripe_livemode(), updated_at = now()
  where order_ref = p_ref;
end $$;

create or replace function public.merch_direct_prepare(p_ref text, p_account text, p_merchant jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.merch_orders; ca public.connect_accounts; rule jsonb; com bigint; vat bigint; fee bigint;
begin
  select * into o from public.merch_orders where order_ref = p_ref for update;
  if not found then raise exception 'unknown_order' using errcode = 'P0002'; end if;
  if o.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  if o.expires_at < now() then raise exception 'reservation_expired' using errcode = '22023'; end if;
  if o.total_minor <= 0 then raise exception 'empty_order' using errcode = '22023'; end if;
  select * into ca from public.connect_accounts where workspace_id = o.workspace_id and livemode = public.stripe_livemode();
  if not found or ca.stripe_account_id is distinct from p_account or not ca.charges_enabled or ca.card_payments_capability <> 'active'
     or ca.disabled_reason is not null or coalesce(array_length(ca.requirements_past_due, 1), 0) > 0 then
    raise exception 'seller_not_ready' using errcode = '22023';
  end if;
  if o.connected_account_id is not null then
    if o.connected_account_id <> p_account and o.stripe_checkout_session is not null then raise exception 'merchant_changed' using errcode = '22023'; end if;
    if o.connected_account_id = p_account and o.application_fee_minor is not null then
      return to_jsonb(o) - 'collection_code_hash';
    end if;
  end if;
  rule := public.resolve_commission(o.workspace_id, 'merchandise', null, null);
  com := least(o.total_minor, round(o.total_minor * coalesce((rule->>'rate_bps')::numeric, 1000) / 10000) + coalesce((rule->>'fixed_minor')::bigint, 0));
  vat := round(com * 0.2);
  fee := least(o.total_minor, com + vat);
  vat := least(vat, fee);
  update public.merch_orders set strategy = 'direct', seller_workspace_id = o.workspace_id, connected_account_id = p_account, application_fee_minor = fee,
    application_fee_vat_minor = vat, fee_rule_snapshot = rule, updated_at = now(), livemode = public.stripe_livemode(),
    -- Stripe Checkout lives at least 30 minutes: hold the stock for the session's lifetime so a normal payment never lands late.
    expires_at = greatest(o.expires_at, now() + interval '31 minutes'),
    merchant_of_record = coalesce(p_merchant, '{}'::jsonb) || jsonb_build_object('stripe_account_id', p_account, 'snapshotted_at', now())
  where id = o.id returning * into o;
  return to_jsonb(o) - 'collection_code_hash';
end $$;

create or replace function public.invoice_card_payment_open(p_invoice uuid, p_session text, p_account text, p_amount_minor bigint, p_fee_minor bigint, p_currency text, p_livemode boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.invoices; v_id uuid;
begin
  select * into i from public.invoices where invoices.id = p_invoice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.connect_accounts ca where ca.workspace_id = i.workspace_id and ca.stripe_account_id = p_account and ca.livemode = public.stripe_livemode()) then
    raise exception 'seller_not_ready' using errcode = '22023';
  end if;
  insert into public.invoice_card_payments(invoice_id, workspace_id, connected_account_id, stripe_checkout_session, amount_minor, application_fee_minor, currency, livemode)
    values (p_invoice, i.workspace_id, p_account, p_session, p_amount_minor, p_fee_minor, upper(p_currency), p_livemode)
    on conflict (stripe_checkout_session) do update set updated_at = now()
    returning invoice_card_payments.id into v_id;
  return v_id;
end $$;

create or replace function public.payout_eligible(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.payouts_enabled and c.transfers_capability = 'active' and c.disabled_reason is null
                     and cardinality(c.requirements_past_due) = 0
                   from public.connect_accounts c where c.workspace_id = p_workspace and c.livemode = public.stripe_livemode()), false)
    and not public.risk_hold_active('payout', 'workspace', p_workspace);
$$;

commit;
