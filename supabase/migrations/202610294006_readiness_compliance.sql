-- Q14 Event Core 6 — readiness compliance fix (reported by Q08).
-- event_readiness() is SECURITY DEFINER but its Compliance check called workspace_credential_status(provider_ws), which only
-- returns rows to members of that provider workspace — so for the organiser it was always empty and Compliance always read
-- "ready". It now asks Q08's service-only evaluator trust_credential_rows() directly (workspace-level and listing-level rules;
-- blocking = a marketplace-gating credential that is not verified, incl. expired). Body otherwise identical to the live definition.
CREATE OR REPLACE FUNCTION public.event_readiness(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where b.event_id = e.id and b.status in ('confirmed','held') and (exists (select 1 from public.trust_credential_rows(l.workspace_id, null) c where c.blocking)
           or exists (select 1 from public.trust_credential_rows(l.workspace_id, l.id) c where c.blocking));
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
end $function$;
