-- Exercise for 202611146001 (rolled back): identical to the previous per-job logic, and fast enough for PostgREST's 8 s limit.
do $$
declare diff int; t0 timestamptz; ms numeric;
begin
  select count(*) into diff from public.cron_job_status() n full join (
    select j.jobname::text job, j.schedule::text schedule, j.active,
      (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) last_run,
      (select d.status::text from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc nulls last, d.runid desc limit 1) last_status,
      (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours') failures_24h
    from cron.job j) o using (job)
  where n.last_run is distinct from o.last_run or n.last_status is distinct from o.last_status or n.failures_24h is distinct from o.failures_24h
     or n.schedule is distinct from o.schedule or n.active is distinct from o.active or n.job is null or o.job is null;
  if diff <> 0 then raise exception 'cron_job_status differs from the reference on % jobs', diff; end if;
  t0 := clock_timestamp(); perform public.ops_health_summary(); ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if ms > 2000 then raise exception 'ops_health_summary still slow: % ms', round(ms); end if;
  raise exception 'EXERCISE_OK cron_job_status identical, ops_health_summary % ms', round(ms);
end $$;
