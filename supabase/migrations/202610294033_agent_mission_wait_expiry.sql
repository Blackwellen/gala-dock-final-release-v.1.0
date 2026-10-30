-- Q42/Q43 (lane D, 2026-10-29): a mission parked by agent_mission_wait (4032) must resume even if nobody responds. Every 15 minutes
-- runs whose open wait has passed its deadline go back to the queue; the run engine then calls agent_mission_wait again, which
-- records the distinct outcome 'expired' (no response) — never collapsed into declined / cancelled / failed. No model tokens.
create or replace function public.job_agent_mission_wait_expiry(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with due as (
    update public.agent_runs r set status = 'queued', waiting_reason = 'No response before the deadline', next_wake_at = null, updated_at = now()
    where r.status = 'waiting_external'
      and exists (select 1 from public.agent_waits w where w.run_id = r.id and w.kind = 'external' and w.aggregate_id is not null and w.satisfied_at is null and w.until_at <= now())
    returning r.id, r.workspace_id)
  insert into public.audit_events(actor_type, workspace_id, agent_run_id, event, metadata)
    select 'system', due.workspace_id, due.id, 'agent.mission_resumed', jsonb_build_object('outcome', 'expired') from due;
  get diagnostics n = row_count;
  return jsonb_build_object('requeued', n);
end $$;
revoke all on function public.job_agent_mission_wait_expiry(public.job_queue) from public, anon, authenticated;
grant execute on function public.job_agent_mission_wait_expiry(public.job_queue) to service_role;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('agent.mission_wait_expiry', 'db', 'public.job_agent_mission_wait_expiry', 3, 'Q42/Q43: every 15 min; requeue Gala Agent missions whose wait for a response expired')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
select cron.unschedule('agent-mission-wait-expiry') where exists (select 1 from cron.job where jobname = 'agent-mission-wait-expiry');
select cron.schedule('agent-mission-wait-expiry', '7,22,37,52 * * * *',
  $$select public.enqueue_job(p_kind => 'agent.mission_wait_expiry', p_payload => '{}'::jsonb, p_dedupe_key => 'agent.mission_wait_expiry:' || to_char(date_trunc('minute', now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI'))$$);
