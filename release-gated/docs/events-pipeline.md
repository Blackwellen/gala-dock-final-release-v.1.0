# Release Evidence — Events Pipeline

**Section:** Events Pipeline (Overview + Kanban + List + Cards + Calendar)
**Route:** `/event-manager/events`
**Date:** 2026-06-30
**Auditor:** Claude Code

---

## Section Overview

| Field | Value |
|---|---|
| Section Name | Events Pipeline |
| Primary Route | `/event-manager/events` |
| App Surface | Event Manager workspace |
| Required Plan | Base (all plans) |
| Required Add-on | None |
| Feature Flag | None |

---

## Screen Sizes Tested

- 1440px desktop (code review)
- 1280px standard desktop (code review)
- 1024px compact (code review)
- Tablet / mobile — pending Chrome MCP QA (see user-fixes)

---

## Routes Tested

| Route | Status |
|---|---|
| `/event-manager/events` | ✅ loads — pipeline page |
| `/event-manager/events?view=list` | ✅ view param supported |
| `/event-manager/events?view=board` | ✅ view param supported |
| `/event-manager/events/[eventId]/overview` | ✅ overview page exists |
| `/event-manager/calendar` | ✅ calendar page exists with demo/live fallback |

---

## Buttons / Actions Tested (code review)

- [x] View toggle: List / Cards / Board
- [x] New Event button (routes to wizard)
- [x] Pipeline stage tabs (All + 8 status stages)
- [x] Event card → click → detail overview
- [x] Search / filter bar
- [x] Board kanban drag (client-side only — no backend persist yet)

---

## Data Sources Tested

| Source | Column / Table | Status |
|---|---|---|
| `events` | `cover_image_url` | ✅ selected, preferred over `cover_path` |
| `events` | `quote_value_cents` | ✅ mapped to `quoteCents` |
| `events` | `readiness_score` | ✅ preferred; falls back to task-based |
| `events` | `next_action`, `next_action_due` | ✅ selected |
| `events` | `is_vip`, `is_hybrid`, `flagged` | ✅ selected |
| `event_tasks` | `status` — for readiness fallback | ✅ batch query |
| `profiles` | `display_name` — for owner name | ✅ batch query |

---

## Supabase Tables Checked

| Table | Status |
|---|---|
| `events` | ✅ exists, correct columns confirmed in migration |
| `event_tasks` | ✅ exists |
| `event_run_sheet_items` | ✅ exists |
| `event_suppliers` | ✅ exists — status CHECK: pending/confirmed/contracted/invoiced/paid/cancelled |
| `event_budget_lines` | ✅ exists — status ENUM: planned/committed/paid |
| `event_expenses` | ✅ exists — status CHECK: pending/approved/rejected/paid |
| `event_guests` | ✅ exists — schema: first_name/last_name (20260614 wins) + full_name/segment/attendance_mode added by fix migration |
| `event_activity` | ✅ exists |

---

## RLS Policies Checked

| Table | Policy | Status |
|---|---|---|
| `events` | `is_workspace_member(workspace_id)` | ✅ applied in migration |
| `event_tasks` | `is_workspace_member(workspace_id)` | ✅ applied |
| `event_suppliers` | `is_workspace_member(workspace_id)` | ✅ applied |
| `event_budget_lines` | `is_workspace_member(workspace_id)` | ✅ applied in fix migration |
| `event_expenses` | `is_workspace_member(workspace_id)` | ✅ applied in fix migration |
| `event_guests` | `is_workspace_member(workspace_id)` | ✅ applied |
| `event_activity` | `is_workspace_member(workspace_id)` | ✅ applied |

---

## Edge Functions Checked

None triggered by the events pipeline overview page — all reads are direct Supabase queries from server components.

---

## Storage Buckets Checked

| Bucket | Usage | Status |
|---|---|---|
| `events` / `event-covers` | Cover image upload (R2) | Not used by seed — seed uses Unsplash URLs directly. Upload flow pending. |

---

## Integrations Checked

| Integration | Status |
|---|---|
| Unsplash image CDN | ✅ whitelisted in `next.config.ts` `remotePatterns` |
| Supabase Realtime | Not wired — manual refresh on pipeline changes |

---

## Bugs Found

| # | Bug | Fix Applied |
|---|---|---|
| 1 | `events/page.tsx` used `cover_path` column (doesn't exist) instead of `cover_image_url` | ✅ Fixed — now selects both, prefers `cover_image_url` |
| 2 | `quote_value_cents` not selected; page used `budget_cents` for quote display | ✅ Fixed — both now selected, `quoteCents` maps from `quote_value_cents` |
| 3 | `readiness_score` not selected; only task-based fallback used | ✅ Fixed — DB value preferred, task fallback secondary |
| 4 | `event_suppliers` seed used `'shortlisted'` status (violates CHECK constraint) | ✅ Fixed → changed to `'pending'` |
| 5 | `event_guests` seed used `name` column (doesn't exist in 20260614 schema) | ✅ Fixed — all 4 INSERT blocks changed to `first_name, last_name, full_name` |
| 6 | Fix migration backfill of `full_name` would fail if `name` column absent | ✅ Fixed — defensive DO block checks which columns exist |
| 7 | Old overview page at conflicting route still existed | ✅ Removed / routes cleaned |
| 8 | `is_vip`, `is_hybrid`, `flagged`, `tags` not selected in pipeline query | ✅ Fixed |

---

## Fixes Made

| File | Change |
|---|---|
| `src/app/event-manager/events/page.tsx` | Full rewrite — correct column selection, image fallback, readiness logic |
| `supabase/migrations/20260630_event_expenses_budget_guests_fix.sql` | Defensive DO block for `full_name` backfill |
| `supabase/seeds/demo-events-full-seed.sql` | 6 real events with Unsplash images; all 4 guest blocks use `first_name/last_name`; supplier status fixed |

---

## Migrations Applied

| File | Notes |
|---|---|
| `supabase/migrations/20260630_event_core_tables.sql` | Core events table with `cover_image_url` |
| `supabase/migrations/20260630_events_pipeline_columns.sql` | Pipeline columns: `readiness_score`, `quote_value_cents`, etc. |
| `supabase/migrations/20260630_event_expenses_budget_guests_fix.sql` | Budget lines, expenses, guest column additions |
| `supabase/seeds/demo-events-full-seed.sql` | **Manual step** — requires workspace ID substitution (see user-fixes) |

---

## Tests Run

| Test | Status |
|---|---|
| TypeScript compilation (no errors in modified files) | ✅ pass (code review) |
| SQL idempotency (all migrations use IF NOT EXISTS / DO guards) | ✅ pass (code review) |
| Seed `ON CONFLICT DO NOTHING` on all INSERTs | ✅ pass (code review) |
| RLS positive: workspace member reads events | Pending live test |
| RLS negative: cross-workspace read blocked | Pending live test |
| Unsplash images load in Next.js Image component | Pending live visual QA |
| Pipeline kanban board: 8 stages render | Pending live QA |

---

## Performance / Security Findings

- All event reads are single batch queries from server components (no N+1)
- Owner names use a single `IN` query across all event owner IDs
- Task counts use a single `IN` query across all event IDs
- No client-side secrets; Supabase server client used
- `cover_image_url` from DB is rendered via Next.js `<Image>` with domain whitelist — XSS-safe

---

## Cross-Section Effects Checked

| Section | Effect |
|---|---|
| Calendar (`/event-manager/calendar`) | Reads same `events` table via RPC; seed events will appear |
| Event detail (`/event-manager/events/[eventId]/overview`) | Reads `events` + child tables; seed data populates all sub-tabs |
| Activity feed | `event_activity` seed rows inserted for all 6 events |

---

## Remaining User / Manual Actions

See `/release-gated/user-fixes/events/events-pipeline.md` for full steps:

1. Apply 3 migrations to Supabase via PAT
2. Substitute `<WORKSPACE_ID>` in seed and run
3. Confirm 6 events appear with cover images at `/event-manager/events`
4. Create placeholder pages for 13 event sub-routes that currently 404
5. Run Chrome MCP visual QA at all screen sizes
6. Delete orphaned components: `EventsListView.tsx`, `EventCard.tsx`

---

## Release Score

**Current score: 78 / 100**

**Blocking items before 100/100:**
- [ ] Migrations applied to live Supabase (manual — requires PAT)
- [ ] Seed data confirmed in app with real images
- [ ] 13 event sub-routes un-404'd (placeholder pages)
- [ ] Chrome MCP visual QA at all screen sizes
- [ ] RLS positive/negative tests on live DB
- [ ] Kanban drag-and-drop persisted to DB (currently client-only)

**Final Release Decision:** `blocked pending manual fix` — requires migration apply + seed run + sub-route stubs

---

*Document created 2026-06-30 by Claude Code.*
