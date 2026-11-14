-- Q57 add-on from the trust lane (lane bughunt-marketplace). Additive: a widened CHECK (superset) and three same-signature replacements.
-- 1. build_add_package refuses a provider (workspace or listing) under an active trust enforcement (trust_active_enforcement: workspace
--    suspended / booking block / listing hidden) with 'provider_unavailable'.
-- 2. create_job_for_confirmed_item: no provider job for such a provider. When the confirmation came from a payment captured in the same
--    transaction (deposit webhook) the booking is recovered like a date conflict — replacement_required + automatic full refund — with
--    its own kind 'provider_unavailable' and wording; otherwise the confirmation is refused.
-- 3. booking_conflict_recover: same body; the cancellation reason and both notifications say why when the kind is provider_unavailable.
-- Rollback: re-run the previous definitions (live before this file) and restore booking_conflicts_kind_check without provider_unavailable.

alter table public.booking_conflicts drop constraint if exists booking_conflicts_kind_check;
alter table public.booking_conflicts add constraint booking_conflicts_kind_check check (kind = any (array['hard_conflict', 'turnaround_conflict', 'exclusive_conflict',
  'blocked_conflict', 'venue_conflict', 'hold_conflict', 'capacity_conflict', 'crew_conflict', 'provider_unavailable']));

CREATE OR REPLACE FUNCTION public.build_add_package(p_event uuid, p_package uuid, p_role text DEFAULT 'primary'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; k public.packages; l public.listings; cat text; guests integer; est numeric; nid uuid; n integer;
begin
  select * into e from public.events where id = p_event for update;
  if not found or not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if e.status in ('completed','cancelled','archived') then raise exception 'event_closed' using errcode = '22023'; end if;
  if p_role not in ('primary','backup') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select * into k from public.packages where id = p_package and status = 'published';
  if not found then raise exception 'package_unavailable' using errcode = '22023'; end if;
  select * into l from public.listings where id = k.listing_id and published and paused_at is null;
  if not found then raise exception 'package_unavailable' using errcode = '22023'; end if;
  -- Q57 / trust: a provider under an active trust enforcement (workspace suspended, booking block, listing hidden) can't be booked.
  if exists(select 1 from public.trust_active_enforcement(l.workspace_id, l.id)) then raise exception 'provider_unavailable' using errcode = '22023'; end if;
  guests := greatest(coalesce(e.guest_count, 0), 1);
  if (k.min_guests is not null and guests < k.min_guests) or (k.max_guests is not null and guests > k.max_guests) then
    raise exception 'package_guest_range:%-%', coalesce(k.min_guests, 0), coalesce(k.max_guests, 0) using errcode = '22023';
  end if;
  if exists(select 1 from public.build_items b where b.event_id = p_event and b.listing_id = l.id and public.build_budget_bucket(b.status) <> 'excluded') then
    raise exception 'already_in_build' using errcode = '23505';
  end if;
  select coalesce(t.meta->>'build', case when l.kind = 'venue' then 'venue' else 'extras' end) into cat
    from (select 1) x left join public.taxonomy_terms t on t.taxonomy = 'service_category' and t.key = lower(l.category);
  if l.kind = 'venue' then cat := 'venue'; end if;
  est := case when k.price_basis in ('per_person','per_guest','per_head') then k.base_price * guests else k.base_price end;
  select count(*) into n from public.build_items where event_id = p_event;
  insert into public.build_items(event_id, listing_id, category, title, package, scope, image, amount, price_basis, quote, status, role, sort)
    values (p_event, l.id, cat, l.name, k.name, left(coalesce(k.description, ''), 500), coalesce(nullif(k.image, ''), l.image), round(est, 2),
      case when k.price_basis in ('per_person','per_guest','per_head') then 'per_person' else 'estimate' end,
      jsonb_build_object('package_id', k.id, 'package_name', k.name, 'base_price_minor', round(k.base_price * 100)::bigint, 'price_basis', k.price_basis,
        'guests', guests, 'deposit_pct', k.deposit_pct, 'inclusions', coalesce(k.inclusions, '[]'), 'add_ons', coalesce(k.add_ons, '[]'), 'snapshotted_at', now()),
      'suggested', p_role, n + 1)
    returning build_items.id into nid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', e.workspace_id, 'build_engine.package_added', jsonb_build_object('event_id', p_event, 'build_item_id', nid, 'package_id', k.id));
  return nid;
end $function$;

CREATE OR REPLACE FUNCTION public.booking_conflict_recover(p_item uuid, p_order uuid, p_kind text, p_detail text, p_space uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.build_items; po public.payment_orders; ws uuid; cid uuid; xid uuid; e public.events;
begin
  select * into b from public.build_items where id = p_item;
  select * into po from public.payment_orders where id = p_order;
  select * into e from public.events where id = b.event_id;
  ws := public.listing_workspace(b.listing_id);
  insert into public.booking_conflicts(workspace_id, build_item_id, event_id, listing_id, space_id, kind, detail, source, payment_order_ref)
    values (ws, b.id, b.event_id, b.listing_id, p_space, p_kind, left(coalesce(p_detail, ''), 500), 'marketplace_confirmation', po.reference)
    returning id into cid;
  update public.build_items set status = 'replacement_required', updated_at = now(),
      terms_snapshot = coalesce(terms_snapshot, '{}') || jsonb_build_object('booking_conflict', cid)
    where id = b.id;
  -- Full refund on the seller's charge through the Q07 path: a completed platform-party cancellation with refund_status 'due'
  -- is picked up by processPayments() → refundMerchantCharge() on the connected account (customer fee refunded too).
  if po.id is not null then
    insert into public.booking_cancellations(build_item_id, event_id, workspace_id, party, kind, reason, item_status_before, policy_snapshot, calculation, status)
      values (b.id, b.event_id, ws, 'platform', 'full', case when p_kind = 'provider_unavailable' then 'Automatic: the provider could not take bookings when payment completed.' else 'Automatic: the date was no longer available when payment completed (' || p_kind || ').' end, 'confirmed',
        jsonb_build_object('policy', 'booking_conflict_full_refund'),
        jsonb_build_object('refund_amount', po.amount_minor / 100.0, 'basis', 'booking_conflict', 'payment_order', po.reference, 'conflict_id', cid), 'requested')
      returning id into xid;
    update public.booking_cancellations set status = 'accepted', decided_at = now(), decision_note = 'Automatic: booking conflict at confirmation', updated_at = now() where id = xid;
    update public.booking_cancellations set status = 'completed', updated_at = now() where id = xid;
    update public.booking_conflicts set status = 'refund_queued', cancellation_id = xid where id = cid;
  end if;
  perform public.notify_workspace(ws, array['owner','manager'], 'request_received', 'Booking could not be confirmed: ' || coalesce(e.name, b.title),
    case when p_kind = 'provider_unavailable' then 'Your account could not take this booking when payment completed (a trust restriction is active), so it was not confirmed and the customer is being refunded in full.' else 'The date was taken before payment completed, so this booking was not confirmed and the customer is being refunded in full.' end, '/provider/opportunities/' || b.id);
  perform public.notify_event(b.event_id, 'event_update', 'Booking not confirmed: ' || b.title,
    case when p_kind = 'provider_unavailable' then 'This provider can''t take bookings right now, so the booking was not confirmed. You will be refunded in full; choose another option or a backup.' else 'The provider''s date was taken before your payment completed. You will be refunded in full; choose another option or a backup.' end,
    public.event_path(b.event_id, 'booking', b.id));
  insert into public.audit_events(actor_type, workspace_id, event, metadata)
    values ('system', ws, 'booking.conflict_detected', jsonb_build_object('build_item_id', b.id, 'conflict_id', cid, 'kind', p_kind, 'payment_order', po.reference, 'cancellation_id', xid));
  return cid;
end $function$;

CREATE OR REPLACE FUNCTION public.create_job_for_confirmed_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.listings; e public.events; ws public.workspaces; fee numeric; sid uuid; ssrc text; po_id uuid; jid uuid; err text; det text; dtl jsonb := '{}';
begin
  if new.status <> 'confirmed' or old.status = 'confirmed' or new.listing_id is null then return new; end if;
  if exists(select 1 from public.provider_jobs where build_item_id = new.id) then return new; end if;
  select * into l from public.listings where id = new.listing_id;
  select * into ws from public.workspaces where id = l.workspace_id;
  select * into e from public.events where id = new.event_id;
  if l.kind = 'venue' then
    select x.space_id, x.source into sid, ssrc from public.booking_item_space(new.id) x;
    dtl := jsonb_build_object('occupancy', case when sid is null then 'whole_venue' else 'space' end, 'space_source', coalesce(ssrc, 'unassigned'));
  end if;
  -- Was this confirmation produced by a payment captured in this same transaction (deposit webhook)?
  select p.id into po_id from public.payment_orders p
    where p.build_item_id = new.id and p.stripe_payment_intent is not null and p.status in ('payment_succeeded','protected_pending_delivery') and p.updated_at = now()
    order by p.created_at desc limit 1;
  -- Q57 / trust: no job for a provider under an active trust enforcement. Paid in this transaction (deposit webhook): the booking
  -- goes to replacement_required with a full refund (booking_conflict_recover, kind provider_unavailable); otherwise refuse.
  if exists(select 1 from public.trust_active_enforcement(l.workspace_id, l.id)) then
    if po_id is null then raise exception 'provider_unavailable' using errcode = '22023'; end if;
    perform public.booking_conflict_recover(new.id, po_id, 'provider_unavailable', 'trust enforcement active', sid);
    return new;
  end if;
  fee := round(coalesce(new.amount, 0) * ws.commission_bps / 10000.0, 2);
  begin
    insert into public.provider_jobs(reference, workspace_id, build_item_id, event_id, listing_id, space_id, mode, client_name, event_name, event_type,
        starts_at, ends_at, guests, location, status, role, value, platform_fee, net_payout, source, commercial_snapshot, details, image)
      values ('BK-' || upper(substr(replace(new.id::text, '-', ''), 1, 6)), l.workspace_id, new.id, e.id, l.id, sid, l.kind,
        coalesce(nullif(e.client_name, ''), 'Event client'), e.name, e.event_type,
        coalesce(e.starts_at, now()), coalesce(e.ends_at, coalesce(e.starts_at, now()) + interval '6 hours'), e.guest_count, coalesce(nullif(e.location, ''), e.city),
        'confirmed', new.role, coalesce(new.amount, 0), fee, coalesce(new.amount, 0) - fee,
        case when new.role = 'standby' then 'standby' else 'marketplace' end,
        coalesce(new.terms_snapshot, '{}') || jsonb_build_object('commission_bps', ws.commission_bps, 'platform_fee', fee, 'quote', new.quote, 'space_id', sid),
        dtl, coalesce(nullif(e.cover_image, ''), l.image))
      returning id into jid;
  exception when exclusion_violation then
    get stacked diagnostics err = message_text, det = pg_exception_detail;
    if err not in ('turnaround_conflict','exclusive_conflict','blocked_conflict','venue_conflict','hold_conflict','capacity_conflict') then err := 'hard_conflict'; end if;
    if po_id is null then raise exception '%', err using errcode = '23P01', detail = coalesce(det, ''); end if;
    perform public.booking_conflict_recover(new.id, po_id, err, det, sid);
    return new;
  end;
  if sid is not null and new.space_id is distinct from sid then update public.build_items set space_id = sid where id = new.id; end if;
  insert into public.audit_events(workspace_id, event, metadata) values (l.workspace_id, 'booking.created',
    jsonb_build_object('build_item_id', new.id, 'source', 'marketplace', 'job_id', jid, 'space_id', sid, 'space_source', ssrc));
  return new;
end $function$;
