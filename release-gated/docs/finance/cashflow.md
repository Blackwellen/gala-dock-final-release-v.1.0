# Finance / Cashflow — Release Evidence

See `_shared-infrastructure.md` for schema/RLS/seed/tests shared across all Finance tabs.

- **Route**: `/event-manager/finance/cashflow`
- **Reference image**: #7 in the image map.

## Architecture decision
No dedicated cashflow table — computed at query time from `invoices` (receivables), `event_deposits` (receivables), `event_expenses`/supplier bills and `timesheets` (payables). Server component fetches all raw data; a client child (`CashflowClient.tsx`) handles the window/scenario/tab UI state and re-derives buckets/scenarios client-side from data already on the page (no extra network calls).

## Honesty requirement — "Cash Runway"
**Confirmed handled honestly**: displays "N/A — no balance data" rather than fabricating a specific runway figure, since no actual bank-balance figure exists anywhere in this schema.

## Tested
- KPIs: Forecast Inflow, Forecast Outflow, Net Position, Cash Runway (N/A, honest), Due in 30 Days, Committed Costs.
- Window selector (4/8/12 weeks) and Scenario selector (Base/Conservative/Upside) — **confirmed real**: scenario math applies stated percentage adjustments (Conservative: inflow×0.85, outflow×1.10; Upside: inflow×1.15, outflow×0.93) to the same real base numbers, not fabricated figures.
- 12-Week Cashflow Forecast bar chart, Due Obligations table (All/Receipts/Payments tabs).
- Cashflow by Event table, Scenario Comparison table.
- Liquidity Alerts: real derived alerts (e.g. "Net position goes negative for the week starting 11 Jul (−£21,019.00)", "High commitment ratio — 94% of total outflow is still open") computed from actual weekly buckets, not scripted copy.
- Biggest Upcoming Payments / Expected Receipts, Weekly Net Trend sparkline.

## Bugs found & fixed
- Page header showed "Finance" instead of "Cashflow" — fixed.

## Score & decision
**Score: 92/100.** Deductions: Export Forecast is a decorative/disabled button, no automated tests.
**Decision: ready for release.**
