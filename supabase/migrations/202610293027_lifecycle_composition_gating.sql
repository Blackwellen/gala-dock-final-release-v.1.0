-- Lane C, 2026-10-29 (coordinator add-on to W11 c): Q40 composition blockers join the lifecycle preconditions.
-- event_lifecycle_blockers_for (3026 core, used by event_lifecycle_blockers, event_transition and the events_lifecycle_row_guard
-- trigger) appends public.event_composition_blockers(event, to) rows with severity = 'block' inside the 3019 gate: only on the
-- FIRST entry into ready / published / on_sale (from draft / planning / ready). Already published / on_sale / live events are never
-- blocked, and cancel / postpone / complete / archive / complete_ended_events are untouched (their composition checks, such as
-- children_unhandled, remain lane A's commands). Warnings (pass_holders_affected) never block. Otherwise identical to 3026. Additive.

create or replace function public.event_lifecycle_blockers_for(p_event uuid, p_to text, p_from text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; p public.event_type_profiles; b jsonb := '[]'; online boolean; venue_ok boolean; n integer; base text; v_from text; tk jsonb;
begin
  select * into e from public.events where id = p_event;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_from := coalesce(p_from, e.status);   -- the row guard passes OLD.status (it runs after the row changed)
  p := public.event_type_profile_of(e.event_type);   -- W11 (d): aliases resolve to their profile
  base := case when e.workspace_id is null then '/account/events/' || e.id else '/organizer/events/' || e.id end;
  online := coalesce(p.online, false)
    or coalesce(e.settings -> 'virtual', 'false'::jsonb) not in ('false'::jsonb, 'null'::jsonb, '""'::jsonb)
    or exists (select 1 from public.event_virtual v where v.event_id = e.id and v.format <> 'hybrid')
    or (exists (select 1 from public.virtual_sessions s where s.event_id = e.id and s.status not in ('cancelled','archived'))
        and not exists (select 1 from public.event_virtual v where v.event_id = e.id and v.format = 'hybrid'));
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
        and (coalesce(v.join_url, '') <> '' or coalesce(v.external_id, '') <> '' or coalesce(v.session_id, '') <> ''))
       and not exists (select 1 from public.virtual_sessions s where s.event_id = e.id and s.status not in ('cancelled','archived')
        and (s.join_url is not null or s.external_meeting_id is not null)) then
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

  -- W11 (a): optional_off / private_only types need ticketing switched on before going on sale.
  if p_to = 'on_sale' and p.ticketing <> 'default_on' then
    tk := public.event_ticketing_check(p_event, null, 0);
    if not coalesce((tk ->> 'allowed')::boolean, false) then
      b := b || jsonb_build_object('key', 'ticketing', 'label', tk ->> 'reason', 'fix', base || '?tab=sell&section=tickets');
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
  if p_to in ('ready', 'published', 'on_sale') and v_from in ('draft', 'planning', 'ready') and v_from <> p_to then
    b := b || public.event_ops_blockers(p_event, p_to);
    b := b || public.event_map_blockers(p_event);   -- Q19 (lane A): published map validation errors (map_<code>)
    -- Q40 (lane A) composition: parent not published, archived series, pass including a cancelled date. Only severity = block
    -- rows gate; warnings (e.g. pass_holders_affected) stay in readiness. Same first-entry rule as 3019.
    b := b || coalesce((select jsonb_agg(x) from jsonb_array_elements(public.event_composition_blockers(p_event, p_to)) x where x ->> 'severity' = 'block'), '[]'::jsonb);
  end if;
  return b;
end $function$;

revoke all on function public.event_lifecycle_blockers_for(uuid, text, text) from public, anon, authenticated;
grant execute on function public.event_lifecycle_blockers_for(uuid, text, text) to service_role;
