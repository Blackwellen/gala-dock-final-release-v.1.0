-- Phase 3 · Checkout (BUY-W01): one 10-minute hold per checkout token covering reserved seats (event_seats) and general-admission quantities
-- (ticket_holds). Holds count against ticket_tiers.held so the existing sold + held <= quantity check prevents overselling.
-- Tickets are issued only after payment is verified, by the service role, idempotently per order reference.
begin;

create table if not exists public.ticket_holds (
  token text not null,
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  qty integer not null check (qty between 1 and 100),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (token, tier_id)
);
alter table public.ticket_holds enable row level security; -- no policies: only security-definer functions touch it

create table if not exists public.checkout_orders (
  order_ref text primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  buyer_id uuid references auth.users(id) on delete set null,
  token text not null,
  amount numeric(12,2) not null,
  fee numeric(12,2) not null default 0,
  currency text not null default 'GBP',
  status text not null default 'pending' check (status in ('pending','paid','issued','failed','expired','refunded')),
  lines jsonb not null default '[]',
  stripe_session text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.checkout_orders enable row level security;
drop policy if exists checkout_orders_buyer_read on public.checkout_orders;
create policy checkout_orders_buyer_read on public.checkout_orders for select to authenticated using (buyer_id = (select auth.uid()) or public.has_admin_permission('commerce'));

/** Public fee config (fixed + percentage) from the published commerce settings. */
create or replace function public.ticket_fee_config() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select value->'ticket_fee' from public.platform_settings where section = 'commerce' and status = 'published' order by version desc limit 1), '{"fixed":0,"pct_bps":0}'::jsonb)
$$;

create or replace function public.release_checkout(p_token text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record;
begin
  n := public.release_seat_holds(p_token);
  for r in select tier_id, qty from public.ticket_holds where token = p_token for update loop
    update public.ticket_tiers set held = greatest(0, held - r.qty) where id = r.tier_id; n := n + r.qty;
  end loop;
  delete from public.ticket_holds where token = p_token;
  return n;
end $$;

create or replace function public.expire_checkout_holds() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer; r record;
begin
  n := public.expire_seat_holds(null);
  for r in select tier_id, sum(qty) q from public.ticket_holds where expires_at < now() group by tier_id loop
    update public.ticket_tiers set held = greatest(0, held - r.q::int) where id = r.tier_id; n := n + r.q::int;
  end loop;
  delete from public.ticket_holds where expires_at < now();
  return n;
end $$;

/**
 * Hold general-admission quantities for a token: p_items = [{tier, qty}]. Re-holding replaces the token's GA holds (seat holds are separate: hold_seats).
 * Refuses seated tiers (buyers must pick seats), hidden/paused tiers, out-of-window sales and order limits.
 */
create or replace function public.hold_tickets(p_event uuid, p_items jsonb, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events; it record; t public.ticket_tiers; exp timestamptz := now() + interval '10 minutes'; total int := 0;
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
    if t.sold + t.held + it.qty > t.quantity then raise exception 'sold_out' using errcode = '22023'; end if;
    update public.ticket_tiers set held = held + it.qty where id = t.id;
    insert into public.ticket_holds(token, event_id, tier_id, qty, expires_at) values (p_token, p_event, t.id, it.qty, exp);
    total := total + it.qty;
  end loop;
  -- Keep seat holds (if any) on the same expiry.
  update public.event_seats set hold_expires_at = exp where hold_token = p_token and status = 'held';
  return jsonb_build_object('held', total, 'expires_at', exp);
end $$;

/** After payment is verified (service role): converts the token's seat + GA holds into tickets. Idempotent per order_ref. */
create or replace function public.issue_checkout(p_token text, p_order_ref text, p_attendee text, p_holder uuid) returns integer
language plpgsql security definer set search_path = '' as $$
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
      status = case when sold + h.qty + greatest(0, held - h.qty) >= quantity then 'sold_out' else status end where id = t.id;
    for i in 1..h.qty loop
      insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, price_paid)
        values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), h.event_id, t.id, p_holder, coalesce(p_attendee, ''), p_order_ref, t.price);
    end loop;
  end loop;
  delete from public.ticket_holds where token = p_token;
  select count(*) into n from public.tickets where order_ref = p_order_ref;
  update public.checkout_orders set status = 'issued', updated_at = now() where order_ref = p_order_ref;
  return n;
end $$;

revoke all on function public.ticket_fee_config(), public.release_checkout(text), public.expire_checkout_holds(), public.hold_tickets(uuid, jsonb, text), public.issue_checkout(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.ticket_fee_config(), public.release_checkout(text), public.hold_tickets(uuid, jsonb, text) to anon, authenticated;
grant execute on function public.expire_checkout_holds(), public.issue_checkout(text, text, text, uuid) to service_role;
commit;
