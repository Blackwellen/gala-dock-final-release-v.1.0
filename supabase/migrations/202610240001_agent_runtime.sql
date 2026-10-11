-- Phases 9–12 — Gala Agent durable runtime (master spec §4–27, §104–108).
-- Typed tools (catalog seeded from src/lib/agent/registry.ts), risk R0–R5, workspace policies, persisted steps with
-- idempotency + checkpoints, waits, artifacts, rich approvals, compiled routines, lease-based worker claims.
-- Tools execute through agent_invoke(): service-role only; it impersonates the requesting/approving user for one transaction
-- (request.jwt.claims) and calls whitelisted domain functions, so every permission, RLS-equivalent and business check applies
-- exactly as in the UI. The agent can never exceed the human's own permissions (§11).
begin;

-- ───────────────────────── catalog, policy ─────────────────────────
create table if not exists public.agent_tools (
  id text primary key, version integer not null, title text not null, description text not null,
  surface text not null check (surface in ('organizer','provider','both')),
  risk smallint not null check (risk between 0 and 5), permission text not null, mutation boolean not null,
  reversible boolean not null, idempotent boolean not null, timeout_ms integer not null, retries smallint not null,
  approval_note text not null default ''
);
alter table public.agent_tools enable row level security;
drop policy if exists agent_tools_read on public.agent_tools;
create policy agent_tools_read on public.agent_tools for select using (auth.uid() is not null);

create table if not exists public.agent_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  mode text not null default 'execute_with_approval' check (mode in ('suggest','draft','execute_with_approval','policy_autopilot')),
  allowed_tools text[],                                   -- null = every tool the role allows
  auto_tools text[] not null default '{}',                -- R3 tools pre-authorised in execute_with_approval / autopilot
  autopilot_rules jsonb not null default '[]',            -- [{tool, max_amount_minor?, when?: {field: value}}]
  max_run_minutes integer not null default 240 check (max_run_minutes between 5 and 10080),
  max_parallel_runs integer not null default 3 check (max_parallel_runs between 1 and 20),
  booking_authority_minor bigint not null default 0, discount_authority_pct integer not null default 0, refund_threshold_minor bigint not null default 0,
  daily_spend_cap_minor bigint not null default 0, monthly_spend_cap_minor bigint not null default 0, ticket_price_tolerance_pct integer not null default 0,
  quiet_hours jsonb not null default '{"from":"21:00","to":"08:00","tz":"Europe/London"}',
  approval_expiry_hours integer not null default 72 check (approval_expiry_hours between 1 and 720),
  min_confidence numeric not null default 0.6 check (min_confidence between 0 and 1),
  escalation_user_ids uuid[] not null default '{}',
  communication jsonb not null default '{"external_messages":true}',
  retention_days integer not null default 365,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
alter table public.agent_policies enable row level security;
drop policy if exists agent_policies_read on public.agent_policies;
create policy agent_policies_read on public.agent_policies for select using (public.is_workspace_member(workspace_id));
drop policy if exists agent_policies_write on public.agent_policies;
create policy agent_policies_write on public.agent_policies for all using (public.has_workspace_role(workspace_id, array['owner']))
  with check (public.has_workspace_role(workspace_id, array['owner']));

-- ───────────────────────── runs, steps, waits, artifacts ─────────────────────────
alter table public.agent_runs
  add column if not exists mode text not null default 'do' check (mode in ('ask','do','routine','mission')),
  add column if not exists interpretation jsonb not null default '{}',
  add column if not exists financial_exposure_minor bigint not null default 0,
  add column if not exists tokens integer not null default 0,
  add column if not exists summary text,
  add column if not exists lease_until timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists mission text;
create index if not exists agent_runs_claim_idx on public.agent_runs(status, next_wake_at) where status in ('queued','scheduled','scheduled_wait','retrying','planning','running');

create table if not exists public.agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  seq integer not null,
  tool_id text references public.agent_tools(id),
  input jsonb not null default '{}',
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','skipped','waiting_approval','blocked','deferred')),
  decision text check (decision in ('auto','approval','blocked','suggest')),
  output jsonb, error text,
  attempt smallint not null default 0,
  idempotency_key text not null unique,
  approval_id uuid,
  started_at timestamptz, finished_at timestamptz,
  unique (run_id, seq)
);
create table if not exists public.agent_waits (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  kind text not null check (kind in ('time','approval','external','quiet_hours')),
  until_at timestamptz, ref_id uuid, satisfied_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.agent_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  step_id uuid references public.agent_run_steps(id) on delete set null,
  kind text not null check (kind in ('record_created','record_changed','message_sent','draft','report','suggestion')),
  ref_type text, ref_id text, title text not null, data jsonb not null default '{}', link text,
  created_at timestamptz not null default now()
);
alter table public.agent_run_steps enable row level security;
alter table public.agent_waits enable row level security;
alter table public.agent_artifacts enable row level security;
create or replace function public.can_see_agent_run(p_run uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agent_runs r where r.id = p_run and (r.user_id = (select auth.uid()) or public.has_workspace_role(r.workspace_id, array['owner','manager'])))
    or public.has_admin_permission('agent_ops');
$$;
grant execute on function public.can_see_agent_run(uuid) to authenticated;
drop policy if exists agent_steps_read on public.agent_run_steps;
create policy agent_steps_read on public.agent_run_steps for select using (public.can_see_agent_run(run_id));
drop policy if exists agent_waits_read on public.agent_waits;
create policy agent_waits_read on public.agent_waits for select using (public.can_see_agent_run(run_id));
drop policy if exists agent_artifacts_read on public.agent_artifacts;
create policy agent_artifacts_read on public.agent_artifacts for select using (public.can_see_agent_run(run_id));

alter table public.agent_approvals
  add column if not exists tool_id text references public.agent_tools(id),
  add column if not exists step_id uuid references public.agent_run_steps(id) on delete set null,
  add column if not exists risk smallint,
  add column if not exists affected_ref text,
  add column if not exists previous_state jsonb,
  add column if not exists proposed_state jsonb,
  add column if not exists confidence numeric,
  add column if not exists alternatives jsonb not null default '[]',
  add column if not exists reason text,
  add column if not exists requested_by uuid references auth.users(id),
  add column if not exists batch_key text,
  add column if not exists edited_payload jsonb;

alter table public.agent_routines
  add column if not exists owner_id uuid references auth.users(id),
  add column if not exists trigger jsonb,          -- {"type":"cron","cron":"0 8 * * 1-5","tz":"Europe/London"}
  add column if not exists conditions jsonb not null default '[]',
  add column if not exists actions jsonb not null default '[]', -- [{tool, input, why}]
  add column if not exists limits jsonb not null default '{}',
  add column if not exists compiled_at timestamptz,
  add column if not exists failures integer not null default 0;

-- ───────────────────────── worker claim (lease) ─────────────────────────
create or replace function public.claim_agent_runs(p_limit integer default 5, p_lease_seconds integer default 120) returns setof public.agent_runs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.agent_runs r set lease_until = now() + make_interval(secs => p_lease_seconds), started_at = coalesce(r.started_at, now()), updated_at = now()
  where r.id in (
    select x.id from public.agent_runs x
    where x.status in ('queued','running','retrying','scheduled_wait','scheduled') and coalesce(x.next_wake_at, now()) <= now() and coalesce(x.lease_until, now() - interval '1 second') < now()
      and (x.status = 'queued' or exists (select 1 from public.agent_run_steps s where s.run_id = x.id))   -- legacy stepless runs are never claimed
    order by x.created_at limit greatest(1, least(p_limit, 25)) for update skip locked)
  returning r.*;
end $$;
revoke all on function public.claim_agent_runs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_agent_runs(integer, integer) to service_role;

-- ───────────────────────── tool execution as the human (whitelisted) ─────────────────────────
create or replace function public.agent_invoke(p_actor uuid, p_workspace uuid, p_tool text, p_args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.agent_tools; out jsonb; v uuid; perm_ok boolean;
begin
  select * into t from public.agent_tools where id = p_tool;
  if not found then raise exception 'unknown_tool' using errcode = '22023'; end if;
  -- Become the human for this transaction: auth.uid() now returns p_actor in every domain function.
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = p_actor and m.status = 'active') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select public.has_permission(p_workspace, t.permission) into perm_ok;
  if not perm_ok then raise exception 'permission_denied:%', t.permission using errcode = '42501'; end if;

  case p_tool
  -- ── R0 reads (organizer)
  when 'events.list' then
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'status', e.status, 'guests', e.guest_count, 'venue', e.venue_name, 'link', '/organizer/events/' || e.id) order by e.starts_at nulls last), '[]') into out
      from public.events e where e.workspace_id = p_workspace and e.status <> 'cancelled'
        and (p_args->>'within_days' is null or e.starts_at between now() and now() + make_interval(days => (p_args->>'within_days')::int)) limit 50;
  when 'event.readiness' then out := public.event_readiness((p_args->>'event_id')::uuid);
  when 'event.feasibility' then out := public.event_feasibility((p_args->>'event_id')::uuid);
  when 'event.budget' then out := public.event_build_budget((p_args->>'event_id')::uuid);
  when 'marketplace.open_requests' then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', b.id, 'title', b.title, 'event', e.name, 'status', b.status, 'response_deadline', b.response_deadline, 'link', '/organizer/marketplace/bookings/' || b.id) order by b.response_deadline nulls last), '[]') into out
      from public.build_items b join public.events e on e.id = b.event_id where e.workspace_id = p_workspace and b.status in ('sent','awaiting','awaiting_provider','quoted','available','held','conditional_hold_requested') limit 60;
  when 'marketplace.search' then
    select coalesce(jsonb_agg(jsonb_build_object('listing_id', l.id, 'workspace_id', l.workspace_id, 'name', l.name, 'category', l.category, 'city', l.city, 'price_from', l.price_from, 'rating', l.rating, 'capacity_max', l.capacity_max, 'response_hours', l.response_hours, 'emergency', l.emergency_supply)), '[]') into out
      from (select * from public.listings l where l.published and l.paused_at is null
        and (p_args->>'category' is null or l.category ilike '%' || (p_args->>'category') || '%' or l.kind = lower(p_args->>'category'))
        and (p_args->>'city' is null or l.city ilike '%' || (p_args->>'city') || '%')
        and (p_args->>'guests' is null or coalesce(l.capacity_max, 100000) >= (p_args->>'guests')::int)
        and (p_args->>'max_price' is null or coalesce(l.price_from, 0) <= (p_args->>'max_price')::numeric)
        order by l.rating desc nulls last limit 12) l;
  when 'team.conflicts' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into out from public.team_conflicts(p_workspace) c;
  when 'tickets.sales' then
    select coalesce(jsonb_agg(jsonb_build_object('tier', t2.name, 'sold', t2.sold, 'held', t2.held, 'quantity', t2.quantity, 'price', t2.price, 'status', t2.status, 'revenue', t2.sold * t2.price)), '[]') into out
      from public.ticket_tiers t2 join public.events e on e.id = t2.event_id where e.id = (p_args->>'event_id')::uuid and e.workspace_id = p_workspace;
  when 'money.payables' then
    select coalesce(jsonb_agg(jsonb_build_object('payee', p.payee, 'kind', p.kind, 'amount', p.amount, 'status', p.status, 'due_at', p.due_at, 'event', e.name) order by p.due_at), '[]') into out
      from public.payments p join public.events e on e.id = p.event_id where e.workspace_id = p_workspace and p.status in ('due','scheduled','overdue') limit 60;
  -- ── R2 internal writes
  when 'task.create' then
    if not public.can_edit_event((p_args->>'event_id')::uuid) then raise exception 'not_authorized' using errcode = '42501'; end if;
    insert into public.tasks(event_id, workspace_id, owner_id, title, detail, category, due_at, priority, status)
      values ((p_args->>'event_id')::uuid, p_workspace, p_actor, left(p_args->>'title', 200), left(coalesce(p_args->>'detail', ''), 2000), 'agent',
        nullif(p_args->>'due_at', '')::timestamptz, coalesce(p_args->>'priority', 'medium'), 'todo') returning id into v;
    out := jsonb_build_object('task_id', v, 'link', '/organizer/events/' || (p_args->>'event_id') || '?tab=plan&section=tasks');
  -- ── R3 external, non-binding
  when 'message.party' then
    v := public.start_conversation(coalesce(p_args->>'kind', 'direct'), coalesce(p_args->>'subject', ''), p_args->>'to_type', (p_args->>'to')::uuid, p_args->>'body', p_workspace,
      nullif(p_args->>'event_id', '')::uuid, null, nullif(p_args->>'item_id', '')::uuid);
    out := jsonb_build_object('conversation_id', v, 'link', '/messages/' || v);
  when 'marketplace.request_hold' then
    v := public.request_conditional_hold((p_args->>'item_id')::uuid, (p_args->>'hours')::int, nullif(p_args->>'depends_on', '')::uuid, coalesce(p_args->>'conditions', ''));
    out := jsonb_build_object('hold_id', v, 'link', '/organizer/marketplace/bookings/' || (p_args->>'item_id'));
  when 'marketplace.request_standby' then
    v := public.request_standby((p_args->>'item_id')::uuid, nullif(p_args->>'primary_id', '')::uuid, (p_args->>'window_start')::timestamptz, (p_args->>'window_end')::timestamptz, coalesce(p_args->>'note', ''));
    out := jsonb_build_object('standby_id', v, 'link', '/organizer/marketplace/bookings/' || (p_args->>'item_id'));
  when 'emergency.create' then
    v := public.create_emergency_request((p_args->>'event_id')::uuid, p_args - 'event_id');
    out := jsonb_build_object('request_id', v, 'link', '/organizer/marketplace/emergency/' || v);
  -- ── R4 commitments (only ever executed after human approval)
  when 'standby.activate' then perform public.activate_standby((p_args->>'standby_id')::uuid, p_args->>'reason'); out := jsonb_build_object('activated', true);
  when 'cancellation.request' then
    v := public.request_cancellation((p_args->>'item_id')::uuid, 'customer', coalesce(p_args->>'kind', 'full'), p_args->>'reason');
    out := jsonb_build_object('cancellation_id', v, 'link', '/organizer/marketplace/bookings/' || (p_args->>'item_id'));
  when 'tickets.publish_tier' then
    update public.ticket_tiers t3 set status = 'on_sale' from public.events e where t3.id = (p_args->>'tier_id')::uuid and e.id = t3.event_id and e.workspace_id = p_workspace and t3.status in ('draft','scheduled','paused')
      returning t3.id into v;
    if v is null then raise exception 'not_publishable' using errcode = '22023'; end if;
    out := jsonb_build_object('tier_id', v, 'status', 'on_sale');
  -- ── Provider reads
  when 'opportunities.list' then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', b.id, 'title', e.name, 'status', b.status, 'response_deadline', b.response_deadline, 'amount', b.amount, 'starts_at', e.starts_at, 'link', '/provider/opportunities/' || b.id) order by b.response_deadline nulls last), '[]') into out
      from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
      where l.workspace_id = p_workspace and b.status in ('sent','awaiting','awaiting_provider','clarification','conditional_hold_requested') limit 60;
  when 'calendar.conflicts' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into out from public.space_conflicts((p_args->>'space_id')::uuid, (p_args->>'starts_at')::timestamptz, (p_args->>'ends_at')::timestamptz) c;
  when 'money.provider_summary' then
    select jsonb_build_object('protected', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'protected_pending_delivery'), 0) / 100.0,
      'releasing', coalesce(sum(amount_minor - platform_fee_minor) filter (where status = 'eligible_for_provider_transfer'), 0) / 100.0,
      'released', coalesce(sum(transferred_minor) filter (where status in ('transfer_created','paid_out')), 0) / 100.0) into out
      from public.payment_orders where payee_workspace_id = p_workspace;
  when 'reliability.get' then select to_jsonb(r) into out from public.reliability_metrics r where r.workspace_id = p_workspace;
  -- ── Provider R3/R4
  when 'opportunity.respond' then
    out := jsonb_build_object('status', public.provider_respond((p_args->>'item_id')::uuid, p_args->>'response', coalesce(p_args->>'note', '')));
  when 'venue.hold' then
    v := public.venue_place_hold((p_args->>'item_id')::uuid, (p_args->>'space_id')::uuid, (p_args->>'starts_at')::timestamptz, (p_args->>'ends_at')::timestamptz, (p_args->>'hours')::int, coalesce(p_args->>'blocking', 'soft'), coalesce(p_args->>'note', ''));
    out := jsonb_build_object('hold_id', v);
  when 'quote.send' then
    v := public.provider_issue_quote((p_args->>'item_id')::uuid, p_args->'items', coalesce((p_args->>'tax_bps')::int, 0), coalesce((p_args->>'deposit_pct')::int, 30),
      coalesce((p_args->>'valid_days')::int, 14), coalesce(p_args->'terms', '{}'), coalesce(p_args->>'message', ''), true);
    out := jsonb_build_object('quote_id', v, 'link', '/provider/opportunities/' || (p_args->>'item_id'));
  else raise exception 'tool_not_executable:%', p_tool using errcode = '22023';
  end case;
  return coalesce(out, 'null'::jsonb);
end $$;
revoke all on function public.agent_invoke(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_invoke(uuid, uuid, text, jsonb) to service_role;

-- Approve/reject as the signed-in human (records; execution then runs as that human via the app). Replaces the earlier 2-arg version.
drop function if exists public.decide_agent_approval(uuid, boolean);
create or replace function public.decide_agent_approval(p_approval uuid, p_approve boolean, p_edited jsonb default null) returns public.agent_approvals
language plpgsql security definer set search_path = '' as $$
declare a public.agent_approvals;
begin
  select * into a from public.agent_approvals where id = p_approval for update;
  if not found or not public.has_workspace_role(a.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if a.status <> 'pending' then raise exception 'already_decided' using errcode = '22023'; end if;
  if a.expires_at is not null and a.expires_at < now() then update public.agent_approvals set status = 'expired' where id = a.id; raise exception 'expired' using errcode = '22023'; end if;
  update public.agent_approvals set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
    edited_payload = case when p_approve then p_edited end where id = a.id returning * into a;
  insert into public.audit_events(actor_id, actor_type, workspace_id, agent_run_id, event, metadata)
    values (auth.uid(), 'user', a.workspace_id, a.run_id, case when p_approve then 'agent.approval_approved' else 'agent.approval_rejected' end,
      jsonb_build_object('approval_id', a.id, 'tool', a.tool_id, 'amount', a.amount, 'edited', p_edited is not null));
  return a;
end $$;
revoke all on function public.decide_agent_approval(uuid, boolean, jsonb) from public, anon;
grant execute on function public.decide_agent_approval(uuid, boolean, jsonb) to authenticated, service_role;

grant select on public.agent_tools, public.agent_policies, public.agent_run_steps, public.agent_waits, public.agent_artifacts to authenticated;
grant insert, update on public.agent_policies to authenticated;
grant all on public.agent_tools, public.agent_policies, public.agent_run_steps, public.agent_waits, public.agent_artifacts to service_role;
commit;
