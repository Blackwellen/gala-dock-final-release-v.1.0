-- Blackwellen ops event feed (ops wiring lane, 2026-11-13): every 5 minutes pg_cron calls /api/health/events, which sends one signed
-- service.heartbeat to the Blackwellen event bus (Watchtower hb:OPS-A:events-gala-dock). The route is CRON_SECRET-only and dormant without
-- BLACKWELLEN_EVENTS_URL / key. Idempotent. Rollback: select cron.unschedule('ops-events');
select cron.unschedule('ops-events') where exists (select 1 from cron.job where jobname = 'ops-events');
select cron.schedule('ops-events', '*/5 * * * *', $$select public.dispatch_worker('/api/health/events')$$);
