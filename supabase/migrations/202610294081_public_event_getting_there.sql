-- Public "Getting there" (lane D, 2026-10-29): an organiser-controlled public layer over Q25 logistics.
--   parking_areas.public_page / transport_movements.public_page (default false): per-item "Show on public event page".
--     Only general / accessible / mixed parking areas and shuttle movements can be public (staff, supplier, talent, VIP and crew never).
--   events.settings.getting_there: attendee notes written for the public — parking, transit (nearest stations / buses), shuttle,
--     dropoff, accessible, cycle, rideshare (each <= 500 chars) + public (bool). Saved only through event_getting_there_save.
--   event_getting_there_save(event, p): managers only (ops_event_require); one command sets the notes and the per-item flags.
--   public_event_getting_there(event): anon read for public published events (or the caller's own ticket's event). Safe fields only:
--     parking (name, kind, accessible_spaces, opens_at, closes_at) and shuttles (from, to, pickup, departs_at, arrives_at).
--     Never: access routes (may carry gate codes), permits, vehicle registrations, drivers, phones, passengers, vehicles, notes,
--     loading bays / windows, accommodation, costs.
-- my_event_travel (ticket-holder shuttles via public_info) is unchanged.
begin;

alter table public.parking_areas add column if not exists public_page boolean not null default false;
alter table public.transport_movements add column if not exists public_page boolean not null default false;
comment on column public.parking_areas.public_page is 'Shown on the public event page (general / accessible / mixed areas only; name, kind, accessible count, opening window).';
comment on column public.transport_movements.public_page is 'Shown on the public event page (shuttles only; from, to, pickup point, times).';

create or replace function public.event_getting_there_save(p_event uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; notes jsonb := '{}'::jsonb; k text; v text; pk uuid[]; sh uuid[]; bad int;
begin
  e := public.ops_event_require(p_event);
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  foreach k in array array['parking', 'transit', 'shuttle', 'dropoff', 'accessible', 'cycle', 'rideshare'] loop
    if p ? k and jsonb_typeof(p -> k) not in ('string', 'null') then raise exception 'invalid_input' using errcode = '22023', detail = k; end if;
    v := btrim(coalesce(p ->> k, ''));
    if length(v) > 500 then raise exception 'note_too_long' using errcode = '22023', detail = k; end if;
    if v <> '' then notes := notes || jsonb_build_object(k, v); end if;
  end loop;
  notes := notes || jsonb_build_object('public', coalesce((p ->> 'public')::boolean, false), 'updated_at', now());

  if jsonb_typeof(p -> 'parking_ids') = 'array' then
    select coalesce(array_agg(x::uuid), '{}') into pk from jsonb_array_elements_text(p -> 'parking_ids') x;
    select count(*) into bad from unnest(pk) i where not exists (select 1 from public.parking_areas a where a.id = i and a.event_id = e.id and a.kind in ('general', 'accessible', 'mixed'));
    if bad > 0 then raise exception 'parking_not_public' using errcode = '22023', detail = 'Only general, accessible or mixed areas of this event can be public.'; end if;
    update public.parking_areas set public_page = (id = any(pk)) where event_id = e.id and public_page is distinct from (id = any(pk));
  end if;
  if jsonb_typeof(p -> 'shuttle_ids') = 'array' then
    select coalesce(array_agg(x::uuid), '{}') into sh from jsonb_array_elements_text(p -> 'shuttle_ids') x;
    select count(*) into bad from unnest(sh) i where not exists (select 1 from public.transport_movements m where m.id = i and m.event_id = e.id and m.kind = 'shuttle');
    if bad > 0 then raise exception 'transport_not_public' using errcode = '22023', detail = 'Only shuttles of this event can be public.'; end if;
    update public.transport_movements set public_page = (id = any(sh)) where event_id = e.id and public_page is distinct from (id = any(sh));
  end if;

  update public.events set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('getting_there', notes) where id = e.id;
  return jsonb_build_object('public', notes -> 'public', 'notes', (select count(*) from jsonb_object_keys(notes) n where n not in ('public', 'updated_at')),
    'parking', (select count(*) from public.parking_areas a where a.event_id = e.id and a.public_page),
    'shuttles', (select count(*) from public.transport_movements m where m.event_id = e.id and m.public_page));
end $$;
revoke all on function public.event_getting_there_save(uuid, jsonb) from public;
grant execute on function public.event_getting_there_save(uuid, jsonb) to authenticated;
comment on function public.event_getting_there_save(uuid, jsonb) is 'Ops › Logistics: save the public getting-there notes and which parking areas / shuttles show on the public event page (event managers only).';

create or replace function public.public_event_getting_there(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'notes', case when (e.settings -> 'getting_there' -> 'public') = 'true'::jsonb then
        coalesce((select jsonb_object_agg(k, btrim(e.settings -> 'getting_there' ->> k))
                    from unnest(array['parking', 'transit', 'shuttle', 'dropoff', 'accessible', 'cycle', 'rideshare']) k
                   where jsonb_typeof(e.settings -> 'getting_there' -> k) = 'string' and btrim(e.settings -> 'getting_there' ->> k) <> ''), '{}'::jsonb)
      else '{}'::jsonb end,
    'parking', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'kind', a.kind, 'accessible_spaces', a.accessible_spaces, 'opens_at', a.opens_at, 'closes_at', a.closes_at) order by a.name)
      from public.parking_areas a where a.event_id = e.id and a.public_page and a.status = 'active' and a.kind in ('general', 'accessible', 'mixed')), '[]'::jsonb),
    'shuttles', coalesce((select jsonb_agg(jsonb_build_object('from', m.from_place, 'to', m.to_place, 'pickup', nullif(btrim(m.pickup_point), ''), 'departs_at', m.departs_at, 'arrives_at', m.arrives_at) order by m.departs_at)
      from public.transport_movements m where m.event_id = e.id and m.public_page and m.kind = 'shuttle' and m.status in ('planned', 'confirmed', 'en_route')), '[]'::jsonb))
  from public.events e
  where e.id = p_event and ((e.visibility = 'public' and e.status in ('published', 'on_sale', 'live')) or public.holds_ticket_for(e.id))
$$;
revoke all on function public.public_event_getting_there(uuid) from public;
grant execute on function public.public_event_getting_there(uuid) to anon, authenticated;
comment on function public.public_event_getting_there(uuid) is 'Public getting-there info (public published events, or the caller''s ticketed event): organiser notes marked public, public parking areas (name, kind, accessible count, opening window) and public shuttles (from, to, pickup, times). No routes, permits, drivers, phones, vehicles, crew, bays, rooms or costs.';

commit;
