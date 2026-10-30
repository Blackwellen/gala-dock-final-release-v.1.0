# Observability, alerts and SLOs (Q34)

Code: `src/lib/observability/*` · migrations `202610291049`–`1051` · tests `tests/release/observability.spec.ts` (10).

## Logs
- One JSON line per event (`log.info/warn/error(event, fields)`): ts, level, event, service, env, release, correlation_id, operation, kind, job_id, workspace_id.
- Redaction (`redact.ts`) drops secret/credential keys (password, token, api_key, authorization, cookie, session, signature, dsn, card…) and personal or guest-care keys (email, phone, address, ip, user_agent, names, dietary, allergies, medical, access_needs, notes…); scrubs free text (emails, Bearer/JWT, Stripe/Gala/Resend/GitHub/AWS keys, 32+ hex, signed-URL params, card-like numbers, phones, IPs).
- Budget: 8 KB a line, depth 5, 40 keys; debug only with `LOG_LEVEL=debug`; sampled info with `LOG_SAMPLE_INFO`. Logging never throws or awaits. `job_queue.last_error` is redacted.

## Correlation
The proxy accepts a well-formed `x-correlation-id` (or `x-request-id` / `x-vercel-id`) or mints `cor_<32hex>`, forwards and echoes it. Flow: `withObservability` (routes, workers, webhooks) → `instrumentAction` (server actions) → `writeAudit` (auto-filled) → `audit_events` → `domain_outbox` → `job_queue.correlation_id` → app-job context → logs and error reports. A 500 from a wrapped route returns `{error:"internal_error", correlation_id}`. Edge-safe: `instrumentation.ts` loads Node adapters only when `NEXT_RUNTIME === "nodejs"`; `context.ts` has no `node:` imports.

## Error reporting
Adapter `errors.ts` (Sentry store API, no SDK) for self-hosted GlitchTip (Oracle VM) or Sentry. Env `SENTRY_DSN` (required to send); `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_SAMPLE_RATE`. No DSN → BLOCKED_EXTERNAL (still logged). Headers, cookies, query strings and bodies are never sent. Health under `/api/health` → `error_reporting`.

## Health — `GET /api/health`
- Anonymous / wrong bearer: `{status, db, maintenance, latency_ms, at}` only.
- Ops (`Authorization: Bearer CRON_SECRET`, or a signed-in platform admin with settings / agent_ops / audit): integrations (env names only), contracts, cron freshness (`ops_cron_freshness`), queue / outbox / dead letters, backups and restore drills, SLOs, open alerts and incidents, latest probes, error-reporting state; `?probe=storage` adds bucket reachability. Snapshots ≤1/min kept 30 days. Admin read model `admin_ops_observability()`, `admin_ops_incident_detail(id)`.

## Metrics
`ops_metric_rollups`: 5-minute buckets recomputed for the last 2 h every 5 min (job `ops.observe`, pg_cron `ops-observe`), kept 35 days. Ratios: checkout.orders, payments.orders, booking.integrity, scan.sync_latency, signin.probe, webhooks.inbound, webhooks.outbound, jobs.latency, jobs.outcomes, email.delivery, api.requests, agent.runs, availability.health. Gauges: queue.depth/overdue/dead/stuck, outbox.lag_seconds, email.queued, webhooks.inbound_backlog.

## SLOs (`ops_slo_definitions`, 28-day windows)
| SLO | Objective |
|---|---|
| checkout.completion | 99.5 % (pending > 26 h = stuck) |
| marketplace.payments | 95 % |
| booking.integrity | 99.9 % |
| ticket.scan_sync | 99 % (offline sync ≤ 5 min) |
| signin.success | 99 % (probe) |
| webhooks.inbound | 99.9 % |
| webhooks.outbound | 99 % |
| jobs.latency | 95 % ≤ 2 min |
| jobs.success | 99 % |
| messaging.email | 99 % |
| api.availability | 99.5 % |
| agent.success | 95 % |
| platform.availability | 99.9 % |

Maths (`slo.ts` = `ops_slo_calc`): compliance = good/total; budget = 1 − objective; burn = (bad/total)/budget; fast burn 1 h & 5 min ≥ 14.4; slow burn 6 h & 30 min ≥ 6; min 10 events; breached when remaining budget ≤ 0.

## Alert rules (`ops_alert_rules`, every 5 min)
jobs backlog / stuck / dead-letter growth; outbox lag > 900 s; inbound webhook failure rate > 5 % (critical, auto-incident), inbound stuck, outbound failure > 20 %; reconciliation variances (critical, auto-incident) and stale > 30 h; cron missed / failures > 5/h; **workers.dispatch_failures** > 3 per 15 min (critical, auto-incident — pg_net responses; pg_cron records success even when the worker 503s); backups db stale > 26 h / failed (critical), storage replication lag; email backlog; health.down (critical); slo.burn fast (critical); state.violations; synthetic.failures (critical); existing daily `ai.profitability_alert`.
Delivery: in-app only (`admin.ops_alert`, no email), to `notify_users` or platform admins with `notify_permissions`. One open alert per rule; cooldown re-notify; auto-resolve; fire / resolve / ack audited (`ops.alert_*`). `ops_evaluate_alerts(p_only, p_synthetic, p_dry_run)` for drills.

## Synthetic probes (`/api/cron/probes`, CRON_SECRET)
health, login, checkout, ticket, booking, agent, webhook, queue, backup — read-only or self-cleaning, no charge/email/booking/ticket, no model call. Owner steps after deploy: `select cron.schedule('synthetic-probes','*/15 * * * *',$$select public.dispatch_worker('/api/cron/probes')$$);` and `SYNTHETIC_PROBE_EMAIL` / `SYNTHETIC_PROBE_PASSWORD`.

## Chaos drills (`runDrills`)
queue (fail → backoff → dead → alert → replay → resolve), payment (forged webhook refused, replay deduped, failure alert), storage (unconfigured → BLOCKED_EXTERNAL), auth (wrong password, forged JWT, wrong bearer), database (statement_timeout fails fast), AI (no Azure config → unavailable, no call). All pass.

## Capacity and load
Postgres 17, `max_connections` 60 (29 in use at audit). `statement_timeout` 120 s. Supavisor pooler for serverless; never hold session advisory locks. 2026-10-29 04:39: a "job startup timeout" burst hit six every-minute cron jobs (connection pressure) — watch `cron.failures`. Rate limits: API keys 120/min; checkout 12 / 5 min per user; waiting room; `hit_rate_limit`. Hot paths: checkout session, scan/sync, public discover/search, Stripe webhook, agent worker. Load evidence Q20; Q45 performance sign-off.
