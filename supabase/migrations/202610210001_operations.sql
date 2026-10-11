-- Phase 6 — organizer depth engines (master spec §85–88): feasibility, explainable readiness domains, team conflicts,
-- provider check-ins for live event mode. All read-only engines are SECURITY DEFINER + can_access_event gated.
begin;

-- ───────────────────────── §86 provider check-ins ─────────────────────────
create table if not exists public.provider_checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  build_item_id uuid not null references public.build_items(id) on delete cascade,
  status text not null default 'expected' check (status in ('expected','en_route','arrived','checked_in','late','absent')),
  expected_at timestamptz, eta timestamptz, arrived_at timestamptz,
  note text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (build_item_id)
);
alter table public.provider_checkins enable row level security;
drop policy if exists provider_checkins_read on public.provider_checkins;
create policy provider_checkins_read on public.provider_checkins for select using (public.can_access_event(event_id)
  or exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where b.id = build_item_id and public.is_workspace_member(l.workspace_id)));

-- Provider reports en route / arrived; the event team can mark checked in, late or absent.
create or replace function public.set_provider_checkin(p_item uuid, p_status text, p_eta timestamptz default null, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare b public.build_items; ws uuid; is_provider boolean; is_event boolean;
begin
  select * into b from public.build_items where id = p_item;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  ws := public.listing_workspace(b.listing_id);
  is_provider := public.has_workspace_role(ws, array['owner','manager','member']);
  is_event := public.can_edit_event(b.event_id);
  if not (is_provider or is_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_status not in ('expected','en_route','arrived','checked_in','late','absent') or (not is_event and p_status in ('checked_in','absent')) then raise exception 'invalid_status' using errcode = '22023'; end if;
  insert into public.provider_checkins as c (event_id, build_item_id, status, eta, arrived_at, note, updated_by, expected_at)
    values (b.event_id, b.id, p_status, p_eta, case when p_status in ('arrived','checked_in') then now() end, left(coalesce(p_note, ''), 300), auth.uid(),
      (select e.starts_at - interval '2 hours' from public.events e where e.id = b.event_id))
  on conflict (build_item_id) do update set status = excluded.status, eta = coalesce(excluded.eta, c.eta), note = excluded.note, updated_by = auth.uid(), updated_at = now(),
    arrived_at = case when excluded.status in ('arrived','checked_in') then coalesce(c.arrived_at, now()) else c.arrived_at end;
  if p_status in ('late','absent') then
    perform public.notify_event(b.event_id, 'provider.request', b.title || ' is ' || p_status, coalesce(nullif(p_note, ''), 'Check the live board.'), '/organizer/events/' || b.event_id || '/live');
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', ws, 'live.provider_' || p_status, jsonb_build_object('build_item_id', b.id));
end $$;

-- ───────────────────────── §88 feasibility engine ─────────────────────────
-- Logical incompatibilities with fix paths. severity: blocker | warning.
create or replace function public.event_feasibility(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; out jsonb := '[]'; vj public.provider_jobs; sp public.spaces; cap integer; tickets integer; guests integer; r record; need integer; have integer; base text;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  base := case when e.workspace_id is null then '/account/events/' || e.id else '/organizer/events/' || e.id end;
  guests := coalesce(e.guest_count, 0);
  -- Venue space for this event: the confirmed venue booking's job space, else the venue listing.
  select j.* into vj from public.provider_jobs j join public.build_items b on b.id = j.build_item_id
    where b.event_id = e.id and b.category = 'venue' and b.status in ('confirmed','active','fulfilled','held') order by j.created_at desc limit 1;
  if vj.space_id is not null then select * into sp from public.spaces where id = vj.space_id; end if;
  cap := coalesce(greatest(sp.capacity_standing, sp.capacity_seated), (select l.capacity_max from public.listings l where l.id = e.venue_listing_id));
  if cap is not null and cap > 0 and guests > cap then
    out := out || jsonb_build_object('key', 'guests_over_capacity', 'severity', 'blocker', 'message', 'Guest count ' || guests || ' exceeds the venue capacity of ' || cap || '.', 'fix', base || case when e.workspace_id is null then '/build' else '?tab=plan&section=guests' end);
  end if;
  select coalesce(sum(t.quantity), 0) into tickets from public.ticket_tiers t where t.event_id = e.id;
  if tickets > 0 and coalesce(e.capacity, cap) is not null and tickets > coalesce(e.capacity, cap) then
    out := out || jsonb_build_object('key', 'tickets_over_capacity', 'severity', 'blocker', 'message', tickets || ' tickets on sale but the approved capacity is ' || coalesce(e.capacity, cap) || '.', 'fix', base || '?tab=sell&section=tickets');
  end if;
  -- Supplier setup time vs the venue's access (setup) window.
  if sp.id is not null then
    for r in select b.title, (l.details->>'setup_minutes')::int need_min from public.build_items b join public.listings l on l.id = b.listing_id
             where b.event_id = e.id and b.category <> 'venue' and b.status in ('confirmed','held','quoted') and (l.details->>'setup_minutes') ~ '^\d+$'
               and (l.details->>'setup_minutes')::int > coalesce((sp.details->>'setup_minutes')::int, 0) loop
      out := out || jsonb_build_object('key', 'setup_window', 'severity', 'warning', 'message', r.title || ' needs ' || trim(trailing '.' from trim(trailing '0' from round(r.need_min / 60.0, 1)::text)) || 'h to set up but ' || sp.name || ' gives ' || trim(trailing '.' from trim(trailing '0' from round(coalesce((sp.details->>'setup_minutes')::int, 0) / 60.0, 1)::text)) || 'h access.', 'fix', base || '?tab=plan&section=suppliers');
    end loop;
    -- Power and ceiling constraints when both sides publish them.
    for r in select b.title, l.details from public.build_items b join public.listings l on l.id = b.listing_id where b.event_id = e.id and b.category <> 'venue' and b.status in ('confirmed','held','quoted') loop
      if (r.details->>'power_kw') ~ '^[0-9.]+$' and (sp.details->>'power_kw') ~ '^[0-9.]+$' and (r.details->>'power_kw')::numeric > (sp.details->>'power_kw')::numeric then
        out := out || jsonb_build_object('key', 'power', 'severity', 'blocker', 'message', r.title || ' needs ' || (r.details->>'power_kw') || 'kW; ' || sp.name || ' supplies ' || (sp.details->>'power_kw') || 'kW.', 'fix', base || '?tab=plan&section=suppliers');
      end if;
      if (r.details->>'min_ceiling_m') ~ '^[0-9.]+$' and (sp.details->>'ceiling_m') ~ '^[0-9.]+$' and (r.details->>'min_ceiling_m')::numeric > (sp.details->>'ceiling_m')::numeric then
        out := out || jsonb_build_object('key', 'ceiling', 'severity', 'blocker', 'message', r.title || ' needs ' || (r.details->>'min_ceiling_m') || 'm of headroom; the ceiling is ' || (sp.details->>'ceiling_m') || 'm.', 'fix', base || '?tab=plan&section=suppliers');
      end if;
    end loop;
    -- Programme runs past the venue's closing time.
    if jsonb_typeof(sp.details->'hours') = 'object' and e.starts_at is not null then
      select max(p.starts_at + make_interval(mins => coalesce(p.duration_minutes, 0))) into r from public.programme_items p where p.event_id = e.id;
    end if;
  end if;
  -- Programme vs bar hours from the BEO bar section is free text, so use the latest programme end vs event end.
  if exists (select 1 from public.programme_items p where p.event_id = e.id and e.ends_at is not null and p.starts_at + make_interval(mins => coalesce(p.duration_minutes, 0)) > e.ends_at + interval '1 minute') then
    out := out || jsonb_build_object('key', 'programme_overrun', 'severity', 'warning', 'message', 'The programme runs past the event end time — venue, bar and staff bookings may end first.', 'fix', base || '?tab=plan&section=programme');
  end if;
  -- Supplier travel: the same provider booked elsewhere too close to this event (or overlapping).
  for r in select b.title, o.event_name, o.starts_at from public.build_items b join public.listings l on l.id = b.listing_id
           join public.provider_jobs o on o.workspace_id = l.workspace_id and o.build_item_id is distinct from b.id and o.status in ('confirmed','active','held')
           where b.event_id = e.id and b.status in ('confirmed','held') and l.kind = 'service' and e.starts_at is not null and o.starts_at is not null
             and tstzrange(o.starts_at - interval '90 minutes', coalesce(o.ends_at, o.starts_at + interval '4 hours') + interval '90 minutes') && tstzrange(e.starts_at - interval '2 hours', coalesce(e.ends_at, e.starts_at + interval '5 hours'))
           limit 5 loop
    out := out || jsonb_build_object('key', 'supplier_travel', 'severity', 'warning', 'message', r.title || ' has another booking (' || r.event_name || ') too close to yours to travel between.', 'fix', base || '?tab=plan&section=suppliers');
  end loop;
  -- Security coverage: configurable ratio (events.settings.security_ratio, default 1 per 100 guests over 100).
  if guests > 100 then
    need := ceil(guests / coalesce(nullif((e.settings->>'security_ratio')::int, 0), 100)::numeric);
    select coalesce(sum(s.headcount), 0) into have from public.shifts s where s.event_id = e.id and s.role ilike '%secur%' and s.status <> 'unavailable';
    if have = 0 and exists (select 1 from public.build_items b where b.event_id = e.id and b.category in ('security','staff') and b.status in ('confirmed','held') and b.title ilike '%secur%') then have := need; end if;
    if have < need then
      out := out || jsonb_build_object('key', 'security_coverage', 'severity', 'warning', 'message', 'Security coverage: ' || have || ' of ' || need || ' required for ' || guests || ' guests.', 'fix', base || '?tab=operations&section=team');
    end if;
  end if;
  -- Hold expires before the organiser can realistically confirm (expires within 24h).
  for r in select b.title, h.expires_at from public.conditional_holds h join public.build_items b on b.id = h.build_item_id where h.event_id = e.id and h.status = 'held' and h.expires_at < now() + interval '24 hours' loop
    out := out || jsonb_build_object('key', 'hold_expiring', 'severity', 'warning', 'message', 'Hold on ' || r.title || ' expires ' || to_char(r.expires_at at time zone 'Europe/London', 'Dy HH24:MI') || '.', 'fix', base || '?tab=plan&section=suppliers');
  end loop;
  -- Catering final numbers.
  for r in select b.title, c.guest_count, c.final_numbers_due, c.status from public.catering_selections c join public.build_items b on b.id = c.build_item_id where c.event_id = e.id loop
    if guests > 0 and r.guest_count <> guests then
      out := out || jsonb_build_object('key', 'catering_numbers', 'severity', 'warning', 'message', r.title || ' is catering for ' || r.guest_count || ' but the event has ' || guests || ' guests.', 'fix', base || '?tab=plan&section=suppliers');
    end if;
  end loop;
  return out;
end $$;

-- ───────────────────────── §87 readiness: explainable domains (Ready / Attention / Blocked / Not Required) ─────────────────────────
create or replace function public.event_readiness(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; d jsonb := '[]'; checks jsonb := '[]'; base text; days numeric; feas jsonb; n integer; m integer; st text; why text;
  procedure_dummy integer;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  base := case when e.workspace_id is null then '/account/events/' || e.id else '/organizer/events/' || e.id end;
  days := case when e.starts_at is null then null else extract(epoch from (e.starts_at - now())) / 86400 end;

  -- Venue
  if exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'venue' and b.status in ('confirmed','active','fulfilled','completed')) or coalesce((e.settings->>'venue_confirmed')::boolean, false) then st := 'ready'; why := 'Venue confirmed.';
  elsif exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'venue' and b.status in ('replacement_required','cancelled_by_provider')) then st := 'blocked'; why := 'The venue cancelled — find a replacement.';
  elsif exists (select 1 from public.build_items b where b.event_id = e.id and b.category = 'venue' and b.status in ('held','conditionally_held','quoted','available','sent','awaiting')) then st := case when days is not null and days < 21 then 'blocked' else 'attention' end; why := 'Venue not confirmed yet.';
  elsif e.venue_name is not null and length(e.venue_name) > 0 then st := 'attention'; why := 'Venue named but not booked through Gala Dock — confirm it to count it.';
  else st := case when days is not null and days < 30 then 'blocked' else 'attention' end; why := 'No venue yet.'; end if;
  d := d || jsonb_build_object('key', 'venue', 'label', 'Venue', 'state', st, 'reason', why, 'fix', base || case when e.workspace_id is null then '/build' else '?tab=plan&section=venue' end);

  -- Suppliers
  select count(*) filter (where b.status in ('replacement_required','cancelled_by_provider')), count(*) filter (where b.status not in ('confirmed','active','fulfilled','completed'))
    into n, m from public.build_items b where b.event_id = e.id and b.role = 'primary' and b.category <> 'venue' and b.status not in ('suggested','draft','cancelled','declined','unavailable','expired');
  st := case when n > 0 then 'blocked' when m > 0 then 'attention' when exists (select 1 from public.build_items b where b.event_id = e.id and b.category <> 'venue' and b.role = 'primary' and b.status in ('confirmed','active','fulfilled')) then 'ready' else 'not_required' end;
  d := d || jsonb_build_object('key', 'suppliers', 'label', 'Suppliers', 'state', st, 'reason', case st when 'blocked' then n || ' supplier(s) need replacing.' when 'attention' then m || ' supplier(s) not confirmed yet.' when 'ready' then 'All booked suppliers confirmed.' else 'No suppliers needed so far.' end,
    'fix', base || case when e.workspace_id is null then '/build' else '?tab=plan&section=suppliers' end);

  -- Staff (shifts)
  select count(*) filter (where s.crew_id is null or s.status in ('pending','draft','unavailable')), count(*) into n, m from public.shifts s where s.event_id = e.id;
  st := case when m = 0 then 'not_required' when n > 0 then case when days is not null and days < 3 then 'blocked' else 'attention' end else 'ready' end;
  d := d || jsonb_build_object('key', 'staff', 'label', 'Staff', 'state', st, 'reason', case when m = 0 then 'No shifts planned.' when n > 0 then n || ' of ' || m || ' shifts unfilled or unconfirmed.' else 'All shifts staffed.' end, 'fix', base || '?tab=operations&section=team');

  -- Tickets
  if not exists (select 1 from public.ticket_tiers t where t.event_id = e.id) then st := 'not_required'; why := 'No tickets for this event.';
  elsif exists (select 1 from public.ticket_tiers t where t.event_id = e.id and t.status = 'on_sale') then st := 'ready'; why := 'Tickets on sale.';
  else st := case when days is not null and days < 14 then 'attention' else 'ready' end; why := 'Tickets set up but not on sale.'; end if;
  d := d || jsonb_build_object('key', 'tickets', 'label', 'Tickets', 'state', st, 'reason', why, 'fix', base || '?tab=sell&section=tickets');

  -- Guests
  st := case when exists (select 1 from public.guests g where g.event_id = e.id) or exists (select 1 from public.ticket_tiers t where t.event_id = e.id) then 'ready' else 'attention' end;
  d := d || jsonb_build_object('key', 'guests', 'label', 'Guests', 'state', st, 'reason', case st when 'ready' then 'Guest list or tickets in place.' else 'Add a guest list or tickets.' end, 'fix', base || case when e.workspace_id is null then '/guests-tickets' else '?tab=plan&section=guests' end);

  -- Money
  if exists (select 1 from public.payments p where p.event_id = e.id and p.status = 'overdue') then st := 'blocked'; why := 'Overdue payments.';
  elsif exists (select 1 from public.payment_orders po where po.event_id = e.id and po.status = 'failed') or exists (select 1 from public.payments p where p.event_id = e.id and p.status in ('due','scheduled') and p.due_at < now() + interval '7 days') then st := 'attention'; why := 'Payments due within 7 days or a payment failed.';
  else st := 'ready'; why := 'Nothing overdue.'; end if;
  d := d || jsonb_build_object('key', 'money', 'label', 'Money', 'state', st, 'reason', why, 'fix', base || case when e.workspace_id is null then '/money' else '?tab=money' end);

  -- Compliance: confirmed providers missing required credentials; client-held bar licence.
  select count(*) into n from public.build_items b join public.listings l on l.id = b.listing_id
    where b.event_id = e.id and b.status in ('confirmed','held') and exists (select 1 from public.workspace_credential_status(l.workspace_id) c where c.gates_marketplace and c.status <> 'verified');
  st := case when n > 0 then 'attention' else 'ready' end;
  d := d || jsonb_build_object('key', 'compliance', 'label', 'Compliance', 'state', st, 'reason', case when n > 0 then n || ' booked provider(s) have required documents outstanding.' else 'Booked providers meet document requirements.' end, 'fix', base || '?tab=plan&section=suppliers');

  -- Risk: open disputes / incidents.
  select count(*) into n from public.incidents i where i.event_id = e.id and i.status <> 'resolved' and i.severity in ('high','critical');
  select count(*) into m from public.booking_disputes x where x.event_id = e.id and x.status <> 'resolved';
  st := case when n > 0 then 'blocked' when m > 0 then 'attention' else 'ready' end;
  d := d || jsonb_build_object('key', 'risk', 'label', 'Risk', 'state', st, 'reason', case when n > 0 then n || ' serious incident(s) open.' when m > 0 then m || ' booking dispute(s) open.' else 'No open incidents or disputes.' end, 'fix', base || '?tab=operations&section=risk');

  -- Logistics: BEO approval and catering numbers ahead of the event.
  select count(*) into n from public.event_orders o where o.event_id = e.id and o.status in ('sent','revised');
  select count(*) into m from public.catering_selections c where c.event_id = e.id and c.status in ('draft') and c.final_numbers_due is not null and c.final_numbers_due <= current_date + 3;
  st := case when n + m > 0 then 'attention' else 'ready' end;
  d := d || jsonb_build_object('key', 'logistics', 'label', 'Logistics', 'state', st, 'reason', case when n > 0 then n || ' event order(s) awaiting your approval.' when m > 0 then 'Catering final numbers due.' else 'Event orders and catering in hand.' end, 'fix', base || '?tab=operations&section=logistics');

  -- Promotion
  st := case when coalesce(e.visibility, 'private') <> 'public' then 'not_required' when e.status in ('published','live','on_sale') then 'ready' else 'attention' end;
  d := d || jsonb_build_object('key', 'promotion', 'label', 'Promotion', 'state', st, 'reason', case st when 'not_required' then 'Private event.' when 'ready' then 'Public page live.' else 'Public event not published yet.' end, 'fix', base || '?tab=sell&section=public');

  -- Operations: run sheet in the final fortnight.
  st := case when exists (select 1 from public.programme_items p where p.event_id = e.id) then 'ready' when days is not null and days < 14 then 'attention' else 'not_required' end;
  d := d || jsonb_build_object('key', 'operations', 'label', 'Operations', 'state', st, 'reason', case st when 'ready' then 'Run sheet in place.' when 'attention' then 'No run sheet yet.' else 'Run sheet not needed yet.' end, 'fix', base || '?tab=operations&section=runsheet');

  -- Feasibility blockers escalate the relevant picture.
  feas := public.event_feasibility(p_event);
  if exists (select 1 from jsonb_array_elements(feas) f where f->>'severity' = 'blocker') then
    d := d || jsonb_build_object('key', 'feasibility', 'label', 'Feasibility', 'state', 'blocked', 'reason', (select f->>'message' from jsonb_array_elements(feas) f where f->>'severity' = 'blocker' limit 1), 'fix', (select f->>'fix' from jsonb_array_elements(feas) f where f->>'severity' = 'blocker' limit 1));
  elsif jsonb_array_length(feas) > 0 then
    d := d || jsonb_build_object('key', 'feasibility', 'label', 'Feasibility', 'state', 'attention', 'reason', jsonb_array_length(feas) || ' warning(s): ' || (feas->0->>'message'), 'fix', feas->0->>'fix');
  end if;

  -- Backwards-compatible checks list (ok = ready or not required), plus an explainable score.
  select jsonb_agg(jsonb_build_object('key', x->>'key', 'label', x->>'label', 'ok', x->>'state' in ('ready','not_required'), 'severity', case x->>'state' when 'blocked' then 'critical' when 'attention' then 'high' else 'medium' end, 'reason', x->>'reason', 'fix', x->>'fix'))
    into checks from jsonb_array_elements(d) x;
  select count(*) filter (where x->>'state' = 'ready'), count(*) filter (where x->>'state' <> 'not_required') into n, m from jsonb_array_elements(d) x;
  return jsonb_build_object('score', round(100.0 * n / greatest(m, 1)), 'checks', checks, 'domains', d, 'feasibility', feas,
    'state', case when exists (select 1 from jsonb_array_elements(d) x where x->>'state' = 'blocked') then 'blocked' when exists (select 1 from jsonb_array_elements(d) x where x->>'state' = 'attention') then 'attention' else 'ready' end);
end $$;

-- ───────────────────────── §85 team conflict engine ─────────────────────────
create or replace function public.team_conflicts(p_workspace uuid, p_from timestamptz default now(), p_to timestamptz default now() + interval '60 days')
returns table(kind text, severity text, shift_id uuid, other_id uuid, crew_id uuid, event_id uuid, message text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager','member','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  -- Overlapping shifts for the same person.
  select 'overlap', 'blocker', a.id, b.id, a.crew_id, a.event_id, coalesce(c.name, 'Crew member') || ' is double-booked: ' || a.title || ' and ' || b.title
    from public.shifts a join public.shifts b on b.crew_id = a.crew_id and b.id > a.id and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
    left join public.crew_members c on c.id = a.crew_id
    where a.workspace_id = p_workspace and a.crew_id is not null and a.status not in ('unavailable','cancelled') and b.status not in ('unavailable','cancelled') and a.starts_at < p_to and a.ends_at > p_from
  union all
  -- Travel-time impossibility: back-to-back shifts at different locations with under 60 minutes between.
  select 'travel', 'warning', a.id, b.id, a.crew_id, a.event_id, coalesce(c.name, 'Crew member') || ' has ' || greatest(0, round(extract(epoch from (b.starts_at - a.ends_at)) / 60))::int || ' min to get from ' || coalesce(a.location, 'one site') || ' to ' || coalesce(b.location, 'the next')
    from public.shifts a join public.shifts b on b.crew_id = a.crew_id and b.id <> a.id and b.starts_at >= a.ends_at and b.starts_at < a.ends_at + interval '60 minutes'
    left join public.crew_members c on c.id = a.crew_id
    where a.workspace_id = p_workspace and a.crew_id is not null and coalesce(a.location, '') <> coalesce(b.location, '') and a.starts_at < p_to and a.ends_at > p_from
  union all
  -- Unavailable staff (availability blocks on the crew member).
  select 'unavailable', 'blocker', s.id, ab.id, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || ' is unavailable (' || ab.kind || ') during ' || s.title
    from public.shifts s join public.availability_blocks ab on ab.crew_id = s.crew_id and ab.kind in ('blocked','maintenance') and tstzrange(ab.starts_at, ab.ends_at) && tstzrange(s.starts_at, s.ends_at)
    left join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Insufficient staffing: unassigned shifts.
  select 'unfilled', case when s.starts_at < now() + interval '3 days' then 'blocker' else 'warning' end, s.id, null::uuid, null::uuid, s.event_id, s.title || ' (' || coalesce(s.role, 'role') || ') has no one assigned'
    from public.shifts s where s.workspace_id = p_workspace and s.crew_id is null and s.status not in ('cancelled') and s.starts_at < p_to and s.ends_at > p_from
  union all
  -- Role qualification: crew skills must include the shift role when the role is a regulated one.
  select 'qualification', 'warning', s.id, null::uuid, s.crew_id, s.event_id, coalesce(c.name, 'Crew member') || ' isn’t listed as qualified for ' || s.role
    from public.shifts s join public.crew_members c on c.id = s.crew_id
    where s.workspace_id = p_workspace and s.starts_at < p_to and s.ends_at > p_from and s.role ~* '(security|first aid|medic|bar|driver|rigg|electric)'
      and not exists (select 1 from unnest(coalesce(c.skills, '{}')) k where lower(k) like '%' || lower(split_part(s.role, ' ', 1)) || '%') and lower(coalesce(c.role, '')) not like '%' || lower(split_part(s.role, ' ', 1)) || '%'
  union all
  -- Missing critical role: events over 100 guests with no first aid cover.
  select 'missing_role', 'warning', null::uuid, null::uuid, null::uuid, e.id, e.name || ' (' || e.guest_count || ' guests) has no first-aid cover planned'
    from public.events e where e.workspace_id = p_workspace and e.starts_at between p_from and p_to and coalesce(e.guest_count, 0) > 100
      and not exists (select 1 from public.shifts s where s.event_id = e.id and s.role ~* '(first aid|medic)')
      and not exists (select 1 from public.build_items b where b.event_id = e.id and b.status in ('confirmed','held') and b.title ~* '(first aid|medic|ambulance)');
end $$;

revoke all on function public.set_provider_checkin(uuid, text, timestamptz, text), public.event_feasibility(uuid), public.event_readiness(uuid), public.team_conflicts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.set_provider_checkin(uuid, text, timestamptz, text), public.event_feasibility(uuid), public.event_readiness(uuid), public.team_conflicts(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant select on public.provider_checkins to authenticated;
grant all on public.provider_checkins to service_role;
commit;
