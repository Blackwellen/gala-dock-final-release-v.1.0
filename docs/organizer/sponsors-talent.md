# Sponsors, exhibitors, talent and riders (Q24, domains 150–153)

Migrations 202610293015 (+3018 evidence-path fix). Tests: `tests/organizer/q24-sponsors-talent.spec.ts` (7).

## One party model
`event_parties` is the single event-scoped record for sponsor | exhibitor | artist | speaker | performer | host (organiser events only). Sponsors/exhibitors link to the Q16 CRM `client_id`; talent to a reusable `talent_profiles` row (+ `talent_unavailability` blackouts). Machine `event_party` (enforce): prospect ↔ negotiating → confirmed → completed; cancelled / withdrawn. Commands: `party_save(event, p, id?, expected_version?)` (optimistic version → `{ok:false, conflict}`), `party_transition(party, to, reason?, expected?)`. Cancel/withdraw releases booths, cancels pending pass requests and slots.

## Packages, benefits, deliverables
`package_save(event, {kind: sponsorship|exhibitor, name, price, quantity, benefits:[…]}, id?)`. Confirming a party locks the package row, refuses `package_sold_out` at the limit, snapshots package + benefits onto `event_parties.package_snapshot` (later edits never rewrite the deal), creates one deliverable per benefit (due = start − due_days_before) and one pass request per `passes` benefit. `event_party_deliverables` machine `party_deliverable`: pending → in_progress → submitted → approved | rejected; waived (note required). Evidence (`event_deliverable_evidence`, append-only): file path (managers: workspace folder; party portal: own user folder only — 3018), Q23 media asset, https URL, note. Submission needs evidence when `evidence_required`.

## Booths (map by reference)
`exhibitor_booths`: code, size, power, price, `venue_map_id` + `map_element_ref` (Q19 element, validated by `map_element_exists()` — replace this hook if elements leave `venue_maps` JSON), optional Q18 `zone_id`. One live booth per element (`booth_map_conflict`). `booth_allocate(booth, party, reserve_only?)` under lock (`booth_taken`), `booth_release`.

## Passes
`event_party_pass_requests` (pass_type, quantity, zones, window). `party_issue_passes(request, [{name,email}])` → Q18 `issue_access_pass` per holder, adds the exhibitor's booth zone, never over quantity (`pass_quantity_exceeded`).

## Talent schedule and riders
`party_slot_set(party, programme_item, role, tentative|confirmed|cancelled)`: confirmed overlap for the same talent refused under a per-talent lock (`talent_double_booked`), blackout clash `talent_unavailable`; tentative overlaps become conflicts. Riders: `rider_submit(party, technical|hospitality|travel, summary, items)` (organiser or the party's portal login) creates version n; machine `talent_rider` (submitted → accepted | changes_requested; superseded); submitted riders immutable except fulfilment. `rider_decide` (manager) — acceptance supersedes the previous version, carries fulfilment forward for unchanged items and opens a task per other required item. `rider_item_fulfil(...)` closes the task.

## Contracts and money
`party_create_contract` → Q16 `contract_create`; `party_link_contract`. `party_link_money(party, receivable|payable, invoice? | payment?, …)` references Q07 invoices / event payments; owner/manager/finance only.

## Portal
`party_link_portal_user(party, email)`; RLS lets that login read only its party, deliverables, slots, booth, pass requests and riders. `my_party_portal()`.

## Checks
`event_ops_checks` (partners): unsigned contract for paid confirmed party, overdue deliverables, rider awaiting decision, unmet rider items, exhibitor without booth, unscheduled talent, unissued passes near the event, talent double-booked/unavailable, overdue linked invoice. Surfaces: `event_ops_readiness(event)`, `event_feasibility` → `event_readiness`, `event_ops_blockers(event, to)` (lifecycle hook, not yet wired into `event_lifecycle_blockers`), `operational_conflicts` / `event_conflicts` (`ops_*`). Overview `event_parties_overview(event)`.

## Open
UI (Plan › Partners, portal route `/portal/parties/[id]`), Agent tools, sponsor reports, demo seed (Q38).

## Sponsor logos (2026-10-29)
`event_parties.logo_url` (migration 202610294063): https URL in the event's own workspace event-media folder, png/jpg/webp only (CHECK). Set through `party_set_logo(party, url|null)` — organisers only (`ops_event_require`), audited; anon cannot execute. Uploads use `/api/files/public-media` (real file-type check, PNG/JPEG/WebP only, metadata stripped, ClamAV state respected). Control: Plan › Partners (`party-logo.tsx`). Public: `public_event_extras` returns `logo` for confirmed/completed parties of public published events only; the public grid uses a fixed contain box with the party name as alt text.
