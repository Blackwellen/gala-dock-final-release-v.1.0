# Suppliers & RFQs — Manual Actions Required

These cannot be completed by an automated agent. Exact steps below.

## 1. Configure Cloudflare R2 (required for document uploads to work)

Supplier compliance-document upload, and RFQ attachment upload, are coded and wired
(`src/lib/storage/r2.ts`, `/api/r2/presign`, `/api/r2/presign-download`) but **no R2 credentials
exist in this environment**. Until configured, the UI honestly shows "Document storage is not
configured for this environment" instead of faking a successful upload.

Steps:
1. In the Cloudflare dashboard, create (or reuse) an R2 bucket.
2. Create an R2 API token with read/write access scoped to that bucket.
3. Set these environment variables (in `.env.local` for local dev, and in your hosting
   provider's environment config for staging/production):
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET` (defaults to `gala-dock` if unset)
   - `R2_PUBLIC_URL` (only needed if you want a public CDN URL in addition to signed private access)
4. Restart the app. Test by uploading a compliance document from a supplier's Documents tab, and
   confirm it downloads correctly via the new presigned-GET route.

## 2. Fix the `supabase db push` / migration-history drift

Running `supabase migration list --linked` shows the remote project's migration-history table has
~200 entries with no matching local file (`"local":""` for each), meaning the base schema (`suppliers`,
`rfqs`, etc.) was applied to this Supabase project outside of this repo's `supabase/migrations/`
folder at some point before this session. This blocks `supabase db push` entirely — every attempt
fails with "Remote migration versions not found in local migrations directory."

This migration (`20260711_supplier_rfq_depth.sql`) and the two seed files were applied directly via
the Supabase Management API instead, bypassing the broken history check — a working but non-standard
path. To restore normal `supabase db push` usage for future migrations, someone with full context on
this project's Supabase history needs to either:
- Run `supabase db pull` to generate a baseline migration matching current remote state, then
  reconcile the migration-history table (`supabase migration repair`) against the ~200 remote-only
  entries — this needs a human because blindly repairing 200 unknown entries risks marking real
  historical migrations as reverted; or
- Accept the Management-API-execution workflow as the standing approach for this project and document
  it as such in `AGENTS.md`/`CLAUDE.md` so future sessions don't have to rediscover it.

## 3. Design a supplier-portal auth boundary (if external supplier self-service is wanted)

Right now, `workspace_role` only has internal operator roles (owner/admin/manager/member). There is
no login flow for an external supplier to submit an RFQ response themselves — all response entry in
this build happens on the internal side (staff logging a supplier's quote). If external supplier
self-service (a supplier logging in via a portal link to submit their own quote, without seeing
competitors' responses) is a real requirement, it needs:
- A distinct auth session type (e.g. keyed off `supplier_portal_tokens`, which already exists in the
  schema for a different purpose — quote acceptance links) rather than `workspace_members` role checks.
- New RLS policies on `rfq_responses`/`rfq_response_line_items` scoped to "this token's supplier_id
  only", separate from the internal `is_workspace_member` policies added in this migration.

This is a product/security design decision, not something to improvise — flagging it rather than
building a guessed-at version.

## 4. Human QA pass before general release

Per the release evidence doc's score (72/100, "ready for admin-only beta"), please have a person:
- Click every lifecycle button (Reactivate, Restore, Request Docs, Send Reminder, Award, Convert to
  Booking) end to end, not just confirm the code path exists.
- Test with a second user account in a different role (member, or a different workspace entirely) to
  confirm RLS actually blocks cross-workspace/under-permissioned access — this session only tested as
  the workspace owner.
- Sweep the remaining breakpoints (1440, 1280, 1024, tablet) — only 1728px desktop and 390px mobile
  were checked in this session.
- Verify the RFQ create form (`/event-manager/rfqs/new`) in the browser — it was extended with new
  fields (category, budget range, response deadline, evaluation criteria) in code and type-checked,
  but not visually confirmed.

## 5. Data-quality follow-up (optional, low priority)

`supplier-section-legacy-enrichment.sql` enriched 19 pre-existing incomplete supplier rows discovered
during QA, but two cosmetic gaps remain that a future seed pass could close if it matters for demos:
- "Fully Onboarded" and "Recent Spend (90 Days)" KPIs read as 0 across the board — `onboarding_completed_at`
  and real `event_suppliers.contract_value_cents` linkage aren't populated for most seeded suppliers.
- Paused suppliers show "No contact on file" — `supplier_contacts` rows weren't seeded for the 12 new
  paused suppliers (only for the "clean" active set and the legacy-enrichment pass).

Neither blocks functionality; both are seed-data completeness, not code bugs.
