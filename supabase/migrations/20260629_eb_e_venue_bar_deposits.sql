-- Gala Dock — EB-E: venue/bar/deposit + profit splits (event-business money model).
-- Workspace-scoped, RLS via is_workspace_member, money in pence. Idempotent.

-- Deposits (venue hire, bar, other) with proof-of-payment via R2.
CREATE TABLE IF NOT EXISTS public.event_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'venue_hire' CHECK (kind IN ('venue_hire','bar','security','other')),
  label text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  due_date date,
  refundable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','partial','refunded','withheld')),
  paid_at timestamptz,
  proof_path text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_deposits_event_idx ON public.event_deposits (workspace_id, event_id);

-- Bar terms / settlement.
CREATE TABLE IF NOT EXISTS public.event_bar_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  min_spend_cents bigint NOT NULL DEFAULT 0,
  bar_deposit_cents bigint NOT NULL DEFAULT 0,
  guarantee_cents bigint NOT NULL DEFAULT 0,
  bar_revenue_share_pct numeric NOT NULL DEFAULT 0,
  bar_manager_contact_id uuid,
  settled boolean NOT NULL DEFAULT false,
  settlement_cents bigint,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_bar_terms_event_idx ON public.event_bar_terms (workspace_id, event_id);

-- Profit / revenue splits between parties.
CREATE TABLE IF NOT EXISTS public.event_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  party_name text NOT NULL,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('venue','promoter','artist','supplier','organizer','other')),
  pct numeric NOT NULL DEFAULT 0,
  fixed_cents bigint NOT NULL DEFAULT 0,
  applies_to text NOT NULL DEFAULT 'profit' CHECK (applies_to IN ('profit','door','ticket','bar')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_splits_event_idx ON public.event_splits (workspace_id, event_id);

ALTER TABLE public.event_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_bar_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_splits ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_deposits','event_bar_terms','event_splits'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id))', t||'_select', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_write') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id))', t||'_write', t);
    END IF;
  END LOOP;
END$$;

COMMENT ON TABLE public.event_deposits IS 'EB-E: deposits (venue/bar/security) with R2 proof + status.';
COMMENT ON TABLE public.event_splits IS 'EB-E: profit/revenue splits between parties (feeds the profitability engine).';
