# Finance / Supplier Payments — Release Evidence

See `_shared-infrastructure.md` for schema/RLS/seed/tests shared across all Finance tabs.

- **Route**: `/event-manager/finance/supplier-payments` (+ `/supplier-payments/new`)
- **Reference image**: #8 in the image map.

## Architecture decision
`event_expenses` (pre-existing) doubles as the Accounts Payable ledger whenever `supplier_id IS NOT NULL` — it already had `category`/`status`/`supplier_id`, so it was extended (not duplicated) with `bill_number`, `due_date`, split `approval_status`/`payment_status` (the legacy single `status` column was backfilled into both, additive/non-breaking), `paid_cents`, `owner_id`. New tables: `event_expense_payments` (payment ledger) and `supplier_payment_batches` (Batch Pay header).

## Tested
- KPIs: Bills Outstanding, Approved to Pay, Paid This Month, Overdue Bills, Average Payment Time.
- Table: 44 real supplier-linked bills (38 pre-existing + 6 seeded), Approval/Payment status badges, Approve/Reject buttons **confirmed present and wired** on the one `pending_review` row via DOM inspection.
- Insights rail: Payables Aging, Spend by Supplier Category donut, Upcoming Payouts, Approval Bottlenecks.
- **Batch Pay is a real action** (`actions.ts::batchPaySupplierBills`): creates a `supplier_payment_batches` row, inserts `event_expense_payments` rows, sets eligible bills to `payment_status='processing'` (not `paid` — no connected payment rail to confirm real settlement), rolls back the batch header if the payment insert fails. Now also generates a real remittance advice HTML document (`generateRemittanceHtml`) listing every bill in the batch, stores its key on each payment row, and returns the batch reference to the client so a "Download remittance advice" link appears in the success banner.
- "Add Supplier Bill" is a real create form, server-validates supplier/event belong to the workspace before writing.

## Bugs found & fixed
- Missing `NewSupplierBillForm.tsx` — referenced by `new/page.tsx` but never created by the build agent; written to match the existing `QuoteForm.tsx` pattern in this codebase.
- Category donut + legend overflow — fixed via the shared `DonutLegend` component fix.

## Score & decision
**Score: 92/100.** Deductions: no automated tests; Owner column often shows "—" for legacy pre-existing bills that predate the `owner_id` column; remittance generation not tested against a live R2 bucket (gracefully degrades when unconfigured).
**Decision: ready for release.**
