-- Q19 hook (lane C, 2026-10-29) — publish gating with the venue-map validation errors from lane A's event_map_blockers(event).
-- Same rule as 3019's ops blockers: only transitions INTO ready / published / on_sale from draft / planning / ready; never events
-- already published / on_sale / live (e.g. a published demo map with too few exits keeps its event selling — the error still shows
-- on the map page), never cancel / postpone / complete / archive or complete_ended_events. Same signature and grants; additive.

create or replace function public.event_lifecycle_blockers(p_event uuid, p_to text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; p public.event_type_profiles; b jsonb := '[]'; online boolean; venue_ok boolean; n integer; base text;
begin
  select * into e from public.events where id = p_event;
  if not found or not (public.can_access_event(p_event) or (select auth.uid()) is null) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into p from public.event_type_profiles where event_type = e.event_type;
  if not found then select * into p from public.event_type_profiles where event_type = 'custom'; end if;
  base := case when e.workspace_id is null then '/account/events/' || e.id else '/organizer/events/' || e.id end;
  online := coalesce(p.online, false)
    or coalesce(e.settings -> 'virtual', 'false'::jsonb) not in ('false'::jsonb, 'null'::jsonb, '""'::jsonb)
    or exists (select 1 from public.event_virtual v where v.event_id = e.id and v.format <> 'hybrid');
  venue_ok := coalesce(e.settings ->> 'venue_confirmed', '') = 'true'
    or exists (select 1 from public.build_items x where x.event_id = e.id and x.category = 'venue' and x.status in ('confirmed','active','fulfilled','completed'));

  if p_to in ('ready', 'published', 'on_sale') then
    if e.settings ? 'admin_restriction' then
      b := b || jsonb_build_object('key', 'restricted', 'label', 'Gala Dock has restricted this event. Contact support to appeal.', 'fix', '/help');
    end if;
    if e.starts_at is null then
      b := b || jsonb_build_object('key', 'date', 'label', 'Set the event date and start time.', 'fix', base);
    elsif p_to <> 'ready' and e.starts_at <= now() then
      b := b || jsonb_build_object('key', 'date_past', 'label', 'The event date has passed. Reschedule it before publishing.', 'fix', base);
    end if;
    if p.requires_end and e.ends_at is null then
      b := b || jsonb_build_object('key', 'end', 'label', 'Add an end time — required for this event type.', 'fix', base);
    end if;
    if p.requires_venue and not online and not venue_ok then
      b := b || jsonb_build_object('key', 'venue', 'label', 'Confirm the venue (book it, or record an off-platform venue).', 'fix', base || '?tab=plan&section=venue');
    end if;
    if p.online and not exists (select 1 from public.event_virtual v where v.event_id = e.id
        and (coalesce(v.join_url, '') <> '' or coalesce(v.external_id, '') <> '' or coalesce(v.session_id, '') <> '')) then
      b := b || jsonb_build_object('key', 'stream', 'label', 'Set up the online stream (provider and join link).', 'fix', base || '/virtual');
    end if;
    if p.requires_capacity and coalesce(e.capacity, 0) = 0 then
      b := b || jsonb_build_object('key', 'capacity', 'label', 'Set the capacity — required for this event type.', 'fix', base);
    end if;
    if p.requires_guests and coalesce(e.guest_count, 0) = 0 and coalesce(e.capacity, 0) = 0 then
      b := b || jsonb_build_object('key', 'guests', 'label', 'Add the expected number of guests.', 'fix', base);
    end if;
  end if;

  if p_to in ('published', 'on_sale') then
    if not p.public_listing_allowed then
      b := b || jsonb_build_object('key', 'public_listing', 'label', 'This event type is never listed publicly. Share a private guest link instead.', 'fix', base);
    end if;
    if p.requires_programme and not exists (select 1 from public.programme_items x where x.event_id = e.id and x.kind = 'programme') then
      b := b || jsonb_build_object('key', 'programme', 'label', 'Add the line-up or sessions to the programme before publishing.', 'fix', base || '?tab=plan&section=programme');
    end if;
  end if;

  if p_to = 'on_sale' then
    if not exists (select 1 from public.ticket_tiers t where t.event_id = e.id and t.status in ('on_sale', 'scheduled')) then
      b := b || jsonb_build_object('key', 'tickets', 'label', 'Set up at least one ticket tier (Tickets setup) before going on sale.', 'fix', base || '?tab=sell&section=tickets');
    end if;
    if e.workspace_id is not null and exists (select 1 from public.ticket_tiers t where t.event_id = e.id and t.price > 0 and t.status in ('on_sale', 'scheduled'))
       and coalesce((select w.payout_status from public.workspaces w where w.id = e.workspace_id), '') <> 'active' then
      b := b || jsonb_build_object('key', 'payouts', 'label', 'Connect payouts in Settings › Payments before selling paid tickets.', 'fix', '/organizer/settings?tab=payments');
    end if;
  end if;

  if p_to = 'live' and (e.starts_at is null or e.starts_at - now() > interval '36 hours') then
    b := b || jsonb_build_object('key', 'live_window', 'label', 'Live Mode opens 36 hours before the event starts.', 'fix', base);
  end if;
  if p_to = 'completed' and (e.starts_at is null or e.starts_at > now()) then
    b := b || jsonb_build_object('key', 'not_started', 'label', 'An event can only be completed once it has started.', 'fix', base);
  end if;
  if p_to = 'cancelled' then
    select count(*) into n from public.tickets t where t.event_id = e.id and t.status = 'valid';
    if n > 0 then
      b := b || jsonb_build_object('key', 'valid_tickets', 'label', n || ' valid tickets exist. Cancel through the refund workflow so ticket holders are refunded first.', 'fix', base);
    end if;
  end if;
  if p_to = 'archived' and e.status not in ('completed', 'closed', 'cancelled') then
    select count(*) into n from public.tickets t where t.event_id = e.id and t.status = 'valid';
    if n > 0 then
      b := b || jsonb_build_object('key', 'valid_tickets', 'label', n || ' valid tickets exist. Cancel or refund them (or complete the event) before archiving.', 'fix', base);
    end if;
  end if;
  -- Q24–Q26 operations / compliance + Q19 map gating (lane C, 3019/3020): only when an event moves INTO ready / published / on_sale from an
  -- EARLIER state (draft, planning, ready). Events already published / on_sale / live (and postponed / suspended re-opens, which
  -- were already selling) are never blocked by it, so live events keep selling while their blockers show in readiness.
  -- Cancel / postpone / complete / archive and the complete_ended_events job are unaffected (different targets / transition_state).
  if p_to in ('ready', 'published', 'on_sale') and e.status in ('draft', 'planning', 'ready') and e.status <> p_to then
    b := b || public.event_ops_blockers(p_event, p_to);
    b := b || public.event_map_blockers(p_event);   -- Q19 (lane A): published map validation errors (map_<code>)
  end if;
  return b;
end $function$;

revoke all on function public.event_lifecycle_blockers(uuid, text) from public, anon, authenticated;
grant execute on function public.event_lifecycle_blockers(uuid, text) to authenticated, service_role;
