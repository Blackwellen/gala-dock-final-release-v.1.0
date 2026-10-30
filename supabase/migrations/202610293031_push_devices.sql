-- Q37 (lane C): Web Push readiness (domain 233) and device/offline sync support (231–234).
-- Push delivery itself is BLOCKED_EXTERNAL until VAPID keys (WEB_PUSH_VAPID_PUBLIC_KEY / _PRIVATE_KEY / _SUBJECT) are configured;
-- this adds the subscription registry (bound to user + session, revocable), preferences, a push outbox with preference/critical
-- rules and payload limits (no private details on lock screens), and the sender's claim/mark contract. Additive and idempotent.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  endpoint_hash text not null unique,
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth_secret text not null check (length(auth_secret) between 10 and 100),
  session_id uuid,
  platform text not null default 'unknown' check (platform in ('android', 'ios', 'desktop', 'unknown')),
  label text not null default '' check (length(label) <= 60),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz, revoke_reason text,
  failures integer not null default 0
);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id) where revoked_at is null;
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
-- Owners see device metadata only (never the endpoint or keys).
grant select (id, user_id, platform, label, created_at, last_seen_at, revoked_at, revoke_reason) on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  category text not null check (category ~ '^[a-z_]{2,40}$'),
  title text not null check (length(title) between 1 and 60),
  body text not null default '' check (length(body) <= 140),
  url text not null default '/' check (url ~ '^/[^/\\]' or url = '/'),
  critical boolean not null default false,
  dedupe_key text,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'expired', 'blocked_external', 'skipped')),
  attempts integer not null default 0, error text,
  created_at timestamptz not null default now(), sent_at timestamptz, lease_until timestamptz,
  unique (subscription_id, dedupe_key)
);
create index if not exists push_outbox_queue on public.push_outbox(status, created_at) where status in ('queued', 'sending');
alter table public.push_outbox enable row level security;
revoke all on table public.push_outbox from public, anon, authenticated;

-- Push services the platform will deliver to (prevents the subscription endpoint becoming an SSRF target).
create or replace function public.push_endpoint_allowed(p_endpoint text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)/', false);
$$;

-- Register this browser for push (signed-in users). Bound to the current auth session: when the session ends (sign-out,
-- revocation, expiry) the sender skips it. Re-registering an endpoint moves it to the current user and session.
create or replace function public.push_register(p_endpoint text, p_p256dh text, p_auth text, p_platform text default 'unknown', p_label text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sid uuid; h text; id_ uuid;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not public.push_endpoint_allowed(p_endpoint) then raise exception 'push_endpoint_not_allowed' using errcode = '22023'; end if;
  if not public.hit_rate_limit('push-register:' || uid::text, 20, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  begin sid := nullif(auth.jwt() ->> 'session_id', '')::uuid; exception when others then sid := null; end;
  h := encode(extensions.digest(convert_to(p_endpoint, 'UTF8'), 'sha256'), 'hex');
  if (select count(*) from public.push_subscriptions where user_id = uid and revoked_at is null and endpoint_hash <> h) >= 10 then
    raise exception 'too_many_devices' using errcode = '54000', hint = 'Remove a device in notification settings first.';
  end if;
  insert into public.push_subscriptions(user_id, endpoint, endpoint_hash, p256dh, auth_secret, session_id, platform, label)
  values (uid, p_endpoint, h, p_p256dh, p_auth, sid, case when p_platform in ('android', 'ios', 'desktop') then p_platform else 'unknown' end, left(coalesce(p_label, ''), 60))
  on conflict (endpoint_hash) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth_secret = excluded.auth_secret, session_id = excluded.session_id,
    platform = excluded.platform, label = excluded.label, last_seen_at = now(), revoked_at = null, revoke_reason = null, failures = 0
  returning id into id_;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (uid, 'user', 'push.subscribed', jsonb_build_object('subscription_id', id_, 'platform', p_platform));
  return id_;
end $$;

create or replace function public.push_unregister(p_subscription uuid, p_reason text default 'user') returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.push_subscriptions set revoked_at = now(), revoke_reason = left(coalesce(p_reason, 'user'), 40)
   where id = p_subscription and user_id = auth.uid() and revoked_at is null;
  if not found then return false; end if;
  delete from public.push_outbox where subscription_id = p_subscription and status = 'queued';
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'push.unsubscribed', jsonb_build_object('subscription_id', p_subscription));
  return true;
end $$;

-- Sign-out from this device: revoke every subscription bound to the current session.
create or replace function public.push_revoke_session() returns integer
language plpgsql security definer set search_path = '' as $$
declare n int; sid uuid;
begin
  if auth.uid() is null then return 0; end if;
  begin sid := nullif(auth.jwt() ->> 'session_id', '')::uuid; exception when others then sid := null; end;
  update public.push_subscriptions set revoked_at = now(), revoke_reason = 'signed_out' where user_id = auth.uid() and session_id = sid and revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Preferences: profiles.notifications.push (master switch) and push_<category> (per category); critical pushes (security, payments
-- failing, event cancelled, scanner conflicts) ignore preferences but never a revoked device.
create or replace function public.push_set_preference(p_category text, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text := case when p_category = 'all' then 'push' else 'push_' || p_category end; v jsonb;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_category !~ '^[a-z_]{2,40}$' or p_enabled is null then raise exception 'invalid_preference' using errcode = '22023'; end if;
  update public.profiles set notifications = coalesce(notifications, '{}') || jsonb_build_object(k, p_enabled) where id = auth.uid() returning notifications into v;
  return v;
end $$;

-- Service: queue a push to every live device of a user (preferences and session liveness applied). Returns rows queued.
create or replace function public.push_enqueue(p_user uuid, p_category text, p_title text, p_body text, p_url text, p_critical boolean default false, p_dedupe text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare prefs jsonb; n int;
begin
  select coalesce(notifications, '{}') into prefs from public.profiles where id = p_user;
  if not coalesce(p_critical, false) and (prefs ->> 'push' = 'false' or prefs ->> ('push_' || p_category) = 'false' or prefs ->> p_category = 'false') then return 0; end if;
  insert into public.push_outbox(user_id, subscription_id, category, title, body, url, critical, dedupe_key)
  select p_user, s.id, p_category, left(p_title, 60), left(coalesce(p_body, ''), 140), coalesce(p_url, '/'), coalesce(p_critical, false), p_dedupe
  from public.push_subscriptions s
  where s.user_id = p_user and s.revoked_at is null
    and (s.session_id is null or exists (select 1 from auth.sessions a where a.id = s.session_id and (a.not_after is null or a.not_after > now())))
  on conflict (subscription_id, dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Sender contract (app worker): claim queued rows (lease), then mark each result. 404/410 from the push service → device expired.
create or replace function public.push_claim(p_limit integer default 100) returns setof public.push_outbox
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_outbox where id in (select x.id from public.push_outbox x where x.status in ('sent', 'expired', 'skipped', 'blocked_external', 'failed')
    and x.created_at < now() - interval '30 days' limit 1000);
  return query update public.push_outbox o set status = 'sending', attempts = o.attempts + 1, lease_until = now() + interval '2 minutes'
    where o.id in (select x.id from public.push_outbox x where x.status = 'queued' or (x.status = 'sending' and x.lease_until < now())
      order by x.critical desc, x.created_at limit least(greatest(coalesce(p_limit, 100), 1), 500) for update skip locked)
    returning o.*;
end $$;

create or replace function public.push_mark(p_id uuid, p_status text, p_http integer default null, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare sub uuid;
begin
  if p_status not in ('sent', 'failed', 'blocked_external', 'skipped') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.push_outbox set status = case when p_http in (404, 410) then 'expired' when p_status = 'failed' and attempts < 5 then 'queued' else p_status end,
    sent_at = case when p_status = 'sent' then now() end, error = left(p_error, 300), lease_until = null
  where id = p_id returning subscription_id into sub;
  if p_http in (404, 410) then update public.push_subscriptions set revoked_at = now(), revoke_reason = 'expired' where id = sub and revoked_at is null;
  elsif p_status = 'failed' then update public.push_subscriptions set failures = failures + 1 where id = sub;
  elsif p_status = 'sent' then update public.push_subscriptions set failures = 0, last_seen_at = now() where id = sub;
  end if;
end $$;

-- Readiness (admin/ops): device and queue counts; configuration is reported by the app (env), never stored here.
create or replace function public.push_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_platform_admin() or coalesce(auth.role(), '') = 'service_role' or coalesce(auth.role(), '') not in ('authenticated', 'anon')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object('devices_active', (select count(*) from public.push_subscriptions where revoked_at is null),
    'devices_revoked', (select count(*) from public.push_subscriptions where revoked_at is not null),
    'queue', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.push_outbox group by status) s),
    'oldest_queued', (select min(created_at) from public.push_outbox where status = 'queued'));
end $$;

-- Erasure: user deletion cascades (auth.users FK); explicit data export lists devices without endpoints.
insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('push.subscribed', 1, 'push_subscription', 'A browser registered for push notifications (payload: subscription_id, platform).', null),
  ('push.unsubscribed', 1, 'push_subscription', 'A push registration was removed by its owner (payload: subscription_id).', null)
on conflict (event_type) do update set description = excluded.description;

-- Retention: finished push rows are dropped after 30 days by the sender's claim (bounded batch); no retention_apply handler needed.

revoke all on function public.push_endpoint_allowed(text), public.push_register(text, text, text, text, text), public.push_unregister(uuid, text), public.push_revoke_session(),
  public.push_set_preference(text, boolean), public.push_enqueue(uuid, text, text, text, text, boolean, text), public.push_claim(integer), public.push_mark(uuid, text, integer, text),
  public.push_health() from public, anon, authenticated;
grant execute on function public.push_register(text, text, text, text, text), public.push_unregister(uuid, text), public.push_revoke_session(),
  public.push_set_preference(text, boolean), public.push_health(), public.push_endpoint_allowed(text) to authenticated, service_role;
grant execute on function public.push_enqueue(uuid, text, text, text, text, boolean, text), public.push_claim(integer), public.push_mark(uuid, text, integer, text) to service_role;
