-- Q58 / OWNER DECISION 2026-11-14: ticket validity during card chargebacks (docs/backend/payments/dec107-gala-dock.md §Chargebacks).
--   Dispute OPENED on a ticket order → its tickets are HELD (dispute_hold_at): refused at the door as "Ticket on hold — see box office"
--     (scan result on_hold, offline snapshot status on_hold, wallet credential status on_hold), and they can't be listed, transferred or
--     resold (a resale listing is withdrawn). Same codes; nothing is voided.
--   Dispute WON → the hold is lifted (same codes) and the buyer is told.
--   Dispute LOST → the tickets are cancelled (void_reason chargeback_lost) and, if the event hasn't ended, the capacity goes back on sale:
--     a seat becomes available, a GA tier's sold count drops (a sold-out tier inside its sale window reopens). Past events: void only.
--   Scope = the disputed order's own entitlements: tickets of that order and their gift transfers (order_ref || '-T…'); a resold ticket's
--   new holder paid separately and is untouched. Idempotent (hold once, lift only this dispute's hold, void only live tickets); the
--   webhook keeps "closed is final", so a late open event can't re-hold. Audit rows, organiser notification, buyer notice, ops alert.
-- Additive: three nullable ticket columns, check_ins result CHECK widened (superset), one guard trigger, same-signature replacements.

alter table public.tickets add column if not exists dispute_hold_at timestamptz;
alter table public.tickets add column if not exists dispute_hold_ref text;
alter table public.tickets add column if not exists void_reason text;

alter table public.check_ins drop constraint if exists check_ins_result_check;
alter table public.check_ins add constraint check_ins_result_check check (result = any (array['admitted','duplicate','invalid','revoked','readmitted','refunded','transferred',
  'resold','wrong_event','wrong_session','resale_locked','wrong_zone','outside_window','reentry_denied','suspended','expired','exited','not_authorized','pass_not_valid_here',
  'online_only_ticket','on_hold']));

-- A held ticket can't change hands.
create or replace function public.tickets_dispute_hold_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if old.dispute_hold_at is not null and new.dispute_hold_at is not null and new.status is distinct from old.status then
    if new.status = 'resold' then raise exception 'seat_unavailable:ticket_on_hold' using errcode = '23P01'; end if;   -- finalise() refunds the resale buyer
    if new.status in ('resale_listed', 'transferred') then raise exception 'ticket_on_hold' using errcode = '22023', hint = 'This ticket is on hold while a card payment dispute is reviewed.'; end if;
  end if;
  return new;
end $$;
revoke all on function public.tickets_dispute_hold_guard() from public, anon, authenticated;
-- Named to fire first (triggers run in name order): before gd_resale_original_payer and the state guard.
drop trigger if exists gd_0_dispute_hold_guard on public.tickets;
create trigger gd_0_dispute_hold_guard before update of status on public.tickets for each row execute function public.tickets_dispute_hold_guard();

-- The disputed order's own entitlements: its tickets and their gift transfers (accept/transfer_ticket append '-T'); never resales.
create or replace function public.ticket_dispute_scope(p_ref text)
returns setof uuid language sql stable security definer set search_path to '' as $$
  select t.id from public.tickets t where t.order_ref = p_ref or left(t.order_ref, length(p_ref) + 2) = p_ref || '-T'
$$;
revoke all on function public.ticket_dispute_scope(text) from public, anon, authenticated;
grant execute on function public.ticket_dispute_scope(text) to service_role;

create or replace function public.ticket_order_dispute(p_ref text, p_dispute text, p_status text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare o public.checkout_orders; res jsonb := '{}'; closed boolean; won boolean; lost boolean; e public.events; n int := 0; seats int := 0; r record; ended boolean;
  ev_name text; reopened int := 0; tier_err text;
begin
  if length(coalesce(p_dispute, '')) < 3 or coalesce(p_status, '') = '' then raise exception 'invalid_dispute' using errcode = '22023'; end if;
  closed := p_status in ('won', 'lost', 'warning_closed');
  won := p_status in ('won', 'warning_closed');
  lost := p_status = 'lost';
  select * into o from public.checkout_orders where order_ref = p_ref for update;
  if not found then return jsonb_build_object('ok', true, 'ticket', false); end if;
  select * into e from public.events where id = o.event_id;
  ev_name := coalesce(e.name, 'your event');
  ended := coalesce(e.ends_at, e.starts_at + interval '6 hours') <= now();

  if not closed then
    if o.order_state = 'chargeback' then
      res := jsonb_build_object('changed', false);
    elsif public.state_transition_allowed('ticket_order', o.order_state, 'chargeback') then
      res := public.ticket_order_transition(p_ref, 'chargeback', o.order_state, 'stripe_dispute:' || p_dispute);
    else
      insert into public.ticket_risk_flags(event_id, user_id, order_ref, kind, severity, detail)
        values (o.event_id, o.buyer_id, o.order_ref, 'chargeback', 'review',
          jsonb_build_object('amount_minor', round((o.amount + o.fee) * 100), 'dispute', p_dispute, 'order_state', o.order_state))
        on conflict do nothing;
      res := jsonb_build_object('changed', false, 'flagged_only', true);
    end if;
    -- HOLD (once): withdraw a resale listing, then hold every live entitlement of the order.
    update public.tickets set status = 'valid' where id in (select public.ticket_dispute_scope(p_ref)) and status = 'resale_listed' and dispute_hold_at is null;
    update public.tickets set dispute_hold_at = now(), dispute_hold_ref = p_dispute
     where id in (select public.ticket_dispute_scope(p_ref)) and status in ('valid', 'used') and dispute_hold_at is null;
    get diagnostics n = row_count;
    if n > 0 then
      insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', o.seller_workspace_id, 'ticket.dispute_hold',
        jsonb_build_object('order_ref', p_ref, 'dispute', p_dispute, 'tickets', n));
      if o.seller_workspace_id is not null then
        perform public.notify_workspace(o.seller_workspace_id, array['owner','manager','finance'], 'ticket', 'Tickets on hold: card payment disputed',
          n || ' ticket(s) on order ' || p_ref || ' for ' || ev_name || ' are on hold while the buyer''s card dispute is reviewed. They won''t scan at the door ("see box office"). Upload evidence from Money if you can.', '/organizer/money');
      end if;
    end if;
    res := res || jsonb_build_object('held', n);
  elsif won then
    if o.order_state = 'chargeback' then res := public.ticket_order_transition(p_ref, 'issued', 'chargeback', 'stripe_dispute_won:' || p_dispute);
    else res := jsonb_build_object('changed', false); end if;
    -- RELEASE only this dispute's hold (same codes).
    update public.tickets set dispute_hold_at = null, dispute_hold_ref = null
     where id in (select public.ticket_dispute_scope(p_ref)) and dispute_hold_ref = p_dispute and status in ('valid', 'used');
    get diagnostics n = row_count;
    if n > 0 then
      insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', o.seller_workspace_id, 'ticket.dispute_hold_released',
        jsonb_build_object('order_ref', p_ref, 'dispute', p_dispute, 'tickets', n));
      insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
        select distinct t.holder_id, 'ticket', 'Your tickets are valid again', 'The hold on your ticket(s) for ' || ev_name || ' has been lifted. Your ticket codes are unchanged.',
               '/account/tickets', 'dispute-release:' || p_dispute || ':' || t.holder_id
          from public.tickets t where t.id in (select public.ticket_dispute_scope(p_ref)) and t.status in ('valid', 'used') and t.holder_id is not null
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      if o.seller_workspace_id is not null then
        perform public.notify_workspace(o.seller_workspace_id, array['owner','manager','finance'], 'ticket', 'Card dispute won: tickets valid again',
          'The card dispute on order ' || p_ref || ' was decided in your favour. ' || n || ' ticket(s) for ' || ev_name || ' scan again.', '/organizer/money');
      end if;
    end if;
    res := res || jsonb_build_object('released', n);
  elsif lost then
    if o.order_state = 'chargeback' then res := public.ticket_order_transition(p_ref, 'refunded', 'chargeback', 'stripe_dispute_lost:' || p_dispute);
    else res := jsonb_build_object('changed', false); end if;
    -- VOID the order's live entitlements (resold tickets belong to their new holder and stay valid).
    for r in select t.* from public.tickets t where t.id in (select public.ticket_dispute_scope(p_ref)) and t.status in ('valid', 'used', 'resale_listed') for update loop
      update public.tickets set status = 'cancelled', void_reason = 'chargeback_lost', dispute_hold_at = coalesce(dispute_hold_at, now()), dispute_hold_ref = coalesce(dispute_hold_ref, p_dispute)
       where id = r.id;
      n := n + 1;
      if not ended then
        -- capacity back on sale: the seat first, then the tier count
        update public.event_seats set status = 'available', ticket_id = null, hold_token = null, hold_expires_at = null, updated_at = now() where ticket_id = r.id and status = 'sold';
        get diagnostics seats = row_count;
        begin
          update public.ticket_tiers set sold = greatest(0, sold - 1),
            status = case when status = 'sold_out' and sold - 1 < quantity and (sale_start is null or sale_start <= now()) and (sale_end is null or sale_end > now()) then 'on_sale' else status end
           where id = r.tier_id;
          reopened := reopened + 1;
        exception when others then tier_err := left(sqlerrm, 200);   -- e.g. a sale-window guard: the ticket stays void, staff see it below
        end;
      end if;
    end loop;
    if n > 0 then
      insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('webhook', o.seller_workspace_id, 'ticket.dispute_lost_void',
        jsonb_build_object('order_ref', p_ref, 'dispute', p_dispute, 'tickets', n, 'capacity_returned', reopened, 'event_ended', ended, 'tier_error', tier_err));
      insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
        select distinct t.holder_id, 'ticket', 'Your tickets were cancelled', 'Your card issuer reversed the payment for your ticket(s) to ' || ev_name || ', so the tickets have been cancelled.',
               '/account/tickets', 'dispute-void:' || p_dispute || ':' || t.holder_id
          from public.tickets t where t.id in (select public.ticket_dispute_scope(p_ref)) and t.void_reason = 'chargeback_lost' and t.holder_id is not null
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      if o.seller_workspace_id is not null then
        perform public.notify_workspace(o.seller_workspace_id, array['owner','manager','finance'], 'ticket', 'Card dispute lost: tickets cancelled',
          n || ' ticket(s) on order ' || p_ref || ' for ' || ev_name || ' were cancelled after the card dispute was lost.'
          || case when ended then '' when tier_err is null then ' The places are back on sale.' else ' The places could not be put back on sale automatically — check the tier.' end, '/organizer/money');
      end if;
      if tier_err is not null then
        insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
          select pa.user_id, 'admin.ops_alert', 'Chargeback capacity not returned', 'Order ' || p_ref || ': tickets voided after a lost dispute, but the tier update failed: ' || tier_err,
                 '/admin/commerce/transactions', 'dispute-capacity:' || p_dispute || ':' || pa.user_id
            from public.platform_admins pa on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end if;
    end if;
    res := res || jsonb_build_object('voided', n, 'capacity_returned', reopened);
  else
    res := jsonb_build_object('changed', false);
  end if;
  return jsonb_build_object('ok', true, 'ticket', true, 'state', (select order_state from public.checkout_orders where order_ref = p_ref)) || (res - 'ok');
end $function$;

-- ── scanner, check-in and offline snapshot refuse held tickets with the right message ──
CREATE OR REPLACE FUNCTION public.scan_admission(p_event uuid, p_zone uuid, p_ticket uuid, p_pass uuid, p_code text, p_nonce text, p_credential text, p_device text DEFAULT NULL::text, p_offline_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_gate text DEFAULT NULL::text, p_client_scan_id text DEFAULT NULL::text, p_snapshot uuid DEFAULT NULL::uuid, p_local_result text DEFAULT NULL::text, p_direction text DEFAULT 'in'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  tk public.tickets; ps public.access_passes; tr public.ticket_tiers; z public.access_zones; e public.events; prior public.check_ins; adm public.check_ins;
  res text; why text := ''; conf text; at timestamptz; reentry boolean; subj text; n integer; ok_zone boolean; dev text := left(p_device, 60);
  pe jsonb; cross_pass boolean := false; rule_tier uuid;
begin
  if not public.can_scan_event(p_event, p_zone) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_offline_at is not null and (p_offline_at > now() + interval '5 minutes' or p_offline_at < now() - interval '7 days') then raise exception 'invalid_offline_time' using errcode = '22023'; end if;
  at := coalesce(p_offline_at, now());
  -- Idempotent replay of an offline scan (same device + client id) returns the stored outcome.
  if p_client_scan_id is not null then
    select * into prior from public.check_ins c where c.event_id = p_event and coalesce(c.device, '') = coalesce(dev, '') and c.client_scan_id = p_client_scan_id;
    if found then return jsonb_build_object('result', prior.result, 'reason', prior.reason, 'conflict', prior.conflict, 'replayed', true, 'ticket_id', prior.ticket_id, 'pass_id', prior.pass_id); end if;
  end if;
  select * into e from public.events where id = p_event;
  if p_zone is not null then
    select * into z from public.access_zones where id = p_zone;
    if not found or z.event_id <> p_event then raise exception 'zone_not_in_event' using errcode = '22023'; end if;
  end if;

  if p_pass is not null or upper(coalesce(p_code, '')) like 'GDP-%' then
    subj := 'pass';
    if p_pass is not null then select * into ps from public.access_passes where id = p_pass for update;
    else select * into ps from public.access_passes where code = upper(p_code) for update; end if;
  else
    subj := 'ticket';
    if p_ticket is not null then select * into tk from public.tickets where id = p_ticket for update;
    else select * into tk from public.tickets where code = upper(coalesce(p_code, '')) for update; end if;
  end if;

  if subj = 'pass' then
    if ps.id is null then res := 'invalid'; why := 'Unknown pass.';
    elsif ps.event_id <> p_event then res := 'wrong_event'; why := 'This pass is for another event.';
    elsif p_nonce is not null and ps.nonce is distinct from p_nonce then res := 'revoked'; why := 'This badge has been replaced or revoked.';
    elsif ps.status = 'revoked' then res := 'revoked'; why := 'Pass revoked' || case when ps.revoked_reason <> '' then ': ' || ps.revoked_reason else '.' end;
    elsif ps.status = 'suspended' then res := 'suspended'; why := 'Pass suspended.';
    elsif ps.status = 'expired' or (ps.valid_to is not null and at > ps.valid_to) then res := 'expired'; why := 'Pass has expired.';
    elsif ps.valid_from is not null and at < ps.valid_from then res := 'outside_window'; why := 'Pass not valid yet.';
    end if;
  else
    if tk.id is null then res := 'invalid'; why := 'Unknown ticket.';
    elsif tk.event_id <> p_event then
      -- Q40 multi-event passes: a ticket for the parent/pass event admits at a component event only with an active entitlement.
      pe := public.pass_entitlement_check(tk.id, p_event);
      if coalesce((pe->>'ok')::boolean, false) then cross_pass := true;
      elsif exists (select 1 from public.pass_entitlements x where x.ticket_id = tk.id) then
        res := 'pass_not_valid_here'; why := 'This pass does not include entry to this event' || case when pe->>'reason' like 'entitlement_%' or pe->>'reason' like 'event_%' then ' (' || replace(pe->>'reason', '_', ' ') || ').' else '.' end;
      else res := 'wrong_event'; why := 'This ticket is for another event.'; end if;
    end if;
    if res is not null or tk.id is null then null;
    elsif p_nonce is not null and tk.qr_nonce is distinct from p_nonce then
      res := case tk.status when 'transferred' then 'transferred' when 'resold' then 'resold' when 'refunded' then 'refunded' when 'cancelled' then 'revoked' else 'invalid' end;
      why := case res when 'transferred' then 'Ticket was transferred — this code is no longer valid.' when 'resold' then 'Ticket was resold — this code is no longer valid.'
                      when 'refunded' then 'Ticket was refunded.' when 'revoked' then 'Ticket cancelled.' else 'Expired or replaced code — ask the holder to refresh their ticket.' end;
    -- Owner 2026-11-14 (Q58): a ticket whose card payment is under dispute is HELD — refused, but not "invalid".
    elsif tk.dispute_hold_at is not null and tk.status in ('valid','used','resale_listed') then res := 'on_hold'; why := 'Ticket on hold — see box office.';
    elsif tk.status = 'refunded' then res := 'refunded'; why := 'Ticket was refunded.';
    elsif tk.status = 'transferred' then res := 'transferred'; why := 'Ticket was transferred to someone else.';
    elsif tk.status = 'resold' then res := 'resold'; why := 'Ticket was resold.';
    elsif tk.status = 'cancelled' then res := 'revoked'; why := 'Ticket cancelled.';
    elsif tk.status = 'resale_listed' then res := 'resale_locked'; why := 'Ticket is listed for resale — the holder must cancel the listing first.';
    else
      rule_tier := case when cross_pass then coalesce((pe->>'component_tier_id')::uuid, tk.tier_id) else tk.tier_id end;
      select * into tr from public.ticket_tiers where id = rule_tier;
      -- Q29: an online-only tier never admits in person (bought tier, or the pass component tier).
      if exists (select 1 from public.virtual_tier_access v where v.tier_id in (tk.tier_id, rule_tier) and v.mode = 'online') then
        res := 'online_only_ticket'; why := 'This is an online-only ticket — it does not admit entry in person.';
      elsif (tr.valid_from is not null and at < tr.valid_from - interval '2 hours') or (tr.valid_to is not null and at > tr.valid_to) then res := 'wrong_session'; why := 'Ticket is for a different day or session.'; end if;
    end if;
  end if;

  -- Zone membership and window (server-side, independent of any UI).
  if res is null and z.id is not null then
    if z.status <> 'active' then res := 'outside_window'; why := z.name || ' is closed.';
    elsif (z.opens_at is not null and at < z.opens_at) or (z.closes_at is not null and at > z.closes_at) then res := 'outside_window'; why := z.name || ' is not open at this time.';
    else
      if subj = 'pass' then
        ok_zone := z.id = any(ps.zones) or exists (select 1 from public.access_rules r where r.zone_id = z.id and r.pass_type = ps.pass_type
                     and (r.valid_from is null or at >= r.valid_from) and (r.valid_to is null or at <= r.valid_to));
      else
        ok_zone := exists (select 1 from public.access_rules r where r.zone_id = z.id and r.tier_id = coalesce(rule_tier, tk.tier_id) and (r.valid_from is null or at >= r.valid_from) and (r.valid_to is null or at <= r.valid_to))
          or (z.kind = 'general' and not exists (select 1 from public.access_rules r where r.zone_id = z.id));
      end if;
      if not ok_zone then res := 'wrong_zone'; why := 'Not valid for ' || z.name || '.'; end if;
    end if;
  end if;

  if res is null and p_direction = 'out' then res := 'exited'; why := 'Exit recorded.'; end if;

  if res is null then
    -- Admissions so far for this subject in this zone (null zone = main entry).
    select * into adm from public.check_ins c where c.result in ('admitted','readmitted') and c.direction = 'in' and c.zone_id is not distinct from p_zone
       and coalesce(c.credential, '') <> 'virtual'   -- Q29: an online join is attendance, never a door admission
       and ((subj = 'ticket' and c.ticket_id = tk.id) or (subj = 'pass' and c.pass_id = ps.id)) order by coalesce(c.offline_at, c.created_at), c.id limit 1;
    -- Main entry for a ticket follows the entitlement: valid = not yet in (a re-entry reset makes it admissible again);
    -- used with no recorded admission (imported history) still counts as already in. Virtual joins never set used (Q29, 4030).
    if subj = 'ticket' and z.id is null and tk.status = 'valid' and not cross_pass then adm := null; end if;
    if cross_pass then
      select * into adm from public.check_ins c where c.result in ('admitted','readmitted') and c.direction = 'in' and c.event_id = p_event and c.zone_id is not distinct from p_zone
         and coalesce(c.credential, '') <> 'virtual'
         and c.ticket_id = tk.id order by coalesce(c.offline_at, c.created_at), c.id limit 1;
    end if;
    if adm.id is null and not (subj = 'ticket' and z.id is null and tk.status = 'used' and not cross_pass) then
      res := 'admitted'; why := 'Valid.';
    else
      if z.id is not null then
        select count(*) into n from public.check_ins c where c.result in ('admitted','readmitted') and c.direction = 'in' and c.zone_id = z.id and coalesce(c.credential, '') <> 'virtual' and ((subj = 'ticket' and c.ticket_id = tk.id) or (subj = 'pass' and c.pass_id = ps.id));
        reentry := z.reentry = 'allow' or (z.reentry = 'limited' and n < z.max_entries);
        if not reentry and z.reentry = 'limited' then res := 'reentry_denied'; why := 'Re-entry limit reached for ' || z.name || '.'; end if;
      else
        reentry := subj = 'pass' or coalesce((e.settings->>'reentry')::boolean, false);
      end if;
      if res is null then
        if p_offline_at is not null and adm.id is not null and at < coalesce(adm.offline_at, adm.created_at) and not reentry then
          -- Offline reconciliation, first valid scan wins: this earlier scan becomes the admission, the later one is flagged.
          update public.check_ins set result = 'duplicate', conflict = 'superseded_by_offline', reason = 'Superseded by an earlier offline scan.' where id = adm.id;
          res := 'admitted'; why := 'Valid (earlier offline scan).'; conf := 'offline_earlier_wins';
        elsif reentry then res := 'readmitted'; why := 'Re-entry.';
        else res := 'duplicate'; why := 'Already scanned' || coalesce(' at ' || to_char(coalesce(adm.offline_at, adm.created_at, tk.checked_in_at) at time zone coalesce(e.timezone, 'Europe/London'), 'HH24:MI'), '') || coalesce(' (' || adm.gate || ')', '') || '.';
          if p_offline_at is not null then conf := 'offline_duplicate'; end if;
        end if;
      end if;
    end if;
  end if;

  if res in ('admitted','readmitted') then
    if subj = 'ticket' and cross_pass then
      null;   -- component-event admission is recorded in check_ins; the pass ticket stays valid for its other events
    elsif subj = 'ticket' then
      update public.tickets set status = case when status = 'valid' then 'used' else status end,
        checked_in_at = case when checked_in_at is null or at < checked_in_at then at else checked_in_at end where id = tk.id;
    else
      update public.access_passes set checked_in_at = case when checked_in_at is null or at < checked_in_at then at else checked_in_at end where id = ps.id;
    end if;
  elsif p_local_result in ('admitted','readmitted','offline_ok') and res not in ('duplicate','exited') then
    conf := 'offline_admitted_revoked';   -- the device let someone in that the server rejects: flagged for review
  end if;

  insert into public.check_ins(ticket_id, pass_id, event_id, scanned_by, result, device, offline_at, credential, gate, subject_kind, zone_id, direction, snapshot_id, client_scan_id, local_result, conflict, reason)
    values (tk.id, ps.id, p_event, auth.uid(), res, dev, p_offline_at, coalesce(p_credential, case when subj = 'pass' then 'pass' else 'manual' end), left(p_gate, 60), subj, p_zone,
      coalesce(p_direction, 'in'), p_snapshot, left(p_client_scan_id, 80), left(p_local_result, 30), conf, why);
  if res in ('admitted','readmitted') then
    perform public.emit_domain_event('ticket.scanned', e.workspace_id, jsonb_build_object('event_id', p_event, 'subject', subj, 'id', coalesce(tk.id, ps.id), 'zone_id', p_zone, 'result', res, 'offline', p_offline_at is not null),
      auth.uid(), 'user', 'event', p_event::text, null, null);
  end if;
  return jsonb_build_object('result', res, 'reason', why, 'conflict', conf, 'subject', subj, 'ticket_id', tk.id, 'pass_id', ps.id,
    'code', coalesce(tk.code, ps.code), 'attendee', case when coalesce(tk.event_id, ps.event_id) = p_event or cross_pass then coalesce(tk.attendee_name, ps.holder_name) end,
    'tier', coalesce(tr.name, ps.pass_type), 'pass', case when cross_pass then pe end, 'seat', case when tk.event_id = p_event then tk.seat end, 'zone', z.name,
    'checked_in_at', coalesce(tk.checked_in_at, ps.checked_in_at),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('result', c.result, 'at', coalesce(c.offline_at, c.created_at), 'gate', c.gate, 'zone_id', c.zone_id) order by c.created_at desc), '[]')
                from (select * from public.check_ins c where (tk.id is not null and c.ticket_id = tk.id) or (ps.id is not null and c.pass_id = ps.id) order by c.created_at desc limit 5) c));
end $function$;

CREATE OR REPLACE FUNCTION public.check_in_ticket(p_event uuid, p_code text, p_nonce text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tk public.tickets; res text;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode='42501'; end if;
  select * into tk from public.tickets where event_id = p_event and code = upper(p_code) for update;
  if not found or (p_nonce is not null and tk.qr_nonce <> p_nonce) then res := 'invalid';
  elsif tk.status in ('transferred','resold','refunded','cancelled') then res := 'revoked';
  elsif tk.dispute_hold_at is not null then res := 'on_hold';   -- Q58: card payment under dispute
  elsif tk.status = 'used' then res := 'duplicate';
  else update public.tickets set status='used', checked_in_at=now() where id = tk.id; res := 'admitted'; end if;
  insert into public.check_ins(ticket_id, event_id, scanned_by, result) values (tk.id, p_event, auth.uid(), res);
  return jsonb_build_object('result', res, 'attendee', tk.attendee_name, 'code', tk.code, 'checked_in_at', tk.checked_in_at);
end; $function$;

CREATE OR REPLACE FUNCTION public.create_scan_snapshot(p_event uuid, p_device text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid()); sid uuid; rows_ jsonb; passes jsonb; zones jsonb; exp timestamptz := now() + interval '24 hours';
begin
  if uid is null or not public.can_scan_event_any(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('ticket_id', t.id, 'code', t.code, 'status', case when t.dispute_hold_at is not null and t.status in ('valid','used','resale_listed') then 'on_hold' else t.status end, 'attendee', t.attendee_name, 'tier', tr.name, 'tier_id', t.tier_id,
           'seat', t.seat, 'checked_in_at', t.checked_in_at, 'v', t.credential_version, 'valid_from', tr.valid_from, 'valid_to', tr.valid_to) order by t.code), '[]')
    into rows_ from public.tickets t left join public.ticket_tiers tr on tr.id = t.tier_id
   where t.event_id = p_event and t.status in ('valid','used','resale_listed','refunded','transferred','resold','cancelled');
  select coalesce(jsonb_agg(jsonb_build_object('pass_id', p.id, 'code', p.code, 'status', p.status, 'holder', p.holder_name, 'type', p.pass_type, 'zones', p.zones,
           'valid_from', p.valid_from, 'valid_to', p.valid_to) order by p.code), '[]') into passes from public.access_passes p where p.event_id = p_event;
  select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'kind', z.kind, 'opens_at', z.opens_at, 'closes_at', z.closes_at, 'reentry', z.reentry, 'max_entries', z.max_entries,
           'rules', (select coalesce(jsonb_agg(jsonb_build_object('tier_id', r.tier_id, 'pass_type', r.pass_type, 'valid_from', r.valid_from, 'valid_to', r.valid_to)), '[]') from public.access_rules r where r.zone_id = z.id))
           order by z.sort, z.name), '[]') into zones from public.access_zones z where z.event_id = p_event and z.status = 'active';
  insert into public.scan_snapshots(event_id, created_by, device, row_count, digest, expires_at)
    values (p_event, uid, left(coalesce(p_device, ''), 60), jsonb_array_length(rows_) + jsonb_array_length(passes), md5(rows_::text || passes::text || zones::text), exp)
    returning id into sid;
  return jsonb_build_object('snapshot_id', sid, 'event_id', p_event, 'issued_at', now(), 'expires_at', exp, 'tickets', rows_, 'passes', passes, 'zones', zones,
    'reentry', coalesce((select (settings->>'reentry')::boolean from public.events where id = p_event), false));
end $function$;
