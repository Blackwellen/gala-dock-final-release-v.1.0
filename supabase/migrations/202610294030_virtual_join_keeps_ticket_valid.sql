-- Q29 P1 (lane D, 2026-10-29): a virtual join must never change tickets.status.
-- Before: virtual_redeem_join_token / legacy virtual_join wrote a 'virtual' check-in AND moved the ticket valid -> used, which blocked
-- transfer and resale and (hybrid tiers) door entry. Now: attendance (virtual_attendance) + the 'virtual' check-in are recorded and
-- the ticket stays valid. scan_admission ignores virtual check-ins as door admissions; online-only tiers are still refused (4024).
-- Door metrics (event_live_snapshot entry, event_day_report admissions) exclude virtual check-ins; live snapshot adds entry.online.
-- Additive: CREATE OR REPLACE of existing functions from their live definitions, identical signatures (grants kept) + one new attendee read.

CREATE OR REPLACE FUNCTION public.virtual_redeem_join_token(p_token text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.virtual_join_tokens; s public.virtual_sessions; e public.events; t public.tickets; uid uuid := (select auth.uid()); att uuid; link text; why text;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return jsonb_build_object('ok', false, 'reason', 'invalid_token'); end if;
  select * into j from public.virtual_join_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or j.user_id <> uid then return jsonb_build_object('ok', false, 'reason', 'invalid_token'); end if;
  if j.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'token_revoked'); end if;
  if j.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'token_used'); end if;
  if j.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'token_expired'); end if;
  if j.device_id is distinct from p_device then return jsonb_build_object('ok', false, 'reason', 'wrong_device'); end if;
  select * into s from public.virtual_sessions where id = j.session_id;
  select * into e from public.events where id = j.event_id;
  if s.status in ('draft','cancelled','archived','ended') or e.status in ('cancelled','postponed','suspended') then return jsonb_build_object('ok', false, 'reason', 'ended'); end if;
  -- Re-validate the entitlement at redemption time.
  if j.role = 'attendee' then
    if j.ticket_id is not null then
      select * into t from public.tickets where id = j.ticket_id;
      if t.credential_version is distinct from j.credential_version then return jsonb_build_object('ok', false, 'reason', 'ticket_changed'); end if;
      why := public.virtual_ticket_refusal(j.session_id, j.ticket_id, uid);
      if why is not null then return jsonb_build_object('ok', false, 'reason', why); end if;
    elsif not exists (select 1 from public.registrations r where r.id = j.registration_id and r.user_id = uid and r.status = 'approved') then
      return jsonb_build_object('ok', false, 'reason', 'registration_changed');
    end if;
  elsif j.role is distinct from public.virtual_session_role(j.session_id, uid) and not (j.role <> 'team' and exists (
      select 1 from public.virtual_session_roles r where r.session_id = j.session_id and r.user_id = uid and r.role = j.role and r.status = 'active')) then
    return jsonb_build_object('ok', false, 'reason', 'role_revoked');
  end if;
  link := case j.role when 'attendee' then s.join_url when 'speaker' then coalesce(s.speaker_url, s.join_url) else coalesce(s.host_url, s.speaker_url, s.join_url) end;
  if link is null then return jsonb_build_object('ok', false, 'reason', 'no_stream_link'); end if;

  update public.virtual_join_tokens set used_at = now() where id = j.id;
  update public.virtual_attendance a set left_at = now(), left_reason = 'rejoined', minutes = round((extract(epoch from (greatest(a.last_seen_at, a.joined_at) - a.joined_at)) / 60)::numeric, 1)
    where a.session_id = j.session_id and a.user_id = uid and a.device_id = j.device_id and a.mode = 'live' and a.left_at is null;
  insert into public.virtual_attendance(session_id, event_id, token_id, user_id, ticket_id, registration_id, role, mode, device_id)
    values (j.session_id, j.event_id, j.id, uid, j.ticket_id, j.registration_id, j.role, 'live', j.device_id) returning id into att;
  if j.ticket_id is not null then
    insert into public.check_ins(ticket_id, event_id, scanned_by, result, credential, device)
      select t2.id, t2.event_id, uid, 'admitted', 'virtual', 'virtual-join'
      from public.tickets t2 where t2.id = j.ticket_id and not exists (select 1 from public.check_ins c where c.ticket_id = t2.id and c.credential = 'virtual');
    -- Q29 (4030): an online join never changes the ticket - it stays valid for transfer, resale and (hybrid) door entry.
  end if;
  return jsonb_build_object('ok', true, 'url', link, 'mode', 'live', 'role', j.role, 'attendance_id', att);
end $function$;

CREATE OR REPLACE FUNCTION public.virtual_join(p_ticket uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets; e public.events; v public.event_virtual; opens timestamptz; closes timestamptz;
begin
  select * into t from public.tickets where id = p_ticket;
  if not found or t.holder_id is distinct from auth.uid() then return jsonb_build_object('ok', false, 'reason', 'not_your_ticket'); end if;
  if t.status not in ('valid','used') then return jsonb_build_object('ok', false, 'reason', t.status); end if;
  select * into e from public.events where id = t.event_id;
  select * into v from public.event_virtual where event_id = t.event_id;
  if not found or v.join_url is null then return jsonb_build_object('ok', false, 'reason', 'no_virtual_access'); end if;
  if e.status in ('cancelled','postponed') then return jsonb_build_object('ok', false, 'reason', e.status); end if;
  opens := e.starts_at - make_interval(mins => v.opens_minutes_before);
  closes := coalesce(e.ends_at, e.starts_at + interval '3 hours') + make_interval(mins => v.closes_minutes_after);
  if now() < opens then return jsonb_build_object('ok', false, 'reason', 'not_open_yet', 'opens_at', opens); end if;
  if now() > closes then
    if v.replay_available and v.recording_url is not null and (v.replay_until is null or now() < v.replay_until) then
      return jsonb_build_object('ok', true, 'url', v.recording_url, 'mode', 'replay');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'ended');
  end if;
  insert into public.check_ins(ticket_id, event_id, scanned_by, result, credential, device)
    values (t.id, t.event_id, auth.uid(), case when exists (select 1 from public.check_ins c where c.ticket_id = t.id and c.credential = 'virtual') then 'readmitted' else 'admitted' end, 'virtual', 'virtual-join');
  -- Q29 (4030): an online join never changes the ticket (attendance only).
  return jsonb_build_object('ok', true, 'url', v.join_url, 'mode', 'live');
end $function$;

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

CREATE OR REPLACE FUNCTION public.event_live_snapshot(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; r jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'now', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'area', i.area, 'starts_at', i.starts_at, 'delay_minutes', coalesce(t.delay_minutes, 0), 'actual_start', t.actual_start) order by i.starts_at)
             from public.programme_items i left join public.run_sheet_tracking t on t.item_id = i.id where i.event_id = e.id and i.status = 'in_progress'), '[]'),
    'next', coalesce((select jsonb_agg(x order by x->>'starts_at') from (select jsonb_build_object('id', i.id, 'title', i.title, 'area', i.area, 'starts_at', i.starts_at, 'delay_minutes', coalesce(t.delay_minutes, 0),
               'blocked_by', (select count(*) from public.programme_items d where d.id = any(coalesce(t.depends_on, '{}')) and d.status <> 'done')) x
             from public.programme_items i left join public.run_sheet_tracking t on t.item_id = i.id where i.event_id = e.id and i.status = 'upcoming' order by i.starts_at limit 5) n), '[]'),
    'delays', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'delay_minutes', t.delay_minutes)) from public.run_sheet_tracking t join public.programme_items i on i.id = t.item_id
             where t.event_id = e.id and t.delay_minutes > 0 and i.status <> 'done'), '[]'),
    'crew', (select jsonb_build_object('scheduled', count(*), 'checked_in', count(*) filter (where s.attendance = 'checked_in'), 'checked_out', count(*) filter (where s.attendance = 'checked_out'),
               'no_show', count(*) filter (where s.attendance = 'no_show'), 'late', count(*) filter (where s.attendance = 'not_arrived' and s.starts_at < now()))
             from public.shifts s where s.event_id = e.id and s.status in ('pending','confirmed')),
    'suppliers', (select jsonb_build_object('expected', count(*), 'arrived', count(*) filter (where c.status in ('arrived','checked_in')), 'late', count(*) filter (where c.status = 'late'), 'absent', count(*) filter (where c.status = 'absent'))
             from public.provider_checkins c where c.event_id = e.id),
    'entry', jsonb_build_object('admitted', (select count(*) from public.check_ins c where c.event_id = e.id and c.result = 'admitted' and coalesce(c.credential, '') <> 'virtual'),
               'rejected', (select count(*) from public.check_ins c where c.event_id = e.id and c.result <> 'admitted' and coalesce(c.credential, '') <> 'virtual'),
               'online', (select count(distinct c.ticket_id) from public.check_ins c where c.event_id = e.id and c.credential = 'virtual'),
               'issued', (select count(*) from public.tickets t where t.event_id = e.id and t.status in ('valid','used','transferred','resale_listed','resold')), 'capacity', e.capacity),
    'incidents', (select jsonb_build_object('open', count(*) filter (where i.status <> 'resolved'), 'critical', count(*) filter (where i.status <> 'resolved' and i.severity = 'critical'),
               'high', count(*) filter (where i.status <> 'resolved' and i.severity = 'high')) from public.incidents i where i.event_id = e.id),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('at', a.created_at, 'event', a.event) order by a.created_at desc) from (select * from public.audit_events a
             where a.workspace_id = e.workspace_id and a.metadata ->> 'event_id' = e.id::text order by a.created_at desc limit 20) a), '[]'),
    'as_of', now()) into r;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.event_day_report(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('day_id', d.id, 'date', d.day_date, 'label', d.label, 'status', d.status, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
      'tiers', (select jsonb_build_object('count', count(*), 'capacity', coalesce(sum(t.quantity), 0), 'sold', coalesce(sum(t.sold), 0)) from public.ticket_tiers t where t.event_day_id = d.id),
      'revenue_minor', (select coalesce(sum(round(k.price_paid * 100)), 0) from public.tickets k join public.ticket_tiers t on t.id = k.tier_id where t.event_day_id = d.id and k.status not in ('refunded','cancelled','void')),
      'programme_items', (select count(*) from public.programme_items p where p.event_day_id = d.id),
      'staff', (select jsonb_build_object('shifts', count(*), 'headcount', coalesce(sum(s.headcount), 0)) from public.shifts s where s.event_day_id = d.id and s.status not in ('cancelled','declined')),
      'suppliers', (select count(*) from public.build_items b where b.event_day_id = d.id and b.status not in ('cancelled','declined')),
      'admissions', (select count(*) from public.check_ins c where c.event_id = p_event and c.result = 'admitted' and coalesce(c.credential, '') <> 'virtual' and c.created_at >= d.starts_at and c.created_at < d.ends_at)) order by d.day_date)
    from public.event_days d where d.event_id = p_event), '[]'::jsonb);
end $function$;

-- Attendee replay list (lets the customer view stop reading virtual_recordings with the service client). Only events the caller is
-- connected to (ticket holder, approved registrant, active session role); never URLs, file paths or transcript paths.
create or replace function public.virtual_my_replays(p_event uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'session_id', v.session_id, 'event_id', v.event_id, 'title', v.title, 'status', v.status,
      'access_from', v.access_from, 'access_until', v.access_until, 'audience', v.audience, 'captions', v.captions, 'created_at', v.created_at) order by v.created_at desc)
    from public.virtual_recordings v join public.virtual_sessions s on s.id = v.session_id
    where v.status <> 'withdrawn' and s.status not in ('draft','archived') and (p_event is null or v.event_id = p_event)
      and (exists (select 1 from public.tickets t where t.event_id = v.event_id and t.holder_id = uid and t.status in ('valid','used'))
        or exists (select 1 from public.registrations r where r.event_id = v.event_id and r.user_id = uid and r.status = 'approved')
        or exists (select 1 from public.virtual_session_roles r where r.session_id = v.session_id and r.user_id = uid and r.status = 'active'))), '[]');
end $$;
revoke all on function public.virtual_my_replays(uuid) from public, anon;
grant execute on function public.virtual_my_replays(uuid) to authenticated;

-- Repair: tickets moved valid -> used ONLY by a virtual check-in (no physical door admission) go back to valid (machine allows used -> valid).
do $$
declare n integer;
begin
  with fixed as (
    update public.tickets t set status = 'valid', checked_in_at = null
    where t.status = 'used'
      and exists (select 1 from public.check_ins c where c.ticket_id = t.id and c.credential = 'virtual')
      and not exists (select 1 from public.check_ins c where c.ticket_id = t.id and coalesce(c.credential, '') <> 'virtual' and c.result in ('admitted','readmitted'))
    returning t.id)
  select count(*) into n from fixed;
  if n > 0 then
    insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
      values (null, 'system', null, 'ticket.virtual_status_repaired', jsonb_build_object('tickets', n, 'migration', '202610294030'));
  end if;
  raise notice 'q29 repair: % ticket(s) restored to valid', n;
end $$;
