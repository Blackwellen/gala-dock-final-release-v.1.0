-- Phase 2: provider trust (master spec §29–32). Additive. Category/jurisdiction rules are data, not code.
begin;

-- ---------------------------------------------------------------- Stripe Connect state (§29)
create table if not exists public.connect_accounts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_account_id text not null unique,
  account_type text not null default 'express',
  country text,
  default_currency text,
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  transfers_capability text not null default 'inactive',
  card_payments_capability text not null default 'inactive',
  payouts_enabled boolean not null default false,
  requirements_currently_due text[] not null default '{}',
  requirements_eventually_due text[] not null default '{}',
  requirements_past_due text[] not null default '{}',
  disabled_reason text,
  verification_state text not null default 'unverified' check (verification_state in ('unverified','pending','verified','action_required','restricted','suspended')),
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.connect_accounts enable row level security;
revoke all on public.connect_accounts from anon, authenticated;
grant select on public.connect_accounts to authenticated;
drop policy if exists connect_accounts_read on public.connect_accounts;
create policy connect_accounts_read on public.connect_accounts for select to authenticated
  using (public.has_permission(workspace_id, 'payouts.read') or public.has_permission(workspace_id, 'settings.manage') or public.has_permission(workspace_id, 'finance.read'));

-- Payout eligibility is derived from authoritative Stripe state only (§29: no payouts without verification).
create or replace function public.payout_eligible(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.payouts_enabled and c.transfers_capability = 'active' and c.disabled_reason is null
                     and cardinality(c.requirements_past_due) = 0
                   from public.connect_accounts c where c.workspace_id = p_workspace), false);
$$;
grant execute on function public.payout_eligible(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- credential rules (§31) — configurable by category/jurisdiction
create table if not exists public.credential_types (
  key text primary key check (key ~ '^[a-z_]+$'),
  label text not null,
  description text not null default '',
  verification_method text not null default 'manual_review' check (verification_method in ('manual_review','self_declared','third_party')),
  expires boolean not null default true
);
create table if not exists public.credential_requirements (
  id uuid primary key default gen_random_uuid(),
  credential_key text not null references public.credential_types(key) on delete cascade,
  capability text check (capability in ('venue','service')),
  category text,               -- null = any category
  country text,                -- ISO-3166 alpha-2, null = any country
  requirement text not null check (requirement in ('required','recommended')),
  gates_marketplace boolean not null default false,
  unique (credential_key, capability, category, country)
);
alter table public.credential_types enable row level security;
alter table public.credential_requirements enable row level security;
revoke all on public.credential_types, public.credential_requirements from anon, authenticated;
grant select on public.credential_types, public.credential_requirements to anon, authenticated;
drop policy if exists credential_types_read on public.credential_types;
create policy credential_types_read on public.credential_types for select to anon, authenticated using (true);
drop policy if exists credential_requirements_read on public.credential_requirements;
create policy credential_requirements_read on public.credential_requirements for select to anon, authenticated using (true);

insert into public.credential_types(key, label, description, verification_method, expires) values
  ('public_liability', 'Public liability insurance', 'Cover for injury or damage to third parties.', 'manual_review', true),
  ('professional_indemnity', 'Professional indemnity insurance', 'Cover for professional advice/service errors.', 'manual_review', true),
  ('employer_liability', 'Employer liability insurance', 'Required in many jurisdictions when employing staff.', 'manual_review', true),
  ('event_insurance', 'Event insurance', 'Event-specific cover.', 'manual_review', true),
  ('premises_licence', 'Premises licence', 'Licence for alcohol sales or regulated entertainment.', 'manual_review', true),
  ('security_licence', 'Security licence', 'Licensing for door supervision / event security staff.', 'manual_review', true),
  ('food_hygiene', 'Food hygiene / registration', 'Food business registration or hygiene rating evidence.', 'manual_review', true),
  ('alcohol_permission', 'Alcohol permission', 'Permission to sell or serve alcohol.', 'manual_review', true),
  ('equipment_inspection', 'Equipment inspection certificate', 'Inspection of rigging, inflatables or similar equipment.', 'manual_review', true),
  ('electrical_safety', 'Electrical safety (e.g. PAT)', 'Portable appliance / electrical safety testing.', 'manual_review', true),
  ('risk_assessment', 'Risk assessment', 'Documented risk assessment.', 'self_declared', true),
  ('fire_safety', 'Fire safety documents', 'Fire risk assessment and safety certificates.', 'manual_review', true),
  ('accessibility_info', 'Accessibility information', 'Accessibility statement and facilities.', 'self_declared', false),
  ('company_documents', 'Company documents', 'Registration or incorporation evidence.', 'manual_review', false),
  ('category_certification', 'Category certification', 'Category-specific professional certification.', 'manual_review', true)
on conflict (key) do nothing;

insert into public.credential_requirements(credential_key, capability, category, country, requirement, gates_marketplace) values
  ('public_liability', 'venue', null, null, 'required', true),
  ('public_liability', 'service', 'Catering', null, 'required', true),
  ('public_liability', 'service', 'DJs & Music', null, 'required', true),
  ('public_liability', 'service', 'Live Entertainment', null, 'required', true),
  ('public_liability', 'service', 'AV & Production', null, 'required', true),
  ('public_liability', 'service', 'Décor & Florals', null, 'required', true),
  ('public_liability', 'service', 'Security', null, 'required', true),
  ('public_liability', 'service', 'Staffing', null, 'required', true),
  ('public_liability', 'service', null, null, 'recommended', false),
  ('premises_licence', 'venue', null, 'GB', 'required', false),
  ('fire_safety', 'venue', null, null, 'recommended', false),
  ('accessibility_info', 'venue', null, null, 'recommended', false),
  ('food_hygiene', 'service', 'Catering', null, 'required', true),
  ('security_licence', 'service', 'Security', null, 'required', true),
  ('electrical_safety', 'service', 'DJs & Music', 'GB', 'recommended', false),
  ('electrical_safety', 'service', 'AV & Production', 'GB', 'recommended', false),
  ('electrical_safety', 'service', 'Live Entertainment', 'GB', 'recommended', false)
on conflict do nothing;

-- ---------------------------------------------------------------- provider documents (§31)
create table if not exists public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  credential_key text not null references public.credential_types(key),
  file_path text not null check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$'),
  file_name text not null default '',
  issuing_organisation text,
  reference text,
  effective_from date,
  expires_on date,
  verification_method text not null default 'manual_review',
  status text not null default 'submitted' check (status in ('submitted','in_review','verified','rejected','expired','superseded')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (expires_on is null or effective_from is null or expires_on >= effective_from)
);
create index if not exists provider_documents_ws_idx on public.provider_documents(workspace_id, credential_key, status);
create index if not exists provider_documents_expiry_idx on public.provider_documents(expires_on) where status = 'verified';
alter table public.provider_documents enable row level security;
revoke all on public.provider_documents from anon, authenticated;
grant select on public.provider_documents to authenticated;
grant insert (workspace_id, credential_key, file_path, file_name, issuing_organisation, reference, effective_from, expires_on, uploaded_by) on public.provider_documents to authenticated;
-- Private: only members with settings/listings authority can see their own workspace's documents. Never public.
drop policy if exists provider_documents_read on public.provider_documents;
create policy provider_documents_read on public.provider_documents for select to authenticated
  using (public.has_permission(workspace_id, 'settings.manage') or public.has_permission(workspace_id, 'listings.manage'));
drop policy if exists provider_documents_insert on public.provider_documents;
create policy provider_documents_insert on public.provider_documents for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (public.has_permission(workspace_id, 'settings.manage') or public.has_permission(workspace_id, 'listings.manage'))
    and split_part(file_path, '/', 1) = (select auth.uid())::text);

-- Only the platform can change a document's verification state (§30: uploads never self-verify).
create or replace function public.review_provider_document(p_document uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('in_review','verified','rejected') then raise exception 'invalid status' using errcode = '22023'; end if;
  update public.provider_documents set status = p_status, rejection_reason = case when p_status = 'rejected' then left(p_reason, 500) end,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_document;
  -- A newly verified document supersedes older verified documents of the same type.
  if p_status = 'verified' then
    update public.provider_documents d set status = 'superseded'
      from public.provider_documents n
      where n.id = p_document and d.workspace_id = n.workspace_id and d.credential_key = n.credential_key and d.id <> n.id and d.status = 'verified';
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, actor_type, metadata)
    select auth.uid(), workspace_id, 'trust.document_reviewed', 'admin', jsonb_build_object('document', id, 'status', p_status) from public.provider_documents where id = p_document;
end;
$$;
revoke all on function public.review_provider_document(uuid, text, text) from public, anon;
grant execute on function public.review_provider_document(uuid, text, text) to authenticated;

-- Expiry: verified documents past their expiry become expired (run daily by the scheduler).
create or replace function public.expire_provider_documents() returns integer
language sql security definer set search_path = '' as $$
  with e as (update public.provider_documents set status = 'expired' where status = 'verified' and expires_on < current_date returning workspace_id)
  select count(*)::int from e;
$$;
revoke all on function public.expire_provider_documents() from public, anon, authenticated;
grant execute on function public.expire_provider_documents() to service_role;

-- ---------------------------------------------------------------- credential status per workspace (§31 gating)
create or replace function public.workspace_credential_status(p_workspace uuid)
returns table(credential_key text, label text, requirement text, gates_marketplace boolean, status text, expires_on date)
language sql stable security definer set search_path = '' as $$
  with ws as (
    select w.id, w.capabilities, upper(coalesce(nullif(w.settings->'business'->>'country_code', ''), case w.settings->'business'->>'country' when 'United Kingdom' then 'GB' when 'Ireland' then 'IE' when 'United States' then 'US' when 'Canada' then 'CA' when 'Germany' then 'DE' when 'France' then 'FR' when 'United Arab Emirates' then 'AE' when 'South Africa' then 'ZA' when 'Australia' then 'AU' end)) as country,
      coalesce(array(select jsonb_array_elements_text(w.settings->'business'->'service_categories')), '{}') as categories
    from public.workspaces w where w.id = p_workspace and public.is_workspace_member(w.id)
  ), applicable as (
    select distinct on (r.credential_key) r.credential_key, r.requirement, r.gates_marketplace
    from public.credential_requirements r, ws
    where (r.capability is null or r.capability = any(ws.capabilities))
      and (r.category is null or r.category = any(ws.categories))
      and (r.country is null or r.country = ws.country)
    order by r.credential_key, (r.requirement = 'required') desc, r.gates_marketplace desc
  )
  select a.credential_key, t.label, a.requirement, a.gates_marketplace,
    coalesce((select d.status from public.provider_documents d where d.workspace_id = p_workspace and d.credential_key = a.credential_key and d.status <> 'superseded' order by d.created_at desc limit 1), 'missing'),
    (select d.expires_on from public.provider_documents d where d.workspace_id = p_workspace and d.credential_key = a.credential_key and d.status = 'verified' order by d.created_at desc limit 1)
  from applicable a join public.credential_types t on t.key = a.credential_key
  order by (a.requirement = 'required') desc, t.label;
$$;
revoke all on function public.workspace_credential_status(uuid) from public, anon;
grant execute on function public.workspace_credential_status(uuid) to authenticated;

-- ---------------------------------------------------------------- verification records (§30)
create table if not exists public.verification_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('stripe_connect','stripe_identity','business_registration','manual_review')),
  status text not null check (status in ('unverified','pending','verified','action_required','restricted','suspended')),
  -- What exactly this verification establishes, shown verbatim next to any badge (§30 honest badges).
  scope text not null,
  evidence jsonb not null default '{}',
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists verification_records_ws_idx on public.verification_records(workspace_id, created_at desc);
alter table public.verification_records enable row level security;
revoke all on public.verification_records from anon, authenticated;
grant select on public.verification_records to authenticated;
drop policy if exists verification_records_read on public.verification_records;
create policy verification_records_read on public.verification_records for select to authenticated
  using (public.has_permission(workspace_id, 'settings.manage'));

-- ---------------------------------------------------------------- reliability (§32) — inputs auditable, shown coarsely
create table if not exists public.reliability_metrics (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  window_days integer not null default 180,
  requests_received integer not null default 0,
  requests_responded integer not null default 0,
  median_response_minutes integer,
  quotes_sent integer not null default 0,
  bookings_confirmed integer not null default 0,
  bookings_completed integer not null default 0,
  provider_cancellations integer not null default 0,
  no_shows integer not null default 0,
  disputes integer not null default 0,
  verified_reviews integer not null default 0,
  verified_rating numeric(3,2),
  computed_at timestamptz not null default now()
);
alter table public.reliability_metrics enable row level security;
revoke all on public.reliability_metrics from anon, authenticated;
grant select on public.reliability_metrics to authenticated;
drop policy if exists reliability_metrics_read on public.reliability_metrics;
create policy reliability_metrics_read on public.reliability_metrics for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Coarse public band instead of misleading precision (§32). Needs enough history to say anything.
create or replace function public.reliability_band(p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when m.workspace_id is null or m.requests_received < 5 then 'new'
    when (m.provider_cancellations + m.no_shows)::numeric / greatest(m.bookings_confirmed, 1) > 0.10 then 'at_risk'
    when m.requests_responded::numeric / greatest(m.requests_received, 1) >= 0.9 and coalesce(m.median_response_minutes, 9999) <= 240
      and (m.provider_cancellations + m.no_shows) = 0 and m.bookings_completed >= 5 then 'excellent'
    when m.requests_responded::numeric / greatest(m.requests_received, 1) >= 0.75 then 'good'
    else 'developing' end
  from (select p_workspace as id) x left join public.reliability_metrics m on m.workspace_id = x.id;
$$;
grant execute on function public.reliability_band(uuid) to anon, authenticated;

-- Recomputes metrics from canonical records (service role; scheduled).
create or replace function public.recompute_reliability(p_workspace uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare since timestamptz := now() - interval '180 days';
begin
  insert into public.reliability_metrics as r (workspace_id, requests_received, requests_responded, quotes_sent, bookings_confirmed, bookings_completed, provider_cancellations, verified_reviews, verified_rating, computed_at)
  select p_workspace,
    (select count(*) from public.build_items b join public.listings l on l.id = b.listing_id where l.workspace_id = p_workspace and b.created_at > since and b.status not in ('suggested','draft')),
    (select count(*) from public.build_items b join public.listings l on l.id = b.listing_id where l.workspace_id = p_workspace and b.created_at > since and b.status not in ('suggested','draft','sent','awaiting','expired','expired_no_response')),
    (select count(*) from public.provider_quotes q where q.workspace_id = p_workspace and q.sent_at > since),
    (select count(*) from public.provider_jobs j where j.workspace_id = p_workspace and j.created_at > since and j.status in ('confirmed','active','completed')),
    (select count(*) from public.provider_jobs j where j.workspace_id = p_workspace and j.created_at > since and j.status = 'completed'),
    (select count(*) from public.provider_jobs j where j.workspace_id = p_workspace and j.created_at > since and j.status in ('cancelled_by_provider')),
    (select count(*) from public.reviews v join public.listings l on l.id = v.listing_id where l.workspace_id = p_workspace and v.build_item_id is not null and v.status = 'published'),
    (select round(avg(v.rating)::numeric, 2) from public.reviews v join public.listings l on l.id = v.listing_id where l.workspace_id = p_workspace and v.build_item_id is not null and v.status = 'published'),
    now()
  on conflict (workspace_id) do update set requests_received = excluded.requests_received, requests_responded = excluded.requests_responded,
    quotes_sent = excluded.quotes_sent, bookings_confirmed = excluded.bookings_confirmed, bookings_completed = excluded.bookings_completed,
    provider_cancellations = excluded.provider_cancellations, verified_reviews = excluded.verified_reviews, verified_rating = excluded.verified_rating, computed_at = now();
end;
$$;
revoke all on function public.recompute_reliability(uuid) from public, anon, authenticated;
grant execute on function public.recompute_reliability(uuid) to service_role;

commit;
