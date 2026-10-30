-- Q07 · FCA-aware direct-charge payment schema (backend §13.16, domain cards 123–131).
-- Marketplace and ticket-sale charges move to Stripe Connect DIRECT charges on the seller's connected account with
-- Gala Dock's commission taken as an application fee. This migration is ADDITIVE and backward-compatible with the code
-- deployed today: new nullable/defaulted columns, generated columns derived from existing data, new tables, and two
-- CHECK constraints that are only WIDENED (ledger accounts / kinds) — nothing that currently passes can fail afterwards.
-- The ledger stays an accounting memo of seller-owned funds and platform fee revenue; it never represents custody.

-- ───────────────────────── payment_orders (marketplace bookings, boosts) ─────────────────────────
alter table public.payment_orders
  add column if not exists payee_connected_account_id text,
  add column if not exists merchant_of_record jsonb,
  add column if not exists terms_snapshot jsonb,
  add column if not exists application_fee_minor bigint check (application_fee_minor is null or application_fee_minor >= 0),
  add column if not exists stripe_application_fee text,
  add column if not exists stripe_balance_transaction text,
  add column if not exists order_group text;
-- Derived, so legacy rows are described honestly without rewriting data: separate_transfer/destination orders WERE collected
-- by the platform; direct orders never are; 'platform' rows are Gala Dock's own sales (boosts), not customer marketplace funds.
alter table public.payment_orders
  add column if not exists payment_route text generated always as (case strategy when 'direct' then 'DIRECT_CONNECTED_ACCOUNT'
    when 'platform' then 'PLATFORM_OWN_SALE' else 'LEGACY_PLATFORM_COLLECTION' end) stored,
  add column if not exists funds_custodied_by_platform boolean generated always as (strategy in ('separate_transfer','destination')) stored;
-- Direct-charge invariants (123.B 1, 5): exactly one payee connected account; 0 <= application fee <= gross. No existing row
-- has strategy 'direct' and the deployed code never writes it, so this cannot reject current traffic.
alter table public.payment_orders drop constraint if exists payment_orders_direct_invariants;
alter table public.payment_orders add constraint payment_orders_direct_invariants check (
  strategy <> 'direct' or (payee_connected_account_id ~ '^acct_[A-Za-z0-9_]+$' and application_fee_minor is not null
    and application_fee_minor <= amount_minor + customer_fee_minor and payee_workspace_id is not null)) not valid;
alter table public.payment_orders validate constraint payment_orders_direct_invariants;
create index if not exists payment_orders_account_idx on public.payment_orders(payee_connected_account_id) where payee_connected_account_id is not null;
create index if not exists payment_orders_group_idx on public.payment_orders(order_group) where order_group is not null;

-- ───────────────────────── checkout_orders (ticket sales and official resale) ─────────────────────────
alter table public.checkout_orders
  add column if not exists strategy text not null default 'platform' check (strategy in ('platform','direct')),
  add column if not exists seller_workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists connected_account_id text,
  add column if not exists merchant_of_record jsonb,
  add column if not exists fee_rule_snapshot jsonb,
  add column if not exists application_fee_minor bigint check (application_fee_minor is null or application_fee_minor >= 0),
  add column if not exists stripe_payment_intent text,
  add column if not exists stripe_charge text,
  add column if not exists stripe_application_fee text;
alter table public.checkout_orders
  add column if not exists payment_route text generated always as (case strategy when 'direct' then 'DIRECT_CONNECTED_ACCOUNT' else 'LEGACY_PLATFORM_COLLECTION' end) stored,
  add column if not exists funds_custodied_by_platform boolean generated always as (strategy = 'platform' and amount > 0) stored;
alter table public.checkout_orders drop constraint if exists checkout_orders_direct_invariants;
alter table public.checkout_orders add constraint checkout_orders_direct_invariants check (
  strategy <> 'direct' or (connected_account_id ~ '^acct_[A-Za-z0-9_]+$' and seller_workspace_id is not null and application_fee_minor is not null
    and application_fee_minor <= round((amount + fee) * 100))) not valid;
alter table public.checkout_orders validate constraint checkout_orders_direct_invariants;
create index if not exists checkout_orders_pi_idx on public.checkout_orders(stripe_payment_intent) where stripe_payment_intent is not null;
create index if not exists checkout_orders_session_idx on public.checkout_orders(stripe_session) where stripe_session is not null;

-- ───────────────────────── connected accounts (card 125.E) ─────────────────────────
alter table public.connect_accounts
  add column if not exists controller jsonb,
  add column if not exists fees_payer text,
  add column if not exists losses_payments text,
  add column if not exists dashboard_type text,
  add column if not exists business_type text,
  add column if not exists capabilities_json jsonb not null default '{}',
  add column if not exists requirements_json jsonb not null default '{}',
  add column if not exists last_synced_at timestamptz;
create unique index if not exists connect_accounts_stripe_unique on public.connect_accounts(stripe_account_id) where stripe_account_id is not null;

-- ───────────────────────── webhook context (card 123.H) ─────────────────────────
alter table public.webhook_events
  add column if not exists stripe_account text,
  add column if not exists object_id text,
  add column if not exists endpoint text check (endpoint is null or endpoint in ('platform','connect'));

alter table public.stripe_disputes
  add column if not exists stripe_account_id text,
  add column if not exists liability text check (liability is null or liability in ('connected_account','platform'));

-- ───────────────────────── ledger: memo accounts for seller-owned funds (card 127) ─────────────────────────
-- WIDENED only: every existing value stays valid.
--   merchant_gmv              analytical gross sales of the seller (never platform revenue or cash)
--   seller_connected_balance  memo of funds settling in the SELLER's Stripe balance (not a Gala Dock liability)
--   seller_application_fees   memo of the application fee the seller's charge paid to Gala Dock
--   seller_refunds / seller_disputes / seller_payouts   memo movements on the seller's connected account
alter table public.ledger_entries drop constraint if exists ledger_entries_account_check;
alter table public.ledger_entries add constraint ledger_entries_account_check check (account in (
  'customer_payment','platform_revenue','platform_fee','processing_cost','tax_payable','provider_payable','promoter_payable','affiliate_payable',
  'refunds','disputes','payouts','cash_stripe',
  'merchant_gmv','seller_connected_balance','seller_application_fees','seller_refunds','seller_disputes','seller_payouts'));
alter table public.ledger_transactions drop constraint if exists ledger_transactions_kind_check;
alter table public.ledger_transactions add constraint ledger_transactions_kind_check check (kind in (
  'booking_payment','deposit','balance_payment','standby_fee','emergency_service','ticket_order','ticket_resale','refund','platform_boost','subscription',
  'provider_payout','promoter_commission','affiliate_commission','dispute','reversal','adjustment',
  'invoice_payment','application_fee_refund','connected_payout'));
-- How a transaction should be read. NULL = posted before Q07 (legacy platform-collection model).
alter table public.ledger_transactions add column if not exists basis text
  check (basis is null or basis in ('direct_charge_memo','platform_own_sale','legacy_platform_collection'));

-- ───────────────────────── application fees, refunds, payouts (cards 125.7, 130, 129) ─────────────────────────
create table if not exists public.application_fee_records (
  stripe_application_fee_id text primary key,
  stripe_account_id text not null,
  charge_id text,
  payment_intent_id text,
  source_type text check (source_type is null or source_type in ('payment_order','checkout_order','invoice_card_payment')),
  source_ref text,
  amount_minor bigint not null check (amount_minor >= 0),
  amount_refunded_minor bigint not null default 0 check (amount_refunded_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  livemode boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists application_fee_records_source_idx on public.application_fee_records(source_type, source_ref);

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  stripe_refund_id text unique,
  stripe_account_id text not null,
  payment_intent_id text not null,
  source_type text not null check (source_type in ('payment_order','checkout_order','invoice_card_payment','booking_cancellation','resale')),
  source_ref text not null,
  amount_minor bigint not null check (amount_minor > 0),
  refund_application_fee boolean not null default false,
  fee_policy text not null check (fee_policy in ('full','proportional','retained')),
  reason_code text not null,
  idempotency_key text not null unique,
  status text not null default 'requested' check (status in ('requested','pending','succeeded','failed','canceled')),
  requested_by uuid references auth.users(id),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_refunds_source_idx on public.payment_refunds(source_type, source_ref);

-- Mirror of connected-account payouts (informational; Stripe owns them — card 129).
create table if not exists public.connected_payouts (
  stripe_payout_id text primary key,
  stripe_account_id text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  amount_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending','in_transit','paid','failed','canceled')),
  method text, arrival_date timestamptz, failure_code text, failure_message text,
  livemode boolean,
  last_event_created bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists connected_payouts_ws_idx on public.connected_payouts(workspace_id, arrival_date desc);

-- Card-paid invoices (/pay/[token]) are direct charges on the issuing organiser's account.
create table if not exists public.invoice_card_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connected_account_id text not null check (connected_account_id ~ '^acct_[A-Za-z0-9_]+$'),
  stripe_checkout_session text unique,
  stripe_payment_intent text unique,
  amount_minor bigint not null check (amount_minor > 0),
  application_fee_minor bigint not null default 0 check (application_fee_minor >= 0 and application_fee_minor <= amount_minor),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','expired')),
  livemode boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoice_card_payments_invoice_idx on public.invoice_card_payments(invoice_id, status);

-- ───────────────────────── reconciliation (card 128) ─────────────────────────
create table if not exists public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'direct_charges',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','clean','variances','failed')),
  checked integer not null default 0,
  variances integer not null default 0,
  error text
);
create table if not exists public.reconciliation_items (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.reconciliation_runs(id) on delete cascade,
  source_type text not null,
  source_ref text not null,
  stripe_account_id text,
  stripe_object_id text,
  variance text not null,
  severity text not null check (severity in ('critical','warning','info')),
  expected jsonb, actual jsonb,
  created_at timestamptz not null default now()
);
create index if not exists reconciliation_items_run_idx on public.reconciliation_items(run_id);
create index if not exists reconciliation_items_source_idx on public.reconciliation_items(source_type, source_ref);

-- Immutable run results.
drop trigger if exists reconciliation_items_immutable on public.reconciliation_items;
create trigger reconciliation_items_immutable before update or delete on public.reconciliation_items for each row execute function public.ledger_immutable();

-- RLS: service role writes; finance roles of the seller workspace and commerce admins read. No anon access.
alter table public.application_fee_records enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.connected_payouts enable row level security;
alter table public.invoice_card_payments enable row level security;
alter table public.reconciliation_runs enable row level security;
alter table public.reconciliation_items enable row level security;
revoke all on public.application_fee_records, public.payment_refunds, public.connected_payouts, public.invoice_card_payments,
  public.reconciliation_runs, public.reconciliation_items from anon, authenticated;
grant select on public.connected_payouts, public.invoice_card_payments, public.payment_refunds to authenticated;
grant select on public.application_fee_records, public.reconciliation_runs, public.reconciliation_items to authenticated;

drop policy if exists connected_payouts_read on public.connected_payouts;
create policy connected_payouts_read on public.connected_payouts for select to authenticated using (
  (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner','manager','finance'])) or public.has_admin_permission('commerce'));
drop policy if exists invoice_card_payments_read on public.invoice_card_payments;
create policy invoice_card_payments_read on public.invoice_card_payments for select to authenticated using (
  public.has_workspace_role(workspace_id, array['owner','manager','finance']) or public.has_admin_permission('commerce'));
drop policy if exists payment_refunds_read on public.payment_refunds;
create policy payment_refunds_read on public.payment_refunds for select to authenticated using (
  requested_by = (select auth.uid()) or public.has_admin_permission('commerce')
  or exists (select 1 from public.connect_accounts ca where ca.stripe_account_id = payment_refunds.stripe_account_id
    and public.has_workspace_role(ca.workspace_id, array['owner','manager','finance'])));
drop policy if exists application_fee_records_admin on public.application_fee_records;
create policy application_fee_records_admin on public.application_fee_records for select to authenticated using (public.has_admin_permission('commerce'));
drop policy if exists reconciliation_runs_admin on public.reconciliation_runs;
create policy reconciliation_runs_admin on public.reconciliation_runs for select to authenticated using (public.has_admin_permission('commerce'));
drop policy if exists reconciliation_items_admin on public.reconciliation_items;
create policy reconciliation_items_admin on public.reconciliation_items for select to authenticated using (public.has_admin_permission('commerce'));

