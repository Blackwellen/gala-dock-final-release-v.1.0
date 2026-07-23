# Venues Section — Release Evidence

**Section:** Event Manager → Venues (directory, venue profiles, relationship & commercial records)
**Parent route:** `/event-manager/venues`
**Related routes:** `/event-manager/venue-holds`, `/event-manager/room-blocks`

## 1. Scope & product boundary

This rebuild covers the **Event Manager venue directory** — an internal record of external venues and the
organiser's commercial/operational relationship with them. It intentionally does **not** implement Venue
Manager capabilities (booking-calendar ownership, venue-wide rotas/housekeeping/POS/payroll, managing every
supplier at the venue, etc.). The separate `src/app/event-manager/venue-management/` surface (a
venue-persona booking workspace) was left untouched, per explicit instruction.

## 2. Reference image mapping

All 10 reference images from `working_imagesS_venues/` were opened and mapped by visual content (not
filename) — see `docs/design-reference/venue-section-reference-map.md` for the full per-screen breakdown
(measurements, typography, spacing, badge treatment, responsive implications, what not to reproduce).

| # | Screen | Route |
|---|---|---|
| 1 | All Venues | `/event-manager/venues` |
| 2 | Preferred Venues | `/event-manager/venues` (Preferred Venues tab) |
| 3 | Overview | `/event-manager/venues/[venueId]/overview` |
| 4 | Events | `/event-manager/venues/[venueId]/events` |
| 5 | Documents | `/event-manager/venues/[venueId]/documents` |
| 6 | Notes | `/event-manager/venues/[venueId]/notes` |
| 7 | Activity | `/event-manager/venues/[venueId]/activity` |
| 8 | Maps & Access | `/event-manager/venues/[venueId]/maps-access` |
| 9 | Gallery & Spaces | `/event-manager/venues/[venueId]/gallery-spaces` |
| 10 | Commercials & Records | `/event-manager/venues/[venueId]/commercials-records` |

## 3. Routes implemented

All 10 screens exist as real, URL-addressable, server-rendered routes (not client-only tab state), matching
the existing `events/[eventId]/{tab}/page.tsx` pattern used elsewhere in the app:

- `src/app/event-manager/venues/page.tsx` + `VenuesClient.tsx` — All Venues / Preferred Venues (tab-switched,
  same route, `activeTab` client state — not yet URL query-param-backed, see user-fixes).
- `src/app/event-manager/venues/[venueId]/layout.tsx` — shared profile shell (header + 8-tab strip), fetches
  the venue + primary contact + space count once per request.
- `src/app/event-manager/venues/[venueId]/page.tsx` — redirects to `overview` (bare profile URL always
  resolves to a real tab).
- `src/app/event-manager/venues/[venueId]/{overview,events,documents,notes,activity,maps-access,
  gallery-spaces,commercials-records}/page.tsx` — one real route per tab, independently deep-linkable,
  refreshable, and back/forward-navigable.
- `src/app/event-manager/venue-holds/page.tsx`, `src/app/event-manager/room-blocks/page.tsx` — new
  workspace-level list views for `venue_holds` / `venue_room_blocks`, registered in the sidebar under
  Venues.

## 4. Supabase schema

Migration: `supabase/migrations/20260712_venues_section_rebuild.sql` (idempotent — `CREATE TABLE IF NOT
EXISTS`, `ADD COLUMN IF NOT EXISTS`, guarded RLS policy creation; verified safe to re-run).

**Extended existing tables** (additive only, no columns removed/renamed):
- `venues` — added `is_preferred`, `is_verified`, `rating`, `suitability_score`, `response_time_hours`,
  `avg_spend_cents`, `last_used_at`, `preferred_since/reason/by`, `relationship_owner_id`, `review_date`,
  `what3words`, `latitude`, `longitude`, `best_fit_event_types`, `accessibility_features`.
- `venue_documents` — added `category`, `version`, `is_current`, `parent_document_id`, `r2_key`, `checksum`.
- `venue_notes` — added `note_type`, `tags`, `reminder_date`, `related_event_id`.
- `venue_spaces` (pre-existing, simpler schema) — added `space_type`, `theatre/banquet/cabaret/classroom/
  reception/boardroom_capacity`, `dimensions`, `ceiling_height_m`, `preferred_uses`, `amenities`,
  `av_readiness`, `accessibility`, `restrictions`, `cover_media_id`.

**New tables** (all workspace-scoped, RLS via `is_workspace_member`/`has_workspace_role`):
`venue_contacts`, `venue_media`, `venue_site_maps`, `venue_access_details`, `venue_activity_log`,
`venue_commercial_terms` (write access restricted to owner/admin/manager — finance-sensitive),
`venue_commercial_transactions`, `venue_holds`, `venue_room_blocks`.

Indexes added for: preferred-venue lookup, name search, document expiry/current-version, pinned notes,
activity timeline, commercial transaction due-date/status, contract review date, hold/room-block
status/expiry/release-date.

Applied directly via `supabase db query --linked -f <file>` (the project's established workaround — `supabase
db push` is blocked by pre-existing migration-history drift documented in prior sections' user-fixes docs).
Re-ran the migration a second time after applying to confirm full idempotency (zero errors, no duplicate
objects).

Types regenerated: `supabase gen types typescript --project-id yepewcsuuaanoiabwscf` →
`src/lib/supabase/database.types.ts` (grew from 17,882 to 18,799 lines; spot-checked `venue_holds`,
`venue_contacts`, `venue_commercial_terms`, `venue_room_blocks` are present).

## 5. Storage (R2)

`src/app/api/r2/presign/route.ts` extended with three new upload kinds: `venue-document` (100 MB, PDF/office/
image), `venue-gallery` (20 MB, image), `venue-site-map` (20 MB, image/PDF) — following the existing
server-generated-key, workspace-membership-checked pattern (`venue-cover` already existed). Existing
`uploadVenueDocument` action (Supabase Storage bucket `venue-files`) was left as-is for backward
compatibility with already-uploaded documents; new gallery/site-map upload UI wiring to the R2 presign
endpoint is **not yet built** — see user-fixes.

## 6. Cross-module integration delivered this pass

- **Events**: Events tab reads live `events` rows joined by `venue_id`; Overview/list KPIs derive "last
  used" from linked events as a fallback when `venues.last_used_at` isn't set.
- **Finance**: `venue_commercial_transactions` records deposits/fees with due dates and paid status,
  displayed on Commercials & Records; not yet surfaced inside the Finance module itself (see user-fixes).
- **Tasks/Calendar/Inbox/Automations**: not wired this pass — flagged as pending, see user-fixes.

## 7. Demo seed

`supabase/seed/venue_management_demo.sql` — idempotent (deletes-then-reinserts by fixed venue name),
recreates the three venues shown across the reference images (Grand Hall London, Riverside Pavilion, North
Dock Warehouse) with contacts, spaces, gallery media (CDN-hosted demo images), documents, notes, activity
log entries, access details, commercial terms, commercial transactions, one venue hold and one room block.
Applied and verified idempotent (re-run twice, confirmed no duplicates, `is_preferred`/`rating` values
correct on both runs).

## 8. Pre-existing bugs found and fixed

- `public.venue_categories` had an `audit_venue_category()` trigger that hard-failed every insert/update/
  delete because it wrote to `public.admin_action_log`, a table that doesn't exist. Root cause: two
  different triggers (`audit_venue_category`, `_venue_attachments_audit`) expect incompatible column shapes
  for that table, so it was never created; `_venue_attachments_audit` already defends against this with a
  `BEGIN...EXCEPTION WHEN OTHERS THEN NULL` swallow, `audit_venue_category` was missing that same guard.
  **Fixed** in `supabase/migrations/20260713_fix_audit_venue_category_trigger.sql` — re-defined the function
  with the identical, already-proven defensive pattern. Verified live with a real insert+delete test and
  confirmed the migration re-runs idempotently. The demo seed now creates its categories directly again.
- The venue create/edit forms and `createVenue`/`updateVenue` actions offered an invalid `"preferred"` status
  value (the `venues_status_chk` constraint only allows `active/archived/merged` — the dropdown was silently
  broken for any user who selected "Preferred"). **Fixed** — moved "preferred" to the new `is_preferred`
  boolean where it belongs, and fixed the checkbox wiring in both forms (they build `FormData` manually
  rather than via native form submission, so a plain `name=` attribute wasn't enough — needed explicit
  controlled-state + `fd.set(...)`).

`public.admin_action_log` itself still doesn't exist (see user-fixes item 1 for the lower-priority follow-up
on that).

## 9. Testing performed

- **TypeScript**: `npm run typecheck` — zero errors in any new/changed venue file (247 pre-existing errors
  found across the wider codebase, all in marketplace/customer files, none touched by this work).
- **Lint**: `npx eslint` targeted at all changed venue files — zero errors after fixing three
  `react-hooks/purity` violations (`Date.now()` called directly in Server Component bodies; moved to
  `isFutureDate`/`isWithinDays`/`isWithinPastDays` helpers in `lib.ts`).
- **Build**: `npm run build` was started and stalled indefinitely (17+ minutes with zero progress) at the
  "Running TypeScript" phase — killed rather than left running. This lines up with what standalone `tsc`
  already found: several **pre-existing, unrelated** files (`src/lib/customer.ts`,
  `src/app/event-manager/marketplace/**`) throw `TS2589: Type instantiation is excessively deep and possibly
  infinite` — a known TypeScript pathology that can make the compiler grind near-indefinitely on certain
  Supabase-generated type shapes. This predates the venues rebuild and blocks `next build` for the whole
  app, not just this section. Standalone `npm run typecheck` (a lighter path that doesn't hit the same
  Turbopack/Next build-time type-checker) *does* complete, in a few minutes, with those same 247 pre-existing
  errors and zero errors in any venue file. See user-fixes item 10.
- **Database**: migration and seed both applied live via the Supabase PAT/CLI and verified idempotent by
  re-running.
- **Chrome MCP visual/functional QA**: **not performed this session** — the Chrome DevTools MCP connection
  was unstable/disconnected repeatedly during this session. No live-browser pixel comparison or click-through
  testing was completed. This is the single largest gap against the original spec — see user-fixes.
- Unit/integration/RLS test suites: not added this pass (no Zod/test-fixture convention exists yet for this
  domain — see user-fixes).

## 10. Release decision

**Blocked pending manual fix / QA**, specifically:
1. Chrome MCP visual + functional QA against all 10 reference images (not run this session).
2. Gallery/site-map upload UI (R2 presign wiring exists server-side; no upload widget built yet).
3. Full cross-module wiring (Proposals, Calendar, Tasks, Inbox, Automations, Finance surfacing).
4. The app-wide `next build` stall (pre-existing, unrelated to venues — see user-fixes item 9).

(The `venue_categories` trigger bug is now fixed — see §8.)

The **code that was shipped** (schema, RLS, all 10 routes with live Supabase data, R2 allowlist, nav, seed)
is real, typechecked, linted clean, and idempotent — this is a genuine, substantial vertical slice, not a
mock-up. It is not, however, the full 100/100 checklist in the original spec; see
`/release-gated/user-fixes/venues-section.md` for the exact remaining work, in priority order.
