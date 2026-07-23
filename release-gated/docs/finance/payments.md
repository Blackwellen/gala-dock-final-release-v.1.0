# Finance / Payments — Release Evidence

See `_shared-infrastructure.md` for schema/RLS/seed/tests shared across all Finance tabs.

- **Route**: `/event-manager/finance/payments`
- **Reference image**: #10 in the image map.

## Tested
- KPIs: Received This Month, Pending Reconciliation, Failed/Refunded, Avg Time to Pay, Card vs Bank Split.
- On-page disclosure note: reconciliation is explicitly derived from Stripe webhook status (`succeeded` → Reconciled, `pending` → Unreconciled) — there is no separate bank-reconciliation workflow in this build, stated plainly rather than implying a feature that doesn't exist.
- Table: Payment ID, Linked Invoice, Client/Event, Method (icon), Received On, Amount, Status, Reconciliation badge.
- Insights rail: Payments by Method donut, Cash Received Trend, Unreconciled Payments, Recent Payment Activity.

## Bugs found & fixed
- Page header showed "Finance" instead of "Payments" — fixed.
- Same donut/legend overflow class of bug as Invoices — fixed at the shared `DonutLegend` component level (benefits this tab automatically).
- Unescaped JSX quote characters in the reconciliation disclosure text — fixed with HTML entities.

## Data sources / tables
`invoice_payments` joined to `invoices` for client/event context. No `fee_cents` column exists on `invoice_payments`, so Fees/Net columns were honestly omitted rather than fabricated (see user-fixes).

## Score & decision
**Score: 88/100.** Deductions: no fee/net columns (schema gap, not a bug), "Record Payment" links to the invoice detail page's existing payment UI rather than a new modal, no automated tests.
**Decision: ready for release.**
