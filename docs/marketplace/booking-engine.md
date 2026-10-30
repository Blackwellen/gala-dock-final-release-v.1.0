# Booking engine (Q10–Q12)

Migrations 202610291023–1027. Tests: `tests/provider/{w04-w05-race,booking-integrity,supplier-management,w06-agency}.spec.ts`, `tests/marketplace/order-orchestration.spec.ts`.

## Records

| Concept | Storage |
|---|---|
| Marketplace request | `provider_requests` (machine `marketplace_request`, audit) — draft → sent → awaiting / clarification → quote_received / declined / expired_no_response → closed; cancelled; closed → sent reopens. Derived from recipient items by `marketplace_request_refresh()` (trigger `build_items_marketplace_sync`). |
| Recipient line / buyer booking | `build_items` (machine `booking`); `space_id` carries the booked space |
| Quote | `provider_quotes` (versions; superseded; expired daily by `marketplace_quote_expiry_sweep`, cron 01:15) |
| Hold | `conditional_holds` (soft/hard; expiry in `marketplace_sweep`) |
| Provider booking | `provider_jobs` (machine `provider_job`) |
| Parent order | `order_groups` + `order_group_items` (one live group per item) |
| Canonical read | view `bookings` (security_invoker): booking_id, source, buyer/seller workspace, listing, space, mode, window, amount, status (canonical), buyer_status, provider_status, payment_status, order_group_id |
| Conflicts | `booking_conflicts` (open → refund_queued → resolved/dismissed) |

Canonical status (`booking_canonical_status`): requested · quoted · held · awaiting_payment · confirmed · active · completion_pending · completed · cancellation_requested · cancelled · declined · expired · disputed · replacement_required · no_show. "Settled" is not a stored state (payouts are Stripe-side, Q07).

## Conflict rules (one implementation for direct and marketplace)

- **Venue** (`enforce_space_rules`, lock `venue_booking:<venue>`): blocked/maintenance availability_blocks (space or venue-wide) → `blocked_conflict`; same space with turnaround + setup/cleardown → `turnaround_conflict`; whole-venue job → `venue_conflict`; exclusive link / exclusive_group → `exclusive_conflict`; another item's hard hold → `hold_conflict`; layout capacity → `over_capacity`; exclusion constraint `provider_jobs_no_space_overlap` remains → `hard_conflict`.
- **Service** (`enforce_service_capacity`, lock `supplier_capacity:<workspace>`): `provider_capacity_rules` per listing (default solo: 1, block) and optional workspace-wide cap; setup/teardown/travel minutes widen the window; policy warn → job allowed with `details.capacity_warning`, else `capacity_conflict`.
- **Staff** (`enforce_crew_capacity` on shifts, lock `crew_capacity:<crew>`): draft/pending/confirmed shifts + crew availability blocks; crew rule for limit/buffers/policy → `crew_conflict`.
- **Equipment** (`enforce_equipment_capacity`, lock `equipment_capacity:<item>`): overlapping reserved quantity ≤ stock; maintenance/retired → `equipment_unavailable`; per-item block/warn → `equipment_conflict`; job cancellation releases allocations.

## Marketplace confirmation

`build_items` → confirmed fires `create_job_for_confirmed_item`: space resolved item → quote terms.space_id → hold → request requirements.space_id/space → only space; else whole-venue occupancy until `provider_assign_job_space`. Conflict without payment in the same transaction → error, nothing confirmed. Conflict on a paid confirmation (deposit webhook) → payment recorded, no job, item → `replacement_required` (standby/backup alerts), `booking_conflicts` row, platform-party full cancellation with refund_status due → Q07 refund on the seller's connected-account charge (`processPayments`), both parties notified, audit/outbox `booking.conflict_detected`.

## Order groups (domains 113–114)

`order_group_create(event, [{build_item_id, depends_on?, required?}])` and `order_group_set_item(group, item, add|remove)` — buyer only. Status and totals recomputed from children on every child change (open, partially_confirmed, confirmed, partially_failed, failed, cancelled, completed; totals by state and by seller, needs_replacement, dependency_failed). A confirmed child leaves only via its own cancellation. Each child pays its own seller (direct charge; `payment_orders.order_group` = reference). Sellers see only their own child rows.

## Supplier management

Commands: `provider_set_capacity_rule`, `provider_save_equipment`, `provider_allocate_equipment`, `provider_release_equipment`, `provider_save_service_area`, `service_area_quote` (coverage + travel fee), `provider_add_job_evidence` (path must be under the workspace prefix; buyer can read). View `provider_job_profitability`: net payout − crew (day rate pro rata, ½-day minimum) − equipment (day cost × days).

## Access

New tables: reads for workspace members (conflicts/evidence/groups also the booking's buyer), writes only through the commands. `crew_members`/`shifts` writes need owner/manager; owner-only `revoke_workspace_member`. Capabilities: direct client changes only during onboarding; afterwards `provider_save_settings`.

## Open

- ~~P1 security: direct confirm bypassing payment~~ FIXED 2026-10-29 (migration 202610291028, `build_items_client_guard` + `payment_required`; see `customer-builder.md`).
- No external calendar sync for provider jobs; no service variants table; no generic booking command; `payment_order_succeeded` sends "Booking confirmed" before the conflict notice; organizer `addNote` now refused for plain members (crew/shift write guard) — decide in Q17.
- Data: one venue job without a space (`BK-FDBFDD`, `1692d6c0-4492-48f9-84a1-9c1c4ab12c2d`) linkable to space `745d3e04-8723-491a-8098-d379e8b84ab3` via `provider_assign_job_space`; 26 open requests re-stated by migration 1025 (8 awaiting, 8 quote_received, 10 expired_no_response); test fixture workspace "Q10 Ledger Fixture (tests)" retained (immutable ledger).

## Public availability calendar (lane D, migrations 202610294080 + 202610294082)
`public_listing_availability(listing, from, to, space?)` — anon/authenticated, SECURITY DEFINER, search_path ''. Returns `{ from, to, timezone: "Europe/London", days: [{ date, status }], spaces: [{ id, name }] }` or null.
- Visibility: published, unpaused listings with `details.public_availability = true` (provider opt-in; **default off** — free/busy reveals commercial patterns no provider agreed to publish). Toggle: venue Operations tab / service page ("Public availability calendar").
- Range: from ≥ today (London), max 120 days per call, horizon today + 18 months. ~16 ms for 120 days × 5 spaces.
- Status per London day, per unit (each published space; else the listing): hard = provider_jobs confirmed|active|deposit_paid, availability_blocks blocked|maintenance|closed (listing, space, workspace-wide), conditional_holds held+hard; soft = held jobs, soft holds, held build_items, listing-level jobs at multi-space venues. Related spaces (space_links linked|exclusive, same exclusive_group) share hard time; whole-venue exclusive hire is hard for all. booked = every unit has hard time ≥ min(6 h, opening window) (services: or confirmed jobs ≥ service.capacity.per_day); limited = any hard or soft; closed = opening hours exist and that weekday has none.
- Never returned: names, prices, events, booking ids, times, hold reasons. Exercises + `tests/release/public-availability.spec.ts` 5/5.
- UI: month grid on venue/service pages (#availability), keyboard grid, legend, space selector; picking a free/limited day pre-fills the booking card (`gd:listing-date` → `addAndRequest(…, date)` → `/book?date=`). Copy: dates are confirmed on request.
