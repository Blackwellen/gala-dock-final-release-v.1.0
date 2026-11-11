-- Ops fix (2026-11-11, ops wiring lane): cron_job_status() took a job's "last status" from `order by start_time desc`, and Postgres
-- sorts NULL first in a descending order. pg_cron leaves a row with no start_time when the database restarts mid-run ("server
-- restarted" / "connecting"), so that row stayed the "latest" forever: email-outbox showed `failing` in ops_cron_freshness, the
-- /api/health ops view and the Blackwellen Watchtower readiness probe although every run since succeeded. Same signature and output;
-- the latest run is now the newest start_time, ties and NULLs broken by runid.
create or replace function public.cron_job_status() returns table (job text, schedule text, active boolean, last_run timestamptz, last_status text, failures_24h bigint)
language sql stable security definer set search_path = '' as $$
  select j.jobname::text, j.schedule::text, j.active,
    (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
    (select d.status::text from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc nulls last, d.runid desc limit 1),
    (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours')
  from cron.job j order by j.jobname;
$$;
revoke all on function public.cron_job_status() from public, anon, authenticated;
grant execute on function public.cron_job_status() to service_role;
