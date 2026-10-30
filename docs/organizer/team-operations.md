# Team, resources and live operations (Q17, domains 57–63)

Migrations 202610293011–3014. Tests: `tests/organizer/q17-team-operations.spec.ts` (11).

## People

- `crew_members` writes owner/manager (Q12 guard). `crew_notes`: any active member may add notes (the `addNote` decision — fixes the Q12 regression). `crew_private`: emergency contact / medical notes, owner/manager or the person.
- Crew ↔ login: `crew_invite_login(crew, token_hash, role)` (owner only) → accepting the invite sets `crew_members.user_id`.

## Shifts

- Capacity: Q12 `enforce_crew_capacity` (lock per person, buffers, availability blocks, block|warn).
- Attendance: `shift_check(shift, in|out|no_show)`; history in `shift_changes`.
- Staff self-service: `my_shifts()`, `member_respond_shift(shift, accept)`; routes `/organizer/team/my-shifts`, `/provider/team/my-shifts`.
- Substitution: `reassign_shift(shift, to_crew, reason)` under the target's lock (concurrent reassignments: one wins).
- Notifications via notify(): assigned, reassigned-away, availability request, leave requested/decided, shift declined.

## Leave

`leave_requests` (machine `leave_request`: pending → approved | rejected | cancelled; approved → cancelled). `request_leave`, `decide_leave` (approval inserts an availability block and returns clashing shifts), `cancel_leave`.

## Resources

Inventory = `provider_equipment`. Event allocations `event_allocate_resource` / `event_release_resource` reuse the Q12 equipment lock.

## Run sheet and live mode

`run_sheet_tracking` (delay, actual start/end, dependencies, owner) via `run_sheet_update(...)`; dependencies must be done before an item starts. `event_live_snapshot(event)`: now/next, delays, crew check-in, supplier arrivals (`provider_checkins`), ticket entry, open incidents, recent changes.

## Incidents and risks

Machine `incident` (open → acknowledged/investigating/mitigated/resolved …; closure needs a note); `incident_updates` timeline; restricted `incident_private`; high/critical alert owners/managers. `event_risks`: likelihood × impact and residual score; managers write, members read.

## Conflict detection

`operational_conflicts(ws, from?, to?)` / `event_conflicts(event)`: crew rows from the existing `team_conflicts` engine plus deactivated crew, resource over-allocation/unavailability, run-sheet delays ≥ 10 min, high/critical incidents, high residual risks. Shown on Organizer Home + Calendar (`ConflictsCard`), the event Operations tab, and the organizer agent context (CONFLICT lines; no AI calls). Exit gate met at code/test level (screens not browser-checked).

## Open

Team-page UI for leave approval, substitution and login invites (server actions ready in `src/lib/actions/team.ts`); work orders; demo seed (Q38). Pre-existing bug found: client roles have only SELECT on `workspace_invites`, so the generic owner invite (`/api/invites`, provider settings invite/revoke) fails with "permission denied" — needs a command (Q01).
