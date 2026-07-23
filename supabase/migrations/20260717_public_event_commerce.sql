-- Gala Dock — public event commerce depth (checkout details, promo codes, event public-page
-- content: media, lineup, schedule, policies, favourites). Idempotent.

-- 1. Checkout depth on ticket_orders — real buyer/billing/delivery/promo capture, not cosmetic.
ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS buyer_phone text,
  ADD COLUMN IF NOT EXISTS billing_address jsonb,
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'mobile' CHECK (delivery_method IN ('mobile','email')),
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_code_id uuid,
  ADD COLUMN IF NOT EXISTS discount_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_cents_computed bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS ticket_orders_reference_idx ON public.ticket_orders (order_reference) WHERE order_reference IS NOT NULL;

-- 2. Promo codes — minimal, real, server-validated. No fake discount math.
CREATE TABLE IF NOT EXISTS public.ticket_promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  code text NOT NULL,
  percent_off integer CHECK (percent_off IS NULL OR (percent_off > 0 AND percent_off <= 100)),
  amount_off_cents bigint CHECK (amount_off_cents IS NULL OR amount_off_cents > 0),
  max_redemptions integer,
  redeemed_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_promo_codes_one_discount CHECK (
    (percent_off IS NOT NULL AND amount_off_cents IS NULL) OR
    (percent_off IS NULL AND amount_off_cents IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_promo_codes_code_idx ON public.ticket_promo_codes (workspace_id, lower(code));
ALTER TABLE public.ticket_promo_codes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_promo_codes' AND policyname='ticket_promo_codes_select') THEN
    CREATE POLICY ticket_promo_codes_select ON public.ticket_promo_codes FOR SELECT USING (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_promo_codes' AND policyname='ticket_promo_codes_write') THEN
    CREATE POLICY ticket_promo_codes_write ON public.ticket_promo_codes FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
END$$;

-- 3. Event public-page content depth — lineup, gallery, schedule, policies, accessibility, FAQs.
-- All optional/JSON-light by design (organiser-authored, variable shape per event type) but scoped
-- to the workspace for writes and only exposed anonymously through the existing `published = true`
-- gate already on event_public_pages.
ALTER TABLE public.event_public_pages
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS doors_at timestamptz,
  ADD COLUMN IF NOT EXISTS venue_name text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS gallery_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lineup jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS accessibility_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS faqs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS age_restriction text,
  ADD COLUMN IF NOT EXISTS organiser_name text,
  ADD COLUMN IF NOT EXISTS promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_type text;

-- 4. Favourites — deferred. public.customers (from 20260716_consumer_marketplace_foundation.sql)
-- is NOT applied on the linked remote yet (confirmed via information_schema before running this
-- file) — that migration + its 20260715 prerequisite were out of scope for this pass, since
-- applying two additional, previously-unreviewed-by-this-session migrations to production wasn't
-- part of what was explicitly approved. event_favourites is deferred until customers exists; see
-- docs/release-gated/user-fixes/public-event-commerce.md. toggleFavourite() in
-- src/app/(marketing)/discover/actions.ts already degrades gracefully (returns { ok: false }) when
-- this table is missing, so the UI shows a normal "sign in" state rather than erroring.
