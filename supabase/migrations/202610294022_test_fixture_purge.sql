-- Q32 owner decision 2026-10-29 (lane D): an audited platform-admin command that purges TEST fixture workspaces.
-- Spec fixtures can't be removed by their own cleanup because contract_versions / contract_signatures are append-only.
--   • Eligibility is explicit and provable: the workspace is flagged `is_test_fixture` (set only by the service role — the test
--     helpers do so from now on) OR its owner is a disposable test identity (tests/phase1/helpers.ts:
--     p1-<label>-<8 hex>@gala-dock.test), AND every member (owner included) is a disposable test identity.
--   • Refused: anything else; any subject under a legal hold (Q32); live-mode Stripe objects (payment orders, invoice card
--     payments, payouts, disputes, subscriptions, billing customers, application fees); a connected account that is not a
--     placeholder (acct_test…); any ledger posting (the ledger is never purged).
--   • Only a platform admin with the `workspaces` permission, MFA (aal2) and a reason (admin_require). Dry run by default.
--   • Append-only bypass: trg_contracts_immutable lets the purge's DELETEs (and FK set-null updates) through only while `gala.fixture_purge` holds the id of a purge
--     record created in the current transaction (fixture_purge_active). No DISABLE TRIGGER, no session_replication_role.
--   • Audit: fixture_purges + fixture_purge_counts are append-only and never purged; an audit event is written as well.
--     Counts per table come from pg_stat_xact_user_tables (deletes and set-null updates, cascades included).
--   • Auth users are NOT deleted here: the result lists the test identities left without other memberships, and
--     scripts/testing/purge-test-fixtures.mjs removes them through the Auth admin API after a real purge.

alter table public.workspaces add column if not exists is_test_fixture boolean not null default false;

-- Clients can't mark (or unmark) a workspace as a fixture; only the service role can.
create or replace function public.workspaces_fixture_flag_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.is_test_fixture := false;
    else new.is_test_fixture := old.is_test_fixture; end if;
  end if;
  return new;
end $$;
drop trigger if exists workspaces_fixture_flag_guard on public.workspaces;
create trigger workspaces_fixture_flag_guard before insert or update of is_test_fixture on public.workspaces for each row execute function public.workspaces_fixture_flag_guard();

create or replace function public.is_test_identity_email(p_email text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_email, '') ~ '^p1-[a-z0-9-]+-[0-9a-f]{8}@gala-dock\.test$'
$$;

create table if not exists public.fixture_purges (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  reason text not null,
  workspace_ids uuid[] not null,
  dry_run boolean not null,
  users_to_remove uuid[] not null default '{}',
  created_txid bigint not null default txid_current(),
  created_at timestamptz not null default now()
);
create table if not exists public.fixture_purge_counts (
  purge_id uuid not null references public.fixture_purges(id) on delete restrict,
  table_name text not null,
  deleted bigint not null default 0,
  updated bigint not null default 0,
  primary key (purge_id, table_name)
);
alter table public.fixture_purges enable row level security;
alter table public.fixture_purge_counts enable row level security;
revoke all on public.fixture_purges, public.fixture_purge_counts from anon, authenticated;
grant select on public.fixture_purges, public.fixture_purge_counts to authenticated;
grant select, insert on public.fixture_purges, public.fixture_purge_counts to service_role;
drop policy if exists fixture_purges_read on public.fixture_purges;
create policy fixture_purges_read on public.fixture_purges for select to authenticated using (public.has_admin_permission('workspaces') or public.has_admin_permission('audit'));
drop policy if exists fixture_purge_counts_read on public.fixture_purge_counts;
create policy fixture_purge_counts_read on public.fixture_purge_counts for select to authenticated using (public.has_admin_permission('workspaces') or public.has_admin_permission('audit'));

create or replace function public.fixture_purges_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '%_append_only', tg_table_name using errcode = '55000';
end $$;
drop trigger if exists fixture_purges_append_only on public.fixture_purges;
create trigger fixture_purges_append_only before update or delete on public.fixture_purges for each row execute function public.fixture_purges_append_only();
drop trigger if exists fixture_purge_counts_append_only on public.fixture_purge_counts;
create trigger fixture_purge_counts_append_only before update or delete on public.fixture_purge_counts for each row execute function public.fixture_purges_append_only();

-- True only inside the purge transaction that created the matching record.
create or replace function public.fixture_purge_active() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v text := coalesce(current_setting('gala.fixture_purge', true), '');
begin
  if v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return exists (select 1 from public.fixture_purges p where p.id = v::uuid and p.created_txid = txid_current());
end $$;

create or replace function public.trg_contracts_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Q32 fixture purge: deletes (and the FK set-null updates their cascade causes) are allowed only inside an audited purge of
  -- test fixture workspaces.
  if public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if TG_TABLE_NAME = 'contracts' then
    if old.status = 'signed' then
      if coalesce(current_setting('gala.client_merge', true), '') = 'on' and (to_jsonb(new) - 'client_id' - 'updated_at') = (to_jsonb(old) - 'client_id' - 'updated_at') then return new; end if;
      raise exception 'contract_signed_immutable' using errcode = '22023';
    end if;
    new.updated_at := now();
    return new;
  end if;
  raise exception '%_append_only', TG_TABLE_NAME using errcode = '22023';
end $$;

-- Why a workspace can't be purged (empty = eligible).
create or replace function public.fixture_purge_refusals(p_ws uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  with w as (select * from public.workspaces where id = p_ws),
  people as (select w.owner_id uid from w union select m.user_id from public.workspace_members m where m.workspace_id = p_ws and m.status = 'active')
  select array_remove(array[
    case when not exists (select 1 from w) then 'not_found' end,
    case when exists (select 1 from w) and not ((select is_test_fixture from w) or public.is_test_identity_email((select u.email from auth.users u join w on u.id = w.owner_id)))
      then 'not_test_fixture' end,
    case when exists (select 1 from people p left join auth.users u on u.id = p.uid where not public.is_test_identity_email(u.email)) then 'non_test_member' end,
    case when public.legal_hold_covers('workspace', p_ws) or exists (select 1 from people p where public.legal_hold_covers_user(p.uid))
      or exists (select 1 from public.events e where e.workspace_id = p_ws and public.legal_hold_covers('event', e.id)) then 'legal_hold' end,
    case when exists (select 1 from public.ledger_transactions t where t.workspace_id = p_ws)
      or exists (select 1 from public.ledger_transactions t join public.events e on e.id = t.event_id where e.workspace_id = p_ws) then 'ledger_postings' end,
    case when exists (select 1 from public.payment_orders x where x.livemode and (x.payee_workspace_id = p_ws or x.event_id in (select id from public.events where workspace_id = p_ws)))
      or exists (select 1 from public.invoice_card_payments x where x.livemode and x.workspace_id = p_ws)
      or exists (select 1 from public.connected_payouts x where x.livemode and x.workspace_id = p_ws)
      or exists (select 1 from public.stripe_disputes x where x.livemode and x.event_id in (select id from public.events where workspace_id = p_ws))
      or exists (select 1 from public.workspace_subscriptions x where x.livemode and x.workspace_id = p_ws)
      or exists (select 1 from public.billing_customers x where x.livemode and x.workspace_id = p_ws)
      then 'live_mode_stripe' end,
    case when exists (select 1 from public.connect_accounts c where c.workspace_id = p_ws and c.stripe_account_id !~ '^acct_test') then 'connected_account' end
  ], null)
$$;

create or replace function public.admin_purge_test_workspaces(p_workspaces uuid[], p_reason text, p_dry_run boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid; w uuid; bad jsonb := '{}'; refs text[]; before jsonb; counts jsonb := '{}'; users uuid[]; err text; k text;
begin
  perform public.admin_require('workspaces', p_reason);
  if p_workspaces is null or cardinality(p_workspaces) = 0 or cardinality(p_workspaces) > 50 then raise exception 'invalid_workspaces' using errcode = '22023'; end if;
  perform 1 from public.workspaces where id = any(p_workspaces) for update;
  foreach w in array p_workspaces loop
    refs := public.fixture_purge_refusals(w);
    if cardinality(refs) > 0 then bad := bad || jsonb_build_object(w::text, to_jsonb(refs)); end if;
  end loop;
  if bad <> '{}' then raise exception 'purge_refused: %', bad::text using errcode = '42501'; end if;
  -- Test identities that lose their last membership / ownership (the script removes them through the Auth admin API).
  users := array(select distinct p.uid from (select owner_id uid from public.workspaces where id = any(p_workspaces)
      union select user_id from public.workspace_members where workspace_id = any(p_workspaces)) p
    join auth.users u on u.id = p.uid
    where public.is_test_identity_email(u.email)
      and not exists (select 1 from public.workspaces o where o.owner_id = p.uid and not (o.id = any(p_workspaces)))
      and not exists (select 1 from public.workspace_members m where m.user_id = p.uid and not (m.workspace_id = any(p_workspaces)))
      and not exists (select 1 from public.platform_admins a where a.user_id = p.uid));
  insert into public.fixture_purges(actor_id, reason, workspace_ids, dry_run, users_to_remove) values (auth.uid(), left(trim(p_reason), 500), p_workspaces, p_dry_run, users)
    returning id into pid;
  perform set_config('gala.fixture_purge', pid::text, true);
  select coalesce(jsonb_object_agg(relname, jsonb_build_array(n_tup_del, n_tup_upd)), '{}') into before from pg_stat_xact_user_tables where schemaname = 'public';
  begin
    -- FK-safe order: RESTRICT children of the workspace first, then events (RESTRICT; their own children cascade), then workspaces.
    delete from public.booking_cancellations where workspace_id = any(p_workspaces);
    delete from public.booking_disputes where workspace_id = any(p_workspaces);
    delete from public.transactions where workspace_id = any(p_workspaces);
    delete from public.invoices where workspace_id = any(p_workspaces);
    delete from public.events where workspace_id = any(p_workspaces);
    delete from public.workspaces where id = any(p_workspaces);
    select coalesce(jsonb_object_agg(s.relname, jsonb_build_object('deleted', s.n_tup_del - coalesce((before->s.relname->>0)::bigint, 0), 'updated', s.n_tup_upd - coalesce((before->s.relname->>1)::bigint, 0))), '{}')
      into counts from pg_stat_xact_user_tables s where s.schemaname = 'public'
        and (s.n_tup_del <> coalesce((before->s.relname->>0)::bigint, 0) or s.n_tup_upd <> coalesce((before->s.relname->>1)::bigint, 0));
    if p_dry_run then raise exception 'gd_fixture_dry_run'; end if;
  exception when others then
    if sqlerrm <> 'gd_fixture_dry_run' then
      err := sqlerrm;
      perform set_config('gala.fixture_purge', '', true);
      raise exception 'purge_blocked: %', err using errcode = '55000';
    end if;
  end;
  perform set_config('gala.fixture_purge', '', true);
  -- The purge's own bookkeeping rows are not part of the counts.
  counts := counts - 'fixture_purges' - 'fixture_purge_counts';
  for k in select jsonb_object_keys(counts) loop
    insert into public.fixture_purge_counts(purge_id, table_name, deleted, updated) values (pid, k, (counts->k->>'deleted')::bigint, (counts->k->>'updated')::bigint);
  end loop;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', case when p_dry_run then 'admin.test_fixture_purge_previewed' else 'admin.test_fixtures_purged' end,
    jsonb_build_object('purge_id', pid, 'workspaces', to_jsonb(p_workspaces), 'tables', (select count(*) from jsonb_object_keys(counts)), 'users_to_remove', cardinality(users), 'reason', left(p_reason, 300)));
  return jsonb_build_object('purge_id', pid, 'dry_run', p_dry_run, 'workspaces', to_jsonb(p_workspaces), 'tables', counts, 'users_to_remove', to_jsonb(users));
end $$;

revoke all on function public.workspaces_fixture_flag_guard(), public.is_test_identity_email(text), public.fixture_purges_append_only(), public.fixture_purge_active(),
  public.fixture_purge_refusals(uuid), public.admin_purge_test_workspaces(uuid[], text, boolean) from public, anon, authenticated;
grant execute on function public.fixture_purge_refusals(uuid), public.fixture_purge_active() to service_role;
grant execute on function public.admin_purge_test_workspaces(uuid[], text, boolean) to authenticated, service_role;
