-- Ops fix (2026-11-14, ops wiring lane): cron_job_status() ran three correlated subqueries per job over cron.job_run_details (about 300k rows,
-- no jobid index), so ops_cron_freshness() / ops_health_summary() took about 5.4 s. The Blackwellen event feed calls it from /api/health/events at
-- the 5-minute mark, when the other workers run too; PostgREST's 8 s statement timeout then cancelled it and the heartbeat reported
-- overall "unknown" (ops_data unknown). Same signature, grants and results (incl. the NULL-start rule of 202611116020), one grouped pass: ~60 ms.
create or replace function public.cron_job_status() returns table (job text, schedule text, active boolean, last_run timestamptz, last_status text, failures_24h bigint)
language sql stable security definer set search_path = '' as $$
  select j.jobname::text, j.schedule::text, j.active, d.last_run, d.last_status, coalesce(d.failures_24h, 0)
  from cron.job j
  left join (
    select r.jobid, max(r.start_time) as last_run,
           (array_agg(r.status::text order by r.start_time desc nulls last, r.runid desc))[1] as last_status,
           count(*) filter (where r.status = 'failed' and r.start_time > now() - interval '24 hours') as failures_24h
    from cron.job_run_details r group by r.jobid
  ) d on d.jobid = j.jobid
  order by j.jobname;
$$;
revoke all on function public.cron_job_status() from public, anon, authenticated;
grant execute on function public.cron_job_status() to service_role;
