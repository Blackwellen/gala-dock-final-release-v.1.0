-- Gala Dock — Consumer marketplace foundation (customer accounts + the "build my event" cart).
-- Additive, idempotent. Builds on 20260715_marketplace_foundation.sql.
--
-- Adds:
--   customers                  — lightweight consumer account (1:1 with auth.users), no workspace_role.
--   ticket_orders.customer_id  — optional link so a logged-in buyer sees past ticket orders.
--   marketplace_events         — a customer's assembled event ("the board") — guest or logged-in.
--   marketplace_event_items    — the listings added to that board (the cart, pre/post checkout).
--   marketplace_bookings       — relaxed so a booking's buyer can be a customer (B2C, the builder)
--     as well as a workspace (B2B2B, the staff-facing marketplace browse from the prior migration).
--
-- Mutations for the guest-checkout builder flow go through the service-role admin client from
-- server actions, exactly like the existing ticket_orders checkout in (marketing)/e/[slug]/checkout.ts
-- — a guest has no auth.uid() for RLS to key off, so this matches established convention rather than
-- inventing new anonymous-write RLS. Logged-in customers additionally get direct SELECT policies below
-- so their dashboard can read via the normal (non-admin) client.

-- ── customers ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_user_id_idx ON public.customers (user_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='customers_self_all') THEN
    CREATE POLICY customers_self_all ON public.customers
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END$$;

COMMENT ON TABLE public.customers IS
  'Lightweight consumer account — no workspace_role, no workspace membership. One row per auth.users buyer/builder.';

-- ── ticket_orders.customer_id ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ticket_orders_customer_idx ON public.ticket_orders (customer_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_orders' AND policyname='ticket_orders_customer_select') THEN
    CREATE POLICY ticket_orders_customer_select ON public.ticket_orders FOR SELECT USING (
      customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = ticket_orders.customer_id AND c.user_id = auth.uid())
    );
  END IF;
END$$;

-- ── marketplace_events (the customer's board) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketplace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  guest_email text,
  guest_name text,
  event_type text NOT NULL,
  event_date date,
  guest_count integer,
  budget_cents bigint,
  postcode text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'checked_out', 'cancelled')),
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_events_customer_idx ON public.marketplace_events (customer_id);
CREATE INDEX IF NOT EXISTS marketplace_events_session_idx ON public.marketplace_events (stripe_session_id);

ALTER TABLE public.marketplace_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_events' AND policyname='marketplace_events_customer_select') THEN
    CREATE POLICY marketplace_events_customer_select ON public.marketplace_events FOR SELECT USING (
      customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = marketplace_events.customer_id AND c.user_id = auth.uid())
    );
  END IF;
END$$;

COMMENT ON TABLE public.marketplace_events IS
  'A customer''s in-progress or checked-out "build my event" board. Guest builds have customer_id NULL
   and are read/written via the service-role admin client (see (marketing)/build/**), same pattern as
   ticket_orders guest checkout.';

-- ── marketplace_event_items (the cart) ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketplace_event_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_event_id uuid NOT NULL REFERENCES public.marketplace_events(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
  price_cents bigint NOT NULL DEFAULT 0,
  booking_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_event_items_event_idx ON public.marketplace_event_items (marketplace_event_id);

ALTER TABLE public.marketplace_event_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_event_items' AND policyname='marketplace_event_items_customer_select') THEN
    CREATE POLICY marketplace_event_items_customer_select ON public.marketplace_event_items FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.marketplace_events e
        JOIN public.customers c ON c.id = e.customer_id
        WHERE e.id = marketplace_event_items.marketplace_event_id AND c.user_id = auth.uid()
      )
    );
  END IF;
END$$;

-- ── marketplace_bookings: allow a customer (B2C) as well as a workspace (B2B2B) buyer ───────────────
ALTER TABLE public.marketplace_bookings
  ALTER COLUMN buyer_workspace_id DROP NOT NULL;

ALTER TABLE public.marketplace_bookings
  ADD COLUMN IF NOT EXISTS buyer_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketplace_event_id uuid REFERENCES public.marketplace_events(id) ON DELETE SET NULL;

-- A guest (unauthenticated) builder checkout has neither a buyer_workspace_id nor a
-- buyer_customer_id — marketplace_event_id is the fallback identity for those bookings.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_bookings_buyer_check') THEN
    ALTER TABLE public.marketplace_bookings
      ADD CONSTRAINT marketplace_bookings_buyer_check
      CHECK (buyer_workspace_id IS NOT NULL OR buyer_customer_id IS NOT NULL OR marketplace_event_id IS NOT NULL);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS marketplace_bookings_buyer_customer_idx ON public.marketplace_bookings (buyer_customer_id);
CREATE INDEX IF NOT EXISTS marketplace_bookings_marketplace_event_idx ON public.marketplace_bookings (marketplace_event_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_bookings' AND policyname='marketplace_bookings_customer_select') THEN
    CREATE POLICY marketplace_bookings_customer_select ON public.marketplace_bookings FOR SELECT USING (
      buyer_customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = marketplace_bookings.buyer_customer_id AND c.user_id = auth.uid())
    );
  END IF;
END$$;
