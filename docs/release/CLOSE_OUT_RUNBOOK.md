# Gala Dock — Close-out runbook (W15 / Q45)

**Purpose:** the ordered, mechanical steps between "all lanes finished" and the verdict in `RELEASE_VERDICT.md` §13. Each step lists who does it, the action or command, the expected result and the rollback. Record the outcome of each step in the step 15 record.
**Who:**
- **Owner**: the account holder. Owner actions are dashboard, credential or approval steps the coordinator cannot do, or was refused by the permission system.
- **Coordinator**: the main Claude session.
- **Lane C**: platform engineering.
**Command prefix:** Node scripts use `node --env-file=.env --env-file=.env.local …`. Playwright: `node --env-file=.env --env-file=.env.local node_modules/@playwright/test/cli.js test <files> --project=desktop --reporter=line`.
**Resource rules** (queue Operating rules):
- One dev server: `node tools/dev/dev-watchdog.mjs --port 3107`.
- One tsc at a time.
- No `next build` while capturing.
- Pause when free RAM is under 2 GB.

> **⚠ Ordering issue — please decide before starting.**
> Once step 3 turns the Supabase captcha on:
> - every `signInWithPassword` in the specs fails (`tests/phase1/helpers.ts:39`);
> - browser specs that sign in demo accounts through the UI are stopped by Turnstile (memory: QA login needs a human tick; no service-role bypass).
>
> Disposable-identity API specs can still run with `E2E_AUTH_FIXTURE=otp` (`helpers.ts:33`, magic-link OTP, disposable identities only).
> **Recommended order:** 1 → 2 → 4 → 5 → 6 → 7 → 3 → 8 → 9 → 10 → 11 … with a short post-captcha smoke after step 3.
> Step 11 (the Stripe test-mode run) also signs in. Run it before step 3 if the owner's onboarding is already done, or run it with the OTP fixture.
> The numbering below follows the requested order.

> **Turnstile order rule** (`docs/operations/auth-setup.md`): the site key must be live in Vercel **before** the Supabase secret is enabled. T2 was blanked only in `.env.local` and Vercel was untouched, so production should already send tokens. Confirm before step 3.

---

### Step 1 — Final consistency and design check sign-off
- **Who:** Coordinator prepares; Owner signs.
- **Prerequisites:** lanes A, B and D have reported:
- W03/W08 captures;
- W12/W13 parts A and D;
- lane B customer re-measure: checkboxes, `/forgot-password`, "View details", tickets "More options" (`W12_REPORT_partB.md` Follow-up).
- **Action:**
1. Put together a side-by-side pack per workspace: `artifacts/visual/w02/r4/sbs/`, `w03/sbs/`, `w04/sbs/`, `w05`, `w06`, `w07`, `w08`, and the W01 `b5` captures.
2. Check it against the owner standard: premium + consistent (same structure, components, hierarchy) + **one display scale with no component zoom**. Search the code for leftover `zoom:` (the queue names `org-promotion .86` and about 18 in `globals.css` as found; W12 reports cu-book/cu-events/cu-reviews/ticket-setup/landing removed).
3. Confirm consistency tokens are in use (`--k-btn-h` 34 / sm 28 / lg 40, input 36, icon 32, chip 20/18, card padding 16, titles 28/30/15/13.5 — queue W14).
4. Log every remaining difference in `OPEN_ITEMS.md` › Design residuals.
- **Expected:** owner records "design signed off" with an explicit residual list; W14 is marked DONE.
- **Rollback:** none (decision step). If refused, reopen the named routes in the owning lane.

### Step 2 — Enforce CSP after a clean Report-Only run; test the maintenance page
- **Who:** Lane C (engineering); Owner sets the Vercel env.
- **Action:**
1. With the default (Report-Only) mode on the dev server, walk the critical routes: `/`, `/login`, `/events/[slug]`, `/checkout/[event]` (GA and seated), `/discover`, a customer page, an organiser page, a provider page, an admin page, a token portal, `/door/[eventId]`, and the maintenance page.
2. Review the reports received by `/api/csp-report`.
3. Run `q45-csp` (6/6 expected).
4. Set `CSP_ENFORCE=1` locally, restart the dev server, and repeat the walk.
5. Check the maintenance page under enforcement using the admin maintenance banner/page preview (`/admin/maintenance`) or a `qa`-audience window — never a real window.
6. When clean, the owner sets `CSP_ENFORCE=1` in Vercel Production. It takes effect at the step 9 deploy.
- **Expected:** 0 violation reports from first-party scripts. Stripe and Turnstile load. The display-scale fit script runs (nonced). The maintenance page renders and scripts work under enforcement. `q45-csp` 6/6.
- **Rollback:** remove `CSP_ENFORCE` (back to Report-Only) or set `CSP_REPORT_ONLY=0` (off) and redeploy.

### Step 3 — Restore captcha (T1 + T2)
- **Who:** Owner (credentials); Coordinator verifies.
- **Action:**
- **T1:**
  - Either run `node --env-file=.env --env-file=.env.local scripts/auth-config.mjs` (preview), then `--apply`. With `TURNSTILE_SECRET_KEY` set this sets `security_captcha_enabled: true`, provider `turnstile` and the secret (`scripts/auth-config.mjs:19`).
  - Or call the Management API `PATCH /v1/projects/{ref}/config/auth {"security_captcha_enabled": true}` (`EXECUTION_CHECKPOINT.md` T1).
- **T2:** delete the `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` line (and its comment) from `.env.local`, then restart the dev server.
- **Expected:**
- The script prints `captcha: true`.
- A password sign-in without a captcha token is refused by Supabase.
- In a normal browser, login, sign-up and forgot-password show the check, and a human login succeeds.
- In `/api/health` (bearer), auth readiness is OK.
- **Rollback:** only with explicit owner approval: PATCH `security_captcha_enabled: false`. That reopens risk R5.

### Step 4 — Supabase Auth password policy
- **Who:** Owner (Supabase Dashboard → Authentication → Policies / Email provider).
- **Action:**
- Set minimum password length to at least 8 (currently 6, `q45-security.md` §8).
- Require character classes (lowercase, uppercase, digits, symbols).
- Turn on leaked-password protection (HIBP).
- Optional: require reauthentication for password update (`security_update_password_require_reauthentication`).
- API equivalent: `PATCH /v1/projects/{ref}/config/auth`. The field names are expected to be `password_min_length`, `password_required_characters`, `password_hibp_enabled` — **verify them in the Dashboard or API docs; HIBP may need a paid Supabase plan.**
- Align the client-side rule with the server rule.
- **Expected:** sign-up with `abc12345` is refused, and so is a known-breached password. The test password `Gala-Dock-Test-9!` (`helpers.ts:16`) still passes.
- **Rollback:** restore the previous values in the Dashboard. Existing passwords are unaffected either way.

### Step 5 — Regenerate DB types (and the generated seeds if parity asks)
- **Who:** Lane C.
- **Action:**
1. `npm run supabase:types` (`scripts/supabase-types.mjs`, Management API, public schema).
2. If step 6 parity reports a state-machine or agent-tool mismatch:
   - `node scripts/gen-foundation-sql.mjs > supabase/migrations/209912310001_state_seed.sql`;
   - `node scripts/gen-agent-tools.mjs`.
3. Then run tsc: `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit -p .`
- **Expected:** `src/types/database.ts` is updated with the 3033–3037 and 4041–4043 objects; tsc 0 errors.
- **Rollback:** `git checkout -- src/types/database.ts` (and the seed files).

### Step 6 — `npm run release:check`
- **Who:** Lane C.
- **Action:** `npm run release:check` (lint → tsc → `release:supply-chain` → `db:parity`). Also run `npm run db:migrate -- status`.
- **Expected:** exit 0, with:
- lint 0 errors;
- tsc 0;
- npm audit 0;
- parity: 0 pending / 0 unknown / 0 drift, machines and permissions matching, **trigger grants 0**.
- Every applied file is reviewed in `supabase/migration-manifest.json`.
- Record the recorded-migration count (last reported 272/272).
- **Rollback:** none. Fix and re-run.

### Step 7 — Full regression (by spec group)
- **Who:** Lane C (API groups); a browser lane (G9).
- **How:** one group at a time with the Playwright command above. Record pass/fail counts per group.

| Group | Specs |
|---|---|
| G1 Security | `tests/release/{tenant-security, q45-authz-sweep, q45-input-safety, q45-svg-sanitize, q45-csp, workspace-invites, mfa, sessions, passkeys, files-security, upload-safety, lifecycle-service-override, migration-governance, google-signin}` |
| G2 Payments | `tests/payments/*` (excluding `stripe-test-mode` → step 11); `tests/marketplace/{payments, build-items-payment-guard}`; `tests/release/{ticket-ledger, ticket-refund-confirmation, resale-original-refunds, event-cancellation, waitlist-seller-readiness, seller-readiness-ticket-card, vat, saved-payment-methods, boosts, boost-delivery}` |
| G3 Marketplace / provider / trust | `tests/marketplace/*` (rest); `tests/provider/*`; `tests/trust/*`; `tests/release/marketplace-availability` |
| G4 Events / ticketing | `tests/release/{event-core, event-type-matrix, event-type-rules, organizer-plan-core, ticket-credentials, ticket-inventory-checkout, ticket-resale-launch-fraud, guests-access, map-engine, map-merge, q29-virtual-sessions, virtual, launch, s2-access-inventory, d4-b2-gaps}`; `tests/compliance/*` |
| G5 Organiser | `tests/organizer/*` |
| G6 Admin / ops / privacy | `tests/admin/*`; `tests/release/{maintenance (qa audience only), observability, test-fixture-purge, privacy-retention, privacy, fraud-abuse, analytics-warehouse, experiments, communications, email, production-readiness, storage-quota, account-preferences, consent-cookie, help, tours}` |
| G7 Agent / commercial / affiliate | `tests/release/{agent-*, ai-profitability}`; `tests/affiliate/*` |
| G8 Foundation / integration / seed | `tests/foundation/*`; `tests/release/{q44-cross-workspace, q30-api-webhooks, developer, calendar-sync, search, demo, demo-seed, demo-seed-organiser, team-conflicts-v2, media-brand-comments, w13-review-photo-upload}` |
| G9 Browser | `tests/e2e/customer/*.spec.ts` (incl. `w13-remaining`); `tests/e2e/organizer/*.spec.ts`; `tests/e2e/public/*.spec.ts`; `tests/release/{pwa-*}`; `tests/phase1/accessibility/a11y.spec.ts`; the `responsive` project |

- **Excluded by rule:** `stripe-test-mode` (step 11); the Stripe Checkout spec; specs that send real email.
- **Known stale before running:**
- `agent-planning-tools` seating "Vegan" expects legacy `guests.dietary`.
- Workflow-foundation catalogue parity (`merch.paid_after_expiry` and in-flight types).
- Watch for two intermittent failures under load: q29 beforeAll and Q20 24-buyer.
- **Expected:** all groups green; tenant-security 12/12; no new public fixtures left visible (cleanup hides them).
- **Rollback:** n/a. Failures go to the owning lane before step 9.

### Step 8 — Hide public p1 test events, then purge (dry run shown to owner first)
- **Who:** Coordinator prepares; **Owner approves each write** (the permission classifier refused the coordinator's earlier attempts).
- **8a Hide.**
1. List the events:
   ```sql
   select e.id, e.title, w.name, w.is_test_fixture from events e join workspaces w on w.id = e.workspace_id
   join auth.users u on u.id = w.owner_id
   where e.visibility = 'public' and (w.is_test_fixture or u.email like 'p1-%@gala-dock.test');
   ```
2. Show the list to the owner.
3. On approval:
   ```sql
   update events set visibility='private' where id in (<approved ids>);
   ```
   This is the same write `cleanup()` uses (`helpers.ts:60`). It does not enter ready/published, so the lifecycle guard is not triggered.
- **Expected:** Discover and `/api/public/search` show no p1 events. Reported counts were 50 vs 66 (see verdict §14 C4).
- **8b Purge dry run.**
```
PURGE_ADMIN_EMAIL=… PURGE_ADMIN_PASSWORD=… PURGE_ADMIN_TOTP_SECRET=… node --env-file=.env --env-file=.env.local scripts/testing/purge-test-fixtures.mjs --workspaces=<uuid,…> --reason="close-out fixture purge"
```
- This runs as an aal2 platform admin through `admin_purge_test_workspaces`, with no `--execute`.
- Candidates: the 2 eligible plus 19 previously guard-blocked p1 workspaces (queue Q45 owner decision).
- Also review: the support-queue "Card dispute fraudulent" fixtures, and disposable p1 auth users (309 auth users total, Q38).
- **Show the per-table output to the owner.**
- **8c Execute.** The same command with `--execute`, after owner approval. Ledger-bearing workspaces stay hidden (refused by design).
- **Expected:** the purge record is in the permanent log; listed test identities are removed; demo identities (`@example.com`) are untouched.
- **Rollback:**
- 8a: set visibility back to `public` for the listed ids.
- 8c: irreversible. Restore single rows from the nightly R2 backup only by dual-control decision (`backup-restore.md`).

### Step 9 — Commit and deploy to Vercel production
- **Who:** Coordinator commits **on owner instruction**; Owner approves the deploy.
- **Action:**
1. Run `git status` and review: 672 MB of screenshot evidence under `artifacts/` stays local, and the 6 deleted design PNGs stay uncommitted (queue Q39).
2. Commit on `release/enterprise-queue-2026-10-29`. Include next 16.4.3 / zod 4.6.7 and the `AGENTS.md` block.
3. Deploy the project's usual way. `runbook.md` says Vercel deploys from `main`, so either merge the release branch or promote it. The Vercel project is `gala-dock-final-release-v-1-0`.
4. Make sure `CSP_ENFORCE=1` (step 2) is set in Vercel before the deploy.
5. Then confirm every platform admin has TOTP enrolled (3034 already requires aal2).
6. Then apply `supabase/pending/q04_public_buckets_server_only.sql` through the migrate tool.
- **Expected:**
- The deployment is Ready.
- `www.galadock.com` returns 200.
- next 16.4.3 is in production.
- `/api/cron/jobs` is no longer 404.
- Guest dietary data shows (Q18).
- **Rollback:** Vercel → Deployments → previous → **Promote** (RTO 10 min). Migrations stay (additive); forward-fix only.

### Step 10 — Post-deploy verification
- **Who:** Owner runs the SQL; Coordinator checks the results.
- **Action:**
1. Schedule the probes:
   ```sql
   select cron.schedule('synthetic-probes','*/15 * * * *',$$select public.dispatch_worker('/api/cron/probes')$$);
   ```
   Set `SYNTHETIC_PROBE_EMAIL` / `SYNTHETIC_PROBE_PASSWORD` in Vercel. Probe login now meets the captcha — confirm the probe path handles it.
2. Check `GET /api/health`, both anonymous and with `Authorization: Bearer $CRON_SECRET`.
3. Check worker dispatch (`runbooks.md` worker-dispatch):
   ```sql
   select status_code, headers->>'x-vercel-error', count(*) from net._http_response where created > now() - interval '15 minutes' group by 1,2;
   ```
4. Check `/admin/health` and `/admin/health/jobs`, or `admin_ops_overview()`.
5. Confirm INC-20261029-0001 and the alert `workers.dispatch_failures` are resolved, and the email/app-job backlog has drained.
6. Remove the legacy no-reason maintenance fallback (Q31).
- **Expected:**
- Health is OK.
- Dispatch responses are 2xx only.
- Cron is fresh.
- There are 0 open critical alerts.
- The first probe run is green.
- **Rollback:** `select cron.unschedule('synthetic-probes');`. For a failing deploy, see step 9 rollback.

### Step 11 — Stripe test onboarding (owner), then the Q07 test-mode run
- **Who:** Owner (normal browser — Stripe refuses ToS on the seller's behalf, `tos_acceptance_on_behalf_not_allowed`); then Lane C.
- **Action:**
1. Complete the onboarding links for Alex Events and the QA seller (queue table). Regenerate expired links with:
   ```
   node --env-file=.env --env-file=.env.local scripts/seed-q38-demo.mjs --steps=sellers --links
   ```
2. Re-run `scripts/seed-q38-demo.mjs`.
3. Run `tests/payments/stripe-test-mode.spec.ts`. It was 8 skipped until onboarding.
4. Seed the waiting paid-order data (`docs/demo/seed-catalogue.md` "Waiting"): resale listing, past sales, merch, weekend pass, campaign revenue.
5. Finish the W02/W13 blocked items: checkout BUY-W01-02/03, resale review, cancel resale.
6. Fix the sandbox Connect endpoint subscriptions (verdict X2).
- **Expected:** accounts show `card_payments` active; the stripe-test-mode spec passes; Q07 → VERIFIED.
- **Rollback:** test mode only. Disable the test accounts in Stripe if needed; no live money moves.

### Step 12 — ClamAV gateway deploy (blackwellen-operations)
- **Who:** Owner / ops (repo `blackwellen-operations`, `services/av-scan-gateway`, runbook `ops/runbooks/av-scan-gateway.md`).
- **Action:**
1. Deploy the gateway (Oracle B).
2. Set `CLAMAV_SCAN_URL` / `CLAMAV_SCAN_TOKEN` in Vercel.
3. Run `node --env-file=.env --env-file=.env.local scripts/files/rescan-quarantined.mjs`.
- **Expected:**
- `GET /healthz` is OK.
- `/api/health` shows ClamAV ready.
- The 10 stored request PDFs clear (no more 423).
- The Gala Dock readiness spec (`production-readiness` 8/8) still passes.
- **Rollback:** unset the env. Files fail closed (quarantined), as now.

### Step 13 — Remaining external keys
- **Who:** Owner.
- **Action:**
- `SENTRY_DSN` (+ `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`).
- An Uptime Kuma monitor on `/api/health`: public every minute, bearer every 5 min.
- VAPID keys (push).
- Weather provider key (Q26).
- Video provider keys (Q29).
- Optional: wallet certificates, e-signature, SMS, Resend webhook secret, mailbox credentials.
- **Expected:** each integration moves from `blocked_external` to ready in `/api/health` / `/admin/health`. A test error event appears in GlitchTip/Sentry, with no headers, cookies or bodies sent.
- **Rollback:** unset the env; the integration returns to BLOCKED_EXTERNAL and the feature stays off.

### Step 14 — Revoke legacy `workspace_invites` column grants
- **Who:** Lane C writes the migration; Coordinator applies it after the step 9 deploy (the old code may use the grants until then).
- **Action:**
1. Inspect the grants:
   ```sql
   select grantee, privilege_type, column_name from information_schema.column_privileges
   where table_schema='public' and table_name='workspace_invites' and grantee in ('anon','authenticated');
   ```
2. Write a revoke migration for the listed client grants in the lane C range.
3. Run `migrate lint` → `dry-run --exercise` (the exercise calls `create_workspace_invite` / `revoke_workspace_invite` as owner, and a direct client write that must fail) → `review` → `apply`.
- **Expected:** `workspace-invites` 5/5; tenant-security 12/12; trigger grants 0.
- **Rollback:** re-grant the listed column privileges (statement recorded in the review `--rollback`).

### Step 15 — Final sign-off record
- **Who:** Coordinator writes; Owner approves.
- **Action:**
1. Fill `RELEASE_VERDICT.md` §4 and §13, and update the queue W15/Q45 status.
2. Record per step: date/time, who, result, and evidence path.
3. Record the deployed commit and Vercel deployment id, the release:check output, regression counts per group, the purge record id, and the remaining OPEN_ITEMS with owners.
4. Update `EXECUTION_CHECKPOINT.md`.
- **Expected:** a verdict of READY / CONDITIONALLY_READY / NOT_READY per verdict §13, with the owner's approval recorded.
- **Rollback:** n/a.

| Step | Done (date/time) | By | Result | Evidence |
|---|---|---|---|---|
| 1–15 | ⟦ ⟧ | ⟦ ⟧ | ⟦ ⟧ | ⟦ ⟧ |

### Post-deploy: close the events base table (P1 exposure, lane D — 2026-10-29)
**Why:** on public events, anon and signed-in outsiders could read private `events` columns (budget_total, revenue_goal, target_profit, client_name/client_id/lead_id, goal, priorities, guest counts, owner_id) and private `settings` keys (budget_lines, revenue_sources, objectives, risk, readiness, promotion_plan, ticket_pro comps, invite_token, admin_restriction). 202610294084 (live) added `events.public_settings` (trigger allow-list) + the `events_public` view and switched every public reader to it. 202610294085 closes the base table and is staged in `supabase/staged/` because the currently deployed production code still reads the base table. **Until it is applied, the exposure remains open through the REST API.**

Run ONLY after the production deploy that contains the `events_public` reader switch:
1. Confirm prod serves the new build: anon `GET /rest/v1/events_public?id=eq.392fdf17-4e5c-4473-987c-251dc0a97228&select=id,settings` returns Neon, and /events/neon-nights, /venues/riverside-arena, /checkout/neon-nights, /organizers/<alex ws> and Discover load.
2. `git mv supabase/staged/202610294085_events_close_base_table.sql supabase/migrations/`
3. `node --env-file=.env --env-file=.env.local scripts/db/migrate.mjs lint 202610294085_events_close_base_table.sql`
4. `… dry-run 202610294085_events_close_base_table.sql --exercise=scripts/db/exercises/202610294085_events_close_base_table.sql` (expect EXERCISE_OK)
5. `… review 202610294085_events_close_base_table.sql --lane=D --reviewer=<name> --exercise=scripts/db/exercises/202610294085_events_close_base_table.sql --rollback="grant select on public.events to anon; recreate events_read with the public branch"`
6. `… apply 202610294085_events_close_base_table.sql`; `… verify 202610294085_events_close_base_table.sql`; `npm run -s db:parity` (clean)
7. `npx playwright test tests/release/events-exposure.spec.ts --project=desktop` — the "base table closed" test must now RUN and pass (7/7); plus q45-authz-sweep, phase1/security/rls, public-event-extras, ticket-inventory-checkout.

**Rollback** (if a public page breaks): `grant select on public.events to anon;` and re-create `events_read` with `… OR ((visibility = 'public') AND (status = ANY (ARRAY['published','on_sale','live'])))`. The child policies and RPCs rewritten by 4085 are equivalent for all callers and can stay.

### At launch: re-enable agent routines (owner decision 2026-10-29)
Demo routines (Alex Events, Riverside Arena) were switched off until launch (audit `agent.routine_disabled`). When re-enabling any routine, then run `node --env-file=.env --env-file=.env.local scripts/agent/backfill-routine-schedules.mjs` (dry run) and `--apply` so `next_run_at` follows the real schedule (Q41/Q43 scheduler fix). Expect real Azure AI runs at each routine's cadence (e.g. "Every 30 min" ≈ 48 runs/day).

### Stripe webhooks (coordinator, 2026-10-29)
Live and test each have two endpoints at `https://www.galadock.com/api/stripe/webhook` (platform `we_1UPJQZASNGdjowJCuJG93vTY` / test `we_1UPJQZPCqawznZLzDRsP8PmL`; Connect `we_1UPJQZASNGdjowJC4tiYUuiu` / test `we_1UPJQaPCqawznZLzlH4AiahS`), all enabled; live account `acct_1UP5bUASNGdjowJC` charges + payouts enabled.
**Fixed:** the endpoints did not subscribe to every event `routeEvent()` handles. Most serious: direct-charge checkout/payment/refund/dispute events happen on the connected account and arrive ONLY on the Connect endpoint, which had account + payout events only — ticket, merch, invoice and payment-order payments would never have been confirmed. `scripts/stripe-webhooks.mjs` lists now match the code (platform 29 events incl. charge.refund.updated, application_fee.*, customer.subscription.*, invoice.*; Connect 24 incl. checkout.session.*, payment_intent.*, charge.refunded/refund.updated, charge.dispute.*, account.external_account.*, payout.*). Updated in place on all four endpoints (signing secrets unchanged); `.env` unchanged.
**Owner step (blocked for the agent — secret-store write):** confirm Vercel production + preview hold the signing secrets for these four endpoints: `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_CONNECT`, `STRIPE_WEBHOOK_SECRET_SANDBOX`, `STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT` — the same values as the local `.env.local` / Vercel development entries (created together with these endpoint ids). After the deploy, check Stripe dashboard → Webhooks → each endpoint shows 2xx deliveries.

### Stripe — new accounts, webhooks, VAT (coordinator, 2026-10-29, owner: "remake them … add our VAT info")
- **Accounts behind the keys in `.env`:** live `acct_1UW16CArv3W3VbtP` ("Gala Dock", GB, GBP, standard; charges + payouts enabled; Connect enabled, 0 connected accounts) — a NEW live account. Sandbox `acct_1UP5m9PCqawznZLz` (unchanged; 13 test connected accounts, **none charges-enabled — onboarding never completed**, which is why the deposit-checkout e2e fails). Publishable keys match their accounts. Vercel env values are still the 11 Oct ones (old live account `acct_1UP5bUASNGdjowJC`).
- **Webhooks:** new live endpoints created on the new account — platform `we_1UW1I5Arv3W3VbtPE4mZyNRQ` (30 events) and Connect `we_1UW1I5Arv3W3VbtPlfUn5aYi` (24 events), both `https://www.galadock.com/api/stripe/webhook`; ids + signing secrets written to `.env` by `scripts/stripe-webhooks.mjs`. Sandbox endpoints reused (29/24 events). The old live account's two endpoints (`we_1UPJQZASNGdjowJC…`) are now unused — disable them in the old account's dashboard once production has switched.
- **VAT:** account tax ID `gb_vat GB508480488` added to live (`txi_1UW1J3Arv3W3VbtP71TO81zm`) and sandbox; Stripe Tax UK registration (standard, active from 2026-10-29) on live (`taxreg_1UW1J4Arv3W3VbtPbo0Zkl3z`) and sandbox; live tax head office already HR5 3DJ, sandbox head office set to 61 Bridge Street, Kington HR5 3DJ. Owner dashboard steps: Settings → Invoices → show the VAT number on invoices by default; Settings → Business → public details (support email support@galadock.com, URL https://www.galadock.com) — the platform's own business profile can't be set by API.
- **Vercel — DONE 2026-10-29 (owner instruction):** `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_CONNECT`, `STRIPE_WEBHOOK_ENDPOINT_ID`, `STRIPE_WEBHOOK_ENDPOINT_ID_CONNECT` pushed from `.env` to production+preview and development (values never printed). Takes effect on the next deploy. **Remaining go-live switch:** `STRIPE_CONNECT_SECRET_KEY` → new live secret key.
- *(previous note)* Vercel production + preview must be updated: `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_CONNECT`, `STRIPE_WEBHOOK_ENDPOINT_ID`, `STRIPE_WEBHOOK_ENDPOINT_ID_CONNECT` to the new `.env` values; and, at go-live, `STRIPE_CONNECT_SECRET_KEY` (the key production actually uses) to the new live secret key. Sandbox values unchanged unless the sandbox key was rotated.
- **Privileges (checked 2026-10-29):** live key is a full `sk_live` (not restricted); platform capabilities card_payments + transfers active, no requirements due, not disabled; Connect list, products, prices, Checkout, payment intents, refunds, payouts, application fees, subscriptions, invoices, webhooks, Stripe Tax, tax rates and billing portal all accessible. Sandbox platform capabilities all inactive (fine for direct charges; connected test accounts still need onboarding).
- **Dashboard-only (Stripe refuses own-account updates by API):** business profile support email/URL and the invoice VAT default. The VAT number is being attached in code (`account_tax_ids`) on Gala Dock's own invoices instead.

### Stripe go-live: test → live (lane A2, 2026-10-29)
**Code:** test/live separation, from migrations `202610295001_stripe_mode_separation` and `202610295002_vat_summary_mode`.
- **Mode source:** the prefix of the platform key `STRIPE_CONNECT_SECRET_KEY` alone decides the app's Stripe mode. `sk_live_` or `rk_live_` means live.
- **Webhooks:** the route verifies all four signing secrets. It processes an event only when both the signing secret's mode and the event's `livemode` match the platform mode. Anything else gets a 200 response, is ignored and is audited as `stripe.webhook_mode_ignored`.
- **Connected accounts per mode:** `workspaces.stripe_account_id` holds the test account and `stripe_account_id_live` the live one. `connect_accounts.livemode` records which mode each row is.
- **What reads the current mode only:** readiness, checkout, payouts and onboarding. A test account in live shows as "set up payouts" and never raises an error.
- **Money rows:** transactions, ledger, orders, payouts, refunds, reconciliation and the VAT statement all carry `livemode`. Existing rows are test. Live dashboards show live rows only. Nothing is deleted.

**GATE: do not switch until a full test-mode purchase journey has passed end to end. It has never passed.**
- All 13 sandbox connected accounts are `charges_enabled=false`. This is also why `tests/e2e/customer/booking.spec.ts:54` (deposit checkout) fails.
- The 46 `connect_accounts` rows the DB calls "ready" are all seeded `acct_test_*` fixtures. None of them can take a real charge.

**A. Full test-mode journey (must pass first)**
1. **Onboard sellers in test mode.** Owner, in a normal browser, with Stripe in test mode: complete the onboarding links from Step 11 for at least one organiser and one supplier.
   - Organiser: Alex Events.
   - Supplier: the one on the e2e listing, e.g. Riverside Arena, account `acct_1UVcicAFzcyuCENj`.
   - Use Stripe test data:
     - phone `000 000 0000`, SMS code `000000`
     - DOB `01/01/1901`, address line `address_full_match`
     - sort code `108800`, account `00012345`
     - test ID document "success"
2. **Sync the account.** While signed in as that seller, open `/api/payouts?kind=provider` (or `kind=organizer`). The seller's `connect_accounts` row must show `charges_enabled=true`, `card_payments_capability=active` and `livemode=false`.
3. **Preflight (test):** `node --env-file=.env --env-file=.env.local scripts/stripe/live-preflight.mjs`. The item "at least one seller can take a real test charge" must be PASS.
4. **Buy a ticket.** Use card `4242 4242 4242 4242` on one of that organiser's paid events. Expected: order `paid`, tickets issued, ledger memo `stripe:pi:*` posted.
5. **Scan the ticket** at the door scanner. It is accepted the first time and rejected the second.
6. **Refund it** from organiser Money, or by cancelling. `charge.refunded` arrives on the **Connect** endpoint, the refund delta is posted once, and the order becomes `refunded`.
7. **Book a supplier deposit** with `tests/e2e/customer/booking.spec.ts` (browser). It redirects to `checkout.stripe.com` and the booking confirms on return.
8. **Reconcile.** Run the `payments.reconcile` job, or wait for the 04:20 run. `/admin/commerce/reconciliation` must show 0 critical variances.
9. **Run** `tests/payments/stripe-test-mode.spec.ts`. It must pass with no skipped tests.

**B. Owner: Stripe dashboard, live (account `acct_1UW16CArv3W3VbtP`)**
1. **Account details.** The account is activated, with charges and payouts enabled (checked 2026-10-29). Still to do:
   - Settings → Business: public details (support email and URL) and the statement descriptor.
   - Settings → Branding: icon, logo and colours. The preflight flags the icon/logo as missing.
2. **Connect → Settings.** Live Connect is enabled. Set the platform branding shown during onboarding. Leave the connected-account payout schedule at Stripe's default (daily or weekly). Sellers are on direct charges: they have the full Stripe dashboard, pay their own Stripe fees, and Stripe collects KYC.
3. **Webhooks already exist** on the new live account (see "Stripe — new accounts, webhooks, VAT"):
   - platform `we_1UW1I5Arv3W3VbtPE4mZyNRQ`
   - Connect `we_1UW1I5Arv3W3VbtPlfUn5aYi`

   Their event lists come from `scripts/stripe/webhook-events.mjs`, the same lists as test. Do not register them again. After the switch, disable the old account's endpoints `we_1UPJQZASNGdjowJC…`.
4. **VAT number on invoices.** Settings → Invoices: show the GB VAT number by default. Its tax ID is `txi_1UW1J3Arv3W3VbtP71TO81zm`. The code attaches this ID to credit-pack receipts and to plan changes. The first invoice of a subscription started through Checkout relies on this dashboard default.
5. **Live catalogue** (required: plan and credit billing run live). Dry run: `NODE_ENV=production node --env-file=.env.production.local scripts/stripe/live-catalogue.mjs`. Then the owner runs it with `--apply`. That fills `stripe_price_live` and `stripe_product_live` and writes `scripts/stripe/live-price-map.json`.

**C. Vercel production env (names only)**
| Variable | Must hold |
|---|---|
| `STRIPE_CONNECT_SECRET_KEY` | **The go-live switch.** Set it to the new live secret key (`sk_live_…`, account `acct_1UW16CArv3W3VbtP`). It holds the test key today. |
| `STRIPE_PUBLIC_KEY` | The live publishable key (`pk_live_…`) of the same account. Already updated. |
| `STRIPE_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET_CONNECT` | The `whsec_…` secrets of the new live platform and Connect endpoints. Already updated. |
| `STRIPE_WEBHOOK_ENDPOINT_ID` / `STRIPE_WEBHOOK_ENDPOINT_ID_CONNECT` | `we_1UW1I5Arv3W3VbtPE4mZyNRQ` / `we_1UW1I5Arv3W3VbtPlfUn5aYi`. Already updated. |
| `STRIPE_WEBHOOK_SECRET_SANDBOX` / `STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT` | Keep. These are the test endpoint secrets. In live, their events are verified and then ignored. |
| `STRIPE_SECRET_KEY_SANDBOX` / `STRIPE_PUBLIC_KEY_SANDBOX` | Keep. Never used in production, because `NODE_ENV=production` disables the sandbox fallback. |
| `STRIPE_SECRET_KEY` | Not read by the app. Only `scripts/stripe-webhooks.mjs` uses it. |

Preview: keep `STRIPE_CONNECT_SECRET_KEY` on the **test** key. Preview shares the production database, and only production writes the platform mode record.

**D. Switch**
1. Set `STRIPE_CONNECT_SECRET_KEY` (production) to the live key. Redeploy production.
2. On boot, production calls `stripe_set_platform_mode(true)` (in `src/instrumentation.ts`). This:
   - sets `stripe_platform_mode.livemode=true`;
   - recomputes `workspaces.payout_status` for live, so every workspace shows `not_connected` until it onboards in live;
   - writes the audit event `stripe.platform_mode_changed`.

   If the boot write did not happen, run `NODE_ENV=production node --env-file=.env.production.local scripts/stripe/set-db-mode.mjs --apply`.
3. **Preflight against production:**
   - pull the env: `vercel env pull .env.production.local --environment=production`;
   - run `NODE_ENV=production node --env-file=.env.production.local scripts/stripe/live-preflight.mjs`;
   - every item must be PASS, except the WARN about plan billing;
   - delete the pulled file afterwards.

**E. Real-money smoke test (owner)**
1. **Onboard in live.** In the owner's own organiser workspace, go to Money → Set up payouts and enter real details. This creates a new live account, stored in `stripe_account_id_live`.
2. **Buy one ticket.** Create a private paid event with a single £1.00 ticket. Buy it with the owner's real card.
3. **Check the purchase:**
   - order `paid` and ticket issued;
   - ledger memo `stripe:pi:*` with `livemode=true`;
   - webhook event recorded with `livemode=true` and processed;
   - the admin ledger shows only this live row.
4. **Refund it** in full from organiser Money. `charge.refunded` arrives, the refund is posted, and the order becomes `refunded`. Then cancel or archive the event.
5. **Check webhooks.** In Stripe dashboard → Webhooks, both live endpoints show 2xx responses.

**F. Sellers re-onboard in live**
- There are no live connected accounts yet (0 on the new account).
- Until they onboard, every organiser and supplier sees "Set up payouts". Readiness returns `seller_not_ready`, and checkout says "This supplier can't take card payments yet".
- Send sellers the Money → Set up payouts link.
- Test account ids are kept for rollback and are never used in live.

**G. Rollback**
1. Set `STRIPE_CONNECT_SECRET_KEY` (production) back to the test key. Redeploy.
2. On boot:
   - production writes `livemode=false`;
   - `payout_status` returns to the test values;
   - dashboards show test rows again.
3. **What stays in place:** live rows, live account ids and live snapshots. A test snapshot can never overwrite a live one.
4. **Live payments taken in the meantime** stay on the seller's Stripe account. Reconcile or refund them from the Stripe dashboard. Stripe objects from one mode can never be used with the other mode's key.

**Known limits**
- **Plan and credit-pack billing runs in the key's mode** (`billingMode` + `priceFor`, migration `202610295003` for per-mode billing customers). In live it uses `stripe_price_live`, and an unmapped plan or pack shows "isn't set up for billing yet". Create the live catalogue first: `node --env-file=.env --env-file=.env.local scripts/stripe/with-live-key.mjs live-catalogue.mjs --apply` (owner-approved; this creates 7 products and 11 prices on `acct_1UW16CArv3W3VbtP` and fills `stripe_price_live`).
- **Local dev and preview share the live database.** After the switch, page reads there use the live mode record. Service-role calls send their own mode.

### Go-live switch set (2026-10-30, owner instruction)
Vercel `STRIPE_CONNECT_SECRET_KEY`: **production = live key** (`acct_1UW16CArv3W3VbtP`), preview + development = new sandbox (`acct_1UW176Ae36uXyrUn`); the shared production+preview entry was split. Sandbox-named vars (key, publishable key, both webhook secrets, both endpoint ids) = new sandbox on all targets. **Takes effect on the next production deploy** — from then production takes real payments; the platform mode record flips to live at boot. At that point: run the live preflight, the £1 real-card smoke test + refund, and have sellers set up payouts in live (no live connected accounts exist yet, so paid ticket sales stay "not on sale yet" until each seller onboards). Note: the full test-mode purchase journey has still not been completed (no onboarded sandbox seller).
