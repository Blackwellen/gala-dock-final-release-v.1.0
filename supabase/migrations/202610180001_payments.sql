-- Payment orchestration (master spec §38–43): canonical payment orders, configuration-driven commission with per-booking snapshots,
-- payment protection → release → transfer states, refund queue, and the background dispatch that drives Stripe work.
-- Stripe events remain authoritative: nothing here marks money as received from a client redirect.
begin;

-- ───────────────────────── §41 commission rules ─────────────────────────
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,   -- negotiated / enterprise
  plan text, country text, category text, partner_id uuid, promotion_code text,
  rate_bps integer not null check (rate_bps between 0 and 5000),
  fixed_minor integer not null default 0 check (fixed_minor >= 0),
  priority integer not null default 100,
  active boolean not null default true,
  valid_from timestamptz, valid_to timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.commission_rules enable row level security;
drop policy if exists commission_rules_admin on public.commission_rules;
create policy commission_rules_admin on public.commission_rules for select using (public.has_admin_permission('commerce'));

-- Most specific active rule wins (workspace > promotion > category+country > category > plan); otherwise the workspace's
-- admin-managed rate. The result is snapshotted on every payment order so later plan changes never rewrite history.
create or replace function public.resolve_commission(p_workspace uuid, p_category text default null, p_country text default null, p_promotion text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with w as (select id, plan, commission_bps, coalesce(nullif(settings->>'country', ''), 'GB') country from public.workspaces where id = p_workspace),
  r as (
    select c.*, (case when c.workspace_id is not null then 1000 else 0 end + case when c.promotion_code is not null then 500 else 0 end
      + case when c.category is not null then 100 else 0 end + case when c.country is not null then 50 else 0 end + case when c.plan is not null then 10 else 0 end) spec
    from public.commission_rules c, w
    where c.active and (c.valid_from is null or c.valid_from <= now()) and (c.valid_to is null or c.valid_to > now())
      and (c.workspace_id is null or c.workspace_id = w.id) and (c.plan is null or c.plan = w.plan)
      and (c.country is null or c.country = coalesce(p_country, w.country)) and (c.category is null or lower(c.category) = lower(coalesce(p_category, '')))
      and (c.promotion_code is null or c.promotion_code = p_promotion)
    order by spec desc, c.priority asc limit 1)
  select coalesce(
    (select jsonb_build_object('source', 'rule', 'rule_id', r.id, 'rule_name', r.name, 'rate_bps', r.rate_bps, 'fixed_minor', r.fixed_minor) from r),
    (select jsonb_build_object('source', 'workspace', 'rate_bps', w.commission_bps, 'fixed_minor', 0) from w),
    jsonb_build_object('source', 'default', 'rate_bps', 1000, 'fixed_minor', 0))
  || (select jsonb_build_object('plan', w.plan, 'country', coalesce(p_country, w.country), 'category', p_category, 'resolved_at', now()) from w);
$$;

-- ───────────────────────── §38 canonical payment orders ─────────────────────────
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  kind text not null check (kind in ('supplier_booking','venue_hire','deposit','balance_payment','standby_fee','emergency_service','ticket_order','ticket_resale',
    'refund','platform_boost','subscription','provider_payout','promoter_commission','affiliate_commission')),
  status text not null default 'amount_due',
  payer_id uuid references auth.users(id),
  event_id uuid references public.events(id) on delete set null,
  build_item_id uuid references public.build_items(id) on delete set null,
  standby_id uuid references public.standby_commitments(id) on delete set null,
  payee_workspace_id uuid references public.workspaces(id) on delete set null,
  description text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'GBP',
  platform_fee_minor bigint not null default 0 check (platform_fee_minor >= 0),
  commission jsonb not null default '{}',
  strategy text not null default 'separate_transfer' check (strategy in ('separate_transfer','destination','direct','platform')),
  protected boolean not null default true,
  stripe_checkout_session text, stripe_payment_intent text, stripe_charge text, stripe_transfer text,
  transferred_minor bigint not null default 0, refunded_minor bigint not null default 0,
  release_eligible_at timestamptz, released_at timestamptz,
  livemode boolean,
  idempotency_key text unique,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_orders_item_idx on public.payment_orders(build_item_id, status);
create index if not exists payment_orders_payee_idx on public.payment_orders(payee_workspace_id, status);
create index if not exists payment_orders_pi_idx on public.payment_orders(stripe_payment_intent);
alter table public.payment_orders enable row level security;
drop policy if exists payment_orders_read on public.payment_orders;
create policy payment_orders_read on public.payment_orders for select using (
  payer_id = (select auth.uid()) or (event_id is not null and public.can_see_event_money(event_id))
  or (payee_workspace_id is not null and public.has_workspace_role(payee_workspace_id, array['owner','manager','finance']))
  or public.has_admin_permission('commerce'));

alter table public.booking_cancellations
  add column if not exists refund_status text not null default 'none' check (refund_status in ('none','due','processing','refunded','failed','manual')),
  add column if not exists refunded_minor bigint not null default 0,
  add column if not exists refund_error text;

-- Event-side payer creates (or reuses) the open order for a booking payment. Amounts come from the database only.
create or replace function public.create_payment_order(p_kind text, p_item uuid default null, p_standby uuid default null)
returns public.payment_orders language plpgsql security definer set search_path = '' as $$
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
  insert into public.payment_orders(kind, payer_id, event_id, build_item_id, standby_id, payee_workspace_id, description, amount_minor, currency, platform_fee_minor, commission, strategy, protected, idempotency_key)
    values (p_kind, auth.uid(), b.event_id, b.id, p_standby, ws, descr, round(amt * 100)::bigint, coalesce(e.currency, 'GBP'), fee, c, 'separate_transfer', p_kind <> 'standby_fee', key)
    returning * into po;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', ws, 'payment.order_created', jsonb_build_object('payment_order', po.reference, 'kind', p_kind, 'amount_minor', po.amount_minor, 'commission', c));
  return po;
end $$;

-- Service: Stripe Checkout session attached (payment_pending). Called by the orchestrator after creating the session.
create or replace function public.payment_order_pending(p_ref text, p_session text) returns void
language sql security definer set search_path = '' as $$
  update public.payment_orders set status = 'payment_pending', stripe_checkout_session = p_session, updated_at = now() where reference = p_ref and status in ('amount_due','payment_pending');
$$;

-- Service (webhook): payment confirmed by Stripe. Verifies the amount, posts the ledger and applies the booking effect exactly once.
create or replace function public.payment_order_succeeded(p_ref text, p_pi text, p_charge text, p_amount_minor bigint, p_livemode boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare po public.payment_orders; b public.build_items; e public.events; dep numeric; bal numeric; owner uuid; tx uuid; amt numeric;
begin
  select * into po from public.payment_orders where reference = p_ref for update;
  if not found then return 'unknown_order'; end if;
  if po.status not in ('amount_due','payment_pending','failed') then return 'already_applied'; end if;
  if p_amount_minor <> po.amount_minor then
    update public.payment_orders set status = 'failed', failure_reason = 'amount_mismatch:' || p_amount_minor, updated_at = now() where id = po.id;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', po.payee_workspace_id, 'payment.amount_mismatch', jsonb_build_object('payment_order', p_ref, 'expected', po.amount_minor, 'got', p_amount_minor));
    return 'amount_mismatch';
  end if;
  update public.payment_orders set status = case when po.protected then 'protected_pending_delivery' else 'payment_succeeded' end, stripe_payment_intent = p_pi, stripe_charge = p_charge,
    livemode = p_livemode, updated_at = now() where id = po.id;
  tx := public.post_ledger_transaction('stripe:pi:' || p_pi, case po.kind when 'standby_fee' then 'standby_fee' when 'emergency_service' then 'emergency_service' when 'balance_payment' then 'balance_payment' else 'deposit' end,
    po.currency, (select jsonb_agg(x) from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('account', 'cash_stripe', 'amount_minor', po.amount_minor, 'party_type', 'platform'),
      jsonb_build_object('account', 'platform_fee', 'amount_minor', -po.platform_fee_minor, 'party_type', 'platform'),
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
end $$;

create or replace function public.payment_order_failed(p_ref text, p_reason text) returns void
language sql security definer set search_path = '' as $$
  update public.payment_orders set status = 'failed', failure_reason = left(p_reason, 300), updated_at = now() where reference = p_ref and status in ('amount_due','payment_pending');
$$;

-- Release eligibility (§43): protected funds become transferable once delivery is evidenced (fulfilled/completed, or 48h after
-- the event ends) and there is no open booking dispute or chargeback. Standby fees release when the commitment is accepted.
create or replace function public.payment_release_scan() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with x as (
    update public.payment_orders po set status = 'eligible_for_provider_transfer', release_eligible_at = now(), updated_at = now()
    where po.status in ('protected_pending_delivery','payment_succeeded') and po.kind in ('deposit','balance_payment','emergency_service','standby_fee')
      and not exists (select 1 from public.booking_disputes d where d.build_item_id = po.build_item_id and d.status <> 'resolved')
      and not exists (select 1 from public.stripe_disputes sd where sd.payment_intent_id = po.stripe_payment_intent and sd.outcome is null)
      and not exists (select 1 from public.booking_cancellations bc where bc.build_item_id = po.build_item_id and bc.status in ('requested','manual_review'))
      and (po.kind = 'standby_fee'
        or exists (select 1 from public.build_items b where b.id = po.build_item_id and b.status in ('fulfilled','completed'))
        or exists (select 1 from public.build_items b join public.events e on e.id = b.event_id where b.id = po.build_item_id and b.status in ('confirmed','active')
             and coalesce(e.ends_at, e.starts_at + interval '6 hours') < now() - interval '48 hours'))
    returning 1)
  select count(*) into n from x;
  return n;
end $$;

-- Service: a Stripe transfer to the provider's connected account was created.
create or replace function public.payment_order_transferred(p_ref text, p_transfer text, p_amount_minor bigint) returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- Service (webhook charge.refunded): records refunds against the order (ledger already posted by the webhook).
create or replace function public.payment_order_refunded(p_pi text, p_refunded_minor bigint) returns void
language sql security definer set search_path = '' as $$
  update public.payment_orders set refunded_minor = greatest(refunded_minor, p_refunded_minor),
    status = case when p_refunded_minor >= amount_minor then 'refunded' else 'partially_refunded' end, updated_at = now()
  where stripe_payment_intent = p_pi and status not in ('refunded');
$$;

create or replace function public.payment_order_disputed(p_pi text, p_open boolean) returns void
language sql security definer set search_path = '' as $$
  update public.payment_orders set status = case when p_open then 'disputed'
      when stripe_transfer is not null then 'transfer_created' when refunded_minor > 0 then 'partially_refunded' else 'protected_pending_delivery' end, updated_at = now()
  where stripe_payment_intent = p_pi and (p_open or status = 'disputed');
$$;

-- Cancellation refunds join the processing queue (§45 → §38).
create or replace function public.booking_cancellation_refund_queue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and coalesce((new.calculation->>'refund_amount')::numeric, 0) > 0 then
    new.refund_status := case when exists (select 1 from public.payment_orders p where p.build_item_id = new.build_item_id and p.stripe_payment_intent is not null) then 'due' else 'manual' end;
  end if;
  return new;
end $$;
drop trigger if exists booking_cancellations_refund_queue on public.booking_cancellations;
create trigger booking_cancellations_refund_queue before update of status on public.booking_cancellations for each row execute function public.booking_cancellation_refund_queue();

create or replace function public.cancellation_refund_progress(p_cancellation uuid, p_status text, p_refunded_minor bigint, p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.booking_cancellations set refund_status = p_status, refunded_minor = coalesce(p_refunded_minor, refunded_minor), refund_error = left(p_error, 300), updated_at = now() where id = p_cancellation;
$$;

-- ───────────────────────── grants ─────────────────────────
revoke all on function public.resolve_commission(uuid, text, text, text), public.payment_order_pending(text, text), public.payment_order_succeeded(text, text, text, bigint, boolean),
  public.payment_order_failed(text, text), public.payment_release_scan(), public.payment_order_transferred(text, text, bigint), public.payment_order_refunded(text, bigint),
  public.payment_order_disputed(text, boolean), public.booking_cancellation_refund_queue(), public.cancellation_refund_progress(uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.resolve_commission(uuid, text, text, text), public.payment_order_pending(text, text), public.payment_order_succeeded(text, text, text, bigint, boolean),
  public.payment_order_failed(text, text), public.payment_release_scan(), public.payment_order_transferred(text, text, bigint), public.payment_order_refunded(text, bigint),
  public.payment_order_disputed(text, boolean), public.cancellation_refund_progress(uuid, text, bigint, text) to service_role;
revoke all on function public.create_payment_order(text, uuid, uuid) from public, anon;
grant execute on function public.create_payment_order(text, uuid, uuid) to authenticated, service_role;
grant select on public.payment_orders, public.commission_rules to authenticated;
grant all on public.payment_orders, public.commission_rules to service_role;

commit;
