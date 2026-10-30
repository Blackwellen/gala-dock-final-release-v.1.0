-- Q30 (lane C, 2026-10-29) — API / MCP / webhooks / sync hardening (domains 189–194, 283–285). Additive and backward-compatible.
--   * API keys: per-key rate limit (rate_limit_per_minute, default 120 = previous fixed limit), rotation with a grace window
--     (rotate_api_key: new key acts as the rotating owner/manager, old key expires after ≤ 7 days), set_api_key_limits (expiry /
--     rate limit), rotated_from lineage. Step-up as for create/revoke.
--   * Workspace binding: api_tool_args_check(workspace, kind, args) — every id an external client passes (event / item / tier /
--     space / standby / primary) must belong to the key's workspace, so a key can never reach another workspace the same human
--     also belongs to. The gateway calls it before agent_invoke (which already enforces the human's role permission).
--   * Audit: api_requests gains error_code + scope; the gateway now logs every authenticated call (lists, MCP methods, tool calls).
--   * Webhooks: payloads are ALLOW-LISTED per public type (webhook_payload_fields) and pass a global deny pattern (scores,
--     ranking reasons, internal notes, contact data, tokens, secrets) — ranking reasons never leave the platform. Public types
--     come from the domain-event catalogue (domain_event_types.public_type) as well as the legacy audit map. Envelope gains
--     api_version and schema_version. Endpoint secret rotation keeps the previous secret for 24 h (dual v1 signatures).
--   * Event feed (pull sync with cursors): api_event_feed(workspace, after_seq, limit) over domain_outbox with the same
--     public mapping + sanitiser; cursor = outbox seq (monotonic), at-least-once, dedupe on id.
--   * Calendar sync health: calendar_sync_health() (service only) for /api/health.

-- ═══ 1. API keys: limits, rotation ═══
alter table public.api_keys
  add column if not exists rate_limit_per_minute integer not null default 120,
  add column if not exists rotated_from uuid references public.api_keys(id) on delete set null,
  add column if not exists rotated_at timestamptz;
do $$ begin
  alter table public.api_keys drop constraint if exists api_keys_rate_limit_check;
  alter table public.api_keys add constraint api_keys_rate_limit_check check (rate_limit_per_minute between 1 and 1200);
end $$;
grant select (rate_limit_per_minute, rotated_from, rotated_at) on public.api_keys to authenticated;

alter table public.api_requests
  add column if not exists error_code text check (error_code is null or length(error_code) <= 60),
  add column if not exists scope text check (scope is null or length(scope) <= 60);
grant select (error_code, scope) on public.api_requests to authenticated;
create index if not exists api_requests_key_created_idx on public.api_requests(key_id, created_at desc);
create index if not exists api_requests_workspace_created_idx on public.api_requests(workspace_id, created_at desc);

create or replace function public.rotate_api_key(p_key uuid, p_prefix text, p_hash text, p_grace_hours integer default 24) returns uuid
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys; v uuid; uid uuid := (select auth.uid());
begin
  select * into k from public.api_keys where id = p_key for update;
  if not found or not public.has_workspace_role(k.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(k.workspace_id);
  if k.revoked_at is not null or (k.expires_at is not null and k.expires_at <= now()) then raise exception 'key_inactive' using errcode = '22023'; end if;
  if p_prefix !~ '^[A-Za-z0-9]{8}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_key_material' using errcode = '22023'; end if;
  if p_grace_hours is null or p_grace_hours < 0 or p_grace_hours > 168 then raise exception 'invalid_grace' using errcode = '22023'; end if;
  insert into public.api_keys(workspace_id, name, prefix, key_hash, scopes, acts_as, expires_at, rate_limit_per_minute, rotated_from)
    values (k.workspace_id, k.name, p_prefix, p_hash, k.scopes, uid, k.expires_at, k.rate_limit_per_minute, k.id) returning id into v;
  update public.api_keys set rotated_at = now(),
      expires_at = least(coalesce(expires_at, 'infinity'::timestamptz), now() + make_interval(hours => p_grace_hours)),
      revoked_at = case when p_grace_hours = 0 then now() else revoked_at end, revoked_by = case when p_grace_hours = 0 then uid else revoked_by end
    where id = k.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (uid, 'user', k.workspace_id, 'api_key.rotated', jsonb_build_object('key_id', v, 'rotated_from', k.id, 'prefix', p_prefix, 'grace_hours', p_grace_hours));
  return v;
end $$;

create or replace function public.set_api_key_limits(p_key uuid, p_rate_limit integer default null, p_expires timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where id = p_key for update;
  if not found or not public.has_workspace_role(k.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(k.workspace_id);
  if p_expires is not null and p_expires > now() + interval '400 days' then raise exception 'expiry_too_long' using errcode = '22023'; end if;
  update public.api_keys set rate_limit_per_minute = coalesce(p_rate_limit, rate_limit_per_minute), expires_at = coalesce(p_expires, expires_at) where id = p_key;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values ((select auth.uid()), 'user', k.workspace_id, 'api_key.updated', jsonb_build_object('key_id', p_key, 'rate_limit_per_minute', p_rate_limit, 'expires_at', p_expires));
end $$;

-- ═══ 2. Workspace binding of tool arguments (service only; the gateway calls it for every external tool call) ═══
-- Returns null when every id in p_args belongs to p_workspace, else the offending field name.
create or replace function public.api_tool_args_check(p_workspace uuid, p_kind text, p_args jsonb) returns text
language plpgsql stable security definer set search_path = '' as $$
declare k text; v uuid;
begin
  foreach k in array array['event_id','item_id','primary_id','tier_id','space_id','standby_id'] loop
    continue when nullif(p_args ->> k, '') is null;
    begin v := (p_args ->> k)::uuid; exception when others then return k; end;
    if k = 'event_id' and not exists (select 1 from public.events e where e.id = v and e.workspace_id = p_workspace) then return k; end if;
    if k in ('item_id','primary_id') and not (
         (p_kind = 'organizer' and exists (select 1 from public.build_items b join public.events e on e.id = b.event_id where b.id = v and e.workspace_id = p_workspace))
      or (p_kind = 'provider' and exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where b.id = v and l.workspace_id = p_workspace))) then return k; end if;
    if k = 'tier_id' and not exists (select 1 from public.ticket_tiers t join public.events e on e.id = t.event_id where t.id = v and e.workspace_id = p_workspace) then return k; end if;
    if k = 'space_id' and not exists (select 1 from public.spaces s where s.id = v and s.workspace_id = p_workspace) then return k; end if;
    if k = 'standby_id' and not exists (select 1 from public.build_items b join public.events e on e.id = b.event_id where b.id = v and e.workspace_id = p_workspace)
       and not exists (select 1 from public.events e where e.workspace_id = p_workspace and e.id = v) then return k; end if;
  end loop;
  return null;
end $$;

-- ═══ 3. Webhook payload allow-list + sanitiser ═══
create table if not exists public.webhook_payload_fields (
  public_type text primary key check (public_type ~ '^[a-z_]+(\.[a-z_]+)*$'),
  fields text[] not null,
  schema_version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.webhook_payload_fields enable row level security;
revoke all on table public.webhook_payload_fields from public, anon, authenticated;
grant all on table public.webhook_payload_fields to service_role;
insert into public.webhook_payload_fields(public_type, fields) values
  ('event.created',                 array['event_id','name','starts_at','ends_at','status','event_type']),
  ('event.updated',                 array['event_id','name','starts_at','ends_at','status','changed']),
  ('event.published',               array['event_id','name','starts_at','status']),
  ('event.cancelled',               array['event_id','name','status','refunds']),
  ('booking.requested',             array['item_id','event_id','listing_id','category','status']),
  ('booking.created',               array['item_id','event_id','listing_id','category','status']),
  ('booking.confirmed',             array['item_id','event_id','listing_id','status','amount','currency']),
  ('booking.cancelled',             array['item_id','event_id','listing_id','status']),
  ('booking.cancellation_applied',  array['item_id','event_id','cancellation_id','kind','refund_amount','currency']),
  ('quote.received',                array['quote_id','item_id','event_id','total','currency','valid_until']),
  ('quote.accepted',                array['quote_id','item_id','event_id','total','currency']),
  ('proposal.accepted',             array['proposal_id','event_id','client_id','total','currency']),
  ('ticket.order.paid',             array['order_ref','event_id','tier_id','quantity','amount','currency']),
  ('ticket.transferred',            array['ticket_id','event_id','tier_id']),
  ('ticket.resold',                 array['ticket_id','event_id','tier_id','amount','currency']),
  ('payment.succeeded',             array['payment_id','order_ref','event_id','amount','currency']),
  ('payment.refunded',              array['payment_id','order_ref','ticket_id','event_id','amount','currency']),
  ('dispute.opened',                array['dispute_id','item_id','event_id','status']),
  ('agent.run.completed',           array['run_id','status']),
  ('listing.published',             array['listing_id','name','category']),
  ('review.published',              array['review_id','listing_id','rating']),
  ('provider.document.expiring',    array['document_id','kind','expires_at']),
  ('ping',                          array['message'])
on conflict (public_type) do update set fields = excluded.fields, updated_at = now();

-- Keys that never leave the platform, whatever an allow-list says (ranking reasons / scores, internal notes, contact data, secrets).
create or replace function public.webhook_field_denied(p_key text) returns boolean
language sql immutable set search_path = '' as $$
  select p_key ~* '(^|_)(score|scores|reason|reasons|rank|ranking|weight|weights|internal|private|note|notes|ip|user_agent|email|phone|token|secret|hash|password|host_url|speaker_url|join_url|storage_path|key)($|_)';
$$;

create or replace function public.webhook_public_payload(p_type text, p_data jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.key, x.value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end) x
  where not public.webhook_field_denied(x.key)
    and (x.key = any (coalesce((select f.fields from public.webhook_payload_fields f where f.public_type = p_type), array[]::text[]))
         or (not exists (select 1 from public.webhook_payload_fields f where f.public_type = p_type) and x.key ~ '_id$'))
    and jsonb_typeof(x.value) in ('string','number','boolean','null');
$$;

-- Public type for an audit / outbox event: legacy audit map first, then the domain-event catalogue.
create or replace function public.webhook_public_type(p_event text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(public.webhook_event_type(p_event), (select d.public_type from public.domain_event_types d where d.event_type = p_event and d.active and d.public_type is not null));
$$;

alter table public.webhook_endpoints
  add column if not exists previous_secret text,
  add column if not exists previous_secret_expires_at timestamptz,
  add column if not exists secret_rotated_at timestamptz;
grant select (previous_secret_expires_at, secret_rotated_at) on public.webhook_endpoints to authenticated;

-- Same signature as before; payload now allow-listed + envelope versioned.
create or replace function public.trg_audit_webhooks() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text; eid uuid := gen_random_uuid();
begin
  if new.workspace_id is null then return new; end if;
  t := public.webhook_public_type(new.event);
  if t is null then return new; end if;
  insert into public.webhook_deliveries(endpoint_id, workspace_id, event_id, event_type, payload)
  select e.id, e.workspace_id, eid, t, jsonb_build_object('id', eid, 'type', t, 'api_version', '2026-10-29',
      'schema_version', coalesce((select f.schema_version from public.webhook_payload_fields f where f.public_type = t), 1),
      'created', extract(epoch from new.created_at)::bigint, 'workspace_id', new.workspace_id,
      'data', public.webhook_public_payload(t, coalesce(new.metadata, '{}')))
  from public.webhook_endpoints e where e.workspace_id = new.workspace_id and e.status = 'active' and (t = any(e.events) or '*' = any(e.events));
  return new;
exception when others then return new;
end $$;

create or replace function public.rotate_webhook_secret(p_endpoint uuid, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.webhook_endpoints;
begin
  select * into e from public.webhook_endpoints where id = p_endpoint for update;
  if not found or not public.has_workspace_role(e.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(e.workspace_id);
  if p_secret !~ '^whsec_[A-Za-z0-9_-]{24,64}$' then raise exception 'invalid_secret' using errcode = '22023'; end if;
  update public.webhook_endpoints set previous_secret = secret, previous_secret_expires_at = now() + interval '24 hours', secret = p_secret, secret_rotated_at = now() where id = p_endpoint;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values ((select auth.uid()), 'user', e.workspace_id, 'webhook.secret_rotated', jsonb_build_object('endpoint_id', e.id));
end $$;

-- Worker helper (service only): secrets still valid for an endpoint (current first, then the previous one during its grace window).
create or replace function public.webhook_signing_secrets(p_endpoint uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[e.secret, case when e.previous_secret_expires_at > now() then e.previous_secret end], null)
  from public.webhook_endpoints e where e.id = p_endpoint;
$$;

-- ═══ 4. Event feed with cursors (pull sync) ═══
create or replace function public.api_event_feed(p_workspace uuid, p_after bigint default 0, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rows jsonb; last_seq bigint;
begin
  with ev as (
    select o.id, o.seq, o.emitted_at, o.payload, public.webhook_public_type(o.event_type) as t
    from public.domain_outbox o
    where o.workspace_id = p_workspace and o.seq > coalesce(p_after, 0)
    order by o.seq limit greatest(1, least(coalesce(p_limit, 100), 500)) * 4)
  select coalesce(jsonb_agg(jsonb_build_object('id', ev.id, 'type', ev.t, 'cursor', ev.seq::text, 'created', extract(epoch from ev.emitted_at)::bigint,
      'data', public.webhook_public_payload(ev.t, ev.payload)) order by ev.seq), '[]'), max(ev.seq)
    into rows, last_seq
    from (select * from ev where ev.t is not null order by ev.seq limit greatest(1, least(coalesce(p_limit, 100), 500))) ev;
  if last_seq is null then
    -- Nothing public in the scanned window: advance the cursor past it so clients don't rescan internal-only events forever.
    select max(s.seq) into last_seq from (select o.seq from public.domain_outbox o where o.workspace_id = p_workspace and o.seq > coalesce(p_after, 0)
      order by o.seq limit greatest(1, least(coalesce(p_limit, 100), 500)) * 4) s;
  end if;
  return jsonb_build_object('data', rows, 'next_cursor', coalesce(last_seq, coalesce(p_after, 0))::text, 'api_version', '2026-10-29');
end $$;

-- ═══ 5. Calendar sync health (service only) ═══
create or replace function public.calendar_sync_health() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'connections', count(*),
    'by_status', coalesce((select jsonb_object_agg(s.status, s.n) from (select status, count(*) n from public.calendar_connections group by status) s), '{}'),
    'active_stale', count(*) filter (where c.status = 'active' and coalesce(c.last_synced_at, c.created_at) < now() - interval '2 hours'),
    'with_errors', count(*) filter (where c.last_error is not null and c.status = 'active'),
    'oldest_active_sync', min(c.last_synced_at) filter (where c.status = 'active'),
    'links', (select count(*) from public.calendar_sync_links))
  from public.calendar_connections c;
$$;

-- ═══ 6. Catalogue + grants ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description) values
  ('api_key.rotated', 1, 'api_key', 'An API key was rotated; the old key expires after its grace window (payload: key_id, rotated_from, prefix, grace_hours).'),
  ('api_key.updated', 1, 'api_key', 'An API key''s rate limit or expiry changed (payload: key_id, rate_limit_per_minute, expires_at).'),
  ('webhook.secret_rotated', 1, 'webhook_endpoint', 'A webhook endpoint''s signing secret was rotated; the previous one signs for 24 h (payload: endpoint_id).')
on conflict (event_type) do update set schema_version = excluded.schema_version, aggregate = excluded.aggregate, description = excluded.description;

revoke all on function public.api_tool_args_check(uuid, text, jsonb), public.webhook_public_payload(text, jsonb), public.webhook_public_type(text),
  public.webhook_signing_secrets(uuid), public.api_event_feed(uuid, bigint, integer), public.calendar_sync_health(), public.webhook_field_denied(text) from public, anon, authenticated;
grant execute on function public.api_tool_args_check(uuid, text, jsonb), public.webhook_public_payload(text, jsonb), public.webhook_public_type(text),
  public.webhook_signing_secrets(uuid), public.api_event_feed(uuid, bigint, integer), public.calendar_sync_health(), public.webhook_field_denied(text) to service_role;
revoke all on function public.rotate_api_key(uuid, text, text, integer), public.set_api_key_limits(uuid, integer, timestamptz), public.rotate_webhook_secret(uuid, text) from public, anon;
grant execute on function public.rotate_api_key(uuid, text, text, integer), public.set_api_key_limits(uuid, integer, timestamptz), public.rotate_webhook_secret(uuid, text) to authenticated, service_role;
revoke all on function public.trg_audit_webhooks() from public, anon, authenticated;
