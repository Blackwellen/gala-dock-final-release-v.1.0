-- Q03 (lane A): one canonical workflow / state / queue foundation on Postgres + the existing cron workers (backend spec
-- §4.3 transactional outbox, §4.4 jobs, §4.5 correlation IDs, §17 state machines, §18 event catalogue; domains 26–31,
-- 257–259). No new infrastructure. Additive and idempotent; existing per-domain queues (email_outbox, webhook_deliveries,
-- launch_queue, agent runtime leases, webhook_events) keep working and migrate onto this in later packets.
--
--   domain_event_types   versioned event catalogue (generated from src/lib/foundation/event-catalogue.ts)
--   domain_outbox        events written in the SAME transaction as the domain change (emit_domain_event, audit capture)
--   event_subscriptions  consumer → job kind routing (the event bus)
--   job_kinds / job_queue  durable jobs: leases, attempts, exponential backoff, priorities, delayed runs (scheduler)
--   dead_letter_jobs     view of jobs that exhausted their attempts (retry_dead_job replays them)
--   consumer_inbox       (consumer, event_id) dedupe so a replayed event never repeats a side effect
--   idempotency_keys     command idempotency registry (scope, key, request hash, stored response, expiry)
--   transition_state()   generic compare-and-set state command over state_machines + outbox event
--   advisory_xact_lock() transaction-scoped advisory locks for SQL commands
-- Workers: pg_cron runs run_db_jobs() in-database every minute (DB handlers are exactly-once: claim, inbox, side effect
-- and completion commit together); /api/cron/jobs runs app (TypeScript) handlers at-least-once with inbox dedupe.
-- Proof flow: event-driven Gala Agent routine wake now runs audit → outbox → subscription → job → handler.
-- All objects are service-only (RLS on, no client grants).

-- ═══ 1. Tables ═══
create table if not exists public.domain_event_types (
  event_type text primary key check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  schema_version integer not null default 1 check (schema_version >= 1),
  aggregate text not null,
  description text not null default '',
  public_type text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.domain_outbox (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  schema_version integer not null default 1,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid,
  actor_type text not null default 'system' check (actor_type in ('user','agent','system','webhook','admin')),
  aggregate_type text,
  aggregate_id text,
  correlation_id text,
  causation_id text,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  emitted_at timestamptz not null default now(),
  published_at timestamptz,
  publish_attempts integer not null default 0,
  last_error text
);
create index if not exists domain_outbox_unpublished_idx on public.domain_outbox(seq) where published_at is null;
create index if not exists domain_outbox_ws_idx on public.domain_outbox(workspace_id, emitted_at desc);
create index if not exists domain_outbox_causation_idx on public.domain_outbox(causation_id) where causation_id is not null;

create table if not exists public.job_kinds (
  kind text primary key check (kind ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  runtime text not null check (runtime in ('db','app')),
  handler text check (handler is null or handler ~ '^public\.[a-z_][a-z0-9_]*$'),   -- db runtime: function(public.job_queue) returns jsonb
  max_attempts integer not null default 5 check (max_attempts between 1 and 50),
  backoff_seconds integer[] not null default '{10,60,300,1800,7200}',
  lease_seconds integer not null default 120 check (lease_seconds between 1 and 3600),
  description text not null default '',
  updated_at timestamptz not null default now(),
  check (runtime <> 'db' or handler is not null)
);

create table if not exists public.event_subscriptions (
  consumer text primary key check (consumer ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  event_types text[] not null,                       -- '*' matches every event
  job_kind text not null references public.job_kinds(kind),
  skip_actor_types text[] not null default '{}',
  predicate text check (predicate is null or predicate ~ '^public\.[a-z_][a-z0-9_]*$'),   -- function(public.domain_outbox) returns boolean
  active boolean not null default true,
  description text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.job_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null references public.job_kinds(kind),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued','running','failed','succeeded','dead','cancelled')),   -- failed = waiting to retry
  priority integer not null default 100,
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 50),
  dedupe_key text unique,
  consumer text,
  event_id uuid references public.domain_outbox(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  correlation_id text,
  locked_by text,
  lease_until timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists job_queue_due_idx on public.job_queue(priority, run_after) where status in ('queued','failed');
create index if not exists job_queue_lease_idx on public.job_queue(lease_until) where status = 'running';
create index if not exists job_queue_kind_idx on public.job_queue(kind, status, created_at desc);
create index if not exists job_queue_event_idx on public.job_queue(event_id) where event_id is not null;

create table if not exists public.consumer_inbox (
  consumer text not null,
  event_id uuid not null,
  job_id uuid,
  processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);

create table if not exists public.idempotency_keys (
  scope text not null check (length(scope) between 1 and 120),
  key text not null check (length(key) between 1 and 200),
  request_hash text not null,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  response jsonb,
  response_status integer,
  workspace_id uuid,
  actor_id uuid,
  locked_until timestamptz not null default now() + interval '1 minute',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (scope, key)
);
create index if not exists idempotency_keys_expiry_idx on public.idempotency_keys(expires_at);

create or replace view public.dead_letter_jobs with (security_invoker = true) as
  select j.id, j.kind, j.consumer, j.event_id, j.workspace_id, j.correlation_id, j.attempts, j.max_attempts, j.last_error, j.payload, j.created_at, j.finished_at
  from public.job_queue j where j.status = 'dead';

do $$ declare t text; begin
  foreach t in array array['domain_event_types','domain_outbox','job_kinds','event_subscriptions','job_queue','consumer_inbox','idempotency_keys'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on public.dead_letter_jobs from anon, authenticated;

-- ═══ 2. Clock, locks and correlation helpers ═══
-- Database time for workers and tests (never compare app-server clocks with lease/next-run timestamps).
create or replace function public.db_now() returns timestamptz language sql volatile security definer set search_path = '' as $$ select clock_timestamp(); $$;

-- Transaction-scoped advisory locks for SQL commands (released at commit/rollback; safe with pooled connections).
create or replace function public.advisory_xact_lock(p_scope text, p_key text) returns void language sql volatile security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_scope || ':' || p_key, 0));
$$;
create or replace function public.try_advisory_xact_lock(p_scope text, p_key text) returns boolean language sql volatile security definer set search_path = '' as $$
  select pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_scope || ':' || p_key, 0));
$$;

-- ═══ 3. Outbox ═══
create or replace function public.emit_domain_event(p_type text, p_workspace uuid, p_payload jsonb default '{}', p_actor uuid default null,
  p_actor_type text default 'system', p_aggregate_type text default null, p_aggregate_id text default null, p_correlation text default null, p_causation text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare eid uuid; ver integer; agg text;
begin
  select t.schema_version, t.aggregate into ver, agg from public.domain_event_types t where t.event_type = p_type;
  insert into public.domain_outbox(event_type, schema_version, workspace_id, actor_id, actor_type, aggregate_type, aggregate_id, correlation_id, causation_id, payload)
  values (p_type, coalesce(ver, 1), p_workspace, p_actor, coalesce(p_actor_type, 'system'), coalesce(p_aggregate_type, agg), p_aggregate_id,
    coalesce(p_correlation, gen_random_uuid()::text), p_causation, coalesce(p_payload, '{}'))
  returning id into eid;
  return eid;
end $$;

-- An enabled event-driven Gala Agent routine listens for this event in this workspace.
create or replace function public.outbox_has_routine_listener(o public.domain_outbox) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agent_routines r where r.workspace_id = o.workspace_id and r.enabled and r.trigger ->> 'type' = 'event' and r.trigger ->> 'event' = o.event_type);
$$;

-- Captures workspace audit events into the outbox in the same transaction (catalogued types, or types a routine listens for).
-- Deliberately NOT exception-swallowing: if the outbox write fails, the audited change rolls back with it.
create or replace function public.trg_audit_outbox() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is null then return new; end if;
  if not exists (select 1 from public.domain_event_types t where t.event_type = new.event and t.active)
     and not exists (select 1 from public.agent_routines r where r.workspace_id = new.workspace_id and r.enabled and r.trigger ->> 'type' = 'event' and r.trigger ->> 'event' = new.event) then
    return new;
  end if;
  perform public.emit_domain_event(new.event, new.workspace_id, coalesce(new.metadata, '{}') - array['ip','user_agent','email','token','secret','note'],
    new.actor_id, coalesce(new.actor_type, 'user'), null, null, new.correlation_id, 'audit:' || new.id);
  return new;
end $$;
drop trigger if exists gd_audit_outbox on public.audit_events;
create trigger gd_audit_outbox after insert on public.audit_events for each row execute function public.trg_audit_outbox();

-- ═══ 4. Job queue ═══
create or replace function public.enqueue_job(p_kind text, p_payload jsonb default '{}', p_dedupe_key text default null, p_run_after timestamptz default null,
  p_workspace uuid default null, p_correlation text default null, p_priority integer default 100, p_event uuid default null, p_consumer text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare k public.job_kinds; jid uuid;
begin
  select * into k from public.job_kinds where kind = p_kind;
  if not found then raise exception 'unknown_job_kind: %', p_kind using errcode = '22023'; end if;
  insert into public.job_queue(kind, payload, dedupe_key, run_after, workspace_id, correlation_id, priority, max_attempts, event_id, consumer)
  values (p_kind, coalesce(p_payload, '{}'), p_dedupe_key, coalesce(p_run_after, now()), p_workspace, p_correlation, coalesce(p_priority, 100), k.max_attempts, p_event, p_consumer)
  on conflict (dedupe_key) do nothing
  returning id into jid;
  if jid is null then select id into jid from public.job_queue where dedupe_key = p_dedupe_key; end if;   -- replay of the same command/event
  return jid;
end $$;

-- Leases due jobs of one runtime. Expired leases are reclaimed (crash/resume); a reclaimed job that already used its last
-- attempt goes to the dead-letter state instead of running again.
create or replace function public.claim_jobs(p_worker text, p_runtime text, p_limit integer default 10, p_kinds text[] default null, p_lease_seconds integer default null)
returns setof public.job_queue language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.job_queue j set status = 'dead', finished_at = now(), lease_until = null, updated_at = now(),
    last_error = coalesce(j.last_error, '') || case when coalesce(j.last_error, '') = '' then '' else ' | ' end || 'lease expired on the final attempt'
  where j.status = 'running' and j.lease_until < now() and j.attempts >= j.max_attempts;
  return query
  update public.job_queue j set status = 'running', attempts = j.attempts + 1, locked_by = p_worker, started_at = now(), updated_at = now(),
    lease_until = now() + make_interval(secs => coalesce(p_lease_seconds, k.lease_seconds))
  from public.job_kinds k
  where k.kind = j.kind and j.id in (
    select x.id from public.job_queue x join public.job_kinds xk on xk.kind = x.kind
    where xk.runtime = p_runtime and (p_kinds is null or x.kind = any(p_kinds))
      and ((x.status in ('queued','failed') and x.run_after <= now()) or (x.status = 'running' and x.lease_until < now()))
    order by x.priority, x.run_after
    limit greatest(1, least(coalesce(p_limit, 10), 200))
    for update of x skip locked)
  returning j.*;
end $$;

-- Completes a leased job. False when the lease was lost (another worker reclaimed it): the caller's result is discarded.
create or replace function public.complete_job(p_job uuid, p_worker text, p_result jsonb default null) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare j public.job_queue;
begin
  update public.job_queue set status = 'succeeded', result = p_result, finished_at = now(), lease_until = null, updated_at = now()
  where id = p_job and status = 'running' and locked_by = p_worker returning * into j;
  if not found then return false; end if;
  if j.consumer is not null and j.event_id is not null then
    insert into public.consumer_inbox(consumer, event_id, job_id) values (j.consumer, j.event_id, j.id) on conflict do nothing;
  end if;
  return true;
end $$;

-- Records a failure: exponential backoff from job_kinds.backoff_seconds, dead-letter after max_attempts. Returns the new status.
create or replace function public.fail_job(p_job uuid, p_worker text, p_error text, p_retry boolean default true) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare j public.job_queue; k public.job_kinds; nxt text;
begin
  select * into j from public.job_queue where id = p_job and status = 'running' and locked_by = p_worker for update;
  if not found then return null; end if;
  select * into k from public.job_kinds where kind = j.kind;
  nxt := case when not p_retry or j.attempts >= j.max_attempts then 'dead' else 'failed' end;
  update public.job_queue set status = nxt, last_error = left(p_error, 2000), lease_until = null, updated_at = now(),
    finished_at = case when nxt = 'dead' then now() end,
    run_after = case when nxt = 'failed' then now() + make_interval(secs => k.backoff_seconds[least(j.attempts, coalesce(array_length(k.backoff_seconds, 1), 1))]) else run_after end
  where id = p_job;
  return nxt;
end $$;

-- Operator replay of a dead-lettered job (fresh attempt budget; the error history stays in last_error).
create or replace function public.retry_dead_job(p_job uuid, p_reason text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare j public.job_queue;
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.job_queue set status = 'queued', attempts = 0, run_after = now(), finished_at = null, locked_by = null, updated_at = now(),
    last_error = left(coalesce(last_error, '') || ' | replayed: ' || p_reason, 2000)
  where id = p_job and status in ('dead','cancelled') returning * into j;
  if not found then return false; end if;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', j.workspace_id, 'job.replayed', jsonb_build_object('job_id', j.id, 'kind', j.kind, 'reason', p_reason));
  return true;
end $$;

-- ═══ 5. Event bus: outbox → subscriptions → jobs ═══
create or replace function public.publish_domain_outbox(p_limit integer default 200) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare o public.domain_outbox; s public.event_subscriptions; ok boolean; n integer := 0;
begin
  for o in select * from public.domain_outbox where published_at is null order by seq limit greatest(1, least(coalesce(p_limit, 200), 1000)) for update skip locked loop
    begin
      for s in select * from public.event_subscriptions where active and ('*' = any(event_types) or o.event_type = any(event_types)) loop
        if o.actor_type = any(s.skip_actor_types) then continue; end if;
        ok := true;
        if s.predicate is not null then execute format('select %s($1)', s.predicate) into ok using o; end if;
        if coalesce(ok, false) then
          perform public.enqueue_job(s.job_kind, jsonb_build_object('event', to_jsonb(o) - array['published_at','publish_attempts','last_error']),
            s.consumer || ':' || o.id, null, o.workspace_id, o.correlation_id, 100, o.id, s.consumer);
        end if;
      end loop;
      update public.domain_outbox set published_at = now(), publish_attempts = publish_attempts + 1, last_error = null where id = o.id;
      n := n + 1;
    exception when others then
      update public.domain_outbox set publish_attempts = publish_attempts + 1, last_error = left(sqlerrm, 1000) where id = o.id;
    end;
  end loop;
  return n;
end $$;

-- In-database worker: publishes the outbox, then runs due 'db' jobs. Each job's inbox row, side effects and completion
-- commit together (exactly-once); a failing handler is rolled back to its savepoint and retried with backoff.
create or replace function public.run_db_jobs(p_limit integer default 50, p_kinds text[] default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare j public.job_queue; k public.job_kinds; res jsonb; worker text := 'pg:' || pg_backend_pid() || ':' || gen_random_uuid();
  published integer; done integer := 0; dup integer := 0; bad integer := 0; seen integer;
begin
  published := public.publish_domain_outbox(500);
  for j in select * from public.claim_jobs(worker, 'db', p_limit, p_kinds, null) loop
    begin
      if j.consumer is not null and j.event_id is not null then
        insert into public.consumer_inbox(consumer, event_id, job_id) values (j.consumer, j.event_id, j.id) on conflict do nothing;
        get diagnostics seen = row_count;
        if seen = 0 then
          update public.job_queue set status = 'succeeded', result = jsonb_build_object('duplicate', true), finished_at = now(), lease_until = null, updated_at = now() where id = j.id;
          dup := dup + 1; continue;
        end if;
      end if;
      select * into k from public.job_kinds where kind = j.kind;
      execute format('select %s($1)', k.handler) into res using j;
      update public.job_queue set status = 'succeeded', result = res, finished_at = now(), lease_until = null, updated_at = now() where id = j.id and locked_by = worker;
      done := done + 1;
    exception when others then
      perform public.fail_job(j.id, worker, sqlerrm);
      bad := bad + 1;
    end;
  end loop;
  return jsonb_build_object('published', published, 'succeeded', done, 'duplicates', dup, 'failed', bad);
end $$;

-- ═══ 6. Proof consumer: event-driven Gala Agent routine wake (replaces the synchronous gd_audit_routines trigger) ═══
-- Same rules as 202610270012: matching enabled routine, not the agent's own actions (subscription skip_actor_types),
-- at most once per 5 minutes per routine, only when it is not already due. The event id travels into last_event.
create or replace function public.job_agent_routine_wake(p_job public.job_queue) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare ev jsonb := p_job.payload -> 'event'; n integer;
begin
  if ev is null or (ev ->> 'workspace_id') is null then return jsonb_build_object('woken', 0, 'skipped', 'no_workspace'); end if;
  update public.agent_routines r set next_run_at = now(),
    last_event = jsonb_build_object('event', ev ->> 'event_type', 'event_id', ev ->> 'id', 'at', ev ->> 'emitted_at', 'correlation_id', ev ->> 'correlation_id', 'data', coalesce(ev -> 'payload', '{}'))
  where r.workspace_id = (ev ->> 'workspace_id')::uuid and r.enabled and r.trigger ->> 'type' = 'event' and r.trigger ->> 'event' = ev ->> 'event_type'
    and (r.last_run_at is null or r.last_run_at < now() - interval '5 minutes') and r.next_run_at > now();
  get diagnostics n = row_count;
  return jsonb_build_object('woken', n);
end $$;
drop trigger if exists gd_audit_routines on public.audit_events;

insert into public.job_kinds(kind, runtime, handler, max_attempts, backoff_seconds, lease_seconds, description) values
  ('agent.routine_wake', 'db', 'public.job_agent_routine_wake', 5, '{10,60,300,1800,7200}', 60, 'Wake event-driven Gala Agent routines for a domain event.'),
  ('system.canary', 'app', null, 3, '{1,5,30}', 60, 'Health canary for the app job worker; fails on demand to exercise retry and dead-letter paths.')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, backoff_seconds = excluded.backoff_seconds,
  lease_seconds = excluded.lease_seconds, description = excluded.description, updated_at = now();
insert into public.event_subscriptions(consumer, event_types, job_kind, skip_actor_types, predicate, description) values
  ('agent.routine_wake', array['*'], 'agent.routine_wake', array['agent'], 'public.outbox_has_routine_listener', 'Event-driven Gala Agent routines (never on the agent''s own actions).')
on conflict (consumer) do update set event_types = excluded.event_types, job_kind = excluded.job_kind, skip_actor_types = excluded.skip_actor_types,
  predicate = excluded.predicate, description = excluded.description, active = true, updated_at = now();

-- ═══ 7. Idempotency registry ═══
-- begin: 'started' (caller runs the command), 'replay' (stored response returned), 'in_progress' (same key running now),
-- 'mismatch' (same key, different request). A stale in-progress claim (crashed caller) can be re-taken.
create or replace function public.idempotency_begin(p_scope text, p_key text, p_hash text, p_ttl_seconds integer default 86400, p_lock_seconds integer default 60,
  p_workspace uuid default null, p_actor uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.idempotency_keys;
begin
  delete from public.idempotency_keys where scope = p_scope and key = p_key and expires_at <= now();
  insert into public.idempotency_keys(scope, key, request_hash, workspace_id, actor_id, locked_until, expires_at)
  values (p_scope, p_key, p_hash, p_workspace, p_actor, now() + make_interval(secs => greatest(1, p_lock_seconds)), now() + make_interval(secs => greatest(60, p_ttl_seconds)))
  on conflict (scope, key) do nothing returning * into r;
  if found then return jsonb_build_object('state', 'started'); end if;
  select * into r from public.idempotency_keys where scope = p_scope and key = p_key for update;
  if r.request_hash <> p_hash then return jsonb_build_object('state', 'mismatch'); end if;
  if r.status = 'completed' then return jsonb_build_object('state', 'replay', 'response', r.response, 'status', r.response_status); end if;
  if r.locked_until > now() then return jsonb_build_object('state', 'in_progress'); end if;
  update public.idempotency_keys set locked_until = now() + make_interval(secs => greatest(1, p_lock_seconds)) where scope = p_scope and key = p_key;
  return jsonb_build_object('state', 'started', 'retaken', true);
end $$;

-- finish: success stores the response for replay; failure releases the key so the caller may retry.
create or replace function public.idempotency_finish(p_scope text, p_key text, p_hash text, p_success boolean, p_response jsonb default null, p_status integer default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_success then
    update public.idempotency_keys set status = 'completed', response = p_response, response_status = p_status, completed_at = now()
    where scope = p_scope and key = p_key and request_hash = p_hash and status = 'in_progress';
  else
    delete from public.idempotency_keys where scope = p_scope and key = p_key and request_hash = p_hash and status = 'in_progress';
  end if;
end $$;

-- ═══ 8. State machines: explicit compare-and-set transition command ═══
create or replace function public.state_transition_allowed(p_machine text, p_from text, p_to text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_from = p_to or exists (select 1 from public.state_transitions t where t.machine = p_machine and t.from_state = p_from and t.to_state = p_to);
$$;

-- Strict for every machine (audit-mode machines only tolerate legacy direct updates). The row is locked, the expected
-- current state is checked (optimistic concurrency), the update runs through the table's state guard and the
-- '<machine>.state_changed' event is written to the outbox in the same transaction.
create or replace function public.transition_state(p_machine text, p_id uuid, p_to text, p_expected text default null, p_actor uuid default null,
  p_actor_type text default 'system', p_reason text default null, p_correlation text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare m public.state_machines; r jsonb; cur text; eid uuid;
begin
  select * into m from public.state_machines where machine = p_machine;
  if not found then raise exception 'unknown_machine: %', p_machine using errcode = '22023'; end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', m.table_name) into r using p_id;
  if r is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  cur := r ->> m.column_name;
  if p_expected is not null and cur is distinct from p_expected then
    return jsonb_build_object('ok', false, 'conflict', true, 'current', cur);
  end if;
  if cur = p_to then return jsonb_build_object('ok', true, 'changed', false, 'state', cur); end if;
  if not public.state_transition_allowed(p_machine, cur, p_to) then
    raise exception 'illegal % transition % -> %', p_machine, coalesce(cur, '(none)'), p_to using errcode = '22023';
  end if;
  execute format('update public.%I set %I = $1 where id = $2', m.table_name, m.column_name) using p_to, p_id;
  eid := public.emit_domain_event(p_machine || '.state_changed', nullif(r ->> 'workspace_id', '')::uuid,
    jsonb_build_object('id', p_id, 'from', cur, 'to', p_to, 'reason', p_reason), p_actor, p_actor_type, p_machine, p_id::text, p_correlation, null);
  return jsonb_build_object('ok', true, 'changed', true, 'from', cur, 'to', p_to, 'event_id', eid);
end $$;

-- ═══ 9. Retention ═══
create or replace function public.purge_foundation_history() returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a integer; b integer; c integer; d integer;
begin
  delete from public.job_queue where status in ('succeeded','cancelled') and finished_at < now() - interval '14 days'; get diagnostics a = row_count;
  delete from public.domain_outbox where published_at < now() - interval '30 days' and not exists (select 1 from public.job_queue j where j.event_id = domain_outbox.id and j.status in ('queued','running','failed','dead')); get diagnostics b = row_count;
  delete from public.consumer_inbox where processed_at < now() - interval '35 days'; get diagnostics c = row_count;
  delete from public.idempotency_keys where expires_at < now(); get diagnostics d = row_count;
  return jsonb_build_object('jobs', a, 'outbox', b, 'inbox', c, 'idempotency', d);
end $$;

-- ═══ 10. Grants: service role only ═══
revoke all on function public.db_now(), public.advisory_xact_lock(text, text), public.try_advisory_xact_lock(text, text),
  public.emit_domain_event(text, uuid, jsonb, uuid, text, text, text, text, text), public.outbox_has_routine_listener(public.domain_outbox), public.trg_audit_outbox(),
  public.enqueue_job(text, jsonb, text, timestamptz, uuid, text, integer, uuid, text), public.claim_jobs(text, text, integer, text[], integer),
  public.complete_job(uuid, text, jsonb), public.fail_job(uuid, text, text, boolean), public.retry_dead_job(uuid, text), public.publish_domain_outbox(integer),
  public.run_db_jobs(integer, text[]), public.job_agent_routine_wake(public.job_queue), public.idempotency_begin(text, text, text, integer, integer, uuid, uuid),
  public.idempotency_finish(text, text, text, boolean, jsonb, integer), public.state_transition_allowed(text, text, text),
  public.transition_state(text, uuid, text, text, uuid, text, text, text), public.purge_foundation_history()
  from public, anon, authenticated;
grant execute on function public.db_now(), public.advisory_xact_lock(text, text), public.try_advisory_xact_lock(text, text),
  public.emit_domain_event(text, uuid, jsonb, uuid, text, text, text, text, text), public.outbox_has_routine_listener(public.domain_outbox),
  public.enqueue_job(text, jsonb, text, timestamptz, uuid, text, integer, uuid, text), public.claim_jobs(text, text, integer, text[], integer),
  public.complete_job(uuid, text, jsonb), public.fail_job(uuid, text, text, boolean), public.retry_dead_job(uuid, text), public.publish_domain_outbox(integer),
  public.run_db_jobs(integer, text[]), public.job_agent_routine_wake(public.job_queue), public.idempotency_begin(text, text, text, integer, integer, uuid, uuid),
  public.idempotency_finish(text, text, text, boolean, jsonb, integer), public.state_transition_allowed(text, text, text),
  public.transition_state(text, uuid, text, text, uuid, text, text, text), public.purge_foundation_history()
  to service_role;

-- ═══ 11. Schedules (existing pg_cron + dispatch_worker pattern) ═══
select cron.unschedule(jobid) from cron.job where jobname in ('foundation-db-jobs', 'foundation-app-jobs', 'foundation-purge');
select cron.schedule('foundation-db-jobs', '* * * * *', $$select public.run_db_jobs(100)$$);
select cron.schedule('foundation-app-jobs', '* * * * *', $$select public.dispatch_worker('/api/cron/jobs')$$);
select cron.schedule('foundation-purge', '40 3 * * *', $$select public.purge_foundation_history()$$);

-- ═══ 12. Event catalogue seed ═══
-- ═══ GENERATED by scripts/gen-event-catalogue-sql.mjs from src/lib/foundation/event-catalogue.ts — do not edit by hand ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('workspace.created', 1, 'workspace', 'A workspace was created.', null),
  ('workspace.member_added', 1, 'workspace', 'A member joined a workspace.', null),
  ('workspace.settings_updated', 1, 'workspace', 'Workspace settings changed (keys only).', null),
  ('workspace.plan_changed', 1, 'workspace', 'The workspace plan changed.', null),
  ('user.security_changed', 1, 'user', 'A user''s security settings changed.', null),
  ('event.created', 1, 'event', 'An event was created.', 'event.created'),
  ('event.updated', 1, 'event', 'An event was updated.', 'event.updated'),
  ('event.cancelled', 1, 'event', 'An event was cancelled.', 'event.cancelled'),
  ('event.readiness_changed', 1, 'event', 'An event''s readiness score changed.', null),
  ('event_plan.published', 1, 'event', 'An event plan was published.', 'event.published'),
  ('marketplace.request_sent', 1, 'request', 'A marketplace request was sent to providers.', null),
  ('marketplace.response_due', 1, 'request', 'A provider response deadline is approaching.', null),
  ('request.sent', 1, 'request', 'A request was sent.', null),
  ('request.responded', 1, 'request', 'A provider responded to a request.', null),
  ('quote.created', 1, 'quote', 'A quote was created.', null),
  ('quote.updated', 1, 'quote', 'A quote was revised.', null),
  ('quote.sent', 1, 'quote', 'A quote was sent to the customer.', 'quote.received'),
  ('quote.accepted', 1, 'quote', 'A quote was accepted.', 'quote.accepted'),
  ('hold.created', 1, 'hold', 'A conditional hold was created.', null),
  ('hold.expiring', 1, 'hold', 'A hold is about to expire.', null),
  ('hold.expired', 1, 'hold', 'A hold expired.', null),
  ('booking.created', 1, 'booking', 'A booking was created.', 'booking.created'),
  ('booking.requested', 1, 'booking', 'A booking was requested.', 'booking.requested'),
  ('booking.confirmed', 1, 'booking', 'A booking was confirmed.', 'booking.confirmed'),
  ('booking.cancelled', 1, 'booking', 'A booking was cancelled.', 'booking.cancelled'),
  ('booking.completed', 1, 'booking', 'A booking was completed.', null),
  ('cancellation.applied', 1, 'booking', 'A cancellation outcome was applied.', 'booking.cancellation_applied'),
  ('proposal.accepted', 1, 'proposal', 'A proposal was accepted.', 'proposal.accepted'),
  ('provider.arrived', 1, 'booking', 'A provider checked in on site.', null),
  ('provider.document_expiring', 1, 'provider', 'A provider compliance document is expiring.', 'provider.document.expiring'),
  ('provider.verification_changed', 1, 'provider', 'A provider''s verification state changed.', null),
  ('listing.published', 1, 'listing', 'A listing was published.', 'listing.published'),
  ('review.published', 1, 'review', 'A review was published.', 'review.published'),
  ('ticket.release_started', 1, 'ticket', 'A ticket release went on sale.', null),
  ('ticket.purchased', 1, 'ticket_order', 'A ticket order was paid.', 'ticket.order.paid'),
  ('ticket.order_paid', 1, 'ticket_order', 'A ticket order was paid (spec name).', null),
  ('ticket.transferred', 1, 'ticket', 'A ticket was transferred.', 'ticket.transferred'),
  ('ticket.resale_listed', 1, 'ticket', 'A ticket was listed for resale.', null),
  ('ticket.resold', 1, 'ticket', 'A resale ticket was sold.', 'ticket.resold'),
  ('ticket.scanned', 1, 'ticket', 'A ticket was scanned at entry.', null),
  ('ticket.refunded', 1, 'ticket', 'A ticket was refunded.', 'payment.refunded'),
  ('payment.succeeded', 1, 'payment', 'A payment succeeded.', 'payment.succeeded'),
  ('payment.failed', 1, 'payment', 'A payment failed.', null),
  ('payment.refunded', 1, 'payment', 'A payment was refunded.', 'payment.refunded'),
  ('refund.created', 1, 'payment', 'A refund was created.', null),
  ('dispute.opened', 1, 'dispute', 'A dispute was opened.', 'dispute.opened'),
  ('transfer.created', 1, 'payment', 'A connected-account transfer was created.', null),
  ('payout.paid', 1, 'payment', 'A payout was paid.', null),
  ('promotion.started', 1, 'promotion', 'A promotion started.', null),
  ('ad.budget_threshold', 1, 'promotion', 'An advert crossed a budget threshold.', null),
  ('agent.run_started', 1, 'agent_run', 'A Gala Agent run started.', null),
  ('agent.approval_required', 1, 'agent_run', 'A Gala Agent run needs approval.', null),
  ('agent.run_waiting', 1, 'agent_run', 'A Gala Agent run is waiting.', null),
  ('agent.run_completed', 1, 'agent_run', 'A Gala Agent run completed.', null),
  ('agent.finished', 1, 'agent_run', 'A Gala Agent run finished (runtime name).', 'agent.run.completed'),
  ('support.case_opened', 1, 'support_case', 'A support case was opened.', null),
  ('privacy.request_received', 1, 'privacy_request', 'A privacy request was received.', null)
on conflict (event_type) do update set schema_version = excluded.schema_version, aggregate = excluded.aggregate, description = excluded.description, public_type = excluded.public_type, active = true, updated_at = now();
update public.domain_event_types set active = false, updated_at = now() where event_type <> all (array['workspace.created', 'workspace.member_added', 'workspace.settings_updated', 'workspace.plan_changed', 'user.security_changed', 'event.created', 'event.updated', 'event.cancelled', 'event.readiness_changed', 'event_plan.published', 'marketplace.request_sent', 'marketplace.response_due', 'request.sent', 'request.responded', 'quote.created', 'quote.updated', 'quote.sent', 'quote.accepted', 'hold.created', 'hold.expiring', 'hold.expired', 'booking.created', 'booking.requested', 'booking.confirmed', 'booking.cancelled', 'booking.completed', 'cancellation.applied', 'proposal.accepted', 'provider.arrived', 'provider.document_expiring', 'provider.verification_changed', 'listing.published', 'review.published', 'ticket.release_started', 'ticket.purchased', 'ticket.order_paid', 'ticket.transferred', 'ticket.resale_listed', 'ticket.resold', 'ticket.scanned', 'ticket.refunded', 'payment.succeeded', 'payment.failed', 'payment.refunded', 'refund.created', 'dispute.opened', 'transfer.created', 'payout.paid', 'promotion.started', 'ad.budget_threshold', 'agent.run_started', 'agent.approval_required', 'agent.run_waiting', 'agent.run_completed', 'agent.finished', 'support.case_opened', 'privacy.request_received']::text[]) and active;
-- ═══ END GENERATED ═══
