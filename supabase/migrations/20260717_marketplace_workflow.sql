-- Gala Dock — Marketplace Phase 3: enquiries, quote requests/quotes, booking milestones,
-- favourites/shortlist, comparisons, saved searches, recently viewed, reviews.
--
-- Builds on 20260715_marketplace_foundation.sql (marketplace_listings, marketplace_bookings,
-- Stripe Connect columns) and 20260716_consumer_marketplace_foundation.sql (customers,
-- marketplace_events cart). Deliberately does NOT reuse the pre-existing `quotes` table — that
-- table is a workspace-private CRM/RFQ record (workspace_id + supplier_id FK into the CRM
-- `suppliers` table) used by the Suppliers/RFQs nav, not a cross-workspace marketplace
-- transaction between a buyer workspace and a public marketplace_listings row. Marketplace
-- quote requests/quotes are a distinct concept and get their own tables here.
--
-- "Escrow" is intentionally never used as a column/enum value here — see
-- src/app/event-manager/marketplace/*/checkout/page.tsx for the wording rationale. Booking
-- milestones model "held funds released on confirmation", which is what Stripe Connect
-- destination charges + delayed transfers can actually deliver; it is not a legal escrow
-- account and must not be marketed as one.
--
-- supplier_workspace_id on every cross-workspace table is populated by a trigger from the
-- listing's owning workspace, never trusted from client input — prevents a buyer from writing
-- an enquiry/quote request against a workspace they don't actually own the listing under.

-- ============================================================================================
-- 1. Favourites / shortlist (one table serves both "favourite" and "my shortlist" — the Phase 2
--    UI's ShortlistPanel and FavouriteButton read the same relationship)
-- ============================================================================================

create table if not exists public.marketplace_favourites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id, listing_id)
);

create index if not exists marketplace_favourites_workspace_idx on public.marketplace_favourites (workspace_id);
create index if not exists marketplace_favourites_listing_idx on public.marketplace_favourites (listing_id);

alter table public.marketplace_favourites enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_favourites' and policyname = 'favourites_workspace_member') then
    create policy favourites_workspace_member on public.marketplace_favourites
      for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
  end if;
end $$;

-- ============================================================================================
-- 2. Comparisons (persisted compare tray, max size enforced in application layer per plan gate)
-- ============================================================================================

create table if not exists public.marketplace_comparison_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id, listing_id)
);

create index if not exists marketplace_comparison_items_workspace_idx on public.marketplace_comparison_items (workspace_id, user_id);

alter table public.marketplace_comparison_items enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_comparison_items' and policyname = 'comparison_items_workspace_member') then
    create policy comparison_items_workspace_member on public.marketplace_comparison_items
      for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
  end if;
end $$;

-- ============================================================================================
-- 3. Saved searches + recently viewed
-- ============================================================================================

create table if not exists public.marketplace_saved_searches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  query jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_saved_searches_workspace_idx on public.marketplace_saved_searches (workspace_id, user_id);

alter table public.marketplace_saved_searches enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_saved_searches' and policyname = 'saved_searches_workspace_member') then
    create policy saved_searches_workspace_member on public.marketplace_saved_searches
      for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
  end if;
end $$;

create table if not exists public.marketplace_recently_viewed (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (workspace_id, user_id, listing_id)
);

create index if not exists marketplace_recently_viewed_workspace_idx on public.marketplace_recently_viewed (workspace_id, user_id, viewed_at desc);

alter table public.marketplace_recently_viewed enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_recently_viewed' and policyname = 'recently_viewed_workspace_member') then
    create policy recently_viewed_workspace_member on public.marketplace_recently_viewed
      for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
  end if;
end $$;

-- ============================================================================================
-- 4. Enquiries (venue enquiries) — buyer workspace -> listing owner workspace
-- ============================================================================================

create table if not exists public.marketplace_enquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  supplier_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  event_date date,
  event_type text,
  guest_count integer,
  message text not null,
  status text not null default 'new'
    check (status in ('new', 'responded', 'hold_requested', 'converted', 'declined', 'expired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_enquiries_buyer_idx on public.marketplace_enquiries (buyer_workspace_id);
create index if not exists marketplace_enquiries_supplier_idx on public.marketplace_enquiries (supplier_workspace_id);
create index if not exists marketplace_enquiries_listing_idx on public.marketplace_enquiries (listing_id);

create or replace function public.marketplace_enquiries_set_supplier_workspace()
returns trigger language plpgsql as $$
begin
  select workspace_id into new.supplier_workspace_id
  from public.marketplace_listings where id = new.listing_id;
  if new.supplier_workspace_id is null then
    raise exception 'marketplace_listings % not found', new.listing_id;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_enquiries_supplier_workspace on public.marketplace_enquiries;
create trigger marketplace_enquiries_supplier_workspace
  before insert on public.marketplace_enquiries
  for each row execute function public.marketplace_enquiries_set_supplier_workspace();

drop trigger if exists marketplace_enquiries_touch on public.marketplace_enquiries;
create trigger marketplace_enquiries_touch
  before update on public.marketplace_enquiries
  for each row execute function public.set_updated_at();

alter table public.marketplace_enquiries enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_enquiries' and policyname = 'enquiries_party_select') then
    create policy enquiries_party_select on public.marketplace_enquiries
      for select using (is_workspace_member(buyer_workspace_id) or is_workspace_member(supplier_workspace_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_enquiries' and policyname = 'enquiries_buyer_insert') then
    create policy enquiries_buyer_insert on public.marketplace_enquiries
      for insert with check (is_workspace_member(buyer_workspace_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_enquiries' and policyname = 'enquiries_party_update') then
    create policy enquiries_party_update on public.marketplace_enquiries
      for update using (is_workspace_member(buyer_workspace_id) or is_workspace_member(supplier_workspace_id));
  end if;
end $$;

create table if not exists public.marketplace_enquiry_messages (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.marketplace_enquiries(id) on delete cascade,
  sender_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_enquiry_messages_enquiry_idx on public.marketplace_enquiry_messages (enquiry_id, created_at);

alter table public.marketplace_enquiry_messages enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_enquiry_messages' and policyname = 'enquiry_messages_party_select') then
    create policy enquiry_messages_party_select on public.marketplace_enquiry_messages
      for select using (
        exists (
          select 1 from public.marketplace_enquiries e
          where e.id = enquiry_id
            and (is_workspace_member(e.buyer_workspace_id) or is_workspace_member(e.supplier_workspace_id))
        )
      );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_enquiry_messages' and policyname = 'enquiry_messages_party_insert') then
    create policy enquiry_messages_party_insert on public.marketplace_enquiry_messages
      for insert with check (
        is_workspace_member(sender_workspace_id)
        and exists (
          select 1 from public.marketplace_enquiries e
          where e.id = enquiry_id
            and (e.buyer_workspace_id = sender_workspace_id or e.supplier_workspace_id = sender_workspace_id)
        )
      );
  end if;
end $$;

-- ============================================================================================
-- 5. Quote requests + quotes (supplier services) — distinct from the internal CRM `quotes` table
-- ============================================================================================

create table if not exists public.marketplace_quote_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  supplier_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  event_date date,
  requirements text,
  status text not null default 'pending'
    check (status in ('pending', 'quoted', 'accepted', 'declined', 'expired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_quote_requests_buyer_idx on public.marketplace_quote_requests (buyer_workspace_id);
create index if not exists marketplace_quote_requests_supplier_idx on public.marketplace_quote_requests (supplier_workspace_id);
create index if not exists marketplace_quote_requests_listing_idx on public.marketplace_quote_requests (listing_id);

create or replace function public.marketplace_quote_requests_set_supplier_workspace()
returns trigger language plpgsql as $$
begin
  select workspace_id into new.supplier_workspace_id
  from public.marketplace_listings where id = new.listing_id;
  if new.supplier_workspace_id is null then
    raise exception 'marketplace_listings % not found', new.listing_id;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_quote_requests_supplier_workspace on public.marketplace_quote_requests;
create trigger marketplace_quote_requests_supplier_workspace
  before insert on public.marketplace_quote_requests
  for each row execute function public.marketplace_quote_requests_set_supplier_workspace();

drop trigger if exists marketplace_quote_requests_touch on public.marketplace_quote_requests;
create trigger marketplace_quote_requests_touch
  before update on public.marketplace_quote_requests
  for each row execute function public.set_updated_at();

alter table public.marketplace_quote_requests enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_quote_requests' and policyname = 'quote_requests_party_select') then
    create policy quote_requests_party_select on public.marketplace_quote_requests
      for select using (is_workspace_member(buyer_workspace_id) or is_workspace_member(supplier_workspace_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_quote_requests' and policyname = 'quote_requests_buyer_insert') then
    create policy quote_requests_buyer_insert on public.marketplace_quote_requests
      for insert with check (is_workspace_member(buyer_workspace_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_quote_requests' and policyname = 'quote_requests_party_update') then
    create policy quote_requests_party_update on public.marketplace_quote_requests
      for update using (is_workspace_member(buyer_workspace_id) or is_workspace_member(supplier_workspace_id));
  end if;
end $$;

create table if not exists public.marketplace_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.marketplace_quote_requests(id) on delete cascade,
  version integer not null default 1,
  subtotal_cents bigint not null,
  fees_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null,
  currency text not null default 'GBP',
  notes text,
  status text not null default 'sent'
    check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_quotes_request_idx on public.marketplace_quotes (quote_request_id);

alter table public.marketplace_quotes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_quotes' and policyname = 'quotes_party_select') then
    create policy quotes_party_select on public.marketplace_quotes
      for select using (
        exists (
          select 1 from public.marketplace_quote_requests r
          where r.id = quote_request_id
            and (is_workspace_member(r.buyer_workspace_id) or is_workspace_member(r.supplier_workspace_id))
        )
      );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_quotes' and policyname = 'quotes_supplier_insert') then
    create policy quotes_supplier_insert on public.marketplace_quotes
      for insert with check (
        exists (
          select 1 from public.marketplace_quote_requests r
          where r.id = quote_request_id and is_workspace_member(r.supplier_workspace_id)
        )
      );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_quotes' and policyname = 'quotes_party_update') then
    create policy quotes_party_update on public.marketplace_quotes
      for update using (
        exists (
          select 1 from public.marketplace_quote_requests r
          where r.id = quote_request_id
            and (is_workspace_member(r.buyer_workspace_id) or is_workspace_member(r.supplier_workspace_id))
        )
      );
  end if;
end $$;

create table if not exists public.marketplace_quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.marketplace_quotes(id) on delete cascade,
  label text not null,
  quantity numeric not null default 1,
  unit_price_cents bigint not null,
  total_cents bigint not null,
  sort_order integer not null default 0
);

create index if not exists marketplace_quote_line_items_quote_idx on public.marketplace_quote_line_items (quote_id);

alter table public.marketplace_quote_line_items enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_quote_line_items' and policyname = 'quote_line_items_party_select') then
    create policy quote_line_items_party_select on public.marketplace_quote_line_items
      for select using (
        exists (
          select 1 from public.marketplace_quotes q
          join public.marketplace_quote_requests r on r.id = q.quote_request_id
          where q.id = quote_id
            and (is_workspace_member(r.buyer_workspace_id) or is_workspace_member(r.supplier_workspace_id))
        )
      );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_quote_line_items' and policyname = 'quote_line_items_supplier_write') then
    create policy quote_line_items_supplier_write on public.marketplace_quote_line_items
      for all using (
        exists (
          select 1 from public.marketplace_quotes q
          join public.marketplace_quote_requests r on r.id = q.quote_request_id
          where q.id = quote_id and is_workspace_member(r.supplier_workspace_id)
        )
      ) with check (
        exists (
          select 1 from public.marketplace_quotes q
          join public.marketplace_quote_requests r on r.id = q.quote_request_id
          where q.id = quote_id and is_workspace_member(r.supplier_workspace_id)
        )
      );
  end if;
end $$;

-- ============================================================================================
-- 6. Booking milestones — staged payment release, NOT a legal escrow account. See file header.
-- ============================================================================================

create table if not exists public.marketplace_booking_milestones (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.marketplace_bookings(id) on delete cascade,
  label text not null,
  sequence integer not null,
  amount_cents bigint not null,
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'due', 'held', 'released', 'refunded', 'disputed')),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, sequence)
);

create index if not exists marketplace_booking_milestones_booking_idx on public.marketplace_booking_milestones (booking_id);

alter table public.marketplace_booking_milestones enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_booking_milestones' and policyname = 'booking_milestones_party_select') then
    create policy booking_milestones_party_select on public.marketplace_booking_milestones
      for select using (
        exists (
          select 1 from public.marketplace_bookings b
          where b.id = booking_id
            and (is_workspace_member(b.supplier_workspace_id) or (b.buyer_workspace_id is not null and is_workspace_member(b.buyer_workspace_id)))
        )
      );
  end if;
end $$;
-- No direct INSERT/UPDATE policy: milestone rows are written only by the service-role payment
-- webhook path (Phase 7), never directly by a workspace member.

-- ============================================================================================
-- 7. Reviews — tied to a completed booking, one review per reviewing workspace per booking
-- ============================================================================================

create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.marketplace_bookings(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  reviewer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id),
  rating numeric not null check (rating between 1 and 5),
  quality_rating numeric check (quality_rating between 1 and 5),
  communication_rating numeric check (communication_rating between 1 and 5),
  reliability_rating numeric check (reliability_rating between 1 and 5),
  value_rating numeric check (value_rating between 1 and 5),
  professionalism_rating numeric check (professionalism_rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  unique (booking_id, reviewer_workspace_id)
);

create index if not exists marketplace_reviews_listing_idx on public.marketplace_reviews (listing_id);
create index if not exists marketplace_reviews_booking_idx on public.marketplace_reviews (booking_id);

alter table public.marketplace_reviews enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_reviews' and policyname = 'reviews_public_select') then
    -- Reviews are marketing-facing once written: any authenticated workspace member can read
    -- reviews on a live listing, matching marketplace_listings' own public-browse policy.
    create policy reviews_public_select on public.marketplace_reviews
      for select using (
        exists (select 1 from public.marketplace_listings l where l.id = listing_id and l.status = 'live')
        or is_workspace_member(reviewer_workspace_id)
      );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_reviews' and policyname = 'reviews_reviewer_insert') then
    create policy reviews_reviewer_insert on public.marketplace_reviews
      for insert with check (
        is_workspace_member(reviewer_workspace_id)
        and exists (
          select 1 from public.marketplace_bookings b
          where b.id = booking_id
            and b.status = 'completed'
            and b.buyer_workspace_id = reviewer_workspace_id
        )
      );
  end if;
end $$;

create table if not exists public.marketplace_review_responses (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.marketplace_reviews(id) on delete cascade,
  responder_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  responder_user_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now(),
  unique (review_id)
);

alter table public.marketplace_review_responses enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_review_responses' and policyname = 'review_responses_select') then
    create policy review_responses_select on public.marketplace_review_responses
      for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marketplace_review_responses' and policyname = 'review_responses_listing_owner_insert') then
    create policy review_responses_listing_owner_insert on public.marketplace_review_responses
      for insert with check (
        is_workspace_member(responder_workspace_id)
        and exists (
          select 1 from public.marketplace_reviews rv
          join public.marketplace_listings l on l.id = rv.listing_id
          where rv.id = review_id and l.workspace_id = responder_workspace_id
        )
      );
  end if;
end $$;
