-- Worker freshness for the health endpoint / admin health dashboard (release spec §136–137). Service role only.
create or replace function public.cron_job_status() returns table (job text, schedule text, active boolean, last_run timestamptz, last_status text, failures_24h bigint)
language sql stable security definer set search_path = '' as $$
  select j.jobname::text, j.schedule::text, j.active,
    (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
    (select d.status::text from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
    (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours')
  from cron.job j order by j.jobname;
$$;
revoke all on function public.cron_job_status() from public, anon, authenticated;
grant execute on function public.cron_job_status() to service_role;
