-- Gala Dock — EB-K: contracts + e-sign and post-event settlement. RLS via is_workspace_member. Idempotent.

CREATE TABLE IF NOT EXISTS public.event_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  title text NOT NULL,
  party_name text,
  kind text NOT NULL DEFAULT 'client' CHECK (kind IN ('client','venue','supplier','artist','other')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','signed','declined','expired')),
  terms text,
  signed_by_name text,
  signed_at timestamptz,
  signature_ip_hash text,
  document_path text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_contracts_event_idx ON public.event_contracts (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  gross_revenue_cents bigint NOT NULL DEFAULT 0,
  total_costs_cents bigint NOT NULL DEFAULT 0,
  deposits_returned_cents bigint NOT NULL DEFAULT 0,
  deposits_withheld_cents bigint NOT NULL DEFAULT 0,
  net_profit_cents bigint NOT NULL DEFAULT 0,
  statement_path text,
  settled_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_settlements_event_idx ON public.event_settlements (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  settlement_id uuid NOT NULL REFERENCES public.event_settlements(id) ON DELETE CASCADE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'revenue' CHECK (kind IN ('revenue','cost','split','deposit')),
  party_name text,
  amount_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_settlement_lines_idx ON public.event_settlement_lines (workspace_id, settlement_id);

ALTER TABLE public.event_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settlement_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_contracts','event_settlements','event_settlement_lines'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id))', t||'_select', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_write') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id))', t||'_write', t);
    END IF;
  END LOOP;
END$$;

COMMENT ON TABLE public.event_settlements IS 'EB-K: post-event reconciliation (revenue, costs, deposits, net + profit-share statement).';
