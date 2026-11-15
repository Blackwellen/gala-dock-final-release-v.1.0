-- Q76 rollback: the live bodies of every function replaced by migrations 202611147651/7652/7653, captured from
-- pg_get_functiondef on 2026-11-14 immediately before apply. Run (owner/coordinator decision) to restore pre-Q76 behaviour; the new
-- helpers, ref_fee_catalogue, payout_releases.settlement_currency and seeded resale_policies are inert once these bodies are back.

-- create_payment_order
CREATE OR REPLACE FUNCTION public.create_payment_order(p_kind text, p_item uuid DEFAULT NULL::uuid, p_standby uuid DEFAULT NULL::uuid)
 RETURNS payment_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.build_items; s public.standby_commitments; e public.events; ws uuid; amt numeric; paid numeric; c jsonb; fee bigint; po public.payment_orders; key text; descr text;
begin
  if p_kind = 'standby_fee' then
    select * into s from public.standby_commitments where id = p_standby;
    if not found or not public.can_edit_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
    if s.status <> 'accepted' or s.fee_status <> 'due' or coalesce(s.standby_fee, 0) <= 0 then raise exception 'nothing_due' using errcode = '22023'; end if;
    select * into b from public.build_items where id = s.build_item_id;
    amt := s.standby_fee; ws := s.workspace_id; descr := 'Standby fee — ' || b.title; key := 'standby_fee:' || s.id;
  elsif p_kind in ('deposit','balance_payment','emergency_service') then
    select * into b from public.build_items where id = p_item;
    if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
    if b.listing_id is null or b.amount is null or b.amount <= 0 then raise exception 'not_payable' using errcode = '22023'; end if;
    ws := public.listing_workspace(b.listing_id);
    select coalesce(sum(amount_minor - refunded_minor), 0) / 100.0 into paid from public.payment_orders
      where build_item_id = b.id and kind in ('deposit','balance_payment','emergency_service') and status not in ('amount_due','payment_pending','failed','cancelled');
    if p_kind = 'deposit' then
      if b.status not in ('quoted','available','held','conditionally_held','quote_received','quote_revised','customer_reviewing') then raise exception 'not_bookable:%', b.status using errcode = '22023'; end if;
      if b.status = 'held' and b.hold_expires_at < now() then raise exception 'hold_expired' using errcode = '22023'; end if;
      if (b.quote->>'valid_until') is not null and (b.quote->>'valid_until')::date < current_date then raise exception 'quote_expired' using errcode = '22023'; end if;
      amt := least(coalesce(nullif(b.deposit, 0), round(b.amount * coalesce((b.quote->>'deposit_pct')::numeric, 30) / 100, 2)), b.amount);
      descr := 'Deposit — ' || b.title;
    elsif p_kind = 'emergency_service' then
      if b.status not in ('quoted','available') or coalesce(b.terms_snapshot->>'source', '') <> 'emergency' then raise exception 'not_bookable:%', b.status using errcode = '22023'; end if;
      amt := b.amount; descr := 'Emergency booking — ' || b.title;
    else
      if b.status not in ('confirmed','active','fulfilled','completion_pending') then raise exception 'not_confirmed' using errcode = '22023'; end if;
      amt := b.amount - paid; descr := 'Balance — ' || b.title;
      if amt <= 0 then raise exception 'nothing_due' using errcode = '22023'; end if;
    end if;
    key := p_kind || ':' || b.id || ':' || round(amt * 100)::bigint;
  else raise exception 'unsupported_kind' using errcode = '22023';
  end if;
  select * into e from public.events where id = b.event_id;
  if not exists (select 1 from public.connect_accounts ca where ca.workspace_id = ws) and not exists (select 1 from public.workspaces w where w.id = ws and w.stripe_account_id is not null) then
    -- Money can still be collected and protected; release waits until the provider completes payout onboarding.
    null;
  end if;
  c := public.resolve_commission(ws, b.category, null, null);
  fee := least(round(amt * 100)::bigint, round(amt * 100 * (c->>'rate_bps')::numeric / 10000)::bigint + coalesce((c->>'fixed_minor')::bigint, 0));
  select * into po from public.payment_orders where idempotency_key = key;
  if found then
    if po.status = 'failed' then
      update public.payment_orders set status = 'amount_due', failure_reason = null, stripe_checkout_session = null, updated_at = now() where id = po.id returning * into po;
    end if;
    if po.status in ('amount_due','payment_pending') then return po; end if;
    raise exception 'already_paid' using errcode = '22023';
  end if;
  insert into public.payment_orders(kind, payer_id, event_id, build_item_id, standby_id, payee_workspace_id, description, amount_minor, currency, platform_fee_minor, customer_fee_minor, commission, strategy, protected, idempotency_key)
    values (p_kind, auth.uid(), b.event_id, b.id, p_standby, ws, descr, round(amt * 100)::bigint, coalesce(e.currency, 'GBP'), fee, public.booking_admin_fee_minor(round(amt * 100)::bigint), c, 'separate_transfer', p_kind <> 'standby_fee', key)
    returning * into po;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', ws, 'payment.order_created', jsonb_build_object('payment_order', po.reference, 'kind', p_kind, 'amount_minor', po.amount_minor, 'commission', c));
  return po;
end $function$
;

-- checkout_quote
CREATE OR REPLACE FUNCTION public.checkout_quote(p_event uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cfg jsonb := public.ticket_fee_config(); fixed_minor numeric; pct numeric; seller_bps numeric; vat_r numeric := public.vat_rate_bps() / 10000.0; incl boolean := public.vat_consumer_inclusive();
  l record; d record; lines jsonb := '[]'; codes jsonb := '[]'; gross bigint := 0; disc bigint := 0; fee numeric := 0; fee_minor bigint; fee_vat bigint; per bigint; net bigint; q int; exp timestamptz; k text := 'primary';
begin
  fixed_minor := round(coalesce((cfg->>'fixed')::numeric, 0) * 100); pct := coalesce((cfg->>'pct_bps')::numeric, 0); seller_bps := coalesce((cfg->>'seller_bps')::numeric, 0);
  if length(coalesce(p_token, '')) >= 16 then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'purpose', x.purpose, 'kind', x.kind, 'amount', x.amount, 'stackable', x.stackable) order by a.applied_at), '[]') into codes
      from public.checkout_code_applications a join public.discount_codes x on x.id = a.code_id
      where a.token = p_token and a.event_id = p_event and public.discount_code_live(x);
    for l in
      select t.id, t.name, round(t.price * 100)::bigint unit, t.sort,
        coalesce((select sum(h.qty) from public.ticket_holds h where h.token = p_token and h.event_id = p_event and h.tier_id = t.id and h.expires_at > now()), 0)::int ga,
        (select min(h.expires_at) from public.ticket_holds h where h.token = p_token and h.event_id = p_event and h.tier_id = t.id and h.expires_at > now()) ga_exp,
        coalesce((select count(*) from public.event_seats s where s.hold_token = p_token and s.event_id = p_event and s.tier_id = t.id and s.status = 'held' and s.hold_expires_at > now()), 0)::int st,
        (select min(s.hold_expires_at) from public.event_seats s where s.hold_token = p_token and s.event_id = p_event and s.tier_id = t.id and s.status = 'held' and s.hold_expires_at > now()) st_exp,
        coalesce((select jsonb_agg(coalesce(nullif(s.label, ''), s.seat_key) order by s.seat_key) from public.event_seats s where s.hold_token = p_token and s.event_id = p_event and s.tier_id = t.id and s.status = 'held' and s.hold_expires_at > now()), '[]') seats
      from public.ticket_tiers t where t.event_id = p_event order by t.sort, t.name, t.id
    loop
      q := l.ga + l.st;
      if q = 0 then continue; end if;
      per := 0;
      for d in select * from public.discount_codes x where x.id in (select (c->>'id')::uuid from jsonb_array_elements(codes) c) and x.purpose = 'discount'
          and (x.tier_ids is null or l.id = any(x.tier_ids)) order by (x.kind = 'percent') desc, x.code loop
        if d.kind = 'percent' then per := per + round((l.unit - per) * least(d.amount, 100) / 100.0)::bigint;
        else per := per + least(l.unit - per, round(d.amount * 100)::bigint); end if;
      end loop;
      net := l.unit - per;
      gross := gross + l.unit * q; disc := disc + per * q;
      if net > 0 then fee := fee + q * (fixed_minor + net * pct / 10000.0); end if;
      exp := least(exp, l.ga_exp, l.st_exp);
      lines := lines || jsonb_build_object('tier_id', l.id, 'name', l.name, 'unit_minor', l.unit, 'discount_minor', per, 'net_unit_minor', net, 'qty', q, 'seats', l.seats);
    end loop;
    if jsonb_array_length(lines) = 0 then
      -- Official resale held by this token (one order is either primary or resale).
      for l in select (r->>'tier_id')::uuid tier_id, r->>'tier' tier, round((r->>'price')::numeric * 100)::bigint unit, count(*)::int n, min((r->>'expires_at')::timestamptz) e,
            coalesce(jsonb_agg(r->>'seat') filter (where r->>'seat' is not null), '[]') seats
          from jsonb_array_elements(public.resale_holds_for(p_token)) r group by 1, 2, 3 order by 2, 3 loop
        k := 'resale';
        gross := gross + l.unit * l.n;
        if l.unit > 0 then fee := fee + l.n * (fixed_minor + l.unit * pct / 10000.0); end if;
        exp := least(exp, l.e);
        lines := lines || jsonb_build_object('tier_id', l.tier_id, 'name', l.tier || ' (resale)', 'unit_minor', l.unit, 'discount_minor', 0, 'net_unit_minor', l.unit, 'qty', l.n, 'seats', l.seats, 'resale', true);
      end loop;
    end if;
  end if;
  fee_minor := round(fee)::bigint;
  fee_vat := case when fee_minor = 0 then 0 when incl then round(fee_minor * vat_r / (1 + vat_r))::bigint else round(fee_minor * vat_r)::bigint end;
  return jsonb_build_object('kind', k, 'currency', coalesce(public.event_checkout_currency(p_event), 'GBP'), 'lines', lines, 'codes', case when k = 'resale' then '[]'::jsonb else codes end,
    'gross_minor', gross, 'discount_minor', disc, 'subtotal_minor', gross - disc,
    'fee_minor', fee_minor, 'fee_vat_minor', fee_vat, 'fee_total_minor', fee_minor + case when incl then 0 else fee_vat end,
    'commission_minor', case when k = 'resale' then 0 else round((gross - disc) * seller_bps / 10000.0)::bigint end,
    'total_minor', gross - disc + fee_minor, 'payable_minor', gross - disc + fee_minor + case when incl then 0 else fee_vat end,
    'expires_at', exp, 'quoted_at', now(),
    'fee_rule', jsonb_build_object('fixed_minor', fixed_minor, 'pct_bps', pct, 'seller_bps', seller_bps, 'vat_rate_bps', public.vat_rate_bps(), 'vat_inclusive', incl));
end $function$
;

-- ticket_sales_open_from
CREATE OR REPLACE FUNCTION public.ticket_sales_open_from(p_event uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.dec107_add_business_days(coalesce(e.ends_at, e.starts_at + interval '6 hours'), s.ticket_payout_delay_business_days)
         - make_interval(days => s.hold_limit_days - s.default_rule_margin_days)
    from public.events e, public.dec107_settings s where e.id = p_event and s.id;
$function$
;

-- dec107_release_sweep
CREATE OR REPLACE FUNCTION public.dec107_release_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.dec107_settings; created integer := 0; due integer := 0; blocked integer := 0; defaults integer := 0; cancelled integer := 0;
  r record; rv record; hold interval;
begin
  select * into s from public.dec107_settings where id;
  hold := make_interval(days => s.hold_limit_days - s.default_rule_margin_days);

  -- (a) one main release per charged DEC-107 record
  with ins as (
    insert into public.payout_releases(source_type, source_ref, workspace_id, stripe_account_id, payment_intent, event_id, sale_kind, currency, livemode, charged_at, hold_limit_at)
    select 'payment_order', po.reference, po.payee_workspace_id, po.payee_connected_account_id, po.stripe_payment_intent, po.event_id, 'booking', upper(po.currency), coalesce(po.livemode, false), po.charged_at, po.charged_at + hold
      from public.payment_orders po
     where po.release_model = 'manual_release' and po.strategy = 'direct' and po.charged_at is not null and po.payee_connected_account_id is not null
    union all
    select 'checkout_order', co.order_ref, co.seller_workspace_id, co.connected_account_id, co.stripe_payment_intent, co.event_id,
           case co.kind when 'resale' then 'ticket_resale' else 'ticket_sale' end, upper(co.currency), coalesce(co.livemode, false), co.charged_at, co.charged_at + hold
      from public.checkout_orders co
     where co.release_model = 'manual_release' and co.strategy = 'direct' and co.charged_at is not null
    union all
    select 'merch_order', mo.order_ref, mo.seller_workspace_id, mo.connected_account_id, mo.stripe_payment_intent, mo.event_id, 'merch', upper(mo.currency), coalesce(mo.livemode, false), mo.charged_at, mo.charged_at + hold
      from public.merch_orders mo
     where mo.release_model = 'manual_release' and mo.strategy = 'direct' and mo.charged_at is not null and mo.connected_account_id is not null
    union all
    select 'invoice_card_payment', ic.id::text, ic.workspace_id, ic.connected_account_id, ic.stripe_payment_intent, i.event_id, 'invoice', upper(ic.currency), coalesce(ic.livemode, false), ic.charged_at, ic.charged_at + hold
      from public.invoice_card_payments ic join public.invoices i on i.id = ic.invoice_id
     where ic.release_model = 'manual_release' and ic.charged_at is not null and ic.connected_account_id is not null
    on conflict (source_type, source_ref, part) do nothing
    returning 1)
  select count(*) into created from ins;

  -- (b) fully refunded records release nothing
  with c as (
    update public.payout_releases pr set status = 'cancelled', blocked_reason = 'fully_refunded', updated_at = now()
     where pr.status in ('held','due','blocked') and pr.part = 'main' and (
       (pr.source_type = 'checkout_order' and exists (select 1 from public.checkout_orders co where co.order_ref = pr.source_ref and co.status = 'refunded'))
       or (pr.source_type = 'payment_order' and exists (select 1 from public.payment_orders po where po.reference = pr.source_ref and po.status in ('refunded','cancelled')))
       or (pr.source_type = 'merch_order' and exists (select 1 from public.merch_orders mo where mo.order_ref = pr.source_ref and mo.status in ('refunded','cancelled'))))
    returning 1)
  select count(*) into cancelled from c;

  -- (c) triggers. Tickets / resales / merch: event completed + review window. Bookings: customer confirmation (item fulfilled or
  --     completed) or event completed + review window. Invoices: event + review, else charge + review.
  update public.payout_releases pr set trigger_at = x.trigger_at, trigger = x.trigger, updated_at = now()
    from (
      select pr2.id,
        case
          when pr2.sale_kind in ('ticket_sale','ticket_resale','merch') then public.dec107_add_business_days(coalesce(e.ends_at, e.starts_at + interval '6 hours'), s.ticket_payout_delay_business_days)
          when pr2.sale_kind = 'booking' and b.status in ('fulfilled','completed') then least(coalesce(b.updated_at, now()), coalesce(e.ends_at, e.starts_at + interval '6 hours') + make_interval(hours => s.booking_review_hours))
          when pr2.sale_kind = 'booking' then coalesce(e.ends_at, e.starts_at + interval '6 hours') + make_interval(hours => s.booking_review_hours)
          else coalesce(coalesce(e.ends_at, e.starts_at + interval '6 hours'), pr2.charged_at) + make_interval(hours => s.booking_review_hours)
        end trigger_at,
        case when pr2.sale_kind = 'booking' and b.status in ('fulfilled','completed') then 'customer_confirmed'
             when e.id is not null then 'event_completed_review' else 'review_window' end trigger
      from public.payout_releases pr2
      left join public.events e on e.id = pr2.event_id
      left join public.payment_orders po on pr2.source_type = 'payment_order' and po.reference = pr2.source_ref
      left join public.build_items b on b.id = po.build_item_id
      where pr2.part = 'main' and pr2.status in ('held','blocked') and pr2.trigger not in ('settlement','accepted_recommendation','independent_award','default_rule') is not false
    ) x
   where pr.id = x.id and (pr.trigger_at is distinct from x.trigger_at or pr.trigger is distinct from x.trigger);

  -- (d) blocks: an open booking dispute, an open card dispute or a pending cancellation stop the release (until the hold limit)
  update public.payout_releases pr set status = 'blocked', blocked_reason = y.reason, updated_at = now()
    from (
      select pr2.id, case
        when exists (select 1 from public.booking_disputes d where d.build_item_id = po.build_item_id and d.status <> 'resolved') then 'booking_dispute_open'
        when exists (select 1 from public.stripe_disputes sd where sd.payment_intent_id = pr2.payment_intent and sd.outcome is null) then 'card_dispute_open'
        when exists (select 1 from public.booking_cancellations bc where bc.build_item_id = po.build_item_id and bc.status in ('requested','manual_review')) then 'cancellation_pending'
        end reason
      from public.payout_releases pr2
      left join public.payment_orders po on pr2.source_type = 'payment_order' and po.reference = pr2.source_ref
      where pr2.status in ('held','due','blocked')) y
   where pr.id = y.id and y.reason is not null and pr.trigger is distinct from 'default_rule' and (pr.status <> 'blocked' or pr.blocked_reason is distinct from y.reason);
  update public.payout_releases pr set status = 'held', blocked_reason = null, updated_at = now()
   where pr.status = 'blocked' and pr.blocked_reason in ('booking_dispute_open','card_dispute_open','cancellation_pending')
     and not exists (select 1 from public.payment_orders po join public.booking_disputes d on d.build_item_id = po.build_item_id
                      where pr.source_type = 'payment_order' and po.reference = pr.source_ref and d.status <> 'resolved')
     and not exists (select 1 from public.stripe_disputes sd where sd.payment_intent_id = pr.payment_intent and sd.outcome is null)
     and not exists (select 1 from public.payment_orders po join public.booking_cancellations bc on bc.build_item_id = po.build_item_id
                      where pr.source_type = 'payment_order' and po.reference = pr.source_ref and bc.status in ('requested','manual_review'));
  select count(*) into blocked from public.payout_releases where status = 'blocked';

  -- (e) hold-limit default rule: an open booking dispute at the default-rule day → refund the disputed amount (capped by the
  --     worker at what is held), release the rest. Runs whatever the policy version (the provider forces the money out).
  for r in
    select pr.*, d.id dispute_id, d.amount_claimed, po.build_item_id, d.workspace_id dws, d.event_id dev
      from public.payout_releases pr
      join public.payment_orders po on pr.source_type = 'payment_order' and po.reference = pr.source_ref
      join lateral (select * from public.booking_disputes d where d.build_item_id = po.build_item_id and d.status <> 'resolved' order by d.created_at desc limit 1) d on true
     where pr.part = 'main' and pr.status = 'blocked' and pr.blocked_reason = 'booking_dispute_open' and now() >= pr.hold_limit_at
  loop
    if coalesce(r.amount_claimed, 0) > 0 then
      insert into public.dec107_refund_instructions(basis, dispute_id, build_item_id, amount_minor, idempotency_key)
        values ('default_rule', r.dispute_id, r.build_item_id, round(r.amount_claimed * 100)::bigint, 'default_rule:' || r.dispute_id)
        on conflict (idempotency_key) do nothing;
    end if;
    update public.payout_releases set status = 'held', blocked_reason = 'default_rule_refund_first', trigger = 'default_rule', trigger_at = now(), updated_at = now() where id = r.id;
    perform public.dec107_default_rule_notice(r.dispute_id, coalesce(r.amount_claimed, 0));
    defaults := defaults + 1;
  end loop;

  -- (e2) owner 2026-11-11: ticket money is NEVER paid out before the event, even at the hold limit (sales only open inside the
  --      window, so this only happens if an event is postponed). Block and alert staff instead of releasing.
  update public.payout_releases pr set status = 'blocked', blocked_reason = 'hold_limit_before_event', updated_at = now()
    from public.events e
   where pr.event_id = e.id and pr.sale_kind in ('ticket_sale','ticket_resale','merch') and pr.status = 'held'
     and now() >= pr.hold_limit_at and now() < coalesce(e.ends_at, e.starts_at + interval '6 hours');
  insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
    select pa.user_id, 'admin.ops_alert', 'Ticket money at the hold limit before its event',
           'A ticket release reached the payment hold limit before the event ended (event moved?). It is blocked, not paid out. Decide with the organiser: refund buyers or agree a new date.',
           '/admin/commerce/payouts', 'hold-before-event:' || pr.id || ':' || pa.user_id
      from public.payout_releases pr cross join public.platform_admins pa
     where pr.status = 'blocked' and pr.blocked_reason = 'hold_limit_before_event'
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

  -- (f) due: trigger reached (or hold limit), not blocked, and no default-rule refund still outstanding
  with d as (
    update public.payout_releases pr set status = 'due',
           due_at = least(coalesce(pr.trigger_at, pr.hold_limit_at), pr.hold_limit_at),
           trigger = case when pr.trigger_at is null or pr.hold_limit_at < pr.trigger_at then case when pr.trigger = 'default_rule' then 'default_rule' else 'hold_limit' end else pr.trigger end,
           blocked_reason = null, updated_at = now()
     where pr.status = 'held' and pr.part = 'main' and now() >= least(coalesce(pr.trigger_at, pr.hold_limit_at), pr.hold_limit_at)
       and not (pr.sale_kind in ('ticket_sale','ticket_resale','merch') and exists (select 1 from public.events e where e.id = pr.event_id and now() < coalesce(e.ends_at, e.starts_at + interval '6 hours')))
       and not exists (select 1 from public.dec107_refund_instructions ri join public.payment_orders po on po.build_item_id = ri.build_item_id
                        where pr.source_type = 'payment_order' and po.reference = pr.source_ref and ri.status in ('due','processing'))
    returning 1)
  select count(*) into due from d;
  -- card disputes still open at the hold limit: the disputed amount has already left the seller's balance; release the rest
  update public.payout_releases pr set status = 'due', due_at = pr.hold_limit_at, trigger = 'hold_limit', blocked_reason = null, updated_at = now()
   where pr.status = 'blocked' and pr.blocked_reason = 'card_dispute_open' and now() >= pr.hold_limit_at;
  -- reserve parts come due at their end
  update public.payout_releases pr set status = 'due', due_at = pr.reserve_until, trigger = 'reserve_end', updated_at = now()
   where pr.status = 'held' and pr.part = 'reserve' and now() >= pr.reserve_until;

  -- (g) warning before the default-rule day (both parties), once
  for rv in
    select pr.id, d.id dispute_id from public.payout_releases pr
      join public.payment_orders po on pr.source_type = 'payment_order' and po.reference = pr.source_ref
      join public.booking_disputes d on d.build_item_id = po.build_item_id and d.status <> 'resolved'
     where pr.status = 'blocked' and pr.warning_sent_at is null and now() >= pr.hold_limit_at - make_interval(days => s.warning_days)
  loop
    perform public.dec107_dispute_notice(rv.dispute_id, 'dispute_hold_limit_warning', 'Payment hold limit in ' || s.warning_days || ' days',
      'The payment provider''s hold limit for this booking is reached in ' || s.warning_days || ' days. If the dispute is not settled by then, the default rule in the Gala Dock Payment Terms applies: the disputed amount is refunded to the customer and the rest is released to the provider. Settle in the dispute to avoid this.');
    update public.payout_releases set warning_sent_at = now() where id = rv.id;
  end loop;

  return jsonb_build_object('created', created, 'due', due, 'blocked', blocked, 'default_rule', defaults, 'cancelled', cancelled);
end $function$
;

-- guard_resale_original_payer
CREATE OR REPLACE FUNCTION public.guard_resale_original_payer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.checkout_orders;
begin
 if new.status in ('resale_listed','resold') and new.status is distinct from old.status then
  select * into o from public.checkout_orders where order_ref=old.order_ref for update;
  if not found or o.buyer_id is distinct from old.holder_id or o.event_id<>old.event_id or o.status<>'issued'
   or o.refund_status<>'none' or o.stripe_session is null or upper(o.currency)<>'GBP' then
   raise exception 'original_payment_required' using errcode='22023';
  end if;
  if new.status='resold' and (not exists(select 1 from public.resale_holds where ticket_id=old.id and expires_at>now())
    or not exists(select 1 from public.events where id=old.event_id and status in ('published','on_sale') and starts_at>now())) then
   raise exception 'seat_unavailable' using errcode='23P01';
  end if;
 end if;
 return new;
end $function$
;

-- guard_resale_reservation_payer
CREATE OR REPLACE FUNCTION public.guard_resale_reservation_payer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.tickets t join public.checkout_orders o on o.order_ref=t.order_ref
  where t.id=new.ticket_id and o.buyer_id=t.holder_id and o.status='issued' and o.refund_status='none' and o.stripe_session is not null and upper(o.currency)='GBP') then
  raise exception 'original_payment_required' using errcode='22023';
 end if;
 return new;
end $function$
;

-- resale_listings
CREATE OR REPLACE FUNCTION public.resale_listings(p_event uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'tier', tt.name, 'tier_id', tt.id, 'seat', t.seat, 'price', t.price_paid,
   'face_value', coalesce(l.face_value_minor / 100.0, t.face_value, tt.price), 'restrictions', coalesce(l.restrictions, public.ticket_resale_restrictions(t.id)), 'policy_version', coalesce(l.policy_version, p.version),
   'jurisdiction', coalesce(l.jurisdiction, p.jurisdiction),
   'listing_ref', case when l.id is null then null else 'RSL-' || upper(left(replace(l.id::text, '-', ''), 8)) end,
   'ticket_ref', 'GLD-••••-••' || upper(right(t.code, 4))) order by t.price_paid), '[]'::jsonb)
 from public.tickets t join public.ticket_tiers tt on tt.id = t.tier_id join public.events e on e.id = t.event_id
 join public.checkout_orders o on o.order_ref = t.order_ref and o.buyer_id = t.holder_id and o.status = 'issued' and o.refund_status = 'none' and o.stripe_session is not null and upper(o.currency) = 'GBP'
 left join lateral (select value from public.platform_settings where section = 'ticketing' and status = 'published' order by version desc limit 1) s on true
 left join lateral (select * from public.resale_policy_for(p_event)) p on true
 left join public.ticket_resale_listings l on l.ticket_id = t.id and l.status = 'listed'
 where t.event_id = p_event and t.status = 'resale_listed' and e.visibility = 'public' and e.status in ('published', 'on_sale') and e.starts_at > now()
 and coalesce(e.settings->>'resale', 'true') <> 'false' and coalesce(s.value->>'resale_enabled', 'true') <> 'false'
 and t.price_paid > 0 and t.price_paid <= coalesce(t.face_value, tt.price) * coalesce(p.price_cap_pct, (s.value->>'resale_cap_pct')::numeric, 100) / 100
 and not exists (select 1 from public.resale_holds h where h.ticket_id = t.id and h.expires_at > now())
$function$
;

-- dec107_release_paid
CREATE OR REPLACE FUNCTION public.dec107_release_paid(p_items jsonb, p_payout text, p_group text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare it jsonb; pr public.payout_releases; n integer := 0; s public.dec107_settings;
begin
  select * into s from public.dec107_settings where id;
  if p_payout !~ '^po_[A-Za-z0-9_]+$' then raise exception 'invalid_payout' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from public.payout_releases where id = (it->>'id')::uuid for update;
    if not found or pr.status <> 'due' then continue; end if;
    if public.dec107_payouts_paused(pr.workspace_id) then raise exception 'payouts_paused' using errcode = '22023'; end if;
    -- A reserve part keeps its own reserve fields (202611116003: the sandbox proof found they were wiped → check violation).
    update public.payout_releases set status = 'paid_out', amount_minor = (it->>'amount_minor')::bigint, stripe_payout_id = p_payout, payout_group = p_group,
      released_at = now(),
      reserve_kind = case when pr.part = 'reserve' then pr.reserve_kind else nullif(it->>'reserve_kind', '') end,
      reserve_bps = case when pr.part = 'reserve' then pr.reserve_bps else nullif(it->>'reserve_bps', '')::integer end,
      reserve_minor = case when pr.part = 'reserve' then pr.reserve_minor else nullif(it->>'reserve_minor', '')::bigint end,
      reserve_until = case when pr.part = 'reserve' then pr.reserve_until
                           when coalesce((it->>'reserve_minor')::bigint, 0) > 0 then least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at) end,
      terms_version = case when pr.part = 'reserve' then pr.terms_version when coalesce((it->>'reserve_minor')::bigint, 0) > 0 then s.payment_terms_version end,
      error = null, updated_at = now()
     where id = pr.id;
    if pr.part = 'main' and coalesce((it->>'reserve_minor')::bigint, 0) > 0 then
      insert into public.payout_releases(source_type, source_ref, part, workspace_id, stripe_account_id, payment_intent, event_id, sale_kind, currency, livemode,
          charged_at, hold_limit_at, trigger_at, trigger, reserve_kind, reserve_bps, reserve_minor, reserve_until, terms_version)
        values (pr.source_type, pr.source_ref, 'reserve', pr.workspace_id, pr.stripe_account_id, pr.payment_intent, pr.event_id, pr.sale_kind, pr.currency, pr.livemode,
          pr.charged_at, pr.hold_limit_at, least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at), 'reserve_end',
          it->>'reserve_kind', (it->>'reserve_bps')::integer, (it->>'reserve_minor')::bigint,
          least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at), s.payment_terms_version)
        on conflict (source_type, source_ref, part) do nothing;
    end if;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', pr.workspace_id, 'payout.released',
      jsonb_build_object('release', pr.id, 'source', pr.source_type || ':' || pr.source_ref, 'event_id', pr.event_id, 'trigger', pr.trigger, 'payout', p_payout,
        'amount_minor', (it->>'amount_minor')::bigint, 'reserve_minor', (it->>'reserve_minor')::bigint));
    n := n + 1;
  end loop;
  return n;
end $function$
;

-- customer_accept_quote
CREATE OR REPLACE FUNCTION public.customer_accept_quote(p_item uuid, p_payment_ref text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.build_items; e public.events; dep numeric; bal numeric; due timestamptz; ws uuid; owner uuid;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.events where id = b.event_id;
  if e.owner_id is distinct from auth.uid() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status not in ('quoted','available','held') or b.amount is null then raise exception 'not_bookable:%', b.status using errcode = '22023'; end if;
  if b.status = 'held' and b.hold_expires_at < now() then raise exception 'hold_expired' using errcode = '22023'; end if;
  if (b.quote->>'valid_until') is not null and (b.quote->>'valid_until')::date < current_date then raise exception 'quote_expired' using errcode = '22023'; end if;

  perform public.transition_build_item(b.id, 'confirmed');
  if (b.quote->>'quote_id') is not null then
    update public.provider_quotes set status = 'accepted' where id = (b.quote->>'quote_id')::uuid and status in ('sent','viewed');
  end if;

  dep := least(coalesce(nullif(b.deposit, 0), round(b.amount * 0.3, 2)), b.amount); bal := b.amount - dep;
  due := greatest(coalesce(e.starts_at - interval '14 days', now() + interval '7 days'), now() + interval '1 day');
  select l.workspace_id, w.owner_id into ws, owner from public.listings l join public.workspaces w on w.id = l.workspace_id where l.id = b.listing_id;
  insert into public.payments(event_id, build_item_id, payee, kind, amount, status, due_at, paid_at, refundable, stripe_payment_intent)
    values (e.id, b.id, b.title, 'deposit', dep, 'paid', now(), now(), false, nullif(left(coalesce(p_payment_ref, ''), 120), ''));
  if bal > 0 then
    insert into public.payments(event_id, build_item_id, payee, kind, amount, status, due_at, refundable)
      values (e.id, b.id, b.title, 'balance', bal, 'scheduled', due, false);
  end if;
  insert into public.transactions(workspace_id, event_id, kind, category, description, amount, status, source, source_type, source_id, occurred_at, currency, counterparty, stripe_ref)
    values (e.workspace_id, e.id, 'payment', b.category, 'Deposit — ' || b.title, dep, 'completed', 'marketplace', 'build_item', b.id, now(), coalesce(e.currency, 'GBP'), b.title, nullif(left(coalesce(p_payment_ref, ''), 120), ''));
  update public.provider_jobs set payment_status = 'deposit_paid', paid_amount = dep where build_item_id = b.id;
  if b.request_id is not null then update public.provider_requests set status = 'closed' where id = b.request_id; end if;
  if owner is not null then
    insert into public.notifications(user_id, kind, title, body, link)
      values (owner, 'booking_confirmed', 'Quote accepted: ' || e.name, 'Deposit of £' || dep::text || ' received', '/provider/opportunities/' || b.id);
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), ws, 'quote.accepted', jsonb_build_object('build_item_id', b.id, 'deposit', dep, 'balance', bal));
end $function$
;

-- i18n_quote_currency
CREATE OR REPLACE FUNCTION public.i18n_quote_currency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c text;
begin
  select upper(e.currency) into c from public.build_items b join public.events e on e.id = b.event_id where b.id = new.build_item_id;
  if c ~ '^[A-Z]{3}$' then new.currency := c; end if;
  return new;
end $function$
;

-- record_invoice_payment
CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice uuid, p_amount numeric, p_method text, p_ref text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.invoices; left_amt numeric; inst record; paid numeric;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_workspace_role(i.workspace_id, array['owner','manager','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if i.status in ('draft','cancelled','credited','paid') then raise exception 'not_payable' using errcode = '22023'; end if;
  if p_amount <= 0 or p_amount > i.total - i.amount_paid + 0.005 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  paid := i.amount_paid + p_amount;
  update public.invoices set amount_paid = paid, status = case when paid >= i.total - 0.005 then 'paid' else 'partial' end where id = i.id;
  left_amt := p_amount;
  for inst in select * from public.invoice_installments where invoice_id = i.id and status <> 'paid' order by due_date loop
    exit when left_amt <= 0;
    if left_amt >= inst.amount - 0.005 then update public.invoice_installments set status = 'paid' where id = inst.id; left_amt := left_amt - inst.amount; else exit; end if;
  end loop;
  insert into public.transactions(workspace_id, event_id, kind, category, description, amount, status, source, source_type, source_id, occurred_at, currency, counterparty, stripe_ref)
    values (i.workspace_id, i.event_id, 'income', 'invoice', 'Invoice ' || i.number || ' payment', p_amount, 'completed', 'manual', 'invoice', i.id, now(), i.currency, i.client_name, nullif(left(coalesce(p_ref, ''), 120), ''));
  insert into public.invoice_events(invoice_id, event, detail) values (i.id, case when paid >= i.total - 0.005 then 'Invoice paid' else 'Payment received' end,
    '£' || to_char(p_amount, 'FM999G999G990D00') || ' received via ' || coalesce(nullif(p_method, ''), 'bank transfer'));
end $function$
;

-- cancel_event_with_refunds
CREATE OR REPLACE FUNCTION public.cancel_event_with_refunds(p_event uuid, p_reason text, p_cause text DEFAULT 'organiser'::text, p_fm_detail text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; n_orders integer; n_tickets integer; chg numeric; n_chg integer; is_admin boolean; cause text := coalesce(p_cause, 'organiser');
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  is_admin := public.has_admin_permission('tickets'); if is_admin and not public.has_workspace_role(e.workspace_id, array['owner','manager']) then perform public.admin_mfa_required(); end if;
  if not (public.has_workspace_role(e.workspace_id, array['owner','manager']) or is_admin) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if cause not in ('organiser','force_majeure','platform') then raise exception 'invalid_cause' using errcode = '22023'; end if;
  if cause = 'platform' and not is_admin then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(e.workspace_id);
  if cause = 'force_majeure' and length(trim(coalesce(p_fm_detail, ''))) < 30 then raise exception 'fm_detail_required' using errcode = '22023'; end if;
  if e.status in ('cancelled','completed','closed','archived') then raise exception 'invalid_state' using errcode = '22023'; end if;
  if e.starts_at is not null and e.starts_at < now() - interval '1 day' then raise exception 'already_happened' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;

  insert into public.event_cancellations(event_id, reason, cancelled_by, cause, fm_detail, fm_status)
    values (p_event, left(trim(p_reason), 2000), auth.uid(), cause, case when cause = 'force_majeure' then left(trim(p_fm_detail), 4000) end,
            case when cause = 'force_majeure' then 'pending' else 'none' end);
  update public.events set status = 'cancelled', updated_at = now() where id = p_event;
  update public.tickets set status = 'cancelled' where event_id = p_event and status in ('valid','resale_listed','transferred');
  get diagnostics n_tickets = row_count;
  -- Buyers: always a full refund of ticket price + booking fee (Consumer Rights Act 2015; Ticket Terms 3).
  update public.checkout_orders set refund_status = 'due', refund_reason = 'event_cancelled'
    where event_id = p_event and status in ('paid','issued') and (amount + fee) > 0 and refund_status in ('none','failed');
  get diagnostics n_orders = row_count;
  -- Organiser: platform fees on sold tickets (5% commission + the booking fees refunded to buyers).
  select coalesce(sum(o.commission + o.fee), 0), count(*) into chg, n_chg from public.checkout_orders o
    where o.event_id = p_event and o.kind = 'primary' and o.refund_status = 'due' and o.refund_reason = 'event_cancelled';
  if chg > 0 and cause <> 'platform' then
    insert into public.platform_charges(workspace_id, event_id, kind, description, amount, status, metadata)
      values (e.workspace_id, p_event, 'cancellation_fees', left('Platform fees on tickets sold for ' || e.name || ' (event cancelled)', 300), chg,
              case when cause = 'force_majeure' then 'on_hold' else 'due' end, jsonb_build_object('orders', n_chg, 'cause', cause))
      on conflict (event_id, kind) do nothing;
    if e.workspace_id is not null then
      perform public.notify_workspace(e.workspace_id, array['owner','manager','finance'], 'payment_due',
        left(case when cause = 'force_majeure' then 'Force majeure review: ' else 'Platform fees due: ' end || e.name, 160),
        case when cause = 'force_majeure'
          then 'Buyers are being refunded in full. You told us the event can’t go ahead for reasons outside your control, so platform fees of £' || to_char(chg, 'FM999999990.00') || ' are on hold while we review it (usually within 5 working days). If we accept it, the fees are waived in full.'
          else 'Buyers are being refunded in full. Platform fees of £' || to_char(chg, 'FM999999990.00') || ' on the tickets sold remain payable and will be deducted from your next payout or invoiced.' end,
        '/organizer/money');
    end if;
  end if;
  update public.checkout_orders set refund_status = 'not_required' where event_id = p_event and status in ('paid','issued') and (amount + fee) = 0 and refund_status = 'none';
  update public.resale_payouts rp set status = 'cancelled' from public.tickets t where t.id = rp.ticket_id and t.event_id = p_event and rp.status = 'pending';
  delete from public.ticket_waitlist where event_id = p_event;

  update public.event_cancellations set orders_refunded = n_orders, tickets_voided = n_tickets where event_id = p_event;
  insert into public.notifications(user_id, kind, title, body, link)
    select distinct o.buyer_id, 'ticket_refund', left(e.name || ' has been cancelled', 160),
      'This event has been cancelled. ' || case when (o.amount + o.fee) > 0 then 'You’ll get a full refund, including fees, to your original payment method within 5–10 working days.' else 'Your free tickets have been cancelled.' end,
      '/account/tickets'
    from public.checkout_orders o where o.event_id = p_event and o.status in ('paid','issued') and o.buyer_id is not null;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', e.workspace_id, 'event.cancelled', jsonb_build_object('event_id', p_event, 'cause', cause, 'orders_to_refund', n_orders, 'tickets_voided', n_tickets,
      'fees', coalesce(chg, 0), 'fees_status', case when cause = 'platform' or coalesce(chg, 0) = 0 then 'none' when cause = 'force_majeure' then 'on_hold' else 'due' end, 'reason', left(p_reason, 300)));
  return jsonb_build_object('orders_to_refund', n_orders, 'tickets_voided', n_tickets, 'fees_due', case when cause = 'organiser' then coalesce(chg, 0) else 0 end,
    'fees_on_hold', case when cause = 'force_majeure' then coalesce(chg, 0) else 0 end, 'cause', cause);
end $function$
;

-- admin_review_force_majeure
CREATE OR REPLACE FUNCTION public.admin_review_force_majeure(p_event uuid, p_approve boolean, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.event_cancellations; e public.events; amt numeric;
begin
  perform public.admin_require('tickets', p_reason);
  select * into c from public.event_cancellations where event_id = p_event for update;
  if not found or c.cause <> 'force_majeure' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.fm_status <> 'pending' then raise exception 'invalid_state' using errcode = '22023'; end if;
  select * into e from public.events where id = p_event;
  update public.event_cancellations set fm_status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(trim(p_reason), 2000)
    where event_id = p_event;
  update public.platform_charges set status = case when p_approve then 'waived' else 'due' end, settled_at = case when p_approve then now() end,
      metadata = metadata || jsonb_build_object('fm_decision', case when p_approve then 'approved' else 'rejected' end)
    where event_id = p_event and kind = 'cancellation_fees' and status = 'on_hold' returning amount into amt;
  if e.workspace_id is not null then
    perform public.notify_workspace(e.workspace_id, array['owner','manager','finance'], 'payment_due',
      left(case when p_approve then 'Force majeure accepted: ' else 'Force majeure not accepted: ' end || e.name, 160),
      case when p_approve then 'We accepted that ' || e.name || ' couldn’t go ahead for reasons outside your control. Platform fees' || case when amt is not null then ' of £' || to_char(amt, 'FM999999990.00') else '' end || ' are waived.'
           else 'We reviewed your force majeure claim for ' || e.name || ' and couldn’t accept it: ' || left(trim(p_reason), 400) || ' Platform fees' || case when amt is not null then ' of £' || to_char(amt, 'FM999999990.00') else '' end
                || ' are now payable. If you have more evidence, contact support within 14 days and we’ll look again.' end,
      '/organizer/money');
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), e.workspace_id, case when p_approve then 'admin.force_majeure_approved' else 'admin.force_majeure_rejected' end,
      jsonb_build_object('event_id', p_event, 'amount', amt, 'reason', left(p_reason, 300)));
  return case when p_approve then 'approved' else 'rejected' end;
end $function$
;

-- payment_order_transferred
CREATE OR REPLACE FUNCTION public.payment_order_transferred(p_ref text, p_transfer text, p_amount_minor bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare po public.payment_orders;
begin
  select * into po from public.payment_orders where reference = p_ref for update;
  if not found or po.stripe_transfer is not null then return; end if;
  update public.payment_orders set status = 'transfer_created', stripe_transfer = p_transfer, transferred_minor = p_amount_minor, released_at = now(), updated_at = now() where id = po.id;
  perform public.post_ledger_transaction('stripe:transfer:' || p_transfer, 'provider_payout', po.currency, jsonb_build_array(
    jsonb_build_object('account', 'provider_payable', 'amount_minor', p_amount_minor, 'party_type', 'workspace', 'party_id', po.payee_workspace_id),
    jsonb_build_object('account', 'cash_stripe', 'amount_minor', -p_amount_minor, 'party_type', 'platform')),
    po.payee_workspace_id, po.event_id, 'payment_order', po.reference, 'Transfer to provider — ' || po.description, p_transfer, 'system');
  perform public.notify_workspace(po.payee_workspace_id, array['owner','manager','finance'], 'provider.payout', 'Funds released',
    '£' || round(p_amount_minor / 100.0, 2) || ' sent to your Stripe balance for ' || po.description || '.', '/provider/money');
end $function$
;

-- provider_offer_standby
CREATE OR REPLACE FUNCTION public.provider_offer_standby(p_standby uuid, p_fee numeric, p_activation_price numeric, p_valid_hours integer, p_terms text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.standby_commitments;
begin
  select * into s from public.standby_commitments where id = p_standby for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(s.workspace_id, array['owner','manager']);
  if s.status <> 'requested' then raise exception 'not_open:%', s.status using errcode = '22023'; end if;
  if p_fee is null or p_fee < 0 or p_activation_price is null or p_activation_price <= 0 then raise exception 'invalid_price' using errcode = '22023'; end if;
  if p_valid_hours is null or p_valid_hours not between 2 and 168 then raise exception 'invalid_validity' using errcode = '22023'; end if;
  if length(trim(coalesce(p_terms, ''))) < 10 then raise exception 'terms_required' using errcode = '22023'; end if;
  update public.standby_commitments set status = 'offered', standby_fee = round(p_fee, 2), activation_price = round(p_activation_price, 2),
    cancellation_terms = left(p_terms, 2000), expires_at = least(window_start, now() + make_interval(hours => p_valid_hours)), updated_at = now() where id = s.id;
  perform public.notify_event(s.event_id, 'quote_received', 'Standby offer received',
    'Standby fee £' || round(p_fee, 2) || ', activation price £' || round(p_activation_price, 2) || '.', public.event_path(s.event_id, 'booking', s.build_item_id));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', s.workspace_id, 'standby.offered', jsonb_build_object('standby_id', s.id, 'fee', p_fee, 'activation_price', p_activation_price));
end $function$
;

-- activate_standby
CREATE OR REPLACE FUNCTION public.activate_standby(p_standby uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.standby_commitments;
begin
  select * into s from public.standby_commitments where id = p_standby for update;
  if not found or not public.can_edit_event(s.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if s.status <> 'accepted' then raise exception 'not_accepted:%', s.status using errcode = '22023'; end if;
  if s.fee_status = 'due' then raise exception 'standby_fee_unpaid' using errcode = '22023'; end if;
  if now() > s.window_end then raise exception 'window_closed' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.standby_commitments set status = 'activated', activated_at = now(), activation_reason = left(p_reason, 500), updated_at = now() where id = s.id;
  update public.build_items set status = 'confirmed', role = 'primary', amount = s.activation_price, price_basis = 'fixed',
    terms_snapshot = jsonb_build_object('source', 'standby', 'standby_id', s.id, 'amount', s.activation_price, 'standby_fee', s.standby_fee,
      'cancellation', s.cancellation_terms, 'confirmed_at', now()), updated_at = now() where id = s.build_item_id;
  if s.primary_item_id is not null then
    update public.build_items set role = 'backup', updated_at = now() where id = s.primary_item_id;
    update public.build_items set status = 'replacement_required', updated_at = now() where id = s.primary_item_id and status = 'confirmed';
  end if;
  perform public.notify_workspace(s.workspace_id, array['owner','manager','member'], 'booking_confirmed', 'Standby activated — you are booked',
    'Activation price £' || s.activation_price || '. Reason: ' || left(p_reason, 200), '/provider/opportunities/' || s.build_item_id);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', s.workspace_id, 'standby.activated', jsonb_build_object('standby_id', s.id, 'reason', left(p_reason, 500)));
end $function$
;

-- provider_emergency_respond
CREATE OR REPLACE FUNCTION public.provider_emergency_respond(p_candidate uuid, p_action text, p_quote numeric DEFAULT NULL::numeric, p_eta integer DEFAULT NULL::integer, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.emergency_candidates; r public.emergency_requests;
begin
  select * into c from public.emergency_candidates where id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(c.workspace_id, array['owner','manager','member']);
  select * into r from public.emergency_requests where id = c.request_id;
  if p_action = 'open' then
    update public.emergency_candidates set opened_at = coalesce(opened_at, now()), status = case when status = 'delivered' then 'opened' else status end where id = c.id;
    return;
  end if;
  if r.status not in ('open','matching') or c.status not in ('delivered','opened','interested','quoted') then raise exception 'not_open' using errcode = '22023'; end if;
  if p_action = 'decline' then
    update public.emergency_candidates set status = 'declined', responded_at = now(), note = left(coalesce(p_note, ''), 1000) where id = c.id;
  elsif p_action in ('interested','quote') then
    if p_action = 'quote' and (p_quote is null or p_quote <= 0) then raise exception 'invalid_quote' using errcode = '22023'; end if;
    update public.emergency_candidates set status = case when p_action = 'quote' then 'quoted' else 'interested' end, quote_amount = coalesce(round(p_quote, 2), quote_amount),
      eta_minutes = coalesce(p_eta, eta_minutes), note = left(coalesce(p_note, ''), 1000), responded_at = now(), opened_at = coalesce(opened_at, now()) where id = c.id;
    perform public.notify_event(r.event_id, 'quote_received', 'Emergency response received',
      case when p_action = 'quote' then 'A provider quoted £' || round(p_quote, 2) || ' for ' || r.category || '.' else 'A provider is interested in your ' || r.category || ' request.' end,
      public.event_path(r.event_id, 'emergency', r.id));
  else raise exception 'invalid_action' using errcode = '22023';
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', c.workspace_id, 'emergency.' || p_action, jsonb_build_object('candidate_id', c.id, 'request_id', r.id));
end $function$
;

-- accept_emergency_candidate
CREATE OR REPLACE FUNCTION public.accept_emergency_candidate(p_candidate uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.emergency_candidates; r public.emergency_requests; l public.listings; bid uuid;
begin
  select * into c from public.emergency_candidates where id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from public.emergency_requests where id = c.request_id for update;
  if not public.can_edit_event(r.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.status not in ('open','matching') then raise exception 'request_closed' using errcode = '22023'; end if;
  if c.status <> 'quoted' or c.quote_amount is null then raise exception 'not_quoted' using errcode = '22023'; end if;
  select * into l from public.listings where id = c.listing_id;
  insert into public.build_items(event_id, listing_id, category, title, package, scope, image, amount, price_basis, status, role, terms_snapshot, notes, sort)
    values (r.event_id, c.listing_id, r.category, coalesce(l.name, 'Emergency supplier'), 'Emergency supply', left(r.scope, 500), l.image, c.quote_amount, 'fixed', 'draft', 'primary',
      jsonb_build_object('source', 'emergency', 'emergency_request', r.id, 'amount', c.quote_amount, 'eta_minutes', c.eta_minutes, 'accepted_at', now()), left(c.note, 2000), 90)
    returning id into bid;
  update public.build_items set status = 'quoted', updated_at = now() where id = bid; -- organiser confirms and pays through the normal booking flow
  update public.emergency_candidates set status = 'accepted', accepted_at = now(), build_item_id = bid where id = c.id;
  update public.emergency_candidates set status = 'not_selected' where request_id = r.id and id <> c.id and status in ('delivered','opened','interested','quoted');
  update public.emergency_requests set status = 'filled', filled_candidate_id = c.id, updated_at = now() where id = r.id;
  perform public.notify_workspace(c.workspace_id, array['owner','manager','member'], 'booking_confirmed', 'Emergency booking accepted',
    'The organiser accepted your quote of £' || c.quote_amount || '. Confirm and head out.', '/provider/opportunities/' || bid);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'emergency.accepted', jsonb_build_object('request_id', r.id, 'candidate_id', c.id, 'build_item_id', bid));
  return bid;
end $function$
;

-- payment_order_succeeded
CREATE OR REPLACE FUNCTION public.payment_order_succeeded(p_ref text, p_pi text, p_charge text, p_amount_minor bigint, p_livemode boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare po public.payment_orders; b public.build_items; e public.events; dep numeric; bal numeric; owner uuid; tx uuid; amt numeric;
begin
  select * into po from public.payment_orders where reference = p_ref for update;
  if not found then return 'unknown_order'; end if;
  if po.status not in ('amount_due','payment_pending','failed') then return 'already_applied'; end if;
  if p_amount_minor <> po.amount_minor + po.customer_fee_minor then
    update public.payment_orders set status = 'failed', failure_reason = 'amount_mismatch:' || p_amount_minor, updated_at = now() where id = po.id;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', po.payee_workspace_id, 'payment.amount_mismatch', jsonb_build_object('payment_order', p_ref, 'expected', po.amount_minor + po.customer_fee_minor, 'got', p_amount_minor));
    return 'amount_mismatch';
  end if;
  update public.payment_orders set status = case when po.protected then 'protected_pending_delivery' else 'payment_succeeded' end, stripe_payment_intent = p_pi, stripe_charge = p_charge,
    livemode = p_livemode, updated_at = now() where id = po.id;
  tx := public.post_ledger_transaction('stripe:pi:' || p_pi, case po.kind when 'standby_fee' then 'standby_fee' when 'emergency_service' then 'emergency_service' when 'balance_payment' then 'balance_payment' else 'deposit' end,
    po.currency, (select jsonb_agg(x) from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('account', 'cash_stripe', 'amount_minor', po.amount_minor + po.customer_fee_minor, 'party_type', 'platform'),
      jsonb_build_object('account', 'platform_fee', 'amount_minor', -(po.platform_fee_minor + po.customer_fee_minor - po.platform_fee_vat_minor - po.customer_fee_vat_minor), 'party_type', 'platform'),
      jsonb_build_object('account', 'tax_payable', 'amount_minor', -(po.platform_fee_vat_minor + po.customer_fee_vat_minor), 'party_type', 'platform'),
      jsonb_build_object('account', 'provider_payable', 'amount_minor', -(po.amount_minor - po.platform_fee_minor), 'party_type', 'workspace', 'party_id', po.payee_workspace_id))) x where (x->>'amount_minor')::bigint <> 0),
    po.payee_workspace_id, po.event_id, 'payment_order', po.reference, po.description, p_pi, 'webhook');
  amt := po.amount_minor / 100.0;
  select * into b from public.build_items where id = po.build_item_id for update;
  select * into e from public.events where id = po.event_id;
  if po.kind in ('deposit','emergency_service') and b.status not in ('confirmed','active','fulfilled','completed') then
    dep := amt; bal := greatest(coalesce(b.amount, 0) - dep, 0);
    update public.build_items set status = 'confirmed', hold_expires_at = null, updated_at = now(),
      terms_snapshot = coalesce(terms_snapshot, '{}') || jsonb_build_object('amount', b.amount, 'deposit', dep, 'package', b.package, 'confirmed_at', now(), 'commission', po.commission,
        'cancellation', coalesce(b.terms_snapshot->'cancellation', (select q.terms->'cancellation' from public.provider_quotes q where q.id = nullif(b.quote->>'quote_id', '')::uuid),
          (select l.details->'cancellation' from public.listings l where l.id = b.listing_id)), 'payment_order', po.reference)
      where id = b.id;
    if (b.quote->>'quote_id') is not null then update public.provider_quotes set status = 'accepted' where id = (b.quote->>'quote_id')::uuid and status in ('sent','viewed'); end if;
    insert into public.payments(event_id, build_item_id, payee, kind, amount, status, due_at, paid_at, refundable, stripe_payment_intent)
      values (po.event_id, b.id, b.title, 'deposit', dep, 'paid', now(), now(), false, p_pi);
    if bal > 0 then insert into public.payments(event_id, build_item_id, payee, kind, amount, status, due_at, refundable)
      values (po.event_id, b.id, b.title, 'balance', bal, 'scheduled', greatest(coalesce(e.starts_at - interval '14 days', now() + interval '7 days'), now() + interval '1 day'), false); end if;
    update public.provider_jobs set payment_status = 'deposit_paid', paid_amount = coalesce(paid_amount, 0) + dep where build_item_id = b.id;
    if b.request_id is not null then update public.provider_requests set status = 'closed' where id = b.request_id; end if;
    select w.owner_id into owner from public.workspaces w where w.id = po.payee_workspace_id;
    perform public.notify_workspace(po.payee_workspace_id, array['owner','manager'], 'booking_confirmed', 'Booking confirmed: ' || coalesce(e.name, b.title),
      'Payment of £' || amt || ' received and protected until delivery.', '/provider/opportunities/' || b.id);
  elsif po.kind = 'balance_payment' then
    update public.payments set status = 'paid', paid_at = now(), stripe_payment_intent = p_pi where build_item_id = b.id and kind = 'balance' and status in ('scheduled','due','overdue');
    update public.provider_jobs set paid_amount = coalesce(paid_amount, 0) + amt, payment_status = 'paid' where build_item_id = b.id;
    perform public.notify_workspace(po.payee_workspace_id, array['owner','manager','finance'], 'provider.payout', 'Balance paid: ' || b.title, 'Balance of £' || amt || ' received.', '/provider/money');
  elsif po.kind = 'standby_fee' then
    update public.standby_commitments set fee_status = 'paid', fee_payment_ref = p_pi, updated_at = now() where id = po.standby_id;
    perform public.notify_workspace(po.payee_workspace_id, array['owner','manager'], 'provider.payout', 'Standby fee paid', 'Your standby commitment is now active. Keep the window free.', '/provider/opportunities/' || b.id);
  end if;
  insert into public.transactions(workspace_id, event_id, kind, category, description, amount, status, source, source_type, source_id, occurred_at, currency, counterparty, stripe_ref, fee_amount, net_amount)
    values (e.workspace_id, po.event_id, 'payment', coalesce(b.category, 'marketplace'), po.description, amt, 'completed', 'marketplace', 'payment_order', po.id, now(), po.currency, coalesce(b.title, ''), p_pi,
      po.platform_fee_minor / 100.0, (po.amount_minor - po.platform_fee_minor) / 100.0);
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', po.payee_workspace_id, 'payment.succeeded', jsonb_build_object('payment_order', p_ref, 'amount_minor', p_amount_minor));
  return 'applied';
end $function$
;

-- dec107_default_rule_notice
CREATE OR REPLACE FUNCTION public.dec107_default_rule_notice(p_dispute uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.dec107_settings; v text;
begin
  select * into s from public.dec107_settings where id;
  v := case when s.dispute_rules_in_force_from is not null and s.dispute_rules_in_force_from <= now()
            then 'Gala Dock Disputes Policy (' || s.dispute_rules_version || '), clause 13' else 'Gala Dock Payment Terms (' || s.payment_terms_version || '), clause 8.4' end;
  perform public.dec107_dispute_notice(p_dispute, 'dispute_default_rule', 'Default rule applied at the payment hold limit',
    'The payment provider''s hold limit was reached before this dispute was settled, so the default rule in the ' || v || ' applied: £'
    || to_char(coalesce(p_amount, 0), 'FM999G999G990D00') || ' (the disputed amount) is refunded to the customer and the rest is released to the provider. '
    || 'This is not a decision on the dispute. The customer remains liable to pay the provider the refunded amount unless a court, arbitrator or ADR body decides otherwise or you both agree otherwise. '
    || 'The provider can ask Gala Dock for the customer''s contact details.');
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'dispute.default_rule', jsonb_build_object('dispute_id', p_dispute, 'amount', p_amount, 'clause', v));
end $function$
;

-- dispute_offer_settlement
CREATE OR REPLACE FUNCTION public.dispute_offer_settlement(p_dispute uuid, p_refund numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.booking_disputes; party text; sid uuid; paid numeric;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  party := public.dispute_party(d);
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status = 'resolved' then raise exception 'not_open' using errcode = '22023'; end if;
  paid := coalesce((d.payment_snapshot->>'paid_amount')::numeric, (d.payment_snapshot->>'amount')::numeric, 0);
  if p_refund is null or p_refund < 0 or (paid > 0 and p_refund > paid) then raise exception 'invalid_refund' using errcode = '22023'; end if;
  update public.booking_dispute_settlements set status = 'superseded' where dispute_id = d.id and status = 'open';
  insert into public.booking_dispute_settlements(dispute_id, offered_by, party, refund_minor, note) values (d.id, auth.uid(), party, round(p_refund * 100)::bigint, left(p_note, 1000)) returning id into sid;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), party, 'proposal',
    'Settlement offer: refund £' || to_char(p_refund, 'FM999G999G990D00') || coalesce('. ' || left(p_note, 500), ''));
  perform public.dec107_dispute_notice(d.id, 'dispute_settlement_offer', 'Settlement offer on a dispute',
    'The ' || party || ' offered to settle with a refund of £' || to_char(p_refund, 'FM999G999G990D00') || '. Open the dispute to accept it.');
  return sid;
end $function$
;

-- dec107_dispute_close
CREATE OR REPLACE FUNCTION public.dec107_dispute_close(p_dispute uuid, p_basis text, p_refund_minor bigint, p_key text, p_by uuid, p_checked_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.booking_disputes;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  -- Q58: every closing path (settlement, acceptance, deemed acceptance, award) refunds at most once per dispute.
  if not found or d.status = 'resolved' then raise exception 'not_open' using errcode = '22023'; end if;
  if coalesce(p_refund_minor, 0) > 0 and p_basis in ('default_rule','settlement','accepted_recommendation','independent_award') then
    insert into public.dec107_refund_instructions(basis, dispute_id, build_item_id, amount_minor, idempotency_key, created_by, checked_by)
      values (p_basis, d.id, d.build_item_id, p_refund_minor, p_key, p_by, p_checked_by) on conflict (idempotency_key) do nothing;
  end if;
  update public.booking_disputes set status = 'resolved', resolved_at = now(), updated_at = now(),
    resolution = coalesce(resolution, '{}'::jsonb) || jsonb_build_object('outcome', p_basis, 'refund_minor', coalesce(p_refund_minor, 0), 'closed_at', now())
   where id = d.id and status <> 'resolved';
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (p_by, case when p_basis = 'independent_award' then 'admin' when p_by is null then 'system' else 'user' end, d.workspace_id, 'dispute.' || p_basis,
      jsonb_build_object('dispute_id', d.id, 'refund_minor', coalesce(p_refund_minor, 0)));
  perform public.dec107_dispute_notice(d.id, 'dispute_resolved', 'Dispute resolved',
    case p_basis when 'settlement' then 'You agreed a settlement. ' when 'accepted_recommendation' then 'The recommendation applies. '
                 when 'lapsed' then 'The dispute lapsed: the party that opened it did not respond for 14 days after the other side answered (Disputes Policy clause 8.4). '
                 else 'An independent award was entered and checked. ' end
    || case when coalesce(p_refund_minor, 0) > 0 then 'A refund of £' || to_char(p_refund_minor / 100.0, 'FM999G999G990D00') || ' is sent to the customer''s original payment method; the rest is released to the provider.'
            else 'Any payment held for this booking is released to the provider.' end);
end $function$
;

-- trg_shift_notify
CREATE OR REPLACE FUNCTION public.trg_shift_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; ev text;
begin
  if new.crew_id is null or new.status not in ('draft','pending','confirmed') then return null; end if;
  if TG_OP = 'UPDATE' and new.crew_id is not distinct from old.crew_id then return null; end if;
  select user_id into u from public.crew_members where id = new.crew_id;
  if u is null then return null; end if;
  select name into ev from public.events where id = new.event_id;
  perform public.notify(u, 'shift_assigned', 'New shift: ' || coalesce(nullif(new.title, ''), ev, new.role),
    new.role || ' · ' || to_char(new.starts_at at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || '–' || to_char(new.ends_at at time zone 'Europe/London', 'HH24:MI') || coalesce(' · ' || nullif(new.location, ''), ''),
    public.my_shifts_link(new.workspace_id), 'shift.assigned:' || new.id || ':' || new.crew_id);
  if TG_OP = 'INSERT' then insert into public.shift_changes(shift_id, workspace_id, kind, to_crew) values (new.id, new.workspace_id, 'assigned', new.crew_id); end if;
  return null;
end $function$
;

-- request_crew_availability
CREATE OR REPLACE FUNCTION public.request_crew_availability(p_crew uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.crew_members; tid uuid;
begin
  select * into m from public.crew_members where id = p_crew;
  if not found or not public.has_workspace_role(m.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to <= p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  insert into public.tasks(workspace_id, owner_id, title, detail, category, assignee_name, due_at, priority, status)
    values (m.workspace_id, auth.uid(), 'Availability request — ' || m.name, left(coalesce(p_note, ''), 400) || E'\ncrew:' || m.id || E'\nfrom:' || p_from || E'\nto:' || p_to,
      'availability_request', m.name, p_from - interval '2 days', 'medium', 'todo') returning id into tid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), m.workspace_id, 'team.availability_requested', jsonb_build_object('crew_id', m.id, 'task_id', tid));
  if m.user_id is not null then
    perform public.notify(m.user_id, 'availability_request', 'Are you available?', to_char(p_from at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || ' – ' || to_char(p_to at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || coalesce(E'\n' || nullif(p_note, ''), ''),
      public.my_shifts_link(m.workspace_id), 'availability.request:' || tid);
  end if;
  return tid;
end $function$
;

-- request_leave
CREATE OR REPLACE FUNCTION public.request_leave(p_ws uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_kind text DEFAULT 'annual'::text, p_note text DEFAULT ''::text, p_crew uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.crew_members; rid uuid; manager boolean := public.has_workspace_role(p_ws, array['owner','manager']);
begin
  if p_crew is null then select * into m from public.crew_members where workspace_id = p_ws and user_id = auth.uid() and status <> 'deactivated' limit 1;
  else select * into m from public.crew_members where id = p_crew and workspace_id = p_ws; end if;
  if not found or not public.is_workspace_member(p_ws) or (m.user_id is distinct from auth.uid() and not manager) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to <= p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  if p_kind not in ('annual','sick','unpaid','other') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  insert into public.leave_requests(workspace_id, crew_id, kind, starts_at, ends_at, note) values (p_ws, m.id, p_kind, p_from, p_to, left(coalesce(p_note, ''), 500)) returning id into rid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'team.leave_requested', jsonb_build_object('leave_id', rid, 'crew_id', m.id));
  perform public.notify_workspace(p_ws, array['owner','manager'], 'leave_request', 'Leave request: ' || m.name,
    to_char(p_from at time zone 'Europe/London', 'DD Mon') || ' – ' || to_char(p_to at time zone 'Europe/London', 'DD Mon') || ' (' || p_kind || ')',
    case when (select kind from public.workspaces where id = p_ws) = 'provider' then '/provider/team' else '/organizer/team?tab=leave' end);
  return rid;
end $function$
;

-- decide_leave
CREATE OR REPLACE FUNCTION public.decide_leave(p_request uuid, p_approve boolean, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.leave_requests; m public.crew_members; bid uuid; clashes jsonb;
begin
  select * into r from public.leave_requests where id = p_request for update;
  if not found or not public.has_workspace_role(r.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'already_decided' using errcode = '22023'; end if;
  select * into m from public.crew_members where id = r.crew_id;
  if p_approve then
    insert into public.availability_blocks(workspace_id, crew_id, kind, starts_at, ends_at, note, created_by)
      values (r.workspace_id, r.crew_id, 'blocked', r.starts_at, r.ends_at, 'Leave (' || r.kind || ')', auth.uid()) returning id into bid;
  end if;
  update public.leave_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = left(coalesce(p_note, ''), 500), block_id = bid where id = r.id;
  select coalesce(jsonb_agg(jsonb_build_object('shift_id', s.id, 'title', s.title, 'starts_at', s.starts_at) order by s.starts_at), '[]') into clashes
    from public.shifts s where p_approve and s.crew_id = r.crew_id and s.status in ('draft','pending','confirmed') and tstzrange(s.starts_at, s.ends_at) && tstzrange(r.starts_at, r.ends_at);
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), r.workspace_id, case when p_approve then 'team.leave_approved' else 'team.leave_rejected' end,
    jsonb_build_object('leave_id', r.id, 'crew_id', r.crew_id, 'conflicting_shifts', jsonb_array_length(clashes)));
  if m.user_id is not null then
    perform public.notify(m.user_id, 'leave_decision', 'Leave ' || case when p_approve then 'approved' else 'not approved' end,
      to_char(r.starts_at at time zone 'Europe/London', 'DD Mon') || ' – ' || to_char(r.ends_at at time zone 'Europe/London', 'DD Mon') || coalesce('. ' || nullif(p_note, ''), ''),
      public.my_shifts_link(r.workspace_id), 'leave.decided:' || r.id);
  end if;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end, 'block_id', bid, 'conflicting_shifts', clashes);
end $function$
;

-- marketplace_sweep
CREATE OR REPLACE FUNCTION public.marketplace_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; n_rem integer := 0; n_exp integer := 0; n_hold integer := 0; n_sb integer := 0; n_em integer := 0; n_ds integer := 0; ws_set uuid[] := '{}';
begin
  -- §34 escalating reminders: at half the window, then in the final hour (or final quarter for short windows).
  for r in select b.id, b.title, b.response_deadline, b.response_reminders, l.workspace_id,
             case when b.response_reminders = 0 and now() >= b.sent_at + (b.response_deadline - b.sent_at) / 2 then 1
                  when b.response_reminders <= 1 and b.response_deadline - now() <= least(interval '1 hour', (b.response_deadline - b.sent_at) / 4) then 2 end lvl
           from public.build_items b join public.listings l on l.id = b.listing_id
           where b.response_status = 'pending' and b.status in ('sent','awaiting','awaiting_provider') and b.response_deadline > now() and b.sent_at is not null loop
    continue when r.lvl is null;
    perform public.notify_workspace(r.workspace_id, array['owner','manager','member'], 'request_received',
      case when r.lvl = 2 then 'Response due soon: ' else 'Reminder: respond to ' end || r.title,
      'Respond by ' || to_char(r.response_deadline at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || '. Missed deadlines affect your reliability.', '/provider/opportunities/' || r.id);
    update public.build_items set response_reminders = r.lvl where id = r.id;
    n_rem := n_rem + 1;
  end loop;
  -- Expired / No response — distinct from Declined and Unavailable (§33).
  for r in select b.id, b.event_id, b.title, l.workspace_id from public.build_items b join public.listings l on l.id = b.listing_id
           where b.status in ('sent','awaiting','awaiting_provider') and b.response_deadline < now() for update of b skip locked loop
    update public.build_items set status = 'expired', updated_at = now() where id = r.id;
    perform public.notify_event(r.event_id, 'request_received', 'No response: ' || r.title, 'The provider didn''t respond in time. You can resend or choose another provider.', public.event_path(r.event_id, 'booking', r.id));
    ws_set := ws_set || r.workspace_id; n_exp := n_exp + 1;
  end loop;
  -- Hold expiry (records and legacy held lines).
  for r in select h.id, h.build_item_id, h.event_id from public.conditional_holds h where h.status in ('requested','held') and
           ((h.status = 'held' and h.expires_at < now()) or (h.status = 'requested' and h.created_at + make_interval(hours => least(h.requested_hours, 48)) < now())) for update skip locked loop
    update public.conditional_holds set status = 'expired', closed_reason = 'expired', updated_at = now() where id = r.id;
    update public.build_items set status = coalesce(status_before_hold, 'available'), hold_expires_at = null, updated_at = now()
      where id = r.build_item_id and status in ('held','conditional_hold_requested','conditionally_held');
    perform public.notify_event(r.event_id, 'hold_expiry', 'A hold expired', 'A provider hold lapsed without confirmation. The date is no longer reserved.', public.event_path(r.event_id, 'booking', r.build_item_id));
    n_hold := n_hold + 1;
  end loop;
  update public.build_items set status = 'available', hold_expires_at = null, updated_at = now() where status = 'held' and hold_expires_at < now();
  -- Standby expiry / release after the window.
  with x as (update public.standby_commitments set status = case when status = 'accepted' then 'released' else 'expired' end, updated_at = now()
    where (status in ('requested','offered') and expires_at < now()) or (status = 'accepted' and window_end < now()) returning 1) select count(*) into n_sb from x;
  -- Emergency requests lapse at the required arrival time.
  with x as (update public.emergency_requests set status = 'expired', updated_at = now() where status in ('open','matching') and required_arrival < now() returning id),
       y as (update public.emergency_candidates c set status = 'expired' from x where c.request_id = x.id and c.status in ('delivered','opened','interested','quoted') returning 1)
  select count(*) into n_em from x;
  -- Disputes move to platform review when the response window passes.
  with x as (update public.booking_disputes set status = 'review', updated_at = now() where status in ('opened','evidence_collection','provider_response') and response_due_at < now() returning 1)
  select count(*) into n_ds from x;
  for r in select distinct unnest(ws_set) ws loop perform public.recompute_reliability(r.ws); end loop;
  return jsonb_build_object('reminders', n_rem, 'expired_requests', n_exp, 'expired_holds', n_hold, 'standby', n_sb, 'emergency', n_em, 'disputes_to_review', n_ds);
end $function$
;

-- create_emergency_request
CREATE OR REPLACE FUNCTION public.create_emergency_request(p_event uuid, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rid uuid; n integer; c record; e public.events; orig public.build_items;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event;
  if (p->>'required_arrival') is null or (p->>'required_arrival')::timestamptz < now() - interval '15 minutes' then raise exception 'invalid_arrival' using errcode = '22023'; end if;
  if (p->>'original_item_id') is not null then
    select * into orig from public.build_items where id = (p->>'original_item_id')::uuid and event_id = p_event;
    if not found then raise exception 'invalid_original' using errcode = '22023'; end if;
  end if;
  if exists (select 1 from public.emergency_requests where event_id = p_event and created_at > now() - interval '1 hour' group by event_id having count(*) >= 5) then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.emergency_requests(event_id, created_by, severity, category, required_arrival, location, lat, lng, original_item_id, failure_reason, scope, budget_max, status)
  values (p_event, auth.uid(), coalesce(p->>'severity', 'high'), lower(p->>'category'), (p->>'required_arrival')::timestamptz,
    left(coalesce(nullif(p->>'location', ''), e.venue_name, e.location, ''), 300),
    coalesce(nullif(p->>'lat', '')::float8, (select v.lat from public.listings v where v.id = e.venue_listing_id)),
    coalesce(nullif(p->>'lng', '')::float8, (select v.lng from public.listings v where v.id = e.venue_listing_id)),
    orig.id, left(coalesce(p->>'failure_reason', ''), 1000), left(coalesce(p->>'scope', ''), 2000), nullif(p->>'budget_max', '')::numeric, 'open')
  returning id into rid;
  insert into public.emergency_candidates(request_id, workspace_id, listing_id, distance_km)
    select rid, m.workspace_id, m.listing_id, m.distance_km from public.emergency_match(rid, coalesce(nullif(p->>'pool', '')::int, 8)) m;
  get diagnostics n = row_count;
  update public.emergency_requests set pool_size = n, status = case when n > 0 then 'matching' else 'open' end where id = rid;
  for c in select workspace_id from public.emergency_candidates where request_id = rid loop
    perform public.notify_workspace(c.workspace_id, array['owner','manager','member'], 'provider.request', 'Emergency request: ' || lower(p->>'category'),
      'Needed by ' || to_char((p->>'required_arrival')::timestamptz at time zone 'Europe/London', 'Dy DD Mon HH24:MI') || '. Respond fast to be considered.', '/provider/emergency/' || rid);
  end loop;
  if orig.id is not null and orig.status = 'confirmed' then update public.build_items set status = 'replacement_required', updated_at = now() where id = orig.id; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'emergency.created', jsonb_build_object('request_id', rid, 'pool', n, 'category', p->>'category'));
  return rid;
end $function$
;

-- team_conflicts
CREATE OR REPLACE FUNCTION public.team_conflicts(p_workspace uuid, p_from timestamp with time zone DEFAULT now(), p_to timestamp with time zone DEFAULT (now() + '60 days'::interval))
 RETURNS TABLE(kind text, severity text, shift_id uuid, other_id uuid, crew_id uuid, event_id uuid, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager','member','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  -- Overlapping work shifts for the same person.
  select 'overlap', 'blocker', a.id, b.id, a.crew_id, a.event_id, coalesce(c.name, 'Crew member') || ' is double-booked: ' || a.title || ' and ' || b.title
    from public.shifts a join public.shifts b on b.crew_id = a.crew_id and b.id > a.id and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
    left join public.crew_members c on c.id = a.crew_id
    where a.workspace_id = p_workspace and a.crew_id is not null and a.status in ('confirmed','pending','draft') and b.status in ('confirmed','pending','draft')
      and a.starts_at < p_to and a.ends_at > p_from
  union all
  -- Travel-time impossibility: back-to-back work shifts at different locations with under 60 minutes between.
  select 'travel', 'warning', a.id, b.id, a.crew_id, a.event_id, coalesce(c.name, 'Crew member') || ' has ' || greatest(0, round(extract(epoch from (b.starts_at - a.ends_at)) / 60))::int || ' min to get from ' || coalesce(nullif(a.location, ''), a.title) || ' to ' || coalesce(nullif(b.location, ''), b.title)
    from public.shifts a join public.shifts b on b.crew_id = a.crew_id and b.id <> a.id and b.starts_at >= a.ends_at and b.starts_at < a.ends_at + interval '60 minutes'
    left join public.crew_members c on c.id = a.crew_id
    where a.workspace_id = p_workspace and a.crew_id is not null and a.status in ('confirmed','pending','draft') and b.status in ('confirmed','pending','draft')
      and coalesce(a.location, '') <> coalesce(b.location, '') and a.starts_at < p_to and a.ends_at > p_from
  union all
  -- Unavailable staff: availability blocks on the crew member.
  select 'unavailable', 'blocker', s.id, ab.id, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || ' is unavailable (' || ab.kind || ') during ' || s.title
    from public.shifts s join public.availability_blocks ab on ab.crew_id = s.crew_id and ab.kind in ('blocked','maintenance') and tstzrange(ab.starts_at, ab.ends_at) && tstzrange(s.starts_at, s.ends_at)
    left join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.status in ('confirmed','pending','draft') and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Unavailable staff: unavailability / travel entered on the schedule as a shift row.
  select 'unavailable', 'blocker', s.id, u.id, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || ' is ' || case when u.status = 'travel' then 'travelling' else 'marked unavailable' end || ' during ' || s.title
    from public.shifts s join public.shifts u on u.crew_id = s.crew_id and u.id <> s.id and u.status in ('unavailable','travel') and tstzrange(u.starts_at, u.ends_at) && tstzrange(s.starts_at, s.ends_at)
    left join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.crew_id is not null and s.status in ('confirmed','pending','draft') and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Insufficient staffing: unassigned work shifts.
  select 'unfilled', case when s.starts_at < now() + interval '3 days' then 'blocker' else 'warning' end, s.id, null::uuid, null::uuid, s.event_id,
         coalesce(nullif(s.role, ''), 'A role') || ' needed for ' || coalesce(ev.name, s.title) || ' (' || to_char(s.starts_at at time zone 'Europe/London', 'FMDD Mon HH24:MI') || '): no one assigned'
    from public.shifts s left join public.events ev on ev.id = s.event_id where s.workspace_id = p_workspace and s.crew_id is null and s.status not in ('cancelled','unavailable','travel') and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Assigned but not confirmed: the shift is still a draft (never sent / accepted).
  select 'unconfirmed', 'warning', s.id, null::uuid, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || '’s ' || coalesce(nullif(s.role, ''), 'shift') || ' shift for ' || s.title || ' isn’t confirmed yet'
    from public.shifts s left join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.crew_id is not null and s.status = 'draft' and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Role qualification: crew skills must include the shift role when the role is a regulated one.
  select 'qualification', 'warning', s.id, null::uuid, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || ' isn’t listed as qualified for ' || s.role
    from public.shifts s join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.status in ('confirmed','pending','draft') and s.starts_at < p_to and s.ends_at > p_from and s.role ~* '(security|first aid|medic|bar|driver|rigg|electric)'
      and not exists (select 1 from unnest(coalesce(c.skills, '{}')) k where lower(k) like '%' || lower(split_part(s.role, ' ', 1)) || '%') and lower(coalesce(c.role, '')) not like '%' || lower(split_part(s.role, ' ', 1)) || '%'
  union all
  -- Missing critical role: events over 100 guests with no first aid cover.
  select 'missing_role', 'warning', null::uuid, null::uuid, null::uuid, e.id, e.name || ' (' || e.guest_count || ' guests) has no first-aid cover planned'
    from public.events e where e.workspace_id = p_workspace and e.starts_at between p_from and p_to and coalesce(e.guest_count, 0) > 100
      and not exists (select 1 from public.shifts s where s.event_id = e.id and s.role ~* '(first aid|medic)' and s.status not in ('cancelled','unavailable','travel'))
      and not exists (select 1 from public.build_items b where b.event_id = e.id and b.status in ('confirmed','held') and b.title ~* '(first aid|medic|ambulance)');
end $function$
;

-- provider_save_listing
CREATE OR REPLACE FUNCTION public.provider_save_listing(p_ws uuid, p_listing uuid, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.listings; lid uuid; k text; ws public.workspaces; d jsonb;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  select * into ws from public.workspaces where id = p_ws;
  if p_listing is not null then
    select * into l from public.listings where id = p_listing and workspace_id = p_ws for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if l.review_status in ('restricted','suspended') then raise exception 'restricted_by_platform' using errcode = '42501'; end if;
    k := l.kind;
  else
    k := p->>'kind';
    if k not in ('venue','service') then raise exception 'invalid_kind' using errcode = '22023'; end if;
    if not (k = any(ws.capabilities)) then raise exception 'capability_disabled' using errcode = '22023'; end if;
  end if;
  if p ? 'name' and length(trim(coalesce(p->>'name', ''))) not between 2 and 100 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p ? 'booking_mode' and p->>'booking_mode' not in ('instant','request','enquiry') then raise exception 'invalid_booking_mode' using errcode = '22023'; end if;
  if p ? 'response_hours' and (p->>'response_hours')::int not in (2,4,8,12,24) then raise exception 'invalid_response_window' using errcode = '22023'; end if;
  if p ? 'price_from' and (p->>'price_from')::numeric < 0 then raise exception 'invalid_price' using errcode = '22023'; end if;
  if p ? 'capacity_min' and p ? 'capacity_max' and (p->>'capacity_min')::int > (p->>'capacity_max')::int then raise exception 'invalid_capacity' using errcode = '22023'; end if;
  -- Instant booking requires a published price; contradictory commercial settings are refused.
  if coalesce(p->>'booking_mode', l.booking_mode) = 'instant' and coalesce((p->>'price_from')::numeric, l.price_from) is null then raise exception 'instant_requires_price' using errcode = '22023'; end if;
  d := coalesce(l.details, '{}'::jsonb) || coalesce(p->'details', '{}'::jsonb);
  if p_listing is null then
    insert into public.listings(workspace_id, name, kind, description, location, details, category, city, image, gallery, price_from, price_unit, capacity_min, capacity_max,
        response_hours, booking_mode, instant_book, emergency_supply, tags, slug)
      values (p_ws, trim(p->>'name'), k, coalesce(p->>'description', ''), coalesce(p->>'location', ''), d, coalesce(p->>'category', ''), coalesce(p->>'city', ''),
        coalesce(p->>'image', ''), coalesce((select array_agg(x) from jsonb_array_elements_text(p->'gallery') x), '{}'), (p->>'price_from')::numeric,
        coalesce(p->>'price_unit', 'per event'), (p->>'capacity_min')::int, (p->>'capacity_max')::int, coalesce((p->>'response_hours')::int, 8),
        coalesce(p->>'booking_mode', 'request'), coalesce(p->>'booking_mode', 'request') = 'instant', coalesce((p->>'emergency_supply')::boolean, false),
        coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), '{}'),
        lower(regexp_replace(trim(p->>'name'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))
      returning id into lid;
  else
    update public.listings set
      name = coalesce(trim(p->>'name'), name), description = coalesce(p->>'description', description), location = coalesce(p->>'location', location),
      category = coalesce(p->>'category', category), city = coalesce(p->>'city', city), image = coalesce(p->>'image', image),
      gallery = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'gallery') x), gallery),
      price_from = case when p ? 'price_from' then (p->>'price_from')::numeric else price_from end, price_unit = coalesce(p->>'price_unit', price_unit),
      capacity_min = case when p ? 'capacity_min' then (p->>'capacity_min')::int else capacity_min end,
      capacity_max = case when p ? 'capacity_max' then (p->>'capacity_max')::int else capacity_max end,
      response_hours = coalesce((p->>'response_hours')::int, response_hours), booking_mode = coalesce(p->>'booking_mode', booking_mode),
      instant_book = coalesce(p->>'booking_mode', booking_mode) = 'instant', emergency_supply = coalesce((p->>'emergency_supply')::boolean, emergency_supply),
      tags = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), tags), details = d, updated_at = now()
    where id = p_listing returning id into lid;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), p_ws, case when p_listing is null then 'listing.created' else 'listing.updated' end, jsonb_build_object('listing_id', lid, 'kind', k));
  return lid;
end $function$
;

-- public_listing_availability
CREATE OR REPLACE FUNCTION public.public_listing_availability(p_listing uuid, p_from date, p_to date, p_space uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  l public.listings;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_from date; v_to date; v_lo timestamptz; v_hi timestamptz;
  v_units uuid[]; v_all uuid[]; v_multi boolean := false; v_service boolean; v_cap int := 1;
  v_hours jsonb; v_days jsonb; v_spaces jsonb := '[]'::jsonb;
begin
  if p_listing is null or p_from is null or p_to is null then return null; end if;
  select * into l from public.listings x where x.id = p_listing and x.published and x.paused_at is null;
  if not found or (l.details -> 'public_availability') is distinct from 'true'::jsonb then return null; end if;

  v_from := greatest(p_from, v_today);
  v_to := least(p_to, v_from + 119, v_today + 548);
  v_service := l.kind <> 'venue';

  if not v_service then
    select array_agg(s.id order by s.name), coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
      into v_all, v_spaces from public.spaces s where s.venue_id = l.id and s.status = 'published';
  end if;
  if p_space is not null then
    if v_service or not (p_space = any(coalesce(v_all, '{}'))) then return null; end if;
    v_units := array[p_space]; v_spaces := '[]'::jsonb;
  else
    v_units := v_all;
  end if;
  v_multi := coalesce(array_length(v_units, 1), 0) > 0;

  v_hours := case when v_service then l.details -> 'service' -> 'availability' -> 'week' else l.details -> 'hours' end;
  if jsonb_typeof(v_hours) is distinct from 'object'
     or not exists (select 1 from jsonb_each(v_hours) h where jsonb_typeof(h.value) = 'array' or (jsonb_typeof(h.value) = 'string' and h.value #>> '{}' ~ '^\d{1,2}:\d{2}-\d{1,2}:\d{2}$')) then
    v_hours := null;
  end if;
  if v_service and (l.details -> 'service' -> 'capacity' ->> 'per_day') ~ '^\d{1,3}$' then v_cap := greatest(1, (l.details -> 'service' -> 'capacity' ->> 'per_day')::int); end if;

  if v_to < v_from then
    return jsonb_build_object('from', v_from, 'to', v_from, 'timezone', 'Europe/London', 'days', '[]'::jsonb, 'spaces', v_spaces);
  end if;
  v_lo := v_from::timestamp at time zone 'Europe/London';
  v_hi := (v_to + 1)::timestamp at time zone 'Europe/London';

  with days as (
    select g::date as day, tstzrange(g::date::timestamp at time zone 'Europe/London', (g::date + 1)::timestamp at time zone 'Europe/London') as rng,
           v_hours -> lower(to_char(g::date, 'dy')) as h
      from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') g),
  hrs as (   -- normalise [open, close] arrays and "HH:MM-HH:MM" strings to (open, close); anything else is a closed day
    select d.day, d.rng,
           case when jsonb_typeof(d.h) = 'array' then d.h ->> 0 when jsonb_typeof(d.h) = 'string' then split_part(d.h #>> '{}', '-', 1) end as o,
           case when jsonb_typeof(d.h) = 'array' then d.h ->> 1 when jsonb_typeof(d.h) = 'string' then split_part(d.h #>> '{}', '-', 2) end as c
      from days d),
  dd as (
    select x.day, x.rng,
           v_hours is not null and not (coalesce(x.o, '') ~ '^\d{1,2}:\d{2}$' and coalesce(x.c, '') ~ '^\d{1,2}:\d{2}$') as closed,
           case when coalesce(x.o, '') ~ '^\d{1,2}:\d{2}$' and coalesce(x.c, '') ~ '^\d{1,2}:\d{2}$'
                then least(interval '6 hours', greatest(interval '1 hour', (x.c::time - x.o::time) + case when x.c::time <= x.o::time then interval '24 hours' else interval '0' end))
                else interval '6 hours' end as threshold
      from hrs x),
  units as (select u from unnest(case when v_multi then v_units else array[null::uuid] end) u),
  related as (   -- a -> b: hard time on a is hard time on b
    select k.space_a as a, k.space_b as b from public.space_links k where k.workspace_id = l.workspace_id and k.space_a = any(coalesce(v_all, '{}'))
    union select k.space_b, k.space_a from public.space_links k where k.workspace_id = l.workspace_id and k.space_b = any(coalesce(v_all, '{}'))
    union select x.id, y.id from public.spaces x join public.spaces y on y.venue_id = x.venue_id and y.exclusive_group = x.exclusive_group and y.id <> x.id
     where x.venue_id = l.id and x.exclusive_group is not null),
  raw_hard as (   -- sid null + all_units: applies to every unit; sid null + not all_units: a listing-level job (soft at a multi-space venue)
    select j.space_id as sid, tstzrange(j.starts_at, j.ends_at) as r, true as is_job,
           j.space_id is null and coalesce(j.details ->> 'exclusive', '') = 'true' as all_units
      from public.provider_jobs j
     where j.workspace_id = l.workspace_id and j.listing_id = l.id and j.role = 'primary' and j.status in ('confirmed', 'active', 'deposit_paid')
       and j.starts_at < v_hi and j.ends_at > v_lo
    union all
    select a.space_id, tstzrange(a.starts_at, a.ends_at), false, a.space_id is null from public.availability_blocks a
     where a.workspace_id = l.workspace_id and a.kind in ('blocked', 'maintenance', 'closed') and a.crew_id is null
       and (a.listing_id = l.id or a.space_id = any(coalesce(v_all, '{}')) or (a.listing_id is null and a.space_id is null))
       and a.starts_at < v_hi and a.ends_at > v_lo
    union all
    select h.space_id, tstzrange(coalesce(h.window_start, h.starts_at), coalesce(h.window_end, h.ends_at)), false, h.space_id is null from public.conditional_holds h
     where h.workspace_id = l.workspace_id and h.listing_id = l.id and h.status = 'held' and h.blocking_level = 'hard'
       and (h.expires_at is null or h.expires_at > now()) and coalesce(h.window_start, h.starts_at) is not null
       and coalesce(h.window_start, h.starts_at) < v_hi and coalesce(h.window_end, h.ends_at) > v_lo),
  hard as (
    select sid, r, is_job, all_units from raw_hard where not isempty(r)
    union all select k.b, h.r, h.is_job, false from raw_hard h join related k on k.a = h.sid where not isempty(h.r)),
  raw_soft as (
    select j.space_id as sid, tstzrange(j.starts_at, j.ends_at) as r from public.provider_jobs j
     where j.workspace_id = l.workspace_id and j.listing_id = l.id and j.status = 'held' and j.starts_at < v_hi and j.ends_at > v_lo
    union all
    select h.space_id, tstzrange(coalesce(h.window_start, h.starts_at), coalesce(h.window_end, h.ends_at)) from public.conditional_holds h
     where h.workspace_id = l.workspace_id and h.listing_id = l.id and h.status = 'held' and h.blocking_level = 'soft'
       and (h.expires_at is null or h.expires_at > now()) and coalesce(h.window_start, h.starts_at) is not null
       and coalesce(h.window_start, h.starts_at) < v_hi and coalesce(h.window_end, h.ends_at) > v_lo
    union all
    select b.space_id, tstzrange(e.starts_at, coalesce(e.ends_at, e.starts_at + interval '6 hours')) from public.build_items b join public.events e on e.id = b.event_id
     where b.listing_id = l.id and b.status = 'held' and (b.hold_expires_at is null or b.hold_expires_at > now())
       and e.starts_at is not null and e.starts_at < v_hi and coalesce(e.ends_at, e.starts_at + interval '6 hours') > v_lo
    union all
    select null::uuid, r from raw_hard where v_multi and is_job and sid is null and not all_units),
  soft as (select sid, r from raw_soft where not isempty(r) union all select k.b, s.r from raw_soft s join related k on k.a = s.sid where not isempty(s.r)),
  ud as (
    select d.day, un.u,
           (select coalesce(sum(upper(m) - lower(m)), interval '0')
              from unnest((select range_agg(h.r * d.rng) from hard h
                            where h.r && d.rng and (not v_multi or h.sid = un.u or (h.sid is null and (h.all_units or not h.is_job))))) m) as busy,
           (select count(*) from hard h where h.is_job and h.r && d.rng and (not v_multi or h.sid = un.u or (h.sid is null and h.all_units))) as jobs
      from dd d cross join units un),
  st as (
    select d.day, d.closed,
           bool_and(x.busy >= d.threshold or (v_service and x.jobs >= v_cap)) as all_full,
           bool_or(x.busy > interval '0' or x.jobs > 0) as any_hard,
           exists (select 1 from soft s where s.r && d.rng and (not v_multi or s.sid is null or s.sid = any(v_units))) as any_soft
      from dd d join ud x on x.day = d.day group by d.day, d.closed, d.rng)
  select coalesce(jsonb_agg(jsonb_build_object('date', st.day, 'status',
           case when st.closed then 'closed' when st.all_full then 'booked' when st.any_hard or st.any_soft then 'limited' else 'free' end) order by st.day), '[]'::jsonb)
    into v_days from st;

  return jsonb_build_object('from', v_from, 'to', v_to, 'timezone', 'Europe/London', 'days', v_days, 'spaces', v_spaces);
end $function$
;

-- listing_availability_local
CREATE OR REPLACE FUNCTION public.listing_availability_local(p_listing uuid, p_date date, p_start time without time zone, p_end time without time zone)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare local_start timestamp;local_end timestamp;utc_start timestamptz;utc_end timestamptz;
begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501';end if;
 if p_date is null or p_start is null or p_end is null then return 'unknown';end if;
 local_start:=p_date+p_start;
 local_end:=(p_date+case when p_end<=p_start then 1 else 0 end)+p_end;
 utc_start:=local_start at time zone 'Europe/London';utc_end:=local_end at time zone 'Europe/London';
 if utc_start at time zone 'Europe/London' <> local_start or utc_end at time zone 'Europe/London' <> local_end then
  raise exception 'invalid_local_time' using errcode='22023';
 end if;
 return public.listing_availability(p_listing,utc_start,utc_end);
end $function$
;

-- resale_policy_for
CREATE OR REPLACE FUNCTION public.resale_policy_for(p_event uuid)
 RETURNS resale_policies
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.* from public.resale_policies p
  where p.jurisdiction = coalesce((select upper(e.settings->>'jurisdiction') from public.events e where e.id = p_event), 'GB')
    and p.status = 'published' and p.effective_from <= now()
  order by p.version desc limit 1
$function$
;

