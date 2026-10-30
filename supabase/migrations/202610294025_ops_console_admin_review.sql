-- Q31 remainder (lane D): job / dead-letter / outbox console, service health history, admin review read access, and permission
-- tiers for the remaining admin-path mutations. Domains 195 (Platform Admin), 200 (Platform Health), 199/287 support access.
-- Additive and backward-compatible: new read RPCs + admin commands, a new snapshot table, extra SELECT policies for Trust & Safety,
-- and in-place hardening of five existing functions (same signatures) by a checked text patch of the live definition.
-- Job console permissions: reads need settings, agent_ops or audit; retry / cancel / replay need settings + MFA + reason (audited).
-- Replays never duplicate side effects: consumers are exactly-once through consumer_inbox, and a consumer that already processed
-- an event is never re-run.

-- ── 1. Queue / outbox reads ──
create or replace function public.ops_can_read() returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_admin_permission('settings') or public.has_admin_permission('agent_ops') or public.has_admin_permission('audit');
$$;

create or replace function public.admin_ops_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.ops_can_read() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_object_agg(status, n) from (select status, count(*)::int n from public.job_queue group by status) s), '{}'),
    'stuck_running', (select count(*)::int from public.job_queue where status = 'running' and lease_until < now()),
    'overdue_queued', (select count(*)::int from public.job_queue where status in ('queued','failed') and run_after < now() - interval '15 minutes'),
    'dead', (select count(*)::int from public.job_queue where status = 'dead'),
    'by_kind', coalesce((select jsonb_agg(k order by k->>'kind') from (
        select jsonb_build_object('kind', kind, 'queued', count(*) filter (where status = 'queued'), 'failed', count(*) filter (where status = 'failed'),
          'dead', count(*) filter (where status = 'dead'), 'running', count(*) filter (where status = 'running'),
          'succeeded_24h', count(*) filter (where status = 'succeeded' and finished_at > now() - interval '24 hours'),
          'last_finished', max(finished_at)) k
        from public.job_queue group by kind) x), '[]'),
    'outbox_unpublished', (select count(*)::int from public.domain_outbox where published_at is null),
    'outbox_oldest_unpublished', (select min(emitted_at) from public.domain_outbox where published_at is null),
    'outbox_errors', (select count(*)::int from public.domain_outbox where published_at is null and last_error is not null),
    'outbox_24h', (select count(*)::int from public.domain_outbox where emitted_at > now() - interval '24 hours'),
    'processed_24h', (select count(*)::int from public.consumer_inbox where processed_at > now() - interval '24 hours'),
    'at', now()) into r;
  return r;
end $$;

-- Payloads can hold personal data: the console shows payload KEYS only, and errors truncated.
create or replace function public.admin_job_list(p_status text default null, p_kind text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, kind text, status text, attempts integer, max_attempts integer, priority integer, run_after timestamptz, created_at timestamptz,
  started_at timestamptz, finished_at timestamptz, lease_until timestamptz, last_error text, consumer text, event_id uuid, workspace_id uuid, correlation_id text, payload_keys text[], total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.ops_can_read() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
    select j.id, j.kind, j.status, j.attempts, j.max_attempts, j.priority, j.run_after, j.created_at, j.started_at, j.finished_at, j.lease_until,
      left(j.last_error, 300), j.consumer, j.event_id, j.workspace_id, j.correlation_id,
      array(select jsonb_object_keys(j.payload) order by 1), count(*) over ()
    from public.job_queue j
    where (p_status is null or p_status = '' or j.status = p_status or (p_status = 'stuck' and j.status = 'running' and j.lease_until < now()))
      and (p_kind is null or p_kind = '' or j.kind = p_kind)
    order by case j.status when 'dead' then 0 when 'failed' then 1 when 'running' then 2 when 'queued' then 3 else 4 end, coalesce(j.finished_at, j.created_at) desc
    limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
end $$;

create or replace function public.admin_outbox_list(p_unpublished boolean default false, p_type text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, seq bigint, event_type text, workspace_id uuid, aggregate_type text, aggregate_id text, actor_type text, emitted_at timestamptz,
  published_at timestamptz, publish_attempts integer, last_error text, consumers jsonb, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.ops_can_read() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
    select o.id, o.seq, o.event_type, o.workspace_id, o.aggregate_type, o.aggregate_id, o.actor_type, o.emitted_at, o.published_at, o.publish_attempts, left(o.last_error, 300),
      coalesce((select jsonb_agg(jsonb_build_object('job_id', j.id, 'consumer', j.consumer, 'status', j.status, 'attempts', j.attempts,
        'processed', exists (select 1 from public.consumer_inbox ci where ci.consumer = j.consumer and ci.event_id = o.id)) order by j.consumer)
        from public.job_queue j where j.event_id = o.id), '[]'),
      count(*) over ()
    from public.domain_outbox o
    where (not coalesce(p_unpublished, false) or o.published_at is null) and (p_type is null or p_type = '' or o.event_type = p_type)
    order by o.seq desc
    limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- ── 2. Job / outbox commands (settings + MFA + reason; audited) ──
create or replace function public.admin_job_retry(p_job uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.job_queue;
begin
  perform public.admin_require('settings', p_reason);
  select * into j from public.job_queue where id = p_job for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if j.status = 'failed' then
    update public.job_queue set run_after = now(), updated_at = now() where id = p_job;   -- waiting to retry → retry now (attempt budget unchanged)
  elsif j.status in ('dead','cancelled') then
    if j.consumer is not null and j.event_id is not null and exists (select 1 from public.consumer_inbox ci where ci.consumer = j.consumer and ci.event_id = j.event_id) then
      raise exception 'already_processed' using errcode = '22023';
    end if;
    perform public.retry_dead_job(p_job, p_reason);
  else
    raise exception 'not_retryable' using errcode = '22023';
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', j.workspace_id, 'ops.job_retried', jsonb_build_object('job_id', p_job, 'kind', j.kind, 'from', j.status, 'reason', left(p_reason, 300)));
  return jsonb_build_object('job_id', p_job, 'from', j.status, 'to', 'queued');
end $$;

create or replace function public.admin_job_cancel(p_job uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.job_queue;
begin
  perform public.admin_require('settings', p_reason);
  select * into j from public.job_queue where id = p_job for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- A running job is cancellable only once its worker lease has lapsed (never pull work from under a live worker).
  if not (j.status in ('queued','failed') or (j.status = 'running' and j.lease_until < now())) then raise exception 'not_cancellable' using errcode = '22023'; end if;
  update public.job_queue set status = 'cancelled', finished_at = now(), locked_by = null, lease_until = null, updated_at = now(),
    last_error = left(coalesce(last_error, '') || ' | cancelled: ' || p_reason, 2000) where id = p_job;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', j.workspace_id, 'ops.job_cancelled', jsonb_build_object('job_id', p_job, 'kind', j.kind, 'from', j.status, 'reason', left(p_reason, 300)));
  return jsonb_build_object('job_id', p_job, 'from', j.status, 'to', 'cancelled');
end $$;

create or replace function public.admin_outbox_replay(p_event uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.domain_outbox; j record; n integer := 0;
begin
  perform public.admin_require('settings', p_reason);
  select * into o from public.domain_outbox where id = p_event for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.published_at is null then
    -- Not yet fanned out: clear the error so the next publisher tick retries it (publishing is idempotent per consumer:event).
    update public.domain_outbox set last_error = null, publish_attempts = 0 where id = p_event;
    n := 1;
  else
    for j in select q.id from public.job_queue q where q.event_id = p_event and q.status in ('dead','cancelled')
               and not exists (select 1 from public.consumer_inbox ci where ci.consumer = q.consumer and ci.event_id = p_event) loop
      perform public.retry_dead_job(j.id, p_reason);
      n := n + 1;
    end loop;
    if n = 0 then raise exception 'nothing_to_replay' using errcode = '22023'; end if;
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'admin', o.workspace_id, 'ops.outbox_replayed', jsonb_build_object('event_id', p_event, 'event_type', o.event_type, 'jobs', n, 'reason', left(p_reason, 300)));
  return jsonb_build_object('event_id', p_event, 'replayed', n, 'published', o.published_at is not null);
end $$;

-- ── 3. Service health history (written by /api/health with the ops bearer; read by ops admins) ──
create table if not exists public.service_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null default now(),
  status text not null check (status in ('ok','degraded','down')),
  components jsonb not null default '{}' check (jsonb_typeof(components) = 'object'),
  source text not null default 'api_health' check (length(source) <= 40)
);
create index if not exists service_health_snapshots_taken_idx on public.service_health_snapshots(taken_at desc);
alter table public.service_health_snapshots enable row level security;
revoke all on public.service_health_snapshots from anon, authenticated;
grant select on public.service_health_snapshots to authenticated;
drop policy if exists service_health_snapshots_read on public.service_health_snapshots;
create policy service_health_snapshots_read on public.service_health_snapshots for select using (public.ops_can_read());

create or replace function public.record_health_snapshot(p_status text, p_components jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  -- At most one snapshot per minute (uptime monitors poll often); keep 30 days.
  if exists (select 1 from public.service_health_snapshots where taken_at > now() - interval '1 minute') then return null; end if;
  insert into public.service_health_snapshots(status, components) values (case when p_status in ('ok','degraded','down') then p_status else 'degraded' end, coalesce(p_components, '{}'))
    returning id into v;
  delete from public.service_health_snapshots where taken_at < now() - interval '30 days';
  return v;
end $$;

-- Queue health component for /api/health (no payloads, counts only).
create or replace function public.queue_health() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'state', case when (select count(*) from public.job_queue where status = 'dead') > 0 or (select count(*) from public.job_queue where status = 'running' and lease_until < now()) > 0 then 'degraded'
                  when (select min(emitted_at) from public.domain_outbox where published_at is null) < now() - interval '15 minutes' then 'degraded' else 'healthy' end,
    'dead', (select count(*) from public.job_queue where status = 'dead'),
    'failed_waiting', (select count(*) from public.job_queue where status = 'failed'),
    'stuck_running', (select count(*) from public.job_queue where status = 'running' and lease_until < now()),
    'outbox_unpublished', (select count(*) from public.domain_outbox where published_at is null),
    'outbox_lag_seconds', coalesce(extract(epoch from now() - (select min(emitted_at) from public.domain_outbox where published_at is null))::int, 0));
$$;

-- ── 4. Admin review read access (Trust & Safety reads evidence it decides on; everything else stays scoped) ──
drop policy if exists provider_documents_trust_read on public.provider_documents;
create policy provider_documents_trust_read on public.provider_documents for select using (public.has_admin_permission('trust'));
drop policy if exists verification_records_trust_read on public.verification_records;
create policy verification_records_trust_read on public.verification_records for select using (public.has_admin_permission('trust'));
drop policy if exists ticket_risk_flags_trust_read on public.ticket_risk_flags;
create policy ticket_risk_flags_trust_read on public.ticket_risk_flags for select using (public.has_admin_permission('trust'));
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'enforcement_actions' and qual like '%has_admin_permission(''trust''%') then
    execute 'create policy enforcement_actions_trust_read on public.enforcement_actions for select using (public.has_admin_permission(''trust''))';
  end if;
end $$;

-- Review queue counts for the admin shell and the Trust tabs (one round trip).
create or replace function public.admin_review_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'documents', case when public.has_admin_permission('trust') then (select count(*) from public.provider_documents where status in ('submitted','in_review')) end,
    'checks', case when public.has_admin_permission('trust') then (select count(*) from public.verification_checks where status in ('submitted','pending_review')) end,
    'appeals', case when public.has_admin_permission('trust') then (select count(*) from public.trust_cases where queue = 'appeal' and status in ('open','in_review')) end,
    'risk_signals', case when public.has_admin_permission('trust') then (select count(*) from public.risk_signals where status = 'open') end,
    'risk_holds', case when public.has_admin_permission('trust') then (select count(*) from public.risk_holds where status = 'active') end,
    'ticket_flags', case when public.has_admin_permission('tickets') or public.has_admin_permission('trust') then (select count(*) from public.ticket_risk_flags where status = 'open') end,
    'privacy_open', case when public.privacy_admin_can_read() then (select count(*) from public.privacy_requests where status in ('received','verifying','in_progress','extended')) end,
    'legal_holds', case when public.privacy_admin_can_read() then (select count(*) from public.legal_holds where status = 'active') end,
    'dead_jobs', case when public.ops_can_read() then (select count(*) from public.job_queue where status = 'dead') end);
end $$;

-- ── 5. Permission tiers: harden the remaining admin-path mutations in place (checked patch of the live text) ──
do $patch$
declare
  fixes text[][] := array[
    -- trust_review_document: only Trust & Safety decides evidence (was: any platform admin).
    array['public.trust_review_document(uuid,text,text,text,date,bigint)',
          'if not (public.has_admin_permission(''trust'') or exists (select 1 from public.platform_admins where user_id = auth.uid())) then',
          'if not public.has_admin_permission(''trust'') then'],
    -- ticket_risk_review: MFA + a written reason; tickets or trust admins.
    array['public.ticket_risk_review(uuid,text,text)',
          'if not public.has_admin_permission(''tickets'') then raise exception ''not_authorized'' using errcode = ''42501''; end if;',
          'perform public.admin_mfa_required(); if not (public.has_admin_permission(''tickets'') or public.has_admin_permission(''trust'')) then raise exception ''not_authorized'' using errcode = ''42501''; end if; if length(trim(coalesce(p_note, ''''))) < 5 then raise exception ''reason_required'' using errcode = ''22023''; end if;'],
    -- set_directory_featured (Q23 editorial featuring): MFA.
    array['public.set_directory_featured(text,text,uuid,text,uuid,text,timestamptz)',
          'if not public.has_admin_permission(''commerce'') then raise exception ''not_authorized'' using errcode = ''42501''; end if;',
          'perform public.admin_mfa_required(); if not public.has_admin_permission(''commerce'') then raise exception ''not_authorized'' using errcode = ''42501''; end if;'],
    -- cancel_event_with_refunds: an admin acting outside their own workspace needs MFA.
    array['public.cancel_event_with_refunds(uuid,text,text,text)',
          'is_admin := public.has_admin_permission(''tickets'');',
          'is_admin := public.has_admin_permission(''tickets''); if is_admin and not public.has_workspace_role(e.workspace_id, array[''owner'',''manager'']) then perform public.admin_mfa_required(); end if;'],
    -- decide_cancellation: the admin review path (not a party to the booking) needs MFA.
    array['public.decide_cancellation(uuid,boolean,text,numeric)',
          'if is_admin and actor is null and length(trim(coalesce(p_note, ''''))) < 5 then',
          'if is_admin and actor is null then perform public.admin_mfa_required(); end if; if is_admin and actor is null and length(trim(coalesce(p_note, ''''))) < 5 then']
  ];
  i int; fn regprocedure; def text; occurrences int;
begin
  for i in 1 .. array_length(fixes, 1) loop
    begin fn := fixes[i][1]::regprocedure; exception when undefined_function then
      -- signature lookup by name when argument types differ from the expectation
      select p.oid::regprocedure into fn from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = split_part(split_part(fixes[i][1], '(', 1), '.', 2);
    end;
    if fn is null then raise exception 'patch target missing: %', fixes[i][1]; end if;
    def := pg_get_functiondef(fn);
    if position(fixes[i][3] in def) > 0 then continue; end if;   -- already patched (idempotent)
    occurrences := (length(def) - length(replace(def, fixes[i][2], ''))) / length(fixes[i][2]);
    if occurrences <> 1 then raise exception 'patch anchor for % found % times', fn, occurrences; end if;
    execute replace(def, fixes[i][2], fixes[i][3]);
  end loop;
end $patch$;

-- ── 6. Domain events ──
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('ops.job_retried', 1, 'job', 'An operator retried a failed or dead-lettered job (payload: job_id, kind, from, reason).', null),
  ('ops.job_cancelled', 1, 'job', 'An operator cancelled a queued or stuck job (payload: job_id, kind, from, reason).', null),
  ('ops.outbox_replayed', 1, 'domain_event', 'An operator replayed an outbox event to consumers that had not processed it (payload: event_id, event_type, jobs, reason).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate, active = true, updated_at = now();

-- ── 7. Grants ──
revoke all on function public.ops_can_read(), public.admin_ops_overview(), public.admin_job_list(text, text, integer, integer), public.admin_outbox_list(boolean, text, integer, integer),
  public.admin_job_retry(uuid, text), public.admin_job_cancel(uuid, text), public.admin_outbox_replay(uuid, text), public.record_health_snapshot(text, jsonb),
  public.queue_health(), public.admin_review_counts() from public, anon;
revoke all on function public.record_health_snapshot(text, jsonb), public.queue_health() from authenticated;
grant execute on function public.record_health_snapshot(text, jsonb), public.queue_health() to service_role;
grant execute on function public.ops_can_read(), public.admin_ops_overview(), public.admin_job_list(text, text, integer, integer), public.admin_outbox_list(boolean, text, integer, integer),
  public.admin_job_retry(uuid, text), public.admin_job_cancel(uuid, text), public.admin_outbox_replay(uuid, text), public.admin_review_counts() to authenticated;
