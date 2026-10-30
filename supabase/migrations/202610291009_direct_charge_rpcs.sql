-- Q07 · Direct-charge service functions. Requires 202610291008_direct_charge_schema.sql.
-- Backward-compatible: only NEW functions, plus body-only changes to payment_release_scan() (skips direct orders, which the
-- deployed code never creates) and resale_refund_source() (early exit for direct resale orders, likewise never created by
-- the deployed code). No signature changes. All new functions are service-role only unless stated.

-- ───────────────────────── memo ledger posting with an explicit basis ─────────────────────────
-- Same contract as post_ledger_transaction (balanced, idempotent by key, immutable) but records how to read the posting.
create or replace function public.post_memo_ledger_transaction(
  p_idempotency_key text, p_kind text, p_currency text, p_lines jsonb, p_basis text,
  p_workspace uuid default null, p_event uuid default null, p_source_type text default null, p_source_id text default null,
  p_description text default '', p_stripe_ref text default null, p_actor_type text default 'system'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare tx uuid; total bigint; lines jsonb;
begin
  select id into tx from public.ledger_transactions where idempotency_key = p_idempotency_key;
  if found then return tx; end if;
  select coalesce(jsonb_agg(l), '[]'::jsonb) into lines from jsonb_array_elements(p_lines) l where (l->>'amount_minor')::bigint <> 0;
  select coalesce(sum((l->>'amount_minor')::bigint), 0) into total from jsonb_array_elements(lines) l;
  if total <> 0 or jsonb_array_length(lines) < 2 then
    raise exception 'unbalanced ledger transaction (sum %)', total using errcode = '22023';
  end if;
  insert into public.ledger_transactions(idempotency_key, kind, workspace_id, event_id, source_type, source_id, currency, description, stripe_ref, actor_type, basis)
    values (p_idempotency_key, p_kind, p_workspace, p_event, p_source_type, p_source_id, p_currency, p_description, p_stripe_ref, p_actor_type, p_basis)
    returning id into tx;
  insert into public.ledger_entries(transaction_id, account, party_type, party_id, amount_minor)
    select tx, l->>'account', l->>'party_type', nullif(l->>'party_id', '')::uuid, (l->>'amount_minor')::bigint from jsonb_array_elements(lines) l;
  insert into public.audit_events(workspace_id, event, actor_type, metadata)
    values (p_workspace, 'ledger.posted', p_actor_type, jsonb_build_object('transaction_id', tx, 'kind', p_kind, 'basis', p_basis));
  return tx;
end $$;

-- Lines for a direct charge: gross is seller GMV settling in the seller's Stripe balance; only the application fee is platform cash.
create or replace function public.direct_charge_lines(p_gross bigint, p_fee bigint, p_vat bigint, p_seller uuid) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_array(
    jsonb_build_object('account', 'merchant_gmv', 'amount_minor', -p_gross, 'party_type', 'workspace', 'party_id', p_seller),
    jsonb_build_object('account', 'seller_connected_balance', 'amount_minor', p_gross - p_fee, 'party_type', 'workspace', 'party_id', p_seller),
    jsonb_build_object('account', 'seller_application_fees', 'amount_minor', p_fee, 'party_type', 'workspace', 'party_id', p_seller),
    jsonb_build_object('account', 'cash_stripe', 'amount_minor', p_fee, 'party_type', 'platform'),
    jsonb_build_object('account', 'platform_fee', 'amount_minor', -(p_fee - least(p_vat, p_fee)), 'party_type', 'platform'),
    jsonb_build_object('account', 'tax_payable', 'amount_minor', -least(p_vat, p_fee), 'party_type', 'platform'));
$$;

-- ───────────────────────── seller readiness (cards 125.3–125.4, 123.B.3) ─────────────────────────
-- The seller workspace of an event's ticket sales: the organiser workspace, or (customer-created events) a workspace the
-- owner holds with a connected account.
create or replace function public.event_seller_workspace(p_event uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(e.workspace_id, (select w.id from public.workspaces w join public.connect_accounts ca on ca.workspace_id = w.id
    where w.owner_id = e.owner_id order by ca.charges_enabled desc, w.created_at limit 1))
  from public.events e where e.id = p_event;
$$;
-- A user's own selling workspace (official resale seller).
create or replace function public.user_seller_workspace(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select w.id from public.workspaces w join public.connect_accounts ca on ca.workspace_id = w.id
  where w.owner_id = p_user and w.status = 'active' order by ca.charges_enabled desc, (ca.card_payments_capability = 'active') desc, w.created_at limit 1;
$$;
create or replace function public.seller_payment_account(p_workspace uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('workspace_id', w.id, 'name', w.name, 'stripe_account_id', ca.stripe_account_id,
    'charges_enabled', coalesce(ca.charges_enabled, false), 'card_payments', coalesce(ca.card_payments_capability, 'inactive'),
    'details_submitted', coalesce(ca.details_submitted, false), 'disabled_reason', ca.disabled_reason,
    'past_due', to_jsonb(coalesce(ca.requirements_past_due, '{}'::text[])), 'country', ca.country, 'default_currency', ca.default_currency)
  from public.workspaces w left join public.connect_accounts ca on ca.workspace_id = w.id where w.id = p_workspace;
$$;
-- Public, non-sensitive purchasability flag for the checkout page (no account data leaves the database).
create or replace function public.event_payment_readiness(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.connect_accounts ca where ca.workspace_id = public.event_seller_workspace(p_event)
      and ca.stripe_account_id is not null and ca.charges_enabled and ca.card_payments_capability = 'active' and ca.disabled_reason is null
      and coalesce(array_length(ca.requirements_past_due, 1), 0) = 0) then 'ready' else 'seller_not_ready' end;
$$;

-- ───────────────────────── marketplace payment orders ─────────────────────────
-- Converts an unpaid order to a direct charge on the payee's connected account and snapshots merchant + terms (123.1).
-- The fee was already snapshotted by create_payment_order (resolve_commission); it is never recalculated here.
create or replace function public.payment_order_direct_prepare(p_ref text, p_account text, p_merchant jsonb, p_terms jsonb, p_group text default null)
returns public.payment_orders language plpgsql security definer set search_path = '' as $$
declare po public.payment_orders; ca public.connect_accounts;
begin
  select * into po from public.payment_orders where reference = p_ref for update;
  if not found then raise exception 'unknown_order' using errcode = 'P0002'; end if;
  if po.kind not in ('deposit','balance_payment','standby_fee','emergency_service','supplier_booking','venue_hire') then raise exception 'not_marketplace' using errcode = '22023'; end if;
  if po.status not in ('amount_due','payment_pending','failed') then raise exception 'already_paid' using errcode = '22023'; end if;
  select * into ca from public.connect_accounts where workspace_id = po.payee_workspace_id;
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
    updated_at = now()
  where id = po.id returning * into po;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', po.payee_workspace_id, 'payment.direct_prepared',
    jsonb_build_object('payment_order', po.reference, 'stripe_account', p_account, 'application_fee_minor', po.application_fee_minor));
  return po;
end $$;

-- Webhook / return path: a direct charge succeeded on the connected account. Verifies account context and fee, posts the memo
-- ledger, then applies the existing booking effects through payment_order_succeeded (whose own ledger post becomes a no-op
-- because the idempotency key 'stripe:pi:<pi>' is already used by the memo posting in this same transaction).
create or replace function public.payment_order_succeeded_direct(p_ref text, p_pi text, p_charge text, p_amount_minor bigint, p_livemode boolean,
  p_account text, p_application_fee text default null, p_application_fee_minor bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
declare po public.payment_orders;
begin
  select * into po from public.payment_orders where reference = p_ref for update;
  if not found then return 'unknown_order'; end if;
  if po.strategy <> 'direct' then return public.payment_order_succeeded(p_ref, p_pi, p_charge, p_amount_minor, p_livemode); end if;
  if p_account is distinct from po.payee_connected_account_id then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', po.payee_workspace_id, 'payment.account_mismatch',
      jsonb_build_object('payment_order', p_ref, 'expected', po.payee_connected_account_id, 'got', p_account, 'payment_intent', p_pi));
    return 'account_mismatch';
  end if;
  if po.status not in ('amount_due','payment_pending','failed') then return 'already_applied'; end if;
  if p_application_fee_minor is not null and p_application_fee_minor <> po.application_fee_minor then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', po.payee_workspace_id, 'payment.application_fee_mismatch',
      jsonb_build_object('payment_order', p_ref, 'expected', po.application_fee_minor, 'got', p_application_fee_minor));
  end if;
  if p_amount_minor = po.amount_minor + po.customer_fee_minor then
    perform public.post_memo_ledger_transaction('stripe:pi:' || p_pi,
      case po.kind when 'standby_fee' then 'standby_fee' when 'emergency_service' then 'emergency_service' when 'balance_payment' then 'balance_payment' else 'deposit' end,
      po.currency, public.direct_charge_lines(p_amount_minor, po.application_fee_minor, po.platform_fee_vat_minor + po.customer_fee_vat_minor, po.payee_workspace_id),
      'direct_charge_memo', po.payee_workspace_id, po.event_id, 'payment_order', po.reference, po.description, p_pi, 'webhook');
    update public.payment_orders set stripe_application_fee = coalesce(p_application_fee, stripe_application_fee), updated_at = now() where id = po.id;
  end if;
  return public.payment_order_succeeded(p_ref, p_pi, p_charge, p_amount_minor, p_livemode);
end $$;

-- Release scan: direct charges settle in the seller's own Stripe balance, so there is nothing for Gala Dock to release.
create or replace function public.payment_release_scan() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with x as (
    update public.payment_orders po set status = 'eligible_for_provider_transfer', release_eligible_at = now(), updated_at = now()
    where po.status in ('protected_pending_delivery','payment_succeeded') and po.kind in ('deposit','balance_payment','emergency_service','standby_fee')
      and po.strategy <> 'direct'
      and not exists (select 1 from public.booking_disputes d where d.build_item_id = po.build_item_id and d.status <> 'resolved')
      and not exists (select 1 from public.stripe_disputes sd where sd.payment_intent_id = po.stripe_payment_intent and sd.outcome is null)
      and not exists (select 1 from public.booking_cancellations bc where bc.build_item_id = po.build_item_id and bc.status in ('requested','manual_review'))
      and (po.kind = 'standby_fee'
        or exists (select 1 from public.build_items b where b.id = po.build_item_id and b.status in ('fulfilled','completed'))
        or exists (select 1 from public.build_items b join public.events e on e.id = b.event_id where b.id = po.build_item_id and b.status in ('confirmed','active')
             and coalesce(e.ends_at, e.starts_at + interval '6 hours') < now() - interval '48 hours'))
    returning 1)
  select count(*) into n from x;
  return n;
end $$;

-- ───────────────────────── ticket orders ─────────────────────────
create or replace function public.checkout_order_direct_prepare(p_ref text, p_seller uuid, p_account text, p_fee_minor bigint, p_merchant jsonb, p_fee_rule jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.checkout_orders; ca public.connect_accounts;
begin
  select * into o from public.checkout_orders where order_ref = p_ref for update;
  if not found then raise exception 'unknown_order' using errcode = 'P0002'; end if;
  if o.status <> 'pending' or o.stripe_session is not null then raise exception 'not_pending' using errcode = '22023'; end if;
  select * into ca from public.connect_accounts where workspace_id = p_seller;
  if not found or ca.stripe_account_id is distinct from p_account or not ca.charges_enabled or ca.card_payments_capability <> 'active'
     or ca.disabled_reason is not null or coalesce(array_length(ca.requirements_past_due, 1), 0) > 0 then
    raise exception 'seller_not_ready' using errcode = '22023';
  end if;
  update public.checkout_orders set strategy = 'direct', seller_workspace_id = p_seller, connected_account_id = p_account, application_fee_minor = p_fee_minor,
    merchant_of_record = coalesce(p_merchant, '{}'::jsonb) || jsonb_build_object('stripe_account_id', p_account, 'snapshotted_at', now()),
    fee_rule_snapshot = p_fee_rule, updated_at = now()
  where order_ref = p_ref;
end $$;

-- Ticket direct charge confirmed: verify context and amount, post the memo ledger once, mark paid (issuance stays in finalise()).
create or replace function public.checkout_order_direct_paid(p_ref text, p_pi text, p_charge text, p_amount_minor bigint, p_account text, p_application_fee text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare o public.checkout_orders; gross bigint; vat bigint;
begin
  select * into o from public.checkout_orders where order_ref = p_ref for update;
  if not found then return 'unknown_order'; end if;
  if o.strategy <> 'direct' then return 'not_direct'; end if;
  if p_account is distinct from o.connected_account_id then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', o.seller_workspace_id, 'payment.account_mismatch',
      jsonb_build_object('order_ref', p_ref, 'expected', o.connected_account_id, 'got', p_account));
    return 'account_mismatch';
  end if;
  gross := round((o.amount + o.fee) * 100);
  if p_amount_minor <> gross then return 'amount_mismatch'; end if;
  vat := round((coalesce(o.fee_vat, 0) + coalesce(o.commission_vat, 0)) * 100);
  perform public.post_memo_ledger_transaction('stripe:pi:' || p_pi, case o.kind when 'resale' then 'ticket_resale' else 'ticket_order' end, upper(o.currency),
    public.direct_charge_lines(gross, o.application_fee_minor, vat, o.seller_workspace_id), 'direct_charge_memo',
    o.seller_workspace_id, o.event_id, 'checkout_order', o.order_ref, 'Ticket order ' || o.order_ref, p_pi, 'webhook');
  update public.checkout_orders set stripe_payment_intent = p_pi, stripe_charge = nullif(p_charge, ''), stripe_application_fee = coalesce(p_application_fee, stripe_application_fee),
    status = case when status = 'pending' then 'paid' else status end, updated_at = now()
  where order_ref = p_ref;
  return 'applied';
end $$;

-- Official resale with direct charges: the buyer pays the reseller's connected account, so the reseller is already paid and the
-- legacy "refund the seller's original purchase" job must not run. Legacy (platform) resale orders keep the original checks.
create or replace function public.resale_refund_source() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; o public.checkout_orders;
begin
 if exists (select 1 from public.checkout_orders r where r.order_ref = new.order_ref and r.strategy = 'direct') then
  select * into t from public.tickets where id = new.ticket_id;
  new.original_order_ref := (select x.order_ref from public.checkout_orders x where x.order_ref = t.order_ref);
  new.status := 'paid';
  return new;
 end if;
 select * into t from public.tickets where id=new.ticket_id;
 select * into o from public.checkout_orders where order_ref=t.order_ref for update;
 if o.buyer_id is distinct from new.seller_id or o.status<>'issued' or o.refund_status<>'none' or o.stripe_session is null
  or t.status<>'resold' or new.amount<>t.price_paid or new.amount<=0 or new.amount>o.amount then
  raise exception 'original_payment_required' using errcode='22023';
 end if;
 new.original_order_ref:=o.order_ref;
 return new;
end $$;

-- ───────────────────────── refunds and application-fee refunds on connected charges ─────────────────────────
-- charge.refunded on a connected account: seller-side memo only (the refund comes out of the seller's Stripe balance).
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

-- application_fee.created / application_fee.refunded (platform events): records the fee and posts the fee-refund delta.
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

-- ───────────────────────── connected-account payouts (card 129: informational mirror) ─────────────────────────
create or replace function public.mirror_connected_payout(p_payout jsonb, p_account text, p_event_created bigint, p_livemode boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare ws uuid; prev public.connected_payouts; st text := p_payout->>'status'; amt bigint := (p_payout->>'amount')::bigint; cur text := upper(p_payout->>'currency');
begin
  if st not in ('pending','in_transit','paid','failed','canceled') or cur !~ '^[A-Z]{3}$' then raise exception 'invalid_payout' using errcode = '22023'; end if;
  select workspace_id into ws from public.connect_accounts where stripe_account_id = p_account;
  select * into prev from public.connected_payouts where stripe_payout_id = p_payout->>'id' for update;
  if found and prev.last_event_created > p_event_created then return 'stale'; end if;   -- order tolerance: older events never regress state
  insert into public.connected_payouts(stripe_payout_id, stripe_account_id, workspace_id, amount_minor, currency, status, method, arrival_date, failure_code, failure_message, livemode, last_event_created)
    values (p_payout->>'id', p_account, ws, amt, cur, st, p_payout->>'method',
      case when p_payout ? 'arrival_date' and jsonb_typeof(p_payout->'arrival_date') = 'number' then to_timestamp((p_payout->>'arrival_date')::bigint) end,
      p_payout->>'failure_code', left(p_payout->>'failure_message', 300), p_livemode, p_event_created)
    on conflict (stripe_payout_id) do update set status = excluded.status, amount_minor = excluded.amount_minor, arrival_date = excluded.arrival_date,
      failure_code = excluded.failure_code, failure_message = excluded.failure_message, last_event_created = excluded.last_event_created, updated_at = now();
  if ws is not null and st = 'paid' then
    perform public.post_memo_ledger_transaction('stripe:payout:' || (p_payout->>'id'), 'connected_payout', cur, jsonb_build_array(
        jsonb_build_object('account', 'seller_payouts', 'amount_minor', amt, 'party_type', 'workspace', 'party_id', ws),
        jsonb_build_object('account', 'seller_connected_balance', 'amount_minor', -amt, 'party_type', 'workspace', 'party_id', ws)),
      'direct_charge_memo', ws, null, 'connected_payout', p_payout->>'id', 'Stripe payout to seller bank (seller-owned funds)', p_payout->>'id', 'webhook');
  elsif ws is not null and st = 'failed' then
    if exists (select 1 from public.ledger_transactions where idempotency_key = 'stripe:payout:' || (p_payout->>'id')) then
      perform public.post_memo_ledger_transaction('stripe:payout:' || (p_payout->>'id') || ':failed', 'reversal', cur, jsonb_build_array(
          jsonb_build_object('account', 'seller_payouts', 'amount_minor', -amt, 'party_type', 'workspace', 'party_id', ws),
          jsonb_build_object('account', 'seller_connected_balance', 'amount_minor', amt, 'party_type', 'workspace', 'party_id', ws)),
        'direct_charge_memo', ws, null, 'connected_payout', p_payout->>'id', 'Stripe payout failed and returned to seller balance', p_payout->>'id', 'webhook');
    end if;
    if prev.status is distinct from 'failed' then
      perform public.notify_workspace(ws, array['owner','finance'], 'provider.payout', 'Stripe payout failed',
        'Stripe could not pay out to your bank account. Update your payout details in Stripe.', '/provider/money');
    end if;
  end if;
  return 'applied';
end $$;

-- ───────────────────────── invoices paid by card (/pay/[token]) ─────────────────────────
create or replace function public.invoice_card_payment_open(p_invoice uuid, p_session text, p_account text, p_amount_minor bigint, p_fee_minor bigint, p_currency text, p_livemode boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.invoices; v_id uuid;
begin
  select * into i from public.invoices where invoices.id = p_invoice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.connect_accounts ca where ca.workspace_id = i.workspace_id and ca.stripe_account_id = p_account) then
    raise exception 'seller_not_ready' using errcode = '22023';
  end if;
  insert into public.invoice_card_payments(invoice_id, workspace_id, connected_account_id, stripe_checkout_session, amount_minor, application_fee_minor, currency, livemode)
    values (p_invoice, i.workspace_id, p_account, p_session, p_amount_minor, p_fee_minor, upper(p_currency), p_livemode)
    on conflict (stripe_checkout_session) do update set updated_at = now()
    returning invoice_card_payments.id into v_id;
  return v_id;
end $$;

-- Exactly-once invoice settlement from the webhook or the verified return visit (row lock replaces the racy check-then-insert).
create or replace function public.invoice_card_payment_succeeded(p_session text, p_pi text, p_amount_minor bigint, p_account text, p_livemode boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.invoice_card_payments; inv public.invoices;
begin
  select * into p from public.invoice_card_payments where stripe_checkout_session = p_session for update;
  if not found then return 'unknown'; end if;
  if p.connected_account_id is distinct from p_account then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', p.workspace_id, 'payment.account_mismatch',
      jsonb_build_object('invoice_card_payment', p.id, 'expected', p.connected_account_id, 'got', p_account));
    return 'account_mismatch';
  end if;
  if p.status = 'succeeded' then return 'already'; end if;
  if p_amount_minor <> p.amount_minor then return 'amount_mismatch'; end if;
  update public.invoice_card_payments set status = 'succeeded', stripe_payment_intent = p_pi, livemode = p_livemode, updated_at = now() where id = p.id;
  select * into inv from public.invoices where id = p.invoice_id;
  perform public.post_memo_ledger_transaction('stripe:pi:' || p_pi, 'invoice_payment', p.currency,
    public.direct_charge_lines(p.amount_minor, p.application_fee_minor, 0, p.workspace_id), 'direct_charge_memo',
    p.workspace_id, inv.event_id, 'invoice_card_payment', p.id::text, 'Invoice ' || inv.number || ' paid by card', p_pi, 'webhook');
  begin
    perform public.record_invoice_payment(p.invoice_id, p.amount_minor / 100.0, 'card payment (Stripe)', p_pi);
  exception when others then
    -- Paid by card after being settled another way: never lose the payment record; flag it for the organiser to refund.
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', p.workspace_id, 'invoice.card_payment_unapplied',
      jsonb_build_object('invoice', p.invoice_id, 'payment_intent', p_pi, 'error', sqlerrm));
    return 'unapplied';
  end;
  return 'applied';
end $$;

-- ───────────────────────── grants ─────────────────────────
revoke all on function public.post_memo_ledger_transaction(text, text, text, jsonb, text, uuid, uuid, text, text, text, text, text),
  public.direct_charge_lines(bigint, bigint, bigint, uuid), public.event_seller_workspace(uuid), public.user_seller_workspace(uuid),
  public.seller_payment_account(uuid), public.payment_order_direct_prepare(text, text, jsonb, jsonb, text),
  public.payment_order_succeeded_direct(text, text, text, bigint, boolean, text, text, bigint),
  public.checkout_order_direct_prepare(text, uuid, text, bigint, jsonb, jsonb), public.checkout_order_direct_paid(text, text, text, bigint, text, text),
  public.post_direct_refund_delta(text, text, text, bigint, text), public.sync_application_fee(text, text, text, text, bigint, bigint, text, boolean),
  public.mirror_connected_payout(jsonb, text, bigint, boolean), public.invoice_card_payment_open(uuid, text, text, bigint, bigint, text, boolean),
  public.invoice_card_payment_succeeded(text, text, bigint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.post_memo_ledger_transaction(text, text, text, jsonb, text, uuid, uuid, text, text, text, text, text),
  public.direct_charge_lines(bigint, bigint, bigint, uuid), public.event_seller_workspace(uuid), public.user_seller_workspace(uuid),
  public.seller_payment_account(uuid), public.payment_order_direct_prepare(text, text, jsonb, jsonb, text),
  public.payment_order_succeeded_direct(text, text, text, bigint, boolean, text, text, bigint),
  public.checkout_order_direct_prepare(text, uuid, text, bigint, jsonb, jsonb), public.checkout_order_direct_paid(text, text, text, bigint, text, text),
  public.post_direct_refund_delta(text, text, text, bigint, text), public.sync_application_fee(text, text, text, text, bigint, bigint, text, boolean),
  public.mirror_connected_payout(jsonb, text, bigint, boolean), public.invoice_card_payment_open(uuid, text, text, bigint, bigint, text, boolean),
  public.invoice_card_payment_succeeded(text, text, bigint, text, boolean)
  to service_role;
revoke all on function public.event_payment_readiness(uuid) from public;
grant execute on function public.event_payment_readiness(uuid) to anon, authenticated, service_role;
