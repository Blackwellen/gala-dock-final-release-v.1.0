-- Q18/Q21 scanner + Q40 passes + Q29 online-only tiers (lane D, coordinator hook 2026-10-29). Additive; signature unchanged.
-- (1) A ticket scanned at another event is admitted only when pass_entitlement_check() returns an active entitlement for this
--     event (window / zone rules use the component tier; duplicates are counted per event in check_ins and the pass ticket keeps
--     its own status). A pass ticket without an entitlement here: result pass_not_valid_here; any other foreign ticket: wrong_event.
-- (2) A tier marked online-only in virtual_tier_access never admits in person: result online_only_ticket.
alter table public.check_ins drop constraint if exists check_ins_result_check;
alter table public.check_ins add constraint check_ins_result_check check (result in ('admitted','duplicate','invalid','revoked','readmitted','refunded','transferred','resold',
  'wrong_event','wrong_session','resale_locked','wrong_zone','outside_window','reentry_denied','suspended','expired','exited','not_authorized','pass_not_valid_here','online_only_ticket'));

create or replace function public.scan_admission(p_event uuid, p_zone uuid, p_ticket uuid, p_pass uuid, p_code text, p_nonce text, p_credential text, p_device text DEFAULT NULL::text, p_offline_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_gate text DEFAULT NULL::text, p_client_scan_id text DEFAULT NULL::text, p_snapshot uuid DEFAULT NULL::uuid, p_local_result text DEFAULT NULL::text, p_direction text DEFAULT 'in'::text)
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
       and ((subj = 'ticket' and c.ticket_id = tk.id) or (subj = 'pass' and c.pass_id = ps.id)) order by coalesce(c.offline_at, c.created_at), c.id limit 1;
    -- Main entry for a ticket follows the entitlement: valid = not yet in (a re-entry reset makes it admissible again);
    -- used with no recorded admission (virtual join, imported history) still counts as already in.
    if subj = 'ticket' and z.id is null and tk.status = 'valid' and not cross_pass then adm := null; end if;
    if cross_pass then
      select * into adm from public.check_ins c where c.result in ('admitted','readmitted') and c.direction = 'in' and c.event_id = p_event and c.zone_id is not distinct from p_zone
         and c.ticket_id = tk.id order by coalesce(c.offline_at, c.created_at), c.id limit 1;
    end if;
    if adm.id is null and not (subj = 'ticket' and z.id is null and tk.status = 'used' and not cross_pass) then
      res := 'admitted'; why := 'Valid.';
    else
      if z.id is not null then
        select count(*) into n from public.check_ins c where c.result in ('admitted','readmitted') and c.direction = 'in' and c.zone_id = z.id and ((subj = 'ticket' and c.ticket_id = tk.id) or (subj = 'pass' and c.pass_id = ps.id));
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
