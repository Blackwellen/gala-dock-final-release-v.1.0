-- Q07 · Daily direct-charge reconciliation on the canonical job queue (card 128.7, Q03 foundation).
-- Requires 202610291008 + 202610291009. Additive: one job kind and one pg_cron schedule that only enqueues a job.
-- The handler is an app-runtime job ('payments.reconcile' in src/lib/foundation/handlers.ts); until that code is deployed the
-- queued job simply waits (the app worker returns 404 in production), so this is safe with the currently deployed code.
insert into public.job_kinds(kind, runtime, handler, max_attempts, backoff_seconds, lease_seconds, description) values
  ('payments.reconcile', 'app', null, 5, '{60,300,1800,7200,21600}', 600,
   'Reconcile direct charges, application fees and refunds with the connected-account Stripe objects; records immutable variances.')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts,
  backoff_seconds = excluded.backoff_seconds, lease_seconds = excluded.lease_seconds, description = excluded.description, updated_at = now();

-- One job per day (dedupe key = date), so a re-run of the schedule never queues twice.
select cron.schedule('payments-reconcile', '20 4 * * *',
  $$select public.enqueue_job(p_kind => 'payments.reconcile', p_payload => '{"days": 3}'::jsonb, p_dedupe_key => 'payments.reconcile:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);
