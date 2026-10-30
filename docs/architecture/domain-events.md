# Domain events, outbox, event bus and jobs (Q03)

Source: `supabase/migrations/202610291007_workflow_foundation.sql` · `src/lib/foundation/*` · catalogue `src/lib/foundation/event-catalogue.ts`

## Envelope (`public.domain_outbox`)

| field | meaning |
|---|---|
| id (uuid) | stable event id; consumers dedupe on it |
| seq | publish order |
| event_type, schema_version | catalogued in `public.domain_event_types` (bump schemaVersion on incompatible payload change) |
| emitted_at | DB time of the committing transaction |
| actor_id, actor_type | user / agent / system / webhook / admin |
| workspace_id | tenant; rows cascade with the workspace |
| aggregate_type, aggregate_id | the record the event is about |
| correlation_id | request-level id (UI → service → DB → outbox → job → integration → audit); minted if absent |
| causation_id | what produced it, e.g. `audit:<audit_events.id>` |
| payload | typed JSON; secrets/IP/user agent/email/token/note stripped when captured from audit |

## Writing events (same transaction as the change)

1. Preferred: inside the SQL command that changes state, `perform public.emit_domain_event(type, workspace, payload, actor, actor_type, aggregate_type, aggregate_id, correlation, causation)`.
2. Audit capture: inserting a catalogued workspace audit event (or one an enabled Gala Agent routine listens for) writes the outbox row in the same transaction (trigger `gd_audit_outbox`). If the outbox write fails, the change rolls back.
3. `transition_state()` emits `<machine>.state_changed` atomically with the status change.
4. `emitDomainEvent()` (TS) only for events with no accompanying row change.

Pass the request's correlation id: `correlationId(request.headers)` → `writeAudit(..., { correlationId })`.

## Catalogue

57 types in `event-catalogue.ts` (all of backend §18 plus current audit names). `publicType` is the developer-webhook name (`public.webhook_event_type`). Regenerate the seed with `node scripts/gen-event-catalogue-sql.mjs`; tests fail on drift.

## Event bus

`public.event_subscriptions`: consumer → event_types (`*` = all) → job_kind, optional skip_actor_types and predicate function. `publish_domain_outbox()` turns each unpublished event into one job per matching consumer with dedupe key `consumer:event_id` (re-publishing never duplicates).

| consumer | events | job kind | notes |
|---|---|---|---|
| agent.routine_wake | `*` (with listener predicate) | agent.routine_wake (db) | never on agent actions; 5-minute debounce; event id carried into `agent_routines.last_event` |

## Jobs (`public.job_kinds`, `public.job_queue`)

- Kinds declare runtime (`db` = SQL handler `public.fn(public.job_queue) returns jsonb`; `app` = TS handler in `src/lib/foundation/handlers.ts`), max_attempts, backoff_seconds[], lease_seconds.
- Status: queued → running → succeeded | failed (retry at run_after = now + backoff[attempt]) → … → dead. cancelled is terminal.
- `enqueue_job(kind, payload, dedupe_key, run_after, …)`: idempotent by dedupe key; `run_after` gives one-off delayed jobs. Recurring work stays on pg_cron.
- `claim_jobs(worker, runtime, limit, kinds, lease)`: SKIP LOCKED; reclaims expired leases (crash/resume); a reclaimed job on its final attempt goes to dead.
- `complete_job` returns false if the lease was lost (the late result is discarded). `fail_job(…, retry=false)` dead-letters immediately (TS: throw `PermanentJobError`).
- Dead letters: view `public.dead_letter_jobs`; replay with `retry_dead_job(id, reason)` (fresh attempt budget, audited as `job.replayed`).

## Workers

| worker | schedule | runs |
|---|---|---|
| pg_cron foundation-db-jobs | every minute | `run_db_jobs(100)`: publish outbox, then db jobs; inbox row, side effect and completion commit together (exactly-once) |
| pg_cron foundation-app-jobs → `/api/cron/jobs` | every minute | publish + db jobs, then app jobs via `APP_JOB_HANDLERS` (at-least-once; inbox removes replays; handlers must be idempotent). Returns 404 in production until this code is deployed — app jobs wait in the queue meanwhile |
| pg_cron foundation-purge | 03:40 daily | succeeded/cancelled jobs > 14 days, published outbox > 30 days (unless a live job references it), inbox > 35 days, expired idempotency keys |

## Consumer inbox

`public.consumer_inbox(consumer, event_id)`: written in the same transaction as a db handler's side effect, or at completion for app handlers. A replayed job for an event already in the inbox completes as `{ duplicate: true }` without running the handler.

## Idempotency registry (`public.idempotency_keys`)

`withIdempotency(db, { scope, key, request }, fn)`: request hash = sha256 of stable JSON. States: started (run fn) → completed (stored response replayed for 24 h) · mismatch (same key, different request → 409 `idempotency_conflict`) · in_progress (concurrent duplicate → 409 `idempotency_in_progress`; a stale lock older than 60 s can be re-taken) · fn throws → key released. Wired: developer API / MCP gateway (scope `api:<key id>`). Stripe webhooks keep `webhook_events` claim/finish dedupe.

## Locks and time

- `advisory_xact_lock(scope, key)` / `try_advisory_xact_lock`: inside SQL commands only (released at commit; safe with pooled connections). Cross-request mutual exclusion uses job leases or row locks, not session advisory locks.
- Leases, run_after and next-run times are DB timestamps. Workers and tests compare against `db_now()` (TS `dbNow`), never the app server clock.

## Per-domain queues not yet migrated (later packets)

email_outbox (synchronous notification trigger), webhook_deliveries (synchronous audit trigger), launch_queue, agent runtime leases/waits, storage/scan queues. New asynchronous work should use `job_queue`.
