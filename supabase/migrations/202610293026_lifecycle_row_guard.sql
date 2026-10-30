-- W11 backend (lane C, 2026-10-29) — (c) close the direct-status-write bypass. Additive.
--
-- Before: lifecycle preconditions (event_lifecycle_blockers: date, end, venue, stream, capacity, guests, public listing, programme,
-- tickets, payouts, + 3019/3020/3022 ops/compliance/map gating) applied only through event_transition(); a direct
-- `update events set status = 'published'` (PostgREST, or the savePage / Ticket Pro activate / publishTickets server actions) or an
-- insert straight into on_sale skipped them.
--
-- Now: AFTER INSERT OR UPDATE OF status row trigger `events_lifecycle_row_guard` applies the same blockers on the FIRST entry into
-- ready / published / on_sale — i.e. INSERT in one of those states, or UPDATE from draft / planning / ready. Same rule as 3019:
--   * events already published / on_sale / live (and postponed / suspended re-opens) are never blocked;
--   * cancel / postpone / complete / archive / live and complete_ended_events are untouched (other targets);
--   * event_transition() already checked (gd.event_cmd = id) -> skipped, no double work.
-- It runs AFTER the row changed so a single UPDATE that also fixes the date/venue is judged on the new values; OLD.status is passed
-- explicitly (event_lifecycle_blockers_for) so ops gating still knows it is a first entry.
--
-- Escape hatches (explicit and audited, never silent):
--   1. event_lifecycle_override_begin(reason): SERVICE_ONLY, transaction-local. Writes a grant row tied to txid_current() and sets
--      gd.lifecycle_override; the trigger accepts it only inside that same transaction and logs every event it lets through.
--      Used by create_demo_workspace (showcase events inserted on sale) and service_set_event_status (seeds / imports / fixtures).
--   2. Trusted service-role writes with no end-user JWT (auth.uid() is null: cron jobs, seeds, 80+ spec fixtures across lanes) and
--      Gala Dock admins acting on an event they are not a member of are ALLOWED, but every one that skipped blockers is recorded in
--      event_lifecycle_overrides (source service_direct / admin_direct, with the blockers). Flagged to the coordinator: tighten to
--      "override required" once the fixtures move to service_set_event_status (Q39).
-- End users (organisers, customers) writing directly get `lifecycle_preconditions: ...` (22023) with the blockers in DETAIL.

create table if not exists public.event_lifecycle_overrides (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('grant', 'use')),
  source text not null check (source in ('override', 'service_direct', 'admin_direct')),
  grant_id uuid references public.event_lifecycle_overrides(id),
  txid bigint not null default txid_current(),
  reason text not null default '' check (length(reason) <= 500),
  actor_id uuid,
  db_role text not null default current_user,
  event_id uuid,
  from_status text,
  to_status text,
  blockers jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists event_lifecycle_overrides_event_idx on public.event_lifecycle_overrides(event_id, created_at desc);
create index if not exists event_lifecycle_overrides_txid_idx on public.event_lifecycle_overrides(txid) where kind = 'grant';
alter table public.event_lifecycle_overrides enable row level security;
revoke all on table public.event_lifecycle_overrides from public, anon, authenticated;
grant select on table public.event_lifecycle_overrides to authenticated;
grant all on table public.event_lifecycle_overrides to service_role;
drop policy if exists event_lifecycle_overrides_admin_read on public.event_lifecycle_overrides;
create policy event_lifecycle_overrides_admin_read on public.event_lifecycle_overrides for select to authenticated using (public.has_admin_permission('events'));

-- Append-only (audit): no updates or deletes, even by the service role.
create or replace function public.trg_event_lifecycle_overrides_append_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'append_only: event_lifecycle_overrides rows cannot be changed' using errcode = '42501';
end $$;
revoke all on function public.trg_event_lifecycle_overrides_append_only() from public, anon, authenticated;
drop trigger if exists event_lifecycle_overrides_append_only on public.event_lifecycle_overrides;
create trigger event_lifecycle_overrides_append_only before update or delete on public.event_lifecycle_overrides
  for each row execute function public.trg_event_lifecycle_overrides_append_only();

create or replace function public.event_lifecycle_override_begin(p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if length(btrim(coalesce(p_reason, ''))) < 8 then raise exception 'reason_required' using errcode = '22023'; end if;
  insert into public.event_lifecycle_overrides(kind, source, reason, actor_id) values ('grant', 'override', left(btrim(p_reason), 500), (select auth.uid()))
    returning id into v;
  perform set_config('gd.lifecycle_override', v::text, true);   -- transaction-local
  return v;
end $$;
revoke all on function public.event_lifecycle_override_begin(text) from public, anon, authenticated;
grant execute on function public.event_lifecycle_override_begin(text) to service_role;

create or replace function public.event_lifecycle_override_current() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v text := nullif(current_setting('gd.lifecycle_override', true), ''); g uuid;
begin
  if v is null or v !~ '^[0-9a-f-]{36}$' then return null; end if;
  select id into g from public.event_lifecycle_overrides where id = v::uuid and kind = 'grant' and txid = txid_current();
  return g;
end $$;
revoke all on function public.event_lifecycle_override_current() from public, anon, authenticated;
grant execute on function public.event_lifecycle_override_current() to service_role;

create or replace function public.event_lifecycle_override_end() returns void
language sql security definer set search_path = '' as $$ select set_config('gd.lifecycle_override', '', true); $$;
revoke all on function public.event_lifecycle_override_end() from public, anon, authenticated;
grant execute on function public.event_lifecycle_override_end() to service_role;

-- Shared core (SERVICE_ONLY): identical to 3022 except p_from, alias resolution and the W11 ticketing blocker.
create or replace function public.event_lifecycle_blockers_for(p_event uuid, p_to text, p_from text default null)
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
  end if;
  return b;
end $function$;

revoke all on function public.event_lifecycle_blockers_for(uuid, text, text) from public, anon, authenticated;
grant execute on function public.event_lifecycle_blockers_for(uuid, text, text) to service_role;

-- Public signature unchanged: authorisation, then the shared core.
create or replace function public.event_lifecycle_blockers(p_event uuid, p_to text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.events where id = p_event) or not (public.can_access_event(p_event) or (select auth.uid()) is null) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return public.event_lifecycle_blockers_for(p_event, p_to, null);
end $$;
revoke all on function public.event_lifecycle_blockers(uuid, text) from public, anon, authenticated;
grant execute on function public.event_lifecycle_blockers(uuid, text) to authenticated, service_role;

create or replace function public.trg_event_lifecycle_row_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_from text; b jsonb; g uuid; uid uuid := (select auth.uid()); src text; cur text;
begin
  if new.status not in ('ready', 'published', 'on_sale') then return null; end if;
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status or old.status not in ('draft', 'planning', 'ready') then return null; end if;
    v_from := old.status;
  else
    v_from := 'draft';
  end if;
  if coalesce(current_setting('gd.event_cmd', true), '') = new.id::text then return null; end if;   -- event_transition already checked
  select status into cur from public.events where id = new.id;
  if cur is distinct from new.status then return null; end if;   -- changed again since (that change is judged on its own)
  g := public.event_lifecycle_override_current();
  if g is not null then
    insert into public.event_lifecycle_overrides(kind, source, grant_id, actor_id, event_id, from_status, to_status, blockers)
      values ('use', 'override', g, uid, new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
              public.event_lifecycle_blockers_for(new.id, new.status, v_from));
    return null;
  end if;
  if uid is null then src := 'service_direct';
  elsif public.has_admin_permission('events') and not public.can_access_event(new.id) then src := 'admin_direct';
  end if;
  begin
    b := public.event_lifecycle_blockers_for(new.id, new.status, v_from);
  exception when insufficient_privilege then
    -- ops gating is member-scoped; an admin outside the workspace is recorded with the structural check unavailable.
    if src is null then raise; end if;
    b := jsonb_build_array(jsonb_build_object('key', 'unchecked', 'label', 'Blockers not evaluated for this actor.'));
  end;
  if jsonb_array_length(b) = 0 then return null; end if;
  if src is not null then
    insert into public.event_lifecycle_overrides(kind, source, actor_id, event_id, from_status, to_status, blockers)
      values ('use', src, uid, new.id, case when tg_op = 'UPDATE' then old.status end, new.status, b);
    return null;
  end if;
  raise exception 'lifecycle_preconditions: %', (select string_agg(x ->> 'label', ' ') from jsonb_array_elements(b) x)
    using errcode = '22023', detail = b::text, hint = 'Fix the blockers, or use event_transition to see them.';
end $$;
revoke all on function public.trg_event_lifecycle_row_guard() from public, anon, authenticated;
drop trigger if exists events_lifecycle_row_guard on public.events;
create trigger events_lifecycle_row_guard after insert or update of status on public.events
  for each row execute function public.trg_event_lifecycle_row_guard();

-- Seeds / imports / fixtures: set an event's status through the explicit, audited override (no end-user path).
create or replace function public.service_set_event_status(p_event uuid, p_to text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; g uuid;
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.status = p_to then return jsonb_build_object('ok', true, 'changed', false, 'state', e.status); end if;
  g := public.event_lifecycle_override_begin(coalesce(p_reason, ''));
  update public.events set status = p_to, updated_at = now(),
    visibility = case when p_to in ('published', 'on_sale') then 'public' else visibility end where id = p_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (null, e.workspace_id, 'event.status_changed', jsonb_build_object('event_id', e.id, 'from', e.status, 'to', p_to, 'reason', p_reason, 'override', g, 'source', 'service'));
  perform public.event_lifecycle_override_end();
  return jsonb_build_object('ok', true, 'changed', true, 'from', e.status, 'state', p_to, 'override', g);
end $$;
revoke all on function public.service_set_event_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.service_set_event_status(uuid, text, text) to service_role;

-- create_demo_workspace (Q38): unchanged except the explicit override and ticketing switched on for its awards showcase event.
create or replace function public.create_demo_workspace(p_persona text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := auth.uid(); ws uuid; kind text; e1 uuid; e2 uuid; e3 uuid; t date := current_date; venue uuid; tag text := 'DEMO';
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_persona not in ('organizer','venue','supplier') then raise exception 'invalid_persona' using errcode = '22023'; end if;
  if (select count(*) from public.workspaces w where w.owner_id = uid and coalesce((w.settings ->> 'demo')::boolean, false)) >= 3 then raise exception 'limit_reached' using errcode = '22023'; end if;
  -- W11 (c): demo showcase events are inserted already on sale / ready — an explicit, audited, transaction-local lifecycle override.
  perform public.event_lifecycle_override_begin('create_demo_workspace: sample events for persona ' || p_persona);
  kind := case when p_persona = 'organizer' then 'organizer' else 'provider' end;
  insert into public.workspaces(owner_id, name, kind, settings, capabilities, onboarding_step, onboarding_complete, plan)
    values (uid, case p_persona when 'organizer' then 'Demo · Northern Lights Events' when 'venue' then 'Demo · The Old Mill Venue' else 'Demo · Feast & Co Catering' end, kind,
      jsonb_build_object('demo', true, 'demo_persona', p_persona, 'demo_created_at', now()), case p_persona when 'venue' then array['venue'] when 'supplier' then array['service'] else '{}'::text[] end,
      'complete', true, 'pro')
    returning id into ws;

  if p_persona = 'organizer' then
    insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, venue_name, location, city, guest_count, capacity, budget_total, revenue_goal, currency, description, tags, settings)
      values (uid, ws, 'professional', 'Winter Charity Gala', 'awards', 'private', 'on_sale', (t + 45) + time '19:00', (t + 45) + time '23:30', 'The Grand Assembly Rooms', 'King Street', 'Manchester', 280, 320, 42000, 65000, 'GBP',
        'Black-tie dinner, auction and live band raising funds for local youth charities.', array[tag], jsonb_build_object('demo', true, 'ticketed', true)) returning id into e1;
    insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, venue_name, location, city, guest_count, capacity, budget_total, revenue_goal, currency, description, tags, settings)
      values (uid, ws, 'professional', 'Riverside Summer Festival', 'festival', 'private', 'planning', (t + 120) + time '12:00', (t + 121) + time '22:00', 'Riverside Park', 'Riverside Park', 'Leeds', 3500, 4000, 185000, 260000, 'GBP',
        'Two-day food, music and family festival on the river.', array[tag], jsonb_build_object('demo', true)) returning id into e2;
    insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, venue_name, location, city, guest_count, capacity, budget_total, currency, description, tags, settings)
      values (uid, ws, 'professional', 'Product Launch Breakfast', 'corporate', 'private', 'ready', (t + 18) + time '08:00', (t + 18) + time '11:00', 'Glasshouse Studios', 'Ancoats', 'Manchester', 120, 150, 9500, 'GBP',
        'Invite-only launch with keynote, demo stations and breakfast.', array[tag], jsonb_build_object('demo', true)) returning id into e3;
    insert into public.ticket_tiers(event_id, name, price, quantity, sold, status, sort) values
      (e1, 'Early bird', 95, 80, 80, 'sold_out', 1), (e1, 'Standard', 125, 180, 112, 'on_sale', 2), (e1, 'Table of 10', 1150, 6, 3, 'on_sale', 3),
      (e2, 'Day ticket', 35, 2500, 0, 'draft', 1), (e2, 'Weekend', 60, 1200, 0, 'draft', 2);
    insert into public.programme_items(event_id, starts_at, duration_minutes, title, area, kind) values
      (e1, (t + 45) + time '19:00', 60, 'Drinks reception', 'Foyer', 'programme'), (e1, (t + 45) + time '20:00', 90, 'Dinner', 'Main hall', 'programme'),
      (e1, (t + 45) + time '21:30', 45, 'Charity auction', 'Main hall', 'programme'), (e1, (t + 45) + time '22:15', 75, 'Live band', 'Main hall', 'programme');
    insert into public.tasks(event_id, workspace_id, owner_id, title, category, due_at, priority, status) values
      (e1, ws, uid, 'Confirm final table plan', 'guests', (t + 38)::timestamptz, 'high', 'todo'), (e1, ws, uid, 'Send auction lot list to printer', 'production', (t + 30)::timestamptz, 'medium', 'todo'),
      (e2, ws, uid, 'Apply for temporary event notice', 'compliance', (t + 60)::timestamptz, 'critical', 'todo'), (e3, ws, uid, 'Brief demo station staff', 'team', (t + 16)::timestamptz, 'medium', 'in_progress');
    insert into public.build_items(event_id, category, title, amount, status, role, sort) values
      (e1, 'catering', 'Three-course dinner for 280', 16800, 'confirmed', 'primary', 1), (e1, 'entertainment', 'Six-piece function band', 3200, 'held', 'primary', 2),
      (e1, 'production', 'Stage, lighting and PA', 5400, 'awaiting_payment', 'primary', 3), (e2, 'security', 'SIA stewarding team', 14500, 'draft', 'primary', 1);
    insert into public.leads(workspace_id, reference, name, client_name, contact_name, contact_email, event_type, stage, value, probability, expected_date, guests, source)
      values (ws, 'DEMO-L1', 'Spring Awards Dinner', 'Pennine Housing Group', 'Sam Patel', 'sam@example.com', 'awards', 'proposal', 28000, 60, t + 160, 220, 'referral'),
             (ws, 'DEMO-L2', 'Staff Summer Party', 'Northside Tech', 'Alex Morgan', 'alex@example.com', 'party', 'qualified', 12000, 40, t + 90, 150, 'website');
  else
    insert into public.listings(workspace_id, name, kind, category, description, city, price_from, price_unit, capacity_min, capacity_max, published, review_status, response_hours, booking_mode, tags, details)
      values (ws, case when p_persona = 'venue' then 'The Old Mill — Main Hall' else 'Feast & Co — Seasonal dining' end, case when p_persona = 'venue' then 'venue' else 'service' end,
        case when p_persona = 'venue' then 'venue' else 'catering' end,
        case when p_persona = 'venue' then 'Restored 1860s mill with exposed beams, river views and a 250-seat main hall.' else 'Seasonal menus from canapés to five-course dinners, with full allergen labelling.' end,
        'Manchester', case when p_persona = 'venue' then 2400 else 45 end, case when p_persona = 'venue' then 'day' else 'head' end, 20, 250,
        false, 'pending', 4, 'request', array[tag], jsonb_build_object('demo', true))
      returning id into venue;
    insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, venue_name, city, guest_count, capacity, currency, tags, settings)
      values (uid, ws, 'professional', case when p_persona = 'venue' then 'Booked: Henderson Wedding' else 'Catering: Henderson Wedding' end, 'wedding', 'private', 'planning',
        (t + 30) + time '14:00', (t + 30) + time '23:00', 'The Old Mill', 'Manchester', 140, 160, 'GBP', array[tag], jsonb_build_object('demo', true)) returning id into e1;
    insert into public.tasks(event_id, workspace_id, owner_id, title, category, due_at, priority, status) values
      (e1, ws, uid, 'Confirm final numbers and dietary list', 'guests', (t + 23)::timestamptz, 'high', 'todo'),
      (e1, ws, uid, case when p_persona = 'venue' then 'Walk-through with the couple' else 'Tasting session' end, 'planning', (t + 10)::timestamptz, 'medium', 'todo');
  end if;
  insert into public.notifications(user_id, kind, title, body, link)
    values (uid, 'event_update', 'Your demo workspace is ready', 'Everything in it is sample data marked DEMO. Reset or delete it any time from Settings.', '/' || kind);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (uid, 'user', ws, 'demo.created', jsonb_build_object('persona', p_persona));
  perform public.event_lifecycle_override_end();   -- close the hatch: later statements in the same transaction are checked again
  return ws;
end $function$;
