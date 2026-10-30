-- Q23 remainder (lane A, 2026-10-29): Promotion Campaigns (139) + campaign marketing through Q05 rules, UTM links,
-- attribution to ticket orders (with the Q23 ad attribution), performance reporting and the organiser promotion calendar.
-- Additive and backward compatible.
--   * promotion_campaigns: resumable 5-step setup (goal → dates → audience → budget/channels → review), idempotent creation
--     (request_id), optimistic version, machine `promotion_campaign` (enforce). Budgets in pence (GBP).
--   * campaign_channels (email, sms, social, ads, organic, partner, poster, landing); ads budget needs finance.write
--     ("ads require billing permission"); promotion_boosts.campaign_id links paid ad flights to a campaign.
--   * marketing consent per organiser (audience_consents, service-only) + global email_suppressions; unsubscribe by token.
--     Sends are FIXTURE ONLY: campaign_dispatch_message records campaign_deliveries (transport = 'fixture'); no email or SMS
--     is ever handed to a provider from here (real transport = owner decision, BLOCKED).
--   * campaign_links (UTM, internal destinations only: no open redirect) → campaign_touches → campaign_attributions:
--     last campaign touch by the buyer within 7 days before a paid/issued order; orders already attributed to a campaign's
--     ad boost are credited to the 'ads' channel (no double count); reversed on refund. Reconciled in campaign_report.
--   * campaign_report: aggregates only — never emails, user ids or visitor hashes; providers have no access.
--   * promotion_blackouts + promotion_calendar: tentative vs confirmed items, blackout periods, conflicts.

-- ═══ 1. Campaigns ═══
create table if not exists public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  name text not null check (length(btrim(name)) between 2 and 120),
  goal text not null default 'ticket_sales' check (goal in ('awareness','ticket_sales','registrations','followers','launch','sell_out')),
  goal_target integer check (goal_target is null or goal_target > 0),
  status text not null default 'draft' check (status in ('draft','scheduled','active','paused','completed','cancelled')),
  starts_at timestamptz, ends_at timestamptz, timezone text not null default 'Europe/London',
  budget_minor bigint not null default 0 check (budget_minor between 0 and 100000000),
  currency text not null default 'GBP' check (currency = 'GBP'),
  audience jsonb not null default '{}' check (jsonb_typeof(audience) = 'object'),
  utm_campaign text not null check (utm_campaign ~ '^[a-z0-9][a-z0-9\-_]{1,59}$'),
  setup_step integer not null default 1 check (setup_step between 1 and 5),
  request_id text check (request_id is null or length(request_id) <= 80),
  version integer not null default 1,
  cancelled_reason text, completed_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  unique (workspace_id, utm_campaign)
);
create unique index if not exists promotion_campaigns_request on public.promotion_campaigns(workspace_id, request_id) where request_id is not null;
create index if not exists promotion_campaigns_ws on public.promotion_campaigns(workspace_id, status, starts_at);
create index if not exists promotion_campaigns_event on public.promotion_campaigns(event_id);

create table if not exists public.campaign_channels (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  channel text not null check (channel in ('email','sms','social','ads','organic','partner','poster','landing')),
  budget_minor bigint not null default 0 check (budget_minor >= 0),
  spent_minor bigint not null default 0 check (spent_minor >= 0),
  partner_id uuid,
  status text not null default 'planned' check (status in ('planned','active','paused','done')),
  created_at timestamptz not null default now(),
  unique (campaign_id, channel)
);
alter table public.promotion_boosts add column if not exists campaign_id uuid references public.promotion_campaigns(id) on delete set null;
create index if not exists promotion_boosts_campaign on public.promotion_boosts(campaign_id) where campaign_id is not null;

create table if not exists public.promotion_blackouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, channel text check (channel is null or channel in ('email','sms','social','ads')),
  reason text not null default '' check (length(reason) <= 200),
  created_by uuid, created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists promotion_blackouts_ws on public.promotion_blackouts(workspace_id, starts_at);

-- ═══ 2. Consent, messages, deliveries (fixture transport) ═══
create table if not exists public.audience_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text check (email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  user_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('email','sms')),
  status text not null default 'opted_in' check (status in ('opted_in','opted_out')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  consent_version text not null, source text not null check (source in ('checkout','registration','form','import','organiser_page')),
  consented_at timestamptz not null default now(), opted_out_at timestamptz,
  check ((channel = 'email' and email is not null) or (channel = 'sms' and phone is not null))
);
create unique index if not exists audience_consents_email on public.audience_consents(workspace_id, email) where channel = 'email';
create unique index if not exists audience_consents_phone on public.audience_consents(workspace_id, phone) where channel = 'sms';

create table if not exists public.campaign_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  channel text not null check (channel in ('email','sms')),
  subject text check (subject is null or length(subject) <= 200),
  body text not null check (length(body) between 1 and 20000),
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled','failed')),
  audience_counts jsonb, sent_at timestamptz, version integer not null default 1,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (channel <> 'sms' or length(body) <= 612),
  check (channel <> 'email' or subject is not null)
);
create index if not exists campaign_messages_due on public.campaign_messages(scheduled_at) where status = 'scheduled';

create table if not exists public.campaign_deliveries (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.campaign_messages(id) on delete cascade,
  recipient_hash text not null,
  consent_id uuid references public.audience_consents(id) on delete set null,
  status text not null check (status in ('sent_fixture','suppressed','unsubscribed','failed')),
  transport text not null default 'fixture' check (transport = 'fixture'),
  created_at timestamptz not null default now(),
  unique (message_id, recipient_hash)
);

-- ═══ 3. Links, touches, attribution ═══
create table if not exists public.campaign_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  channel text not null check (channel in ('email','sms','social','ads','organic','partner','poster','landing')),
  code text not null unique check (code ~ '^[a-z0-9]{10}$'),
  destination text not null check (destination ~ '^/(events|organizers|venues|series|p)/[A-Za-z0-9\-_]{1,120}$'),
  utm_source text not null default 'galadock' check (utm_source ~ '^[a-z0-9\-_]{1,40}$'),
  utm_medium text not null check (utm_medium ~ '^[a-z0-9\-_]{1,40}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.campaign_touches (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  link_id uuid not null references public.campaign_links(id) on delete cascade,
  visitor_hash text not null, user_id uuid,
  touched_at timestamptz not null default now()
);
create index if not exists campaign_touches_user on public.campaign_touches(user_id, touched_at desc) where user_id is not null;
create index if not exists campaign_touches_campaign on public.campaign_touches(campaign_id, touched_at);
create table if not exists public.campaign_attributions (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null unique,
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  link_id uuid references public.campaign_links(id) on delete set null,
  boost_id uuid,
  channel text not null, event_id uuid,
  amount_minor bigint not null,
  model text not null default 'last_touch_7d',
  status text not null default 'attributed' check (status in ('attributed','reversed')),
  attributed_at timestamptz not null default now(), reversed_at timestamptz
);
create index if not exists campaign_attributions_campaign on public.campaign_attributions(campaign_id, status);

-- ═══ RLS ═══
alter table public.promotion_campaigns enable row level security;
alter table public.campaign_channels enable row level security;
alter table public.promotion_blackouts enable row level security;
alter table public.audience_consents enable row level security;
alter table public.campaign_messages enable row level security;
alter table public.campaign_deliveries enable row level security;
alter table public.campaign_links enable row level security;
alter table public.campaign_touches enable row level security;
alter table public.campaign_attributions enable row level security;
revoke all on table public.promotion_campaigns, public.campaign_channels, public.promotion_blackouts, public.audience_consents, public.campaign_messages,
  public.campaign_deliveries, public.campaign_links, public.campaign_touches, public.campaign_attributions from public, anon, authenticated;
grant select on table public.promotion_campaigns, public.campaign_channels, public.promotion_blackouts, public.campaign_messages, public.campaign_links to authenticated;
grant all on table public.promotion_campaigns, public.campaign_channels, public.promotion_blackouts, public.audience_consents, public.campaign_messages,
  public.campaign_deliveries, public.campaign_links, public.campaign_touches, public.campaign_attributions to service_role;

create or replace function public.campaign_can(p_workspace uuid, p_need text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_need
    when 'manage' then public.has_permission(p_workspace, 'promotion.manage')
    when 'billing' then public.has_permission(p_workspace, 'finance.write')
    else public.has_permission(p_workspace, 'promotion.manage') or public.has_permission(p_workspace, 'money.read') or public.has_permission(p_workspace, 'events.write') end
$$;
drop policy if exists promotion_campaigns_read on public.promotion_campaigns;
create policy promotion_campaigns_read on public.promotion_campaigns for select to authenticated using (public.campaign_can(workspace_id, 'read'));
drop policy if exists campaign_channels_read on public.campaign_channels;
create policy campaign_channels_read on public.campaign_channels for select to authenticated using (exists (select 1 from public.promotion_campaigns c where c.id = campaign_id and public.campaign_can(c.workspace_id, 'read')));
drop policy if exists campaign_messages_read on public.campaign_messages;
create policy campaign_messages_read on public.campaign_messages for select to authenticated using (exists (select 1 from public.promotion_campaigns c where c.id = campaign_id and public.campaign_can(c.workspace_id, 'read')));
drop policy if exists campaign_links_read on public.campaign_links;
create policy campaign_links_read on public.campaign_links for select to authenticated using (exists (select 1 from public.promotion_campaigns c where c.id = campaign_id and public.campaign_can(c.workspace_id, 'read')));
drop policy if exists promotion_blackouts_read on public.promotion_blackouts;
create policy promotion_blackouts_read on public.promotion_blackouts for select to authenticated using (public.campaign_can(workspace_id, 'read'));

-- ═══ 4. State machine (generator-equivalent rows + enforce guard) ═══
delete from public.state_transitions where machine = 'promotion_campaign';
delete from public.state_machines where machine = 'promotion_campaign';
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states) values
  ('promotion_campaign', 'promotion_campaigns', 'status', 'enforce', array['draft']::text[], array['completed','cancelled']::text[]);
insert into public.state_transitions(machine, from_state, to_state) values
  ('promotion_campaign','draft','scheduled'),('promotion_campaign','draft','cancelled'),
  ('promotion_campaign','scheduled','draft'),('promotion_campaign','scheduled','active'),('promotion_campaign','scheduled','cancelled'),
  ('promotion_campaign','active','paused'),('promotion_campaign','active','completed'),('promotion_campaign','active','cancelled'),
  ('promotion_campaign','paused','active'),('promotion_campaign','paused','completed'),('promotion_campaign','paused','cancelled');
drop trigger if exists promotion_campaigns_state_guard on public.promotion_campaigns;
create trigger promotion_campaigns_state_guard before insert or update of status on public.promotion_campaigns for each row execute function public.enforce_state_transition('promotion_campaign', 'status');

-- ═══ 5. Setup, blockers, transitions ═══
create or replace function public.campaign_blockers(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.promotion_campaigns; b jsonb := '[]'; ch_total bigint; d public.event_distribution;
begin
  select * into c from public.promotion_campaigns where id = p_campaign;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.starts_at is null or c.ends_at is null then b := b || jsonb_build_object('key', 'dates', 'label', 'Set campaign start and end dates', 'step', 2); end if;
  if c.ends_at is not null and c.ends_at <= now() then b := b || jsonb_build_object('key', 'dates_past', 'label', 'The campaign end date has passed', 'step', 2); end if;
  if not exists (select 1 from public.campaign_channels x where x.campaign_id = c.id) then b := b || jsonb_build_object('key', 'channels', 'label', 'Choose at least one channel', 'step', 4); end if;
  select coalesce(sum(budget_minor), 0) into ch_total from public.campaign_channels where campaign_id = c.id;
  if ch_total > c.budget_minor then b := b || jsonb_build_object('key', 'budget', 'label', 'Channel budgets exceed the campaign budget', 'step', 4); end if;
  if c.event_id is not null then
    select * into d from public.event_distribution where event_id = c.event_id;
    if coalesce(d.status, 'unlisted') <> 'listed' and exists (select 1 from public.campaign_channels x where x.campaign_id = c.id and x.channel in ('ads','social','landing','partner','poster','email','sms')) then
      b := b || jsonb_build_object('key', 'event_not_public', 'label', 'Publish the event publicly before promoting it outside Gala Dock', 'step', 1);
    end if;
    if exists (select 1 from public.events e where e.id = c.event_id and c.ends_at is not null and coalesce(e.ends_at, e.starts_at) < c.starts_at) then
      b := b || jsonb_build_object('key', 'after_event', 'label', 'The campaign starts after the event has finished', 'step', 2);
    end if;
  end if;
  if exists (select 1 from public.campaign_channels x where x.campaign_id = c.id and x.channel = 'sms') then
    b := b || jsonb_build_object('key', 'sms_unavailable', 'label', 'SMS sending is not available yet (no SMS provider configured)', 'step', 4, 'external', true);
  end if;
  return b;
end $$;

-- Resumable setup. p_patch keys per step: 1 name, goal, goal_target, event_id · 2 starts_at, ends_at, timezone · 3 audience ·
-- 4 budget_minor, channels [{channel, budget_minor, partner_id}] · 5 (review, no keys). Creating = p_campaign null (+ request_id).
create or replace function public.save_campaign_setup(p_workspace uuid, p_campaign uuid, p_step integer, p_patch jsonb, p_expected_version integer default null, p_request_id text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); c public.promotion_campaigns; x jsonb; slug text; aud jsonb; k text; ev uuid;
begin
  if uid is null or not public.campaign_can(p_workspace, 'manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_step is null or p_step not between 1 and 5 then raise exception 'invalid_step' using errcode = '22023'; end if;
  p_patch := coalesce(p_patch, '{}');
  if p_campaign is null then
    if p_request_id is not null then
      select * into c from public.promotion_campaigns where workspace_id = p_workspace and request_id = p_request_id;
      if found then return jsonb_build_object('ok', true, 'id', c.id, 'version', c.version, 'step', c.setup_step, 'replayed', true, 'blockers', public.campaign_blockers(c.id)); end if;
    end if;
    slug := left(regexp_replace(lower(coalesce(p_patch->>'name', 'campaign')), '[^a-z0-9]+', '-', 'g'), 40);
    slug := trim(both '-' from slug); if length(slug) < 2 then slug := 'campaign'; end if;
    slug := slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    ev := nullif(p_patch->>'event_id', '')::uuid;
    if ev is not null and not exists (select 1 from public.events e where e.id = ev and e.workspace_id = p_workspace) then raise exception 'event_not_in_workspace' using errcode = '22023'; end if;
    insert into public.promotion_campaigns(workspace_id, event_id, name, goal, goal_target, utm_campaign, request_id, created_by)
      values (p_workspace, ev, btrim(coalesce(p_patch->>'name', 'New campaign')), coalesce(p_patch->>'goal', 'ticket_sales'), nullif(p_patch->>'goal_target', '')::int, slug, p_request_id, uid)
      returning * into c;
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, p_workspace, 'promotion.campaign_created', jsonb_build_object('campaign_id', c.id, 'event_id', c.event_id, 'goal', c.goal));
    return jsonb_build_object('ok', true, 'id', c.id, 'version', c.version, 'step', c.setup_step, 'blockers', public.campaign_blockers(c.id));
  end if;
  select * into c from public.promotion_campaigns where id = p_campaign and workspace_id = p_workspace for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_expected_version is not null and c.version <> p_expected_version then return jsonb_build_object('ok', false, 'conflict', true, 'version', c.version); end if;
  if c.status in ('completed','cancelled') then raise exception 'campaign_closed' using errcode = '22023'; end if;
  if p_step = 1 then
    ev := case when p_patch ? 'event_id' then nullif(p_patch->>'event_id', '')::uuid else c.event_id end;
    if ev is not null and not exists (select 1 from public.events e where e.id = ev and e.workspace_id = p_workspace) then raise exception 'event_not_in_workspace' using errcode = '22023'; end if;
    update public.promotion_campaigns set name = coalesce(btrim(p_patch->>'name'), name), goal = coalesce(p_patch->>'goal', goal),
      goal_target = case when p_patch ? 'goal_target' then nullif(p_patch->>'goal_target', '')::int else goal_target end, event_id = ev where id = c.id;
  elsif p_step = 2 then
    if p_patch ? 'timezone' and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_patch->>'timezone') then raise exception 'invalid_timezone' using errcode = '22023'; end if;
    update public.promotion_campaigns set starts_at = coalesce((p_patch->>'starts_at')::timestamptz, starts_at), ends_at = coalesce((p_patch->>'ends_at')::timestamptz, ends_at),
      timezone = coalesce(p_patch->>'timezone', timezone) where id = c.id;
  elsif p_step = 3 then
    aud := coalesce(p_patch->'audience', '{}');
    for k in select jsonb_object_keys(aud) loop
      if k not in ('followers','consented_contacts','past_attendees','cities','categories') then raise exception 'invalid_audience_key: %', k using errcode = '22023'; end if;
    end loop;
    update public.promotion_campaigns set audience = aud where id = c.id;
  elsif p_step = 4 then
    if p_patch ? 'budget_minor' then update public.promotion_campaigns set budget_minor = (p_patch->>'budget_minor')::bigint where id = c.id; end if;
    if p_patch ? 'channels' then
      for x in select * from jsonb_array_elements(p_patch->'channels') loop
        if x->>'channel' = 'ads' and coalesce((x->>'budget_minor')::bigint, 0) > 0 and not public.campaign_can(p_workspace, 'billing') then
          raise exception 'billing_permission_required' using errcode = '42501';
        end if;
      end loop;
      delete from public.campaign_channels where campaign_id = c.id and channel not in (select q->>'channel' from jsonb_array_elements(p_patch->'channels') q);
      insert into public.campaign_channels(campaign_id, channel, budget_minor, partner_id)
        select c.id, q->>'channel', coalesce((q->>'budget_minor')::bigint, 0), nullif(q->>'partner_id', '')::uuid from jsonb_array_elements(p_patch->'channels') q
      on conflict (campaign_id, channel) do update set budget_minor = excluded.budget_minor, partner_id = excluded.partner_id;
    end if;
  end if;
  update public.promotion_campaigns set setup_step = greatest(setup_step, least(p_step + 1, 5)), version = version + 1, updated_at = now() where id = c.id returning * into c;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, p_workspace, 'promotion.campaign_updated', jsonb_build_object('campaign_id', c.id, 'step', p_step, 'version', c.version));
  return jsonb_build_object('ok', true, 'id', c.id, 'version', c.version, 'step', c.setup_step, 'blockers', public.campaign_blockers(c.id));
end $$;

create or replace function public.campaign_transition(p_campaign uuid, p_to text, p_expected text default null, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare c public.promotion_campaigns; uid uuid := (select auth.uid()); bl jsonb; r jsonb;
begin
  select * into c from public.promotion_campaigns where id = p_campaign;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if uid is not null and not public.campaign_can(c.workspace_id, 'manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to in ('scheduled','active') then
    bl := (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(public.campaign_blockers(c.id)) x where coalesce((x->>'external')::boolean, false) = false);
    if jsonb_array_length(bl) > 0 then return jsonb_build_object('ok', false, 'error', 'preconditions', 'blockers', bl); end if;
  end if;
  r := public.transition_state('promotion_campaign', c.id, p_to, p_expected, uid, case when uid is null then 'system' else 'user' end, p_reason);
  if coalesce((r->>'changed')::boolean, false) then
    update public.promotion_campaigns set version = version + 1, updated_at = now(),
      completed_at = case when p_to = 'completed' then now() else completed_at end, cancelled_reason = case when p_to = 'cancelled' then left(p_reason, 300) else cancelled_reason end where id = c.id;
    update public.campaign_messages set status = 'cancelled', updated_at = now() where campaign_id = c.id and status = 'scheduled' and p_to in ('cancelled','completed');
    update public.campaign_channels set status = case when p_to = 'active' then 'active' when p_to = 'paused' then 'paused' when p_to in ('completed','cancelled') then 'done' else status end where campaign_id = c.id;
    insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (uid, case when uid is null then 'system' else 'user' end, c.workspace_id, 'promotion.campaign_transitioned',
      jsonb_build_object('campaign_id', c.id, 'from', r->>'from', 'to', p_to));
  end if;
  return r;
end $$;

-- ═══ 6. Consent + unsubscribe (service-only; called from checkout/registration server actions with an explicit opt-in) ═══
create or replace function public.audience_consent_record(p_workspace uuid, p_channel text, p_email text, p_phone text, p_user uuid, p_token_hash text, p_consent_version text, p_source text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.audience_consents; em text := lower(btrim(p_email));
begin
  if p_channel = 'email' then
    insert into public.audience_consents(workspace_id, email, user_id, channel, token_hash, consent_version, source)
      values (p_workspace, em, p_user, 'email', p_token_hash, left(p_consent_version, 40), p_source)
    on conflict (workspace_id, email) where channel = 'email' do update set status = 'opted_in', consented_at = now(), opted_out_at = null,
      consent_version = excluded.consent_version, source = excluded.source, token_hash = excluded.token_hash, user_id = coalesce(public.audience_consents.user_id, excluded.user_id)
    returning * into r;
  else
    insert into public.audience_consents(workspace_id, phone, user_id, channel, token_hash, consent_version, source)
      values (p_workspace, btrim(p_phone), p_user, 'sms', p_token_hash, left(p_consent_version, 40), p_source)
    on conflict (workspace_id, phone) where channel = 'sms' do update set status = 'opted_in', consented_at = now(), opted_out_at = null,
      consent_version = excluded.consent_version, source = excluded.source, token_hash = excluded.token_hash
    returning * into r;
  end if;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', p_workspace, 'promotion.consent_recorded', jsonb_build_object('channel', p_channel, 'source', p_source, 'version', p_consent_version));
  return jsonb_build_object('ok', true, 'id', r.id, 'status', r.status);
end $$;
create or replace function public.audience_unsubscribe(p_token_hash text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.audience_consents;
begin
  update public.audience_consents set status = 'opted_out', opted_out_at = now() where token_hash = p_token_hash and status = 'opted_in' returning * into r;
  if r.id is null then select * into r from public.audience_consents where token_hash = p_token_hash; end if;
  if r.id is null then return jsonb_build_object('ok', false, 'status', 'unknown'); end if;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', r.workspace_id, 'promotion.unsubscribed', jsonb_build_object('channel', r.channel));
  return jsonb_build_object('ok', true, 'status', r.status);
end $$;
create or replace function public.audience_consent_summary(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.campaign_can(p_workspace, 'read') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'email_opted_in', (select count(*) from public.audience_consents a where a.workspace_id = p_workspace and a.channel = 'email' and a.status = 'opted_in'
                         and not exists (select 1 from public.email_suppressions s where s.email = a.email)),
    'email_opted_out', (select count(*) from public.audience_consents a where a.workspace_id = p_workspace and a.channel = 'email' and a.status = 'opted_out'),
    'email_suppressed', (select count(*) from public.audience_consents a join public.email_suppressions s on s.email = a.email where a.workspace_id = p_workspace and a.status = 'opted_in'),
    'sms_opted_in', (select count(*) from public.audience_consents a where a.workspace_id = p_workspace and a.channel = 'sms' and a.status = 'opted_in'),
    'followers', public.follow_count('organizer', p_workspace::text));
end $$;

-- ═══ 7. Messages and fixture dispatch ═══
create or replace function public.campaign_message_save(p_campaign uuid, p_message uuid, p_channel text, p_subject text, p_body text, p_scheduled_at timestamptz, p_expected_version integer default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c public.promotion_campaigns; m public.campaign_messages; uid uuid := (select auth.uid()); warn jsonb := '[]';
begin
  select * into c from public.promotion_campaigns where id = p_campaign;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.campaign_can(c.workspace_id, 'manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if c.status in ('completed','cancelled') then raise exception 'campaign_closed' using errcode = '22023'; end if;
  if not exists (select 1 from public.campaign_channels x where x.campaign_id = c.id and x.channel = p_channel) then raise exception 'channel_not_in_campaign' using errcode = '22023'; end if;
  if p_scheduled_at is not null and (c.starts_at is null or p_scheduled_at < c.starts_at or p_scheduled_at > c.ends_at) then raise exception 'outside_campaign_dates' using errcode = '22023'; end if;
  if p_scheduled_at is not null and p_scheduled_at < now() then raise exception 'schedule_in_past' using errcode = '22023'; end if;
  if p_body ~* '<script|javascript:|on[a-z]+\s*=' then raise exception 'unsafe_content' using errcode = '22023'; end if;
  if p_message is null then
    insert into public.campaign_messages(campaign_id, channel, subject, body, scheduled_at, status, created_by)
      values (c.id, p_channel, p_subject, p_body, p_scheduled_at, case when p_scheduled_at is null then 'draft' else 'scheduled' end, uid) returning * into m;
  else
    update public.campaign_messages set subject = p_subject, body = p_body, scheduled_at = p_scheduled_at, status = case when p_scheduled_at is null then 'draft' else 'scheduled' end,
      version = version + 1, updated_at = now()
     where id = p_message and campaign_id = c.id and status in ('draft','scheduled') and (p_expected_version is null or version = p_expected_version) returning * into m;
    if m.id is null then
      if exists (select 1 from public.campaign_messages where id = p_message and status in ('draft','scheduled')) then return jsonb_build_object('ok', false, 'conflict', true); end if;
      raise exception 'message_not_editable' using errcode = '22023';
    end if;
  end if;
  if p_scheduled_at is not null then
    select coalesce(jsonb_agg(jsonb_build_object('key', 'blackout', 'reason', b.reason, 'from', b.starts_at, 'to', b.ends_at)), '[]') into warn
      from public.promotion_blackouts b where b.workspace_id = c.workspace_id and p_scheduled_at >= b.starts_at and p_scheduled_at < b.ends_at and (b.channel is null or b.channel = p_channel);
    warn := warn || coalesce((select jsonb_agg(jsonb_build_object('key', 'audience_fatigue', 'message_id', o.id, 'at', o.scheduled_at))
      from public.campaign_messages o join public.promotion_campaigns oc on oc.id = o.campaign_id
     where oc.workspace_id = c.workspace_id and o.id <> m.id and o.channel = p_channel and o.status in ('scheduled','sent')
       and coalesce(o.sent_at, o.scheduled_at) between p_scheduled_at - interval '24 hours' and p_scheduled_at + interval '24 hours'), '[]');
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, c.workspace_id, 'promotion.campaign_message_saved', jsonb_build_object('campaign_id', c.id, 'message_id', m.id, 'status', m.status));
  return jsonb_build_object('ok', true, 'id', m.id, 'status', m.status, 'version', m.version, 'warnings', warn);
end $$;

-- Service-only. Consent is per organiser; followers are NOT emailed (follows give in-app alerts only). Suppressed and
-- opted-out recipients are recorded and skipped. Transport is always 'fixture' — nothing leaves Gala Dock.
create or replace function public.campaign_dispatch_message(p_message uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare m public.campaign_messages; c public.promotion_campaigns; sent int := 0; sup int := 0; uns int := 0;
begin
  select * into m from public.campaign_messages where id = p_message for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.status = 'sent' then return jsonb_build_object('ok', true, 'replayed', true, 'counts', m.audience_counts); end if;
  if m.status not in ('scheduled','sending') then raise exception 'message_not_scheduled' using errcode = '22023'; end if;
  select * into c from public.promotion_campaigns where id = m.campaign_id;
  if c.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'campaign_not_active', 'status', c.status); end if;
  if m.channel = 'sms' then
    update public.campaign_messages set status = 'failed', updated_at = now(), audience_counts = jsonb_build_object('error', 'sms_provider_unavailable') where id = m.id;
    return jsonb_build_object('ok', false, 'error', 'sms_provider_unavailable');
  end if;
  update public.campaign_messages set status = 'sending', updated_at = now() where id = m.id;
  insert into public.campaign_deliveries(message_id, recipient_hash, consent_id, status)
    select m.id, encode(extensions.digest(a.email, 'sha256'), 'hex'), a.id,
           case when a.status = 'opted_out' then 'unsubscribed' when exists (select 1 from public.email_suppressions s where s.email = a.email) then 'suppressed' else 'sent_fixture' end
      from public.audience_consents a where a.workspace_id = c.workspace_id and a.channel = 'email'
  on conflict (message_id, recipient_hash) do nothing;
  select count(*) filter (where status = 'sent_fixture'), count(*) filter (where status = 'suppressed'), count(*) filter (where status = 'unsubscribed')
    into sent, sup, uns from public.campaign_deliveries where message_id = m.id;
  update public.campaign_messages set status = 'sent', sent_at = now(), updated_at = now(),
    audience_counts = jsonb_build_object('sent_fixture', sent, 'suppressed', sup, 'unsubscribed', uns, 'transport', 'fixture') where id = m.id;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', c.workspace_id, 'promotion.campaign_message_dispatched',
    jsonb_build_object('campaign_id', c.id, 'message_id', m.id, 'sent_fixture', sent, 'suppressed', sup, 'unsubscribed', uns, 'transport', 'fixture'));
  return jsonb_build_object('ok', true, 'counts', jsonb_build_object('sent_fixture', sent, 'suppressed', sup, 'unsubscribed', uns, 'transport', 'fixture'));
end $$;

-- ═══ 8. UTM links and touches ═══
create or replace function public.campaign_link_create(p_campaign uuid, p_channel text, p_destination text, p_medium text default null, p_source text default 'galadock')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c public.promotion_campaigns; l public.campaign_links;
begin
  select * into c from public.promotion_campaigns where id = p_campaign;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.campaign_can(c.workspace_id, 'manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_destination is null or p_destination !~ '^/(events|organizers|venues|series|p)/[A-Za-z0-9\-_]{1,120}$' then raise exception 'invalid_destination' using errcode = '22023'; end if;
  insert into public.campaign_links(campaign_id, channel, code, destination, utm_source, utm_medium)
    values (c.id, p_channel, substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), p_destination, coalesce(nullif(p_source, ''), 'galadock'), coalesce(nullif(p_medium, ''), p_channel))
    returning * into l;
  return jsonb_build_object('ok', true, 'id', l.id, 'code', l.code, 'path', '/r/c/' || l.code,
    'destination', l.destination || '?utm_source=' || l.utm_source || '&utm_medium=' || l.utm_medium || '&utm_campaign=' || c.utm_campaign);
end $$;

-- Service-only (link route). Records a touch for active/paused campaigns; returns the internal destination only.
create or replace function public.record_campaign_touch(p_code text, p_visitor_hash text, p_user uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.campaign_links; c public.promotion_campaigns; dest text;
begin
  select * into l from public.campaign_links where code = p_code;
  if not found then return jsonb_build_object('ok', false, 'destination', '/'); end if;
  select * into c from public.promotion_campaigns where id = l.campaign_id;
  dest := l.destination || '?utm_source=' || l.utm_source || '&utm_medium=' || l.utm_medium || '&utm_campaign=' || c.utm_campaign;
  if c.status not in ('active','paused','scheduled') or length(coalesce(p_visitor_hash, '')) < 16 then return jsonb_build_object('ok', true, 'recorded', false, 'destination', dest); end if;
  if not public.hit_rate_limit('ctouch:' || p_visitor_hash, 60, 3600) then return jsonb_build_object('ok', true, 'recorded', false, 'destination', dest); end if;
  if not exists (select 1 from public.campaign_touches t where t.link_id = l.id and t.visitor_hash = p_visitor_hash and t.touched_at > now() - interval '30 minutes') then
    insert into public.campaign_touches(campaign_id, link_id, visitor_hash, user_id) values (c.id, l.id, p_visitor_hash, p_user);
    return jsonb_build_object('ok', true, 'recorded', true, 'destination', dest);
  end if;
  return jsonb_build_object('ok', true, 'recorded', false, 'destination', dest);
end $$;

-- ═══ 9. Attribution to ticket orders ═══
create or replace function public.trg_campaign_attribution() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t record; a record; ws uuid;
begin
  if new.status in ('paid','issued') and (tg_op = 'INSERT' or old.status not in ('paid','issued')) then
    if exists (select 1 from public.campaign_attributions where order_ref = new.order_ref) then return new; end if;
    -- 1) the order is already attributed to an ad boost that belongs to a campaign → that campaign's 'ads' channel
    select x.boost_id, b.campaign_id into a from public.ad_attributions x join public.promotion_boosts b on b.id = x.boost_id
     where x.order_ref = new.order_ref and x.status = 'attributed' and b.campaign_id is not null;
    if found then
      insert into public.campaign_attributions(order_ref, campaign_id, boost_id, channel, event_id, amount_minor)
        values (new.order_ref, a.campaign_id, a.boost_id, 'ads', new.event_id, round(coalesce(new.amount, 0) * 100)) on conflict (order_ref) do nothing;
      return new;
    end if;
    if new.buyer_id is null then return new; end if;
    select workspace_id into ws from public.events where id = new.event_id;
    -- 2) last campaign link touch by the buyer within 7 days, for a campaign on this event (or an organiser-wide campaign)
    select tc.id, tc.campaign_id, tc.link_id, l.channel into t
      from public.campaign_touches tc join public.campaign_links l on l.id = tc.link_id join public.promotion_campaigns c on c.id = tc.campaign_id
     where tc.user_id = new.buyer_id and tc.touched_at between now() - interval '7 days' and now()
       and (c.event_id = new.event_id or (c.event_id is null and c.workspace_id = ws))
     order by tc.touched_at desc limit 1;
    if found then
      insert into public.campaign_attributions(order_ref, campaign_id, link_id, channel, event_id, amount_minor)
        values (new.order_ref, t.campaign_id, t.link_id, t.channel, new.event_id, round(coalesce(new.amount, 0) * 100)) on conflict (order_ref) do nothing;
    end if;
  elsif tg_op = 'UPDATE' and (new.status = 'refunded' or new.refund_status = 'refunded') and not (old.status = 'refunded' or old.refund_status = 'refunded') then
    update public.campaign_attributions set status = 'reversed', reversed_at = now() where order_ref = new.order_ref and status = 'attributed';
  end if;
  return new;
exception when others then
  -- Attribution must never block a ticket order: record and continue.
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'promotion.attribution_failed', jsonb_build_object('order_ref', new.order_ref, 'error', left(sqlerrm, 200)));
  return new;
end $$;
drop trigger if exists gd_campaign_attribution on public.checkout_orders;
-- Name sorts after gd_ad_attribution, so the ad attribution of the same order is already visible.
create trigger gd_campaign_attribution after insert or update of status, refund_status on public.checkout_orders for each row execute function public.trg_campaign_attribution();

-- ═══ 10. Report (aggregates only) ═══
create or replace function public.campaign_report(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.promotion_campaigns; ads jsonb; mism jsonb; rec_orders bigint; rec_rev bigint; orders bigint; revenue bigint; touches bigint; visitors bigint;
begin
  select * into c from public.promotion_campaigns where id = p_campaign;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select auth.uid()) is not null and not public.campaign_can(c.workspace_id, 'read') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select count(*), count(distinct visitor_hash) into touches, visitors from public.campaign_touches where campaign_id = c.id;
  select count(*), coalesce(sum(amount_minor), 0) into orders, revenue from public.campaign_attributions where campaign_id = c.id and status = 'attributed';
  select coalesce(jsonb_agg(jsonb_build_object('order_ref', a.order_ref, 'issue',
           case when o.order_ref is null then 'order_missing' when o.status not in ('paid','issued') or o.refund_status = 'refunded' then 'order_not_paid' else 'amount_mismatch' end)), '[]')
    into mism from public.campaign_attributions a left join public.checkout_orders o on o.order_ref = a.order_ref
   where a.campaign_id = c.id and a.status = 'attributed' and (o.order_ref is null or o.status not in ('paid','issued') or o.refund_status = 'refunded' or round(o.amount * 100) <> a.amount_minor);
  select count(*), coalesce(sum(round(o.amount * 100)), 0) into rec_orders, rec_rev from public.campaign_attributions a join public.checkout_orders o on o.order_ref = a.order_ref
   where a.campaign_id = c.id and a.status = 'attributed' and o.status in ('paid','issued') and o.refund_status is distinct from 'refunded';
  select jsonb_build_object('boosts', count(*), 'paid_minor', coalesce(sum(amount_minor), 0), 'verified_impressions', coalesce(sum(delivered_impressions), 0),
    'verified_clicks', coalesce(sum(delivered_clicks), 0), 'conversions', coalesce(sum(conversions), 0), 'attributed_revenue_minor', coalesce(sum(attributed_revenue_minor), 0),
    'undelivered_credit_minor', coalesce(sum(undelivered_credit_minor), 0))
    into ads from public.promotion_boosts where campaign_id = c.id and status in ('scheduled','active','ended');
  return jsonb_build_object('campaign_id', c.id, 'name', c.name, 'status', c.status, 'goal', c.goal, 'goal_target', c.goal_target,
    'budget_minor', c.budget_minor, 'currency', c.currency,
    'spend_minor', coalesce((ads->>'paid_minor')::bigint, 0) - coalesce((ads->>'undelivered_credit_minor')::bigint, 0)
                   + coalesce((select sum(spent_minor) from public.campaign_channels where campaign_id = c.id and channel <> 'ads'), 0),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('channel', x.channel, 'budget_minor', x.budget_minor, 'status', x.status,
        'touches', (select count(*) from public.campaign_touches t join public.campaign_links l on l.id = t.link_id where l.campaign_id = c.id and l.channel = x.channel),
        'orders', (select count(*) from public.campaign_attributions a where a.campaign_id = c.id and a.channel = x.channel and a.status = 'attributed'),
        'revenue_minor', (select coalesce(sum(amount_minor), 0) from public.campaign_attributions a where a.campaign_id = c.id and a.channel = x.channel and a.status = 'attributed'))
        order by x.channel) from public.campaign_channels x where x.campaign_id = c.id), '[]'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'channel', m.channel, 'status', m.status, 'sent_at', m.sent_at, 'counts', m.audience_counts) order by m.created_at)
        from public.campaign_messages m where m.campaign_id = c.id), '[]'),
    'touches', touches, 'unique_visitors', visitors, 'orders', orders, 'attributed_revenue_minor', revenue,
    'conversion_rate', case when visitors > 0 then round(orders::numeric / visitors, 4) end,
    'goal_progress', case c.goal when 'ticket_sales' then orders when 'followers' then public.follow_count('organizer', c.workspace_id::text) else null end,
    'ads', ads,
    'reconciled', jsonb_build_object('orders', rec_orders, 'revenue_minor', rec_rev, 'matches', rec_orders = orders and rec_rev = revenue and jsonb_array_length(mism) = 0, 'mismatches', mism),
    'privacy', 'Aggregates only: no emails, user ids or visitor identifiers are returned.',
    'provenance', jsonb_build_object('attribution', 'Last campaign link touch by the signed-in buyer within 7 days before a paid ticket order (ticket face value); orders already credited to a campaign ad boost count under ads; reversed on refund.',
      'deliveries', 'Fixture transport only — messages are recorded, not sent.'));
end $$;

-- ═══ 11. Organiser promotion calendar ═══
create or replace function public.promotion_calendar(p_workspace uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare items jsonb; conflicts jsonb;
begin
  if not public.campaign_can(p_workspace, 'read') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'invalid_range' using errcode = '22023'; end if;
  with x as (
    select 'event' kind, e.id::text id, e.name title, e.starts_at s, coalesce(e.ends_at, e.starts_at + interval '3 hours') f,
           case when e.status in ('published','on_sale','live','completed') then 'confirmed' else 'tentative' end certainty
      from public.events e where e.workspace_id = p_workspace and e.starts_at < p_to and coalesce(e.ends_at, e.starts_at) >= p_from and e.status not in ('cancelled','archived')
    union all
    select 'campaign', c.id::text, c.name, c.starts_at, c.ends_at, case when c.status in ('active','completed') then 'confirmed' else 'tentative' end
      from public.promotion_campaigns c where c.workspace_id = p_workspace and c.starts_at < p_to and c.ends_at >= p_from and c.status <> 'cancelled'
    union all
    select 'send', m.id::text, coalesce(m.subject, m.channel), coalesce(m.sent_at, m.scheduled_at), coalesce(m.sent_at, m.scheduled_at), case when m.status = 'sent' then 'confirmed' else 'tentative' end
      from public.campaign_messages m join public.promotion_campaigns c on c.id = m.campaign_id
     where c.workspace_id = p_workspace and m.status in ('scheduled','sent') and coalesce(m.sent_at, m.scheduled_at) between p_from and p_to
    union all
    select 'boost', b.id::text, b.placement, b.starts_at, b.ends_at, case when b.status in ('active','ended') then 'confirmed' else 'tentative' end
      from public.promotion_boosts b where b.workspace_id = p_workspace and b.starts_at < p_to and b.ends_at >= p_from and b.status not in ('cancelled','refunded')
    union all
    select 'blackout', k.id::text, k.reason, k.starts_at, k.ends_at, 'blackout' from public.promotion_blackouts k where k.workspace_id = p_workspace and k.starts_at < p_to and k.ends_at >= p_from)
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'title', title, 'starts_at', s, 'ends_at', f, 'certainty', certainty) order by s), '[]') into items from x;
  select coalesce(jsonb_agg(z), '[]') into conflicts from (
    select jsonb_build_object('type', 'send_in_blackout', 'message_id', m.id, 'blackout_id', k.id) z
      from public.campaign_messages m join public.promotion_campaigns c on c.id = m.campaign_id
      join public.promotion_blackouts k on k.workspace_id = c.workspace_id and m.scheduled_at >= k.starts_at and m.scheduled_at < k.ends_at and (k.channel is null or k.channel = m.channel)
     where c.workspace_id = p_workspace and m.status = 'scheduled' and m.scheduled_at between p_from and p_to
    union all
    select jsonb_build_object('type', 'boost_after_event', 'boost_id', b.id, 'event_id', e.id)
      from public.promotion_boosts b join public.events e on e.id = b.event_id
     where b.workspace_id = p_workspace and b.status in ('pending_payment','scheduled','active') and b.ends_at > coalesce(e.ends_at, e.starts_at) and b.starts_at < p_to
    union all
    select jsonb_build_object('type', 'campaign_after_event', 'campaign_id', c.id, 'event_id', e.id)
      from public.promotion_campaigns c join public.events e on e.id = c.event_id
     where c.workspace_id = p_workspace and c.status in ('draft','scheduled','active','paused') and c.starts_at > coalesce(e.ends_at, e.starts_at)) q;
  return jsonb_build_object('from', p_from, 'to', p_to, 'items', items, 'conflicts', conflicts);
end $$;

create or replace function public.save_promotion_blackout(p_workspace uuid, p_starts timestamptz, p_ends timestamptz, p_reason text, p_channel text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.campaign_can(p_workspace, 'manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.promotion_blackouts(workspace_id, starts_at, ends_at, channel, reason, created_by) values (p_workspace, p_starts, p_ends, p_channel, coalesce(p_reason, ''), (select auth.uid())) returning id into v;
  return v;
end $$;

-- ═══ 12. Scheduler ═══
create or replace function public.campaign_tick() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare c record; m record; started int := 0; finished int := 0; dispatched int := 0;
begin
  for c in select id from public.promotion_campaigns where status = 'scheduled' and starts_at <= now() loop
    if (public.campaign_transition(c.id, 'active', 'scheduled', 'start_date_reached')->>'ok')::boolean then started := started + 1; end if;
  end loop;
  for c in select id, status from public.promotion_campaigns where status in ('active','paused') and ends_at <= now() loop
    perform public.campaign_transition(c.id, 'completed', c.status, 'end_date_reached'); finished := finished + 1;
  end loop;
  for m in select x.id from public.campaign_messages x join public.promotion_campaigns p on p.id = x.campaign_id where x.status = 'scheduled' and x.scheduled_at <= now() and p.status = 'active' limit 100 loop
    perform public.campaign_dispatch_message(m.id); dispatched := dispatched + 1;
  end loop;
  return jsonb_build_object('started', started, 'completed', finished, 'dispatched', dispatched);
end $$;
create or replace function public.job_promotion_campaign_tick(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin return public.campaign_tick(); end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('promotion.campaign_tick', 'db', 'public.job_promotion_campaign_tick', 3, 'Q23: every 5 min; start/complete campaigns by date, dispatch due messages (fixture transport)')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('promotion-campaign-tick', '*/5 * * * *', $c$select public.campaign_tick()$c$);
  end if;
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('promotion_campaign.state_changed', 1, 'promotion_campaign', 'A promotion campaign moved through its lifecycle (payload: id, from, to, reason).', null),
  ('promotion.campaign_created', 1, 'promotion_campaign', 'A promotion campaign was created (payload: campaign_id, event_id, goal).', null),
  ('promotion.campaign_updated', 1, 'promotion_campaign', 'A campaign setup step was saved (payload: campaign_id, step, version).', null),
  ('promotion.campaign_transitioned', 1, 'promotion_campaign', 'A campaign changed status via the command (payload: campaign_id, from, to).', null),
  ('promotion.campaign_message_saved', 1, 'campaign_message', 'A campaign message was saved or scheduled.', null),
  ('promotion.campaign_message_dispatched', 1, 'campaign_message', 'A campaign message was dispatched through the fixture transport (counts only).', null),
  ('promotion.consent_recorded', 1, 'audience_consent', 'Marketing consent to an organiser was recorded (no address in payload).', null),
  ('promotion.unsubscribed', 1, 'audience_consent', 'A recipient unsubscribed from an organiser''s marketing.', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

-- ═══ Grants ═══
revoke all on function public.campaign_can(uuid, text), public.campaign_blockers(uuid), public.audience_consent_record(uuid, text, text, text, uuid, text, text, text),
  public.audience_unsubscribe(text), public.campaign_dispatch_message(uuid), public.record_campaign_touch(text, text, uuid), public.trg_campaign_attribution(),
  public.campaign_tick(), public.job_promotion_campaign_tick(public.job_queue) from public, anon, authenticated;
grant execute on function public.campaign_can(uuid, text), public.campaign_blockers(uuid), public.audience_consent_record(uuid, text, text, text, uuid, text, text, text),
  public.audience_unsubscribe(text), public.campaign_dispatch_message(uuid), public.record_campaign_touch(text, text, uuid), public.campaign_tick(),
  public.job_promotion_campaign_tick(public.job_queue) to service_role;
-- campaign_can is also needed by RLS policies evaluated as authenticated:
grant execute on function public.campaign_can(uuid, text) to authenticated;
revoke all on function public.save_campaign_setup(uuid, uuid, integer, jsonb, integer, text), public.campaign_transition(uuid, text, text, text),
  public.audience_consent_summary(uuid), public.campaign_message_save(uuid, uuid, text, text, text, timestamptz, integer), public.campaign_link_create(uuid, text, text, text, text),
  public.campaign_report(uuid), public.promotion_calendar(uuid, timestamptz, timestamptz), public.save_promotion_blackout(uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.save_campaign_setup(uuid, uuid, integer, jsonb, integer, text), public.campaign_transition(uuid, text, text, text),
  public.audience_consent_summary(uuid), public.campaign_message_save(uuid, uuid, text, text, text, timestamptz, integer), public.campaign_link_create(uuid, text, text, text, text),
  public.campaign_report(uuid), public.promotion_calendar(uuid, timestamptz, timestamptz), public.save_promotion_blackout(uuid, timestamptz, timestamptz, text, text) to authenticated, service_role;
