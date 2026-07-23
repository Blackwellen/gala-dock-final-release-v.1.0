# Finance Section — Shared Infrastructure Evidence

This document covers the infrastructure shared by all 10 Finance tabs. Each
per-tab evidence doc in this folder references this file rather than
repeating it.

## Section
- Section name: Event Manager Finance
- Section route: `/event-manager/finance` (+ 9 sub-routes, one per tab)
- Workspace/surface: Property-manager (event agency) workspace, `event-manager` app shell

## Screen sizes tested
- Desktop 1680×1000 (primary QA viewport, matches reference image proportions).
- Tablet 1024×768 — manually verified via Chrome DevTools MCP on all 10 tabs (no page-level horizontal overflow, no console errors; KPI grids reflow to 3 columns, insight rail stacks below the main content).
- Mobile 390×844 — manually verified via Chrome DevTools MCP on all 10 tabs (no page-level horizontal overflow, no console errors after fixes below).
- **Tooling note**: `resize_page`/`emulate` in this environment silently apply a `devicePixelRatio` that makes the *effective* CSS viewport ~25% larger than requested (e.g. requesting 1024 produced an actual 1280px viewport) unless `deviceScaleFactor` is explicitly forced to `1` in the `viewport` string — this was diagnosed via `window.innerWidth`/`devicePixelRatio` and corrected before trusting any responsive screenshot.

## Reference images
10 images in `working_imagesS_finance/`, mapped in `docs/design-reference/finance-section-image-map.md`. Identified by visual inspection (filenames are generic ChatGPT export names, not semantic).

## Data sources / Supabase tables
| Table | Status | Used by |
|---|---|---|
| `invoices`, `invoice_line_items`, `invoice_payments` | pre-existing, reused | Overview, Invoices, Payments, Profit, Cashflow |
| `proposals`, `proposal_line_items` | pre-existing, reused (client quote pipeline) | Quotes, Overview |
| `quotes`, `quote_lines` | pre-existing, untouched (supplier procurement pricing — kept separate from client Quotes tab) | — |
| `event_expenses` | extended (new columns) | Supplier Payments, Profit, Cashflow, Overview |
| `event_expense_payments` | new table | Supplier Payments |
| `supplier_payment_batches` | new table | Supplier Payments (Batch Pay) |
| `event_deposits` | extended (new columns) | Deposits, Overview |
| `event_deposit_payments` | new table | Deposits |
| `timesheets` | new table | Wages & Hours, Profit |
| `payroll_exports` | new table | Wages & Hours (Run Payroll) |
| `ticket_orders`, `ticket_types` | extended (new columns) | Ticket Sales, Overview |
| `finance_activity_log` | new table (not yet wired into UI — see user-fixes) | — |
| `events`, `suppliers`, `clients` | pre-existing, reused for name lookups | all tabs |
| `event_deposit_payments.receipt_storage_key` | new column (`20260712_finance_documents_columns.sql`) | Deposits (receipt document) |

## Migration
`supabase/migrations/20260712_finance_section_rebuild.sql` — applied directly to the linked project via `supabase db query --linked -f` (the repo's `quotes`/`invoices`/`proposals` tables have pre-existing drift between migrations and live schema, so `supabase db push` could not be used without a large, out-of-scope `migration repair`; this file is the source of truth for the new/altered Finance tables going forward).

## RLS policies
All new/altered tables follow the repo's standard `is_workspace_member()` / `has_workspace_role()` loop pattern:
- `event_deposit_payments`, `event_expense_payments`, `supplier_payment_batches`: SELECT for any workspace member, INSERT/UPDATE for owner/admin/manager, DELETE for owner/admin.
- `timesheets`, `payroll_exports`: SELECT restricted to **owner/admin/manager only** (wage-rate data is treated as more sensitive than general workspace data — no `member`-level read access). INSERT/UPDATE owner/admin/manager, DELETE owner/admin.
- `finance_activity_log`: append-only — SELECT for members, INSERT for members, **no UPDATE/DELETE policy at all**.
- `event_deposits` / `event_expenses` / `ticket_orders` / `ticket_types`: pre-existing RLS unchanged; new columns inherit the existing table-level policies.

Negative-path note: this workspace's `workspace_role` enum only has `owner|admin|manager|member` (no separate `accountant`/`viewer`/`read-only` role exists yet in this codebase) — RLS was written against that real enum rather than the roles named in the brief; see user-fixes for adding a dedicated role if the business needs open ended wage-data visibility control beyond owner/admin/manager.

## Seed data
`supabase/seeds/finance-section-demo-seed.sql` — idempotent (fixed UUIDs + `ON CONFLICT DO NOTHING` / re-runnable `UPDATE`s), targets the existing "Grannit Holdings" demo workspace and **6 real pre-existing events** from that workspace (not a parallel fictional roster), plus real pre-existing suppliers. Adds: 6 deposits + 2 deposit payments, 6 new supplier bills (backfills AP columns on the 38 pre-existing supplier-linked `event_expenses` rows too), 6 invoices + 4 invoice payments, 10 timesheets, 3 ticket tiers + 6 ticket orders. Links 2 pre-existing Sales proposals to real events so the Quotes tab has event context.

## Cross-file bugs found and fixed during this build
1. **Overview & Profit KPIs showed negative Gross Profit / Margin** — Supplier Costs were summed across every event in the workspace while Revenue only covered invoiced events; fixed by matching cost totals to the same event set as revenue for the headline KPIs (both files).
2. **React hydration error on every page with a chart** — multi-expression JSX children inside SVG `<title>` elements (`{a}: {b} ({c}%)`) caused a server/client text-node mismatch; fixed by collapsing to single template-literal string children across `DonutChart`/`AreaLineChart`.
3. **Duplicate-looking IDs** — Quotes and Deposits synthesized display codes from the first 4-8 hex chars of the row `id`; since seed rows share a fixed UUID prefix, every row showed the same code. Fixed by slicing from the end of the id instead.
4. **Donut + legend overflow in narrow insight-rail cards** — default 180px donut left no room for the legend; fixed by sizing rail donuts to 140/20 and restructuring `DonutLegend` to stack label/value per row (immune to width regardless of card size).
5. **Wrong page title/description on 5 tabs** (Quotes, Payments, Profit, Deposits, Cashflow, Ticket Sales) — copy-pasted the Overview page's `"Finance"` title and generic description instead of the tab's own. Fixed on all 6.
6. **Missing form component** (`supplier-payments/new/NewSupplierBillForm.tsx`) referenced but not created by its build agent — written to match the existing `QuoteForm.tsx` pattern.
7. Assorted lint fixes: `require()` import in `MetricCard`, unescaped JSX entities, unused imports/vars, React-Compiler purity violations (mutating a `let` during chart render in `DonutChart`/`WaterfallChart`).
8. **Mobile: `PageHeader` H1 truncated to "Fin…"** — title and action buttons were forced onto one row (`shrink-0` on actions ate all the width); fixed by stacking title above actions below the `sm:` breakpoint, unchanged above it. This is a shared component used by every page in the app, not just Finance.
9. **Mobile: Finance sub-tabs (Deposits/Supplier Payments/Wages & Hours/Cashflow) were completely unreachable** — the tab strip overflowed its container (808px content in a 342px box) with no `overflow-x-auto`, so it silently clipped instead of scrolling. Fixed in the shared `SectionTabs` component.

## R2 document generation (added after initial pass)
No PDF-rendering library exists in this repo (no jspdf/puppeteer/pdfkit) — rather than add a new dependency, real CSV/HTML documents are generated server-side and uploaded via a new `r2PutObject` helper (`src/lib/storage/r2.ts`) and shared generators in `finance/_lib/documents.ts`:
- **Wages & Hours → Run Payroll**: generates a per-timesheet CSV (`generatePayrollExportCsv`), stores the key on `payroll_exports.storage_key`. "Download CSV" button added to the Payroll Due card.
- **Supplier Payments → Batch Pay**: generates a remittance advice HTML document (`generateRemittanceHtml`) listing every bill in the batch, stores the key on each `event_expense_payments.remittance_storage_key` row. "Download remittance advice" link added to the success banner.
- **Deposits → new "Record Payment" feature**: this action did not exist at all before this pass (Deposits could only be paid via the SQL seed). Added `deposits/[depositId]/pay/` (page + form + server action): records a partial/full payment into `event_deposit_payments`, updates `event_deposits.paid_cents`/`status`, generates a receipt HTML document (`generateDepositReceiptHtml`), stores the key on `event_deposit_payments.receipt_storage_key` (new column, `20260712_finance_documents_columns.sql`). "Download Receipt" button added to the success state.
- All three document-generation calls go through `safeGenerateAndUpload()`, which **never throws** — if R2 isn't configured (true in this dev environment; no `R2_ACCOUNT_ID` etc. in `.env.local`) it returns `null` and the underlying database action (payment recorded, batch created, payroll exported) still succeeds. Confirmed live: recording a real deposit payment against "Theatre Gala Night" moved it from Part Paid (50%) to Paid (100%), balance £0.00 — and clicking "Download Receipt" showed "No receipt document is available (R2 storage isn't configured in this environment)" instead of crashing.
- Download links resolve through new `get*DownloadUrl()` server actions (`getPayrollExportDownloadUrl`, `getRemittanceDownloadUrl`, `getDepositReceiptDownloadUrl`), each workspace-scoped and returning `null` gracefully rather than throwing when no document was stored.

## Tests run
- `tsc --noEmit` — clean (0 errors) across the whole repo.
- `eslint` — clean (0 errors/warnings) on all touched files.
- `next build` (production) — succeeds twice (before and after the R2/responsive follow-up work); all 10 Finance routes + 5 new sub-routes (`deposits/new`, `deposits/[depositId]/pay`, `supplier-payments/new`, `wages-hours/new`, `ticket-sales/new-tier`) compile and appear in the route manifest.
- `npm test` — **88 automated unit tests pass**, including 17 new ones in `test/finance-helpers.test.ts` covering every exported helper in `finance/_lib/finance.ts` (`formatCents`, `formatCentsCompact`, every badge-status mapper, `daysUntil`, `dueLabel`, `addDays`) and a dedicated regression test for `sumMatchedCosts` — the extracted, shared, tested version of the revenue/cost-matching fix (bug #1) that both `Overview` and the negative-Gross-Profit incident depended on.
- Manual Chrome MCP QA: all 10 tabs loaded with a real authenticated session (dev-only auto-signin) at desktop (1680×1000), tablet (1024×768) and mobile (390×844); console checked for errors on every tab/viewport combination (clean except one pre-existing, unrelated favicon-manifest warning present app-wide); live end-to-end test of Record Deposit Payment, Run Payroll, and (implicitly) Batch Pay's document generation path.

## Security
- Unauthenticated access to all 10 routes confirmed to `307`-redirect (not `500`) via anonymous `curl`.
- Wage-sensitive tables (`timesheets`, `payroll_exports`) are role-gated at the RLS layer, not just hidden in the UI.
- New server actions (`supplier-payments/actions.ts`, `wages-hours/actions.ts`, `deposits/new/actions.ts`, `deposits/[depositId]/pay/actions.ts`, `ticket-sales/new-tier/actions.ts`) resolve `workspaceId`/`user` server-side via `requireWorkspace()`/`requireWorkspaceManager()` and never trust a client-submitted workspace id; mutating actions gate on `canManageWorkspace()`.
- "Run Payroll" and "Batch Pay" do not fake real-world money movement: Run Payroll only creates a local `payroll_exports` snapshot record (explicitly labelled "no payroll provider is connected"); Batch Pay creates a `supplier_payment_batches` header and marks bills `processing` (not `paid`) since there is no connected payment rail to confirm real settlement.
- Generated documents are stored via workspace/record-scoped R2 keys (`r2Key()`, unchanged helper) and downloaded only via short-lived presigned GET URLs generated by workspace-scoped server actions — never a public bucket URL.

## Not completed in this pass (see user-fixes for detail)
- `finance_activity_log` table exists with RLS but nothing writes to it yet — no activity trail is currently recorded for Finance actions.
- Saved Views, CSV/PDF export buttons on Overview/Quotes/Invoices/Profit/Cashflow are still decorative/disabled with honest tooltips, not wired to real export generation (distinct from the payroll/remittance/receipt documents above, which are real).
- No dedicated accountant/read-only workspace role for wage-data visibility (see shared RLS note above).
- R2 upload was never actually exercised end-to-end against a live bucket in this session (no `R2_ACCOUNT_ID` configured in this dev environment) — the code path is real and gracefully degrades, but has not been verified against a real Cloudflare R2 bucket.
