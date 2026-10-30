# Advanced event composition (Q40, domains 247–256)

Migrations 202610291042–1046 (lane A, 2026-10-29). Tests: `tests/organizer/q40-event-composition.spec.ts` (7). TS: `src/lib/events/composition.ts`. Everything composes over the canonical events row, Q20 tiers, Q18 access, Q17 operations and Q07.

## Series, recurring events, tours (247)
`event_series` (series | recurring | tour | festival | conference; recurrence {freq, interval, byweekday, start_date, start_time, duration_minutes, count ≤ 104 | until}; anchor event; branding). `events.series_id / series_index / occurrence_key / series_overrides`.
`generate_series_occurrences`: one occurrence per rule date (future only), built from the anchor via `event_structure_snapshot` → `apply_event_structure` (programme, tasks, dependencies, draft tiers; never guests/tickets/orders/payments/bookings); idempotent per key. `add_tour_date`. `series_edit(event, patch, this | following | all)`: following/all skip past/completed/cancelled/archived dates and never overwrite a local override (skips reported); optimistic series version. `detach_occurrence`, `series_report`, `series_page(slug)` public, directory scope series.

## Parent / child
`events.parent_event_id` + `composition_role` (parent, occurrence, stage, track, session, day, sub_event). `events_composition_guard`: same workspace, inside the parent window, depth ≤ 3, no cycles. `add_sub_event`, `event_composition_readiness` (worst child roll-up), `event_composition_resources` (Q17 allocations, shifts, crew double-booking).

## Lifecycle cascade
`event_composition_blockers(event, to)` (service-only): parent_not_published, series_archived, pass_component_cancelled, children_unhandled (block); pass_holders_affected (warning). Being wired into `event_lifecycle_blockers` (lane C; only severity = block blocks). `cascade_event_transition(parent, to, same | detach)` — owner/manager; children first via `event_transition`, then the parent.

## Multi-venue / multi-day / multi-room (248–250)
`event_venues` (primary/secondary/satellite); `ticket_tiers.valid_venue_ids`; `shifts.event_venue_id`; `event_venue_schedule` (Q25 transfers, crew transfer gaps). `event_days`; tiers/programme/shifts/build_items `.event_day_id` kept inside the day (`composition_binding_guard`); `event_day_report`. Room tickets/staff via `space_id` (room at the event's venue; quantity ≤ capacity); `event_room_schedule`.

## Passes across occurrences
`ticket_tiers.pass_kind` (season | multi_day | multi_venue | series) + `ticket_pass_components` (≥ 2; same event, descendants or same series; frozen once selling). `ticket_pass_propagate` commits/releases units on each component under ordered row locks; `pass_committed` counted in `ticket_tier_reserved` (replaced; live parity 0 differences) and CHECK sold + held + pass_committed ≤ quantity → no oversell of any date (12-way concurrent test). `pass_entitlements` per ticket × component (revoked on refund/transfer/resale); `pass_entitlement_check(ticket, event)` for the scanner; `event_pass_inventory`.

## Forms and waivers (251–252)
`event_forms` (guest/provider/client/staff/custom; form | consent; versioned, published immutable); `form_validate`; `submit_form_response` (idempotent); `decide_form_response`. `waiver_templates` (machine `waiver_template`; one published per family; body hash; minors_allowed); `sign_waiver` (version + hash snapshot, guardian consent for minors); signatures readable by signer + owner/manager only; members see counts.

## Inventory and merchandise (253–254)
`stock_items` + append-only `stock_movements` (never negative, idempotent); `transfer_stock`, `stock_report`. `merch_items`; `merch_reserve` (locks, 15-min expiry) → `merch_mark_paid` (service, **Q07 hook not wired**) → `merch_collect` (one-time code) → `merch_refund` (restock; card refund pending Q07); machine `merch_order`; expiry sweep each minute.

## Lost property and sustainability (255–256)
`lost_reports` / `found_items` (machines `lost_report`, `found_item`), `lost_property_matches` (lp-v1 explainable), `claim_found_item`, `decide_lost_claim`, `my_lost_reports` (derived status only). `sustainability_factors` (versioned, **indicative — owner to confirm DEFRA set before public claims**), `record_sustainability`, `estimate_attendee_travel`, `event_sustainability_report`.

## Open / hooks
Lifecycle: composition blockers (lane C). Scanner: `scan_admission` → `pass_entitlement_check` for cross-event passes (lane D). Q07: merch payment + card refunds + ledger. UI for series, sub-events, days/venues/rooms, passes, forms/waivers, stock/merch, lost property, sustainability.
