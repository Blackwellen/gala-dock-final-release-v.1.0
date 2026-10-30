-- Q22 follow-ups (lane D, 2026-10-29). Additive, backward-compatible.
--   A. Organiser buy-back resale (the Q22 default settlement) compensates the seller by refunding their ORIGINAL payment. Q07's
--      resale_refund_source marked every direct-charge resale payout 'paid' at once (correct only for customer_connect, where the
--      reseller's own account took the charge), so under buy-back the seller would never have been refunded. Now:
--        • customer_connect (resale charged on the reseller's own seller workspace) → 'paid' immediately, as before;
--        • organiser buy-back → a pending refund job against the original order, on whichever rail took the original payment.
--      settle_resale_refund branches on how the original was charged:
--        • original Q07 direct charge: refunded on the organiser's connected account (src/lib/commerce/resale-refunds.ts). The ledger
--          memo (seller_refunds / seller_connected_balance) is posted by the connected charge.refunded webhook
--          (post_direct_refund_delta); no platform cash moves, so nothing legacy is posted here;
--        • legacy platform original + direct buy-back resale: the platform still holds the organiser's proceeds of the original sale
--          (provider_payable to the organiser), so the platform refund discharges that liability;
--        • legacy platform original + legacy resale: unchanged (seller liability reconciled, then discharged).
--      Idempotent: the posting key is resale:settled:<payout id> on every branch; the job row lock serialises workers.
--   B. Stripe disputes on ticket orders → ticket_order_dispute(): open → `chargeback` (raises the review flag via
--      checkout_orders_chargeback_flag), won → back to `issued`, lost → stays `chargeback`. Idempotent across webhook retries; an
--      order the machine can't move (already refunded, …) still gets one flag. One chargeback flag per order (unique index).

-- ── A. Resale payouts: settlement-aware source ────────────────────────────────────────────────────────────────────────
create or replace function public.resale_refund_source() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; o public.checkout_orders; r public.checkout_orders;
begin
 select * into r from public.checkout_orders where order_ref = new.order_ref;
 select * into t from public.tickets where id = new.ticket_id;
 -- customer_connect: the resale was a direct charge on the reseller's own seller workspace, so the reseller is already paid.
 if r.strategy = 'direct' and r.seller_workspace_id is not null and r.seller_workspace_id = public.user_seller_workspace(new.seller_id) then
  new.original_order_ref := (select x.order_ref from public.checkout_orders x where x.order_ref = t.order_ref);
  new.status := 'paid';
  return new;
 end if;
 -- Organiser buy-back (direct resale on the organiser's account) and legacy platform resale: refund the original payment.
 select * into o from public.checkout_orders where order_ref = t.order_ref for update;
 if o.buyer_id is distinct from new.seller_id or o.status <> 'issued' or o.refund_status <> 'none' or o.stripe_session is null
  or t.status <> 'resold' or new.amount <> t.price_paid or new.amount <= 0 or new.amount > o.amount then
  raise exception 'original_payment_required' using errcode = '22023';
 end if;
 if o.strategy = 'direct' and coalesce(o.connected_account_id, '') !~ '^acct_[A-Za-z0-9_]+$' then
  raise exception 'original_account_missing' using errcode = '22023';
 end if;
 new.original_order_ref := o.order_ref;
 return new;
end $$;

create or replace function public.settle_resale_refund(p_job uuid, p_refund text, p_amount bigint, p_currency text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare p public.resale_payouts; o public.checkout_orders; r public.checkout_orders; ev public.events; route text;
begin
 select * into p from public.resale_payouts where id = p_job for update;
 if not found or p.seller_id is null or p.original_order_ref is null or p.status = 'cancelled' or length(coalesce(p_refund, '')) < 3 or p_amount <> round(p.amount * 100)::bigint then raise exception 'invalid_resale_settlement'; end if;
 -- A retry after a committed settlement is a no-op (same refund), never a second posting.
 if p.status = 'paid' and p.stripe_refund_id = p_refund then return true; end if;
 select * into o from public.checkout_orders where order_ref = p.original_order_ref;
 if o.buyer_id is distinct from p.seller_id or upper(o.currency) <> upper(p_currency) then raise exception 'original_payment_required'; end if;
 if p.stripe_refund_id is not null and p.stripe_refund_id <> p_refund then raise exception 'refund_identity_mismatch'; end if;
 if not exists(select 1 from public.checkout_resale_allocations a where a.order_ref = p.order_ref and a.ticket_id = p.ticket_id and a.seller_id = p.seller_id and a.amount_minor = p_amount) then raise exception 'resale_allocation_missing'; end if;
 if not public.resale_refund_ready(p_job) then raise exception 'resale_payment_not_issued'; end if;
 select * into r from public.checkout_orders where order_ref = p.order_ref;
 select * into ev from public.events where id = o.event_id;
 if o.strategy = 'direct' then
  -- Refunded on the organiser's connected account: the connected charge.refunded webhook posts the memo. No platform cash.
  route := 'direct_original';
 elsif r.strategy = 'direct' then
  route := 'legacy_original_direct_resale';
  perform public.post_ledger_transaction('resale:settled:' || p.id, 'refund', upper(p_currency),
   jsonb_build_array(jsonb_build_object('account', 'provider_payable', 'amount_minor', p_amount,
      'party_type', case when ev.workspace_id is null then 'user' else 'workspace' end, 'party_id', coalesce(ev.workspace_id, ev.owner_id)),
    jsonb_build_object('account', 'refunds', 'amount_minor', -p_amount, 'party_type', 'platform')),
   ev.workspace_id, ev.id, 'resale_payout', p.id::text, 'Organiser buy-back: original platform-charged ticket refunded to the seller', p_refund, 'system');
 else
  route := 'legacy';
  perform public.reconcile_resale_liability(p.order_ref);
  perform public.post_ledger_transaction('resale:settled:' || p.id, 'refund', upper(p_currency),
   jsonb_build_array(jsonb_build_object('account', 'provider_payable', 'amount_minor', p_amount, 'party_type', 'user', 'party_id', p.seller_id),
    jsonb_build_object('account', 'refunds', 'amount_minor', -p_amount, 'party_type', 'platform')),
   ev.workspace_id, ev.id, 'resale_payout', p.id::text, 'Seller proceeds refunded to original payment method', p_refund, 'system');
 end if;
 update public.resale_payouts set status = 'paid', stripe_refund_id = p_refund, refund_error = null, updated_at = now() where id = p.id;
 insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', ev.workspace_id, 'ticket.resale_seller_refunded',
  jsonb_build_object('payout_id', p.id, 'original_order_ref', p.original_order_ref, 'resale_order_ref', p.order_ref, 'amount_minor', p_amount, 'refund', p_refund, 'route', route));
 return true;
end $$;

-- ── B. Disputes on ticket orders ──────────────────────────────────────────────────────────────────────────────────────
create unique index if not exists ticket_risk_flags_chargeback_order_uq on public.ticket_risk_flags(order_ref) where order_ref is not null and kind = 'chargeback';

create or replace function public.checkout_orders_chargeback_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.order_state = 'chargeback' and old.order_state is distinct from 'chargeback' then
    insert into public.ticket_risk_flags(event_id, user_id, order_ref, kind, severity, detail)
      values (new.event_id, new.buyer_id, new.order_ref, 'chargeback', 'review', jsonb_build_object('amount_minor', round((new.amount + new.fee) * 100)))
      on conflict do nothing;
  end if;
  return null;
end $$;

-- Service-only (Stripe webhook → syncStripeDispute). Returns {ok, ticket, state, changed}.
create or replace function public.ticket_order_dispute(p_ref text, p_dispute text, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.checkout_orders; res jsonb := '{}'; closed boolean; won boolean;
begin
  if length(coalesce(p_dispute, '')) < 3 or coalesce(p_status, '') = '' then raise exception 'invalid_dispute' using errcode = '22023'; end if;
  closed := p_status in ('won', 'lost', 'warning_closed');
  won := p_status in ('won', 'warning_closed');
  select * into o from public.checkout_orders where order_ref = p_ref for update;
  if not found then return jsonb_build_object('ok', true, 'ticket', false); end if;
  if not closed then
    if o.order_state = 'chargeback' then
      res := jsonb_build_object('changed', false);
    elsif public.state_transition_allowed('ticket_order', o.order_state, 'chargeback') then
      res := public.ticket_order_transition(p_ref, 'chargeback', o.order_state, 'stripe_dispute:' || p_dispute);
    else
      insert into public.ticket_risk_flags(event_id, user_id, order_ref, kind, severity, detail)
        values (o.event_id, o.buyer_id, o.order_ref, 'chargeback', 'review',
          jsonb_build_object('amount_minor', round((o.amount + o.fee) * 100), 'dispute', p_dispute, 'order_state', o.order_state))
        on conflict do nothing;
      res := jsonb_build_object('changed', false, 'flagged_only', true);
    end if;
  elsif won and o.order_state = 'chargeback' then
    res := public.ticket_order_transition(p_ref, 'issued', 'chargeback', 'stripe_dispute_won:' || p_dispute);
  else
    res := jsonb_build_object('changed', false);
  end if;
  return jsonb_build_object('ok', true, 'ticket', true, 'state', (select order_state from public.checkout_orders where order_ref = p_ref))
    || (res - 'ok');
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('ticket.resale_seller_refunded', 1, 'ticket', 'Organiser buy-back: a reseller''s original payment was refunded (payload: payout_id, original_order_ref, resale_order_ref, amount_minor, route).', null)
on conflict (event_type) do update set description = excluded.description;

revoke all on function public.resale_refund_source(), public.settle_resale_refund(uuid, text, bigint, text), public.checkout_orders_chargeback_flag(),
  public.ticket_order_dispute(text, text, text) from public, anon, authenticated;
grant execute on function public.settle_resale_refund(uuid, text, bigint, text), public.ticket_order_dispute(text, text, text) to service_role;
