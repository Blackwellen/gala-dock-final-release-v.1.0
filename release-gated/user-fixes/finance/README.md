# Finance Section — Manual/Pending Actions

Updated after a follow-up pass that completed tablet/mobile QA, added an
automated test suite, and wired R2 document generation. Items below are what
genuinely remains.

## 1. R2 has never been exercised against a real bucket
The code paths for generating and storing payroll CSVs, supplier remittance
advice, and deposit receipts are real and were live-tested — but this dev
environment has no `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`
configured, so `safeGenerateAndUpload()` always took the "not configured"
soft-fail path (confirmed working correctly, not a crash).
**Action**: set the three `R2_*` env vars for a staging/production
environment, then re-run: record a deposit payment, run payroll, and run a
supplier Batch Pay, confirming each produces a real downloadable document.

## 2. `finance_activity_log` table exists but nothing writes to it
The table + RLS were created in the migration but no server action inserts a
row yet, so there is currently no Finance-specific activity trail (separate
from the app's general audit log).
**Action**: add `insert` calls into `finance_activity_log` from each mutating
server action (`supplier-payments/actions.ts`, `wages-hours/actions.ts`,
`deposits/[depositId]/pay/actions.ts`, `deposits/new/actions.ts`, invoice/
payment actions) if a Finance-specific activity feed is wanted.

## 3. Decorative/disabled buttons — real features not built
These buttons are intentionally non-functional with an honest tooltip rather
than faking success:
- Overview / Quotes / Invoices / Profit / Cashflow: **Export** buttons (no
  CSV/PDF *report* generator connected — distinct from the payroll/
  remittance/receipt *documents*, which are now real).
- Deposits: **Set Milestone Plan** (bulk multi-milestone creation UI).
- Ticket Sales: **Open Box Office** (in-person/manual sale flow).
- Cashflow: **Export Forecast**.

## 4. No dedicated `accountant`/`viewer` workspace role
RLS for `timesheets`/`payroll_exports` (wage data) restricts SELECT to
`owner|admin|manager` because this workspace's `workspace_role` enum only has
those 4 values plus `member` — there is no separate finance/accountant role
to grant read-only wage visibility without full manager permissions.
**Action**: if needed, `ALTER TYPE workspace_role ADD VALUE 'accountant'` and
update the `timesheets_select`/`payroll_exports_select` policies in
`supabase/migrations/20260712_finance_section_rebuild.sql`.

## 5. Payment method fee/net columns don't exist
`invoice_payments` has no `fee_cents` column, so the Payments tab's table
honestly omits Fees/Net columns rather than fabricating a fee percentage.
**Action**: if Stripe processing fees need tracking per payment, add a
`fee_cents` column populated from the Stripe webhook payload.

## 6. Only one ticketed event has order volume
The seed data intentionally has real (not padded) ticket order volume — only
Bluewave Music Festival has ticket tiers/orders.
**Action**: add more `ticket_types`/`ticket_orders` rows for other seeded
events via `supabase/seeds/finance-section-demo-seed.sql` if a busier demo is
wanted.

## 7. Pre-existing, unrelated issues noticed but out of scope
- A favicon/manifest warning (`gala-dock-favicon.png` width/height mismatch)
  appears in the console on every page of the app, not just Finance —
  pre-existing, not touched.
- `quotes`/`invoices`/`invoice_payments`/`proposals` tables have no
  `CREATE TABLE` migration in `supabase/migrations/` (they exist live but
  migrations and the live schema have drifted) — a backfill migration would
  need care to avoid conflicting with the live schema and is out of scope.

---

## Resolved since the initial pass (kept for history)
- ~~Tablet/mobile visual QA not performed~~ — done via Chrome DevTools MCP at
  1024×768 and 390×844 on all 10 tabs; found and fixed two real shared-
  component bugs (`PageHeader` title truncation on mobile, `SectionTabs`
  horizontal overflow with no scroll).
- ~~No automated test suite for new Finance logic~~ — `test/finance-helpers.test.ts`
  added, 17 tests covering every `_lib/finance.ts` helper plus a dedicated
  regression test for the revenue/cost-matching bug (`sumMatchedCosts`,
  extracted out of the Overview page into a shared, tested function).
- ~~R2/PDF generation not wired for new domains~~ — real CSV/HTML document
  generation now wired for payroll exports, supplier remittance advice, and
  deposit receipts (a brand-new "Record Payment" feature was added for
  deposits, which didn't exist before). See item 1 above for the one
  remaining gap (never tested against a live bucket).
