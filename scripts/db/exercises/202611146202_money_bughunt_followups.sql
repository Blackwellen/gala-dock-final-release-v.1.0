-- Exercise for 202611146202 (rolled back): failed refund handling (once per refund id, ledger reversal, order/cancellation/instruction
-- marked failed with a new attempt), atomic claims, widened payment_refunds checks, invariants run, narrowed payout_releases policy.
do $$
declare o public.checkout_orders; r jsonb; r2 jsonb; ch text := 'ch_exq58' || substr(md5(random()::text), 1, 10); rid text := 're_exq58' || substr(md5(random()::text), 1, 10);
  att int; st text; tot bigint; n int; bc public.booking_cancellations; ri public.dec107_refund_instructions; q text;
begin
  -- a refunded direct ticket order whose refund then fails
  select * into o from public.checkout_orders x where x.strategy = 'direct' and x.status = 'refunded' and x.seller_workspace_id is not null and x.connected_account_id is not null limit 1;
  if o.order_ref is null then raise exception 'no refunded direct order to exercise'; end if;
  update public.checkout_orders set stripe_charge = ch, stripe_refund_id = rid where order_ref = o.order_ref;
  insert into public.stripe_refund_totals(charge_id, amount_minor, currency) values (ch, 1500, 'GBP');
  insert into public.payment_refunds(stripe_refund_id, stripe_account_id, payment_intent_id, source_type, source_ref, amount_minor, refund_application_fee, fee_policy, reason_code, idempotency_key, status, livemode)
    values (rid, o.connected_account_id, 'pi_exq58', 'checkout_order', o.order_ref, 1500, true, 'dec107', 'event_cancelled', 'ex:' || rid, 'succeeded', false);
  r := public.stripe_refund_failed(jsonb_build_object('id', rid, 'status', 'failed', 'amount', 1500, 'currency', 'gbp', 'charge', ch, 'payment_intent', 'pi_exq58',
         'failure_reason', 'expired_or_canceled_card', 'metadata', jsonb_build_object('order_ref', o.order_ref)), o.connected_account_id, false);
  select refund_status, refund_attempt into st, att from public.checkout_orders where order_ref = o.order_ref;
  if st <> 'failed' or att <> o.refund_attempt + 1 then raise exception 'order not marked failed/attempt: % % (%)', st, att, r; end if;
  select amount_minor into tot from public.stripe_refund_totals where charge_id = ch;
  if tot <> 0 or coalesce((r->>'ledger_reversed_minor')::bigint, 0) <> 1500 then raise exception 'ledger not reversed: total % (%)', tot, r; end if;
  if not exists (select 1 from public.payment_refunds where stripe_refund_id = rid and status = 'failed') then raise exception 'payment_refunds not failed'; end if;
  if not exists (select 1 from public.ledger_transactions where idempotency_key = 'stripe:direct-refund-failed:' || rid) then raise exception 'no reversal memo'; end if;
  r2 := public.stripe_refund_failed(jsonb_build_object('id', rid, 'status', 'failed', 'amount', 1500, 'metadata', '{}'::jsonb), o.connected_account_id, false);
  if coalesce((r2->>'duplicate')::boolean, false) is not true then raise exception 'second delivery must be a no-op: %', r2; end if;
  if coalesce((public.stripe_refund_failed(jsonb_build_object('id', 're_x', 'status', 'succeeded'), null, false)->>'ignored')::boolean, false) is not true then raise exception 'non-failed refund must be ignored'; end if;

  -- booking cancellation + refund instruction on a failed refund, and the atomic claims
  select * into bc from public.booking_cancellations limit 1;
  if bc.id is not null then
    update public.booking_cancellations set refund_status = 'refunded', refunded_minor = 2000 where id = bc.id;
    perform public.stripe_refund_failed(jsonb_build_object('id', rid || 'b', 'status', 'failed', 'amount', 800, 'metadata', jsonb_build_object('cancellation', bc.id::text)), null, false);
    select * into bc from public.booking_cancellations where id = bc.id;
    if bc.refund_status <> 'failed' or bc.refunded_minor <> 1200 or bc.refund_attempt < 1 then raise exception 'cancellation not failed: % % %', bc.refund_status, bc.refunded_minor, bc.refund_attempt; end if;
    update public.booking_cancellations set refund_status = 'processing', claimed_at = now() - interval '1 hour' where id = bc.id;
    select count(*) into n from public.claim_booking_cancellation_refunds(100) c where c.id = bc.id;
    if n <> 1 then raise exception 'stuck processing cancellation not reclaimed'; end if;
    select count(*) into n from public.claim_booking_cancellation_refunds(100) c where c.id = bc.id;
    if n <> 0 then raise exception 'freshly claimed cancellation claimed twice'; end if;
  end if;
  select * into ri from public.dec107_refund_instructions limit 1;
  if ri.id is null then
    select id, build_item_id into bc.id, bc.build_item_id from public.booking_cancellations limit 1;
    if bc.build_item_id is not null then
      insert into public.dec107_refund_instructions(basis, build_item_id, amount_minor, idempotency_key, status, refunded_minor) values ('settlement', bc.build_item_id, 1000, 'ex:' || rid, 'done', 1000) returning * into ri;
    end if;
  end if;
  if ri.id is not null then
    update public.dec107_refund_instructions set status = 'done', refunded_minor = 1000 where id = ri.id;
    perform public.stripe_refund_failed(jsonb_build_object('id', rid || 'i', 'status', 'failed', 'amount', 400, 'metadata', jsonb_build_object('instruction', ri.id::text)), null, false);
    select * into ri from public.dec107_refund_instructions where id = ri.id;
    if ri.status <> 'failed' or ri.refunded_minor <> 600 or ri.refund_attempt < 1 then raise exception 'instruction not failed'; end if;
    update public.dec107_refund_instructions set status = 'processing', claimed_at = now() - interval '1 hour' where id = ri.id;
    select count(*) into n from public.claim_dec107_refund_instructions(100) c where c.id = ri.id;
    if n <> 1 then raise exception 'stuck processing instruction not reclaimed'; end if;
  end if;

  -- widened checks accept the refund-instruction rows
  insert into public.payment_refunds(stripe_refund_id, stripe_account_id, payment_intent_id, source_type, source_ref, amount_minor, refund_application_fee, fee_policy, reason_code, idempotency_key, status, livemode)
    values (rid || 'x', 'acct_x', 'pi_x', 'dec107_settlement', gen_random_uuid()::text, 100, true, 'dec107', 'settlement', 'ex2:' || rid, 'pending', false);

  perform * from public.dec107_invariants();
  select pg_get_expr(polqual, polrelid) into q from pg_policy where polrelid = 'public.payout_releases'::regclass and polname = 'payout_releases_member_read';
  if q not like '%finance%' then raise exception 'payout_releases policy not narrowed: %', q; end if;

  raise exception 'EXERCISE_OK refund failures (once, ledger reversed, order/cancellation/instruction failed + new attempt), atomic reclaims, widened checks, invariants, payout_releases policy';
end $$;
