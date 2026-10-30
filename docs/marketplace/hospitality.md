# Food, drinks and hospitality (Q13)

Migrations 202610291035, 1036, 1038. Tests: `tests/marketplace/hospitality.spec.ts` (9), `tests/marketplace/venue-fnb.spec.ts` (7). Service: `src/lib/venue/hospitality.ts`.

## Model
| Table | Purpose |
|---|---|
| `food_allergens`, `food_dietary_tags` | Reference data: 14 UK FIC allergens, 8 dietary tags (public read) |
| `menus`, `menu_sections`, `menu_items` | Provider-authored (owner/manager RLS). `price_minor` generated pence columns. Items: `allergens[]`, `may_contain[]`, `allergen_status` (not_declared/declared), declaration stamp, `course` |
| `menu_item_variants` | Relational variants: `price_delta_minor`, own dietary/allergen arrays (backfilled from legacy `variations`) |
| `catering_selections` | Per booking line: guests, items, dietary counts (sum ≤ guests), `programme_item_id`, `course_timing`, `final_guest_count`, `final_numbers_due` (cut-off end of day, London), `version` |
| `bar_selections` | Per booking line: package, mode (open, cash, tab, hosted, tokens, package, minimum spend, dry hire, mobile, bartenders), guests, hours or programme item, tokens, corkage bottles, tab limit, `version` |
| `hospitality_schedules` | Event-owned: green room, artist catering, VIP, staff/crew meals, guest hospitality; room, programme item, headcount, dietary, optional menu priced through a booking line |
| `hospitality_bookings` | Header per booking line: catering/bar/schedule/contingent/total minor, applied, adjustment, cut-off, allergens, warnings, snapshot, BEO link, `version` |
| `hospitality_lines` | Structured priced lines (source, kind, basis, qty, unit/total minor, dietary, allergens, may_contain, service_at) — the single source for the BEO and the budget |

## Pricing (server-side, pence)
- Per-person menu: price × max(guests, menu minimum). Fixed menu: price. Quantity menus: item × qty. Variant delta added.
- Bar: package fee; per head for open/package/hosted/mobile/dry hire; tokens × price; tab as estimate up to the limit; corkage per bottle (not counted toward minimum spend). Minimum spend: top-up when short; on a cash bar a contingent guarantee, not in the total.
- Warnings: below minimum / above maximum guests, section choice rules, undeclared allergens, dietary needs with no matching dish, unavailable items.

## Booking, snapshot, finance
- Pre-commitment: `build_items.amount` = base + hospitality total (venue hire kept — the old function overwrote it with catering; fixed).
- On confirmation or `hospitality_confirm`: snapshot lines and unit prices. Later edits price at snapshot units; the difference is `adjustment_minor`; the charged amount is untouched. Allergen drift since the snapshot is reported.
- `event_budget_summary.hospitality` + warnings `hospitality_adjustment`, `final_numbers_due`.

## BEO
`event_order_sync_hospitality(item, send, note)` writes an append-only `event_order_versions` row with `content.hospitality` and `financial.hospitality_*`. Approval via the existing `event_order` machine. `save_event_order` carries the section forward and moves approved → revised → sent (previous illegal approved → sent fixed). `hospitality_booking(item).beo.stale` when selections changed after the last sync.

## Commands / reads
`hospitality_save_catering(item, sel, expected_version, accept_change)` (`needs_confirmation` on a confirmed booking), `hospitality_set_final_numbers` (event side until cut-off, then provider only), `hospitality_save_bar`, `hospitality_save_schedule`, `hospitality_confirm`, `hospitality_booking`, `hospitality_event_summary`. Stale versions raise `stale_version:N` (22023 — not 40001, which made PostgREST retry for ~2 min). Legacy `save_catering_selection` / `catering_price` kept.

## Access
Event editors read; providers read only their own booking's lines and schedules. Writes via definer commands only; internals service-only; trigger functions' default EXECUTE revoked (1038).

## Events
`hospitality.selection_saved`, `hospitality.final_numbers_set`, `hospitality.confirmed`, `hospitality.beo_synced`, `hospitality.schedule_saved`, `menu.allergens_changed`.

## Open
UI wiring: customer/organizer catering and bar selection, schedules, BEO hospitality section (hide free-text catering/bar fields when `content.hospitality` exists). Add-ons not yet priced lines. Q38: no menus, bar packages, selections or event orders seeded.

## Public display
Menus attach by listing. Venue pages show the venue's own published menus plus published menus from the same provider's catering listings (labelled "by …"); catering service pages show their own. Shown: menu name, courses/sections and items, dietary tags, declared allergens, per-guest or package price, guest range. Never shown: prep requirements, service window, costs, BEO. Venue F&B facts (`fnb`) appear in "Good to know". Anon reads rely on migration 202610294061 (write policies scoped `TO authenticated` so anon SELECT no longer evaluates `has_workspace_role`).
