-- Q40 → Q07 follow-up (lane A, 2026-10-29): a refund of a DUPLICATE merchandise charge (second PaymentIntent for the same order,
-- queued by merch_order_direct_paid as a 'duplicate' refund) must resolve to the order, otherwise charge.refunded would raise
-- unknown_direct_charge and Stripe would retry it forever. Body-only replacement of post_direct_refund_delta (same signature).
-- merch_card_refunds_due: operator precedence made explicit (no behaviour change).

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
  if seller is null and p_pi is not null and p_pi <> '' then
    -- a duplicate merch charge (not the order's primary PaymentIntent), recorded on its 'duplicate' refund request
    select o.workspace_id, o.event_id, 'merch_order', o.order_ref into seller, eid, src_type, src_ref from public.merch_card_refunds r join public.merch_orders o on o.id = r.order_id
      where r.reason = 'duplicate' and r.lines->>'payment_intent' = p_pi and o.connected_account_id = p_account limit 1;
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

create or replace function public.merch_card_refunds_due(p_limit integer default 25) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.merch_card_refunds where (status in ('requested','failed') and attempts < 8)
     or (status = 'processing' and updated_at < now() - interval '5 minutes')
  order by created_at limit greatest(1, least(p_limit, 100));
$$;
