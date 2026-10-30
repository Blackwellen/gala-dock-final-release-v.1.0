-- Q14 Event Core 3/5 — event cloning to a new date (domain 32.3; W03 journey 4).
-- duplicate_event() replaces the client-side copy in src/lib/actions/events.ts (which copied programme times as absolute
-- source timestamps, set no date, copied settings wholesale and needed no confirmation). One transaction:
--   * requires an explicit confirmation, a new start (wall-clock in the chosen IANA timezone) in the future;
--   * shifts programme / run sheet / day plan, task deadlines and ticket sale windows by (new start − source start),
--     so every item keeps its offset from the event start;
--   * copies only an allow-listed subset of settings (page layout, modules, policies) — never venue confirmation,
--     invite tokens, ticketing activation, admin restrictions, readiness snapshots, demo/seed markers or client refs;
--   * never copies guests, tickets, orders, payments, bookings/holds (build_items), seats, shifts, incidents, files,
--     portal/guest links or the sales lead; ticket tiers come back as drafts with sold = held = 0;
--   * idempotent per request id; audit_events + domain_outbox (event.duplicated).

create or replace function public.duplicate_event(p_source uuid, p_starts_local timestamp, p_timezone text, p_confirm boolean,
  p_name text default null, p_request_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.events; uid uuid := (select auth.uid()); v_new uuid; v_start timestamptz; v_anchor timestamptz; v_shift interval; v_name text;
  v_settings jsonb; n_tiers integer := 0; n_prog integer := 0; n_tasks integer := 0; t record; v_tier uuid; v_map jsonb := '{}';
  keep constant text[] := array['modules','provider_categories','template_id','public_page','page_blocks','hero_title','subtitle','hero_overlay','cta','seo',
    'style','accessibility','hero_image','hero_compact','hero_compact_tabs','thumb','poster','gallery','highlights','faqs','features','objectives',
    'reentry','curfew','age_limit','entry_gate','ticket_capacity','ticketed','resale','transfers','type_settings','areas','budget_mode','budget_min',
    'budget_max','budget_lines','revenue_sources','optional_categories','virtual','planned_with_wizard','allocation'];
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_confirm is not true then raise exception 'confirmation_required' using errcode = '22023'; end if;
  if p_starts_local is null then raise exception 'new_date_required' using errcode = '22023'; end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  if p_request_id is not null and length(p_request_id) > 80 then raise exception 'invalid_request_id' using errcode = '22023'; end if;

  select * into e from public.events where id = p_source;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.workspace_id is null then
    if e.owner_id is distinct from uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  elsif not public.has_permission(e.workspace_id, 'events.write') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_request_id is not null then
    select x.id into v_new from public.events x where x.settings ->> 'duplicate_request' = p_request_id and x.settings ->> 'duplicated_from' = e.id::text
      and x.workspace_id is not distinct from e.workspace_id limit 1;
    if v_new is not null then return jsonb_build_object('ok', true, 'id', v_new, 'replayed', true); end if;
  end if;

  v_start := p_starts_local at time zone p_timezone;
  if v_start <= now() then raise exception 'new_date_in_past' using errcode = '22023'; end if;
  v_anchor := coalesce(e.starts_at, (select min(x.starts_at) from public.programme_items x where x.event_id = e.id));
  v_shift := case when v_anchor is null then interval '0' else v_start - v_anchor end;
  v_name := left(coalesce(nullif(btrim(p_name), ''), e.name || ' (copy)'), 120);

  select coalesce(jsonb_object_agg(k, e.settings -> k), '{}'::jsonb) into v_settings from unnest(keep) k where coalesce(e.settings, '{}') ? k;
  v_settings := v_settings || jsonb_build_object('duplicated_from', e.id, 'duplicated_at', now(), 'duplicated_by', uid)
    || case when p_request_id is not null then jsonb_build_object('duplicate_request', p_request_id) else '{}'::jsonb end;

  insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, timezone, flexible_dates,
      venue_listing_id, venue_name, location, city, guest_count, adults, children, capacity, budget_total, revenue_goal, target_profit, currency,
      description, goal, cover_image, client_name, tags, priorities, settings)
    values (uid, e.workspace_id, e.management, v_name, e.event_type, 'private', 'draft', v_start,
      case when e.ends_at is not null and e.starts_at is not null then v_start + (e.ends_at - e.starts_at) end, p_timezone, false,
      e.venue_listing_id, e.venue_name, e.location, e.city, e.guest_count, e.adults, e.children, e.capacity, e.budget_total, e.revenue_goal, e.target_profit, e.currency,
      e.description, e.goal, e.cover_image, e.client_name, e.tags, e.priorities, v_settings)
    returning id into v_new;

  -- Ticket tiers: drafts, nothing sold or held, windows shifted, "after tier" release chains remapped.
  for t in select * from public.ticket_tiers x where x.event_id = e.id order by x.sort, x.id loop
    insert into public.ticket_tiers(event_id, name, description, kind, price, quantity, sold, held, sale_start, sale_end, release_name, order_limit,
        allocation, status, badge, color, sort, image, valid_from, valid_to)
      values (v_new, t.name, t.description, t.kind, t.price, t.quantity, 0, 0, t.sale_start + v_shift, t.sale_end + v_shift, t.release_name, t.order_limit,
        t.allocation, 'draft', t.badge, t.color, t.sort, t.image, t.valid_from + v_shift, t.valid_to + v_shift)
      returning id into v_tier;
    v_map := v_map || jsonb_build_object(t.id::text, v_tier);
    n_tiers := n_tiers + 1;
  end loop;
  update public.ticket_tiers nt set after_tier = (v_map ->> ot.after_tier::text)::uuid
    from public.ticket_tiers ot
   where ot.event_id = e.id and ot.after_tier is not null and v_map ? ot.after_tier::text and nt.id = (v_map ->> ot.id::text)::uuid;

  -- Programme, run sheet and day plan keep their offsets from the start; supplier booking links are not copied.
  perform set_config('gd.programme_copy', v_new::text, true);
  insert into public.programme_items(event_id, starts_at, duration_minutes, title, detail, area, kind, owner_name, status, image, segment, track, space_id, expected_attendance)
    select v_new, x.starts_at + v_shift, x.duration_minutes, x.title, x.detail, x.area, x.kind, x.owner_name, 'upcoming', x.image, x.segment, x.track, x.space_id, x.expected_attendance
      from public.programme_items x where x.event_id = e.id;
  get diagnostics n_prog = row_count;
  perform set_config('gd.programme_copy', '', true);

  -- Tasks: open again, deadlines shifted, assignee cleared (team availability is per date).
  insert into public.tasks(event_id, workspace_id, owner_id, title, detail, category, assignee_name, due_at, priority, status, milestone)
    select v_new, x.workspace_id, uid, x.title, x.detail, x.category, '', x.due_at + v_shift, x.priority, 'todo', x.milestone
      from public.tasks x where x.event_id = e.id;
  get diagnostics n_tasks = row_count;

  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (uid, e.workspace_id, 'event.duplicated', jsonb_build_object('event_id', v_new, 'source_id', e.id, 'starts_at', v_start, 'timezone', p_timezone,
      'shift_seconds', extract(epoch from v_shift)::bigint, 'tiers', n_tiers, 'programme', n_prog, 'tasks', n_tasks));
  perform public.emit_domain_event('event.duplicated', e.workspace_id,
    jsonb_build_object('id', v_new, 'source_id', e.id, 'shift_seconds', extract(epoch from v_shift)::bigint), uid, 'user', 'event', v_new::text, null, null);

  return jsonb_build_object('ok', true, 'id', v_new, 'starts_at', v_start, 'shift_seconds', extract(epoch from v_shift)::bigint,
    'copied', jsonb_build_object('tiers', n_tiers, 'programme', n_prog, 'tasks', n_tasks),
    'not_copied', jsonb_build_array('guests', 'tickets', 'orders', 'payments', 'bookings_and_holds', 'seats', 'shifts', 'incidents', 'files', 'share_links', 'venue_confirmation', 'permits_and_insurance'));
end $$;

revoke all on function public.duplicate_event(uuid, timestamp, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.duplicate_event(uuid, timestamp, text, boolean, text, text) to authenticated, service_role;
