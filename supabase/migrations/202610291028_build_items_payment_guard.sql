-- P1 security (Q10 finding, lane A 2026-10-29): build_items_rw lets anyone with event access write a build line directly.
-- Until now a buyer could PATCH status='confirmed' (or any payment-dependent state) through REST, or call
-- transition_build_item(..., 'confirmed'), and get a binding booking (and a provider job) without paying.
--
-- Fix (additive, backward compatible):
--   1. build_items_client_guard: BEFORE INSERT/UPDATE/DELETE trigger that applies only to direct client writes
--      (current_user = authenticated/anon). Definer commands (payment_order_succeeded, customer_save_booking, provider_*,
--      transition_build_item, order/hold/standby/cancellation engines) run as the function owner and are unaffected;
--      service-role workers are unaffected.
--        * INSERT: only planning states (suggested, draft, or sent for a marketplace request line) and no provider/payment fields.
--        * UPDATE: buyer-editable fields only (title/package/scope/image/notes/sort/role/updated_at); draft composition
--          (listing, category, amount, deposit, price basis, quote estimate) only while the line is suggested/draft;
--          the only direct status change is a buyer cancellation of an uncommitted line.
--        * DELETE: only suggested/draft lines (committed lines are cancelled through the cancellation engine).
--   2. transition_build_item(…,'confirmed'): a marketplace line with something to pay is refused with payment_required —
--      confirmation comes from the payment path (create_payment_order → Stripe direct charge → payment_order_succeeded).
--      Still allowed: off-platform lines (no listing, nothing to pay) and a provider quote of £0.

create or replace function public.build_items_client_guard()
returns trigger language plpgsql set search_path to '' as $$
declare
  -- States from which the buyer may cancel directly (no provider commitment, no money taken).
  open_states constant text[] := array['suggested','draft','enquiry_created','requested','sent','awaiting','awaiting_provider','clarification',
    'clarification_requested','available','quoted','quote_received','quote_revised','customer_reviewing','hold','held','conditional_hold_requested',
    'standby','expired','expired_no_response','declined','unavailable'];
  composing boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('suggested', 'draft', 'sent') or (new.status = 'sent' and new.request_id is null) then
      raise exception 'build_item_status_requires_command:%', new.status using errcode = '42501',
        hint = 'New build lines start as suggested/draft; requests, holds and confirmations go through their commands.';
    end if;
    if new.terms_snapshot is not null or new.hold_expires_at is not null or new.responded_at is not null or new.response_status is not null
       or new.status_before_hold is not null or new.space_id is not null or coalesce(new.response_reminders, 0) <> 0 or new.sent_at is not null then
      raise exception 'build_item_protected_fields' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status not in ('suggested', 'draft') then
      raise exception 'build_item_not_deletable:%', old.status using errcode = '42501', hint = 'Cancel committed lines through the cancellation flow.';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.event_id is distinct from old.event_id or new.request_id is distinct from old.request_id
     or new.terms_snapshot is distinct from old.terms_snapshot or new.hold_expires_at is distinct from old.hold_expires_at
     or new.response_deadline is distinct from old.response_deadline or new.sent_at is distinct from old.sent_at
     or new.responded_at is distinct from old.responded_at or new.response_status is distinct from old.response_status
     or new.response_reminders is distinct from old.response_reminders or new.status_before_hold is distinct from old.status_before_hold
     or new.space_id is distinct from old.space_id or new.created_at is distinct from old.created_at or new.id is distinct from old.id then
    raise exception 'build_item_protected_fields' using errcode = '42501';
  end if;
  composing := old.status in ('suggested', 'draft');
  if not composing and (new.listing_id is distinct from old.listing_id or new.category is distinct from old.category
     or new.amount is distinct from old.amount or new.deposit is distinct from old.deposit
     or new.price_basis is distinct from old.price_basis or new.quote is distinct from old.quote) then
    raise exception 'build_item_terms_locked:%', old.status using errcode = '42501', hint = 'Prices and terms change only through quotes.';
  end if;
  if new.status is distinct from old.status then
    if not (composing and new.status in ('suggested', 'draft'))
       and not (new.status in ('cancelled', 'cancelled_by_customer') and old.status = any(open_states)) then
      raise exception 'build_item_status_requires_command:%->%', old.status, new.status using errcode = '42501',
        hint = 'Confirmation and payment states are set by the payment path; use the booking commands.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists build_items_client_guard on public.build_items;
-- Named to sort before build_items_response_track / build_items_state_guard so a refused write never reaches them.
create trigger build_items_client_guard before insert or update or delete on public.build_items
  for each row execute function public.build_items_client_guard();

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
    when p_to = 'cancelled' then b.status not in ('fulfilled','cancelled')
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

revoke all on function public.build_items_client_guard() from public, anon, authenticated;
revoke all on function public.transition_build_item(uuid, text, integer) from public, anon;
grant execute on function public.transition_build_item(uuid, text, integer) to authenticated, service_role;
