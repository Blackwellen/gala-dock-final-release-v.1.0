-- Phase 3 · Fan-to-fan resale (BUY-W02). Listed tickets sell at their original price (never above the platform resale cap), are held per checkout
-- token like primary tickets, and on payment the seller's ticket is marked resold and a fresh ticket (new code + QR nonce) is issued to the buyer.
-- The seller's proceeds are recorded as a pending payout — no money moves until payouts are processed.
begin;
create table if not exists public.resale_holds (
  ticket_id uuid primary key references public.tickets(id) on delete cascade,
  token text not null,
  expires_at timestamptz not null
);
alter table public.resale_holds enable row level security;

create table if not exists public.resale_payouts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references auth.users(id) on delete set null,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  order_ref text not null,
  amount numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at timestamptz not null default now(),
  unique (ticket_id)
);
alter table public.resale_payouts enable row level security;
drop policy if exists resale_payouts_seller_read on public.resale_payouts;
create policy resale_payouts_seller_read on public.resale_payouts for select to authenticated using (seller_id = (select auth.uid()) or public.has_admin_permission('commerce'));

/** Public listings for an on-sale event: tier, seat and price only (never the seller). */
create or replace function public.resale_listings(p_event uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'tier', tt.name, 'tier_id', tt.id, 'seat', t.seat, 'price', least(t.price_paid, tt.price * coalesce((s.value->>'resale_cap_pct')::numeric, 100) / 100)) order by t.price_paid), '[]'::jsonb)
  from public.tickets t join public.ticket_tiers tt on tt.id = t.tier_id join public.events e on e.id = t.event_id
  left join lateral (select value from public.platform_settings where section = 'ticketing' and status = 'published' order by version desc limit 1) s on true
  where t.event_id = p_event and t.status = 'resale_listed' and e.visibility = 'public' and e.status in ('published','on_sale','live')
    and coalesce((s.value->>'resale_enabled')::boolean, true)
    and not exists(select 1 from public.resale_holds h where h.ticket_id = t.id and h.expires_at > now())
$$;

/** Hold up to 10 listed tickets for a checkout token (10 min). All-or-nothing; a buyer can't buy their own listing. */
create or replace function public.hold_resale(p_event uuid, p_tickets uuid[], p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int := coalesce(array_length(p_tickets, 1), 0); got int; exp timestamptz := now() + interval '10 minutes';
begin
  if n = 0 or n > 10 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  if length(coalesce(p_token, '')) < 16 then raise exception 'invalid_token' using errcode = '22023'; end if;
  delete from public.resale_holds where expires_at < now() or token = p_token;
  if exists(select 1 from public.tickets where id = any(p_tickets) and holder_id = auth.uid()) then raise exception 'own_ticket' using errcode = '22023'; end if;
  insert into public.resale_holds(ticket_id, token, expires_at)
    select t.id, p_token, exp from public.tickets t where t.id = any(p_tickets) and t.event_id = p_event and t.status = 'resale_listed'
    on conflict (ticket_id) do nothing;
  get diagnostics got = row_count;
  if got <> n then delete from public.resale_holds where token = p_token; raise exception 'seat_unavailable' using errcode = '23P01'; end if;
  return jsonb_build_object('held', got, 'expires_at', exp);
end $$;

create or replace function public.resale_holds_for(p_token text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('ticket_id', t.id, 'tier_id', t.tier_id, 'tier', tt.name, 'seat', t.seat, 'price', t.price_paid, 'expires_at', h.expires_at)), '[]'::jsonb)
  from public.resale_holds h join public.tickets t on t.id = h.ticket_id join public.ticket_tiers tt on tt.id = t.tier_id
  where length(coalesce(p_token, '')) >= 16 and h.token = p_token and h.expires_at > now() and t.status = 'resale_listed'
$$;

/** Service role, after payment: transfer each held listing to the buyer and record the seller's pending payout. Idempotent per order. */
create or replace function public.issue_resale(p_token text, p_order_ref text, p_attendee text, p_holder uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare h record; old public.tickets; nid uuid; n int := 0;
begin
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then return (select count(*) from public.tickets where order_ref = p_order_ref); end if;
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
end $$;

alter table public.checkout_orders add column if not exists kind text not null default 'primary' check (kind in ('primary','resale'));
revoke all on function public.resale_listings(uuid), public.hold_resale(uuid, uuid[], text), public.resale_holds_for(text), public.issue_resale(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.resale_listings(uuid), public.resale_holds_for(text) to anon, authenticated, service_role;
grant execute on function public.hold_resale(uuid, uuid[], text) to authenticated;
grant execute on function public.issue_resale(text, text, text, uuid) to service_role;
commit;
