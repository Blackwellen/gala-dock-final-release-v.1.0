-- Q16 (lane C, 2026-10-29) 1/2 — canonical clients, lead CRM history and pipeline KPIs (domains 51–54).
-- Additive and backward-compatible with the deployed code:
--   * clients / client_contacts are the ONE client model for the organizer workspace. leads, proposals, events and invoices
--     gain a nullable client_id. Deployed code keeps writing client_name only: a BEFORE trigger resolves (or creates) the
--     canonical client by normalised name / email, so the free-text copies can no longer drift into parallel client lists.
--     saved_contacts stays what it is (a messaging address book of platform identities) — it is not a CRM client record.
--     enquiries / provider_requests remain marketplace-side records (Q00 duplicates note): leads are the organizer-side CRM row.
--   * lead_stage_history records every stage change (trigger), so prior-period KPI deltas are computed from history
--     (sales_kpis), not guessed. Backfilled from created_at + recorded stage activities.
--   * leads gain ownership (owner_id), capture channel, qualified/won/lost timestamps and lost_reason; lead_score() is a
--     deterministic, explainable score (no AI).
--   * capture_lead(): service-only intake for a workspace's public enquiry form (key-gated, deduped per email/day).
--   * organizer_portfolio(): active / upcoming / completed buckets with health, profit and conflict counts.

-- ═══ 1. Clients ═══
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  name_key text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  kind text not null default 'company' check (kind in ('company','individual')),
  email text not null default '' check (email = lower(email) and length(email) <= 200),
  phone text not null default '' check (length(phone) <= 40),
  website text not null default '' check (length(website) <= 200),
  billing_name text not null default '' check (length(billing_name) <= 160),
  billing_email text not null default '' check (billing_email = lower(billing_email) and length(billing_email) <= 200),
  billing_address text not null default '' check (length(billing_address) <= 500),
  vat_number text not null default '' check (length(vat_number) <= 40),
  status text not null default 'active' check (status in ('active','archived','merged')),
  merged_into uuid references public.clients(id) on delete set null,
  owner_name text not null default '' check (length(owner_name) <= 120),
  source text not null default '' check (length(source) <= 80),
  notes text not null default '' check (length(notes) <= 4000),
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'merged') = (merged_into is not null))
);
create unique index if not exists clients_ws_name_uq on public.clients(workspace_id, name_key) where status <> 'merged';
create index if not exists clients_ws_status_idx on public.clients(workspace_id, status, name_key);
create index if not exists clients_ws_email_idx on public.clients(workspace_id, email) where email <> '';

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null default '' check (length(name) <= 120),
  email text not null default '' check (email = lower(email) and length(email) <= 200),
  phone text not null default '' check (length(phone) <= 40),
  role text not null default '' check (length(role) <= 80),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  check (name <> '' or email <> '')
);
create unique index if not exists client_contacts_email_uq on public.client_contacts(client_id, email) where email <> '';
create index if not exists client_contacts_client_idx on public.client_contacts(client_id);

alter table public.leads add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.proposals add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.events add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.invoices add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.proposals add column if not exists accepted_total numeric(12,2);
create index if not exists leads_client_idx on public.leads(client_id) where client_id is not null;
create index if not exists proposals_client_idx on public.proposals(client_id) where client_id is not null;
create index if not exists events_client_idx on public.events(client_id) where client_id is not null;
create index if not exists invoices_client_idx on public.invoices(client_id) where client_id is not null;

-- Resolve the canonical client: follow merges, match normalised name, then email; otherwise create (race-safe on the
-- partial unique index). Internal helper (triggers / RPCs) — never callable by clients directly.
create or replace function public.client_resolve(p_ws uuid, p_name text, p_email text default '', p_contact text default '', p_phone text default '', p_source text default '')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare cid uuid; nm text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 160); em text := lower(btrim(coalesce(p_email, '')));
  k text;
begin
  if p_ws is null or nm = '' then return null; end if;
  k := lower(nm);
  select id into cid from public.clients where workspace_id = p_ws and name_key = k and status <> 'merged';
  if cid is null and em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    select c.id into cid from public.clients c where c.workspace_id = p_ws and c.status <> 'merged' and c.email = em limit 1;
  end if;
  if cid is null then
    insert into public.clients(workspace_id, name, email, phone, source, created_by)
      values (p_ws, nm, case when em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then left(em, 200) else '' end, left(coalesce(p_phone, ''), 40), left(coalesce(p_source, ''), 80), auth.uid())
      on conflict (workspace_id, name_key) where status <> 'merged' do nothing
      returning id into cid;
    if cid is null then select id into cid from public.clients where workspace_id = p_ws and name_key = k and status <> 'merged'; end if;
    if cid is not null then
      insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'client.created', jsonb_build_object('client_id', cid, 'source', left(coalesce(p_source, ''), 80)));
    end if;
  end if;
  if cid is not null and (em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or btrim(coalesce(p_contact, '')) <> '') then
    insert into public.client_contacts(workspace_id, client_id, name, email, phone, is_primary)
      select p_ws, cid, left(btrim(coalesce(p_contact, '')), 120), case when em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then left(em, 200) else '' end, left(coalesce(p_phone, ''), 40),
             not exists (select 1 from public.client_contacts x where x.client_id = cid)
      where not exists (select 1 from public.client_contacts x where x.client_id = cid
                          and ((em <> '' and x.email = em) or (em = '' and lower(x.name) = lower(btrim(coalesce(p_contact, ''))))));
  end if;
  return cid;
end $$;

-- Live (non-merged) client for an id, following merge pointers.
create or replace function public.client_live(p_client uuid) returns uuid language sql stable security definer set search_path = '' as $$
  with recursive m(id, merged_into, depth) as (
    select id, merged_into, 0 from public.clients where id = p_client
    union all select c.id, c.merged_into, m.depth + 1 from public.clients c join m on c.id = m.merged_into where m.depth < 10)
  select id from m where merged_into is null order by depth desc limit 1;
$$;

-- Shared trigger body for leads / proposals / events / invoices: link to the canonical client, keep the display name in step.
create or replace function public.trg_link_client() returns trigger language plpgsql security definer set search_path = '' as $$
declare ws uuid := (to_jsonb(new) ->> 'workspace_id')::uuid; c public.clients; em text := ''; contact text := ''; phone text := ''; src text := '';
begin
  if ws is null then return new; end if;
  if TG_TABLE_NAME = 'events' and coalesce(to_jsonb(new) ->> 'management', 'consumer') <> 'professional' then return new; end if;
  if new.client_id is not null then
    select * into c from public.clients where id = public.client_live(new.client_id);
    if not found or c.workspace_id <> ws then raise exception 'client_not_in_workspace' using errcode = '42501'; end if;
    new.client_id := c.id;
    if btrim(coalesce(new.client_name, '')) = '' or (TG_OP = 'UPDATE' and new.client_id is distinct from old.client_id) then new.client_name := c.name; end if;
    return new;
  end if;
  if btrim(coalesce(new.client_name, '')) = '' then return new; end if;
  if TG_TABLE_NAME = 'leads' then em := to_jsonb(new) ->> 'contact_email'; contact := to_jsonb(new) ->> 'contact_name'; phone := to_jsonb(new) ->> 'contact_phone'; src := 'lead';
  elsif TG_TABLE_NAME = 'proposals' then em := coalesce(to_jsonb(new) #>> '{content,client,contact_email}', ''); contact := coalesce(to_jsonb(new) #>> '{content,client,contact_name}', ''); src := 'proposal';
  elsif TG_TABLE_NAME = 'invoices' then
    -- Invoices link to an existing client only (an invoice to a one-off payer must not create a CRM client).
    select id into new.client_id from public.clients where workspace_id = ws and status <> 'merged' and name_key = lower(regexp_replace(btrim(new.client_name), '\s+', ' ', 'g'));
    return new;
  else src := 'event'; end if;
  new.client_id := public.client_resolve(ws, new.client_name, em, contact, phone, src);
  return new;
end $$;

drop trigger if exists leads_link_client on public.leads;
create trigger leads_link_client before insert or update of client_name, client_id on public.leads for each row execute function public.trg_link_client();
drop trigger if exists proposals_link_client on public.proposals;
create trigger proposals_link_client before insert or update of client_name, client_id on public.proposals for each row execute function public.trg_link_client();
drop trigger if exists events_link_client on public.events;
create trigger events_link_client before insert or update of client_name, client_id on public.events for each row execute function public.trg_link_client();
drop trigger if exists invoices_link_client on public.invoices;
create trigger invoices_link_client before insert or update of client_name, client_id on public.invoices for each row execute function public.trg_link_client();

-- Billing / VAT details are finance data: only owner, manager or finance may change them (sales members edit the rest).
create or replace function public.trg_clients_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if TG_OP = 'UPDATE' then
    if new.workspace_id <> old.workspace_id then raise exception 'not_authorized' using errcode = '42501'; end if;
    if (new.billing_name, new.billing_email, new.billing_address, new.vat_number) is distinct from (old.billing_name, old.billing_email, old.billing_address, old.vat_number)
       and auth.uid() is not null and not public.has_workspace_role(new.workspace_id, array['owner','manager','finance']) then
      raise exception 'finance_permission_required' using errcode = '42501';
    end if;
    if new.status = 'merged' and old.status <> 'merged' and coalesce(current_setting('gala.client_merge', true), '') <> 'on' then
      raise exception 'use_merge_clients' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists clients_guard on public.clients;
create trigger clients_guard before insert or update on public.clients for each row execute function public.trg_clients_guard();

alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
drop policy if exists clients_member_read on public.clients;
drop policy if exists clients_member_insert on public.clients;
drop policy if exists clients_member_update on public.clients;
drop policy if exists clients_manager_delete on public.clients;
create policy clients_member_read on public.clients for select to authenticated using (public.is_workspace_member(workspace_id));
create policy clients_member_insert on public.clients for insert to authenticated with check (public.is_workspace_member(workspace_id) and status = 'active');
create policy clients_member_update on public.clients for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy clients_manager_delete on public.clients for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner','manager']));
drop policy if exists client_contacts_member_read on public.client_contacts;
drop policy if exists client_contacts_member_write on public.client_contacts;
create policy client_contacts_member_read on public.client_contacts for select to authenticated using (public.is_workspace_member(workspace_id));
create policy client_contacts_member_write on public.client_contacts for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id) and exists (select 1 from public.clients c where c.id = client_id and c.workspace_id = client_contacts.workspace_id));
revoke all on table public.clients, public.client_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.clients, public.client_contacts to authenticated;
grant all on table public.clients, public.client_contacts to service_role;

-- Merge a duplicate into the kept record: every reference is re-pointed, the duplicate keeps an audit trail (status merged).
create or replace function public.merge_clients(p_keep uuid, p_merge uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare k public.clients; m public.clients; n_leads int; n_props int; n_events int; n_inv int; n_contracts int := 0;
begin
  if p_keep = p_merge then raise exception 'same_client' using errcode = '22023'; end if;
  select * into k from public.clients where id = p_keep for update;
  select * into m from public.clients where id = p_merge for update;
  if k.id is null or m.id is null or k.workspace_id <> m.workspace_id then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_workspace_role(k.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if k.status = 'merged' or m.status = 'merged' then raise exception 'already_merged' using errcode = '22023'; end if;
  update public.leads set client_id = k.id where client_id = m.id; get diagnostics n_leads = row_count;
  update public.proposals set client_id = k.id where client_id = m.id; get diagnostics n_props = row_count;
  update public.events set client_id = k.id where client_id = m.id; get diagnostics n_events = row_count;
  update public.invoices set client_id = k.id where client_id = m.id; get diagnostics n_inv = row_count;
  if to_regclass('public.contracts') is not null then
    execute 'update public.contracts set client_id = $1 where client_id = $2' using k.id, m.id; get diagnostics n_contracts = row_count;
  end if;
  update public.client_contacts c set client_id = k.id where c.client_id = m.id
    and not exists (select 1 from public.client_contacts x where x.client_id = k.id and x.email <> '' and x.email = c.email);
  update public.clients set email = case when email = '' then m.email else email end, phone = case when phone = '' then m.phone else phone end,
    tags = (select array(select distinct unnest(k.tags || m.tags))), notes = left(btrim(notes || case when m.notes <> '' then E'\n' || m.notes else '' end), 4000)
    where id = k.id;
  perform set_config('gala.client_merge', 'on', true);
  update public.clients set status = 'merged', merged_into = k.id where id = m.id;
  perform set_config('gala.client_merge', '', true);
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), k.workspace_id, 'client.merged',
    jsonb_build_object('client_id', k.id, 'merged_id', m.id, 'leads', n_leads, 'proposals', n_props, 'events', n_events, 'invoices', n_inv, 'contracts', n_contracts));
  return jsonb_build_object('client_id', k.id, 'leads', n_leads, 'proposals', n_props, 'events', n_events, 'invoices', n_inv, 'contracts', n_contracts);
end $$;

-- Client record with its contacts, events, leads, proposals, contracts, billing summary and history (52.1–52.7).
create or replace function public.client_overview(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.clients; r jsonb;
begin
  select * into c from public.clients where id = public.client_live(p_client);
  if not found or not public.is_workspace_member(c.workspace_id) then return null; end if;
  select jsonb_build_object(
    'client', to_jsonb(c),
    'contacts', coalesce((select jsonb_agg(to_jsonb(x) order by x.is_primary desc, x.created_at) from public.client_contacts x where x.client_id = c.id), '[]'),
    'leads', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'reference', l.reference, 'name', l.name, 'stage', l.stage, 'value', l.value, 'created_at', l.created_at) order by l.created_at desc) from public.leads l where l.client_id = c.id), '[]'),
    'proposals', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'number', p.number, 'title', p.title, 'status', p.status, 'version', p.version, 'total', coalesce(p.accepted_total, p.total)) order by p.created_at desc) from public.proposals p where p.client_id = c.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'status', e.status, 'starts_at', e.starts_at) order by e.starts_at desc nulls last) from public.events e where e.client_id = c.id), '[]'),
    'billing', jsonb_build_object(
      'contracted', coalesce((select sum(coalesce(p.accepted_total, p.total)) from public.proposals p where p.client_id = c.id and p.status in ('accepted','converted')), 0),
      'invoiced', coalesce((select sum(i.total) from public.invoices i where i.client_id = c.id and i.status <> 'draft'), 0),
      'paid', coalesce((select sum(i.amount_paid) from public.invoices i where i.client_id = c.id), 0),
      'can_edit', public.has_workspace_role(c.workspace_id, array['owner','manager','finance'])),
    'history', coalesce((select jsonb_agg(h order by h->>'at' desc) from (
        select jsonb_build_object('at', a.created_at, 'event', a.event, 'metadata', a.metadata - array['email','ip','user_agent']) h
          from public.audit_events a where a.workspace_id = c.workspace_id and (a.metadata ->> 'client_id' = c.id::text or a.metadata ->> 'merged_id' = c.id::text)
        union all
        select jsonb_build_object('at', la.created_at, 'event', 'lead.' || la.kind, 'metadata', jsonb_build_object('title', la.title, 'lead_id', la.lead_id))
          from public.lead_activities la join public.leads l on l.id = la.lead_id where l.client_id = c.id
        order by 1 desc limit 100) q), '[]')
  ) into r;
  return r;
end $$;

-- ═══ 2. Lead CRM: ownership, channel, timestamps, stage history ═══
alter table public.leads add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.leads add column if not exists captured_via text not null default 'manual';
alter table public.leads add column if not exists qualified_at timestamptz;
alter table public.leads add column if not exists won_at timestamptz;
alter table public.leads add column if not exists lost_at timestamptz;
alter table public.leads add column if not exists lost_reason text not null default '';
alter table public.leads add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table public.leads add constraint leads_captured_via_check check (captured_via in ('manual','form','marketplace','import','agent','referral'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.leads add constraint leads_lost_reason_len check (length(lost_reason) <= 300);
exception when duplicate_object then null; end $$;
create index if not exists leads_ws_stage_idx on public.leads(workspace_id, stage, created_at desc);
create index if not exists leads_ws_email_idx on public.leads(workspace_id, lower(contact_email)) where contact_email <> '';

create table if not exists public.lead_stage_history (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  value numeric(12,2) not null default 0,
  probability integer,
  actor_id uuid references auth.users(id) on delete set null,
  source text not null default 'app',
  changed_at timestamptz not null default now()
);
create index if not exists lead_stage_history_ws_idx on public.lead_stage_history(workspace_id, changed_at);
create index if not exists lead_stage_history_lead_idx on public.lead_stage_history(lead_id, changed_at);
alter table public.lead_stage_history enable row level security;
drop policy if exists lead_stage_history_read on public.lead_stage_history;
create policy lead_stage_history_read on public.lead_stage_history for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on table public.lead_stage_history from public, anon, authenticated;
grant select on table public.lead_stage_history to authenticated;
grant all on table public.lead_stage_history to service_role;

create or replace function public.trg_leads_stage() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and new.stage is not distinct from old.stage then new.updated_at := now(); return new; end if;
  new.updated_at := now();
  if new.stage in ('qualified','proposal','negotiating','won') and new.qualified_at is null then new.qualified_at := now(); end if;
  if new.stage = 'won' then new.won_at := coalesce(new.won_at, now()); new.lost_at := null; end if;
  if new.stage = 'lost' then
    new.lost_at := coalesce(new.lost_at, now()); new.won_at := null;
    if new.lost_reason = '' then new.lost_reason := left(coalesce(new.details ->> 'lost_reason', ''), 300); end if;
  end if;
  if TG_OP = 'UPDATE' and old.stage in ('won','lost') and new.stage not in ('won','lost') then new.won_at := null; new.lost_at := null; end if;
  return new;
end $$;
drop trigger if exists leads_stage_stamp on public.leads;
create trigger leads_stage_stamp before insert or update on public.leads for each row execute function public.trg_leads_stage();

create or replace function public.trg_leads_stage_history() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and new.stage is not distinct from old.stage then return null; end if;
  insert into public.lead_stage_history(lead_id, workspace_id, from_stage, to_stage, value, probability, actor_id)
    values (new.id, new.workspace_id, case when TG_OP = 'UPDATE' then old.stage end, new.stage, coalesce(new.value, 0), new.probability, auth.uid());
  if TG_OP = 'UPDATE' then
    insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), new.workspace_id, 'lead.stage_changed',
      jsonb_build_object('lead_id', new.id, 'client_id', new.client_id, 'from', old.stage, 'to', new.stage, 'value', new.value));
  end if;
  return null;
end $$;
drop trigger if exists leads_stage_history on public.leads;
create trigger leads_stage_history after insert or update of stage on public.leads for each row execute function public.trg_leads_stage_history();

-- Deterministic lead score 0–100 (53.6): value band, stage, probability, contactability, recency, next action.
create or replace function public.lead_score(l public.leads) returns integer language sql stable security definer set search_path = '' as $$
  select case when l.stage in ('won','lost') then case l.stage when 'won' then 100 else 0 end else least(100, greatest(0,
      (case when l.value >= 50000 then 25 when l.value >= 15000 then 18 when l.value >= 5000 then 12 when l.value > 0 then 6 else 0 end)
    + (case l.stage when 'new' then 5 when 'qualified' then 15 when 'proposal' then 22 when 'negotiating' then 28 else 0 end)
    + (coalesce(l.probability, 0) / 5)
    + (case when l.contact_email <> '' then 6 else 0 end) + (case when l.contact_phone <> '' then 4 else 0 end)
    + (case when l.expected_date is not null then 4 else 0 end)
    + (case when l.next_action_at is not null and l.next_action_at >= now() then 6 when l.next_action_at is not null then -6 else 0 end)
    - (case when coalesce(l.updated_at, l.created_at) < now() - interval '30 days' then 10 else 0 end))) end;
$$;

-- Backfill (idempotent): canonical clients + links, lead history from created_at and recorded stage activities.
update public.leads set client_id = public.client_resolve(workspace_id, client_name, contact_email, contact_name, contact_phone, 'lead')
  where client_id is null and btrim(client_name) <> '';
update public.proposals set client_id = public.client_resolve(workspace_id, client_name, coalesce(content #>> '{client,contact_email}', ''), coalesce(content #>> '{client,contact_name}', ''), '', 'proposal')
  where client_id is null and btrim(client_name) <> '';
update public.events set client_id = public.client_resolve(workspace_id, client_name, '', '', '', 'event')
  where client_id is null and workspace_id is not null and management = 'professional' and btrim(client_name) <> '';
update public.invoices i set client_id = c.id from public.clients c
  where i.client_id is null and c.workspace_id = i.workspace_id and c.status <> 'merged' and c.name_key = lower(regexp_replace(btrim(i.client_name), '\s+', ' ', 'g'));
update public.leads set lost_reason = left(details ->> 'lost_reason', 300) where stage = 'lost' and lost_reason = '' and coalesce(details ->> 'lost_reason', '') <> '';
update public.leads l set qualified_at = coalesce(l.qualified_at, l.created_at) where l.stage in ('qualified','proposal','negotiating','won') and l.qualified_at is null;
update public.leads l set won_at = coalesce((select max(a.created_at) from public.lead_activities a where a.lead_id = l.id and a.kind = 'stage' and a.title ilike 'won%'), l.created_at)
  where l.stage = 'won' and l.won_at is null;
update public.leads l set lost_at = coalesce((select max(a.created_at) from public.lead_activities a where a.lead_id = l.id and a.kind = 'stage' and a.title ilike '%lost%'), l.created_at)
  where l.stage = 'lost' and l.lost_at is null;
insert into public.lead_stage_history(lead_id, workspace_id, from_stage, to_stage, value, probability, source, changed_at)
  select l.id, l.workspace_id, null, 'new', l.value, 20, 'backfill', l.created_at from public.leads l
  where not exists (select 1 from public.lead_stage_history h where h.lead_id = l.id);
insert into public.lead_stage_history(lead_id, workspace_id, from_stage, to_stage, value, probability, source, changed_at)
  select l.id, l.workspace_id, 'new', l.stage, l.value, l.probability, 'backfill', coalesce(l.won_at, l.lost_at, l.qualified_at, l.created_at)
  from public.leads l where l.stage <> 'new' and not exists (select 1 from public.lead_stage_history h where h.lead_id = l.id and h.to_stage = l.stage);

-- ═══ 3. Pipeline KPIs with prior-period deltas (54.2–54.6) ═══
create or replace function public.sales_period_metrics(p_ws uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  with stage_at as (
    select l.id, l.value, (select h.to_stage from public.lead_stage_history h where h.lead_id = l.id and h.changed_at < p_to order by h.changed_at desc, h.id desc limit 1) as stage
    from public.leads l where l.workspace_id = p_ws and l.created_at < p_to),
  wins as (select h.lead_id, h.value, h.changed_at, l.created_at from public.lead_stage_history h join public.leads l on l.id = h.lead_id
           where h.workspace_id = p_ws and h.to_stage = 'won' and h.changed_at >= p_from and h.changed_at < p_to),
  losses as (select h.lead_id from public.lead_stage_history h where h.workspace_id = p_ws and h.to_stage = 'lost' and h.changed_at >= p_from and h.changed_at < p_to),
  first_issue as (select p.id, min(v.issued_at) as first_at from public.proposals p join public.proposal_versions v on v.proposal_id = p.id where p.workspace_id = p_ws group by p.id)
  select jsonb_build_object(
    'leads', (select count(*) from public.leads l where l.workspace_id = p_ws and l.created_at >= p_from and l.created_at < p_to),
    'pipeline_value', coalesce((select sum(value) from stage_at where stage is not null and stage not in ('won','lost')), 0),
    'forecast_value', coalesce((select sum(s.value * case s.stage when 'new' then 0.2 when 'qualified' then 0.4 when 'proposal' then 0.6 when 'negotiating' then 0.75 else 0 end) from stage_at s where s.stage not in ('won','lost')), 0),
    'proposals_sent', (select count(*) from first_issue f where f.first_at >= p_from and f.first_at < p_to),
    'won', (select count(*) from wins), 'lost', (select count(*) from losses),
    'win_rate', case when (select count(*) from wins) + (select count(*) from losses) > 0
      then round(100.0 * (select count(*) from wins) / ((select count(*) from wins) + (select count(*) from losses))) else null end,
    'closed_value', coalesce((select sum(value) from wins), 0),
    'avg_cycle_days', (select round(avg(extract(epoch from (changed_at - created_at)) / 86400.0)::numeric, 1) from wins));
$$;
create or replace function public.sales_kpis(p_ws uuid, p_days integer default 90) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d integer := least(greatest(coalesce(p_days, 90), 1), 3660); t timestamptz := now(); cur jsonb; prev jsonb; delta jsonb := '{}'; k text; c numeric; p numeric;
begin
  if not public.is_workspace_member(p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  cur := public.sales_period_metrics(p_ws, t - make_interval(days => d), t);
  prev := public.sales_period_metrics(p_ws, t - make_interval(days => 2 * d), t - make_interval(days => d));
  foreach k in array array['leads','pipeline_value','forecast_value','proposals_sent','won','win_rate','closed_value','avg_cycle_days'] loop
    c := nullif(cur ->> k, '')::numeric; p := nullif(prev ->> k, '')::numeric;
    delta := delta || jsonb_build_object(k, case when c is null or p is null then null
      when k in ('win_rate') then round(c - p, 1)                       -- percentage points
      when p = 0 then case when c = 0 then 0 else null end              -- no baseline: not a percentage
      else round((c - p) / abs(p) * 100, 1) end);
  end loop;
  return jsonb_build_object('days', d, 'current', cur, 'previous', prev, 'delta', delta, 'as_of', t);
end $$;

-- ═══ 4. Lead capture (53.1–53.2): service-only, used by /api/leads/capture behind rate limiting ═══
create or replace function public.capture_lead(p_ws uuid, p_key text, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w public.workspaces; em text := lower(btrim(coalesce(p ->> 'email', ''))); nm text := left(btrim(coalesce(p ->> 'name', '')), 120);
  existing uuid; lid uuid; ref text; n integer;
begin
  select * into w from public.workspaces where id = p_ws and status = 'active' and kind = 'organizer';
  if not found or coalesce(w.settings #>> '{lead_capture,enabled}', 'false') <> 'true' or coalesce(w.settings #>> '{lead_capture,key}', '') = ''
     or p_key is distinct from w.settings #>> '{lead_capture,key}' then
    raise exception 'capture_disabled' using errcode = '42501';
  end if;
  if length(nm) < 2 or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- Same person, same day, still open: append to the existing lead instead of creating a duplicate.
  select l.id into existing from public.leads l where l.workspace_id = p_ws and lower(l.contact_email) = em and l.stage not in ('won','lost')
    and l.created_at > now() - interval '24 hours' order by l.created_at desc limit 1;
  if existing is not null then
    insert into public.lead_activities(lead_id, kind, title, detail) values (existing, 'enquiry', 'Repeat enquiry', left(coalesce(p ->> 'message', ''), 2000));
    return jsonb_build_object('lead_id', existing, 'result', 'duplicate');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lead_reference:' || p_ws::text, 0));
  select coalesce(max((regexp_match(reference, '^LD-' || to_char(now(), 'YYYY') || '-([0-9]+)$'))[1]::int), 0) + 1 into n from public.leads where workspace_id = p_ws;
  ref := 'LD-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 3, '0');
  insert into public.leads(workspace_id, reference, name, client_name, contact_name, contact_email, contact_phone, event_type, value, expected_date, location, guests, budget, source, captured_via, details, tags)
    values (p_ws, ref, left(coalesce(nullif(btrim(p ->> 'event_name'), ''), nm || ' enquiry'), 120), left(coalesce(nullif(btrim(p ->> 'company'), ''), nm), 120), nm, em,
      left(coalesce(p ->> 'phone', ''), 40), left(coalesce(nullif(p ->> 'event_type', ''), 'Event'), 40), 0,
      case when coalesce(p ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p ->> 'date')::date end, left(coalesce(p ->> 'location', ''), 160),
      left(coalesce(p ->> 'guests', ''), 60), left(coalesce(p ->> 'budget', ''), 60), left(coalesce(nullif(p ->> 'source', ''), 'Website form'), 60), 'form',
      jsonb_build_object('message', left(coalesce(p ->> 'message', ''), 2000)), array[left(coalesce(nullif(p ->> 'event_type', ''), 'Event'), 40)])
    returning id into lid;
  insert into public.lead_activities(lead_id, kind, title, detail) values (lid, 'enquiry', 'Enquiry received', left(coalesce(p ->> 'message', ''), 2000));
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', p_ws, 'lead.captured', jsonb_build_object('lead_id', lid, 'source', 'form'));
  perform public.trust_notify_workspace(p_ws, 'sales_new_lead', 'New enquiry: ' || nm, left(coalesce(p ->> 'message', ''), 300), '/organizer/sales/leads/' || lid, 'lead.captured:' || lid);
  return jsonb_build_object('lead_id', lid, 'reference', ref, 'result', 'created');
end $$;

-- ═══ 5. Event portfolio (51.1–51.7) ═══
create or replace function public.organizer_portfolio(p_ws uuid) returns table(
  event_id uuid, name text, status text, bucket text, starts_at timestamptz, client_id uuid, client_name text,
  revenue numeric, committed_cost numeric, crew_cost numeric, profit numeric, open_incidents integer, conflicts integer, health text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_workspace_member(p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  with ev as (select e.* from public.events e where e.workspace_id = p_ws and e.status not in ('archived')),
  money as (
    select e.id,
      coalesce((select sum(t.price_paid) from public.tickets t where t.event_id = e.id and t.status in ('valid','used','transferred','resale_listed','resold')), 0)
      + coalesce((select sum(coalesce(p.accepted_total, p.total)) from public.proposals p where p.event_id = e.id and p.status in ('accepted','converted')),
                 nullif(e.settings ->> 'client_contract_value', '')::numeric, 0) as revenue,
      coalesce((select sum(coalesce(b.amount, 0)) from public.build_items b where b.event_id = e.id and b.status in ('confirmed','held','fulfilled','completed','awaiting_payment')), 0) as committed,
      coalesce((select sum(coalesce(m.day_rate, 0) * greatest(0.5, extract(epoch from (s.ends_at - s.starts_at)) / 28800.0)) from public.shifts s join public.crew_members m on m.id = s.crew_id
                where s.event_id = e.id and s.status in ('pending','confirmed')), 0) as crew
    from ev e)
  select e.id, e.name, e.status,
    case when e.status in ('completed','closed','cancelled') or coalesce(e.ends_at, e.starts_at) < now() - interval '1 day' then 'completed'
         when e.status = 'live' or (e.starts_at <= now() and coalesce(e.ends_at, e.starts_at + interval '1 day') >= now()) then 'active'
         when e.starts_at is null or e.starts_at > now() then 'upcoming' else 'active' end,
    e.starts_at, e.client_id, e.client_name, m.revenue, m.committed, round(m.crew, 2), round(m.revenue - m.committed - m.crew, 2),
    (select count(*)::int from public.incidents i where i.event_id = e.id and i.status <> 'resolved'),
    0, 'unknown'
  from ev e join money m on m.id = e.id
  order by e.starts_at nulls last;
end $$;

-- ═══ 6. Domain events + grants ═══
insert into public.domain_event_types(event_type, schema_version, aggregate, description) values
  ('client.created', 1, 'client', 'A canonical client record was created (payload: client_id, source).'),
  ('client.merged', 1, 'client', 'A duplicate client was merged into another (payload: client_id, merged_id, counts).'),
  ('lead.captured', 1, 'lead', 'A public enquiry form created a lead (payload: lead_id, source).'),
  ('lead.stage_changed', 1, 'lead', 'A lead moved pipeline stage (payload: lead_id, client_id, from, to, value).'),
  ('lead.converted', 1, 'lead', 'A won lead was linked to or created an event (payload: lead_id, event_id, mode).')
on conflict (event_type) do update set aggregate = excluded.aggregate, description = excluded.description, updated_at = now();

revoke all on function public.client_resolve(uuid, text, text, text, text, text), public.client_live(uuid), public.trg_link_client(), public.trg_clients_guard(),
  public.trg_leads_stage(), public.trg_leads_stage_history(), public.sales_period_metrics(uuid, timestamptz, timestamptz), public.capture_lead(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.client_resolve(uuid, text, text, text, text, text), public.client_live(uuid), public.sales_period_metrics(uuid, timestamptz, timestamptz),
  public.capture_lead(uuid, text, jsonb) to service_role;
revoke all on function public.merge_clients(uuid, uuid), public.client_overview(uuid), public.lead_score(public.leads), public.sales_kpis(uuid, integer), public.organizer_portfolio(uuid)
  from public, anon;
grant execute on function public.merge_clients(uuid, uuid), public.client_overview(uuid), public.lead_score(public.leads), public.sales_kpis(uuid, integer), public.organizer_portfolio(uuid)
  to authenticated, service_role;
