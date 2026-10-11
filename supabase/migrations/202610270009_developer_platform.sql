-- Developer platform (release spec §95–100): workspace API keys, request log/idempotency, outbound webhooks.
-- API and MCP calls execute through agent_invoke() as the key's creator, so they get exactly that person's role permissions,
-- the same tool allowlist and the same domain rules as the UI and Gala Agent. Nothing internal/admin is exposed.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  prefix text not null unique,                       -- shown in the UI and logs; the secret part is never stored
  key_hash text not null unique,                     -- sha256 of the full key
  scopes text[] not null check (cardinality(scopes) between 1 and 40),
  acts_as uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz,
  last_used_at timestamptz, last_used_ip text,
  revoked_at timestamptz, revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists api_keys_ws_idx on public.api_keys(workspace_id);
alter table public.api_keys enable row level security;
drop policy if exists api_keys_read on public.api_keys;
create policy api_keys_read on public.api_keys for select using (public.has_workspace_role(workspace_id, array['owner','manager']));
-- key_hash is never readable by clients (column grants: a table-level grant would override a column revoke).
revoke all on public.api_keys from anon, authenticated;
grant select (id, workspace_id, name, prefix, scopes, acts_as, expires_at, last_used_at, last_used_ip, revoked_at, revoked_by, created_at) on public.api_keys to authenticated;

create table if not exists public.api_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  key_id uuid references public.api_keys(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  channel text not null default 'rest' check (channel in ('rest','mcp')),
  method text not null, path text not null, tool text,
  status integer not null, duration_ms integer,
  idempotency_key text, response jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists api_requests_idem_uq on public.api_requests(key_id, idempotency_key) where idempotency_key is not null;
create index if not exists api_requests_ws_idx on public.api_requests(workspace_id, created_at desc);
alter table public.api_requests enable row level security;
drop policy if exists api_requests_read on public.api_requests;
create policy api_requests_read on public.api_requests for select using (public.has_workspace_role(workspace_id, array['owner','manager']));

-- Creation stores only the hash; the caller (server action) generates the key and shows it once.
create or replace function public.create_api_key(p_workspace uuid, p_name text, p_scopes text[], p_prefix text, p_hash text, p_expires timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_expires is not null and p_expires > now() + interval '400 days' then raise exception 'expiry_too_long' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_scopes) s where s !~ '^[a-z_]+:(read|write|scan)$') then raise exception 'invalid_scope' using errcode = '22023'; end if;
  insert into public.api_keys(workspace_id, name, prefix, key_hash, scopes, acts_as, expires_at) values (p_workspace, left(trim(p_name), 80), p_prefix, p_hash, p_scopes, auth.uid(), p_expires) returning id into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'api_key.created', jsonb_build_object('key_id', v, 'name', p_name, 'scopes', p_scopes, 'prefix', p_prefix));
  return v;
end $$;
create or replace function public.revoke_api_key(p_key uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where id = p_key;
  if not found or not public.has_workspace_role(k.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.api_keys set revoked_at = now(), revoked_by = auth.uid() where id = p_key and revoked_at is null;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', k.workspace_id, 'api_key.revoked', jsonb_build_object('key_id', p_key, 'prefix', k.prefix));
end $$;
revoke all on function public.create_api_key(uuid, text, text[], text, text, timestamptz) from public, anon;
revoke all on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.create_api_key(uuid, text, text[], text, text, timestamptz) to authenticated;
grant execute on function public.revoke_api_key(uuid) to authenticated;

-- Key lookup for the API gateway (service role). Inactive keys, expired keys and keys whose creator lost access are rejected.
create or replace function public.resolve_api_key(p_hash text, p_ip text) returns table (key_id uuid, workspace_id uuid, acts_as uuid, scopes text[], prefix text)
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys a where a.key_hash = p_hash and a.revoked_at is null and (a.expires_at is null or a.expires_at > now());
  if not found then return; end if;
  if not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
      where m.workspace_id = k.workspace_id and m.user_id = k.acts_as and m.status = 'active' and w.status = 'active') then return; end if;
  update public.api_keys set last_used_at = now(), last_used_ip = left(p_ip, 64) where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return query select k.id, k.workspace_id, k.acts_as, k.scopes, k.prefix;
end $$;
revoke all on function public.resolve_api_key(text, text) from public, anon, authenticated;
grant execute on function public.resolve_api_key(text, text) to service_role;

-- ───────────────────────── webhooks ─────────────────────────
create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url text not null check (url ~ '^https://[^\s/$.?#][^\s]*$' and length(url) <= 500),
  description text not null default '',
  events text[] not null check (cardinality(events) between 1 and 40),
  secret text not null,                                -- signing secret (shown once to the creator; service role reads it to sign)
  status text not null default 'active' check (status in ('active','disabled')),
  consecutive_failures integer not null default 0, first_failure_at timestamptz, disabled_reason text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.webhook_endpoints enable row level security;
drop policy if exists webhook_endpoints_read on public.webhook_endpoints;
create policy webhook_endpoints_read on public.webhook_endpoints for select using (public.has_workspace_role(workspace_id, array['owner','manager']));
revoke all on public.webhook_endpoints from anon, authenticated;
grant select (id, workspace_id, url, description, events, status, consecutive_failures, first_failure_at, disabled_reason, created_by, created_at) on public.webhook_endpoints to authenticated;

create or replace function public.create_webhook_endpoint(p_workspace uuid, p_url text, p_events text[], p_description text, p_secret text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if (select count(*) from public.webhook_endpoints where workspace_id = p_workspace) >= 10 then raise exception 'limit_reached' using errcode = '22023'; end if;
  insert into public.webhook_endpoints(workspace_id, url, events, description, secret, created_by) values (p_workspace, trim(p_url), p_events, left(coalesce(p_description, ''), 200), p_secret, auth.uid()) returning id into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'webhook.endpoint_created', jsonb_build_object('endpoint_id', v, 'url', p_url, 'events', p_events));
  return v;
end $$;
create or replace function public.set_webhook_endpoint_status(p_endpoint uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.webhook_endpoints;
begin
  select * into e from public.webhook_endpoints where id = p_endpoint;
  if not found or not public.has_workspace_role(e.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_status = 'deleted' then delete from public.webhook_endpoints where id = p_endpoint;
  elsif p_status in ('active','disabled') then update public.webhook_endpoints set status = p_status, consecutive_failures = 0, first_failure_at = null, disabled_reason = case when p_status = 'disabled' then 'Disabled by a workspace admin' end where id = p_endpoint;
  else raise exception 'invalid_status' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', e.workspace_id, 'webhook.endpoint_' || p_status, jsonb_build_object('endpoint_id', p_endpoint));
end $$;
-- Test delivery: a 'ping' to one endpoint, through the normal signed delivery path.
create or replace function public.test_webhook_endpoint(p_endpoint uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.webhook_endpoints; eid uuid := gen_random_uuid(); v uuid;
begin
  select * into e from public.webhook_endpoints where id = p_endpoint;
  if not found or not public.has_workspace_role(e.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.webhook_deliveries(endpoint_id, workspace_id, event_id, event_type, payload)
    values (e.id, e.workspace_id, eid, 'ping', jsonb_build_object('id', eid, 'type', 'ping', 'created', extract(epoch from now())::bigint, 'workspace_id', e.workspace_id, 'data', jsonb_build_object('message', 'Test delivery from Gala Dock'))) returning id into v;
  return v;
end $$;
revoke all on function public.create_webhook_endpoint(uuid, text, text[], text, text) from public, anon;
revoke all on function public.set_webhook_endpoint_status(uuid, text) from public, anon;
revoke all on function public.test_webhook_endpoint(uuid) from public, anon;
grant execute on function public.create_webhook_endpoint(uuid, text, text[], text, text) to authenticated;
grant execute on function public.set_webhook_endpoint_status(uuid, text) to authenticated;
grant execute on function public.test_webhook_endpoint(uuid) to authenticated;

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null,                              -- stable across retries and replays (receivers dedupe on it)
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','delivering','delivered','failed','dead')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  response_status integer, response_snippet text, delivered_at timestamptz, lease_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_due_idx on public.webhook_deliveries(next_attempt_at) where status in ('pending','failed');
create index if not exists webhook_deliveries_ep_idx on public.webhook_deliveries(endpoint_id, created_at desc);
alter table public.webhook_deliveries enable row level security;
drop policy if exists webhook_deliveries_read on public.webhook_deliveries;
create policy webhook_deliveries_read on public.webhook_deliveries for select using (public.has_workspace_role(workspace_id, array['owner','manager']));

-- Public event catalogue: audit event → webhook event type. Only business events with no secrets in their metadata.
create or replace function public.webhook_event_type(p_audit text) returns text language sql immutable as $$
  select case p_audit
    when 'event.created' then 'event.created' when 'event.updated' then 'event.updated' when 'event_plan.published' then 'event.published'
    when 'booking.requested' then 'booking.requested' when 'booking.confirmed' then 'booking.confirmed' when 'booking.cancelled' then 'booking.cancelled'
    when 'booking.created' then 'booking.created' when 'cancellation.applied' then 'booking.cancellation_applied'
    when 'quote.sent' then 'quote.received' when 'quote.accepted' then 'quote.accepted'
    when 'proposal.accepted' then 'proposal.accepted' when 'ticket.purchased' then 'ticket.order.paid' when 'ticket.transferred' then 'ticket.transferred'
    when 'ticket.resold' then 'ticket.resold' when 'payment.succeeded' then 'payment.succeeded' when 'payment.refunded' then 'payment.refunded'
    when 'dispute.opened' then 'dispute.opened' when 'agent.finished' then 'agent.run.completed' when 'listing.published' then 'listing.published'
    when 'review.published' then 'review.published' when 'provider.document_expiring' then 'provider.document.expiring'
    else null end;
$$;

create or replace function public.trg_audit_webhooks() returns trigger language plpgsql security definer set search_path = '' as $$
declare t text := public.webhook_event_type(new.event); eid uuid := gen_random_uuid();
begin
  if t is null or new.workspace_id is null then return new; end if;
  insert into public.webhook_deliveries(endpoint_id, workspace_id, event_id, event_type, payload)
  select e.id, e.workspace_id, eid, t, jsonb_build_object('id', eid, 'type', t, 'created', extract(epoch from new.created_at)::bigint, 'workspace_id', new.workspace_id,
      'data', coalesce(new.metadata, '{}') - array['ip','user_agent','email','token','secret','note'])
  from public.webhook_endpoints e where e.workspace_id = new.workspace_id and e.status = 'active' and (t = any(e.events) or '*' = any(e.events));
  return new;
exception when others then return new;
end $$;
drop trigger if exists gd_audit_webhooks on public.audit_events;
create trigger gd_audit_webhooks after insert on public.audit_events for each row execute function public.trg_audit_webhooks();

create or replace function public.claim_webhook_batch(p_limit integer default 50) returns table (delivery_id uuid, url text, secret text, payload jsonb, event_id uuid, event_type text, attempts integer, endpoint_id uuid)
language sql security definer set search_path = '' as $$
  with c as (
    update public.webhook_deliveries d set status = 'delivering', lease_until = now() + interval '2 minutes', attempts = d.attempts + 1
    where d.id in (select x.id from public.webhook_deliveries x join public.webhook_endpoints e on e.id = x.endpoint_id
      where e.status = 'active' and ((x.status in ('pending','failed') and x.next_attempt_at <= now()) or (x.status = 'delivering' and x.lease_until < now()))
      order by x.next_attempt_at limit greatest(1, least(p_limit, 200)) for update of x skip locked)
    returning d.*)
  select c.id, e.url, e.secret, c.payload, c.event_id, c.event_type, c.attempts, c.endpoint_id from c join public.webhook_endpoints e on e.id = c.endpoint_id;
$$;
-- Records the outcome; exponential backoff (1m, 5m, 30m, 2h, 6h, 12h, 24h); dead after 8 attempts; endpoint disabled after
-- 20 consecutive failures spanning more than 24 hours (owners are notified).
create or replace function public.finish_webhook_delivery(p_delivery uuid, p_ok boolean, p_status integer, p_snippet text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.webhook_deliveries; e public.webhook_endpoints; backoff interval[] := array['1 minute','5 minutes','30 minutes','2 hours','6 hours','12 hours','24 hours']::interval[];
begin
  select * into d from public.webhook_deliveries where id = p_delivery for update;
  if p_ok then
    update public.webhook_deliveries set status = 'delivered', delivered_at = now(), response_status = p_status, response_snippet = left(p_snippet, 300), lease_until = null where id = d.id;
    update public.webhook_endpoints set consecutive_failures = 0, first_failure_at = null where id = d.endpoint_id;
    return;
  end if;
  update public.webhook_deliveries set status = case when d.attempts >= 8 then 'dead' else 'failed' end, response_status = p_status, response_snippet = left(p_snippet, 300), lease_until = null,
    next_attempt_at = now() + backoff[least(d.attempts, 7)] where id = d.id;
  update public.webhook_endpoints set consecutive_failures = consecutive_failures + 1, first_failure_at = coalesce(first_failure_at, now()) where id = d.endpoint_id returning * into e;
  if e.consecutive_failures >= 20 and e.first_failure_at < now() - interval '24 hours' and e.status = 'active' then
    update public.webhook_endpoints set status = 'disabled', disabled_reason = 'Disabled after sustained delivery failures' where id = e.id;
    insert into public.notifications(user_id, kind, title, body, link)
      select m.user_id, 'event_update', 'Webhook endpoint disabled', e.url || ' failed repeatedly for over 24 hours and was disabled. Fix it and re-enable it in Settings → Developers.', '/organizer/settings?tab=developers'
      from public.workspace_members m where m.workspace_id = e.workspace_id and m.role in ('owner','manager') and m.status = 'active';
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', e.workspace_id, 'webhook.endpoint_disabled', jsonb_build_object('endpoint_id', e.id));
  end if;
end $$;
revoke all on function public.claim_webhook_batch(integer) from public, anon, authenticated;
revoke all on function public.finish_webhook_delivery(uuid, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.claim_webhook_batch(integer) to service_role;
grant execute on function public.finish_webhook_delivery(uuid, boolean, integer, text) to service_role;

-- Replay (owners/managers): re-queues a delivery with the same event id.
create or replace function public.replay_webhook_delivery(p_delivery uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.webhook_deliveries;
begin
  select * into d from public.webhook_deliveries where id = p_delivery;
  if not found or not public.has_workspace_role(d.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.webhook_deliveries set status = 'pending', next_attempt_at = now(), attempts = 0 where id = p_delivery;
end $$;
revoke all on function public.replay_webhook_delivery(uuid) from public, anon;
grant execute on function public.replay_webhook_delivery(uuid) to authenticated;

select cron.unschedule('webhook-deliveries') where exists (select 1 from cron.job where jobname = 'webhook-deliveries');
select cron.schedule('webhook-deliveries', '* * * * *', $$select public.dispatch_worker('/api/cron/webhooks')$$);

revoke all on public.webhook_deliveries, public.api_requests from anon;
revoke insert, update, delete on public.webhook_deliveries, public.api_requests from authenticated;
