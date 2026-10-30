-- Q20 Ticket Configuration / Inventory / Checkout (backend domains 92–95). Lane D, 2026-10-29.
-- Additive and backward-compatible with the deployed checkout (src/app/checkout/[event]/actions.ts, /api/checkout/session,
-- src/lib/checkout.ts): every existing RPC keeps its signature and its behaviour for events without the new configuration.
--   1. Tier / release configuration: release kind (presale, early bird, general, final), access-code-only tiers,
--      per-customer limits, minimum per order. Release chains already exist (after_tier + ticket_tier_open_dependants).
--   2. Reserved inventory: ticket_allocations (promoter / accessible / guest / comp / vip / partner / hold) carved out of a
--      tier's public availability; drawn only through an access code bound to the allocation.
--   3. Promo + access codes: purpose, stacking, per-customer limits, tier scope; applications per checkout token;
--      redemptions reserved atomically when the order is created (max_uses can't be exceeded under concurrency).
--   4. Server-computed quote in pence (checkout_quote): lines, discounts, booking fee, VAT, seller commission. The order
--      insert is checked against it (no client amounts) and snapshots it.
--   5. Ticket Order state machine on checkout_orders.order_state (draft → inventory_held → payment_pending → paid → issued;
--      expired / failed / cancelled / refund_pending / refunded / partially_refunded / chargeback branches). Legacy status
--      writes are mirrored by a sync trigger that never blocks a deployed writer; explicit commands are enforced.
--   6. Hold expiry sweep every minute (holds were only expired lazily on the next reservation).

-- ── 1. Tier / release configuration ─────────────────────────────────────────────────────────────────────────────────
alter table public.ticket_tiers
  add column if not exists release_kind text not null default 'standard',
  add column if not exists access_code_required boolean not null default false,
  add column if not exists per_customer_limit integer,
  add column if not exists min_per_order integer not null default 1;
alter table public.ticket_tiers drop constraint if exists ticket_tiers_release_kind_check;
alter table public.ticket_tiers add constraint ticket_tiers_release_kind_check check (release_kind in ('standard', 'presale', 'early_bird', 'general', 'final'));
alter table public.ticket_tiers drop constraint if exists ticket_tiers_per_customer_limit_check;
alter table public.ticket_tiers add constraint ticket_tiers_per_customer_limit_check check (per_customer_limit is null or per_customer_limit between 1 and 100);
alter table public.ticket_tiers drop constraint if exists ticket_tiers_min_per_order_check;
alter table public.ticket_tiers add constraint ticket_tiers_min_per_order_check check (min_per_order between 1 and 100);

-- ── 2. Reserved inventory ───────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.ticket_allocations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  kind text not null check (kind in ('promoter', 'accessible', 'guest', 'comp', 'vip', 'partner', 'hold')),
  promoter_id uuid references public.promoters(id) on delete set null,
  label text not null default '' check (length(label) <= 80),
  quantity integer not null check (quantity between 0 and 1000000),
  status text not null default 'active' check (status in ('active', 'released')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ticket_allocations_tier_idx on public.ticket_allocations(tier_id) where status = 'active';
create index if not exists ticket_allocations_event_idx on public.ticket_allocations(event_id);
alter table public.ticket_allocations enable row level security;
drop policy if exists ticket_allocations_select on public.ticket_allocations;
create policy ticket_allocations_select on public.ticket_allocations for select to authenticated using (public.can_access_event(event_id) or public.has_admin_permission('tickets'));
drop policy if exists ticket_allocations_insert on public.ticket_allocations;
create policy ticket_allocations_insert on public.ticket_allocations for insert to authenticated with check (public.can_access_event(event_id));
drop policy if exists ticket_allocations_update on public.ticket_allocations;
create policy ticket_allocations_update on public.ticket_allocations for update to authenticated using (public.can_access_event(event_id)) with check (public.can_access_event(event_id));
drop policy if exists ticket_allocations_delete on public.ticket_allocations;
create policy ticket_allocations_delete on public.ticket_allocations for delete to authenticated using (public.can_access_event(event_id));
revoke all on public.ticket_allocations from anon;
grant select, insert, update, delete on public.ticket_allocations to authenticated;
grant all on public.ticket_allocations to service_role;

alter table public.ticket_holds add column if not exists allocation_id uuid references public.ticket_allocations(id) on delete set null;
alter table public.ticket_holds add column if not exists code_id uuid;
alter table public.tickets add column if not exists allocation_id uuid references public.ticket_allocations(id) on delete set null;
create index if not exists tickets_allocation_idx on public.tickets(allocation_id) where allocation_id is not null;
create index if not exists ticket_holds_allocation_idx on public.ticket_holds(allocation_id) where allocation_id is not null;

-- Units of an allocation in use: live holds + issued entitlements that still occupy a place (a transferred/resold row keeps
-- counting; its successor row carries no allocation, so a unit is never counted twice).
create or replace function public.ticket_allocation_used(p_allocation uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select (coalesce((select sum(h.qty) from public.ticket_holds h where h.allocation_id = p_allocation and h.expires_at > now()), 0)
    + (select count(*) from public.tickets t where t.allocation_id = p_allocation and t.status not in ('refunded', 'cancelled', 'void')))::int
$$;

-- Unused reserved units on a tier: excluded from public availability.
create or replace function public.ticket_tier_reserved(p_tier uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(greatest(0, a.quantity - public.ticket_allocation_used(a.id))), 0)::int
  from public.ticket_allocations a where a.tier_id = p_tier and a.status = 'active'
$$;

create or replace function public.ticket_allocations_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.ticket_tiers; total int;
begin
  select * into t from public.ticket_tiers where id = new.tier_id for update;
  if not found or t.event_id <> new.event_id then raise exception 'tier_not_in_event' using errcode = '22023'; end if;
  if new.kind = 'promoter' and new.promoter_id is not null and not exists(select 1 from public.promoters p where p.id = new.promoter_id and p.event_id = new.event_id) then
    raise exception 'promoter_not_in_event' using errcode = '22023';
  end if;
  select coalesce(sum(quantity), 0) into total from public.ticket_allocations where tier_id = new.tier_id and status = 'active' and id <> new.id;
  if new.status = 'active' and total + new.quantity > t.quantity then raise exception 'allocation_exceeds_inventory' using errcode = '22023'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ticket_allocations_guard on public.ticket_allocations;
create trigger ticket_allocations_guard before insert or update on public.ticket_allocations for each row execute function public.ticket_allocations_guard();

-- ── 3. Promo + access codes ─────────────────────────────────────────────────────────────────────────────────────────
alter table public.discount_codes
  add column if not exists purpose text not null default 'discount',
  add column if not exists per_customer_limit integer,
  add column if not exists stackable boolean not null default false,
  add column if not exists tier_ids uuid[],
  add column if not exists allocation_id uuid references public.ticket_allocations(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();
alter table public.discount_codes drop constraint if exists discount_codes_purpose_check;
alter table public.discount_codes add constraint discount_codes_purpose_check check (purpose in ('discount', 'access'));
alter table public.discount_codes drop constraint if exists discount_codes_per_customer_limit_check;
alter table public.discount_codes add constraint discount_codes_per_customer_limit_check check (per_customer_limit is null or per_customer_limit >= 1);
-- Access codes carry no discount; discount codes still need a positive amount (the existing rule).
alter table public.discount_codes drop constraint if exists discount_codes_amount_check;
alter table public.discount_codes add constraint discount_codes_amount_check check (purpose = 'access' or amount > 0);

create table if not exists public.checkout_code_applications (
  token text not null check (length(token) between 16 and 128),
  event_id uuid not null references public.events(id) on delete cascade,
  code_id uuid not null references public.discount_codes(id) on delete cascade,
  buyer_id uuid,
  applied_at timestamptz not null default now(),
  primary key (token, code_id)
);
create index if not exists checkout_code_applications_applied_idx on public.checkout_code_applications(applied_at);
alter table public.checkout_code_applications enable row level security;
revoke all on public.checkout_code_applications from anon, authenticated;
grant all on public.checkout_code_applications to service_role;

create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.discount_codes(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  order_ref text not null references public.checkout_orders(order_ref) on delete cascade,
  buyer_id uuid,
  qty integer not null default 0,
  discount_minor bigint not null default 0,
  status text not null default 'reserved' check (status in ('reserved', 'redeemed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code_id, order_ref)
);
create index if not exists discount_redemptions_code_idx on public.discount_redemptions(code_id) where status <> 'released';
alter table public.discount_redemptions enable row level security;
drop policy if exists discount_redemptions_select on public.discount_redemptions;
create policy discount_redemptions_select on public.discount_redemptions for select to authenticated using (public.can_access_event(event_id) or public.has_admin_permission('commerce'));
revoke all on public.discount_redemptions from anon, authenticated;
grant select on public.discount_redemptions to authenticated;
grant all on public.discount_redemptions to service_role;

-- A code is usable when it's active (or its scheduled start has passed) and inside its window.
create or replace function public.discount_code_live(p_code public.discount_codes)
returns boolean language sql stable set search_path = '' as $$
  select p_code.status in ('active', 'scheduled') and (p_code.valid_from is null or p_code.valid_from <= now()) and (p_code.valid_until is null or p_code.valid_until > now())
$$;

-- Applies a promo / access code to a checkout token (service-only: the server action rate-limits and passes the signed-in buyer).
create or replace function public.checkout_apply_code(p_event uuid, p_token text, p_code text, p_buyer uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.discount_codes; used int; mine int;
begin
  if length(coalesce(p_token, '')) < 16 then return jsonb_build_object('ok', false, 'error', 'invalid_token'); end if;
  select * into d from public.discount_codes where event_id = p_event and code = upper(btrim(coalesce(p_code, '')));
  -- Unknown, disabled and out-of-window codes give the same answer (no code enumeration).
  if not found or not public.discount_code_live(d) then return jsonb_build_object('ok', false, 'error', 'code_invalid'); end if;
  if exists(select 1 from public.checkout_code_applications where token = p_token and code_id = d.id) then
    return jsonb_build_object('ok', true, 'code', d.code, 'purpose', d.purpose, 'kind', d.kind, 'amount', d.amount, 'already', true);
  end if;
  select count(*) into used from public.discount_redemptions where code_id = d.id and status <> 'released';
  if d.max_uses is not null and used >= d.max_uses then return jsonb_build_object('ok', false, 'error', 'code_exhausted'); end if;
  if p_buyer is not null and d.per_customer_limit is not null then
    select count(*) into mine from public.discount_redemptions where code_id = d.id and buyer_id = p_buyer and status <> 'released';
    if mine >= d.per_customer_limit then return jsonb_build_object('ok', false, 'error', 'code_customer_limit'); end if;
  end if;
  -- Stacking: two discount codes combine only when both are stackable. Access codes always combine.
  if d.purpose = 'discount' and exists(select 1 from public.checkout_code_applications a join public.discount_codes x on x.id = a.code_id
      where a.token = p_token and a.event_id = p_event and x.purpose = 'discount' and not (x.stackable and d.stackable)) then
    return jsonb_build_object('ok', false, 'error', 'code_not_stackable');
  end if;
  insert into public.checkout_code_applications(token, event_id, code_id, buyer_id) values (p_token, p_event, d.id, p_buyer) on conflict do nothing;
  return jsonb_build_object('ok', true, 'code', d.code, 'purpose', d.purpose, 'kind', d.kind, 'amount', d.amount);
end $$;

create or replace function public.checkout_remove_code(p_event uuid, p_token text, p_code text)
returns integer language sql security definer set search_path = '' as $$
  with gone as (delete from public.checkout_code_applications a using public.discount_codes d
    where a.code_id = d.id and a.token = p_token and a.event_id = p_event and d.code = upper(btrim(coalesce(p_code, ''))) returning 1)
  select count(*)::int from gone
$$;

-- ── Reservation RPCs (same signatures as deployed) ──────────────────────────────────────────────────────────────────
-- GA holds: the tier row lock serialises every reservation for a tier, so the availability check and the increment are
-- atomic (plus the sold + held <= quantity CHECK). New: access-code-only tiers, minimum per order, reserved allocations.
create or replace function public.hold_tickets(p_event uuid, p_items jsonb, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ev public.events; it record; t public.ticket_tiers; exp timestamptz := now() + interval '10 minutes'; total int := 0;
  v_code uuid; v_alloc uuid; v_left int;
begin
  if length(coalesce(p_token, '')) < 16 then raise exception 'invalid_token' using errcode = '22023'; end if;
  select * into ev from public.events where id = p_event;
  if not found or not (ev.visibility = 'public' and ev.status in ('on_sale','live','published')) then raise exception 'not_on_sale' using errcode = '22023'; end if;
  perform public.expire_checkout_holds();
  for it in select tier_id, qty from public.ticket_holds where token = p_token loop
    update public.ticket_tiers set held = greatest(0, held - it.qty) where id = it.tier_id;
  end loop;
  delete from public.ticket_holds where token = p_token;
  for it in select (x->>'tier')::uuid tier, (x->>'qty')::int qty from jsonb_array_elements(coalesce(p_items, '[]')) x loop
    if it.qty is null or it.qty < 1 then continue; end if;
    select * into t from public.ticket_tiers where id = it.tier and event_id = p_event for update;
    if not found then raise exception 'tier_not_found' using errcode = 'P0002'; end if;
    if t.status <> 'on_sale' or (t.sale_start is not null and t.sale_start > now()) or (t.sale_end is not null and t.sale_end < now()) then raise exception 'not_on_sale' using errcode = '22023'; end if;
    if exists(select 1 from public.event_seats s where s.tier_id = t.id) then raise exception 'seated_tier' using errcode = '22023'; end if;
    if it.qty > t.order_limit then raise exception 'order_limit' using errcode = '22023'; end if;
    if it.qty < coalesce(t.min_per_order, 1) then raise exception 'below_minimum' using errcode = '22023'; end if;
    -- An access code applied to this checkout may unlock the tier and/or draw on a reserved allocation of it.
    v_code := null; v_alloc := null;
    select d.id, d.allocation_id into v_code, v_alloc
      from public.checkout_code_applications a join public.discount_codes d on d.id = a.code_id
      left join public.ticket_allocations x on x.id = d.allocation_id
      where a.token = p_token and a.event_id = p_event and d.purpose = 'access' and public.discount_code_live(d)
        and (d.tier_ids is null or t.id = any(d.tier_ids))
        and (d.allocation_id is null or (x.tier_id = t.id and x.status = 'active'))
      order by (d.allocation_id is not null) desc, a.applied_at limit 1;
    if t.access_code_required and v_code is null then raise exception 'access_code_required' using errcode = '22023'; end if;
    if v_alloc is not null then
      select quantity into v_left from public.ticket_allocations where id = v_alloc for update;
      v_left := v_left - public.ticket_allocation_used(v_alloc);
      if it.qty > v_left then raise exception 'allocation_exhausted' using errcode = '22023'; end if;
      if t.sold + t.held + it.qty > t.quantity then raise exception 'sold_out' using errcode = '22023'; end if;
    elsif t.sold + t.held + it.qty + public.ticket_tier_reserved(t.id) > t.quantity then
      raise exception 'sold_out' using errcode = '22023';
    end if;
    update public.ticket_tiers set held = held + it.qty where id = t.id;
    insert into public.ticket_holds(token, event_id, tier_id, qty, expires_at, allocation_id, code_id) values (p_token, p_event, t.id, it.qty, exp, v_alloc, v_code);
    total := total + it.qty;
  end loop;
  -- Keep seat holds (if any) on the same expiry.
  update public.event_seats set hold_expires_at = exp where hold_token = p_token and status = 'held';
  return jsonb_build_object('held', total, 'expires_at', exp);
end $$;

-- Seat holds: SKIP LOCKED pick + exact count. New: the tier's sale window and access-code rule apply to seats too.
create or replace function public.hold_seats(p_event uuid, p_keys text[], p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare want int := coalesce(array_length(p_keys, 1), 0); got int; ev public.events; r record; exp timestamptz := now() + interval '10 minutes';
begin
  if want = 0 or want > 20 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  if length(coalesce(p_token, '')) < 16 then raise exception 'invalid_token' using errcode = '22023'; end if;
  select * into ev from public.events where id = p_event;
  if not found or not (ev.visibility = 'public' and ev.status in ('on_sale','live','published')) then raise exception 'not_on_sale' using errcode = '22023'; end if;
  perform public.expire_seat_holds(p_event);
  -- Re-holding with the same token replaces the previous selection.
  perform public.release_seat_holds(p_token);
  if exists(select 1 from public.event_seats s join public.ticket_tiers t on t.id = s.tier_id where s.event_id = p_event and s.seat_key = any(p_keys)
      and (t.status <> 'on_sale' or (t.sale_start is not null and t.sale_start > now()) or (t.sale_end is not null and t.sale_end < now()))) then
    raise exception 'not_on_sale' using errcode = '22023';
  end if;
  if exists(select 1 from public.event_seats s where s.event_id = p_event and s.seat_key = any(p_keys) and s.tier_id is null) then raise exception 'seat_not_ticketed' using errcode = '22023'; end if;
  if exists(select 1 from public.event_seats s join public.ticket_tiers t on t.id = s.tier_id where s.event_id = p_event and s.seat_key = any(p_keys) and t.access_code_required
      and not exists(select 1 from public.checkout_code_applications a join public.discount_codes d on d.id = a.code_id
        where a.token = p_token and a.event_id = p_event and d.purpose = 'access' and public.discount_code_live(d) and (d.tier_ids is null or t.id = any(d.tier_ids)))) then
    raise exception 'access_code_required' using errcode = '22023';
  end if;
  with picked as (
    select seat_key from public.event_seats where event_id = p_event and seat_key = any(p_keys) and status = 'available' for update skip locked
  ) update public.event_seats s set status = 'held', hold_token = p_token, hold_expires_at = exp, updated_at = now()
    from picked where s.event_id = p_event and s.seat_key = picked.seat_key;
  get diagnostics got = row_count;
  if got <> want then raise exception 'seat_unavailable' using errcode = '23P01'; end if;
  for r in select tier_id, count(*) c from public.event_seats where hold_token = p_token group by tier_id loop
    update public.ticket_tiers set held = held + r.c::int where id = r.tier_id; -- check (sold + held <= quantity) refuses oversell
  end loop;
  return jsonb_build_object('held', got, 'expires_at', exp);
end $$;

-- Issuance: GA entitlements remember the allocation they were drawn from, and a tier is marked sold_out only by actual sales
-- (it used to count live holds too, so a tier whose remaining holds lapsed stayed sold out and opened the next release early).
create or replace function public.issue_checkout(p_token text, p_order_ref text, p_attendee text, p_holder uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare h record; t public.ticket_tiers; i int; n int := 0;
begin
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then return (select count(*) from public.tickets where order_ref = p_order_ref); end if;
  if not exists(select 1 from public.ticket_holds where token = p_token) and not exists(select 1 from public.event_seats where hold_token = p_token and status = 'held') then
    raise exception 'hold_expired' using errcode = '22023';
  end if;
  if exists(select 1 from public.event_seats where hold_token = p_token and status = 'held') then
    perform public.issue_seated_tickets(p_token, p_order_ref, p_attendee, p_holder);
  end if;
  for h in select * from public.ticket_holds where token = p_token for update loop
    select * into t from public.ticket_tiers where id = h.tier_id for update;
    update public.ticket_tiers set held = greatest(0, held - h.qty), sold = sold + h.qty,
      status = case when sold + h.qty >= quantity and status = 'on_sale' then 'sold_out' else status end where id = t.id;
    for i in 1..h.qty loop
      insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, price_paid, allocation_id)
        values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), h.event_id, t.id, p_holder, coalesce(p_attendee, ''), p_order_ref, t.price, h.allocation_id);
    end loop;
  end loop;
  delete from public.ticket_holds where token = p_token;
  select count(*) into n from public.tickets where order_ref = p_order_ref;
  update public.checkout_orders set status = 'issued', updated_at = now() where order_ref = p_order_ref;
  return n;
end $$;

create or replace function public.issue_seated_tickets(p_token text, p_order_ref text, p_attendee text, p_holder uuid)
returns setof public.tickets language plpgsql security definer set search_path = '' as $$
declare s record; t public.ticket_tiers; tk public.tickets;
begin
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then return query select * from public.tickets where order_ref = p_order_ref; return; end if;
  if not exists(select 1 from public.event_seats where hold_token = p_token and status = 'held') then raise exception 'hold_expired' using errcode = '22023'; end if;
  for s in select * from public.event_seats where hold_token = p_token and status = 'held' order by seat_key for update loop
    select * into t from public.ticket_tiers where id = s.tier_id for update;
    update public.ticket_tiers set held = greatest(0, held - 1), sold = sold + 1, status = case when sold + 1 >= quantity and status = 'on_sale' then 'sold_out' else status end where id = t.id;
    insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, seat, price_paid)
      values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), s.event_id, t.id, p_holder, coalesce(p_attendee, ''), p_order_ref, s.label, t.price)
      returning * into tk;
    update public.event_seats set status = 'sold', hold_token = null, hold_expires_at = null, ticket_id = tk.id, updated_at = now() where event_id = s.event_id and seat_key = s.seat_key;
    return next tk;
  end loop;
end $$;
revoke all on function public.issue_seated_tickets(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.issue_seated_tickets(text, text, text, uuid) to service_role;

-- ── 4. Server-computed quote (pence)────────────────────────────────────────────────────────────────────────────────
-- Prices exactly what the database holds for this token. Discount rules: percent codes take a percentage off each eligible
-- ticket; amount codes take that amount off each eligible ticket (never below zero); stackable codes apply percent first.
-- Codes never apply to resale. Booking fee per paid ticket = fixed + pct of the price paid (commerce.ticket_fee); VAT per
-- commerce.vat (inclusive by default). Seller commission (primary only) is deducted from the organiser, never added.
create or replace function public.checkout_quote(p_event uuid, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
  return jsonb_build_object('kind', k, 'currency', 'GBP', 'lines', lines, 'codes', case when k = 'resale' then '[]'::jsonb else codes end,
    'gross_minor', gross, 'discount_minor', disc, 'subtotal_minor', gross - disc,
    'fee_minor', fee_minor, 'fee_vat_minor', fee_vat, 'fee_total_minor', fee_minor + case when incl then 0 else fee_vat end,
    'commission_minor', case when k = 'resale' then 0 else round((gross - disc) * seller_bps / 10000.0)::bigint end,
    'total_minor', gross - disc + fee_minor, 'payable_minor', gross - disc + fee_minor + case when incl then 0 else fee_vat end,
    'expires_at', exp, 'quoted_at', now(),
    'fee_rule', jsonb_build_object('fixed_minor', fixed_minor, 'pct_bps', pct, 'seller_bps', seller_bps, 'vat_rate_bps', public.vat_rate_bps(), 'vat_inclusive', incl));
end $$;

alter table public.checkout_orders
  add column if not exists order_state text,
  add column if not exists subtotal_minor bigint,
  add column if not exists discount_minor bigint,
  add column if not exists fee_minor bigint,
  add column if not exists total_minor bigint,
  add column if not exists quote_snapshot jsonb,
  add column if not exists code_ids uuid[];

-- Order creation is checked against the quote: the amount must equal the DB-computed subtotal for the held inventory, and
-- per-customer tier limits apply. Orders without live inventory under their token (historic imports, fixtures) are left alone.
create or replace function public.checkout_order_quote_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q jsonb; l jsonb; lim int; have int;
begin
  q := public.checkout_quote(new.event_id, new.token);
  if jsonb_array_length(q->'lines') = 0 then return new; end if;
  if round(coalesce(new.amount, 0) * 100) <> (q->>'subtotal_minor')::bigint then raise exception 'quote_mismatch' using errcode = '22023'; end if;
  if new.buyer_id is not null and q->>'kind' = 'primary' then
    for l in select * from jsonb_array_elements(q->'lines') loop
      select per_customer_limit into lim from public.ticket_tiers where id = (l->>'tier_id')::uuid;
      if lim is null then continue; end if;
      select count(*) into have from public.tickets t join public.checkout_orders o on o.order_ref = t.order_ref
        where o.buyer_id = new.buyer_id and t.tier_id = (l->>'tier_id')::uuid and t.status not in ('refunded', 'cancelled', 'void');
      if have + (l->>'qty')::int > lim then raise exception 'customer_limit' using errcode = '22023'; end if;
    end loop;
  end if;
  new.subtotal_minor := (q->>'subtotal_minor')::bigint; new.discount_minor := (q->>'discount_minor')::bigint;
  new.fee_minor := round(coalesce(new.fee, 0) * 100)::bigint;              -- after the VAT trigger: what the buyer pays as fee
  new.total_minor := new.subtotal_minor + new.fee_minor;
  new.quote_snapshot := q;
  new.code_ids := array(select (c->>'id')::uuid from jsonb_array_elements(q->'codes') c);
  return new;
end $$;
drop trigger if exists checkout_orders_quote_guard on public.checkout_orders;
create trigger checkout_orders_quote_guard before insert on public.checkout_orders for each row execute function public.checkout_order_quote_guard();

-- Redemptions are reserved with the order, under the code row lock: concurrent buyers can't exceed max_uses / per-customer.
create or replace function public.checkout_order_reserve_codes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid; d public.discount_codes; used int; mine int; q int; dm bigint;
begin
  if new.code_ids is null or cardinality(new.code_ids) = 0 then return null; end if;
  foreach cid in array new.code_ids loop
    select * into d from public.discount_codes where id = cid for update;
    if not found then continue; end if;
    select count(*) into used from public.discount_redemptions where code_id = cid and status <> 'released';
    if d.max_uses is not null and used >= d.max_uses then raise exception 'code_exhausted' using errcode = '22023'; end if;
    if new.buyer_id is not null and d.per_customer_limit is not null then
      select count(*) into mine from public.discount_redemptions where code_id = cid and buyer_id = new.buyer_id and status <> 'released';
      if mine >= d.per_customer_limit then raise exception 'code_customer_limit' using errcode = '22023'; end if;
    end if;
    select coalesce(sum((l->>'qty')::int), 0), coalesce(sum((l->>'qty')::bigint * (l->>'discount_minor')::bigint), 0) into q, dm from jsonb_array_elements(new.quote_snapshot->'lines') l;
    insert into public.discount_redemptions(code_id, event_id, order_ref, buyer_id, qty, discount_minor)
      values (cid, new.event_id, new.order_ref, new.buyer_id, q, case when d.purpose = 'discount' then dm else 0 end) on conflict (code_id, order_ref) do nothing;
  end loop;
  return null;
end $$;
drop trigger if exists checkout_orders_reserve_codes on public.checkout_orders;
create trigger checkout_orders_reserve_codes after insert on public.checkout_orders for each row execute function public.checkout_order_reserve_codes();

-- ── 5. Ticket Order state machine ───────────────────────────────────────────────────────────────────────────────────
-- Derived from the legacy columns the deployed code writes (status / refund_status / stripe_session).
create or replace function public.checkout_order_derived_state(p_status text, p_refund text, p_session text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_status = 'refunded' or p_refund = 'refunded' then 'refunded'
    when p_refund in ('due', 'processing', 'failed') then 'refund_pending'
    when p_refund = 'not_required' and p_status in ('paid', 'issued') then 'cancelled'
    when p_status = 'issued' then 'issued'
    when p_status = 'paid' then 'paid'
    when p_status = 'failed' then 'failed'
    when p_status = 'expired' then 'expired'
    when p_status = 'pending' and p_session is not null then 'payment_pending'
    else 'inventory_held' end
$$;

update public.checkout_orders set order_state = public.checkout_order_derived_state(status, refund_status, stripe_session) where order_state is null;
alter table public.checkout_orders drop constraint if exists checkout_orders_order_state_check;
alter table public.checkout_orders add constraint checkout_orders_order_state_check check (order_state is null or order_state in
  ('draft', 'inventory_held', 'payment_pending', 'paid', 'issued', 'expired', 'failed', 'cancelled', 'refund_pending', 'refunded', 'partially_refunded', 'chargeback'));
create index if not exists checkout_orders_state_idx on public.checkout_orders(order_state, created_at);

-- Mirrors legacy status writes into order_state. A legacy write the machine doesn't allow is recorded in state_violations
-- and the order_state is left as it was: a deployed writer is never blocked. Explicit order_state writes (commands) are left
-- to the enforce-mode guard (checkout_orders_state_guard, generated from src/lib/domain/state-machines.ts).
create or replace function public.checkout_order_lifecycle_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target text := public.checkout_order_derived_state(new.status, new.refund_status, new.stripe_session);
begin
  if TG_OP = 'INSERT' then new.order_state := coalesce(new.order_state, target); return new; end if;
  if new.order_state is distinct from old.order_state then return new; end if;
  if old.order_state is null then new.order_state := target; return new; end if;
  if target = old.order_state then return new; end if;
  -- A refund that was queued and then withdrawn, or late legacy writes, only move forward when the machine allows it.
  if public.state_transition_allowed('ticket_order', old.order_state, target) then
    new.order_state := target;
  else
    insert into public.state_violations(machine, table_name, row_id, from_state, to_state, actor_id)
      values ('ticket_order', 'checkout_orders', new.order_ref, old.order_state, target, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists checkout_orders_lifecycle_sync on public.checkout_orders;
create trigger checkout_orders_lifecycle_sync before insert or update of status, refund_status, stripe_session, order_state on public.checkout_orders
  for each row execute function public.checkout_order_lifecycle_sync();

-- After a state change: settle code redemptions and emit ticket_order.state_changed (same transaction).
create or replace function public.checkout_order_lifecycle_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ws uuid; n int;
begin
  if TG_OP = 'UPDATE' and new.order_state is not distinct from old.order_state then return null; end if;
  if new.order_state = 'issued' then
    with r as (update public.discount_redemptions set status = 'redeemed', updated_at = now() where order_ref = new.order_ref and status = 'reserved' returning code_id)
    update public.discount_codes d set used = d.used + x.n from (select code_id, count(*)::int n from r group by code_id) x where d.id = x.code_id;
  elsif new.order_state in ('expired', 'failed', 'cancelled') then
    update public.discount_redemptions set status = 'released', updated_at = now() where order_ref = new.order_ref and status = 'reserved';
  end if;
  ws := coalesce(new.seller_workspace_id, (select workspace_id from public.events where id = new.event_id));
  perform public.emit_domain_event('ticket_order.state_changed', ws,
    jsonb_build_object('order_ref', new.order_ref, 'event_id', new.event_id, 'from', case when TG_OP = 'UPDATE' then old.order_state end, 'to', new.order_state, 'kind', new.kind),
    auth.uid(), case when auth.uid() is null then 'system' else 'user' end, 'ticket_order', new.order_ref, null, null);
  return null;
end $$;
drop trigger if exists checkout_orders_lifecycle_after on public.checkout_orders;
create trigger checkout_orders_lifecycle_after after insert or update of status, refund_status, stripe_session, order_state on public.checkout_orders
  for each row execute function public.checkout_order_lifecycle_after();

-- Explicit command (service-only): compare-and-set on order_state; cancelling/expiring an unpaid order releases its
-- inventory when it's still the token's latest order. Paid orders are cancelled through the refund path, not here.
create or replace function public.ticket_order_transition(p_ref text, p_to text, p_expected text default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.checkout_orders; released int := 0;
begin
  select * into o from public.checkout_orders where order_ref = p_ref for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_expected is not null and o.order_state is distinct from p_expected then return jsonb_build_object('ok', false, 'conflict', true, 'current', o.order_state); end if;
  if o.order_state = p_to then return jsonb_build_object('ok', true, 'changed', false, 'state', p_to); end if;
  if not public.state_transition_allowed('ticket_order', o.order_state, p_to) then
    raise exception 'illegal ticket_order transition % -> %', coalesce(o.order_state, '(none)'), p_to using errcode = '22023';
  end if;
  update public.checkout_orders set order_state = p_to,
    status = case when p_to in ('cancelled', 'expired') and status = 'pending' then 'expired' else status end, updated_at = now()
    where order_ref = p_ref;
  if p_to in ('cancelled', 'expired') and o.status = 'pending'
     and not exists(select 1 from public.checkout_orders x where x.token = o.token and x.created_at > o.created_at) then
    released := public.release_checkout(o.token);
  end if;
  insert into public.audit_events(actor_type, actor_id, workspace_id, event, metadata)
    values (case when auth.uid() is null then 'system' else 'user' end, auth.uid(), o.seller_workspace_id, 'ticket_order.transition',
      jsonb_build_object('order_ref', p_ref, 'from', o.order_state, 'to', p_to, 'reason', p_reason, 'released', released));
  return jsonb_build_object('ok', true, 'changed', true, 'from', o.order_state, 'to', p_to, 'released', released);
end $$;

-- ── 6. Hold / order expiry sweep (every minute) ─────────────────────────────────────────────────────────────────────
-- Releases lapsed holds, then expires unpaid orders that no longer hold inventory. Only recent orders are swept: historic
-- rows are left for reconciliation. A late payment for an expired order is still refunded by finalise() (hold_expired).
create or replace function public.ticket_inventory_sweep()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare holds int; orders int; codes int;
begin
  holds := public.expire_checkout_holds();
  perform public.expire_resale_holds_internal();
  with x as (
    update public.checkout_orders o set status = 'expired', updated_at = now()
    where o.status = 'pending' and o.refund_status = 'none' and o.created_at > now() - interval '2 days'
      and o.created_at < now() - case when o.stripe_session is null then interval '15 minutes' else interval '3 hours' end
      and not exists(select 1 from public.ticket_holds h where h.token = o.token and h.expires_at > now())
      and not exists(select 1 from public.event_seats s where s.hold_token = o.token and s.status = 'held' and s.hold_expires_at > now())
      and not exists(select 1 from public.resale_holds r where r.token = o.token and r.expires_at > now())
    returning 1)
  select count(*) into orders from x;
  -- Code applications on abandoned tokens (no order, older than a day).
  with y as (delete from public.checkout_code_applications a where a.applied_at < now() - interval '1 day'
    and not exists(select 1 from public.checkout_orders o where o.token = a.token and o.order_state in ('inventory_held', 'payment_pending')) returning 1)
  select count(*) into codes from y;
  return jsonb_build_object('holds_released', holds, 'orders_expired', orders, 'code_applications_purged', codes);
end $$;

-- Resale holds lapse by expiry time already (every reader filters on expires_at); this just deletes the dead rows.
create or replace function public.expire_resale_holds_internal()
returns integer language sql security definer set search_path = '' as $$
  with d as (delete from public.resale_holds where expires_at < now() - interval '5 minutes' returning 1) select count(*)::int from d
$$;

-- Organiser inventory view: per tier, how much is sold / held / reserved / publicly available.
create or replace function public.event_ticket_inventory(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.can_access_event(p_event) or public.has_admin_permission('tickets')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('tier_id', t.id, 'name', t.name, 'status', t.status, 'release_kind', t.release_kind, 'release_name', t.release_name,
      'after_tier', t.after_tier, 'access_code_required', t.access_code_required, 'per_customer_limit', t.per_customer_limit, 'order_limit', t.order_limit,
      'min_per_order', t.min_per_order, 'sale_start', t.sale_start, 'sale_end', t.sale_end, 'quantity', t.quantity, 'sold', t.sold,
      'held_live', coalesce((select sum(h.qty) from public.ticket_holds h where h.tier_id = t.id and h.expires_at > now()), 0)
        + (select count(*) from public.event_seats s where s.tier_id = t.id and s.status = 'held' and s.hold_expires_at > now()),
      'reserved_remaining', public.ticket_tier_reserved(t.id),
      'public_available', greatest(0, t.quantity - t.sold - t.held - public.ticket_tier_reserved(t.id)),
      'seats', (select jsonb_build_object('total', count(*), 'available', count(*) filter (where s.status = 'available'), 'held', count(*) filter (where s.status = 'held'),
          'sold', count(*) filter (where s.status = 'sold'), 'blocked', count(*) filter (where s.status = 'blocked'), 'accessible', count(*) filter (where s.accessible)) from public.event_seats s where s.tier_id = t.id),
      'allocations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'label', a.label, 'promoter_id', a.promoter_id, 'quantity', a.quantity,
          'used', public.ticket_allocation_used(a.id), 'status', a.status) order by a.created_at) from public.ticket_allocations a where a.tier_id = t.id), '[]'))
    order by t.sort, t.name) from public.ticket_tiers t where t.event_id = p_event), '[]');
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('ticket_order.state_changed', 1, 'ticket_order', 'A ticket order moved through its lifecycle (payload: order_ref, event_id, from, to, kind).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

-- Machine rows + enforce guard (same text the generator emits for the ticket_order machine).
delete from public.state_transitions where machine = 'ticket_order';
delete from public.state_machines where machine = 'ticket_order';
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states) values ('ticket_order', 'checkout_orders', 'order_state', 'enforce', array['draft','inventory_held','payment_pending','paid','issued','expired','failed','cancelled','refund_pending','refunded','partially_refunded','chargeback']::text[], array['refunded']::text[]);
insert into public.state_transitions(machine, from_state, to_state) values
  ('ticket_order','draft','inventory_held'),('ticket_order','draft','expired'),('ticket_order','draft','cancelled'),
  ('ticket_order','inventory_held','payment_pending'),('ticket_order','inventory_held','paid'),('ticket_order','inventory_held','issued'),('ticket_order','inventory_held','expired'),('ticket_order','inventory_held','failed'),('ticket_order','inventory_held','cancelled'),('ticket_order','inventory_held','refund_pending'),
  ('ticket_order','payment_pending','paid'),('ticket_order','payment_pending','issued'),('ticket_order','payment_pending','expired'),('ticket_order','payment_pending','failed'),('ticket_order','payment_pending','cancelled'),('ticket_order','payment_pending','refund_pending'),('ticket_order','payment_pending','refunded'),
  ('ticket_order','paid','issued'),('ticket_order','paid','failed'),('ticket_order','paid','refund_pending'),('ticket_order','paid','refunded'),('ticket_order','paid','chargeback'),
  ('ticket_order','issued','refund_pending'),('ticket_order','issued','refunded'),('ticket_order','issued','partially_refunded'),('ticket_order','issued','cancelled'),('ticket_order','issued','chargeback'),
  ('ticket_order','expired','paid'),('ticket_order','expired','issued'),('ticket_order','expired','refund_pending'),('ticket_order','expired','refunded'),
  ('ticket_order','failed','paid'),('ticket_order','failed','issued'),('ticket_order','failed','refund_pending'),('ticket_order','failed','refunded'),
  ('ticket_order','cancelled','refund_pending'),('ticket_order','cancelled','refunded'),
  ('ticket_order','refund_pending','refunded'),('ticket_order','refund_pending','partially_refunded'),('ticket_order','refund_pending','issued'),('ticket_order','refund_pending','paid'),
  ('ticket_order','partially_refunded','refund_pending'),('ticket_order','partially_refunded','refunded'),
  ('ticket_order','chargeback','refunded'),('ticket_order','chargeback','issued');
drop trigger if exists checkout_orders_state_guard on public.checkout_orders;
create trigger checkout_orders_state_guard before insert or update of order_state on public.checkout_orders for each row execute function public.enforce_state_transition('ticket_order', 'order_state');

-- ── Grants ──────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.ticket_allocation_used(uuid), public.ticket_tier_reserved(uuid), public.ticket_allocations_guard(),
  public.discount_code_live(public.discount_codes), public.checkout_apply_code(uuid, text, text, uuid), public.checkout_remove_code(uuid, text, text),
  public.checkout_quote(uuid, text), public.checkout_order_quote_guard(), public.checkout_order_reserve_codes(), public.checkout_order_derived_state(text, text, text),
  public.checkout_order_lifecycle_sync(), public.checkout_order_lifecycle_after(), public.ticket_order_transition(text, text, text, text),
  public.ticket_inventory_sweep(), public.expire_resale_holds_internal(), public.issue_checkout(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.ticket_allocation_used(uuid), public.ticket_tier_reserved(uuid), public.discount_code_live(public.discount_codes),
  public.checkout_apply_code(uuid, text, text, uuid), public.checkout_remove_code(uuid, text, text), public.checkout_quote(uuid, text),
  public.checkout_order_derived_state(text, text, text), public.ticket_order_transition(text, text, text, text), public.ticket_inventory_sweep(),
  public.expire_resale_holds_internal(), public.issue_checkout(text, text, text, uuid) to service_role;
revoke all on function public.event_ticket_inventory(uuid) from public, anon;
grant execute on function public.event_ticket_inventory(uuid) to authenticated, service_role;
-- hold_tickets / hold_seats keep their existing anon + authenticated grants (token-gated reservation; allowlisted).

select cron.schedule('ticket-inventory-sweep', '* * * * *', 'select public.ticket_inventory_sweep()');
