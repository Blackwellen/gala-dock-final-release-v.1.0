# Customer event builder (Q15)

Migrations 202610291028 (P1 payment guard), 1029–1030. Tests: `tests/marketplace/customer-build-engine.spec.ts` (E2E), `tests/marketplace/build-items-payment-guard.spec.ts`. No AI in the customer workspace (owner decision 2026-10-28): guidance is deterministic rules (`source: rules:v1`, `ai: false`).

## Model

The build is the event (`events`) + its lines (`build_items`) + Q10–Q12 bookings, holds, standby and order groups. New:

| Table | Purpose |
|---|---|
| `build_category_profiles` | type-aware categories per event type (`*` = default): need (foundation/required/optional), budget share, book-by days, depends_on_venue, label |
| `build_versions` | immutable snapshots (lines + budget); numbered per event |
| `build_suggestion_feedback` | dismiss/save suggestions; matching and recommendations exclude dismissed listings |

## Reads (authenticated; event access)

- `event_build_canvas(event)`: event, categories with lines (canonical status, budget bucket), dependencies, budget, guidance, order groups, versions.
- `event_budget_summary(event)` (pence): estimated, quoted, held, committed, paid (settled payment orders net of refunds, booking fee separate), outstanding, forecast, remaining, scenarios, category targets, warnings. Primary lines only; backups/standby = contingency.
- `build_dependency_state(event)`: venue state; per line `blocked_reason` date_required / venue_required, `conditional_on_venue`.
- `event_planning_guidance(event)`: planning window vs lead time, book-by per category, supplier deadlines, final numbers date, payment dates, recommended dates (venue calendar), next steps, readiness.

## Commands (TS: `src/lib/actions/build-engine.ts`)

- `build_add_package(event, package, role)` — snapshot of package terms; guest range checked.
- `build_request_hold(item, hours)` — venue first; supplier holds conditional on the venue line until it's confirmed.
- `build_add_backup(primary, listing)` — another provider, same category; paid standby via Q10 `request_standby`.
- `build_checkout(event, items[])` — one order group (suppliers depend on the venue) and one payment order per seller (direct charge on that seller's account; never pooled). Idempotent; a child that can't start is `blocked`, others continue.
- `build_snapshot(event, label)`, `build_suggestion_feedback_set(event, listing, action)`.
- `customer_upgrade_to_organizer(event, workspace?, name?)` — creates an Organizer workspace if needed; same event id; everything preserved.

## Payment guard (P1, fixed 2026-10-29)

Client writes to `build_items` cannot confirm or enter payment states (trigger `build_items_client_guard`); `transition_build_item(…,'confirmed')` → `payment_required` for payable marketplace lines. Confirmation = payment path (`create_payment_order` → Stripe direct charge → `payment_order_succeeded`). Organizer "Confirm booking" now redirects to the booking's pay section.

## Open

Customer build page still uses its own hard-coded category list — canvas/budget/guidance not on screen yet (lane B wiring); organizer confirm dialog wording doesn't mention payment; no version restore; £0 marketplace lines confirm only with a provider £0 quote.
