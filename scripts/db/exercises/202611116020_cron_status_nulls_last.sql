-- Exercise for 202611116020 (rolled back): a job whose only NULL-start run is a restart artefact reports its newest real run.
do $$
declare s text; f text;
begin
  select last_status into s from public.cron_job_status() where job = 'email-outbox';
  if s is distinct from 'succeeded' then raise exception 'email-outbox last_status is %, expected succeeded', s; end if;
  select x->>'state' into f from jsonb_array_elements(public.ops_cron_freshness()) x where x->>'job' = 'email-outbox';
  if f is distinct from 'fresh' then raise exception 'email-outbox freshness is %, expected fresh', f; end if;
  if exists (select 1 from public.cron_job_status() c where c.last_status = 'connecting') then raise exception 'a restart artefact is still reported as latest'; end if;
  raise exception 'EXERCISE_OK cron_job_status ignores NULL-start restart rows';
end $$;
