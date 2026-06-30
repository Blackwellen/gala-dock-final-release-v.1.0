-- Gala Dock — V1.5 Ticketing core: ticket_types. Organizer-side ticket inventory per event.
-- Public checkout + Stripe Connect land separately. Workspace-scoped with the established RLS
-- helpers (is_workspace_member / has_workspace_role). Money in minor units (pence). Idempotent.

CREATE TABLE IF NOT EXISTS public.ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  quantity integer,                       -- NULL = unlimited
  sold integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','on_sale','sold_out','closed')),
  sales_start timestamptz,
  sales_end timestamptz,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_types_workspace_idx ON public.ticket_types (workspace_id);
CREATE INDEX IF NOT EXISTS ticket_types_event_idx ON public.ticket_types (event_id);

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_types' AND policyname = 'ticket_types_select') THEN
    CREATE POLICY ticket_types_select ON public.ticket_types
      FOR SELECT USING (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_types' AND policyname = 'ticket_types_insert') THEN
    CREATE POLICY ticket_types_insert ON public.ticket_types
      FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_types' AND policyname = 'ticket_types_update') THEN
    CREATE POLICY ticket_types_update ON public.ticket_types
      FOR UPDATE USING (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_types' AND policyname = 'ticket_types_delete') THEN
    CREATE POLICY ticket_types_delete ON public.ticket_types
      FOR DELETE USING (public.is_workspace_member(workspace_id));
  END IF;
END$$;

COMMENT ON TABLE public.ticket_types IS 'V1.5 ticketing — per-event ticket inventory (organizer side). price_cents in GBP pence.';
