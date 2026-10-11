-- Phase 3: Provider workspace operations and the Platform Admin control plane.
-- Extends the Phase 1 (auth/onboarding) and Phase 2 (events domain) schema. Nothing is redefined:
--   * build_items stays the canonical request → quote → hold → booking line between an event and a provider listing.
--   * crew_members / shifts are the team; transactions / payments are money; agent_runs / approvals / routines are the Agent.
-- New provider-only records: spaces, packages, availability_blocks, provider_quotes (versioned), provider_jobs
-- (fulfilment record, 1:1 with a confirmed build_item or a direct booking), venue_structures (provider-owned map).
-- New admin-only records: admin permissions, support/trust cases, partners, integrations, versioned platform settings.
begin;

create extension if not exists btree_gist;

-- ════════════════════════ Helpers ════════════════════════
-- Provider membership for a listing (security definer so policies avoid RLS recursion).
create or replace function public.is_listing_provider(p_listing uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.listings l where l.id = p_listing and public.is_workspace_member(l.workspace_id));
$$;
-- A provider may see an event only once one of its listings has actually been sent a request for it.
create or replace function public.is_provider_for_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.build_items b join public.listings l on l.id = b.listing_id
    where b.event_id = p_event and b.status not in ('suggested','draft') and public.is_workspace_member(l.workspace_id));
$$;
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;
create or replace function public.require_provider_role(p_ws uuid, p_roles text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.workspaces w where w.id = p_ws and w.kind = 'provider') or not public.has_workspace_role(p_ws, p_roles) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end $$;

-- ════════════════════════ Admin permissions & identity status ════════════════════════
alter table public.platform_admins
  add column if not exists title text not null default 'Platform Admin',
  add column if not exists permissions text[] not null default '{}',
  add column if not exists created_at timestamptz not null default now();
do $$ begin
  alter table public.platform_admins add constraint platform_admins_permissions_check check (permissions <@ array[
    'support','trust','commerce','users','workspaces','events','marketplace','tickets','partners','settings','agent_ops','analytics','audit']::text[]);
exception when duplicate_object then null; end $$;
create or replace function public.has_admin_permission(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.platform_admins where user_id = (select auth.uid()) and p = any(permissions));
$$;

alter table public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists identity_verified boolean not null default false,
  add column if not exists avatar_url text not null default '',
  add column if not exists last_active_at timestamptz;
do $$ begin
  alter table public.profiles add constraint profiles_status_check check (status in ('active','restricted'));
exception when duplicate_object then null; end $$;

alter table public.workspaces
  add column if not exists plan text not null default 'starter',
  add column if not exists commission_bps integer not null default 1200,
  add column if not exists cover_image text not null default '';
do $$ begin
  alter table public.workspaces add constraint workspaces_plan_check check (plan in ('starter','pro','business','enterprise'));
  alter table public.workspaces add constraint workspaces_commission_check check (commission_bps between 0 and 5000);
exception when duplicate_object then null; end $$;

-- Listings: paused state and booking mode (publication itself stays behind publish_listing()).
alter table public.listings
  add column if not exists paused_at timestamptz,
  add column if not exists review_status text not null default 'pending',
  add column if not exists booking_mode text not null default 'request',
  add column if not exists views integer not null default 0,
  add column if not exists enquiry_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table public.listings add constraint listings_review_status_check check (review_status in ('pending','approved','changes_requested','restricted','suspended'));
  alter table public.listings add constraint listings_booking_mode_check check (booking_mode in ('instant','request','enquiry'));
exception when duplicate_object then null; end $$;

-- ════════════════════════ Provider resources ════════════════════════
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  venue_id uuid not null references public.listings(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  status text not null default 'draft' check (status in ('draft','published','paused')),
  indoor boolean not null default true,
  area_sqm numeric(8,1),
  capacity_standing integer check (capacity_standing >= 0),
  capacity_seated integer check (capacity_seated >= 0),
  layouts jsonb not null default '{}',
  amenities text[] not null default '{}',
  turnaround_minutes integer not null default 60 check (turnaround_minutes >= 0),
  min_hours numeric(4,1) not null default 2 check (min_hours > 0),
  exclusive_group text,
  rate_hourly numeric(12,2) check (rate_hourly >= 0),
  image text not null default '',
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists spaces_venue_idx on public.spaces(venue_id);
create index if not exists spaces_ws_idx on public.spaces(workspace_id);

create table if not exists public.venue_structures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  venue_id uuid not null references public.listings(id) on delete cascade,
  version integer not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  elements jsonb not null default '[]',
  created_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (venue_id, version)
);
create unique index if not exists venue_structures_one_published on public.venue_structures(venue_id) where status = 'published';

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  status text not null default 'draft' check (status in ('draft','published','paused')),
  description text not null default '',
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  price_basis text not null default 'fixed' check (price_basis in ('fixed','per_person','hourly')),
  currency text not null default 'GBP',
  min_guests integer, max_guests integer,
  duration_hours numeric(4,1),
  deposit_pct integer not null default 30 check (deposit_pct between 0 and 100),
  booking_mode text not null default 'request' check (booking_mode in ('instant','request','enquiry')),
  inclusions jsonb not null default '[]',
  add_ons jsonb not null default '[]',
  space_ids uuid[] not null default '{}',
  image text not null default '',
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (max_guests is null or min_guests is null or max_guests >= min_guests)
);
create index if not exists packages_listing_idx on public.packages(listing_id);

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  crew_id uuid references public.crew_members(id) on delete cascade,
  kind text not null check (kind in ('blocked','open','emergency_window','maintenance')),
  starts_at timestamptz not null, ends_at timestamptz not null,
  note text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists availability_ws_idx on public.availability_blocks(workspace_id, starts_at);

-- Versioned commercial quotes against a build item. The latest sent version is mirrored to build_items.quote.
create table if not exists public.provider_quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  build_item_id uuid not null references public.build_items(id) on delete cascade,
  reference text not null,
  version integer not null,
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','declined','withdrawn','expired','superseded')),
  items jsonb not null default '[]',
  subtotal numeric(12,2) not null default 0, tax numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
  currency text not null default 'GBP',
  deposit_pct integer not null default 30 check (deposit_pct between 0 and 100),
  valid_until date,
  terms jsonb not null default '{}',
  message text not null default '',
  created_by uuid references auth.users(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (build_item_id, version)
);

-- Provider fulfilment record: venue BEO or supplier job. Either linked 1:1 to a confirmed build item,
-- or a direct booking the provider created itself.
create table if not exists public.provider_jobs (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  build_item_id uuid unique references public.build_items(id) on delete restrict,
  event_id uuid references public.events(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  space_id uuid references public.spaces(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  mode text not null default 'venue' check (mode in ('venue','service')),
  client_name text not null, client_org text not null default '', client_email text not null default '',
  event_name text not null, event_type text not null default 'custom',
  starts_at timestamptz not null, ends_at timestamptz not null,
  guests integer, location text not null default '', layout text not null default '',
  status text not null default 'confirmed' check (status in ('held','confirmed','active','completed','cancelled','no_show')),
  role text not null default 'primary' check (role in ('primary','backup','standby')),
  value numeric(12,2) not null default 0 check (value >= 0),
  platform_fee numeric(12,2) not null default 0,
  net_payout numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  currency text not null default 'GBP',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','deposit_paid','part_paid','paid','refunded','failed')),
  source text not null default 'marketplace' check (source in ('marketplace','direct','emergency','standby')),
  next_action text not null default '', next_action_due timestamptz,
  commercial_snapshot jsonb not null default '{}',
  details jsonb not null default '{}',
  image text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists provider_jobs_ws_idx on public.provider_jobs(workspace_id, starts_at);
do $$ begin
  -- Hard bookings on the same space can never overlap (holds and confirmed primary commitments).
  alter table public.provider_jobs add constraint provider_jobs_no_space_overlap exclude using gist (
    space_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (space_id is not null and status in ('held','confirmed','active') and role = 'primary');
exception when duplicate_object then null; end $$;
create or replace function public.protect_job_snapshot() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.commercial_snapshot <> '{}'::jsonb and new.commercial_snapshot is distinct from old.commercial_snapshot then
    raise exception 'commercial_snapshot_immutable' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists provider_jobs_protect_snapshot on public.provider_jobs;
create trigger provider_jobs_protect_snapshot before update on public.provider_jobs for each row execute function public.protect_job_snapshot();

-- Team assignments reuse Phase 2 shifts; a shift may now point at the provider job it staffs.
alter table public.shifts add column if not exists job_id uuid references public.provider_jobs(id) on delete cascade;
create index if not exists shifts_job_idx on public.shifts(job_id);

-- Ledger enrichment so Admin Commerce can separate GMV, fees and net. Additive and nullable.
alter table public.transactions
  add column if not exists source text not null default 'marketplace',
  add column if not exists fee_amount numeric(12,2) not null default 0,
  add column if not exists net_amount numeric(12,2),
  add column if not exists currency text not null default 'GBP',
  add column if not exists counterparty text not null default '',
  add column if not exists stripe_ref text;
do $$ begin
  alter table public.transactions add constraint transactions_source_check check (source in ('marketplace','ticketing','subscription','resale','partner','manual'));
exception when duplicate_object then null; end $$;

-- Agent surfaces: one runtime, scoped per surface.
alter table public.agent_runs
  add column if not exists surface text not null default 'organizer',
  add column if not exists changes jsonb not null default '[]',
  add column if not exists retries integer not null default 0,
  add column if not exists cost_cents integer not null default 0,
  add column if not exists routine_id uuid references public.agent_routines(id) on delete set null,
  add column if not exists finished_at timestamptz;
do $$ begin
  alter table public.agent_runs add constraint agent_runs_surface_check check (surface in ('customer','organizer','provider','admin'));
exception when duplicate_object then null; end $$;
alter table public.agent_approvals add column if not exists expires_at timestamptz;
alter table public.agent_routines
  add column if not exists suggested boolean not null default false,
  add column if not exists approval_policy text not null default 'required',
  add column if not exists last_run_at timestamptz,
  add column if not exists last_result text not null default '';

-- ════════════════════════ Admin control plane ════════════════════════
create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  subject text not null,
  category text not null check (category in ('booking','ticketing','payment','account','technical','no_show','emergency','refund','other')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status text not null default 'open' check (status in ('open','waiting','escalated','resolved')),
  requester_id uuid references auth.users(id) on delete set null,
  requester_name text not null default '',
  workspace_id uuid references public.workspaces(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete set null,
  assignee_name text not null default '',
  sla_due_at timestamptz,
  related jsonb not null default '{}',
  amount numeric(12,2),
  outcome text, resolution_reason text,
  created_at timestamptz not null default now(), resolved_at timestamptz,
  check (status <> 'resolved' or (outcome is not null and resolution_reason is not null))
);
create index if not exists support_cases_status_idx on public.support_cases(status, priority, created_at desc);
create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.support_cases(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author text not null, body text not null check (length(body) between 1 and 5000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.trust_cases (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  queue text not null check (queue in ('verification','reliability','fraud','appeal')),
  category text not null default '',
  subject_type text not null check (subject_type in ('user','workspace','listing','event','ticket','review')),
  subject_id uuid, subject_name text not null,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  status text not null default 'open' check (status in ('open','in_review','actioned','dismissed','appealed')),
  reason text not null,
  evidence jsonb not null default '[]',
  decision text, decided_by uuid references auth.users(id), decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trust_cases_queue_idx on public.trust_cases(queue, status, created_at desc);
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('affiliate','strategic')),
  status text not null default 'active' check (status in ('pending','active','paused','terminated')),
  referral_code text unique,
  commission_bps integer not null default 1000 check (commission_bps between 0 and 5000),
  commission_basis text not null default 'net_platform_revenue' check (commission_basis in ('net_platform_revenue','subscription_revenue','fixed_bounty')),
  referrals integer not null default 0,
  eligible_revenue numeric(12,2) not null default 0,
  earned numeric(12,2) not null default 0, paid numeric(12,2) not null default 0,
  quality_score integer check (quality_score between 0 and 100),
  logo text not null default '',
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'connector',
  status text not null default 'healthy' check (status in ('healthy','degraded','down','disabled')),
  metrics jsonb not null default '{}',
  logo text not null default '',
  updated_at timestamptz not null default now()
);
create table if not exists public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('general','commerce','marketplace','ticketing','trust','agent','communications','integrations')),
  version integer not null,
  status text not null default 'draft' check (status in ('draft','published','superseded')),
  value jsonb not null default '{}',
  effective_at timestamptz,
  change_reason text not null default '',
  created_by uuid references auth.users(id), approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (section, version)
);
create unique index if not exists platform_settings_one_published on public.platform_settings(section) where status = 'published';

-- ════════════════════════ RLS ════════════════════════
do $$ declare t text; begin
  foreach t in array array['spaces','venue_structures','packages','availability_blocks','provider_quotes','provider_jobs',
    'support_cases','support_messages','trust_cases','partners','integrations','platform_settings'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['spaces','venue_structures','packages','availability_blocks','provider_quotes','provider_jobs'] loop
    execute format('create policy %1$s_member_read on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id) or public.is_platform_admin())', t);
  end loop;
end $$;
-- Public catalogue reads only published resources of published listings.
create policy spaces_public_read on public.spaces for select to anon, authenticated
  using (status = 'published' and exists(select 1 from public.listings l where l.id = venue_id and l.published));
create policy packages_public_read on public.packages for select to anon, authenticated
  using (status = 'published' and exists(select 1 from public.listings l where l.id = listing_id and l.published));
create policy venue_structures_public_read on public.venue_structures for select to anon, authenticated using (status = 'published');

-- Provider visibility into Phase 2 records addressed to its listings (read-only; writes via RPCs below).
create policy build_items_provider_read on public.build_items for select to authenticated
  using (listing_id is not null and status not in ('suggested','draft') and public.is_listing_provider(listing_id));
create policy provider_requests_provider_read on public.provider_requests for select to authenticated
  using (exists(select 1 from public.build_items b where b.request_id = provider_requests.id and b.status not in ('suggested','draft') and public.is_listing_provider(b.listing_id)));
create policy events_provider_read on public.events for select to authenticated using (public.is_provider_for_event(id));
create policy threads_provider_read on public.threads for select to authenticated using (listing_id is not null and public.is_listing_provider(listing_id));
create policy messages_provider_rw on public.messages for all to authenticated
  using (exists(select 1 from public.threads t where t.id = thread_id and t.listing_id is not null and public.is_listing_provider(t.listing_id)))
  with check (sender_id = (select auth.uid()) and from_provider and exists(select 1 from public.threads t where t.id = thread_id and t.listing_id is not null and public.is_listing_provider(t.listing_id)));
create policy reviews_provider_read on public.reviews for select to authenticated using (listing_id is not null and public.is_listing_provider(listing_id));

-- Admin read access, split by permission.
create policy admins_admin_read on public.platform_admins for select to authenticated using (public.is_platform_admin());
create policy profiles_admin_read on public.profiles for select to authenticated using (public.has_admin_permission('users') or public.has_admin_permission('support'));
create policy workspaces_admin_read on public.workspaces for select to authenticated using (public.is_platform_admin());
create policy members_admin_read on public.workspace_members for select to authenticated using (public.has_admin_permission('users') or public.has_admin_permission('workspaces'));
create policy listings_admin_read on public.listings for select to authenticated using (public.is_platform_admin());
create policy audit_admin_read on public.audit_events for select to authenticated using (public.has_admin_permission('audit'));
create policy events_admin_read on public.events for select to authenticated using (public.has_admin_permission('events') or public.has_admin_permission('tickets'));
create policy build_items_admin_read on public.build_items for select to authenticated using (public.has_admin_permission('marketplace') or public.has_admin_permission('support'));
create policy tiers_admin_read on public.ticket_tiers for select to authenticated using (public.has_admin_permission('tickets'));
create policy tickets_admin_read on public.tickets for select to authenticated using (public.has_admin_permission('tickets'));
create policy check_ins_admin_read on public.check_ins for select to authenticated using (public.has_admin_permission('tickets'));
create policy transactions_admin_read on public.transactions for select to authenticated using (public.has_admin_permission('commerce'));
create policy payments_admin_read on public.payments for select to authenticated using (public.has_admin_permission('commerce'));
create policy agent_runs_admin_read on public.agent_runs for select to authenticated using (public.has_admin_permission('agent_ops'));
create policy agent_approvals_admin_read on public.agent_approvals for select to authenticated using (public.has_admin_permission('agent_ops'));
create policy reviews_admin_read on public.reviews for select to authenticated using (public.has_admin_permission('trust'));
create policy support_read on public.support_cases for select to authenticated using (requester_id = (select auth.uid()) or public.has_admin_permission('support'));
create policy support_messages_read on public.support_messages for select to authenticated using (public.has_admin_permission('support')
  or (not internal and exists(select 1 from public.support_cases c where c.id = case_id and c.requester_id = (select auth.uid()))));
create policy trust_read on public.trust_cases for select to authenticated using (public.has_admin_permission('trust'));
create policy partners_read on public.partners for select to authenticated using (user_id = (select auth.uid()) or public.has_admin_permission('partners'));
create policy integrations_read on public.integrations for select to authenticated using (public.is_platform_admin());
create policy settings_read on public.platform_settings for select to authenticated using (public.is_platform_admin());

-- Writes to the new tables happen only through the validated functions below.
revoke all on public.spaces, public.venue_structures, public.packages, public.availability_blocks, public.provider_quotes, public.provider_jobs,
  public.support_cases, public.support_messages, public.trust_cases, public.partners, public.integrations, public.platform_settings from anon, authenticated;
grant select on public.spaces, public.venue_structures, public.packages, public.availability_blocks, public.provider_quotes, public.provider_jobs,
  public.support_cases, public.support_messages, public.trust_cases, public.partners, public.integrations, public.platform_settings to authenticated;
grant select on public.spaces, public.packages, public.venue_structures to anon;

-- ════════════════════════ Provider domain functions ════════════════════════
-- Respond to a request addressed to one of our listings. Deadlines are server time; a late reply is refused
-- and the item becomes expired (never "declined").
create or replace function public.provider_respond(p_item uuid, p_response text, p_note text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare b public.build_items; l public.listings; e public.events; conflicts integer;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into l from public.listings where id = b.listing_id;
  perform public.require_provider_role(l.workspace_id, array['owner','manager','member']);
  if p_response not in ('available','unavailable','declined','clarification') then raise exception 'invalid_response' using errcode = '22023'; end if;
  if b.status not in ('sent','awaiting','clarification') then raise exception 'not_open:%', b.status using errcode = '22023'; end if;
  if b.response_deadline is not null and b.response_deadline < now() then
    update public.build_items set status = 'expired', updated_at = now() where id = b.id;
    return 'expired';
  end if;
  if p_response = 'available' then
    select * into e from public.events where id = b.event_id;
    select count(*) into conflicts from public.provider_jobs j
      where j.listing_id = b.listing_id and j.status in ('held','confirmed','active') and j.role = 'primary'
        and e.starts_at is not null and tstzrange(j.starts_at, j.ends_at) && tstzrange(e.starts_at, coalesce(e.ends_at, e.starts_at + interval '6 hours'))
        and l.kind = 'venue' and (select count(*) from public.spaces s where s.venue_id = l.id) <= 1;
    if conflicts > 0 then raise exception 'hard_conflict' using errcode = '23P01'; end if;
  end if;
  update public.build_items set status = p_response, updated_at = now(),
    notes = case when length(trim(coalesce(p_note,''))) > 0 then left(p_note, 2000) else notes end where id = b.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), l.workspace_id, 'request.responded', jsonb_build_object('build_item_id', b.id, 'response', p_response));
  return p_response;
end $$;

-- Issue a versioned quote with server-calculated totals; mirrors the sent version onto the build item.
create or replace function public.provider_issue_quote(p_item uuid, p_items jsonb, p_tax_bps integer, p_deposit_pct integer,
  p_valid_days integer, p_terms jsonb, p_message text, p_send boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare b public.build_items; l public.listings; v integer; sub numeric; tx numeric; qid uuid; ref text;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into l from public.listings where id = b.listing_id;
  perform public.require_provider_role(l.workspace_id, array['owner','manager']);
  if b.status not in ('sent','awaiting','clarification','available','quoted') then raise exception 'not_quotable:%', b.status using errcode = '22023'; end if;
  if b.response_deadline is not null and b.response_deadline < now() and b.status in ('sent','awaiting') then
    update public.build_items set status = 'expired', updated_at = now() where id = b.id;
    raise exception 'request_expired' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'items_required' using errcode = '22023'; end if;
  select coalesce(sum(greatest(coalesce((i->>'qty')::numeric, 1), 0) * greatest(coalesce((i->>'unit_price')::numeric, 0), 0)), 0)
    into sub from jsonb_array_elements(p_items) i;
  tx := round(sub * greatest(least(coalesce(p_tax_bps, 0), 10000), 0) / 10000.0, 2);
  select coalesce(max(version), 0) + 1 into v from public.provider_quotes where build_item_id = b.id;
  ref := 'Q-' || upper(substr(replace(b.id::text, '-', ''), 1, 6));
  update public.provider_quotes set status = 'superseded' where build_item_id = b.id and status in ('draft','sent','viewed');
  insert into public.provider_quotes(workspace_id, build_item_id, reference, version, status, items, subtotal, tax, total, deposit_pct, valid_until, terms, message, created_by, sent_at)
    values (l.workspace_id, b.id, ref, v, case when p_send then 'sent' else 'draft' end, p_items, sub, tx, sub + tx,
      greatest(least(coalesce(p_deposit_pct, 30), 100), 0), current_date + greatest(coalesce(p_valid_days, 14), 1),
      coalesce(p_terms, '{}'), left(coalesce(p_message, ''), 4000), auth.uid(), case when p_send then now() end)
    returning id into qid;
  if p_send then
    update public.build_items set status = 'quoted', amount = sub + tx, deposit = round((sub + tx) * greatest(least(coalesce(p_deposit_pct, 30), 100), 0) / 100.0, 2),
      price_basis = 'quote', quote = jsonb_build_object('quote_id', qid, 'reference', ref, 'version', v, 'items', p_items, 'subtotal', sub, 'tax', tx,
        'total', sub + tx, 'valid_until', current_date + greatest(coalesce(p_valid_days, 14), 1), 'terms', coalesce(p_terms, '{}'), 'message', left(coalesce(p_message, ''), 4000)),
      updated_at = now() where id = b.id;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), l.workspace_id, case when p_send then 'quote.sent' else 'quote.drafted' end, jsonb_build_object('quote_id', qid, 'version', v, 'total', sub + tx));
  return qid;
end $$;

create or replace function public.provider_withdraw_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.provider_quotes;
begin
  select * into q from public.provider_quotes where id = p_quote for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(q.workspace_id, array['owner','manager']);
  if q.status not in ('draft','sent','viewed') then raise exception 'not_withdrawable' using errcode = '22023'; end if;
  update public.provider_quotes set status = 'withdrawn' where id = q.id;
  update public.build_items set status = 'available', updated_at = now() where id = q.build_item_id and status = 'quoted';
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), q.workspace_id, 'quote.withdrawn', jsonb_build_object('quote_id', q.id));
end $$;

-- Provider releases a conditional hold early (the date becomes free; the offer stays open).
create or replace function public.provider_release_hold(p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.build_items; ws uuid;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select workspace_id into ws from public.listings where id = b.listing_id;
  perform public.require_provider_role(ws, array['owner','manager']);
  if b.status <> 'held' then raise exception 'not_held' using errcode = '22023'; end if;
  update public.build_items set status = 'available', hold_expires_at = null, updated_at = now() where id = b.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), ws, 'hold.released', jsonb_build_object('build_item_id', b.id));
end $$;

-- When an event side confirms a build item, the provider's fulfilment job is created with an immutable snapshot.
create or replace function public.create_job_for_confirmed_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l public.listings; e public.events; ws public.workspaces; fee numeric;
begin
  if new.status <> 'confirmed' or old.status = 'confirmed' or new.listing_id is null then return new; end if;
  select * into l from public.listings where id = new.listing_id;
  select * into ws from public.workspaces where id = l.workspace_id;
  select * into e from public.events where id = new.event_id;
  if exists(select 1 from public.provider_jobs where build_item_id = new.id) then return new; end if;
  fee := round(coalesce(new.amount, 0) * ws.commission_bps / 10000.0, 2);
  insert into public.provider_jobs(reference, workspace_id, build_item_id, event_id, listing_id, mode, client_name, event_name, event_type,
      starts_at, ends_at, guests, location, status, role, value, platform_fee, net_payout, source, commercial_snapshot, image)
    values ('BK-' || upper(substr(replace(new.id::text, '-', ''), 1, 6)), l.workspace_id, new.id, e.id, l.id, l.kind,
      coalesce(nullif(e.client_name, ''), 'Event client'), e.name, e.event_type,
      coalesce(e.starts_at, now()), coalesce(e.ends_at, coalesce(e.starts_at, now()) + interval '6 hours'), e.guest_count, coalesce(nullif(e.location, ''), e.city),
      'confirmed', new.role, coalesce(new.amount, 0), fee, coalesce(new.amount, 0) - fee,
      case when new.role = 'standby' then 'standby' else 'marketplace' end,
      coalesce(new.terms_snapshot, '{}') || jsonb_build_object('commission_bps', ws.commission_bps, 'platform_fee', fee, 'quote', new.quote), coalesce(nullif(e.cover_image, ''), l.image));
  insert into public.audit_events(workspace_id, event, metadata) values (l.workspace_id, 'booking.created', jsonb_build_object('build_item_id', new.id, 'source', 'marketplace'));
  return new;
exception when exclusion_violation then raise exception 'hard_conflict' using errcode = '23P01';
end $$;
drop trigger if exists build_items_create_job on public.build_items;
create trigger build_items_create_job after update of status on public.build_items for each row execute function public.create_job_for_confirmed_item();

-- Direct venue booking (wizard PROV-W06). Occupancy and snapshot are one insert; the exclusion constraint refuses overlaps.
-- Creating a booking never marks anything paid.
create or replace function public.provider_create_booking(p_ws uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare jid uuid; v numeric; ws public.workspaces; fee numeric; sp public.spaces;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  select * into ws from public.workspaces where id = p_ws;
  v := greatest(coalesce((p->>'value')::numeric, 0), 0);
  if length(trim(coalesce(p->>'client_name', ''))) = 0 or length(trim(coalesce(p->>'event_name', ''))) = 0 then raise exception 'client_and_event_required' using errcode = '22023'; end if;
  if (p->>'space_id') is not null then
    select * into sp from public.spaces where id = (p->>'space_id')::uuid and workspace_id = p_ws;
    if not found then raise exception 'space_not_in_workspace' using errcode = '42501'; end if;
    if nullif(p->>'guests', '')::integer > greatest(coalesce(sp.capacity_standing, 0), coalesce(sp.capacity_seated, 0)) and greatest(coalesce(sp.capacity_standing, 0), coalesce(sp.capacity_seated, 0)) > 0 then
      raise exception 'over_capacity' using errcode = '22023';
    end if;
  end if;
  fee := round(v * ws.commission_bps / 10000.0, 2);
  insert into public.provider_jobs(reference, workspace_id, listing_id, space_id, package_id, mode, client_name, client_org, client_email, event_name, event_type,
      starts_at, ends_at, guests, location, layout, status, value, platform_fee, net_payout, source, commercial_snapshot, details, created_by)
    values ('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), p_ws, coalesce(nullif(p->>'listing_id', '')::uuid, sp.venue_id), sp.id,
      nullif(p->>'package_id', '')::uuid, 'venue', p->>'client_name', coalesce(p->>'client_org', ''), coalesce(p->>'client_email', ''), p->>'event_name',
      coalesce(nullif(p->>'event_type', ''), 'custom'), (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz, nullif(p->>'guests', '')::integer,
      coalesce(p->>'location', ''), coalesce(p->>'layout', ''), case when p->>'hold' = 'true' then 'held' else 'confirmed' end, v, fee, v - fee, 'direct',
      jsonb_build_object('value', v, 'commission_bps', ws.commission_bps, 'platform_fee', fee, 'deposit_pct', coalesce((p->>'deposit_pct')::integer, 30),
        'cancellation', coalesce(p->'cancellation', '{}'), 'items', coalesce(p->'items', '[]'), 'captured_at', now()),
      coalesce(p->'details', '{}'), auth.uid())
    returning id into jid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'booking.created', jsonb_build_object('job_id', jid, 'source', 'direct'));
  return jid;
exception when exclusion_violation then raise exception 'hard_conflict' using errcode = '23P01';
end $$;

-- Job lifecycle. Completion never implies settlement: payment_status changes only from payment-provider events.
create or replace function public.provider_job_transition(p_job uuid, p_to text, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare j public.provider_jobs;
begin
  select * into j from public.provider_jobs where id = p_job for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(j.workspace_id, array['owner','manager','member']);
  if not ((j.status = 'held' and p_to in ('confirmed','cancelled')) or (j.status = 'confirmed' and p_to in ('active','cancelled'))
       or (j.status = 'active' and p_to in ('completed','cancelled'))) then
    raise exception 'invalid_transition:%->%', j.status, p_to using errcode = '22023';
  end if;
  if p_to = 'cancelled' and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.provider_jobs set status = p_to where id = j.id;
  if p_to = 'cancelled' and j.build_item_id is not null then
    update public.build_items set status = 'cancelled', updated_at = now() where id = j.build_item_id and status <> 'cancelled';
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), j.workspace_id, 'booking.' || p_to, jsonb_build_object('job_id', j.id, 'reason', left(coalesce(p_reason, ''), 500)));
end $$;

-- Pause / unpause a listing. Pausing never cancels commitments; publishing still goes through publish_listing().
create or replace function public.provider_pause_listing(p_listing uuid, p_pause boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.listings;
begin
  select * into l from public.listings where id = p_listing for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(l.workspace_id, array['owner','manager']);
  if l.review_status in ('restricted','suspended') then raise exception 'restricted_by_platform' using errcode = '42501'; end if;
  if p_pause then update public.listings set published = false, paused_at = now(), updated_at = now() where id = l.id;
  else update public.listings set paused_at = null, updated_at = now() where id = l.id; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), l.workspace_id, case when p_pause then 'listing.paused' else 'listing.unpaused' end, jsonb_build_object('listing_id', l.id));
end $$;

-- Availability blocks (open/block/emergency windows). Blocking cannot override a hard booking.
create or replace function public.provider_set_availability(p_ws uuid, p_kind text, p_starts timestamptz, p_ends timestamptz,
  p_listing uuid default null, p_space uuid default null, p_crew uuid default null, p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  perform public.require_provider_role(p_ws, array['owner','manager']);
  if p_kind not in ('blocked','open','emergency_window','maintenance') or p_ends <= p_starts then raise exception 'invalid_block' using errcode = '22023'; end if;
  if p_listing is not null and not exists(select 1 from public.listings where id = p_listing and workspace_id = p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_space is not null and not exists(select 1 from public.spaces where id = p_space and workspace_id = p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_crew is not null and not exists(select 1 from public.crew_members where id = p_crew and workspace_id = p_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.availability_blocks(workspace_id, listing_id, space_id, crew_id, kind, starts_at, ends_at, note, created_by)
    values (p_ws, p_listing, p_space, p_crew, p_kind, p_starts, p_ends, left(coalesce(p_note, ''), 500), auth.uid()) returning id into bid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'availability.' || p_kind, jsonb_build_object('block_id', bid));
  return bid;
end $$;

-- Assign a crew member to a job through the shared shifts table; refuses double-booking of the same person.
create or replace function public.provider_assign_crew(p_job uuid, p_crew uuid, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare j public.provider_jobs; sid uuid;
begin
  select * into j from public.provider_jobs where id = p_job;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(j.workspace_id, array['owner','manager']);
  if not exists(select 1 from public.crew_members where id = p_crew and workspace_id = j.workspace_id and status <> 'deactivated') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if exists(select 1 from public.shifts s where s.crew_id = p_crew and s.status in ('pending','confirmed') and tstzrange(s.starts_at, s.ends_at) && tstzrange(j.starts_at, j.ends_at)) then
    raise exception 'crew_conflict' using errcode = '23P01';
  end if;
  insert into public.shifts(workspace_id, event_id, crew_id, job_id, role, title, location, starts_at, ends_at, status)
    values (j.workspace_id, j.event_id, p_crew, j.id, coalesce(nullif(p_role, ''), 'Crew'), j.event_name, j.location, j.starts_at, j.ends_at, 'pending') returning id into sid;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), j.workspace_id, 'job.assigned', jsonb_build_object('job_id', j.id, 'crew_id', p_crew));
  return sid;
end $$;

-- Agent run control shared by Provider and Admin surfaces.
create or replace function public.agent_control_run(p_run uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs;
begin
  select * into r from public.agent_runs where id = p_run for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ((r.workspace_id is not null and public.has_workspace_role(r.workspace_id, array['owner','manager'])) or r.user_id = auth.uid()
          or (r.surface = 'admin' and public.has_admin_permission('agent_ops'))) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_action = 'pause' and r.status in ('queued','planning','running','waiting_external','scheduled') then update public.agent_runs set status = 'paused', updated_at = now() where id = r.id;
  elsif p_action = 'resume' and r.status = 'paused' then update public.agent_runs set status = 'queued', updated_at = now() where id = r.id;
  elsif p_action = 'cancel' and r.status not in ('completed','failed','cancelled') then
    update public.agent_runs set status = 'cancelled', finished_at = now(), updated_at = now() where id = r.id;
    update public.agent_approvals set status = 'expired' where run_id = r.id and status = 'pending';
  else raise exception 'invalid_run_action' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), r.workspace_id, 'agent.' || p_action, jsonb_build_object('run_id', r.id));
end $$;

-- ════════════════════════ Admin functions (permission + reason + audit) ════════════════════════
create or replace function public.admin_require(p_perm text, p_reason text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_permission(p_perm) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('users', p_reason);
  if p_status not in ('active','restricted') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'cannot_restrict_self' using errcode = '42501'; end if;
  update public.profiles set status = p_status where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.user_' || p_status, jsonb_build_object('user_id', p_user, 'reason', p_reason));
end $$;

create or replace function public.admin_set_workspace_status(p_ws uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('workspaces', p_reason);
  if p_status not in ('active','suspended') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.workspaces set status = p_status where id = p_ws;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_ws, 'admin.workspace_' || p_status, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_review_listing(p_listing uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.listings;
begin
  perform public.admin_require('marketplace', p_reason);
  select * into l from public.listings where id = p_listing for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_decision = 'approve' then update public.listings set review_status = 'approved', verified = true, updated_at = now() where id = l.id;
  elsif p_decision = 'request_changes' then update public.listings set review_status = 'changes_requested', updated_at = now() where id = l.id;
  elsif p_decision = 'restrict' then update public.listings set review_status = 'restricted', published = false, updated_at = now() where id = l.id;
  elsif p_decision = 'suspend' then update public.listings set review_status = 'suspended', published = false, updated_at = now() where id = l.id;
  else raise exception 'invalid_decision' using errcode = '22023'; end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), l.workspace_id, 'admin.listing_' || p_decision, jsonb_build_object('listing_id', l.id, 'reason', p_reason, 'appealable', p_decision in ('restrict','suspend','request_changes')));
end $$;

create or replace function public.admin_update_case(p_case uuid, p_status text, p_reason text, p_outcome text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('support', p_reason);
  if p_status not in ('open','waiting','escalated','resolved') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_status = 'resolved' and length(trim(coalesce(p_outcome, ''))) < 3 then raise exception 'outcome_required' using errcode = '22023'; end if;
  update public.support_cases set status = p_status, outcome = case when p_status = 'resolved' then p_outcome else outcome end,
    resolution_reason = case when p_status = 'resolved' then p_reason else resolution_reason end,
    resolved_at = case when p_status = 'resolved' then now() else null end where id = p_case;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.case_' || p_status, jsonb_build_object('case_id', p_case, 'reason', p_reason));
end $$;

create or replace function public.admin_assign_case(p_case uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.support_cases set assignee_id = auth.uid(),
    assignee_name = coalesce((select nullif(full_name, '') from public.profiles where id = auth.uid()), 'Support agent') where id = p_case;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.case_assigned', jsonb_build_object('case_id', p_case));
end $$;

create or replace function public.admin_reply_case(p_case uuid, p_body text, p_internal boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'body_required' using errcode = '22023'; end if;
  insert into public.support_messages(case_id, author_id, author, body, internal)
    values (p_case, auth.uid(), coalesce((select nullif(full_name, '') from public.profiles where id = auth.uid()), 'Gala Dock Support'), left(p_body, 5000), p_internal);
end $$;

create or replace function public.admin_decide_trust(p_case uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('trust', p_reason);
  if p_decision not in ('in_review','actioned','dismissed') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  update public.trust_cases set status = p_decision, decision = p_reason, decided_by = auth.uid(), decided_at = now() where id = p_case;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.trust_' || p_decision, jsonb_build_object('case_id', p_case, 'reason', p_reason));
end $$;

create or replace function public.admin_set_partner_status(p_partner uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('partners', p_reason);
  if p_status not in ('active','paused','terminated') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.partners set status = p_status where id = p_partner;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.partner_' || p_status, jsonb_build_object('partner_id', p_partner, 'reason', p_reason));
end $$;

create or replace function public.admin_set_integration(p_id uuid, p_enabled boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('agent_ops', p_reason);
  update public.integrations set status = case when p_enabled then 'healthy' else 'disabled' end, updated_at = now() where id = p_id;
  insert into public.audit_events(actor_id, event, metadata)
    values (auth.uid(), case when p_enabled then 'admin.integration_enabled' else 'admin.integration_disabled' end, jsonb_build_object('integration_id', p_id, 'reason', p_reason));
end $$;

-- Versioned settings: publishing supersedes the live version; rollback republishes an earlier value as a new version.
create or replace function public.admin_publish_setting(p_section text, p_value jsonb, p_reason text, p_effective timestamptz default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  perform public.admin_require('settings', p_reason);
  if jsonb_typeof(p_value) <> 'object' then raise exception 'invalid_value' using errcode = '22023'; end if;
  select coalesce(max(version), 0) + 1 into v from public.platform_settings where section = p_section;
  update public.platform_settings set status = 'superseded' where section = p_section and status = 'published';
  insert into public.platform_settings(section, version, status, value, effective_at, change_reason, created_by, approved_by)
    values (p_section, v, 'published', p_value, coalesce(p_effective, now()), p_reason, auth.uid(), auth.uid());
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'admin.setting_published', jsonb_build_object('section', p_section, 'version', v, 'reason', p_reason));
  return v;
end $$;
create or replace function public.admin_rollback_setting(p_section text, p_version integer, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare val jsonb;
begin
  select value into val from public.platform_settings where section = p_section and version = p_version;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return public.admin_publish_setting(p_section, val, 'Rollback to v' || p_version || ': ' || p_reason);
end $$;

-- Admin may also decide Agent approvals raised on admin runs (Phase 2's decide_agent_approval covers workspace runs).
create or replace function public.admin_decide_agent_approval(p_approval uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.agent_approvals;
begin
  if not public.has_admin_permission('agent_ops') then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into a from public.agent_approvals where id = p_approval for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.workspace_id is not null then raise exception 'workspace_approval' using errcode = '42501'; end if;
  if a.status <> 'pending' then raise exception 'already_decided' using errcode = '22023'; end if;
  update public.agent_approvals set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now() where id = a.id;
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), case when p_approve then 'agent.approved' else 'agent.rejected' end, jsonb_build_object('approval_id', a.id));
end $$;

-- ════════════════════════ Grants ════════════════════════
revoke all on function public.is_listing_provider(uuid), public.is_provider_for_event(uuid), public.is_platform_admin(), public.has_admin_permission(text),
  public.require_provider_role(uuid, text[]), public.provider_respond(uuid, text, text),
  public.provider_issue_quote(uuid, jsonb, integer, integer, integer, jsonb, text, boolean), public.provider_withdraw_quote(uuid),
  public.provider_release_hold(uuid), public.create_job_for_confirmed_item(), public.provider_create_booking(uuid, jsonb),
  public.provider_job_transition(uuid, text, text), public.provider_pause_listing(uuid, boolean),
  public.provider_set_availability(uuid, text, timestamptz, timestamptz, uuid, uuid, uuid, text), public.provider_assign_crew(uuid, uuid, text),
  public.agent_control_run(uuid, text), public.admin_require(text, text), public.admin_set_user_status(uuid, text, text),
  public.admin_set_workspace_status(uuid, text, text), public.admin_review_listing(uuid, text, text), public.admin_update_case(uuid, text, text, text),
  public.admin_assign_case(uuid), public.admin_reply_case(uuid, text, boolean), public.admin_decide_trust(uuid, text, text),
  public.admin_set_partner_status(uuid, text, text), public.admin_set_integration(uuid, boolean, text),
  public.admin_publish_setting(text, jsonb, text, timestamptz), public.admin_rollback_setting(text, integer, text),
  public.admin_decide_agent_approval(uuid, boolean), public.protect_job_snapshot() from public, anon;
grant execute on function public.is_listing_provider(uuid), public.is_provider_for_event(uuid), public.is_platform_admin(), public.has_admin_permission(text),
  public.provider_respond(uuid, text, text), public.provider_issue_quote(uuid, jsonb, integer, integer, integer, jsonb, text, boolean),
  public.provider_withdraw_quote(uuid), public.provider_release_hold(uuid), public.provider_create_booking(uuid, jsonb),
  public.provider_job_transition(uuid, text, text), public.provider_pause_listing(uuid, boolean),
  public.provider_set_availability(uuid, text, timestamptz, timestamptz, uuid, uuid, uuid, text), public.provider_assign_crew(uuid, uuid, text),
  public.agent_control_run(uuid, text), public.admin_set_user_status(uuid, text, text), public.admin_set_workspace_status(uuid, text, text),
  public.admin_review_listing(uuid, text, text), public.admin_update_case(uuid, text, text, text), public.admin_assign_case(uuid),
  public.admin_reply_case(uuid, text, boolean), public.admin_decide_trust(uuid, text, text), public.admin_set_partner_status(uuid, text, text),
  public.admin_set_integration(uuid, boolean, text), public.admin_publish_setting(text, jsonb, text, timestamptz),
  public.admin_rollback_setting(text, integer, text), public.admin_decide_agent_approval(uuid, boolean) to authenticated;

commit;
