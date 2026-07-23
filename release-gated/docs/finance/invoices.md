# Finance / Invoices — Release Evidence

See `_shared-infrastructure.md` for schema/RLS/seed/tests shared across all Finance tabs.

- **Route**: `/event-manager/finance/invoices`
- **Reference image**: #9 in the image map.

## Tested
- KPIs: Total Invoiced, Total Paid, Outstanding, Overdue, Collection Rate, Avg Days to Pay.
- Toolbar: search, status/event/client/aging filters, sort.
- Table: Invoice ID, Client/Event, Issue/Due dates, Amount, Amount Paid, Balance, Status badge — row links to the existing `/event-manager/finance/invoices/[invoiceId]` detail page (untouched).
- Insights rail: Aging Summary donut, Collections Trend, Overdue Invoices list, Payment Activity feed.
- "New Invoice" links to the existing, unmodified `invoices/new` create flow.

## Bugs found & fixed
- Aging Summary donut + legend overflowed the narrow insight-rail card (default 180px donut) — resized to 140/20 and fixed the underlying `DonutLegend` layout (stacked label/value) so it can't recur on any tab.
- Minor lint cleanup (unused `Receipt` icon import).

## Data sources / tables
`invoices`, `invoice_payments`, `events` for name lookups. No new tables — this tab upgrades the pre-existing basic list into the full KPI/insights/aging dashboard.

## Score & decision
**Score: 90/100.** Deductions: Export button decorative, avg-days-to-pay honestly shown as "—" when no payment-date data exists rather than fabricated, no automated tests.
**Decision: ready for release.**
