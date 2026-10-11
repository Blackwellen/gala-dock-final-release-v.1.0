-- Plan entitlements (release spec §113–115). Capabilities come from server-side configuration, never `plan === "pro"` checks in UI.
-- Values are the PROPOSED tiers in docs/commercial/economics.md; finance can change rows without a deploy. null = unlimited.
create table if not exists public.plan_entitlements (
  kind text not null check (kind in ('organizer','provider')),
  plan text not null check (plan in ('starter','pro','business','enterprise')),
  capability text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, plan, capability)
);
alter table public.plan_entitlements enable row level security;
drop policy if exists plan_entitlements_read on public.plan_entitlements;
create policy plan_entitlements_read on public.plan_entitlements for select using (true);   -- plan comparison is public information

insert into public.plan_entitlements(kind, plan, capability, value)
select k, p, c, v::jsonb from (values
  ('organizer','starter','events.active.max','3'),  ('organizer','pro','events.active.max','25'),  ('organizer','business','events.active.max','100'), ('organizer','enterprise','events.active.max','null'),
  ('organizer','starter','team.max','2'),           ('organizer','pro','team.max','10'),           ('organizer','business','team.max','50'),           ('organizer','enterprise','team.max','null'),
  ('organizer','starter','storage.gb','2'),         ('organizer','pro','storage.gb','25'),         ('organizer','business','storage.gb','100'),        ('organizer','enterprise','storage.gb','500'),
  ('organizer','starter','ai.credits.monthly','50'),('organizer','pro','ai.credits.monthly','1000'),('organizer','business','ai.credits.monthly','4000'),('organizer','enterprise','ai.credits.monthly','15000'),
  ('organizer','starter','agent.long_runs','false'),('organizer','pro','agent.long_runs','true'),  ('organizer','business','agent.long_runs','true'),  ('organizer','enterprise','agent.long_runs','true'),
  ('organizer','starter','agent.deep','false'),     ('organizer','pro','agent.deep','false'),      ('organizer','business','agent.deep','true'),       ('organizer','enterprise','agent.deep','true'),
  ('organizer','starter','api.access','false'),     ('organizer','pro','api.access','true'),       ('organizer','business','api.access','true'),       ('organizer','enterprise','api.access','true'),
  ('organizer','starter','reporting.advanced','false'),('organizer','pro','reporting.advanced','true'),('organizer','business','reporting.advanced','true'),('organizer','enterprise','reporting.advanced','true'),
  ('provider','starter','listings.max','3'),        ('provider','pro','listings.max','20'),        ('provider','business','listings.max','100'),       ('provider','enterprise','listings.max','null'),
  ('provider','starter','team.max','3'),            ('provider','pro','team.max','15'),            ('provider','business','team.max','50'),            ('provider','enterprise','team.max','null'),
  ('provider','starter','storage.gb','5'),          ('provider','pro','storage.gb','50'),          ('provider','business','storage.gb','200'),         ('provider','enterprise','storage.gb','1000'),
  ('provider','starter','ai.credits.monthly','50'), ('provider','pro','ai.credits.monthly','1000'),('provider','business','ai.credits.monthly','4000'),('provider','enterprise','ai.credits.monthly','15000'),
  ('provider','starter','agent.long_runs','false'), ('provider','pro','agent.long_runs','true'),   ('provider','business','agent.long_runs','true'),   ('provider','enterprise','agent.long_runs','true'),
  ('provider','starter','agent.deep','false'),      ('provider','pro','agent.deep','false'),       ('provider','business','agent.deep','true'),        ('provider','enterprise','agent.deep','true'),
  ('provider','starter','api.access','false'),      ('provider','pro','api.access','true'),        ('provider','business','api.access','true'),        ('provider','enterprise','api.access','true'),
  ('provider','starter','commission.rate_bps','1200'),('provider','pro','commission.rate_bps','1000'),('provider','business','commission.rate_bps','800'),('provider','enterprise','commission.rate_bps','600')
) as t(k, p, c, v)
on conflict (kind, plan, capability) do nothing;

-- Effective value for a workspace: per-workspace override (settings.entitlements) → plan row → null.
create or replace function public.entitlement(p_workspace uuid, p_capability text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(w.settings -> 'entitlements' -> p_capability, e.value)
  from public.workspaces w left join public.plan_entitlements e on e.kind = w.kind and e.plan = coalesce(w.plan, 'starter') and e.capability = p_capability
  where w.id = p_workspace;
$$;
create or replace function public.has_capability(p_workspace uuid, p_capability text) returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce((public.entitlement(p_workspace, p_capability))::text = 'true', false); $$;
revoke all on function public.entitlement(uuid, text) from public, anon;
revoke all on function public.has_capability(uuid, text) from public, anon;
grant execute on function public.entitlement(uuid, text) to authenticated, service_role;
grant execute on function public.has_capability(uuid, text) to authenticated, service_role;

-- AI allowance follows the plan unless a budget row overrides it; deep mode needs both the plan capability and the owner's opt-in.
alter table public.ai_budgets alter column monthly_allowance drop not null;
alter table public.ai_budgets alter column monthly_allowance drop default;

create or replace function public.ai_credit_status(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.ai_budgets; month_allow numeric; month_used numeric; day_used numeric; bal numeric; od numeric;
begin
  if auth.uid() is not null and not public.is_workspace_member(p_workspace) and not public.has_admin_permission('agent_ops') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into b from public.ai_budgets where workspace_id = p_workspace;
  if not found then b.soft_caps := '{70,85,95}'; b.hard_cap := true; b.allow_overage := false; b.overage_limit := 0; b.per_run_limit := 50; b.deep_allowed := false; end if;
  b.monthly_allowance := coalesce(b.monthly_allowance, (public.entitlement(p_workspace, 'ai.credits.monthly') #>> '{}')::numeric, 0);
  b.deep_allowed := b.deep_allowed and public.has_capability(p_workspace, 'agent.deep');
  select coalesce(sum(from_allowance), 0), coalesce(sum(credits), 0), coalesce(sum(overage), 0) into month_allow, month_used, od from public.ai_usage_events
    where workspace_id = p_workspace and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  select coalesce(sum(credits), 0) into day_used from public.ai_usage_events where workspace_id = p_workspace and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  select coalesce(sum(credits), 0) into bal from public.ai_credit_ledger where workspace_id = p_workspace and kind <> 'overage' and (expires_at is null or expires_at > now() or credits < 0);
  return jsonb_build_object('allowance', b.monthly_allowance, 'allowance_used', month_allow, 'allowance_left', greatest(b.monthly_allowance - month_allow, 0),
    'balance', greatest(bal, 0), 'used_this_month', month_used, 'used_today', day_used, 'overage_this_month', od,
    'pct', case when b.monthly_allowance > 0 then round(100 * month_allow / b.monthly_allowance) else 100 end,
    'soft_caps', to_jsonb(b.soft_caps), 'hard_cap', b.hard_cap, 'allow_overage', b.allow_overage, 'overage_limit', b.overage_limit,
    'daily_limit', b.daily_limit, 'per_run_limit', b.per_run_limit, 'deep_allowed', b.deep_allowed,
    'available', greatest(b.monthly_allowance - month_allow, 0) + greatest(bal, 0) + case when b.allow_overage then greatest(b.overage_limit - od, 0) else 0 end);
end $$;

-- API access is a plan capability.
create or replace function public.create_api_key(p_workspace uuid, p_name text, p_scopes text[], p_prefix text, p_hash text, p_expires timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not public.has_capability(p_workspace, 'api.access') then raise exception 'plan_required:api.access' using errcode = '42501'; end if;
  if p_expires is not null and p_expires > now() + interval '400 days' then raise exception 'expiry_too_long' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_scopes) s where s !~ '^[a-z_]+:(read|write|scan)$') then raise exception 'invalid_scope' using errcode = '22023'; end if;
  insert into public.api_keys(workspace_id, name, prefix, key_hash, scopes, acts_as, expires_at) values (p_workspace, left(trim(p_name), 80), p_prefix, p_hash, p_scopes, auth.uid(), p_expires) returning id into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'api_key.created', jsonb_build_object('key_id', v, 'name', p_name, 'scopes', p_scopes, 'prefix', p_prefix));
  return v;
end $$;

-- Webhook-disabled notifications link to the right portal.
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
      select m.user_id, 'event_update', 'Webhook endpoint disabled', e.url || ' failed repeatedly for over 24 hours and was disabled. Fix it and re-enable it in Settings → Developers.', '/' || (select ws.kind from public.workspaces ws where ws.id = e.workspace_id) || '/settings?tab=developers'
      from public.workspace_members m where m.workspace_id = e.workspace_id and m.role in ('owner','manager') and m.status = 'active';
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', e.workspace_id, 'webhook.endpoint_disabled', jsonb_build_object('endpoint_id', e.id));
  end if;
end $$;
