# Venue / event map engine (Q19)

Migration 202610291037. Tests: `tests/release/map-engine.spec.ts` (7) + `tests/release/pwa-event-map-workflows.spec.ts`.

## Model
- **Structural map** (venue-owned): `venue_structures`, versioned, one published. Fields `rule_pack`, `calibration` {units_per_m (default 10), rotation_deg, origin, underlay {file_ref, kind image|pdf, opacity}}, `capacity_max`, `based_on_version`. Element ids, `locked`, `protected`; rooms link to `spaces`.
- **Event overlay** (organizer-owned): `venue_maps` (plan-v2 elements) + `based_on_version`, `structure_version`, `validation`, `validated_at`. Direct client writes refused (`map_write_requires_command`).
- **Palettes:** `map_asset_palettes` (77 event assets matching `assets.tsx` + 10 structural; has_capacity, blocks_egress, safety).
- **Rule packs:** `map_rule_packs` (versioned, immutable). `uk_default` v1: standing 2 people/m², 1 m exit clearance, 1.1 m aisles, exits by capacity (≤60:1, ≤600:2, else 3), 5 mm exit width per person, 2% accessible, critical finding codes.

## Venue locks (server-side)
An overlay element reusing the id of a locked/protected/critical structural element (exit, entrance, accessible_route, room, wall, water) is refused `venue_lock` (42501) in `organizer_save_event_plan` and `event_map_save`. Providers can't drop protected/locked elements when publishing a structure.

## Validation (`event_map_validate(event, version?)`)
Findings `{code, severity, element_id, text}`; severity from the rule pack.
- Errors: venue_lock, capacity_exceeded, room_capacity_exceeded / room_seated_exceeded, density_exceeded, insufficient_exits, exit_width_insufficient, exit_blocked, route_blocked, invalid_tier, tier_over_capacity, invalid_zone, zone_over_capacity.
- Warnings: aisle_narrow, overlap, accessible_allocation, tier_unbound, tier_zone_mismatch.
- Geometry is axis-aligned bounding boxes (rotation ignored). Publish refuses on any error (`map_validation_failed`).

## Commands / reads
`event_map_save(event, overlay, seats, publish, base_version)` → `{version, status, validation}`, `stale_version:N` on conflict. `organizer_save_event_plan` (legacy signature) has the same locks/validation. `event_map_restore`, `event_map_compare`, `venue_structure_save(venue, elements, publish, base_version, meta)` (`provider_save_structure` still works, no version check — switch the UI), `event_map_bindings(event)` (tiers → seats/area/elements/zones; reads Q18 `access_zones`/`access_rules`). `map_element_exists(map, ref)` (Q24–Q26 booths, parking, accessible routes) searches `venue_maps` JSON.

## Lifecycle (Q14)
`event_map_blockers(event)` (service-only) → `[{key:'map_<code>', label, fix:'/organizer/events/<id>/map'}]`. Being wired into `event_lifecycle_blockers` (lane C) for first publish / on-sale only.

## Gala Agent
`map.validate`, `map.bindings` (R0, read only, `events.read`) via `agent_invoke_ext`; event must belong to the workspace. Agent tools seed needs regenerating (`scripts/gen-agent-tools.mjs`).

## Open
ORG-013 UI (Design / Ticketing / Operations / Preview tabs, element-details panel with finding highlights, version compare/restore, calibration import, stale-version reload/merge). Rotation-aware geometry and PDF layer detection not built. Q38: Neon has no map; demo map b52e… has 1 exit for 384 people; structures lack capacity_max, calibration, protected exits; no zone bindings.

## Public display
`PublicPlan` (`src/components/venue-plan/public-plan.tsx`) is the one read-only public render: the builders' MapContent via PlanPreview, rendered on the server (no map code or icon set in the client bundle) inside a small pan/zoom frame (`plan-zoom.tsx`: zoom 1–4×, fit, mouse drag, touch scroll, + / − / 0). Every map has a legend and a text list of areas (rooms with capacity, stages, entrances, facilities, seat blocks with seat counts and tier names). Sources: event page / GA checkout / ticket page = `public_event_plan` (latest published overlay + published venue structure, public published events only); venue page = published `venue_structures`; customer's own event = `loadEventPlan`. Ticket holders: their tier coloured, others muted, "Your area" first, entry gate highlighted when an entrance has that name. Hidden whenever nothing is drawn.
