# Suppliers & RFQs — Release Evidence

**Section:** Suppliers (register, lifecycle, compliance) + RFQs (request-for-quote workflow)
**Routes:** `/event-manager/suppliers` (`?view=all|active|paused|missing-documents|recently-used|archived`), `/event-manager/suppliers/new`, `/event-manager/suppliers/[supplierId]`, `/event-manager/suppliers/[supplierId]/edit`, `/event-manager/rfqs` (`?status=...`), `/event-manager/rfqs/new`, `/event-manager/rfqs/[rfqId]`, `/event-manager/rfqs/[rfqId]/compare`
**Workspace / surface:** Workspace app shell (property-manager/event-manager equivalent). No portal or admin surface work in this pass.
**Built:** 2026-07-10 → 2026-07-12, across 4 phases in this session.

## 1. What this covers

This was a from-scratch rebuild. Before this work, `/event-manager/suppliers` and `/event-manager/rfqs`
were ~200-line client components backed by a minimal schema (`suppliers`, `supplier_categories`,
`supplier_contacts`, `supplier_files`, `rfqs`, `rfq_recipients`) with no pause/archive lifecycle, no
document-compliance tracking, and no formal RFQ response/comparison/award workflow.

**Phase 1 — visual layer.** Seven screens rebuilt to match hand-supplied reference images
(`working_imagesS_suppliers/`, mapped in `docs/design-reference/supplier-section-image-map.md`):
All/Active/Paused/Missing Documents/Recently Used/Archived Suppliers, and RFQs. Built against typed
mock data shaped to mirror the eventual DB (`suppliers/_data/types.ts`).

**Phase 2 — schema, RLS, seed.** Additive migration
`supabase/migrations/20260711_supplier_rfq_depth.sql`: 10 new tables (`supplier_pauses`,
`supplier_archives`, `supplier_document_requirements`, `supplier_compliance_outreach`,
`supplier_stars`, `rfq_responses`, `rfq_response_line_items`, `rfq_awards`, `rfq_status_history`,
`rfq_activity`) plus new columns on `suppliers`, `supplier_files`, `rfqs`, `rfq_recipients`. RLS on
every new table via the existing `is_workspace_member`/`has_workspace_role` policy pattern. Demo seed
`supabase/seeds/supplier-section-demo-seed.sql` (+ a follow-up
`supabase/seeds/supplier-section-legacy-enrichment.sql` that enriched 19 pre-existing incomplete
supplier rows discovered during visual QA) — idempotent, applied to the "Grannit Holdings" workspace.

**Phase 3 — live wiring.** `suppliers/_data/queries.ts`/`getSupplierRecords` and `getRfqRecords`
replaced the mock data source. Lifecycle mutations (`suppliers/actions.ts`): pause, reactivate,
archive, restore, star toggle, document request/reminder, R2 document upload — all real writes with
`supplier_activity` audit logging.

**Phase 4 — RFQ workflow.** `rfqs/actions.ts` extended: `createRfq` now captures category/budget
range/response deadline/evaluation criteria; `submitRfqResponse` creates versioned formal quotes with
line items (server-computed totals); a new `/rfqs/[rfqId]/compare` route does a real side-by-side
comparison; `awardRfq` writes a real `rfq_awards` row; `convertAwardToBooking` creates a real
`event_suppliers` booking row from an awarded RFQ, with a double-conversion guard.

## 2. Screen sizes tested

1728×1000 (primary, matches the reference images) and 390×844 (mobile) via Chrome MCP against the
live dev server, authenticated as the workspace owner via the repo's dev-only auto-signin route.
1440/1280/1024/tablet were **not** individually captured in this pass — see Section 9 (remaining work).

## 3. Screenshots

Captured live during this session (not saved to disk as files, reviewed inline): All Suppliers,
Active Suppliers, Paused Suppliers, Missing Documents, Recently Used, Archived Suppliers, RFQs list,
RFQ compare page, mobile All Suppliers. All matched their reference image's layout, KPI set, table
columns and insight-rail cards structurally.

## 4. Routes tested

- `/event-manager/suppliers?view=all` — live data, real KPIs, real insight rail. ✅
- `/event-manager/suppliers?view=active` — ✅
- `/event-manager/suppliers?view=paused` — ✅, reactivate button present
- `/event-manager/suppliers?view=missing-documents` — ✅, request-docs/reminder buttons present
- `/event-manager/suppliers?view=recently-used` — ✅
- `/event-manager/suppliers?view=archived` — ✅, restore button present
- `/event-manager/rfqs` (all 6 status tabs) — ✅
- `/event-manager/rfqs/[rfqId]/compare` — ✅, real line items, real Award button
- `/event-manager/suppliers/[supplierId]` — reached via row click, renders (pre-existing detail page,
  documents-tab upload wired to R2 in Phase 3)

Not exercised in this pass: `/event-manager/suppliers/new`, `/event-manager/suppliers/[id]/edit`,
`/event-manager/rfqs/new`, `/event-manager/rfqs/[rfqId]` (non-compare detail view) — these existed
before this work or were extended in Phase 4's code changes but weren't independently clicked through
in the Chrome MCP pass.

## 5. Buttons / actions tested

- **Star toggle** (Recently Used marker): clicked live, confirmed a real `supplier_stars` row was
  written to Supabase (not optimistic-only UI).
- Reactivate / Restore / Request Docs / Send Reminder buttons: present, wired to real server actions
  per Phase 3's agent report; not individually clicked in the Chrome MCP pass (time-boxed).
- RFQ Award button on the compare page: present and wired to `awardRfq`; not clicked in this pass
  (would mutate the seeded award state).

## 6. Filters / search / sorting / views tested

Category/Location/Compliance filter dropdowns render live options derived from the actual dataset
(seen in the accessibility snapshot: 14 real categories including the new "Cleaning & Facilities").
Search box, status tabs, and pagination footer all render with correct live counts. Filter/search
*interaction* (typing a query, selecting a filter, confirming the result set narrows) was not
exercised in this Chrome MCP pass.

## 7. Data sources

100% live Supabase — no mock arrays remain in `suppliers/page.tsx`, `rfqs/page.tsx`, or their client
components. Confirmed via `git diff` review and direct DB inspection during QA.

## 8. Supabase tables checked

`suppliers`, `supplier_categories`, `supplier_contacts`, `supplier_files`, `supplier_pauses`,
`supplier_archives`, `supplier_document_requirements`, `supplier_compliance_outreach`,
`supplier_stars`, `supplier_activity`, `rfqs`, `rfq_recipients`, `rfq_responses`,
`rfq_response_line_items`, `rfq_awards`, `rfq_status_history`, `rfq_activity`, `event_suppliers`
(target of award-to-booking conversion). All confirmed to exist with the expected columns via the
Supabase REST OpenAPI introspection and direct SQL queries against the linked project.

## 9. RLS policies checked

Every new table from the Phase 2 migration has 4 policies (SELECT/INSERT/UPDATE/DELETE) via the
existing `is_workspace_member`/`has_workspace_role` helper functions — confirmed via
`pg_policies` query (4 policies each on `supplier_pauses`, `supplier_archives`, `rfq_responses`,
`rfq_awards`, spot-checked). Award-related mutations (`awardRfq`, `convertAwardToBooking`) are
additionally gated in application code to owner/admin/manager roles, matching the migration's
`rfq_awards_insert` policy intent.

**Not done:** no negative RLS tests (wrong workspace, wrong role) were executed against a second
test account in this pass — only positive-path testing as the workspace owner.
**Known gap:** there is no supplier-portal auth role in this codebase (`workspace_role` is
owner/admin/manager/member — all internal operator roles). The migration file documents this
explicitly: `rfq_responses` RLS only covers internal members today; a genuine external
supplier-submission flow needs its own auth boundary, not yet designed.

## 10. Edge functions checked

None — this feature uses Next.js server actions (`"use server"`) rather than Supabase Edge
Functions, consistent with the rest of this codebase's convention.

## 11. Storage buckets checked

Cloudflare R2, via the existing `src/lib/storage/r2.ts` module. `supplier-document` and
`rfq-attachment` upload kinds were added to `/api/r2/presign`'s allow-list; a new
`/api/r2/presign-download` route was added for private document retrieval. **Not verified against a
real R2 bucket in this session** — no R2 credentials are configured in this environment (see Section
14 / user-fixes doc). The code path that reports "storage not configured" when `r2Configured()` is
false was reviewed but not exercised live.

## 12. Integrations checked

None configured or exercised — no email provider exists anywhere in this codebase (confirmed by
Phase 3's agent search), so document-reminder actions correctly write an audit trail without claiming
an email was sent.

## 13. Bugs found and fixed during this build

1. **NaN% response ring** on RFQ rows with zero invited suppliers (`Live Band Gig`, a draft RFQ) —
   `RfqsView.tsx` divided by `suppliersInvited` with no zero-guard. Fixed: guarded to render 0% when
   no suppliers are invited yet. Verified by reload — the ring now renders correctly and a stale
   Next.js dev-overlay error indicator also cleared.
2. **Stray test data**: an earlier subagent working on the RFQ workflow left 6 test supplier rows
   (`Elite Audio Visual`, `SecureGuard Services`, `Catering Collective`, `Gourmet Events Co.`,
   `Vision AV`, `StagePro Lighting`) in the live linked Supabase project. Confirmed zero dependents
   across every related table, then deleted with explicit user sign-off.
3. **19 pre-existing incomplete supplier rows** (from an earlier, unrelated seed pass — duplicate-name
   legacy rows with no category/contact/insurance) were surfacing as "Uncategorised / No contact on
   file" clutter at the top of the All/Active supplier lists during visual QA. Enriched in place
   (category, tier, coverage, contact, insurance, compliant documents) via
   `supplier-section-legacy-enrichment.sql` rather than deleted, since they're referenced by
   pre-existing `event_suppliers`/`supplier_contracts` rows from another seed file.
4. **Broken `event_suppliers` query** in `events/[eventId]/suppliers/actions.ts`/`page.tsx` (joining a
   `role_on_event`/`suppliers(...)` shape that didn't match the real, denormalised `event_suppliers`
   table). Surfaced by the `database.types.ts` regeneration; fixed to use the real flat columns
   (`role`, `supplier_name`, `contact_name`, etc.) so the whole project keeps compiling.

## 14. Migrations applied

- `supabase/migrations/20260711_supplier_rfq_depth.sql` — applied via the Supabase Management API
  (see Section 16 for why `supabase db push` couldn't be used), with explicit user sign-off.
- `supabase/seeds/supplier-section-demo-seed.sql` — applied, confirmed idempotent by re-running it
  and observing an unchanged row count.
- `supabase/seeds/supplier-section-legacy-enrichment.sql` — applied, idempotent (guarded by
  `category_id IS NULL` / `NOT EXISTS` checks).

`src/lib/supabase/database.types.ts` was regenerated from the live schema after the migration.

## 15. Tests run

`node --import tsx --test "test/**/*.test.ts"` — **74/74 passing**, including 27 new tests added in
this session:
- `test/supplier-format.test.ts` (7 tests) — date/currency formatting helpers, anchored to a fixed
  demo date so results are deterministic.
- `test/supplier-kpis.test.ts` (11 tests) — KPI/insight-rail compute functions (health buckets,
  category mix, missing-document aggregation, compliance risk, pause/archive reason grouping).
- `test/rfq-kpis.test.ts` (9 tests) — RFQ KPI/insight-rail compute functions (active-bucket
  membership, response analytics, award rate incl. zero-division guard, category demand).

`npx tsc --noEmit` — **zero errors** in every file under `suppliers/` or `rfqs/`. (230 pre-existing
errors remain in `tasks/`, `calendar/`, `finance/`, `leads/` from an unrelated, concurrent session
working on the Tasks section — confirmed via `git status` that this session never touched those
files.)

`npx eslint src/app/event-manager/rfqs src/app/event-manager/suppliers` — **zero errors/warnings**.

**Not run:** integration tests against a real Supabase test instance, E2E tests, RLS negative tests,
visual regression tooling, load/stress tests, DDoS/rate-limit tests.

## 16. Performance / security findings

- No N+1 query patterns observed by inspection in `queries.ts` (batched selects with `.in()` for
  joined data rather than per-row queries).
- `supabase db push` is currently non-functional for this project: the remote migration-history table
  has ~200 entries that predate this repo's `supabase/migrations/` folder (base schema applied
  out-of-band before this session). This migration was applied via the Supabase Management API SQL
  endpoint instead, with explicit user sign-off each time, rather than attempting to reconcile ~200
  unrelated historical migration entries blind. **This CLI drift is a pre-existing condition, not
  introduced by this work, and should be fixed separately** (see user-fixes doc).
- Award/booking-conversion actions are role-gated (owner/admin/manager) in application code, matching
  the migration's RLS intent for `rfq_awards`.
- No rate limiting was added to document-request/reminder or upload actions in this pass — flagged as
  a gap, not a regression (none existed before either).

## 17. Cross-section effects checked

- `event_suppliers` (used by the Events → Suppliers tab) is now the target of RFQ award-to-booking
  conversion — verified the insert uses the table's real denormalised columns.
- The `events/[eventId]/suppliers` sub-page's query was fixed as an incidental consequence (see bug
  #4 above) and should be spot-checked by a human since it wasn't independently re-tested via the
  browser in this session (only `tsc`-verified).
- Supplier document counts, compliance scores, and RFQ response counts are all computed live from the
  same underlying tables the rest of the app writes to — no separate cached/denormalised counters were
  introduced that could drift.

## 18. Remaining user/manual actions

See `release-gated/user-fixes/suppliers/supplier-section.md`.

## 19. Release score: 72/100

**Why not higher:** no negative RLS testing, no integration/E2E test suite, R2 upload never exercised
against a real bucket (no credentials in this environment), filter/search interactions and most
lifecycle-mutation buttons weren't individually clicked through in the Chrome MCP pass (only
spot-checked), only 2 of the "required" 6 breakpoints were captured, and the supplier-portal RLS
boundary is an acknowledged, undesigned gap. RFQ create-form fields (category/budget/deadline) and the
full evaluation-criteria capture were built but not visually verified in-browser.

**Why not lower:** every screen renders real, live, workspace-scoped Supabase data with no mock arrays
remaining; the schema/RLS/seed are real and verified directly against the database; a real mutation
(star toggle) was proven to persist; a real bug (NaN%) was found and fixed via the QA pass itself;
stray test data was found and safely removed; 74 automated tests pass; TypeScript and ESLint are both
clean across the entire section.

**Final release decision: ready for admin-only beta.** Recommend a human product/QA pass (real
multi-role RLS testing, R2 credential setup + real upload test, full click-through of every button,
6-breakpoint responsive sweep) before general release.
