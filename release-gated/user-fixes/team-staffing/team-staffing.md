# Team & Staffing — Manual Actions Required

These cannot be completed by an automated agent. Exact steps below.

## 1. Decide what to do with the "QA Test Workspace" and demo accounts

This session created, via the Supabase service-role key:
- One throwaway auth user: `galadock.qa.teamstaffing@example.com` (owner of "QA Test Workspace").
- 48 demo team-member auth users under `@galadock-demo.example.com` addresses, all members of that
  same "QA Test Workspace" only (not your production workspace).
- `.env.local`'s `DEV_QA_EMAIL` was changed from `jamahlthomas1996@gmail.com` (your real account —
  confirmed by you as real, untouched) to `galadock.qa.teamstaffing@example.com`.

Steps for you:
1. If you want to keep using `/api/dev/auto-signin` for future QA, leave `DEV_QA_EMAIL` as-is.
2. If you want these 49 throwaway accounts removed, delete them via Supabase Auth admin
   (`auth.admin.deleteUser` for each, or the dashboard's Auth → Users list, filtering by the
   `@galadock-demo.example.com` / `@example.com` domains) — this cascades to `workspace_members`,
   `team_member_profiles`, etc. via `ON DELETE CASCADE`, and the "QA Test Workspace" itself can be
   deleted from `workspaces` once empty.
3. Revert `DEV_QA_EMAIL` in `.env.local` if you delete the QA user.

## 2. Fix the `/api/dev/auto-signin` session bug's blast radius (already patched, but verify)

The pre-existing bug (documented in the release-evidence doc) meant this route's login never
actually took effect and the browser silently kept whatever session was already cached. The fix
(server-side `verifyOtp` token exchange) has been applied and verified working in an isolated
browser context. **You should independently verify** that no other automated QA tooling in this
repo relies on the old (broken) redirect-to-`action_link` behavior before relying on the fix
elsewhere.

## 3. Seed staffing requests + demo events for Screen 10

`/event-manager/team/staffing-requests` renders correctly but is empty — no demo `staffing_requests`
rows were seeded because that requires demo `events` rows to attach to (`staffing_requests.event_id`
is a required FK), and seeding events was out of scope for this pass. To populate it:
1. Create a handful of demo events in the QA workspace (or your real workspace).
2. Insert `staffing_requests` rows referencing those event IDs, or build the "New Staffing Request"
   creation flow (the button exists in the UI but isn't wired to a server action yet).

## 4. Build the remaining 10 profile sub-tabs

`ProfileShell.tsx` renders all 13 canonical tabs (Overview, Workload, Schedule, Availability,
Assignments, Roles & Skills, Time Off, Performance, Documents, Notes, Activity, Payroll/Commercial,
Settings) as links, but only Overview, Schedule, and Roles & Skills have real page implementations
behind them. Clicking the other 10 currently 404s. Each needs its own `page.tsx` + data fetcher
following the pattern in `team/members/[memberId]/overview/` and `.../schedule/`.

## 5. Wire write/mutation actions for the new schema

The following buttons exist in the UI but are not yet wired to real server actions (they're
present, correctly labelled, and route correctly, but don't mutate data): Add Team Member, Edit
Profile, Assign to Event, Message, Add Role/Add Region/Add Certification (Roles & Skills page),
New Staffing Request, and shortlist persistence on Find Team (currently client-state only, resets
on refresh). Each needs a server action following the pattern of the existing
`addAvailabilityBlock`/`removeAvailabilityBlock` actions in `team/actions.ts`.

## 6. Add rate-visibility permission gating

`team_member_profiles.day_rate_cents`/`hour_rate_cents`/`overtime_rate_cents` are readable by any
workspace member per current RLS (see release-evidence doc Section 8). Before this ships to real
customers with non-owner/admin team members, either:
- Add a `team.rates.view` permission check in the query layer (`_data/queries.ts`,
  `[memberId]/_data/member.ts`) so non-managers get `null` for these fields, or
- Split rates into a separate `team_member_rates` table with its own manager-only RLS policy
  (the more robust long-term fix, mentioned directly in the migration file's closing comment).

## 7. Configure Cloudflare R2 for team-member documents (not started)

No document/CV/certificate-evidence upload flow was built this pass. When you're ready:
1. Confirm the existing R2 credentials in `.env.local` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) are valid for this use case (they're already configured for
   other sections' uploads).
2. Add a `team_member_documents` table (see the full data-model list in the original brief §19 if
   you want the exhaustive version) and wire it to the existing `/api/r2/presign` /
   `/api/r2/presign-download` routes, following the pattern used by Suppliers' document uploads.

## 8. Run a full project typecheck yourself

`npx tsc --noEmit -p tsconfig.json` took long enough in this environment (multiple attempts exceeded
several minutes without completing, likely due to the size of the generated `database.types.ts`)
that a second full pass covering Screens 3–10 could not be confirmed to finish within this session.
One full pass **did** complete earlier (before Screens 3–10 existed) with 0 errors in any `team/`
file and 247 pre-existing unrelated errors elsewhere. Please run this yourself with more time/a
faster machine to get a definitive all-screens confirmation before relying on it for CI/release
gating.

## 9. Responsive / accessibility / automated-test coverage

Not done this pass — only the 1672×941 desktop viewport was checked. Tablet, mobile, PWA, keyboard
navigation, screen-reader labels, and WCAG contrast checks per the original brief's §32–35 are all
outstanding. No unit/integration/E2E tests were written.

## 10. RLS negative testing

The new tables' RLS policies were written following the existing `is_workspace_member()` pattern
but were not independently negative-tested (e.g. confirming a second, different workspace's member
truly cannot read this workspace's team data). Recommend a dedicated pass with two separate test
workspaces before this ships.
