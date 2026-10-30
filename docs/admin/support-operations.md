# Support operations (Q31, domains 195–200, 287) — 2026-10-29

Migrations 202610294023–4028. Tests: `tests/admin/q31-support-ops.spec.ts` (6), `w08-admin-tiers` (17). UI: Admin → Support, case page, Macros & SLAs; Trust → Evidence review / Risk signals; Support → Privacy tabs; System health (+ Jobs); Maintenance.

## Lifecycle (machine `support_case`, enforced)
open ⇄ waiting ⇄ escalated → resolved → closed. resolved → open reopens with a fresh resolution window; closed is final. A customer reply re-opens a waiting or recently resolved case. Every change writes `support_case_events` (append-only) and `support.case_state_changed`.

## SLA
`support_sla_policies` per priority (urgent 15m/60m, high 60m/4h, medium 2h/8h, low 4h/16h; settings admins change with a reason). Priority change recomputes deadlines; the resolution clock pauses while waiting on the customer. Job `support.sla_sweep` (10 min) marks breaches (assignee notified in-app) and auto-closes resolved cases after their period.

## Commands (support + MFA; reasons where consequential; audited)
`admin_reply_case` (reply or internal note; requester notified in-app only), `admin_assign_case_to(case, admin, reason)` (via `admin_support_assignees`), `admin_update_case`, `admin_set_case_priority`, macros (`admin_save_support_macro` / `_archive_` / `_apply_`, placeholders {{requester_name}} {{reference}} {{subject}}), `admin_link_case_record` / `_unlink_` (13 record types, validated), `admin_escalate_case_to_trust`. Requester: `contact_support`, `support_case_reply` (own case, rate-limited, no existence leak) — **customer thread UI pending (W02)**.

## Customer-visible vs internal
Internal notes never readable by the requester (RLS); history, links and macros admin-only.

## Safeguarding
Category `safeguarding`: urgent; Trust & Safety admins alerted in-app; visible only to admins with support + trust. Escalation opens a linked trust case.

## Review screens
- Q08 evidence `/admin/trust/verification` (documents, identity/business checks, restrictions, appeals). `trust_review_document` now Trust-only.
- Q33/Q22 `/admin/trust/risk` (signals, holds place/release, appeals, ticket flags).
- Q32 `/admin/support/privacy` tabs: legal holds, retention schedule + preview, test fixtures (**dry run only**).
- MFA added to admin paths: `ticket_risk_review` (+ reason), `set_directory_featured`, admin branches of `cancel_event_with_refunds`, `decide_cancellation`, `agent_control_run`, `start_agent_run`. Lanes replacing these functions must keep the MFA line.

## Job / dead-letter / outbox console
Admin → System health → Jobs. Reads (settings, agent_ops or audit): `admin_ops_overview`, `admin_job_list` (payload keys only), `admin_outbox_list`. Commands (settings + MFA + reason): `admin_job_retry`, `admin_job_cancel`, `admin_outbox_replay` (refuses consumers that already processed the event). Events `ops.job_retried`, `ops.job_cancelled`, `ops.outbox_replayed`.

## Health
Shared `healthContracts()` (`src/lib/release/health-contracts.ts`) for `/api/health` and the admin page. Public: liveness, db, maintenance. Ops bearer: integrations and contracts (e_signature, weather, virtual, calendar_sync, mailbox, clamav, r2, queue), workers, backlog; records `service_health_snapshots` (≤1/min, 30 days, sparkline).

## Maintenance
Status per audience + static banner/page preview; previewing never starts a window. Real maintenance is never switched on in QA.

## Scanner (4024)
`scan_admission`: ticket for another event admitted only with an active `pass_entitlement_check` (else `pass_not_valid_here`); online-only tiers refused (`online_only_ticket`).

## Open
Reconciliation has no dedicated admin screen; customer case thread UI (W02); seed: provider documents, pending checks, health snapshots, pass entitlements.
