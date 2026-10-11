-- Agent run types (release spec §12): Watch, Event-driven routine, Batch mission. Ask, one-time task, multi-step / long-running
-- missions, scheduled routines and approval-dependent runs already exist in the runtime.

-- ── Watch: polls a read-only tool as the human and fires when a condition holds. No model calls while waiting (no token burn).
create table if not exists public.agent_watches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 3 and 140),
  tool_id text not null references public.agent_tools(id),
  input jsonb not null default '{}',
  condition jsonb not null,                -- {"path":"status","op":"eq|neq|gt|gte|lt|lte|contains|changed|exists","value":...}
  check_every_minutes integer not null default 15 check (check_every_minutes between 1 and 1440),
  backoff_factor numeric not null default 1.5 check (backoff_factor between 1 and 4),
  max_checks integer not null default 500 check (max_checks between 1 and 5000),
  checks integer not null default 0,
  expires_at timestamptz not null,
  next_check_at timestamptz not null default now(),
  last_value jsonb, last_checked_at timestamptz, last_error text,
  status text not null default 'active' check (status in ('active','triggered','expired','cancelled','failed')),
  triggered_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '90 days')
);
create index if not exists agent_watches_due_idx on public.agent_watches(next_check_at) where status = 'active';
alter table public.agent_watches enable row level security;
drop policy if exists agent_watches_read on public.agent_watches;
create policy agent_watches_read on public.agent_watches for select using (user_id = (select auth.uid()) or public.has_workspace_role(workspace_id, array['owner','manager']));

create or replace function public.create_agent_watch(p_workspace uuid, p_title text, p_tool text, p_input jsonb, p_condition jsonb, p_every integer, p_expires timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; t public.agent_tools;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into t from public.agent_tools where id = p_tool;
  if not found or t.risk <> 0 then raise exception 'watch_tool_must_be_read_only' using errcode = '22023'; end if;
  if not public.has_permission(p_workspace, t.permission) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if coalesce(p_condition->>'op', '') not in ('eq','neq','gt','gte','lt','lte','contains','changed','exists') then raise exception 'invalid_condition' using errcode = '22023'; end if;
  if (select count(*) from public.agent_watches where workspace_id = p_workspace and status = 'active') >= 50 then raise exception 'limit_reached' using errcode = '22023'; end if;
  insert into public.agent_watches(workspace_id, user_id, title, tool_id, input, condition, check_every_minutes, expires_at)
    values (p_workspace, auth.uid(), left(trim(p_title), 140), p_tool, coalesce(p_input, '{}'), p_condition, greatest(least(coalesce(p_every, 15), 1440), 1), least(p_expires, now() + interval '90 days')) returning id into v;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (auth.uid(), 'user', p_workspace, 'agent.watch_created', jsonb_build_object('watch_id', v, 'tool', p_tool));
  return v;
end $$;
create or replace function public.cancel_agent_watch(p_watch uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.agent_watches set status = 'cancelled' where id = p_watch and status = 'active'
    and (user_id = auth.uid() or public.has_workspace_role(workspace_id, array['owner','manager']));
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
end $$;
revoke all on function public.create_agent_watch(uuid, text, text, jsonb, jsonb, integer, timestamptz) from public, anon;
revoke all on function public.cancel_agent_watch(uuid) from public, anon;
grant execute on function public.create_agent_watch(uuid, text, text, jsonb, jsonb, integer, timestamptz) to authenticated;
grant execute on function public.cancel_agent_watch(uuid) to authenticated;

-- ── Event-driven routines: trigger {"type":"event","event":"booking.cancelled"} fires on matching workspace audit events,
-- at most once per 5 minutes per routine (debounce), carrying the event payload into the run.
alter table public.agent_routines add column if not exists last_event jsonb;
create or replace function public.trg_audit_routines() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is null or new.actor_type = 'agent' then return new; end if;   -- never trigger on the agent's own actions (no loops)
  update public.agent_routines r set next_run_at = now(), last_event = jsonb_build_object('event', new.event, 'at', new.created_at, 'data', coalesce(new.metadata, '{}') - array['ip','user_agent','email','token','secret'])
  where r.workspace_id = new.workspace_id and r.enabled and r.trigger ->> 'type' = 'event' and r.trigger ->> 'event' = new.event
    and (r.last_run_at is null or r.last_run_at < now() - interval '5 minutes') and r.next_run_at > now();
  return new;
exception when others then return new;
end $$;
drop trigger if exists gd_audit_routines on public.audit_events;
create trigger gd_audit_routines after insert on public.audit_events for each row execute function public.trg_audit_routines();

-- ── Batch missions: one run, one step per record; previewed (awaiting_plan_confirmation) before anything executes.
alter table public.agent_runs add column if not exists batch jsonb;   -- {"tool":..., "count":n}
