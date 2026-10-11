-- Phase 2: canonical event domain shared by the Customer App and the Organizer workspace.
-- One events table; consumer events are upgraded in place (workspace_id set, management -> professional).
-- Additive only. Financial history (transactions) is append-only.
begin;

-- ── Marketplace listing enrichment ──────────────────────────────────────────
alter table public.listings
  add column if not exists category text not null default '',
  add column if not exists city text not null default '',
  add column if not exists image text not null default '',
  add column if not exists gallery text[] not null default '{}',
  add column if not exists price_from numeric(12,2),
  add column if not exists price_unit text not null default 'per event',
  add column if not exists capacity_min integer,
  add column if not exists capacity_max integer,
  add column if not exists rating numeric(2,1) not null default 0,
  add column if not exists review_count integer not null default 0,
  add column if not exists response_hours integer not null default 24,
  add column if not exists verified boolean not null default false,
  add column if not exists instant_book boolean not null default false,
  add column if not exists emergency_supply boolean not null default false,
  add column if not exists badge text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists slug text,
  add column if not exists sponsored boolean not null default false;
create unique index if not exists listings_slug_key on public.listings(slug) where slug is not null;
create index if not exists listings_kind_published_idx on public.listings(kind, published);

-- ── Events ──────────────────────────────────────────────────────────────────
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  management text not null default 'consumer' check (management in ('consumer','professional')),
  name text not null check (length(name) between 1 and 120),
  slug text unique,
  event_type text not null default 'custom',
  visibility text not null default 'private' check (visibility in ('private','public')),
  status text not null default 'draft' check (status in ('draft','planning','ready','published','on_sale','live','completed','closed','archived','cancelled','postponed','suspended')),
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Europe/London',
  flexible_dates boolean not null default false,
  venue_listing_id uuid references public.listings(id) on delete set null,
  venue_name text not null default '',
  location text not null default '',
  city text not null default '',
  guest_count integer not null default 0 check (guest_count >= 0),
  adults integer, children integer,
  capacity integer check (capacity is null or capacity >= 0),
  budget_total numeric(12,2),
  revenue_goal numeric(12,2),
  target_profit numeric(12,2),
  currency text not null default 'GBP',
  description text not null default '',
  goal text not null default '',
  cover_image text not null default '',
  client_name text not null default '',
  tags text[] not null default '{}',
  priorities text[] not null default '{}',
  settings jsonb not null default '{}',
  lead_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (management = 'consumer' or workspace_id is not null)
);
create index if not exists events_owner_idx on public.events(owner_id, starts_at);
create index if not exists events_workspace_idx on public.events(workspace_id, starts_at);

-- Access: the customer owner, or an active member of the managing workspace.
create or replace function public.can_access_event(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.events e where e.id = target and (
    e.owner_id = (select auth.uid()) or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))));
$$;
-- Finance roles: owner/manager/finance only (crew and members cannot see money).
create or replace function public.has_workspace_role(target uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspaces w where w.id = target and w.status = 'active' and (
    w.owner_id = (select auth.uid()) or exists(select 1 from public.workspace_members m
      where m.workspace_id = w.id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role = any(roles))));
$$;
create or replace function public.can_see_event_money(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.events e where e.id = target and (
    e.owner_id = (select auth.uid()) or (e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager','finance']))));
$$;

-- ── Event build / supply chain (suggestion → request → quote → hold → booking) ──
create table if not exists public.provider_requests (
  id uuid primary key default gen_random_uuid(),
  reference text unique,
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  category text not null,
  title text not null,
  scope text not null default '',
  requirements jsonb not null default '{}',
  budget_min numeric(12,2), budget_max numeric(12,2),
  response_hours integer not null default 8 check (response_hours in (2,4,8,12,24,48,72)),
  response_deadline timestamptz,
  hold_strategy text not null default 'none' check (hold_strategy in ('none','conditional')),
  hold_hours integer,
  emergency boolean not null default false,
  status text not null default 'draft' check (status in ('draft','sent','closed','cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.build_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  request_id uuid references public.provider_requests(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  category text not null,
  title text not null,
  package text not null default '',
  scope text not null default '',
  image text not null default '',
  amount numeric(12,2),
  price_basis text not null default 'estimate' check (price_basis in ('estimate','quote','fixed','per_person')),
  deposit numeric(12,2) not null default 0,
  status text not null default 'suggested' check (status in ('suggested','draft','sent','awaiting','available','quoted','clarification','held','confirmed','standby','declined','unavailable','expired','cancelled','fulfilled')),
  role text not null default 'primary' check (role in ('primary','backup','standby')),
  response_deadline timestamptz,
  hold_expires_at timestamptz,
  quote jsonb not null default '{}',
  terms_snapshot jsonb,
  notes text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists build_items_event_idx on public.build_items(event_id, category);
create index if not exists build_items_request_idx on public.build_items(request_id);

-- ── Planning: programme, tasks, timeline ───────────────────────────────────
create table if not exists public.programme_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes integer not null default 30,
  title text not null,
  detail text not null default '',
  area text not null default '',
  kind text not null default 'programme' check (kind in ('programme','run_sheet','day_plan')),
  owner_name text not null default '',
  status text not null default 'upcoming' check (status in ('upcoming','in_progress','done')),
  image text not null default ''
);
create index if not exists programme_event_idx on public.programme_items(event_id, starts_at);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  detail text not null default '',
  category text not null default 'general',
  assignee_name text not null default '',
  due_at timestamptz,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  milestone boolean not null default false,
  created_at timestamptz not null default now(),
  check (event_id is not null or workspace_id is not null or owner_id is not null)
);
create index if not exists tasks_event_idx on public.tasks(event_id, due_at);
create index if not exists tasks_workspace_idx on public.tasks(workspace_id, due_at);

-- ── Guests ─────────────────────────────────────────────────────────────────
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  email text not null default '',
  phone text not null default '',
  status text not null default 'invited' check (status in ('draft','invited','confirmed','pending','declined')),
  plus_one boolean not null default false,
  tickets integer not null default 1,
  group_name text not null default '',
  dietary text not null default '',
  invited_at timestamptz,
  checked_in_at timestamptz
);
create index if not exists guests_event_idx on public.guests(event_id);

-- ── Ticketing: tiers, entitlements, discount codes, atomic inventory ───────
create table if not exists public.ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text not null default '',
  kind text not null default 'general' check (kind in ('general','vip','group','accessible','comp','student','press','early')),
  price numeric(10,2) not null default 0 check (price >= 0),
  quantity integer not null check (quantity >= 0),
  sold integer not null default 0 check (sold >= 0),
  held integer not null default 0 check (held >= 0),
  sale_start timestamptz, sale_end timestamptz,
  release_name text not null default '',
  order_limit integer not null default 10 check (order_limit between 1 and 100),
  allocation text not null default 'Main',
  status text not null default 'draft' check (status in ('draft','scheduled','on_sale','paused','sold_out','hidden')),
  badge text,
  color text not null default '#5b5bff',
  sort integer not null default 0,
  check (sold + held <= quantity)
);
create index if not exists tiers_event_idx on public.ticket_tiers(event_id, sort);
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete restrict,
  holder_id uuid references auth.users(id) on delete set null,
  attendee_name text not null default '',
  attendee_email text not null default '',
  order_ref text not null,
  seat text,
  status text not null default 'valid' check (status in ('valid','used','transferred','resale_listed','resold','refunded','cancelled')),
  qr_nonce text not null default encode(gen_random_bytes(16),'hex'),
  replaced_by uuid references public.tickets(id),
  price_paid numeric(10,2) not null default 0,
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tickets_holder_idx on public.tickets(holder_id);
create index if not exists tickets_event_idx on public.tickets(event_id);
create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  kind text not null default 'percent' check (kind in ('percent','amount')),
  amount numeric(10,2) not null check (amount > 0),
  valid_from timestamptz, valid_until timestamptz,
  max_uses integer, used integer not null default 0,
  status text not null default 'active' check (status in ('active','scheduled','expired','disabled')),
  unique(event_id, code)
);
create table if not exists public.check_ins (
  id bigint generated always as identity primary key,
  ticket_id uuid references public.tickets(id) on delete set null,
  event_id uuid not null references public.events(id) on delete cascade,
  scanned_by uuid references auth.users(id),
  result text not null check (result in ('admitted','duplicate','invalid','revoked')),
  created_at timestamptz not null default now()
);

-- ── Messaging (human) and notifications (transactional) ────────────────────
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  build_item_id uuid references public.build_items(id) on delete set null,
  kind text not null default 'supplier' check (kind in ('venue','supplier','team','support')),
  title text not null,
  subtitle text not null default '',
  image text not null default '',
  response_due_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null,
  from_provider boolean not null default false,
  body text not null check (length(body) between 1 and 5000),
  attachments jsonb not null default '[]',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on public.messages(thread_id, created_at);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text not null default '/',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- ── Money: payments schedule, append-only ledger, invoices ──────────────────
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  build_item_id uuid references public.build_items(id) on delete set null,
  payee text not null,
  kind text not null check (kind in ('deposit','balance','milestone','standby','emergency','ticket_payout','fee','refund')),
  amount numeric(12,2) not null,
  status text not null default 'scheduled' check (status in ('scheduled','due','processing','paid','overdue','refunded','cancelled')),
  due_at timestamptz,
  paid_at timestamptz,
  refundable boolean not null default false,
  stripe_payment_intent text,
  created_at timestamptz not null default now()
);
create index if not exists payments_event_idx on public.payments(event_id, due_at);
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  kind text not null check (kind in ('income','payment','refund','fee','payout')),
  category text not null default '',
  description text not null,
  amount numeric(12,2) not null,
  status text not null default 'completed' check (status in ('completed','pending','scheduled','partial','failed')),
  source_type text not null default 'manual',
  source_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists transactions_ws_idx on public.transactions(workspace_id, occurred_at desc);
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  event_id uuid references public.events(id) on delete set null,
  number text not null,
  client_name text not null,
  client_email text not null default '',
  client_address text not null default '',
  contact_name text not null default '',
  reference text not null default '',
  currency text not null default 'GBP',
  status text not null default 'draft' check (status in ('draft','sent','viewed','partial','paid','overdue','cancelled','credited')),
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  notes text not null default '',
  issued_at timestamptz,
  payment_token text unique default encode(gen_random_bytes(12),'hex'),
  created_at timestamptz not null default now(),
  unique(workspace_id, number)
);
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null, detail text not null default '',
  quantity numeric(10,2) not null default 1, unit_price numeric(12,2) not null, tax_rate numeric(5,2) not null default 20,
  sort integer not null default 0
);
create table if not exists public.invoice_installments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  label text not null, due_date date not null, amount numeric(12,2) not null,
  status text not null default 'scheduled' check (status in ('scheduled','sent','paid','overdue'))
);
create table if not exists public.invoice_events (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event text not null, detail text not null default '', created_at timestamptz not null default now()
);

-- ── Sales: leads and versioned proposals ───────────────────────────────────
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference text not null,
  name text not null,
  client_name text not null,
  contact_name text not null default '', contact_email text not null default '', contact_phone text not null default '',
  event_type text not null default 'custom',
  stage text not null default 'new' check (stage in ('new','qualified','proposal','negotiating','won','lost')),
  value numeric(12,2) not null default 0,
  probability integer not null default 10 check (probability between 0 and 100),
  expected_date date,
  location text not null default '',
  guests text not null default '',
  budget text not null default '',
  source text not null default 'Website enquiry',
  owner_name text not null default '',
  next_action text not null default '',
  next_action_at timestamptz,
  details jsonb not null default '{}',
  event_id uuid references public.events(id) on delete set null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  number text not null,
  title text not null,
  client_name text not null,
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','declined','withdrawn','expired','converted')),
  version integer not null default 1,
  valid_until date,
  subtotal numeric(12,2) not null default 0, tax numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
  deposit_pct integer not null default 30,
  signature_status text not null default 'not_signed',
  deposit_status text not null default 'not_paid',
  content jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(workspace_id, number)
);
create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  issued_by uuid references auth.users(id),
  issued_at timestamptz not null default now(),
  unique(proposal_id, version)
);

-- ── Team / crew / shifts ───────────────────────────────────────────────────
create table if not exists public.crew_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role text not null,
  member_type text not null default 'crew' check (member_type in ('member','crew')),
  email text not null default '', phone text not null default '',
  location text not null default '',
  bio text not null default '',
  skills text[] not null default '{}',
  day_rate numeric(10,2),
  status text not null default 'available' check (status in ('active','available','on_event','unavailable','deactivated')),
  avatar text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  crew_id uuid references public.crew_members(id) on delete cascade,
  role text not null,
  title text not null default '',
  location text not null default '',
  starts_at timestamptz not null, ends_at timestamptz not null,
  headcount integer not null default 1,
  status text not null default 'draft' check (status in ('draft','pending','confirmed','unavailable','travel')),
  check (ends_at > starts_at)
);
create index if not exists shifts_ws_idx on public.shifts(workspace_id, starts_at);
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  severity text not null default 'low' check (severity in ('low','medium','high','critical')),
  title text not null, detail text not null default '',
  status text not null default 'open' check (status in ('open','resolved')),
  reported_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ── Calendar entries (meetings, external) — other layers reference canonical sources ──
create table if not exists public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  layer text not null default 'meetings',
  title text not null, detail text not null default '',
  starts_at timestamptz not null, ends_at timestamptz,
  check (workspace_id is not null or owner_id is not null)
);

-- ── Promotion, promoters, media, venue maps, templates ─────────────────────
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  channel text not null, title text not null, content text not null default '',
  audience text not null default 'All users',
  scheduled_at timestamptz,
  est_reach text not null default '',
  cost numeric(10,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','ready','requires_approval','scheduled','sent','active','completed')),
  sponsored boolean not null default false,
  metrics jsonb not null default '{}'
);
create table if not exists public.promoters (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null, code text not null, commission_pct numeric(5,2) not null default 10,
  clicks integer not null default 0, tickets_sold integer not null default 0, revenue numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active','pending','paused')),
  unique(event_id, code)
);
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  kind text not null default 'poster',
  format text not null default 'A3',
  title text not null,
  url text not null default '',
  data jsonb not null default '{}',
  rights text not null default 'owned',
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','approved','published')),
  created_at timestamptz not null default now()
);
create table if not exists public.venue_maps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  version integer not null,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','published')),
  structure jsonb not null default '{}',
  overlay jsonb not null default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(event_id, version)
);
create table if not exists public.event_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_event_id uuid references public.events(id) on delete set null,
  name text not null, description text not null default '',
  event_types text[] not null default '{}',
  modules jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ── Reviews and saved collections ──────────────────────────────────────────
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  build_item_id uuid unique references public.build_items(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  ratings jsonb not null default '{}',
  body text not null default '' check (length(body) <= 1000),
  status text not null default 'published' check (status in ('published','pending','removed')),
  created_at timestamptz not null default now()
);

-- ── Gala Agent: durable runs, approvals, routines ─────────────────────────
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null check (length(goal) between 3 and 2000),
  scope text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued','planning','running','waiting_external','waiting_approval','scheduled','paused','completed','failed','cancelled')),
  plan jsonb not null default '[]',
  current_step integer not null default 0,
  progress integer not null default 0,
  waiting_reason text not null default '',
  next_wake_at timestamptz,
  result text not null default '',
  errors jsonb not null default '[]',
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  title text not null, detail text not null default '',
  action text not null,
  payload jsonb not null default '{}',
  impact text not null default '',
  amount numeric(12,2),
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  decided_by uuid references auth.users(id), decided_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.agent_routines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null, detail text not null default '', schedule text not null,
  enabled boolean not null default true, next_run_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['events','provider_requests','build_items','programme_items','tasks','guests','ticket_tiers','tickets','discount_codes','check_ins','threads','messages','notifications','payments','transactions','invoices','invoice_items','invoice_installments','invoice_events','leads','proposals','proposal_versions','crew_members','shifts','incidents','calendar_entries','promotions','promoters','media_assets','venue_maps','event_templates','reviews','agent_runs','agent_approvals','agent_routines']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Events
create policy events_read on public.events for select to authenticated using (public.can_access_event(id) or (visibility='public' and status in ('published','on_sale','live')));
create policy events_public_read on public.events for select to anon using (visibility='public' and status in ('published','on_sale','live'));
create policy events_insert on public.events for insert to authenticated with check (
  owner_id = (select auth.uid()) and (workspace_id is null or public.is_workspace_member(workspace_id)));
create policy events_update on public.events for update to authenticated using (public.can_access_event(id)) with check (
  (workspace_id is null and owner_id = (select auth.uid())) or (workspace_id is not null and public.is_workspace_member(workspace_id)));

-- Event-scoped children: full access for anyone who can access the event.
do $$ declare t text; begin
  foreach t in array array['provider_requests','build_items','programme_items','guests','ticket_tiers','discount_codes','threads','promotions','promoters','venue_maps','incidents']
  loop
    execute format('create policy %1$s_rw on public.%1$I for all to authenticated using (public.can_access_event(event_id)) with check (public.can_access_event(event_id))', t);
  end loop;
end $$;
create policy tiers_public_read on public.ticket_tiers for select to anon,authenticated using (exists(select 1 from public.events e where e.id = event_id and e.visibility='public' and e.status in ('published','on_sale','live')));
create policy messages_rw on public.messages for all to authenticated using (exists(select 1 from public.threads t where t.id = thread_id and public.can_access_event(t.event_id)))
  with check (sender_id = (select auth.uid()) and exists(select 1 from public.threads t where t.id = thread_id and public.can_access_event(t.event_id)));
create policy tasks_rw on public.tasks for all to authenticated using (
  (event_id is not null and public.can_access_event(event_id)) or (workspace_id is not null and public.is_workspace_member(workspace_id)) or owner_id = (select auth.uid()))
  with check ((event_id is not null and public.can_access_event(event_id)) or (workspace_id is not null and public.is_workspace_member(workspace_id)) or owner_id = (select auth.uid()));
create policy calendar_rw on public.calendar_entries for all to authenticated using (
  (workspace_id is not null and public.is_workspace_member(workspace_id)) or owner_id = (select auth.uid()))
  with check ((workspace_id is not null and public.is_workspace_member(workspace_id)) or owner_id = (select auth.uid()));
-- Tickets: holders see their own; event managers see the event's. Mutations only through RPCs.
create policy tickets_read on public.tickets for select to authenticated using (holder_id = (select auth.uid()) or public.can_access_event(event_id));
create policy check_ins_read on public.check_ins for select to authenticated using (public.can_access_event(event_id));
create policy notifications_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_mark on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Money: finance roles only. Payments are read-only to clients (status comes from Stripe webhooks / RPC).
create policy payments_read on public.payments for select to authenticated using (public.can_see_event_money(event_id));
create policy transactions_read on public.transactions for select to authenticated using (
  (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner','manager','finance'])) or (event_id is not null and public.can_see_event_money(event_id)));
create policy invoices_read on public.invoices for select to authenticated using (public.has_workspace_role(workspace_id, array['owner','manager','finance']));
create policy invoices_draft_write on public.invoices for insert to authenticated with check (public.has_workspace_role(workspace_id, array['owner','manager','finance']) and status = 'draft');
create policy invoices_draft_update on public.invoices for update to authenticated using (public.has_workspace_role(workspace_id, array['owner','manager','finance']) and status = 'draft')
  with check (public.has_workspace_role(workspace_id, array['owner','manager','finance']));
create policy invoice_items_rw on public.invoice_items for all to authenticated using (exists(select 1 from public.invoices i where i.id = invoice_id and public.has_workspace_role(i.workspace_id, array['owner','manager','finance'])))
  with check (exists(select 1 from public.invoices i where i.id = invoice_id and i.status = 'draft' and public.has_workspace_role(i.workspace_id, array['owner','manager','finance'])));
create policy invoice_inst_rw on public.invoice_installments for all to authenticated using (exists(select 1 from public.invoices i where i.id = invoice_id and public.has_workspace_role(i.workspace_id, array['owner','manager','finance'])))
  with check (exists(select 1 from public.invoices i where i.id = invoice_id and i.status = 'draft' and public.has_workspace_role(i.workspace_id, array['owner','manager','finance'])));
create policy invoice_events_read on public.invoice_events for select to authenticated using (exists(select 1 from public.invoices i where i.id = invoice_id and public.has_workspace_role(i.workspace_id, array['owner','manager','finance'])));
-- Workspace-scoped
do $$ declare t text; begin
  foreach t in array array['leads','crew_members','shifts','event_templates','agent_routines']
  loop
    execute format('create policy %1$s_rw on public.%1$I for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t);
  end loop;
end $$;
create policy proposals_read on public.proposals for select to authenticated using (public.is_workspace_member(workspace_id));
create policy proposals_draft_write on public.proposals for insert to authenticated with check (public.is_workspace_member(workspace_id) and status = 'draft');
create policy proposals_draft_update on public.proposals for update to authenticated using (public.is_workspace_member(workspace_id) and status = 'draft') with check (public.is_workspace_member(workspace_id));
create policy proposal_versions_read on public.proposal_versions for select to authenticated using (exists(select 1 from public.proposals p where p.id = proposal_id and public.is_workspace_member(p.workspace_id)));
create policy media_rw on public.media_assets for all to authenticated using ((event_id is not null and public.can_access_event(event_id)) or (workspace_id is not null and public.is_workspace_member(workspace_id)))
  with check ((event_id is not null and public.can_access_event(event_id)) or (workspace_id is not null and public.is_workspace_member(workspace_id)));
create policy reviews_public_read on public.reviews for select to anon,authenticated using (status = 'published' or user_id = (select auth.uid()));
create policy agent_runs_rw on public.agent_runs for select to authenticated using (user_id = (select auth.uid()) or (workspace_id is not null and public.is_workspace_member(workspace_id)));
create policy agent_approvals_read on public.agent_approvals for select to authenticated using ((workspace_id is not null and public.is_workspace_member(workspace_id)) or (event_id is not null and public.can_access_event(event_id)));

-- ── RPCs (atomic, server-authoritative) ────────────────────────────────────
-- Event readiness computed from event-type requirements and canonical records.
create or replace function public.event_readiness(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.events; checks jsonb := '[]'; done int := 0; total int := 0; c record;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode='42501'; end if;
  for c in select * from (values
    ('details','Event details & date', e.starts_at is not null and length(e.name) > 0, 'high'),
    ('venue','Venue confirmed', exists(select 1 from public.build_items b where b.event_id=p_event and b.category='venue' and b.status in ('confirmed','fulfilled')) or e.venue_listing_id is not null and exists(select 1 from public.build_items b where b.event_id=p_event and b.category='venue' and b.status='confirmed'), 'critical'),
    ('providers','Key providers confirmed', (select count(*) from public.build_items b where b.event_id=p_event and b.status in ('confirmed','fulfilled') and b.role='primary') >= greatest(2,(select count(distinct category) from public.build_items b where b.event_id=p_event and b.role='primary')), 'high'),
    ('guests','Guests or tickets set up', exists(select 1 from public.guests g where g.event_id=p_event) or exists(select 1 from public.ticket_tiers t where t.event_id=p_event), 'medium'),
    ('payments','No overdue payments', not exists(select 1 from public.payments p where p.event_id=p_event and p.status='overdue'), 'high'),
    ('tasks','Critical tasks complete', not exists(select 1 from public.tasks t where t.event_id=p_event and t.priority in ('high','critical') and t.status<>'done' and t.due_at < now()), 'medium')
  ) as v(key,label,ok,severity) loop
    total := total + 1; if c.ok then done := done + 1; end if;
    checks := checks || jsonb_build_object('key',c.key,'label',c.label,'ok',c.ok,'severity',c.severity);
  end loop;
  return jsonb_build_object('score', round(100.0*done/greatest(total,1)), 'checks', checks);
end; $$;

-- Atomic ticket purchase reservation: locks the tier row, enforces limits, issues unique entitlements.
-- Payment confirmation must come from Stripe; p_order_ref is the verified PaymentIntent/order id.
create or replace function public.issue_tickets(p_tier uuid, p_quantity int, p_order_ref text, p_attendee text, p_holder uuid)
returns setof public.tickets language plpgsql security definer set search_path = '' as $$
declare t public.ticket_tiers; i int; result public.tickets;
begin
  if p_holder is null then raise exception 'holder_required' using errcode='22023'; end if;
  if p_quantity < 1 then raise exception 'invalid_quantity' using errcode='22023'; end if;
  select * into t from public.ticket_tiers where id = p_tier for update;
  if not found then raise exception 'tier_not_found' using errcode='P0002'; end if;
  if t.status <> 'on_sale' then raise exception 'not_on_sale' using errcode='22023'; end if;
  if p_quantity > t.order_limit then raise exception 'order_limit' using errcode='22023'; end if;
  if t.sold + t.held + p_quantity > t.quantity then raise exception 'sold_out' using errcode='22023'; end if;
  if exists(select 1 from public.tickets where order_ref = p_order_ref) then
    return query select * from public.tickets where order_ref = p_order_ref; return; -- idempotent retry
  end if;
  update public.ticket_tiers set sold = sold + p_quantity, status = case when sold + held + p_quantity = quantity then 'sold_out' else status end where id = t.id;
  for i in 1..p_quantity loop
    insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, order_ref, price_paid)
    values ('GLD-' || upper(substr(encode(gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(gen_random_bytes(8),'hex'),1,6)), t.event_id, t.id, p_holder, coalesce(p_attendee,''), p_order_ref, t.price)
    returning * into result;
    return next result;
  end loop;
end; $$;

-- Check-in: verifies code+nonce, rejects duplicates and revoked entitlements atomically.
create or replace function public.check_in_ticket(p_event uuid, p_code text, p_nonce text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tk public.tickets; res text;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode='42501'; end if;
  select * into tk from public.tickets where event_id = p_event and code = upper(p_code) for update;
  if not found or (p_nonce is not null and tk.qr_nonce <> p_nonce) then res := 'invalid';
  elsif tk.status in ('transferred','resold','refunded','cancelled') then res := 'revoked';
  elsif tk.status = 'used' then res := 'duplicate';
  else update public.tickets set status='used', checked_in_at=now() where id = tk.id; res := 'admitted'; end if;
  insert into public.check_ins(ticket_id, event_id, scanned_by, result) values (tk.id, p_event, auth.uid(), res);
  return jsonb_build_object('result', res, 'attendee', tk.attendee_name, 'code', tk.code, 'checked_in_at', tk.checked_in_at);
end; $$;

-- Transfer: invalidates the old entitlement and issues a replacement with a fresh code and nonce.
create or replace function public.transfer_ticket(p_ticket uuid, p_email text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare tk public.tickets; recipient uuid; new_id uuid;
begin
  select * into tk from public.tickets where id = p_ticket and holder_id = auth.uid() for update;
  if not found then raise exception 'not_authorized' using errcode='42501'; end if;
  if tk.status <> 'valid' then raise exception 'not_transferable' using errcode='22023'; end if;
  if coalesce((select (settings->>'transfers')::boolean from public.events where id = tk.event_id), true) = false then raise exception 'transfers_disabled' using errcode='22023'; end if;
  select id into recipient from auth.users where lower(email) = lower(p_email);
  insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, attendee_email, order_ref, seat, price_paid)
    values ('GLD-' || upper(substr(encode(gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(gen_random_bytes(8),'hex'),1,6)), tk.event_id, tk.tier_id, recipient, p_name, lower(p_email), tk.order_ref || '-T', tk.seat, tk.price_paid)
    returning id into new_id;
  update public.tickets set status='transferred', replaced_by=new_id where id = tk.id;
  return new_id;
end; $$;

-- Official resale listing (face value cap enforced by price_paid).
create or replace function public.list_ticket_for_resale(p_ticket uuid, p_cancel boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare tk public.tickets;
begin
  select * into tk from public.tickets where id = p_ticket and holder_id = auth.uid() for update;
  if not found then raise exception 'not_authorized' using errcode='42501'; end if;
  if p_cancel then
    if tk.status <> 'resale_listed' then raise exception 'not_listed' using errcode='22023'; end if;
    update public.tickets set status='valid' where id = tk.id; return 'valid';
  end if;
  if tk.status <> 'valid' then raise exception 'not_resellable' using errcode='22023'; end if;
  update public.tickets set status='resale_listed', qr_nonce = encode(gen_random_bytes(16),'hex') where id = tk.id;
  return 'resale_listed';
end; $$;

-- Build item lifecycle transitions validated server-side.
create or replace function public.transition_build_item(p_item uuid, p_to text, p_hold_hours int default null)
returns public.build_items language plpgsql security definer set search_path = '' as $$
declare b public.build_items; ok boolean;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or not public.can_access_event(b.event_id) then raise exception 'not_authorized' using errcode='42501'; end if;
  ok := case
    when p_to = 'sent' then b.status in ('suggested','draft','expired','declined')
    when p_to = 'held' then b.status in ('available','quoted') and p_hold_hours between 2 and 72
    when p_to = 'confirmed' then b.status in ('available','quoted','held') and b.amount is not null
    when p_to = 'standby' then b.status in ('suggested','available','quoted')
    when p_to = 'cancelled' then b.status not in ('fulfilled','cancelled')
    when p_to = 'suggested' then b.status in ('suggested','draft')
    else false end;
  if not ok then raise exception 'invalid_transition:%->%', b.status, p_to using errcode='22023'; end if;
  if p_to = 'confirmed' and b.category <> 'venue' and exists(select 1 from public.events e where e.id=b.event_id and e.settings->>'venue_gates_suppliers'='true')
     and not exists(select 1 from public.build_items v where v.event_id=b.event_id and v.category='venue' and v.status='confirmed') then
    raise exception 'venue_required' using errcode='22023';
  end if;
  update public.build_items set
    status = p_to,
    role = case when p_to='standby' then 'standby' else role end,
    response_deadline = case when p_to='sent' then now() + interval '48 hours' else response_deadline end,
    hold_expires_at = case when p_to='held' then now() + make_interval(hours => p_hold_hours) else hold_expires_at end,
    terms_snapshot = case when p_to='confirmed' then jsonb_build_object('amount',b.amount,'deposit',b.deposit,'package',b.package,'confirmed_at',now()) else terms_snapshot end,
    updated_at = now()
  where id = b.id returning * into b;
  return b;
end; $$;

-- Expire unanswered requests and lapsed holds (called by cron / on read). Non-reply ≠ unavailable.
create or replace function public.expire_stale_items() returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.build_items set status='expired', updated_at=now()
   where (status in ('sent','awaiting') and response_deadline < now()) or (status='held' and hold_expires_at < now());
  get diagnostics n = row_count; return n;
end; $$;

-- Consumer → professional upgrade, preserving the canonical event id and all children.
create or replace function public.upgrade_event_to_professional(p_event uuid, p_workspace uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event for update;
  if not found or e.owner_id <> auth.uid() then raise exception 'not_authorized' using errcode='42501'; end if;
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode='42501'; end if;
  if e.management = 'professional' then return; end if;
  update public.events set management='professional', workspace_id=p_workspace, updated_at=now() where id = p_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), p_workspace, 'event.upgraded', jsonb_build_object('event_id', p_event));
end; $$;

-- Proposal issue: snapshot immutable version, then lock the row from client edits.
create or replace function public.issue_proposal(p_proposal uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare p public.proposals; v int;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if not found or not public.is_workspace_member(p.workspace_id) then raise exception 'not_authorized' using errcode='42501'; end if;
  if p.status not in ('draft') then raise exception 'already_issued' using errcode='22023'; end if;
  v := coalesce((select max(version) from public.proposal_versions where proposal_id = p.id), 0) + 1;
  insert into public.proposal_versions(proposal_id, version, snapshot, issued_by) values (p.id, v, to_jsonb(p), auth.uid());
  update public.proposals set status='sent', version=v where id = p.id;
  return v;
end; $$;
create or replace function public.revise_proposal(p_proposal uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.proposals;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if not found or not public.is_workspace_member(p.workspace_id) then raise exception 'not_authorized' using errcode='42501'; end if;
  if p.status in ('accepted','converted') then raise exception 'accepted_locked' using errcode='22023'; end if;
  update public.proposals set status='draft' where id = p.id;
end; $$;

-- Invoice issue: totals recomputed server-side from items; issued invoices are immutable (credit notes only).
create or replace function public.issue_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; s numeric; t numeric;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found or not public.has_workspace_role(i.workspace_id, array['owner','manager','finance']) then raise exception 'not_authorized' using errcode='42501'; end if;
  if i.status <> 'draft' then raise exception 'already_issued' using errcode='22023'; end if;
  select coalesce(sum(quantity*unit_price),0), coalesce(sum(quantity*unit_price*tax_rate/100),0) into s, t from public.invoice_items where invoice_id = i.id;
  if s <= 0 then raise exception 'no_items' using errcode='22023'; end if;
  update public.invoices set subtotal=s, tax=t, total=s+t, status='sent', issued_at=now() where id = i.id;
  insert into public.invoice_events(invoice_id, event, detail) values (i.id, 'Invoice sent', 'Sent to ' || i.client_email);
end; $$;
create or replace function public.credit_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found or not public.has_workspace_role(i.workspace_id, array['owner','manager','finance']) then raise exception 'not_authorized' using errcode='42501'; end if;
  if i.status in ('draft','cancelled','credited') then raise exception 'invalid_state' using errcode='22023'; end if;
  update public.invoices set status = case when i.amount_paid > 0 then 'credited' else 'cancelled' end where id = i.id;
  insert into public.invoice_events(invoice_id, event, detail) values (i.id, 'Credit note issued', 'Original invoice retained; balance credited');
end; $$;

-- Agent approvals: decisions recorded; approved actions executed only by trusted server code.
create or replace function public.decide_agent_approval(p_approval uuid, p_approve boolean) returns public.agent_approvals
language plpgsql security definer set search_path = '' as $$
declare a public.agent_approvals;
begin
  select * into a from public.agent_approvals where id = p_approval for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if not ((a.workspace_id is not null and public.has_workspace_role(a.workspace_id, array['owner','manager'])) or (a.event_id is not null and exists(select 1 from public.events e where e.id=a.event_id and e.owner_id=auth.uid()))) then
    raise exception 'not_authorized' using errcode='42501'; end if;
  if a.status <> 'pending' then raise exception 'already_decided' using errcode='22023'; end if;
  update public.agent_approvals set status = case when p_approve then 'approved' else 'rejected' end, decided_by=auth.uid(), decided_at=now() where id = a.id returning * into a;
  return a;
end; $$;

-- Grants
grant select,insert,update,delete on public.events,public.provider_requests,public.build_items,public.programme_items,public.tasks,public.guests,public.ticket_tiers,public.discount_codes,public.threads,public.messages,public.leads,public.crew_members,public.shifts,public.incidents,public.calendar_entries,public.promotions,public.promoters,public.media_assets,public.venue_maps,public.event_templates,public.agent_routines,public.invoice_items,public.invoice_installments to authenticated;
grant select,insert,update on public.invoices,public.proposals to authenticated;
grant select on public.tickets,public.check_ins,public.payments,public.transactions,public.invoice_events,public.proposal_versions,public.agent_runs,public.agent_approvals,public.reviews to authenticated;
grant select,update on public.notifications to authenticated;
grant select on public.events,public.ticket_tiers,public.reviews to anon;
revoke all on function public.can_access_event(uuid),public.has_workspace_role(uuid,text[]),public.can_see_event_money(uuid),public.event_readiness(uuid),public.issue_tickets(uuid,int,text,text,uuid),public.check_in_ticket(uuid,text,text),public.transfer_ticket(uuid,text,text),public.list_ticket_for_resale(uuid,boolean),public.transition_build_item(uuid,text,int),public.expire_stale_items(),public.upgrade_event_to_professional(uuid,uuid),public.issue_proposal(uuid),public.revise_proposal(uuid),public.issue_invoice(uuid),public.credit_invoice(uuid),public.decide_agent_approval(uuid,boolean) from public;
grant execute on function public.can_access_event(uuid),public.has_workspace_role(uuid,text[]),public.can_see_event_money(uuid),public.event_readiness(uuid),public.check_in_ticket(uuid,text,text),public.transfer_ticket(uuid,text,text),public.list_ticket_for_resale(uuid,boolean),public.transition_build_item(uuid,text,int),public.upgrade_event_to_professional(uuid,uuid),public.issue_proposal(uuid),public.revise_proposal(uuid),public.issue_invoice(uuid),public.credit_invoice(uuid),public.decide_agent_approval(uuid,boolean) to authenticated;
-- Ticket issuing and expiry run only from trusted server code after payment verification / on schedule.
grant execute on function public.issue_tickets(uuid,int,text,text,uuid),public.expire_stale_items() to service_role;
commit;
