-- Exercise for 202611146204 (rolled back): partial refunds reverse promoter commission pro rata (unlocked: reduced; locked: partial
-- clawback), cumulative + idempotent, full reversal reverses only the rest, resale refund failure queues a new attempt.
do $$
declare s public.promoter_sales; o public.checkout_orders; ch text := 'ch_exq58p' || substr(md5(random()::text), 1, 8); price bigint; c0 numeric; c1 numeric; c2 numeric;
  s2 public.promoter_sales; pid uuid; rp public.resale_payouts; r jsonb;
begin
  select ps.* into s from public.promoter_sales ps join public.checkout_orders x on x.order_ref = ps.order_ref
   where ps.status = 'pending' and ps.payout_id is null and ps.commission > 0 and x.amount > 0 limit 1;
  if s.id is null then raise exception 'no pending promoter sale to exercise'; end if;
  select * into o from public.checkout_orders where order_ref = s.order_ref;
  price := round(o.amount * 100); c0 := s.commission;
  update public.checkout_orders set stripe_charge = ch where order_ref = o.order_ref;
  -- 25 % refunded → 25 % of the commission reversed (unlocked: reduced)
  insert into public.stripe_refund_totals(charge_id, amount_minor, currency) values (ch, round(price * 0.25), 'GBP');
  select commission into c1 from public.promoter_sales where id = s.id;
  if c1 <> c0 - round(c0 * round(price * 0.25) / price, 2) then raise exception 'unlocked 25%%: % → % (price %)', c0, c1, price; end if;
  if not exists (select 1 from public.ledger_transactions where idempotency_key like 'promoter:partial:' || s.id || ':%') then raise exception 'no partial memo'; end if;
  -- cumulative 50 % → another 25 %; the same total again changes nothing
  update public.stripe_refund_totals set amount_minor = round(price * 0.5) where charge_id = ch;
  select commission into c2 from public.promoter_sales where id = s.id;
  if abs((c0 - c2) - round(c0 * round(price * 0.5) / price, 2)) > 0.01 then raise exception 'cumulative 50%%: % → %', c0, c2; end if;
  update public.stripe_refund_totals set amount_minor = round(price * 0.5) where charge_id = ch;
  if (select commission from public.promoter_sales where id = s.id) <> c2 then raise exception 'replay changed commission'; end if;
  -- full reversal reverses only the rest
  perform public.promoter_reverse_order(o.order_ref, 'refund');
  select * into s2 from public.promoter_sales where id = s.id;
  if s2.status <> 'reversed' then raise exception 'full reversal did not reverse'; end if;

  -- locked sale: partial refund becomes a partial clawback (netted only when its payout is paid — partner rule)
  select id into pid from public.promoter_payouts where status = 'paid' limit 1;
  select ps.* into s from public.promoter_sales ps join public.checkout_orders x on x.order_ref = ps.order_ref
   where ps.status = 'pending' and ps.payout_id is null and ps.commission > 0 and x.amount > 0 and ps.order_ref <> o.order_ref limit 1;
  if pid is not null and s.id is not null then
    perform set_config('gd.promoter_payout', 'on', true);
    update public.promoter_sales set payout_id = pid, status = 'held' where id = s.id;
    perform set_config('gd.promoter_payout', '', true);
    select * into o from public.checkout_orders where order_ref = s.order_ref;
    price := round(o.amount * 100);
    update public.checkout_orders set stripe_charge = ch || 'L' where order_ref = o.order_ref;
    insert into public.stripe_refund_totals(charge_id, amount_minor, currency) values (ch || 'L', round(price * 0.5), 'GBP');
    select * into s2 from public.promoter_sales where id = s.id;
    if not s2.clawback_pending or s2.clawback_amount is null or s2.commission <> s.commission or abs(s2.clawback_amount - round(s.commission * round(price * 0.5) / price, 2)) > 0.01 then
      raise exception 'locked partial clawback wrong: pending % amount % commission %', s2.clawback_pending, s2.clawback_amount, s2.commission;
    end if;
    perform public.promoter_reverse_order(o.order_ref, 'refund');
    select * into s2 from public.promoter_sales where id = s.id;
    if not s2.clawback_pending or s2.clawback_amount is not null then raise exception 'full reversal of a partial clawback must make it full'; end if;
  end if;

  -- resale buy-back refund failure → retried with a new attempt
  select * into rp from public.resale_payouts limit 1;
  if rp.id is not null then
    update public.resale_payouts set stripe_refund_id = 're_exq58r', status = 'paid' where id = rp.id;
    r := public.stripe_refund_failed(jsonb_build_object('id', 're_exq58r', 'status', 'failed', 'amount', 100, 'metadata', jsonb_build_object('resale_payout_id', rp.id::text, 'order_ref', 'x')), null, false);
    select * into rp from public.resale_payouts where id = rp.id;
    if rp.status <> 'failed' or rp.stripe_refund_id is not null or rp.requested_at is not null or rp.refund_attempt < 1 then raise exception 'resale retry not queued: % (%)', rp.status, r; end if;
  end if;
  raise exception 'EXERCISE_OK promoter partial reversal (unlocked pro rata + cumulative + idempotent, locked partial clawback, full rest), resale refund retry';
end $$;
