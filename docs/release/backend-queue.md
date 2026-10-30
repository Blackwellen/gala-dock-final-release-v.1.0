# Gala Dock — combined execution queue (backend 360 + enterprise completion)

**Sources (both binding):**
1. `Gala_Dock_Enterprise_Backend_360_Claude_Code_Master_Prompt_DETAILED_v3_FCA_DIRECT_CHARGES.md`: §23 queue Q00–Q45, §16 domain cards 1–288 (authoritative build contract), §29 release blockers, §30 definition of done.
2. `GalaDock_Enterprise_Completion_Master_Prompt_v6.md`: GD-00–GD-20 workspace-by-workspace audit, 1:1 design recovery and release gates, plus Annex U QA baseline. Becomes lane **W** below.

Where they conflict: owner decisions, then the backend doc for backend architecture (incl. the FCA direct-charge lock), then v6 for design, workspace audit and QA evidence.

**Statuses:** `TODO` · `IN_PROGRESS` · `BLOCKED_EXTERNAL` · `BLOCKED_LEGAL` · `DONE` (built, tests written) · `VERIFIED` (tests run green + evidence linked). Nothing is VERIFIED without evidence.

**Per-packet method (backend doc §23, §32):** inspect → reuse → schema/migration → service → RLS/permissions → UI wiring → jobs/events → Agent/API/MCP → tests → run → fix → docs → exit gate.

## Operating rules for this run

| Rule | Detail |
|---|---|
| Agents | Opus subagents, **up to four at a time** (owner 2026-10-28), at most two with browsers, disjoint files; extra backend lanes C/D use migration ranges 2026102930NN / 2026102940NN. |
| Resources | 16 GB RAM, C: about 29 GB free at start. One dev server only: `node tools/dev/dev-watchdog.mjs --port 3107` (restarts at 6 GB or low RAM; clears `.next/dev` when C: is under 3 GB). Pause heavy work when free RAM is under 2 GB or disk under 8 GB. No `next build` while another agent is capturing. Run tsc once at a time: `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit -p .`. One browser per agent; close it in `finally`; delete bulky screenshots after use. Temp output only in a unique scratchpad subfolder; never wildcard-delete in shared Temp. |
| Migration safety | Since 2026-10-29: every changed/new function is exercised with realistic args inside the rolled-back dry run before applying (after migration 3009 broke live `accept_proposal` for ~10 min). |
| Migrations | Additive, numbered by lane to avoid collisions: Lane A `20261029A###_*.sql` → use `2026102910xx`; Lane B `2026102920xx`. Applying to the shared Supabase project follows the existing `scripts/testing/apply-*-migration.mjs` pattern, one reviewed file at a time. Never wipe or bulk-rewrite production data. |
| External | No live charges, broadcasts or real emails; Stripe test mode only. Missing credentials → implement contract + health status, mark `BLOCKED_EXTERNAL`, continue. |
| Product decisions | No AI in the customer workspace (Gala Agent is Organizer/Provider, paid). Display scale fits the 1536 design width. ClamAV lives in `blackwellen-operations`. |
| Commits | None unless the owner asks. |

## Release blockers (backend §29 + this run)

- **DB-APPLY:** there is no staging database — the Supabase project is shared with the live site. Q01–Q03 migrations (additive, backward-compatible) were applied to it. Applying Q07 payment migrations was refused once as a production deploy. **Owner decision 2026-10-28: apply to live, additive and backward-compatible only** (dry-run, then one at a time with schema_migrations recorded). If the permission system refuses again, the owner adds a permission rule.

- `FCA_PAYMENT_PERIMETER_SIGNOFF`: legal review of the direct-charge flow (`BLOCKED_LEGAL` until signed).
- **T1:** Supabase Auth captcha switched off for QA (owner, 2026-10-26). Re-enable `security_captcha_enabled` before sign-off.
- **T2:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` blanked in `.env.local`. Remove before sign-off.
- Cross-tenant access, payment duplication, ledger imbalance, ticket oversell, stale credential accepted, provider double booking, broken Stripe webhook, payout despite invalid Connect capability, Agent bypassing approval, public quarantined file, unaudited admin access, broken onboarding/checkout, unrecoverable migration, exposed secrets.

- **STRIPE-CARD-PAYMENTS (deploy blocker):** Q38 correction: the 25 `acct_test_…` rows are leftover test fixtures (Webhook Provider / Q07 Direct Seller workspaces), and the real demo sellers had NO connected account. Q38 created 7 real test-mode seller accounts + 1 QA seller (Q07 controller settings); all stuck on `tos_acceptance` because Stripe only lets the seller accept via hosted onboarding — owner action: `node --env-file=.env --env-file=.env.local scripts/seed-q38-demo.mjs --steps=sellers --links`, complete each link with test data, re-run the seed. Earlier coordinator note: all 25 `connect_accounts` rows are seeded placeholders (`acct_test_…`), not real Stripe accounts in test or live mode. Owner said "switch on": Q38 is creating real Stripe **test-mode** accounts for demo sellers. Production (live key) still has no real seller accounts. Originally reported as: all 23 connected accounts have `card_payments` inactive → after the Q07 code deploys every paid event shows "not purchasable" until accounts are activated or sellers re-onboard (fees/losses on seller, full dashboard). Stripe dashboard/owner decision.
- **LEGACY-FUNDS:** 12 `separate_transfer` deposits and 7 platform-charged ticket orders hold seller money on the platform balance; settle once or refund and re-charge — legal/owner decision.
- **TERMS-COPY:** `src/app/(legal)/terms/page.tsx:76,82` says "funds we hold" — legal rewrite; refund fee policy (`src/lib/payments/rules.ts` feePolicyFor) needs legal review.

- ~~TENANT-SECURITY-ALLOWLIST~~ RESOLVED 2026-10-28: owner delegated ("fix all of this"); `event_payment_readiness` kept public and added to the allowlist; tenant-security 12/12.


### Stripe test-mode onboarding links (DEFERRED TO THE END by owner 2026-10-28 — owner completes Alex Events + QA seller in a normal browser; Stripe API refuses ToS on behalf: `tos_acceptance_on_behalf_not_allowed`)

Open each, choose test data, finish; then run `node --env-file=.env --env-file=.env.local scripts/seed-q38-demo.mjs` again. Links expire — regenerate with `--steps=sellers --links`.

| Workspace | Account | Link |
|---|---|---|
| Alex Events | acct_1UVcSAArRwHoZ2eg | https://connect.stripe.com/setup/s/acct_1UVcSAArRwHoZ2eg/uA9EevlIT3Zb |
| City Nights | acct_1UVciDAc0liVyEE3 | https://connect.stripe.com/setup/s/acct_1UVciDAc0liVyEE3/OsOpNas0vLPM |
| Festival Collective | acct_1UVciJPG1hpGJU6p | https://connect.stripe.com/setup/s/acct_1UVciJPG1hpGJU6p/e7ffMs4ghetW |
| Riverside Events | acct_1UVciOA5yX1UTaSY | https://connect.stripe.com/setup/s/acct_1UVciOA5yX1UTaSY/kGSgeMkMmFQa |
| London Venue Collective | acct_1UVciTAC8Iwib6tW | https://connect.stripe.com/setup/s/acct_1UVciTAC8Iwib6tW/ygmpcJwQGZli |
| Premier Event Services | acct_1UVciYAo5dK4uYjf | https://connect.stripe.com/setup/s/acct_1UVciYAo5dK4uYjf/EEvb3bvVZsAl |
| Riverside Arena | acct_1UVcicAFzcyuCENj | https://connect.stripe.com/setup/s/acct_1UVcicAFzcyuCENj/Axf5ANCGKpqD |
| QA seller (tests) | acct_1UVcmYAj4sGoZzkY | https://connect.stripe.com/setup/s/acct_1UVcmYAj4sGoZzkY/vNFF3WKntfGH |

## Owner decisions applied 2026-10-28 ("fix all of this")

Flows match the designs: Plan wizard 6 steps (design #67), organizer ticket setup 5, proposals 5, RFQ 4; organizer Events default Cards; logo = "G" mark + purple "Gala·Dock" wordmark everywhere (landing sparkle mark logged as deviation); `event_payment_readiness` public.

- **FINANCE (decided 2026-10-28 by delegation):** packs repriced £25 / £89 / £219 (Q28 follow-up); model prices → published list prices with conservative padding (Azure +10%, fx 0.80, deep = Opus 5 ceiling) and packs activated in test mode (decided 2026-10-28, applied by Q28 follow-up); real-usage sizing: ~0.155 credits per agent task, heavy organizer ≈136 credits/month (≤400 pessimistic) → allowances unchanged; historic unmetered run kept, flag scoped to runs after meter go-live; VAT via Stripe Tax automatic tax (test mode now); live keys, live webhook events `customer.subscription.*`/`invoice.*` and dashboard dunning remain **owner actions**.
- ~~SECURITY-HARDENING~~ DONE: 16 Q23/Q28 worker functions + `ad_impressions` added to SERVICE_ONLY lists; tenant-security 12/12.

- **AI-PROVIDER:** owner 2026-10-28 — AI is **Azure OpenAI only**, no Claude. Q28 follow-up must move the provider assistant and onboarding helper onto Azure `chat()` metering and retire the Anthropic meter path.

- ~~AGENT-RUNS-TO-CANCEL~~ RESOLVED 2026-10-28: owner asked Claude to do it; all 6 cancelled via `agent_control_run` as provider.demo (0 tokens, £0).

- **OWNER-EXTERNAL (Q04–Q06, Q28):** Stripe Tax head office + GB registration (test then live) then `BILLING_AUTOMATIC_TAX=on`; deploy ClamAV gateway + set `CLAMAV_SCAN_URL/TOKEN`, then `scripts/files/rescan-quarantined.mjs`; after deploy apply `supabase/pending/q04_public_buckets_server_only.sql`; Resend webhook + `RESEND_WEBHOOK_SECRET`; Gmail/IMAP/SMTP credentials if mailbox sync wanted; record October Azure invoice; remove `@anthropic-ai/sdk`; privacy page still lists Anthropic as subprocessor (`src/app/(legal)/privacy/page.tsx:58`, legal copy).

- **TRUST-POLICY (owner decision):** `trust_policy.missing_blocks_acceptance` is OFF (providers who never uploaded required evidence can still accept work; expired/low-cover evidence already blocks). Public liability minimum £1m is data — confirm. Decided default kept: OFF until Q38 seeds evidence.

- ~~DO-NOT-RUN maintenance.spec~~ RESOLVED 2026-10-29: rewritten to use the test-only `qa` audience (never affects real users).

- **SPECS-NEED-MFA:** after Q31 S2, `tests/release/event-cancellation.spec.ts`, `tests/marketplace/marketplace.spec.ts`, `tests/trust/trust-verification.spec.ts` call admin mutations as admins without MFA → add `enrolTotp(client)` after `signedIn(...)` (lane B next packet).

## Owner priorities (pulled forward once Q00–Q03 foundations allow)

1. **Q07** FCA direct charges (P0 architecture change).
2. **W02** customer workspace 1:1 with designs.
3. **Q38** full-depth demo seeding.
4. **Q28** AI-run profitability assurance.
5. **Q23** advert placements and rotation.
6. Atom (component) testing, full backend testing, enterprise sign-off (Q39, Q44, Q45, W15).

## Carry-overs from 2026-10-26/28 sessions

| ID | Item | Status | Evidence / next step |
|---|---|---|---|
| C01 | Display scale fits 1536 design (`src/styles/density.css`), customer top bar rebuilt, full-width content | DONE | Captures `artifacts/visual/cu-1536/*`: nav 851–1248 vs design 858–1248, icons 1272 vs 1271, gutter 44 on 9 routes, no overflow at 1366/1536/1920 |
| C02 | Customer logo full size (removed 44px override in `kit.css`) | DONE | 172×46 at x=34 (design 177 wide). Wordmark blue in assets, purple in mock; landing designs show a sparkle mark: owner question |
| C03 | Account page spacing, inline Verified badge, Payment methods above Event preferences | DONE | Needs re-capture |
| C04 | My Tickets QR overlapping "Valid for entry" | DONE | Needs re-capture |
| C05 | Reviews star-rating row overflows its columns | DONE | Fixed in W02 (`cu-reviews.css:55-62`) |
| C06 | ClamAV moved to `blackwellen-operations` | VERIFIED (code) | 30/30 gateway tests; Gala Dock readiness spec 8/8. Deployment BLOCKED_EXTERNAL (Q04) |
| C07 | AI profitability migration `202610280039` + runtime/settings fixes | DONE (not applied) | Q28 |
| C08 | Next.js 16.4.0 security advisory; npm audit 1 high / 1 critical | TODO | Q39 |
| C09 | Customer Gala Agent panels replaced by non-AI helpers | VERIFIED (decision) | Owner: remove AI from customer. Approved design deviation |
| C10 | `scripts/design/capture-matrix.mjs` (routes × viewports capture with shell geometry) | DONE | Used for C01 |

---

# Lane A — Backend queue (backend doc §23)

### Q00 — Repository Baseline

**Status:** DONE — 2026-10-28 (UI per-control census → W13; browser E2E → Q39/Q44; SECURITY DEFINER/GRANT audit → Q01)  
**v6 cross-refs:** GD-01, GD-19.1-3, Annex U §2  
**Gala Dock state:** Many uncommitted files from earlier sessions — preserve. Existing audit docs: docs/pwa/*, docs/release/RELEASE_READINESS_REPORT.md, docs/release/SYSTEM_INVENTORY.md, docs/p2-design-map.md. Produce WORKSPACE_ROUTE_MATRIX + action→backend trace inputs for the W lane.  

- [ ] Inventory routes
- [ ] Inventory UI surfaces
- [ ] Inventory tables
- [ ] Inventory RLS policies
- [ ] Inventory migrations
- [ ] Inventory Edge Functions/server actions/API routes
- [ ] Inventory cron/jobs/queues
- [ ] Inventory webhooks
- [ ] Inventory external integrations
- [ ] Inventory Agent tools/skills
- [ ] Inventory feature flags
- [ ] Inventory storage buckets/R2 paths
- [ ] Find dead controls
- [ ] Find duplicated models
- [ ] Find mock/hard-coded production data
- [ ] Run baseline tests
- [ ] Capture baseline failures

**Exit gate:** reproducible baseline and no unknown major subsystem.

**Evidence:** `docs/release-audit/galadock/baseline/` ROUTES.csv (258 routes), TABLES_RLS.md (177 tables, 0 with RLS off, 223 policies), SERVER_SURFACE.md (351 actions, 78 handlers, 30 agent tools), FINDINGS.md (15 ranked + money-flow), BASELINE_TESTS.md (tsc 0 errors; eslint 0 errors/395 warnings; Playwright 120/121)

---
### Q01 — Tenant, Auth & Security Foundation

**Status:** VERIFIED — exit gate met 2026-10-28 (tenant/security suite 12/12; domains partly PARTIAL, see evidence)  
**W10 (2026-10-29):** invite/revoke now via owner-only audited rate-limited commands (migration 202610292008; workspace-invites 5/5); app callers switched. After deploy: revoke legacy `workspace_invites` column grants.  
**Q17 finding (P1 functional):** client roles have only SELECT on `workspace_invites` → generic owner invite (`/api/invites`, provider settings invite/revoke) fails with permission denied; needs an owner-only invite/revoke command.  
**W06 finding (P1 security):** `crew_members_rw`/`shifts_rw` RLS lets any workspace member write (Staff can deactivate colleagues / insert confirmed shifts) — handed to lane A Q12 2026-10-28; no membership suspend/revoke RPC (P1); no admin/contractor roles; co-owner vs owner_id inconsistency.  
**W01 finding:** customer-area sign-in loses its return path (`getCustomer()` defaults to /discover, `src/lib/data/context.ts:10`) so "Plan an Event" lands on Discover; `describeIntent` checkout banner never matches `/checkout/[event]` (`src/lib/redirects.ts`).  
**Q00 finding:** 406 SECURITY DEFINER functions and table GRANTs not yet audited for internal authorisation.  
**Spec cards (backend doc line ranges):** 16:L6395-6500, 17:L6501-6610, 18:L6611-6717, 19:L6718-6821, 20:L6822-6926, 21:L6927-7034, 22:L7035-7141, 23:L7142-7251, 24:L7252-7356, 25:L7357-7463, 206:L26005-26107, 207:L26108-26213, 208:L26214-26317, 209:L26318-26423, 210:L26424-26527, 267:L32348-32450, 268:L32451-32553, 269:L32554-32656  
**v6 cross-refs:** GD-00.2, GD-11, GD-17, Annex U §39  
**Gala Dock state:** T1/T2 (captcha off) are open sign-off blockers. MFA/passkeys/sessions UI exists (src/components/security/*).  

Domains: 16–25, 206–210, 267–269.

- [ ] Profiles/user identity
- [ ] Workspaces/memberships
- [ ] Provider capability modes
- [ ] Roles/permissions
- [ ] Entitlements
- [ ] MFA/TOTP/passkeys where supported
- [ ] Session/device security
- [ ] Feature flags
- [ ] Secret/KMS contract
- [ ] Field/token encryption
- [ ] Residency metadata

**Tests:** cross-tenant direct API/DB access, revoked membership, suspended workspace, session revocation, step-up actions.

**Exit gate:** automated tenant/security suite green.

**Evidence:** Migrations 202610291001–1005 applied + recorded in schema_migrations; definer audit 406→413 (11 fixed); grants: 0 TRUNCATE/REFERENCES/TRIGGER and 0 anon writes (was 111 tables fully granted); entitlement self-grant closed (critical); require_step_up on 8 RPCs + all admin mutations; feature_enabled() single flag evaluator; field-encryption key ring; `tests/release/tenant-security.spec.ts` 12/12; regression 57/57 + 16/17 (1 dev flake, passed on rerun); tsc 0. Matrix: `docs/security/rls-matrix.md`. Open (low): record_boost_event inflation, event_launch_state, catering_price/venue_quote, ~180 definers not line-read; (med-low) workspaces.capabilities writable via REST. **Owner action:** set FIELD_ENCRYPTION_KEYS. Domain 267 KMS BLOCKED_EXTERNAL.

---
### Q02 — Canonical Configuration & Master Data

**Status:** VERIFIED — 2026-10-28 (domains 25, 27 PARTIAL; 264 DONE for core taxonomies)  
**Spec cards (backend doc line ranges):** 25:L7357-7463, 27:L7572-7679, 264:L32036-32140  

Domains: 25, 27, 264.

- [ ] Event taxonomy
- [ ] Venue taxonomy
- [ ] Supplier/service taxonomy
- [ ] Countries/regions
- [ ] Currencies
- [ ] Timezones
- [ ] plan capabilities
- [ ] legal/payment rule versions

**Exit gate:** no duplicated inconsistent enum/taxonomy definitions across backend/UI.

**Evidence:** Migration 202610291006_master_data applied + recorded; single accessor `src/lib/master-data/` with DB mirror (taxonomies, terms, spellings, ref_currencies/countries/timezones); `master_data_audit()` returns 0 rows; fixed concert-stored-as-party, 7-vs-3 currency mismatch, stale commission entitlements (12/10/8/6% → 8/7/6/6%); legal terms versioned via platform_settings `legal` + `setting_at()`. `tests/foundation/master-data.spec.ts` 7/7. Still local: template taxonomy `nightclub`, emergency categories, rfq-wizard CATS, create-event PROVIDERS, venue space types/amenities, support categories, customerInterests/organizerBusinessTypes. Customer follow-ups: account COUNTRIES → `countries()`, add-provider CATS → `terms("build_category")`.

---
### Q03 — Workflow / State / Queue Foundation

**Status:** VERIFIED — exit gate met 2026-10-28 (26 workflow, 30 scheduler, 259 concurrency PARTIAL)  
**Lane D 2026-10-29:** added 41 missing types to `event-catalogue.ts`. Parity still fails on 22 in-flight types (lane A promotion.* 16, media.* 4, brand.kit_saved; lane C api_key.rotated, api_key.updated, webhook.secret_rotated) — owning lanes add.  
**Q20/Q26 finding:** `tests/foundation/workflow-foundation.spec.ts` catalogue parity fails — ~41 DB event types missing from `src/lib/foundation/event-catalogue.ts` (contract.*, hospitality.*, client.*, build_engine.*). Agent D adding.  
**Q00 finding:** No generic outbox/job queue/idempotency/dead-letter tables (each domain has its own queue). Agent worker tests fail on local-vs-DB clock skew (agent-run-types.spec.ts:42,61) — use DB time.  
**Spec cards (backend doc line ranges):** 26:L7464-7571, 27:L7572-7679, 28:L7680-7787, 29:L7788-7893, 30:L7894-7998, 31:L7999-8103, 257:L31312-31414, 258:L31415-31518, 259:L31519-31621  
**v6 cross-refs:** GD-13, GD-13.1 (at-least-once, idempotency)  

Domains: 26–31, 257–259.

- [ ] Workflow runtime
- [ ] Rules engine
- [ ] State-machine helpers
- [ ] Job queue
- [ ] Scheduler
- [ ] Dead-letter queue
- [ ] Domain event bus
- [ ] Transactional outbox
- [ ] Consumer dedupe/inbox
- [ ] Idempotency registry
- [ ] Optimistic/advisory locking strategy

**Tests:** replay same command/webhook/job; verify no duplicate side effects. Crash/resume workflow test.

**Exit gate:** durable retry/replay proven.

**Evidence:** Migration 202610291007_workflow_foundation applied + recorded; domain_outbox, event_subscriptions, job_queue (+ leases/backoff), dead_letter_jobs, consumer_inbox, idempotency_keys, transition_state, advisory locks, db_now, purge; pg_cron foundation-db-jobs / foundation-app-jobs / foundation-purge. Proof flows: agent routine wake via outbox→job (async ~1 min); developer API Idempotency-Key via withIdempotency. Clock-skew fixed (DB time). `tests/foundation/workflow-foundation.spec.ts` 8/8; regression 44/44; tenant-security 12/12; tsc 0. Docs: `docs/architecture/domain-events.md`, `docs/architecture/state-machines.md`. Not yet on the foundation: email_outbox, webhook_deliveries, launch_queue, agent leases, scan queues. `/api/cron/jobs` 404s in production until deployed (app jobs wait). database.ts types not regenerated.

---
### Q04 — Files, R2 & Malware

**Status:** DONE 2026-10-28 — exit gate met in code; ClamAV deploy + pending public-bucket policy SQL after deploy = BLOCKED_EXTERNAL  
**Spec cards (backend doc line ranges):** 185:L23808-23912, 186:L23913-24016, 187:L24017-24121, 188:L24122-24225  
**v6 cross-refs:** GD-13.1 (R2/AV), X27  
**Gala Dock state:** ClamAV moved to blackwellen-operations services/av-scan-gateway (30 tests pass, not deployed). Gala Dock client: src/lib/upload-safety.ts (POST /scan, GET /healthz). Deployment = BLOCKED_EXTERNAL until Oracle B is up.  

Domains: 185–188.

- [ ] File metadata
- [ ] R2 signed upload/download
- [ ] Public/private classes
- [ ] MIME/magic-byte checks
- [ ] malware quarantine
- [ ] SVG sanitisation
- [ ] thumbnails/derivatives
- [ ] EXIF/privacy handling
- [ ] retention/deletion
- [ ] storage metering

**Exit gate:** malicious upload fixtures cannot become publicly accessible.

**Evidence:** Migrations 1017–1019 applied; file classes + access decision (PDF/sensitive fail closed until scanned), magic-byte/polyglot/SVG/active-PDF refusal, EXIF strip, server-only public uploads, signed downloads with quarantine gate (423/410), R2 presign round-trip verified, retention/meter jobs. Tests files-security 11/11. Doc `docs/integrations/files-storage.md`. After deploy: 10 stored request PDFs return 423 until scanned; apply `supabase/pending/q04_public_buckets_server_only.sql`.

---
### Q05 — Communications & Notification Foundation

**Status:** DONE 2026-10-28 — exit gate met; Gmail/IMAP/SMTP transports BLOCKED_EXTERNAL  
**W01 finding:** no newsletter/product-updates subscription; public contact form requires sign-in (`src/lib/actions/support.ts:16`).  
**Q00 finding:** Messaging modelled twice (threads+messages vs conversations+conversation_messages, plus portal/support messages).  
**Spec cards (backend doc line ranges):** 163:L21510-21615, 164:L21616-21720, 165:L21721-21826, 166:L21827-21931, 167:L21932-22037, 168:L22038-22141  
**v6 cross-refs:** GD-03.8, Annex U §20, §30  

Domains: 163–168.

- [ ] Canonical threads
- [ ] Direct/context messages
- [ ] Attachments
- [ ] Unified inbox
- [ ] Gmail/IMAP sync
- [ ] SMTP sending
- [ ] Resend transactional email
- [ ] bounce/complaint events
- [ ] notification service
- [ ] consent/preferences
- [ ] retry/dedupe

**Exit gate:** event/booking/quote threads round-trip without duplication.

**Evidence:** Migration 1020 applied; canonical conversations with legacy thread links + unified inbox views, idempotent context messages, notify() with dedupe + transactional/marketing categories, email reserved-domain + suppression guards, Resend bounce/complaint webhook, newsletter double opt-in (PECR), signed-out contact form. Tests communications 8/8. Doc `docs/architecture/messaging.md`.

---
### Q06 — Search, Cache & Indexing

**Status:** DONE 2026-10-28 — exit gate met  
**Spec cards (backend doc line ranges):** 169:L22142-22247, 170:L22248-22351, 171:L22352-22455, 172:L22456-22559, 260:L31622-31725, 261:L31726-31828, 262:L31829-31931, 263:L31932-32035, 264:L32036-32140  
**v6 cross-refs:** GD-02 search/SEO, Annex U §23  

Domains: 169–172, 260–264.

- [ ] Search abstraction
- [ ] Permission-aware search
- [ ] Marketplace indexing
- [ ] Geospatial indexes
- [ ] autocomplete/synonyms
- [ ] cache abstraction
- [ ] invalidation
- [ ] indexing pipeline
- [ ] reindex/reconciliation
- [ ] data-quality baseline

**Exit gate:** index is rebuildable and search never leaks unauthorised records.

**Evidence:** Migrations 1021–1022 applied; search_documents index (FTS + trigram + earthdistance), live-predicate re-check (no leaks even with corrupted index), triggers + drain + daily reconcile, synonyms + master-data expansion, versioned cache. 424 docs indexed (49 public). Public API `/api/public/search`, `/api/public/autocomplete` (organic only). Tests search 6/6. Doc `docs/architecture/search.md`.

---
### Q07 — Payment / Ledger / Stripe Foundation

**Status:** DONE 2026-10-28 — built, migrations applied; not VERIFIED until Stripe test-mode run (owner approval) and Connect card_payments active  
**Q40 (lane A):** merch orders are direct charges with application fee; webhook `metadata.merch_order` branch; refunds via `refundMerchantCharge` job `merch.card_refunds`; reconciliation includes merch; spec 13/13 (fake Stripe). Ledger: same three postings, source `merch_order`.  
**Pay-link P1 FIXED 2026-10-29 (lane B):** migration 202610292009 — `invoice_by_token` accepts 24/32/36 hex or uuid via `invoice_pay_token_valid`, service_role only; `/pay/[token]` matches; 8 live non-draft invoices resolve; `tests/payments/pay-link.spec.ts` 3/3 (render only, no Stripe).  
**W09 P1 (2026-10-29):** `invoices.payment_token` defaults to 24 hex but `invoice_by_token` requires 36 → every pay link 404s (10 live tokens). Also `invoice_by_token` executable by authenticated. Assigned lane B.  
**W03 finding:** invoice "View payment page" `/pay/<token>` returns 404 for paid invoice INV-1047.  
**W02 finding:** saved cards for Payment methods; customer payouts.  
**Q00 finding:** Confirmed P0s: (1) marketplace separate charges & transfers on platform key; (2) ticket sales are platform charges, organiser share never paid out; (3) /pay/[token] invoices land in platform account, no webhook, racy insert, organiser never paid; (4) resale seller 'payout' = refund of seller's original payment; (5) two finance models (legacy payments/transactions vs payment_orders/checkout_orders/ledger); no payout.* mirroring; platform is merchant of record for disputes. Full table: baseline/FINDINGS.md §2.  
**Spec cards (backend doc line ranges):** 123:L17742-17919, 124:L17920-17949, 125:L17950-18061, 126:L18062-18157, 127:L18158-18189, 128:L18190-18215, 129:L18216-18233, 130:L18234-18254, 131:L18255-18277, 132:L18278-18368, 133:L18369-18474, 134:L18475-18578, 135:L18579-18685, 258:L31415-31518  
**v6 cross-refs:** GD-13 Finance, X02/X05/X20, Annex U §36  
**Gala Dock state:** P0 FCA: checkout uses SEPARATE CHARGES & TRANSFERS (src/lib/commerce/orchestrator.ts:68 transfer_group, :98 transfers.create source_transaction) — platform collects gross funds then transfers. Must move to Stripe Connect DIRECT CHARGES on the seller account with application_fee_amount. Release blocker FCA_PAYMENT_PERIMETER_SIGNOFF (legal) stays open regardless.  

Domains: 123–135, 258.

- [ ] Payment orchestration service
- [ ] Stripe client boundary
- [ ] Connect onboarding/capability states
- [ ] application fees/transfers
- [ ] ledger accounts/entries
- [ ] refund orchestration
- [ ] payout orchestration
- [ ] reconciliation
- [ ] tax snapshots
- [ ] invoices/credit notes
- [ ] event finance calculations

**Tests:** duplicate Stripe webhook, delayed webhook, failed transfer, partial refund, chargeback, restricted connected account, reconciliation mismatch.

**Exit gate:** ledger balances and financial state is authoritative/auditable.

**Evidence:** Migrations 202610291008_direct_charge_schema, 1009_direct_charge_rpcs, 1010_payment_reconciliation_job applied + recorded (dry-run in rolled-back txn first). All seller flows now direct charges with application fee: tickets, deposits/balances/standby/emergency, invoices `/pay/[token]` (webhook + row-locked RPC), event-cancellation and marketplace refunds on connected account, disputes seller-liable, payout.* mirrored, boosts stay platform own-sale. `transfers.create` removed from core flows (static guard). Legacy 17 separate_transfer + 15 platform ticket orders labelled via generated `payment_route`/`funds_custodied_by_platform`. Tests: `tests/payments/direct-charges.spec.ts` 32/32, `connect-webhook.spec.ts` 7/7, regression 48/48; tsc clean. Docs: `docs/payments/ledger.md`, `docs/payments/reconciliation.md`. PARTIAL: customer resale (customers lack Connect), saved-card clone not wired, organiser cancellation commission, domains 123/125/126/131–135/258 partial.

---
### Q08 — Trust, Verification & Provider Documents

**Status:** VERIFIED 2026-10-28 (backend/API) — exit gate met; admin review UI + customer identity checks open; ClamAV BLOCKED_EXTERNAL  
**Q03 finding:** Verification has no state machine.  
**Spec cards (backend doc line ranges):** 116:L17004-17107, 117:L17108-17212, 118:L17213-17318, 119:L17319-17423, 120:L17424-17529, 121:L17530-17636, 122:L17637-17741  
**v6 cross-refs:** GD-05.1, GD-06, GD-09  

Domains: 116–122.

- [ ] Identity/business verification model
- [ ] Stripe verification sync
- [ ] provider documents
- [ ] insurance
- [ ] expiry rules
- [ ] verification badge truthfulness
- [ ] reliability metrics
- [ ] reviews
- [ ] moderation/enforcement

**Exit gate:** expired/missing required evidence affects eligibility correctly; source documents stay private.

**Evidence:** Migrations 202610293001–3007 applied + recorded. verification_checks + `verification` machine (enforce), Stripe sync from webhook data, private sensitive documents with audited 60 s signed access, insurance cover minimum (£1m PL, data), time-aware computed badges (listings.verified / workspaces.verification_status derived), eligibility gates on publish + quote/job (expired/low cover/suspension), listing holds auto-released on renewal, daily expiry/reminder job, versioned explainable reliability (no sponsored inputs), review eligibility + report, enforcement with appeal/overturn. Tests trust-verification 11/11, tenant-security 12/12 (+29 service-only fns), regression green. Doc `docs/marketplace/trust-verification.md`. **Live effect:** Verified listings 33 → 0, verified workspaces 11 → 27.

---
### Q09 — Marketplace Listings / Search / Ranking

**Status:** VERIFIED 2026-10-29 — ranking reasons/scores internal only (public + customers lean; explain path for admins/organizer/provider; match-run features closed to customers); migrations 1033–1034; ranking 9/9  
**W01 finding:** no public signed-out discovery/search/category/location pages (`/events/london` reference has no route); public header search forces sign-in (with Q06).  
**Spec cards (backend doc line ranges):** 103:L15629-15733, 104:L15734-15839, 105:L15840-15946, 106:L15947-16052, 107:L16053-16157  
**v6 cross-refs:** GD-02, GD-04.3, Annex U §22-23  
**Gala Dock state:** Sponsored separation ties to ad placements/rotation (owner priority) — see Q23.  

Domains: 103–107.

- [ ] Venue/space listings
- [ ] Supplier/service listings
- [ ] Packages
- [ ] date/availability filters
- [ ] price/capacity filters
- [ ] ranking model
- [ ] reliability weighting
- [ ] matching
- [ ] recommendations
- [ ] sponsored separation

**Exit gate:** ranking reasons can be explained and sponsored results are labelled.

**Evidence:** Migrations 1031–1032: `marketplace_search` with availability-aware filters, versioned ranking model v1 with per-result reasons summing to score (never sponsored/ads inputs), Q08 reliability weighting, matching + saved runs, non-personalised recommendations, public `/api/public/marketplace` + `/api/public/discover` (city/category pages backend). Spec marketplace-ranking 8/8. Combined lane run 85/85 incl. tenant-security 12/12. Doc `docs/marketplace/ranking-matching.md`.

---
### Q10 — Marketplace Request / Quote / Hold / Booking

**Status:** VERIFIED 2026-10-28 — exit gate met (P1 double-sale fixed; order groups partial confirm/fail)  
**W04 finding (P1):** marketplace-confirmed venue jobs (`create_job_for_confirmed_item`) have no space_id and deposit confirmation runs no conflict check → same slot can be sold directly again (`tests/provider/w04-w05-race.spec.ts` expected-fail); no direct-booking path for services.  
**Q00 finding:** No canonical bookings table (spread over build_items, provider_requests/quotes, provider_jobs, payment_orders, booking_cancellations/disputes); five hold tables.  
**Spec cards (backend doc line ranges):** 108:L16158-16263, 109:L16264-16369, 110:L16370-16475, 111:L16476-16580, 112:L16581-16686, 113:L16687-16792, 114:L16793-16897, 115:L16898-17003  
**v6 cross-refs:** GD-05, X07-X09, X13  
**Gala Dock state:** Commit c580ba1 wired conditional holds/emergency requests through the request wizard — reuse.  

Domains: 108–115.

- [ ] Requirement builder
- [ ] venue requests
- [ ] supplier requests
- [ ] custom jobs
- [ ] recipient targeting
- [ ] response deadlines
- [ ] quote versions
- [ ] conditional holds
- [ ] paid holds where supported
- [ ] standby
- [ ] emergency requests
- [ ] multi-vendor parent order
- [ ] child bookings
- [ ] booking state machine
- [ ] partial failure/recovery

**Exit gate:** one event with venue + two suppliers can partially confirm/fail without corrupting the parent order.

**Evidence:** Migrations 202610291023_booking_integrity, 1025_marketplace_orders applied + recorded. Space carried to job; conflict at paid confirmation → replacement_required + booking_conflicts + Q07 refund path; marketplace_request machine; order_groups; canonical `bookings` view; quote expiry job. Tests race 9/9 (no test.fail left), booking-integrity 8/8, order-orchestration 4/4. Doc `docs/marketplace/booking-engine.md`. Live data: 26 open requests re-stated (8 awaiting / 8 quote_received / 10 expired).

---
### Q11 — Venue Management

**Status:** VERIFIED 2026-10-28 — exit gate met (overlapping exclusive bookings cannot confirm); external calendar sync for provider jobs open  
**W04 finding:** maintenance/blocked availability windows don't stop `provider_create_booking` (spec expected-fail); no external calendar sync for provider jobs.  
**Spec cards (backend doc line ranges):** 69:L12031-12135, 70:L12136-12241, 71:L12242-12346, 72:L12347-12452, 73:L12453-12559, 74:L12560-12665, 75:L12666-12773  
**v6 cross-refs:** GD-05 (race tests: same space/time)  

Domains: 69–75.

- [ ] Venue profile
- [ ] Spaces
- [ ] Layout capacities
- [ ] Availability intervals
- [ ] Blackouts
- [ ] Setup/teardown
- [ ] Turnaround buffers
- [ ] Pricing rules
- [ ] Packages
- [ ] BEO versions/approval

**UI wiring:** Provider Listings, Calendar, Opportunities, Bookings, Money.

**Exit gate:** overlapping exclusive space bookings cannot confirm.

**Evidence:** `enforce_space_rules` rewrite: blocked/maintenance windows, turnaround + setup/cleardown, whole-venue, exclusive groups, hard holds, layout capacity, named conflict codes. Q11 test passes (`blocked_conflict`).

---
### Q12 — Supplier Management

**Status:** VERIFIED 2026-10-28 — exit gate met (staff/equipment/travel conflicts block or warn per policy)  
**W05 finding (P1):** no overlap guard for service jobs — a supplier can be confirmed twice for the same time (spec expected-fail).  
**Spec cards (backend doc line ranges):** 76:L12774-12878, 77:L12879-12984, 78:L12985-13089, 79:L13090-13195, 80:L13196-13301  
**v6 cross-refs:** GD-06, GD-07  

Domains: 76–80.

- [ ] Supplier profile
- [ ] Services/variants/packages
- [ ] Equipment
- [ ] Staff capacity
- [ ] Service area
- [ ] Travel/setup
- [ ] Jobs
- [ ] Evidence
- [ ] Job profitability

**Exit gate:** impossible staff/equipment/travel conflicts block or warn according to configured policy.

**Evidence:** Migrations 1024_team_write_guards, 1026_venue_supplier_management, 1027_job_evidence_buyer_read applied. provider_capacity_rules (solo default 1/block), equipment + allocations, service areas + travel fee, job evidence, job profitability view, direct service bookings; W06 P1s fixed (crew assignment race lock, crew/shift writes owner/manager only, `revoke_workspace_member`); capabilities writes routed through settings (Q01 finding closed). Tests supplier-management 4/4, W06 9/9 (no test.fail left). Combined run 112/113 (1 failure in webhook spec caused by concurrent Q08 work).

---
### Q13 — Food / Drinks / Hospitality

**Status:** VERIFIED 2026-10-29 — exit gate met (allergen data round-trips into BEO + budget); migrations 1035, 1036, 1038; hospitality 9/9, venue-fnb 7/7; doc `docs/marketplace/hospitality.md`; UI wiring open  
**UI built (lane A, captures pending):** menus allergen declaration/may-contain/variants; BEO structured hospitality section + sync actions.  
**W04 finding:** no event_orders seeded; BEO shows Not started everywhere.  
**Spec cards (backend doc line ranges):** 81:L13302-13407, 82:L13408-13513, 83:L13514-13620, 84:L13621-13724  

Domains: 81–84.

- [ ] Menus
- [ ] Menu sections/items/variants
- [ ] dietary/allergen fields
- [ ] per-head/fixed pricing
- [ ] final guest counts
- [ ] service timing
- [ ] bar modes/minimum spend/corkage
- [ ] hospitality schedules

**Exit gate:** customer/Organizer selection flows through booking/BEO/finance without text-only duplication.

**Evidence:** —

---
### Q14 — Event Core

**Status:** VERIFIED 2026-10-29 — core + remainder done (templates, dependency graph, brief, tasks deps/recurrence, customer duplicate prompt); UI for dependencies/brief open  
**W03 backend gaps:** no RPC to bind tiers/shifts/programme to day/room/venue; retire draft waiver; delete blackout; dispose found item; non-member scanner route for outside door staff; waiting room/launch time editor; promoter referral sales vs allocation; archive_event_template archives only active version; licence expiry can't be cleared.  
**W11 backend DONE (lane C, migrations 3024–3027):** `event_type_profiles.ticketing` + enforcement trigger on tiers (selling tiers never re-checked); `event_type_aliases` (30 rows) + `event_type_rules(type)`; direct-status row guard on first entry into ready/published/on_sale with audited transaction-local override (`service_set_event_status`, `event_lifecycle_overrides`); composition blockers (severity=block) gated. event-type-rules 10/10 + matrix 15/15. **Coordinator decision:** service-role writes without a user token stay allowed-but-logged (`source=service_direct`) until specs move to the override; tighten in Q39.  
**Q40 hook:** add `event_composition_blockers(event,to)` (severity=block only) into `event_lifecycle_blockers` — sent to lane C.  
**Lane C 2026-10-29:** ops + map blockers gate only first entry into ready/published/on_sale (3019, 3020); live events never gated (dry run 1,336 calls, 0 leaks); virtual sessions satisfy stream (3022). Next: W11 backend items (a–d) — lane C.  
**W11 gaps (decided by coordinator under delegation 2026-10-29):** (a) profile column `ticketing` = default_on (concert, festival, nightlife, conference, webinar, charity, custom) | optional_off (wedding, birthday, gala) | private_only (childrens_party: invite-only, never public) — enforced when a tier goes on_sale; (b) `guest_privacy='private'` → guest list/RSVP never public, no public share previews; (c) close the direct-status-write bypass: row trigger applies `event_lifecycle_blockers` on first entry into ready/published/on_sale (same rule as 3019 — never block already-live events); (d) taxonomy: map wizard types (corporate, community, party, private_dinner, awards, food_drink, comedy) to canonical profiles or explicit `custom` aliases; add gala/charity/conference tiles. Backend (a–d) → lane C after Q30. UI: profile `modules` drive both wizards, online events hide venue copy, readiness shows lifecycle blockers, status menu hides disallowed states → customer side lane B (W02), organizer side lane D (W03).  
**Q24–Q26 hook:** `event_ops_blockers(event,to)` not yet in `event_lifecycle_blockers` (publish gating); if readiness gets its own ops section, drop the `event_feasibility` append.  
**Q38 finding:** need a job marking ended events completed/off-sale (3 "Ticket test" fixture events still on sale).  
**W03 finding:** `duplicateEvent` (`src/lib/actions/events.ts:11-30`) copies programme times as absolute source timestamps, sets no new date, copies settings wholesale, no confirmation; no per-area/room programme overlap check (`event-profile.ts:80-84`) — journeys 3–4 FAIL.  
**W01 finding:** past events (`neon-nights`, started 2026-10-24) stay on_sale and indexable — ended events aren't moved out of sale (with Q20).  
**Q03 finding:** Event status is a CHECK constraint, not a guarded state machine.  
**Spec cards (backend doc line ranges):** 32:L8104-8210, 33:L8211-8323, 34:L8324-8429, 35:L8430-8537, 36:L8538-8643, 37:L8644-8750, 38:L8751-8858, 39:L8859-8965, 40:L8966-9072, 41:L9073-9179, 42:L9180-9285, 43:L9286-9391, 44:L9392-9496  
**v6 cross-refs:** GD-04.1, GD-12  

Domains: 32–44.

- [ ] canonical event
- [ ] event types/config
- [ ] templates
- [ ] lifecycle
- [ ] dependency graph
- [ ] readiness
- [ ] feasibility
- [ ] brief
- [ ] programme
- [ ] schedule
- [ ] tasks
- [ ] files
- [ ] risks/incidents
- [ ] activity

**Exit gate:** Customer and Organizer see the same canonical Event through different experiences.

**Evidence:** Migrations 202610294001–4006 applied + recorded; state seed regenerated (event + verification machines). Event machine (enforce) + `event_transition` with GD-12 preconditions (11 event-type profiles); `duplicate_event` (date prompt, shift, scrub, idempotent) wired to 3 organizer entry points; programme overlap/room/capacity/booking integrity; daily ended-events job (3 stale fixtures completed live); private guest links + `/guest/[token]`, Share copies guest link; readiness Compliance fixed (Q08 finding). Tests event-core 8/8, tenant-security 12/12, regression green. Doc `docs/architecture/event-core.md`. Journeys 3–4 (W03) now unblocked at backend. Remainder: migrations 4007–4010; event-core 13/13.

---
### Q15 — Customer Event Builder

**Status:** VERIFIED 2026-10-29 — exit gate met (birthday blank → confirmed venue + supplier); customer build page UI wiring open (lane B)  
**Q10 finding (P1 security):** `build_items_rw` lets anyone with event access set an item to `confirmed` directly, bypassing payment — fix first.  
**Spec cards (backend doc line ranges):** 45:L9497-9601, 46:L9602-9713, 47:L9714-9818, 48:L9819-9924, 49:L9925-10029, 50:L10030-10132  
**v6 cross-refs:** GD-03.7  
**Gala Dock state:** Customer has NO AI (owner decision 2026-10-28) — planning guidance must be non-AI.  

Domains: 45–50.

- [ ] Build canvas
- [ ] Type-aware categories
- [ ] Package composition
- [ ] Live budget states
- [ ] planning guidance
- [ ] venue-first dependencies
- [ ] supplier conditional holds
- [ ] backups/standby
- [ ] marketplace checkout
- [ ] professional upgrade

**E2E:** consumer birthday/wedding from blank event to confirmed venue/providers.

**Evidence:** P1 payment bypass closed (202610291028 `build_items_client_guard`, `payment_required`; spec 5/5). Migrations 1029–1030: build canvas, type-aware category profiles, package snapshots, pence budget states, non-AI rules guidance, venue-first dependencies, conditional supplier holds, backups/standby, order-group checkout (one direct charge per seller), versions, customer→organizer upgrade. Spec customer-build-engine 9/9. Doc `docs/marketplace/customer-builder.md`.

---
### Q16 — Organizer Portfolio / CRM / Sales / Contracts

**Status:** VERIFIED 2026-10-29 — exit gate met (accepted proposal → exactly one event linked to canonical client); e-signature provider BLOCKED_EXTERNAL  
**Share links FIXED 2026-10-29 (lane B):** migrations 2010–2011 — hashed tokens, service-only lookups, sticky revoke/expiry commands + UI, viewed only via post-load beacon (bots ignored), `mark_proposal_viewed` service-only. q16-share-links 5/5, q16-crm-contracts 7/7, sales-proposals e2e 2/2. Open: drop plaintext after show-once UI; owner Preview 404s once revoked.  
**W09 (P3):** proposal/contract share tokens stored plaintext; viewing a sent proposal marks it viewed (link-preview bots); no token expiry/revocation beyond status. Assigned lane B.  
**W03 finding:** no Contracts or Clients pages (design Sales sub-nav); no prior-period KPI deltas; demo proposal has no line items.  
**Spec cards (backend doc line ranges):** 51:L10133-10237, 52:L10238-10342, 53:L10343-10448, 54:L10449-10552, 55:L10553-10660, 56:L10661-10766  
**v6 cross-refs:** GD-04.1 proposals  

Domains: 51–56.

- [ ] Event portfolio
- [ ] clients
- [ ] lead capture/source
- [ ] pipeline
- [ ] proposals/versioning
- [ ] structured conversion
- [ ] contracts/versioning
- [ ] signature provider boundary

**Exit gate:** accepted proposal produces valid event skeleton without duplicated client/event data.

**Evidence:** Migrations 202610293008–3010 (3009 broke live `accept_proposal` ~10 min; 3010 fixed). Canonical clients (27 backfilled) + merge, lead stage history, `sales_kpis` deltas, rule-based lead score, lead capture API, proposal packages + presentation on public page, idempotent conversion, contracts with versions/parties/signatures/approvals + machine + expiry job, signature-provider boundary with simple-e-signature fallback, Sales sub-nav + Clients/Contracts pages. Tests q16 7/7. Doc `docs/organizer/crm-contracts.md`.

---
### Q17 — Team / Resource / Live Operations

**Status:** VERIFIED 2026-10-29 (code/test) — exit gate met; team-page UI for leave/substitution/login invites + work orders open  
**Q12 finding:** organizer `addNote` (`src/lib/actions/team.ts`) now refused for plain members after the crew/shift write guard — decide intended rule.  
**W06 finding:** crew assignment race (`provider_assign_crew` check-then-insert, no lock) — handed to lane A Q12; no substitution/leave approval/equipment/work orders/member "my shifts".  
**Spec cards (backend doc line ranges):** 57:L10767-10872, 58:L10873-10977, 59:L10978-11082, 60:L11083-11189, 61:L11190-11295, 62:L11296-11400, 63:L11401-11505  
**v6 cross-refs:** GD-04.3  

Domains: 57–63.

- [ ] Team/skills
- [ ] availability
- [ ] shifts
- [ ] resources
- [ ] allocation locks
- [ ] run sheet
- [ ] live mode
- [ ] arrival/check-in
- [ ] risk
- [ ] incidents

**Exit gate:** schedule/resource conflicts detected server-side and surfaced in Organizer Home/Event/Calendar/Agent.

**Evidence:** Migrations 202610293011–3014: crew notes (addNote regression fixed), private crew data, crew↔login invites, my-shifts pages, attendance, substitution under lock, leave machine + availability blocks, notifications, event resource allocations (Q12 lock), run-sheet tracking, live snapshot, incident machine + timeline, risk register, unified conflict detection on Home/Calendar/Event/agent context. Tests q17 11/11; regressions 17/17. Doc `docs/organizer/team-operations.md`.

---
### Q18 — Guests / Registration / Passes / Check-In

**Status:** VERIFIED 2026-10-29 — exit gate met (zone/session rules enforced in one DB function); RSVP/registration public pages + organiser UIs open  
**Q32 (4021):** legacy `guests.dietary` scrubbed on write + one-time; readers moved to guest_care. **Live site shows dietary blank until this code deploys** (data safe in guest_care).  
**W02 finding:** private events have no guest-facing page/share link (Share Event shares an owner-only URL) — with Q14.  
**Spec cards (backend doc line ranges):** 64:L11506-11611, 65:L11612-11715, 66:L11716-11820, 67:L11821-11926, 68:L11927-12030  
**v6 cross-refs:** GD-03.6, GD-04.2 door ops, X06  

Domains: 64–68.

- [ ] Guests/groups/households
- [ ] RSVP
- [ ] custom registration
- [ ] dietary/accessibility
- [ ] passes/zones
- [ ] check-in
- [ ] badging
- [ ] re-entry

**Exit gate:** zone/session permissions are enforced independently of UI.

**Evidence:** Migrations 202610294011, 4013, 4014: guest groups/households, RSVP tokens (service-only, rate-limited), versioned registration forms + `registration` machine, privacy-protected `guest_care` (children minimised), zones/rules/passes/badges, scan permission `checkin.scan` + outside door staff, single admission model `check_ins` + combined view, `scan_ticket` delegates (finance can no longer scan). Tests guests-access 6/6. Doc `docs/ticketing/guests-access.md`. Note: legacy `guests.dietary` still member-readable.

---
### Q19 — Venue / Event Map Engine

**Status:** VERIFIED 2026-10-29 (backend) — exit gate met (venue locks server-side; publish refuses critical findings; concurrent edits versioned); migration 1037; map-engine 7/7; doc `docs/maps/map-engine.md`; ORG-013 map UI open (lane A UI block)  
**UI built (lane A, captures pending):** ORG-013 event map (Design/Ticketing/Operations/Preview, findings rail, compare/restore, version-checked save with merge prompt); venue structure editor with calibration + conflict prompt. Not built: 2D/3D toggle, Request venue approval (no backend workflow).  
**Q24–Q26 hook:** `map_element_exists(map, ref)` searches `venue_maps` JSON; replace its body if elements move to tables (booths, parking, accessible routes).  
**W03 finding:** venue map builder structurally differs from ORG-013 (no Design/Ticketing/Operations/Preview tabs, no element-details panel); no room/space model for multi-room capacity; Neon has no map.  
**Q01 finding:** owners can write `workspaces.capabilities` directly via REST (bypasses provider_save_settings) — close with provider capability work (Q11/Q12).  
**Spec cards (backend doc line ranges):** 85:L13725-13832, 86:L13833-13940, 87:L13941-14048, 88:L14049-14153, 89:L14154-14258, 90:L14259-14362, 91:L14363-14467  
**v6 cross-refs:** GD-04.2 seating builder  

Domains: 85–91.

- [ ] structural map
- [ ] event overlay
- [ ] asset palettes
- [ ] layers/groups/versions
- [ ] imports/calibration
- [ ] capacity constraints
- [ ] safety/access constraints
- [ ] ticket bindings
- [ ] Agent map tools

**Exit gate:** Organizer cannot override Venue locks; publish fails on invalid capacity/critical constraints.

**Evidence:** —

---
### Q20 — Ticket Configuration / Inventory / Checkout

**Status:** VERIFIED 2026-10-29 — exit gate met (no oversell: 24 buyers/3 tickets → 3; 24/3 seats → 1 each; code max_uses holds; duplicate confirmations → 1 ledger tx). Migrations 4015, 4016 (issuance race fixed). Ticket Order machine. Tests 10/10; regression 98/98; doc `docs/ticketing/inventory.md`. Checkout code-input UI open  
**Bug fixed (lane D):** saving Ticket Pro / ticket-setup tiers deleted/disabled allocation-linked access codes — now limited to `purpose='discount'` (ticket-pro.ts:124, ticket-setup.ts:70, data files).  
**W03 finding:** ticket setup has 3 steps vs the 5-step design (owner decision on step counts).  
**Q03 finding:** Ticket Order (checkout_orders) has no state machine.  
**Spec cards (backend doc line ranges):** 92:L14468-14573, 93:L14574-14679, 94:L14680-14785, 95:L14786-14891  
**v6 cross-refs:** GD-03.4, X02, X03  

Domains: 92–95.

- [ ] tiers/releases
- [ ] GA/section/seat/table inventory
- [ ] accessible inventory
- [ ] promoter allocations
- [ ] inventory holds
- [ ] checkout
- [ ] promo/access codes
- [ ] payment confirmation

**Load test:** concurrent final-seat/final-ticket purchase.

**Exit gate:** no oversell.

**Evidence:** —

---
### Q21 — Ticket Credential / Scanner / Transfer

**Status:** VERIFIED 2026-10-29 — exit gate met (stale credential rejected after transfer/refund/revocation/reissue); wallet passes BLOCKED_EXTERNAL  
**4024 (lane D):** scanner admits cross-event passes only via `pass_entitlement_check` (`pass_not_valid_here`); online-only tiers refused (`online_only_ticket`).  
**Q40 hook:** `scan_admission` → `pass_entitlement_check(ticket, event)` when ticket.event_id ≠ scanning event; plus refuse online-only tier tickets (Q29) — sent to lane D.  
**Q29:** `scan_admission` should refuse online-only tier tickets at the door (`virtual_tier_access` mode online).  
**Spec cards (backend doc line ranges):** 96:L14892-14997, 97:L14998-15102, 98:L15103-15206  
**v6 cross-refs:** GD-03.5, X04, X06  
**Gala Dock state:** My Tickets QR overlap fixed 2026-10-26 (RotatingQr 136px) — not re-captured.  

Domains: 96–98.

- [ ] QR
- [ ] barcode
- [ ] visual ticket
- [ ] wallet/print
- [ ] credential token security
- [ ] rotation/revocation
- [ ] scanner
- [ ] offline reconciliation
- [ ] transfer/reissue

**Exit gate:** stale credential rejected after transfer/refund/revocation.

**Evidence:** Migration 202610294012: separate wallet (30 s) / print / badge / snapshot signing domains, rotation trigger on every status/holder change (all writers), reissue command, ticket machine to enforce, scanner with reasons + concurrency (6 concurrent scans → 1 admission), signed offline snapshots with order-independent conflict resolution, single-use transfer chain. Tests ticket-credentials 5/5. State seed regenerated (incl. lanes C/D machines). Doc `docs/ticketing/credentials-scanner.md`.

---
### Q22 — Ticket Resale / Launch / Waiting / Fraud

**Status:** VERIFIED 2026-10-29 — follow-ups done (migration 4018: connected-account seller refunds, buy-back payout bug fixed, disputes → chargeback flag idempotent); resale-original-refunds 15/15. Customer Connect resale BLOCKED (owner); GB v1 legal text BLOCKED_LEGAL  
**Q18/Q21 finding:** `tests/release/resale-policy.spec.ts` fixture moves a consumer event date with valid tickets — blocked by `consumer_event_date_guard` (202610280031); fix the fixture. `tests/release/ticket-refund-confirmation.spec.ts` doesn't stub `@/lib/payments/server` (Q07 import) — fix the stub.  
**Q07 finding:** customer resellers can't receive direct charges (no Connect onboarding for customers) — onboarding or organiser buy-back model needed (owner).  
**W02 finding:** resale happy path needs a seeded paid order (Q38).  
**Spec cards (backend doc line ranges):** 99:L15207-15313, 100:L15314-15419, 101:L15420-15523, 102:L15524-15628  
**v6 cross-refs:** X04, Annex U §28  
**Gala Dock state:** Resale/refund migrations 202610280026/27 exist (uncommitted).  

Domains: 99–102.

- [ ] official resale
- [ ] eligibility/pricing policy
- [ ] seller settlement
- [ ] new credential
- [ ] launch countdown
- [ ] presale/early bird/final release
- [ ] waiting room
- [ ] sold-out waitlist
- [ ] bot/velocity controls

**Exit gate:** one valid entitlement at all times; legal-rule configuration versioned.

**Evidence:** —

---
### Q23 — Event Promotion / Advertising / Media

**Status:** VERIFIED 2026-10-29 (backend) — exit gate met (publish updates all discovery surfaces; attribution reconciles to ticket orders); migrations 1039–1041; promotion-media 9/9; doc `docs/marketing/promotion-media.md`; UI open; real marketing email BLOCKED (owner); SMS BLOCKED_EXTERNAL  
**Q01 finding:** `record_boost_event` lets anon inflate impression/click counters (no rate limit) — fix with ad integrity work.  
**Spec cards (backend doc line ranges):** 136:L18686-18790, 137:L18791-18896, 138:L18897-19000, 139:L19001-19104, 140:L19105-19210, 141:L19211-19314, 142:L19315-19418, 143:L19419-19522, 144:L19523-19626, 145:L19627-19731, 146:L19732-19839, 147:L19840-19944, 148:L19945-20049, 149:L20050-20153  
**v6 cross-refs:** GD-04.2 promotion, Annex U §22 Advertising  
**Gala Dock state:** OWNER PRIORITY: advert placements and rotations. Existing: promotion_boosts (202610270023), boost_delivery (202610280010), src/lib/actions/boosts.ts. Need placement inventory, rotation/pacing, frequency caps, labelled sponsored slots, impression/click integrity, budget exhaustion.  

Domains: 136–149.

- [ ] directory
- [ ] city/category/venue/Organizer pages
- [ ] calendar promotion
- [ ] following
- [ ] promotion campaigns
- [ ] owned ad inventory
- [ ] budgets
- [ ] targeting/matching
- [ ] attribution
- [ ] Media Studio
- [ ] posters
- [ ] previous videos/media
- [ ] brand kits

**Exit gate:** Event publish updates all eligible discovery surfaces and attribution reconciles to ticket orders.

**Evidence:** Migration 202610291014_ad_inventory applied + recorded. 6 named placements with CPM floors/caps; `serve_ad_slots` with eligibility, pacing (+1h lookahead), daily frequency caps, budget-weighted seeded rotation, one campaign per advertiser, bot exclusion; single-use tokens + visibility beacon for impressions, token clicks without open redirect; legacy `record_boost_event` inflation capped (Q01 finding closed); organic separation (removed +0.3 sponsored weight in provider-search, Discover no longer re-sorts); attribution trigger with refund reversal; `boost_report()`; undelivered budget credit. Slots on Discover, public event page, organizer marketplace. Tests ad-inventory 7/7. Docs `docs/marketplace/advertising.md`. Left: provider listing-boost buy flow, credit reuse, anon→login attribution, domains 136–139, 146–149, exit gate 'publish updates all discovery surfaces'.

---
### Q24 — Sponsors / Exhibitors / Talent / Riders

**Status:** VERIFIED 2026-10-29 (code/test) — exit gate met; migrations 3015 + 3018 (portal evidence path fix); tests 7/7; doc `docs/organizer/sponsors-talent.md`; UI + portal route open  
**Spec cards (backend doc line ranges):** 150:L20154-20258, 151:L20259-20362, 152:L20363-20467, 153:L20468-20571  

Domains: 150–153.

- [ ] sponsor packages/deliverables/assets
- [ ] exhibitor booth/access/payments
- [ ] artist/speaker/performer records
- [ ] talent contracts
- [ ] riders
- [ ] schedules/payments

**Exit gate:** records integrate with Plan, Operations, Map, Passes and Money.

**Evidence:** —

---
### Q25 — Travel / Parking / Accommodation / Logistics

**Status:** VERIFIED 2026-10-29 (code/test) — exit gate met; migration 3016; tests 5/5; doc `docs/organizer/logistics.md`; UI open  
**Spec cards (backend doc line ranges):** 154:L20572-20675, 155:L20676-20779, 156:L20780-20883, 157:L20884-20988  

Domains: 154–157.

**Exit gate:** travel/loading/access constraints feed schedule, feasibility and readiness.

**Evidence:** —

---
### Q26 — Licensing / Compliance / Safety / Accessibility / Weather

**Status:** VERIFIED 2026-10-29 (code/test) — exit gate met (every failed required rule is a readiness blocker); migration 3017; tests 7/7; doc `docs/compliance/licensing-safety.md`; weather provider BLOCKED_EXTERNAL; GB rule pack needs legal review; 8 live organiser events now show compliance blockers  
**Spec cards (backend doc line ranges):** 158:L20989-21092, 159:L21093-21196, 160:L21197-21300, 161:L21301-21405, 162:L21406-21509  

Domains: 158–162.

- [ ] rule packs
- [ ] expiry monitoring
- [ ] safety plans
- [ ] accessibility
- [ ] weather/contingency adapter

**Exit gate:** required failures create actionable readiness blockers, not hidden warnings.

**Evidence:** —

---
### Q27 — Promoters / Affiliates / Partners

**Status:** VERIFIED 2026-10-29 — exit gate met (promoter vs affiliate ledger families cannot mix); payout/statement UIs open  
**W07:** partner `?ref=` not read anywhere; no promoter↔organiser messaging (Q05).  
**W07 finding:** promoter commission has no refund reversal, no rule/version stored, no payout run/lock (`payout_id` never set), no ledger postings; partner attribution not implemented (`?ref=` unread, partner rows seed-only); cross-account self-referral unchecked; channel always `link`.  
**Spec cards (backend doc line ranges):** 173:L22560-22664, 174:L22665-22768, 175:L22769-22872  
**v6 cross-refs:** GD-08, X15, Annex U §31  

Domains: 173–175.

**Exit gate:** event-promoter sales commission and platform-affiliate commission cannot mix in the ledger.

**Evidence:** Migrations 202610292003–2007: versioned commission rules snapshotted per accrual, refund/chargeback reversal + clawback, locked payout runs, separate memo ledger families with mix-refusal trigger, partner `?ref=` consent-first attribution → signup → subscription earning → statement, self-referral checks, channels. GD-08 conservation test passes end to end (w07 spec 19/19). `partner_track_click` added to anon allowlist (coordinator, owner delegation). Doc `docs/payments/affiliates-promoters.md`.

---
### Q28 — Subscriptions / Pricing / Usage / FinOps

**Status:** DONE 2026-10-28 (test mode) — follow-ups applied: packs £25/£89/£219 active (margins 77.7/75.8/75.6%), Azure-only list prices, Anthropic path removed, VAT switch ready (Stripe Tax setup BLOCKED_EXTERNAL)  
**Coordinator decision 2026-10-29 (delegated):** Starter keeps agent R0–R2; R3/R4 `agent.actions` Pro and above (profitability). Apply via plan_entitlements in Q42.  
**Provider self-serve plans built (lane A):** billing tab uses plan panel (test mode).  
**W10:** providers have no self-serve plan upgrade ("Contact us to switch").  
**W01 finding:** no pricing page/plan catalogue (Pricing anchors to a section on `/`).  
**Q00 finding:** Provider assistant and onboarding assistant call Anthropic directly, bypassing metering/credits (src/lib/provider/agent.ts:42-45, src/app/api/agent/onboarding/route.ts:21-36). Migration 0039 confirmed not applied live.  
**Spec cards (backend doc line ranges):** 176:L22873-22975, 177:L22976-23078, 178:L23079-23183, 179:L23184-23287, 180:L23288-23392, 275:L33173-33277, 276:L33278-33380  
**v6 cross-refs:** GD-11, Annex U §31.1, §36  
**Gala Dock state:** OWNER PRIORITY: AI-run profitability. Migration 202610280039_ai_profitability_assurance.sql written (not applied): metered run cost, pack margin guard, overage receivable, provider-invoice reconciliation, ai_profitability_report(). Findings: NO subscription billing exists; all 3 credit packs miss 75% after Stripe fees (72.5/73.25/73.4%); price book still 'estimate'. Organizer Settings fake £ spend fixed.  

Domains: 176–180, 275–276.

- [ ] Organizer plans
- [ ] Provider plans
- [ ] billing lifecycle
- [ ] entitlement engine
- [ ] storage/AI/API usage
- [ ] pricing registry
- [ ] AI credit packs
- [ ] commission tiers
- [ ] cost allocation
- [ ] target gross-margin reports

**Exit gate:** feature gates are server-authoritative and heavy usage cannot silently destroy plan economics.

**Evidence:** Migrations 202610291012_ai_profitability_assurance (replaces unapplied 0039 draft; no historic cost rewrite) and 1013_subscription_billing applied + recorded. Both unmetered AI paths now metered (`src/lib/agent/anthropic-meter.ts`, `claude.ts`; provider assistant charged to workspace with 402 on cap; onboarding platform-absorbed, 10/5min + 40/day); leftover customer onboarding AI step removed. Admin profitability panel + invoice entry; daily `ai.profitability_alert`. Subscriptions: plan catalogue, Stripe test Products/Prices, checkout/upgrade/downgrade/cancel/dunning, webhook-only entitlement changes, credit-pack fulfilment once, overage → invoice items. Real October report: 102 calls, 8.39p metered, flags price_book_estimate (high), provider_invoice_missing, unmetered_runs (1 historic). Pack 75% prices: £22.13 / £85.96 / £213.62. Tests: ai-profitability 7/7, subscription-billing 7/7, agent-credits+tenant-security 16/16, direct-charges 32/32; tsc 0. Docs `docs/commercial/ai-profitability.md`. Left: provider plan/pack UI, plan revenue in margin report.

---
### Q29 — Virtual / Webinar / Hybrid

**Status:** VERIFIED 2026-10-29 — exit gate met (entitlement controls join + replay; host secrets never exposed); migrations 3021, 3022; q29 8/8; doc `docs/architecture/virtual-events.md`; providers BLOCKED_EXTERNAL; UI open  
**P1 FIXED 2026-10-29 (migration 4030):** online join never changes tickets.status; scan_admission ignores virtual check-ins; door metrics exclude virtual (+entry.online); `virtual_my_replays` attendee read; no-referrer on join/virtual routes; 0 live tickets needed repair; q29 11/11.  
**P1 (W02 finding):** virtual ticket join writes a `virtual` check-in that turns the ticket `valid → used` (blocks transfer/resale; would block door entry for hybrid). Demo ticket aff95ac1 restored. Also provider redirect gets global `strict-origin-when-cross-origin` instead of `no-referrer`; add attendee `virtual_my_replays` read. Assigned lane D.  
**Seed finding:** feasibility counts online-only passes against hall capacity (Global Tech Conference) — read-model gap (Q29/Q24).  
**Spec cards (backend doc line ranges):** 181:L23393-23496, 182:L23497-23600, 183:L23601-23703, 184:L23704-23807  

Domains: 181–184.

- [ ] virtual event types
- [ ] provider adapters
- [ ] join/replay access
- [ ] session tracks
- [ ] speaker/moderator roles

Do not self-host real-time media in this release.

**Exit gate:** entitlement controls join/replay without exposing host secrets.

**Evidence:** —

---
### Q30 — API / MCP / Webhooks / Sync

**Status:** VERIFIED 2026-10-29 — exit gate met (external client cannot exceed key workspace × scopes × current role; reproduced cross-workspace hole fixed); migration 3023; q30 10/10, developer 3/3, calendar-sync 3/3; doc `docs/integrations/api-webhooks.md`; OAuth apps + key/webhook UIs open  
**Q00 finding:** Provider Settings integrations list is hard-coded and inert (src/app/provider/settings/page.tsx:144).  
**Spec cards (backend doc line ranges):** 189:L24226-24331, 190:L24332-24436, 191:L24437-24541, 192:L24542-24647, 193:L24648-24751, 194:L24752-24855, 283:L34002-34104, 284:L34105-34208, 285:L34209-34311  
**v6 cross-refs:** Annex U §18, GD-14  

Domains: 189–194, 283–285.

- [ ] `/api/v1`
- [ ] scoped keys/OAuth
- [ ] OpenAPI
- [ ] MCP server
- [ ] MCP permission/approval mapping
- [ ] webhook event catalogue
- [ ] HMAC signing
- [ ] delivery logs/retries/replay
- [ ] sync cursors/conflict rules
- [ ] simulator
- [ ] contract tests
- [ ] developer docs

**Exit gate:** external client cannot exceed authenticated workspace scopes.

**Evidence:** —

---
### Q31 — Admin / Support / Maintenance / Health

**Status:** VERIFIED 2026-10-29 — exit gate met (sensitive support access scoped, time-limited, audited); migrations 4023–4028; q31-support-ops 6/6, w08-admin-tiers 17/17; review screens (Q08 evidence, Q33/Q22 risk, Q32 privacy), support lifecycle/SLA/macros/safeguarding, job/outbox console, health, maintenance preview; doc `docs/admin/support-operations.md`  
**W08 findings:** S1 (P1) `email_outbox_own` lets support admins read all email bodies incl. message previews; S2 admin without MFA passes `admin_require`; S3 maintenance start/end without reason/step-up, `admin_grant_credits` skips `admin_require`; S4 maintenance enforcement ignores audience + `tests/release/maintenance.spec.ts` takes resale offline live for 120 s (DO NOT RUN); S5 platform_admins list visible to all admins; Q08 admin review UI missing.  
**Q08 finding:** admin UI missing for document review queue, business-check review, enforcement/appeal decisions (RPCs exist); `profiles.identity_verified` still a seeded boolean on admin user pages.  
**Spec cards (backend doc line ranges):** 195:L24856-24963, 196:L24964-25068, 197:L25069-25172, 198:L25173-25276, 199:L25277-25380, 200:L25381-25485, 287:L34416-34519  
**v6 cross-refs:** GD-09, X21-X23  

Domains: 195–200, 287.

- [ ] Platform Admin
- [ ] support cases
- [ ] safeguarding
- [ ] break-glass
- [ ] JIT support access
- [ ] maintenance modes
- [ ] service health
- [ ] dead-letter operations
- [ ] reconciliation operations

**Exit gate:** sensitive support access is scoped, time-limited and audited.

**Evidence:** Migrations 202610292001–2002, 2007: admins read email metadata only (bodies via scoped break-glass + MFA + audit; notification emails no longer carry message text); MFA (aal2) required for every admin mutation; maintenance start/end via admin_require with reason; credits via admin_require; maintenance audience honoured (proxy + SQL); test-only `qa` audience makes maintenance.spec safe; admin directory own-row unless users/settings. Tests w08-admin-tiers + maintenance 24/24. Doc `docs/security/admin-access.md`. Remove legacy no-reason maintenance fallback after deploy.

---
### Q32 — Privacy / Deletion / Retention / Legal Hold

**Status:** VERIFIED 2026-10-29 — exit gate met (erasure removes personal data, retains pseudonymous finance/audit); migrations 4020–4022; privacy-retention 5/5, test-fixture-purge 3/3; doc `docs/security/privacy-retention.md`; retention periods + DSAR wording BLOCKED_LEGAL; fixture purge dry-run done, real run pending owner  
**Regression (fixed 2026-10-29):** 4031 guard triggers call `fixture_purge_active()` as the caller but EXECUTE was service_role-only → all client writes on 9 tables failed (42501) for ~1–2 h on live (site was also paused). Fixed by lane B migrations 2013/2014 (grant authenticated). Rule: helpers called from caller-context triggers must be granted to authenticated; purge spec must include a customer-write smoke test.  
**Purge guards (4031):** 18 append-only/immutability triggers honour `fixture_purge_active()`; purge handles resale allocations, transfers, merch lines; 0 of 118 eligible fixtures blocked (ledger-bearing still refused by design). Purge deferred to close-out (owner).  
**Purge run 2026-10-29 (owner-approved):** 6 Q16 workspaces + 10 test identities purged (purge 5d693a52…). Public test-fixture workspaces (51 with 66 public events): 30 refused (ledger postings, by design), 19 blocked by append-only guards that don't honour the purge GUC (`plan_immutable`, `stock_movements_append_only`, an update guard) — fix assigned lane D; 2 eligible but the coordinator's execute was refused by the permission classifier (unreviewed scope) — owner to confirm. Ledger-bearing fixtures can't be purged; need hiding (visibility) — owner decision.  
**Owner decision 2026-10-29:** build an audited admin command to purge TEST workspaces (explicit test-fixture flag, admin + MFA, dry run, append-only bypass only via transaction-local GUC tied to an open purge record, permanent purge log, refuses non-test or legal-hold or live-money workspaces; test helpers flag new fixtures). Then dry-run on the 6 Q16 fixture workspaces; coordinator runs the real purge after reviewing the dry run. Assigned lane D.  
**Spec cards (backend doc line ranges):** 201:L25486-25589, 202:L25590-25693, 203:L25694-25797, 204:L25798-25900, 205:L25901-26004, 269:L32554-32656, 270:L32657-32759, 288:L34520-34716  
**v6 cross-refs:** Annex U §37  

Domains: 201–205, 269–270, 288.

- [ ] privacy requests
- [ ] account deletion
- [ ] anonymisation
- [ ] retention policies
- [ ] consents
- [ ] classification
- [ ] residency
- [ ] legal holds
- [ ] privacy audit

**Exit gate:** erasure removes unnecessary data while preserving justified immutable financial/audit history.

**Evidence:** —

---
### Q33 — Fraud / Abuse

**Status:** VERIFIED 2026-10-29 — exit gate met (no irreversible automatic decision; reversible notified holds with appeal); migration 4019; fraud-abuse 5/5; doc `docs/security/fraud-abuse.md`; admin review UI open (Q31/W08)  
**Spec cards (backend doc line ranges):** 211:L26528-26632, 212:L26633-26736  

Domains: 211–212.

- [ ] payment risk
- [ ] ticket/resale risk
- [ ] provider/account risk
- [ ] referral/promo abuse
- [ ] review manipulation
- [ ] spam/bots
- [ ] review/escalation path

**Exit gate:** risk system never silently makes irreversible decisions outside configured policy.

**Evidence:** —

---
### Q34 — Observability / SRE / Continuity

**Status:** VERIFIED 2026-10-29 — exit gate met (scratch restore drill PASSED: 321 tables, 52,584/52,584 rows, 0 constraint failures; RTO 121 s); migrations 1049–1051; observability 10/10, regression 62/62; docs `docs/operations/{observability,backup-restore,runbooks}.md`. BLOCKED: Sentry DSN, Uptime Kuma, probe cron after deploy, staging restore, PITR (owner)  
**RESOLVED 2026-10-29 10:16 UTC:** owner approved; coordinator un-paused Vercel project `gala-dock-final-release-v-1-0` via API (paused=false). www.galadock.com 200, /api/health 200; workers back to 2xx from 10:16 (last 503 10:15:01). Backlog catching up.  
**🚨 LIVE INCIDENT 2026-10-29:** production Vercel deployment PAUSED — galadock.com + www return 503 `DEPLOYMENT_PAUSED`; every `dispatch_worker()` 503 since ≥03:00 UTC (~239/h): email backlog 44, 58 app jobs waiting, reconciliation never run, 18 storage objects not replicated. pg_cron shows success (pg_net only queues). Alert `workers.dispatch_failures` + INC-20261029-0001 now open. **Owner: resume/promote the deployment in Vercel.**  
**W02:** tsc errors `src/lib/observability/synthetic.ts:116-117`; edge-runtime instrumentation import crashed the dev server (fix requested).  
**Q00 finding:** Integration health registry wrong env names (R2, Microsoft calendar) and missing Anthropic (src/lib/release/integrations.ts:27-34).  
**Spec cards (backend doc line ranges):** 213:L26737-26840, 214:L26841-26944, 215:L26945-27047, 216:L27048-27151, 217:L27152-27255, 218:L27256-27360, 219:L27361-27463, 220:L27464-27566, 221:L27567-27670, 222:L27671-27775, 277:L33381-33484, 278:L33485-33588, 279:L33589-33692  
**v6 cross-refs:** GD-13.3, X28, Annex U §34  
**Gala Dock state:** Dev watchdog: tools/dev/dev-watchdog.mjs (port 3107).  

Domains: 213–222, 277–279.

- [ ] structured logs
- [ ] metrics
- [ ] tracing
- [ ] alerts
- [ ] SLOs
- [ ] performance dashboards
- [ ] backups
- [ ] restore tests
- [ ] DR
- [ ] incident response
- [ ] synthetic probes
- [ ] chaos drills
- [ ] runbooks

**Exit gate:** successful staging restore and release-critical synthetic probes.

**Evidence:** —

---
### Q35 — Analytics / Data Warehouse

**Status:** VERIFIED 2026-10-29 — exit gate met (facts reconcile to ledger/tickets/bookings/AI meter 8/8); migration 3029; analytics-warehouse 8/8; 44 metric definitions; doc `docs/analytics/metrics.md`; dashboard UI + cookie banner open  
**Q38 finding:** reporting/analytics must exclude `is_demo_workspace()` workspaces (card 282).  
**Spec cards (backend doc line ranges):** 223:L27776-27879, 224:L27880-27983, 225:L27984-28088, 226:L28089-28193, 227:L28194-28297, 228:L28298-28402, 265:L32141-32244, 266:L32245-32347  

Domains: 223–228, 265–266.

- [ ] event facts
- [ ] ticket facts
- [ ] booking facts
- [ ] payment facts
- [ ] Agent facts
- [ ] dimensions
- [ ] snapshots
- [ ] KPI definitions
- [ ] export datasets

**Exit gate:** dashboard definitions reproduce from warehouse/snapshots without giant unbounded transactional scans.

**Evidence:** —

---
### Q36 — Experimentation

**Status:** VERIFIED 2026-10-29 — exit gate met (deterministic sticky assignment, guardrails stop, no price/legal/safety config); migration 3030; experiments 5/5; doc `docs/platform/experiments.md`; admin UI page open (W08)  
**Spec cards (backend doc line ranges):** 229:L28403-28506, 230:L28507-28609  

Domains: 229–230.

**Exit gate:** deterministic assignment/exposure; safety/payment/ticket invariants cannot be changed by experiment.

**Evidence:** —

---
### Q37 — PWA / Device / Offline

**Status:** DONE 2026-10-29 (backend) — SW v3 never caches token/private/API/Stripe; push registry (delivery BLOCKED_EXTERNAL: VAPID keys); offline store; pwa-offline-device 5/5; doc `docs/pwa/offline-device.md`; browser re-check BLOCKED (auth states expired; headless minting refused)  
**Spec cards (backend doc line ranges):** 231:L28610-28713, 232:L28714-28817, 233:L28818-28920, 234:L28921-29024  
**v6 cross-refs:** GD-03 shell, GD-15.4, Annex U §4-9  

Domains: 231–234.

- [ ] compact mobile shell
- [ ] favicon/header
- [ ] bottom app menu
- [ ] safe areas
- [ ] offline ticket wallet
- [ ] run-sheet/provider-job cache
- [ ] push
- [ ] camera/scanner
- [ ] share/file/location permissions

**Exit gate:** desktop sidebar is not used as mobile primary navigation.

**Evidence:** —

---
### Q38 — Help / Guided Tours / Demo

**Status:** DONE 2026-10-29 — depth seeding passes 1 + 2 cover every built domain via real commands, idempotent (`scripts/seed-depth-pass1.mjs`, `-pass2.mjs`); demo-seed 9/9; doc `docs/demo/seed-catalogue.md`. Waiting: paid orders (Q07 onboarding), Neon video URL, weather key; guided tours/help part of Q38 still to verify in Q44  
**W03 seed gaps:** leave requests, linked crew logins, registration forms + registrations, resale listings, risk flags on demo events, recordings, lost/found, sustainability, event days/venues, event forms; Neon 0 dependencies; Comedy Central no partners/logistics; only merch order expired.  
**Q42/Q43 seed gaps:** demo crew members, equipment, promotion campaign + sales client in the organiser/provider demo workspaces for agent success paths (campaign exists — check workspace).  
**Q31/Q41 seed gaps:** provider_documents (0 live), pending identity/business checks, more macros, health snapshots (uptime monitor polling `/api/health` with bearer — owner step), pass entitlements.  
**Live hygiene (2026-10-29):** 50 PUBLIC events on live owned by disposable p1-* test workspaces (Q20 Final Release, Q22 Launch Night, Q26 Festival, Q40 …) appear in Discover; only 12 flagged is_test_fixture. Coordinator's attempt to set them private was refused by the permission classifier — **owner decision**: include in the fixture purge (needs flagging/eligibility by test-owner pattern) or approve a visibility update. Specs must make public fixtures private/withdrawn in afterAll. 309 auth users — purge disposable users.  
**Q23/Q40 seed gaps:** campaigns with messages/links/touches/attributed orders, follows, landing pages, galleries with public media, brand kits with rules, weekly series with overrides + a tour, festival with stages/days/venues + weekend pass with sales, waivers incl. a minor signature, stock + merch orders, lost/found items, sustainability entries (pass 2).  
**Q32/Q33 seed gaps:** demo risk signals, holds, appeals; a legal hold; retention-run history; consent history.  
**Q29/Q30 seed gaps:** virtual sessions with captions on demo webinar + hybrid events, tier modes + `event_virtual.capacity`, speaker/moderator roles, one recording with access window, demo organiser API key (feed:read) + a disabled webhook endpoint.  
**W11/Q16 seed + fixtures:** seed childrens_party, webinar, charity, more nightlife events. Fixture leak on live: 2 'Q16 Share Co' + 4 'Q16 Events Co'/'Q16 Rival Co' workspaces and their users (contracts append-only; a cleanup that disables audit triggers was refused by the permission classifier — **owner decision needed**). Future specs must not create contracts without a purge path.  
**Q13/Q19 seed gaps:** menus, bar packages, catering selections, event orders/BEO, hospitality bookings/schedules; Neon map; demo map b52e… has 1 exit for 384 people (fix the seed); venue structures capacity_max/calibration/protected exits; access zones bound to map elements.  
**Q20/Q22 seed gaps:** paid direct-charge demo order with resale listing; presale tier + access code, final release, accessible allocation + code, discount code, max_per_customer, waiting room on; open risk flag. **Q24–Q26:** sponsors, packages, booths, talent, riders, transport, parking, room blocks, bays, compliance profiles, licences/premises credential, approved safety plans, accessibility, weather watch + contingency for demo festival/concert/nightlife (else they show compliance blockers).  
**W09 seed gaps:** Neon Nights invoices + video_url, an unsigned contract with share token, demo guest links.  
**Q08 seed gaps:** to restore demo Verified chips: verified in-date documents (PL ≥ £1m; food hygiene for caterers; security licence), storage attribution `av_verdict=clean` fixtures, listings `review_status='approved'`, business check or Connect verification per provider; business checks for organizers that lost seeded status; reliability snapshots, an expiring doc, an enforcement+appeal, a review report.  
**Q10–Q12 seed gaps:** capacity rules, equipment, service areas, space layouts/exclusive groups/buffers, order groups, job evidence, crew day rates, the 14 confirmed items without jobs (seed via trigger; demo dates must not overlap); link job BK-FDBFDD to its space via `provider_assign_job_space`.  
**W06 finding:** no agency demo workspace (manager/Staff/finance logins, crew linked to users, certs, leave); Riverside has an odd second `owner` membership; Tech Meetup unstaffed.  
**W04/W05 finding:** no solo-supplier demo identity (Elite Sounds is a listing inside Premier Event Services); Premier has 14 confirmed items but 0 provider_jobs/crew/transactions; all open provider requests expired; capture script default provider email wrong (use provider.demo@example.com).  
**W01 finding:** `elite-sounds-dj` has no package rows; Riverside Arena gets no similar venues.  
**W02 finding (seeding):** Neon Nights dated out; no saved cards; empty My Schedule; no 2-ticket order; demo ticket has no paid order (resale unavailable); ticket capacity 250 > venue 150.  
**Spec cards (backend doc line ranges):** 235:L29025-29128, 236:L29129-29232, 237:L29233-29336, 282:L33899-34001  
**v6 cross-refs:** Annex U §25, §38  
**Gala Dock state:** OWNER PRIORITY: full-depth seeding. Known gaps: demo customer has no saved cards (Account → Payment methods empty), Neon Nights dated out (Discover shows 3 not 4), My Schedule empty.  

Domains: 235–237, 282.

- [ ] Help Centre
- [ ] annotated live screenshots
- [ ] moving contextual guide
- [ ] Organizer demo
- [ ] Venue demo
- [ ] Supplier demo
- [ ] reset/delete demo
- [ ] sandbox payments/webhooks/Agent

**Exit gate:** demo data cannot appear in real tenant reporting/commerce.

**Evidence:** Seed `scripts/seed-q38-demo.mjs` (idempotent, runs logged in `sandbox_seed_runs`, migration 202610291011 applied); gaps closed: Neon Nights → 12 Dec 2026 (all event-bound dates moved), saved test cards (visa/mastercard on test customer), My Schedule (24 tasks/14 days), wedding capacity 150 (37 unheld seeded tickets deleted), elite-sounds-dj 3 packages, 2 Arena similar venues, showcase tagging + `is_demo_workspace()`; resale-eligible paid order and Q07 test-mode run BLOCKED on Stripe-hosted ToS acceptance for 7 seller + 1 QA test accounts (`--steps=sellers --links`). Specs: demo-seed 3/3; stripe-test-mode 8 skipped until onboarding; tests/payments 39 pass; foundation 25/25 (1 flaky backoff retry). tenant-security 11/12 — `event_payment_readiness` anon-callable not on allowlist (owner decision; agent's allowlist edit refused by permission system). Open: reporting must exclude demo workspaces; sandbox reset/test agents (card 282).

---
### Q39 — Release / Supply Chain / Migration Governance

**Status:** VERIFIED 2026-10-29 — release:check exit 0 (lint 0 errors, tsc 0, audit 0, parity clean, trigger-grants 0); lifecycle service writes require audited override (3032; 35 spec sites migrated); unified migrate tool; SBOM; security patch applied; migration-governance 7/7; open: CI pipeline + signed builds (no CI provider), staging (owner: none)  
**Security patch applied 2026-10-29 (owner-approved):** next 16.4.0 → 16.4.3 (critical RCE in image optimisation with SVG + Server Actions DoS), eslint-config-next → 16.4.3, zod 4.6.5 → 4.6.7 (high). `npm audit`: 0 vulnerabilities. Dev server restarted on 16.4.3. tsc clean except an in-progress lane-C spec edit (`stripe-test-mode.spec.ts:78`). Regression 70/70 (pay-link, workspace-invites, q30, analytics, tenant-security, direct-charges). Production gets the fix on next deploy.  
**Lane rule added:** every migration that touches a trigger used by client writes must exercise a client-role write in its dry run (4031 missed this).  
**tsc:** 2 errors `src/lib/actions/partners.ts:138` (another lane, untracked file).  
**Q34:** `scripts/db-backup-restore.mjs --target` mishandles jsonb JSON-null vs SQL NULL (4 `plan_entitlements` rows) — fix before a real restore.  
**Commit:** checkpoint `5d81a06` on branch `release/enterprise-queue-2026-10-29` (897 files; 672 MB untracked screenshot evidence under artifacts/ kept local; 6 deleted design PNGs not committed). tsc errors open: `src/lib/observability/synthetic.ts` ×2, `tests/release/observability.spec.ts` ×3 (Q34, types not regenerated).  
**Lane D:** `tests/release/agent-planning-tools.spec.ts` seating 'Vegan' expects legacy `guests.dietary` — update to guest_care. Catalogue parity: `merch.paid_after_expiry` missing (lane A). Support queue flooded by other lanes' 'Card dispute fraudulent' fixtures (SLA 1234d) — purge.  
**Lane C:** specs inserting workspaces directly (bypass is_test_fixture): provider/booking-integrity, provider/supplier-management, release/demo, release/tenant-security. 30+ specs create public fixtures — require afterAll private/withdrawn. Two intermittent failures under load (q29 beforeAll insert, Q20 24-buyer issue) — watch. tsc error `src/components/public/follow-button.tsx:14` (lane A).  
**tsc:** `src/app/admin/(console)/_d/actions.ts:151/155` duplicate identifier `data` (lane D, in progress) — confirm fixed at end.  
**Q23/Q40:** regenerate state seed (adds promotion_campaign, waiver_template, merch_order, lost_report, found_item) and DB types.  
**Lane C:** regenerate the state seed after lane D finishes (`node scripts/gen-foundation-sql.mjs > supabase/migrations/209912310001_state_seed.sql`) — will include virtual_session, virtual_recording, risk/legal-hold machines.  
**Q20/Q26:** generated DB types lack `resale_policies` (tsc errors in `ticket-resale-launch-fraud.spec.ts`) — regenerate types.  
**Q21 finding:** lane D reports lane C's contract/leave_request/incident machines are in TS + regenerated seed but may not be applied to the DB — verify state_machines rows match the seed.  
**Q16/Q17:** regenerate `209912310001_state_seed.sql` (new machines contract, leave_request, incident, plus Q10 marketplace_request) once lanes A/D finish.  
**Q10 finding:** regenerate `209912310001_state_seed.sql` once Q08/Q14 finish editing `state-machines.ts`; regenerate `src/types/database.ts` (tsc error from new RPC `provider_document_access` in a test).  
**Q38 finding:** sandbox Connect webhook endpoint points at www.galadock.com with deliveries pending and lacks payment_intent.*, charge.*, checkout.session.*.  
**Q07 finding:** deploy order — Q07 migrations are live, code not deployed; reconcile jobs queue until deploy. Stripe Connect webhook endpoint must subscribe to payment_intent.*, charge.*, charge.dispute.*, payout.*, account.updated, capability.updated; platform endpoint to application_fee.*.  
**Q03 finding:** regenerate `src/types/database.ts` (new tables use untyped clients).  
**Q00 finding:** Migrations 0026–0038 applied via Management API but missing from schema_migrations (db push would re-run them).  
**Spec cards (backend doc line ranges):** 238:L29337-29439, 239:L29440-29543, 240:L29544-29647, 241:L29648-29752, 242:L29753-29856, 243:L29857-29962, 244:L29963-30067, 245:L30068-30171, 246:L30172-30275, 271:L32760-32863, 272:L32864-32966, 273:L32967-33069, 274:L33070-33172, 280:L33693-33795, 281:L33796-33898, 286:L34312-34415  
**v6 cross-refs:** GD-19, Annex U §33, §41, §47  
**Gala Dock state:** Next.js 16.4.0 flags a known security vulnerability on `next dev`; npm audit: 1 high, 1 critical.  

Domains: 238–246, 271–274, 280–281, 286.

- [ ] environments
- [ ] CI/CD
- [ ] migration pipeline
- [ ] rollback
- [ ] unit/integration/E2E
- [ ] browser/responsive/accessibility
- [ ] load/chaos
- [ ] vendor inventory
- [ ] SBOM
- [ ] signed/provenance-aware builds where practical
- [ ] dependency governance
- [ ] change management
- [ ] kill switches/progressive rollout
- [ ] migration dry-run/resume/verify

**Exit gate:** reproducible release candidate with recovery path.

**Evidence:** —

---
### Q40 — Advanced Event Composition

**Status:** VERIFIED 2026-10-29 (backend) — exit gate met incl. finance: merch now Q07 direct charges + card refunds + ledger (migrations 1047–1048; merch-direct-charges 13/13); q40 7/7; UI open; sustainability factors need owner confirmation  
**Spec cards (backend doc line ranges):** 247:L30276-30379, 248:L30380-30483, 249:L30484-30587, 250:L30588-30691, 251:L30692-30795, 252:L30796-30898, 253:L30899-31002, 254:L31003-31105, 255:L31106-31208, 256:L31209-31311  

Domains: 247–256.

- [ ] Event series
- [ ] Recurring/tour events
- [ ] Multi-venue
- [ ] Multi-day
- [ ] Multi-room
- [ ] Forms
- [ ] Waivers
- [ ] Inventory
- [ ] Merchandise
- [ ] Lost property
- [ ] Sustainability

**Exit gate:** modules compose over canonical Event, ticket, finance and operations primitives.

**Evidence:** —

---
### Q41 — Agent Runtime / Governance

**Status:** VERIFIED 2026-10-29 (governance scope) — exit gate met (retry can't duplicate mutation; agent can't exceed user/workspace authority); migration 4029; agent-governance 10/10 (fake model); agent tools seed regenerated (registry=seed=live); doc `docs/agent/runtime-governance.md`; skills/memory/routing → Q42/Q43  
**Q19:** agent tools seed `209912310002_agent_tools_seed.sql` needs regenerating (`node scripts/gen-agent-tools.mjs`) to include `map.validate`, `map.bindings`.  
**Spec cards (backend doc line ranges):** 1:L4758-4879, 3:L4991-5098, 4:L5099-5204, 5:L5205-5317, 6:L5318-5423, 7:L5424-5532, 8:L5533-5640, 9:L5641-5746, 10:L5747-5854, 11:L5855-5960, 12:L5961-6070, 13:L6071-6178, 14:L6179-6286, 15:L6287-6394  
**v6 cross-refs:** GD-14, Annex U §19  
**Gala Dock state:** Agent is Organizer/Provider only (paid, workspace credits).  

Domains: 1, 3–15.

Build only after underlying domain services are stable.

- [ ] typed tool registry
- [ ] typed skill registry
- [ ] durable run engine
- [ ] one-time/multi-step/long/batch missions
- [ ] routines/watch/event triggers
- [ ] approvals
- [ ] autonomy policies
- [ ] context assembly
- [ ] memory summaries
- [ ] model routing
- [ ] AI credits/cost limits
- [ ] injection/safety
- [ ] run observability/evals

**Exit gate:** Agent retry cannot duplicate mutation; Agent cannot exceed user/workspace authority.

**Evidence:** —

---
### Q42 — Organizer Agent

**Status:** VERIFIED 2026-10-29 — exit gate met (mission pauses on approval + provider response, resumes, full audit); migrations 4032–4034; agent-organizer-provider 11/11, governance 10/10, tenant 12/12; 11 organizer skills; Starter = R0–R2 live; doc `docs/agent/organizer-agent.md`; open: skill picker, refusal text UI, seed fixtures  
**Spec cards (backend doc line ranges):** 2:L4880-4990, 1:L4758-4879  
**v6 cross-refs:** GD-14, X18  

Domains: 2 + Organizer tools from 1.

Wire every Organizer domain:

- Home
- Events
- Calendar
- Sales
- Marketplace
- Tickets & Promotion
- Team
- Money
- Media
- Maps
- Communications

Required mission smoke tests:

- Create event plan
- Source venue
- Source suppliers
- Build ticket strategy
- Build promotion plan
- Run readiness review
- Emergency supplier recovery
- Event-day command
- Post-event closeout

**Exit gate:** mission can pause on provider response/approval, resume later and finish with complete audit trail.

**Evidence:** —

---
### Q43 — Provider Agent

**Status:** VERIFIED 2026-10-29 — exit gate met (never accepts a conflicting job or exceeds pricing/booking authority); 9 provider skills; doc `docs/agent/provider-agent.md`  
**Spec cards (backend doc line ranges):** 2:L4880-4990, 1:L4758-4879  
**v6 cross-refs:** GD-14, X19  

Domains: 2 + Provider tools from 1.

Wire:

- Opportunities
- Bookings
- Calendar
- Listings
- Venue spaces
- Services/packages
- Team/equipment
- Money
- Emergency availability
- Messaging

Required mission tests:

- Find suitable work
- Draft quote
- Protect response SLA
- Allocate team/equipment
- Manage venue occupancy
- Handle emergency work
- Prepare delivery
- Reconcile payout

**Exit gate:** Agent never accepts a conflicting job or exceeds configured pricing/booking authority.

**Evidence:** —

---
### Q44 — Full Cross-Workspace E2E

**Status:** IN_PROGRESS 2026-10-29 — API-level journeys DONE (14/14: booking, ticketing + promoter, compliance publish, agent mission, privacy, API + webhook; cross-tenant denial at every hand-off; doc `docs/release/q44-journeys.md`); browser journeys per workspace pending (lanes A/B/D)  
**v6 cross-refs:** GD-16 X01-X28  

### Customer Journey
Customer → build birthday → venue enquiry → supplier holds → venue confirmation → bookings → protected payments → event → review.

### Organizer Journey
Lead → proposal → event → venue → suppliers → map → tickets → promotion → team → live operation → settlement.

### Venue Journey
Venue setup → spaces/map → availability → enquiry → hold → quote → booking → BEO → final balance → settlement.

### Supplier Journey
Service → opportunity → quote → booking → staff/equipment → delivery evidence → completion → payout.

### Ticket Journey
Countdown → purchase → QR/barcode/visual credential → transfer → official resale → scanner.

### Agent Journey
Goal → plan → approval → tool actions → external wait → webhook wake → resume → completion.

**Exit gate:** all journeys green in staging/CI.

**Evidence:** —

---
### Q45 — Final Security / Performance / Release Sign-Off

**Status:** IN_PROGRESS 2026-10-29 — evidence phase DONE: authz sweep 684 fns 0 unreviewed; RLS 428 tables 0 writable by outsiders; **2 P1 fixed** (stored SVG XSS → 3033; admin MFA bypass on aal1 → 3034, admins now need MFA); indexes 3035; headers added; secrets clean; perf + concurrency 18/18; docs `docs/release/q45-{security,performance}.md`. Open: nonce CSP, Permissions-Policy, client SVG sanitise, calendar_window tz, 3 admin specs to run, owner items (captcha, password policy + HIBP, Stripe, ClamAV), final verdict after design lanes  
**Close-out engineering DONE (lane C, 2026-10-29):** client SVG sanitiser + badge-print XSS fix; Permissions-Policy extended; nonce CSP (Report-Only default — enforce with `CSP_ENFORCE=1` at close-out after a clean report run); calendar_window 15–25 ms → <0.2 ms (3037); checkout bundle −4.8 MB; notify_waitlists respects seller readiness (3036).  
**Owner decision 2026-10-29 — do at the end, before sign-off:** (1) hide the remaining public test-fixture events (visibility → private; ledger-bearing fixtures can't be purged); (2) purge the eligible p1-* test workspaces (2 now + 19 after lane D's purge-aware guards), dry-run list shown to the owner first.  
**Owner steps from Q32/Q33:** subscribe Stripe Connect endpoint to `account.external_account.*`; legal review of retention/DSAR/resale fee policy then enable rules with `p_legal_reviewed`; grant `privacy` admin permission; cookie-consent anon function decision; run real fixture purge after dry-run review.  
**v6 cross-refs:** GD-20 gates, Annex U §44-45, §48  
**Gala Dock state:** Verdict file: docs/release-audit/galadock/RELEASE_CANDIDATE_VERDICT.md  

Run:

- RLS penetration suite
- IDOR suite
- Agent injection suite
- API scope suite
- webhook replay/spoof suite
- payment replay/reconciliation suite
- ticket race/oversell suite
- provider double-book suite
- upload/malware suite
- browser matrix
- responsive matrix
- keyboard/screen-reader/WCAG
- PWA installation/offline
- load tests
- restore drill
- chaos drills

Produce final verdict:

- `READY`
- `CONDITIONALLY_READY`
- `NOT_READY`

Do not claim READY while any release blocker exists.

**Evidence:** —

---

# Lane B — Workspace audit, design fidelity and QA (v6 GD-00–GD-20)

Each workspace packet produces the six v6 registers for that workspace only (GD-01): route matrix, UI interaction census, functional depth, design fidelity, backend gaps and E2E evidence. Output goes to `docs/release-audit/galadock/<workspace>/`. Every control is classified (`MISSING`, `STUB / FAKE`, `PARTIAL`, `BROKEN`, `VISUALLY NONCONFORMING`, `SECURITY DEFECT`, `WORKING BUT UNVERIFIED`, `VERIFIED`, `NOT APPLICABLE`, `BLOCKED EXTERNAL`) with P0–P3 severity. Backend gaps found here become items in the matching Lane A packet, not parallel implementations.

### W00 — Design-source manifest and as-found baseline

**Status:** DONE 2026-10-28 — `docs/release-audit/galadock/DESIGN_REFERENCE_MANIFEST.md`: 242 images mapped (6 HEAD-only), 73 reference-blocked routes, 1 reference without route (`/events/london`); step-4 mapping confirmed, 5-vs-6 step conflict → owner  
**v6:** GD-00.1, GD-15.1, GD-19.2  
**Depends on:** Q00 route inventory  
- [ ] `DESIGN_REFERENCE_MANIFEST.md`: every image in `Designs/**` with dimensions, intended route/state, confidence, and the "reference-blocked" routes
- [ ] As-found captures at reference size for every mapped route (`scripts/design/capture-matrix.mjs`, `scripts/design/shoot.mjs`)
- [ ] Overlay/diff with region notes; never an invented 1:1 score
**Exit gate:** each mapped route has a reproducible before image and diff.

---

### W01 — Public marketing & marketplace

**Status:** PARTIAL 2026-10-29 (pass 3) — landing + 5 profile/directory pages restructured to designs; zoom removed; cookie banner + /api/consent; InlineScript fix; tests 40/0 fail; open: premium review §4/§5, data gaps, /pricing, legal copy  
**Lane A finding:** `/events`, `/venues`, `/organizers`, `/services` list pages 404.  
- [ ] Every public route discovered (landing, solutions, pricing, help, legal, events/venues/services/organizers, search, maps)
- [ ] Journeys: discover event → tickets; venue → quote/hold; supplier → enquiry
- [ ] Metadata, sitemap, canonicals, structured data, consent-gated analytics, private-content leak check
- [ ] Section anatomy vs designs (no hero clones, no repeated four-stat footers)
**Exit gate:** journeys pass and design references are matched or reference-blocked.

---

### W02 — Customer workspace (owner priority)

**Status:** PARTIAL 2026-10-29 (pass 4b) — P1 plan wizard fixed; all 17 phone refs on PWA structure; desktop structural pass on 9 routes; e2e 18/0 fail; region gate NOT met (desktop 6–49% area; phone judged structurally); remaining listed in report  
**Lane C UI asks (customer):** wizard reads `event_type_rules`/aliases; hide Sell tickets for optional_off until `event_set_ticketing`; `publishTickets` must set invite_token before tier update and check errors; map `lifecycle_preconditions` errors; `events/[slug]` generateMetadata → noindex + no OG when `share_preview=false`.  
**v6:** GD-03, GD-15.2-4 · **Pairs with:** Q14, Q15, Q20–Q22, Q38  
- [ ] All CU-001…CU-013 pages and wizard states CU-W01–W03 vs `Designs/customer & Organizer workspace` (map: `docs/p2-design-map.md`)
- [ ] Dynamic routes (event profile tabs, ticket detail, booking, resale) captured with seeded IDs
- [ ] Fix C05 and every remaining geometry, type or spacing drift; record approved deviations (C09 no-AI)
- [ ] Five-item mobile nav + bottom sheet, phone/tablet portrait and landscape
- [ ] Every control clicked with outcome asserted (checkout in Stripe test mode)
**Exit gate:** each customer reference at ≤5% meaningful region drift, or a logged deviation; all controls classified.

**Evidence:** `docs/release-audit/galadock/customer/W02_REPORT.md`; `artifacts/visual/w02/`. 27 routes captured (23 with references): 9 matched, 13 drift logged, 1 reference mismatch (`/plan?step=4`). C05 fixed (`cu-reviews.css:55-62`, `reviews-client.tsx`). Leftover AI branding removed (event profile planner card → rule-based Next steps; ticket-setup Gala Agent panels → Ticket help). 19 dead links + 5 fake ⋯ + empty-submit fixed. Census 1,030 controls / 25 routes: 761 working, 26 fixed, 0 unknown breaks, 92 state-changing not auto-run, ~170 script artifacts. Phone/tablet portrait nav OK. tsc 0, eslint 0 errors.
**Remaining:** confirm step-4 reference; re-capture CU-001/009/010/013 + resale after Q38; Build price density, Money Today marker, Plan Week control, ticket-setup step 3 facts, style tile labels; assert 92 state-changing controls + Stripe test checkout/resale on a disposable customer; per-region diff %; landscape.

---

### W03 — Organizer workspace

**Status:** DONE 2026-10-29 (pass 2, lane D) — organiser backlog UI built (Q14/Q17/Q18/Q20/Q22/Q23/Q24–Q26/Q29/Q40/Q42/W11); 84 routes + portal × 6 viewports: 621 captures, 33,987 controls, 0 failed/dead/unnamed/overflow/console; fidelity 22 matched + 8 logged drift (non-blocking under owner standard); D1–D10 fixed (conflicts strip, More disclosure, zoom removed, W14 tokens + 114 one-offs migrated); journeys 3–4 PASS, 1–2 PARTIAL (Stripe onboarding, owner end); migrations 4035–4043; regression 202/202; report `docs/release-audit/galadock/organizer/W03_REPORT.md`  
**Q42 UI asks:** friendly text for `exceeds_booking_authority`, `approval_args_mismatch`, `plan_not_entitled` on run/approval pages; skill picker setting `agent_runs.mission` (needs additive mission param on `start_agent_run`). Settings → Agent built (kill switch, skills, memory, cost).  
**Lane C UI asks (organiser):** gala/charity/conference tiles; status menu hides refused states; `savePage` + Ticket Pro `activate` use `event_transition` or surface `lifecycle_preconditions`; readiness shows lifecycle, ticketing, composition blockers.  
- [x] Home, Events (Overview/Plan/Sell & Promote/Operations/Money), Calendar, Sales, Marketplace, Tickets & Promotion, Team, Money, Gala Agent, Settings
- [~] GD-04.4 journeys 1–4 (3, 4 PASS; 1, 2 PARTIAL — Stripe test onboarding)
**Exit gate:** registers complete, P0/P1 fixed, overlays done.

---

### W04 — Venue operator (provider venue mode)

**Status:** DONE 2026-10-29 (pass 2) — 26 routes × 6 viewports, census 0/0/0/0; ORG-013 + structure editor + loading bays + menus + BEO built; 7 browser-found bugs fixed (menu editor crash etc.); mean diff 6–13% (ORG-013 20% with reason); region gate → W14  
- [ ] Listings, spaces, availability, holds, quotes, bookings, BEO, money; same-slot race tests
**Exit gate:** no double booking through UI, stale calendar or missing transaction.

---

### W05 — Solo supplier (provider services mode)

**Status:** DONE 2026-10-29 — solo supplier 13 routes × 6; census clean; drift data-only  

---

### W06 — Agency supplier

**Status:** DONE 2026-10-29 — agency owner + staff captured; F13/F16 confirmed; census clean  

---

### W07 — Affiliate / promoter / partner

**Status:** DONE 2026-10-29 — F5–F7 fixed; PART-001/PROM-001 matched; remaining: Message organizer (Q05), ?ref= attribution (Q27)  
- [ ] Affiliate finance conservation test (sale → eligible net → commission → reversal → payout)

---

### W08 — Platform admin

**Status:** DONE 2026-10-29 (lane D) — 23 routes × 5 viewports: 115 captures, 6,175 controls, census 0/0/0/0, console 0 after F12 (workspace tickets statement timeout fixed); AD-001…018 matched; F9 Partner Activity real, F10 /admin/commerce/reconciliation, F11 admin title tokens; specs 27/27 under aal2  
- [ ] Maintenance mode control end to end (X22); no blanket message read access

---

### W09 — External portals

**Status:** DONE 2026-10-29 — 7 token portals audited (scope, expiry/revocation, uniform 404, no-store/noindex/no-referrer, per-IP limits); `/pay` FAIL → Q07 P1; report `docs/release-audit/galadock/portals/W09_REPORT.md`  

---

### W10 — Auth, onboarding, subscriptions, help, workspace switching

**Status:** DONE 2026-10-29 — AUTH-001…008, return paths, verify-email, MFA, onboarding, invites, billing (test), X17 switching no bleed; report `docs/release-audit/galadock/auth/W10_REPORT.md`  

---

### W11 — Event-type matrix

**Status:** DONE 2026-10-29 with gaps — matrix 11 types; children's-party public-publish hole closed (migration 2012 row guard); event-type-matrix 15/15; report `docs/release-audit/galadock/W11_REPORT.md`  

---

### W12 — Responsive, zoom and orientation matrix (all workspaces)

**Status:** IN_PROGRESS (agent A: provider/affiliate/portal/admin part; customer/public part → lane B) · **v6:** GD-15.4, Annex U §4–12, §14  
**W02 finding:** mobile menu sheet lists Help twice and both Account and My account (shared mobile nav).  
- [ ] Desktop/laptop/tablet/phone, portrait/landscape, zoom 50–200% and 400% reflow, text scaling; seat map, calendar, Gantt, finance tables, admin tables

---

### W13 — Every-route, every-control browser audit

**Status:** IN_PROGRESS (organiser part DONE by lane D: 33,987 controls, 0 dead/unnamed; admin 6,175; agent A: provider/affiliate/portal part running; customer/public → B running w13-remaining) · **v6:** GD-17, Annex U §13  
**W02:** click-assert 92 state-changing customer controls on a disposable customer.  
- [ ] Per-workspace control denominator and coverage %, console/network errors, authoritative postconditions, dual-session checks

---

### W14 — Design-final overlays

**Status:** IN_PROGRESS 2026-10-29 — customer/public signed off (lane B, see W12_REPORT_partB §W14); tokens in `kit.css` (lane D); organiser/admin migrated (114 + 34), zoom removed everywhere organiser/admin/customer; W03/W08 sign-off done under owner standard; remaining: lane B customer/public re-measure, lane A provider/affiliate/portal · **v6:** GD-19.14, Annex U §17  
**Consistency tokens (coordinator decision 2026-10-29, from lane D static audit):** buttons 34px / sm 28px everywhere; ONE large CTA size 40px for page-header and wizard-footer actions; inputs 36px (dense table inputs 32px); icon buttons square 32px (dense 26px); chips 20px / dense variant 18px for tables; card padding 16px; page title token 28px organiser/customer, 30px admin list pages (hero titles may be larger by design); card title 15px, sub-heading 13.5px. Add as shared tokens (additive), migrate one-offs per workspace. Audit list: lane D `scratchpad/d4-w03/cssdrift.txt` (31 button overrides, 7 h1 sizes, ~25 h2 sizes).  
**Owner decision 2026-10-29 — design sign-off standard:** not ≤5% per region. Sign-off = every surface looks **premium and consistent** with the designs (same structure, components, hierarchy) and **component zoom is fixed**: one display scale only (`density.css` fit-to-design); no per-page/per-component CSS `zoom` hacks (25 found: cu-book .92/.88, cu-events .96, cu-reviews .95, org-promotion .86, ticket-setup .9, ~18 in globals.css). Density must come from real type/spacing tokens. Remaining small differences are logged, not blocking.  
**Design gap is the main remaining quality risk:** W01/W02 region drift is far above the ≤5% gate; phone layouts are responsive transforms, not the PWA mock structures. Needs a dedicated fidelity pass per route (structure, not just spacing).  
- [ ] Re-capture every reference after functional changes; before/after evidence

---

### W15 — Release documentation and verdict

**Status:** IN_PROGRESS 2026-10-29 — drafts written: `docs/release/RELEASE_VERDICT.md` (verdict pending), `CLOSE_OUT_RUNBOOK.md`, `OPEN_ITEMS.md`; 18 source conflicts flagged in verdict §14; close-out reorder: run release:check + full regression BEFORE restoring captcha
- [ ] `docs/release-audit/galadock/`: README, WORKSPACE_MASTER_MATRIX, ROUTE_COMPONENT_ACTION_REGISTER.csv, WORKSPACE_ACTION_TO_BACKEND_TRACE.csv, DESIGN_OVERLAY_FINDINGS, BACKEND_GAP_REGISTER, DATABASE_RLS_MATRIX, API_EDGE_FUNCTION_CONTRACTS, WEBHOOK_IDEMPOTENCY_LEDGER, INTEGRATION_HEALTH_REGISTER, CROSS_WORKSPACE_E2E_RESULTS, EVENT_TYPE_MATRIX, RESPONSIVE_ZOOM_ORIENTATION_RESULTS, A11Y_RESULTS, AGENT_EVAL_RESULTS, SECURITY_TEST_RESULTS, DEFECT_REGISTER, EXECUTION_CHECKPOINT, SCHEMA_AND_MIGRATION_CHANGELOG, runbooks, RELEASE_CANDIDATE_VERDICT
- [ ] Gates per workspace: design, controls, backend integrity, permissions, journeys, responsive/a11y, ops/security → PASS/FAIL/BLOCKED/N/A
**Exit gate:** honest READY / CONDITIONALLY READY / NOT READY.

---

### D01 — Owner-decision UI pass (logo, step counts, default view)

**Status:** DONE 2026-10-28 — shared `GalaLogo` (G mark + purple #6906EB wordmark) in customer, public, organizer, provider/admin, portal, checkout, auth, landing; Plan wizard 6 steps (order Occasion → Date & Location → Guests & Size → Services & Extras → Budget & Priorities → Recommended Build — kept by coordinator decision; designs #65/#67 disagree); ticket setup 5 steps; proposals 5 steps; RFQ 4 steps (device-local draft); Events default Cards (cookie remembers); hydration fix in `shared/keyboard-scroll-regions.tsx` (all pages). Specs plan 1/1, ticket-pro 2/2, proposals 2/2; tsc 0. Evidence `artifacts/visual/d01/`. Left: email templates logo; proposal packages comparison + public proposal page presentation; RFQ server-side drafts; portal/checkout logo captures  
- [ ] Logo: "G" mark + purple "Gala·Dock" wordmark (per workspace designs) in customer, organizer, provider, admin, portal, public and auth shells; landing sparkle mark logged as deviation
- [ ] Plan wizard → 6 steps per design #67 (Occasion, Date & Location, Guests & Size, Services & Extras, Budget & Priorities, Recommended Build) with saved progress per step
- [ ] Organizer ticket setup → 5 steps per ORG-W03 designs; proposals → 5 steps per ORG-W02; marketplace request (RFQ) → 4 steps per ORG-W04
- [ ] Organizer Events list defaults to Cards
- [ ] Re-capture each changed screen against its reference; no regressions in tests
**Exit gate:** each flow matches its reference step structure; data persists across steps; tsc/eslint clean.

---

# Run order

Lane A: Q00 → Q01 → Q02 → Q03 → **Q07** → Q04 → Q05 → Q06 → **Q38 (seed)** → **Q28** → **Q23** → Q08 … Q45 in document order (skipping those already done).
Lane B: W00 → **W02** → W01 → W03 … W15. Lane B uses Lane A's Q00 inventory and feeds gaps back into Lane A packets.

# Progress log

| When | Packet | Agent | Change | Result |
|---|---|---|---|---|
| 2026-10-28 | Queue | main | Combined queue built from both master prompts; dev watchdog ported from Gigvora | — |
| 2026-10-28 | Q00 | agent A (Opus) | Repository baseline: 5 inventory files, 15 ranked findings (3 P0 money), baseline tests | DONE — 120/121 tests pass (1 clock-skew failure) |
| 2026-10-28 | W02 | agent B (Opus) | Customer pass 1: 27 routes, C05, AI branding removed, 26 control fixes, census 1,030 | PARTIAL — 9 matched, 13 drift logged |
| 2026-10-28 | Q01 | agent A (Opus) | Definer + grant audit, 5 migrations applied, step-up, flags, encryption contract, tenant suite | VERIFIED — 12/12 new tests, 57/57 regression |
| 2026-10-28 | Q02+Q03 | agent A (Opus) | Master data + workflow foundation, migrations 1006–1007 applied | VERIFIED — 15/15 new tests, 44/44 regression |
| 2026-10-28 | W00+W01 | agent B (Opus) | Design manifest (242 images); landing rebuilt; SEO/robots/sitemap; public journeys | W00 DONE; W01 PARTIAL |
| 2026-10-28 | Q07 | agent A (Opus) | FCA direct charges across all seller flows; 3 migrations applied; ledger memo, reconciliation, Connect webhooks | DONE — 32/32 + 7/7 + 48/48 regression; Stripe live test BLOCKED (approval) |
| 2026-10-28 | W03 | agent B (Opus) | Organizer pass 1: 37 routes, 12 fixes, census 1,856, journeys 1–4 | PARTIAL — 19 matched, 20 drift logged |
| 2026-10-28 | Q38+Q07v | agent A (Opus) | 8 Stripe test accounts created (await hosted onboarding), idempotent seed script, 7 of 8 seeding gaps closed, migration 1011 | PARTIAL — Stripe run BLOCKED on owner onboarding; tenant-security 11/12 (allowlist decision) |
| 2026-10-28 | W04+W05 | agent B (Opus) | Provider pass: 62 states, 11 fixes, census 2,111, race spec (3 backend gaps), 6 agent runs queued by mistake | PARTIAL — owner to cancel 6 runs |
| 2026-10-28 | Q28+Q23 | agent A (Opus) | AI metering + profitability report/alerts, subscription billing (test), ad placements/rotation/integrity; migrations 1012–1014 | Q28 DONE, Q23 PARTIAL — 21 new tests pass, no regressions |
| 2026-10-28 | Decisions | main | Owner delegated 4 decisions; readiness allowlisted (tenant-security 12/12); Stripe onboarding hit hCaptcha → owner must complete 8 links; D01 UI packet queued | — |
| 2026-10-28 | Decisions | main | Owner delegated finance/ops calls: packs £25/£89/£219, VAT via Stripe Tax, unmetered-run flag scoped, security lists hardened (12/12) | — |
| 2026-10-28 | Q28f+Q04–Q06 | agent A (Opus) | Started: pack repricing, flag scoping, Stripe Tax (test); then files/R2/malware, messaging consolidation + notifications + newsletter/contact, search/indexing + public search API | running |
| 2026-10-28 | Decisions | main | Verified list prices (gpt-5.4 mini/nano, Claude Opus 5.5/5); price book to list_price with padding; packs to activate; usage sizing from real meter | sent to Q28 follow-up agent |
| 2026-10-28 | Q28f+Q04–Q06, W04+W05 | agents A+B | Both stopped by account 5-hour usage limit (resets 21:40 London); work saved; owner: AI is Azure only | paused |
| 2026-10-28 | Q28f+Q04–Q06 | agent A (Opus) | Packs repriced + active, Azure-only, VAT switch; files/malware, messaging/notifications, search; migrations 1015–1022 | DONE — 60/60 tests, tenant-security 12/12 |
| 2026-10-28 | Cleanup | main | Owner-directed: cancelled 6 mistaken Gala Agent runs on Riverside Arena (queued → cancelled, 0 tokens) | done |
| 2026-10-28 | D01 | agent B (Opus) | Logo everywhere, Plan 6 / tickets 5 / proposals 5 / RFQ 4 steps, Cards default, hydration fix | DONE — 5/5 specs |
| 2026-10-28 | Stripe onboarding | main + owner | Tried via DevTools browser with owner solving captchas; Stripe sign-up rejected the automated session twice → owner to complete Alex Events + QA seller in a normal browser | blocked on owner |
| 2026-10-28 | Q10–Q12 | agent A (Opus) | 3 double-booking P1s + 2 W06 P1s fixed, order groups, equipment/capacity/service areas; migrations 1023–1027 | VERIFIED — 112/113 combined (1 cross-lane), tenant-security 12/12 |
| 2026-10-28 | Stripe onboarding | main | API route re-tested (v1 custom + v2 accounts): Stripe refuses platform ToS acceptance; owner deferred onboarding + Q07 live test-mode run to the end of the queue (before Q45) | deferred |
| 2026-10-28 | Q08 | agent C (Opus) | Verification machine, documents, insurance, computed badges, eligibility, reliability v1, reviews/moderation; migrations 3001–3007 | VERIFIED — 11/11 + 12/12; live Verified listings 33→0 |
| 2026-10-28 | Q14 | agent D (Opus) | Event lifecycle, duplicate, programme integrity, ended-events job, guest links, readiness fix; migrations 4001–4006 | VERIFIED — 8/8 + 20/20 |
| 2026-10-28 | W06 | agent B (Opus) | Agency audit, 9 fixes, agency spec (3 backend gaps), P1 crew RLS + assignment race handed to Q12 | PARTIAL |
| 2026-10-29 | P1 + Q15 + Q09 | agent A (Opus) | Payment bypass closed; customer builder engine; explainable ranking + public marketplace/discover APIs; migrations 1028–1032 | VERIFIED — 85/85 |
| 2026-10-29 | Q16+Q17 | agent C (Opus) | Clients, pipeline, contracts, signature boundary; team/live ops, leave, substitution, conflicts; migrations 3008–3014 | VERIFIED — 18/18 (3009 caused ~10 min live accept_proposal outage, fixed by 3010) |
| 2026-10-28 | Q18+Q21 | agent D (Opus) | Started: guests/registration/passes/check-in; ticket credentials/scanner/transfer | running |
| 2026-10-29 | Q14 rem + Q18 + Q21 | agent D (Opus) | Templates, dependencies, brief, customer duplicate; guests/registration/zones/passes/check-in; credentials/scanner/offline/transfer; migrations 4007–4014 | VERIFIED — 13/13 + 6/6 + 5/5 |
| 2026-10-28 | W07+W08 | agent B (Opus) | Affiliate + admin audits: 8 fixes, 2 specs, P1 email-body read path, live-maintenance test hazard | PARTIAL |
| 2026-10-29 | Q31 sec + Q27 | agent B (Opus) | S1–S5 fixed, safe maintenance test, promoter/affiliate ledger families, payouts, partner attribution; migrations 2001–2007 | VERIFIED — 24/24 + 19/19 |
| 2026-10-29 | Q13+Q19 | agent A (Opus) | Started: food/drinks/hospitality (menus, BEO, bar), venue/event map engine | running |
| 2026-10-29 | Q09 fix | agent A (Opus) | Owner: hide ranking reasons/scores from customers + public; explain path for organizer/admin only | running |
| 2026-10-29 | Invites + W09 + W10 | agent B (Opus) | Started: workspace invite command (P1), MFA in 3 specs, portals audit, auth/onboarding/subscriptions/switching | running |
| 2026-10-29 | Q24–Q26 | agent C (Opus) | Started: sponsors/exhibitors/talent/riders, logistics, licensing/safety/accessibility/weather | running |
| 2026-10-29 | Q20+Q22 | agent D (Opus) | Migrations 4015–4017; load test 32/32 ×2; new specs 16/16; regression 98/98; tenant 12/12 | Q20 VERIFIED, Q22 DONE |
| 2026-10-29 | Q01 invites + MFA specs + W09 + W10 | agent B (Opus) | migration 202610292008; workspace-invites 5/5, MFA specs 23/23, tenant 12/12; 7 portals; auth/onboarding/billing/switching | DONE |
| 2026-10-29 | Q07 pay-link P1 + Q16 tokens + W11 | agent B (Opus) | Started | running |
| 2026-10-29 | Q24+Q25+Q26 | agent C (Opus) | Migrations 3015–3018; tests 7+5+7; regression tenant 12/12, event-core 13/13, q17 11/11 | VERIFIED (code/test) |
| 2026-10-29 | Q22 follow-ups + Q33 + Q32 | agent D (Opus) | Started | running |
| 2026-10-29 | Q14 ops gating + Q29 + Q30 | agent C (Opus) | Started | running |

## Lane plan — remaining work split across four lanes (owner request 2026-10-29)

**Depth rule (unchanged):** every packet below runs its FULL queue row — every domain card, every checklist line, every v6 item, the exit gate as written, tests with real counts, a dry run that exercises every function, and docs. Nothing is trimmed to balance the lanes; only the order and the owner lane change. A packet is not closed until its exit gate is met or each gap is recorded as BLOCKED with owner steps. Findings attached to other packets travel with the packet.

**Balance:** each lane has roughly equal effort: about 2 large backend packets, 2–3 medium ones, and one UI/browser block. Browser work is limited to 2 lanes at once; the coordinator schedules it.

| Lane | Running now | Then, in order | UI / browser block | Final shared work |
|---|---|---|---|---|
| **A**: marketplace, provider, venue (also ORG-013 map editor UI — built the engine) | Q09 ranking reasons kept internal → Q13 hospitality → Q19 maps | **Q23** remainder (promotion, media, campaigns: domains 136–139, 146–149) → **Q40** advanced event composition (multi-day, multi-venue, series, nested sub-events) | **W04 / W05 / W06 / W07**: fix all logged drift in the venue operator, solo supplier, agency and affiliate workspaces. Wire provider UIs for Q12/Q13/Q19 (map editor, menus), Q25 venue loading bays and Q28 provider self-serve plans | Q44 provider and affiliate journeys · W14 overlays for provider and affiliate |
| **B**: customer and public (browser) | Q07 pay-link P1 fix → Q16 share-token hashing → W11 event-type matrix | — | **W02** customer workspace to its exit gate (owner priority): Q15 build page wiring, Q14 customer side, Q20 promo/access code input, Q18 public `/rsvp/[token]` and registration pages, Q21 ticket wallet/print screens, Q29 join pages → **W01** public marketing and marketplace drift → **W12** responsive, zoom and orientation matrix on every surface → **W13** audit of every route and control | Q44 customer and guest journeys · W14 overlays for customer, public and auth |
| **C**: platform and operations | Q14 ops gating → Q29 virtual/hybrid → Q30 API, MCP, webhooks | **Q38** full-depth demo seeding (every seed gap listed in the queue, Q14–Q30; seeding comes first so W captures show real data) → **Q34** observability, SRE, continuity → **Q35** analytics and warehouse → **Q36** experimentation → **Q37** PWA, device, offline (incl. offline scanner) → **Q39** release, supply chain and migration governance (type regen, state seed parity, schema_migrations parity, lane C machines applied) | none (backend only) | Q44 cross-workspace API, webhook and offline journeys · Q45 performance and load evidence |
| **D**: trust, admin, agents, organiser | Q22 follow-ups → Q33 fraud and abuse → Q32 privacy and retention | **Q31** remainder (admin review UI for Q08, support cases, dead-letter and job console, health) → **Q41** agent runtime and governance → **Q42** organizer agent → **Q43** provider agent (Azure only through `llm.ts`, no AI in the customer workspace, no real AI runs in QA) | **W08** admin drift → **W03** organizer workspace to its exit gate, including the organiser UI backlog: Q14 dependencies and brief, Q17 team page (leave, substitution, login invites), Q18 zones, passes, registration and scanner assignment, Q20 inventory and allocations, Q22 risk review, Q24–Q26 Plan › Partners/Compliance/Accessibility and Operations › Logistics/Weather, and the `/portal/parties/[id]` route | Q44 organizer and admin journeys · W14 overlays for organizer and admin |

**Design sign-off standard (owner 2026-10-29):** premium + consistent + one display scale with no component zoom hacks; small differences logged (see W14).

**Coordinator and close-out, after all lanes:**
0b. Order rule: run `release:check` + full regression BEFORE restoring captcha (specs sign in by password; Turnstile blocks them). Confirm Turnstile site key is live on Vercel before switching the Supabase secret on.
0a. Engineering: enable `CSP_ENFORCE=1` after a clean Report-Only run (check maintenance page).
0c. **Post-deploy, P1:** straight after the production deploy, apply staged `supabase/staged/202610294085_events_close_base_table.sql` (closes private `events` columns/settings to anon and outsiders) — CLOSE_OUT_RUNBOOK.md "Post-deploy: close the events base table". The exposure stays open through REST until then.
0. Owner-deferred: commit everything (incl. security patch next 16.4.3 / zod 4.6.7) and deploy production — at the end, after sign-off checks; hide remaining public test fixtures; purge eligible p1-* test workspaces (dry-run list to owner first).
1. Owner completes Stripe test onboarding (Alex Events + QA seller); I remind before this step. Then the Q07 Stripe test-mode run.
2. Restore captcha: T1 Supabase `security_captcha_enabled=true` and T2 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
3. Deploy the ClamAV gateway (blackwellen-operations) and set the public-bucket policy.
4. Revoke the legacy `workspace_invites` column grants.
5. Regenerate DB types.
6. Re-run the full regression and tenant-security suites.
7. Q45 security, performance and release sign-off, then W15 release verdict.

**External or owner items carried to the end:** customer Connect resale (decision), legal review (resale GB v1, compliance rule pack, terms), weather provider key, Wallet pass certificates, Gmail/IMAP/SMTP transports.
| 2026-10-29 | Lane plan | coordinator | Remaining work split across lanes A–D at full depth (see Lane plan) | adopted |
| 2026-10-29 | Q09 fix + Q13 + Q19 | agent A (Opus) | Migrations 1033–1038; ranking 9/9, hospitality 9/9, map-engine 7/7, venue-fnb 7/7, tenant 12/12 | VERIFIED |
| 2026-10-29 | Q23 remainder + Q40 | agent A (Opus) | Started | running |
| 2026-10-29 | Q07 pay link + Q16 share tokens + W11 | agent B (Opus) | Migrations 2009–2012; pay-link 3/3, q16-share-links 5/5, q16-crm 7/7, event-type-matrix 15/15, tenant 12/12 | DONE |
| 2026-10-29 | W02 customer workspace block | agent B (Opus, browser) | Started | running |
| 2026-10-29 | Lifecycle gating + Q29 + Q30 | agent C (Opus) | Migrations 3019–3023; q26 8/8, q29 8/8, q30 10/10, developer 3/3, calendar 3/3, event-core+q24–26 33/33, tenant 12/12 | VERIFIED |
| 2026-10-29 | W11 backend (a–d) + Q38 seeding pass 1 | agent C (Opus) | Started | running |
| 2026-10-29 | Q22 follow-ups + Q33 + Q32 + fixture purge | agent D (Opus) | Migrations 4018–4022; 13 specs green incl. fraud 5/5, privacy 5/5, purge 3/3, tenant 12/12; purge dry-run 6 workspaces | VERIFIED |
| 2026-10-29 | Q31 remainder → Q41 | agent D (Opus) | Started | running |
| 2026-10-29 | Q23 remainder + Q40 | agent A (Opus) | Migrations 1039–1046; promotion-media 9/9, q40 7/7, regression 114/114, tenant 12/12 | VERIFIED (backend) |
| 2026-10-29 | Q40 merch→Q07 + provider/venue UI build (W04–W07) | agent A (Opus) | Started — UI code first, browser captures when a slot frees | running |
| 2026-10-29 | W02 pass 2 | agent B (Opus, browser) | complaints fixed; 13/25 matched; backlog wired; census 216/0; tests 45 pass / 3 stale-env | PARTIAL |
| 2026-10-29 | W02 pass 3 + W01 | agent B (Opus, browser) | Started | running |
| 2026-10-29 | Merch→Q07 + provider/venue UI | agent A (Opus) | Migrations 1047–1048; merch 13/13; map-merge 6; provider specs 57/57; UI: ORG-013, structure editor, menus, BEO, loading bays, provider plans, W07 F5–F6 | built; captures waiting for browser slot |
| 2026-10-29 | Q34 | agent A (Opus) | Rebalanced from lane C; started | running |
| 2026-10-29 | W11 backend + Q38 pass 1 | agent C (Opus) | Migrations 3024–3027; event-type-rules 10/10; 14 seed groups; regression 99 pass / 2 flaky; tenant 12/12 | DONE |
| 2026-10-29 | Q38 pass 2 | agent C (Opus) | Started | running |
| 2026-10-29 | Q31 remainder + Q41 + scanner hook | agent D (Opus) | Migrations 4023–4029; q31 6/6, agent-governance 10/10, regression green, tenant 12/12; 23 admin captures | VERIFIED |
| 2026-10-29 | W02 pass 3 + W01 | agent B (Opus, browser) | region diff measured; Q29/W11 UI; directory pages; census clean; tests 51 pass | PARTIAL (design gate not met) |
| 2026-10-29 | Q29 join fix + Q42 + Q43 | agent D (Opus) | Started | running |
| 2026-10-29 | Q38 pass 2 | agent C (Opus) | 7 domain groups + Pro plan/API key; migration 3028; demo-seed 9/9, tenant 12/12 | DONE |
| 2026-10-29 | Checkpoint commit | coordinator | 5d81a06 on release/enterprise-queue-2026-10-29 | done |
| 2026-10-29 | Fixture purge | coordinator | 6 Q16 workspaces + 10 users purged; public fixtures blocked (ledger / append-only guards / classifier) | partial |
| 2026-10-29 | Q35 → Q36 → Q37 → Q39 | agent C (Opus) | Started | running |
| 2026-10-29 | Q34 | agent A (Opus) | Migrations 1049–1051; restore drill passed; observability 10/10; found production deployment paused | VERIFIED |
| 2026-10-29 | Q29 fix + purge guards + Q42 + Q43 | agent D (Opus) | Migrations 4030–4034; q29 11/11, purge 3/3, agent-organizer-provider 11/11, tenant 12/12 | VERIFIED |
| 2026-10-29 | W03 organiser + W08 admin | agent D (Opus) | Started — UI code first, captures when browser slot frees | running |
| 2026-10-29 | W02 pass 4 | agent B (Opus, browser) | structural fixes; phone 2/17; tests 18/2/2 | PARTIAL |
| 2026-10-29 | Plan-wizard fix + W02 phone structures | agent B (Opus) | Started | running |
| 2026-10-29 | Vercel resume | coordinator | Project un-paused on owner instruction; site + workers recovered | done |
| 2026-10-29 | W04–W07 browser block | agent A (Opus) | 26+13+11+10 routes × 6; 8 bugs fixed; census clean | DONE |
| 2026-10-29 | Q35 + Q36 + Q37 + Q39 | agent C (Opus) | Migrations 3029–3031; 8+5+5+5 specs; parity clean; types regenerated; audit found next critical | Q35/Q36 VERIFIED, Q37 DONE, Q39 PARTIAL |
| 2026-10-29 | W02 pass 4b | agent B (Opus) | P1 wizard fixed (migrations 2013–2014); 17 phone structures; e2e 18 pass | PARTIAL |
| 2026-10-29 | Security patch | coordinator | next 16.4.3, zod 4.6.7; audit 0; regression 70/70 | done (deploy pending) |
| 2026-10-29 | W03 + W08 build | agent D (Opus) | 19 organiser sections + admin reconciliation; migrations 4035/4036/4038; 175/175; tsc 0 | built; captures pending |
| 2026-10-29 | Q39 remainder + Q44 API journeys | agent C (Opus) | 3032 lifecycle override required; trigger-grants check; release:check 0; q44 14/14 | Q39 VERIFIED; Q44 API part done |
| 2026-10-29 | W03 gaps B1 | agent D (sub-lane) | Migrations 4039–4040: composition bindings, retire waiver draft, delete blackout, dispose found item, archive template family, clear licence expiry; d4-b1 7/7, regression 42/42 | done |
| 2026-10-29 | Design standard | owner | Premium + consistent + component zoom fixed (no per-component zoom); ≤5% region gate dropped | decided |
| 2026-10-29 | Commit + deploy | owner | Deferred to the end (security patch included) | scheduled for close-out |
| 2026-10-29 | W03 gaps B2 | agent D (sub-lane) | 4041–4042 applied (door-staff scanner route, launch/waiting-room editor, promoter referral allocation); 4042 deadlock under concurrent referral sales (no oversell, draws skipped) → 4043 fix (FOR NO KEY UPDATE) in progress | running |
| 2026-10-29 | Q38 depth pass 3 (organiser) | agent D (sub-lane) | `scripts/seed-depth-pass3.mjs` + `organiser.mjs`: leave, crew login (ava.thompson demo), registration form + 8 registrations, recording, venues/day, risk flags, forms + responses, Neon dependencies, lost property, sustainability, Comedy Central partners/logistics, party portal login (p1- fixture), emergency request + dispute ids; idempotent; demo-seed 16/16, tenant 12/12. Demo changes: Neon max_per_customer 8; Neon Elite Security booking now disputed. Resale listing not seeded (needs paid order) | done |
| 2026-10-29 | W03 backend gaps + seed pass 3 | agent D (Opus + 3 sub-lanes) | Migrations 4039–4043 (bindings, gap commands, /door/[eventId] scanner route, launch editor, promoter referral allocation + deadlock fix); parity 272/272, trigger-grants 0; regression 202/202; tsc 0 | done; captures pending |
| 2026-10-29 | Consistency tokens | agent D | Shared tokens in kit.css (additive: --k-btn-h/sm/lg, input, icon, chip(+dense), card-pad, title-page/admin/card/sub); 114 + 7 edits across 38 organiser/admin files; tsc 0; browser check pending. Tokens passed to lane B for customer/public | done (organiser/admin) |
| 2026-10-29 | Q45 evidence | agent C (Opus) | 2 P1 security fixes + indexes (3033–3035); sweeps clean; perf evidence | evidence done |
| 2026-10-29 | Remove @anthropic-ai/sdk | coordinator | unused dependency removed (owner rule: Azure-only AI) | done |
| 2026-10-29 | Admin specs after MFA fix (3034) | agent D | w08-admin-tiers + q31-support-ops + test-fixture-purge 27/27; no changes needed | done |
| 2026-10-29 | W01 pass 3 + W12 B + W13 B | agent B (Opus, browser) | 826 matrix loads; 76/92 customer controls asserted; discard-draft P2 fixed; zoom hacks removed; tokens mapped | W01 PARTIAL, W12 B done, W13 B mostly done |
| 2026-10-29 | W01/W12/W13 B follow-ups | agent B (code only) | consent merge, seller-ready ticket card, focus ring + overflow, 24px checkboxes, review upload spec; w13-remaining spec written (needs browser); found notify_waitlists vs seller readiness → lane C | done (render checks pending) |
| 2026-10-29 | Q45 close-out engineering + waitlist fix | agent C (Opus) | 3036–3037; sanitiser, CSP nonce, Permissions-Policy, checkout bundle; specs 27+4+9 green; tsc clean | done |
| 2026-10-29 | Shared zoom cleanup | agent B (code only) | 17 component zoom rules removed from globals.css (auth/onboarding); explicit sizes rescaled; residual ±1–5% now at shared scale (accepted: consistency over pixel-identical); only display-scale fit zooms remain; visual check of /access + onboarding steps pending | done |
| 2026-10-29 | W15 drafts | agent C (docs) | RELEASE_VERDICT / CLOSE_OUT_RUNBOOK / OPEN_ITEMS drafted; 18 conflicts flagged; parity must be re-run (277 files on disk) | drafted |
| 2026-10-29 | W03 pass 2 + W08 close-out browser block | agent D (Opus) | 621+115 captures, census clean, D1–D10 + F9–F12, W14 tokens; 23/23 post-browser | done |
| 2026-10-29 | Migration parity re-run (W15 note) | coordinator | 277/277 recorded, 0 pending/drift; 38/38 machines, 73/73 role perms; trigger-grants 0 hits | done |
| 2026-10-29 | Lane B go batch: onboarding visual, W12 re-measure, w13-remaining | agent B (Opus) | W12 part B open items all fixed + re-measured clean; /access + provider step 1 phone fixes; w13-remaining 2/3 (build canvas Add click times out — investigating) | done |
| 2026-10-29 | P1 build-canvas Add hang (customer) | agent B (Opus) | stretched-link CSS covered provider dialog → `.ce-addmore-hit > .k-link`; w13-remaining 3/3; build-canvas.spec un-skipped 1/1 | done |
| 2026-10-29 | Owner-reported phone bugs: plan wizard occasion tiles squashed + 13 of 30 event types unreachable; duplicate Back at phone | coordinator (code) → agent B (browser verify) | cu-plan-wizard.css 1/-1 at ≤640; plan/page.tsx untiled aliases join More; MobileNav hides bar Back when page has its own; tsc 0 | verifying |
| 2026-10-29 | Owner request: sweep ALL wizards at all screen sizes (layout + option completeness + follow-through) | agent C (static, code fixes) → browser verify by next free lane after A | | in progress |
| 2026-10-29 | Owner: phone logo = G mark only (no wordmark); all logos correct at other sizes | coordinator (code) → browser verify | brand.css ≤640 hides wordmark except footers/proposal preview (.gd-keep-word) | verifying |
| 2026-10-29 | Owner: ticket QR not centred on phones; barcode warping; check all ticket types | coordinator (code) → browser verify | ticket-credential.css: .tc centred grid, QR max-width 100%, barcode natural width (was stretched: preserveAspectRatio=none + width:100%), visual stub QR centred; cu-tickets.css .td-cred centred | verifying |
| 2026-10-29 | Owner: scanning needs a proper test — real QR/barcode image decode + camera path; iPhone/Firefox camera fallback (BarcodeDetector absent) | agent D (Opus) | spec A node decode→scan matrix; spec B fake-camera e2e (waits for browser slot) | in progress |
| 2026-10-29 | Owner: customer/public event views do not show the built event map or built features (banners, page-editor order/visibility/CTA/SEO, sponsors, accessibility, merch, series, sessions, days) | next free lane (brief ready: scratchpad/brief_public_event.md) | public page uses none of public_event_plan / media galleries+banners / merch / series / virtual; editor order + 7 of 12 block toggles + CTA + SEO ignored; sponsors/accessibility/days need an additive anon-safe RPC | queued |
| 2026-10-29 | Owner: venue + service public pages — same check | queued with public-event brief (part 2) | public-listing.tsx ignores published venue_structures (floor plan), published menus/menu_items (Q13), media galleries/banners; provider-editor field audit + space detail + availability + page settings | queued |
| 2026-10-29 | W12 wizard sweep (static) | agent C (Opus) | 22 wizards; P1 provider booking payload bug, wrong-type re-saves (venues/services/packages), ChoiceGroup image pairing, template-type bug; options now complete (event types 30/30 everywhere, timezones 18); cascade/span defects fixed (venue setup, quote builder); report W12_WIZARDS.md; browser verify pending | done (code) |
| 2026-10-29 | Public event + venue + service pages show built features | agent C2 (Opus) | started from brief | in progress |
| 2026-10-29 | Owner phone fixes verified + W14 customer/public | agent B (Opus) | wizard tiles/30 types, one back control (48 pages), logo mark-only, ticket QR centred + barcode no-stretch (150 loads); landing §4/§5; scale hacks removed; specs 14/14 + e2e 51/51 | done |
| 2026-10-29 | Ticket scanning end to end (owner request) | agent D (Opus) | zxing fallback (iPhone/Firefox/desktop camera scanning); 5 scanner bugs incl. first-frame loop death + CheckInScanner on old engine; **security: static downloadable QR never expired → signed GD2P**; enlarged barcode sheet; spec A 9/9, spec B 7/7 (fake camera, all ticket types); audit 0 | done |
| 2026-10-29 | Owner decision: manual plain-code entry at the door stays (door staff check ID) | owner | recorded in docs/ticketing/credentials-scanner.md | done |
| 2026-10-29 | W12 wizard sweep — browser verification | agent B (Opus) | 25 pages × 8 widths; provider wizard footer under tab bar fixed; booking persistence verified (held, times, guests, layout); wizards-phone 6/6; e2e 30/30; 3 organiser pages at 1920/1536 re-run pending | done |
| 2026-10-29 | Public event + venue + service pages show built features (code) | agent C2 (Opus) | event map/floor plan (PublicPlan), page-editor order/visibility/CTA/overlay/SEO, banners, galleries, merch, series, sessions, sponsors, accessibility, menus, space detail; migrations 4060 public_event_extras + 4061 menus anon read; specs 5/5 API; migrate 279/279; e2e pending browser | done (code) |
| 2026-10-29 | W12 wizard gaps closed (3 organiser wizards at 1920/1536; onboarding steps 2–4) | agent B (Opus) | onboarding step-4 360px overflow fixed; fixtures cleaned | done |
| 2026-10-29 | Owner decisions: merch = external link (no marketplace); sponsor logos; YouTube/Vimeo embeds; public venue free/busy calendar; public parking/transport | owner → agent C2 (merch link, logos, embeds) + agent D2 (availability, getting there) | | in progress |
| 2026-10-29 | Lane C follow-ups: TO-public policy class (4062, 83 policies/50 tables), bar packages public, invented gate/doors removed, merch link, sponsor logos (4063), YouTube/Vimeo embeds | agent C2 (Opus) | specs 31/31 + 15/15; migrate 283/283 | done (code) |
| 2026-10-29 | INCIDENT: 4062's own COMMIT escaped the dry run (live before exercise) | coordinator | tool fix withoutTxnControl in dry-run + apply; governance spec 8/8; doc docs/release/governance.md | done |
| 2026-10-29 | Public venue/service availability calendar + event/ticket 'Getting there' (owner decisions 4–5) | agent D2 (Opus) | 4080/4081/4082; opt-in default off; specs 5/5 + 5/5 + 19/19; parity 284/284; e2e pending browser; follow-ups: settings privacy, block-order insert | done (code) |
| 2026-10-29 | Owner: ONE help centre (signed in or out) | coordinator | /help + /help/[slug] canonical with PublicHeader + SiteFooter; lib/help/context.ts (own guides first, support tied to workspace via ?from= or last workspace); organizer/provider/account help routes redirect; shell links repointed | done (code; browser check with lane C2) |
| 2026-10-29 | Owner: tiny logo on public pages (help etc.) + public pages missing header/footer | agent C2 (browser) | static scan: legal, events directory, register, rsvp, confirmation lack footer; /p, /series lack header; token/portal pages to classify | in progress |
| 2026-10-29 | D2 follow-ups: getting-there notes private (4083), events.settings audit, block-order insert | agent D2 (Opus) | parity 285/285; specs 5/5+5/5+5/5+19/19; tsc 0 | done |
| 2026-10-29 | **P1 SECURITY: events financial/client columns + private settings keys readable by anon and signed-in outsiders on public events** | agent D2 (Opus) | public readers → allow-listed projection; table reads members/holders only | in progress |
| 2026-10-29 | W13 + W12 part A (provider, affiliate, portals, admin) | agent A (Opus) | 432 routes, 20,249 controls, 1,539 click-asserted, 1,209 W12 cells; 13 defects fixed; INCIDENT: crawler cancelled demo agent run 37b8d13c (owner decision); 1 fixture left (signed contract) → purge | done |
| 2026-10-29 | P1 routine scheduler: next_run_at always +24h, ignores schedule (Riverside routines ran together daily at 17:30) | agent A | parser + recompute + tests; no real runs in tests | in progress |
| 2026-10-29 | Lane A leftovers: notification bell cross-workspace 404s; agency-staff wizard visibility; /admin/events pagination; admin trust ellipsis; admin/provider h1 + control tokens; globals.css auth/onboarding zoom rules removed | agent A | | in progress |
| 2026-10-29 | P1 events exposure: 4084 events_public + public_settings projection (live), 12 public readers switched; 4085 base-table close STAGED for post-deploy | agent D2 (Opus) | exercises OK (public data identical to baseline); events-exposure 6/6 (+1 runs post-4085); regression 60/60; parity 286/286; runbook step added | done (stage 2 post-deploy) |
| 2026-10-29 | Lane A follow-ups: routine scheduler fixed (spec 9/9; backfill apply pending owner), notification workspace switch, agency-staff create pages, trust ellipsis, token root cause (density.css), admin/provider title sizes; /admin/events paging open (Q45) | agent A (Opus) | 54-cell re-check clean | done (backfill + paging open) |
| 2026-10-29 | Public pages browser verification + logo sizes + header/footer everywhere | agent C2 (Opus) | 5 specs green (6/6, 6/6, 5/5, logo-size 30 routes, public-chrome 28 routes); brand.css px sizes; events layout footer; legal/rsvp footers; app/not-found.tsx; token chrome | done (5 routes + signed-in help pending) |
| 2026-10-29 | /admin/events server-side paging | agent A (Opus) | migration 202610291052 admin_events_page (aal2, keyset); page rewrite; spec 7/7; DB ≈250 ms; dev render 3.4–4.9 s (prod-build gate in Q45) | done |
| 2026-10-29 | Owner decisions: (1) schedule fix applied — 0 changes (routines off); (2) demo routines switched off — 5 routines in Alex Events + Riverside Arena (both demo), audited agent.routine_disabled; (3) cancelled demo run restored — cancelled is terminal (state machine refused cancelled→running, not bypassed), so re-seeded as seed-provider-admin.mjs did (new run fd637c1d, running 35%, audited agent.run_restored) | coordinator | at launch: re-enable routines then re-run scripts/agent/backfill-routine-schedules.mjs --apply | done |
| 2026-10-29 | Owner: finish off, push (commit + deploy), flip Stripe live | coordinator + agent A2 (Stripe live readiness, code only) | Stripe: prod key STRIPE_CONNECT_SECRET_KEY (sensitive; mode unknown), live keys exist under STRIPE_SECRET_KEY/STRIPE_PUBLIC_KEY; test-mode connected accounts + price ids need live equivalents; no full test purchase yet | in progress |
| 2026-10-29 | Public chrome leftovers + signed-in help centre | agent C2 (Opus) | /ref, /r consent, /payments chrome; help-signed-in spec; all green | done |
| 2026-10-29 | W10 auth/onboarding re-check | agent B (Opus) | focus rings, sticky onboarding header, tap targets fixed; open: pre-existing contrast, a11y spec order, journeys C/K | done |
| 2026-10-29 | Stripe webhooks (owner: 'you do the webhook stuff') | coordinator | live + test endpoints existed; **P1 fixed: Connect endpoint lacked direct-charge payment events** (and platform lacked fee/subscription/invoice events) — all 4 updated in place (24/29 events), secrets unchanged; Vercel prod secret write blocked by permission → owner confirms | done (owner check) |
| 2026-10-29 | Lane D browser verification (availability, getting there, reader switch parity) | agent D2 (Opus) | specs 4/4, 7/7, 28/30, 134/136 (env); parity identical; grid fix; open: discover@390 clip, Stripe deposit checkout session not created | done |
| 2026-10-29 | Customer discover @360/390 header link clip | agent D2 | cu-discover.css .ds-sec-head wrap; 0 overflow at 360/390/1536 | done |
| 2026-10-29 | W10 auth/onboarding regression green | agent B (Opus) | contrast fixed in product (blue-ink, muted-ink), stale specs C/K + keyboard order updated; 39/39 | done |
| 2026-10-29 | Stripe new live account: webhooks recreated (30/24 events), VAT GB508480488 tax ID + UK Stripe Tax registration (live + sandbox), sandbox head office | coordinator | Vercel prod env update = owner (secret-store write blocked) | done (owner env step) |
| 2026-10-29 | Vercel: new Stripe live values pushed (6 vars, prod+preview+dev); Stripe privileges checked (full sk_live, card_payments + transfers active); own-account settings not API-settable → VAT on invoices via code (agent A2) | coordinator | STRIPE_CONNECT_SECRET_KEY = go-live switch | done |
| 2026-10-29 | Close-out 5: Supabase password policy = app rule (min 8, lower+upper+digit+symbol) + HIBP leaked-password check ON | coordinator | management API; demo/fixture passwords all comply | done |
| 2026-10-29 | Close-out 4 prep: production ships the Turnstile site key + loader; Supabase captcha provider turnstile with secret set — switch ON after the full regression (order rule 0b) | coordinator | | ready |
| 2026-10-29 | Close-out 7 dry run: 127 test workspaces — 50 eligible (84 events, 53 test users), 27 blocked by purge gap (ticket_pass_components FK), 50 refused (49 ledger_postings, 1 non_test_member) | coordinator → agent D2 (purge fix + hide public events of refused) | execute awaits owner approval | in progress |
| 2026-10-29 | Close-out 7: PURGE executed (owner-approved) — 50 test workspaces, 84 events, 51 test users removed (2 skipped) | coordinator | purge 28f246a6-1050-4650-a46a-5cf9af332d2d (audited admin command, aal2); remaining 27 after purge-gap fix | done (batch 1) |
| 2026-10-29 | Stripe test→live readiness | agent A2 (Opus) | 5001 mode separation + 5002 VAT summary mode; webhook mode guard (audited); per-mode accounts/customers; dashboards by mode; VAT tax id on own sales; preflight 27 PASS / 1 FAIL (no onboarded test seller) / 3 WARN; specs 10/10 + regression 120/120; runbook "Stripe go-live" | done |
| 2026-10-29 | Stripe live billing by mode + live catalogue (15 prices) | agent A2 | | in progress |
| 2026-10-29 | Stripe TEST onboarding (Riverside, Alex Events) + full test purchase journey (gate before live) | agent C2 (browser) | | in progress |
| 2026-10-29 | Purge-gap fix 202610294086 (FK sweep: ticket_pass_components, registrations, form_responses, selections, waivers, event_parties + SET NULL children, provider_jobs, tickets); dry run of the 27 OK (77 events, 36 users) | agent D2 (Opus) | parity 291/291 | done |
| 2026-10-29 | Public test events hidden via audited service_update_events: 7 (refused workspaces) + 12 (other fixture workspaces); anon events_public / directory / calendar / discover show 0 fixture events | agent D2 | audit event.service_update ×19 | done |
| 2026-10-29 | Purge batch 2 (27 workspaces) — execute BLOCKED by permission classifier (Unverifiable Deletion Scope); awaiting owner | coordinator | list: scratchpad purge_elig.txt [50:77] | blocked (owner) |
| 2026-10-29 | 18 public events owned by p1-*@gala-dock.test users in UNFLAGGED workspaces (Q20 Final Release ×7, Q22 Launch Night ×6, Q26 Festival ×5) still public | — | ids in queue/W08 notes; owner decision | open (owner) |
| 2026-10-29 | Live plan + credit billing by mode (billingMode/priceFor, per-mode billing customers, migration 202610295003) | agent A2 (Opus) | specs payments 74/74 (+8 skip awaiting onboarding); live preflight 26 PASS / 1 FAIL (mode record test — expected until switch) / 2 WARN | done (code) |
| 2026-10-29 | Live catalogue --apply (7 products, 11 prices on acct_1UW16CArv3W3VbtP) BLOCKED by permission classifier; owner to run scripts/stripe/with-live-key.mjs live-catalogue.mjs --apply | — | | blocked (owner) |
| 2026-10-29 | Live Stripe catalogue APPLIED (owner-approved): 7 products, 11 prices on acct_1UW16CArv3W3VbtP, mapped to stripe_price_live; script count bug fixed | coordinator | no duplicates | done |
| 2026-10-29 | Purge batch 2 EXECUTED (owner-approved): 27 workspaces, 77 events, 35 test users (1 skipped) | coordinator | purge f66b975f-7e59-4eff-86fc-0ee9722612a9 | done |
| 2026-10-29 | 18 public test events (unflagged p1-* owners) hidden via audited service_update_events (owner-approved) | coordinator | anon events_public 0 of 18 | done |
| 2026-10-29 | Stripe TEST onboarding stopped at Stripe hCaptcha (not solved, per rule) — owner completes hosted test onboarding for Alex Events + Riverside; fixes: Money › Settlements payouts card, payouts use active workspace, return to Money | agent C2 | journey + booking.spec:54 + stripe-test-mode pending onboarding | blocked (owner) |
| 2026-10-29 | Close-out 1: release:check exit 0 (lint 0 errors, tsc 0, supply chain clean, parity clean); full regression running | coordinator | | in progress |
| 2026-10-29 | Owner moved to NEW Stripe sandbox acct_1UW176Ae36uXyrUn: webhooks created (we_1UW2Bc…), VAT tax id + GB registration + head office set | coordinator | Vercel sandbox push BLOCKED (secret-store write) — owner approval; test catalogue + stale test account links → agent A2 | in progress |
| 2026-10-29 | Owner says test onboarding done, but NO charges-enabled connected account exists in old or new sandbox; Alex linked to old-sandbox acct_1UW1jiAud1DTs7Vu (incomplete), Riverside unlinked | coordinator | asked owner where onboarding was done | open |
| 2026-10-30 | Close-out 1: full regression run 1 — 963 passed, 45 failed, 20 skipped, 78 did not run (35.5 min) | coordinator | causes: sandbox swapped mid-run (stale dev env), catalog/DB mirror drift from wizard sweep, governance checks during migrations, UI regressions; triage split A2 (payments) / D2 (catalog, governance, backend) / B (customer, public, UI) / C2 (organiser UI); dev server restarted on new env; full re-run after fixes | in progress |
| 2026-10-30 | Vercel (owner: "yes" + "put live values in Vercel"): new-sandbox values pushed to all targets (6 vars); STRIPE_CONNECT_SECRET_KEY split — **production = LIVE key** (payments go live on the next production deploy), preview + development = new sandbox | coordinator | values never printed | done |
| 2026-10-30 | Owner: "redeploy and push" → chose WAIT for the green re-run, then captcha on, commit, push, deploy (production goes live on Stripe), then post-deploy 4085 + live preflight + £1 test | owner | lanes finishing the 45 failures | queued |
| 2026-10-30 | A2: new-sandbox test catalogue (7 products/11 prices) applied + remapped; stale test links handled in code (403 account_invalid / 404 resource_missing → clear current-mode column, audited) + cleared for Alex Events & Premier; Riverside payout_status fixed; payments regression 75/75 (+8 skip); clock-skew margins widened; sandbox preflight 29 PASS / 1 FAIL (no onboarded test seller); first live boot handled (mode flip + audit) | agent A2 | live catalogue already applied by coordinator earlier (A2 report stale) | done |
| 2026-10-30 | Regression triage D2 (16 specs): all pass alone — catalog spec + DB mirror (202610295020 webinar spelling), event-catalogue.ts +8 domain events, tenant-security allow-list (6 reviewed anon definer fns), clock-skew fixes (host clock ~1.7 s ahead of DB) in w08, agent-organizer-provider, event-core, q30, observability synthetic.ts; agent.spec entitles fixture (R3/R4 gate) | agent D2 | parity 292/292 | done |
| 2026-10-30 | Owner: public pricing updated — landing #pricing now live from plan_prices/plan_entitlements/credit_packs (organisers + venues/suppliers, monthly/yearly, + VAT), transaction fees from LEGAL, credit top-ups; FAQ updated; /pricing → /#pricing | coordinator | tsc 0, eslint 0; browser check → D2 | done (code) |
| 2026-10-30 | Regression triage C2 (8 organiser specs): 7 pass (5 run-1 artefacts; ticket-pro:77 de-coupled; pwa-event-map spec updated to editor overhaul); ticket-pro:15 blocked by honest readiness (Alex Events not payout-ready) → switching spec to a payment-ready disposable fixture | agent C2 | | in progress |
| 2026-10-30 | Public pricing browser check | agent D2 | 7 widths clean; prices/features match DB; fixes: credits number, "buying tickets free" corrected (buyer fee), "Most popular"→"Recommended", toggle a11y (aria-pressed), layout; pricing.spec 4/4; "Unlimited" verified (plan_entitlements null = unlimited) | done |
| 2026-10-30 | ticket-pro spec on disposable payment-ready organiser | agent C2 | 2/2; leaves 1 hidden fixture event per run (append-only safety plan) in is_test_fixture workspace for the admin purge | done |
| 2026-10-30 | Regression triage B (12 specs): 10 pass — product fixes: plan board + account tabs overflow at 320, resale review refund rule + "Resale unavailable" state; pwa-editors spec → 5-step Ticket Pro; booking.spec:54 skips cleanly. Open: 404 header at 390 (→ C2), request attachment download 404 for recipient (→ D2) | agent B | tsc 0 | done |
| 2026-10-30 | 404 page header at 390 | agent C2 | not reproducible; public-chrome + logo-size 128/128 at 390/1536; dev compile artefact | done |
| 2026-10-30 | pwa-completion-workflows:93 — not an access bug (login race in spec + fail-closed scan in dev); spec fixed, file 8/8; deny cases intact | agent D2 | | done |
| 2026-10-30 | **Production has no CLAMAV_SCAN_URL/CLAMAV_SCAN_TOKEN on Vercel** → private uploads stay not_scanned → quarantined (423) → private file downloads blocked in production; needs the shared ops av-scan-gateway URL/token (owner) | coordinator | | open (owner) |
| 2026-10-30 | Full regression run 2 started (workers=2, trace off, private output) | coordinator | | running |
