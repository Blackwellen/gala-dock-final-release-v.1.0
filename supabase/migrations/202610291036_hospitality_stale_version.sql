-- Q13 follow-up (lane A, 2026-10-29): stale_version used SQLSTATE 40001 (serialization_failure). PostgREST answers that
-- with HTTP 503 and the API gateway retries it until the request times out, so a losing concurrent edit hung instead of
-- failing fast. Same functions and contracts; stale_version now raises 22023 like approve_event_order. Additive.

create or replace function public.hospitality_save_catering(p_item uuid, p_sel jsonb, p_expected_version integer default null, p_accept_change boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.build_items; m public.menus; cur public.catering_selections; e public.events; h public.hospitality_bookings;
  guests integer; due date; prog uuid; svc timestamptz; items jsonb; ct jsonb; prev bigint; nxt bigint; new_ver integer; r jsonb; st text; provider boolean;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status in ('cancelled','declined','unavailable','expired','expired_no_response','completed') then raise exception 'booking_closed' using errcode = '22023'; end if;
  select * into e from public.events where id = b.event_id;
  if jsonb_typeof(p_sel) <> 'object' then raise exception 'invalid_selection' using errcode = '22023'; end if;
  select * into m from public.menus where id = (p_sel->>'menu_id')::uuid and status = 'published';
  if not found or m.workspace_id is distinct from public.listing_workspace(b.listing_id) then raise exception 'invalid_menu' using errcode = '22023'; end if;
  guests := (p_sel->>'guests')::int;
  if guests is null or guests < 1 or guests > 100000 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  items := coalesce(p_sel->'items', '[]');
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 200 then raise exception 'invalid_items' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(items) x where (x->>'item_id') is null or not exists (select 1 from public.menu_items i where i.id = (x->>'item_id')::uuid and i.menu_id = m.id and i.available)
             or (nullif(x->>'variant_id', '') is not null and not exists (select 1 from public.menu_item_variants v where v.id = (x->>'variant_id')::uuid and v.menu_item_id = (x->>'item_id')::uuid and v.available))
             or (x ? 'qty' and ((x->>'qty') !~ '^[0-9]{1,6}$'))) then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  perform public.hospitality_validate_dietary(p_sel->'dietary_counts', guests);
  prog := nullif(p_sel->>'programme_item_id', '')::uuid;
  if prog is not null then
    select p.starts_at into svc from public.programme_items p where p.id = prog and p.event_id = b.event_id;
    if not found then raise exception 'invalid_programme_item' using errcode = '22023'; end if;
  else
    svc := nullif(p_sel->>'service_at', '')::timestamptz;
  end if;
  if svc is not null and e.starts_at is not null and (svc < e.starts_at - interval '12 hours' or svc > coalesce(e.ends_at, e.starts_at + interval '1 day') + interval '12 hours') then
    raise exception 'service_outside_event' using errcode = '22023';
  end if;
  ct := coalesce(p_sel->'course_timing', '[]');
  if jsonb_typeof(ct) <> 'array' or exists (select 1 from jsonb_array_elements(ct) x where (x->>'course') not in ('canape','starter','main','dessert','side','drink','late','other') or (x->>'serve_at') is null) then
    raise exception 'invalid_course_timing' using errcode = '22023';
  end if;
  select * into cur from public.catering_selections where build_item_id = b.id for update;
  provider := public.hospitality_is_provider(p_item);
  if cur.id is not null then
    if p_expected_version is not null and cur.version <> p_expected_version then raise exception 'stale_version:%', cur.version using errcode = '22023'; end if;
    if cur.status = 'locked' then raise exception 'final_numbers_locked' using errcode = '22023'; end if;
    if public.hospitality_cutoff(cur.final_numbers_due) < now() and not provider
       and (cur.guest_count <> guests or cur.items is distinct from items or cur.menu_id <> m.id) then
      raise exception 'final_numbers_closed' using errcode = '22023', hint = 'The final-numbers deadline has passed; ask the caterer to change it.';
    end if;
  end if;
  due := (select (ev.starts_at at time zone 'Europe/London')::date from public.events ev where ev.id = b.event_id) - m.final_numbers_days;
  select * into h from public.hospitality_bookings where build_item_id = b.id;
  prev := h.total_minor;
  st := case when cur.status in ('confirmed','locked') then cur.status when coalesce((p_sel->>'submit')::boolean, false) then 'submitted' else coalesce(cur.status, 'draft') end;
  begin
    insert into public.catering_selections as c (build_item_id, event_id, menu_id, guest_count, items, dietary_counts, serving_style, service_at, programme_item_id, course_timing,
        staffing, equipment, notes, final_numbers_due, status, price_snapshot, updated_by)
      values (b.id, b.event_id, m.id, guests, items, coalesce(p_sel->'dietary_counts', '{}'), coalesce(p_sel->>'serving_style', m.serving_style), svc, prog, ct,
        left(coalesce(p_sel->>'staffing', ''), 1000), left(coalesce(p_sel->>'equipment', ''), 1000), left(coalesce(p_sel->>'notes', ''), 2000), due, st,
        public.catering_price(m.id, guests, items), auth.uid())
    on conflict (build_item_id) do update set menu_id = excluded.menu_id, guest_count = excluded.guest_count, items = excluded.items, dietary_counts = excluded.dietary_counts,
      serving_style = excluded.serving_style, service_at = excluded.service_at, programme_item_id = excluded.programme_item_id, course_timing = excluded.course_timing,
      staffing = excluded.staffing, equipment = excluded.equipment, notes = excluded.notes, final_numbers_due = excluded.final_numbers_due,
      price_snapshot = excluded.price_snapshot, status = excluded.status, updated_by = auth.uid(), updated_at = now()
    returning c.version into new_ver;
    select total_minor into nxt from public.hospitality_bookings where build_item_id = b.id;
    if h.status = 'confirmed' and prev is distinct from nxt and not p_accept_change then
      raise exception 'hospitality_needs_confirmation';
    end if;
  exception when raise_exception then
    if sqlerrm = 'hospitality_needs_confirmation' then
      return jsonb_build_object('needs_confirmation', true, 'previous_total_minor', prev, 'new_total_minor', nxt, 'difference_minor', nxt - coalesce(prev, 0),
        'after_deadline', public.hospitality_cutoff(cur.final_numbers_due) < now());
    end if;
    raise;
  end;
  if cur.id is not null and cur.status in ('confirmed','locked') then
    perform public.notify_workspace(m.workspace_id, array['owner','manager'], 'provider.request', 'Catering selection changed',
      'Guests ' || cur.guest_count || ' → ' || guests || '.', '/provider/opportunities/' || b.id);
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', m.workspace_id, 'hospitality.selection_saved', jsonb_build_object('build_item_id', b.id, 'event_id', b.event_id, 'kind', 'catering',
      'menu_id', m.id, 'guests', guests, 'total_minor', nxt, 'version', new_ver));
  select to_jsonb(x) into r from public.hospitality_bookings x where build_item_id = b.id;
  return jsonb_build_object('saved', true, 'version', new_ver, 'final_numbers_due', due, 'cutoff_at', public.hospitality_cutoff(due), 'booking', r - 'snapshot');
end $$;

create or replace function public.hospitality_set_final_numbers(p_item uuid, p_guests integer, p_dietary jsonb default null, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.build_items; cur public.catering_selections; provider boolean; editor boolean; ws uuid; r jsonb; v integer;
begin
  select * into b from public.build_items where id = p_item;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  provider := public.hospitality_is_provider(p_item, array['owner','manager']);
  editor := public.can_edit_event(b.event_id);
  if not provider and not editor then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into cur from public.catering_selections where build_item_id = p_item for update;
  if not found then raise exception 'no_catering_selection' using errcode = 'P0002'; end if;
  if p_expected_version is not null and cur.version <> p_expected_version then raise exception 'stale_version:%', cur.version using errcode = '22023'; end if;
  if p_guests is null or p_guests < 1 or p_guests > 100000 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  if cur.status = 'locked' and not provider then raise exception 'final_numbers_locked' using errcode = '22023'; end if;
  if public.hospitality_cutoff(cur.final_numbers_due) < now() and not provider then
    raise exception 'final_numbers_closed' using errcode = '22023', hint = 'The final-numbers deadline has passed; ask the caterer to change it.';
  end if;
  perform public.hospitality_validate_dietary(coalesce(p_dietary, cur.dietary_counts), p_guests);
  update public.catering_selections set guest_count = p_guests, final_guest_count = p_guests, final_numbers_at = now(), final_numbers_by = auth.uid(),
      dietary_counts = coalesce(p_dietary, dietary_counts), updated_by = auth.uid(), updated_at = now()
   where build_item_id = p_item returning version into v;
  select m.workspace_id into ws from public.menus m where m.id = cur.menu_id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', ws, 'hospitality.final_numbers_set', jsonb_build_object('build_item_id', p_item, 'event_id', b.event_id, 'from', cur.guest_count, 'to', p_guests,
      'by', case when provider then 'provider' else 'event' end));
  if not provider then
    perform public.notify_workspace(ws, array['owner','manager'], 'provider.request', 'Final numbers received', cur.guest_count || ' → ' || p_guests || ' guests.', '/provider/opportunities/' || p_item);
  end if;
  select to_jsonb(x) - 'snapshot' into r from public.hospitality_bookings x where build_item_id = p_item;
  return jsonb_build_object('saved', true, 'version', v, 'booking', r);
end $$;

create or replace function public.hospitality_save_bar(p_item uuid, p_bar jsonb, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.build_items; bp public.bar_packages; cur public.bar_selections; e public.events; mode text; g integer; sa timestamptz; ea timestamptz; prog uuid;
  tokens integer; bottles integer; tab bigint; v integer; r jsonb; st text; dur interval;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_edit_event(b.event_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if b.status in ('cancelled','declined','unavailable','expired','expired_no_response','completed') then raise exception 'booking_closed' using errcode = '22023'; end if;
  if jsonb_typeof(p_bar) <> 'object' then raise exception 'invalid_selection' using errcode = '22023'; end if;
  select * into e from public.events where id = b.event_id;
  select * into bp from public.bar_packages where id = (p_bar->>'bar_package_id')::uuid and status = 'published';
  if not found or bp.workspace_id is distinct from public.listing_workspace(b.listing_id) then raise exception 'invalid_bar_package' using errcode = '22023'; end if;
  mode := coalesce(nullif(p_bar->>'mode', ''), bp.model);
  if mode <> bp.model and not (mode = any(coalesce(bp.allowed_modes, '{}'))) then raise exception 'bar_mode_not_offered:%', mode using errcode = '22023'; end if;
  g := (p_bar->>'guests')::int;
  if g is null or g < 1 or g > 100000 then raise exception 'invalid_guests' using errcode = '22023'; end if;
  tokens := coalesce((p_bar->>'tokens')::int, 0); bottles := coalesce((p_bar->>'corkage_bottles')::int, 0); tab := nullif(p_bar->>'tab_limit_minor', '')::bigint;
  if mode = 'drink_tokens' and (tokens <= 0 or bp.token_price is null) then raise exception 'tokens_required' using errcode = '22023'; end if;
  if mode <> 'drink_tokens' and tokens > 0 then raise exception 'tokens_not_applicable' using errcode = '22023'; end if;
  if bottles > 0 and bp.corkage_per_bottle is null then raise exception 'corkage_not_offered' using errcode = '22023'; end if;
  if tab is not null and mode not in ('consumption_tab','hosted_bar') then raise exception 'tab_not_applicable' using errcode = '22023'; end if;
  prog := nullif(p_bar->>'programme_item_id', '')::uuid;
  if prog is not null then
    select p.starts_at, p.starts_at + make_interval(mins => coalesce(p.duration_minutes, 0)) into sa, ea from public.programme_items p where p.id = prog and p.event_id = b.event_id;
    if not found then raise exception 'invalid_programme_item' using errcode = '22023'; end if;
    if ea = sa then ea := null; end if;
  end if;
  sa := coalesce(nullif(p_bar->>'starts_at', '')::timestamptz, sa);
  ea := coalesce(nullif(p_bar->>'ends_at', '')::timestamptz, ea);
  if sa is not null and ea is not null and ea <= sa then raise exception 'invalid_bar_hours' using errcode = '22023'; end if;
  select * into cur from public.bar_selections where build_item_id = p_item for update;
  if found then
    if p_expected_version is not null and cur.version <> p_expected_version then raise exception 'stale_version:%', cur.version using errcode = '22023'; end if;
    if cur.status = 'locked' then raise exception 'bar_locked' using errcode = '22023'; end if;
  end if;
  st := case when cur.status in ('confirmed','locked') then cur.status when coalesce((p_bar->>'submit')::boolean, false) then 'submitted' else coalesce(nullif(cur.status, 'cancelled'), 'draft') end;
  insert into public.bar_selections as x (build_item_id, event_id, bar_package_id, mode, guests, starts_at, ends_at, programme_item_id, tokens, corkage_bottles, tab_limit_minor, notes, status, updated_by)
    values (b.id, b.event_id, bp.id, mode, g, sa, ea, prog, tokens, bottles, tab, left(coalesce(p_bar->>'notes', ''), 2000), st, auth.uid())
  on conflict (build_item_id) do update set bar_package_id = excluded.bar_package_id, mode = excluded.mode, guests = excluded.guests, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    programme_item_id = excluded.programme_item_id, tokens = excluded.tokens, corkage_bottles = excluded.corkage_bottles, tab_limit_minor = excluded.tab_limit_minor,
    notes = excluded.notes, status = excluded.status, updated_by = auth.uid(), updated_at = now()
  returning x.version into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', bp.workspace_id, 'hospitality.selection_saved', jsonb_build_object('build_item_id', b.id, 'event_id', b.event_id, 'kind', 'bar', 'mode', mode, 'version', v));
  select to_jsonb(h) - 'snapshot' into r from public.hospitality_bookings h where build_item_id = b.id;
  return jsonb_build_object('saved', true, 'version', v, 'booking', r,
    'licensing', jsonb_build_object('min_age', coalesce((bp.licensing->>'min_age')::int, 18), 'provided_by', bp.licensing->>'provided_by', 'licence_ref', bp.licensing->>'licence_ref'));
end $$;

create or replace function public.hospitality_save_schedule(p_event uuid, p_row jsonb, p_id uuid default null, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cur public.hospitality_schedules; sa timestamptz; ea timestamptz; prog uuid; sp uuid; bi uuid; mn uuid; hc integer; nid uuid; v integer;
begin
  if not public.can_edit_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_row) <> 'object' then raise exception 'invalid_schedule' using errcode = '22023'; end if;
  if p_id is not null then
    select * into cur from public.hospitality_schedules where id = p_id and event_id = p_event for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_expected_version is not null and cur.version <> p_expected_version then raise exception 'stale_version:%', cur.version using errcode = '22023'; end if;
  end if;
  prog := nullif(p_row->>'programme_item_id', '')::uuid;
  if prog is not null then
    select p.starts_at, p.starts_at + make_interval(mins => greatest(coalesce(p.duration_minutes, 60), 1)) into sa, ea from public.programme_items p where p.id = prog and p.event_id = p_event;
    if not found then raise exception 'invalid_programme_item' using errcode = '22023'; end if;
  end if;
  sa := coalesce(nullif(p_row->>'starts_at', '')::timestamptz, sa); ea := coalesce(nullif(p_row->>'ends_at', '')::timestamptz, ea);
  if sa is null or ea is null or ea <= sa then raise exception 'invalid_schedule_time' using errcode = '22023'; end if;
  hc := (p_row->>'headcount')::int;
  if hc is null or hc < 1 or hc > 100000 then raise exception 'invalid_headcount' using errcode = '22023'; end if;
  perform public.hospitality_validate_dietary(p_row->'dietary_counts', hc);
  sp := nullif(p_row->>'space_id', '')::uuid;
  if sp is not null and not exists (select 1 from public.event_spaces(p_event) s where s.id = sp) then raise exception 'invalid_space' using errcode = '22023'; end if;
  bi := nullif(p_row->>'build_item_id', '')::uuid;
  if bi is not null and not exists (select 1 from public.build_items b where b.id = bi and b.event_id = p_event) then raise exception 'invalid_build_item' using errcode = '22023'; end if;
  mn := nullif(p_row->>'menu_id', '')::uuid;
  if mn is not null and (bi is null or not exists (select 1 from public.menus m join public.build_items b on b.id = bi
                                                  where m.id = mn and m.status = 'published' and m.workspace_id = public.listing_workspace(b.listing_id))) then
    raise exception 'invalid_menu' using errcode = '22023';
  end if;
  if coalesce(p_row->>'status', 'planned') not in ('planned','confirmed','cancelled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_row->'requirements', '[]')) <> 'array' or jsonb_array_length(coalesce(p_row->'requirements', '[]')) > 100 then raise exception 'invalid_requirements' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.hospitality_schedules(event_id, kind, title, space_id, location, programme_item_id, starts_at, ends_at, headcount, dietary_counts, build_item_id, menu_id,
        requirements, notes, status, created_by)
      values (p_event, p_row->>'kind', p_row->>'title', sp, left(coalesce(p_row->>'location', ''), 200), prog, sa, ea, hc, coalesce(p_row->'dietary_counts', '{}'), bi, mn,
        coalesce(p_row->'requirements', '[]'), left(coalesce(p_row->>'notes', ''), 2000), coalesce(p_row->>'status', 'planned'), auth.uid())
      returning id, version into nid, v;
  else
    update public.hospitality_schedules set kind = p_row->>'kind', title = p_row->>'title', space_id = sp, location = left(coalesce(p_row->>'location', ''), 200), programme_item_id = prog,
        starts_at = sa, ends_at = ea, headcount = hc, dietary_counts = coalesce(p_row->'dietary_counts', '{}'), build_item_id = bi, menu_id = mn,
        requirements = coalesce(p_row->'requirements', '[]'), notes = left(coalesce(p_row->>'notes', ''), 2000), status = coalesce(p_row->>'status', 'planned'), updated_at = now()
      where id = p_id returning id, version into nid, v;
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', (select workspace_id from public.events where id = p_event), 'hospitality.schedule_saved',
      jsonb_build_object('event_id', p_event, 'schedule_id', nid, 'kind', p_row->>'kind', 'headcount', hc));
  return jsonb_build_object('id', nid, 'version', v);
end $$;
