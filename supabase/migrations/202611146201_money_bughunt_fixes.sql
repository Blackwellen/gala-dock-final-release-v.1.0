-- Q58 bughunt-money (2026-11-14). Additive: new helper functions + same-signature replacements (grants unchanged: service_role only).
--
-- 1. issue_checkout / issue_resale issued whatever the checkout TOKEN held at payment time, not what the ORDER was priced for. A buyer
--    could open Stripe Checkout for 1 ticket, go back, re-reserve 5 under the same cookie token and then pay the 1-ticket session:
--    5 tickets issued for the price of 1 (and the reverse: paid for 5, got 1). Likewise an expired-and-swept GA hold next to a live seat
--    hold issued only the seats with no refund. Now the held inventory must equal the order's quote snapshot (tiers × qty, seat labels;
--    resale: the exact ticket ids captured in checkout_resale_allocations), else 'hold_expired:hold_changed' (matches finalise()'s refund path, also in the code already deployed) → full refund.
-- 2. Tickets recorded price_paid = the tier's face price even when a discount code lowered it. price_paid drives the resale price and
--    the original buyer's buy-back refund (resale_refund_source), so a discounted buyer was over-refunded from the organiser's balance
--    (multi-ticket order) or the resale failed after charging the resale buyer (single ticket). Now the net unit from the snapshot.
-- 3. dec107_dispute_close inserted a refund instruction even when the dispute was already resolved. Two awards entered on one dispute
--    (each checked by a second person), or a settlement accepted after an award closed the dispute, created a SECOND refund. Now it
--    refuses a resolved dispute ('not_open'), so every closing path refunds at most once.
-- 4. dec107_releases_due returned releases whose sale still has a refund owed (ticket order refund due/processing/failed, e.g. an event
--    cancellation whose refund failed; booking cancellation refund due/processing/failed). The payout could leave the seller's balance
--    before the buyer's refund. Those releases now wait (still 'due'; held_past_hold_limit in dec107_invariants() flags any that stall).

-- ── 1 + 2: held inventory must match the order ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.checkout_hold_matches_order(p_token text, p_order_ref text)
returns boolean language plpgsql stable security definer set search_path to '' as $$
declare o public.checkout_orders; want jsonb; have jsonb; ws jsonb; hs jsonb;
begin
  select * into o from public.checkout_orders where order_ref = p_order_ref;
  if not found then return false; end if;
  if o.kind = 'resale' then
    -- exact listings captured when the order was created (capture_resale_allocations)
    select coalesce(jsonb_agg(a.ticket_id order by a.ticket_id), '[]') into want from public.checkout_resale_allocations a where a.order_ref = p_order_ref;
    if want = '[]'::jsonb then return true; end if;   -- pre-allocation legacy order
    select coalesce(jsonb_agg(h.ticket_id order by h.ticket_id), '[]') into have from public.resale_holds h where h.token = p_token;
    return want = have;
  end if;
  if o.quote_snapshot is null or jsonb_array_length(coalesce(o.quote_snapshot->'lines', '[]')) = 0 then return true; end if;   -- legacy order
  select coalesce(jsonb_object_agg(k, q), '{}') into want from (
    select l->>'tier_id' k, sum((l->>'qty')::int)::int q from jsonb_array_elements(o.quote_snapshot->'lines') l group by 1) x;
  select coalesce(jsonb_object_agg(k, q), '{}') into have from (
    select k, sum(q)::int q from (
      select h.tier_id::text k, h.qty q from public.ticket_holds h where h.token = p_token and h.event_id = o.event_id
      union all
      select s.tier_id::text, 1 from public.event_seats s where s.hold_token = p_token and s.status = 'held' and s.event_id = o.event_id) u
    group by 1) x;
  if want <> have then return false; end if;
  select coalesce(jsonb_agg(v order by v), '[]') into ws from (select jsonb_array_elements_text(coalesce(l->'seats', '[]')) v from jsonb_array_elements(o.quote_snapshot->'lines') l) x;
  select coalesce(jsonb_agg(v order by v), '[]') into hs from (select coalesce(nullif(s.label, ''), s.seat_key) v from public.event_seats s
    where s.hold_token = p_token and s.status = 'held' and s.event_id = o.event_id) x;
  return ws = hs;
end $$;
revoke all on function public.checkout_hold_matches_order(text, text) from public, anon, authenticated;
grant execute on function public.checkout_hold_matches_order(text, text) to service_role;

-- What the buyer paid per ticket of a tier on this order (after code discounts), or null for a legacy order without a snapshot.
create or replace function public.checkout_order_net_unit(p_order_ref text, p_tier uuid)
returns numeric language sql stable security definer set search_path to '' as $$
  select round((l->>'net_unit_minor')::numeric / 100, 2)
    from public.checkout_orders o, jsonb_array_elements(coalesce(o.quote_snapshot->'lines', '[]')) l
   where o.order_ref = p_order_ref and (l->>'tier_id')::uuid = p_tier and l ? 'net_unit_minor'
   limit 1
$$;
revoke all on function public.checkout_order_net_unit(text, uuid) from public, anon, authenticated;
grant execute on function public.checkout_order_net_unit(text, uuid) to service_role;

create or replace function public.issue_seated_tickets(p_token text, p_order_ref text, p_attendee text, p_holder uuid)
 returns setof public.tickets language plpgsql security definer set search_path to '' as $function$
declare s record; t public.ticket_tiers; tk public.tickets;
begin
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then return query select * from public.tickets where order_ref = p_order_ref; return; end if;
  if not exists(select 1 from public.event_seats where hold_token = p_token and status = 'held') then raise exception 'hold_expired' using errcode = '22023'; end if;
  for s in select * from public.event_seats where hold_token = p_token and status = 'held' order by seat_key for update loop
    select * into t from public.ticket_tiers where id = s.tier_id for update;
    update public.ticket_tiers set held = greatest(0, held - 1), sold = sold + 1, status = case when sold + 1 >= quantity and status = 'on_sale' then 'sold_out' else status end where id = t.id;
    insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, seat, price_paid)
      values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), s.event_id, t.id, p_holder, coalesce(p_attendee, ''), p_order_ref, s.label,
        coalesce(public.checkout_order_net_unit(p_order_ref, t.id), t.price))
      returning * into tk;
    update public.event_seats set status = 'sold', hold_token = null, hold_expires_at = null, ticket_id = tk.id, updated_at = now() where event_id = s.event_id and seat_key = s.seat_key;
    return next tk;
  end loop;
end $function$;

create or replace function public.issue_checkout(p_token text, p_order_ref text, p_attendee text, p_holder uuid)
 returns integer language plpgsql security definer set search_path to '' as $function$
declare h record; t public.ticket_tiers; i int; n int := 0;
begin
  -- One issuance per order at a time: the redirect and the webhook can confirm the same order concurrently.
  perform public.advisory_xact_lock('ticket_issue', p_order_ref);
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then return (select count(*) from public.tickets where order_ref = p_order_ref); end if;
  if not exists(select 1 from public.ticket_holds where token = p_token) and not exists(select 1 from public.event_seats where hold_token = p_token and status = 'held') then
    raise exception 'hold_expired' using errcode = '22023';
  end if;
  -- Q58: issue exactly what this order was priced for; a re-reserved or partly swept hold is refunded, never issued.
  if not public.checkout_hold_matches_order(p_token, p_order_ref) then raise exception 'hold_expired:hold_changed' using errcode = '22023'; end if;
  if exists(select 1 from public.event_seats where hold_token = p_token and status = 'held') then
    perform public.issue_seated_tickets(p_token, p_order_ref, p_attendee, p_holder);
  end if;
  for h in select * from public.ticket_holds where token = p_token for update loop
    select * into t from public.ticket_tiers where id = h.tier_id for update;
    update public.ticket_tiers set held = greatest(0, held - h.qty), sold = sold + h.qty,
      status = case when sold + h.qty >= quantity and status = 'on_sale' then 'sold_out' else status end where id = t.id;
    for i in 1..h.qty loop
      insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, price_paid, allocation_id)
        values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), h.event_id, t.id, p_holder, coalesce(p_attendee, ''), p_order_ref,
          coalesce(public.checkout_order_net_unit(p_order_ref, t.id), t.price), h.allocation_id);
    end loop;
  end loop;
  delete from public.ticket_holds where token = p_token;
  select count(*) into n from public.tickets where order_ref = p_order_ref;
  update public.checkout_orders set status = 'issued', updated_at = now() where order_ref = p_order_ref;
  return n;
end $function$;

create or replace function public.issue_resale(p_token text, p_order_ref text, p_attendee text, p_holder uuid)
 returns integer language plpgsql security definer set search_path to '' as $function$
declare h record; old public.tickets; nid uuid; n int := 0;
begin
  -- One issuance per order at a time: the redirect and the webhook can confirm the same order concurrently.
  perform public.advisory_xact_lock('ticket_issue', p_order_ref);
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then return (select count(*) from public.tickets where order_ref = p_order_ref); end if;
  if not exists(select 1 from public.resale_holds where token = p_token) then raise exception 'hold_expired' using errcode = '22023'; end if;
  -- Q58: only the listings this order was priced for (checkout_resale_allocations); anything else is refunded.
  if not public.checkout_hold_matches_order(p_token, p_order_ref) then raise exception 'hold_expired:hold_changed' using errcode = '22023'; end if;
  for h in select * from public.resale_holds where token = p_token for update loop
    select * into old from public.tickets where id = h.ticket_id for update;
    if old.status <> 'resale_listed' then raise exception 'seat_unavailable' using errcode = '23P01'; end if;
    insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, seat, price_paid)
      values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), old.event_id, old.tier_id, p_holder, coalesce(p_attendee, ''), p_order_ref, old.seat, old.price_paid)
      returning id into nid;
    update public.tickets set status = 'resold', replaced_by = nid where id = old.id;
    update public.event_seats set ticket_id = nid, updated_at = now() where ticket_id = old.id;
    insert into public.resale_payouts(seller_id, ticket_id, order_ref, amount) values (old.holder_id, old.id, p_order_ref, old.price_paid) on conflict (ticket_id) do nothing;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'hold_expired' using errcode = '22023'; end if;
  delete from public.resale_holds where token = p_token;
  update public.checkout_orders set status = 'issued', updated_at = now() where order_ref = p_order_ref;
  return n;
end $function$;

-- ── 3: a dispute closes (and refunds) once ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dec107_dispute_close(p_dispute uuid, p_basis text, p_refund_minor bigint, p_key text, p_by uuid, p_checked_by uuid default null::uuid)
 returns void language plpgsql security definer set search_path to '' as $function$
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
end $function$;

-- ── 4: no payout while the sale still owes a refund ───────────────────────────────────────────────────────────────────────────────
create or replace function public.dec107_releases_due(p_livemode boolean, p_limit integer default 100)
 returns table(id uuid, part text, workspace_id uuid, stripe_account_id text, payment_intent text, event_id uuid, sale_kind text, currency text, source_type text, source_ref text, reserve_minor bigint, trigger text)
 language sql stable security definer set search_path to '' as $function$
  select pr.id, pr.part, pr.workspace_id, pr.stripe_account_id, pr.payment_intent, pr.event_id, pr.sale_kind, pr.currency, pr.source_type, pr.source_ref,
         case when pr.part = 'reserve' then pr.reserve_minor end, pr.trigger
    from public.payout_releases pr
    left join public.connect_accounts ca on ca.stripe_account_id = pr.stripe_account_id and ca.livemode = pr.livemode
   where pr.status = 'due' and pr.livemode = p_livemode and not public.dec107_payouts_paused(pr.workspace_id)
     and (ca.country is null or exists (select 1 from public.dec107_settings s where s.id and ca.country = any(s.payout_countries)))
     -- Q58: a refund still owed on this sale is paid from the seller's balance first.
     and not (pr.source_type = 'checkout_order' and exists (select 1 from public.checkout_orders co where co.order_ref = pr.source_ref and co.refund_status in ('due','processing','failed')))
     and not (pr.source_type = 'payment_order' and exists (select 1 from public.payment_orders po join public.booking_cancellations bc on bc.build_item_id = po.build_item_id
                where po.reference = pr.source_ref and bc.refund_status in ('due','processing','failed')))
   order by pr.due_at nulls last, pr.id
   limit greatest(1, least(p_limit, 500));
$function$;
