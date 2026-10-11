-- Phase 1 foundation (master spec §42, §99, §100, §109, §114). Additive only.
begin;

-- ---------------------------------------------------------------- permissions (§99)
create table if not exists public.role_permissions (
  workspace_kind text not null check (workspace_kind in ('organizer','provider')),
  role text not null,
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (workspace_kind, role, permission)
);
alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
revoke all on public.role_permissions from anon, authenticated;
grant select on public.role_permissions to authenticated;

-- Capability check for the caller in a workspace. Owners resolve through the owner role.
create or replace function public.has_permission(p_workspace uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.workspaces w
    left join public.workspace_members m on m.workspace_id = w.id and m.user_id = (select auth.uid()) and m.status = 'active'
    join public.role_permissions rp on rp.workspace_kind = w.kind
      and rp.role = case when w.owner_id = (select auth.uid()) then 'owner' else m.role end
      and rp.permission = p_permission
    where w.id = p_workspace and w.status = 'active'
      and (w.owner_id = (select auth.uid()) or m.user_id is not null)
  );
$$;
revoke all on function public.has_permission(uuid, text) from public, anon;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- ---------------------------------------------------------------- state machines (§114)
create table if not exists public.state_machines (
  machine text primary key,
  table_name text not null,
  column_name text not null,
  mode text not null check (mode in ('enforce','audit')),
  initial_states text[] not null default '{}',
  terminal_states text[] not null default '{}'
);
create table if not exists public.state_transitions (
  machine text not null references public.state_machines(machine) on delete cascade,
  from_state text not null,
  to_state text not null,
  primary key (machine, from_state, to_state)
);
create table if not exists public.state_violations (
  id bigint generated always as identity primary key,
  machine text not null,
  table_name text not null,
  row_id text,
  from_state text,
  to_state text,
  actor_id uuid,
  occurred_at timestamptz not null default now()
);
create index if not exists state_violations_machine_idx on public.state_violations(machine, occurred_at desc);
alter table public.state_machines enable row level security;
alter table public.state_transitions enable row level security;
alter table public.state_violations enable row level security;
revoke all on public.state_machines, public.state_transitions, public.state_violations from anon, authenticated;

-- Generic guard: TG_ARGV[0] = machine, TG_ARGV[1] = status column.
create or replace function public.enforce_state_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.state_machines;
  col text := TG_ARGV[1];
  new_state text := to_jsonb(new) ->> col;
  old_state text := case when TG_OP = 'UPDATE' then to_jsonb(old) ->> col end;
  ok boolean;
begin
  select * into m from public.state_machines where machine = TG_ARGV[0];
  if not found or new_state is null then return new; end if;
  if TG_OP = 'INSERT' then
    ok := new_state = any(m.initial_states)
      or exists (select 1 from public.state_transitions t where t.machine = m.machine and (t.from_state = new_state or t.to_state = new_state));
  elsif old_state is distinct from new_state then
    ok := exists (select 1 from public.state_transitions t where t.machine = m.machine and t.from_state = old_state and t.to_state = new_state);
  else
    return new;
  end if;
  if not ok then
    insert into public.state_violations(machine, table_name, row_id, from_state, to_state, actor_id)
      values (m.machine, TG_TABLE_NAME, to_jsonb(new) ->> 'id', old_state, new_state, auth.uid());
    if m.mode = 'enforce' then
      raise exception 'illegal % transition % -> %', m.machine, coalesce(old_state, '(new)'), new_state using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- audit actors (§100)
alter table public.audit_events
  add column if not exists actor_type text not null default 'user',
  add column if not exists agent_run_id uuid,
  add column if not exists correlation_id text;
do $$ begin
  alter table public.audit_events add constraint audit_events_actor_type_check check (actor_type in ('user','agent','system','webhook','admin'));
exception when duplicate_object then null; end $$;
-- The audit event format allows richer domain prefixes (e.g. ledger.posted, agent.tool_executed).
alter table public.audit_events drop constraint if exists audit_events_event_check;
alter table public.audit_events add constraint audit_events_event_check check (event ~ '^[a-z_]+(\.[a-z_]+)+$');

-- ---------------------------------------------------------------- immutable ledger (§42)
create table if not exists public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  kind text not null check (kind in ('booking_payment','deposit','balance_payment','standby_fee','emergency_service','ticket_order','ticket_resale','refund','platform_boost','subscription','provider_payout','promoter_commission','affiliate_commission','dispute','reversal','adjustment')),
  workspace_id uuid references public.workspaces(id),
  event_id uuid references public.events(id),
  source_type text,
  source_id text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  description text not null default '',
  stripe_ref text,
  actor_type text not null default 'system' check (actor_type in ('user','agent','system','webhook','admin')),
  posted_at timestamptz not null default now()
);
create table if not exists public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.ledger_transactions(id),
  account text not null check (account in ('customer_payment','platform_revenue','platform_fee','processing_cost','tax_payable','provider_payable','promoter_payable','affiliate_payable','refunds','disputes','payouts','cash_stripe')),
  party_type text check (party_type in ('platform','workspace','user','promoter','partner')),
  party_id uuid,
  amount_minor bigint not null check (amount_minor <> 0),
  created_at timestamptz not null default now()
);
create index if not exists ledger_entries_tx_idx on public.ledger_entries(transaction_id);
create index if not exists ledger_entries_party_idx on public.ledger_entries(party_type, party_id, account);
create index if not exists ledger_tx_workspace_idx on public.ledger_transactions(workspace_id, posted_at desc);
create index if not exists ledger_tx_source_idx on public.ledger_transactions(source_type, source_id);

-- Immutable: corrections are new reversal transactions, never edits.
create or replace function public.ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'ledger records are immutable; post a reversal instead' using errcode = '42501'; end; $$;
drop trigger if exists ledger_entries_immutable on public.ledger_entries;
create trigger ledger_entries_immutable before update or delete on public.ledger_entries for each row execute function public.ledger_immutable();
drop trigger if exists ledger_transactions_immutable on public.ledger_transactions;
create trigger ledger_transactions_immutable before update or delete on public.ledger_transactions for each row execute function public.ledger_immutable();

-- Posts a balanced transaction atomically and idempotently. Service role only.
-- p_lines: [{account, amount_minor, party_type?, party_id?}] — amounts must sum to zero.
create or replace function public.post_ledger_transaction(
  p_idempotency_key text, p_kind text, p_currency text, p_lines jsonb,
  p_workspace uuid default null, p_event uuid default null, p_source_type text default null, p_source_id text default null,
  p_description text default '', p_stripe_ref text default null, p_actor_type text default 'system'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare tx uuid; total bigint;
begin
  select id into tx from public.ledger_transactions where idempotency_key = p_idempotency_key;
  if found then return tx; end if;
  select coalesce(sum((l->>'amount_minor')::bigint), 0) into total from jsonb_array_elements(p_lines) l;
  if total <> 0 or jsonb_array_length(p_lines) < 2 then
    raise exception 'unbalanced ledger transaction (sum %)', total using errcode = '22023';
  end if;
  insert into public.ledger_transactions(idempotency_key, kind, workspace_id, event_id, source_type, source_id, currency, description, stripe_ref, actor_type)
    values (p_idempotency_key, p_kind, p_workspace, p_event, p_source_type, p_source_id, p_currency, p_description, p_stripe_ref, p_actor_type)
    returning id into tx;
  insert into public.ledger_entries(transaction_id, account, party_type, party_id, amount_minor)
    select tx, l->>'account', l->>'party_type', nullif(l->>'party_id', '')::uuid, (l->>'amount_minor')::bigint from jsonb_array_elements(p_lines) l;
  insert into public.audit_events(workspace_id, event, actor_type, metadata)
    values (p_workspace, 'ledger.posted', p_actor_type, jsonb_build_object('transaction_id', tx, 'kind', p_kind));
  return tx;
end;
$$;
revoke all on function public.post_ledger_transaction(text, text, text, jsonb, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.post_ledger_transaction(text, text, text, jsonb, uuid, uuid, text, text, text, text, text) to service_role;

alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
revoke all on public.ledger_transactions, public.ledger_entries from anon, authenticated;
grant select on public.ledger_transactions, public.ledger_entries to authenticated;
drop policy if exists ledger_tx_finance_read on public.ledger_transactions;
create policy ledger_tx_finance_read on public.ledger_transactions for select to authenticated
  using (workspace_id is not null and (public.has_permission(workspace_id, 'finance.read') or public.has_permission(workspace_id, 'money.read')));
drop policy if exists ledger_entries_finance_read on public.ledger_entries;
create policy ledger_entries_finance_read on public.ledger_entries for select to authenticated
  using (exists (select 1 from public.ledger_transactions t where t.id = transaction_id
    and t.workspace_id is not null and (public.has_permission(t.workspace_id, 'finance.read') or public.has_permission(t.workspace_id, 'money.read'))));

-- ---------------------------------------------------------------- webhook event log (§109)
create table if not exists public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('stripe','email','calendar','messaging','caption_fox')),
  external_id text not null,
  event_type text not null,
  livemode boolean,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received','processing','processed','ignored','failed')),
  attempts integer not null default 0,
  error text,
  correlation_id text,
  unique (provider, external_id)
);
create index if not exists webhook_events_status_idx on public.webhook_events(status, received_at);
alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from anon, authenticated;

-- Claims a webhook for processing exactly once. Returns false for duplicates already processed/in flight.
create or replace function public.claim_webhook_event(p_provider text, p_external_id text, p_type text, p_livemode boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.webhook_events;
begin
  insert into public.webhook_events(provider, external_id, event_type, livemode, status, attempts)
    values (p_provider, p_external_id, p_type, p_livemode, 'processing', 1)
    on conflict (provider, external_id) do nothing
    returning * into r;
  if found then return true; end if;
  -- Retry only events whose previous attempt failed or stalled for 5+ minutes.
  update public.webhook_events set status = 'processing', attempts = attempts + 1, error = null
    where provider = p_provider and external_id = p_external_id
      and (status = 'failed' or (status = 'processing' and received_at < now() - interval '5 minutes'))
    returning * into r;
  return found;
end;
$$;
create or replace function public.finish_webhook_event(p_provider text, p_external_id text, p_status text, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.webhook_events set status = p_status, error = left(p_error, 1000), processed_at = case when p_status in ('processed','ignored') then now() end
  where provider = p_provider and external_id = p_external_id;
$$;
revoke all on function public.claim_webhook_event(text, text, text, boolean), public.finish_webhook_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(text, text, text, boolean), public.finish_webhook_event(text, text, text, text) to service_role;

commit;
