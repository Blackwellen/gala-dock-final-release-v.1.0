# Gala Dock — Open items (deduplicated, 2026-10-29)

Every open item from `backend-queue.md` and `docs/release-audit/galadock/**` reports, with anything marked fixed later in the queue removed. "Confirm" means the source reported the work as built, but no closing evidence says so. Owners: Owner, Coordinator, Lane A/B/C/D, Legal.
Close-out steps live in `CLOSE_OUT_RUNBOOK.md` and are not repeated here, apart from cross-references.

## P1 — release-critical verification (no open P1 defect is recorded)

| # | Item | Source | Owner |
|---|---|---|---|
| E1 | Q07 Stripe test-mode run (Q07 not VERIFIED) | queue Q07, Q38 | Owner → Lane C (runbook step 11) |
| E2 | Q44 browser journeys per workspace (API 14/14 done) | queue Q44; `q44-journeys.md` | Lanes A/B/D |
| E3 | W13 control coverage remainder: customer 8 written awaiting browser + cancel resale; organiser 533 state-changing (pass 1); provider 144 / solo 31 state-changing; admin 99 form controls | `W13_REPORT_partB.md`; W03/W04/W05/W08 reports | Lanes B/D/A |
| E4 | W12 matrix for provider/affiliate/portal/admin (lane A) and organiser (lane D); 400% zoom; rotation with an open form | queue W12; `W12_REPORT_partB.md` "Not covered" | Lanes A/D |
| E5 | Keyboard/screen-reader/WCAG run (`tests/phase1/accessibility/a11y.spec.ts` exists, no run reported) | backend §Q45 list; `baseline/BASELINE_TESTS.md` | Lane B |
| E6 | PWA install/offline browser re-check (auth states expired) | queue Q37 | Lane B |
| E7 | Fresh parity/types after 3033–3037 and 4041–4043 | governance.md; directory listing | Lane C (steps 5–6) |
| E8 | W14 design-final overlays | queue W14 | Coordinator (step 1) |

## P2 — engineering

| # | Item | Source | Owner |
|---|---|---|---|
| P2-1 | Workflow catalogue parity: 22 in-flight event types (promotion.* 16, media.* 4, brand.kit_saved, api_key.*, webhook.secret_rotated) + `merch.paid_after_expiry` — confirm closed | queue Q03 Lane D note; Q39 Lane D note | Lanes A/C |
| P2-2 | `scripts/db-backup-restore.mjs --target` jsonb JSON-null vs SQL NULL (4 `plan_entitlements` rows) — fix before any real restore | queue Q39; `backup-restore.md` | Lane C / Owner deploy |
| P2-3 | Organiser cancellation commission is recorded but not collected; saved-card clone not wired; Q07 domains 123/125/126/131–135/258 partial | queue Q07 Evidence (PARTIAL) | Lane A |
| P2-4 | Reporting/analytics must exclude `is_demo_workspace()` (card 282) — confirm in Q35 | queue Q35 | Lane C |
| P2-5 | Specs that insert workspaces directly bypass `is_test_fixture` (provider/booking-integrity, provider/supplier-management, release/demo, release/tenant-security) | queue Q39 Lane C | Lane C |
| P2-6 | Remove the legacy no-reason maintenance fallback (after deploy) | queue Q31 | Lane D (step 10) |
| P2-7 | Seated checkout 11.24 MB dev chunks (lazy Lucide in shared design views); production bundle sizes need `next build`/CI | `q45-performance.md` | Design lane / Lane C |
| P2-8 | Intermittent failures under load: q29 beforeAll insert; Q20 24-buyer issue — watch | queue Q39 Lane C | Lane C |
| P2-9 | Connection pressure: "job startup timeout" burst on six every-minute cron jobs (2026-10-29 04:39) — watch `cron.failures` | `observability.md` | Lane C |

## P3 — engineering

| # | Item | Source | Owner |
|---|---|---|---|
| P3-1 | `catering_price` / `venue_quote` price draft menus/spaces by id (numbers only) — S04 | `q45-security.md` §1; queue Q01 | Lane A |
| P3-2 | Q01 low: `event_launch_state`; about 180 definers not line-read at Q01 (Q45 sweep found 0 unreviewed authenticated-callable — confirm anon/other coverage) | queue Q01 Evidence | Lane C |
| P3-3 | Q16 drop plaintext share tokens after a show-once UI; owner Preview 404s once revoked | queue Q16 | Lane B |
| P3-4 | Not on the generic foundation yet: email_outbox, webhook_deliveries, launch_queue, agent leases, scan queues | queue Q03 Evidence | Lane C |
| P3-5 | Duplicate models: messaging (threads vs conversations, portal/support), admin_notes/admin_record_notes, tasks/user_tasks, enquiries/provider_requests/leads, five hold tables, check_ins/provider_checkins, incidents/trust_cases/support_cases | `baseline/FINDINGS.md` #9–10 | Coordinator (backlog) |
| P3-6 | Integration health registry env names (R2, Microsoft calendar) — confirm fixed | `baseline/FINDINGS.md` #11; queue Q34 | Lane C |
| P3-7 | External calendar sync for provider jobs | queue Q11 | Lane A |
| P3-8 | Q29 feasibility counts online-only passes against hall capacity | queue Q29 Seed finding | Lane C |
| P3-9 | Q23: provider listing-boost buy flow, credit reuse, anon→login attribution — confirm after the Q23 remainder | queue Q23 Evidence "Left" | Lane A |
| P3-10 | UIs open: Q27 payout/statement; Q28 plan revenue in margin report; Q30 OAuth apps + key/webhook UIs; Q35 dashboard UI; Q36 admin experiments page | queue Q27/Q28/Q30/Q35/Q36 | Lanes A/C/D |
| P3-11 | Confirm built (reported in W02/W03 passes, no closing note): Q15 build-page wiring; Q18 public `/rsvp/[token]` + registration pages; Q20 checkout promo/access-code input; Q21 wallet/print screens; lane C customer UI asks (wizard reads `event_type_rules`, hide Sell tickets for optional_off, `publishTickets` invite_token order, map `lifecycle_preconditions`, `generateMetadata` noindex when `share_preview=false`) | queue Lane plan B; W02 "Lane C UI asks" | Lane B |
| P3-12 | W11 UI gaps 1–7 — confirm (webinar "Venue to be confirmed", readiness shows lifecycle blockers, status menu hides refused states, gala/charity/conference tiles) | `W11_REPORT.md` Gaps | Lanes B/D |
| P3-13 | Q08 `profiles.identity_verified` still a seeded boolean on admin user pages | queue Q31 Q08 finding | Lane D |
| P3-14 | `admin_set_partner_status` audits non-existent ids (W08 S5, second half) — confirm | `admin/W08_REPORT.md` | Lane D |
| P3-15 | Shared mobile menu sheet lists Help twice and both Account and My account | queue W12; W03 report | Lane B |
| P3-16 | `/organizer/events` hydration mismatch — likely fixed by the D01 hydration fix; confirm | W03 report; queue D01 | Lane D |
| P3-17 | Stale tests: `agent-planning-tools` "Vegan" expects legacy `guests.dietary`; `resale-policy.spec` fixture vs `consumer_event_date_guard`; `ticket-refund-confirmation` stub — confirm | queue Q39 Lane D; Q22 | Lane D |
| P3-18 | `build-canvas` spec self-skips on current data | `W13_REPORT_partB.md` | Lane B |
| P3-19 | Agency product backlog: lead pool/assignee, quote approval matrix (value limits / second approver), member-level reviews, payout allocation/splits/expenses, admin/contractor roles, per-role agent limits, co-owner vs owner_id | `provider/W06_REPORT.md` | Owner prioritise → Lane A |
| P3-20 | Partner application/approval/KYC/tax flow; promoter↔organiser messaging (Q05) | `affiliate/W07_REPORT.md` | Owner prioritise → Lane A |
| P3-21 | Not built (no backend): event video, add to calendar, weekend extras, social links, London quick filters; newsletter on public pages (Q05 backend exists — verdict §14 C14) | `public/W01_REPORT.md` Remaining 3 | Lane B |
| P3-22 | `/pricing` page (Pricing anchors to a section on `/`) | W01 Remaining 4 | Lane B |
| P3-23 | Email templates logo; RFQ server-side drafts (device-local now) | queue D01 "Left" | Lanes B/D |

## Design residuals (logged per the owner standard; sign-off at runbook step 1)

| # | Item | Source | Owner |
|---|---|---|---|
| D-1 | Remaining component `zoom` hacks: `org-promotion .86`, about 18 in `globals.css` (customer ones removed per W12) — confirm 0 | queue W14; `W12_REPORT_partB.md` | Lanes B/D |
| D-2 | Consistency tokens rolled out to customer/public (organiser/admin done; browser check pending) | queue log "Consistency tokens" | Lane B |
| D-3 | Landing §4/§5 premium side-by-side review | W01 Remaining 1 | Owner / Lane B |
| D-4 | Customer desktop: ticket detail (1222 ref), home stat tiles (1448 ref), saved rail, messages list, money table rows, build readiness height; Build price density, Money Today marker, Plan Week control, ticket-setup step 3 facts, style tile labels | W02 §5 / Pass 4b Remaining | Lane B |
| D-5 | Customer phone fine-tuning: guests check-in tab, open-thread view, discover filter chips | W02 Pass 4b | Lane B |
| D-6 | Confirm the plan step-4 reference (`/plan?step=4` mismatch) | W02 Remaining | Owner |
| D-7 | Re-capture C03 Account spacing and C04 My Tickets QR | queue C03/C04 | Lane B |
| D-8 | Organiser (pass 1, recheck after build): ORG-003 Ops third column, ORG-012 preview, marketplace layout/filter bar (3 cards + map vs 4 cards), RFQ step 1 tiles + requirements panel, ticket pace chart axis labels, kanban name truncation, phone 4th tab "Marketing" vs "Marketplace" | `organizer/W03_REPORT.md` | Lane D |
| D-9 | ORG-013: element-details panel, 2D/3D toggle, venue approval request (no backend), phone sticky bottom bar + element sheet | `provider/W04_REPORT.md` | Lane A / Owner (deviation) |
| D-10 | PROV-W06-01 contact toggle + event-link box; new package/service preview panel | W04 browser block | Lane A |
| D-11 | Dense phone references (PROV-001 9-tab vs 5-tab nav rule; ORG phone larger type) | W03/W04/W06 | W12 lanes |
| D-12 | AD-014 re-capture on SUP-4421; support header extra button (minor deviation) | `admin/W08_REPORT.md` | Lane D |
| D-13 | Portal/checkout logo captures | queue D01 | Lane B |

## Seed / data gaps

| # | Item | Source | Owner |
|---|---|---|---|
| S-1 | Paid Stripe orders: resale listing, past-event sales, paid merch, weekend-pass sales, campaign revenue (after Q07 onboarding) | `docs/demo/seed-catalogue.md` Waiting | Lane C after step 11 |
| S-2 | Neon `video_url`; weather data (key) | seed-catalogue; queue Q38 | Owner |
| S-3 | 7 confirmed Premier lines on non-demo-owned events have no job (left untouched) | seed-catalogue | Owner decision |
| S-4 | Customer data drift: duplicate seeded wedding tasks; ticket tiers 4 vs 5; build canvas 8 vs 11 categories (backend data) | W02 §5 | Lane C |
| S-5 | Public data: Neon 6 tiers vs 4; single service photo; no written venue reviews; no organiser reviews/similar organisers | W01 Remaining 2 | Lane C |
| S-6 | Partner earnings stop around 14 Oct | W07 | Lane C |
| S-7 | Riverside loading-bays seed | W04 Remaining | Lane A |
| S-8 | Demo map b52e… has 1 exit for 384 people; venue structures capacity_max/calibration/protected exits; access zones bound to map elements — confirm | queue Q38 Q13/Q19 | Lane C |
| S-9 | Riverside odd second `owner` membership; Tech Meetup unstaffed | queue Q38 W06 | Lane C |
| S-10 | Agent success-path seed fixtures (Q42 "open: seed fixtures") | queue Q42; Q38 Q42/Q43 | Lane D |
| S-11 | Live hygiene: public p1 events, p1 auth users (309 total), support "Card dispute fraudulent" fixtures (SLA 1234d) | queue Q38, Q39, W08 | Runbook step 8 |
| S-12 | Health snapshots need the uptime monitor polling `/api/health` | queue Q38 Q31/Q41 | Owner (step 13) |

## Owner decisions

| # | Decision | Source |
|---|---|---|
| O-1 | Customer resale: Connect onboarding for customers vs the organiser buy-back model (W02 lists buy-back as approved — verdict §14 C17) | queue Q22, Q07, Lane plan |
| O-2 | LEGACY-FUNDS: settle once, or refund and re-charge (with Legal) | queue Release blockers |
| O-3 | Trust policy `missing_blocks_acceptance` — was "OFF until Q38 seeds evidence"; evidence is now seeded (14 docs) → revisit; confirm £1m public-liability minimum | queue TRUST-POLICY; seed-catalogue Pass 2 |
| O-4 | Sustainability factors confirmation | queue Q40 |
| O-5 | Grant the `privacy` admin permission; cookie-consent anon-function decision (W01 implemented with no anon SQL function — confirm) | queue Q45 owner steps; W01 |
| O-6 | PITR (paid add-on); quarterly restore to a temporary project (cost) | `backup-restore.md` |
| O-7 | Staging database (currently none) | governance.md |
| O-8 | Approve the commit + production deploy and the purge execute | queue log "Commit + deploy" |
| O-9 | Whether the missing GD-20 artifacts are required or consolidated into the verdict | `RELEASE_VERDICT.md` §3 |
| O-10 | Run the close-out with the captcha step after the regression (ordering issue) | `CLOSE_OUT_RUNBOOK.md` |
| O-11 | Agent/customer scope items if re-raised: promoter "Share campaign" deviation; ORG-013 no venue-approval workflow | W07; W04 |

## External (detail and owner steps: `RELEASE_VERDICT.md` §9)

X1 Stripe test onboarding · X2 Stripe live keys/webhooks/endpoint subscriptions · X3 Stripe Tax · X4 ClamAV · X5 Sentry/GlitchTip · X6 Uptime Kuma · X7 probe cron + probe credentials · X8 VAPID · X9 weather · X10 video providers · X11 wallet certificates · X12 e-signature · X13 Resend webhook / mailbox transports · X14 SMS · X15 `FIELD_ENCRYPTION_KEYS` / KMS · X16 CI + signed builds · X17 Neon video URL · X18 October Azure invoice. Sources: queue Q01, Q04, Q05, Q16, Q21, Q23, Q26, Q28, Q29, Q34, Q37, Q38, Q39, OWNER-EXTERNAL.

## Legal (detail: `RELEASE_VERDICT.md` §10)

| # | Item | Source | Owner |
|---|---|---|---|
| L-1 | FCA_PAYMENT_PERIMETER_SIGNOFF | queue Release blockers | Legal |
| L-2 | Legacy funds (with O-2) | queue | Legal + Owner |
| L-3 | Terms "funds we hold" (`terms/page.tsx:76,82`); refund fee policy `feePolicyFor` | queue TERMS-COPY | Legal |
| L-4 | Privacy page lists Anthropic as a subprocessor (`privacy/page.tsx:58`) | queue OWNER-EXTERNAL | Legal |
| L-5 | Resale GB v1 text; resale fee policy | queue Q22, Q45 | Legal |
| L-6 | Compliance GB rule pack | queue Q26 | Legal |
| L-7 | Retention periods + DSAR wording → enable with `p_legal_reviewed` | queue Q32, Q45 | Legal |
| L-8 | Cookie-banner wording | W01 | Legal |
| L-9 | VAT adviser questions 2–6 | `docs/operations/vat-decisions.md` | Owner + adviser |

## Dropped as fixed later in the queue (for traceability)

These items were raised and then closed by later work:
- Q10/Q12 double-booking P1s
- W06 crew RLS + assignment race
- Q15 payment bypass
- W08 S1–S5 (except P3-14) and the maintenance.spec hazard
- W09 pay-link P1
- Q29 virtual join P1
- 4031 client-write regression
- W02 plan-wizard P1
- discard draft P2
- Buy shown while checkout refuses
- `gd_consent` overwrite
- `notify_waitlists` vs seller readiness
- Q45-S01 / S02 / H-01 / H-02 (code)
- calendar_window timezone
- next/zod advisory
- `@anthropic-ai/sdk`
- Q01 capabilities REST write
- `record_boost_event` inflation
- agent runs to cancel
- tenant-security allowlist
- D01 step counts / Cards default
- Q14 duplicate-event + programme overlap
- W03 backend gaps B1/B2
- 4042 deadlock
- Q17 addNote
- Q08 Verified chips (37 demo listings Verified)
- most Q38 seed gaps (`seed-catalogue.md` passes 1–3)
- W10 provider self-serve plans
- Partner Activity fake connector panel
- AD-016/AD-013 fixes
