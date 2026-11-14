-- Exercise for 202611136001 (rolled back): the job exists once, active, every 5 minutes, calling the events route.
do $$
declare n int; c text; s text;
begin
  select count(*), max(command), max(schedule) into n, c, s from cron.job where jobname = 'ops-events' and active;
  if n <> 1 or s <> '*/5 * * * *' or c not like '%dispatch_worker(''/api/health/events'')%' then raise exception 'ops-events job wrong: n=% s=% c=%', n, s, c; end if;
  raise exception 'EXERCISE_OK ops-events scheduled every 5 minutes';
end $$;
