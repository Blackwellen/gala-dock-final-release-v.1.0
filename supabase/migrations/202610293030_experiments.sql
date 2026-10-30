-- Q36 (lane C): experimentation and experiment safety (domains 229–230), on top of the Q01 feature-flag registry
-- (platform_settings 'flags' + feature_enabled(), which already gives versioned flags, targeting, deterministic rollout and
-- emergency_off). This adds: experiments with versioned definitions, variants, deterministic sticky assignment (HMAC buckets),
-- holdouts (per experiment and per layer), mutual-exclusion layers (cross-experiment conflicts), exposure logging (once per unit),
-- guardrail metrics from Q35 with automatic stop, a global kill switch, privacy opt-out, and approval for pricing / legal-text tests.
-- Invariant: experiment configuration can never carry money, inventory, safety, verification or legal values (key denylist,
-- enforced on every write); payment, ticket and safety code paths never read experiment config.
-- Additive and idempotent.

-- ── 0. Consent purposes ─────────────────────────────────────────────────────────────────────────────────────────────
-- Adds the 'experiments' purpose (opt-out of experiments). Superset of the previous list: every existing row stays valid.
alter table public.consent_records drop constraint if exists consent_records_purpose_check;
alter table public.consent_records add constraint consent_records_purpose_check check (purpose = any (array['marketing_email', 'cookies_analytics',
  'cookies_marketing', 'recording', 'partner_sharing', 'terms', 'privacy_notice', 'experiments']));
-- Q35 follow-up: analytics consent uses the existing 'cookies_analytics' purpose (the user's "analytics" choice); 202610293029
-- referenced a 'product_analytics' purpose the consent table never allowed, so consented stable ids could not be recorded.
create or replace function public.analytics_consent_for(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when c.granted then 'granted' else 'denied' end from public.consent_records c
    where c.user_id = p_user and c.purpose = 'cookies_analytics' order by c.created_at desc, c.id desc limit 1), 'unknown');
$$;
create or replace function public.analytics_capture_server(p_event text, p_user uuid, p_workspace uuid, p_props jsonb default '{}') returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.analytics_event_definitions; consented boolean;
begin
  select * into d from public.analytics_event_definitions where event_name = p_event and active and source = 'server';
  if not found then return false; end if;
  consented := p_user is not null and coalesce((select c.granted from public.consent_records c where c.user_id = p_user and c.purpose = 'cookies_analytics'
    order by c.created_at desc, c.id desc limit 1), false);
  insert into public.analytics_events(event_name, occurred_at, subject_id, subject_kind, workspace_id, props, consent, is_demo)
  values (p_event, now(), public.analytics_pseudonym(case when consented then 'user:' || p_user::text
      else 'server-daily:' || current_date::text || ':' || coalesce(p_user::text, gen_random_uuid()::text) end),
    case when consented then 'user' else 'visitor_daily' end, p_workspace,
    public.analytics_clean_props(p_props, d.allowed_props), case when consented then 'granted' else 'unknown' end,
    public.analytics_user_is_demo(p_user) or public.analytics_workspace_is_demo(p_workspace));
  return true;
end $$;

-- ── 1. Tables ────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  name text not null check (length(name) between 3 and 120),
  hypothesis text not null default '',
  kind text not null check (kind in ('feature', 'ranking', 'checkout', 'promotion', 'onboarding', 'pricing')),
  surface text not null default '' check (length(surface) <= 64),
  unit text not null default 'user' check (unit in ('user', 'workspace')),
  layer text not null default 'default' check (layer ~ '^[a-z][a-z0-9_-]{1,40}$'),
  flag_key text check (flag_key is null or flag_key ~ '^[a-z0-9_.-]{2,64}$'),
  traffic_pct numeric(5,2) not null default 100 check (traffic_pct between 0 and 100),
  holdout_pct numeric(5,2) not null default 0 check (holdout_pct between 0 and 50),
  targeting jsonb not null default '{}' check (jsonb_typeof(targeting) = 'object'),
  primary_metric jsonb not null default '{}' check (jsonb_typeof(primary_metric) = 'object'),
  guardrails jsonb not null default '[]' check (jsonb_typeof(guardrails) = 'array'),
  touches_pricing boolean not null default false,
  touches_legal boolean not null default false,
  salt text not null default encode(extensions.gen_random_bytes(8), 'hex'),
  version integer not null default 1,
  status text not null default 'draft',
  approved_by uuid, approved_at timestamptz, approval_reason text,
  started_at timestamptz, ends_at timestamptz, stopped_at timestamptz, stop_reason text,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (kind <> 'pricing' or touches_pricing)
);
create index if not exists experiments_status_idx on public.experiments(status, layer);

create table if not exists public.experiment_variants (
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_-]{0,31}$'),
  is_control boolean not null default false,
  weight integer not null check (weight between 0 and 10000),
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  primary key (experiment_id, key)
);

-- Immutable definition versions (what each version ran with), for analysis and audit.
create table if not exists public.experiment_versions (
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  version integer not null,
  definition jsonb not null,
  created_by uuid, created_at timestamptz not null default now(),
  primary key (experiment_id, version)
);

create table if not exists public.experiment_assignments (
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  unit_id text not null,                 -- 'u:' || HMAC(user) or 'w:' || workspace id; never a raw user id
  variant_key text not null,
  in_holdout boolean not null default false,
  experiment_version integer not null,
  bucket integer not null check (bucket between 0 and 9999),
  assigned_at timestamptz not null default now(),
  primary key (experiment_id, unit_id)
);
create index if not exists experiment_assignments_unit on public.experiment_assignments(unit_id);

create table if not exists public.experiment_exposures (
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  unit_id text not null,
  variant_key text not null,
  surface text not null default '',
  first_exposed_at timestamptz not null default now(),
  last_exposed_at timestamptz not null default now(),
  exposures integer not null default 1,
  primary key (experiment_id, unit_id)
);

create table if not exists public.experiment_holdouts (
  id uuid primary key default gen_random_uuid(),
  layer text not null check (layer ~ '^[a-z][a-z0-9_-]{1,40}$'),
  pct numeric(5,2) not null check (pct > 0 and pct <= 20),
  salt text not null default encode(extensions.gen_random_bytes(8), 'hex'),
  starts_at timestamptz not null default now(), ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  reason text not null, created_by uuid, created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.experiment_guardrail_checks (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  checked_at timestamptz not null default now(),
  results jsonb not null, breached boolean not null default false
);
create index if not exists experiment_guardrail_checks_exp on public.experiment_guardrail_checks(experiment_id, checked_at desc);

do $$ declare t text; begin
  foreach t in array array['experiments', 'experiment_variants', 'experiment_versions', 'experiment_assignments', 'experiment_exposures', 'experiment_holdouts', 'experiment_guardrail_checks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', t);
  end loop;
end $$;
-- Product/admin only (settings permission). Assignments/exposures are pseudonymous and service-only.
drop policy if exists experiments_admin_read on public.experiments;
create policy experiments_admin_read on public.experiments for select to authenticated using (public.has_admin_permission('settings'));
drop policy if exists experiment_variants_admin_read on public.experiment_variants;
create policy experiment_variants_admin_read on public.experiment_variants for select to authenticated using (public.has_admin_permission('settings'));
drop policy if exists experiment_versions_admin_read on public.experiment_versions;
create policy experiment_versions_admin_read on public.experiment_versions for select to authenticated using (public.has_admin_permission('settings'));
drop policy if exists experiment_holdouts_admin_read on public.experiment_holdouts;
create policy experiment_holdouts_admin_read on public.experiment_holdouts for select to authenticated using (public.has_admin_permission('settings'));
drop policy if exists experiment_guardrail_checks_admin_read on public.experiment_guardrail_checks;
create policy experiment_guardrail_checks_admin_read on public.experiment_guardrail_checks for select to authenticated using (public.has_admin_permission('settings'));
revoke all on table public.experiment_assignments, public.experiment_exposures from authenticated;

-- Lifecycle machine (mirrors src/lib/domain/state-machines.ts `experiment`; the state seed regenerates the same rows).
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
values ('experiment', 'experiments', 'status', 'enforce', array['draft'], array['stopped', 'completed', 'archived'])
on conflict (machine) do nothing;
insert into public.state_transitions(machine, from_state, to_state) values
  ('experiment', 'draft', 'pending_approval'), ('experiment', 'draft', 'running'), ('experiment', 'draft', 'archived'),
  ('experiment', 'pending_approval', 'approved'), ('experiment', 'pending_approval', 'draft'), ('experiment', 'pending_approval', 'archived'),
  ('experiment', 'approved', 'running'), ('experiment', 'approved', 'draft'), ('experiment', 'approved', 'archived'),
  ('experiment', 'running', 'paused'), ('experiment', 'running', 'stopped'), ('experiment', 'running', 'completed'),
  ('experiment', 'paused', 'running'), ('experiment', 'paused', 'stopped'), ('experiment', 'paused', 'completed')
on conflict do nothing;
drop trigger if exists experiments_state_guard on public.experiments;
create trigger experiments_state_guard before insert or update of status on public.experiments for each row execute function public.enforce_state_transition('experiment', 'status');

-- ── 2. Safety: configuration denylist and invariants ────────────────────────────────────────────────────────────────
-- Keys allowed per kind. Anything matching the protected pattern is refused for every kind (prices, fees, amounts, inventory,
-- capacity, refunds, payouts, tax, currency, verification, safety, age, legal/terms/consent text).
create or replace function public.experiment_config_violations(p_kind text, p_config jsonb, p_pricing_approved boolean default false) returns text[]
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; bad text[] := '{}'; allowed text[];
begin
  allowed := case p_kind
    when 'ranking' then array['ranking_model', 'ranking_model_version', 'layout', 'copy_key', 'badge_style']
    when 'checkout' then array['layout', 'copy_key', 'cta_key', 'step_order', 'summary_position']
    when 'promotion' then array['placement_layout', 'creative_variant', 'copy_key']
    when 'onboarding' then array['step_order', 'copy_key', 'layout', 'skip_optional']
    when 'pricing' then array['price_book_ref', 'layout', 'copy_key']
    else null end;   -- feature: any non-protected key
  if p_config is null or jsonb_typeof(p_config) <> 'object' then return array['config_not_object']; end if;
  for k, v in select * from jsonb_each(p_config) loop
    if k ~* '(price|fee|amount|cost|commission|vat|tax|refund|payout|capacity|quantity|inventory|stock|limit|currency|discount|charge|terms|legal|policy|consent|privacy|verification|verified|safety|age|waiver|threshold|insurance|licen[cs]e)'
       and not (k = 'price_book_ref' and p_kind = 'pricing' and p_pricing_approved) then
      bad := bad || k;
    elsif allowed is not null and not (k = any(allowed)) then
      bad := bad || k;
    elsif jsonb_typeof(v) = 'object' then
      bad := bad || (select coalesce(array_agg(k || '.' || x), '{}') from unnest(public.experiment_config_violations('feature', v, false)) x);
    end if;
  end loop;
  return bad;
end $$;

create or replace function public.experiments_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'experiments' then
    -- Legal-text surfaces always count as touching legal text.
    if new.surface ~* '(legal|terms|privacy|cookie|policy|consent)' then new.touches_legal := true; end if;
    if new.kind = 'pricing' then new.touches_pricing := true; end if;
    -- Running/approved definitions are frozen: edits must go back to draft (new version) first.
    if tg_op = 'UPDATE' and old.status in ('running', 'paused', 'approved', 'pending_approval') and new.status = old.status
       and (new.kind, new.unit, new.layer, new.traffic_pct, new.holdout_pct, new.targeting, new.guardrails, new.primary_metric, new.salt, new.surface)
           is distinct from (old.kind, old.unit, old.layer, old.traffic_pct, old.holdout_pct, old.targeting, old.guardrails, old.primary_metric, old.salt, old.surface) then
      raise exception 'experiment_frozen' using errcode = '55000', hint = 'Move the experiment back to draft to change its definition.';
    end if;
    new.updated_at := now();
    return new;
  end if;
  -- experiment_variants
  declare e public.experiments;
  begin
    select * into e from public.experiments where id = coalesce(new.experiment_id, old.experiment_id);
    if e.status not in ('draft') and tg_op <> 'DELETE' then
      raise exception 'experiment_frozen' using errcode = '55000';
    end if;
    -- Drafts of pricing tests may reference price-book rows (price_book_ref = 'kind:plan:interval'); they cannot START until approved.
    if tg_op <> 'DELETE' and cardinality(public.experiment_config_violations(e.kind, new.config, e.kind = 'pricing')) > 0 then
      raise exception 'experiment_config_protected: %', array_to_string(public.experiment_config_violations(e.kind, new.config, e.kind = 'pricing'), ',') using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' and new.config ? 'price_book_ref' and not exists (select 1 from public.plan_prices pp
        where pp.active and pp.kind || ':' || pp.plan || ':' || pp.billing_interval = new.config ->> 'price_book_ref') then
      raise exception 'unknown_price_book_ref' using errcode = '22023', hint = 'Pricing tests may only choose between existing, active price-book rows.';
    end if;
    return coalesce(new, old);
  end;
end $$;
drop trigger if exists experiments_guard on public.experiments;
create trigger experiments_guard before insert or update on public.experiments for each row execute function public.experiments_guard();
drop trigger if exists experiment_variants_guard on public.experiment_variants;
create trigger experiment_variants_guard before insert or update or delete on public.experiment_variants for each row execute function public.experiments_guard();

create or replace function public.experiment_versions_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'experiment_versions_are_immutable' using errcode = '42501';
end $$;
drop trigger if exists experiment_versions_immutable on public.experiment_versions;
create trigger experiment_versions_immutable before update on public.experiment_versions for each row execute function public.experiment_versions_immutable();

-- ── 3. Deterministic assignment ──────────────────────────────────────────────────────────────────────────────────────
-- Bucket 0..9999 from HMAC(salt:unit). Same inputs → same bucket on every server and in tests; assignments are also persisted
-- (sticky) so a later weight change does not move existing units.
create or replace function public.experiment_bucket(p_salt text, p_unit text) returns integer
language sql stable security definer set search_path = '' as $$
  select (('x' || substr(public.analytics_pseudonym('exp:' || p_salt || ':' || p_unit), 1, 8))::bit(32)::bigint % 10000)::int;
$$;

create or replace function public.experiments_killed() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value -> 'experiments' ->> 'emergency_off')::boolean from public.platform_settings
    where section = 'flags' and status = 'published' order by version desc limit 1), false);
$$;

create or replace function public.experiment_unit(p_unit_kind text, p_user uuid, p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case p_unit_kind when 'user' then case when p_user is null then null else 'u:' || public.analytics_pseudonym('user:' || p_user::text) end
                          when 'workspace' then case when p_workspace is null then null else 'w:' || p_workspace::text end end;
$$;

-- Server-side assignment (service role). Returns {experiment, variant, config, in_experiment, reason}. Control (with the control
-- variant's config) whenever: killed, not running, opted out, not targeted, outside traffic, in a holdout, or a layer conflict.
create or replace function public.experiment_assign(p_key text, p_user uuid, p_workspace uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.experiments; v_unit text; b int; ctrl public.experiment_variants; v public.experiment_variants; a public.experiment_assignments;
  w public.workspaces; acc int := 0; tot int; reason text; h public.experiment_holdouts;
begin
  select * into e from public.experiments where key = p_key;
  if not found then return jsonb_build_object('experiment', p_key, 'variant', null, 'in_experiment', false, 'reason', 'unknown'); end if;
  select * into ctrl from public.experiment_variants where experiment_id = e.id and is_control order by key limit 1;
  v_unit := public.experiment_unit(e.unit, p_user, p_workspace);
  reason := case
    when public.experiments_killed() then 'killed'
    when e.status <> 'running' then 'not_running'
    when e.ends_at is not null and e.ends_at < now() then 'ended'
    when v_unit is null then 'no_unit'
    when p_user is not null and coalesce((select not c.granted from public.consent_records c where c.user_id = p_user and c.purpose = 'experiments'
      order by c.created_at desc, c.id desc limit 1), false) then 'opted_out'
    else null end;
  if reason is null and e.flag_key is not null then
    -- Linked flag must be on for the v_unit's workspace (flag targeting/rollout first, then the experiment).
    if not public.feature_enabled(e.flag_key, p_workspace) then reason := 'flag_off'; end if;
  end if;
  if reason is null and (jsonb_typeof(e.targeting -> 'plans') = 'array' or jsonb_typeof(e.targeting -> 'kinds') = 'array') then
    select * into w from public.workspaces where id = p_workspace;
    if jsonb_typeof(e.targeting -> 'plans') = 'array' and (w.id is null or not (e.targeting -> 'plans') ? coalesce(w.plan, 'starter')) then reason := coalesce(reason, 'not_targeted'); end if;
    if jsonb_typeof(e.targeting -> 'kinds') = 'array' and (w.id is null or not (e.targeting -> 'kinds') ? w.kind) then reason := coalesce(reason, 'not_targeted'); end if;
  end if;
  -- Demo/test identities and workspaces are excluded by default (Q35/card 282: demo data never reaches real analysis).
  if reason is null and coalesce((e.targeting ->> 'exclude_demo')::boolean, true)
     and ((p_user is not null and public.analytics_user_is_demo(p_user)) or public.analytics_workspace_is_demo(p_workspace)) then reason := 'demo_excluded'; end if;
  if reason is not null then
    return jsonb_build_object('experiment', e.key, 'variant', ctrl.key, 'config', coalesce(ctrl.config, '{}'), 'in_experiment', false, 'reason', reason);
  end if;

  select * into a from public.experiment_assignments where experiment_id = e.id and unit_id = v_unit;
  if found then
    select * into v from public.experiment_variants where experiment_id = e.id and key = a.variant_key;
    return jsonb_build_object('experiment', e.key, 'variant', a.variant_key, 'config', coalesce(v.config, '{}'), 'in_experiment', not a.in_holdout,
      'reason', case when a.in_holdout then 'holdout' else 'assigned' end, 'sticky', true);
  end if;

  -- Layer holdout (reserved share of units kept out of every experiment in the layer while active).
  for h in select * from public.experiment_holdouts where layer = e.layer and status = 'active' and now() between starts_at and ends_at loop
    if public.experiment_bucket(h.salt, v_unit) < h.pct * 100 then reason := 'layer_holdout'; end if;
  end loop;
  -- Cross-experiment conflict: one active (non-holdout) assignment per layer per v_unit.
  if reason is null and exists (select 1 from public.experiment_assignments x join public.experiments o on o.id = x.experiment_id
      where x.unit_id = v_unit and o.layer = e.layer and o.id <> e.id and o.status in ('running', 'paused') and not x.in_holdout) then reason := 'layer_conflict'; end if;
  b := public.experiment_bucket(e.salt, v_unit);
  if reason is null and b >= e.traffic_pct * 100 then reason := 'outside_traffic'; end if;
  if reason is not null then
    return jsonb_build_object('experiment', e.key, 'variant', ctrl.key, 'config', coalesce(ctrl.config, '{}'), 'in_experiment', false, 'reason', reason);
  end if;

  -- Experiment holdout: the lowest holdout_pct of the traffic bucket range gets control and is recorded as holdout.
  if b < e.holdout_pct * 100 then
    insert into public.experiment_assignments(experiment_id, unit_id, variant_key, in_holdout, experiment_version, bucket)
      values (e.id, v_unit, ctrl.key, true, e.version, b) on conflict do nothing;
    return jsonb_build_object('experiment', e.key, 'variant', ctrl.key, 'config', coalesce(ctrl.config, '{}'), 'in_experiment', false, 'reason', 'holdout');
  end if;
  -- Variant by weight over an independent bucket (so traffic and variant splits are uncorrelated).
  b := public.experiment_bucket(e.salt || ':variant', v_unit);
  select sum(weight) into tot from public.experiment_variants where experiment_id = e.id;
  for v in select * from public.experiment_variants where experiment_id = e.id order by is_control desc, key loop
    acc := acc + v.weight;
    exit when b * tot < acc * 10000;
  end loop;
  insert into public.experiment_assignments(experiment_id, unit_id, variant_key, in_holdout, experiment_version, bucket)
    values (e.id, v_unit, v.key, false, e.version, b) on conflict (experiment_id, unit_id) do nothing;
  select * into a from public.experiment_assignments where experiment_id = e.id and unit_id = v_unit;   -- concurrent first assignment: first writer wins
  select * into v from public.experiment_variants where experiment_id = e.id and key = a.variant_key;
  return jsonb_build_object('experiment', e.key, 'variant', a.variant_key, 'config', coalesce(v.config, '{}'), 'in_experiment', not a.in_holdout, 'reason', 'assigned');
end $$;

-- Exposure: logged only for assigned units (incl. holdout, which is the comparison group); first exposure kept, count incremented.
create or replace function public.experiment_expose(p_key text, p_user uuid, p_workspace uuid, p_surface text default '') returns boolean
language plpgsql security definer set search_path = '' as $$
declare e public.experiments; v_unit text; a public.experiment_assignments;
begin
  select * into e from public.experiments where key = p_key and status = 'running';
  if not found or public.experiments_killed() then return false; end if;
  v_unit := public.experiment_unit(e.unit, p_user, p_workspace);
  select * into a from public.experiment_assignments where experiment_id = e.id and unit_id = v_unit;
  if not found then return false; end if;
  insert into public.experiment_exposures(experiment_id, unit_id, variant_key, surface)
    values (e.id, v_unit, case when a.in_holdout then 'holdout' else a.variant_key end, left(coalesce(p_surface, ''), 64))
  on conflict (experiment_id, unit_id) do update set last_exposed_at = now(), exposures = public.experiment_exposures.exposures + 1;
  return true;
end $$;

-- ── 4. Evaluation and guardrails (metrics from Q35) ──────────────────────────────────────────────────────────────────
-- Guardrail spec: {"metric": "<metric_definitions key>", "direction": "max"|"min", "threshold": n, "min_units": n}  (workspace unit)
--             or  {"event_rate": "<analytics event>", "direction": ..., "threshold": n, "min_units": n}             (user unit: share of
--                  exposed units with that event after first exposure, via the shared pseudonym)
create or replace function public.experiment_evaluate_internal(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.experiments; g jsonb; v record; out jsonb := '[]'; val numeric; n int; breached boolean := false; res jsonb; per jsonb;
  from_d date; to_d date := (now() at time zone 'Europe/London')::date;
begin
  select * into e from public.experiments where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  from_d := coalesce((e.started_at at time zone 'Europe/London')::date, to_d);
  for g in select * from jsonb_array_elements(e.guardrails || case when e.primary_metric <> '{}' then jsonb_build_array(e.primary_metric || '{"primary": true}') else '[]' end) loop
    per := '{}';
    for v in select x.variant_key, count(*) units from public.experiment_exposures x where x.experiment_id = e.id group by x.variant_key loop
      if g ? 'event_rate' then
        select count(distinct x.unit_id) filter (where exists (select 1 from public.analytics_events a where a.subject_id = substr(x.unit_id, 3)
            and a.event_name = g ->> 'event_rate' and a.occurred_at >= x.first_exposed_at))::numeric / nullif(count(*), 0)
          into val from public.experiment_exposures x where x.experiment_id = e.id and x.variant_key = v.variant_key and x.unit_id like 'u:%';
      elsif g ? 'metric' then
        -- Mean of the metric across the variant's exposed workspaces over the experiment window.
        select avg((public.analytics_eval(g ->> 'metric', from_d, to_d, substr(x.unit_id, 3)::uuid, true) ->> 'value')::numeric)
          into val from public.experiment_exposures x where x.experiment_id = e.id and x.variant_key = v.variant_key and x.unit_id like 'w:%';
      end if;
      per := per || jsonb_build_object(v.variant_key, jsonb_build_object('units', v.units, 'value', round(val, 6),
        'breach', not coalesce((g ->> 'primary')::boolean, false) and v.units >= coalesce((g ->> 'min_units')::int, 50) and val is not null
          and ((g ->> 'direction') = 'max' and val > (g ->> 'threshold')::numeric or (g ->> 'direction') = 'min' and val < (g ->> 'threshold')::numeric)));
      if (per -> v.variant_key ->> 'breach')::boolean and v.variant_key not in ('holdout') and not exists (
          select 1 from public.experiment_variants c where c.experiment_id = e.id and c.key = v.variant_key and c.is_control) then breached := true; end if;
    end loop;
    out := out || jsonb_build_array(jsonb_build_object('guardrail', g, 'variants', per));
  end loop;
  select count(*) into n from public.experiment_exposures where experiment_id = e.id;
  return jsonb_build_object('experiment_id', e.id, 'key', e.key, 'status', e.status, 'version', e.version, 'exposed_units', n,
    'assignments', (select coalesce(jsonb_object_agg(k, c), '{}') from (select case when in_holdout then 'holdout' else variant_key end k, count(*) c
        from public.experiment_assignments where experiment_id = e.id group by 1) s),
    'metrics', out, 'breached', breached);
end $$;

create or replace function public.experiment_evaluate(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('settings') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return public.experiment_evaluate_internal(p_id);
end $$;

-- Guardrail sweep (job): records each check; a breach stops the experiment (everyone gets control) and is audited.
create or replace function public.experiment_guardrail_sweep() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.experiments; r jsonb; stopped int := 0; checked int := 0;
begin
  for e in select * from public.experiments where status = 'running' and guardrails <> '[]' loop
    r := public.experiment_evaluate_internal(e.id);
    insert into public.experiment_guardrail_checks(experiment_id, results, breached) values (e.id, r, (r ->> 'breached')::boolean);
    checked := checked + 1;
    if (r ->> 'breached')::boolean then
      perform public.transition_state('experiment', e.id, 'stopped', 'running', null, 'system', 'guardrail breach');
      update public.experiments set stopped_at = now(), stop_reason = 'guardrail_breach' where id = e.id;
      insert into public.audit_events(actor_type, event, metadata) values ('system', 'experiment.guardrail_breached', jsonb_build_object('experiment_id', e.id, 'key', e.key, 'results', r -> 'metrics'));
      perform public.emit_domain_event('experiment.guardrail_breached', null, jsonb_build_object('experiment_id', e.id, 'key', e.key), null, 'system', 'experiment', e.id::text, null, null);
      stopped := stopped + 1;
    end if;
  end loop;
  -- Ended experiments complete; ended holdouts close.
  for e in select * from public.experiments where status in ('running', 'paused') and ends_at is not null and ends_at < now() loop
    perform public.transition_state('experiment', e.id, 'completed', e.status, null, 'system', 'end date reached');
  end loop;
  update public.experiment_holdouts set status = 'ended' where status = 'active' and ends_at < now();
  return jsonb_build_object('checked', checked, 'stopped', stopped);
end $$;
create or replace function public.job_experiment_guardrails(p_job public.job_queue) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public.experiment_guardrail_sweep();
end $$;

-- ── 5. Admin commands (settings permission + MFA + reason; audited) ──────────────────────────────────────────────────
create or replace function public.admin_experiment_save(p_def jsonb, p_variants jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.experiments; id_ uuid; v jsonb; ctrl int; tot int;
begin
  perform public.admin_require('settings', p_reason);
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) < 2 or jsonb_array_length(p_variants) > 8 then raise exception 'invalid_variants' using errcode = '22023'; end if;
  select count(*) filter (where coalesce((x ->> 'is_control')::boolean, false)), sum(coalesce((x ->> 'weight')::int, 0)) into ctrl, tot from jsonb_array_elements(p_variants) x;
  if ctrl <> 1 then raise exception 'exactly_one_control' using errcode = '22023'; end if;
  if tot <= 0 then raise exception 'invalid_weights' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_def -> 'guardrails', '[]')) <> 'array' then raise exception 'invalid_guardrails' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_def -> 'guardrails', '[]')) g where not ((g ? 'metric' and exists (select 1 from public.metric_definition_active m where m.key = g ->> 'metric'))
      or (g ? 'event_rate' and exists (select 1 from public.analytics_event_definitions d where d.event_name = g ->> 'event_rate'))) or g ->> 'direction' not in ('max', 'min') or jsonb_typeof(g -> 'threshold') <> 'number') then
    raise exception 'invalid_guardrail' using errcode = '22023', hint = 'Guardrails use an active Q35 metric or a defined analytics event, direction max|min and a numeric threshold.';
  end if;
  select * into e from public.experiments where key = p_def ->> 'key' for update;
  if found and e.status <> 'draft' then raise exception 'experiment_frozen' using errcode = '55000', hint = 'Move it back to draft first.'; end if;
  if not found then
    insert into public.experiments(key, name, hypothesis, kind, surface, unit, layer, flag_key, traffic_pct, holdout_pct, targeting, primary_metric, guardrails, touches_pricing, touches_legal, ends_at, created_by)
    values (p_def ->> 'key', p_def ->> 'name', coalesce(p_def ->> 'hypothesis', ''), p_def ->> 'kind', coalesce(p_def ->> 'surface', ''), coalesce(p_def ->> 'unit', 'user'),
      coalesce(p_def ->> 'layer', 'default'), p_def ->> 'flag_key', coalesce((p_def ->> 'traffic_pct')::numeric, 100), coalesce((p_def ->> 'holdout_pct')::numeric, 0),
      coalesce(p_def -> 'targeting', '{}'), coalesce(p_def -> 'primary_metric', '{}'), coalesce(p_def -> 'guardrails', '[]'),
      coalesce((p_def ->> 'touches_pricing')::boolean, false), coalesce((p_def ->> 'touches_legal')::boolean, false), (p_def ->> 'ends_at')::timestamptz, auth.uid())
    returning id into id_;
  else
    id_ := e.id;
    update public.experiments set name = p_def ->> 'name', hypothesis = coalesce(p_def ->> 'hypothesis', ''), kind = p_def ->> 'kind', surface = coalesce(p_def ->> 'surface', ''),
      unit = coalesce(p_def ->> 'unit', 'user'), layer = coalesce(p_def ->> 'layer', 'default'), flag_key = p_def ->> 'flag_key',
      traffic_pct = coalesce((p_def ->> 'traffic_pct')::numeric, 100), holdout_pct = coalesce((p_def ->> 'holdout_pct')::numeric, 0),
      targeting = coalesce(p_def -> 'targeting', '{}'), primary_metric = coalesce(p_def -> 'primary_metric', '{}'), guardrails = coalesce(p_def -> 'guardrails', '[]'),
      touches_pricing = coalesce((p_def ->> 'touches_pricing')::boolean, false), touches_legal = coalesce((p_def ->> 'touches_legal')::boolean, false),
      ends_at = (p_def ->> 'ends_at')::timestamptz, version = version + 1, approved_by = null, approved_at = null, approval_reason = null
    where id = id_;
    delete from public.experiment_variants where experiment_id = id_;
  end if;
  for v in select * from jsonb_array_elements(p_variants) loop
    insert into public.experiment_variants(experiment_id, key, is_control, weight, config)
      values (id_, v ->> 'key', coalesce((v ->> 'is_control')::boolean, false), (v ->> 'weight')::int, coalesce(v -> 'config', '{}'));
  end loop;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.experiment_saved',
    jsonb_build_object('experiment_id', id_, 'key', p_def ->> 'key', 'reason', p_reason));
  return id_;
end $$;

-- Lifecycle: submit (pricing/legal → pending_approval), approve (different admin; commerce for pricing, settings for legal),
-- start, pause, resume, stop (kill one experiment), complete, archive, reopen (back to draft = new version).
create or replace function public.admin_experiment_transition(p_id uuid, p_action text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.experiments; target text; r jsonb; vcount int;
begin
  perform public.admin_require('settings', p_reason);
  select * into e from public.experiments where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  target := case p_action when 'submit' then case when e.touches_pricing or e.touches_legal then 'pending_approval' else null end
    when 'approve' then 'approved' when 'reject' then 'draft' when 'start' then 'running' when 'resume' then 'running' when 'pause' then 'paused'
    when 'stop' then 'stopped' when 'complete' then 'completed' when 'archive' then 'archived' when 'reopen' then 'draft' else null end;
  if p_action = 'submit' and target is null then raise exception 'no_approval_needed' using errcode = '22023', hint = 'Start it directly.'; end if;
  if target is null then raise exception 'invalid_action' using errcode = '22023'; end if;
  if p_action = 'approve' then
    if e.created_by = auth.uid() then raise exception 'four_eyes_required' using errcode = '42501', hint = 'A different admin must approve.'; end if;
    if e.touches_pricing and not public.has_admin_permission('commerce') then raise exception 'commerce_approval_required' using errcode = '42501'; end if;
    update public.experiments set approved_by = auth.uid(), approved_at = now(), approval_reason = p_reason where id = p_id;
  end if;
  if p_action = 'start' then
    if (e.touches_pricing or e.touches_legal) and e.approved_at is null then raise exception 'approval_required' using errcode = '42501'; end if;
    select count(*) into vcount from public.experiment_variants where experiment_id = p_id;
    if vcount < 2 then raise exception 'invalid_variants' using errcode = '22023'; end if;
    -- Re-validate variant configs at start (approval state may have changed).
    if exists (select 1 from public.experiment_variants v where v.experiment_id = p_id and cardinality(public.experiment_config_violations(e.kind, v.config, e.approved_at is not null)) > 0) then
      raise exception 'experiment_config_protected' using errcode = '42501';
    end if;
    -- Conflict: another running experiment on the same flag or the same surface in a different layer would double-treat units.
    if exists (select 1 from public.experiments o where o.id <> p_id and o.status in ('running', 'paused') and o.layer <> e.layer
        and ((e.flag_key is not null and o.flag_key = e.flag_key) or (e.surface <> '' and o.surface = e.surface))) then
      raise exception 'experiment_conflict' using errcode = '23P01', hint = 'Put experiments on the same flag/surface in one layer.';
    end if;
    insert into public.experiment_versions(experiment_id, version, definition, created_by)
    values (p_id, e.version, to_jsonb(e) - 'salt' || jsonb_build_object('variants', (select jsonb_agg(to_jsonb(v) - 'experiment_id' order by v.key) from public.experiment_variants v where v.experiment_id = p_id)), auth.uid())
    on conflict do nothing;
  end if;
  r := public.transition_state('experiment', p_id, target, e.status, auth.uid(), 'admin', p_reason);
  if p_action = 'start' then update public.experiments set started_at = coalesce(started_at, now()) where id = p_id; end if;
  if p_action = 'stop' then update public.experiments set stopped_at = now(), stop_reason = p_reason where id = p_id; end if;
  if p_action in ('reopen', 'reject') then update public.experiments set version = version + 1, approved_by = null, approved_at = null, approval_reason = null where id = p_id; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.experiment_' || p_action,
    jsonb_build_object('experiment_id', p_id, 'key', e.key, 'from', e.status, 'to', target, 'reason', p_reason));
  return r;
end $$;

create or replace function public.admin_experiment_holdout(p_layer text, p_pct numeric, p_days integer, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare id_ uuid;
begin
  perform public.admin_require('settings', p_reason);
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'invalid_days' using errcode = '22023'; end if;
  if exists (select 1 from public.experiment_holdouts where layer = p_layer and status = 'active' and ends_at > now()) then
    raise exception 'holdout_exists' using errcode = '23P01';
  end if;
  insert into public.experiment_holdouts(layer, pct, ends_at, reason, created_by) values (p_layer, p_pct, now() + make_interval(days => p_days), p_reason, auth.uid()) returning id into id_;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.experiment_holdout_created',
    jsonb_build_object('holdout_id', id_, 'layer', p_layer, 'pct', p_pct, 'days', p_days, 'reason', p_reason));
  return id_;
end $$;

-- Admin overview (UI read): every experiment with status, variants, assignment/exposure counts and last guardrail check.
create or replace function public.admin_experiments_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('settings') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return jsonb_build_object('killed', public.experiments_killed(), 'experiments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'key', e.key, 'name', e.name, 'kind', e.kind, 'status', e.status, 'unit', e.unit, 'layer', e.layer, 'version', e.version,
      'traffic_pct', e.traffic_pct, 'holdout_pct', e.holdout_pct, 'touches_pricing', e.touches_pricing, 'touches_legal', e.touches_legal,
      'approved', e.approved_at is not null, 'started_at', e.started_at, 'ends_at', e.ends_at, 'stop_reason', e.stop_reason,
      'variants', (select jsonb_agg(jsonb_build_object('key', v.key, 'weight', v.weight, 'control', v.is_control) order by v.is_control desc, v.key) from public.experiment_variants v where v.experiment_id = e.id),
      'assigned', (select count(*) from public.experiment_assignments a where a.experiment_id = e.id),
      'exposed', (select count(*) from public.experiment_exposures x where x.experiment_id = e.id),
      'last_check', (select jsonb_build_object('at', c.checked_at, 'breached', c.breached) from public.experiment_guardrail_checks c where c.experiment_id = e.id order by c.checked_at desc limit 1))
    order by e.updated_at desc) from public.experiments e), '[]'),
    'holdouts', coalesce((select jsonb_agg(to_jsonb(h) - 'salt') from public.experiment_holdouts h where h.status = 'active'), '[]'));
end $$;

-- ── 6. Jobs, events, retention ───────────────────────────────────────────────────────────────────────────────────────
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('experiments.guardrails', 'db', 'public.job_experiment_guardrails', 3, 'Q36: every 30 min; evaluate guardrails of running experiments, stop on breach, complete ended ones')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
select cron.unschedule('experiments-guardrails') where exists (select 1 from cron.job where jobname = 'experiments-guardrails');
select cron.schedule('experiments-guardrails', '*/30 * * * *', $cron$select public.enqueue_job(p_kind => 'experiments.guardrails', p_payload => '{}'::jsonb,
  p_dedupe_key => 'experiments.guardrails:' || to_char(date_bin('30 minutes', now(), timestamptz '2000-01-01'), 'YYYYMMDDHH24MI')) where exists (select 1 from public.experiments where status in ('running', 'paused'))$cron$);

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('experiment.state_changed', 1, 'experiment', 'An experiment changed lifecycle state (payload: id, from, to, reason).', null),
  ('experiment.guardrail_breached', 1, 'experiment', 'A guardrail metric breached its threshold and the experiment was stopped (payload: experiment_id, metric, variant, value, threshold).', null)
on conflict (event_type) do update set description = excluded.description;

-- Erasure: a user's pseudonymous assignment/exposure rows go with their analytics events.
create or replace function public.experiments_forget_user(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int; m int; u text := 'u:' || public.analytics_pseudonym('user:' || p_user::text);
begin
  delete from public.experiment_exposures where unit_id = u; get diagnostics n = row_count;
  delete from public.experiment_assignments where unit_id = u; get diagnostics m = row_count;
  return n + m;
end $$;
create or replace function public.experiments_on_user_erased() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin perform public.experiments_forget_user((new.metadata ->> 'user')::uuid); exception when others then null; end;
  return new;
end $$;
drop trigger if exists experiments_user_erased on public.audit_events;
create trigger experiments_user_erased after insert on public.audit_events
  for each row when (new.event = 'privacy.user_erased') execute function public.experiments_on_user_erased();

-- ── 7. Grants ────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.experiment_config_violations(text, jsonb, boolean), public.experiments_guard(), public.experiment_versions_immutable(),
  public.experiment_bucket(text, text), public.experiments_killed(), public.experiment_unit(text, uuid, uuid), public.experiment_assign(text, uuid, uuid),
  public.experiment_expose(text, uuid, uuid, text), public.experiment_evaluate_internal(uuid), public.experiment_evaluate(uuid), public.experiment_guardrail_sweep(),
  public.job_experiment_guardrails(public.job_queue), public.admin_experiment_save(jsonb, jsonb, text), public.admin_experiment_transition(uuid, text, text),
  public.admin_experiment_holdout(text, numeric, integer, text), public.admin_experiments_overview(), public.experiments_forget_user(uuid), public.experiments_on_user_erased()
from public, anon, authenticated;
grant execute on function public.experiment_evaluate(uuid), public.admin_experiment_save(jsonb, jsonb, text), public.admin_experiment_transition(uuid, text, text),
  public.admin_experiment_holdout(text, numeric, integer, text), public.admin_experiments_overview(), public.experiment_config_violations(text, jsonb, boolean)
to authenticated, service_role;
grant execute on function public.experiment_bucket(text, text), public.experiments_killed(), public.experiment_unit(text, uuid, uuid), public.experiment_assign(text, uuid, uuid),
  public.experiment_expose(text, uuid, uuid, text), public.experiment_evaluate_internal(uuid), public.experiment_guardrail_sweep(), public.job_experiment_guardrails(public.job_queue),
  public.experiments_forget_user(uuid)
to service_role;
