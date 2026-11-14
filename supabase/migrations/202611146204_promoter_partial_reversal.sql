-- Q58 follow-up (2026-11-14, partner-lane finding): partial refunds — including organiser buy-back resale refunds — never reversed promoter
-- commission (only a FULL refund or a lost chargeback did, via promoter_reverse_order). Now, whenever Stripe's cumulative refund total on a
-- ticket charge moves (stripe_refund_totals, written by charge.refunded / post_direct_refund_delta), the refunded share of the order's
-- price reverses the same share of each promoter sale on that order:
--   * commission not yet in a payout: reduced (memo for the reversed part, stable key per cumulative target);
--   * commission locked in a payout: a PARTIAL clawback (clawback_amount) that — partner-lane rule 202611146401, kept — is netted only once
--     the payout carrying the sale is 'paid'. If that payout fails, the sale goes back to approved with the clawed part removed.
-- A later full reversal reverses only what is left. promoter_statement.paid no longer counts clawed-back commission.
-- Also: a failed resale buy-back refund is retried automatically like ticket refunds (new attempt → new Stripe key in the worker).
-- Additive: new nullable/defaulted columns, new functions + trigger, same-signature replacements of partner-lane functions (their rules kept).

alter table public.promoter_sales add column if not exists clawback_amount numeric;            -- null = the whole commission (full clawback)
alter table public.promoter_sales add column if not exists partial_reversed numeric not null default 0;   -- commission reversed by partial refunds so far
alter table public.resale_payouts add column if not exists refund_attempt integer not null default 0;

-- Memo for a partial reversal (mirrors promoter_post_memo's reversal lines).
create or replace function public.promoter_post_partial_memo(p_sale uuid, p_minor bigint, p_key text, p_label text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare s public.promoter_sales; e record;
begin
  select * into s from public.promoter_sales where id = p_sale;
  if s.id is null or coalesce(p_minor, 0) <= 0 then return null; end if;
  select ev.workspace_id, ev.owner_id, coalesce(ev.currency, 'GBP') currency into e from public.events ev where ev.id = s.event_id;
  return public.post_memo_ledger_transaction(p_key, 'promoter_commission', upper(coalesce(e.currency, 'GBP')),
    jsonb_build_array(
      jsonb_build_object('account', 'seller_promoter_commission', 'party_type', case when e.workspace_id is null then 'user' else 'workspace' end,
                         'party_id', coalesce(e.workspace_id, e.owner_id), 'amount_minor', -p_minor),
      jsonb_build_object('account', 'promoter_payable', 'party_type', 'promoter', 'party_id', s.promoter_id, 'amount_minor', p_minor)),
    'seller_obligation_memo', e.workspace_id, s.event_id, 'promoter_sale', s.id::text, p_label);
end $$;
revoke all on function public.promoter_post_partial_memo(uuid, bigint, text, text) from public, anon, authenticated;

-- Reverse the refunded share of an order's promoter commission (idempotent: driven by the cumulative refunded amount).
create or replace function public.promoter_partial_reverse(p_order_ref text, p_refunded_minor bigint)
returns integer language plpgsql security definer set search_path to '' as $$
declare o public.checkout_orders; price bigint; f numeric; s record; orig numeric; target numeric; d numeric; n int := 0;
begin
  select * into o from public.checkout_orders where order_ref = p_order_ref;
  if not found or coalesce(o.amount, 0) <= 0 or coalesce(p_refunded_minor, 0) <= 0 then return 0; end if;
  price := round(o.amount * 100);
  f := least(1, p_refunded_minor::numeric / price);
  for s in select * from public.promoter_sales where order_ref = p_order_ref and status <> 'reversed' for update loop
    orig := case when s.payout_id is null then s.commission + s.partial_reversed else s.commission end;
    target := round(orig * f, 2);
    d := target - s.partial_reversed;
    if d <= 0 then continue; end if;                     -- never re-accrues (a later failed refund is handled by staff)
    if s.payout_id is null and s.status in ('pending', 'approved') then
      perform public.promoter_post_memo(s.id, 'accrual');   -- accrual recorded at the full commission first (idempotent)
      update public.promoter_sales set commission = greatest(0, commission - d), partial_reversed = partial_reversed + d where id = s.id;
    elsif s.clawback_payout_id is null and (not s.clawback_pending or s.clawback_amount is not null) then
      update public.promoter_sales set clawback_pending = true, clawback_amount = least(commission, partial_reversed + d), partial_reversed = partial_reversed + d,
        reversed_at = coalesce(reversed_at, now()), reversal_reason = coalesce(reversal_reason, 'refund') where id = s.id;
    else
      insert into public.audit_events(actor_type, event, metadata) values ('system', 'promoter.partial_reversal_manual',
        jsonb_build_object('sale_id', s.id, 'order_ref', p_order_ref, 'commission_minor', round(d * 100), 'why', 'clawback already netted'));
      continue;
    end if;
    perform public.promoter_post_partial_memo(s.id, round(d * 100)::bigint, 'promoter:partial:' || s.id || ':' || target, 'Promoter commission reversed pro rata (partial refund)');
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'promoter.commission_partially_reversed',
      jsonb_build_object('sale_id', s.id, 'promoter_id', s.promoter_id, 'order_ref', p_order_ref, 'share', f, 'reversed', d, 'locked', s.payout_id is not null));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.promoter_partial_reverse(text, bigint) from public, anon, authenticated;
grant execute on function public.promoter_partial_reverse(text, bigint) to service_role;

create or replace function public.trg_refund_total_promoter()
returns trigger language plpgsql security definer set search_path to '' as $$
declare ref text;
begin
  if new.amount_minor > coalesce(case when tg_op = 'UPDATE' then old.amount_minor end, 0) then
    select co.order_ref into ref from public.checkout_orders co where co.stripe_charge = new.charge_id limit 1;
    if ref is not null then perform public.promoter_partial_reverse(ref, new.amount_minor); end if;
  end if;
  return null;
end $$;
revoke all on function public.trg_refund_total_promoter() from public, anon, authenticated;
drop trigger if exists stripe_refund_totals_promoter on public.stripe_refund_totals;
create trigger stripe_refund_totals_promoter after insert or update of amount_minor on public.stripe_refund_totals for each row execute function public.trg_refund_total_promoter();

-- Full reversal: reverses what is left after partial reversals.
create or replace function public.promoter_reverse_order(p_order_ref text, p_reason text)
 returns integer language plpgsql security definer set search_path to '' as $function$
declare s record; n int := 0; qty int := 0; amt numeric := 0;
begin
  if p_reason not in ('refund','chargeback','fraud','admin') then raise exception 'invalid_reason' using errcode = '22023'; end if;
  for s in select * from public.promoter_sales where order_ref = p_order_ref and status <> 'reversed'
             and (not clawback_pending or (clawback_amount is not null and clawback_payout_id is null)) for update loop
    if s.clawback_payout_id is not null then
      -- a partial clawback was already netted in a payout: the rest needs a staff decision (no second automatic clawback)
      insert into public.audit_events(actor_type, event, metadata) values ('system', 'promoter.partial_reversal_manual',
        jsonb_build_object('sale_id', s.id, 'order_ref', p_order_ref, 'remaining', s.commission - s.partial_reversed, 'why', 'clawback already netted'));
      continue;
    elsif s.clawback_pending then
      -- partial clawback not yet netted → becomes a full clawback; memo only for the part not reversed yet
      update public.promoter_sales set clawback_amount = null, partial_reversed = commission, reversal_reason = p_reason, updated_at = now() where id = s.id;
      perform public.promoter_post_partial_memo(s.id, round((s.commission - s.partial_reversed) * 100)::bigint, 'promoter:partial-rest:' || s.id, 'Promoter commission reversed (' || p_reason || ')');
    elsif s.payout_id is null and s.status in ('pending','approved') then
      update public.promoter_sales set status = 'reversed', reversed_at = now(), reversal_reason = p_reason, updated_at = now() where id = s.id;
      perform public.promoter_post_memo(s.id, 'reversal');   -- the current (already reduced) commission
    else
      update public.promoter_sales set clawback_pending = true, reversed_at = now(), reversal_reason = p_reason, updated_at = now() where id = s.id;
      perform public.promoter_post_memo(s.id, 'reversal');
    end if;
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'promoter.commission_reversed',
      jsonb_build_object('sale_id', s.id, 'promoter_id', s.promoter_id, 'order_ref', p_order_ref, 'reason', p_reason, 'locked', s.payout_id is not null, 'commission', s.commission,
        'already_partially_reversed', s.partial_reversed));
    n := n + 1; qty := qty + s.quantity; amt := amt + s.amount;
    update public.promoters set tickets_sold = greatest(tickets_sold - s.quantity, 0), revenue = greatest(revenue - s.amount, 0) where id = s.promoter_id;
  end loop;
  return n;
end $function$;

-- Partner-lane functions (202611146401) with partial clawbacks: the clawed amount is clawback_amount when set, else the commission.
create or replace function public.promoter_create_payout(p_promoter uuid, p_note text default ''::text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v uuid; gross numeric := 0; claw numeric := 0; c record;
begin
  if not public.can_manage_promoter(p_promoter) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  perform 1 from public.promoters where id = p_promoter for update;
  select coalesce(sum(commission), 0) into gross from public.promoter_sales where promoter_id = p_promoter and status = 'approved' and payout_id is null and not clawback_pending;
  if gross <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0002'; end if;
  perform set_config('gd.promoter_payout', 'on', true);
  insert into public.promoter_payouts(promoter_id, amount, status, scheduled_for, gross_commission, clawback_deducted, locked_at, locked_by, reference)
    values (p_promoter, gross, 'held', current_date, gross, 0, now(), auth.uid(), nullif(left(coalesce(p_note, ''), 120), '')) returning id into v;
  update public.promoter_sales set payout_id = v, status = 'held' where promoter_id = p_promoter and status = 'approved' and payout_id is null and not clawback_pending;
  -- Sales accrued before Q27 get their accrual memo now (idempotent), so the settlement memo always discharges a recorded obligation.
  perform public.promoter_post_memo(s.id, 'accrual') from public.promoter_sales s where s.payout_id = v;
  -- Only commission the promoter has actually been paid can be clawed back: the payout that carried the sale must be 'paid'.
  -- (A clawback whose payout is still held/payable waits; if that payout fails the sale becomes a plain reversal instead.)
  for c in select s.id, coalesce(s.clawback_amount, s.commission) amt from public.promoter_sales s join public.promoter_payouts op on op.id = s.payout_id
           where s.promoter_id = p_promoter and s.clawback_pending and s.clawback_payout_id is null and op.status = 'paid'
           order by s.reversed_at, s.id loop
    exit when claw + c.amt > gross;
    update public.promoter_sales set clawback_payout_id = v where id = c.id;
    claw := claw + c.amt;
  end loop;
  update public.promoter_payouts set clawback_deducted = claw, amount = gross - claw where id = v;
  perform set_config('gd.promoter_payout', '', true);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'promoter.payout_locked',
    jsonb_build_object('payout_id', v, 'promoter_id', p_promoter, 'gross', gross, 'clawback', claw, 'amount', gross - claw));
  return jsonb_build_object('payout_id', v, 'gross', gross, 'clawback', claw, 'amount', gross - claw);
end $function$;

create or replace function public.trg_promoter_payout_conserved()
 returns trigger language plpgsql security definer set search_path to '' as $function$
declare p public.promoter_payouts; gross numeric; claw numeric;
begin
  select * into p from public.promoter_payouts where id = coalesce(new.id, old.id);
  if p.id is null or p.locked_at is null or p.status = 'failed' then return null; end if;
  select coalesce(sum(commission), 0) into gross from public.promoter_sales where payout_id = p.id;
  select coalesce(sum(coalesce(clawback_amount, commission)), 0) into claw from public.promoter_sales where clawback_payout_id = p.id;
  if gross <> p.gross_commission or claw <> p.clawback_deducted or p.amount > gross then
    raise exception 'promoter_payout_not_conserved (gross % vs %, clawback % vs %)', gross, p.gross_commission, claw, p.clawback_deducted using errcode = '23514';
  end if;
  return null;
end $function$;

create or replace function public.promoter_payout_transition(p_payout uuid, p_action text, p_reference text default null, p_method text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.promoter_payouts; e record; c bigint;
begin
  select * into p from public.promoter_payouts where id = p_payout for update;
  if p.id is null or not public.can_manage_promoter(p.promoter_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p.locked_at is null then raise exception 'legacy_payout' using errcode = '55000'; end if;
  perform public.require_step_up(null);
  perform set_config('gd.promoter_payout', 'on', true);
  if p_action = 'approve' and p.status = 'held' then
    update public.promoter_payouts set status = 'payable', approved_at = now(), approved_by = auth.uid(), updated_at = now() where id = p.id;
    update public.promoter_sales set status = 'payable' where payout_id = p.id;
  elsif p_action = 'mark_paid' and p.status = 'payable' then
    if length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'reference_required' using errcode = '22023'; end if;
    update public.promoter_payouts set status = 'paid', paid_at = now(), reference = left(p_reference, 120), settlement_method = coalesce(p_method, 'bank_transfer'), updated_at = now() where id = p.id;
    update public.promoter_sales set status = 'paid' where payout_id = p.id;
    update public.promoter_sales set clawback_pending = false where clawback_payout_id = p.id;
    c := round(p.amount * 100);
    if c > 0 then
      select ev.workspace_id, ev.owner_id, upper(coalesce(ev.currency, 'GBP')) currency, ev.id into e
        from public.promoters pr join public.events ev on ev.id = pr.event_id where pr.id = p.promoter_id;
      -- Statement of the organiser's off-platform settlement: the promoter obligation is discharged; no Gala Dock account moves.
      perform public.post_memo_ledger_transaction('promoter:payout:' || p.id || ':paid', 'promoter_commission', e.currency,
        jsonb_build_array(
          jsonb_build_object('account', 'promoter_payable', 'party_type', 'promoter', 'party_id', p.promoter_id, 'amount_minor', c),
          jsonb_build_object('account', 'seller_promoter_settled', 'party_type', case when e.workspace_id is null then 'user' else 'workspace' end, 'party_id', coalesce(e.workspace_id, e.owner_id), 'amount_minor', -c)),
        'seller_obligation_memo', e.workspace_id, e.id, 'promoter_payout', p.id::text, 'Promoter commission settled by the organiser off-platform (memo)', null, 'user');
    end if;
  elsif p_action = 'fail' and p.status in ('held','payable') then
    -- Sales reversed while locked in this payout were never paid: they become plain reversals (their reversal memo was posted
    -- when they were reversed), so no later payout nets them as a clawback.
    update public.promoter_sales set status = 'reversed', payout_id = null, clawback_pending = false where payout_id = p.id and clawback_pending and clawback_amount is null;
    -- Q58: a PARTIAL clawback on this payout: the sale goes back to approved with the clawed part removed (its memo was already posted).
    -- Two steps: the sale-lock trigger allows the commission change only once the sale is out of the payout.
    update public.promoter_sales set status = 'approved', payout_id = null where payout_id = p.id and clawback_pending and clawback_amount is not null;
    update public.promoter_sales set commission = greatest(0, commission - clawback_amount), clawback_pending = false, clawback_amount = null
     where payout_id is null and clawback_pending and clawback_amount is not null and clawback_payout_id is null and status = 'approved' and promoter_id = p.promoter_id;
    update public.promoter_sales set status = 'approved', payout_id = null where payout_id = p.id;
    update public.promoter_sales set clawback_payout_id = null where clawback_payout_id = p.id;
    update public.promoter_payouts set status = 'failed', failure_reason = left(coalesce(p_reference, ''), 300), updated_at = now() where id = p.id;
  else
    raise exception 'invalid_transition: % from %', p_action, p.status using errcode = '55000';
  end if;
  perform set_config('gd.promoter_payout', '', true);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'promoter.payout_' || p_action,
    jsonb_build_object('payout_id', p.id, 'promoter_id', p.promoter_id, 'amount', p.amount, 'reference', left(coalesce(p_reference, ''), 120)));
  return (select status from public.promoter_payouts where id = p.id);
end $$;

create or replace function public.promoter_statement(p_promoter uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  if not (public.owns_promoter(p_promoter) or public.can_manage_promoter(p_promoter)) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'pending', coalesce(sum(commission) filter (where status = 'pending'), 0),
    'approved', coalesce(sum(commission) filter (where status = 'approved' and payout_id is null), 0),
    'held', coalesce(sum(commission) filter (where status = 'held'), 0),
    'payable', coalesce(sum(commission) filter (where status = 'payable'), 0),
    -- Q58: commission clawed back (or due to be) is not "paid" to the promoter
    'paid', coalesce(sum(commission - case when clawback_pending or clawback_payout_id is not null then coalesce(clawback_amount, commission) else 0 end) filter (where status = 'paid'), 0),
    'reversed', coalesce(sum(commission) filter (where status = 'reversed'), 0)
              + coalesce(sum(partial_reversed) filter (where status <> 'reversed' and payout_id is null), 0),
    'clawback_outstanding', coalesce(sum(coalesce(clawback_amount, commission)) filter (where clawback_pending and clawback_payout_id is null), 0),
    'settles', 'off_platform_by_organiser')
    from public.promoter_sales where promoter_id = p_promoter);
end $function$;

-- A failed resale buy-back refund is retried automatically (see header).
create or replace function public.stripe_refund_failed(p_refund jsonb, p_account text, p_livemode boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare rid text := p_refund->>'id'; pi text := nullif(p_refund->>'payment_intent', ''); ch text := nullif(p_refund->>'charge', '');
  amt bigint := greatest(coalesce((p_refund->>'amount')::bigint, 0), 0); cur text := upper(coalesce(nullif(p_refund->>'currency', ''), 'gbp'));
  md jsonb := coalesce(p_refund->'metadata', '{}'::jsonb); why text := left('stripe_refund_failed:' || coalesce(p_refund->>'failure_reason', 'unknown'), 200);
  n int; prior bigint; back bigint := 0; seller uuid; eid uuid; src_type text; src_ref text; v_handled jsonb := '{}'::jsonb; voided int := 0; ord text;
  uuid_re text := '^[0-9a-fA-F-]{36}$';
begin
  if coalesce(rid, '') !~ '^(re|pyr)_[A-Za-z0-9_]+$' or coalesce(p_refund->>'status', '') <> 'failed' then return jsonb_build_object('ignored', true); end if;
  insert into public.stripe_refund_failures(refund_id, stripe_account_id, payment_intent, charge_id, amount_minor, currency, metadata, livemode)
    values (rid, p_account, pi, ch, amt, cur, md, coalesce(p_livemode, false)) on conflict (refund_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('duplicate', true); end if;

  update public.payment_refunds set status = 'failed', error = why, updated_at = now() where stripe_refund_id = rid;
  get diagnostics n = row_count; v_handled := v_handled || jsonb_build_object('payment_refunds', n);

  -- seller memo: reverse what charge.refunded recorded for this refund (never below what was recorded)
  if p_account is not null and ch is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stripe-refund:' || ch, 0));
    select amount_minor into prior from public.stripe_refund_totals where charge_id = ch for update;
    back := least(coalesce(prior, 0), amt);
    if back > 0 then
      select payee_workspace_id, event_id, 'payment_order', reference into seller, eid, src_type, src_ref from public.payment_orders
        where strategy = 'direct' and payee_connected_account_id = p_account and (stripe_charge = ch or stripe_payment_intent = pi) limit 1;
      if seller is null then
        select seller_workspace_id, event_id, 'checkout_order', order_ref into seller, eid, src_type, src_ref from public.checkout_orders
          where strategy = 'direct' and connected_account_id = p_account and (stripe_charge = ch or stripe_payment_intent = pi) limit 1;
      end if;
      if seller is null then
        select workspace_id, event_id, 'merch_order', order_ref into seller, eid, src_type, src_ref from public.merch_orders
          where strategy = 'direct' and connected_account_id = p_account and (stripe_charge = ch or stripe_payment_intent = pi) limit 1;
      end if;
      if seller is null then
        select workspace_id, null::uuid, 'invoice_card_payment', id::text into seller, eid, src_type, src_ref from public.invoice_card_payments
          where connected_account_id = p_account and stripe_payment_intent = pi limit 1;
      end if;
      if seller is not null then
        update public.stripe_refund_totals set amount_minor = amount_minor - back where charge_id = ch;
        perform public.post_memo_ledger_transaction('stripe:direct-refund-failed:' || rid, 'reversal', cur, jsonb_build_array(
            jsonb_build_object('account', 'seller_refunds', 'amount_minor', -back, 'party_type', 'workspace', 'party_id', seller),
            jsonb_build_object('account', 'seller_connected_balance', 'amount_minor', back, 'party_type', 'workspace', 'party_id', seller)),
          'direct_charge_memo', seller, eid, src_type, src_ref, 'Refund failed at Stripe — money back in the seller balance', ch, 'webhook');
        v_handled := v_handled || jsonb_build_object('ledger_reversed_minor', back);
      end if;
    end if;
  end if;
  if pi is not null then
    update public.payment_orders set refunded_minor = greatest(0, refunded_minor - amt), updated_at = now() where stripe_payment_intent = pi and refunded_minor > 0;
  end if;

  if md ? 'resale_payout_id' and md->>'resale_payout_id' ~ uuid_re then
    -- Q58 follow-up: retried automatically like ticket refunds — claim_resale_refunds re-claims 'failed' after an hour, and the new
    -- attempt number gives the worker a new Stripe key (the old one would return the cached failed refund).
    update public.resale_payouts set status = 'failed', refund_error = why, stripe_refund_id = null, requested_at = null, refund_attempt = refund_attempt + 1, updated_at = now()
     where id = (md->>'resale_payout_id')::uuid and (stripe_refund_id is null or stripe_refund_id = rid);
    get diagnostics n = row_count; v_handled := v_handled || jsonb_build_object('resale_payout', n);
  elsif md ? 'order_ref' then
    ord := md->>'order_ref';
    update public.checkout_orders set refund_status = 'failed', refund_error = why, stripe_refund_id = null, refund_attempt = refund_attempt + 1, updated_at = now()
     where order_ref = ord and (stripe_refund_id is null or stripe_refund_id = rid);
    get diagnostics n = row_count; v_handled := v_handled || jsonb_build_object('ticket_order', n);
    select count(*) into voided from public.tickets where order_ref = ord and status = 'refunded';
  end if;
  if md ? 'cancellation' and md->>'cancellation' ~ uuid_re then
    update public.booking_cancellations set refund_status = 'failed', refunded_minor = greatest(0, refunded_minor - amt), refund_error = why,
      refund_attempt = refund_attempt + 1, updated_at = now() where id = (md->>'cancellation')::uuid;
    get diagnostics n = row_count; v_handled := v_handled || jsonb_build_object('booking_cancellation', n);
  end if;
  if md ? 'instruction' and md->>'instruction' ~ uuid_re then
    update public.dec107_refund_instructions set status = 'failed', refunded_minor = greatest(0, refunded_minor - amt), error = why,
      refund_attempt = refund_attempt + 1, executed_at = null where id = (md->>'instruction')::uuid;
    get diagnostics n = row_count; v_handled := v_handled || jsonb_build_object('refund_instruction', n);
  end if;

  v_handled := v_handled || jsonb_build_object('tickets_voided', voided);
  update public.stripe_refund_failures set handled = stripe_refund_failures.handled || v_handled where refund_id = rid;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', seller, 'payment.refund_failed',
    jsonb_build_object('refund', rid, 'account', p_account, 'payment_intent', pi, 'amount_minor', amt, 'reason', why, 'metadata', md, 'handled', v_handled));
  insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
    select pa.user_id, 'admin.ops_alert', 'A customer refund failed at Stripe',
           'Refund ' || rid || ' (' || cur || ' ' || to_char(amt / 100.0, 'FM999G999G990D00') || ') failed: ' || coalesce(p_refund->>'failure_reason', 'no reason given')
           || '. The money is back in the seller''s Stripe balance and the refund is marked failed for a retry.'
           || case when voided > 0 then ' ' || voided || ' ticket(s) on order ' || ord || ' are still voided — reinstate them or contact the buyer.' else '' end,
           '/admin/commerce/transactions', 'refund-failed:' || rid || ':' || pa.user_id
      from public.platform_admins pa
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return v_handled;
end $$;
revoke all on function public.stripe_refund_failed(jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.stripe_refund_failed(jsonb, text, boolean) to service_role;
