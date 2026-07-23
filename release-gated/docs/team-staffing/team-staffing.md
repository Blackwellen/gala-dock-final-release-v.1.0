# Team & Staffing — Release Evidence

**Section:** Team & Staffing (Workload, Availability, Team Directory, Member Profile, Find Team, Insights, Staffing Requests)
**Routes:** `/event-manager/team` (redirects to `/workload`), `/event-manager/team/workload`, `/event-manager/team/availability`, `/event-manager/team/members` (`?view=list|cards`), `/event-manager/team/members/[memberId]/{overview,schedule,roles-skills,...}`, `/event-manager/team/find`, `/event-manager/team/insights`, `/event-manager/team/staffing-requests`
**Workspace / surface:** Workspace app shell only. No portal or admin surface work in this pass.
**Built:** 2026-07-12 → 2026-07-13, single session.

## 1. What this covers

Before this work, "Team" was three disconnected implementations sharing overlapping tables:
a workspace-wide hub (`event-manager/team`), a seat/role admin page (`settings/team`), and a
per-event staffing assignment UI (`events/[eventId]/staffing`). This rebuild consolidates the
first into a proper 6-tab "Team & Staffing" module matching the 10 supplied reference designs,
leaving Settings→Team (seat/role administration) and the per-event Staffing tab untouched as
separate, already-working concerns.

**Phase 1 — reference mapping.** All 10 images in `working_imagesS_Team/` opened, visually
inspected and mapped in `docs/design-reference/team-staffing-image-map.md`, including resolving
a shell inconsistency (one image showed an invented sidebar not matching the real `AppSidebar` —
the real shell was kept per AGENTS.md §3).

**Phase 2 — schema, RLS, seed.** Additive migration
`supabase/migrations/20260712_team_staffing_directory.sql`: 10 new tables
(`team_departments`, `staffing_roles`, `team_member_profiles`, `skills`, `team_member_skills`,
`team_member_regions`, `certification_types`, `team_member_certifications`, `staffing_requests`,
`staffing_request_candidates`), all with RLS via a new `is_workspace_member()` helper. Applied
directly to the live project (`scripts/db/apply-sql.mjs` + `SUPABASE_ACCESS_TOKEN`, the pattern
already used by prior sections); `database.types.ts` regenerated. 48 demo team members seeded
(`scripts/dev/seed-team-demo-data.mjs`) into a dedicated throwaway "QA Test Workspace" — real
auth users, real names/roles/departments/skills/certifications (including intentionally
expiring/expired ones)/rates/regional coverage. Reused the pre-existing `event_staff_assignments`
and `team_availability_blocks` tables for Workload/Availability/Schedule rather than duplicating
that data model.

**Phase 3 — live wiring.** All 10 screens built against real Supabase queries
(`team/_data/queries.ts`, `team/members/[memberId]/_data/member.ts`) — no fixtures, no mock data.

**Phase 4 — visual QA + bug fixes found along the way.**
- Fixed a real correctness bug discovered while building Workload: `event_staff_assignments.call_time`/`end_time`
  are `timestamptz`, not `"HH:MM"` strings — the initial parsing silently failed and always fell
  back to a flat 8h/day (`team/_lib/workload.ts`).
- Fixed a data-realism bug in the demo seed: day rates were seeded ~10x too high (formula
  double-multiplied by 100) — corrected in the seed script and via a one-off update to already-seeded rows.
- Fixed a **pre-existing, unrelated bug** surfaced as a side effect of QA: `/api/dev/auto-signin`
  (the dev-only QA login route) redirected the browser to a Supabase magic-link URL that carries
  the session token in a URL *fragment*. No public page in this app instantiates a client-side
  Supabase client, so the fragment was silently dropped and the browser kept whatever session was
  already cached in the (persistent) Chrome MCP profile — which, during this session, was the
  operator's real account. The route now exchanges the token **server-side** (`verifyOtp` with the
  token hash) and writes the session cookie directly on the response. Verified working in an
  isolated Chrome MCP browser context; the operator's real session was not touched by any write
  during this session (screenshots and reads only occurred before the fix; no mutations happened
  under that session).
- Fixed a layout bug: an empty `PageHeader` title on member profile pages left an unwanted gap
  above the tab bar — removed the empty `PageHeader` wrapper in `ProfileShell.tsx`.
- Fixed a pagination-options mismatch: Team Directory card view defaulted to 12 per page but the
  page-size dropdown only offered 10/25/50 — now offers 12/24/48 in card view.

## 2. Screen sizes tested

1672×941 (matches the reference images) via Chrome MCP against the live dev server, authenticated
via the fixed `/api/dev/auto-signin` route inside an **isolated** Chrome MCP browser context
(`isolatedContext: "team-staffing-qa"`) so the operator's real session/cookies were never reused.
Tablet/mobile/PWA breakpoints were **not** captured in this pass — see Section 9.

## 3. Screenshots

Captured live during this session (reviewed inline, not saved to disk as files): Workload,
Availability, Team Directory (list), Team Directory (cards), Member Profile Overview, Member
Schedule, Member Roles & Skills, Find Team Members, Team Insights, Open Roles & Staffing Requests.
All matched their reference image's layout, KPI set, and structural composition. Deltas from the
references are documented per-screen below.

## 4. Routes tested

- `/event-manager/team` → redirects to `/workload` ✅
- `/event-manager/team/workload` — real KPIs, week/2-week/month range picker, per-member day grid ✅
- `/event-manager/team/availability` — real availability grid, add/remove block dialog ✅
- `/event-manager/team/members?view=list` — real KPIs, filters, table, donut rail ✅
- `/event-manager/team/members?view=cards` — same data source as list, card grid ✅
- `/event-manager/team/members/[memberId]/overview` — real profile data, honest gaps for unbuilt fields ✅
- `/event-manager/team/members/[memberId]/schedule` — per-member week grid ✅
- `/event-manager/team/members/[memberId]/roles-skills` — real skills/certs/rates/regions ✅
- `/event-manager/team/find` — search/filter/sort/shortlist over real directory data ✅
- `/event-manager/team/insights` — real aggregate KPIs, department/compliance breakdowns ✅
- `/event-manager/team/staffing-requests` — renders correctly, honest empty state (no demo staffing
  requests seeded — would require demo events too; not done this pass) ✅

Not exercised in this pass: the other 10 profile sub-tabs (Availability, Assignments, Time Off,
Performance, Documents, Notes, Activity, Payroll/Commercial, Settings) — the tab bar and routing
exist (`ProfileShell.tsx`), but only Overview/Schedule/Roles & Skills have real page implementations
behind them; the rest currently 404 until built.

## 5. Buttons / actions tested

- View toggle (list/cards) on Team Directory — URL-backed via `?view=`, confirmed persists on reload. ✅
- Add/remove availability block dialog — reuses existing `addAvailabilityBlock`/`removeAvailabilityBlock`
  server actions (pre-existing, real Supabase writes). ✅
- Shortlist add/remove on Find Team — client-state only in this pass, not yet persisted server-side.
- Row/card action buttons (Message, Assign to Event, Edit Profile, etc.) are present and correctly
  routed/labelled but **not wired to real mutations yet** — this pass focused on read paths and the
  pre-existing availability actions; write actions for the new tables (add skill, add certification,
  create staffing request, shortlist persistence, etc.) are follow-up work.

## 6. Data sources tested

Live Supabase only. No fixtures. Tables read: `workspace_members`, `profiles`,
`event_staff_assignments`, `team_availability_blocks`, `events`, `team_departments`,
`staffing_roles`, `team_member_profiles`, `skills`, `team_member_skills`, `team_member_regions`,
`certification_types`, `team_member_certifications`, `staffing_requests`.

## 7. Supabase tables checked

New (this session): `team_departments`, `staffing_roles`, `team_member_profiles`, `skills`,
`team_member_skills`, `team_member_regions`, `certification_types`, `team_member_certifications`,
`staffing_requests`, `staffing_request_candidates`. Reused (pre-existing): `workspace_members`,
`profiles`, `event_staff_assignments`, `team_availability_blocks`, `events`, `workspaces`.

## 8. RLS policies checked

Every new table has `SELECT`/`ALL` policies scoped through a new `is_workspace_member(workspace_id)`
`SECURITY DEFINER` helper (read + write requires current-user membership in that workspace, matching
the pattern already used elsewhere in this codebase). **Not independently negative-tested in this
pass** (no second workspace/user was used to confirm cross-tenant denial) — see Section 9.
One known gap, flagged directly in the migration's own comments rather than hidden: rate fields
(`day_rate_cents`/`hour_rate_cents`/`overtime_rate_cents`) live in `team_member_profiles` at row
level, so RLS alone does not hide rates from workspace members who shouldn't see them — that needs
app-layer gating (or splitting rates into a manager-only table) once a `team.rates.view`-style
permission exists.

## 9. Edge functions / storage / integrations checked

None — this pass didn't touch R2 uploads, email/SMTP, AI Copilot context, or Automations wiring for
Team & Staffing. All flagged as pending work below.

## 10. Cross-section effects checked

- `event_staff_assignments`/`team_availability_blocks` are shared with the pre-existing per-event
  Staffing tab (`events/[eventId]/staffing`) and Settings→Team — confirmed the new screens read
  (not write, except the pre-existing availability actions) from the same tables, so no data
  duplication was introduced.
- Sidebar "Team" nav link already pointed at `/event-manager/team`, which now redirects correctly.

## 11. Bugs found and fixed (see Phase 4 above for detail)

1. `call_time`/`end_time` timestamp parsing bug (workload hours always flattened to 8h/day).
2. Demo seed day-rate formula ~10x too high.
3. **Pre-existing** `/api/dev/auto-signin` session-establishment bug (fragment token never
   processed client-side) — real security-adjacent finding, now fixed server-side.
4. Empty `PageHeader` title leaving a layout gap on profile pages.
5. Card-view pagination page-size mismatch.

## 12. Migrations applied

- `supabase/migrations/20260712_team_staffing_directory.sql` — applied via Management API, `database.types.ts` regenerated.

## 13. Tests run

- TypeScript: no errors in any `team/` file (confirmed via a completed full-project `tsc --noEmit`
  pass before Screens 3–10 were added, and via the dev server compiling every route without error
  after). A second full-project re-run to cover Screens 3–10 was attempted twice but did not
  complete within this session (large `database.types.ts` makes full-project `tsc` slow in this
  environment) — see Section 9 in user-fixes.
- No automated unit/integration/E2E tests written this pass.
- No RLS negative tests (cross-workspace/cross-role denial) run this pass.

## 14. Performance / security findings

- No N+1 query patterns identified in the code reviewed (each screen does a small fixed number of
  batched queries via `Promise.all`, not per-row queries).
- Security-adjacent finding: see the `/api/dev/auto-signin` fix above — this was a dev-only route
  gated behind `NODE_ENV=development`, not reachable in production, but worth noting since it
  masked a real logged-in session rather than failing loudly.
- Rate-field visibility gap (Section 8) is the main outstanding security-relevant item.

## 15. Remaining user/manual actions

See `release-gated/user-fixes/team-staffing/team-staffing.md`.

## 16. Release score: 42/100

**Rationale:** all 10 screens exist, render correctly against real data, and are visually close to
the reference designs — but this is a first pass, not a finished module. Missing: 7 of 10 profile
sub-tabs, most write/mutation actions for the new schema, R2 document storage, Automations/Copilot/
Inbox/Finance integration, coverage map on Find Team, RLS negative testing, responsive/mobile QA,
automated tests, and a rate-visibility permission gate.

## 17. Final release decision: **blocked pending further work**

Not ready for release. Recommend continuing in phases: (1) wire remaining profile sub-tabs and
write actions, (2) add RLS negative tests + rate-visibility gating, (3) R2/document integration,
(4) responsive QA, (5) automated test coverage, before re-scoring.
