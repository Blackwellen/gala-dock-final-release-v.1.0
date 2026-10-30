# Travel, parking, accommodation and logistics (Q25, domains 154–157)

Migration 202610293016. Tests: `tests/organizer/q25-logistics.spec.ts` (5).

## Transport
`transport_movements` (talent | crew | guest | supplier | shuttle | vip; party / crew / booking links; pickup point; departs/arrives). Sensitive details in `transport_private` (passenger names, flight, phone) — managers and the party's portal login only. `transport_save(event, p, id?)`: vehicle = Q12 `provider_equipment` locked via Q17 `event_allocate_resource` (30 min buffer each side; seats → `vehicle_capacity_exceeded`); moving the window or vehicle re-locks. Public shuttles shown to ticket holders/guests via `my_event_travel(event)`.

## Parking
`parking_areas` (kind, capacity, accessible_spaces, opening window, access route, optional map element). `parking_issue_permit(area, p)` counts overlapping permits under the area lock → `parking_full` / `accessible_parking_full` (JSON detail); one live permit per vehicle per window (`duplicate_permit`); `outside_opening_hours`. `parking_revoke_permit`; capacity can't go below issued.

## Accommodation
`accommodation_blocks` (rooms, check-in/out, cut-off, nightly rate + rate_version). `room_allocate(block, p)`: per-night capacity (`rooms_full`), duplicate occupant, `block_past_cutoff`, `outside_block_dates`; snapshots rate/version/cost.

## Loading bays and windows
`loading_bays`: venue-owned or event-scoped; turnaround minutes. `logistics_window_book(event, p, id?)` (delivery | collection | load_in | load_out | storage): exclusion constraint on bay × [start, end + turnaround) across all tenants → `loading_slot_taken` (no other-event detail). Tenants never see each other.

## Constraints → schedule / feasibility / readiness
`event_ops_checks_logistics`: talent_late_arrival (blocker + conflict), talent_no_transport / talent_no_room, rooms_cutoff, delivery_after_start, collection_before_end, window_unconfirmed, supplier_no_access_slot, transport_overlap. Same surfaces as Q24. Overview `event_logistics_overview(event)`.

## Open
UI (Operations › Logistics), permit QR scanning, accommodation costs into the budget, venue bay management UI, demo seed (Q38).

## Public getting-there info (lane D, migration 202610294081)
Ops › Logistics › "Public getting-there info" card. One command, `event_getting_there_save(event, p)` (owners/managers):
- Notes — transit, parking, accessible, dropoff, shuttle, rideshare, cycle (each ≤ 500 chars) + `public` switch (notes render only when on). Notes live in the private `event_getting_there` table (202610294083): members read, managers write via `event_getting_there_save`, anon has no access. `public_event_getting_there` returns notes only when `public`. Old `events.settings.getting_there` data was migrated and the key removed; it is read only as a fallback for events with no row.
- Per item "Show on public event page": `parking_areas.public_page` (general | accessible | mixed only → `parking_not_public` otherwise) and `transport_movements.public_page` (shuttles only → `transport_not_public`). Default false.
- Public read `public_event_getting_there(event)` — public published events (or the caller's ticketed event): notes (if public), parking (name, kind, accessible_spaces, opens_at, closes_at; active only), shuttles (from, to, pickup, departs_at, arrives_at; planned | confirmed | en_route). Never: access routes, permits, vehicle registrations, drivers, phones, passengers, vehicles, crew/talent transport, loading bays/windows, accommodation, costs.
- Shown as the `getting_there` page block (after Venue by default; orderable/hideable) on /events/[slug] and /account/tickets/[id]; card shows an attendee preview built by the same rules; hidden when empty. Tests: `tests/release/public-getting-there.spec.ts` 5/5.
