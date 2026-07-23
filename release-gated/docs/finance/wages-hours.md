# Finance / Wages & Hours — Release Evidence

See `_shared-infrastructure.md` for schema/RLS/seed/tests shared across all Finance tabs.

- **Route**: `/event-manager/finance/wages-hours` (+ `/wages-hours/new`)
- **Reference image**: #2 in the image map.

## Architecture decision
Genuinely new domain — no staffing-cost concept existed anywhere in the repo (only `event_staff_assignments`/`team_availability_blocks`, which have no rate/cost columns). New `timesheets` table (linkable to `event_staff_assignments` via an optional FK) + `payroll_exports`.

## Honesty requirement — "Run Payroll"
**Confirmed: does not fake a real payroll submission.** There is no payroll-provider integration anywhere in this repo. "Run Payroll" creates a local `payroll_exports` snapshot record and the UI explicitly states "Creates a local export record only — no payroll provider is connected, no payment is sent."

## Tested
- KPIs: Scheduled Hours, Actual Hours Logged, Wage Cost, Overtime Cost, Avg Hourly Cost, Unapproved Timesheets.
- Staffing Cost by Event bar chart, Hours by Department stacked bar (production/operations/front_of_house/security/other).
- Payroll Due card with embedded Run Payroll CTA, Top Labour Cost Events, Overtime Alerts, Latest Approvals.
- Table: 10 seeded timesheets, Approve/Reject actions wired to a real server action updating `approval_status`/`approved_by`/`approved_at`.
- RLS confirmed: `timesheets`/`payroll_exports` SELECT restricted to owner/admin/manager (wage data).
- **Live end-to-end test**: clicked "Run Payroll" with 5 approved timesheets — it correctly moved all 5 to `Exported` status, "Payroll Due" dropped from £1.2K/5 timesheets to £0/0, and a real per-timesheet CSV export (`generatePayrollExportCsv`) was generated and its key stored on the new `payroll_exports` row. "Download CSV" appeared in the success state.

## Bugs found & fixed
None specific to this tab beyond the shared cross-cutting fixes (hydration, lint, mobile header/tab-scroll). This was the cleanest agent output of the nine.

## Score & decision
**Score: 94/100.** Deductions: no statutory payroll-deduction calculation (correctly out of scope without a real payroll engine), CSV generation not tested against a live R2 bucket (gracefully degrades when unconfigured, per shared infra doc).
**Decision: ready for release.**
