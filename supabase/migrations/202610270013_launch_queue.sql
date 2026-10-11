-- Launch states, high-demand waiting room and time-bound waitlist offers (release spec §50–52).

-- ── Launch state (§50): one derived, server-authoritative state for public pages, search and the API.
-- events.settings.launch: {"at": iso, "presale_at": iso, "waiting_room": {"enabled": bool, "rate_per_minute": int, "admit_minutes": int}}
create or replace function public.event_launch_state(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  with e as (select ev.*, (ev.settings -> 'launch' ->> 'at')::timestamptz launch_at, (ev.settings -> 'launch' ->> 'presale_at')::timestamptz presale_at from public.events ev where ev.id = p_event),
  t as (select coalesce(sum(greatest(quantity - sold - held, 0)), 0) avail, coalesce(sum(quantity), 0) cap, count(*) filter (where status = 'on_sale') on_sale, bool_or(name ilike '%final%') final
        from public.ticket_tiers where event_id = p_event and status in ('on_sale','sold_out','scheduled'))
  select case
    when e.status = 'cancelled' then 'cancelled'
    when e.status = 'postponed' then 'postponed'
    when e.status in ('completed','closed','archived') or coalesce(e.ends_at, e.starts_at + interval '6 hours') < now() then 'ended'
    when e.status in ('draft','planning','ready') then 'draft'
    when e.launch_at is not null and now() < coalesce(e.presale_at, e.launch_at) and e.launch_at - now() <= interval '7 days' then 'countdown'
    when e.launch_at is not null and now() < coalesce(e.presale_at, e.launch_at) then 'coming_soon'
    when e.presale_at is not null and now() >= e.presale_at and now() < coalesce(e.launch_at, e.presale_at) then 'presale'
    when t.cap > 0 and t.avail = 0 and exists (select 1 from public.ticket_waitlist w where w.event_id = p_event and w.status = 'waiting') then 'waitlist'
    when t.cap > 0 and t.avail = 0 then 'sold_out'
    when t.cap > 0 and t.avail::numeric / t.cap <= 0.1 then 'low_availability'
    when t.final and t.on_sale > 0 then 'final_release'
    when t.on_sale > 0 then 'on_sale'
    else 'coming_soon' end
  from e, t;
$$;
revoke all on function public.event_launch_state(uuid) from public;
grant execute on function public.event_launch_state(uuid) to anon, authenticated, service_role;

-- ── Launch waiting room (§52): server-authoritative FIFO. Position = join order; admission is computed from elapsed time since
-- launch × admission rate, so there is no fake number and no worker race. Admitted visitors have a bounded window to check out.
create table if not exists public.launch_queue (
  event_id uuid not null references public.events(id) on delete cascade,
  token_hash text not null,                         -- sha256 of an opaque browser token (no PII required to queue)
  user_id uuid references auth.users(id) on delete set null,
  position bigint generated always as identity,
  joined_at timestamptz not null default now(),
  admitted_at timestamptz, used_at timestamptz,
  primary key (event_id, token_hash)
);
create index if not exists launch_queue_pos_idx on public.launch_queue(event_id, position);
alter table public.launch_queue enable row level security;   -- service/definer access only

create or replace function public.queue_status(p_event uuid, p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; launch timestamptz; rate integer; win integer; q public.launch_queue; first_pos bigint; admitted_upto bigint; ahead bigint;
begin
  select settings -> 'launch' into cfg from public.events where id = p_event;
  if coalesce((cfg -> 'waiting_room' ->> 'enabled')::boolean, false) = false then return jsonb_build_object('required', false, 'admitted', true); end if;
  launch := coalesce((cfg ->> 'at')::timestamptz, now()); rate := greatest(coalesce((cfg -> 'waiting_room' ->> 'rate_per_minute')::int, 200), 1); win := greatest(coalesce((cfg -> 'waiting_room' ->> 'admit_minutes')::int, 10), 2);
  select * into q from public.launch_queue where event_id = p_event and token_hash = p_token_hash;
  if not found then return jsonb_build_object('required', true, 'joined', false, 'opens_at', launch); end if;
  select min(position) into first_pos from public.launch_queue where event_id = p_event;
  admitted_upto := first_pos - 1 + case when now() < launch then 0 else floor(extract(epoch from (now() - launch)) / 60.0 * rate)::bigint + rate end;
  if q.position <= admitted_upto and q.admitted_at is null then update public.launch_queue set admitted_at = now() where event_id = p_event and token_hash = p_token_hash returning * into q; end if;
  ahead := greatest(q.position - admitted_upto - 1, 0);
  return jsonb_build_object('required', true, 'joined', true, 'opens_at', launch,
    'admitted', q.admitted_at is not null and q.used_at is null and q.admitted_at > now() - make_interval(mins => win),
    'expired', q.admitted_at is not null and q.admitted_at <= now() - make_interval(mins => win),
    'admit_expires_at', case when q.admitted_at is not null then q.admitted_at + make_interval(mins => win) end,
    'ahead', ahead, 'eta_minutes', case when ahead > 0 then ceil(ahead::numeric / rate) else 0 end);
end $$;
create or replace function public.queue_join(p_event uuid, p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if length(coalesce(p_token_hash, '')) <> 64 then raise exception 'invalid_token' using errcode = '22023'; end if;
  if not exists (select 1 from public.events where id = p_event and coalesce((settings -> 'launch' -> 'waiting_room' ->> 'enabled')::boolean, false)) then
    return jsonb_build_object('required', false, 'admitted', true); end if;
  insert into public.launch_queue(event_id, token_hash, user_id) values (p_event, p_token_hash, auth.uid()) on conflict do nothing;
  return public.queue_status(p_event, p_token_hash);
end $$;
-- Checkout gate: an admitted, unexpired, unused admission (marked used once an order is created).
create or replace function public.queue_admit_check(p_event uuid, p_token_hash text, p_consume boolean default false) returns boolean
language plpgsql security definer set search_path = '' as $$
declare s jsonb := public.queue_status(p_event, coalesce(p_token_hash, ''));
begin
  if not (s ->> 'required')::boolean then return true; end if;
  if coalesce((s ->> 'admitted')::boolean, false) then
    if p_consume then update public.launch_queue set used_at = now() where event_id = p_event and token_hash = p_token_hash; end if;
    return true;
  end if;
  return false;
end $$;
revoke all on function public.queue_status(uuid, text), public.queue_join(uuid, text), public.queue_admit_check(uuid, text, boolean) from public;
grant execute on function public.queue_status(uuid, text), public.queue_join(uuid, text) to anon, authenticated, service_role;
grant execute on function public.queue_admit_check(uuid, text, boolean) to service_role;

-- ── Sold-out waitlist offers (§52): freed inventory is reserved for the next person for a limited time, then passed on.
alter table public.ticket_waitlist add column if not exists offer_expires_at timestamptz;
alter table public.ticket_waitlist add column if not exists offer_tier_id uuid references public.ticket_tiers(id) on delete set null;
alter table public.ticket_waitlist add column if not exists accessibility_needs text;
do $$ begin
  alter table public.ticket_waitlist drop constraint if exists ticket_waitlist_status_check;
  alter table public.ticket_waitlist add constraint ticket_waitlist_status_check check (status in ('waiting','notified','offered','purchased','converted','expired','cancelled'));
end $$;

create or replace function public.notify_waitlists() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; w record; n integer := 0; free integer;
begin
  -- 1. Expired offers release their reserved inventory and drop to the back of nothing (they're closed; the user may rejoin).
  for w in select q.id, q.offer_tier_id, q.quantity from public.ticket_waitlist q where q.status = 'offered' and q.offer_expires_at < now() for update loop
    update public.ticket_tiers set held = greatest(held - w.quantity, 0) where id = w.offer_tier_id;
    update public.ticket_waitlist set status = 'expired' where id = w.id;
  end loop;
  -- 2. Offer freed inventory to the next people in line, reserving it for 30 minutes.
  for r in select t.id tier_id, t.event_id, t.name, greatest(t.quantity - t.sold - t.held, 0) avail, e.name ev, e.slug from public.ticket_tiers t join public.events e on e.id = t.event_id
           where t.status in ('on_sale','sold_out') and t.quantity - t.sold - t.held > 0 and (t.sale_end is null or t.sale_end > now()) and e.status not in ('cancelled','postponed')
             and exists (select 1 from public.ticket_waitlist wl where wl.event_id = t.event_id and (wl.tier_id = t.id or wl.tier_id is null) and wl.status = 'waiting') loop
    free := r.avail;
    update public.ticket_tiers set status = 'on_sale' where id = r.tier_id and status = 'sold_out';
    for w in select q.id, q.user_id, q.quantity from public.ticket_waitlist q where q.event_id = r.event_id and (q.tier_id = r.tier_id or q.tier_id is null) and q.status = 'waiting' order by q.created_at for update loop
      exit when free < w.quantity;
      update public.ticket_tiers set held = held + w.quantity where id = r.tier_id;
      update public.ticket_waitlist set status = 'offered', notified_at = now(), offer_expires_at = now() + interval '30 minutes', offer_tier_id = r.tier_id where id = w.id;
      insert into public.notifications(user_id, kind, title, body, link) values (w.user_id, 'ticket_waitlist', 'Tickets reserved for you: ' || r.ev,
        w.quantity || ' × ' || r.name || ' are held for you for 30 minutes. After that they go to the next person in line.', '/checkout/' || coalesce(r.slug, '') || '?waitlist_offer=' || w.id);
      free := free - w.quantity; n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.notify_waitlists() from public, anon, authenticated;
grant execute on function public.notify_waitlists() to service_role;

-- Claiming an offer (checkout integration): converts the reserved 'held' quantity into the buyer's checkout hold.
create or replace function public.waitlist_offer_for(p_offer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tier_id', offer_tier_id, 'quantity', quantity, 'expires_at', offer_expires_at, 'valid', status = 'offered' and offer_expires_at > now())
  from public.ticket_waitlist where id = p_offer and user_id = (select auth.uid());
$$;
revoke all on function public.waitlist_offer_for(uuid) from public, anon;
grant execute on function public.waitlist_offer_for(uuid) to authenticated, service_role;
