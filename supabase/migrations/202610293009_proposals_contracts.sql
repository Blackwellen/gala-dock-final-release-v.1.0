-- Q16 (lane C, 2026-10-29) 2/2 — proposal packages + acceptance totals, structured conversion, canonical contracts (domains 55–56).
-- Additive and backward-compatible with the deployed code:
--   * accept_proposal gains an optional p_package (DEFAULT NULL), so the deployed 4-argument call keeps resolving. When the
--     issued snapshot carries content.packages (Bronze/Silver/Gold structured options) the client must choose one; the
--     accepted subtotal/tax/total are computed server-side from the immutable snapshot and stored (accepted_total, acceptance).
--   * convert_proposal_to_event(): ONE transaction, row-locked and idempotent (a second/concurrent call returns the same event).
--     Reuses the lead's event when there is one; otherwise creates the event skeleton linked to the canonical client
--     (client_id), the lead, and budget lines from the accepted snapshot. Lead → won. No client/event data is copied twice.
--   * contracts / contract_versions / contract_parties / contract_signatures / contract_approvals / contract_templates:
--     status machine draft → sent → signed | declined | expired | void (enforced trigger); versions and signatures are
--     append-only; a signed contract is immutable (renewal creates a new linked contract).
--   * Signature provider boundary: no external e-signature provider is configured (BLOCKED_EXTERNAL). The internal method is
--     "typed full name + email + version + document SHA-256 + time + hashed IP/user agent", append-only and audited. Client
--     signing by token goes through SERVICE-ONLY functions called from the server (no anonymous database function).

-- ═══ 1. Proposals: acceptance with packages ═══
alter table public.proposals add column if not exists accepted_total numeric(12,2);
alter table public.proposals add column if not exists converted_at timestamptz;

drop function if exists public.accept_proposal(text, text, text, integer);
create or replace function public.accept_proposal(p_token text, p_name text, p_email text, p_version integer, p_package text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.proposals; snap jsonb; pkgs jsonb; pk jsonb; rate numeric; sub numeric; tax numeric; tot numeric;
begin
  if p_token !~ '^[0-9a-f]{36}$' or length(coalesce(p_name,'')) < 2 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into p from public.proposals where share_token = p_token for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if p.status = 'accepted' or p.status = 'converted' then return 'already_accepted'; end if;
  if p.status not in ('sent','viewed') then raise exception 'not_open' using errcode='22023'; end if;
  if p.version <> p_version then raise exception 'version_changed' using errcode='22023'; end if;
  if p.valid_until is not null and p.valid_until < current_date then update public.proposals set status='expired' where id=p.id; return 'expired'; end if;
  select v.snapshot into snap from public.proposal_versions v where v.proposal_id = p.id and v.version = p.version;
  snap := coalesce(snap, to_jsonb(p));
  pkgs := coalesce(snap #> '{content,packages}', '[]'::jsonb);
  rate := coalesce(nullif(snap #>> '{content,tax_rate}', '')::numeric, 20);
  sub := coalesce((snap ->> 'subtotal')::numeric, p.subtotal);
  if jsonb_typeof(pkgs) = 'array' and jsonb_array_length(pkgs) > 0 then
    if p_package is null then raise exception 'package_required' using errcode='22023'; end if;
    select x into pk from jsonb_array_elements(pkgs) x where x ->> 'key' = p_package limit 1;
    if pk is null then raise exception 'invalid_package' using errcode='22023'; end if;
    sub := sub + greatest(coalesce((pk ->> 'price')::numeric, 0), 0);
    tax := round(sub * rate) / 100; tot := round(sub + tax, 2);
  else
    tax := coalesce((snap ->> 'tax')::numeric, p.tax); tot := coalesce((snap ->> 'total')::numeric, p.total);
  end if;
  update public.proposals set status='accepted', signature_status='signed', accepted_at=now(), accepted_total = tot,
    acceptance = jsonb_build_object('name', left(p_name,120), 'email', lower(left(p_email,200)), 'version', p.version, 'at', now(),
      'package', case when pk is null then null else jsonb_build_object('key', pk ->> 'key', 'name', pk ->> 'name', 'price', (pk ->> 'price')::numeric) end,
      'subtotal', sub, 'tax', tax, 'total', tot)
  where id = p.id;
  insert into public.audit_events(workspace_id, event, metadata) values (p.workspace_id, 'proposal.accepted',
    jsonb_build_object('proposal_id', p.id, 'client_id', p.client_id, 'version', p.version, 'email', lower(p_email), 'package', pk ->> 'key', 'total', tot));
  return 'accepted';
end; $$;
revoke all on function public.accept_proposal(text, text, text, integer, text) from public;
grant execute on function public.accept_proposal(text, text, text, integer, text) to anon, authenticated;

-- ═══ 2. Structured conversion: accepted proposal → event skeleton (55.10) ═══
create or replace function public.proposal_budget_lines(snap jsonb, pkg jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select left(k, 40) k, round(sum(v), 2) v from (
      select x ->> 0 as k, coalesce((x ->> 2)::numeric, 0) * coalesce((x ->> 3)::numeric, 0) as v
        from jsonb_array_elements(case when jsonb_typeof(snap #> '{content,line_items}') = 'array' then snap #> '{content,line_items}' else '[]'::jsonb end) x
      union all
      select o ->> 0, coalesce((o ->> 2)::numeric, 0)
        from jsonb_array_elements(case when jsonb_typeof(snap #> '{content,options}') = 'array' then snap #> '{content,options}' else '[]'::jsonb end) o
        where (o ->> 3)::boolean
      union all
      select coalesce(pkg ->> 'name', 'Package'), coalesce((pkg ->> 'price')::numeric, 0) where pkg is not null and pkg <> 'null'::jsonb
    ) a where coalesce(k, '') <> '' group by left(k, 40)) b;
$$;

create or replace function public.convert_proposal_to_event(p_proposal uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare p public.proposals; l public.leads; snap jsonb; c jsonb; ev uuid; created boolean := false; et text; typ text; d date; guests int;
  lines jsonb; sub numeric; tot numeric;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if not found or not public.is_workspace_member(p.workspace_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p.status = 'converted' and p.event_id is not null then
    return jsonb_build_object('event_id', p.event_id, 'created', false, 'already_converted', true);
  end if;
  if p.status <> 'accepted' then raise exception 'not_accepted' using errcode = '22023'; end if;
  select v.snapshot into snap from public.proposal_versions v where v.proposal_id = p.id and v.version = p.version;
  snap := coalesce(snap, to_jsonb(p)); c := coalesce(snap -> 'content', '{}');
  sub := coalesce(nullif(p.acceptance ->> 'subtotal', '')::numeric, (snap ->> 'subtotal')::numeric, p.subtotal);
  tot := coalesce(p.accepted_total, nullif(p.acceptance ->> 'total', '')::numeric, p.total);
  lines := public.proposal_budget_lines(snap, p.acceptance -> 'package');
  ev := p.event_id;
  if p.lead_id is not null then
    select * into l from public.leads where id = p.lead_id for update;
    if ev is null then ev := l.event_id; end if;
  end if;
  if ev is not null then
    if not exists (select 1 from public.events e where e.id = ev and e.workspace_id = p.workspace_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
    -- Existing event: link the client and record the contract value; never overwrite the organiser's own budget lines.
    update public.events e set client_id = coalesce(e.client_id, p.client_id), lead_id = coalesce(e.lead_id, p.lead_id),
      settings = e.settings || jsonb_build_object('from_proposal', p.number, 'proposal_id', p.id, 'proposal_version', p.version, 'client_contract_value', tot)
        || case when e.settings ? 'budget_lines' then '{}'::jsonb else jsonb_build_object('budget_lines', lines) end,
      revenue_goal = coalesce(e.revenue_goal, tot), updated_at = now()
      where e.id = ev;
  else
    et := lower(coalesce(c ->> 'event_type', ''));
    typ := case when et like '%festival%' then 'festival' when et like '%wedding%' then 'wedding' when et like '%conference%' then 'conference'
                when et like '%corporate%' then 'corporate' when et like '%birthday%' then 'birthday' when et like '%gala%' then 'gala'
                when et like '%concert%' then 'concert' when et like '%webinar%' then 'webinar' when et like '%charity%' then 'charity' else 'custom' end;
    d := case when coalesce(c ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}' then left(c ->> 'date', 10)::date end;
    guests := case when coalesce(c ->> 'attendance', '') ~ '^\s*\d{1,6}\s*$' then btrim(c ->> 'attendance')::int else 0 end;
    insert into public.events(owner_id, workspace_id, management, name, event_type, status, visibility, client_id, client_name, venue_name, location,
        starts_at, flexible_dates, guest_count, description, revenue_goal, budget_total, lead_id, settings)
      values (auth.uid(), p.workspace_id, 'professional', left(p.title, 120), typ, 'planning', 'private', p.client_id, p.client_name,
        left(coalesce(c ->> 'venue', ''), 200), left(coalesce(c ->> 'location', ''), 200),
        case when d is not null then (d + time '18:00') at time zone 'Europe/London' end, coalesce((c ->> 'flexible')::boolean, false), guests,
        left(coalesce(c ->> 'summary', ''), 2000), tot, sub, p.lead_id,
        jsonb_build_object('from_proposal', p.number, 'proposal_id', p.id, 'proposal_version', p.version, 'budget_lines', lines, 'client_contract_value', tot))
      returning id into ev;
    created := true;
  end if;
  if p.lead_id is not null and (l.event_id is null or l.event_id = ev) then
    update public.leads set stage = 'won', probability = 100, event_id = ev where id = p.lead_id;
    insert into public.lead_activities(lead_id, kind, title, actor_id) values (p.lead_id, 'stage', 'Won — proposal ' || p.number || ' converted', auth.uid());
  end if;
  update public.proposals set status = 'converted', event_id = ev, converted_at = now() where id = p.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p.workspace_id, 'proposal.converted',
    jsonb_build_object('proposal_id', p.id, 'event_id', ev, 'client_id', p.client_id, 'lead_id', p.lead_id, 'created', created, 'total', tot));
  return jsonb_build_object('event_id', ev, 'created', created, 'already_converted', false);
end $$;

-- ═══ 3. Contracts ═══
create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  body text not null default '' check (length(body) <= 100000),
  variables text[] not null default '{}',
  version integer not null default 1,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contract_templates_ws_idx on public.contract_templates(workspace_id, status);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  number text not null,
  title text not null check (length(btrim(title)) between 2 and 160),
  client_id uuid references public.clients(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  template_id uuid references public.contract_templates(id) on delete set null,
  renewal_of uuid references public.contracts(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','signed','declined','expired','void')),
  current_version integer not null default 0,
  sent_version integer,
  value numeric(12,2) not null default 0 check (value >= 0),
  currency text not null default 'GBP',
  expires_at date,
  term_ends_at date,
  signature_method text not null default 'typed_name' check (signature_method in ('typed_name','provider')),
  provider text,
  provider_envelope_id text,
  share_token text unique,
  sent_at timestamptz, signed_at timestamptz, declined_at timestamptz, voided_at timestamptz,
  status_reason text not null default '' check (length(status_reason) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, number)
);
create index if not exists contracts_ws_status_idx on public.contracts(workspace_id, status, created_at desc);
create index if not exists contracts_client_idx on public.contracts(client_id) where client_id is not null;
create index if not exists contracts_expiry_idx on public.contracts(expires_at) where status = 'sent';

create table if not exists public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  version integer not null check (version >= 1),
  body text not null check (length(body) between 1 and 100000),
  variables jsonb not null default '{}',
  document_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (contract_id, version)
);

create table if not exists public.contract_parties (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  role text not null check (role in ('organizer','client','other')),
  name text not null check (length(btrim(name)) between 2 and 120),
  email text not null default '' check (email = lower(email) and length(email) <= 200),
  organisation text not null default '' check (length(organisation) <= 160),
  signs boolean not null default true,
  signing_order integer not null default 1,
  status text not null default 'pending' check (status in ('pending','signed','declined')),
  signed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists contract_parties_contract_idx on public.contract_parties(contract_id);

create table if not exists public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  party_id uuid not null references public.contract_parties(id) on delete cascade,
  version integer not null,
  method text not null check (method in ('typed_name','provider')),
  typed_name text not null default '',
  email text not null default '',
  document_hash text not null,
  user_id uuid references auth.users(id) on delete set null,
  ip_hash text, user_agent text,
  provider text, provider_ref text,
  signed_at timestamptz not null default now(),
  unique (party_id, version)
);
create table if not exists public.contract_approvals (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  version integer not null,
  requested_by uuid references auth.users(id) on delete set null,
  reason text not null default '' check (length(reason) <= 500),
  impact jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text not null default '' check (length(decision_note) <= 500),
  expires_at timestamptz not null default (now() + interval '14 days'),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists contract_approvals_one_pending on public.contract_approvals(contract_id) where status = 'pending';

-- State machine (mirrors src/lib/domain/state-machines.ts → contract). Seeded here; the generated seed file needs regenerating later.
insert into public.state_machines(machine, table_name, column_name, mode, initial_states, terminal_states)
  values ('contract', 'contracts', 'status', 'enforce', array['draft'], array['signed','void'])
  on conflict (machine) do update set table_name = excluded.table_name, column_name = excluded.column_name, mode = excluded.mode,
    initial_states = excluded.initial_states, terminal_states = excluded.terminal_states;
delete from public.state_transitions where machine = 'contract';
insert into public.state_transitions(machine, from_state, to_state) values
  ('contract','draft','sent'), ('contract','draft','void'),
  ('contract','sent','signed'), ('contract','sent','declined'), ('contract','sent','expired'), ('contract','sent','void'), ('contract','sent','draft'),
  ('contract','declined','draft'), ('contract','declined','void'), ('contract','expired','draft'), ('contract','expired','void');
drop trigger if exists contracts_state_guard on public.contracts;
create trigger contracts_state_guard before insert or update of status on public.contracts
  for each row execute function public.enforce_state_transition('contract', 'status');

-- Signed contracts are immutable (client re-pointing by merge_clients is the only exception); versions/signatures append-only.
create or replace function public.trg_contracts_immutable() returns trigger language plpgsql security definer set search_path = '' as $$
begin
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
drop trigger if exists contracts_immutable on public.contracts;
create trigger contracts_immutable before update on public.contracts for each row execute function public.trg_contracts_immutable();
drop trigger if exists contract_versions_append_only on public.contract_versions;
create trigger contract_versions_append_only before update or delete on public.contract_versions for each row execute function public.trg_contracts_immutable();
drop trigger if exists contract_signatures_append_only on public.contract_signatures;
create trigger contract_signatures_append_only before update or delete on public.contract_signatures for each row execute function public.trg_contracts_immutable();

alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_versions enable row level security;
alter table public.contract_parties enable row level security;
alter table public.contract_signatures enable row level security;
alter table public.contract_approvals enable row level security;
drop policy if exists contract_templates_read on public.contract_templates;
drop policy if exists contract_templates_write on public.contract_templates;
drop policy if exists contract_templates_delete on public.contract_templates;
create policy contract_templates_read on public.contract_templates for select to authenticated using (public.is_workspace_member(workspace_id));
create policy contract_templates_write on public.contract_templates for insert to authenticated with check (public.is_workspace_member(workspace_id));
drop policy if exists contract_templates_update on public.contract_templates;
create policy contract_templates_update on public.contract_templates for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy contract_templates_delete on public.contract_templates for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner','manager']));
drop policy if exists contracts_read on public.contracts;
create policy contracts_read on public.contracts for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists contract_versions_read on public.contract_versions;
create policy contract_versions_read on public.contract_versions for select to authenticated using (exists (select 1 from public.contracts c where c.id = contract_id and public.is_workspace_member(c.workspace_id)));
drop policy if exists contract_parties_read on public.contract_parties;
create policy contract_parties_read on public.contract_parties for select to authenticated using (exists (select 1 from public.contracts c where c.id = contract_id and public.is_workspace_member(c.workspace_id)));
drop policy if exists contract_signatures_read on public.contract_signatures;
create policy contract_signatures_read on public.contract_signatures for select to authenticated using (exists (select 1 from public.contracts c where c.id = contract_id and public.is_workspace_member(c.workspace_id)));
drop policy if exists contract_approvals_read on public.contract_approvals;
create policy contract_approvals_read on public.contract_approvals for select to authenticated using (exists (select 1 from public.contracts c where c.id = contract_id and public.is_workspace_member(c.workspace_id)));
revoke all on table public.contract_templates, public.contracts, public.contract_versions, public.contract_parties, public.contract_signatures, public.contract_approvals from public, anon, authenticated;
grant select, insert, update, delete on table public.contract_templates to authenticated;
grant select on table public.contracts, public.contract_versions, public.contract_parties, public.contract_signatures, public.contract_approvals to authenticated;
grant all on table public.contract_templates, public.contracts, public.contract_versions, public.contract_parties, public.contract_signatures, public.contract_approvals to service_role;

-- {{variable}} substitution (56.4); unknown variables are left visible so a reviewer sees them before sending.
create or replace function public.contract_render(p_body text, p_vars jsonb) returns text language plpgsql immutable set search_path = '' as $$
declare k text; v text; out text := coalesce(p_body, '');
begin
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    out := replace(out, '{{' || k || '}}', left(coalesce(v, ''), 2000));
  end loop;
  return out;
end $$;

create or replace function public.contract_hash(p_body text) returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(coalesce(p_body, ''), 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.contract_require(p_contract uuid, p_roles text[] default null) returns public.contracts
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract for update;
  if not found or not public.is_workspace_member(c.workspace_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_roles is not null and not public.has_workspace_role(c.workspace_id, p_roles) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return c;
end $$;

-- Replace the party list of a draft (56.3).
create or replace function public.contract_set_parties(p_contract uuid, p_parties jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts; x jsonb; n integer := 0;
begin
  c := public.contract_require(p_contract);
  if c.status <> 'draft' then raise exception 'contract_not_draft' using errcode = '22023'; end if;
  if jsonb_typeof(p_parties) <> 'array' or jsonb_array_length(p_parties) > 10 then raise exception 'invalid_parties' using errcode = '22023'; end if;
  delete from public.contract_parties where contract_id = c.id;
  for x in select * from jsonb_array_elements(p_parties) loop
    if coalesce(x ->> 'role', '') not in ('organizer','client','other') or length(btrim(coalesce(x ->> 'name', ''))) < 2 then raise exception 'invalid_parties' using errcode = '22023'; end if;
    if x ->> 'role' = 'client' and lower(btrim(coalesce(x ->> 'email', ''))) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'client_email_required' using errcode = '22023'; end if;
    insert into public.contract_parties(contract_id, role, name, email, organisation, signs, signing_order)
      values (c.id, x ->> 'role', left(btrim(x ->> 'name'), 120), lower(left(btrim(coalesce(x ->> 'email', '')), 200)), left(coalesce(x ->> 'organisation', ''), 160),
        coalesce((x ->> 'signs')::boolean, true), coalesce((x ->> 'signing_order')::int, 1));
    n := n + 1;
  end loop;
  return n;
end $$;

-- New immutable version of a draft's text (56.2). The draft points at its latest version.
create or replace function public.contract_save_version(p_contract uuid, p_body text, p_variables jsonb default '{}') returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts; v integer; body text;
begin
  c := public.contract_require(p_contract);
  if c.status <> 'draft' then raise exception 'contract_not_draft' using errcode = '22023'; end if;
  body := public.contract_render(p_body, p_variables);
  if length(btrim(body)) < 1 then raise exception 'empty_contract' using errcode = '22023'; end if;
  v := c.current_version + 1;
  insert into public.contract_versions(contract_id, version, body, variables, document_hash, created_by)
    values (c.id, v, body, coalesce(p_variables, '{}'), public.contract_hash(body), auth.uid());
  update public.contracts set current_version = v where id = c.id;
  return v;
end $$;

-- Create a contract (from a template, a proposal, or blank). Client/event come from the proposal when given (no copies).
create or replace function public.contract_create(p_ws uuid, p jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare cid uuid; n integer; num text; pr public.proposals; tpl public.contract_templates; client uuid := nullif(p ->> 'client_id', '')::uuid;
  ev uuid := nullif(p ->> 'event_id', '')::uuid; body text := coalesce(p ->> 'body', ''); vars jsonb := coalesce(p -> 'variables', '{}'); val numeric := coalesce(nullif(p ->> 'value', '')::numeric, 0);
begin
  if not public.is_workspace_member(p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if nullif(p ->> 'proposal_id', '') is not null then
    select * into pr from public.proposals where id = (p ->> 'proposal_id')::uuid and workspace_id = p_ws;
    if not found then raise exception 'proposal_not_found' using errcode = 'P0002'; end if;
    client := coalesce(client, pr.client_id); ev := coalesce(ev, pr.event_id); if val = 0 then val := coalesce(pr.accepted_total, pr.total, 0); end if;
  end if;
  if client is not null and not exists (select 1 from public.clients x where x.id = client and x.workspace_id = p_ws) then raise exception 'client_not_in_workspace' using errcode = '42501'; end if;
  if ev is not null and not exists (select 1 from public.events x where x.id = ev and x.workspace_id = p_ws) then raise exception 'event_not_in_workspace' using errcode = '42501'; end if;
  if nullif(p ->> 'template_id', '') is not null then
    select * into tpl from public.contract_templates where id = (p ->> 'template_id')::uuid and workspace_id = p_ws and status = 'active';
    if not found then raise exception 'template_not_found' using errcode = 'P0002'; end if;
    if btrim(body) = '' then body := tpl.body; end if;
  end if;
  vars := jsonb_build_object('client_name', coalesce((select name from public.clients where id = client), ''), 'event_name', coalesce((select name from public.events where id = ev), ''),
    'workspace_name', (select name from public.workspaces where id = p_ws), 'contract_value', to_char(val, 'FM999,999,990.00')) || vars;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contract_number:' || p_ws::text, 0));
  select coalesce(max((regexp_match(number, '^CT-' || to_char(now(), 'YYYY') || '-([0-9]+)$'))[1]::int), 0) + 1 into n from public.contracts where workspace_id = p_ws;
  num := 'CT-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 3, '0');
  insert into public.contracts(workspace_id, number, title, client_id, proposal_id, event_id, template_id, value, currency, expires_at, term_ends_at, created_by)
    values (p_ws, num, left(btrim(coalesce(p ->> 'title', '')), 160), client, pr.id, ev, tpl.id, val, coalesce(nullif(p ->> 'currency', ''), 'GBP'),
      nullif(p ->> 'expires_at', '')::date, nullif(p ->> 'term_ends_at', '')::date, auth.uid())
    returning id into cid;
  if btrim(body) <> '' then perform public.contract_save_version(cid, body, vars); end if;
  if jsonb_typeof(p -> 'parties') = 'array' then perform public.contract_set_parties(cid, p -> 'parties'); end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'contract.created',
    jsonb_build_object('contract_id', cid, 'client_id', client, 'proposal_id', pr.id, 'event_id', ev));
  return cid;
end $$;

-- Approval (56.5): owner, manager or finance decide; a requester cannot approve their own request unless they own the workspace.
create or replace function public.contract_request_approval(p_contract uuid, p_reason text default '') returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts; aid uuid;
begin
  c := public.contract_require(p_contract);
  if c.status <> 'draft' or c.current_version < 1 then raise exception 'contract_not_ready' using errcode = '22023'; end if;
  insert into public.contract_approvals(contract_id, version, requested_by, reason, impact)
    values (c.id, c.current_version, auth.uid(), left(coalesce(p_reason, ''), 500), jsonb_build_object('value', c.value, 'currency', c.currency))
    returning id into aid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), c.workspace_id, 'contract.approval_requested', jsonb_build_object('contract_id', c.id, 'approval_id', aid));
  perform public.trust_notify_workspace(c.workspace_id, 'contract_approval', 'Contract approval requested: ' || c.title, left(coalesce(p_reason, ''), 300), '/organizer/sales/contracts/' || c.id, 'contract.approval:' || aid);
  return aid;
end $$;
create or replace function public.contract_decide_approval(p_approval uuid, p_approve boolean, p_note text default '') returns text
language plpgsql volatile security definer set search_path = '' as $$
declare a public.contract_approvals; c public.contracts; st text;
begin
  select * into a from public.contract_approvals where id = p_approval for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  c := public.contract_require(a.contract_id, array['owner','manager','finance']);
  if a.status <> 'pending' then raise exception 'already_decided' using errcode = '22023'; end if;
  if a.expires_at < now() then update public.contract_approvals set status = 'cancelled', decided_at = now(), decision_note = 'expired' where id = a.id; raise exception 'approval_expired' using errcode = '22023'; end if;
  if a.requested_by = auth.uid() and not public.is_workspace_owner(c.workspace_id) then raise exception 'cannot_self_approve' using errcode = '42501'; end if;
  st := case when p_approve then 'approved' else 'rejected' end;
  update public.contract_approvals set status = st, decided_by = auth.uid(), decided_at = now(), decision_note = left(coalesce(p_note, ''), 500) where id = a.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), c.workspace_id, 'contract.approval_decided', jsonb_build_object('contract_id', c.id, 'approval_id', a.id, 'decision', st));
  if a.requested_by is not null then perform public.notify(a.requested_by, 'contract_approval', 'Contract ' || st || ': ' || c.title, left(coalesce(p_note, ''), 300), '/organizer/sales/contracts/' || c.id, 'contract.approval_decided:' || a.id); end if;
  return st;
end $$;

-- Send (draft → sent): needs text, a client signer and — when the workspace requires it — an approval of this exact version.
create or replace function public.contract_send(p_contract uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts; s jsonb; needs boolean; tok text;
begin
  c := public.contract_require(p_contract);
  if c.status <> 'draft' then raise exception 'contract_not_draft' using errcode = '22023'; end if;
  if c.current_version < 1 then raise exception 'empty_contract' using errcode = '22023'; end if;
  if not exists (select 1 from public.contract_parties x where x.contract_id = c.id and x.role = 'client' and x.signs and x.email <> '') then raise exception 'client_signer_required' using errcode = '22023'; end if;
  select settings into s from public.workspaces where id = c.workspace_id;
  needs := coalesce((s #>> '{contracts,require_approval}')::boolean, false)
        or (nullif(s #>> '{contracts,approval_threshold}', '') is not null and c.value >= (s #>> '{contracts,approval_threshold}')::numeric);
  if needs and not exists (select 1 from public.contract_approvals a where a.contract_id = c.id and a.version = c.current_version and a.status = 'approved') then
    raise exception 'approval_required' using errcode = '22023';
  end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  update public.contract_parties set status = 'pending', signed_at = null where contract_id = c.id;
  update public.contracts set status = 'sent', sent_version = c.current_version, sent_at = now(), share_token = tok, status_reason = '' where id = c.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), c.workspace_id, 'contract.sent', jsonb_build_object('contract_id', c.id, 'client_id', c.client_id, 'version', c.current_version));
  return jsonb_build_object('status', 'sent', 'version', c.current_version, 'share_token', tok);
end $$;

-- Shared signing core: append-only signature row; all signers signed → contract signed.
create or replace function public.contract_record_signature(c public.contracts, p_party uuid, p_method text, p_name text, p_email text, p_user uuid,
  p_ip_hash text, p_user_agent text, p_provider text default null, p_provider_ref text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v public.contract_versions; remaining integer;
begin
  select * into v from public.contract_versions where contract_id = c.id and version = c.sent_version;
  insert into public.contract_signatures(contract_id, party_id, version, method, typed_name, email, document_hash, user_id, ip_hash, user_agent, provider, provider_ref)
    values (c.id, p_party, c.sent_version, p_method, left(btrim(coalesce(p_name, '')), 120), lower(left(coalesce(p_email, ''), 200)), v.document_hash, p_user,
      left(p_ip_hash, 128), left(p_user_agent, 300), p_provider, p_provider_ref)
    on conflict (party_id, version) do nothing;
  update public.contract_parties set status = 'signed', signed_at = coalesce(signed_at, now()) where id = p_party;
  select count(*) into remaining from public.contract_parties where contract_id = c.id and signs and status <> 'signed';
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (p_user, c.workspace_id, 'contract.party_signed',
    jsonb_build_object('contract_id', c.id, 'party_id', p_party, 'version', c.sent_version, 'method', p_method, 'document_hash', v.document_hash));
  if remaining = 0 then
    update public.contracts set status = 'signed', signed_at = now() where id = c.id;
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (p_user, c.workspace_id, 'contract.signed',
      jsonb_build_object('contract_id', c.id, 'client_id', c.client_id, 'version', c.sent_version, 'document_hash', v.document_hash));
    perform public.trust_notify_workspace(c.workspace_id, 'contract_signed', 'Contract signed: ' || c.title, 'All parties have signed version ' || c.sent_version || '.', '/organizer/sales/contracts/' || c.id, 'contract.signed:' || c.id);
    return 'signed';
  end if;
  return 'partially_signed';
end $$;

-- Organiser-side signatory (owner/manager) signs with typed name.
create or replace function public.contract_sign_internal(p_contract uuid, p_party uuid, p_typed_name text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts; pt public.contract_parties; em text;
begin
  c := public.contract_require(p_contract, array['owner','manager']);
  if c.status <> 'sent' then raise exception 'contract_not_open' using errcode = '22023'; end if;
  select * into pt from public.contract_parties where id = p_party and contract_id = c.id for update;
  if not found or pt.role <> 'organizer' then raise exception 'not_your_party' using errcode = '42501'; end if;
  if pt.status = 'signed' then return 'already_signed'; end if;
  if length(btrim(coalesce(p_typed_name, ''))) < 2 then raise exception 'typed_name_required' using errcode = '22023'; end if;
  select lower(email) into em from auth.users where id = auth.uid();
  return public.contract_record_signature(c, pt.id, 'typed_name', p_typed_name, em, auth.uid(), null, null);
end $$;

-- Public projection by token (service-only: the /contract/[token] server page calls it, never the browser).
create or replace function public.contract_by_token(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('number', c.number, 'title', c.title, 'status', c.status, 'version', c.sent_version, 'expires_at', c.expires_at, 'value', c.value, 'currency', c.currency,
    'workspace', w.name, 'body', v.body, 'document_hash', v.document_hash, 'signed_at', c.signed_at,
    'parties', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'role', x.role, 'name', x.name, 'organisation', x.organisation, 'signs', x.signs, 'status', x.status, 'signed_at', x.signed_at) order by x.signing_order, x.created_at)
                         from public.contract_parties x where x.contract_id = c.id), '[]'))
  from public.contracts c join public.workspaces w on w.id = c.workspace_id
  left join public.contract_versions v on v.contract_id = c.id and v.version = c.sent_version
  where p_token ~ '^[0-9a-f]{48}$' and c.share_token = p_token and c.status in ('sent','signed','declined','expired');
$$;

-- Client signs (or declines) by token: email must match a pending client signer; version must be the sent one.
create or replace function public.contract_sign_by_token(p_token text, p_name text, p_email text, p_version integer, p_accept boolean,
  p_ip_hash text default null, p_user_agent text default null, p_reason text default '') returns text
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts; pt public.contract_parties; em text := lower(btrim(coalesce(p_email, '')));
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' or length(btrim(coalesce(p_name, ''))) < 2 or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into c from public.contracts where share_token = p_token for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status = 'signed' then return 'already_signed'; end if;
  if c.status <> 'sent' then raise exception 'contract_not_open' using errcode = '22023'; end if;
  if c.sent_version is distinct from p_version then raise exception 'version_changed' using errcode = '22023'; end if;
  if c.expires_at is not null and c.expires_at < current_date then
    update public.contracts set status = 'expired', status_reason = 'Signing window passed' where id = c.id; return 'expired';
  end if;
  select * into pt from public.contract_parties where contract_id = c.id and role = 'client' and signs and email = em order by signing_order limit 1 for update;
  if not found then raise exception 'not_a_signer' using errcode = '42501'; end if;
  if pt.status = 'signed' then return 'already_signed'; end if;
  if not p_accept then
    update public.contract_parties set status = 'declined' where id = pt.id;
    update public.contracts set status = 'declined', declined_at = now(), status_reason = left(coalesce(p_reason, ''), 500) where id = c.id;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', c.workspace_id, 'contract.declined', jsonb_build_object('contract_id', c.id, 'party_id', pt.id, 'version', c.sent_version));
    perform public.trust_notify_workspace(c.workspace_id, 'contract_declined', 'Contract declined: ' || c.title, left(coalesce(p_reason, ''), 300), '/organizer/sales/contracts/' || c.id, 'contract.declined:' || c.id || ':' || c.sent_version);
    return 'declined';
  end if;
  return public.contract_record_signature(c, pt.id, 'typed_name', p_name, em, null, p_ip_hash, p_user_agent);
end $$;

-- Revise (sent/declined/expired → draft): the old link stops working; earlier signatures stay as history.
create or replace function public.contract_revise(p_contract uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts;
begin
  c := public.contract_require(p_contract);
  if c.status not in ('sent','declined','expired') then raise exception 'contract_not_revisable' using errcode = '22023'; end if;
  update public.contracts set status = 'draft', share_token = null, status_reason = '' where id = c.id;
  update public.contract_parties set status = 'pending', signed_at = null where contract_id = c.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), c.workspace_id, 'contract.revised', jsonb_build_object('contract_id', c.id, 'from', c.status, 'version', c.current_version));
end $$;
create or replace function public.contract_void(p_contract uuid, p_reason text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts;
begin
  c := public.contract_require(p_contract, array['owner','manager']);
  if c.status in ('signed','void') then raise exception 'contract_not_voidable' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.contracts set status = 'void', voided_at = now(), share_token = null, status_reason = left(p_reason, 500) where id = c.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), c.workspace_id, 'contract.voided', jsonb_build_object('contract_id', c.id, 'from', c.status));
end $$;
-- Renewal (56.8): a signed contract stays untouched; a new draft carries its latest text and parties.
create or replace function public.contract_renew(p_contract uuid, p_term_ends date default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare c public.contracts; v public.contract_versions; nid uuid;
begin
  c := public.contract_require(p_contract);
  if c.status <> 'signed' then raise exception 'only_signed_contracts_renew' using errcode = '22023'; end if;
  select * into v from public.contract_versions where contract_id = c.id and version = c.sent_version;
  nid := public.contract_create(c.workspace_id, jsonb_build_object('title', left(c.title || ' (renewal)', 160), 'client_id', c.client_id, 'event_id', c.event_id,
    'value', c.value, 'currency', c.currency, 'term_ends_at', p_term_ends, 'body', v.body,
    'parties', (select coalesce(jsonb_agg(jsonb_build_object('role', role, 'name', name, 'email', email, 'organisation', organisation, 'signs', signs, 'signing_order', signing_order)), '[]')
                from public.contract_parties where contract_id = c.id)));
  update public.contracts set renewal_of = c.id where id = nid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), c.workspace_id, 'contract.renewed', jsonb_build_object('contract_id', nid, 'renewal_of', c.id));
  return nid;
end $$;

-- Daily expiry of unsigned contracts (job queue, no browser timers).
create or replace function public.job_contracts_expiry_daily(p_job public.job_queue) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in update public.contracts set status = 'expired', status_reason = 'Signing window passed'
           where status = 'sent' and expires_at is not null and expires_at < current_date returning id, workspace_id, title loop
    n := n + 1;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', r.workspace_id, 'contract.expired', jsonb_build_object('contract_id', r.id));
    perform public.trust_notify_workspace(r.workspace_id, 'contract_expired', 'Contract expired unsigned: ' || r.title, 'Revise and resend it if the deal is still on.', '/organizer/sales/contracts/' || r.id, 'contract.expired:' || r.id);
  end loop;
  return jsonb_build_object('expired', n);
end $$;
insert into public.job_kinds(kind, runtime, handler, max_attempts, backoff_seconds, lease_seconds, description) values
  ('contracts.expiry_daily', 'db', 'public.job_contracts_expiry_daily', 5, '{60,300,1800,7200,21600}', 120, 'Q16: expire sent contracts past their signing window and tell the workspace.')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, description = excluded.description, updated_at = now();
select cron.unschedule(jobid) from cron.job where jobname = 'contracts-expiry-daily';
select cron.schedule('contracts-expiry-daily', '25 2 * * *', $$select public.enqueue_job('contracts.expiry_daily', '{}'::jsonb, 'contracts.expiry_daily:' || current_date::text)$$);

insert into public.domain_event_types(event_type, schema_version, aggregate, description) values
  ('proposal.accepted', 1, 'proposal', 'A client accepted an issued proposal version (payload: proposal_id, client_id, version, package, total).'),
  ('proposal.converted', 1, 'proposal', 'An accepted proposal produced/linked its event (payload: proposal_id, event_id, client_id, created).'),
  ('contract.created', 1, 'contract', 'A contract draft was created.'),
  ('contract.sent', 1, 'contract', 'A contract version was sent for signature.'),
  ('contract.party_signed', 1, 'contract', 'One party signed a contract version.'),
  ('contract.signed', 1, 'contract', 'All parties signed; the contract is immutable.'),
  ('contract.declined', 1, 'contract', 'The client declined to sign.'),
  ('contract.expired', 1, 'contract', 'A sent contract passed its signing window.'),
  ('contract.voided', 1, 'contract', 'A contract was voided before signature.'),
  ('contract.revised', 1, 'contract', 'A sent/declined/expired contract returned to draft.'),
  ('contract.renewed', 1, 'contract', 'A renewal draft was created from a signed contract.'),
  ('contract.approval_requested', 1, 'contract', 'Internal approval was requested for a contract version.'),
  ('contract.approval_decided', 1, 'contract', 'Internal approval was granted or rejected.')
on conflict (event_type) do update set aggregate = excluded.aggregate, description = excluded.description, updated_at = now();

revoke all on function public.proposal_budget_lines(jsonb, jsonb), public.contract_render(text, jsonb), public.contract_hash(text), public.contract_require(uuid, text[]),
  public.contract_record_signature(public.contracts, uuid, text, text, text, uuid, text, text, text, text), public.contract_by_token(text),
  public.contract_sign_by_token(text, text, text, integer, boolean, text, text, text), public.job_contracts_expiry_daily(public.job_queue), public.trg_contracts_immutable()
  from public, anon, authenticated;
grant execute on function public.proposal_budget_lines(jsonb, jsonb), public.contract_render(text, jsonb), public.contract_hash(text),
  public.contract_by_token(text), public.contract_sign_by_token(text, text, text, integer, boolean, text, text, text), public.job_contracts_expiry_daily(public.job_queue)
  to service_role;
revoke all on function public.convert_proposal_to_event(uuid), public.contract_create(uuid, jsonb), public.contract_set_parties(uuid, jsonb), public.contract_save_version(uuid, text, jsonb),
  public.contract_request_approval(uuid, text), public.contract_decide_approval(uuid, boolean, text), public.contract_send(uuid), public.contract_sign_internal(uuid, uuid, text),
  public.contract_revise(uuid), public.contract_void(uuid, text), public.contract_renew(uuid, date) from public, anon;
grant execute on function public.convert_proposal_to_event(uuid), public.contract_create(uuid, jsonb), public.contract_set_parties(uuid, jsonb), public.contract_save_version(uuid, text, jsonb),
  public.contract_request_approval(uuid, text), public.contract_decide_approval(uuid, boolean, text), public.contract_send(uuid), public.contract_sign_internal(uuid, uuid, text),
  public.contract_revise(uuid), public.contract_void(uuid, text), public.contract_renew(uuid, date) to authenticated, service_role;
