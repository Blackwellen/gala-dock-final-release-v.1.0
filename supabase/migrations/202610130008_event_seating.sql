-- Phase 3 · Event plans & reserved seating.
-- Seats come from the published event plan (seat blocks and tables). Buyers hold seats atomically for 10 minutes; holds count against
-- ticket_tiers.held so seated and GA inventory share the existing sold + held <= quantity guarantee. A seat can never be sold twice.
begin;

create table if not exists public.event_seats (
  event_id uuid not null references public.events(id) on delete cascade,
  seat_key text not null check (length(seat_key) between 1 and 60),
  label text not null default '',
  section text not null default '',
  kind text not null default 'seat' check (kind in ('seat','table_seat')),
  tier_id uuid references public.ticket_tiers(id) on delete set null,
  accessible boolean not null default false,
  status text not null default 'available' check (status in ('available','held','sold','blocked')),
  hold_token text,
  hold_expires_at timestamptz,
  ticket_id uuid references public.tickets(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, seat_key),
  check ((status = 'held') = (hold_token is not null and hold_expires_at is not null))
);
create index if not exists event_seats_token_idx on public.event_seats(hold_token) where hold_token is not null;
alter table public.event_seats enable row level security;
-- Availability is public for public on-sale events; holders' tokens are never exposed (column privileges below).
drop policy if exists event_seats_public_read on public.event_seats;
create policy event_seats_public_read on public.event_seats for select to anon
  using (exists(select 1 from public.events e where e.id = event_id and e.visibility = 'public' and e.status in ('published','on_sale','live')));
drop policy if exists event_seats_member_read on public.event_seats;
create policy event_seats_member_read on public.event_seats for select to authenticated
  using (exists(select 1 from public.events e where e.id = event_id and ((e.visibility = 'public' and e.status in ('published','on_sale','live')) or public.can_access_event(e.id))));
revoke select on public.event_seats from anon, authenticated;
grant select (event_id, seat_key, label, section, kind, tier_id, accessible, status, updated_at) on public.event_seats to anon, authenticated;

create or replace function public.can_edit_event(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.events e where e.id = target and (e.owner_id = (select auth.uid())
    or (e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager','member']))));
$$;

/** Saves a plan version; publishing syncs seat inventory. Sold/held seats can't be removed or re-tiered. */
create or replace function public.organizer_save_event_plan(p_event uuid, p_structure jsonb, p_overlay jsonb, p_seats jsonb, p_publish boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer; locked text;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_overlay) <> 'array' or jsonb_typeof(p_seats) <> 'array' then raise exception 'invalid_elements' using errcode = '22023'; end if;
  if jsonb_array_length(p_seats) > 60000 then raise exception 'too_many_seats' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_seats) s where (s->>'tier') is not null and not exists(select 1 from public.ticket_tiers t where t.id = (s->>'tier')::uuid and t.event_id = p_event)) then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v from public.venue_maps where event_id = p_event;
  insert into public.venue_maps(event_id, version, status, structure, overlay, created_by)
    values (p_event, v, case when p_publish then 'published' else 'draft' end, coalesce(p_structure, '{}'), p_overlay, auth.uid());
  if p_publish then
    select string_agg(es.seat_key, ', ') into locked from public.event_seats es
      where es.event_id = p_event and es.status in ('sold','held')
        and not exists(select 1 from jsonb_array_elements(p_seats) s where s->>'key' = es.seat_key and (s->>'tier')::uuid is not distinct from es.tier_id);
    if locked is not null then raise exception 'seats_in_use' using errcode = '23P01', detail = left(locked, 200); end if;
    delete from public.event_seats es where es.event_id = p_event and es.status in ('available','blocked')
      and not exists(select 1 from jsonb_array_elements(p_seats) s where s->>'key' = es.seat_key);
    insert into public.event_seats(event_id, seat_key, label, section, kind, tier_id, accessible, status)
      select p_event, s->>'key', left(coalesce(s->>'label', ''), 120), left(coalesce(s->>'section', ''), 60), coalesce(s->>'kind', 'seat'), (s->>'tier')::uuid,
        coalesce((s->>'accessible')::boolean, false), case when coalesce((s->>'blocked')::boolean, false) then 'blocked' else 'available' end
      from jsonb_array_elements(p_seats) s
    on conflict (event_id, seat_key) do update set label = excluded.label, section = excluded.section, kind = excluded.kind, accessible = excluded.accessible,
      tier_id = case when public.event_seats.status in ('sold','held') then public.event_seats.tier_id else excluded.tier_id end,
      status = case when public.event_seats.status in ('sold','held') then public.event_seats.status else excluded.status end, updated_at = now();
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), (select workspace_id from public.events where id = p_event), case when p_publish then 'event_plan.published' else 'event_plan.saved' end,
      jsonb_build_object('event_id', p_event, 'version', v, 'seats', jsonb_array_length(p_seats)));
  return v;
end $$;

/** Releases expired holds for one event (or all) and returns their tier counts. */
create or replace function public.expire_seat_holds(p_event uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record;
begin
  for r in select tier_id, count(*) c from public.event_seats where status = 'held' and hold_expires_at < now() and (p_event is null or event_id = p_event) group by tier_id loop
    if r.tier_id is not null then update public.ticket_tiers set held = greatest(0, held - r.c::int) where id = r.tier_id; end if;
    n := n + r.c::int;
  end loop;
  update public.event_seats set status = 'available', hold_token = null, hold_expires_at = null, updated_at = now()
    where status = 'held' and hold_expires_at < now() and (p_event is null or event_id = p_event);
  return n;
end $$;

/** Atomically holds seats for a checkout token (10 minutes). All-or-nothing: if any seat is taken, nothing is held. */
create or replace function public.hold_seats(p_event uuid, p_keys text[], p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare want int := coalesce(array_length(p_keys, 1), 0); got int; ev public.events; r record; exp timestamptz := now() + interval '10 minutes';
begin
  if want = 0 or want > 20 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  if length(coalesce(p_token, '')) < 16 then raise exception 'invalid_token' using errcode = '22023'; end if;
  select * into ev from public.events where id = p_event;
  if not found or not (ev.visibility = 'public' and ev.status in ('on_sale','live','published')) then raise exception 'not_on_sale' using errcode = '22023'; end if;
  perform public.expire_seat_holds(p_event);
  -- Re-holding with the same token replaces the previous selection.
  perform public.release_seat_holds(p_token);
  if exists(select 1 from public.event_seats s join public.ticket_tiers t on t.id = s.tier_id where s.event_id = p_event and s.seat_key = any(p_keys) and t.status <> 'on_sale') then
    raise exception 'not_on_sale' using errcode = '22023';
  end if;
  if exists(select 1 from public.event_seats s where s.event_id = p_event and s.seat_key = any(p_keys) and s.tier_id is null) then raise exception 'seat_not_ticketed' using errcode = '22023'; end if;
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

create or replace function public.release_seat_holds(p_token text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record;
begin
  for r in select tier_id, count(*) c from public.event_seats where hold_token = p_token and status = 'held' group by tier_id loop
    if r.tier_id is not null then update public.ticket_tiers set held = greatest(0, held - r.c::int) where id = r.tier_id; end if;
    n := n + r.c::int;
  end loop;
  update public.event_seats set status = 'available', hold_token = null, hold_expires_at = null, updated_at = now() where hold_token = p_token and status = 'held';
  return n;
end $$;

/** Called by the payment webhook (service role) after a successful charge: converts held seats to sold tickets. Idempotent per order_ref. */
create or replace function public.issue_seated_tickets(p_token text, p_order_ref text, p_attendee text, p_holder uuid) returns setof public.tickets
language plpgsql security definer set search_path = '' as $$
declare s record; t public.ticket_tiers; tk public.tickets;
begin
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then return query select * from public.tickets where order_ref = p_order_ref; return; end if;
  if not exists(select 1 from public.event_seats where hold_token = p_token and status = 'held') then raise exception 'hold_expired' using errcode = '22023'; end if;
  for s in select * from public.event_seats where hold_token = p_token and status = 'held' order by seat_key for update loop
    select * into t from public.ticket_tiers where id = s.tier_id for update;
    update public.ticket_tiers set held = greatest(0, held - 1), sold = sold + 1, status = case when sold + 1 + greatest(0, held - 1) >= quantity then 'sold_out' else status end where id = t.id;
    insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, seat, price_paid)
      values ('GLD-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)), s.event_id, t.id, p_holder, coalesce(p_attendee, ''), p_order_ref, s.label, t.price)
      returning * into tk;
    update public.event_seats set status = 'sold', hold_token = null, hold_expires_at = null, ticket_id = tk.id, updated_at = now() where event_id = s.event_id and seat_key = s.seat_key;
    return next tk;
  end loop;
end $$;

revoke all on function public.can_edit_event(uuid), public.organizer_save_event_plan(uuid, jsonb, jsonb, jsonb, boolean), public.expire_seat_holds(uuid), public.hold_seats(uuid, text[], text),
  public.release_seat_holds(text), public.issue_seated_tickets(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.can_edit_event(uuid), public.organizer_save_event_plan(uuid, jsonb, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.hold_seats(uuid, text[], text), public.release_seat_holds(text) to anon, authenticated;
grant execute on function public.expire_seat_holds(uuid), public.issue_seated_tickets(text, text, text, uuid) to service_role;
commit;
