-- Q58 bughunt-money follow-ups (2026-11-14, coordinator items a–f). Additive: new columns with defaults, a new table, new functions,
-- same-signature replacements, two CHECK constraints widened (dropped and re-added as supersets) and one read policy narrowed.
--
-- (a) A refund Stripe accepted and later FAILED (charge.refund.updated, status failed) was ignored: the order stayed "refunded", the
--     tickets voided, the booking cancellation/refund instruction "refunded", and the seller memo ledger kept the refund. Now
--     stripe_refund_failed() (once per refund id): payment_refunds → failed; ticket order / booking cancellation / refund instruction /
--     resale payout → refund 'failed' with refunded amounts reduced and a new attempt number (the workers' idempotency key then
--     changes, so a retry is a NEW refund instead of Stripe's cached failed one); the seller memo refund reversed; staff alerted.
--     Ticket and order state machines don't allow refunded → valid/issued, so voided tickets are flagged to staff (count in the alert)
--     rather than silently reinstated; the ticket refund worker retries automatically (claim_ticket_refunds picks 'failed' after 1 h).
-- (b) booking_cancellations and dec107_refund_instructions were claimed with a plain update and only 'due' (resp. due/failed) rows were
--     read: a crash left 'processing' forever. Atomic claims with FOR UPDATE SKIP LOCKED + claimed_at, reclaiming 'processing' after
--     15 minutes. The workers skip what Stripe already refunded for the same cancellation/instruction (crash-safe re-run).
-- (c) payment_refunds refused the refund-instruction rows (source_type dec107_*, fee_policy 'dec107' violated the CHECKs; the worker
--     ignored the error), so those refunds had no audit row. Constraints widened. dec107_invariants(): seller_fee_over_cap and
--     refunds_exceed_charge cover ticket orders (stripe_refund_totals too), plus booking_cancellation_refund_stuck and
--     ticket_refund_stuck.
-- (e) payout_releases readable by every workspace member → owner/manager/finance (as dec107_covered_liabilities, payout_pauses).
-- (f) payment_order_refunded marked 'refunded' when the refund reached the price (admin fee kept, so not the whole charge) and
--     overwrote 'disputed'. Now compares with amount + customer fee and keeps 'disputed'.

-- ── columns ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.booking_cancellations add column if not exists claimed_at timestamptz;
alter table public.booking_cancellations add column if not exists refund_attempt integer not null default 0;
alter table public.dec107_refund_instructions add column if not exists claimed_at timestamptz;
alter table public.dec107_refund_instructions add column if not exists refund_attempt integer not null default 0;
alter table public.checkout_orders add column if not exists refund_attempt integer not null default 0;

-- ── (c) payment_refunds accepts every refund the workers write ──────────────────────────────────────────────────────────────────
alter table public.payment_refunds drop constraint if exists payment_refunds_source_type_check;
alter table public.payment_refunds add constraint payment_refunds_source_type_check check (source_type = any (array['payment_order','checkout_order','invoice_card_payment',
  'booking_cancellation','resale','dec107_default_rule','dec107_settlement','dec107_accepted_recommendation','dec107_independent_award']));
alter table public.payment_refunds drop constraint if exists payment_refunds_fee_policy_check;
alter table public.payment_refunds add constraint payment_refunds_fee_policy_check check (fee_policy = any (array['full','proportional','retained','dec107']));

-- ── (a) failed refunds ─────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.stripe_refund_failures (
  refund_id text primary key,
  stripe_account_id text,
  payment_intent text,
  charge_id text,
  amount_minor bigint not null default 0,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  handled jsonb not null default '{}'::jsonb,
  livemode boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.stripe_refund_failures enable row level security;
revoke all on table public.stripe_refund_failures from public, anon, authenticated;
grant select, insert, update on table public.stripe_refund_failures to service_role;

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
    update public.resale_payouts set status = 'failed', refund_error = why, updated_at = now() where id = (md->>'resale_payout_id')::uuid;
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

-- ── (b) atomic, reclaimable claims ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_booking_cancellation_refunds(p_limit integer default 20)
returns setof public.booking_cancellations language sql security definer set search_path to '' as $$
  update public.booking_cancellations c set refund_status = 'processing', claimed_at = now(), updated_at = now()
   where c.id in (select x.id from public.booking_cancellations x
                   where x.refund_status = 'due' or (x.refund_status = 'processing' and coalesce(x.claimed_at, x.updated_at) < now() - interval '15 minutes')
                   order by x.created_at limit greatest(1, least(p_limit, 100)) for update skip locked)
  returning c.*;
$$;
revoke all on function public.claim_booking_cancellation_refunds(integer) from public, anon, authenticated;
grant execute on function public.claim_booking_cancellation_refunds(integer) to service_role;

create or replace function public.claim_dec107_refund_instructions(p_limit integer default 20)
returns setof public.dec107_refund_instructions language sql security definer set search_path to '' as $$
  update public.dec107_refund_instructions r set status = 'processing', claimed_at = now()
   where r.id in (select x.id from public.dec107_refund_instructions x
                   where x.status = 'due' or (x.status = 'failed' and coalesce(x.claimed_at, x.created_at) < now() - interval '1 hour')
                      or (x.status = 'processing' and coalesce(x.claimed_at, x.created_at) < now() - interval '15 minutes')
                   order by x.created_at limit greatest(1, least(p_limit, 100)) for update skip locked)
  returning r.*;
$$;
revoke all on function public.claim_dec107_refund_instructions(integer) from public, anon, authenticated;
grant execute on function public.claim_dec107_refund_instructions(integer) to service_role;

-- ── (f) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.payment_order_refunded(p_pi text, p_refunded_minor bigint)
 returns void language sql security definer set search_path to '' as $function$
  update public.payment_orders set refunded_minor = greatest(refunded_minor, p_refunded_minor),
    status = case when status = 'disputed' then status
                  when greatest(refunded_minor, p_refunded_minor) >= amount_minor + coalesce(customer_fee_minor, 0) then 'refunded' else 'partially_refunded' end,
    updated_at = now()
  where stripe_payment_intent = p_pi and status not in ('refunded');
$function$;

-- ── (e) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists payout_releases_member_read on public.payout_releases;
create policy payout_releases_member_read on public.payout_releases for select to authenticated
  using (public.is_platform_admin() or public.has_workspace_role(workspace_id, array['owner','manager','finance']));

-- ── (c) invariants ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dec107_invariants()
 returns table(check_name text, ref text, detail jsonb) language sql stable security definer set search_path to '' as $function$
  select 'platform_transfer_on_direct_charge', po.reference, jsonb_build_object('transfer', po.stripe_transfer)
    from public.payment_orders po where po.strategy = 'direct' and po.stripe_transfer is not null
  union all
  select 'application_fee_over_gross', po.reference, jsonb_build_object('fee', po.application_fee_minor, 'gross', po.amount_minor + po.customer_fee_minor)
    from public.payment_orders po where po.strategy = 'direct' and po.application_fee_minor > po.amount_minor + po.customer_fee_minor
  union all
  select 'application_fee_over_gross', co.order_ref, jsonb_build_object('fee', co.application_fee_minor, 'gross', round((co.amount + co.fee) * 100))
    from public.checkout_orders co where co.strategy = 'direct' and co.application_fee_minor > round((co.amount + co.fee) * 100)
  union all
  -- seller fee within the cap (DEC-107: 8 %): bookings and (Q58) ticket orders — the seller fee is the application fee less the buyer's booking fee
  select 'seller_fee_over_cap', po.reference, jsonb_build_object('seller_fee', po.application_fee_minor - po.customer_fee_minor, 'amount', po.amount_minor)
    from public.payment_orders po, public.dec107_settings s
   where s.id and po.strategy = 'direct' and po.release_model = 'manual_release'
     and po.application_fee_minor - po.customer_fee_minor > ceil(po.amount_minor * s.seller_fee_cap_bps / 10000.0)
  union all
  select 'seller_fee_over_cap', co.order_ref, jsonb_build_object('seller_fee', co.application_fee_minor - round(co.fee * 100), 'amount', round(co.amount * 100))
    from public.checkout_orders co, public.dec107_settings s
   where s.id and co.strategy = 'direct' and co.release_model = 'manual_release' and co.amount > 0
     and co.application_fee_minor - round(co.fee * 100) > ceil(round(co.amount * 100) * s.seller_fee_cap_bps / 10000.0)
  union all
  -- no double refund: succeeded refunds per payment never exceed the charge (payment_refunds now also holds ticket/resale/instruction refunds)
  select 'refunds_exceed_charge', r.payment_intent_id, jsonb_build_object('refunded', sum(r.amount_minor), 'charged', max(g.gross))
    from public.payment_refunds r
    join lateral (select coalesce((select po.amount_minor + po.customer_fee_minor from public.payment_orders po where po.stripe_payment_intent = r.payment_intent_id limit 1),
                                  (select round((co.amount + co.fee) * 100)::bigint from public.checkout_orders co where co.stripe_payment_intent = r.payment_intent_id limit 1)) gross) g on true
   where r.status = 'succeeded' and g.gross is not null
   group by r.payment_intent_id having sum(r.amount_minor) > max(g.gross)
  union all
  -- …and Stripe's own cumulative refund total on a ticket charge (recorded by charge.refunded) never exceeds what was charged
  select 'refunds_exceed_charge', co.order_ref, jsonb_build_object('refunded', t.amount_minor, 'charged', round((co.amount + co.fee) * 100), 'charge', t.charge_id)
    from public.checkout_orders co join public.stripe_refund_totals t on t.charge_id = co.stripe_charge
   where co.strategy = 'direct' and t.amount_minor > round((co.amount + co.fee) * 100)
  union all
  select 'duplicate_refund_key', r.idempotency_key, jsonb_build_object('n', count(*)) from public.payment_refunds r where r.idempotency_key is not null group by r.idempotency_key having count(*) > 1
  union all
  select 'released_while_paused', pr.id::text, jsonb_build_object('pause', p.id, 'released_at', pr.released_at)
    from public.payout_releases pr join public.payout_pauses p on p.workspace_id = pr.workspace_id
   where pr.released_at is not null and pr.released_at >= p.created_at and (p.lifted_at is null or pr.released_at < p.lifted_at)
  union all
  select 'held_past_hold_limit', pr.id::text, jsonb_build_object('status', pr.status, 'hold_limit_at', pr.hold_limit_at)
    from public.payout_releases pr
   where (pr.status in ('held','due','blocked') and now() > pr.hold_limit_at + interval '2 days')
      or (pr.status = 'paid_out' and pr.released_at > pr.hold_limit_at + interval '2 days')
  union all
  select 'manual_record_on_automatic_account', x.ref, jsonb_build_object('account', x.acct, 'interval', ca.payout_interval)
    from (select po.reference ref, po.payee_connected_account_id acct from public.payment_orders po where po.release_model = 'manual_release'
          union all select co.order_ref, co.connected_account_id from public.checkout_orders co where co.release_model = 'manual_release') x
    join public.connect_accounts ca on ca.stripe_account_id = x.acct
   where ca.payout_interval is distinct from 'manual'
  union all
  select 'payout_without_release', cp.stripe_payout_id, jsonb_build_object('account', cp.stripe_account_id, 'amount', cp.amount_minor)
    from public.connected_payouts cp join public.connect_accounts ca on ca.stripe_account_id = cp.stripe_account_id and ca.payout_interval = 'manual'
   where cp.status not in ('failed','canceled') and not exists (select 1 from public.payout_releases pr where pr.stripe_payout_id = cp.stripe_payout_id)
  union all
  select 'refund_instruction_stuck', ri.id::text, jsonb_build_object('basis', ri.basis, 'status', ri.status, 'error', ri.error)
    from public.dec107_refund_instructions ri where ri.status in ('due','processing','failed') and ri.created_at < now() - interval '1 day'
  union all
  -- Q58: a booking cancellation or ticket order refund that has not completed within a day
  select 'booking_cancellation_refund_stuck', bc.id::text, jsonb_build_object('refund_status', bc.refund_status, 'error', bc.refund_error, 'since', bc.updated_at)
    from public.booking_cancellations bc where bc.refund_status in ('due','processing','failed') and bc.updated_at < now() - interval '1 day'
  union all
  select 'ticket_refund_stuck', co.order_ref, jsonb_build_object('refund_status', co.refund_status, 'error', co.refund_error, 'since', co.updated_at)
    from public.checkout_orders co where co.refund_status in ('due','processing','failed') and co.updated_at < now() - interval '1 day';
$function$;
