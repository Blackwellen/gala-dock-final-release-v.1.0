-- Q14 Event Core 4/5 — ended events leave sale (W01/Q38 finding; domain 35.7).
-- complete_ended_events(): every published / on_sale / live event whose end (ends_at, or starts_at + 12 h when no end is
-- recorded) is more than p_grace in the past moves to `completed` through transition_state (row lock + expected state +
-- event.state_changed outbox) and emits event.completed. Open ticket tiers are paused so nothing more can be bought.
-- Paid orders, tickets, payments and ledger rows are not touched. The search index (gd_search_index trigger) and the
-- sitemap (status filter) drop the event automatically because both only list published/on_sale/live.
-- Runs daily (cron `events-complete-ended` → job_queue kind events.complete_ended, db runtime) and on demand
-- (enqueue_job('events.complete_ended', '{}') or a direct service call).

create or replace function public.complete_ended_events(p_grace interval default interval '6 hours', p_limit integer default 500) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r record; n integer := 0; tiers integer := 0; k integer; ids jsonb := '[]';
begin
  for r in select e.id, e.status, e.workspace_id from public.events e
            where e.status in ('published', 'on_sale', 'live')
              and coalesce(e.ends_at, e.starts_at + interval '12 hours') < now() - coalesce(p_grace, interval '0')
            order by coalesce(e.ends_at, e.starts_at) limit greatest(1, least(coalesce(p_limit, 500), 5000))
            for update skip locked loop
    perform set_config('gd.event_cmd', r.id::text, true);
    perform public.transition_state('event', r.id, 'completed', r.status, null, 'system', 'ended', null);
    perform set_config('gd.event_cmd', '', true);
    update public.events set updated_at = now() where id = r.id;
    update public.ticket_tiers set status = 'paused' where event_id = r.id and status in ('on_sale', 'scheduled');
    get diagnostics k = row_count; tiers := tiers + k;
    perform public.emit_domain_event('event.completed', r.workspace_id, jsonb_build_object('id', r.id, 'from', r.status, 'reason', 'ended'),
      null, 'system', 'event', r.id::text, null, null);
    insert into public.audit_events(actor_id, workspace_id, event, metadata, actor_type)
      values (null, r.workspace_id, 'event.status_changed', jsonb_build_object('event_id', r.id, 'from', r.status, 'to', 'completed', 'reason', 'ended'), 'system');
    n := n + 1; ids := ids || to_jsonb(r.id);
  end loop;
  return jsonb_build_object('completed', n, 'tiers_paused', tiers, 'ids', ids);
end $$;

create or replace function public.job_events_complete_ended(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public.complete_ended_events(coalesce((p_job.payload ->> 'grace_hours')::numeric, 6) * interval '1 hour', coalesce((p_job.payload ->> 'limit')::integer, 500));
end $$;

insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('events.complete_ended', 'db', 'public.job_events_complete_ended', 3, 'Q14: daily; ended published/on_sale/live events → completed, open tiers paused')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();

select cron.unschedule('events-complete-ended') where exists (select 1 from cron.job where jobname = 'events-complete-ended');
select cron.schedule('events-complete-ended', '5 1 * * *',
  $$select public.enqueue_job(p_kind => 'events.complete_ended', p_payload => '{}'::jsonb, p_dedupe_key => 'events.complete_ended:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))$$);

revoke all on function public.complete_ended_events(interval, integer) from public, anon, authenticated;
revoke all on function public.job_events_complete_ended(public.job_queue) from public, anon, authenticated;
grant execute on function public.complete_ended_events(interval, integer), public.job_events_complete_ended(public.job_queue) to service_role;
