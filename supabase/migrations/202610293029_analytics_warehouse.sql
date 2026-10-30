-- Q35 (lane C): analytics event model, warehouse facts, dimensions, metric definitions as data, KPI snapshots, exports.
-- Domains 223–228 (product/event/ticket/marketplace/provider/finance analytics), 265 (analytics warehouse), 266 (reporting warehouse).
--
-- Principles
--  * Facts are DERIVED from canonical tables (ledger, checkout orders, tickets, check-ins, bookings, quotes, requests, agent runs,
--    AI usage) by an idempotent day-bounded rebuild. Dashboards read facts/snapshots, never giant transactional scans.
--  * Every fact row carries is_demo (is_demo_workspace() or is_test_fixture). Platform reporting excludes demo by default
--    (card 282); a workspace always sees its own numbers.
--  * Product events (analytics_events) contain no PII: pseudonymous ids are HMACs keyed by a service-only key; anonymous visitors
--    get a daily-rotating id (no cookie); a stable id only with recorded consent. Raw events are retained 395 days.
--  * Metric formulas are data (metric_definitions, immutable versions + active pointer) evaluated by a whitelisted interpreter.
-- Additive and idempotent; new functions only, plus one extra branch in retention_apply (full body re-declared, nothing else changed).

-- ── 1. Pseudonymisation key (service only) ────────────────────────────────────────────────────────────────────────────
create table if not exists public.analytics_keys (
  id smallint primary key default 1 check (id = 1),
  pseudonym_key bytea not null default extensions.gen_random_bytes(32),
  rotated_at timestamptz not null default now()
);
alter table public.analytics_keys enable row level security;
revoke all on table public.analytics_keys from public, anon, authenticated;
insert into public.analytics_keys(id) values (1) on conflict (id) do nothing;
insert into public.secret_metadata(name, purpose, store, rotate_every_days)
values ('ANALYTICS_PSEUDONYM_KEY', 'HMAC key for pseudonymous analytics ids (held in public.analytics_keys, service role only). Rotation breaks id continuity by design.', 'supabase_vault', 365)
on conflict (name) do nothing;

create or replace function public.analytics_pseudonym(p_subject text) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_subject is null or p_subject = '' then null
    else encode(extensions.hmac(convert_to(p_subject, 'UTF8'), (select pseudonym_key from public.analytics_keys where id = 1), 'sha256'), 'hex') end;
$$;

-- ── 2. Event definitions (what may be captured) and raw events ───────────────────────────────────────────────────────
create table if not exists public.analytics_event_definitions (
  event_name text primary key check (event_name ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  category text not null check (category in ('page', 'feature', 'funnel', 'search', 'marketplace', 'ticketing', 'device', 'experiment')),
  description text not null default '',
  allowed_props text[] not null default '{}',
  source text not null default 'client' check (source in ('client', 'server')),
  stable_id_requires_consent boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.analytics_event_definitions enable row level security;
drop policy if exists analytics_event_definitions_admin_read on public.analytics_event_definitions;
create policy analytics_event_definitions_admin_read on public.analytics_event_definitions for select to authenticated using (public.has_admin_permission('analytics'));
revoke all on table public.analytics_event_definitions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.analytics_event_definitions from authenticated;

insert into public.analytics_event_definitions(event_name, category, description, allowed_props, source) values
  ('page.viewed', 'page', 'A route was viewed (route template, never ids/tokens/query).', '{surface,ref_kind}', 'client'),
  ('feature.used', 'feature', 'A named feature/control was used.', '{feature,surface,variant}', 'client'),
  ('search.performed', 'search', 'A marketplace/discover search ran (category/city/result count only, never free text).', '{surface,category,city,result_count,has_filters}', 'client'),
  ('listing.viewed', 'marketplace', 'A public listing page was viewed.', '{category,city}', 'client'),
  ('event.viewed', 'ticketing', 'A public event page was viewed.', '{event_type,city}', 'client'),
  ('checkout.started', 'funnel', 'Ticket checkout started.', '{tier_count,quantity}', 'client'),
  ('checkout.completed', 'funnel', 'Ticket checkout reached the confirmation page.', '{quantity}', 'client'),
  ('signup.started', 'funnel', 'Sign-up form opened.', '{account_type}', 'client'),
  ('signup.completed', 'funnel', 'Account created.', '{account_type}', 'server'),
  ('onboarding.step_completed', 'funnel', 'An onboarding step was completed.', '{step,account_type}', 'client'),
  ('request.started', 'funnel', 'A marketplace request wizard was opened.', '{category,step}', 'client'),
  ('request.submitted', 'funnel', 'A marketplace request was submitted.', '{category}', 'client'),
  ('wallet.opened', 'ticketing', 'The ticket wallet was opened (online or offline).', '{offline}', 'client'),
  ('scanner.opened', 'device', 'The scanner was opened.', '{offline,camera}', 'client'),
  ('pwa.installed', 'device', 'The app was installed (appinstalled).', '{platform}', 'client'),
  ('pwa.offline_used', 'device', 'An offline surface was used.', '{surface}', 'client'),
  ('pwa.updated', 'device', 'A new service worker took control after the user accepted the update.', '{}', 'client')
on conflict (event_name) do update set category = excluded.category, description = excluded.description, allowed_props = excluded.allowed_props,
  source = excluded.source, updated_at = now();

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null references public.analytics_event_definitions(event_name),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  subject_id text not null,                      -- HMAC pseudonym: stable (consented user) or daily-rotating visitor id
  subject_kind text not null check (subject_kind in ('user', 'visitor_daily')),
  workspace_id uuid references public.workspaces(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  path text not null default '' check (length(path) <= 200 and path !~ '[?#@]'),
  ref_host text not null default '' check (length(ref_host) <= 120),
  utm jsonb not null default '{}' check (jsonb_typeof(utm) = 'object'),
  device text not null default 'unknown' check (device in ('mobile', 'tablet', 'desktop', 'unknown')),
  standalone boolean not null default false,
  props jsonb not null default '{}' check (jsonb_typeof(props) = 'object'),
  consent text not null check (consent in ('granted', 'denied', 'unknown')),
  is_demo boolean not null default false,
  correlation_id text
);
create index if not exists analytics_events_occurred_idx on public.analytics_events(occurred_at);
create index if not exists analytics_events_name_day_idx on public.analytics_events(event_name, occurred_at);
create index if not exists analytics_events_ws_idx on public.analytics_events(workspace_id, occurred_at) where workspace_id is not null;
create index if not exists analytics_events_event_idx on public.analytics_events(event_id, occurred_at) where event_id is not null;
create index if not exists analytics_events_subject_idx on public.analytics_events(subject_id, occurred_at);
alter table public.analytics_events enable row level security;
revoke all on table public.analytics_events from public, anon, authenticated;

-- PII guard for prop values: short scalar only, no e-mail, phone-like digit runs, URLs, tokens or long strings.
create or replace function public.analytics_clean_props(p_props jsonb, p_allowed text[]) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; out jsonb := '{}'; s text;
begin
  if p_props is null or jsonb_typeof(p_props) <> 'object' then return '{}'; end if;
  for k, v in select * from jsonb_each(p_props) loop
    if not (k = any(p_allowed)) then continue; end if;
    if jsonb_typeof(v) in ('number', 'boolean') then out := out || jsonb_build_object(k, v); continue; end if;
    if jsonb_typeof(v) <> 'string' then continue; end if;
    s := v #>> '{}';
    if length(s) > 64 or s ~ '@' or s ~ '[0-9][0-9 ()+-]{6,}' or s ~* '^https?:' or s ~ '[A-Za-z0-9_-]{24,}' then continue; end if;
    out := out || jsonb_build_object(k, s);
  end loop;
  return out;
end $$;

-- Normalises a path to a route template: strips query/hash, replaces ids and token segments, collapses token-page tails.
create or replace function public.analytics_normalise_path(p_path text) returns text
language plpgsql immutable set search_path = '' as $$
declare p text := coalesce(p_path, '');
begin
  p := split_part(split_part(p, '?', 1), '#', 1);
  if p !~ '^/' then return ''; end if;
  -- Token-bearing surfaces never keep their tail.
  if p ~ '^/(pay|portal|p|proposal|proposals/share|contract|contracts/sign|rsvp|invite|invites|r|ref|guest|share|t|reset-password|auth/callback)(/|$)' then
    return regexp_replace(p, '^(/[^/]+).*$', '\1/:token');
  end if;
  p := regexp_replace(p, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g');
  p := regexp_replace(p, '/[A-Za-z0-9_-]{20,}', '/:token', 'g');
  p := regexp_replace(p, '/[0-9]{3,}', '/:n', 'g');
  p := regexp_replace(p, '@', '', 'g');
  return left(p, 200);
end $$;

create or replace function public.analytics_user_is_demo(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select lower(split_part(u.email, '@', 2)) ~ '(^|\.)(test|example|invalid|localhost)$|^example\.(com|org|net)$'
    from auth.users u where u.id = p_user), false);
$$;

create or replace function public.analytics_workspace_is_demo(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_workspace is not null and (public.is_demo_workspace(p_workspace)
    or coalesce((select w.is_test_fixture from public.workspaces w where w.id = p_workspace), false));
$$;

-- Server-side capture (route handler with the service role). ctx: user_id, visitor_hash (sha256 of ip|ua, never stored), consent,
-- workspace_id, device, standalone, ref_host, utm, correlation_id. Returns {accepted, dropped}. Max 50 events per call.
create or replace function public.analytics_capture(p_events jsonb, p_ctx jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e jsonb; d public.analytics_event_definitions; uid uuid; ws uuid; consent text; subj text; kind text; acc int := 0; drp int := 0;
  occ timestamptz; demo boolean; ev uuid; li uuid; utm jsonb := '{}'; k text;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then raise exception 'invalid_events' using errcode = '22023'; end if;
  if jsonb_array_length(p_events) > 50 then raise exception 'too_many_events' using errcode = '22023'; end if;
  consent := case when p_ctx ->> 'consent' in ('granted', 'denied') then p_ctx ->> 'consent' else 'unknown' end;
  begin uid := nullif(p_ctx ->> 'user_id', '')::uuid; exception when others then uid := null; end;
  begin ws := nullif(p_ctx ->> 'workspace_id', '')::uuid; exception when others then ws := null; end;
  -- A workspace is only attributed if the user is an active member (never trust the client).
  if ws is not null and (uid is null or not exists (select 1 from public.workspaces w where w.id = ws and (w.owner_id = uid
      or exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = uid and m.status = 'active')))) then ws := null; end if;
  if uid is not null and consent = 'granted' then subj := public.analytics_pseudonym('user:' || uid::text); kind := 'user';
  elsif coalesce(p_ctx ->> 'visitor_hash', '') ~ '^[0-9a-f]{64}$' then
    subj := public.analytics_pseudonym('visitor:' || (now() at time zone 'Europe/London')::date::text || ':' || (p_ctx ->> 'visitor_hash')); kind := 'visitor_daily';
  else return jsonb_build_object('accepted', 0, 'dropped', jsonb_array_length(p_events), 'reason', 'no_subject'); end if;
  demo := coalesce(public.analytics_user_is_demo(uid), false) or public.analytics_workspace_is_demo(ws);
  if jsonb_typeof(p_ctx -> 'utm') = 'object' then
    for k in select unnest(array['source', 'medium', 'campaign']) loop
      if coalesce(p_ctx -> 'utm' ->> k, '') ~ '^[A-Za-z0-9._-]{1,40}$' then utm := utm || jsonb_build_object(k, lower(p_ctx -> 'utm' ->> k)); end if;
    end loop;
  end if;
  for e in select * from jsonb_array_elements(p_events) loop
    select * into d from public.analytics_event_definitions where event_name = e ->> 'name' and active and source = 'client';
    if not found then drp := drp + 1; continue; end if;
    begin occ := (e ->> 'at')::timestamptz; exception when others then occ := now(); end;
    if occ is null or occ > now() + interval '5 minutes' or occ < now() - interval '3 days' then occ := now(); end if;
    begin ev := nullif(e ->> 'event_id', '')::uuid; exception when others then ev := null; end;
    begin li := nullif(e ->> 'listing_id', '')::uuid; exception when others then li := null; end;
    if ev is not null and not exists (select 1 from public.events x where x.id = ev) then ev := null; end if;
    if li is not null and not exists (select 1 from public.listings x where x.id = li) then li := null; end if;
    insert into public.analytics_events(event_name, occurred_at, subject_id, subject_kind, workspace_id, event_id, listing_id, path, ref_host, utm,
        device, standalone, props, consent, is_demo, correlation_id)
      values (d.event_name, occ, subj, kind, ws, ev, li, public.analytics_normalise_path(e ->> 'path'),
        left(lower(regexp_replace(coalesce(p_ctx ->> 'ref_host', ''), '[^A-Za-z0-9.-]', '', 'g')), 120), utm,
        case when p_ctx ->> 'device' in ('mobile', 'tablet', 'desktop') then p_ctx ->> 'device' else 'unknown' end,
        coalesce((p_ctx ->> 'standalone')::boolean, false), public.analytics_clean_props(e -> 'props', d.allowed_props), consent,
        demo or public.analytics_workspace_is_demo((select x.workspace_id from public.events x where x.id = ev)), left(p_ctx ->> 'correlation_id', 80));
    acc := acc + 1;
  end loop;
  return jsonb_build_object('accepted', acc, 'dropped', drp);
end $$;

-- Server-emitted product events (e.g. signup.completed) from trusted code paths.
create or replace function public.analytics_capture_server(p_event text, p_user uuid, p_workspace uuid, p_props jsonb default '{}') returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.analytics_event_definitions; consented boolean;
begin
  select * into d from public.analytics_event_definitions where event_name = p_event and active and source = 'server';
  if not found then return false; end if;
  consented := p_user is not null and coalesce((select c.granted from public.consent_records c where c.user_id = p_user and c.purpose = 'product_analytics'
    order by c.created_at desc, c.id desc limit 1), false);
  insert into public.analytics_events(event_name, occurred_at, subject_id, subject_kind, workspace_id, props, consent, is_demo)
  values (p_event, now(), public.analytics_pseudonym(case when consented then 'user:' || p_user::text
      else 'server-daily:' || current_date::text || ':' || coalesce(p_user::text, gen_random_uuid()::text) end),
    case when consented then 'user' else 'visitor_daily' end, p_workspace,
    public.analytics_clean_props(p_props, d.allowed_props), case when consented then 'granted' else 'unknown' end,
    public.analytics_user_is_demo(p_user) or public.analytics_workspace_is_demo(p_workspace));
  return true;
end $$;

-- Consent lookup for the capture route (signed-in users): latest product_analytics consent record.
create or replace function public.analytics_consent_for(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when c.granted then 'granted' else 'denied' end from public.consent_records c
    where c.user_id = p_user and c.purpose = 'product_analytics' order by c.created_at desc, c.id desc limit 1), 'unknown');
$$;

-- Erasure: when privacy erasure completes, the user's stable pseudonymous events are deleted (daily ids are unlinkable already).
create or replace function public.analytics_forget_user(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.analytics_events where subject_kind = 'user' and subject_id = public.analytics_pseudonym('user:' || p_user::text);
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.analytics_on_user_erased() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.analytics_forget_user((new.metadata ->> 'user')::uuid);
  exception when others then null;  -- never block the erasure audit row
  end;
  return new;
end $$;
drop trigger if exists analytics_user_erased on public.audit_events;
create trigger analytics_user_erased after insert on public.audit_events
  for each row when (new.event = 'privacy.user_erased') execute function public.analytics_on_user_erased();

-- ── 3. Dimensions (views over canonical tables; no duplicate copies) ─────────────────────────────────────────────────
create or replace view public.analytics_dim_workspace with (security_invoker = true) as
  select w.id as workspace_id, w.kind, coalesce(w.plan, 'starter') as plan, w.data_region, w.status, w.verification_status,
    (w.created_at at time zone 'Europe/London')::date as created_day, public.analytics_workspace_is_demo(w.id) as is_demo
  from public.workspaces w;
create or replace view public.analytics_dim_event with (security_invoker = true) as
  select e.id as event_id, e.workspace_id, e.event_type, e.city, e.status, e.visibility, (e.starts_at at time zone 'Europe/London')::date as starts_day,
    e.capacity, (select coalesce(sum(t.quantity), 0) from public.ticket_tiers t where t.event_id = e.id and coalesce(t.kind, '') <> 'comp') as ticket_capacity,
    public.analytics_workspace_is_demo(e.workspace_id) as is_demo
  from public.events e;
create or replace view public.analytics_dim_listing with (security_invoker = true) as
  select l.id as listing_id, l.workspace_id, l.kind, l.category, l.city, l.published, l.review_status, l.verified,
    public.analytics_workspace_is_demo(l.workspace_id) as is_demo
  from public.listings l;
-- Internal: read by the SECURITY DEFINER metric/report functions only.
revoke all on public.analytics_dim_workspace, public.analytics_dim_event, public.analytics_dim_listing from public, anon, authenticated;

-- ── 4. Fact tables (daily grain, Europe/London day) ──────────────────────────────────────────────────────────────────
create table if not exists public.fact_payment_daily (
  day date not null, workspace_id uuid, kind text not null, basis text not null,
  gmv_minor bigint not null default 0, seller_fee_minor bigint not null default 0, platform_fee_net_minor bigint not null default 0,
  vat_minor bigint not null default 0, refunds_minor bigint not null default 0, disputes_minor bigint not null default 0,
  own_sale_revenue_minor bigint not null default 0, platform_cash_minor bigint not null default 0, transactions integer not null default 0,
  is_demo boolean not null default false, built_at timestamptz not null default now()
);
create unique index if not exists fact_payment_daily_key on public.fact_payment_daily(day, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, basis);
create index if not exists fact_payment_daily_ws on public.fact_payment_daily(workspace_id, day);

create table if not exists public.fact_ticket_daily (
  day date not null, workspace_id uuid, event_id uuid not null, tier_id uuid, channel text not null default 'direct',
  tickets_issued integer not null default 0, gross_minor bigint not null default 0, tickets_refunded integer not null default 0,
  refunded_minor bigint not null default 0, admitted integer not null default 0, admitted_unique integer not null default 0, scans_rejected integer not null default 0,
  resale_listed integer not null default 0, resale_sold integer not null default 0, resale_minor bigint not null default 0,
  is_demo boolean not null default false, built_at timestamptz not null default now()
);
create unique index if not exists fact_ticket_daily_key on public.fact_ticket_daily(day, event_id, coalesce(tier_id, '00000000-0000-0000-0000-000000000000'::uuid), channel);
create index if not exists fact_ticket_daily_ws on public.fact_ticket_daily(workspace_id, day);
create index if not exists fact_ticket_daily_event on public.fact_ticket_daily(event_id, day);

create table if not exists public.fact_event_daily (
  day date not null, workspace_id uuid, event_id uuid not null,
  page_views integer not null default 0, unique_visitors integer not null default 0,
  merch_orders integer not null default 0, merch_gross_minor bigint not null default 0,
  supplier_bookings integer not null default 0, supplier_committed_minor bigint not null default 0,
  is_demo boolean not null default false, built_at timestamptz not null default now(),
  primary key (day, event_id)
);
create index if not exists fact_event_daily_ws on public.fact_event_daily(workspace_id, day);

create table if not exists public.fact_booking_daily (
  day date not null, workspace_id uuid, buyer_workspace_id uuid, category text not null default '', city text not null default '',
  requests_created integer not null default 0, requests_quoted integer not null default 0, requests_expired integer not null default 0,
  quotes_sent integer not null default 0, bookings_created integer not null default 0, bookings_confirmed integer not null default 0,
  bookings_cancelled integer not null default 0, bookings_expired integer not null default 0,
  booking_value_minor bigint not null default 0, confirmed_value_minor bigint not null default 0,
  is_demo boolean not null default false, built_at timestamptz not null default now()
);
create unique index if not exists fact_booking_daily_key on public.fact_booking_daily(day, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(buyer_workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), category, city);
create index if not exists fact_booking_daily_ws on public.fact_booking_daily(workspace_id, day);
create index if not exists fact_booking_daily_buyer on public.fact_booking_daily(buyer_workspace_id, day);

create table if not exists public.fact_agent_daily (
  day date not null, workspace_id uuid,
  runs_started integer not null default 0, runs_completed integer not null default 0, runs_failed integer not null default 0,
  ai_calls integer not null default 0, credits numeric not null default 0, provider_cost_minor numeric not null default 0,
  overage_credits numeric not null default 0, is_demo boolean not null default false, built_at timestamptz not null default now()
);
create unique index if not exists fact_agent_daily_key on public.fact_agent_daily(day, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.fact_product_daily (
  day date not null, workspace_id uuid, event_name text not null, path text not null default '', device text not null default 'unknown',
  events integer not null default 0, subjects integer not null default 0, consented_subjects integer not null default 0,
  is_demo boolean not null default false, built_at timestamptz not null default now()
);
create unique index if not exists fact_product_daily_key on public.fact_product_daily(day, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), event_name, path, device, is_demo);

do $$ declare t text; begin
  foreach t in array array['fact_payment_daily', 'fact_ticket_daily', 'fact_event_daily', 'fact_booking_daily', 'fact_agent_daily', 'fact_product_daily'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;

create table if not exists public.analytics_build_runs (
  id uuid primary key default gen_random_uuid(),
  day_from date not null, day_to date not null, started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  rows jsonb not null default '{}', error text, triggered_by text not null default 'system'
);
alter table public.analytics_build_runs enable row level security;
drop policy if exists analytics_build_runs_admin_read on public.analytics_build_runs;
create policy analytics_build_runs_admin_read on public.analytics_build_runs for select to authenticated using (public.has_admin_permission('analytics'));
revoke all on table public.analytics_build_runs from anon;
revoke insert, update, delete, truncate, references, trigger on table public.analytics_build_runs from authenticated;

-- Rebuilds every fact for one London day (delete + insert inside the caller's transaction; idempotent, bounded by day).
create or replace function public.analytics_build_day(p_day date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare lo timestamptz := (p_day::timestamp at time zone 'Europe/London'); hi timestamptz := ((p_day + 1)::timestamp at time zone 'Europe/London');
  n_pay int; n_tix int; n_evt int; n_bk int; n_ag int; n_pr int;
begin
  perform public.advisory_xact_lock('analytics.build', p_day::text);
  delete from public.fact_payment_daily where day = p_day;
  insert into public.fact_payment_daily(day, workspace_id, kind, basis, gmv_minor, seller_fee_minor, platform_fee_net_minor, vat_minor, refunds_minor,
      disputes_minor, own_sale_revenue_minor, platform_cash_minor, transactions, is_demo)
  select p_day, t.workspace_id, t.kind, coalesce(t.basis, 'legacy'),
    -- GMV: direct charges = −merchant_gmv; legacy platform collection = gross cash in on sale kinds (+ −customer_payment for legacy bookings).
    coalesce(sum(case when e.account = 'merchant_gmv' then -e.amount_minor
                      when t.basis is null and t.kind in ('ticket_order', 'ticket_resale', 'deposit') and e.account = 'cash_stripe' then e.amount_minor
                      when t.basis is null and t.kind = 'booking_payment' and e.account = 'customer_payment' then -e.amount_minor else 0 end), 0),
    coalesce(sum(case when e.account = 'seller_application_fees' then e.amount_minor else 0 end), 0),
    coalesce(sum(case when e.account = 'platform_fee' then -e.amount_minor else 0 end), 0),
    coalesce(sum(case when e.account = 'tax_payable' then -e.amount_minor else 0 end), 0),
    coalesce(sum(case when e.account in ('seller_refunds', 'refunds') then e.amount_minor else 0 end), 0),
    coalesce(sum(case when e.account in ('seller_disputes', 'disputes') then e.amount_minor else 0 end), 0),
    coalesce(sum(case when e.account = 'platform_revenue' then -e.amount_minor else 0 end), 0),
    coalesce(sum(case when e.account = 'cash_stripe' then e.amount_minor else 0 end), 0),
    count(distinct t.id), public.analytics_workspace_is_demo(t.workspace_id)
  from public.ledger_transactions t join public.ledger_entries e on e.transaction_id = t.id
  where t.posted_at >= lo and t.posted_at < hi
  group by t.workspace_id, t.kind, coalesce(t.basis, 'legacy');
  get diagnostics n_pay = row_count;

  delete from public.fact_ticket_daily where day = p_day;
  insert into public.fact_ticket_daily(day, workspace_id, event_id, tier_id, channel, tickets_issued, gross_minor, tickets_refunded, refunded_minor,
      admitted, admitted_unique, scans_rejected, resale_listed, resale_sold, resale_minor, is_demo)
  select p_day, ev.workspace_id, x.event_id, x.tier_id, x.channel, sum(x.issued)::int, sum(x.gross)::bigint, sum(x.refunded)::int, sum(x.refunded_minor)::bigint,
    sum(x.admitted)::int, sum(x.au)::int, sum(x.rejected)::int, sum(x.listed)::int, sum(x.sold)::int, sum(x.resale_minor)::bigint, public.analytics_workspace_is_demo(ev.workspace_id)
  from (
    -- Issued entitlements (same rule as ticket_sales_series: excludes replacement copies and transfers).
    select t.event_id, t.tier_id, coalesce(nullif(co.ref_channel, ''), case when co.ref_code is not null then 'referral' when co.order_ref is null then 'manual' else 'direct' end) channel,
      1 issued, round(coalesce(t.price_paid, 0) * 100) gross, 0 refunded, 0 refunded_minor, 0 admitted, 0 au, 0 rejected, 0 listed, 0 sold, 0 resale_minor
    from public.tickets t left join public.checkout_orders co on co.order_ref = t.order_ref
    where t.created_at >= lo and t.created_at < hi and t.replaced_by is null and coalesce(t.order_ref, '') not like '%-T'
    union all
    -- Refund reversals land on the refund day (late reversals of earlier sales).
    select t.event_id, t.tier_id, coalesce(nullif(co.ref_channel, ''), case when co.ref_code is not null then 'referral' else 'direct' end), 0, 0, 1, round(coalesce(t.price_paid, 0) * 100), 0, 0, 0, 0, 0, 0
    from public.checkout_orders co join public.tickets t on t.order_ref = co.order_ref
    where co.refunded_at >= lo and co.refunded_at < hi and t.replaced_by is null
    union all
    -- admitted_unique: the ticket's FIRST admission happened on this day (additive across days; multi-day re-entry not double counted).
    select c.event_id, t.tier_id, 'scan', 0, 0, 0, 0, case when c.result in ('admitted', 'readmitted') then 1 else 0 end,
      case when c.result in ('admitted', 'readmitted') and c.ticket_id is not null and not exists (select 1 from public.check_ins c2 where c2.ticket_id = c.ticket_id
        and c2.result in ('admitted', 'readmitted') and (c2.created_at < c.created_at or (c2.created_at = c.created_at and c2.id < c.id))) then 1 else 0 end,
      case when c.result in ('admitted', 'readmitted') then 0 else 1 end, 0, 0, 0
    from public.check_ins c left join public.tickets t on t.id = c.ticket_id
    where c.created_at >= lo and c.created_at < hi and c.event_id is not null
    union all
    select r.event_id, t.tier_id, 'resale', 0, 0, 0, 0, 0, 0, 0, case when r.listed_at >= lo and r.listed_at < hi then 1 else 0 end,
      case when r.status = 'sold' and r.closed_at >= lo and r.closed_at < hi then 1 else 0 end,
      case when r.status = 'sold' and r.closed_at >= lo and r.closed_at < hi then r.price_minor else 0 end
    from public.ticket_resale_listings r left join public.tickets t on t.id = r.ticket_id
    where (r.listed_at >= lo and r.listed_at < hi) or (r.closed_at >= lo and r.closed_at < hi)
  ) x join public.events ev on ev.id = x.event_id
  group by ev.workspace_id, x.event_id, x.tier_id, x.channel;
  get diagnostics n_tix = row_count;

  delete from public.fact_event_daily where day = p_day;
  insert into public.fact_event_daily(day, workspace_id, event_id, page_views, unique_visitors, merch_orders, merch_gross_minor, supplier_bookings, supplier_committed_minor, is_demo)
  select p_day, ev.workspace_id, x.event_id, sum(x.pv)::int, sum(x.uv)::int, sum(x.mo)::int, sum(x.mg)::bigint, sum(x.sb)::int, sum(x.sc)::bigint,
    public.analytics_workspace_is_demo(ev.workspace_id)
  from (
    select m.event_id, m.page_views pv, m.unique_visitors uv, 0 mo, 0 mg, 0 sb, 0 sc from public.event_metrics_daily m where m.day = p_day
    union all
    select a.event_id, count(*), count(distinct a.subject_id), 0, 0, 0, 0 from public.analytics_events a
      where a.event_name = 'event.viewed' and a.event_id is not null and a.occurred_at >= lo and a.occurred_at < hi group by a.event_id
    union all
    select o.event_id, 0, 0, 1, o.total_minor, 0, 0 from public.merch_orders o
      where o.event_id is not null and o.paid_at >= lo and o.paid_at < hi
    union all
    select b.event_id, 0, 0, 0, 0, 1, round(coalesce(b.amount, 0) * 100) from public.bookings b
      where b.event_id is not null and b.created_at >= lo and b.created_at < hi
        and coalesce(b.status, '') in ('confirmed', 'completed', 'completion_pending', 'active')
  ) x join public.events ev on ev.id = x.event_id
  group by ev.workspace_id, x.event_id;
  get diagnostics n_evt = row_count;

  delete from public.fact_booking_daily where day = p_day;
  insert into public.fact_booking_daily(day, workspace_id, buyer_workspace_id, category, city, requests_created, requests_quoted, requests_expired, quotes_sent,
      bookings_created, bookings_confirmed, bookings_cancelled, bookings_expired, booking_value_minor, confirmed_value_minor, is_demo)
  select p_day, x.seller, x.buyer, coalesce(x.category, ''), coalesce(x.city, ''), sum(x.rc)::int, sum(x.rq)::int, sum(x.rx)::int, sum(x.qs)::int,
    sum(x.bc)::int, sum(x.bf)::int, sum(x.bx)::int, sum(x.be)::int, sum(x.bv)::bigint, sum(x.cv)::bigint,
    public.analytics_workspace_is_demo(x.seller) or public.analytics_workspace_is_demo(x.buyer)
  from (
    -- Marketplace requests (cohort by created day; status as of the build).
    select null::uuid seller, ev.workspace_id buyer, lower(r.category) category, ev.city, 1 rc,
      case when r.status = 'quote_received' then 1 else 0 end rq, case when r.status like 'expired%' then 1 else 0 end rx, 0 qs, 0 bc, 0 bf, 0 bx, 0 be, 0 bv, 0 cv
    from public.provider_requests r left join public.events ev on ev.id = r.event_id where r.created_at >= lo and r.created_at < hi
    union all
    select q.workspace_id, null, '', '', 0, 0, 0, 1, 0, 0, 0, 0, 0, 0 from public.provider_quotes q where q.sent_at >= lo and q.sent_at < hi
    union all
    select b.seller_workspace_id, b.buyer_workspace_id, lower(coalesce(l.category, b.role, '')), coalesce(l.city, ''), 0, 0, 0, 0, 1,
      case when b.status in ('confirmed', 'completed', 'completion_pending', 'active') then 1 else 0 end,
      case when b.status = 'cancelled' then 1 else 0 end, case when b.status = 'expired' then 1 else 0 end,
      round(coalesce(b.amount, 0) * 100), case when b.status in ('confirmed', 'completed', 'completion_pending', 'active') then round(coalesce(b.amount, 0) * 100) else 0 end
    from public.bookings b left join public.listings l on l.id = b.listing_id where b.created_at >= lo and b.created_at < hi
  ) x
  group by x.seller, x.buyer, coalesce(x.category, ''), coalesce(x.city, '');
  get diagnostics n_bk = row_count;

  delete from public.fact_agent_daily where day = p_day;
  insert into public.fact_agent_daily(day, workspace_id, runs_started, runs_completed, runs_failed, ai_calls, credits, provider_cost_minor, overage_credits, is_demo)
  select p_day, x.ws, sum(x.rs)::int, sum(x.rc)::int, sum(x.rf)::int, sum(x.calls)::int, sum(x.cr), sum(x.cost), sum(x.ov), public.analytics_workspace_is_demo(x.ws)
  from (
    select r.workspace_id ws, 1 rs, case when r.status = 'completed' then 1 else 0 end rc, case when r.status = 'failed' then 1 else 0 end rf, 0 calls, 0::numeric cr, 0::numeric cost, 0::numeric ov
    from public.agent_runs r where r.created_at >= lo and r.created_at < hi
    union all
    select u.workspace_id, 0, 0, 0, 1, coalesce(u.credits, 0), coalesce(u.cost_gbp_minor, 0), coalesce(u.overage, 0)
    from public.ai_usage_events u where u.created_at >= lo and u.created_at < hi
  ) x group by x.ws;
  get diagnostics n_ag = row_count;

  delete from public.fact_product_daily where day = p_day;
  insert into public.fact_product_daily(day, workspace_id, event_name, path, device, events, subjects, consented_subjects, is_demo)
  select p_day, a.workspace_id, a.event_name, a.path, a.device, count(*), count(distinct a.subject_id), count(distinct a.subject_id) filter (where a.subject_kind = 'user'), a.is_demo
  from public.analytics_events a where a.occurred_at >= lo and a.occurred_at < hi
  group by a.workspace_id, a.event_name, a.path, a.device, a.is_demo;
  get diagnostics n_pr = row_count;

  return jsonb_build_object('day', p_day, 'payment', n_pay, 'ticket', n_tix, 'event', n_evt, 'booking', n_bk, 'agent', n_ag, 'product', n_pr);
end $$;

-- Rebuilds a bounded range (max 400 days per call) and records the run. Default nightly window: 35 days (late events,
-- refund reversals and cohort status changes inside that window are picked up; older days are stable).
create or replace function public.analytics_build_range(p_from date, p_to date, p_trigger text default 'system') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d date; rid uuid; res jsonb := '{}';
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  if p_to - p_from > 400 then raise exception 'range_too_large' using errcode = '22023'; end if;
  insert into public.analytics_build_runs(day_from, day_to, triggered_by) values (p_from, p_to, left(coalesce(p_trigger, 'system'), 40)) returning id into rid;
  d := p_from;
  while d <= p_to loop
    res := res || jsonb_build_object(d::text, public.analytics_build_day(d));
    d := d + 1;
  end loop;
  update public.analytics_build_runs set finished_at = now(), status = 'succeeded', rows = res where id = rid;
  return jsonb_build_object('run_id', rid, 'days', p_to - p_from + 1);
end $$;

create or replace function public.job_analytics_build_facts(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Europe/London')::date; w int := least(greatest(coalesce((p_job.payload ->> 'days')::int, 35), 1), 400);
begin
  return public.analytics_build_range(today - w + 1, today, 'job');
end $$;

-- Admin backfill/rebuild (audited).
create or replace function public.admin_analytics_rebuild(p_from date, p_to date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public.admin_require('analytics', p_reason);
  r := public.analytics_build_range(p_from, p_to, 'admin');
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'analytics.rebuilt',
    jsonb_build_object('from', p_from, 'to', p_to, 'reason', p_reason, 'run_id', r ->> 'run_id'));
  return r;
end $$;

-- ── 5. Metric definitions as data (immutable versions + active pointer) ─────────────────────────────────────────────
create table if not exists public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  version integer not null check (version >= 1),
  name text not null,
  description text not null default '',
  domain text not null check (domain in ('product', 'event', 'ticket', 'marketplace', 'provider', 'finance', 'agent')),
  unit text not null check (unit in ('count', 'minor_gbp', 'ratio', 'credits')),
  audience text not null default 'workspace_member' check (audience in ('workspace_member', 'workspace_finance', 'platform_admin')),
  spec jsonb not null,
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  created_by uuid, created_at timestamptz not null default now(),
  unique (key, version)
);
create table if not exists public.metric_definition_active (
  key text primary key, version integer not null, activated_at timestamptz not null default now(), activated_by uuid,
  foreign key (key, version) references public.metric_definitions(key, version)
);
create or replace function public.metric_definitions_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'metric_definitions_append_only' using errcode = '42501'; end if;
  -- Only the lifecycle status may change; the formula of a version never changes (new version instead).
  if new.spec is distinct from old.spec or new.key <> old.key or new.version <> old.version or new.unit <> old.unit then
    raise exception 'metric_definition_versions_are_immutable' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists metric_definitions_immutable on public.metric_definitions;
create trigger metric_definitions_immutable before update or delete on public.metric_definitions for each row execute function public.metric_definitions_immutable();
alter table public.metric_definitions enable row level security;
alter table public.metric_definition_active enable row level security;
drop policy if exists metric_definitions_read on public.metric_definitions;
create policy metric_definitions_read on public.metric_definitions for select to authenticated using (status <> 'draft' or public.has_admin_permission('analytics'));
drop policy if exists metric_definition_active_read on public.metric_definition_active;
create policy metric_definition_active_read on public.metric_definition_active for select to authenticated using (true);
revoke all on table public.metric_definitions, public.metric_definition_active from anon;
revoke insert, update, delete, truncate, references, trigger on table public.metric_definitions, public.metric_definition_active from authenticated;

-- Spec grammar (validated): {"type":"sum","fact":"<fact table>","measures":["col",...],"filter":{"col":["v",...]}}
--   {"type":"ratio","numerator":<sum spec>,"denominator":<sum spec>}   {"type":"function","name":"analytics_m_<x>"}
create or replace function public.analytics_fact_columns(p_fact text) returns text[]
language sql stable set search_path = '' as $$
  select coalesce(array_agg(column_name::text), '{}') from information_schema.columns
  where table_schema = 'public' and table_name = p_fact
    and p_fact in ('fact_payment_daily', 'fact_ticket_daily', 'fact_event_daily', 'fact_booking_daily', 'fact_agent_daily', 'fact_product_daily');
$$;

create or replace function public.analytics_validate_spec(p_spec jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare cols text[]; m text; k text;
begin
  case p_spec ->> 'type'
  when 'sum' then
    cols := public.analytics_fact_columns(p_spec ->> 'fact');
    if cardinality(cols) = 0 then raise exception 'invalid_fact:%', p_spec ->> 'fact' using errcode = '22023'; end if;
    if jsonb_typeof(p_spec -> 'measures') <> 'array' or jsonb_array_length(p_spec -> 'measures') = 0 then raise exception 'invalid_measures' using errcode = '22023'; end if;
    for m in select jsonb_array_elements_text(p_spec -> 'measures') loop
      if not (m = any(cols)) or m in ('day', 'workspace_id', 'event_id', 'tier_id', 'is_demo', 'built_at') then raise exception 'invalid_measure:%', m using errcode = '22023'; end if;
    end loop;
    if p_spec ? 'filter' then
      for k in select jsonb_object_keys(p_spec -> 'filter') loop
        if not (k = any(cols)) then raise exception 'invalid_filter:%', k using errcode = '22023'; end if;
      end loop;
    end if;
  when 'ratio' then
    perform public.analytics_validate_spec(p_spec -> 'numerator');
    perform public.analytics_validate_spec(p_spec -> 'denominator');
  when 'function' then
    if coalesce(p_spec ->> 'name', '') !~ '^analytics_m_[a-z0-9_]+$' or not exists (select 1 from pg_proc where proname = p_spec ->> 'name' and pronamespace = 'public'::regnamespace) then
      raise exception 'invalid_function' using errcode = '22023';
    end if;
  else raise exception 'invalid_spec_type' using errcode = '22023';
  end case;
end $$;

-- Evaluates a sum spec over facts for [from, to] (London days). Workspace scope uses the fact's workspace_id
-- (booking facts: seller OR buyer side). Platform scope excludes demo unless p_include_demo.
create or replace function public.analytics_eval_sum(p_spec jsonb, p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare q text; m text; parts text[] := '{}'; k text; v numeric;
begin
  perform public.analytics_validate_spec(p_spec);
  for m in select jsonb_array_elements_text(p_spec -> 'measures') loop parts := parts || format('coalesce(sum(%I), 0)', m); end loop;
  q := format('select %s from public.%I where day between %L and %L', array_to_string(parts, ' + '), p_spec ->> 'fact', p_from, p_to);
  if p_workspace is not null then
    q := q || case when p_spec ->> 'fact' = 'fact_booking_daily' and coalesce(p_spec ->> 'side', 'seller') = 'buyer' then format(' and buyer_workspace_id = %L', p_workspace)
                   else format(' and workspace_id = %L', p_workspace) end;
  elsif not coalesce(p_include_demo, false) then q := q || ' and not is_demo';
  end if;
  if p_spec ? 'filter' then
    for k in select jsonb_object_keys(p_spec -> 'filter') loop
      q := q || format(' and %I::text = any(%L::text[])', k, (select array_agg(x) from jsonb_array_elements_text(p_spec -> 'filter' -> k) x));
    end loop;
  end if;
  execute q into v;
  return coalesce(v, 0);
end $$;

-- Function-type metrics (cohort/state metrics that are not additive over days). Same signature for all.
create or replace function public.analytics_m_ticket_sell_through(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  -- Events starting in the period: issued entitlements (all time) / sellable capacity (non-comp tier quantity).
  with ev as (select d.event_id, d.ticket_capacity from public.analytics_dim_event d
    where d.starts_day between p_from and p_to and (case when p_workspace is not null then d.workspace_id = p_workspace else coalesce(p_include_demo, false) or not d.is_demo end))
  select case when coalesce(sum(ev.ticket_capacity), 0) = 0 then null
    else round((select coalesce(sum(f.tickets_issued) - sum(f.tickets_refunded), 0) from public.fact_ticket_daily f where f.event_id in (select event_id from ev))::numeric / sum(ev.ticket_capacity), 4) end
  from ev;
$$;
create or replace function public.analytics_m_scan_rate(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  with ev as (select d.event_id from public.analytics_dim_event d
    where d.starts_day between p_from and p_to and (case when p_workspace is not null then d.workspace_id = p_workspace else coalesce(p_include_demo, false) or not d.is_demo end)),
  f as (select coalesce(sum(tickets_issued - tickets_refunded), 0) issued, coalesce(sum(admitted_unique), 0) admitted from public.fact_ticket_daily where event_id in (select event_id from ev))
  select case when issued <= 0 then null else round(least(admitted::numeric / issued, 1), 4) end from f;
$$;
create or replace function public.analytics_m_subscription_mrr(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  -- Monthly recurring revenue (minor GBP, ex VAT) of subscriptions active at the end of the period, from the plan price book.
  select coalesce(sum(case when pp.billing_interval = 'year' then round(pp.price_minor / 12.0) else pp.price_minor end), 0)
  from public.workspace_subscriptions s join public.plan_prices pp on pp.kind = s.kind and pp.plan = s.plan and pp.billing_interval = s.billing_interval
  where s.status in ('active', 'trialing', 'past_due') and s.created_at < ((p_to + 1)::timestamp at time zone 'Europe/London')
    and (s.ended_at is null or s.ended_at >= ((p_to + 1)::timestamp at time zone 'Europe/London'))
    and (case when p_workspace is not null then s.workspace_id = p_workspace else coalesce(p_include_demo, false) or not public.analytics_workspace_is_demo(s.workspace_id) end);
$$;
create or replace function public.analytics_m_ai_revenue(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  -- Credit-pack sales (pack price at purchase) + overage charges for months in the period (minor GBP, ex VAT).
  select coalesce((select sum(p.price_minor) from public.ai_credit_ledger l join public.credit_packs p on p.id = l.pack_id
      where l.kind = 'purchase' and l.created_at >= (p_from::timestamp at time zone 'Europe/London') and l.created_at < ((p_to + 1)::timestamp at time zone 'Europe/London')
        and (case when p_workspace is not null then l.workspace_id = p_workspace else coalesce(p_include_demo, false) or not public.analytics_workspace_is_demo(l.workspace_id) end)), 0)
   + coalesce((select sum(o.amount_minor) from public.ai_overage_charges o where o.period between date_trunc('month', p_from)::date and p_to and o.status <> 'waived'
        and (case when p_workspace is not null then o.workspace_id = p_workspace else coalesce(p_include_demo, false) or not public.analytics_workspace_is_demo(o.workspace_id) end)), 0);
$$;
create or replace function public.analytics_m_promotion_revenue(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(o.amount_minor), 0) from public.payment_orders o
  where o.kind = 'platform_boost' and o.status in ('payment_succeeded', 'succeeded', 'paid')
    and o.created_at >= (p_from::timestamp at time zone 'Europe/London') and o.created_at < ((p_to + 1)::timestamp at time zone 'Europe/London')
    and (case when p_workspace is not null then o.payee_workspace_id = p_workspace or exists (select 1 from public.promotion_boosts b where b.payment_order_id = o.id and b.workspace_id = p_workspace)
         else coalesce(p_include_demo, false) or not public.analytics_workspace_is_demo((select b.workspace_id from public.promotion_boosts b where b.payment_order_id = o.id limit 1)) end);
$$;
create or replace function public.analytics_m_ai_margin(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare rev numeric := public.analytics_m_ai_revenue(p_from, p_to, p_workspace, p_include_demo);
  cost numeric := public.analytics_eval_sum('{"type":"sum","fact":"fact_agent_daily","measures":["provider_cost_minor"]}', p_from, p_to, p_workspace, p_include_demo);
begin
  if rev <= 0 then return null; end if;
  return round((rev - cost) / rev, 4);
end $$;
create or replace function public.analytics_m_gross_margin(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare rev numeric; cost numeric;
begin
  -- Platform revenue ex VAT (fees net of fee refunds + own sales) + AI + promotion − metered AI provider cost.
  rev := public.analytics_eval_sum('{"type":"sum","fact":"fact_payment_daily","measures":["platform_fee_net_minor","own_sale_revenue_minor"]}', p_from, p_to, p_workspace, p_include_demo)
    + public.analytics_m_ai_revenue(p_from, p_to, p_workspace, p_include_demo) + public.analytics_m_promotion_revenue(p_from, p_to, p_workspace, p_include_demo);
  cost := public.analytics_eval_sum('{"type":"sum","fact":"fact_agent_daily","measures":["provider_cost_minor"]}', p_from, p_to, p_workspace, p_include_demo);
  if rev <= 0 then return null; end if;
  return round((rev - cost) / rev, 4);
end $$;
create or replace function public.analytics_m_provider_supply(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  select count(*)::numeric from public.analytics_dim_listing d where d.published and coalesce(d.review_status, 'approved') <> 'rejected'
    and (case when p_workspace is not null then d.workspace_id = p_workspace else coalesce(p_include_demo, false) or not d.is_demo end);
$$;
create or replace function public.analytics_m_capacity_use(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  -- Share of days in the period on which the provider had at least one live booking (confirmed/active/completed).
  select case when p_to < p_from then null else round(count(distinct d.day)::numeric / (p_to - p_from + 1), 4) end
  from public.bookings b cross join lateral generate_series(greatest((b.starts_at at time zone 'Europe/London')::date, p_from),
      least((coalesce(b.ends_at, b.starts_at) at time zone 'Europe/London')::date, p_to), interval '1 day') d(day)
  where p_workspace is not null and b.seller_workspace_id = p_workspace and b.status in ('confirmed', 'completed', 'completion_pending', 'active')
    and b.starts_at is not null and b.starts_at < ((p_to + 1)::timestamp at time zone 'Europe/London') and coalesce(b.ends_at, b.starts_at) >= (p_from::timestamp at time zone 'Europe/London');
$$;

create or replace function public.analytics_eval(p_key text, p_from date, p_to date, p_workspace uuid, p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare md public.metric_definitions; num numeric; den numeric; v numeric;
begin
  select d.* into md from public.metric_definition_active a join public.metric_definitions d on d.key = a.key and d.version = a.version where a.key = p_key;
  if not found then raise exception 'unknown_metric:%', p_key using errcode = 'P0002'; end if;
  if p_to - p_from > 731 then raise exception 'range_too_large' using errcode = '22023'; end if;
  case md.spec ->> 'type'
  when 'sum' then v := public.analytics_eval_sum(md.spec, p_from, p_to, p_workspace, p_include_demo);
  when 'ratio' then
    num := public.analytics_eval_sum(md.spec -> 'numerator', p_from, p_to, p_workspace, p_include_demo);
    den := public.analytics_eval_sum(md.spec -> 'denominator', p_from, p_to, p_workspace, p_include_demo);
    v := case when den = 0 then null else round(num / den, 4) end;
  when 'function' then
    execute format('select public.%I($1, $2, $3, $4)', md.spec ->> 'name') into v using p_from, p_to, p_workspace, p_include_demo;
  end case;
  return jsonb_build_object('key', md.key, 'version', md.version, 'unit', md.unit, 'value', v, 'numerator', num, 'denominator', den);
end $$;

-- Seed v1 definitions (idempotent: only inserted when the version does not exist).
insert into public.metric_definitions(key, version, name, description, domain, unit, audience, spec) values
  ('gmv', 1, 'GMV', 'Gross merchandise value: seller gross sales (direct charges: −merchant_gmv; legacy: gross cash in on sale kinds). Refunds are not netted (see net_gmv).', 'finance', 'minor_gbp', 'workspace_finance', '{"type":"sum","fact":"fact_payment_daily","measures":["gmv_minor"]}'),
  ('net_gmv', 1, 'Net GMV', 'GMV after refunds and disputes.', 'finance', 'minor_gbp', 'workspace_finance', '{"type":"function","name":"analytics_m_net_gmv"}'),
  ('ticket_gmv', 1, 'Ticket GMV', 'GMV from primary and resale ticket orders.', 'ticket', 'minor_gbp', 'workspace_finance', '{"type":"sum","fact":"fact_payment_daily","measures":["gmv_minor"],"filter":{"kind":["ticket_order","ticket_resale"]}}'),
  ('marketplace_gmv', 1, 'Marketplace GMV', 'GMV from supplier/venue bookings and deposits.', 'marketplace', 'minor_gbp', 'workspace_finance', '{"type":"sum","fact":"fact_payment_daily","measures":["gmv_minor"],"filter":{"kind":["booking_payment","deposit","marketplace_order"]}}'),
  ('merch_gmv', 1, 'Merch GMV', 'GMV from merchandise orders.', 'event', 'minor_gbp', 'workspace_finance', '{"type":"sum","fact":"fact_payment_daily","measures":["gmv_minor"],"filter":{"kind":["merch_order"]}}'),
  ('platform_fee_revenue', 1, 'Fee revenue', 'Platform fee revenue ex VAT, net of fee refunds (−platform_fee).', 'finance', 'minor_gbp', 'platform_admin', '{"type":"sum","fact":"fact_payment_daily","measures":["platform_fee_net_minor"]}'),
  ('ticket_fee_revenue', 1, 'Ticket fees', 'Fee revenue ex VAT on ticket orders.', 'finance', 'minor_gbp', 'platform_admin', '{"type":"sum","fact":"fact_payment_daily","measures":["platform_fee_net_minor"],"filter":{"kind":["ticket_order","ticket_resale"]}}'),
  ('marketplace_fee_revenue', 1, 'Marketplace fees', 'Fee revenue ex VAT on bookings/deposits.', 'finance', 'minor_gbp', 'platform_admin', '{"type":"sum","fact":"fact_payment_daily","measures":["platform_fee_net_minor"],"filter":{"kind":["booking_payment","deposit","marketplace_order"]}}'),
  ('platform_revenue', 1, 'Platform revenue', 'Fee revenue + own-sale revenue (ex VAT).', 'finance', 'minor_gbp', 'platform_admin', '{"type":"sum","fact":"fact_payment_daily","measures":["platform_fee_net_minor","own_sale_revenue_minor"]}'),
  ('fees_paid', 1, 'Fees paid to Gala Dock', 'Application fees the workspace''s charges paid (incl. VAT, net of fee refunds).', 'finance', 'minor_gbp', 'workspace_finance', '{"type":"sum","fact":"fact_payment_daily","measures":["seller_fee_minor"]}'),
  ('take_rate', 1, 'Take rate', 'Fee revenue ex VAT / GMV.', 'finance', 'ratio', 'platform_admin', '{"type":"ratio","numerator":{"type":"sum","fact":"fact_payment_daily","measures":["platform_fee_net_minor"]},"denominator":{"type":"sum","fact":"fact_payment_daily","measures":["gmv_minor"]}}'),
  ('refunds', 1, 'Refunds', 'Refunded amounts (seller_refunds + legacy refunds), on the refund day.', 'finance', 'minor_gbp', 'workspace_finance', '{"type":"sum","fact":"fact_payment_daily","measures":["refunds_minor"]}'),
  ('refund_rate', 1, 'Refund rate', 'Refunds / GMV.', 'finance', 'ratio', 'workspace_finance', '{"type":"ratio","numerator":{"type":"sum","fact":"fact_payment_daily","measures":["refunds_minor"]},"denominator":{"type":"sum","fact":"fact_payment_daily","measures":["gmv_minor"]}}'),
  ('dispute_rate', 1, 'Dispute rate', 'Disputed amounts (net of reinstatements) / GMV.', 'finance', 'ratio', 'workspace_finance', '{"type":"ratio","numerator":{"type":"sum","fact":"fact_payment_daily","measures":["disputes_minor"]},"denominator":{"type":"sum","fact":"fact_payment_daily","measures":["gmv_minor"]}}'),
  ('subscription_mrr', 1, 'Subscription MRR', 'Monthly recurring revenue of active/trialing/past-due subscriptions at period end (price book, ex VAT).', 'finance', 'minor_gbp', 'platform_admin', '{"type":"function","name":"analytics_m_subscription_mrr"}'),
  ('ai_revenue', 1, 'AI revenue', 'Credit-pack sales + overage charges (ex VAT).', 'finance', 'minor_gbp', 'platform_admin', '{"type":"function","name":"analytics_m_ai_revenue"}'),
  ('ai_cost', 1, 'AI provider cost', 'Metered provider cost (GBP minor, from ai_usage_events).', 'agent', 'minor_gbp', 'platform_admin', '{"type":"sum","fact":"fact_agent_daily","measures":["provider_cost_minor"]}'),
  ('ai_margin', 1, 'AI margin', '(AI revenue − AI provider cost) / AI revenue.', 'finance', 'ratio', 'platform_admin', '{"type":"function","name":"analytics_m_ai_margin"}'),
  ('promotion_revenue', 1, 'Promotion revenue', 'Paid boost orders (platform own sale).', 'finance', 'minor_gbp', 'platform_admin', '{"type":"function","name":"analytics_m_promotion_revenue"}'),
  ('gross_margin', 1, 'Gross margin', '(Platform revenue + AI + promotion − AI provider cost) / that revenue.', 'finance', 'ratio', 'platform_admin', '{"type":"function","name":"analytics_m_gross_margin"}'),
  ('tickets_issued', 1, 'Tickets sold', 'Issued entitlements (excl. replacement copies/transfers).', 'ticket', 'count', 'workspace_member', '{"type":"sum","fact":"fact_ticket_daily","measures":["tickets_issued"]}'),
  ('ticket_gross', 1, 'Ticket face value', 'Face value of issued tickets.', 'ticket', 'minor_gbp', 'workspace_finance', '{"type":"sum","fact":"fact_ticket_daily","measures":["gross_minor"]}'),
  ('tickets_refunded', 1, 'Tickets refunded', 'Tickets on refunded orders (refund day).', 'ticket', 'count', 'workspace_member', '{"type":"sum","fact":"fact_ticket_daily","measures":["tickets_refunded"]}'),
  ('ticket_sell_through', 1, 'Sell-through', 'Events starting in the period: (issued − refunded) / non-comp tier capacity.', 'ticket', 'ratio', 'workspace_member', '{"type":"function","name":"analytics_m_ticket_sell_through"}'),
  ('scan_rate', 1, 'Scan rate', 'Events starting in the period: tickets admitted at least once / (issued − refunded), capped at 1.', 'ticket', 'ratio', 'workspace_member', '{"type":"function","name":"analytics_m_scan_rate"}'),
  ('resales', 1, 'Resales', 'Official resale listings sold.', 'ticket', 'count', 'workspace_member', '{"type":"sum","fact":"fact_ticket_daily","measures":["resale_sold"]}'),
  ('page_views', 1, 'Event page views', 'Public event page views (event metrics + captured event.viewed).', 'event', 'count', 'workspace_member', '{"type":"sum","fact":"fact_event_daily","measures":["page_views"]}'),
  ('event_conversion', 1, 'Event page conversion', 'Tickets issued / event page views.', 'event', 'ratio', 'workspace_member', '{"type":"function","name":"analytics_m_event_conversion"}'),
  ('supplier_committed', 1, 'Supplier spend committed', 'Live supplier bookings for the workspace''s events (booking amount).', 'event', 'minor_gbp', 'workspace_finance', '{"type":"sum","fact":"fact_event_daily","measures":["supplier_committed_minor"]}'),
  ('requests_created', 1, 'Requests', 'Marketplace requests created (buyer side).', 'marketplace', 'count', 'workspace_member', '{"type":"sum","fact":"fact_booking_daily","measures":["requests_created"],"side":"buyer"}'),
  ('quote_rate', 1, 'Quote rate', 'Requests that received a quote / requests created (cohort, status at build).', 'marketplace', 'ratio', 'workspace_member', '{"type":"ratio","numerator":{"type":"sum","fact":"fact_booking_daily","measures":["requests_quoted"],"side":"buyer"},"denominator":{"type":"sum","fact":"fact_booking_daily","measures":["requests_created"],"side":"buyer"}}'),
  ('bookings_created', 1, 'Bookings', 'Bookings created (seller side).', 'provider', 'count', 'workspace_member', '{"type":"sum","fact":"fact_booking_daily","measures":["bookings_created"]}'),
  ('booking_conversion', 1, 'Booking conversion', 'Confirmed/active/completed bookings / bookings created (cohort, seller side).', 'provider', 'ratio', 'workspace_member', '{"type":"ratio","numerator":{"type":"sum","fact":"fact_booking_daily","measures":["bookings_confirmed"]},"denominator":{"type":"sum","fact":"fact_booking_daily","measures":["bookings_created"]}}'),
  ('cancellation_rate', 1, 'Cancellation rate', 'Cancelled bookings / bookings created (cohort, seller side).', 'provider', 'ratio', 'workspace_member', '{"type":"ratio","numerator":{"type":"sum","fact":"fact_booking_daily","measures":["bookings_cancelled"]},"denominator":{"type":"sum","fact":"fact_booking_daily","measures":["bookings_created"]}}'),
  ('quotes_sent', 1, 'Quotes sent', 'Provider quotes sent.', 'provider', 'count', 'workspace_member', '{"type":"sum","fact":"fact_booking_daily","measures":["quotes_sent"]}'),
  ('booking_revenue', 1, 'Booking revenue', 'Value of live bookings (seller side, booking amount).', 'provider', 'minor_gbp', 'workspace_finance', '{"type":"sum","fact":"fact_booking_daily","measures":["confirmed_value_minor"]}'),
  ('capacity_use', 1, 'Capacity use', 'Share of days with at least one live booking.', 'provider', 'ratio', 'workspace_member', '{"type":"function","name":"analytics_m_capacity_use"}'),
  ('provider_supply', 1, 'Provider supply', 'Published, non-rejected listings.', 'marketplace', 'count', 'workspace_member', '{"type":"function","name":"analytics_m_provider_supply"}'),
  ('searches', 1, 'Searches', 'Captured searches (search.performed).', 'marketplace', 'count', 'platform_admin', '{"type":"sum","fact":"fact_product_daily","measures":["events"],"filter":{"event_name":["search.performed"]}}'),
  ('product_events', 1, 'Product events', 'All captured product events.', 'product', 'count', 'platform_admin', '{"type":"sum","fact":"fact_product_daily","measures":["events"]}'),
  ('agent_runs', 1, 'Agent runs', 'Gala Agent runs started.', 'agent', 'count', 'workspace_member', '{"type":"sum","fact":"fact_agent_daily","measures":["runs_started"]}'),
  ('agent_success_rate', 1, 'Agent success rate', 'Completed / started runs.', 'agent', 'ratio', 'workspace_member', '{"type":"ratio","numerator":{"type":"sum","fact":"fact_agent_daily","measures":["runs_completed"]},"denominator":{"type":"sum","fact":"fact_agent_daily","measures":["runs_started"]}}'),
  ('ai_credits', 1, 'AI credits used', 'Credits metered.', 'agent', 'credits', 'workspace_member', '{"type":"sum","fact":"fact_agent_daily","measures":["credits"]}')
on conflict (key, version) do nothing;

create or replace function public.analytics_m_net_gmv(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  select public.analytics_eval_sum('{"type":"sum","fact":"fact_payment_daily","measures":["gmv_minor"]}', p_from, p_to, p_workspace, p_include_demo)
       - public.analytics_eval_sum('{"type":"sum","fact":"fact_payment_daily","measures":["refunds_minor","disputes_minor"]}', p_from, p_to, p_workspace, p_include_demo);
$$;
create or replace function public.analytics_m_event_conversion(p_from date, p_to date, p_workspace uuid, p_include_demo boolean) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare pv numeric := public.analytics_eval_sum('{"type":"sum","fact":"fact_event_daily","measures":["page_views"]}', p_from, p_to, p_workspace, p_include_demo);
  t numeric := public.analytics_eval_sum('{"type":"sum","fact":"fact_ticket_daily","measures":["tickets_issued"]}', p_from, p_to, p_workspace, p_include_demo);
begin
  return case when pv = 0 then null else round(t / pv, 4) end;
end $$;

insert into public.metric_definition_active(key, version)
select key, 1 from public.metric_definitions where version = 1 on conflict (key) do nothing;

-- Admin: publish a new version (validated, immutable once written) and point the active pointer at it; restore = activate an older version.
create or replace function public.admin_metric_publish(p_key text, p_name text, p_description text, p_domain text, p_unit text, p_audience text, p_spec jsonb, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  perform public.admin_require('analytics', p_reason);
  perform public.analytics_validate_spec(p_spec);
  perform public.advisory_xact_lock('metric_definitions', p_key);
  select coalesce(max(version), 0) + 1 into v from public.metric_definitions where key = p_key;
  insert into public.metric_definitions(key, version, name, description, domain, unit, audience, spec, created_by)
    values (p_key, v, p_name, coalesce(p_description, ''), p_domain, p_unit, p_audience, p_spec, auth.uid());
  insert into public.metric_definition_active(key, version, activated_by) values (p_key, v, auth.uid())
    on conflict (key) do update set version = excluded.version, activated_at = now(), activated_by = excluded.activated_by;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'analytics.metric_published',
    jsonb_build_object('key', p_key, 'version', v, 'reason', p_reason));
  return v;
end $$;
create or replace function public.admin_metric_activate(p_key text, p_version integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('analytics', p_reason);
  if not exists (select 1 from public.metric_definitions where key = p_key and version = p_version and status <> 'retired') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.metric_definition_active(key, version, activated_by) values (p_key, p_version, auth.uid())
    on conflict (key) do update set version = excluded.version, activated_at = now(), activated_by = excluded.activated_by;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'analytics.metric_activated',
    jsonb_build_object('key', p_key, 'version', p_version, 'reason', p_reason));
end $$;

-- ── 6. Reads: workspace dashboards (tenant-isolated), event report, platform report, trends, funnels ────────────────
create or replace function public.analytics_can_read(p_workspace uuid, p_audience text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_audience
    when 'workspace_member' then public.has_workspace_role(p_workspace, array['owner', 'manager', 'finance', 'member'])
    when 'workspace_finance' then public.has_workspace_role(p_workspace, array['owner', 'manager', 'finance'])
    else false end
    or public.has_admin_permission('analytics');
$$;

create or replace function public.analytics_workspace_metrics(p_workspace uuid, p_from date, p_to date, p_keys text[] default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record; out jsonb := '[]'; prev_from date; prev_to date;
begin
  if p_workspace is null or not public.analytics_can_read(p_workspace, 'workspace_member') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 731 then raise exception 'invalid_range' using errcode = '22023'; end if;
  prev_to := p_from - 1; prev_from := prev_to - (p_to - p_from);
  for r in select d.* from public.metric_definition_active a join public.metric_definitions d on d.key = a.key and d.version = a.version
      where d.audience <> 'platform_admin' and (p_keys is null or d.key = any(p_keys)) order by d.domain, d.key loop
    if not public.analytics_can_read(p_workspace, r.audience) then continue; end if;
    out := out || jsonb_build_array(public.analytics_eval(r.key, p_from, p_to, p_workspace)
      || jsonb_build_object('name', r.name, 'domain', r.domain, 'previous', public.analytics_eval(r.key, prev_from, prev_to, p_workspace) -> 'value'));
  end loop;
  return jsonb_build_object('workspace_id', p_workspace, 'from', p_from, 'to', p_to,
    'freshness', (select max(finished_at) from public.analytics_build_runs where status = 'succeeded'), 'metrics', out);
end $$;

create or replace function public.analytics_trend(p_metric text, p_workspace uuid, p_from date, p_to date, p_grain text default 'day') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare md public.metric_definitions; d date; step interval; e date; out jsonb := '[]';
begin
  select x.* into md from public.metric_definition_active a join public.metric_definitions x on x.key = a.key and x.version = a.version where a.key = p_metric;
  if not found then raise exception 'unknown_metric' using errcode = 'P0002'; end if;
  if p_workspace is null then
    if not public.has_admin_permission('analytics') then raise exception 'not_authorized' using errcode = '42501'; end if;
  elsif md.audience = 'platform_admin' or not public.analytics_can_read(p_workspace, md.audience) then raise exception 'not_authorized' using errcode = '42501';
  end if;
  step := case p_grain when 'week' then interval '7 days' when 'month' then interval '1 month' else interval '1 day' end;
  if p_to - p_from > 731 then raise exception 'range_too_large' using errcode = '22023'; end if;
  d := case p_grain when 'week' then date_trunc('week', p_from)::date when 'month' then date_trunc('month', p_from)::date else p_from end;
  while d <= p_to loop
    e := least((d + step)::date - 1, p_to);
    out := out || jsonb_build_array(jsonb_build_object('from', greatest(d, p_from), 'to', e, 'value', public.analytics_eval(p_metric, greatest(d, p_from), e, p_workspace) -> 'value'));
    d := (d + step)::date;
  end loop;
  return jsonb_build_object('metric', p_metric, 'version', md.version, 'grain', p_grain, 'points', out);
end $$;

-- Event report (224/225): revenue, profit, attendance, readiness, supplier performance, outcomes, tiers, sources, pace.
create or replace function public.analytics_event_report(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; gross bigint; refunds bigint; fees bigint; merch bigint; costs bigint; issued int; refunded int; v_admitted int; cap int; pv int;
  last7 int; days_left int; finance boolean;
begin
  select * into ev from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  finance := public.analytics_can_read(ev.workspace_id, 'workspace_finance');
  select coalesce(sum(gross_minor), 0), coalesce(sum(refunded_minor), 0), coalesce(sum(tickets_issued), 0), coalesce(sum(tickets_refunded), 0), coalesce(sum(admitted_unique), 0)
    into gross, refunds, issued, refunded, v_admitted from public.fact_ticket_daily where event_id = p_event;
  select coalesce(sum(merch_gross_minor), 0), coalesce(sum(supplier_committed_minor), 0), coalesce(sum(page_views), 0) into merch, costs, pv from public.fact_event_daily where event_id = p_event;
  select coalesce(sum(case when e.account = 'seller_application_fees' then e.amount_minor else 0 end), 0) into fees
    from public.ledger_transactions t join public.ledger_entries e on e.transaction_id = t.id where t.event_id = p_event;
  select ticket_capacity into cap from public.analytics_dim_event where event_id = p_event;
  select coalesce(sum(tickets_issued), 0) into last7 from public.fact_ticket_daily where event_id = p_event and day > (now() at time zone 'Europe/London')::date - 7;
  days_left := greatest(((ev.starts_at at time zone 'Europe/London')::date - (now() at time zone 'Europe/London')::date), 0);
  return jsonb_build_object(
    'event_id', p_event, 'currency', coalesce(ev.currency, 'GBP'),
    'revenue', case when finance then jsonb_build_object('ticket_gross_minor', gross, 'merch_gross_minor', merch, 'refunds_minor', refunds, 'fees_minor', fees,
        'net_minor', gross + merch - refunds - fees) end,
    'profit', case when finance then jsonb_build_object('net_revenue_minor', gross + merch - refunds - fees, 'supplier_committed_minor', costs,
        'profit_minor', gross + merch - refunds - fees - costs, 'target_profit', ev.target_profit, 'note', 'Supplier costs = live bookings for this event; other costs are not tracked.') end,
    'attendance', jsonb_build_object('issued', issued - refunded, 'admitted', v_admitted,
        'scan_rate', case when issued - refunded > 0 then round(least(v_admitted::numeric / (issued - refunded), 1), 4) end),
    'sales', jsonb_build_object('issued', issued, 'refunded', refunded, 'capacity', cap,
        'sell_through', case when coalesce(cap, 0) > 0 then round((issued - refunded)::numeric / cap, 4) end,
        'pace_last_7_days', last7, 'days_to_start', days_left,
        'needed_per_day', case when days_left > 0 and coalesce(cap, 0) > 0 then round(greatest(cap - (issued - refunded), 0)::numeric / days_left, 1) end),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('tier_id', t.id, 'name', t.name, 'quantity', t.quantity,
        'issued', coalesce((select sum(f.tickets_issued - f.tickets_refunded) from public.fact_ticket_daily f where f.event_id = p_event and f.tier_id = t.id), 0)) order by t.sort, t.name)
        from public.ticket_tiers t where t.event_id = p_event), '[]'),
    'sources', coalesce((select jsonb_object_agg(channel, n) from (select channel, sum(tickets_issued) n from public.fact_ticket_daily
        where event_id = p_event and channel not in ('scan', 'resale') group by channel having sum(tickets_issued) > 0) s), '{}'),
    'resale', (select jsonb_build_object('listed', coalesce(sum(resale_listed), 0), 'sold', coalesce(sum(resale_sold), 0)) from public.fact_ticket_daily where event_id = p_event),
    'page_views', pv,
    'readiness', public.event_readiness(p_event),
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('workspace_id', b.seller_workspace_id, 'status', b.status, 'count', b.n)) from (
        select seller_workspace_id, status, count(*) n from public.bookings where event_id = p_event group by 1, 2) b), '[]'),
    'outcome', jsonb_build_object('status', ev.status, 'ended', coalesce(ev.ends_at, ev.starts_at) < now(),
        'revenue_goal_met', case when finance and ev.revenue_goal is not null then (gross + merch - refunds) >= ev.revenue_goal * 100 end),
    'freshness', (select max(built_at) from public.fact_ticket_daily where event_id = p_event));
end $$;

-- Platform report (admin): every active metric for the range, demo excluded unless asked; plus supply gaps.
create or replace function public.analytics_platform_report(p_from date, p_to date, p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record; out jsonb := '[]';
begin
  if not public.has_admin_permission('analytics') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 731 then raise exception 'invalid_range' using errcode = '22023'; end if;
  for r in select d.key, d.name, d.domain from public.metric_definition_active a join public.metric_definitions d on d.key = a.key and d.version = a.version
      where d.key not in ('capacity_use') order by d.domain, d.key loop
    out := out || jsonb_build_array(public.analytics_eval(r.key, p_from, p_to, null, p_include_demo) || jsonb_build_object('name', r.name, 'domain', r.domain));
  end loop;
  return jsonb_build_object('from', p_from, 'to', p_to, 'include_demo', p_include_demo, 'metrics', out,
    'supply_gaps', public.analytics_supply_gaps(p_from, p_to, p_include_demo),
    'freshness', (select max(finished_at) from public.analytics_build_runs where status = 'succeeded'));
end $$;

create or replace function public.analytics_supply_gaps(p_from date, p_to date, p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('analytics') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(g order by g.requests desc) from (
    select f.category, f.city, sum(f.requests_created) requests, sum(f.requests_expired) expired, sum(f.requests_quoted) quoted,
      (select count(*) from public.analytics_dim_listing l where l.published and lower(coalesce(l.category, '')) = f.category
        and (f.city = '' or lower(coalesce(l.city, '')) = lower(f.city)) and (p_include_demo or not l.is_demo)) supply
    from public.fact_booking_daily f where f.day between p_from and p_to and f.requests_created > 0 and (p_include_demo or not f.is_demo)
    group by f.category, f.city) g where g.supply < 3 or g.expired > g.quoted), '[]');
end $$;

-- Funnels / drop-off / retention over product events (pseudonymous). Workspace scope requires membership.
create or replace function public.analytics_funnel(p_steps text[], p_from date, p_to date, p_workspace uuid default null, p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i int; reached bigint; prev bigint; out jsonb := '[]'; counts bigint[];
  lo timestamptz := (p_from::timestamp at time zone 'Europe/London'); hi timestamptz := ((p_to + 1)::timestamp at time zone 'Europe/London');
begin
  if p_workspace is null then
    if not public.has_admin_permission('analytics') then raise exception 'not_authorized' using errcode = '42501'; end if;
  elsif not public.analytics_can_read(p_workspace, 'workspace_member') then raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_steps is null or cardinality(p_steps) < 2 or cardinality(p_steps) > 8 or p_to < p_from or p_to - p_from > 92 then raise exception 'invalid_funnel' using errcode = '22023'; end if;
  -- Ordered funnel: a subject reaches step n if it did step n at or after the time it reached step n-1, inside the window.
  with recursive s(n, subject_id, at) as (
    select 1, a.subject_id, min(a.occurred_at) from public.analytics_events a
      where a.event_name = p_steps[1] and a.occurred_at >= lo and a.occurred_at < hi
        and (p_workspace is null or a.workspace_id = p_workspace) and (p_include_demo or p_workspace is not null or not a.is_demo)
      group by a.subject_id
    union all
    select s.n + 1, s.subject_id, (select min(a.occurred_at) from public.analytics_events a
        where a.subject_id = s.subject_id and a.event_name = p_steps[s.n + 1] and a.occurred_at >= s.at and a.occurred_at < hi)
    from s where s.n < cardinality(p_steps) and s.at is not null)
  select array_agg(coalesce(c.cnt, 0) order by g.n) into counts
  from generate_series(1, cardinality(p_steps)) g(n) left join (select x.n, count(*) cnt from s x where x.at is not null group by x.n) c on c.n = g.n;
  for i in 1 .. cardinality(p_steps) loop
    reached := counts[i];
    out := out || jsonb_build_array(jsonb_build_object('step', p_steps[i], 'subjects', reached,
      'drop_off', case when i > 1 and prev > 0 then round(1 - reached::numeric / prev, 4) end));
    prev := reached;
  end loop;
  return jsonb_build_object('from', p_from, 'to', p_to, 'steps', out, 'note', 'Visitors without consent have daily ids, so cross-day journeys only count consented users.');
end $$;

-- Weekly retention of consented (stable-id) users first seen since p_from: cohort size and active subjects per week offset.
create or replace function public.analytics_retention(p_from date, p_weeks integer default 8) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare lo timestamptz := (p_from::timestamp at time zone 'Europe/London'); res jsonb;
begin
  if not public.has_admin_permission('analytics') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 26 then raise exception 'invalid_weeks' using errcode = '22023'; end if;
  with ev as (select a.subject_id, date_trunc('week', a.occurred_at at time zone 'Europe/London')::date wk from public.analytics_events a
              where a.subject_kind = 'user' and not a.is_demo and a.occurred_at >= lo),
  first_seen as (select e.subject_id, min(e.wk) wk from ev e group by e.subject_id),
  cohorts as (select f.wk, count(*) n from first_seen f group by f.wk),
  act as (select f.wk, (e.wk - f.wk) / 7 k, count(distinct e.subject_id) c from first_seen f join ev e on e.subject_id = f.subject_id group by 1, 2)
  select jsonb_agg(jsonb_build_object('cohort_week', c.wk, 'subjects', c.n,
    'retained', (select jsonb_agg(coalesce((select a.c from act a where a.wk = c.wk and a.k = g.k), 0) order by g.k) from generate_series(0, p_weeks - 1) g(k))) order by c.wk)
  into res from cohorts c;
  return coalesce(res, '[]');
end $$;

-- ── 7. Reconciliation (exit gate: facts tie to canonical sources) ────────────────────────────────────────────────────
create or replace function public.analytics_reconcile(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare lo timestamptz := (p_from::timestamp at time zone 'Europe/London'); hi timestamptz := ((p_to + 1)::timestamp at time zone 'Europe/London');
  f_gmv bigint; s_gmv bigint; f_fee bigint; s_fee bigint; f_ref bigint; s_ref bigint; f_tix bigint; s_tix bigint; f_adm bigint; s_adm bigint;
  f_bk bigint; s_bk bigint; f_cost numeric; s_cost numeric; f_cash bigint; s_cash bigint;
begin
  -- Admins, the service role, or a direct database session (no JWT: operators/CI) may reconcile.
  if not (public.has_admin_permission('analytics') or coalesce(auth.role(), '') = 'service_role' or coalesce(auth.role(), '') not in ('authenticated', 'anon')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select coalesce(sum(gmv_minor), 0), coalesce(sum(platform_fee_net_minor), 0), coalesce(sum(refunds_minor), 0), coalesce(sum(platform_cash_minor), 0)
    into f_gmv, f_fee, f_ref, f_cash from public.fact_payment_daily where day between p_from and p_to;
  select coalesce(sum(case when e.account = 'merchant_gmv' then -e.amount_minor
                      when t.basis is null and t.kind in ('ticket_order', 'ticket_resale', 'deposit') and e.account = 'cash_stripe' then e.amount_minor
                      when t.basis is null and t.kind = 'booking_payment' and e.account = 'customer_payment' then -e.amount_minor else 0 end), 0),
         coalesce(sum(case when e.account = 'platform_fee' then -e.amount_minor else 0 end), 0),
         coalesce(sum(case when e.account in ('seller_refunds', 'refunds') then e.amount_minor else 0 end), 0),
         coalesce(sum(case when e.account = 'cash_stripe' then e.amount_minor else 0 end), 0)
    into s_gmv, s_fee, s_ref, s_cash from public.ledger_transactions t join public.ledger_entries e on e.transaction_id = t.id where t.posted_at >= lo and t.posted_at < hi;
  select coalesce(sum(tickets_issued), 0), coalesce(sum(admitted), 0) into f_tix, f_adm from public.fact_ticket_daily where day between p_from and p_to;
  select count(*) into s_tix from public.tickets t where t.created_at >= lo and t.created_at < hi and t.replaced_by is null and coalesce(t.order_ref, '') not like '%-T';
  select count(*) into s_adm from public.check_ins c where c.created_at >= lo and c.created_at < hi and c.event_id is not null and c.result in ('admitted', 'readmitted');
  select coalesce(sum(bookings_created), 0) into f_bk from public.fact_booking_daily where day between p_from and p_to;
  select count(*) into s_bk from public.bookings b where b.created_at >= lo and b.created_at < hi;
  select coalesce(sum(provider_cost_minor), 0) into f_cost from public.fact_agent_daily where day between p_from and p_to;
  select coalesce(sum(cost_gbp_minor), 0) into s_cost from public.ai_usage_events u where u.created_at >= lo and u.created_at < hi;
  return jsonb_build_object('from', p_from, 'to', p_to,
    'checks', jsonb_build_array(
      jsonb_build_object('check', 'gmv_vs_ledger', 'facts', f_gmv, 'source', s_gmv, 'ok', f_gmv = s_gmv),
      jsonb_build_object('check', 'fee_revenue_vs_ledger', 'facts', f_fee, 'source', s_fee, 'ok', f_fee = s_fee),
      jsonb_build_object('check', 'refunds_vs_ledger', 'facts', f_ref, 'source', s_ref, 'ok', f_ref = s_ref),
      jsonb_build_object('check', 'platform_cash_vs_ledger', 'facts', f_cash, 'source', s_cash, 'ok', f_cash = s_cash),
      jsonb_build_object('check', 'tickets_vs_entitlements', 'facts', f_tix, 'source', s_tix, 'ok', f_tix = s_tix),
      jsonb_build_object('check', 'admitted_vs_check_ins', 'facts', f_adm, 'source', s_adm, 'ok', f_adm = s_adm),
      jsonb_build_object('check', 'bookings_vs_bookings', 'facts', f_bk, 'source', s_bk, 'ok', f_bk = s_bk),
      jsonb_build_object('check', 'ai_cost_vs_meter', 'facts', f_cost, 'source', s_cost, 'ok', f_cost = s_cost)),
    'ok', f_gmv = s_gmv and f_fee = s_fee and f_ref = s_ref and f_cash = s_cash and f_tix = s_tix and f_adm = s_adm and f_bk = s_bk and f_cost = s_cost);
end $$;

-- ── 8. KPI / finance snapshots (immutable) and historical trends ─────────────────────────────────────────────────────
create table if not exists public.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_start date not null, period_end date not null, grain text not null check (grain in ('day', 'week', 'month')),
  scope text not null check (scope in ('platform', 'workspace')), workspace_id uuid references public.workspaces(id) on delete cascade,
  metric_key text not null, metric_version integer not null, value numeric, numerator numeric, denominator numeric,
  include_demo boolean not null default false, computed_at timestamptz not null default now(),
  check ((scope = 'platform') = (workspace_id is null))
);
create unique index if not exists kpi_snapshots_key on public.kpi_snapshots(period_start, grain, scope, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_key, metric_version, include_demo);
create index if not exists kpi_snapshots_ws on public.kpi_snapshots(workspace_id, metric_key, period_start) where workspace_id is not null;
alter table public.kpi_snapshots enable row level security;
drop policy if exists kpi_snapshots_read on public.kpi_snapshots;
create policy kpi_snapshots_read on public.kpi_snapshots for select to authenticated using (
  case when workspace_id is null then public.has_admin_permission('analytics')
       else public.analytics_can_read(workspace_id, coalesce((select d.audience from public.metric_definitions d where d.key = metric_key and d.version = metric_version), 'platform_admin')) end);
revoke all on table public.kpi_snapshots from anon;
revoke insert, update, delete, truncate, references, trigger on table public.kpi_snapshots from authenticated;
create or replace function public.kpi_snapshots_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Snapshots are evidence: never rewritten. Workspace deletion cascades (handled by FK, statement-level from workspaces).
  if tg_op = 'UPDATE' then raise exception 'kpi_snapshots_are_immutable' using errcode = '42501'; end if;
  if tg_op = 'DELETE' and pg_trigger_depth() = 1 and coalesce(current_setting('gala.fixture_purge', true), '') = '' then
    raise exception 'kpi_snapshots_are_immutable' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists kpi_snapshots_immutable on public.kpi_snapshots;
create trigger kpi_snapshots_immutable before update or delete on public.kpi_snapshots for each row execute function public.kpi_snapshots_immutable();

-- Snapshots one closed period (platform excl. demo, platform incl. demo, and each active non-fixture workspace with activity). Idempotent.
create or replace function public.analytics_snapshot_period(p_start date, p_grain text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p_end date; r record; w uuid; n int := 0; v jsonb;
begin
  if p_grain not in ('day', 'week', 'month') then raise exception 'invalid_grain' using errcode = '22023'; end if;
  p_end := case p_grain when 'day' then p_start when 'week' then p_start + 6 else (p_start + interval '1 month')::date - 1 end;
  if p_end >= (now() at time zone 'Europe/London')::date then raise exception 'period_not_closed' using errcode = '22023'; end if;
  for r in select d.key, d.version, d.audience from public.metric_definition_active a join public.metric_definitions d on d.key = a.key and d.version = a.version loop
    foreach v in array array[public.analytics_eval(r.key, p_start, p_end, null, false), public.analytics_eval(r.key, p_start, p_end, null, true)] loop
      insert into public.kpi_snapshots(period_start, period_end, grain, scope, metric_key, metric_version, value, numerator, denominator, include_demo)
      values (p_start, p_end, p_grain, 'platform', r.key, r.version, (v ->> 'value')::numeric, (v ->> 'numerator')::numeric, (v ->> 'denominator')::numeric,
        n % 2 = 1) on conflict do nothing;
      n := n + 1;
    end loop;
    if r.audience <> 'platform_admin' and r.key not in ('provider_supply', 'capacity_use') then
      for w in select distinct x.workspace_id from (
          select workspace_id from public.fact_payment_daily where day between p_start and p_end union
          select workspace_id from public.fact_ticket_daily where day between p_start and p_end union
          select workspace_id from public.fact_booking_daily where day between p_start and p_end union
          select buyer_workspace_id from public.fact_booking_daily where day between p_start and p_end union
          select workspace_id from public.fact_agent_daily where day between p_start and p_end) x
        join public.workspaces ws on ws.id = x.workspace_id where not ws.is_test_fixture loop
        v := public.analytics_eval(r.key, p_start, p_end, w, true);
        insert into public.kpi_snapshots(period_start, period_end, grain, scope, workspace_id, metric_key, metric_version, value, numerator, denominator, include_demo)
        values (p_start, p_end, p_grain, 'workspace', w, r.key, r.version, (v ->> 'value')::numeric, (v ->> 'numerator')::numeric, (v ->> 'denominator')::numeric, true)
        on conflict do nothing;
        n := n + 1;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('period_start', p_start, 'period_end', p_end, 'grain', p_grain, 'written_or_kept', n);
end $$;

create or replace function public.job_analytics_snapshot(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Europe/London')::date; res jsonb;
begin
  res := jsonb_build_object('day', public.analytics_snapshot_period(today - 1, 'day'));
  if extract(isodow from today) = 1 then res := res || jsonb_build_object('week', public.analytics_snapshot_period((today - 7), 'week')); end if;
  if extract(day from today) = 1 then res := res || jsonb_build_object('month', public.analytics_snapshot_period((today - interval '1 month')::date, 'month')); end if;
  return res;
end $$;

-- ── 9. Export datasets (async, permission checked at generation AND download, time-limited, audited) ────────────────
create table if not exists public.analytics_exports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null, workspace_id uuid references public.workspaces(id) on delete cascade,
  dataset text not null check (dataset in ('payment_daily', 'ticket_daily', 'event_daily', 'booking_daily', 'agent_daily', 'product_daily', 'kpi_snapshots')),
  day_from date not null, day_to date not null check (day_to >= day_from and day_to - day_from <= 731),
  include_demo boolean not null default false,
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed', 'expired')),
  row_count integer, content text, error text, expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  downloaded_at timestamptz
);
create index if not exists analytics_exports_user on public.analytics_exports(requested_by, created_at desc);
alter table public.analytics_exports enable row level security;
drop policy if exists analytics_exports_own on public.analytics_exports;
-- Status only; content is fetched through analytics_export_download (permission re-checked).
create policy analytics_exports_own on public.analytics_exports for select to authenticated using (requested_by = (select auth.uid()));
revoke all on table public.analytics_exports from anon;
revoke all on table public.analytics_exports from authenticated;
grant select (id, workspace_id, dataset, day_from, day_to, include_demo, status, row_count, error, expires_at, created_at, downloaded_at) on public.analytics_exports to authenticated;

create or replace function public.analytics_export_allowed(p_user uuid, p_workspace uuid, p_dataset text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_workspace is null then exists (select 1 from public.platform_admins a where a.user_id = p_user and 'analytics' = any(a.permissions))
      when p_dataset = 'product_daily' then false
    else exists (select 1 from public.workspaces w where w.id = p_workspace and w.status = 'active' and (w.owner_id = p_user
      or exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = p_user and m.status = 'active' and m.role in ('owner', 'manager', 'finance'))))
  end;
$$;

create or replace function public.analytics_request_export(p_dataset text, p_workspace uuid, p_from date, p_to date, p_include_demo boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); xid uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_workspace is null then perform public.admin_require('analytics', 'analytics export ' || p_dataset);
  elsif not public.analytics_export_allowed(uid, p_workspace, p_dataset) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not public.hit_rate_limit('analytics-export:' || uid::text, 10, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.analytics_exports(requested_by, workspace_id, dataset, day_from, day_to, include_demo)
    values (uid, p_workspace, p_dataset, p_from, p_to, p_workspace is null and coalesce(p_include_demo, false)) returning id into xid;
  perform public.enqueue_job(p_kind => 'analytics.export', p_payload => jsonb_build_object('export_id', xid), p_dedupe_key => 'analytics.export:' || xid::text, p_workspace => p_workspace);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (uid, case when p_workspace is null then 'admin' else 'user' end, p_workspace,
    'analytics.export_requested', jsonb_build_object('export_id', xid, 'dataset', p_dataset, 'from', p_from, 'to', p_to));
  return xid;
end $$;

create or replace function public.job_analytics_export(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.analytics_exports; csv text; n int; fact text; cols text; q text; line_expr text;
begin
  select * into x from public.analytics_exports where id = (p_job.payload ->> 'export_id')::uuid for update;
  if not found or x.status <> 'queued' then return jsonb_build_object('skipped', true); end if;
  if not public.analytics_export_allowed(x.requested_by, x.workspace_id, x.dataset) then
    update public.analytics_exports set status = 'failed', error = 'not_authorized', updated_at = now() where id = x.id;
    return jsonb_build_object('failed', 'not_authorized');
  end if;
  if x.dataset = 'kpi_snapshots' then
    cols := 'period_start, period_end, grain, scope, workspace_id, metric_key, metric_version, value, numerator, denominator';
    q := format('select %s from public.kpi_snapshots where period_start between %L and %L and %s order by period_start, metric_key', cols, x.day_from, x.day_to,
      case when x.workspace_id is null then format('scope = ''platform'' and include_demo = %L', x.include_demo) else format('workspace_id = %L', x.workspace_id) end);
  else
    fact := 'fact_' || x.dataset;
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns
      where table_schema = 'public' and table_name = fact and column_name not in ('built_at');
    q := format('select %s from public.%I where day between %L and %L and %s order by day', cols, fact, x.day_from, x.day_to,
      case when x.workspace_id is null then case when x.include_demo then 'true' else 'not is_demo' end
           when fact = 'fact_booking_daily' then format('(workspace_id = %L or buyer_workspace_id = %L)', x.workspace_id, x.workspace_id)
           else format('workspace_id = %L', x.workspace_id) end);
  end if;
  -- RFC 4180 CSV: header + rows, every value quoted, embedded quotes doubled.
  select string_agg(format('coalesce(''"'' || replace(r.%s::text, ''"'', ''""'') || ''"'', '''')', c), ' || '','' || ') into line_expr
    from unnest(string_to_array(replace(cols, ' ', ''), ',')) c;
  execute format('select count(*), coalesce(string_agg(%s, E''\n''), '''') from (%s limit 200000) r', line_expr, q) into n, csv;
  csv := replace(cols, ' ', '') || E'\n' || csv;
  update public.analytics_exports set status = 'ready', row_count = n, content = csv, expires_at = now() + interval '24 hours', updated_at = now() where id = x.id;
  return jsonb_build_object('export_id', x.id, 'rows', n);
end $$;

create or replace function public.analytics_export_download(p_export uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.analytics_exports;
begin
  select * into x from public.analytics_exports where id = p_export;
  if not found or x.requested_by <> auth.uid() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.analytics_export_allowed(x.requested_by, x.workspace_id, x.dataset) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if x.status <> 'ready' then return jsonb_build_object('status', x.status, 'error', x.error); end if;
  if x.expires_at < now() then
    update public.analytics_exports set status = 'expired', content = null, updated_at = now() where id = x.id;
    return jsonb_build_object('status', 'expired');
  end if;
  update public.analytics_exports set downloaded_at = now() where id = x.id;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', x.workspace_id, 'analytics.export_downloaded',
    jsonb_build_object('export_id', x.id, 'dataset', x.dataset, 'rows', x.row_count));
  return jsonb_build_object('status', 'ready', 'dataset', x.dataset, 'rows', x.row_count, 'csv', x.content);
end $$;

-- Expired export content is dropped by the nightly build job's sweep.
create or replace function public.analytics_expire_exports() returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.analytics_exports set status = 'expired', content = null, updated_at = now() where status = 'ready' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 10. Jobs, schedules, events ──────────────────────────────────────────────────────────────────────────────────────
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('analytics.build_facts', 'db', 'public.job_analytics_build_facts', 3, 'Q35: nightly rebuild of warehouse facts for the trailing window (default 35 days)'),
  ('analytics.snapshot', 'db', 'public.job_analytics_snapshot', 3, 'Q35: immutable KPI snapshots for the closed day (and week/month on boundaries)'),
  ('analytics.export', 'db', 'public.job_analytics_export', 3, 'Q35: generate an analytics export dataset (permission re-checked; 24 h expiry)')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();

select cron.unschedule('analytics-warehouse') where exists (select 1 from cron.job where jobname = 'analytics-warehouse');
select cron.schedule('analytics-warehouse', '20 2 * * *', $cron$
  select public.analytics_expire_exports();
  select public.enqueue_job(p_kind => 'analytics.build_facts', p_payload => '{"days": 35}'::jsonb, p_dedupe_key => 'analytics.build_facts:' || to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD'));
  select public.enqueue_job(p_kind => 'analytics.snapshot', p_payload => '{}'::jsonb, p_dedupe_key => 'analytics.snapshot:' || to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD'), p_run_after => now() + interval '20 minutes');
$cron$);

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('analytics.rebuilt', 1, 'analytics_build_run', 'An admin rebuilt warehouse facts for a range (payload: from, to, reason, run_id).', null),
  ('analytics.metric_published', 1, 'metric_definition', 'A metric definition version was published and activated.', null),
  ('analytics.metric_activated', 1, 'metric_definition', 'The active version of a metric changed (restore/compare).', null),
  ('analytics.export_requested', 1, 'analytics_export', 'An analytics export was requested.', null),
  ('analytics.export_downloaded', 1, 'analytics_export', 'An analytics export was downloaded.', null)
on conflict (event_type) do update set description = excluded.description;

-- ── 11. Retention (Q32 schedule): raw product events 395 days; facts/snapshots are aggregates (no personal data) ────
insert into public.data_retention_rules(key, table_name, action, retention_days, basis, enabled, legal_review_required, batch_limit)
values ('analytics_events.raw', 'analytics_events', 'delete', 395, 'Pseudonymous product analytics: 13 months then deleted (draft, legal review of period pending).', true, false, 5000)
on conflict (key) do nothing;

-- Q32 retention_apply re-declared with ONE extra branch ('analytics_events.raw'); every other branch is the live body verbatim.
CREATE OR REPLACE FUNCTION public.retention_apply(p_key text, p_preview boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.data_retention_rules; cutoff timestamptz; n integer := 0;
begin
  select * into r from public.data_retention_rules where key = p_key;
  if not found then raise exception 'unknown_rule' using errcode = 'P0002'; end if;
  if r.action = 'retain' then return 0; end if;
  cutoff := now() - make_interval(days => r.retention_days);
  case p_key
  when 'rate_limits.stale' then
    if p_preview then select count(*) into n from public.rate_limits where window_start < cutoff;
    else delete from public.rate_limits where ctid in (select ctid from public.rate_limits where window_start < cutoff limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'notifications.read' then
    if p_preview then select count(*) into n from public.notifications x where x.read_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.notifications where id in (select x.id from public.notifications x where x.read_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'recently_viewed.stale' then
    if p_preview then select count(*) into n from public.recently_viewed x where x.viewed_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.recently_viewed where ctid in (select x.ctid from public.recently_viewed x where x.viewed_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'launch_queue.after_event' then
    if p_preview then select count(*) into n from public.launch_queue q join public.events e on e.id = q.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id);
    else delete from public.launch_queue where ctid in (select q.ctid from public.launch_queue q join public.events e on e.id = q.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'account_security_events.stale' then
    if p_preview then select count(*) into n from public.account_security_events x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.account_security_events where id in (select x.id from public.account_security_events x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'review_provenance.stale' then
    if p_preview then select count(*) into n from public.review_provenance x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id);
    else delete from public.review_provenance where review_id in (select x.review_id from public.review_provenance x where x.created_at < cutoff and not public.legal_hold_covers_user(x.user_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'guest_care.after_event' then
    if p_preview then select count(*) into n from public.guest_care c join public.events e on e.id = c.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id);
    else delete from public.guest_care where guest_id in (select c.guest_id from public.guest_care c join public.events e on e.id = c.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'guests.after_event' then
    if p_preview then select count(*) into n from public.guests x join public.events e on e.id = x.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and x.email <> 'anonymised' and not public.legal_hold_covers_event(e.id);
    else update public.guests set name = 'Guest', email = 'anonymised', phone = '', rsvp_note = '', dietary = '' where id in (select x.id from public.guests x join public.events e on e.id = x.event_id
      where coalesce(e.ends_at, e.starts_at) < cutoff and x.email <> 'anonymised' and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'registrations.after_event' then
    if p_preview then select count(*) into n from public.registrations x join public.events e on e.id = x.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and x.answers <> '{}' and not public.legal_hold_covers_event(e.id);
    else
      delete from public.registration_private p using public.registrations x, public.events e where p.registration_id = x.id and e.id = x.event_id and coalesce(e.ends_at, e.starts_at) < cutoff and not public.legal_hold_covers_event(e.id);
      update public.registrations set name = 'Attendee', email = 'anonymised+' || id || '@users.invalid', answers = '{}' where id in (select x.id from public.registrations x join public.events e on e.id = x.event_id
        where coalesce(e.ends_at, e.starts_at) < cutoff and x.answers <> '{}' and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count;
    end if;
  when 'access_passes.after_event' then
    if p_preview then select count(*) into n from public.access_passes x join public.events e on e.id = x.event_id where coalesce(e.ends_at, e.starts_at) < cutoff and x.holder_email <> '' and not public.legal_hold_covers_event(e.id);
    else update public.access_passes set holder_email = '' where id in (select x.id from public.access_passes x join public.events e on e.id = x.event_id
      where coalesce(e.ends_at, e.starts_at) < cutoff and x.holder_email <> '' and not public.legal_hold_covers_event(e.id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'check_ins.device' then
    if p_preview then select count(*) into n from public.check_ins x where x.created_at < cutoff and x.device is not null and not public.legal_hold_covers_event(x.event_id);
    else update public.check_ins set device = null where id in (select x.id from public.check_ins x where x.created_at < cutoff and x.device is not null and not public.legal_hold_covers_event(x.event_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'ticket_transfers.closed' then
    if p_preview then select count(*) into n from public.ticket_transfers x where x.status <> 'pending' and coalesce(x.decided_at, x.expires_at, x.created_at) < cutoff and x.to_email not like 'erased+%';
    else update public.ticket_transfers set to_email = 'erased+' || id || '@users.invalid', to_name = '' where id in (select x.id from public.ticket_transfers x
      where x.status <> 'pending' and coalesce(x.decided_at, x.expires_at, x.created_at) < cutoff and x.to_email not like 'erased+%' and not public.legal_hold_covers_user(x.from_user) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'risk_signals.closed' then
    if p_preview then select count(*) into n from public.risk_signals x where x.status in ('cleared', 'expired') and x.updated_at < cutoff and x.evidence <> '{}' and not public.legal_hold_covers_user(x.user_id);
    else update public.risk_signals set evidence = '{}' where id in (select x.id from public.risk_signals x where x.status in ('cleared', 'expired') and x.updated_at < cutoff and x.evidence <> '{}'
      and not public.legal_hold_covers_user(x.user_id) and not public.legal_hold_covers('workspace', x.workspace_id) limit r.batch_limit); get diagnostics n = row_count; end if;
  when 'analytics_events.raw' then
    -- Q35: pseudonymous product events; rows tied to a workspace under legal hold are kept.
    if p_preview then select count(*) into n from public.analytics_events x where x.occurred_at < cutoff and (x.workspace_id is null or not public.legal_hold_covers('workspace', x.workspace_id));
    else delete from public.analytics_events where id in (select x.id from public.analytics_events x where x.occurred_at < cutoff
      and (x.workspace_id is null or not public.legal_hold_covers('workspace', x.workspace_id)) limit r.batch_limit); get diagnostics n = row_count; end if;
  else raise exception 'no_handler:%', p_key using errcode = '22023';
  end case;
  return n;
end $function$;

-- ── 12. Grants ───────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.analytics_pseudonym(text), public.analytics_clean_props(jsonb, text[]), public.analytics_normalise_path(text),
  public.analytics_user_is_demo(uuid), public.analytics_workspace_is_demo(uuid), public.analytics_capture(jsonb, jsonb),
  public.analytics_capture_server(text, uuid, uuid, jsonb), public.analytics_consent_for(uuid), public.analytics_forget_user(uuid), public.analytics_on_user_erased(),
  public.analytics_build_day(date), public.analytics_build_range(date, date, text), public.job_analytics_build_facts(public.job_queue),
  public.admin_analytics_rebuild(date, date, text), public.metric_definitions_immutable(), public.analytics_fact_columns(text), public.analytics_validate_spec(jsonb),
  public.analytics_eval_sum(jsonb, date, date, uuid, boolean), public.analytics_m_ticket_sell_through(date, date, uuid, boolean), public.analytics_m_scan_rate(date, date, uuid, boolean),
  public.analytics_m_subscription_mrr(date, date, uuid, boolean), public.analytics_m_ai_revenue(date, date, uuid, boolean), public.analytics_m_promotion_revenue(date, date, uuid, boolean),
  public.analytics_m_ai_margin(date, date, uuid, boolean), public.analytics_m_gross_margin(date, date, uuid, boolean), public.analytics_m_provider_supply(date, date, uuid, boolean),
  public.analytics_m_capacity_use(date, date, uuid, boolean), public.analytics_m_net_gmv(date, date, uuid, boolean), public.analytics_m_event_conversion(date, date, uuid, boolean),
  public.analytics_eval(text, date, date, uuid, boolean), public.admin_metric_publish(text, text, text, text, text, text, jsonb, text), public.admin_metric_activate(text, integer, text),
  public.analytics_can_read(uuid, text), public.analytics_workspace_metrics(uuid, date, date, text[]), public.analytics_trend(text, uuid, date, date, text),
  public.analytics_event_report(uuid), public.analytics_platform_report(date, date, boolean), public.analytics_supply_gaps(date, date, boolean),
  public.analytics_funnel(text[], date, date, uuid, boolean), public.analytics_retention(date, integer), public.analytics_reconcile(date, date),
  public.kpi_snapshots_immutable(), public.analytics_snapshot_period(date, text), public.job_analytics_snapshot(public.job_queue),
  public.analytics_export_allowed(uuid, uuid, text), public.analytics_request_export(text, uuid, date, date, boolean), public.job_analytics_export(public.job_queue),
  public.analytics_export_download(uuid), public.analytics_expire_exports()
from public, anon, authenticated;

-- Signed-in reads (each checks membership/role/admin permission itself). analytics_can_read is used by the kpi_snapshots policy.
grant execute on function public.analytics_workspace_metrics(uuid, date, date, text[]), public.analytics_trend(text, uuid, date, date, text),
  public.analytics_event_report(uuid), public.analytics_platform_report(date, date, boolean), public.analytics_supply_gaps(date, date, boolean),
  public.analytics_funnel(text[], date, date, uuid, boolean), public.analytics_retention(date, integer), public.analytics_reconcile(date, date),
  public.admin_metric_publish(text, text, text, text, text, text, jsonb, text), public.admin_metric_activate(text, integer, text), public.admin_analytics_rebuild(date, date, text),
  public.analytics_request_export(text, uuid, date, date, boolean), public.analytics_export_download(uuid), public.analytics_can_read(uuid, text)
to authenticated, service_role;
-- Everything else: trusted workers / route handlers only.
grant execute on function public.analytics_pseudonym(text), public.analytics_clean_props(jsonb, text[]), public.analytics_normalise_path(text),
  public.analytics_user_is_demo(uuid), public.analytics_workspace_is_demo(uuid), public.analytics_capture(jsonb, jsonb),
  public.analytics_capture_server(text, uuid, uuid, jsonb), public.analytics_consent_for(uuid), public.analytics_forget_user(uuid),
  public.analytics_build_day(date), public.analytics_build_range(date, date, text), public.job_analytics_build_facts(public.job_queue),
  public.analytics_fact_columns(text), public.analytics_validate_spec(jsonb), public.analytics_eval_sum(jsonb, date, date, uuid, boolean),
  public.analytics_m_ticket_sell_through(date, date, uuid, boolean), public.analytics_m_scan_rate(date, date, uuid, boolean),
  public.analytics_m_subscription_mrr(date, date, uuid, boolean), public.analytics_m_ai_revenue(date, date, uuid, boolean), public.analytics_m_promotion_revenue(date, date, uuid, boolean),
  public.analytics_m_ai_margin(date, date, uuid, boolean), public.analytics_m_gross_margin(date, date, uuid, boolean), public.analytics_m_provider_supply(date, date, uuid, boolean),
  public.analytics_m_capacity_use(date, date, uuid, boolean), public.analytics_m_net_gmv(date, date, uuid, boolean), public.analytics_m_event_conversion(date, date, uuid, boolean),
  public.analytics_eval(text, date, date, uuid, boolean), public.analytics_snapshot_period(date, text), public.job_analytics_snapshot(public.job_queue),
  public.analytics_export_allowed(uuid, uuid, text), public.job_analytics_export(public.job_queue), public.analytics_expire_exports()
to service_role;
