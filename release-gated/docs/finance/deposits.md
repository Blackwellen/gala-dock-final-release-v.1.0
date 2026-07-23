# Finance / Deposits — Release Evidence

See `_shared-infrastructure.md` for schema/RLS/seed/tests shared across all Finance tabs.

- **Route**: `/event-manager/finance/deposits` (+ `/deposits/new`, `/deposits/[depositId]/pay`)
- **Reference image**: #4 in the image map.

## Architecture decision
`event_deposits` (pre-existing) was extended with `paid_cents` (partial-payment tracking), `client_id`/`supplier_id`/`owner_id`, and a wider `kind` vocabulary (added `client_deposit`, `final_balance`, `ticketing_reserve`, `damage`) rather than building a separate "deposit plan + milestones" schema — one row already models one milestone. A companion `event_deposit_payments` ledger table records partial payments.

## Tested
- KPIs: Total Deposit Value, Paid Deposits, Due Soon (30d), Overdue Deposits, Deposit Coverage %, Avg Completion %.
- Table: Deposit ID, Event/Client, Type (icon+label), Total Required, Paid, Balance, Next Due Date + due-label, Status badge, Progress bar.
- Insights rail: Upcoming Due Deposits, Overdue Exposure, Largest Deposit Balances, Deposit Completion by Month.
- Row 2: Deposit Milestones by Event (stacked horizontal bar), Deposit Schedule (chronological list — a real, working substitute for a full Gantt timeline).
- "New Deposit" has a real create form (`deposits/new/DepositForm.tsx` + `actions.ts`).
- **New: "Record Payment" feature** (did not exist before this pass). Each row with a balance > 0 links to `/deposits/[depositId]/pay`, a real form that records a partial/full payment, updates `paid_cents`/`status`, generates a real receipt document, and shows a success state with a "Download Receipt" link. **Live-tested end-to-end**: recorded a £10,695.00 payment against the "Theatre Gala Night" venue retainer — it correctly flipped from 50% (Part Paid) to 100% (Paid), balance £0.00, and the row's Actions column correctly stopped showing "Record Payment" afterward.

## Bugs found & fixed
- **All Deposit IDs displayed identically** (`de905001`) — same root cause as the Quotes tab (fixed shared UUID prefix in seed data, code sliced the front of the id). Fixed by deriving `DEP-XXXXXX` from the end of the id.
- Page header showed "Finance" instead of "Deposits" — fixed.

## Data sources / tables
`event_deposits`, `event_deposit_payments` (now including `receipt_storage_key`), `events`, `clients`, `suppliers` for name lookups.

## Score & decision
**Score: 93/100.** Deductions: "Set Milestone Plan" is a decorative/disabled button (no bulk-plan feature built), no automated tests for the new payment-recording action.
**Decision: ready for release.**
