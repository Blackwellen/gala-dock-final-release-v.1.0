-- DEC-107 disputes for Gala Dock (owner decision 2026-11-11; docs/backend/payments/dec107-gala-dock.md §5).
--   * Staff only RECOMMEND. Money moves on: an accepted recommendation, a settlement between the parties, an independent award
--     entered by one member of staff and checked by a second, or the hold-limit default rule (202611116001). Staff can no longer
--     close a dispute or set a refund amount on their own.
--   * Consumer tiers: no arbitration for consumers at £5,000 or less (Arbitration Act 1996 s.91 + 1999 Order); parties file
--     with the provider themselves; the platform gives a downloadable case pack.
--   * Deadline rules (deemed acceptance) run only when dec107_settings.dispute_rules_in_force_from is set and reached, only for
--     disputes opened after it, and never against consumers.
--   * Notices use dispute_* kinds, which email_category() files under 'payments' (mandatory). Before this, every dispute notice
--     used 'provider.request', which is filed under 'quotes' and could be switched off by the recipient.
-- Replaces the bodies of open_booking_dispute, admin_dispute_update, accept_dispute_resolution and decide_cancellation; every
-- other behaviour of those functions is kept exactly.

-- ───────────────────────── 1. consumer test + route ─────────────────────────
create or replace function public.dispute_is_consumer(d public.booking_disputes)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select e.management = 'consumer' from public.events e where e.id = d.event_id), false);
$$;
revoke all on function public.dispute_is_consumer(public.booking_disputes) from public, anon, authenticated;

/** The independent-resolution route open to the parties for this dispute's amount and customer type. */
create or replace function public.dispute_route(p_dispute uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare d public.booking_disputes; s public.dec107_settings; amt bigint; consumer boolean; tier text; opts text[];
begin
  select * into d from public.booking_disputes where id = p_dispute;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.dispute_party(d) is null and not public.is_platform_admin() and auth.uid() is not null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into s from public.dec107_settings where id;
  amt := round(coalesce(d.amount_claimed, 0) * 100)::bigint; consumer := public.dispute_is_consumer(d);
  tier := case when amt <= s.small_claim_minor then 'small' when amt <= s.consumer_arbitration_floor_minor then 'mid' else 'large' end;
  opts := case
    when tier = 'small' then array['settlement','court']
    when consumer and tier = 'mid' then array['settlement','mediation_if_both_agree','court']
    when consumer then array['settlement','arbitration_if_consumer_consents_after_dispute_started','mediation_if_both_agree','court']
    else array['settlement','arbitration','court'] end;
  return jsonb_build_object('amount_minor', amt, 'consumer', consumer, 'tier', tier, 'options', to_jsonb(opts),
    'arbitration_allowed', not consumer and tier <> 'small' or (consumer and tier = 'large'),
    'note', case when consumer and amt <= s.consumer_arbitration_floor_minor then 'Arbitration is not available to consumers for claims of £5,000 or less.' end,
    'deadline_rules_in_force', s.dispute_rules_in_force_from is not null and s.dispute_rules_in_force_from <= now() and d.created_at >= s.dispute_rules_in_force_from and not consumer,
    'filing', 'Parties file with the provider (for example CEDR or ProMediate) or the court themselves. Gala Dock does not fill in forms or pay provider fees; download the case pack to file.');
end $$;
revoke all on function public.dispute_route(uuid) from public, anon;
grant execute on function public.dispute_route(uuid) to authenticated;

-- ───────────────────────── 2. settlements and awards ─────────────────────────
create table if not exists public.booking_dispute_settlements (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.booking_disputes(id) on delete cascade,
  offered_by uuid not null,
  party text not null check (party in ('customer','provider')),
  refund_minor bigint not null check (refund_minor >= 0),
  note text,
  status text not null default 'open' check (status in ('open','accepted','withdrawn','superseded')),
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists booking_dispute_settlements_one_open on public.booking_dispute_settlements (dispute_id) where status = 'open';
alter table public.booking_dispute_settlements enable row level security;
drop policy if exists booking_dispute_settlements_read on public.booking_dispute_settlements;
create policy booking_dispute_settlements_read on public.booking_dispute_settlements for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.booking_disputes d where d.id = dispute_id and public.dispute_party(d) is not null));
revoke all on public.booking_dispute_settlements from anon, authenticated;
grant select on public.booking_dispute_settlements to authenticated;

create table if not exists public.booking_dispute_awards (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.booking_disputes(id) on delete cascade,
  refund_minor bigint not null check (refund_minor >= 0),
  provider text not null check (length(trim(provider)) >= 2),
  reference text not null check (length(trim(reference)) >= 3),
  document_sha256 text check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  entered_by uuid not null,
  checked_by uuid,
  checked_at timestamptz,
  status text not null default 'entered' check (status in ('entered','checked','rejected')),
  created_at timestamptz not null default now(),
  constraint booking_dispute_awards_second_person check (checked_by is null or checked_by is distinct from entered_by)
);
alter table public.booking_dispute_awards enable row level security;
drop policy if exists booking_dispute_awards_read on public.booking_dispute_awards;
create policy booking_dispute_awards_read on public.booking_dispute_awards for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.booking_disputes d where d.id = dispute_id and public.dispute_party(d) is not null));
revoke all on public.booking_dispute_awards from anon, authenticated;
grant select on public.booking_dispute_awards to authenticated;

/** Queues the agreed refund (if any) and closes the dispute. Internal: callers authorise. */
create or replace function public.dec107_dispute_close(p_dispute uuid, p_basis text, p_refund_minor bigint, p_key text, p_by uuid, p_checked_by uuid default null)
returns void language plpgsql security definer set search_path to '' as $$
declare d public.booking_disputes;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if coalesce(p_refund_minor, 0) > 0 then
    insert into public.dec107_refund_instructions(basis, dispute_id, build_item_id, amount_minor, idempotency_key, created_by, checked_by)
      values (p_basis, d.id, d.build_item_id, p_refund_minor, p_key, p_by, p_checked_by) on conflict (idempotency_key) do nothing;
  end if;
  update public.booking_disputes set status = 'resolved', resolved_at = now(), updated_at = now(),
    resolution = coalesce(resolution, '{}'::jsonb) || jsonb_build_object('outcome', p_basis, 'refund_minor', coalesce(p_refund_minor, 0), 'closed_at', now())
   where id = d.id and status <> 'resolved';
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (p_by, case when p_basis = 'independent_award' then 'admin' else 'user' end, d.workspace_id, 'dispute.' || p_basis,
      jsonb_build_object('dispute_id', d.id, 'refund_minor', coalesce(p_refund_minor, 0)));
  perform public.dec107_dispute_notice(d.id, 'dispute_resolved', 'Dispute resolved',
    case p_basis when 'settlement' then 'You agreed a settlement. ' when 'accepted_recommendation' then 'Both of you accepted the recommendation. '
                 else 'An independent award was entered and checked. ' end
    || case when coalesce(p_refund_minor, 0) > 0 then 'A refund of £' || to_char(p_refund_minor / 100.0, 'FM999G999G990D00') || ' is sent to the customer''s original payment method; the rest is released to the provider.'
            else 'Any payment held for this booking is released to the provider.' end);
end $$;
revoke all on function public.dec107_dispute_close(uuid, text, bigint, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.dispute_offer_settlement(p_dispute uuid, p_refund numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare d public.booking_disputes; party text; sid uuid; paid numeric;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  party := public.dispute_party(d);
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status = 'resolved' then raise exception 'not_open' using errcode = '22023'; end if;
  paid := coalesce((d.payment_snapshot->>'paid_amount')::numeric, (d.payment_snapshot->>'amount')::numeric, 0);
  if p_refund is null or p_refund < 0 or (paid > 0 and p_refund > paid) then raise exception 'invalid_refund' using errcode = '22023'; end if;
  update public.booking_dispute_settlements set status = 'superseded' where dispute_id = d.id and status = 'open';
  insert into public.booking_dispute_settlements(dispute_id, offered_by, party, refund_minor, note) values (d.id, auth.uid(), party, round(p_refund * 100)::bigint, left(p_note, 1000)) returning id into sid;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), party, 'proposal',
    'Settlement offer: refund £' || to_char(p_refund, 'FM999G999G990D00') || coalesce('. ' || left(p_note, 500), ''));
  perform public.dec107_dispute_notice(d.id, 'dispute_settlement_offer', 'Settlement offer on a dispute',
    'The ' || party || ' offered to settle with a refund of £' || to_char(p_refund, 'FM999G999G990D00') || '. Open the dispute to accept it.');
  return sid;
end $$;
revoke all on function public.dispute_offer_settlement(uuid, numeric, text) from public, anon;
grant execute on function public.dispute_offer_settlement(uuid, numeric, text) to authenticated;

create or replace function public.dispute_accept_settlement(p_settlement uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare st public.booking_dispute_settlements; d public.booking_disputes; party text;
begin
  select * into st from public.booking_dispute_settlements where id = p_settlement for update;
  if not found or st.status <> 'open' then raise exception 'not_open' using errcode = '22023'; end if;
  select * into d from public.booking_disputes where id = st.dispute_id for update;
  party := public.dispute_party(d);
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if party = st.party then raise exception 'other_party_must_accept' using errcode = '22023'; end if;
  update public.booking_dispute_settlements set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = st.id;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), party, 'decision', 'Accepted the settlement offer.');
  perform public.dec107_dispute_close(d.id, 'settlement', st.refund_minor, 'settlement:' || st.id, auth.uid());
  return 'resolved';
end $$;
revoke all on function public.dispute_accept_settlement(uuid) from public, anon;
grant execute on function public.dispute_accept_settlement(uuid) to authenticated;

/** Staff enter an independent award (provider + reference, optional document hash). It has no effect until a second person checks it. */
create or replace function public.adm_dispute_award_enter(p_dispute uuid, p_refund numeric, p_provider text, p_reference text, p_document_sha256 text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare d public.booking_disputes; aid uuid;
begin
  perform public.admin_mfa_required();
  if not (public.has_admin_permission('support') or public.has_admin_permission('marketplace')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.status = 'resolved' then raise exception 'not_open' using errcode = '22023'; end if;
  if p_refund is null or p_refund < 0 then raise exception 'invalid_refund' using errcode = '22023'; end if;
  insert into public.booking_dispute_awards(dispute_id, refund_minor, provider, reference, document_sha256, entered_by)
    values (d.id, round(p_refund * 100)::bigint, trim(p_provider), trim(p_reference), lower(nullif(trim(p_document_sha256), '')), auth.uid()) returning id into aid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', d.workspace_id, 'dispute.award_entered',
    jsonb_build_object('dispute_id', d.id, 'award_id', aid, 'provider', trim(p_provider), 'reference', trim(p_reference), 'refund', p_refund));
  return aid;
end $$;
revoke all on function public.adm_dispute_award_enter(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.adm_dispute_award_enter(uuid, numeric, text, text, text) to authenticated;

create or replace function public.adm_dispute_award_check(p_award uuid, p_confirm boolean, p_note text)
returns void language plpgsql security definer set search_path to '' as $$
declare a public.booking_dispute_awards;
begin
  perform public.admin_mfa_required();
  if not (public.has_admin_permission('support') or public.has_admin_permission('marketplace')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into a from public.booking_dispute_awards where id = p_award for update;
  if not found or a.status <> 'entered' then raise exception 'not_open' using errcode = '22023'; end if;
  if a.entered_by = auth.uid() then raise exception 'second_person_required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.booking_dispute_awards set status = case when p_confirm then 'checked' else 'rejected' end, checked_by = auth.uid(), checked_at = now() where id = a.id;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'dispute.award_' || case when p_confirm then 'checked' else 'rejected' end,
    jsonb_build_object('award_id', a.id, 'dispute_id', a.dispute_id, 'note', left(p_note, 300)));
  if p_confirm then perform public.dec107_dispute_close(a.dispute_id, 'independent_award', a.refund_minor, 'award:' || a.id, a.entered_by, auth.uid()); end if;
end $$;
revoke all on function public.adm_dispute_award_check(uuid, boolean, text) from public, anon;
grant execute on function public.adm_dispute_award_check(uuid, boolean, text) to authenticated;

-- ───────────────────────── 3. existing functions: recommendation-only + valid notice kinds ─────────────────────────
create or replace function public.open_booking_dispute(p_item uuid, p_reason text, p_summary text, p_amount numeric default null::numeric)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare b public.build_items; ws uuid; party text; did uuid; j public.provider_jobs;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := public.listing_workspace(b.listing_id);
  party := case when public.has_workspace_role(ws, array['owner','manager']) then 'provider' when public.can_edit_event(b.event_id) then 'customer' end;
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status not in ('confirmed','active','fulfilled','completion_pending','completed','cancelled','cancelled_by_customer','cancelled_by_provider','partially_refunded') then
    raise exception 'not_disputable:%', b.status using errcode = '22023';
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

create or replace function public.admin_dispute_update(p_dispute uuid, p_status text, p_note text, p_resolution jsonb default null::jsonb)
returns void language plpgsql security definer set search_path to '' as $function$
declare d public.booking_disputes; rec jsonb;
begin
  perform public.admin_mfa_required();   -- Q31 S2: platform admins need aal2 for every admin mutation
  if not (public.has_admin_permission('support') or public.has_admin_permission('marketplace')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_status = 'resolution_proposed' and p_resolution is null then raise exception 'resolution_required' using errcode = '22023'; end if;
  -- DEC-107: staff only recommend. A dispute is resolved by the parties (acceptance or settlement), a checked independent award or
  -- the default rule — never by a staff status change.
  if p_status = 'resolved' and not (d.customer_accepted_at is not null and d.provider_accepted_at is not null) then
    raise exception 'recommendation_only' using errcode = '42501', hint = 'Staff recommend; the parties accept or settle, or an independent award is entered and checked.';
  end if;
  rec := case when p_resolution is not null then p_resolution || jsonb_build_object('kind', 'recommendation', 'binding', false, 'recommended_at', now(), 'route', public.dispute_route(d.id)) end;
  update public.booking_disputes set status = p_status, resolution = coalesce(rec, resolution), assignee_id = coalesce(assignee_id, auth.uid()),
    customer_accepted_at = case when p_status = 'resolution_proposed' then null else customer_accepted_at end,
    provider_accepted_at = case when p_status = 'resolution_proposed' then null else provider_accepted_at end,
    resolved_at = case when p_status = 'resolved' then now() end, updated_at = now() where id = d.id;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), 'admin', case when p_resolution is not null then 'proposal' else 'status' end, left(p_note, 6000));
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'admin', d.workspace_id, 'dispute.' || p_status, jsonb_build_object('dispute_id', d.id, 'note', left(p_note, 500)));
  perform public.dec107_dispute_notice(d.id, 'dispute_update',
    case when p_status = 'resolution_proposed' then 'Recommendation on your dispute' else 'Dispute update: ' || replace(p_status, '_', ' ') end,
    case when p_status = 'resolution_proposed' then 'Gala Dock has made a recommendation. It is not binding: accept it, settle, or take the dispute to independent resolution or court. ' else '' end || left(p_note, 300));
end $function$;

create or replace function public.accept_dispute_resolution(p_dispute uuid)
returns text language plpgsql security definer set search_path to '' as $function$
declare d public.booking_disputes; party text;
begin
  select * into d from public.booking_disputes where id = p_dispute for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  party := public.dispute_party(d);
  if party is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if d.status <> 'resolution_proposed' then raise exception 'no_proposal' using errcode = '22023'; end if;
  update public.booking_disputes set customer_accepted_at = case when party = 'customer' then now() else customer_accepted_at end,
    provider_accepted_at = case when party = 'provider' then now() else provider_accepted_at end, updated_at = now() where id = d.id returning * into d;
  insert into public.booking_dispute_entries(dispute_id, author_id, party, kind, body) values (d.id, auth.uid(), party, 'decision', 'Accepted the proposed resolution.');
  if d.customer_accepted_at is not null and d.provider_accepted_at is not null then
    -- Both accepted: Gala Dock carries out exactly the recommendation (refund in pounds → instruction in pence).
    perform public.dec107_dispute_close(d.id, 'accepted_recommendation', round(coalesce((d.resolution->>'refund')::numeric, 0) * 100)::bigint,
      'accepted:' || d.id || ':' || coalesce(d.resolution->>'recommended_at', d.updated_at::text), auth.uid());
    return 'resolved';
  end if;
  return 'accepted';
end $function$;

create or replace function public.decide_cancellation(p_cancellation uuid, p_accept boolean, p_note text default ''::text, p_refund numeric default null::numeric)
returns void language plpgsql security definer set search_path to '' as $function$
declare c public.booking_cancellations; actor text; is_admin boolean;
begin
  select * into c from public.booking_cancellations where id = p_cancellation for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  is_admin := public.has_admin_permission('support') or public.has_admin_permission('commerce');
  actor := case when public.has_workspace_role(c.workspace_id, array['owner','manager']) then 'provider' when public.can_edit_event(c.event_id) then 'customer' end;
  if c.status = 'manual_review' and not is_admin then raise exception 'admin_review_required' using errcode = '42501'; end if;
  if is_admin and actor is null then perform public.admin_mfa_required(); end if; if is_admin and actor is null and length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if c.status = 'requested' and (actor is null or (c.party = actor) or (c.party = 'mutual' and c.requested_by = auth.uid())) and not is_admin then raise exception 'not_authorized' using errcode = '42501'; end if;
  if c.status not in ('requested','manual_review') then raise exception 'not_open:%', c.status using errcode = '22023'; end if;
  -- DEC-107: staff never set a refund amount. Accepting applies the cancellation policy agreed at booking; a different amount
  -- needs the parties (a dispute settlement) or an independent award.
  if p_refund is not null then raise exception 'recommendation_only' using errcode = '42501', hint = 'Open a dispute recommendation; the parties settle or accept it.'; end if;
  update public.booking_cancellations set status = case when p_accept then 'accepted' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
    decision_note = left(coalesce(p_note, ''), 1000), updated_at = now() where id = c.id;
  if p_accept then perform public.apply_cancellation(c.id);
  else update public.build_items set status = c.item_status_before, updated_at = now() where id = c.build_item_id and status = 'cancellation_requested';
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), case when is_admin and actor is null then 'admin' else 'user' end, c.workspace_id, 'cancellation.' || case when p_accept then 'accepted' else 'rejected' end,
      jsonb_build_object('cancellation_id', c.id, 'refund', null));
end $function$;

-- ───────────────────────── 4. deadline rules (gated) ─────────────────────────
/**
 * Deemed acceptance of a recommendation after the recommendation window — only when the Disputes Policy is in force
 * (dispute_rules_in_force_from set and reached), only for disputes opened after it, only for business customers (never
 * consumers), and only when both sides recorded the dispute-rules express term. With the setting NULL (today) nothing runs.
 */
create or replace function public.dec107_dispute_deadlines()
returns integer language plpgsql security definer set search_path to '' as $$
declare s public.dec107_settings; d record; n integer := 0;
begin
  select * into s from public.dec107_settings where id;
  if s.dispute_rules_in_force_from is null or s.dispute_rules_in_force_from > now() then return 0; end if;
  for d in
    select bd.* from public.booking_disputes bd
     where bd.status = 'resolution_proposed' and bd.created_at >= s.dispute_rules_in_force_from and not public.dispute_is_consumer(bd)
       and (bd.resolution->>'recommended_at')::timestamptz < now() - make_interval(days => s.recommendation_days)
       and exists (select 1 from public.consent_records c join public.workspaces w on w.owner_id = c.user_id
                    where w.id = bd.workspace_id and c.purpose = 'dispute_rules' and c.granted and c.policy_version = s.dispute_rules_version)
       and exists (select 1 from public.consent_records c join public.events e on e.id = bd.event_id join public.workspaces w on w.id = e.workspace_id
                    where c.user_id = w.owner_id and c.purpose = 'dispute_rules' and c.granted and c.policy_version = s.dispute_rules_version)
  loop
    update public.booking_disputes set customer_accepted_at = coalesce(customer_accepted_at, now()), provider_accepted_at = coalesce(provider_accepted_at, now()) where id = d.id;
    perform public.dec107_dispute_close(d.id, 'accepted_recommendation', round(coalesce((d.resolution->>'refund')::numeric, 0) * 100)::bigint,
      'deemed:' || d.id || ':' || coalesce(d.resolution->>'recommended_at', ''), null);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.dec107_dispute_deadlines() from public, anon, authenticated;

/** Express term: the dispute rules, accepted at each side's first commercial step (version, user and time recorded). */
create or replace function public.accept_dispute_rules(p_version text, p_source text default 'app')
returns void language plpgsql security definer set search_path to '' as $$
declare v text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select dispute_rules_version into v from public.dec107_settings where id;
  if p_version is distinct from v then raise exception 'terms_version_changed' using errcode = '22023', hint = v; end if;
  insert into public.consent_records(user_id, purpose, granted, policy_version, source, context)
    values (auth.uid(), 'dispute_rules', true, v, left(coalesce(p_source, 'app'), 60), jsonb_build_object('accepted_at', now()));
end $$;
revoke all on function public.accept_dispute_rules(text, text) from public, anon;
grant execute on function public.accept_dispute_rules(text, text) to authenticated;

-- ───────────────────────── 5. case pack ─────────────────────────
/** Everything a party needs to file with an ADR provider or court. Parties and staff only. Hashes, not file contents. */
create or replace function public.dispute_case_pack(p_dispute uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare d public.booking_disputes; party text; b public.build_items;
begin
  select * into d from public.booking_disputes where id = p_dispute;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  party := public.dispute_party(d);
  if party is null and not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into b from public.build_items where id = d.build_item_id;
  return jsonb_build_object(
    'generated_at', now(), 'dispute', jsonb_build_object('reference', d.reference, 'status', d.status, 'reason', d.reason, 'summary', d.summary,
      'amount_claimed', d.amount_claimed, 'opened_by', d.opened_by_party, 'opened_at', d.created_at, 'consumer_customer', public.dispute_is_consumer(d)),
    'booking', jsonb_build_object('title', b.title, 'category', b.category, 'amount', b.amount, 'deposit', b.deposit, 'status_at_open', d.item_status_at_open),
    'contract_terms', d.terms_snapshot, 'payment', d.payment_snapshot,
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('reference', po.reference, 'kind', po.kind, 'amount_minor', po.amount_minor, 'admin_fee_minor', po.customer_fee_minor,
        'refunded_minor', po.refunded_minor, 'status', po.status, 'charged_at', po.charged_at) order by po.created_at), '[]') from public.payment_orders po where po.build_item_id = d.build_item_id),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', e.created_at, 'party', e.party, 'kind', e.kind, 'text', e.body,
        'text_sha256', encode(extensions.digest(coalesce(e.body, ''), 'sha256'), 'hex'),
        'files', (select coalesce(jsonb_agg(jsonb_build_object('name', f->>'name', 'sha256', coalesce(f->>'sha256', f->>'hash'))), '[]') from jsonb_array_elements(case when jsonb_typeof(e.files) = 'array' then e.files else '[]'::jsonb end) f))
        order by e.created_at), '[]') from public.booking_dispute_entries e where e.dispute_id = d.id and not coalesce(e.internal, false)),
    'recommendation', case when d.resolution ? 'recommended_at' then d.resolution end,
    'settlements', (select coalesce(jsonb_agg(jsonb_build_object('party', s.party, 'refund_minor', s.refund_minor, 'status', s.status, 'at', s.created_at) order by s.created_at), '[]') from public.booking_dispute_settlements s where s.dispute_id = d.id),
    'route', public.dispute_route(d.id),
    'notice', 'Gala Dock gives non-binding recommendations only. File with the provider or the court yourselves; Gala Dock does not fill in forms or pay fees.');
end $$;
revoke all on function public.dispute_case_pack(uuid) from public, anon;
grant execute on function public.dispute_case_pack(uuid) to authenticated;
