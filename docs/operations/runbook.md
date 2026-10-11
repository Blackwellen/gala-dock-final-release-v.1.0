# Gala Dock operations runbook: backups, disaster recovery, incident response, observability

**Owner:** Blackwellen Ltd engineering · **Covers:** release spec §132–137 · **Last verified:** 11 Oct 2026

## 1. System map (production)

| Component | Provider | Region | Notes |
|---|---|---|---|
| Web app, API, MCP, cron targets | Vercel (Next.js 16) | Per Vercel project settings | Deploys from `main` |
| Database, Auth, Storage, Realtime, pg_cron | Supabase (Postgres 17) | **eu-west-2 (London)** | Project status `ACTIVE_HEALTHY` |
| Payments | Stripe (Connect, separate charges and transfers) | — | Webhooks → `/api/stripe/webhook` |
| AI | Azure OpenAI | Configured endpoint | Metered, capped per workspace |
| Maps | MapTiler | — | — |
| Email | Resend (outbox worker) | — | **BLOCKED_EXTERNAL**: no key configured |
| Object storage backups | Cloudflare R2 (`galadock`, EU jurisdiction) | EU | Storage replication every 15 min |

Scheduled jobs (pg_cron → `dispatch_worker` → HTTPS with `CRON_SECRET`):

| Job | Schedule | Target |
|---|---|---|
| agent-worker | every minute | `/api/agent/worker` |
| webhook-deliveries | every minute | `/api/cron/webhooks` |
| email-outbox | every 2 min | `/api/cron/email` |
| payments-worker | every 5 min | `/api/cron/payments` |
| marketplace-sweep | every 5 min | SQL |
| waitlist-notify | every 5 min | SQL |
| break-glass-expire | every 15 min | SQL |
| privacy-deletions | daily 02:17 UTC | `/api/cron/privacy` |
| break-glass-retention | monthly | SQL |
| agent-retention | monthly (2nd, 04:15 UTC) | SQL |
| storage-backup | every 15 min | `/api/cron/storage-backup` |
| retention-security-logs | monthly | SQL |

## 2. Backups (§132)

**Current state, verified through the Supabase Management API on 11 Oct 2026:**
* Daily physical backups (WAL-G) are **enabled**. Latest completed backup: 10 Oct 2026 18:23 UTC.
* Point-in-time recovery is **disabled**, so the recovery point objective is up to 24 hours. **Recommendation (release-blocking for payments):** enable PITR before taking live money. Payment and ticket state also lives in Stripe, but bookings, check-ins and ledger postings made since the last backup would otherwise be lost.
* Storage buckets (`workspace-files`, `event-media`, avatars) are not included in database backups. They are replicated to Cloudflare R2 every 15 minutes (`storage-backup` job → `/api/cron/storage-backup`, keys `storage/<bucket>/<path>`, deleted objects kept 35 days). The bucket (`galadock`) is in Cloudflare's EU jurisdiction (endpoint `<account>.eu.r2.cloudflarestorage.com`); the client auto-detects this or uses `CLOUDFLARE_R2_JURISDICTION`. Verified with a replication probe on 11 Oct 2026. Restore: copy objects back from `storage/<bucket>/<path>` with any S3 client pointed at the EU endpoint.
* Secrets are held in Vercel environment variables and Supabase Vault (`cron_secret`, `app_url`) and are excluded from backups by design. Recovery uses the password manager record "Gala Dock production secrets".

## 3. Restore test (§133)

**Status: NOT PERFORMED, BLOCKED_EXTERNAL_CONFIGURATION.** Restoring into production is never acceptable, and no staging project exists to restore into. Procedure for the first quarterly test:
1. Create a temporary Supabase project in the same region and restore the latest backup into it (Dashboard → Database → Backups → Restore to new project).
2. Run `supabase db diff` against `supabase/migrations` and expect no drift.
3. Run the read-only smoke suite against it: `E2E_BASE_URL` pointing at a preview deployment wired to the restored project, `tests/release/*.spec.ts`.
4. Record the elapsed time (RTO evidence), the backup timestamp (RPO evidence) and any drift, then delete the temporary project.

## 4. Disaster recovery (§134)

| Scenario | RTO target | RPO (current / with PITR) | Procedure |
|---|---|---|---|
| Bad deploy | 10 min | 0 | Vercel → Deployments → previous → Promote. Migrations are additive; never roll back a migration that has been applied, write a forward fix |
| Data corruption by a bug | 4 h | 24 h / minutes | Set **M3** read-only on the affected modules (Admin → Maintenance), identify the window from `audit_events` and `state_violations`, restore to a new project, copy the affected rows back with SQL, end maintenance |
| Supabase regional outage | Provider-led | 24 h / minutes | Set **M4** with a status page link; tickets already in wallets keep rendering offline (PWA). Await the provider, or restore from backup to another region if the outage is prolonged (>12 h) |
| Stripe outage | Provider-led | 0 | Checkout fails closed; webhooks are retried by Stripe and reconciled on return (`/payments/[ref]` verifies with Stripe) |
| Credential compromise | 1 h | 0 | **M5 lockdown**, rotate the affected secret (see §5), revoke sessions (`auth.sessions`), review `audit_events` |
| Azure OpenAI outage / deprecation | 1 day | 0 | Agent runs move to `waiting_external`; nothing else depends on it. Point `AGENT_MODEL_*` at the successor deployment |

## 5. Incident response (§135)

Severity:
* **SEV1:** payments wrong, data exposure, platform down, or check-in down on an event day.
* **SEV2:** a core flow degraded.
* **SEV3:** a minor defect with a workaround.

1. **Declare.** Open an incident in the support system with a timestamp and an incident commander. For SEV1, set maintenance immediately: **M5** for a security incident, otherwise M2–M4 for the affected modules. Check-in keeps working unless explicitly named.
2. **Contain.** Rotate whichever secret is involved: `CRON_SECRET` (Vercel plus Vault `cron_secret`), `TICKET_QR_SECRET` (this invalidates rotating wallet QRs; print credentials re-issue), Stripe keys (Dashboard → roll key, then update Vercel), webhook signing secrets, `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → API → reset JWT secret, which signs everyone out). Revoke API keys (`api_keys.revoked_at`) and disable webhook endpoints as needed.
3. **Investigate.** Sources: `audit_events` (who/what/when), `break_glass_access_log`, `api_requests`, `webhook_deliveries`, `state_violations`, `ai_usage_events`, Vercel function logs, Supabase logs, Stripe events.
4. **Notify.** Personal data breach likely to risk people's rights → report to the ICO within **72 hours** of becoming aware, and inform affected people without undue delay when the risk is high. Payment-card issues → Stripe. Keep a decision log, including decisions not to notify.
5. **Recover** under §4, end maintenance, and monitor `/api/health`.
6. **Review** within 5 working days: blameless write-up, actions with owners, and an update to this runbook.

## 6. Observability (§136)

* **Health:** `GET /api/health` (public) returns liveness, database reachability and maintenance level. With the `CRON_SECRET` bearer it also returns integration readiness, cron freshness and failures, and backlogs (active agent runs, payouts due, refunds pending, queued email) plus the minutes since the last Stripe webhook. Point an external uptime monitor at the public endpoint every minute and at the authenticated one every 5 minutes. **Monitor not yet configured: BLOCKED_EXTERNAL.**
* **Admin dashboard:** Platform Settings → System health (`/admin/health`) shows the same data to admins.
* **Alert thresholds (proposed):**
  * a cron job without a successful run for 3× its interval
  * `email_queued` over 500
  * `payouts_due` over 0 for more than 24 h
  * last webhook over 6 h during trading hours
  * any `state_violations` row
  * `ai.soft_cap_reached` events (informational)
* **Logs:** Vercel function logs (request ids `req_…` are echoed in API responses for correlation) and Supabase Postgres/API logs. Error tracking (Sentry or similar) is **not configured: BLOCKED_EXTERNAL.**
* **Audit:** every sensitive action writes `audit_events`. Break-glass access is logged per opened conversation. Maintenance windows, MFA changes, API keys, webhooks, AI budgets and privacy requests are all audited.

## 7. Health dashboard (§137)

Implemented at `/admin/health` (gated on `settings` or `agent_ops`). It shows integration readiness (ready / sandbox / degraded / blocked_external / not_implemented), the scheduled-job table with healthy/stale/failing status, and backlog counts.
