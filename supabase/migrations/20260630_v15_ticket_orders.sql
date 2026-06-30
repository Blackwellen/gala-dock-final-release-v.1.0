-- Gala Dock — V1.5 ticket orders + public ticket pricing. Idempotent.
CREATE TABLE IF NOT EXISTS public.ticket_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE CASCADE,
  buyer_name text,
  buyer_email text,
  quantity integer NOT NULL DEFAULT 1,
  amount_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  stripe_session_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_orders_event_idx ON public.ticket_orders (workspace_id, event_id);
CREATE INDEX IF NOT EXISTS ticket_orders_session_idx ON public.ticket_orders (stripe_session_id);
ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Members read their workspace's orders; writes happen via service-role (checkout/fulfilment).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_orders' AND policyname='ticket_orders_select') THEN
    CREATE POLICY ticket_orders_select ON public.ticket_orders FOR SELECT USING (public.is_workspace_member(workspace_id));
  END IF;
  -- Anon may read on-sale ticket types for a PUBLISHED event (to show prices on the public page).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_types' AND policyname='ticket_types_anon') THEN
    CREATE POLICY ticket_types_anon ON public.ticket_types FOR SELECT USING (
      status = 'on_sale' AND EXISTS (SELECT 1 FROM public.event_public_pages p WHERE p.event_id = ticket_types.event_id AND p.published = true)
    );
  END IF;
END$$;
