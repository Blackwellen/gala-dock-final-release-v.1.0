# Gala Dock — Release verdict (W15 + Q45)

**Status: DRAFT — verdict pending.** Prepared 2026-10-29 by lane C from the evidence that exists now. Sections marked **⟦PENDING: …⟧** wait for lanes still running (A: W12/W13 provider/affiliate/portal/admin; D: W03/W08 captures and W13 organiser; B: final customer re-measure) and for the owner's close-out steps (`docs/release/CLOSE_OUT_RUNBOOK.md`).
**Branch:** `release/enterprise-queue-2026-10-29` (checkpoint commit `5d81a06`; later work uncommitted). **Sources:** `docs/release/backend-queue.md` (queue), `docs/release-audit/galadock/**` (W reports), `docs/release/{governance,q44-journeys,q45-security,q45-performance}.md`, `docs/operations/*`.
**Vocabulary:** READY / CONDITIONALLY_READY / NOT_READY (backend §Q45, Annex U §48). Nothing is READY while a release blocker (backend §29) is open.

---

## 1. Executive summary (plain English)

Gala Dock is an events marketplace and operating system. Customers plan events and buy tickets. Organisers run events. Venues and suppliers sell their services. Partners and promoters earn commission, and platform staff run the service.

**What has been achieved in this programme (28–29 Oct 2026):**
- **Every backend domain in the build contract is built and tested.** 46 packets (Q00–Q45): 34 are VERIFIED (tests run green, evidence linked), 9 are DONE (built and tested, with an external dependency or browser check outstanding), and 2 are in progress (cross-workspace journeys and this sign-off).
- **Payments moved to the regulated-safe model.** Sellers are now paid by Stripe Connect "direct charges" on their own account, so Gala Dock no longer holds customers' money for tickets, deposits or invoices. Gala Dock takes an application fee. This was the main architectural risk found at baseline (`baseline/FINDINGS.md` §1 #1–#3).
- **Security sweeps are clean:**
- All 428 database tables have row-level security; outsiders can write to none of them.
- All 684 functions a signed-in user can call were probed as an outsider; none is left unreviewed.
- Two serious (P1) defects found during sign-off were fixed: stored SVG script injection, and admin access without MFA.
- The tenant-isolation suite passes 12/12.
- **Tickets cannot be oversold and venues cannot be double-booked under concurrent load.** 24 buyers competing for 3 tickets get exactly 3. Concurrent scans of one ticket admit it once.
- **Backups restore.** A scratch restore of 321 tables and 52,584 rows passed with 0 constraint failures, in 121 s.
- **Workspace audits:** venue, solo supplier, agency, affiliate, portals, auth and the event-type matrix are complete. Customer, public, organiser and admin are in their final design and control passes.

**What stands between here and launch:**
1. **Owner close-out steps**, mostly configuration: switch the bot check (captcha) back on, raise the password policy, enforce the content security policy, deploy, start the monitoring probes, and finish the Stripe test onboarding.
2. **External services not yet connected:** malware scanning (ClamAV), error tracking, uptime monitoring, push notifications, weather, video provider, wallet passes.
3. **Legal sign-off.** The FCA payment-perimeter review of the direct-charge flow, plus the wording of terms, privacy, retention, resale and cookie copy. Seller money already held from the old model needs a settle-or-refund decision.
4. **Design sign-off** against the owner's standard: premium, consistent, one display scale, no component zoom. Small differences are logged.

**Verdict:** ⟦PENDING — see §13. Provisional reading on current evidence, not a verdict: CONDITIONALLY_READY is achievable for a launch where paid checkout stays off or in test mode until the FCA review and seller onboarding are complete. NOT_READY for live money until then.⟧

---

## 2. Scope delivered, per workspace

| Workspace | Delivered (evidence) | Open at sign-off |
|---|---|---|
| **Public marketing & marketplace** (W01) | Landing §1–§5 and §7 rebuilt to the designs; event, venue, service, organiser and London pages on the shared PUB template; directory pages; SEO, robots and sitemap; cookie banner + `/api/consent`; consent merge; seller-readiness ticket card (`public/W01_REPORT.md`) | Premium review of landing §4/§5; `/pricing` page; data gaps; legal review of cookie copy |
| **Customer** (W02, owner priority) | Plan wizard (6 steps), build canvas, booking request, ticket setup, money, account, reviews, tickets, events, messages; all 17 phone PWA structures; P1 plan-wizard regression fixed; census 1,030 controls (`customer/W02_REPORT.md`); 77/92 state-changing controls asserted (`W13_REPORT_partB.md`); W12 matrix 826 loads (`W12_REPORT_partB.md`) | ⟦PENDING lane B final re-measure⟧; residuals in OPEN_ITEMS |
| **Organiser** (W03) | Pass 1: 37 routes, 1,856 controls, 12 fixes. Backlog UI built for Q14, Q17, Q18, Q20, Q22–Q26, Q29, Q40, Q42 and the W11 status menu; migrations 4035–4043; regression 202/202 (`organizer/W03_REPORT.md`, queue W03) | ⟦PENDING lane D captures + W13 organiser control run⟧ |
| **Venue operator** (W04) | 26 routes × 6 viewports, census 0 dead/unnamed/overflow/console; ORG-013 map editor, structure editor, loading bays, menus, BEO, provider plans (`provider/W04_REPORT.md`) | ORG-013 2D/3D, venue-approval request (no backend), element-details panel, phone bottom bar |
| **Solo supplier** (W05) | Mia Rossi Photography identity, 13 routes × 6, diff 5.8–14.3% (data), self-serve plans (`provider/W05_REPORT.md`) | — (data drift only) |
| **Agency supplier** (W06) | Northern Crew Agency captured as owner + staff; role gating confirmed; W06 spec 9/9 after Q12 (`provider/W06_REPORT.md`) | Product backlog items (OPEN_ITEMS P3) |
| **Affiliate / promoter / partner** (W07) | PART-001 6.4%, PROM-001 6.8% matched; link builder; conservation test 19/19 after Q27 (`affiliate/W07_REPORT.md`) | Partner application/KYC flow; promoter↔organiser messaging (deviation: "Share campaign") |
| **Platform admin** (W08) | 31 pages render; S1–S5 security fixed (Q31); Q08/Q33 review UIs; health, jobs, maintenance preview; reconciliation page (`admin/W08_REPORT.md`) | ⟦PENDING lane D captures; lane A W12/W13 admin part⟧ |
| **External portals** (W09) | 7 token portals audited; pay-link P1 fixed (2009) (`portals/W09_REPORT.md`) | Q16 plaintext tokens dropped after a show-once UI |
| **Auth, onboarding, billing, switching** (W10) | AUTH-001…008, return paths, MFA, invites via audited commands, billing (test), X17 switching with no data bleed (`auth/W10_REPORT.md`) | Captcha restore (T1/T2); legacy invite grants |
| **Event-type matrix** (W11) | 11 types; public children's-party hole closed (2012); backend a–d (3024–3027) (`W11_REPORT.md`) | UI confirmation of gaps 1–7 |

---

## 3. Packet table — final status and evidence

Status = header of each packet in `backend-queue.md` as of 2026-10-29. Spec counts are the latest reported.

| Packet | Status | Evidence |
|---|---|---|
| Q00 Baseline | DONE | `docs/release-audit/galadock/baseline/` (258 routes, 177 tables, 351 actions) |
| Q01 Tenant/auth/security | VERIFIED | tenant-security 12/12; `docs/security/rls-matrix.md`; workspace-invites 5/5 |
| Q02 Master data | VERIFIED | master-data 7/7 |
| Q03 Workflow/queue | VERIFIED | workflow-foundation 8/8; `docs/architecture/domain-events.md`, `state-machines.md` |
| Q04 Files/R2/malware | DONE · ClamAV BLOCKED_EXTERNAL | files-security 11/11; `docs/integrations/files-storage.md` |
| Q05 Communications | DONE · Gmail/IMAP/SMTP BLOCKED_EXTERNAL | communications 8/8; `docs/architecture/messaging.md` |
| Q06 Search | DONE | search 6/6; `docs/architecture/search.md` |
| Q07 Payments/ledger | DONE (not VERIFIED until Stripe test-mode run) · FCA BLOCKED_LEGAL | direct-charges 32/32, connect-webhook 7/7, pay-link 3/3; `docs/payments/ledger.md`, `reconciliation.md` |
| Q08 Trust/verification | VERIFIED (backend/API) | trust-verification 11/11; `docs/marketplace/trust-verification.md` |
| Q09 Listings/ranking | VERIFIED | marketplace-ranking 9/9; `docs/marketplace/ranking-matching.md` |
| Q10 Request/quote/booking | VERIFIED | race 9/9, booking-integrity 8/8, order-orchestration 4/4; `docs/marketplace/booking-engine.md` |
| Q11 Venue management | VERIFIED | Q11 test (`blocked_conflict`) in w04-w05-race |
| Q12 Supplier management | VERIFIED | supplier-management 4/4, w06-agency 9/9 |
| Q13 Hospitality | VERIFIED | hospitality 9/9, venue-fnb 7/7; `docs/marketplace/hospitality.md` |
| Q14 Event core | VERIFIED | event-core 13/13, event-type-rules 10/10; `docs/architecture/event-core.md` |
| Q15 Customer builder | VERIFIED | customer-build-engine 9/9, build-items-payment-guard 5/5; `docs/marketplace/customer-builder.md` |
| Q16 CRM/contracts | VERIFIED · e-signature BLOCKED_EXTERNAL | q16-crm-contracts 7/7, q16-share-links 5/5; `docs/organizer/crm-contracts.md` |
| Q17 Team/live ops | VERIFIED | q17 11/11; `docs/organizer/team-operations.md` |
| Q18 Guests/check-in | VERIFIED | guests-access 6/6; `docs/ticketing/guests-access.md` |
| Q19 Map engine | VERIFIED (backend) | map-engine 7/7; `docs/maps/map-engine.md` |
| Q20 Ticket inventory/checkout | VERIFIED | 10/10, load 32/32 ×2, regression 98/98; `docs/ticketing/inventory.md` |
| Q21 Credentials/scanner | VERIFIED · wallet BLOCKED_EXTERNAL | ticket-credentials 5/5; `docs/ticketing/credentials-scanner.md` |
| Q22 Resale/launch/fraud | VERIFIED · GB v1 BLOCKED_LEGAL · customer Connect resale owner decision | resale-original-refunds 15/15, Q22 6/6 |
| Q23 Promotion/ads/media | VERIFIED (backend) · SMS BLOCKED_EXTERNAL | ad-inventory 7/7, promotion-media 9/9; `docs/marketplace/advertising.md`, `docs/marketing/promotion-media.md` |
| Q24 Sponsors/talent | VERIFIED (code/test) | 7/7; `docs/organizer/sponsors-talent.md` |
| Q25 Logistics | VERIFIED (code/test) | 5/5; `docs/organizer/logistics.md` |
| Q26 Licensing/safety | VERIFIED (code/test) · weather BLOCKED_EXTERNAL · rule pack legal | q26 8/8; `docs/compliance/licensing-safety.md` |
| Q27 Promoters/affiliates | VERIFIED | w07 19/19; `docs/payments/affiliates-promoters.md` |
| Q28 Subscriptions/FinOps | DONE (test mode) · Stripe Tax BLOCKED_EXTERNAL | ai-profitability 7/7, subscription-billing 7/7; `docs/commercial/ai-profitability.md` |
| Q29 Virtual/hybrid | VERIFIED · providers BLOCKED_EXTERNAL | q29 11/11; `docs/architecture/virtual-events.md` |
| Q30 API/MCP/webhooks | VERIFIED | q30 10/10, developer 3/3, calendar-sync 3/3; `docs/integrations/api-webhooks.md` |
| Q31 Admin/support/health | VERIFIED | q31-support-ops 6/6, w08-admin-tiers 17/17 (27/27 after 3034); `docs/admin/support-operations.md`, `docs/security/admin-access.md` |
| Q32 Privacy/retention | VERIFIED · periods/DSAR wording BLOCKED_LEGAL | privacy-retention 5/5, test-fixture-purge 3/3; `docs/security/privacy-retention.md` |
| Q33 Fraud/abuse | VERIFIED | fraud-abuse 5/5; `docs/security/fraud-abuse.md` |
| Q34 Observability/SRE | VERIFIED · Sentry/Uptime/probe cron/PITR BLOCKED | restore drill PASSED; observability 10/10; `docs/operations/{observability,backup-restore,runbooks}.md` |
| Q35 Analytics | VERIFIED | analytics-warehouse 8/8; `docs/analytics/metrics.md` |
| Q36 Experimentation | VERIFIED | experiments 5/5; `docs/platform/experiments.md` |
| Q37 PWA/offline | DONE (backend) · VAPID BLOCKED_EXTERNAL · browser re-check BLOCKED | pwa-offline-device 5/5; `docs/pwa/offline-device.md` |
| Q38 Demo seeding | DONE · paid orders wait on Q07 onboarding | demo-seed 9/9, demo-seed-organiser 16/16; `docs/demo/seed-catalogue.md` |
| Q39 Release governance | VERIFIED | release:check exit 0; migration-governance 7/7 (governance.md says 5/5, see §14); `docs/release/governance.md`; `artifacts/release/` |
| Q40 Advanced composition | VERIFIED (backend) | q40 7/7, merch-direct-charges 13/13; `docs/architecture/event-composition.md` |
| Q41 Agent runtime | VERIFIED (governance scope) | agent-governance 10/10 (FakeModel, incl. injection scenarios); `docs/agent/runtime-governance.md` |
| Q42 Organizer Agent | VERIFIED | agent-organizer-provider 11/11; `docs/agent/organizer-agent.md` |
| Q43 Provider Agent | VERIFIED | `docs/agent/provider-agent.md` |
| Q44 Cross-workspace E2E | IN_PROGRESS — API 14/14 | `docs/release/q44-journeys.md`; ⟦PENDING browser journeys, lanes A/B/D⟧ |
| Q45 Security/perf sign-off | IN_PROGRESS — evidence done | `docs/release/q45-security.md`, `q45-performance.md`; ⟦PENDING close-out⟧ |
| W00 Design manifest | DONE | `DESIGN_REFERENCE_MANIFEST.md` (242 images) |
| W01 Public | PARTIAL | `public/W01_REPORT.md` |
| W02 Customer | PARTIAL | `customer/W02_REPORT.md`; `artifacts/visual/w02/` |
| W03 Organiser | IN_PROGRESS (built, captures pending) | `organizer/W03_REPORT.md` |
| W04 Venue operator | DONE | `provider/W04_REPORT.md` |
| W05 Solo supplier | DONE | `provider/W05_REPORT.md` |
| W06 Agency | DONE | `provider/W06_REPORT.md` |
| W07 Affiliate | DONE | `affiliate/W07_REPORT.md` |
| W08 Admin | IN_PROGRESS | `admin/W08_REPORT.md` |
| W09 Portals | DONE | `portals/W09_REPORT.md` |
| W10 Auth/onboarding | DONE | `auth/W10_REPORT.md` |
| W11 Event types | DONE with gaps | `W11_REPORT.md` |
| W12 Responsive/zoom | IN_PROGRESS — part B done | `W12_REPORT_partB.md`; ⟦PENDING part A (lane A), organiser (lane D)⟧ |
| W13 Every control | IN_PROGRESS — part B 77/92 asserted | `W13_REPORT_partB.md`; ⟦PENDING parts A and D⟧ |
| W14 Design overlays | TODO | standard: queue W14 (owner 2026-10-29); ⟦PENDING close-out step 1⟧ |
| W15 Release docs/verdict | IN_PROGRESS (this draft) | this file; `CLOSE_OUT_RUNBOOK.md`; `OPEN_ITEMS.md` |
| D01 Owner-decision UI pass | DONE | specs plan 1/1, ticket-pro 2/2, proposals 2/2; `artifacts/visual/d01/` |

**GD-20 artifact status:**
- Present:
- `DESIGN_REFERENCE_MANIFEST.md`
- per-workspace reports
- `baseline/` (route/table/surface inventories)
- `docs/security/rls-matrix.md` (serves as DATABASE_RLS_MATRIX)
- `docs/integrations/api-webhooks.md` (API/webhook contracts)
- `docs/release/q44-journeys.md` (CROSS_WORKSPACE_E2E_RESULTS, API part)
- `W11_REPORT.md` (EVENT_TYPE_MATRIX)
- `W12_REPORT_partB.md` (responsive, part B)
- `docs/release/q45-security.md` (SECURITY_TEST_RESULTS)
- `docs/operations/*` (operations, incident and restore runbooks)
- `docs/release/governance.md` (migration governance)
- Missing:
- README
- WORKSPACE_MASTER_MATRIX
- ROUTE_COMPONENT_ACTION_REGISTER.csv and WORKSPACE_ACTION_TO_BACKEND_TRACE.csv
- DESIGN_OVERLAY_FINDINGS
- BACKEND_GAP_REGISTER (OPEN_ITEMS.md partly covers it)
- WEBHOOK_IDEMPOTENCY_LEDGER, INTEGRATION_HEALTH_REGISTER
- A11Y_RESULTS, AGENT_EVAL_RESULTS
- DEFECT_REGISTER
- SCHEMA_AND_MIGRATION_CHANGELOG
- a CI workflow
- `EXECUTION_CHECKPOINT.md` is stale (2026-10-26).

⟦PENDING: owner decides whether the missing GD-20 files are required for this release or consolidated into this verdict, Annex U §43 "consolidate overlapping reports".⟧

---

## 4. Exit-gate matrix (GD-20 gates a–g)

PASS / FAIL / BLOCKED / N/A; **PENDING** = evidence still running (lane named).

| Workspace | (a) Design | (b) Controls | (c) Backend integrity | (d) Permissions | (e) Journeys | (f) Responsive / a11y | (g) Ops / security |
|---|---|---|---|---|---|---|---|
| Public | PENDING (W01 PARTIAL; §4/§5 premium review) | PASS (w13-public-controls 4/4) | PASS (Q06/Q09/Q23) | PASS (Q45 RLS anon probes) | BLOCKED for paid tickets (Stripe onboarding); others PASS | PASS part B (826 loads; fixes need re-measure) · a11y PENDING | Conditional (§5) |
| Customer | PENDING (lane B re-measure; owner standard) | PENDING (77/92 asserted, 8 written, 7 excluded) | PASS (Q14/Q15/Q20–Q22) · payments BLOCKED (Q07 run) | PASS (tenant-security 12/12) | API PASS (Q44 J1–J3); browser PENDING; checkout/resale BLOCKED | PASS part B · a11y PENDING | Conditional |
| Organiser | PENDING (lane D captures) | PENDING (533 state-changing not run in pass 1) | PASS (Q14, Q16–Q20, Q24–Q26, Q40) | PASS | API PASS (J2–J5); browser PENDING | PENDING (lane D) | Conditional |
| Venue operator | PASS candidate (6–13% mean diff; ORG-013 20% with reason) — owner sign-off | PASS (census 0 dead, 26 × 6) · state-changing via specs | PASS (Q10/Q11/Q13/Q19, race 9/9) | PASS | API PASS (J1); browser PENDING | PENDING (W12 lane A) | Conditional |
| Solo supplier | PASS candidate (5.8–14.3%, data) | PASS (census clean) | PASS (Q12) | PASS | API PASS (J1); browser PENDING | PENDING (lane A) | Conditional |
| Agency | PASS candidate (6.1/6.5%) | PASS (census clean) | PASS (w06 9/9) | PASS (F13/F16 confirmed as staff) | PENDING | PENDING (lane A) | Conditional |
| Affiliate/promoter | PASS candidate (6.4/6.8%) | PASS (census clean) | PASS (w07 19/19) | PASS | API PASS (J2 promoter) | PENDING (lane A) | Conditional |
| Admin | PENDING (lane D captures) | PENDING (99 form controls via spec only) | PASS (Q31) | PASS (w08 17/17; MFA aal2, 3034) | PENDING | PENDING (lane A) | Conditional |
| Portals | PASS (PORT-001; branded LinkUnavailable) | PASS (25 pages, 0 dead) | PASS (pay-link 3/3) | PASS (uniform 404, hashed tokens) | PASS (W09) | PASS at 390 px; full matrix PENDING (lane A) | PASS (no-store, noindex, no-referrer) |
| Auth/onboarding | PASS (AUTH-001…008) | PASS | PASS | PASS | PASS (W10) | PENDING `/forgot-password` re-measure | **BLOCKED until T1/T2 restored** |

**Q45 suite list (backend §Q45):**
- RLS penetration: PASS (428 tables).
- IDOR: PASS (684 functions).
- Agent injection: PASS (agent-governance, FakeModel scenarios).
- API scope: PASS (q30 10/10).
- Webhook replay/spoof: PASS (connect-webhook 7/7; chaos payment drill).
- Payment replay/reconciliation: PASS in fake-Stripe specs. Live test mode BLOCKED (step 11).
- Ticket race/oversell: PASS (18/18 concurrency).
- Provider double-book: PASS (race 9/9).
- Upload/malware: PASS for refusal logic. Scanning BLOCKED_EXTERNAL (ClamAV).
- Browser matrix, responsive matrix: PENDING (W12).
- Keyboard/screen-reader/WCAG: PENDING. `tests/phase1/accessibility/a11y.spec.ts` exists; no run is reported in this queue.
- PWA install/offline: backend PASS; browser re-check BLOCKED (Q37).
- Load tests: PASS for concurrency only. No production load test (q45-performance).
- Restore drill: PASS.
- Chaos drills: PASS (observability.md).

---

## 5. Security summary

Source: `docs/release/q45-security.md`. Every probe ran against the live project; every write was rolled back.
- **Definer authorisation:** 1,232 public definer functions, all with a pinned search_path. 684 authenticated-callable functions were called as an outsider: 502 refused, 5 uniform 404, 39 input rejected, 103 empty, 28 data (reviewed), 7 own-row writes, **0 unreviewed**.
- **RLS:** 428/428 tables RLS on; 0 updatable/deletable by outsider or anon; leak check on hidden subsets 0 rows.
- **Defects fixed in sign-off:**
- Q45-S01 P1 stored SVG XSS: DB guard (3033) plus client sanitiser (`src/lib/security/svg-sanitize.ts`, 37 vectors inert). Also fixed: badge-print style break-out.
- Q45-S02 P1 admin MFA bypass on aal1: 57/138 admin RPCs answered on aal1 before the fix (3034). **Admins must now have MFA.**
- Earlier in this run: entitlement self-grant (critical, Q01); 111 tables fully granted to anon → 0 anon writes (Q01); payment bypass on build items (Q15); admin email-body read (W08 S1); crew/shift write RLS (W06); stored double-booking paths (Q10/Q12); children's-party public publish (W11); pay-link 404s (W09).
- **Headers:**
- Set: HSTS preload, nosniff, frame-ancestors none, COOP, and a Permissions-Policy extended in H-01.
- Nonce CSP (H-02) is **implemented in Report-Only**. Enforcement waits for close-out step 2 (`CSP_ENFORCE=1`).
- **Secrets:** tracked files plus 145 commits scanned; served JS (36 chunks) has 0 hits. `NEXT_PUBLIC_*` = Supabase URL, anon key, Turnstile site key.
- **Dependencies:** npm audit 0 after next 16.4.3 / zod 4.6.7. **Production still runs 16.4.0 until deploy (step 9).** 479 packages, 0 denied licences, 14 LGPL (sharp/libvips) for review.
- **Rate limits:** PASS. **Captcha OFF on production (T1)** until step 3.
- **Auth:** session revocation, step-up and admin MFA PASS. Owner: Supabase `password_min_length` is 6 → raise to ≥8 with character classes, plus HIBP (step 4).
- **Open P3:** `catering_price` / `venue_quote` price draft menus/spaces by id (numbers only, S04). SSR public pages rely on Vercel/CDN rate limiting. ⟦PENDING: Report-Only CSP clean run result; post-captcha login refusal check⟧

## 6. Performance summary

Source: `docs/release/q45-performance.md`. Local dev against the live DB; **no production load test**.
- **DB hot paths (p95):**
- marketplace_search 34.3 ms
- calendar_events 20.2 → 4.0–6.8 ms after 3037
- event_readiness 16.1 ms
- scan_ticket 6.0 ms
- hold_tickets 2.4 ms
- checkout_quote 2.0 ms
- **Index fix:** tickets(order_ref) 67 → 0.05 ms (3035).
- **Concurrency:** 18/18 (Q20 24-buyer races, 12-buyer promoter rush, duplicate scans).
- **Connections:** max 60, about 24 in use. The app goes only through the PostgREST pool. A "job startup timeout" burst was seen 2026-10-29 04:39 (observability.md).
- **HTTP (dev mode, inflated):** `/` p50 728 ms; `/api/health` p50 168 ms.
- **Bundles:** /checkout for general admission 11.22 → 6.38 MB dev chunks. **Seated checkouts still 11.24 MB** (lazy Lucide is a design-lane decision). Production sizes BLOCKED (no `next build` / CI).
- ⟦PENDING: production p50/p95 from Q34 synthetic probes after deploy (step 10)⟧

## 7. Data and migrations

- **Database:** a single shared Supabase project serves live (eu-west-2). **There is no staging database** (owner). Owner decision 2026-10-28: apply to live, additive and backward-compatible only, with a dry run first.
- **Migration files on disk** (directory listing 2026-10-29): 277 in `supabase/migrations`.
- 144 numbered 20261029 this run: lane A 1001–1051 (51); lane B 2001–2014 (14); lane C 3001–3037 (37); lane D 4001–4043 (42; 4037 unused).
- 31 numbered 20261028.
- 2 generated seeds (`209912310001_state_seed`, `209912310002_agent_tools_seed`).
- Pending SQL to run after deploy: `supabase/pending/q04_public_buckets_server_only.sql`.
- **Parity (last reported):**
- Lane D log: 272/272.
- governance.md: 270/270 recorded, 38/38 machines, 73/73 permissions, trigger grants 0, drift 0, 0026–0038 back-recorded.
- Files 3033–3037 and 4041–4043 post-date those figures. ⟦PENDING fresh `npm run db:parity` in step 6⟧
- **Tooling:** one tool, `scripts/db/migrate.mjs`, covers lint → dry-run with exercise → review into `supabase/migration-manifest.json` (sha256) → apply/verify. Lane rule: dry runs must exercise a client-role write when a trigger used by client writes is touched.
- **Rollback (governance.md):**
- Roll forward.
- Revoke execute, or disable the job or flag.
- Re-apply the previous function body.
- `cron.unschedule`.
- Never roll back ledger postings; compensate with balanced postings.
- A bad deploy is reverted by promoting the previous Vercel deployment (RTO 10 min).
- **Backups:** 18 nightly R2 runs (10-12 → 10-29) complete. Restore drill passed: 321 tables, 52,584/52,584 rows, 0 failures, 121 s. PITR off (owner, 2026-10-12): RPO ≤ 24 h. Known: `scripts/db-backup-restore.mjs --target` mishandles jsonb JSON-null vs SQL NULL (4 `plan_entitlements` rows).
- **Live data effects recorded:**
- Q08 Verified listings 33 → 0 (badges now computed); the seed then restored all 37 demo listings as Verified. Verified workspaces 11 → 27.
- 26 open requests re-stated.
- 3 stale fixture events completed.
- 27 clients backfilled.
- 8 live organiser events show compliance blockers.
- 0 tickets needed repair (4030).
- 6 Q16 fixture workspaces and 10 test identities purged.
- **Live incidents this run:**
- 3009 broke `accept_proposal` for about 10 min (fixed by 3010).
- 4031 made client writes on 9 tables fail for about 1–2 h (fixed by 2013/2014).
- The Vercel production deployment was paused from at least 03:00 to 10:16 UTC; workers returned 503 (resumed on owner instruction).
- Dev-only: `/api/csp-report` returned 500 for about 5 min.
- **Deploy-order effects:** migrations are live but the code is not deployed:
- Q18 dietary shows blank until deploy.
- `/api/cron/jobs` 404s.
- Q07 reconcile jobs queue.
- Post-deploy tasks: remove the legacy maintenance fallback; revoke `workspace_invites` grants.

## 8. Known limitations and approved deviations (owner decisions)

1. **No AI in the customer workspace.** Non-AI helpers replace the Gala Agent panels (C09). AI is Azure OpenAI only, through `llm.ts`; `@anthropic-ai/sdk` removed.
2. **Display scale fits the 1536 design width** (`density.css`). No per-component zoom; nav right-aligned.
3. **Design sign-off standard (2026-10-29):** premium + consistent + one display scale; the ≤5% region gate is dropped and small differences are logged.
4. **Flows match the designs:** Plan wizard 6 steps (order kept by coordinator; designs #65/#67 disagree); ticket setup 5; proposals 5; RFQ 4; organizer Events default Cards.
5. **Logo:** "G" mark + purple "Gala·Dock" wordmark everywhere; landing sparkle mark logged as a deviation.
6. **`event_payment_readiness` is public** (allowlisted).
7. **Finance:**
 - Packs £25 / £89 / £219 (margins 77.7 / 75.8 / 75.6%).
 - Azure list prices with padding.
 - Unmetered-run flag scoped to after meter go-live.
 - VAT via Stripe Tax automatic tax (test mode).
 - Starter keeps agent R0–R2; R3/R4 are Pro and above.
8. **Trust policy:** `missing_blocks_acceptance` OFF (decided default; expired or low-cover evidence still blocks); public liability minimum £1m is data, to be confirmed.
9. **Ranking reasons/scores never shown** to customers or public.
10. **W11 event-type rules (coordinator, delegated):** ticketing default_on / optional_off / private_only; children's parties never public; service-role writes need an audited override (3032).
11. **Test fixtures:** ledger-bearing fixtures are hidden (visibility private), not purged; the eligible ones are purged after an owner-reviewed dry run.
12. **W02 approved deviations:** FCA no-card at booking submission; Q22 buy-back resale; ticket QR/Ticket/Barcode switch; guest-breakdown row.
13. **Shell:** centred search with actions right (organiser/provider/admin); Media Studio nav item; extra settings tabs.
14. **Public pages:** no Gala Agent section on landing §6; promoter "Message organizer" replaced by "Share campaign".
15. **ORG-013:** schematic plan instead of aerial; 2D/3D toggle and venue-approval request not built (no backend).
16. **Platform/infra:** no staging; PITR off; no CI provider (commands are CI-ready); real-time media is not self-hosted.

## 9. BLOCKED_EXTERNAL — with owner steps

| # | Item | Owner step |
|---|---|---|
| X1 | Stripe test onboarding (7 sellers + QA seller stuck on `tos_acceptance`) | Complete Alex Events + QA seller links in a normal browser (queue table), regenerate with `scripts/seed-q38-demo.mjs --steps=sellers --links`, re-run the seed, then the Q07 test-mode run |
| X2 | Stripe live: seller accounts, live keys, webhooks | Live keys in Vercel. Connect endpoint subscribed to `payment_intent.*`, `charge.*`, `charge.dispute.*`, `payout.*`, `account.updated`, `capability.updated`, `account.external_account.*`; platform endpoint `application_fee.*`, `customer.subscription.*`, `invoice.*`; dashboard dunning. Fix the sandbox Connect endpoint (points at www, missing `payment_intent.*`, `charge.*`, `checkout.session.*`) |
| X3 | Stripe Tax | Head office + GB registration (test, then live) → `BILLING_AUTOMATIC_TAX=on` |
| X4 | ClamAV gateway (blackwellen-operations) | Deploy; set `CLAMAV_SCAN_URL`/`CLAMAV_SCAN_TOKEN`; run `scripts/files/rescan-quarantined.mjs` (10 stored PDFs return 423 until scanned) |
| X5 | Error tracking | `SENTRY_DSN` (GlitchTip/Sentry) + `SENTRY_ENVIRONMENT`/`RELEASE` |
| X6 | Uptime Kuma | Monitor `/api/health` (public every minute; bearer every 5 min); status page `status.ops.galadock.com/status/galadock` |
| X7 | Synthetic probes | After deploy: `cron.schedule('synthetic-probes', …)`, `SYNTHETIC_PROBE_EMAIL`/`PASSWORD` |
| X8 | Push | VAPID keys |
| X9 | Weather | Provider key (Q26) |
| X10 | Virtual providers | Video provider keys (Q29) |
| X11 | Wallet passes | Apple/Google certificates (Q21) |
| X12 | E-signature | Provider (Q16); simple e-signature fallback in place |
| X13 | Email | Resend webhook + `RESEND_WEBHOOK_SECRET`; Gmail/IMAP/SMTP credentials if mailbox sync is wanted |
| X14 | SMS | Provider (Q23) |
| X15 | KMS / field encryption | Set `FIELD_ENCRYPTION_KEYS`; domain 267 KMS |
| X16 | CI / signed builds | CI provider with OIDC (Q39) |
| X17 | Neon video URL | Owner URL for `video_url` |
| X18 | Azure invoice | Record the October Azure invoice (profitability report flags `provider_invoice_missing`) |

## 10. Legal-review list

1. **FCA_PAYMENT_PERIMETER_SIGNOFF.** The direct-charge flow is `BLOCKED_LEGAL` until signed.
2. **LEGACY-FUNDS.** Seller money held on the platform balance from the old model: settle once, or refund and re-charge. Counts conflict, see §14 C1.
3. **TERMS-COPY.** `src/app/(legal)/terms/page.tsx:76,82` says "funds we hold". The refund fee policy (`src/lib/payments/rules.ts` `feePolicyFor`) needs review.
4. **Privacy page.** It lists Anthropic as a subprocessor (`src/app/(legal)/privacy/page.tsx:58`); AI is Azure-only.
5. **Resale.** GB v1 legal text (Q22); resale fee policy.
6. **Compliance.** GB rule pack (Q26).
7. **Retention and DSAR.** Retention periods and DSAR wording (Q32); then enable rules with `p_legal_reviewed`.
8. **Cookie banner.** Wording (W01, marked LEGAL REVIEW PENDING).
9. **VAT adviser questions** (`docs/operations/vat-decisions.md`: agent vs principal, tickets, VAT-inclusive consumer prices). That doc calls the matter "urgent" because fees are shown excluding VAT. Q28 later chose Stripe Tax; see §14 C13.

## 11. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Paid checkout unavailable at launch: seller accounts lack `card_payments` / ToS | High (current state) | High | Owner onboarding (X1/X2). Ticket card already hides Buy when the seller isn't ready; checkout refuses |
| R2 | FCA perimeter review rejects or changes the flow | Medium | High | Direct charges already remove platform custody; hold live money until signed |
| R3 | Migration breaks live (no staging); happened twice this run (3009, 4031) | Medium | High | `migrate.mjs` dry-run with exercises and client-role writes; trigger-grants check in `release:check`; forward-fix |
| R4 | Live schema ahead of the deployed code; long gap before deploy | Medium | Medium–High | Deploy promptly after regression (step 9); promote-previous rollback; additive migrations |
| R5 | Production sign-in/sign-up with no bot check (T1) | Medium | Medium | Step 3 |
| R6 | CSP enforcement blocks a script or page | Medium | Medium | Report-Only run first; unset `CSP_ENFORCE` to revert |
| R7 | Admins without MFA are locked out (3034 is live) | Medium | Medium | Confirm every platform admin has TOTP enrolled before deploy |
| R8 | Outage goes unnoticed: the Vercel pause ran at least 7 h with workers failing; no Sentry or uptime monitor | Medium | High | Steps 10 and 13; alert `workers.dispatch_failures` exists in-app |
| R9 | Malware scanning absent | High (current state) | Low–Medium (fails closed: PDFs/sensitive files quarantined) | X4 |
| R10 | Test-fixture pollution visible on live (public p1 events in Discover, about 309 auth users, support-queue fixtures) | High | Medium (credibility) | Step 8; `cleanup()` now hides public fixtures |
| R11 | Design residuals noticed by users or investors | High | Low–Medium | Step 1 sign-off; residuals logged |
| R12 | RPO up to 24 h (no PITR) | Low | High | Nightly R2 backups verified; revisit PITR at paid volume |
| R13 | No CI; release depends on a manual `release:check` | Medium | Medium | Commands are CI-ready; X16 |
| R14 | Untested at production load | Medium | Medium | Concurrency proven; probes and Vercel analytics after deploy |
| R15 | Legacy funds and terms copy mismatch the new money model | Medium | High (regulatory) | Legal items 2–3 |

## 12. Go / no-go criteria

**No-go if any of these is true** (backend §29 + GD-20):
- any P0 or release-blocking P1 open;
- a cross-tenant leak;
- payment duplication or ledger imbalance;
- ticket oversell;
- a stale credential accepted;
- a provider double booking;
- a broken Stripe webhook;
- a payout despite invalid Connect capability;
- an Agent bypassing approval;
- a quarantined file made public;
- unaudited admin access;
- broken onboarding or checkout;
- a migration without a recovery path;
- secrets exposed;
- `release:check` not green;
- tenant-security not 12/12;
- captcha not restored;
- the production deploy unhealthy (`/api/health`, worker dispatch).

**Go requires:**
1. Close-out steps 1–10 complete with expected results recorded.
2. Full regression green.
3. Q44 browser journeys and W12/W13 parts A and D reported with no open P0/P1.
4. Owner design sign-off (step 1).

**Live money additionally requires:** step 11 (Q07 test-mode run green), FCA sign-off, the legacy-funds decision executed, and the terms/refund copy approved.

## 13. Verdict

⟦PENDING — filled after the close-out runbook step 15.⟧

| Verdict | Exact conditions |
|---|---|
| **READY** | All Go criteria (§12), including the live-money conditions, plus: X4 ClamAV deployed; X5–X7 monitoring live; all legal items in §10 signed or explicitly accepted by the owner; no BLOCKED item that can invalidate a critical flow |
| **CONDITIONALLY_READY** | All Go criteria (§12) excluding the live-money conditions, with paid checkout gated (seller readiness = not ready, or test mode) until FCA sign-off and seller onboarding. The remaining BLOCKED_EXTERNAL items are non-critical (push, weather, video, wallet, e-signature, SMS, mailbox sync) and listed with owner steps |
| **NOT_READY** | Any no-go condition in §12; or live money enabled before FCA sign-off; or a critical gate in §4 FAIL |

Verdict: ⟦ ⟧ · Date: ⟦ ⟧ · Commit / deployment id: ⟦ ⟧ · Approved by (owner): ⟦ ⟧

## 14. Source conflicts (flagged, not resolved here)

| # | Conflict | Sources |
|---|---|---|
| C1 | Legacy funds: "12 `separate_transfer` deposits and 7 platform-charged ticket orders" vs "Legacy 17 separate_transfer + 15 platform ticket orders labelled" | queue Release blockers LEGACY-FUNDS vs queue Q07 Evidence |
| C2 | Connected accounts: "25 `acct_test_…` rows" vs "all 23 connected accounts have card_payments inactive" | queue STRIPE-CARD-PAYMENTS (same paragraph) |
| C3 | `docs/operations/runbook.md` (verified 11 Oct) says Stripe "separate charges and transfers"; Q07 moved to direct charges. `docs/release/RELEASE_READINESS_REPORT.md` (11 Oct) has an earlier verdict and is superseded | runbook.md §1 vs queue Q07 |
| C4 | Public fixtures: "50 PUBLIC events… only 12 flagged" vs "51 [workspaces] with 66 public events: 30 refused, 19 blocked, 2 eligible"; purge guards "0 of 118 eligible fixtures blocked" vs "2 now + 19 after lane D's guards" | queue Q38 Live hygiene vs Q32 Purge run / Purge guards vs Q45 owner decision |
| C5 | Verdict file path: `docs/release-audit/galadock/RELEASE_CANDIDATE_VERDICT.md` vs this file | queue Q45 "Gala Dock state" vs W15 brief |
| C6 | `EXECUTION_CHECKPOINT.md` (2026-10-26) still lists next 16.4.0, C: drive full and 202610280039 unapplied — all superseded | checkpoint vs queue Q39/Q28 |
| C7 | W02 report: exit gate "NOT MET" against ≤5%; the owner later dropped the ≤5% gate | W02 §1 vs queue W14 owner decision |
| C8 | Migration counts: governance 264 files / 270/270 recorded; lane D 272/272; 277 files on disk — **RESOLVED 2026-10-29: `db:parity` 277/277 recorded, 0 pending/drift, 38/38 machines, trigger-grants 0** | governance.md, queue log, directory listing |
| C9 | Q22: header "VERIFIED" vs progress-log "Q22 DONE" (earlier entry) | queue Q22 vs log 2026-10-29 |
| C10 | Q39 spec: "migration-governance 7/7" vs governance.md "5/5" | queue Q39 vs governance.md |
| C11 | governance.md "Supply chain" para still says audit 1 critical / 1 high; its remainder section and Q39 say 0 | governance.md sections |
| C12 | W03 pass-1 report: ticket setup 3 steps / Events default List; D01 later made them 5 / Cards | W03 vs D01 |
| C13 | VAT: vat-decisions.md "urgent… charged excluding VAT"; Q28 decided Stripe Tax automatic (test mode); adviser questions still open | vat-decisions.md vs queue FINANCE |
| C14 | Newsletter: W01 "no newsletter (no backend)" vs Q05 "newsletter double opt-in (PECR)" built | W01 Remaining 3 vs Q05 Evidence |
| C15 | Admin MFA: Q31 "MFA (aal2) required for every admin mutation" (2001–2002), yet Q45-S02 found 57/138 admin RPCs answering on aal1 (fixed 3034) — a regression or a coverage gap | queue Q31 vs q45-security §3 |
| C16 | Uptime Kuma status URL given in runbooks.md, while Q34 lists Uptime Kuma as BLOCKED | runbooks.md vs queue Q34 |
| C17 | Customer resale: the W02 approved deviations include "Q22 buy-back resale", while the queue still lists "customer Connect resale (decision)" as an open owner item | W02 §4 vs queue Lane plan "External or owner items" |
| C18 | W04 report: provider plans "Contact us to switch" (W10) vs self-serve plans built (W04 F26, W05) | W10 vs W04/W05 |
