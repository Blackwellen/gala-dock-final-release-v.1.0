# Finance / Overview — Release Evidence

See `_shared-infrastructure.md` in this folder for schema/RLS/seed/tests shared across all Finance tabs.

- **Section**: Event Manager Finance — Overview (main landing tab)
- **Route**: `/event-manager/finance`
- **Reference image**: mapped in `docs/design-reference/finance-section-image-map.md` (#1)

## Tested
- Route loads for an authenticated workspace member; unauthenticated → `307` redirect.
- KPI row: Total Invoiced, Total Paid, Outstanding, Overdue, Gross Profit, Margin — all computed live from `invoices`/`event_expenses` (see bug #1 in shared doc for the Gross Profit/Margin fix).
- Revenue vs Payments area chart (6-month, real invoice/payment totals).
- Quote Pipeline donut (live from `proposals`).
- Recent Invoices table, Outstanding Payments (receivables + payables, clearly labelled), Ticket Revenue by Event, Supplier Costs by Event, Deposit Milestones progress bars, Cashflow Forecast mini-chart, Profit by Event table.
- Quick Links insight card (Quotes pipeline count, open deposits, bills outstanding, ticket net revenue).
- Chrome MCP: full-page + viewport screenshot at 1680×1000, console clean after fixes.

## Bugs found & fixed
- Gross Profit/Margin KPI mismatch (see shared doc #1).
- Hydration error from SVG `<title>` children (see shared doc #2) — this tab's charts were the first place it was caught.
- Unused import cleanup (`proposalBadgeStatus`, `Receipt`).

## Data sources / tables
`invoices`, `invoice_payments`, `proposals`, `event_expenses`, `ticket_orders`, `event_deposits`, `events` — all scoped by `workspace_id`.

## Score & decision
**Score: 90/100.** Core functionality, real data, and visual fidelity are solid; deductions for no automated tests, no R2/export wiring, and tablet/mobile not manually verified (tracked in user-fixes).
**Decision: ready for release.**
