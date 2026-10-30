-- Q34 (lane A): Observability / SRE / Continuity — metrics, SLOs as data, alert rules, backup catalogue verification, restore
-- tests, incidents, runbook registry and synthetic probes / chaos drills (domains 213–222, 277–279; v6 GD-13.3, X28, §34).
-- Additive and backward-compatible: new ops_* tables (service-only writes; ops admins read through RLS), three nullable
-- columns on db_backup_runs (the db-backup Edge Function's upserts are unaffected), read indexes on small tables, new
-- functions, two job kinds and one pg_cron entry. No existing function is changed.
--
--   ops_slo_definitions   SLOs as data (objective, window, burn thresholds, card reference)
--   ops_metric_rollups    5-minute rollups derived from canonical tables (no unbounded scans at read time)
--   ops_alert_rules       alert rules as data (signal, comparator, threshold, severity, cooldown, recipients, runbook)
--   ops_alerts            fired alerts: one open row per rule, deduplicated, acknowledged, resolved
--   ops_incidents         incident record (severity, lifecycle, commander, runbook) + ops_incident_actions timeline
--   ops_runbooks          runbook registry (docs/operations/runbooks.md anchors), linked from alerts/incidents
--   ops_synthetic_checks  probes and chaos drills; ops_synthetic_runs results; view ops_synthetic_failures
--   ops_restore_tests     restore drills (never against live: CHECK target_is_live = false), RPO/RTO evidence
-- Alerts reach platform admins only as in-app notifications through public.notify() with kind 'admin.ops_alert', which has
-- no email category (public.email_category returns null), so nothing is emailed or paged externally.
-- Worker: pg_cron 'ops-observe' (every 5 min) → job 'ops.observe' (db runtime) → rollups (last 2 h recomputed) → alert
-- evaluation → retention purge.

-- ═══ 1. Tables ═══
create table if not exists public.ops_slo_definitions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  journey text not null,
  name text not null,
  description text not null,
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  objective numeric(7,5) not null check (objective > 0 and objective < 1),
  window_days integer not null default 28 check (window_days between 1 and 90),
  latency_threshold_ms integer check (latency_threshold_ms is null or latency_threshold_ms > 0),
  fast_burn numeric not null default 14.4 check (fast_burn > 0),
  slow_burn numeric not null default 6 check (slow_burn > 0),
  min_events integer not null default 10 check (min_events >= 1),
  card text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_metric_rollups (
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  bucket_start timestamptz not null,
  bucket_seconds integer not null default 300 check (bucket_seconds > 0),
  total integer not null default 0 check (total >= 0),
  good integer not null default 0 check (good >= 0),
  bad integer not null default 0 check (bad >= 0),
  value numeric,
  p50_ms integer, p95_ms integer, max_ms integer,
  collected_at timestamptz not null default now(),
  primary key (metric_key, bucket_start),
  check (total = good + bad)
);
create index if not exists ops_metric_rollups_bucket_idx on public.ops_metric_rollups(bucket_start desc);

create table if not exists public.ops_runbooks (
  key text primary key check (key ~ '^[a-z][a-z0-9-]*$'),
  title text not null,
  category text not null check (category in ('payments','ticketing','marketplace','platform','security','data','integrations','agent')),
  doc_path text not null default 'docs/operations/runbooks.md',
  anchor text not null,
  severity_default text not null default 'sev2' check (severity_default in ('sev1','sev2','sev3','sev4')),
  owner_role text not null default 'platform_admin',
  card text,
  reviewed_at date,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_alert_rules (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  name text not null,
  signal text not null check (signal ~ '^[a-z][a-z0-9_]*$'),
  comparator text not null default '>' check (comparator in ('>','>=','<','<=')),
  threshold numeric not null,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  cooldown_minutes integer not null default 360 check (cooldown_minutes between 5 and 10080),
  recipients text not null default 'admins' check (recipients in ('admins','none')),
  notify_permissions text[] not null default '{settings,agent_ops}',
  notify_users uuid[],
  runbook_key text references public.ops_runbooks(key),
  auto_incident boolean not null default false,
  card text,
  description text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_incidents (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  title text not null check (length(title) between 3 and 200),
  severity text not null check (severity in ('sev1','sev2','sev3','sev4')),
  status text not null default 'detected' check (status in ('detected','investigating','contained','recovering','resolved','postmortem_done','cancelled')),
  summary text check (summary is null or length(summary) <= 4000),
  customer_impact text check (customer_impact is null or length(customer_impact) <= 2000),
  runbook_key text references public.ops_runbooks(key),
  source text not null default 'manual' check (source in ('manual','alert','probe','drill')),
  alert_id uuid,
  commander uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  correlation_id text,
  detected_at timestamptz not null default now(),
  contained_at timestamptz, resolved_at timestamptz, postmortem_due_at timestamptz, postmortem_done_at timestamptz,
  postmortem_url text check (postmortem_url is null or postmortem_url ~ '^(https://|docs/)'),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ops_incidents_open_idx on public.ops_incidents(status, detected_at desc);
create sequence if not exists public.ops_incident_seq;

create table if not exists public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null references public.ops_alert_rules(key) on delete cascade,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  severity text not null check (severity in ('info','warning','critical')),
  value numeric, threshold numeric,
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz, acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  notified_count integer not null default 0,
  last_notified_at timestamptz,
  incident_id uuid references public.ops_incidents(id) on delete set null,
  correlation_id text not null default ('cor_' || replace(gen_random_uuid()::text, '-', ''))
);
create unique index if not exists ops_alerts_one_open on public.ops_alerts(rule_key) where status <> 'resolved';
create index if not exists ops_alerts_recent_idx on public.ops_alerts(opened_at desc);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ops_incidents_alert_fk') then
    alter table public.ops_incidents add constraint ops_incidents_alert_fk foreign key (alert_id) references public.ops_alerts(id) on delete set null;
  end if;
end $$;

create table if not exists public.ops_incident_actions (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.ops_incidents(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'admin' check (actor_type in ('admin','system')),
  action text not null check (action in ('detected','declared','severity_changed','status_changed','note','containment','investigation','runbook_step',
                                         'recovery','notification','postmortem','alert_linked','commander_assigned')),
  from_status text, to_status text,
  note text check (note is null or length(note) <= 2000),
  runbook_key text,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object')
);
create index if not exists ops_incident_actions_idx on public.ops_incident_actions(incident_id, at);

create table if not exists public.ops_synthetic_checks (
  key text primary key check (key ~ '^(probe|drill|test)\.[a-z0-9_]+$'),
  kind text not null check (kind in ('probe','drill')),
  journey text not null,
  name text not null,
  description text not null default '',
  critical boolean not null default false,
  interval_minutes integer check (interval_minutes is null or interval_minutes between 1 and 10080),
  card text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_synthetic_runs (
  id uuid primary key default gen_random_uuid(),
  check_key text not null references public.ops_synthetic_checks(key) on delete cascade,
  started_at timestamptz not null default now(),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  status text not null check (status in ('ok','failed','blocked','skipped')),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  source text not null default 'script' check (source in ('script','test','cron','health','drill')),
  environment text,
  correlation_id text
);
create index if not exists ops_synthetic_runs_check_idx on public.ops_synthetic_runs(check_key, started_at desc);
create index if not exists ops_synthetic_runs_started_idx on public.ops_synthetic_runs(started_at desc);

create or replace view public.ops_synthetic_failures with (security_invoker = true) as
  select r.id, r.check_key, c.kind, c.journey, c.critical, r.started_at, r.duration_ms, r.detail, r.source, r.correlation_id
  from public.ops_synthetic_runs r join public.ops_synthetic_checks c on c.key = r.check_key where r.status = 'failed';

create table if not exists public.ops_restore_tests (
  id uuid primary key default gen_random_uuid(),
  backup_kind text not null check (backup_kind in ('db_logical','storage_replica','provider_physical','config')),
  backup_ref text not null,
  target_kind text not null check (target_kind in ('local_scratch','scratch_project','verify_only')),
  target_label text not null check (length(target_label) between 2 and 200),
  target_is_live boolean not null default false check (target_is_live = false),   -- a restore over live is never a test
  status text not null check (status in ('passed','failed','partial')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  rto_seconds integer check (rto_seconds is null or rto_seconds >= 0),
  rpo_seconds integer check (rpo_seconds is null or rpo_seconds >= 0),
  tables integer, rows bigint,
  checks jsonb not null default '{}' check (jsonb_typeof(checks) = 'object'),
  operator text not null default 'script',
  notes text check (notes is null or length(notes) <= 4000),
  correlation_id text,
  created_at timestamptz not null default now(),
  check (finished_at >= started_at)
);
create index if not exists ops_restore_tests_recent_idx on public.ops_restore_tests(finished_at desc);

-- Backup catalogue: the db-backup Edge Function already records runs/tables; verification is recorded alongside.
alter table public.db_backup_runs add column if not exists verified_at timestamptz;
alter table public.db_backup_runs add column if not exists verify_status text;
alter table public.db_backup_runs add column if not exists verify_detail jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'db_backup_runs_verify_status_check') then
    alter table public.db_backup_runs add constraint db_backup_runs_verify_status_check check (verify_status is null or verify_status in ('verified','failed'));
  end if;
end $$;

-- Read indexes for the rollup windows (all small tables today; plain create is a brief lock).
create index if not exists check_ins_created_idx on public.check_ins(created_at);
create index if not exists webhook_events_received_idx on public.webhook_events(received_at);
create index if not exists webhook_deliveries_created_idx on public.webhook_deliveries(created_at);
create index if not exists api_requests_created_idx on public.api_requests(created_at);
create index if not exists payment_orders_updated_idx on public.payment_orders(updated_at);
create index if not exists checkout_orders_updated_idx on public.checkout_orders(updated_at);
create index if not exists checkout_orders_pending_created_idx on public.checkout_orders(created_at) where status = 'pending';
create index if not exists job_queue_started_idx on public.job_queue(started_at) where started_at is not null;
create index if not exists job_queue_finished_idx on public.job_queue(finished_at) where finished_at is not null;
create index if not exists agent_runs_finished_idx on public.agent_runs(finished_at) where finished_at is not null;
create index if not exists email_outbox_sent_idx on public.email_outbox(sent_at) where sent_at is not null;
create index if not exists state_violations_occurred_idx on public.state_violations(occurred_at);

do $$ declare t text; begin
  foreach t in array array['ops_slo_definitions','ops_metric_rollups','ops_runbooks','ops_alert_rules','ops_alerts','ops_incidents','ops_incident_actions',
                           'ops_synthetic_checks','ops_synthetic_runs','ops_restore_tests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_ops_read', t);
    execute format('create policy %I on public.%I for select using (public.ops_can_read())', t || '_ops_read', t);
  end loop;
end $$;
revoke all on public.ops_synthetic_failures from anon, authenticated;
grant select on public.ops_synthetic_failures to authenticated;
revoke all on sequence public.ops_incident_seq from public, anon, authenticated;

-- ═══ 2. Pure helpers ═══
-- Expected minutes between runs of a pg_cron schedule (common shapes; anything unusual → daily, so it is still watched).
create or replace function public.ops_cron_expected_minutes(p_schedule text) returns integer
language plpgsql immutable set search_path = '' as $$
declare f text[] := regexp_split_to_array(trim(coalesce(p_schedule, '')), '\s+');
begin
  if array_length(f, 1) <> 5 then return 1440; end if;
  if f[3] <> '*' or f[4] <> '*' then return 44640; end if;                 -- monthly (day-of-month / month fixed)
  if f[5] <> '*' then return 10080; end if;                                -- weekly
  if f[2] = '*' then
    if f[1] = '*' then return 1; end if;
    if f[1] ~ '^\*/\d+$' then return greatest(1, substr(f[1], 3)::int); end if;
    if f[1] ~ '^\d+(,\d+)+$' then return 60 / array_length(string_to_array(f[1], ','), 1); end if;
    return 60;                                                             -- 'M * * * *' hourly
  end if;
  if f[2] ~ '^\*/\d+$' then return 60 * greatest(1, substr(f[2], 3)::int); end if;
  return 1440;                                                             -- daily (fixed hour or hour range, e.g. db-backup's 2-3)
end $$;

-- SLO arithmetic (mirrors src/lib/observability/slo.ts; tests assert parity).
create or replace function public.ops_slo_calc(p_objective numeric, p_good bigint, p_bad bigint, p_h1_good bigint, p_h1_bad bigint, p_m5_good bigint, p_m5_bad bigint,
  p_h6_good bigint, p_h6_bad bigint, p_m30_good bigint, p_m30_bad bigint, p_fast numeric default 14.4, p_slow numeric default 6, p_min_events integer default 10)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare budget numeric; t bigint := coalesce(p_good, 0) + coalesce(p_bad, 0); comp numeric; remaining numeric; b1 numeric; b5 numeric; b6 numeric; b30 numeric; st text;
begin
  if p_objective is null or p_objective <= 0 or p_objective >= 1 then raise exception 'objective_out_of_range' using errcode = '22023'; end if;
  budget := round(1 - p_objective, 9);
  comp := case when t = 0 then null else round(p_good::numeric / t, 6) end;
  remaining := case when t = 0 then 1 else round(1 - (p_bad::numeric / t) / budget, 4) end;
  b1 := case when coalesce(p_h1_good,0) + coalesce(p_h1_bad,0) = 0 then 0 else round((p_h1_bad::numeric / (p_h1_good + p_h1_bad)) / budget, 4) end;
  b5 := case when coalesce(p_m5_good,0) + coalesce(p_m5_bad,0) = 0 then 0 else round((p_m5_bad::numeric / (p_m5_good + p_m5_bad)) / budget, 4) end;
  b6 := case when coalesce(p_h6_good,0) + coalesce(p_h6_bad,0) = 0 then 0 else round((p_h6_bad::numeric / (p_h6_good + p_h6_bad)) / budget, 4) end;
  b30 := case when coalesce(p_m30_good,0) + coalesce(p_m30_bad,0) = 0 then 0 else round((p_m30_bad::numeric / (p_m30_good + p_m30_bad)) / budget, 4) end;
  st := case when t = 0 then 'no_data' else 'ok' end;
  if t > 0 and coalesce(p_h6_good,0) + coalesce(p_h6_bad,0) >= p_min_events and b6 >= p_slow and b30 >= p_slow then st := 'slow_burn'; end if;
  if t > 0 and coalesce(p_h1_good,0) + coalesce(p_h1_bad,0) >= p_min_events and b1 >= p_fast and b5 >= p_fast then st := 'fast_burn'; end if;
  if t >= p_min_events and remaining <= 0 then st := 'breached'; end if;
  return jsonb_build_object('objective', p_objective, 'compliance', comp, 'budget_remaining', remaining, 'burn_1h', b1, 'burn_6h', b6, 'events', t, 'state', st,
    'fast_burning', t > 0 and coalesce(p_h1_good,0) + coalesce(p_h1_bad,0) >= p_min_events and b1 >= p_fast and b5 >= p_fast,
    'slow_burning', t > 0 and coalesce(p_h6_good,0) + coalesce(p_h6_bad,0) >= p_min_events and b6 >= p_slow and b30 >= p_slow);
end $$;

-- ═══ 3. Metrics collection (canonical tables → 5-minute rollups) ═══
-- Ratio metrics in [p_since, p_until) are recomputed (delete + insert), so late state changes are reflected; gauges are
-- written for the current bucket only. Each source is filtered by an indexed timestamp range.
create or replace function public.ops_collect_metrics(p_since timestamptz default null, p_until timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_until timestamptz := coalesce(p_until, now()); v_from timestamptz; origin constant timestamptz := '2000-01-01 00:00:00+00';
  ratio constant text[] := array['checkout.orders','payments.orders','booking.integrity','scan.sync_latency','signin.probe','webhooks.inbound','webhooks.outbound',
                                 'jobs.latency','jobs.outcomes','email.delivery','api.requests','agent.runs','availability.health'];
  n integer; g integer; cur timestamptz;
begin
  v_from := date_bin('5 minutes', coalesce(p_since, v_until - interval '2 hours'), origin);
  if v_from > v_until then raise exception 'invalid_range' using errcode = '22023'; end if;
  if v_until - v_from > interval '35 days' then raise exception 'range_too_large' using errcode = '22023'; end if;
  delete from public.ops_metric_rollups where metric_key = any(ratio) and bucket_start >= v_from and bucket_start < v_until;
  with ev(metric, ts, good, bad, ms) as (
    -- checkout: issued = good; an order still pending 26 h after creation (beyond Stripe's 24 h session expiry) = stuck = bad
    select 'checkout.orders', o.updated_at, 1, 0, null::numeric from public.checkout_orders o where o.status = 'issued' and o.updated_at >= v_from and o.updated_at < v_until
    union all select 'checkout.orders', o.created_at + interval '26 hours', 0, 1, null from public.checkout_orders o
      where o.status = 'pending' and o.created_at >= v_from - interval '26 hours' and o.created_at < v_until - interval '26 hours' and o.created_at + interval '26 hours' <= now()
    -- marketplace payments: failed = bad; settled states = good (open/pending states are not counted)
    union all select 'payments.orders', p.updated_at, case when p.status = 'failed' then 0 else 1 end, case when p.status = 'failed' then 1 else 0 end, null
      from public.payment_orders p where p.updated_at >= v_from and p.updated_at < v_until
        and p.status not in ('pending','created','checkout_open','requires_payment','awaiting_payment','cancelled','expired')
    -- booking state integrity: booking writes = good, refused invalid booking transitions = bad
    union all select 'booking.integrity', b.updated_at, 1, 0, null from public.bookings b where b.updated_at >= v_from and b.updated_at < v_until
    union all select 'booking.integrity', s.occurred_at, 0, 1, null from public.state_violations s where s.machine ilike '%booking%' and s.occurred_at >= v_from and s.occurred_at < v_until
    -- door scans: every recorded decision; offline scans must sync within 5 minutes
    union all select 'scan.sync_latency', c.created_at,
        case when c.offline_at is null or c.created_at - c.offline_at <= interval '5 minutes' then 1 else 0 end,
        case when c.offline_at is not null and c.created_at - c.offline_at > interval '5 minutes' then 1 else 0 end,
        case when c.offline_at is null then 0 else greatest(0, extract(epoch from c.created_at - c.offline_at) * 1000) end
      from public.check_ins c where c.created_at >= v_from and c.created_at < v_until
    -- sign-in: synthetic login probe outcome (Supabase Auth keeps failed sign-ins in its own logs, outside the database)
    union all select 'signin.probe', r.started_at, case when r.status = 'ok' then 1 else 0 end, case when r.status = 'failed' then 1 else 0 end, r.duration_ms
      from public.ops_synthetic_runs r where r.check_key = 'probe.login' and r.status in ('ok','failed') and r.started_at >= v_from and r.started_at < v_until
    -- inbound provider webhooks: processed/ignored = good; failed, or still unprocessed after 10 minutes = bad
    union all select 'webhooks.inbound', w.received_at,
        case when w.status in ('processed','ignored') then 1 else 0 end,
        case when w.status = 'failed' or (w.status in ('received','processing') and w.received_at < now() - interval '10 minutes') then 1 else 0 end,
        case when w.processed_at is not null then greatest(0, extract(epoch from w.processed_at - w.received_at) * 1000) end
      from public.webhook_events w where w.received_at >= v_from and w.received_at < v_until
        and (w.status in ('processed','ignored','failed') or w.received_at < now() - interval '10 minutes')
    -- outbound developer webhooks: delivered = good, dead-lettered = bad (retries in flight are not counted yet)
    union all select 'webhooks.outbound', d.created_at, case when d.status = 'delivered' then 1 else 0 end, case when d.status = 'dead' then 1 else 0 end, null
      from public.webhook_deliveries d where d.created_at >= v_from and d.created_at < v_until and d.status in ('delivered','dead')
    -- job queue wait (run_after → started_at) ≤ 2 minutes
    union all select 'jobs.latency', j.started_at, case when j.started_at - j.run_after <= interval '2 minutes' then 1 else 0 end,
        case when j.started_at - j.run_after > interval '2 minutes' then 1 else 0 end, greatest(0, extract(epoch from j.started_at - j.run_after) * 1000)
      from public.job_queue j where j.started_at >= v_from and j.started_at < v_until
    union all select 'jobs.outcomes', j.finished_at, case when j.status = 'succeeded' then 1 else 0 end, case when j.status = 'dead' then 1 else 0 end, null
      from public.job_queue j where j.finished_at >= v_from and j.finished_at < v_until and j.status in ('succeeded','dead')
    -- transactional email: sent = good; failed, or still queued an hour after creation = bad (suppressed is policy, not failure)
    union all select 'email.delivery', e.sent_at, 1, 0, greatest(0, extract(epoch from e.sent_at - e.created_at) * 1000) from public.email_outbox e
      where e.sent_at >= v_from and e.sent_at < v_until
    union all select 'email.delivery', case when e.status = 'failed' then e.created_at else e.created_at + interval '1 hour' end, 0, 1, null from public.email_outbox e
      where (e.status = 'failed' and e.created_at >= v_from and e.created_at < v_until)
         or (e.status in ('queued','sending') and e.created_at >= v_from - interval '1 hour' and e.created_at < v_until - interval '1 hour' and e.created_at + interval '1 hour' <= now())
    -- developer API: 5xx = bad
    union all select 'api.requests', a.created_at, case when a.status < 500 then 1 else 0 end, case when a.status >= 500 then 1 else 0 end, a.duration_ms
      from public.api_requests a where a.created_at >= v_from and a.created_at < v_until
    -- Gala Agent runs reaching a terminal state
    union all select 'agent.runs', r.finished_at, case when r.status in ('completed','partially_completed') then 1 else 0 end, case when r.status = 'failed' then 1 else 0 end,
        case when r.started_at is not null then greatest(0, extract(epoch from r.finished_at - r.started_at) * 1000) end
      from public.agent_runs r where r.finished_at >= v_from and r.finished_at < v_until and r.status in ('completed','partially_completed','failed')
    -- platform availability from /api/health snapshots (degraded still serves; down does not)
    union all select 'availability.health', h.taken_at, case when h.status <> 'down' then 1 else 0 end, case when h.status = 'down' then 1 else 0 end, null
      from public.service_health_snapshots h where h.taken_at >= v_from and h.taken_at < v_until
  )
  insert into public.ops_metric_rollups(metric_key, bucket_start, total, good, bad, p50_ms, p95_ms, max_ms, collected_at)
  select metric, date_bin('5 minutes', ts, origin), sum(good + bad)::int, sum(good)::int, sum(bad)::int,
    (percentile_disc(0.5) within group (order by ms))::int, (percentile_disc(0.95) within group (order by ms))::int, max(ms)::int, now()
  from ev where ts >= v_from and ts < v_until group by 1, 2
  on conflict (metric_key, bucket_start) do update set total = excluded.total, good = excluded.good, bad = excluded.bad, p50_ms = excluded.p50_ms,
    p95_ms = excluded.p95_ms, max_ms = excluded.max_ms, collected_at = now();
  get diagnostics n = row_count;

  -- Gauges for the bucket containing p_until (only when collecting up to "now").
  if p_until is null or p_until >= now() - interval '1 minute' then
    cur := date_bin('5 minutes', now(), origin);
    insert into public.ops_metric_rollups(metric_key, bucket_start, value, collected_at)
    select k, cur, v, now() from (values
      ('queue.depth', (select count(*) from public.job_queue where status in ('queued','failed') and run_after <= now())::numeric),
      ('queue.overdue', (select count(*) from public.job_queue where status in ('queued','failed') and run_after < now() - interval '15 minutes')::numeric),
      ('queue.dead', (select count(*) from public.job_queue where status = 'dead')::numeric),
      ('queue.stuck', (select count(*) from public.job_queue where status = 'running' and lease_until < now())::numeric),
      ('outbox.lag_seconds', coalesce(extract(epoch from now() - (select min(emitted_at) from public.domain_outbox where published_at is null)), 0)::numeric),
      ('email.queued', (select count(*) from public.email_outbox where status in ('queued','sending'))::numeric),
      ('webhooks.inbound_backlog', (select count(*) from public.webhook_events where status in ('received','processing') and received_at < now() - interval '10 minutes')::numeric)
    ) g(k, v)
    on conflict (metric_key, bucket_start) do update set value = excluded.value, collected_at = now();
    get diagnostics g = row_count;
  end if;
  return jsonb_build_object('from', v_from, 'until', v_until, 'ratio_buckets', n, 'gauges', coalesce(g, 0));
end $$;

-- SLO status for every active definition, from rollups only.
create or replace function public.ops_slo_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', d.key, 'journey', d.journey, 'name', d.name, 'metric', d.metric_key, 'window_days', d.window_days, 'card', d.card)
           || public.ops_slo_calc(d.objective, w.g, w.b, w.h1g, w.h1b, w.m5g, w.m5b, w.h6g, w.h6b, w.m30g, w.m30b, d.fast_burn, d.slow_burn, d.min_events)
           order by d.journey, d.key), '[]'::jsonb)
  from public.ops_slo_definitions d
  cross join lateral (
    select coalesce(sum(r.good), 0) g, coalesce(sum(r.bad), 0) b,
      coalesce(sum(r.good) filter (where r.bucket_start >= now() - interval '1 hour'), 0) h1g, coalesce(sum(r.bad) filter (where r.bucket_start >= now() - interval '1 hour'), 0) h1b,
      coalesce(sum(r.good) filter (where r.bucket_start >= now() - interval '5 minutes'), 0) m5g, coalesce(sum(r.bad) filter (where r.bucket_start >= now() - interval '5 minutes'), 0) m5b,
      coalesce(sum(r.good) filter (where r.bucket_start >= now() - interval '6 hours'), 0) h6g, coalesce(sum(r.bad) filter (where r.bucket_start >= now() - interval '6 hours'), 0) h6b,
      coalesce(sum(r.good) filter (where r.bucket_start >= now() - interval '30 minutes'), 0) m30g, coalesce(sum(r.bad) filter (where r.bucket_start >= now() - interval '30 minutes'), 0) m30b
    from public.ops_metric_rollups r where r.metric_key = d.metric_key and r.bucket_start >= now() - make_interval(days => d.window_days)) w
  where d.active;
$$;

-- ═══ 4. Cron freshness, backups ═══
create or replace function public.ops_cron_freshness() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('job', s.job, 'schedule', s.schedule, 'active', s.active, 'expected_minutes', s.exp, 'last_run', s.last_run,
      'last_status', s.last_status, 'failures_24h', s.failures_24h,
      'minutes_since', case when s.last_run is null then null else round(extract(epoch from now() - s.last_run) / 60)::int end,
      'state', case when not s.active then 'inactive'
                    when s.last_run is null then 'never_run'
                    when s.last_run < now() - make_interval(mins => 3 * s.exp + 5) then 'missed'
                    when s.last_status = 'failed' then 'failing'
                    else 'fresh' end) order by s.job), '[]'::jsonb)
  from (select c.*, public.ops_cron_expected_minutes(c.schedule) exp from public.cron_job_status() c) s;
$$;

create or replace function public.ops_backup_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'database', (select jsonb_build_object(
        'latest_complete', max(run_date) filter (where status = 'complete'),
        'latest_finished_at', max(finished_at) filter (where status = 'complete'),
        'age_hours', round(extract(epoch from now() - max(finished_at) filter (where status = 'complete')) / 3600, 1),
        'runs', count(*), 'oldest', min(run_date), 'failed_or_partial', count(*) filter (where status in ('failed','partial') or (status = 'running' and run_date < (now() at time zone 'utc')::date)),
        -- retention policy (Edge Function): 35 daily + the 1st of each month for 12 months
        'retention_ok', not exists (select 1 from public.db_backup_runs x where (x.run_date < (now() at time zone 'utc')::date - 36 and extract(day from x.run_date) <> 1) or x.run_date < (now() at time zone 'utc')::date - 367),
        'last_verified', max(verified_at), 'last_verify_status', (select verify_status from public.db_backup_runs where verified_at is not null order by verified_at desc limit 1),
        'latest_tables', (select tables from public.db_backup_runs where status = 'complete' order by run_date desc limit 1),
        'latest_rows', (select rows from public.db_backup_runs where status = 'complete' order by run_date desc limit 1))
      from public.db_backup_runs),
    'storage', (select jsonb_build_object('objects', count(*), 'replicated', count(b.name) filter (where b.object_updated_at >= o.updated_at),
        'lagging', count(*) filter (where (b.name is null or b.object_updated_at < o.updated_at) and o.updated_at < now() - interval '60 minutes'),
        'last_replicated_at', (select max(backed_up_at) from public.storage_backups))
      from storage.objects o left join public.storage_backups b on b.bucket = o.bucket_id and b.name = o.name),
    'restore_tests', (select jsonb_build_object('last_passed_at', max(finished_at) filter (where status = 'passed'), 'count', count(*),
        'last', (select jsonb_build_object('target_kind', t.target_kind, 'status', t.status, 'backup_ref', t.backup_ref, 'rto_seconds', t.rto_seconds, 'rpo_seconds', t.rpo_seconds, 'finished_at', t.finished_at)
                 from public.ops_restore_tests t order by t.finished_at desc limit 1))
      from public.ops_restore_tests),
    'provider', jsonb_build_object('physical_daily', 'Supabase-managed (WAL-G), 7 days on the current plan', 'pitr', 'not enabled (owner decision 2026-10-12); see docs/operations/backup-restore.md'));
$$;

-- ═══ 5. Alert signals and evaluation ═══
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
  when 'none' then v := 0;
  else raise exception 'unknown_signal: %', p_signal using errcode = '22023';
  end case;
  return jsonb_build_object('value', coalesce(v, 0), 'detail', coalesce(d, '{}'));
end $$;

-- Platform admins who receive a rule's alerts (explicit on-call users, or everyone holding one of the rule's permissions).
create or replace function public.ops_alert_recipients(p_rule public.ops_alert_rules) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.user_id from public.platform_admins a
  where p_rule.recipients = 'admins'
    and (case when p_rule.notify_users is not null and cardinality(p_rule.notify_users) > 0 then a.user_id = any(p_rule.notify_users) else a.permissions && p_rule.notify_permissions end);
$$;

create or replace function public.ops_open_incident_internal(p_title text, p_severity text, p_summary text, p_runbook text, p_source text, p_alert uuid,
  p_actor uuid default null, p_correlation text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid; ref text := 'INC-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' || lpad(nextval('public.ops_incident_seq')::text, 4, '0');
begin
  insert into public.ops_incidents(reference, title, severity, summary, runbook_key, source, alert_id, created_by, commander, correlation_id)
  values (ref, left(p_title, 200), p_severity, left(p_summary, 4000), p_runbook, p_source, p_alert, p_actor, p_actor, coalesce(p_correlation, 'cor_' || replace(gen_random_uuid()::text, '-', '')))
  returning id into v;
  insert into public.ops_incident_actions(incident_id, actor_id, actor_type, action, to_status, note, runbook_key, metadata)
  values (v, p_actor, case when p_actor is null then 'system' else 'admin' end, case when p_source = 'manual' then 'declared' else 'detected' end, 'detected',
          left(p_summary, 2000), p_runbook, jsonb_build_object('source', p_source, 'alert_id', p_alert));
  if p_alert is not null then update public.ops_alerts set incident_id = v where id = p_alert; end if;
  perform public.emit_domain_event('ops.incident_opened', null, jsonb_build_object('incident_id', v, 'reference', ref, 'severity', p_severity, 'source', p_source),
    p_actor, case when p_actor is null then 'system' else 'admin' end, 'ops_incident', v::text, p_correlation, case when p_alert is null then null else 'alert:' || p_alert end);
  if p_severity in ('sev1','sev2') then
    perform public.notify(a.user_id, 'admin.ops_alert', 'Incident ' || ref || ' (' || upper(p_severity) || '): ' || left(p_title, 120), left(coalesce(p_summary, ''), 400),
      '/admin/health?incident=' || v, 'ops_incident:' || v || ':opened')
      from public.platform_admins a where a.permissions && array['settings','agent_ops'];
  end if;
  return v;
end $$;

-- Evaluates active rules (optionally only some). p_synthetic {rule_key: value} replaces the live signal for those rules (drills
-- and tests); p_dry_run reports what would happen and writes nothing.
create or replace function public.ops_evaluate_alerts(p_only text[] default null, p_synthetic jsonb default null, p_dry_run boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.ops_alert_rules; sig jsonb; val numeric; breached boolean; a public.ops_alerts; aid uuid; fired text[] := '{}'; resolved text[] := '{}'; still text[] := '{}';
  notified integer := 0; k integer; results jsonb := '[]'; syn boolean;
begin
  if p_synthetic is not null and jsonb_typeof(p_synthetic) <> 'object' then raise exception 'synthetic_must_be_object' using errcode = '22023'; end if;
  for r in select * from public.ops_alert_rules where active and (p_only is null or key = any(p_only)) order by key loop
    syn := p_synthetic is not null and p_synthetic ? r.key;
    begin
      sig := case when syn then jsonb_build_object('value', (p_synthetic ->> r.key)::numeric, 'detail', jsonb_build_object('synthetic', true)) else public.ops_alert_signal(r.signal) end;
    exception when others then
      sig := jsonb_build_object('value', null, 'detail', jsonb_build_object('signal_error', left(sqlerrm, 200)));
    end;
    val := (sig ->> 'value')::numeric;
    breached := val is not null and case r.comparator when '>' then val > r.threshold when '>=' then val >= r.threshold when '<' then val < r.threshold else val <= r.threshold end;
    results := results || jsonb_build_array(jsonb_build_object('rule', r.key, 'value', val, 'threshold', r.threshold, 'breached', breached, 'synthetic', syn));
    select * into a from public.ops_alerts where rule_key = r.key and status <> 'resolved' for update;
    if p_dry_run then
      if breached and a.id is null then fired := fired || r.key; elsif not breached and a.id is not null then resolved := resolved || r.key; elsif breached then still := still || r.key; end if;
      continue;
    end if;
    if breached then
      if a.id is null then
        insert into public.ops_alerts(rule_key, severity, value, threshold, detail) values (r.key, r.severity, val, r.threshold, coalesce(sig -> 'detail', '{}')) returning * into a;
        fired := fired || r.key;
        insert into public.audit_events(actor_type, event, metadata, correlation_id) values ('system', 'ops.alert_fired', jsonb_build_object('alert_id', a.id, 'rule', r.key, 'value', val, 'threshold', r.threshold, 'severity', r.severity), a.correlation_id);
        perform public.emit_domain_event('ops.alert_fired', null, jsonb_build_object('alert_id', a.id, 'rule', r.key, 'severity', r.severity, 'value', val), null, 'system', 'ops_alert', a.id::text, a.correlation_id, null);
        if r.auto_incident and r.severity = 'critical' then
          perform public.ops_open_incident_internal('Alert: ' || r.name, 'sev2', r.description, r.runbook_key, 'alert', a.id, null, a.correlation_id);
        end if;
      else
        update public.ops_alerts set value = val, detail = coalesce(sig -> 'detail', '{}'), last_seen_at = now() where id = a.id returning * into a;
        still := still || r.key;
      end if;
      -- Notify on open, then at most once per cooldown while still open (acknowledged alerts are not re-notified).
      if a.status = 'open' and (a.last_notified_at is null or a.last_notified_at < now() - make_interval(mins => r.cooldown_minutes)) then
        select count(public.notify(u, 'admin.ops_alert', upper(r.severity) || ': ' || r.name, left('Value ' || val || ' (threshold ' || r.comparator || ' ' || r.threshold || '). ' || r.description, 400),
                                   '/admin/health?alert=' || a.id, 'ops_alert:' || a.id || ':' || a.notified_count)) into k
          from public.ops_alert_recipients(r) u;
        update public.ops_alerts set notified_count = notified_count + 1, last_notified_at = now() where id = a.id;
        notified := notified + k;
      end if;
    elsif a.id is not null then
      update public.ops_alerts set status = 'resolved', resolved_at = now(), value = val, last_seen_at = now() where id = a.id;
      resolved := resolved || r.key;
      insert into public.audit_events(actor_type, event, metadata, correlation_id) values ('system', 'ops.alert_resolved', jsonb_build_object('alert_id', a.id, 'rule', r.key, 'value', val), a.correlation_id);
      perform public.emit_domain_event('ops.alert_resolved', null, jsonb_build_object('alert_id', a.id, 'rule', r.key), null, 'system', 'ops_alert', a.id::text, a.correlation_id, null);
    end if;
  end loop;
  return jsonb_build_object('evaluated', jsonb_array_length(results), 'fired', to_jsonb(fired), 'resolved', to_jsonb(resolved), 'still_open', to_jsonb(still),
    'notified', notified, 'dry_run', p_dry_run, 'results', results);
end $$;

-- ═══ 6. Worker job (pg_cron → job_queue → run_db_jobs) ═══
create or replace function public.job_ops_observe(p_job public.job_queue) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare m jsonb; a jsonb; purged integer := 0; n integer;
begin
  m := public.ops_collect_metrics(now() - interval '2 hours', null);
  a := public.ops_evaluate_alerts(null, null, false);
  -- Retention: rollups 35 days (covers the 28-day SLO windows), synthetic runs 90 days, resolved alerts 180 days. Incidents are kept.
  delete from public.ops_metric_rollups where bucket_start < now() - interval '35 days'; get diagnostics n = row_count; purged := purged + n;
  delete from public.ops_synthetic_runs where started_at < now() - interval '90 days'; get diagnostics n = row_count; purged := purged + n;
  delete from public.ops_alerts where status = 'resolved' and resolved_at < now() - interval '180 days'; get diagnostics n = row_count; purged := purged + n;
  return jsonb_build_object('metrics', m, 'alerts', a - 'results', 'purged', purged);
end $$;

-- ═══ 7. Recording probes, drills and restore tests (service role: scripts, tests, /api/cron/probes) ═══
create or replace function public.ops_record_synthetic_run(p_check text, p_status text, p_duration_ms integer, p_detail jsonb default '{}', p_source text default 'script',
  p_correlation text default null, p_environment text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid; c public.ops_synthetic_checks; clean jsonb;
begin
  select * into c from public.ops_synthetic_checks where key = p_check and active;
  if not found then raise exception 'unknown_check: %', p_check using errcode = '22023'; end if;
  -- Defence in depth: callers redact; top-level personal / credential keys are dropped here too.
  select coalesce(jsonb_object_agg(k, v2), '{}') into clean from jsonb_each(coalesce(p_detail, '{}')) e(k, v2)
    where k !~* '(email|password|token|secret|cookie|authorization|phone|api_?key|dsn)';
  insert into public.ops_synthetic_runs(check_key, status, duration_ms, detail, source, correlation_id, environment)
  values (p_check, p_status, greatest(0, coalesce(p_duration_ms, 0)), clean, coalesce(p_source, 'script'), p_correlation, left(p_environment, 40)) returning id into v;
  if p_status = 'failed' and c.critical and c.kind = 'probe' then
    perform public.emit_domain_event('ops.synthetic_failed', null, jsonb_build_object('run_id', v, 'check', p_check, 'journey', c.journey), null, 'system', 'synthetic_check', p_check, p_correlation, null);
  end if;
  return v;
end $$;

create or replace function public.ops_record_restore_test(p_backup_kind text, p_backup_ref text, p_target_kind text, p_target_label text, p_status text,
  p_started timestamptz, p_finished timestamptz, p_rto_seconds integer, p_rpo_seconds integer, p_tables integer, p_rows bigint, p_checks jsonb default '{}',
  p_operator text default 'script', p_notes text default null, p_correlation text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid;
begin
  if p_target_label ~* '(prod|live)' and p_target_kind <> 'verify_only' then raise exception 'target_looks_live' using errcode = '22023'; end if;
  insert into public.ops_restore_tests(backup_kind, backup_ref, target_kind, target_label, status, started_at, finished_at, rto_seconds, rpo_seconds, tables, rows, checks, operator, notes, correlation_id)
  values (p_backup_kind, p_backup_ref, p_target_kind, p_target_label, p_status, p_started, p_finished, p_rto_seconds, p_rpo_seconds, p_tables, p_rows, coalesce(p_checks, '{}'),
          left(coalesce(p_operator, 'script'), 80), p_notes, p_correlation) returning id into v;
  if p_backup_kind = 'db_logical' and p_backup_ref ~ '^\d{4}-\d{2}-\d{2}$' then
    update public.db_backup_runs set verified_at = p_finished, verify_status = case when p_status = 'passed' then 'verified' else 'failed' end,
      verify_detail = jsonb_build_object('restore_test_id', v, 'target_kind', p_target_kind, 'rto_seconds', p_rto_seconds, 'tables', p_tables, 'rows', p_rows)
    where run_date = p_backup_ref::date;
  end if;
  insert into public.audit_events(actor_type, event, metadata, correlation_id) values ('system', 'ops.restore_test_recorded',
    jsonb_build_object('restore_test_id', v, 'backup_ref', p_backup_ref, 'target_kind', p_target_kind, 'status', p_status, 'rto_seconds', p_rto_seconds, 'rpo_seconds', p_rpo_seconds), p_correlation);
  perform public.emit_domain_event('ops.restore_test_recorded', null, jsonb_build_object('restore_test_id', v, 'status', p_status, 'target_kind', p_target_kind), null, 'system', 'restore_test', v::text, p_correlation, null);
  return v;
end $$;

-- ═══ 8. Health summary (service: /api/health with the ops bearer) and the admin read model (ops admins) ═══
create or replace function public.ops_health_summary() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'at', now(),
    'cron', public.ops_cron_freshness(),
    'queue', public.queue_health(),
    'backups', public.ops_backup_status(),
    'slo', public.ops_slo_status(),
    'alerts_open', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'rule', a.rule_key, 'severity', a.severity, 'status', a.status, 'value', a.value, 'threshold', a.threshold,
        'opened_at', a.opened_at, 'last_seen_at', a.last_seen_at, 'runbook', r.runbook_key) order by case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end, a.opened_at)
      from public.ops_alerts a join public.ops_alert_rules r on r.key = a.rule_key where a.status <> 'resolved'), '[]'),
    'incidents_open', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference, 'title', i.title, 'severity', i.severity, 'status', i.status, 'detected_at', i.detected_at, 'runbook', i.runbook_key) order by i.severity, i.detected_at)
      from public.ops_incidents i where i.status not in ('resolved','postmortem_done','cancelled')), '[]'),
    'synthetic_latest', coalesce((select jsonb_agg(jsonb_build_object('check', c.key, 'kind', c.kind, 'journey', c.journey, 'critical', c.critical, 'status', l.status, 'at', l.started_at, 'duration_ms', l.duration_ms) order by c.kind, c.key)
      from public.ops_synthetic_checks c left join lateral (select r.status, r.started_at, r.duration_ms from public.ops_synthetic_runs r where r.check_key = c.key order by r.started_at desc limit 1) l on true
      where c.active and c.key !~ '^test\.'), '[]'));
$$;

create or replace function public.admin_ops_observability() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.ops_can_read() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.ops_health_summary() || jsonb_build_object(
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'name', name, 'signal', signal, 'comparator', comparator, 'threshold', threshold, 'severity', severity,
        'cooldown_minutes', cooldown_minutes, 'runbook', runbook_key, 'auto_incident', auto_incident, 'card', card) order by key), '[]') from public.ops_alert_rules where active and key !~ '^test\.'),
    'runbooks', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'title', title, 'category', category, 'doc', doc_path || '#' || anchor, 'severity_default', severity_default) order by category, key), '[]') from public.ops_runbooks where active),
    'recent_alerts', (select coalesce(jsonb_agg(x order by (x ->> 'opened_at') desc), '[]') from (select jsonb_build_object('id', id, 'rule', rule_key, 'severity', severity, 'status', status, 'opened_at', opened_at, 'resolved_at', resolved_at, 'notified', notified_count) x
        from public.ops_alerts where rule_key !~ '^test\.' order by opened_at desc limit 50) s));
end $$;

create or replace function public.admin_ops_incident_detail(p_incident uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.ops_incidents;
begin
  if not public.ops_can_read() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into i from public.ops_incidents where id = p_incident;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return to_jsonb(i) || jsonb_build_object('actions', (select coalesce(jsonb_agg(jsonb_build_object('at', a.at, 'actor_type', a.actor_type, 'action', a.action, 'from', a.from_status, 'to', a.to_status,
      'note', a.note, 'runbook', a.runbook_key) order by a.at, a.id), '[]') from public.ops_incident_actions a where a.incident_id = p_incident),
    'runbook', (select jsonb_build_object('key', r.key, 'title', r.title, 'doc', r.doc_path || '#' || r.anchor) from public.ops_runbooks r where r.key = i.runbook_key));
end $$;

-- ═══ 9. Admin commands (settings permission + step-up + MFA + reason, via admin_require; audited) ═══
create or replace function public.ops_incident_transition_allowed(p_from text, p_to text) returns boolean
language sql immutable set search_path = '' as $$
  select (p_from, p_to) in (('detected','investigating'), ('detected','cancelled'), ('detected','contained'), ('investigating','contained'), ('investigating','recovering'),
    ('investigating','resolved'), ('contained','recovering'), ('contained','resolved'), ('recovering','resolved'), ('recovering','investigating'),
    ('resolved','postmortem_done'), ('resolved','investigating'));
$$;

create or replace function public.admin_ops_alert_ack(p_alert uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a public.ops_alerts;
begin
  perform public.admin_require('settings', p_reason);
  update public.ops_alerts set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = auth.uid() where id = p_alert and status = 'open' returning * into a;
  if not found then raise exception 'not_open' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata, correlation_id) values (auth.uid(), 'admin', 'ops.alert_acknowledged', jsonb_build_object('alert_id', p_alert, 'rule', a.rule_key, 'reason', left(p_reason, 300)), a.correlation_id);
  perform public.emit_domain_event('ops.alert_acknowledged', null, jsonb_build_object('alert_id', p_alert, 'rule', a.rule_key), auth.uid(), 'admin', 'ops_alert', p_alert::text, a.correlation_id, null);
  return jsonb_build_object('alert_id', p_alert, 'status', 'acknowledged');
end $$;

create or replace function public.admin_ops_incident_open(p_title text, p_severity text, p_summary text, p_runbook text default null, p_alert uuid default null, p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v uuid;
begin
  perform public.admin_require('settings', coalesce(p_reason, p_summary));
  if p_severity not in ('sev1','sev2','sev3','sev4') then raise exception 'invalid_severity' using errcode = '22023'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'title_required' using errcode = '22023'; end if;
  if p_runbook is not null and not exists (select 1 from public.ops_runbooks where key = p_runbook) then raise exception 'unknown_runbook' using errcode = '22023'; end if;
  if p_alert is not null and exists (select 1 from public.ops_alerts where id = p_alert and incident_id is not null) then raise exception 'alert_already_linked' using errcode = '22023'; end if;
  v := public.ops_open_incident_internal(p_title, p_severity, p_summary, p_runbook, 'manual', p_alert, auth.uid(), null);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'ops.incident_opened', jsonb_build_object('incident_id', v, 'severity', p_severity, 'runbook', p_runbook));
  return jsonb_build_object('incident_id', v, 'reference', (select reference from public.ops_incidents where id = v), 'status', 'detected');
end $$;

-- One command for the whole lifecycle: a note / containment / investigation / runbook step / recovery / postmortem entry, and
-- optionally a status or severity change, with an optimistic version check (stale_version on conflict).
create or replace function public.admin_ops_incident_update(p_incident uuid, p_action text, p_note text, p_to_status text default null, p_severity text default null,
  p_expected_version integer default null, p_runbook_step text default null, p_postmortem_url text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare i public.ops_incidents; n public.ops_incidents;
begin
  perform public.admin_require('settings', p_note);
  if p_action not in ('note','containment','investigation','runbook_step','recovery','notification','postmortem','status_changed','severity_changed','commander_assigned') then
    raise exception 'invalid_action' using errcode = '22023'; end if;
  select * into i from public.ops_incidents where id = p_incident for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_expected_version is not null and p_expected_version <> i.version then raise exception 'stale_version' using errcode = '40001'; end if;
  if p_to_status is not null and p_to_status <> i.status and not public.ops_incident_transition_allowed(i.status, p_to_status) then
    raise exception 'invalid_transition: % -> %', i.status, p_to_status using errcode = '22023'; end if;
  if p_to_status = 'postmortem_done' and coalesce(p_postmortem_url, i.postmortem_url) is null then raise exception 'postmortem_url_required' using errcode = '22023'; end if;
  if p_severity is not null and p_severity not in ('sev1','sev2','sev3','sev4') then raise exception 'invalid_severity' using errcode = '22023'; end if;
  update public.ops_incidents set
    status = coalesce(p_to_status, status), severity = coalesce(p_severity, severity),
    commander = case when p_action = 'commander_assigned' then auth.uid() else commander end,
    contained_at = case when p_to_status = 'contained' and contained_at is null then now() else contained_at end,
    resolved_at = case when p_to_status = 'resolved' then now() when p_to_status = 'investigating' then null else resolved_at end,
    postmortem_due_at = case when p_to_status = 'resolved' then now() + interval '5 days' else postmortem_due_at end,
    postmortem_done_at = case when p_to_status = 'postmortem_done' then now() else postmortem_done_at end,
    postmortem_url = coalesce(p_postmortem_url, postmortem_url),
    version = version + 1, updated_at = now()
  where id = p_incident returning * into n;
  insert into public.ops_incident_actions(incident_id, actor_id, actor_type, action, from_status, to_status, note, runbook_key, metadata)
  values (p_incident, auth.uid(), 'admin', case when p_to_status is not null and p_to_status <> i.status and p_action = 'note' then 'status_changed' else p_action end,
          i.status, n.status, left(p_note, 2000), case when p_action = 'runbook_step' then i.runbook_key end,
          jsonb_strip_nulls(jsonb_build_object('step', left(p_runbook_step, 200), 'severity_from', case when p_severity is not null and p_severity <> i.severity then i.severity end, 'severity_to', p_severity)));
  insert into public.audit_events(actor_id, actor_type, event, metadata, correlation_id) values (auth.uid(), 'admin', case when n.status = 'resolved' and i.status <> 'resolved' then 'ops.incident_resolved' else 'ops.incident_updated' end,
    jsonb_build_object('incident_id', p_incident, 'action', p_action, 'from', i.status, 'to', n.status, 'severity', n.severity), i.correlation_id);
  perform public.emit_domain_event(case when n.status = 'resolved' and i.status <> 'resolved' then 'ops.incident_resolved' else 'ops.incident_updated' end, null,
    jsonb_build_object('incident_id', p_incident, 'action', p_action, 'from', i.status, 'to', n.status, 'severity', n.severity), auth.uid(), 'admin', 'ops_incident', p_incident::text, i.correlation_id, null);
  return jsonb_build_object('incident_id', p_incident, 'status', n.status, 'severity', n.severity, 'version', n.version);
end $$;

-- ═══ 10. Seeds (data, idempotent) ═══
insert into public.ops_runbooks(key, title, category, anchor, severity_default, card, reviewed_at) values
  ('payments-outage', 'Payments outage (Stripe or checkout failing)', 'payments', 'payments-outage', 'sev1', '279.1', '2026-10-29'),
  ('stripe-webhook-backlog', 'Stripe webhook backlog or failures', 'payments', 'stripe-webhook-backlog', 'sev2', '279.1', '2026-10-29'),
  ('payment-reconciliation-drift', 'Payment reconciliation drift', 'payments', 'payment-reconciliation-drift', 'sev2', '279.1', '2026-10-29'),
  ('scanner-offline', 'Scanner offline at the door', 'ticketing', 'scanner-offline', 'sev1', '279.2', '2026-10-29'),
  ('ticketing-incident', 'Ticket issue, oversell or credential problem', 'ticketing', 'ticketing-incident', 'sev2', '279.2', '2026-10-29'),
  ('marketplace-degraded', 'Marketplace / booking degraded', 'marketplace', 'marketplace-degraded', 'sev2', '279.3', '2026-10-29'),
  ('ai-outage', 'Gala Agent / Azure OpenAI outage or runaway cost', 'agent', 'ai-outage', 'sev3', '279.4', '2026-10-29'),
  ('auth-outage', 'Sign-in / auth outage', 'security', 'auth-outage', 'sev1', '279.5', '2026-10-29'),
  ('security-incident', 'Security incident or credential compromise', 'security', 'security-incident', 'sev1', '279.5', '2026-10-29'),
  ('db-saturation', 'Database saturation (connections, CPU, slow queries)', 'platform', 'db-saturation', 'sev1', '279.6', '2026-10-29'),
  ('job-backlog', 'Job backlog, stuck jobs or dead letters', 'platform', 'job-backlog', 'sev3', '279.6', '2026-10-29'),
  ('cron-missed', 'Scheduled job missed or failing', 'platform', 'cron-missed', 'sev3', '279.6', '2026-10-29'),
  ('r2-outage', 'Cloudflare R2 outage (backups / replication)', 'integrations', 'r2-outage', 'sev3', '279.6', '2026-10-29'),
  ('clamav-down', 'Malware scanning gateway down', 'integrations', 'clamav-down', 'sev2', '279.6', '2026-10-29'),
  ('email-outage', 'Transactional email outage', 'integrations', 'email-outage', 'sev3', '279.6', '2026-10-29'),
  ('backup-failure', 'Backup failed or stale', 'data', 'backup-failure', 'sev2', '279.6', '2026-10-29'),
  ('restore', 'Restore from backup (scratch drill or real recovery)', 'data', 'restore', 'sev1', '279.6', '2026-10-29'),
  ('data-corruption', 'Data corruption by a bug', 'data', 'data-corruption', 'sev1', '279.6', '2026-10-29'),
  ('maintenance-status', 'Maintenance mode and status page', 'platform', 'maintenance-status', 'sev3', '279.6', '2026-10-29')
on conflict (key) do update set title = excluded.title, category = excluded.category, anchor = excluded.anchor, severity_default = excluded.severity_default, card = excluded.card,
  reviewed_at = excluded.reviewed_at, active = true, updated_at = now();

insert into public.ops_slo_definitions(key, journey, name, description, metric_key, objective, window_days, latency_threshold_ms, card) values
  ('checkout.completion', 'checkout', 'Checkout completes', 'Ticket orders that reach payment are issued; an order still pending 26 h after creation counts as stuck.', 'checkout.orders', 0.995, 28, null, '217.2'),
  ('marketplace.payments', 'booking', 'Marketplace payments settle', 'Marketplace payment orders reaching a settled state rather than failed (includes card declines).', 'payments.orders', 0.95, 28, null, '217.5'),
  ('booking.integrity', 'booking', 'Booking transitions are valid', 'Booking writes versus refused invalid booking state transitions (state_violations).', 'booking.integrity', 0.999, 28, null, '217.5'),
  ('ticket.scan_sync', 'scan', 'Door scans sync promptly', 'Scans recorded online, or offline scans synced within 5 minutes.', 'scan.sync_latency', 0.99, 28, 300000, '217.3'),
  ('signin.success', 'sign_in', 'Sign-in works', 'Synthetic login probe succeeds (Supabase Auth health + password sign-in of the probe identity).', 'signin.probe', 0.99, 28, null, '277.1'),
  ('webhooks.inbound', 'webhooks', 'Provider webhooks processed', 'Stripe/Resend webhooks processed or ignored; failed or unprocessed after 10 minutes counts as bad.', 'webhooks.inbound', 0.999, 28, 600000, '215.4'),
  ('webhooks.outbound', 'webhooks', 'Developer webhooks delivered', 'Outbound developer webhook deliveries delivered rather than dead-lettered.', 'webhooks.outbound', 0.99, 28, null, '215.4'),
  ('jobs.latency', 'jobs', 'Jobs start on time', 'Queued jobs start within 2 minutes of becoming due.', 'jobs.latency', 0.95, 28, 120000, '214.3'),
  ('jobs.success', 'jobs', 'Jobs succeed', 'Finished jobs succeed rather than dead-letter.', 'jobs.outcomes', 0.99, 28, null, '214.3'),
  ('messaging.email', 'messaging', 'Transactional email is sent', 'Emails sent; failed or still queued an hour after creation counts as bad (suppressions excluded).', 'email.delivery', 0.99, 28, 3600000, '217.6'),
  ('api.availability', 'api', 'Developer API answers', 'Developer API / MCP requests answered without a 5xx.', 'api.requests', 0.995, 28, null, '214.1'),
  ('agent.success', 'agent', 'Gala Agent runs complete', 'Agent runs reaching a terminal state complete (fully or partially) rather than fail.', 'agent.runs', 0.95, 28, null, '217.4'),
  ('platform.availability', 'availability', 'Platform available', '/api/health snapshots not down (one per minute while an uptime monitor polls).', 'availability.health', 0.999, 28, null, '217.1')
on conflict (key) do update set journey = excluded.journey, name = excluded.name, description = excluded.description, metric_key = excluded.metric_key, objective = excluded.objective,
  window_days = excluded.window_days, latency_threshold_ms = excluded.latency_threshold_ms, card = excluded.card, active = true, updated_at = now();

insert into public.ops_alert_rules(key, name, signal, comparator, threshold, severity, cooldown_minutes, runbook_key, auto_incident, card, description) values
  ('jobs.backlog', 'Job backlog', 'job_backlog', '>', 0, 'warning', 1440, 'job-backlog', false, '216.4', 'Jobs due more than 15 minutes ago and not started.'),
  ('jobs.stuck', 'Stuck jobs', 'jobs_stuck', '>', 0, 'warning', 360, 'job-backlog', false, '216.4', 'Running jobs whose lease expired (worker crash or timeout).'),
  ('jobs.dead_letter_growth', 'Dead letters growing', 'dead_letter_growth', '>', 0, 'warning', 360, 'job-backlog', false, '216.4', 'Jobs dead-lettered in the last hour.'),
  ('outbox.lag', 'Domain outbox lag', 'outbox_lag_seconds', '>', 900, 'warning', 360, 'job-backlog', false, '216.4', 'Oldest unpublished domain event is older than 15 minutes.'),
  ('webhooks.inbound_failure_rate', 'Webhook failure rate', 'webhook_inbound_failure_rate', '>', 5, 'critical', 120, 'stripe-webhook-backlog', true, '216.2', 'More than 5% of provider webhooks failed in the last hour (minimum 5 events).'),
  ('webhooks.inbound_stuck', 'Webhooks unprocessed', 'webhook_inbound_stuck', '>', 0, 'warning', 360, 'stripe-webhook-backlog', false, '216.2', 'Provider webhooks received but not processed after 10 minutes.'),
  ('webhooks.outbound_failure_rate', 'Developer webhook failures', 'webhook_outbound_failure_rate', '>', 20, 'warning', 360, 'marketplace-degraded', false, '216.6', 'More than 20% of developer webhook attempts failed in the last hour.'),
  ('payments.reconciliation_drift', 'Payment reconciliation drift', 'reconciliation_variances', '>', 0, 'critical', 720, 'payment-reconciliation-drift', true, '216.2', 'The latest Stripe reconciliation found critical variances.'),
  ('payments.reconciliation_stale', 'Reconciliation not running', 'reconciliation_stale_hours', '>', 30, 'warning', 1440, 'payment-reconciliation-drift', false, '216.2', 'No successful payment reconciliation in the last 30 hours.'),
  ('cron.missed_runs', 'Scheduled job missed', 'cron_missed_runs', '>', 0, 'warning', 360, 'cron-missed', false, '216.4', 'An active pg_cron job has not run for 3x its interval (+5 min).'),
  ('cron.failures', 'Scheduled job failures', 'cron_failures_1h', '>', 5, 'warning', 360, 'cron-missed', false, '216.4', 'More than 5 failed pg_cron runs in the last hour.'),
  ('backups.db_stale', 'Database backup stale', 'db_backup_stale_hours', '>', 26, 'critical', 720, 'backup-failure', false, '219.5', 'No complete nightly R2 database backup in 26 hours.'),
  ('backups.db_failed', 'Database backup failed', 'db_backup_failed', '>', 0, 'critical', 720, 'backup-failure', false, '219.5', 'A nightly database backup failed or did not finish by 04:00 UTC.'),
  ('backups.storage_lag', 'Storage replication lagging', 'storage_backup_lag', '>', 0, 'warning', 720, 'r2-outage', false, '219.2', 'Stored files changed over an hour ago are not yet replicated to R2.'),
  ('email.backlog', 'Email backlog', 'email_backlog', '>', 0, 'warning', 1440, 'email-outage', false, '216.6', 'Transactional emails queued for more than 30 minutes.'),
  ('health.down', 'Platform health down', 'health_down', '>', 0, 'critical', 60, 'db-saturation', true, '216.1', '/api/health reported the database unreachable in the last 10 minutes.'),
  ('slo.burn', 'SLO burning fast', 'slo_burn', '>', 0, 'critical', 360, 'job-backlog', false, '217', 'An SLO is burning its error budget fast right now (1 h and 5 min burn rate both at or above the fast threshold). Exhausted budgets show on the dashboard.'),
  ('state.violations', 'Invalid state transitions', 'state_violations_1h', '>', 0, 'warning', 360, 'data-corruption', false, '216.1', 'Refused invalid state transitions in the last hour.'),
  ('synthetic.failures', 'Synthetic probe failing', 'synthetic_failures_1h', '>', 0, 'critical', 120, 'payments-outage', false, '277', 'A critical synthetic probe failed in the last hour.')
on conflict (key) do update set name = excluded.name, signal = excluded.signal, comparator = excluded.comparator, threshold = excluded.threshold, severity = excluded.severity,
  cooldown_minutes = excluded.cooldown_minutes, runbook_key = excluded.runbook_key, auto_incident = excluded.auto_incident, card = excluded.card, description = excluded.description,
  active = true, updated_at = now();

insert into public.ops_synthetic_checks(key, kind, journey, name, description, critical, interval_minutes, card) values
  ('probe.health', 'probe', 'availability', 'Public health endpoint', 'GET /api/health returns ok without leaking configuration.', true, 5, '277'),
  ('probe.login', 'probe', 'sign_in', 'Login probe', 'Supabase Auth health, then password sign-in and sign-out of the probe identity.', true, 15, '277.1'),
  ('probe.checkout', 'probe', 'checkout', 'Checkout probe', 'Public event readiness RPC answers; checkout session endpoint refuses an unauthenticated caller (no charge is created).', true, 15, '277.2'),
  ('probe.ticket', 'probe', 'scan', 'Ticket probe', 'Ticket credential signs and verifies; a forged credential is rejected.', true, 15, '277.3'),
  ('probe.booking', 'probe', 'booking', 'Booking probe', 'Public marketplace discovery answers for a signed-out visitor.', false, 15, '277.4'),
  ('probe.agent', 'probe', 'agent', 'Agent probe', 'Tool registry matches the database catalogue and the Azure model contract is configured (no model call).', false, 60, '277.5'),
  ('probe.webhook', 'probe', 'webhooks', 'Webhook probe', 'Stripe webhook endpoint rejects an unsigned payload; developer webhook signatures verify.', true, 15, '277.6'),
  ('probe.queue', 'probe', 'jobs', 'Queue probe', 'A no-op job is enqueued, claimed and completed by the in-database worker.', true, 15, '278.2'),
  ('probe.backup', 'probe', 'backups', 'Backup freshness probe', 'Nightly R2 database backup completed within 26 hours.', true, 60, '219.5'),
  ('drill.payment', 'drill', 'checkout', 'Payment drill', 'Forged and replayed Stripe webhooks are refused / deduplicated; webhook failure-rate alert fires and resolves.', false, null, '278.1'),
  ('drill.queue', 'drill', 'jobs', 'Queue drill', 'A failing handler backs off, dead-letters, raises the dead-letter alert and is replayed.', false, null, '278.2'),
  ('drill.storage', 'drill', 'backups', 'Storage drill', 'R2 / scanner unconfigured is reported as not configured / BLOCKED_EXTERNAL, never healthy.', false, null, '278.3'),
  ('drill.auth', 'drill', 'sign_in', 'Auth drill', 'Wrong password, forged JWT and missing ops bearer are refused; health stays minimal.', false, null, '278.4'),
  ('drill.database', 'drill', 'availability', 'Database drill', 'Statement timeout and lock contention fail fast with an explicit error, not a hang.', false, null, '278.5'),
  ('drill.ai', 'drill', 'agent', 'AI drill', 'Missing Azure configuration is reported unavailable; no model call is attempted.', false, null, '278.6')
on conflict (key) do update set kind = excluded.kind, journey = excluded.journey, name = excluded.name, description = excluded.description, critical = excluded.critical,
  interval_minutes = excluded.interval_minutes, card = excluded.card, active = true, updated_at = now();

-- Probe job kind: proves enqueue → claim → handler → complete end to end without side effects.
create or replace function public.job_ops_probe_noop(p_job public.job_queue) returns jsonb
language sql volatile security definer set search_path = '' as $$ select jsonb_build_object('ok', true, 'probe', p_job.payload ->> 'probe'); $$;

insert into public.job_kinds(kind, runtime, handler, max_attempts, backoff_seconds, lease_seconds, description) values
  ('ops.observe', 'db', 'public.job_ops_observe', 3, '{30,120,600}', 120, 'Q34: every 5 min — metric rollups (last 2 h), alert evaluation (admin in-app notifications only), retention purge'),
  ('ops.probe_noop', 'db', 'public.job_ops_probe_noop', 1, '{10}', 60, 'Q34: synthetic queue probe (no side effects)')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, backoff_seconds = excluded.backoff_seconds,
  lease_seconds = excluded.lease_seconds, description = excluded.description, updated_at = now();

select cron.unschedule('ops-observe') where exists (select 1 from cron.job where jobname = 'ops-observe');
select cron.schedule('ops-observe', '*/5 * * * *',
  $$select public.enqueue_job(p_kind => 'ops.observe', p_payload => '{}'::jsonb, p_dedupe_key => 'ops.observe:' || to_char(date_bin('5 minutes', now(), timestamptz '2000-01-01'), 'YYYYMMDDHH24MI'))$$);

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('ops.alert_fired', 1, 'ops_alert', 'An operational alert opened (payload: alert_id, rule, severity, value).', null),
  ('ops.alert_resolved', 1, 'ops_alert', 'An operational alert cleared (payload: alert_id, rule).', null),
  ('ops.alert_acknowledged', 1, 'ops_alert', 'An operator acknowledged an alert (payload: alert_id, rule).', null),
  ('ops.incident_opened', 1, 'ops_incident', 'An incident was detected or declared (payload: incident_id, reference, severity, source).', null),
  ('ops.incident_updated', 1, 'ops_incident', 'An incident timeline entry or status/severity change (payload: incident_id, action, from, to, severity).', null),
  ('ops.incident_resolved', 1, 'ops_incident', 'An incident was resolved (payload: incident_id, action, from, to, severity).', null),
  ('ops.restore_test_recorded', 1, 'restore_test', 'A restore drill was recorded (payload: restore_test_id, status, target_kind).', null),
  ('ops.synthetic_failed', 1, 'synthetic_check', 'A critical synthetic probe failed (payload: run_id, check, journey).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate, active = true, updated_at = now();

-- ═══ 11. Grants (Q01): nothing anon-callable. Workers/recorders are service-only; admin_* check ops/settings permission inside. ═══
revoke all on function public.ops_cron_expected_minutes(text), public.ops_slo_calc(numeric, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, numeric, numeric, integer),
  public.ops_incident_transition_allowed(text, text) from public, anon;
grant execute on function public.ops_cron_expected_minutes(text), public.ops_slo_calc(numeric, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, numeric, numeric, integer),
  public.ops_incident_transition_allowed(text, text) to authenticated, service_role;
revoke all on function public.ops_collect_metrics(timestamptz, timestamptz), public.ops_slo_status(), public.ops_cron_freshness(), public.ops_backup_status(),
  public.ops_alert_signal(text), public.ops_alert_recipients(public.ops_alert_rules), public.ops_open_incident_internal(text, text, text, text, text, uuid, uuid, text),
  public.ops_evaluate_alerts(text[], jsonb, boolean), public.job_ops_observe(public.job_queue), public.job_ops_probe_noop(public.job_queue),
  public.ops_record_synthetic_run(text, text, integer, jsonb, text, text, text),
  public.ops_record_restore_test(text, text, text, text, text, timestamptz, timestamptz, integer, integer, integer, bigint, jsonb, text, text, text),
  public.ops_health_summary() from public, anon, authenticated;
grant execute on function public.ops_collect_metrics(timestamptz, timestamptz), public.ops_slo_status(), public.ops_cron_freshness(), public.ops_backup_status(),
  public.ops_alert_signal(text), public.ops_alert_recipients(public.ops_alert_rules), public.ops_open_incident_internal(text, text, text, text, text, uuid, uuid, text),
  public.ops_evaluate_alerts(text[], jsonb, boolean), public.job_ops_observe(public.job_queue), public.job_ops_probe_noop(public.job_queue),
  public.ops_record_synthetic_run(text, text, integer, jsonb, text, text, text),
  public.ops_record_restore_test(text, text, text, text, text, timestamptz, timestamptz, integer, integer, integer, bigint, jsonb, text, text, text),
  public.ops_health_summary() to service_role;
revoke all on function public.admin_ops_observability(), public.admin_ops_incident_detail(uuid), public.admin_ops_alert_ack(uuid, text),
  public.admin_ops_incident_open(text, text, text, text, uuid, text), public.admin_ops_incident_update(uuid, text, text, text, text, integer, text, text) from public, anon;
grant execute on function public.admin_ops_observability(), public.admin_ops_incident_detail(uuid), public.admin_ops_alert_ack(uuid, text),
  public.admin_ops_incident_open(text, text, text, text, uuid, text), public.admin_ops_incident_update(uuid, text, text, text, text, integer, text, text) to authenticated, service_role;
