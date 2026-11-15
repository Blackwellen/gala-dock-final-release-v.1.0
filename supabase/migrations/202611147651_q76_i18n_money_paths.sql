-- Q76 internationalisation phase 2 (lane i18n-phase2), part 1: money paths. Additive. Coordinator decisions (owner delegation,
-- docs/release/backend-queue.md Q72/Q76 rows): bookings charge in the SELLER's currency (O2); one fee catalogue per currency,
-- rounded locally (O3); JPY/HUF checkout deferred (O5); non-UK release dates count weekdays only, the UK keeps uk_bank_holidays (O6).
-- DEC-107 is unchanged: direct charges on the seller's connected account, application fee, manual payouts, ledger in minor units.
-- Every GBP path is byte-for-byte the same result as before (the exercise proves it); only non-GBP / non-UK rows change.
--
--   1. ref_fee_catalogue: one row per transactional currency with the local fixed fees (ticket booking fee, booking admin-fee
--      minimum) for the current GBP basis, plus a reference rate + rounding step used when the GBP setting changes and the row has
--      not been re-reviewed. fee_fixed_minor_in(kind, gbp_minor, currency): GBP → the GBP amount (unchanged).
--      checkout_quote: the fixed ticket fee comes from the catalogue in the event currency (was £1.00 → €1.00 1:1).
--      booking_admin_fee_minor(amount, currency): the admin-fee minimum in the booking currency (1-arg form kept for callers).
--   2. Seller currency for bookings: listing_charge_currency(listing) = listings.currency → seller workspace currency → GBP;
--      booking_charge_currency(item) = an existing payment order's currency for the item → the latest quote's currency → the
--      listing's → the event's → GBP (so a deposit and its balance never split currencies, and an accepted quote is charged in the
--      currency it was written in). create_payment_order and new quotes (i18n_quote_currency) use it; only two-decimal
--      transactional currencies are ever returned. customer_accept_quote records its deposit in that currency.
--   3. Release dates per country: dec107_add_business_days_in(from, days, tz, country) counts Mon–Fri in the event's zone and
--      skips England & Wales bank holidays only when the seller's business country (else the event's) is GB; a London event with
--      no country is GB. dec107_ticket_release_at(event) is used by ticket_sales_open_from and dec107_release_sweep (one line each).
--   4. Resale in the original order's currency: the three GBP-only checks (guard_resale_original_payer,
--      guard_resale_reservation_payer, resale_listings) now require the original order to be in the event's checkout currency —
--      the currency the resale is quoted and charged in (checkout_quote) — instead of GBP.
--   5. Payout settlement currency (C13): payout_releases.settlement_currency (nullable). The release worker reads the charge's
--      balance transaction (seller context) and pays out in the currency the money settled in; dec107_release_paid records it and
--      a reserve part is created in the settlement currency (its reserve_minor is settlement money).
-- Function bodies marked "reviewed replacement(s) on the live definition" are the live pg_get_functiondef text with only the
-- listed substrings replaced (generator: exact, counted matches). Prior bodies: docs/release/i18n/q76-rollback.sql.
-- Rollback: run docs/release/i18n/q76-rollback.sql (prior bodies of every replaced function); the table, column and helpers are inert.

-- ═══ 1. Fee catalogue ═══
create table if not exists public.ref_fee_catalogue (
  currency text primary key references public.ref_currencies(code),
  gbp_rate numeric(14,6) not null check (gbp_rate > 0),
  step_minor integer not null default 10 check (step_minor between 1 and 10000),
  ticket_fixed_basis_gbp_minor bigint check (ticket_fixed_basis_gbp_minor >= 0),
  ticket_fixed_minor bigint check (ticket_fixed_minor >= 0),
  booking_admin_min_basis_gbp_minor bigint check (booking_admin_min_basis_gbp_minor >= 0),
  booking_admin_min_minor bigint check (booking_admin_min_minor >= 0),
  reviewed boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);
comment on table public.ref_fee_catalogue is 'Q76 per-currency fee catalogue (owner O3). Local price points for the GBP basis; gbp_rate/step_minor convert a changed GBP setting until the row is re-reviewed. Reference rates, not FX for charging.';
alter table public.ref_fee_catalogue enable row level security;
drop policy if exists ref_fee_catalogue_read on public.ref_fee_catalogue;
create policy ref_fee_catalogue_read on public.ref_fee_catalogue for select to anon, authenticated using (true);
revoke all on public.ref_fee_catalogue from anon, authenticated;
grant select on public.ref_fee_catalogue to anon, authenticated;

-- Basis: ticket_fee.fixed £1.00 and booking_admin_fee.min_minor 100 (commerce settings v6). Rates ≈ Nov 2026 reference, rounded
-- to local price points; reviewed = false until the owner confirms the catalogue before live mode.
insert into public.ref_fee_catalogue(currency, gbp_rate, step_minor, ticket_fixed_basis_gbp_minor, ticket_fixed_minor, booking_admin_min_basis_gbp_minor, booking_admin_min_minor, note) values
  ('GBP', 1,      1,   100, 100,  100, 100,  'Basis currency'),
  ('EUR', 1.15,   10,  100, 120,  100, 120,  null),
  ('USD', 1.30,   10,  100, 130,  100, 130,  null),
  ('CAD', 1.80,   10,  100, 180,  100, 180,  null),
  ('AUD', 2.00,   10,  100, 200,  100, 200,  null),
  ('NZD', 2.25,   10,  100, 220,  100, 220,  null),
  ('CHF', 1.08,   10,  100, 110,  100, 110,  null),
  ('SGD', 1.72,   10,  100, 170,  100, 170,  null),
  ('HKD', 10.10,  50,  100, 1000, 100, 1000, null),
  ('CZK', 28.50,  100, 100, 2900, 100, 2900, 'Whole koruna'),
  ('DKK', 8.60,   50,  100, 850,  100, 850,  null),
  ('NOK', 14.60,  100, 100, 1500, 100, 1500, 'Whole krone'),
  ('SEK', 14.30,  100, 100, 1500, 100, 1500, 'Whole krona'),
  ('PLN', 4.95,   50,  100, 500,  100, 500,  null),
  ('RON', 5.80,   50,  100, 600,  100, 600,  null)
on conflict (currency) do nothing;

create or replace function public.fee_fixed_minor_in(p_kind text, p_gbp_minor bigint, p_currency text) returns bigint
language sql stable security definer set search_path = '' as $$
  select case
    when coalesce(p_gbp_minor, 0) <= 0 then coalesce(p_gbp_minor, 0)
    when upper(coalesce(nullif(trim(p_currency), ''), 'GBP')) = 'GBP' then p_gbp_minor
    else coalesce((
      select case
        when p_kind = 'ticket_fixed' and f.ticket_fixed_basis_gbp_minor = p_gbp_minor and f.ticket_fixed_minor is not null then f.ticket_fixed_minor
        when p_kind = 'booking_admin_min' and f.booking_admin_min_basis_gbp_minor = p_gbp_minor and f.booking_admin_min_minor is not null then f.booking_admin_min_minor
        else greatest(f.step_minor, round(p_gbp_minor * f.gbp_rate / f.step_minor) * f.step_minor)::bigint end
      from public.ref_fee_catalogue f where f.currency = upper(trim(p_currency))), p_gbp_minor) end
$$;
revoke all on function public.fee_fixed_minor_in(text, bigint, text) from public, anon, authenticated;

create or replace function public.booking_admin_fee_minor(p_amount_minor bigint, p_currency text) returns bigint
language sql stable security definer set search_path = '' as $$
  select case when coalesce(p_amount_minor, 0) <= 0 then 0 else
    greatest(public.fee_fixed_minor_in('booking_admin_min', coalesce((public.commerce_setting('booking_admin_fee')->>'min_minor')::bigint, 100), p_currency),
             round(p_amount_minor * coalesce((public.commerce_setting('booking_admin_fee')->>'pct_bps')::numeric, 250) / 10000)::bigint) end;
$$;
revoke all on function public.booking_admin_fee_minor(bigint, text) from public, anon, authenticated;

-- ═══ 2. Seller currency for bookings ═══
create or replace function public.listing_charge_currency(p_listing uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.code from public.listings l join public.ref_currencies c on c.code = upper(l.currency)
      where l.id = p_listing and c.active and c.transactional and c.minor_units = 2),
    (select c.code from public.listings l join public.ref_currencies c on c.code = public.workspace_default_currency(l.workspace_id)
      where l.id = p_listing and c.active and c.transactional and c.minor_units = 2),
    'GBP')
$$;
revoke all on function public.listing_charge_currency(uuid) from public, anon, authenticated;

create or replace function public.booking_charge_currency(p_item uuid) returns text
language sql stable security definer set search_path = '' as $$
  with ok as (select c.code from public.ref_currencies c where c.active and c.transactional and c.minor_units = 2)
  select coalesce(
    (select upper(po.currency) from public.payment_orders po
      where po.build_item_id = p_item and po.kind in ('deposit','balance_payment','emergency_service','standby_fee')
        and po.status not in ('failed','cancelled') and upper(po.currency) in (select code from ok)
      order by po.created_at limit 1),
    (select upper(q.currency) from public.provider_quotes q
      where q.build_item_id = p_item and upper(q.currency) in (select code from ok) order by q.created_at desc limit 1),
    (select public.listing_charge_currency(b.listing_id) from public.build_items b where b.id = p_item and b.listing_id is not null),
    (select public.event_checkout_currency(b.event_id) from public.build_items b where b.id = p_item),
    'GBP')
$$;
revoke all on function public.booking_charge_currency(uuid) from public, anon, authenticated;

-- ═══ 3. Release dates per country ═══
create or replace function public.dec107_add_business_days_in(p_from timestamptz, p_days integer, p_tz text, p_country text) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare d timestamptz := p_from; n integer := 0; local_day date; z text; c text := upper(nullif(trim(coalesce(p_country, '')), ''));
begin
  z := case when p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names t where t.name = p_tz) then p_tz else 'Europe/London' end;
  if c is null and z = 'Europe/London' then c := 'GB'; end if;
  while n < greatest(p_days, 0) loop
    d := d + interval '1 day';
    local_day := (d at time zone z)::date;
    if extract(isodow from local_day) < 6
       and not (c = 'GB' and exists (select 1 from public.uk_bank_holidays h where h.day = local_day and h.region = 'england-and-wales')) then
      n := n + 1;
    end if;
  end loop;
  return d;
end $$;
revoke all on function public.dec107_add_business_days_in(timestamptz, integer, text, text) from public, anon, authenticated;

create or replace function public.dec107_ticket_release_at(p_event uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select public.dec107_add_business_days_in(coalesce(e.ends_at, e.starts_at + interval '6 hours'), s.ticket_payout_delay_business_days, e.timezone,
           coalesce(public.workspace_business_country(e.workspace_id), e.country))
    from public.events e, public.dec107_settings s where e.id = p_event and s.id
$$;
revoke all on function public.dec107_ticket_release_at(uuid) from public, anon, authenticated;

-- ═══ 5. Settlement currency column (the function bodies follow below) ═══
alter table public.payout_releases add column if not exists settlement_currency text;
alter table public.payout_releases drop constraint if exists payout_releases_settlement_currency_check;
alter table public.payout_releases add constraint payout_releases_settlement_currency_check check (settlement_currency is null or settlement_currency ~ '^[A-Z]{3}$');
comment on column public.payout_releases.settlement_currency is 'Q76 (C13): the currency the charge settled in on the seller''s Stripe balance (= the payout currency). Null until paid; currency stays the charge currency.';
create or replace function public.dec107_settlement_currency(p text) returns text
language sql immutable set search_path = '' as $$ select case when upper(trim(coalesce(p, ''))) ~ '^[A-Z]{3}$' then upper(trim(p)) end $$;
revoke all on function public.dec107_settlement_currency(text) from public, anon, authenticated;

-- ═══ Replaced function bodies (1, 2, 3, 4, 5) ═══
-- create_payment_order: 2 reviewed replacement(s) on the live definition
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
    values (p_kind, auth.uid(), b.event_id, b.id, p_standby, ws, descr, round(amt * 100)::bigint, public.booking_charge_currency(b.id), fee, public.booking_admin_fee_minor(round(amt * 100)::bigint, public.booking_charge_currency(b.id)), c, 'separate_transfer', p_kind <> 'standby_fee', key)
    returning * into po;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', ws, 'payment.order_created', jsonb_build_object('payment_order', po.reference, 'kind', p_kind, 'amount_minor', po.amount_minor, 'commission', c));
  return po;
end $function$;

-- checkout_quote: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.checkout_quote(p_event uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cfg jsonb := public.ticket_fee_config(); fixed_minor numeric; pct numeric; seller_bps numeric; vat_r numeric := public.vat_rate_bps() / 10000.0; incl boolean := public.vat_consumer_inclusive();
  l record; d record; lines jsonb := '[]'; codes jsonb := '[]'; gross bigint := 0; disc bigint := 0; fee numeric := 0; fee_minor bigint; fee_vat bigint; per bigint; net bigint; q int; exp timestamptz; k text := 'primary';
begin
  fixed_minor := public.fee_fixed_minor_in('ticket_fixed', round(coalesce((cfg->>'fixed')::numeric, 0) * 100)::bigint, public.event_checkout_currency(p_event)); pct := coalesce((cfg->>'pct_bps')::numeric, 0); seller_bps := coalesce((cfg->>'seller_bps')::numeric, 0);
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
end $function$;

-- ticket_sales_open_from: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.ticket_sales_open_from(p_event uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.dec107_ticket_release_at(e.id)
         - make_interval(days => s.hold_limit_days - s.default_rule_margin_days)
    from public.events e, public.dec107_settings s where e.id = p_event and s.id;
$function$;

-- dec107_release_sweep: 1 reviewed replacement(s) on the live definition
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
          when pr2.sale_kind in ('ticket_sale','ticket_resale','merch') then public.dec107_ticket_release_at(e.id)
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
end $function$;

-- guard_resale_original_payer: 1 reviewed replacement(s) on the live definition
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
   or o.refund_status<>'none' or o.stripe_session is null or upper(o.currency) is distinct from public.event_checkout_currency(o.event_id) then
   raise exception 'original_payment_required' using errcode='22023';
  end if;
  if new.status='resold' and (not exists(select 1 from public.resale_holds where ticket_id=old.id and expires_at>now())
    or not exists(select 1 from public.events where id=old.event_id and status in ('published','on_sale') and starts_at>now())) then
   raise exception 'seat_unavailable' using errcode='23P01';
  end if;
 end if;
 return new;
end $function$;

-- guard_resale_reservation_payer: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.guard_resale_reservation_payer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.tickets t join public.checkout_orders o on o.order_ref=t.order_ref
  where t.id=new.ticket_id and o.buyer_id=t.holder_id and o.status='issued' and o.refund_status='none' and o.stripe_session is not null and upper(o.currency)=public.event_checkout_currency(o.event_id)) then
  raise exception 'original_payment_required' using errcode='22023';
 end if;
 return new;
end $function$;

-- resale_listings: 1 reviewed replacement(s) on the live definition
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
 join public.checkout_orders o on o.order_ref = t.order_ref and o.buyer_id = t.holder_id and o.status = 'issued' and o.refund_status = 'none' and o.stripe_session is not null and upper(o.currency) = public.event_checkout_currency(o.event_id)
 left join lateral (select value from public.platform_settings where section = 'ticketing' and status = 'published' order by version desc limit 1) s on true
 left join lateral (select * from public.resale_policy_for(p_event)) p on true
 left join public.ticket_resale_listings l on l.ticket_id = t.id and l.status = 'listed'
 where t.event_id = p_event and t.status = 'resale_listed' and e.visibility = 'public' and e.status in ('published', 'on_sale') and e.starts_at > now()
 and coalesce(e.settings->>'resale', 'true') <> 'false' and coalesce(s.value->>'resale_enabled', 'true') <> 'false'
 and t.price_paid > 0 and t.price_paid <= coalesce(t.face_value, tt.price) * coalesce(p.price_cap_pct, (s.value->>'resale_cap_pct')::numeric, 100) / 100
 and not exists (select 1 from public.resale_holds h where h.ticket_id = t.id and h.expires_at > now())
$function$;

-- dec107_release_paid: 3 reviewed replacement(s) on the live definition
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
    update public.payout_releases set status = 'paid_out', amount_minor = (it->>'amount_minor')::bigint,
      settlement_currency = coalesce(public.dec107_settlement_currency(it->>'currency'), settlement_currency, currency), stripe_payout_id = p_payout, payout_group = p_group,
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
        values (pr.source_type, pr.source_ref, 'reserve', pr.workspace_id, pr.stripe_account_id, pr.payment_intent, pr.event_id, pr.sale_kind, coalesce(public.dec107_settlement_currency(it->>'currency'), pr.currency), pr.livemode,
          pr.charged_at, pr.hold_limit_at, least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at), 'reserve_end',
          it->>'reserve_kind', (it->>'reserve_bps')::integer, (it->>'reserve_minor')::bigint,
          least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at), s.payment_terms_version)
        on conflict (source_type, source_ref, part) do nothing;
    end if;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', pr.workspace_id, 'payout.released',
      jsonb_build_object('release', pr.id, 'source', pr.source_type || ':' || pr.source_ref, 'event_id', pr.event_id, 'trigger', pr.trigger, 'payout', p_payout,
        'amount_minor', (it->>'amount_minor')::bigint, 'reserve_minor', (it->>'reserve_minor')::bigint,
        'currency', coalesce(public.dec107_settlement_currency(it->>'currency'), pr.currency), 'charge_currency', pr.currency));
    n := n + 1;
  end loop;
  return n;
end $function$;

-- customer_accept_quote: 2 reviewed replacement(s) on the live definition
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
    values (e.workspace_id, e.id, 'payment', b.category, 'Deposit — ' || b.title, dep, 'completed', 'marketplace', 'build_item', b.id, now(), public.booking_charge_currency(b.id), b.title, nullif(left(coalesce(p_payment_ref, ''), 120), ''));
  update public.provider_jobs set payment_status = 'deposit_paid', paid_amount = dep where build_item_id = b.id;
  if b.request_id is not null then update public.provider_requests set status = 'closed' where id = b.request_id; end if;
  if owner is not null then
    insert into public.notifications(user_id, kind, title, body, link)
      values (owner, 'booking_confirmed', 'Quote accepted: ' || e.name, 'Deposit of ' || public.fmt_money(dep, public.booking_charge_currency(b.id)) || ' received', '/provider/opportunities/' || b.id);
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), ws, 'quote.accepted', jsonb_build_object('build_item_id', b.id, 'deposit', dep, 'balance', bal));
end $function$;

-- i18n_quote_currency: 1 reviewed replacement(s) on the live definition
CREATE OR REPLACE FUNCTION public.i18n_quote_currency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c text;
begin
  -- Q76 (owner decision O2): bookings charge in the SELLER's currency (earlier quote for the item → listing → seller workspace).
  if new.build_item_id is not null then c := public.booking_charge_currency(new.build_item_id); end if;
  if c ~ '^[A-Z]{3}$' then new.currency := c; end if;
  return new;
end $function$;

