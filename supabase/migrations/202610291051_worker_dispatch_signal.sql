-- Q34 follow-up (lane A): watch the OUTCOME of pg_cron HTTP workers. dispatch_worker() hands the request to pg_net and the cron
-- run is recorded as succeeded immediately, so a dead deployment (found 2026-10-29: Vercel DEPLOYMENT_PAUSED, every worker 503
-- for 6+ hours) raised no alert. New signal reads net._http_response (pg_net keeps ~6 h); new critical rule + runbook.
-- Additive: ops_alert_signal keeps its signature and every existing signal; one runbook row and one rule row are added.
create or replace function public.ops_alert_signal(p_signal text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v numeric; d jsonb := '{}'; t numeric; f numeric;
begin
  case p_signal
  when 'job_backlog' then
    select count(*), coalesce(jsonb_object_agg(kind, n), '{}') into v, d from (select kind, count(*) n from public.job_queue where status in ('queued','failed') and run_after < now() - interval '15 minutes' group by kind) x;
    v := coalesce((select sum((value)::numeric) from jsonb_each_text(d)), 0); d := jsonb_build_object('by_kind', d);
  when 'jobs_stuck' then select count(*) into v from public.job_queue where status = 'running' and lease_until < now();
  when 'dead_letter_growth' then
    select count(*), coalesce(jsonb_object_agg(kind, n), '{}') into v, d from (select kind, count(*) n from public.job_queue where status = 'dead' and finished_at > now() - interval '1 hour' group by kind) x;
    v := coalesce((select sum((value)::numeric) from jsonb_each_text(d)), 0); d := jsonb_build_object('by_kind', d, 'dead_total', (select count(*) from public.job_queue where status = 'dead'));
  when 'outbox_lag_seconds' then v := coalesce(extract(epoch from now() - (select min(emitted_at) from public.domain_outbox where published_at is null)), 0);
  when 'webhook_inbound_failure_rate' then
    select count(*) filter (where status = 'failed'), count(*) filter (where status in ('processed','ignored','failed')) into f, t from public.webhook_events where received_at > now() - interval '1 hour';
    v := case when t < 5 then 0 else round(100 * f / t, 2) end; d := jsonb_build_object('failed', f, 'total', t, 'min_volume', 5, 'unit', 'percent');
  when 'webhook_inbound_stuck' then select count(*) into v from public.webhook_events where status in ('received','processing') and received_at < now() - interval '10 minutes';
  when 'webhook_outbound_failure_rate' then
    select count(*) filter (where status in ('failed','dead')), count(*) filter (where status in ('delivered','failed','dead')) into f, t from public.webhook_deliveries where created_at > now() - interval '1 hour';
    v := case when t < 5 then 0 else round(100 * f / t, 2) end; d := jsonb_build_object('failed', f, 'total', t, 'min_volume', 5, 'unit', 'percent');
  when 'reconciliation_variances' then
    select coalesce((select count(*) from public.reconciliation_items i where i.run_id = r.id and i.severity = 'critical'), 0), jsonb_build_object('run_id', r.id, 'finished_at', r.finished_at, 'variances', r.variances, 'status', r.status)
      into v, d from public.reconciliation_runs r where r.status in ('clean','variances') order by r.finished_at desc nulls last limit 1;
    v := coalesce(v, 0); d := coalesce(d, '{"run":"none"}');
  when 'reconciliation_stale_hours' then
    v := coalesce(round(extract(epoch from now() - (select max(finished_at) from public.reconciliation_runs where status in ('clean','variances'))) / 3600, 1), 9999);
    d := jsonb_build_object('queued_reconcile_jobs', (select count(*) from public.job_queue where kind = 'payments.reconcile' and status in ('queued','failed')));
  when 'cron_missed_runs' then
    select count(*) filter (where e ->> 'state' = 'missed'), jsonb_build_object('missed', coalesce(jsonb_agg(e ->> 'job') filter (where e ->> 'state' = 'missed'), '[]'),
           'never_run', coalesce(jsonb_agg(e ->> 'job') filter (where e ->> 'state' = 'never_run'), '[]'))
      into v, d from jsonb_array_elements(public.ops_cron_freshness()) e;
  when 'cron_failures_1h' then
    select count(*), jsonb_build_object('jobs', coalesce(jsonb_agg(distinct j.jobname), '[]')) into v, d
      from cron.job_run_details r join cron.job j on j.jobid = r.jobid where r.status = 'failed' and r.start_time > now() - interval '1 hour';
  when 'db_backup_stale_hours' then
    v := coalesce(round(extract(epoch from now() - (select max(finished_at) from public.db_backup_runs where status = 'complete')) / 3600, 1), 9999);
  when 'db_backup_failed' then
    select count(*) into v from public.db_backup_runs where run_date >= (now() at time zone 'utc')::date - 3
      and (status = 'failed' or (status in ('running','partial') and (run_date < (now() at time zone 'utc')::date or (now() at time zone 'utc')::time > time '04:00')));
  when 'storage_backup_lag' then
    select count(*) into v from storage.objects o left join public.storage_backups b on b.bucket = o.bucket_id and b.name = o.name
      where (b.name is null or b.object_updated_at < o.updated_at) and o.updated_at < now() - interval '60 minutes';
  when 'email_backlog' then select count(*) into v from public.email_outbox where status in ('queued','sending') and created_at < now() - interval '30 minutes';
  when 'health_down' then select count(*) into v from public.service_health_snapshots where status = 'down' and taken_at > now() - interval '10 minutes';
  when 'slo_burn' then
    select count(*), jsonb_build_object('slos', coalesce(jsonb_agg(jsonb_build_object('key', e ->> 'key', 'state', e ->> 'state')), '[]'))
      into v, d from jsonb_array_elements(public.ops_slo_status()) e where (e ->> 'fast_burning')::boolean;
  when 'state_violations_1h' then select count(*) into v from public.state_violations where occurred_at > now() - interval '1 hour';
  when 'synthetic_failures_1h' then
    select count(*), jsonb_build_object('checks', coalesce(jsonb_agg(distinct f2.check_key), '[]')) into v, d
      from public.ops_synthetic_failures f2 where f2.critical and f2.kind = 'probe' and f2.started_at > now() - interval '1 hour';
  when 'worker_dispatch_failures' then
    -- pg_cron reports HTTP workers as succeeded once pg_net has queued the request; the outcome is only in net._http_response.
    select count(*) filter (where r.status_code is null or r.status_code >= 400 or r.timed_out), jsonb_build_object(
        'responses_15m', count(*), 'by_status', coalesce(jsonb_object_agg(coalesce(r.status_code::text, 'error'), 1) filter (where r.status_code is null or r.status_code >= 400 or r.timed_out), '{}'),
        'platform_error', max(r.headers ->> 'x-vercel-error'), 'last_ok_at', (select max(x.created) from net._http_response x where x.status_code between 200 and 399))
      into v, d from net._http_response r where r.created > now() - interval '15 minutes';
  when 'none' then v := 0;
  else raise exception 'unknown_signal: %', p_signal using errcode = '22023';
  end case;
  return jsonb_build_object('value', coalesce(v, 0), 'detail', coalesce(d, '{}'));
end $$;
revoke all on function public.ops_alert_signal(text) from public, anon, authenticated;
grant execute on function public.ops_alert_signal(text) to service_role;

insert into public.ops_runbooks(key, title, category, anchor, severity_default, card, reviewed_at) values
  ('worker-dispatch', 'Scheduled HTTP workers failing / deployment unavailable', 'platform', 'worker-dispatch', 'sev1', '279.6', '2026-10-29')
on conflict (key) do update set title = excluded.title, anchor = excluded.anchor, severity_default = excluded.severity_default, active = true, updated_at = now();

insert into public.ops_alert_rules(key, name, signal, comparator, threshold, severity, cooldown_minutes, runbook_key, auto_incident, card, description) values
  ('workers.dispatch_failures', 'Scheduled workers failing', 'worker_dispatch_failures', '>', 3, 'critical', 120, 'worker-dispatch', true, '216.4',
   'More than 3 pg_cron → HTTP worker calls failed in 15 minutes (deployment paused/down, CRON_SECRET mismatch or a crashing worker). Payments, email, webhooks and backups stop.')
on conflict (key) do update set name = excluded.name, signal = excluded.signal, threshold = excluded.threshold, severity = excluded.severity, cooldown_minutes = excluded.cooldown_minutes,
  runbook_key = excluded.runbook_key, auto_incident = excluded.auto_incident, description = excluded.description, active = true, updated_at = now();
