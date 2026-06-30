-- Gala Dock — EB-O/P/Q: seating/passes/queue · comms/procurement/contingency ·
-- accessibility/licensing/analytics/playbooks. RLS via is_workspace_member. Idempotent.

-- EB-O
CREATE TABLE IF NOT EXISTS public.event_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.event_rooms(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'table' CHECK (kind IN ('table','vip_area','booth','zone')),
  seats integer NOT NULL DEFAULT 0,
  pos_x numeric, pos_y numeric,
  created_by uuid REFERENCES auth.users(id), deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.event_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  holder_name text NOT NULL,
  kind text NOT NULL DEFAULT 'staff' CHECK (kind IN ('staff','artist','press','crew','vip','contractor')),
  zones text, code text, scanned_at timestamptz,
  created_by uuid REFERENCES auth.users(id), deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- EB-P
CREATE TABLE IF NOT EXISTS public.event_comms_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL, kind text NOT NULL DEFAULT 'radio' CHECK (kind IN ('radio','chat','broadcast')),
  notes text, created_by uuid REFERENCES auth.users(id), deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.event_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  supplier_id uuid, reference text, amount_cents bigint NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'GBP',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','received','paid','cancelled')),
  delivery_window text, notes text, created_by uuid REFERENCES auth.users(id), deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.event_contingency_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  scenario text NOT NULL, trigger text, plan text, owner_name text,
  created_by uuid REFERENCES auth.users(id), deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- EB-Q
CREATE TABLE IF NOT EXISTS public.event_accessibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  need text NOT NULL DEFAULT 'other' CHECK (need IN ('wheelchair','hearing','visual','quiet_room','carer','neurodiversity','other')),
  provision text, status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','arranged','unavailable')),
  notes text, created_by uuid REFERENCES auth.users(id), deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.event_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('alcohol','tens','music_prs','music_ppl','safeguarding','insurance','health_safety','other')),
  reference text, status text NOT NULL DEFAULT 'required' CHECK (status IN ('required','applied','granted','expired','rejected')),
  expiry_date date, evidence_path text, created_by uuid REFERENCES auth.users(id), deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.event_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL, event_type text, source_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid REFERENCES auth.users(id), deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.event_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  comment text, source text NOT NULL DEFAULT 'attendee' CHECK (source IN ('attendee','client','staff','supplier')),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_tables','event_passes','event_comms_channels','event_purchase_orders','event_contingency_plans','event_accessibility','event_licenses','event_playbooks','event_feedback'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (workspace_id)', t||'_ws_idx', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id))', t||'_select', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_write') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id))', t||'_write', t);
    END IF;
  END LOOP;
END$$;
