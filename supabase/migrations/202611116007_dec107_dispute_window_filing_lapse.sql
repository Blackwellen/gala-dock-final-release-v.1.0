-- Disputes Policy gd-dr-1.0 engine parity (coordinator 2026-11-11):
--   clause 4  : a booking dispute is opened within 24 hours after the event ends (dec107_settings.booking_review_hours), i.e. before
--               the payment is released. Cancelled bookings stay disputable (cancellation outcomes), and demo/QA are exempt.
--   clause 8.3: a party that asks for independent resolution must record proof of filing (provider + case reference, or a court
--               claim number) within escalation_days (14); otherwise the escalation is withdrawn and the recommendation stands
--               (or the dispute goes back to review when there is none).
--   clause 8.4: an opening party that does nothing for lapse days (14) after the other side answered lapses its dispute.
-- 8.2–8.4 run only when dispute_rules_in_force_from is set and reached (still NULL), only for disputes opened after it, only between
-- business parties who both accepted the dispute rules. Consumers are never bound by silence.
-- Replaces open_booking_dispute (adds the window check), dec107_dispute_close (outcome wording) and dec107_dispute_deadlines.

alter table public.dec107_settings add column if not exists lapse_days integer not null default 14 check (lapse_days between 1 and 60);

-- ───────────── clause 4: opening window ─────────────
create or replace function public.open_booking_dispute(p_item uuid, p_reason text, p_summary text, p_amount numeric default null::numeric)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare b public.build_items; ws uuid; party text; did uuid; j public.provider_jobs; ev_end timestamptz; s public.dec107_settings;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := public.listing_workspace(b.listing_id);
  party := case when public.has_workspace_role(ws, array['owner','manager']) then 'provider' when public.can_edit_event(b.event_id) then 'customer' end;
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status not in ('confirmed','active','fulfilled','completion_pending','completed','cancelled','cancelled_by_customer','cancelled_by_provider','partially_refunded') then
    raise exception 'not_disputable:%', b.status using errcode = '22023';
  end if;
  -- Disputes Policy clause 4: within 24 hours after the event ends (before release). Cancellations stay disputable; demo/QA exempt.
  select * into s from public.dec107_settings where id;
  select coalesce(e.ends_at, e.starts_at + interval '6 hours') into ev_end from public.events e where e.id = b.event_id;
  if ev_end is not null and now() > ev_end + make_interval(hours => s.booking_review_hours)
     and b.status in ('confirmed','active','fulfilled','completion_pending','completed') and not public.dec107_gate_exempt(ws) then
    raise exception 'dispute_window_closed' using errcode = '22023', hint = 'Disputes are opened within 24 hours after the event ends.';
  end if;
  select * into j from public.provider_jobs where build_item_id = b.id order by created_at desc limit 1;
  insert into public.booking_disputes(build_item_id, provider_job_id, event_id, workspace_id, opened_by, opened_by_party, reason, summary, amount_claimed, item_status_at_open,
      terms_snapshot, payment_snapshot, status)
    values (b.id, j.id, b.event_id, ws, auth.uid(), party, p_reason, trim(p_summary), p_amount, b.status, coalesce(b.terms_snapshot, '{}'),
      jsonb_build_object('amount', b.amount, 'deposit', b.deposit, 'paid_amount', j.paid_amount, 'payment_status', j.payment_status, 'captured_at', now()), 'opened')
    returning id into did;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (did, auth.uid(), party, 'statement', trim(p_summary));
  if b.status in ('confirmed','active','fulfilled','completion_pending','completed') then update public.build_items set status = 'disputed', updated_at = now() where id = b.id; end if;
  if party = 'customer' then
    perform public.notify_workspace(ws, array['owner','manager'], 'dispute_opened', 'Dispute opened on a booking', 'Respond within 72 hours with your account and evidence.', '/provider/disputes/' || did);
  else
    perform public.notify_event(b.event_id, 'dispute_opened', 'Your provider opened a dispute', 'Review it and add your side within 72 hours.', public.event_path(b.event_id, 'dispute', did));
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', ws, 'dispute.opened', jsonb_build_object('dispute_id', did, 'reason', p_reason, 'party', party));
  return did;
end $function$;

-- ───────────── clause 8.3: request independent resolution + proof of filing ─────────────
create or replace function public.dispute_request_independent(p_dispute uuid, p_route text)
returns void language plpgsql security definer set search_path to '' as $$
declare d public.booking_disputes; party text; r jsonb;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  party := public.dispute_party(d);
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status in ('resolved','escalated') then raise exception 'not_open' using errcode = '22023'; end if;
  r := public.dispute_route(d.id);
  if p_route not in (select jsonb_array_elements_text(r->'options')) or p_route = 'settlement' then raise exception 'route_not_available' using errcode = '22023'; end if;
  update public.booking_disputes set status = 'escalated', updated_at = now(),
    resolution = coalesce(resolution, '{}'::jsonb) || jsonb_build_object('escalation', jsonb_build_object('route', p_route, 'requested_by', party, 'requested_at', now()))
   where id = d.id;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), party, 'status',
    'Asked for independent resolution (' || replace(p_route, '_', ' ') || '). Proof of filing is due within 14 days.');
  perform public.dec107_dispute_notice(d.id, 'dispute_escalated', 'Independent resolution requested',
    'The ' || party || ' has asked for independent resolution. They file with the provider or court themselves and record the case reference here. Download the case pack from the dispute.');
end $$;
revoke all on function public.dispute_request_independent(uuid, text) from public, anon;
grant execute on function public.dispute_request_independent(uuid, text) to authenticated;

create or replace function public.dispute_record_filing(p_dispute uuid, p_provider text, p_reference text)
returns void language plpgsql security definer set search_path to '' as $$
declare d public.booking_disputes; party text;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  party := public.dispute_party(d);
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status <> 'escalated' or d.resolution->'escalation' is null then raise exception 'no_escalation' using errcode = '22023'; end if;
  if length(trim(coalesce(p_provider, ''))) < 2 or length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'filing_details_required' using errcode = '22023'; end if;
  update public.booking_disputes set updated_at = now(),
    resolution = resolution || jsonb_build_object('filing', jsonb_build_object('provider', trim(p_provider), 'reference', trim(p_reference), 'recorded_by', party, 'recorded_at', now()))
   where id = d.id;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), party, 'evidence',
    'Proof of filing: ' || trim(p_provider) || ', reference ' || trim(p_reference) || '.');
  perform public.dec107_dispute_notice(d.id, 'dispute_filing_recorded', 'Proof of filing recorded',
    'The ' || party || ' recorded a filing with ' || trim(p_provider) || ' (reference ' || trim(p_reference) || '). The payment stays where it is until an award, a settlement or the payment hold limit.');
end $$;
revoke all on function public.dispute_record_filing(uuid, text, text) from public, anon;
grant execute on function public.dispute_record_filing(uuid, text, text) to authenticated;

-- ───────────── outcomes (adds lapse / withdrawn escalation wording) ─────────────
create or replace function public.dec107_dispute_close(p_dispute uuid, p_basis text, p_refund_minor bigint, p_key text, p_by uuid, p_checked_by uuid default null)
returns void language plpgsql security definer set search_path to '' as $$
declare d public.booking_disputes;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if coalesce(p_refund_minor, 0) > 0 and p_basis in ('default_rule','settlement','accepted_recommendation','independent_award') then
    insert into public.dec107_refund_instructions(basis, dispute_id, build_item_id, amount_minor, idempotency_key, created_by, checked_by)
      values (p_basis, d.id, d.build_item_id, p_refund_minor, p_key, p_by, p_checked_by) on conflict (idempotency_key) do nothing;
  end if;
  update public.booking_disputes set status = 'resolved', resolved_at = now(), updated_at = now(),
    resolution = coalesce(resolution, '{}'::jsonb) || jsonb_build_object('outcome', p_basis, 'refund_minor', coalesce(p_refund_minor, 0), 'closed_at', now())
   where id = d.id and status <> 'resolved';
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (p_by, case when p_basis = 'independent_award' then 'admin' when p_by is null then 'system' else 'user' end, d.workspace_id, 'dispute.' || p_basis,
      jsonb_build_object('dispute_id', d.id, 'refund_minor', coalesce(p_refund_minor, 0)));
  perform public.dec107_dispute_notice(d.id, 'dispute_resolved', 'Dispute resolved',
    case p_basis when 'settlement' then 'You agreed a settlement. ' when 'accepted_recommendation' then 'The recommendation applies. '
                 when 'lapsed' then 'The dispute lapsed: the party that opened it did not respond for 14 days after the other side answered (Disputes Policy clause 8.4). '
                 else 'An independent award was entered and checked. ' end
    || case when coalesce(p_refund_minor, 0) > 0 then 'A refund of £' || to_char(p_refund_minor / 100.0, 'FM999G999G990D00') || ' is sent to the customer''s original payment method; the rest is released to the provider.'
            else 'Any payment held for this booking is released to the provider.' end);
end $$;
revoke all on function public.dec107_dispute_close(uuid, text, bigint, text, uuid, uuid) from public, anon, authenticated;

-- ───────────── clauses 8.2–8.4 (gated) ─────────────
create or replace function public.dec107_dispute_deadlines()
returns integer language plpgsql security definer set search_path to '' as $$
declare s public.dec107_settings; d record; n integer := 0; opener_last timestamptz; other_last timestamptz; rec_refund bigint;
begin
  select * into s from public.dec107_settings where id;
  if s.dispute_rules_in_force_from is null or s.dispute_rules_in_force_from > now() then return 0; end if;
  for d in
    select bd.* from public.booking_disputes bd
     where bd.status <> 'resolved' and bd.created_at >= s.dispute_rules_in_force_from and not public.dispute_is_consumer(bd)
       and exists (select 1 from public.consent_records c join public.workspaces w on w.owner_id = c.user_id
                    where w.id = bd.workspace_id and c.purpose = 'dispute_rules' and c.granted and c.policy_version = s.dispute_rules_version)
       and exists (select 1 from public.consent_records c join public.events e on e.id = bd.event_id join public.workspaces w on w.id = e.workspace_id
                    where c.user_id = w.owner_id and c.purpose = 'dispute_rules' and c.granted and c.policy_version = s.dispute_rules_version)
  loop
    rec_refund := round(coalesce((d.resolution->>'refund')::numeric, 0) * 100)::bigint;
    -- 8.2 deemed acceptance of a recommendation not rejected within recommendation_days
    if d.status = 'resolution_proposed' and (d.resolution->>'recommended_at')::timestamptz < now() - make_interval(days => s.recommendation_days) then
      update public.booking_disputes set customer_accepted_at = coalesce(customer_accepted_at, now()), provider_accepted_at = coalesce(provider_accepted_at, now()) where id = d.id;
      perform public.dec107_dispute_close(d.id, 'accepted_recommendation', rec_refund, 'deemed:' || d.id || ':' || coalesce(d.resolution->>'recommended_at', ''), null);
      n := n + 1; continue;
    end if;
    -- 8.3 no proof of filing within escalation_days → escalation withdrawn; the recommendation stands, else back to review
    if d.status = 'escalated' and d.resolution->'escalation' is not null and d.resolution->'filing' is null
       and (d.resolution->'escalation'->>'requested_at')::timestamptz < now() - make_interval(days => s.escalation_days) then
      insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, null, 'system', 'status',
        'No proof of filing within 14 days (Disputes Policy clause 8.3): the request for independent resolution is withdrawn.');
      if d.resolution ? 'recommended_at' then
        perform public.dec107_dispute_close(d.id, 'accepted_recommendation', rec_refund, 'withdrawn:' || d.id || ':' || (d.resolution->'escalation'->>'requested_at'), null);
      else
        update public.booking_disputes set status = 'review', updated_at = now(), resolution = resolution - 'escalation' where id = d.id;
      end if;
      n := n + 1; continue;
    end if;
    -- 8.4 the opening party lapses after lapse_days of inaction once the other side has answered
    if d.status in ('opened','evidence_collection','provider_response','review') then
      select max(created_at) into opener_last from public.booking_dispute_entries where dispute_id = d.id and party = d.opened_by_party;
      select max(created_at) into other_last from public.booking_dispute_entries where dispute_id = d.id and party = case d.opened_by_party when 'customer' then 'provider' else 'customer' end;
      if other_last is not null and other_last > coalesce(opener_last, d.created_at) and other_last < now() - make_interval(days => s.lapse_days) then
        perform public.dec107_dispute_close(d.id, 'lapsed', 0, 'lapsed:' || d.id, null);
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.dec107_dispute_deadlines() from public, anon, authenticated;
