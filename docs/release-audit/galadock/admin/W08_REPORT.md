# W08 — Platform admin

Run 2026-10-28 · lane B · UI as `admin.demo@example.com` (all permissions, TOTP, aal2); spec uses 6 disposable admins with different permission sets + disposable members/conversations/case, all removed. Evidence `artifacts/visual/w08/`. Spec `tests/admin/w08-admin-tiers.spec.ts` (14: 10 pass, 4 expected-fail).

## Routes and fidelity

All 31 admin pages (24 static, 7 detail) render 200, 0 console errors, 0 overflow; phone `/admin`, `/admin/support` fit. AD-001…AD-018 matched (AD-013 after F7, AD-016 after F5/F6); AD-014 captured on a different case (re-capture with SUP-4421). Data drift: other lanes' test fixtures dominate users/commerce/support lists; 0 verified listings (Q08). Reference-blocked routes render.

## Fixes

| # | File | Change |
|---|---|---|
| F5 | `src/styles/admin-b-agent.css:36` | empty failed-runs message rendered one word per line |
| F6 | `src/app/admin/(console)/agent-integrations/page.tsx:106` | tool-incidents note ran under sparkline |
| F7 | `src/app/admin/(console)/support/data.ts:31-34` | SLA "29610h" → days for spans > 72h |
| F8 | `src/app/admin/(console)/maintenance/form.tsx:37` | "Banner audience" label + tooltip (M2+ enforcement applies to everyone) |

## Control census

1,230 controls / 24 routes (576 unique); 406 links, 391 200 (rest anchors/external), 0 broken; 99 form controls not run on real data (RPCs exercised in the spec with random ids/disposable data). No Gala Agent controls clicked.

## Tests

Pass: 3 admins × 8 areas permission matrix (own area only); written reason required; aal1 refused for admins with a factor; read tiers (support cases, transactions, checkout orders, partners, audit); credits need agent_ops; settings publishing needs settings; **no blanket conversation read** (retired functions gone); break-glass scoped to the case's member, justification required, other admin's grant refused, access logged, expired grant refused; maintenance via API (schedule far future, never active, refused for others, ended + audited, M4 aal1 refused, enforcement decision function correct).

## Security findings

| # | Sev | Finding | Packet |
|---|---|---|---|
| S1 | **P1** | `email_outbox_own` policy lets every support admin read all email bodies; message notifications include the first 160 chars of private messages — no case scope, time limit or audit (7 live rows) | Q31/Q32 |
| S2 | P2 | `require_step_up` only refuses aal1 when the user has a factor → an admin without MFA passes `admin_require` at the DB | Q01/Q31 |
| S3 | P2 | `start_/end_maintenance` need only `settings` (no reason, no step-up below M4); `admin_grant_credits` skips `admin_require` | Q31 |
| S4 | P2 | maintenance enforcement ignores audience (an "organizers" M3 window freezes everyone); **`tests/release/maintenance.spec.ts` inserts a live M2 resale window that takes resale offline for all users for up to 120 s on the shared DB — do not run it until fixed** | Q31 |
| S5 | P3 | every platform admin can list all `platform_admins`; `admin_set_partner_status` audits non-existent ids | Q31 |

Other: admin overview "Partner Activity" (Eventbrite/Slack/Zoom/Salesforce "Healthy") is seeded presentation — connectors don't exist (Q30/Q38). Live maintenance banner → recovery browser run needs a staging DB (not run on production).

## Q31 remainder (lane D, 2026-10-29)

Migrations 202610294023–4028 (+4029 Q41). Specs: `tests/admin/q31-support-ops.spec.ts` 6/6, `w08-admin-tiers` 17/17. Captures `artifacts/visual/w08/q31-*.png` (23; 0 overflow, 0 error pages; `q31-report.json`).

| Area | Route | Design | Verdict |
|---|---|---|---|
| Evidence review (Q08) | /admin/trust/verification | none (AD-012 language) | reference-blocked, built |
| Risk signals / holds / appeals / ticket flags (Q33, Q22) | /admin/trust/risk | none (AD-012) | reference-blocked, built |
| Trust tabs gain Evidence review, Risk signals | /admin/trust | AD-012 | matched (tab row only) |
| Support header gains Macros and SLAs | /admin/support | AD-013 | minor deviation (one header button) |
| Case actions, macro picker, first-response SLA, history | /admin/support/[id] | AD-014 | matched (inside existing panels) |
| Macros and SLA policies | /admin/support/macros | none | reference-blocked, built |
| Legal holds, retention preview, fixture purge (dry run only) | /admin/support/privacy | none | reference-blocked, built |
| Service contracts, uptime snapshots, agent kill switch | /admin/health | none | built |
| Jobs / dead letters / outbox | /admin/health/jobs | none | built |
| Status by audience + banner/page preview | /admin/maintenance | none | built (never activated) |

Findings closed: Q08 admin review UI built; `trust_review_document` now Trust-only; MFA added on admin paths (`ticket_risk_review` + reason, `set_directory_featured`, admin branches of `cancel_event_with_refunds`, `decide_cancellation`, `agent_control_run`, `start_agent_run`). Data drift: support queue dominated by test-fixture "Card dispute fraudulent" cases (SLA 1234d) — purge.

## W08 close-out (lane D, 2026-10-29)
Captures `artifacts/visual/w08/d4/<WxH>/` (23 routes × 5 viewports), `d4/sbs/` (17 side-by-sides), `after/`. **Census:** 115 captures, 6,175 controls, 0 failed loads, 0 dead, 0 unnamed, 0 overflow; console errors 0 after F12 (before it, `ad-005` intermittently hit a statement timeout at 1280 and 768).

| # | File | Change |
|---|---|---|
| F5–F8 | (pass 1) | Verified present in code |
| F9 | `admin/(console)/page.tsx`, `admin-a-overview.css` | "Partner Activity" showed seeded connector "health" (Eventbrite/Slack/Zoom/Salesforce — no connectors exist). Now lists the real partner programme (Partners permission; name, kind, referrals, earned, status; links to the partner) |
| F10 | new `admin/(console)/commerce/reconciliation/page.tsx`, `admin-reconciliation.css`; Commerce header button | Read-only direct-charge reconciliation over `reconciliation_runs` / `reconciliation_items` (commerce RLS): KPIs, stale/never-run warning, run list, variances by severity with key-by-key difference, labels for all `reconcile-core` codes, link to job history. 0 runs today (Stripe not configured), shown honestly |
| F11 | admin CSS (W14 tokens) | `.adb-head h1` uses `--k-title-admin` (30); 34 admin card/sub-headings moved to `--k-title-card` / `--k-title-sub` |
| F12 | `admin/(console)/workspaces/[id]/page.tsx` | Tickets list used an embedded `events!inner` filter that scanned all tickets (statement timeout) → filters by the workspace's event ids |

**Fidelity (1536):** AD-001…AD-018 matched (AD-014 now captured on SUP-4421). Logged differences: data volume far below the mocks (487 users vs 48k); Commerce header gained "Reconciliation"; Overview "Partner Activity" now shows partners; `/admin/agent-integrations` integrations health is still seeded presentation (Q30/Q38).

**Tests:** `w08-admin-tiers` + `q31-support-ops` + `test-fixture-purge` 27/27 under the aal2/MFA change (3034) — none needed fixing; `w08-admin-tiers` re-passed after the browser block (in 23/23).
