-- Build canvas guards (canvas/map lane, 2026-11-11; coordinator decisions 1 + 2). Additive: replaces one function body, adds a
-- nullable column, a guard trigger, an RPC and a partial unique index. No data is changed.
--
-- 1. transition_build_item(…, 'cancelled') allowed any status except fulfilled/cancelled, so a customer or organiser calling the
--    database directly could cancel a confirmed or paid booking and skip the cancellation/refund engine (booking_cancellations,
--    decide_cancellation). 'cancelled' is now limited to the same pre-booking states the client guard (build_items_client_guard,
--    202610291028) lets a buyer cancel directly: no provider commitment, no money taken. Everything else goes through Manage booking.
-- 2. Customers can hide finished lines (cancelled, refunded, declined, lapsed) from the build canvas without losing the record:
--    build_items.hidden_at + set_build_item_hidden(); client writes to hidden_at are refused on lines that aren't finished.
-- 3. One open line per (event, listing): partial unique index. Finished/fulfilled lines are excluded, so re-booking a provider after
--    a fulfilled or cancelled line stays possible (24 such fulfilled + re-suggested pairs exist in demo data and are legitimate).

create or replace function public.transition_build_item(p_item uuid, p_to text, p_hold_hours integer default null::integer)
returns public.build_items language plpgsql security definer set search_path to '' as $$
declare b public.build_items; ok boolean;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_access_event(b.event_id) then raise exception 'not_authorized' using errcode='42501'; end if;
  ok := case
    when p_to = 'sent' then b.status in ('suggested','draft','expired','declined')
    when p_to = 'held' then b.status in ('available','quoted') and p_hold_hours between 2 and 72
    when p_to = 'confirmed' then b.status in ('available','quoted','held') and b.amount is not null
    when p_to = 'standby' then b.status in ('suggested','available','quoted')
    -- Pre-booking only (mirrors build_items_client_guard.open_states). Confirmed, paid, active or disputed lines are cancelled
    -- through the cancellation engine so the policy, provider notice and refunds apply.
    when p_to = 'cancelled' then b.status in ('suggested','draft','enquiry_created','requested','sent','awaiting','awaiting_provider','clarification',
      'clarification_requested','available','quoted','quote_received','quote_revised','customer_reviewing','hold','held','conditional_hold_requested',
      'standby','expired','expired_no_response','declined','unavailable')
    when p_to = 'suggested' then b.status in ('suggested','draft')
    else false end;
  if not ok then raise exception 'invalid_transition:%->%', b.status, p_to using errcode='22023'; end if;
  -- Payment is the authority for a paid marketplace booking (Q07): nothing payable is confirmed from the client.
  if p_to = 'confirmed' and b.listing_id is not null
     and not (b.amount = 0 and coalesce(b.deposit, 0) = 0 and nullif(b.quote->>'quote_id', '') is not null) then
    raise exception 'payment_required' using errcode = '42501', hint = 'Pay the deposit to confirm; the payment confirms the booking.';
  end if;
  if p_to = 'confirmed' and b.category <> 'venue' and exists(select 1 from public.events e where e.id=b.event_id and e.settings->>'venue_gates_suppliers'='true')
     and not exists(select 1 from public.build_items v where v.event_id=b.event_id and v.category='venue' and v.status='confirmed') then
    raise exception 'venue_required' using errcode='22023';
  end if;
  update public.build_items set
    status = p_to,
    role = case when p_to='standby' then 'standby' else role end,
    response_deadline = case when p_to='sent' then now() + interval '48 hours' else response_deadline end,
    hold_expires_at = case when p_to='held' then now() + make_interval(hours => p_hold_hours) else hold_expires_at end,
    terms_snapshot = case when p_to='confirmed' then jsonb_build_object('amount',b.amount,'deposit',b.deposit,'package',b.package,'confirmed_at',now()) else terms_snapshot end,
    updated_at = now()
  where id = b.id returning * into b;
  return b;
end $$;
revoke all on function public.transition_build_item(uuid, text, integer) from public, anon;
grant execute on function public.transition_build_item(uuid, text, integer) to authenticated, service_role;

-- 2. Hide finished lines -----------------------------------------------------------------------------------------------------
alter table public.build_items add column if not exists hidden_at timestamptz;
comment on column public.build_items.hidden_at is 'Customer hid this finished line from the build canvas (record kept; "Show hidden" lists it).';

create or replace function public.build_items_hidden_guard()
returns trigger language plpgsql set search_path to '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.hidden_at is distinct from old.hidden_at
     and new.status not in ('cancelled','cancelled_by_customer','cancelled_by_provider','refunded','declined','unavailable','expired','expired_no_response') then
    raise exception 'build_item_not_finished:%', new.status using errcode = '42501', hint = 'Only finished lines can be hidden.';
  end if;
  return new;
end $$;
revoke all on function public.build_items_hidden_guard() from public, anon, authenticated;
drop trigger if exists build_items_hidden_guard on public.build_items;
create trigger build_items_hidden_guard before update of hidden_at on public.build_items
  for each row execute function public.build_items_hidden_guard();

create or replace function public.set_build_item_hidden(p_item uuid, p_hidden boolean)
returns timestamptz language plpgsql security definer set search_path to '' as $$
declare b public.build_items;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_access_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_hidden and b.status not in ('cancelled','cancelled_by_customer','cancelled_by_provider','refunded','declined','unavailable','expired','expired_no_response') then
    raise exception 'build_item_not_finished:%', b.status using errcode = '22023';
  end if;
  update public.build_items set hidden_at = case when p_hidden then coalesce(b.hidden_at, now()) else null end, updated_at = now() where id = b.id
  returning hidden_at into b.hidden_at;
  return b.hidden_at;
end $$;
revoke all on function public.set_build_item_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_build_item_hidden(uuid, boolean) to authenticated, service_role;

-- 3. One open line per event + listing ---------------------------------------------------------------------------------------
create unique index if not exists build_items_event_listing_open_uidx on public.build_items (event_id, listing_id)
  where listing_id is not null and status not in ('cancelled','cancelled_by_customer','cancelled_by_provider','refunded','partially_refunded',
    'declined','unavailable','expired','expired_no_response','fulfilled','completion_pending','completed','disputed');
