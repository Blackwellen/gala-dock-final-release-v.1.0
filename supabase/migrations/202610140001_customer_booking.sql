-- Customer booking flow (CU-W02): requirements → request / conditional hold / standby → quote acceptance.
-- The provider reads requirements from provider_requests (linked via build_items.request_id); accepting a quote
-- confirms the build item (which creates the provider job via trigger) and writes the payment schedule.

-- Save (draft) or submit a booking request for one build item. Returns the provider_requests id.
create or replace function public.customer_save_booking(p_item uuid, p_requirements jsonb, p_option text, p_submit boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.build_items; e public.events; rid uuid; req jsonb; ws uuid; owner uuid;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.events where id = b.event_id;
  if e.owner_id is distinct from auth.uid() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.status in ('completed','cancelled','archived') then raise exception 'event_closed' using errcode = '22023'; end if;
  if p_option not in ('request','hold','standby') then raise exception 'invalid_option' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_requirements, '{}')) <> 'object' or length(p_requirements::text) > 20000 then raise exception 'invalid_requirements' using errcode = '22023'; end if;
  if b.status in ('confirmed','fulfilled','cancelled') then raise exception 'not_open:%', b.status using errcode = '22023'; end if;
  req := p_requirements || jsonb_build_object('option', p_option, 'quote_requested', p_option <> 'standby');

  if b.request_id is null then
    insert into public.provider_requests(reference, event_id, created_by, category, title, scope, requirements, response_hours,
        response_deadline, hold_strategy, hold_hours, status)
      values ('RQ-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)), e.id, auth.uid(), b.category, b.title, b.package, req, 48,
        case when p_submit then now() + interval '48 hours' end, case when p_option = 'hold' then 'conditional' else 'none' end,
        case when p_option = 'hold' then 72 end, case when p_submit then 'sent' else 'draft' end)
      returning id into rid;
    update public.build_items set request_id = rid where id = b.id;
  else
    rid := b.request_id;
    update public.provider_requests set requirements = req, title = b.title, scope = b.package,
      hold_strategy = case when p_option = 'hold' then 'conditional' else 'none' end, hold_hours = case when p_option = 'hold' then 72 end,
      status = case when p_submit then 'sent' else status end,
      response_deadline = case when p_submit and response_deadline is null then now() + interval '48 hours' else response_deadline end
      where id = rid;
  end if;

  if not p_submit then return rid; end if;

  if p_option = 'standby' then
    if b.status in ('suggested','draft','available','quoted','expired','declined','unavailable') then
      update public.build_items set status = 'standby', role = 'standby', updated_at = now() where id = b.id;
    end if;
  elsif p_option = 'hold' and b.status in ('available','quoted') then
    update public.build_items set status = 'held', hold_expires_at = now() + interval '72 hours', updated_at = now() where id = b.id;
  elsif b.status in ('suggested','draft','expired','declined','unavailable','standby') then
    update public.build_items set status = 'sent', role = case when role = 'standby' then 'primary' else role end,
      response_deadline = now() + interval '48 hours', updated_at = now() where id = b.id;
  end if;

  select l.workspace_id, w.owner_id into ws, owner from public.listings l join public.workspaces w on w.id = l.workspace_id where l.id = b.listing_id;
  if owner is not null then
    insert into public.notifications(user_id, kind, title, body, link)
      values (owner, 'request_received', case p_option when 'standby' then 'Standby interest: ' when 'hold' then 'Hold request: ' else 'Booking request: ' end || e.name,
        coalesce((req->>'guests'), e.guest_count::text) || ' guests · respond within 48h', '/provider/opportunities/' || b.id);
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), ws, 'booking.requested', jsonb_build_object('build_item_id', b.id, 'option', p_option, 'request_id', rid));
  return rid;
end $$;

-- Accept the current quote: confirm the item, record deposit (paid) + balance (scheduled), and update the provider job.
create or replace function public.customer_accept_quote(p_item uuid, p_payment_ref text)
returns void language plpgsql security definer set search_path = '' as $$
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
    values (e.workspace_id, e.id, 'payment', b.category, 'Deposit — ' || b.title, dep, 'completed', 'marketplace', 'build_item', b.id, now(), coalesce(e.currency, 'GBP'), b.title, nullif(left(coalesce(p_payment_ref, ''), 120), ''));
  update public.provider_jobs set payment_status = 'deposit_paid', paid_amount = dep where build_item_id = b.id;
  if b.request_id is not null then update public.provider_requests set status = 'closed' where id = b.request_id; end if;
  if owner is not null then
    insert into public.notifications(user_id, kind, title, body, link)
      values (owner, 'booking_confirmed', 'Quote accepted: ' || e.name, 'Deposit of £' || dep::text || ' received', '/provider/opportunities/' || b.id);
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), ws, 'quote.accepted', jsonb_build_object('build_item_id', b.id, 'deposit', dep, 'balance', bal));
end $$;

revoke all on function public.customer_save_booking(uuid, jsonb, text, boolean) from public, anon;
revoke all on function public.customer_accept_quote(uuid, text) from public, anon;
grant execute on function public.customer_save_booking(uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.customer_accept_quote(uuid, text) to authenticated;

-- Availability for a listing over a window, as a single signal (no provider calendar detail is exposed).
-- 'available' | 'limited' (holds / soft blocks) | 'unavailable' (confirmed primary job or hard block).
create or replace function public.listing_availability(p_listing uuid, p_start timestamptz, p_end timestamptz)
returns text language plpgsql stable security definer set search_path = '' as $$
declare l public.listings; hard int; soft int;
begin
  select * into l from public.listings where id = p_listing and published;
  if not found or p_end <= p_start or p_end - p_start > interval '7 days' then return 'unknown'; end if;
  select count(*) filter (where j.status in ('confirmed','active') and j.role = 'primary'), count(*) filter (where j.status = 'held')
    into hard, soft from public.provider_jobs j
   where j.listing_id = l.id and tstzrange(j.starts_at, j.ends_at) && tstzrange(p_start, p_end);
  if l.kind = 'venue' and (select count(*) from public.spaces s where s.venue_id = l.id) > 1 then hard := 0; end if;
  if hard > 0 or exists(select 1 from public.availability_blocks a where (a.listing_id = l.id or (a.listing_id is null and a.space_id is null and a.crew_id is null and a.workspace_id = l.workspace_id))
      and a.kind in ('blocked','closed','maintenance') and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_start, p_end)) then return 'unavailable'; end if;
  if soft > 0 or exists(select 1 from public.build_items b join public.events e on e.id = b.event_id where b.listing_id = l.id and b.status = 'held'
      and e.starts_at is not null and tstzrange(e.starts_at, coalesce(e.ends_at, e.starts_at + interval '6 hours')) && tstzrange(p_start, p_end)) then return 'limited'; end if;
  return 'available';
end $$;
revoke all on function public.listing_availability(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.listing_availability(uuid, timestamptz, timestamptz) to authenticated;
