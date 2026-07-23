-- Gala Dock — Marketplace foundation (venue/supplier self-service workspaces + shared listing catalog).
-- Additive, idempotent. Builds on 20260629_f1_workspace_types_release_stage.sql (workspaces.workspace_type).
--
-- Adds:
--   public.set_workspace_type(_workspace_id, _workspace_type)  — owner/admin-only RPC, called once from
--     onboarding once the user picks Venue/Supplier as their business type. create_workspace_for_current_user
--     is NOT redefined here — it isn't tracked in migrations (lives only in the deployed project), so we
--     avoid touching it and instead set persona as a follow-up call using the same ownership/RLS model.
--   workspaces.stripe_connect_account_id / stripe_connect_status — Connect onboarding state per workspace.
--   marketplace_listings — the public "face" of a venue/supplier workspace (price, photos, category,
--     coverage). Distinct from the organizer's private `suppliers`/`venues` CRM rows.
--   marketplace_listing_availability — per-date availability for a listing.
--   marketplace_bookings — a marketplace booking of a listing by a buyer workspace (organizer or venue),
--     with commission (5% supplier default) and buyer admin fee (1% default) computed as generated columns.

-- ── set_workspace_type ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_workspace_type(_workspace_id uuid, _workspace_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _workspace_type NOT IN ('organizer', 'venue', 'supplier') THEN
    RAISE EXCEPTION 'invalid workspace_type: %', _workspace_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not authorized to change this workspace''s type';
  END IF;

  UPDATE public.workspaces SET workspace_type = _workspace_type WHERE id = _workspace_id;
END;
$$;

COMMENT ON FUNCTION public.set_workspace_type IS
  'Owner/admin-only. Sets workspace_type (organizer|venue|supplier) post-creation, called from onboarding.';

-- ── Stripe Connect state on workspaces ───────────────────────────────────────────────────────────────
-- These mirror the boolean-flag shape already declared for workspaces.* and affiliate_accounts.* in
-- src/lib/supabase/database.types.ts (charges_enabled / details_submitted / payouts_enabled / synced_at)
-- but with no corresponding tracked migration — backfilled here idempotently so a fresh database
-- reproduces the same shape the app code already assumes, whether or not it was already applied live.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketplace_commission_bps integer,
  ADD COLUMN IF NOT EXISTS marketplace_admin_fee_bps integer;

COMMENT ON COLUMN public.workspaces.stripe_connect_account_id IS 'Stripe Connect Express account id, once onboarded.';
COMMENT ON COLUMN public.workspaces.marketplace_commission_bps IS
  'Per-workspace override of the supplier/venue commission rate (basis points). NULL = use platform default (500 = 5%).';
COMMENT ON COLUMN public.workspaces.marketplace_admin_fee_bps IS
  'Per-workspace override of the buyer admin fee (basis points), charged to the organizer/venue booking a listing. NULL = platform default (100 = 1%).';

-- ── marketplace_listings ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  price_from_cents bigint NOT NULL DEFAULT 0,
  price_unit text NOT NULL DEFAULT 'fixed' CHECK (price_unit IN ('fixed', 'per_hour', 'per_head', 'per_day')),
  currency text NOT NULL DEFAULT 'GBP',
  cover_image_url text,
  gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_regions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'paused')),
  rating_avg numeric(3,2),
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_listings_workspace_idx ON public.marketplace_listings (workspace_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_status_idx ON public.marketplace_listings (status) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS marketplace_listings_category_idx ON public.marketplace_listings (category);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_listings' AND policyname='marketplace_listings_owner_all') THEN
    CREATE POLICY marketplace_listings_owner_all ON public.marketplace_listings
      FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
  -- Any authenticated user (any workspace persona sourcing suppliers/venues) may browse live listings.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_listings' AND policyname='marketplace_listings_browse') THEN
    CREATE POLICY marketplace_listings_browse ON public.marketplace_listings
      FOR SELECT USING (status = 'live' AND auth.role() = 'authenticated');
  END IF;
END$$;

COMMENT ON TABLE public.marketplace_listings IS
  'Public "face" of a venue/supplier workspace on the shared marketplace catalog — distinct from the organizer-private suppliers/venues CRM rows.';

-- ── marketplace_listing_availability ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketplace_listing_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'blocked', 'booked')),
  booking_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, date)
);

CREATE INDEX IF NOT EXISTS marketplace_listing_availability_listing_idx ON public.marketplace_listing_availability (listing_id, date);

ALTER TABLE public.marketplace_listing_availability ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_listing_availability' AND policyname='marketplace_listing_availability_owner_all') THEN
    CREATE POLICY marketplace_listing_availability_owner_all ON public.marketplace_listing_availability
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id = listing_id AND public.is_workspace_member(l.workspace_id))
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id = listing_id AND public.is_workspace_member(l.workspace_id))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_listing_availability' AND policyname='marketplace_listing_availability_browse') THEN
    CREATE POLICY marketplace_listing_availability_browse ON public.marketplace_listing_availability
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END$$;

-- ── marketplace_bookings ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketplace_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
  supplier_workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  buyer_workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  booking_date date NOT NULL,
  price_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  -- Commission taken from the supplier/venue payout; default 5% (500 bps).
  supplier_commission_bps integer NOT NULL DEFAULT 500,
  -- Admin fee charged on top to the buyer (event manager / venue manager); default 1% (100 bps).
  buyer_admin_fee_bps integer NOT NULL DEFAULT 100,
  supplier_payout_cents bigint GENERATED ALWAYS AS (price_cents - (price_cents * supplier_commission_bps / 10000)) STORED,
  buyer_admin_fee_cents bigint GENERATED ALWAYS AS (price_cents * buyer_admin_fee_bps / 10000) STORED,
  buyer_total_cents bigint GENERATED ALWAYS AS (price_cents + (price_cents * buyer_admin_fee_bps / 10000)) STORED,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'disputed', 'refunded')),
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_bookings_listing_idx ON public.marketplace_bookings (listing_id);
CREATE INDEX IF NOT EXISTS marketplace_bookings_supplier_workspace_idx ON public.marketplace_bookings (supplier_workspace_id);
CREATE INDEX IF NOT EXISTS marketplace_bookings_buyer_workspace_idx ON public.marketplace_bookings (buyer_workspace_id);

ALTER TABLE public.marketplace_bookings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_bookings' AND policyname='marketplace_bookings_supplier_select') THEN
    CREATE POLICY marketplace_bookings_supplier_select ON public.marketplace_bookings
      FOR SELECT USING (public.is_workspace_member(supplier_workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_bookings' AND policyname='marketplace_bookings_buyer_all') THEN
    CREATE POLICY marketplace_bookings_buyer_all ON public.marketplace_bookings
      FOR ALL USING (public.is_workspace_member(buyer_workspace_id)) WITH CHECK (public.is_workspace_member(buyer_workspace_id));
  END IF;
END$$;

COMMENT ON TABLE public.marketplace_bookings IS
  'A buyer workspace (organizer/venue) booking a marketplace_listing. Commission/fee split computed via generated columns — supplier_commission_bps default 500 (5%), buyer_admin_fee_bps default 100 (1%).';
