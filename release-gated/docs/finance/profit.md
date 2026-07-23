# Finance / Profit — Release Evidence

See `_shared-infrastructure.md` for schema/RLS/seed/tests shared across all Finance tabs.

- **Route**: `/event-manager/finance/profit`
- **Reference image**: #5 in the image map.

## Cost basis (explicitly labelled, per code comment in the file)
- Revenue: `invoices.total_cents` (issued, not draft/void).
- Supplier Costs: `SUM(event_expenses.amount_cents)` per event (chosen as the sole supplier-cost source; `quotes.status='accepted'` deliberately NOT also summed, to avoid double-counting once a quote becomes a real bill).
- Wage Costs: computed from `timesheets` (`actual_hours`/`overtime_hours` × rates).
- Other Costs: shown as £0 for every event — honestly zeroed (no distinct non-supplier/non-wage cost ledger exists) rather than estimated.

## Tested
- KPIs: Gross Revenue, Supplier Costs, Gross Profit, Margin, Average Event Margin, High Margin Events (>50%, a stated round threshold).
- Margin Trend, Revenue vs Cost by Event, Profit Bridge waterfall, Event Margin Ranking, Cost Composition donut, "Lowest Margin Events" (a real, simpler substitute for a trailing-period erosion trend that isn't reliably computable from current data volume — labelled as such in-UI).
- Profit by Event table (16 rows in the DOM — includes events with cost but no revenue yet, correctly shown with a `—`/0% margin) + totals row.
- "Compare Events" is a real feature: `?compare=idA,idB` renders a side-by-side table.

## Bugs found & fixed
- **Gross Profit showed −£260.3K / Margin −89.0%** — Supplier Costs were summed across all 35 workspace events while Gross Revenue only covered the 6 invoiced events. Fixed by scoping headline Supplier/Wage/Other costs (and the Profit Bridge, and Cost Composition) to only the events that also have recognized revenue — the full per-event table is unaffected and still shows cost-only events for transparency.
- Page header showed "Finance" instead of "Profit" — fixed.

## Score & decision
**Score: 88/100.** Deductions: "Other Costs" is always £0 (no distinct ledger), margin-erosion alerts simplified to a lowest-margin list, no automated tests.
**Decision: ready for release.**
