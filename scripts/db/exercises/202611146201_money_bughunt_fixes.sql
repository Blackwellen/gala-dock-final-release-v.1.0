-- Exercise for 202611146201 (rolled back): hold-vs-order guard (match / re-reserved / swept), hold_changed from issue_checkout,
-- net unit price, dispute closes once, releases_due waits on owed refunds.
do $$
declare o public.checkout_orders; l jsonb; tier uuid; q int; ok boolean; d public.booking_disputes; n int; net numeric; pr_id uuid; msg text;
begin
  -- an order priced for one GA tier (no seats), with its tickets removed so the issuance path runs again
  select * into o from public.checkout_orders x where x.kind = 'primary' and x.quote_snapshot is not null and jsonb_array_length(x.quote_snapshot->'lines') = 1
     and jsonb_array_length(coalesce(x.quote_snapshot->'lines'->0->'seats', '[]')) = 0 order by x.created_at desc limit 1;
  if o.order_ref is null then raise exception 'no snapshot order to exercise'; end if;
  l := o.quote_snapshot->'lines'->0; tier := (l->>'tier_id')::uuid; q := (l->>'qty')::int;
  delete from public.ticket_holds where token = o.token;
  update public.event_seats set status = 'available', hold_token = null where hold_token = o.token;

  -- nothing held → no match
  if public.checkout_hold_matches_order(o.token, o.order_ref) then raise exception 'empty hold must not match'; end if;
  -- exactly what was priced → match
  insert into public.ticket_holds(token, event_id, tier_id, qty, expires_at) values (o.token, o.event_id, tier, q, now() + interval '10 minutes');
  if not public.checkout_hold_matches_order(o.token, o.order_ref) then raise exception 'priced hold must match'; end if;
  -- re-reserved more under the same token → no match, and issue_checkout refuses with hold_changed
  update public.ticket_holds set qty = q + 4 where token = o.token;
  if public.checkout_hold_matches_order(o.token, o.order_ref) then raise exception 're-reserved hold must not match'; end if;
  delete from public.tickets where order_ref = o.order_ref;
  begin
    perform public.issue_checkout(o.token, o.order_ref, 'Exercise', o.buyer_id);
    raise exception 'issue_checkout issued a changed hold';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'hold_expired:hold_changed' then raise exception 'expected hold_changed, got %', msg; end if;
  end;

  -- net unit price comes from the snapshot
  net := public.checkout_order_net_unit(o.order_ref, tier);
  if net is distinct from round((l->>'net_unit_minor')::numeric / 100, 2) then raise exception 'net unit % vs snapshot %', net, l->>'net_unit_minor'; end if;
  if public.checkout_order_net_unit(o.order_ref, gen_random_uuid()) is not null then raise exception 'unknown tier must be null'; end if;

  -- a resolved dispute can't be closed (and refunded) again
  select * into d from public.booking_disputes limit 1;
  if d.id is not null then
    update public.booking_disputes set status = 'resolved', resolved_at = now() where id = d.id;
    begin
      perform public.dec107_dispute_close(d.id, 'independent_award', 1000, 'exercise:' || d.id, null, null);
      raise exception 'closed a resolved dispute';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg <> 'not_open' then raise exception 'expected not_open, got %', msg; end if;
    end;
    select count(*) into n from public.dec107_refund_instructions where idempotency_key = 'exercise:' || d.id;
    if n <> 0 then raise exception 'refund instruction created for a resolved dispute'; end if;
  end if;

  -- a due release whose ticket order owes a refund is not returned
  select pr.id into pr_id from public.payout_releases pr where pr.source_type = 'checkout_order' limit 1;
  if pr_id is not null then
    update public.payout_releases set status = 'due', due_at = now() where id = pr_id;
    update public.checkout_orders set refund_status = 'failed' where order_ref = (select source_ref from public.payout_releases where id = pr_id);
    if exists (select 1 from public.dec107_releases_due(false, 500) r where r.id = pr_id) or exists (select 1 from public.dec107_releases_due(true, 500) r where r.id = pr_id) then
      raise exception 'release with an owed refund was returned as due';
    end if;
  end if;
  perform * from public.dec107_releases_due(false, 5);

  raise exception 'EXERCISE_OK money fixes: hold guard (empty/match/changed), hold_changed refused, net unit, dispute closes once, owed refund blocks payout';
end $$;
