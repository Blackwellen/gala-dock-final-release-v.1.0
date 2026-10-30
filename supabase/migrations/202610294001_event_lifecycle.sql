-- Q14 Event Core 1/5 — guarded event lifecycle (backend §17 Event, domains 32.8, 33, 35, 37).
-- Additive and backward-compatible with the deployed code:
--   * events_status_check is kept (same 12 values). The `event` machine (src/lib/domain/state-machines.ts →
--     209912310001_state_seed.sql) adds the generic enforce trigger `events_state_guard`; its transition table covers
--     every path the deployed code takes, so existing flows keep working while impossible jumps (completed → on_sale,
--     archived → anything, cancelled → live …) are rejected for every caller, service role included.
--   * events_lifecycle_guard closes the `suspended` detour: only Gala Dock admins / the service role can lift an
--     admin restriction, and leaving `suspended` for a state other than on_sale/live/cancelled must return to the
--     recorded previous status.
--   * event_transition(): the explicit command (permissions, optimistic concurrency, event-type preconditions,
--     audit + outbox in one transaction). New code changes event status only through it.
--   * event_lifecycle_blockers(): the computed blockers for a target state, shown to the user instead of hidden warnings.
--   * event_type_profiles: GD-12 event-type-adaptive requirements keyed by the Q02 event_type taxonomy.
--   * events_state_outbox: direct status writes from deployed code still emit event.state_changed (source = direct).

-- ═══ 1. Event-type profiles (GD-12) ═══
create table if not exists public.event_type_profiles (
  event_type text primary key check (event_type ~ '^[a-z][a-z0-9_]*$'),
  online boolean not null default false,             -- online-only: a configured stream replaces the venue
  requires_venue boolean not null default true,
  requires_end boolean not null default false,       -- multi-session / multi-day events need an end time
  requires_capacity boolean not null default false,
  requires_guests boolean not null default false,    -- expected guests (guest_count) or capacity
  requires_programme boolean not null default false, -- line-up / sessions before publication
  public_listing_allowed boolean not null default true,
  guest_privacy text not null default 'standard' check (guest_privacy in ('standard','private','minimised')),
  modules text[] not null default '{}',
  notes text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.event_type_profiles enable row level security;
revoke all on table public.event_type_profiles from public, anon, authenticated;
grant select on table public.event_type_profiles to anon, authenticated;
grant all on table public.event_type_profiles to service_role;
drop policy if exists event_type_profiles_read on public.event_type_profiles;
create policy event_type_profiles_read on public.event_type_profiles for select to anon, authenticated using (true);

insert into public.event_type_profiles(event_type, online, requires_venue, requires_end, requires_capacity, requires_guests, requires_programme, public_listing_allowed, guest_privacy, modules, notes) values
  ('custom',          false, true,  false, false, false, false, true,  'standard',  '{}', 'Default profile for any type without its own row.'),
  ('wedding',         false, true,  false, false, true,  false, true,  'private',   array['guests','seating','suppliers','run_of_show','deposits'], 'Guest grouping, seating, supplier run-of-show, deposits.'),
  ('birthday',        false, true,  false, false, true,  false, true,  'private',   array['guests','rsvp','packages'], 'Guest privacy, RSVP, packages.'),
  ('childrens_party', false, true,  false, false, true,  false, false, 'minimised', array['guests','rsvp','packages','safeguarding'], 'Child data minimisation, safeguarding; never listed publicly — share a private guest link.'),
  ('concert',         false, true,  true,  true,  false, false, true,  'standard',  array['tickets','acts','production','crew','emergency_plan'], 'Reserved/GA inventory, acts, production rider, crew, emergency plan.'),
  ('festival',        false, true,  true,  true,  false, true,  true,  'standard',  array['tickets','stages','passes','shifts','zones','maps'], 'Multiple stages, passes/day allocations, shifts, capacity by zone.'),
  ('conference',      false, true,  true,  false, false, true,  true,  'standard',  array['sessions','rooms','speakers','sponsors','badges'], 'Sessions/rooms, speakers, exhibitors/sponsors, badges.'),
  ('webinar',         true,  false, true,  false, false, false, true,  'standard',  array['stream','registration','replay'], 'Stream/link privacy, timezones, registration capacity, replay window.'),
  ('nightlife',       false, true,  true,  true,  false, false, true,  'standard',  array['tickets','door','age_policy','security'], 'Door scanning, age restrictions, timed capacity, DJs/sets.'),
  ('gala',            false, true,  false, false, true,  false, true,  'standard',  array['guests','seating','run_of_show'], 'Guest grouping, seating plans, run-of-show.'),
  ('charity',         false, true,  false, false, true,  false, true,  'standard',  array['guests','seating','donations'], 'Fundraiser: guests, seating, donations if configured.')
on conflict (event_type) do update set online = excluded.online, requires_venue = excluded.requires_venue, requires_end = excluded.requires_end,
  requires_capacity = excluded.requires_capacity, requires_guests = excluded.requires_guests, requires_programme = excluded.requires_programme,
  public_listing_allowed = excluded.public_listing_allowed, guest_privacy = excluded.guest_privacy, modules = excluded.modules, notes = excluded.notes, updated_at = now();

-- ═══ 2. Domain events ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('event.state_changed', 1, 'event', 'An event moved through its lifecycle (payload: id, from, to, reason, source).', null),
  ('event.duplicated', 1, 'event', 'An event was copied to a new date (payload: id, source_id, shift_seconds).', null),
  ('event.completed', 1, 'event', 'An ended event was moved out of sale by the ended-events job.', null),
  ('event.guest_link_created', 1, 'event', 'A private guest link was issued for an event.', null),
  ('event.guest_link_revoked', 1, 'event', 'A private guest link was revoked.', null)
on conflict (event_type) do update set aggregate = excluded.aggregate, description = excluded.description, active = true, updated_at = now();

-- ═══ 3. Suspension / admin-restriction guard ═══
create or replace function public.trg_event_lifecycle_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare privileged boolean := (select auth.uid()) is null or public.has_admin_permission('events');
begin
  -- An admin restriction can only be lifted by Gala Dock (admin_set_event_restriction) or a trusted worker.
  if (old.settings ? 'admin_restriction') and not (coalesce(new.settings, '{}') ? 'admin_restriction') and not privileged then
    raise exception 'event_restricted: only Gala Dock can lift this restriction' using errcode = '42501';
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if (old.settings ? 'admin_restriction') and old.status = 'suspended' and not privileged then
    raise exception 'event_restricted: only Gala Dock can lift this restriction' using errcode = '42501';
  end if;
  -- Entering `suspended` from a non-selling state is an admin restriction, never an organiser shortcut.
  if new.status = 'suspended' and old.status not in ('on_sale', 'live') and not (coalesce(new.settings, '{}') ? 'admin_restriction') then
    raise exception 'illegal event transition % -> suspended', old.status using errcode = '22023';
  end if;
  -- Leaving `suspended`: back to selling/live, cancelled, or exactly the status recorded when it was restricted.
  if old.status = 'suspended' and new.status not in ('on_sale', 'live', 'cancelled')
     and new.status is distinct from (old.settings -> 'admin_restriction' ->> 'previous_status') then
    raise exception 'illegal event transition suspended -> %', new.status using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists events_lifecycle_guard on public.events;
create trigger events_lifecycle_guard before update of status, settings on public.events
  for each row execute function public.trg_event_lifecycle_guard();

-- ═══ 4. Outbox for direct status writes (deployed code paths) ═══
create or replace function public.trg_event_state_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and coalesce(current_setting('gd.event_cmd', true), '') <> new.id::text then
    perform public.emit_domain_event('event.state_changed', new.workspace_id,
      jsonb_build_object('id', new.id, 'from', old.status, 'to', new.status, 'source', 'direct'),
      (select auth.uid()), case when (select auth.uid()) is null then 'system' else 'user' end, 'event', new.id::text, null, null);
  end if;
  return null;
end $$;
drop trigger if exists events_state_outbox on public.events;
create trigger events_state_outbox after update of status on public.events
  for each row execute function public.trg_event_state_outbox();

-- ═══ 5. Computed blockers for a target state ═══
create or replace function public.event_lifecycle_blockers(p_event uuid, p_to text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
  return b;
end $$;

-- ═══ 6. The explicit lifecycle command ═══
create or replace function public.event_transition(p_event uuid, p_to text, p_expected text default null, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; uid uuid := (select auth.uid()); blockers jsonb; r jsonb;
begin
  if p_reason is not null and length(p_reason) > 2000 then raise exception 'reason_too_long' using errcode = '22023'; end if;
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.workspace_id is null then
    if uid is null or e.owner_id is distinct from uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  else
    if not public.has_permission(e.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
    if p_to in ('cancelled', 'postponed', 'suspended', 'archived') and not public.has_workspace_role(e.workspace_id, array['owner', 'manager']) then
      raise exception 'not_authorized: owners and managers only' using errcode = '42501';
    end if;
  end if;
  if p_expected is not null and e.status is distinct from p_expected then
    return jsonb_build_object('ok', false, 'conflict', true, 'current', e.status);
  end if;
  if e.status = p_to then return jsonb_build_object('ok', true, 'changed', false, 'state', e.status); end if;
  if not public.state_transition_allowed('event', e.status, p_to) then
    raise exception 'illegal event transition % -> %', e.status, p_to using errcode = '22023';
  end if;
  blockers := public.event_lifecycle_blockers(p_event, p_to);
  if jsonb_array_length(blockers) > 0 then
    return jsonb_build_object('ok', false, 'error', 'preconditions', 'from', e.status, 'to', p_to, 'blockers', blockers);
  end if;
  perform set_config('gd.event_cmd', p_event::text, true);
  r := public.transition_state('event', p_event, p_to, e.status, uid, 'user', p_reason, null);
  perform set_config('gd.event_cmd', '', true);
  update public.events set updated_at = now(), visibility = case when p_to in ('published', 'on_sale') then 'public' else visibility end where id = p_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (uid, e.workspace_id, 'event.status_changed', jsonb_build_object('event_id', e.id, 'from', e.status, 'to', p_to, 'reason', p_reason));
  return r;
end $$;

revoke all on function public.trg_event_lifecycle_guard() from public, anon, authenticated;
revoke all on function public.trg_event_state_outbox() from public, anon, authenticated;
revoke all on function public.event_lifecycle_blockers(uuid, text) from public, anon, authenticated;
revoke all on function public.event_transition(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.event_lifecycle_blockers(uuid, text), public.event_transition(uuid, text, text, text) to authenticated, service_role;
