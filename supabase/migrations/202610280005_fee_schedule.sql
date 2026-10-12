-- Fee schedule (Oct 2026). All fees are platform-usage fees for using the Gala Dock software.
--  * Supplier / venue commission by plan: Starter 8%, Pro 7%, Business and Enterprise 6% (admin overrides still win).
--  * Customer booking admin fee on marketplace payments: 2.5% of the payment, minimum £1, shown as its own line at checkout.
--  * Tickets: £1.00 booking fee per paid ticket to the buyer; 5% commission on face value to the ticket seller (primary sales only).
--  * Organiser cancellation: commission and booking fees on sold tickets stay payable by the organiser (platform_charges),
--    while buyers are refunded in full as consumer law requires.
--  * Partner commission grades by active referred accounts: 6 / 7 / 8 / 9 / 10%.
begin;

-- ════════ Published commerce settings (v+1) ════════
do $$
declare cur public.platform_settings; nv integer;
begin
  select * into cur from public.platform_settings where section = 'commerce' and status = 'published' order by version desc limit 1;
  select coalesce(max(version), 0) + 1 into nv from public.platform_settings where section = 'commerce';
  update public.platform_settings set status = 'superseded' where section = 'commerce' and status = 'published';
  insert into public.platform_settings(section, version, status, value, effective_at, change_reason, summary)
  values ('commerce', nv, 'published',
    coalesce(cur.value, '{}'::jsonb) || jsonb_build_object(
      'plans', jsonb_build_object(
        'starter', jsonb_build_object('monthly', coalesce((cur.value#>>'{plans,starter,monthly}')::numeric, 0), 'commission_bps', 800),
        'pro', jsonb_build_object('monthly', coalesce((cur.value#>>'{plans,pro,monthly}')::numeric, 79), 'commission_bps', 700),
        'business', jsonb_build_object('monthly', coalesce((cur.value#>>'{plans,business,monthly}')::numeric, 199), 'commission_bps', 600)),
      'enterprise_commission_bps', 600,
      'ticket_fee', jsonb_build_object('fixed', 1.00, 'pct_bps', 0, 'seller_bps', 500),
      'booking_admin_fee', jsonb_build_object('pct_bps', 250, 'min_minor', 100)),
    now(), 'Fee schedule Oct 2026: supplier 8/7/6% by plan, 2.5% (min £1) customer admin fee, tickets £1 + 5% seller commission',
    'Supplier commission 8/7/6%; customer admin fee 2.5% (min £1); tickets £1 buyer fee + 5% seller commission');
end $$;

create or replace function public.commerce_setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value->p_key from public.platform_settings where section = 'commerce' and status = 'published' order by version desc limit 1;
$$;
revoke all on function public.commerce_setting(text) from public, anon, authenticated;

-- ════════ Supplier commission by plan ════════
create or replace function public.plan_commission_bps(p_plan text) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case when p_plan = 'enterprise' then (public.commerce_setting('enterprise_commission_bps'))::text::integer
         else (public.commerce_setting('plans')#>>array[p_plan, 'commission_bps'])::integer end,
    case p_plan when 'pro' then 700 when 'business' then 600 when 'enterprise' then 600 else 800 end);
$$;
revoke all on function public.plan_commission_bps(text) from public, anon, authenticated;

alter table public.workspaces alter column commission_bps set default 800;
alter table public.workspaces add column if not exists commission_custom boolean not null default false;

-- Admin overrides mark the rate as custom so plan changes don't overwrite it.
create or replace function public.admin_set_workspace_commission(p_ws uuid, p_bps integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare old integer; pl text;
begin
  perform public.admin_require('commerce', p_reason);
  if p_bps is null or p_bps < 0 or p_bps > 5000 then raise exception 'invalid_rate' using errcode = '22023'; end if;
  select commission_bps, plan into old, pl from public.workspaces where id = p_ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.workspaces set commission_bps = p_bps, commission_custom = (p_bps <> public.plan_commission_bps(pl)) where id = p_ws;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'admin.workspace_commission_changed', jsonb_build_object('from_bps', old, 'to_bps', p_bps, 'reason', p_reason));
end $$;

create or replace function public.trg_workspace_plan_commission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.commission_custom and (tg_op = 'INSERT' or new.plan is distinct from old.plan) then
    new.commission_bps := public.plan_commission_bps(new.plan);
  end if;
  return new;
end $$;
drop trigger if exists gd_workspace_plan_commission on public.workspaces;
create trigger gd_workspace_plan_commission before insert or update of plan on public.workspaces for each row execute function public.trg_workspace_plan_commission();

update public.workspaces set commission_bps = public.plan_commission_bps(plan) where not commission_custom;

-- ════════ Customer booking admin fee on marketplace payments ════════
alter table public.payment_orders add column if not exists customer_fee_minor bigint not null default 0 check (customer_fee_minor >= 0);

create or replace function public.booking_admin_fee_minor(p_amount_minor bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select case when coalesce(p_amount_minor, 0) <= 0 then 0 else
    greatest(coalesce((public.commerce_setting('booking_admin_fee')->>'min_minor')::bigint, 100),
             round(p_amount_minor * coalesce((public.commerce_setting('booking_admin_fee')->>'pct_bps')::numeric, 250) / 10000)::bigint) end;
$$;
revoke all on function public.booking_admin_fee_minor(bigint) from public, anon, authenticated;

-- ════════ Ticket seller commission ════════
alter table public.checkout_orders add column if not exists commission numeric(12,2) not null default 0 check (commission >= 0);

-- ════════ Organiser charges (cancellation commission) ════════
create table if not exists public.platform_charges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  kind text not null check (kind in ('cancellation_fees')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GBP',
  status text not null default 'due' check (status in ('due','settled','waived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (event_id, kind)
);
alter table public.platform_charges enable row level security;
drop policy if exists platform_charges_read on public.platform_charges;
create policy platform_charges_read on public.platform_charges for select
  using (public.has_workspace_role(workspace_id, array['owner','manager','finance']) or public.has_admin_permission('commerce'));
revoke insert, update, delete on public.platform_charges from anon, authenticated;


-- create_payment_order: adds the customer booking admin fee (customer_fee_minor) on top of the booking amount.
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
end $function$;

-- payment_order_succeeded: Stripe total = booking amount + admin fee; the admin fee is platform revenue.
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
      jsonb_build_object('account', 'platform_fee', 'amount_minor', -(po.platform_fee_minor + po.customer_fee_minor), 'party_type', 'platform'),
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
end $function$;

-- cancel_event_with_refunds: records the organiser's platform fees on sold tickets as a charge (Organizer Terms 2.4).
CREATE OR REPLACE FUNCTION public.cancel_event_with_refunds(p_event uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; n_orders integer; n_tickets integer; chg numeric; n_chg integer;
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.has_workspace_role(e.workspace_id, array['owner','manager']) or public.has_admin_permission('tickets')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.status in ('cancelled','completed','closed','archived') then raise exception 'invalid_state' using errcode = '22023'; end if;
  if e.starts_at is not null and e.starts_at < now() - interval '1 day' then raise exception 'already_happened' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;

  insert into public.event_cancellations(event_id, reason, cancelled_by) values (p_event, left(trim(p_reason), 2000), auth.uid());
  update public.events set status = 'cancelled', updated_at = now() where id = p_event;
  update public.tickets set status = 'cancelled' where event_id = p_event and status in ('valid','resale_listed','transferred');
  get diagnostics n_tickets = row_count;
  update public.checkout_orders set refund_status = 'due', refund_reason = 'event_cancelled'
    where event_id = p_event and status in ('paid','issued') and (amount + fee) > 0 and refund_status in ('none','failed');
  get diagnostics n_orders = row_count;
  -- Platform fees on sold tickets (seller commission + buyer booking fees) stay payable by the organiser; buyers are still refunded in full.
  select coalesce(sum(o.commission + o.fee), 0), count(*) into chg, n_chg from public.checkout_orders o
    where o.event_id = p_event and o.kind = 'primary' and o.refund_status = 'due' and o.refund_reason = 'event_cancelled';
  if chg > 0 then
    insert into public.platform_charges(workspace_id, event_id, kind, description, amount, metadata)
      values (e.workspace_id, p_event, 'cancellation_fees', left('Platform fees on tickets sold for ' || e.name || ' (event cancelled)', 300), chg, jsonb_build_object('orders', n_chg))
      on conflict (event_id, kind) do nothing;
    if e.workspace_id is not null then
      perform public.notify_workspace(e.workspace_id, array['owner','manager','finance'], 'payment_due', left('Platform fees due: ' || e.name, 160),
        'Buyers are being refunded in full. Platform fees of £' || to_char(chg, 'FM999999990.00') || ' on the tickets sold remain payable and will be deducted from your next payout or invoiced.', '/organizer/money');
    end if;
  end if;
  update public.checkout_orders set refund_status = 'not_required' where event_id = p_event and status in ('paid','issued') and (amount + fee) = 0 and refund_status = 'none';
  update public.resale_payouts rp set status = 'cancelled' from public.tickets t where t.id = rp.ticket_id and t.event_id = p_event and rp.status = 'pending';
  delete from public.ticket_waitlist where event_id = p_event;

  update public.event_cancellations set orders_refunded = n_orders, tickets_voided = n_tickets where event_id = p_event;
  insert into public.notifications(user_id, kind, title, body, link)
    select distinct o.buyer_id, 'ticket_refund', left(e.name || ' has been cancelled', 160),
      'The organiser cancelled this event. ' || case when (o.amount + o.fee) > 0 then 'You’ll get a full refund, including fees, to your original payment method within 5–10 working days.' else 'Your free tickets have been cancelled.' end,
      '/account/tickets'
    from public.checkout_orders o where o.event_id = p_event and o.status in ('paid','issued') and o.buyer_id is not null;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', e.workspace_id, 'event.cancelled', jsonb_build_object('event_id', p_event, 'orders_to_refund', n_orders, 'tickets_voided', n_tickets, 'fees_due', coalesce(chg, 0), 'reason', left(p_reason, 300)));
  return jsonb_build_object('orders_to_refund', n_orders, 'tickets_voided', n_tickets, 'fees_due', coalesce(chg, 0));
end $function$;

-- ════════ Partner commission grades (Partner Terms 2) ════════
-- Grade from active referred paying accounts: 1 (0–4) 6% · 2 (5–14) 7% · 3 (15–29) 8% · 4 (30–49) 9% · 5 (50+) 10%.
-- An administrator can set custom terms (admin_set_partner_terms), which locks the rate.
alter table public.partners add column if not exists grade smallint not null default 1 check (grade between 1 and 5);
alter table public.partners add column if not exists rate_locked boolean not null default false;
alter table public.partners alter column commission_bps set default 600;

create or replace function public.partner_grade_for(p_active integer) returns smallint language sql immutable as $$
  select case when p_active >= 50 then 5 when p_active >= 30 then 4 when p_active >= 15 then 3 when p_active >= 5 then 2 else 1 end::smallint;
$$;

create or replace function public.partner_apply_grade(p_partner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n integer; g smallint; old public.partners;
begin
  select * into old from public.partners where id = p_partner for update;
  if not found then return; end if;
  select count(*) into n from public.partner_referrals where partner_id = p_partner and status = 'active';
  g := public.partner_grade_for(n);
  update public.partners set grade = g, commission_bps = case when rate_locked then commission_bps else 500 + g * 100 end where id = p_partner;
  if g <> old.grade then
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.grade_changed', jsonb_build_object('partner_id', p_partner, 'from', old.grade, 'to', g, 'active_referrals', n));
  end if;
end $$;
revoke all on function public.partner_apply_grade(uuid) from public, anon, authenticated;

create or replace function public.trg_partner_referral_grade() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.partner_apply_grade(coalesce(new.partner_id, old.partner_id));
  return null;
end $$;
drop trigger if exists gd_partner_referral_grade on public.partner_referrals;
create trigger gd_partner_referral_grade after insert or delete or update of status on public.partner_referrals for each row execute function public.trg_partner_referral_grade();

create or replace function public.admin_set_partner_terms(p_partner uuid, p_commission_bps integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare old integer;
begin
  perform public.admin_require('partners', p_reason);
  if p_commission_bps is null or p_commission_bps < 0 or p_commission_bps > 5000 then raise exception 'invalid_rate' using errcode = '22023'; end if;
  select commission_bps into old from public.partners where id = p_partner for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.partners set commission_bps = p_commission_bps, rate_locked = true where id = p_partner;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.partner_terms', jsonb_build_object('partner_id', p_partner, 'from_bps', old, 'to_bps', p_commission_bps, 'reason', p_reason, 'locked', true));
end $$;

do $$ declare p uuid; begin for p in select id from public.partners loop perform public.partner_apply_grade(p); end loop; end $$;

commit;
