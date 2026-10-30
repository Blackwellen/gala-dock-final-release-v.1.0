# Runbooks (registry: `ops_runbooks`; alerts and incidents link here by anchor)

General: declare (`admin_ops_incident_open`, sev1–4, runbook key) → contain → investigate (audit_events, ops_alerts, job_queue, webhook_events, net._http_response, Vercel / Supabase / Stripe logs, correlation id) → recover → resolve → postmortem link within 5 working days. Maintenance via Admin → Maintenance only for real incidents; status page Uptime Kuma `status.ops.galadock.com/status/galadock`. Never switch real maintenance on for drills.

## worker-dispatch
Workers return 503 / 401. `select status_code, headers->>'x-vercel-error', count(*) from net._http_response where created > now() - interval '15 minutes' group by 1, 2;` — DEPLOYMENT_PAUSED → resume in Vercel; 401 → `CRON_SECRET` mismatch (Vercel vs Vault `cron_secret`); 5xx → worker logs by correlation id. When healthy, queued jobs, emails and backups catch up.

## payments-outage
Check status.stripe.com and `/api/health` stripe readiness. Checkout fails closed; don't retry charges by hand. M2 on payments if errors persist. After recovery Stripe retries webhooks; check `payments.reconcile` and `/payments/[ref]` verify. Never mark orders paid manually.

## stripe-webhook-backlog
`webhook_events` failed or processing > 10 min. Signature failures = rotated secrets → update `STRIPE_WEBHOOK_SECRET*` in Vercel. Resend from Stripe dashboard; handlers are idempotent (`claim_webhook_event`).

## payment-reconciliation-drift
Latest `reconciliation_runs` / `reconciliation_items` (critical first). Fix the mirror via webhook or re-sync. Never edit ledger rows; post reversals.

## scanner-offline
Scanners work offline from the signed manifest. Keep scanning; duplicates resolve on sync. Stale manifest → refresh on a device with signal. Never disable credential checks. After recovery confirm sync and review conflicts.

## ticketing-incident
Oversell, credential or refund problem: M3 on tickets for the event; `reissue_ticket_credentials` if credentials leaked; ledger checks; inform the organiser.

## marketplace-degraded
Booking state violations, quote expiry, holds; pause automated sweeps only if misbehaving; developer webhooks: `webhook_deliveries` dead letters → replay.

## ai-outage
Azure OpenAI: runs go to `waiting_external`; check `AGENT_MODEL_*` deployments; runaway cost → kill switch and credit caps.

## auth-outage
Supabase status and the login probe; Google sign-in `GOOGLE_CLIENT_*`; Turnstile (T1/T2). Never bypass auth. M4 with a status link if sign-in is down for everyone.

## security-incident
M5 lockdown; rotate the affected secret (CRON_SECRET, TICKET_QR_SECRET, Stripe keys, webhook secrets, service role); revoke sessions and API keys; ICO within 72 h if personal data is at risk; keep a decision log.

## db-saturation
`pg_stat_activity` by user/state vs max_connections 60; `cron.job_run_details` "job startup timeout"; `pg_cancel_backend` runaway queries; reduce worker concurrency; compute upgrade (owner).

## job-backlog
`admin_ops_overview()` / `admin_job_list('dead')`; app jobs need `/api/cron/jobs` deployed; fix handler, then `admin_job_retry` (reason required; replays never duplicate side effects).

## cron-missed
`ops_cron_freshness()`; inactive/missing job → re-create from its migration; failing → `cron.job_run_details.return_message`.

## r2-outage
Backups and replication pause (nothing user-facing); check credentials/bucket via health `r2`; after recovery the 15-minute worker catches up (`backups.storage_lag`).

## clamav-down
Documents and sensitive files stay quarantined (fail closed); images still work. Gateway owned by blackwellen-operations (`ops/runbooks/av-scan-gateway.md`). After recovery `scripts/files/rescan-quarantined.mjs`.

## email-outage
`email_outbox` queued/failed; Resend status, `RESEND_API*` env; suppression list; workers resend — don't bulk-insert.

## backup-failure
`db_backup_runs.error`; re-invoke `dispatch_db_backup()` (resumable); R2 keys and Edge Function secrets (`DB_BACKUP_SECRET`, `R2_*`); run the restore drill afterwards.

## restore
See `backup-restore.md`. Scratch drills only; dual control for real recovery.

## data-corruption
M3 on affected modules; find the window from `audit_events` / `state_violations`; restore to a new project and copy rows back; forward-fix migration (never roll back an applied one).

## maintenance-status
Admin → Maintenance (M1–M5, modules, status URL, `qa` audience). Real windows only for real incidents.

## On-call checklist
- Daily: open alerts/incidents (`/admin/health`); `/api/health` with bearer (integrations, cron freshness, backups); restore drill status.
- Weekly: SLO budgets, dead letters, email backlog, reconciliation.
- Monthly: restore drill; review runbooks (`reviewed_at`); rotate `notify_users`.
- After a change: tenant-security + observability specs; probes green.
