// Q25: transport, parking (areas + permits), room blocks (+ allocations) and loading bays (+ booked windows) for Neon Nights,
// and a hotel block for Global Tech Conference speakers. All through the Q25 commands as the organiser.
import { block } from "./lib.mjs";

const OWNER = "alex.events@example.com";

export async function run() {
  return block(`
  perform pg_temp._as('${OWNER}');
  v := pg_temp._ev('neon-nights');
  if v is not null then
    -- parking
    if not exists (select 1 from public.parking_areas where event_id = v) then
      perform public.parking_area_save(v, jsonb_build_object('name', 'Car park A (general)', 'kind', 'general', 'capacity', 220, 'accessible_spaces', 14,
        'opens_at', (select starts_at - interval '2 hours' from public.events where id = v), 'closes_at', (select ends_at + interval '2 hours' from public.events where id = v),
        'access_route', 'Enter from Tower Bridge Road; follow yellow signs', 'status', 'active'), null);
      perform public.parking_area_save(v, jsonb_build_object('name', 'Artist & crew compound', 'kind', 'talent', 'capacity', 24, 'accessible_spaces', 2,
        'opens_at', (select starts_at - interval '10 hours' from public.events where id = v), 'closes_at', (select ends_at + interval '4 hours' from public.events where id = v),
        'access_route', 'Gate 3 (stewarded); show the permit on the dashboard', 'status', 'active'), null);
      perform pg_temp._n('parking_areas', 2);
    end if;
    if not exists (select 1 from public.parking_permits pm join public.parking_areas a on a.id = pm.area_id where a.event_id = v) then
      v2 := (select id from public.parking_areas where event_id = v and kind = 'talent' limit 1);
      perform public.parking_issue_permit(v2, jsonb_build_object('holder_name', 'KORA tour van', 'vehicle_reg', 'LK71 KRA', 'valid_from', (select starts_at - interval '8 hours' from public.events where id = v),
        'valid_to', (select ends_at + interval '2 hours' from public.events where id = v), 'party_id', (select id from public.event_parties where event_id = v and name = 'KORA (live)')));
      perform public.parking_issue_permit(v2, jsonb_build_object('holder_name', 'Production manager', 'vehicle_reg', 'GD24 OPS', 'valid_from', (select starts_at - interval '10 hours' from public.events where id = v),
        'valid_to', (select ends_at + interval '4 hours' from public.events where id = v), 'holder_kind', 'other', 'accessible', false));
      perform pg_temp._n('parking_permits', 2);
    end if;
    -- transport
    if not exists (select 1 from public.transport_movements where event_id = v) then
      perform public.transport_save(v, jsonb_build_object('kind', 'talent', 'party_id', (select id from public.event_parties where event_id = v and name = 'KORA (live)'),
        'departs_at', (select starts_at - interval '5 hours' from public.events where id = v), 'arrives_at', (select starts_at - interval '4 hours' from public.events where id = v),
        'passengers', 6, 'from_place', 'The Hoxton, Southwark', 'to_place', 'Riverside Arena artist gate', 'vehicle_label', 'Sprinter 9-seat (Addison Lee)', 'status', 'confirmed',
        'notes', 'Driver waits until load-in completes'), null);
      perform public.transport_save(v, jsonb_build_object('kind', 'shuttle', 'public_info', true,
        'departs_at', (select ends_at from public.events where id = v), 'arrives_at', (select ends_at + interval '25 minutes' from public.events where id = v),
        'passengers', 70, 'from_place', 'Riverside Arena (Gate 1)', 'to_place', 'London Bridge station', 'pickup_point', 'Gate 1 coach bay', 'vehicle_label', 'Shuttle coaches every 10 min', 'status', 'planned'), null);
      perform pg_temp._n('transport', 2);
    end if;
    -- accommodation
    if not exists (select 1 from public.accommodation_blocks where event_id = v) then
      perform public.accommodation_block_save(v, jsonb_build_object('hotel_name', 'The Hoxton, Southwark', 'address', '40 Blackfriars Rd, London SE1 8PB', 'contact', 'groups@thehoxton.example.com',
        'rooms_total', 12, 'check_in', (select starts_at::date from public.events where id = v), 'check_out', (select starts_at::date + 1 from public.events where id = v),
        'cutoff_date', (select starts_at::date - 14 from public.events where id = v), 'nightly_rate', 189, 'currency', 'GBP', 'status', 'confirmed', 'notes', 'Artist and crew block'), null);
      perform pg_temp._n('room_blocks');
    end if;
    if not exists (select 1 from public.room_allocations ra join public.accommodation_blocks b on b.id = ra.block_id where b.event_id = v) then
      v2 := (select id from public.accommodation_blocks where event_id = v limit 1);
      perform public.room_allocate(v2, jsonb_build_object('occupant_name', 'KORA — band', 'occupant_kind', 'talent', 'room_type', 'Twin', 'party_id', (select id from public.event_parties where event_id = v and name = 'KORA (live)'),
        'nights_from', (select check_in from public.accommodation_blocks where id = v2), 'nights_to', (select check_out from public.accommodation_blocks where id = v2), 'status', 'confirmed'));
      perform public.room_allocate(v2, jsonb_build_object('occupant_name', 'Nightjar b2b Halcyon', 'occupant_kind', 'talent', 'room_type', 'King', 'party_id', (select id from public.event_parties where event_id = v and name = 'Nightjar b2b Halcyon'),
        'nights_from', (select check_in from public.accommodation_blocks where id = v2), 'nights_to', (select check_out from public.accommodation_blocks where id = v2), 'status', 'confirmed'));
      perform pg_temp._n('room_allocations', 2);
    end if;
    -- loading bay + windows
    if not exists (select 1 from public.loading_bays where event_id = v) then
      perform public.loading_bay_save(jsonb_build_object('event_id', v, 'name', 'Service yard bay 1', 'max_vehicle', '18t rigid', 'max_length_m', 12, 'turnaround_minutes', 45,
        'access_route', 'Via Shad Thames service road (height 4.2 m)', 'status', 'active'), null);
      perform pg_temp._n('loading_bays');
    end if;
    if not exists (select 1 from public.logistics_windows where event_id = v) then
      v2 := (select id from public.loading_bays where event_id = v limit 1);
      perform public.logistics_window_book(v, jsonb_build_object('bay_id', v2, 'kind', 'load_in', 'supplier_name', 'Stage One Production', 'vehicle', '18t rigid',
        'starts_at', (select starts_at - interval '12 hours' from public.events where id = v), 'ends_at', (select starts_at - interval '10 hours' from public.events where id = v), 'status', 'confirmed'), null);
      perform public.logistics_window_book(v, jsonb_build_object('bay_id', v2, 'kind', 'delivery', 'supplier_name', 'Thames Brewing Co. (bar stock)', 'vehicle', '7.5t',
        'party_id', (select id from public.event_parties where event_id = v and name = 'Thames Brewing Co.'),
        'starts_at', (select starts_at - interval '8 hours' from public.events where id = v), 'ends_at', (select starts_at - interval '7 hours' from public.events where id = v), 'status', 'confirmed'), null);
      perform public.logistics_window_book(v, jsonb_build_object('bay_id', v2, 'kind', 'load_out', 'supplier_name', 'Stage One Production', 'vehicle', '18t rigid',
        'starts_at', (select ends_at + interval '30 minutes' from public.events where id = v), 'ends_at', (select ends_at + interval '4 hours' from public.events where id = v), 'status', 'requested'), null);
      perform pg_temp._n('logistics_windows', 3);
    end if;
    -- Lane D (202610294081): public getting-there info — attendee notes, the general car park and the post-show shuttle on the public page.
    if not exists (select 1 from public.event_getting_there where event_id = v) then   -- 202610294083: notes live in the private table
      perform public.event_getting_there_save(v, jsonb_build_object('public', true,
        'transit', 'London Bridge (Jubilee, Northern and National Rail) — 10 min walk along Tooley Street. Night buses N1, N47 and N381 stop outside.',
        'parking', 'Car park A opens two hours before doors. Spaces are limited, so public transport is recommended.',
        'accessible', 'Blue badge spaces in Car park A next to Gate 1. Step-free route from the car park to the entrance.',
        'dropoff', 'Taxi and drop-off lay-by on Riverside Road, outside Gate 1.',
        'shuttle', 'Free shuttle coaches to London Bridge station every 10 minutes after the show.',
        'cycle', 'Cycle stands at the North entrance (Gate 1).',
        'parking_ids', coalesce((select jsonb_agg(id) from public.parking_areas where event_id = v and kind in ('general','accessible','mixed')), '[]'::jsonb),
        'shuttle_ids', coalesce((select jsonb_agg(id) from public.transport_movements where event_id = v and kind = 'shuttle' and status <> 'cancelled'), '[]'::jsonb)));
      perform pg_temp._n('getting_there');
    end if;
  end if;
  v := pg_temp._ev('global-tech-conference');
  if v is not null and not exists (select 1 from public.accommodation_blocks where event_id = v) then
    perform public.accommodation_block_save(v, jsonb_build_object('hotel_name', 'Hilton London Metropole', 'address', '225 Edgware Rd, London W2 1JU', 'contact', 'events@hilton.example.com',
      'rooms_total', 40, 'check_in', (select starts_at::date - 1 from public.events where id = v), 'check_out', (select starts_at::date + 1 from public.events where id = v),
      'cutoff_date', (select starts_at::date - 30 from public.events where id = v), 'nightly_rate', 214, 'currency', 'GBP', 'status', 'provisional', 'notes', 'Speakers and VIP delegates'), null);
    perform pg_temp._n('room_blocks');
  end if;
  `);
}
