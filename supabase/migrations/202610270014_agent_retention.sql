-- Gala Agent retention (Data Retention Schedule: "Gala Agent requests and actions: 12 months, or longer when linked to a booking or
-- approval record kept under another row"). Monthly job `agent-retention`.
--  * Finished runs older than 12 months are deleted (steps, waits and artifacts cascade; usage rows keep their cost with run_id nulled)
--    UNLESS they carry an approval or executed an external/commercial action (risk R3+), which link them to bookings, quotes or
--    payments kept for 6 years. Those are kept until 6 years, then deleted.
--  * Closed watches older than 12 months are deleted. AI usage events (billing evidence) are kept 6 years.
create or replace function public.agent_retention_purge() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_runs integer; n_old integer; n_watch integer; n_usage integer;
begin
  delete from public.agent_runs r
  where r.created_at < now() - interval '12 months'
    and r.status in ('completed','failed','cancelled','partially_completed')
    and not exists (select 1 from public.agent_approvals a where a.run_id = r.id)
    and not exists (select 1 from public.agent_run_steps s join public.agent_tools t on t.id = s.tool_id where s.run_id = r.id and t.risk >= 3 and s.status = 'succeeded');
  get diagnostics n_runs = row_count;
  delete from public.agent_runs r where r.created_at < now() - interval '6 years' and r.status in ('completed','failed','cancelled','partially_completed');
  get diagnostics n_old = row_count;
  delete from public.agent_watches w where w.status <> 'active' and w.created_at < now() - interval '12 months';
  get diagnostics n_watch = row_count;
  delete from public.ai_usage_events u where u.created_at < now() - interval '6 years';
  get diagnostics n_usage = row_count;
  insert into public.audit_events(actor_type, event, metadata)
    values ('system', 'retention.agent_purged', jsonb_build_object('runs_12m', n_runs, 'runs_6y', n_old, 'watches', n_watch, 'usage_6y', n_usage));
  return jsonb_build_object('runs_12m', n_runs, 'runs_6y', n_old, 'watches', n_watch, 'usage_6y', n_usage);
end $$;
revoke all on function public.agent_retention_purge() from public, anon, authenticated;
grant execute on function public.agent_retention_purge() to service_role;

select cron.unschedule('agent-retention') where exists (select 1 from cron.job where jobname = 'agent-retention');
select cron.schedule('agent-retention', '15 4 2 * *', $$select public.agent_retention_purge()$$);
