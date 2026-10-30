-- Q40 → Q07 (lane A, 2026-10-29): merchandise orders are paid by a Stripe Connect DIRECT charge on the organiser's connected
-- account with Gala Dock's commission as application_fee_amount, exactly like ticket orders. Additive and backward compatible:
--   * merch_orders gains the direct-charge columns (seller, connected account, fee snapshot, Stripe ids, card refund totals).
--   * merch_card_refunds: one row per card refund request (idempotency key = Stripe idempotency key), executed by the app
--     (`src/lib/payments/merch.ts` → refundMerchantCharge on the connected account) and retried by the 'merch.card_refunds' job.
--   * merch_direct_prepare / merch_set_session / merch_order_direct_paid (webhook) / merch_card_refund_claim|result /
--     merch_order_card_refunded: service-role only.
--   * Body-only replacements (same signatures): merch_refund (queues the card refund for direct orders, reason-aware via the
--     new merch_request_refund), post_direct_refund_delta and sync_application_fee (also resolve merch orders).
--   * ledger_transactions.kind widened with 'merch_order' (the existing list is kept, read from the live constraint).
-- Ledger (docs/payments/ledger.md): payment → direct_charge_lines key stripe:pi:<pi>; refunds → charge.refunded delta
-- (stripe:direct-refund:<charge>:<total>); fee refunds → application_fee.refunded (stripe:fee-refund:<fee>:<total>).

-- ═══ ledger kind ═══
do $$
declare def text; kinds text[];
begin
  select pg_get_constraintdef(c.oid) into def from pg_constraint c where c.conname = 'ledger_transactions_kind_check' and c.conrelid = 'public.ledger_transactions'::regclass;
  if def is not null and position('''merch_order''' in def) = 0 then
    select array_agg(t.m[1] order by t.n) into kinds from regexp_matches(def, '''([a-z_]+)''::text', 'g') with ordinality as t(m, n);
    if coalesce(array_length(kinds, 1), 0) < 10 then raise exception 'ledger kind constraint not understood: %', def; end if;
    execute 'alter table public.ledger_transactions drop constraint ledger_transactions_kind_check';
    execute format('alter table public.ledger_transactions add constraint ledger_transactions_kind_check check (kind = any (%L::text[]))', kinds || array['merch_order']);
  end if;
end $$;
-- application_fee_records.source_type: merchandise orders are a fourth direct-charge source.
alter table public.application_fee_records drop constraint if exists application_fee_records_source_type_check;
alter table public.application_fee_records add constraint application_fee_records_source_type_check
  check (source_type is null or source_type = any (array['payment_order','checkout_order','invoice_card_payment','merch_order']));

-- ═══ schema ═══
alter table public.merch_orders add column if not exists currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$');
alter table public.merch_orders add column if not exists strategy text not null default 'direct' check (strategy in ('direct','none'));
alter table public.merch_orders add column if not exists seller_workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.merch_orders add column if not exists connected_account_id text;
alter table public.merch_orders add column if not exists application_fee_minor bigint check (application_fee_minor is null or application_fee_minor >= 0);
alter table public.merch_orders add column if not exists application_fee_vat_minor bigint not null default 0;
alter table public.merch_orders add column if not exists fee_rule_snapshot jsonb;
alter table public.merch_orders add column if not exists merchant_of_record jsonb;
alter table public.merch_orders add column if not exists stripe_checkout_session text;
alter table public.merch_orders add column if not exists stripe_payment_intent text;
alter table public.merch_orders add column if not exists stripe_charge text;
alter table public.merch_orders add column if not exists stripe_application_fee text;
alter table public.merch_orders add column if not exists card_refunded_minor bigint not null default 0;
alter table public.merch_orders add column if not exists refund_required boolean not null default false;
alter table public.merch_orders add column if not exists livemode boolean;
alter table public.merch_orders add column if not exists updated_at timestamptz not null default now();
create unique index if not exists merch_orders_pi on public.merch_orders(stripe_payment_intent) where stripe_payment_intent is not null;
create index if not exists merch_orders_account_charge on public.merch_orders(connected_account_id, stripe_charge);
alter table public.merch_orders drop constraint if exists merch_orders_fee_le_total;
alter table public.merch_orders add constraint merch_orders_fee_le_total check (application_fee_minor is null or application_fee_minor <= total_minor);

create table if not exists public.merch_card_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.merch_orders(id) on delete cascade,
  idempotency_key text not null unique,
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null check (reason in ('provider_cancelled','event_cancelled','platform_cancelled','customer_cancelled','goodwill','partial_service_failure','hold_expired','duplicate')),
  lines jsonb not null default '[]'::jsonb,
  status text not null default 'requested' check (status in ('requested','processing','pending','succeeded','failed')),
  stripe_refund_id text, error text, attempts integer not null default 0,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists merch_card_refunds_open on public.merch_card_refunds(status, updated_at) where status in ('requested','processing','pending','failed');
alter table public.merch_card_refunds enable row level security;
revoke all on table public.merch_card_refunds from public, anon, authenticated;
grant select on table public.merch_card_refunds to authenticated;
grant all on table public.merch_card_refunds to service_role;
drop policy if exists merch_card_refunds_read on public.merch_card_refunds;
create policy merch_card_refunds_read on public.merch_card_refunds for select to authenticated using (exists (select 1 from public.merch_orders o where o.id = order_id
  and (o.buyer_id = (select auth.uid()) or public.has_permission(o.workspace_id, 'finance.read') or public.has_permission(o.workspace_id, 'refunds.approve'))));

-- ═══ prepare: bind the order to the organiser's ready connected account and snapshot the application fee ═══
-- Fee = commission (resolve_commission, category 'merchandise') + VAT on it, capped at the total. Never recalculated afterwards.
-- The reservation is extended to cover the 30-minute Checkout Session (merch_expire_sweep still releases it afterwards).
create or replace function public.merch_direct_prepare(p_ref text, p_account text, p_merchant jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.merch_orders; ca public.connect_accounts; rule jsonb; com bigint; vat bigint; fee bigint;
begin
  select * into o from public.merch_orders where order_ref = p_ref for update;
  if not found then raise exception 'unknown_order' using errcode = 'P0002'; end if;
  if o.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  if o.expires_at < now() then raise exception 'reservation_expired' using errcode = '22023'; end if;
  if o.total_minor <= 0 then raise exception 'empty_order' using errcode = '22023'; end if;
  select * into ca from public.connect_accounts where workspace_id = o.workspace_id;
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
    application_fee_vat_minor = vat, fee_rule_snapshot = rule, updated_at = now(),
    -- Stripe Checkout lives at least 30 minutes: hold the stock for the session's lifetime so a normal payment never lands late.
    expires_at = greatest(o.expires_at, now() + interval '31 minutes'),
    merchant_of_record = coalesce(p_merchant, '{}'::jsonb) || jsonb_build_object('stripe_account_id', p_account, 'snapshotted_at', now())
  where id = o.id returning * into o;
  return to_jsonb(o) - 'collection_code_hash';
end $$;

create or replace function public.merch_set_session(p_ref text, p_session text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_session !~ '^cs_[A-Za-z0-9_]+$' then raise exception 'invalid_session' using errcode = '22023'; end if;
  update public.merch_orders set stripe_checkout_session = p_session, updated_at = now() where order_ref = p_ref and status = 'pending';
  if not found then raise exception 'not_pending' using errcode = '22023'; end if;
end $$;

-- ═══ webhook: payment_intent.succeeded on the organiser's account (metadata.merch_order) ═══
-- Verifies account context and amount, posts the memo ledger once (stripe:pi:<pi>), then the Q40 hook merch_mark_paid.
-- A payment that lands after the reservation expired is still a real charge: it is posted, and a full 'hold_expired' card refund
-- (fee returned) is queued. Idempotent across webhook retries (ledger key, merch_mark_paid replay, refund idempotency key).
create or replace function public.merch_order_direct_paid(p_ref text, p_pi text, p_charge text, p_amount_minor bigint, p_account text,
  p_application_fee text default null, p_livemode boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.merch_orders; r jsonb; rf uuid;
begin
  select * into o from public.merch_orders where order_ref = p_ref for update;
  if not found then return jsonb_build_object('result', 'unknown_order'); end if;
  if o.strategy <> 'direct' or o.connected_account_id is null then return jsonb_build_object('result', 'not_direct'); end if;
  if p_account is distinct from o.connected_account_id then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', o.workspace_id, 'payment.account_mismatch',
      jsonb_build_object('merch_order', p_ref, 'expected', o.connected_account_id, 'got', p_account));
    return jsonb_build_object('result', 'account_mismatch');
  end if;
  if o.stripe_payment_intent is not null and o.stripe_payment_intent <> p_pi then
    -- A second successful charge for the same order: record it, refund it in full (duplicate), never mark twice.
    perform public.post_memo_ledger_transaction('stripe:pi:' || p_pi, 'merch_order', o.currency,
      public.direct_charge_lines(p_amount_minor, least(o.application_fee_minor, p_amount_minor), least(o.application_fee_vat_minor, p_amount_minor), o.workspace_id), 'direct_charge_memo',
      o.workspace_id, o.event_id, 'merch_order', o.order_ref, 'Merchandise order ' || o.order_ref || ' (duplicate charge)', p_pi, 'webhook');
    insert into public.merch_card_refunds(order_id, idempotency_key, amount_minor, reason, lines)
      values (o.id, 'merch-refund:' || o.order_ref || ':dup:' || p_pi, p_amount_minor, 'duplicate', jsonb_build_object('payment_intent', p_pi))
      on conflict (idempotency_key) do nothing;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', o.workspace_id, 'payment.duplicate_charge', jsonb_build_object('merch_order', p_ref, 'payment_intent', p_pi));
    return jsonb_build_object('result', 'duplicate_charge', 'refund_queued', true);
  end if;
  if p_amount_minor <> o.total_minor then return jsonb_build_object('result', 'amount_mismatch', 'expected', o.total_minor, 'got', p_amount_minor); end if;
  perform public.post_memo_ledger_transaction('stripe:pi:' || p_pi, 'merch_order', o.currency,
    public.direct_charge_lines(o.total_minor, o.application_fee_minor, o.application_fee_vat_minor, o.workspace_id), 'direct_charge_memo',
    o.workspace_id, o.event_id, 'merch_order', o.order_ref, 'Merchandise order ' || o.order_ref, p_pi, 'webhook');
  update public.merch_orders set stripe_payment_intent = p_pi, stripe_charge = nullif(p_charge, ''), stripe_application_fee = coalesce(p_application_fee, stripe_application_fee),
    livemode = p_livemode, updated_at = now() where id = o.id;
  r := public.merch_mark_paid(p_ref, p_pi);
  if coalesce((r->>'ok')::boolean, false) then return jsonb_build_object('result', 'applied', 'status', coalesce(r->>'status', 'paid'), 'replayed', coalesce((r->>'replayed')::boolean, false)); end if;
  -- Reservation expired (sweep or late payment): the stock is released, so the money goes back in full with the fee.
  update public.merch_orders set refund_required = true, updated_at = now() where id = o.id;
  insert into public.merch_card_refunds(order_id, idempotency_key, amount_minor, reason)
    values (o.id, 'merch-refund:' || o.order_ref || ':expired', o.total_minor, 'hold_expired')
    on conflict (idempotency_key) do nothing returning id into rf;
  if rf is not null then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', o.workspace_id, 'merch.paid_after_expiry', jsonb_build_object('order_ref', p_ref, 'payment_intent', p_pi));
  end if;
  return jsonb_build_object('result', 'refund_required', 'refund_id', rf);
end $$;

-- ═══ refunds ═══
-- Reason-aware refund command (finance/refunds.approve): restock + line accounting as before, and for a charged direct order a
-- card refund request on the organiser's connected account (executed by the app, idempotent per request).
create or replace function public.merch_request_refund(p_order_ref text, p_lines jsonb, p_restock boolean default true, p_reason text default 'customer_cancelled')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare o public.merch_orders; x record; l public.merch_order_lines; amt int := 0; si uuid; rf uuid; n int;
begin
  if p_reason not in ('provider_cancelled','event_cancelled','platform_cancelled','customer_cancelled','goodwill','partial_service_failure','duplicate') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  select * into o from public.merch_orders where order_ref = p_order_ref for update;
  if not found or not public.has_permission(o.workspace_id, 'refunds.approve') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if o.status not in ('paid','collected','partially_refunded') then raise exception 'not_refundable' using errcode = '22023'; end if;
  for x in select (j->>'merch_item_id')::uuid id, (j->>'qty')::int qty from jsonb_array_elements(p_lines) j loop
    select * into l from public.merch_order_lines where order_id = o.id and merch_item_id = x.id for update;
    if not found or x.qty < 1 or l.refunded_qty + x.qty > l.qty then raise exception 'refund_exceeds_order' using errcode = '22023'; end if;
    update public.merch_order_lines set refunded_qty = refunded_qty + x.qty where order_id = o.id and merch_item_id = x.id;
    amt := amt + x.qty * l.unit_minor;
    if p_restock then
      select stock_item_id into si from public.merch_items where id = x.id;
      insert into public.stock_movements(item_id, event_id, kind, quantity, ref, actor_id) values (si, o.event_id, 'refund', x.qty, o.order_ref, (select auth.uid()));
    end if;
  end loop;
  if amt <= 0 then raise exception 'empty_refund' using errcode = '22023'; end if;
  update public.merch_orders set refunded_minor = refunded_minor + amt, updated_at = now(),
    status = case when (select bool_and(refunded_qty = qty) from public.merch_order_lines where order_id = o.id) then 'refunded' else 'partially_refunded' end where id = o.id;
  if o.strategy = 'direct' and o.stripe_payment_intent is not null then
    select count(*) into n from public.merch_card_refunds where order_id = o.id;
    insert into public.merch_card_refunds(order_id, idempotency_key, amount_minor, reason, lines, requested_by)
      values (o.id, 'merch-refund:' || o.order_ref || ':' || (n + 1), amt, p_reason, p_lines, (select auth.uid())) returning id into rf;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), o.workspace_id, 'merch.order_refunded',
    jsonb_build_object('order_ref', o.order_ref, 'amount_minor', amt, 'restock', p_restock, 'reason', p_reason, 'card_refund_id', rf));
  return jsonb_build_object('ok', true, 'refund_minor', amt, 'card_refund', case when rf is null then 'none' else 'queued' end, 'card_refund_id', rf);
end $$;

create or replace function public.merch_refund(p_order_ref text, p_lines jsonb, p_restock boolean default true) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select public.merch_request_refund(p_order_ref, p_lines, p_restock, 'customer_cancelled');
$$;

-- Executor claim: requested/failed (or a stale processing row) → processing, returns what Stripe needs. Service-only.
create or replace function public.merch_card_refund_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.merch_card_refunds; o public.merch_orders;
begin
  select * into r from public.merch_card_refunds where id = p_id for update;
  if not found then raise exception 'unknown_refund' using errcode = 'P0002'; end if;
  if r.status in ('succeeded') then return jsonb_build_object('claimed', false, 'status', r.status); end if;
  if r.status = 'processing' and r.updated_at > now() - interval '5 minutes' then return jsonb_build_object('claimed', false, 'status', r.status); end if;
  if r.attempts >= 8 and r.status = 'failed' then return jsonb_build_object('claimed', false, 'status', 'failed', 'exhausted', true); end if;
  select * into o from public.merch_orders where id = r.order_id;
  if o.connected_account_id is null or coalesce(r.lines->>'payment_intent', o.stripe_payment_intent) is null then
    update public.merch_card_refunds set status = 'failed', error = 'no_payment_record', attempts = attempts + 1, updated_at = now() where id = p_id;
    return jsonb_build_object('claimed', false, 'status', 'failed', 'error', 'no_payment_record');
  end if;
  update public.merch_card_refunds set status = 'processing', attempts = attempts + 1, updated_at = now() where id = p_id;
  return jsonb_build_object('claimed', true, 'id', r.id, 'order_ref', o.order_ref, 'account', o.connected_account_id,
    'payment_intent', coalesce(r.lines->>'payment_intent', o.stripe_payment_intent), 'amount_minor', r.amount_minor, 'reason', r.reason, 'idempotency_key', r.idempotency_key);
end $$;

create or replace function public.merch_card_refund_result(p_id uuid, p_stripe_refund text, p_status text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('pending','succeeded','failed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.merch_card_refunds set status = case when status = 'succeeded' then status else p_status end,
    stripe_refund_id = coalesce(p_stripe_refund, stripe_refund_id), error = p_error, updated_at = now() where id = p_id;
end $$;

-- charge.refunded on the connected account (cumulative): mirrors the card refund total on the order.
create or replace function public.merch_order_card_refunded(p_pi text, p_account text, p_refunded_minor bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.merch_orders set card_refunded_minor = greatest(card_refunded_minor, p_refunded_minor), updated_at = now()
   where stripe_payment_intent = p_pi and connected_account_id = p_account;
  if not found then return false; end if;
  update public.merch_card_refunds r set status = 'succeeded', updated_at = now() from public.merch_orders o
   where o.stripe_payment_intent = p_pi and r.order_id = o.id and r.status = 'pending'
     and (select coalesce(sum(x.amount_minor), 0) from public.merch_card_refunds x where x.order_id = o.id and x.status in ('pending','succeeded')) <= p_refunded_minor;
  return true;
end $$;

create or replace function public.merch_card_refunds_due(p_limit integer default 25) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.merch_card_refunds where status in ('requested','failed') and attempts < 8
     or (status = 'processing' and updated_at < now() - interval '5 minutes')
  order by created_at limit greatest(1, least(p_limit, 100));
$$;

-- ═══ body-only replacements: refunds / fee refunds also resolve merchandise orders ═══
create or replace function public.post_direct_refund_delta(p_charge text, p_pi text, p_account text, p_total bigint, p_currency text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare prior bigint; delta bigint; seller uuid; eid uuid; src_type text; src_ref text; cur text;
begin
  if p_total <= 0 or p_currency !~ '^[A-Z]{3}$' or length(p_charge) < 3 then raise exception 'invalid_refund' using errcode = '22023'; end if;
  select payee_workspace_id, event_id, 'payment_order', reference into seller, eid, src_type, src_ref from public.payment_orders
    where strategy = 'direct' and payee_connected_account_id = p_account and (stripe_charge = p_charge or stripe_payment_intent = p_pi) limit 1;
  if seller is null then
    select seller_workspace_id, event_id, 'checkout_order', order_ref into seller, eid, src_type, src_ref from public.checkout_orders
      where strategy = 'direct' and connected_account_id = p_account and (stripe_charge = p_charge or stripe_payment_intent = p_pi) limit 1;
  end if;
  if seller is null then
    select workspace_id, null::uuid, 'invoice_card_payment', id::text into seller, eid, src_type, src_ref from public.invoice_card_payments
      where connected_account_id = p_account and stripe_payment_intent = p_pi limit 1;
  end if;
  if seller is null then
    select workspace_id, event_id, 'merch_order', order_ref into seller, eid, src_type, src_ref from public.merch_orders
      where strategy = 'direct' and connected_account_id = p_account and (stripe_charge = p_charge or stripe_payment_intent = p_pi) limit 1;
  end if;
  if seller is null then raise exception 'unknown_direct_charge' using errcode = 'P0002'; end if;  -- webhook retries (order tolerance)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stripe-refund:' || p_charge, 0));
  insert into public.stripe_refund_totals(charge_id, amount_minor, currency) values (p_charge, 0, p_currency) on conflict do nothing;
  select amount_minor, currency into prior, cur from public.stripe_refund_totals where charge_id = p_charge for update;
  if cur <> p_currency then raise exception 'refund_currency_mismatch'; end if;
  delta := greatest(0, p_total - prior);
  if delta = 0 then return 0; end if;
  perform public.post_memo_ledger_transaction('stripe:direct-refund:' || p_charge || ':' || p_total, 'refund', p_currency, jsonb_build_array(
      jsonb_build_object('account', 'seller_refunds', 'amount_minor', delta, 'party_type', 'workspace', 'party_id', seller),
      jsonb_build_object('account', 'seller_connected_balance', 'amount_minor', -delta, 'party_type', 'workspace', 'party_id', seller)),
    'direct_charge_memo', seller, eid, src_type, src_ref, 'Refund on seller charge', p_charge, 'webhook');
  update public.stripe_refund_totals set amount_minor = p_total where charge_id = p_charge;
  update public.payment_refunds set status = 'succeeded', updated_at = now() where payment_intent_id = p_pi and status in ('requested','pending');
  return delta;
end $$;

create or replace function public.sync_application_fee(p_fee text, p_account text, p_charge text, p_pi text, p_amount bigint, p_refunded bigint, p_currency text, p_livemode boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare rec public.application_fee_records; seller uuid; eid uuid; src_type text; src_ref text; fee bigint; vat bigint; delta bigint; vd bigint;
begin
  select payee_workspace_id, event_id, 'payment_order', reference, application_fee_minor, platform_fee_vat_minor + customer_fee_vat_minor
    into seller, eid, src_type, src_ref, fee, vat from public.payment_orders
    where strategy = 'direct' and payee_connected_account_id = p_account and (stripe_charge = p_charge or stripe_payment_intent = p_pi) limit 1;
  if seller is null then
    select seller_workspace_id, event_id, 'checkout_order', order_ref, application_fee_minor, round((coalesce(fee_vat, 0) + coalesce(commission_vat, 0)) * 100)
      into seller, eid, src_type, src_ref, fee, vat from public.checkout_orders
      where strategy = 'direct' and connected_account_id = p_account and (stripe_charge = p_charge or stripe_payment_intent = p_pi) limit 1;
  end if;
  if seller is null then
    select workspace_id, null::uuid, 'invoice_card_payment', id::text, application_fee_minor, 0 into seller, eid, src_type, src_ref, fee, vat
      from public.invoice_card_payments where connected_account_id = p_account and stripe_payment_intent = p_pi limit 1;
  end if;
  if seller is null then
    select workspace_id, event_id, 'merch_order', order_ref, application_fee_minor, application_fee_vat_minor into seller, eid, src_type, src_ref, fee, vat
      from public.merch_orders where strategy = 'direct' and connected_account_id = p_account and (stripe_charge = p_charge or stripe_payment_intent = p_pi) limit 1;
  end if;
  insert into public.application_fee_records(stripe_application_fee_id, stripe_account_id, charge_id, payment_intent_id, source_type, source_ref, amount_minor, currency, livemode)
    values (p_fee, p_account, p_charge, p_pi, src_type, src_ref, p_amount, upper(p_currency), p_livemode)
    on conflict (stripe_application_fee_id) do update set source_type = coalesce(application_fee_records.source_type, excluded.source_type),
      source_ref = coalesce(application_fee_records.source_ref, excluded.source_ref), updated_at = now();
  select * into rec from public.application_fee_records where stripe_application_fee_id = p_fee for update;
  delta := greatest(0, p_refunded - rec.amount_refunded_minor);
  if delta = 0 then return 0; end if;
  if seller is null then raise exception 'unknown_direct_charge' using errcode = 'P0002'; end if;
  vd := case when coalesce(fee, 0) > 0 then round(delta * least(coalesce(vat, 0), fee)::numeric / fee) else 0 end;
  perform public.post_memo_ledger_transaction('stripe:fee-refund:' || p_fee || ':' || p_refunded, 'application_fee_refund', upper(p_currency), jsonb_build_array(
      jsonb_build_object('account', 'platform_fee', 'amount_minor', delta - vd, 'party_type', 'platform'),
      jsonb_build_object('account', 'tax_payable', 'amount_minor', vd, 'party_type', 'platform'),
      jsonb_build_object('account', 'cash_stripe', 'amount_minor', -delta, 'party_type', 'platform'),
      jsonb_build_object('account', 'seller_application_fees', 'amount_minor', -delta, 'party_type', 'workspace', 'party_id', seller),
      jsonb_build_object('account', 'seller_connected_balance', 'amount_minor', delta, 'party_type', 'workspace', 'party_id', seller)),
    'direct_charge_memo', seller, eid, src_type, src_ref, 'Gala Dock fee refunded', p_fee, 'webhook');
  update public.application_fee_records set amount_refunded_minor = p_refunded, updated_at = now() where stripe_application_fee_id = p_fee;
  return delta;
end $$;

-- ═══ job: retry queued card refunds (app runtime) ═══
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('merch.card_refunds', 'app', null, 5, 'Q40→Q07: execute queued merchandise card refunds on the organiser''s connected account (idempotent per request)')
on conflict (kind) do update set runtime = excluded.runtime, description = excluded.description, updated_at = now();
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('merch-card-refunds', '*/10 * * * *',
      $c$select public.enqueue_job(p_kind => 'merch.card_refunds', p_payload => '{}'::jsonb, p_dedupe_key => 'merch.card_refunds:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'))$c$);
  end if;
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('merch.paid_after_expiry', 1, 'merch_order', 'A merchandise payment arrived after the reservation expired; a full card refund was queued.', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

-- ═══ grants ═══
revoke all on function public.merch_direct_prepare(text, text, jsonb), public.merch_set_session(text, text),
  public.merch_order_direct_paid(text, text, text, bigint, text, text, boolean), public.merch_card_refund_claim(uuid), public.merch_card_refund_result(uuid, text, text, text),
  public.merch_order_card_refunded(text, text, bigint), public.merch_card_refunds_due(integer) from public, anon, authenticated;
grant execute on function public.merch_direct_prepare(text, text, jsonb), public.merch_set_session(text, text),
  public.merch_order_direct_paid(text, text, text, bigint, text, text, boolean), public.merch_card_refund_claim(uuid), public.merch_card_refund_result(uuid, text, text, text),
  public.merch_order_card_refunded(text, text, bigint), public.merch_card_refunds_due(integer) to service_role;
revoke all on function public.merch_request_refund(text, jsonb, boolean, text) from public, anon;
grant execute on function public.merch_request_refund(text, jsonb, boolean, text) to authenticated, service_role;
