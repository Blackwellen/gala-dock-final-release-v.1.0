-- Gala Dock — EB-G: event risk assessments (type-specific). RLS via is_workspace_member. Idempotent.
CREATE TABLE IF NOT EXISTS public.event_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  owner_name text,
  likelihood smallint NOT NULL DEFAULT 2 CHECK (likelihood BETWEEN 1 AND 5),
  impact smallint NOT NULL DEFAULT 2 CHECK (impact BETWEEN 1 AND 5),
  mitigation text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigating','closed','accepted')),
  due_date date,
  evidence_path text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_risks_event_idx ON public.event_risks (workspace_id, event_id);
ALTER TABLE public.event_risks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_risks' AND policyname='event_risks_select') THEN
    CREATE POLICY event_risks_select ON public.event_risks FOR SELECT USING (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_risks' AND policyname='event_risks_write') THEN
    CREATE POLICY event_risks_write ON public.event_risks FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
END$$;
COMMENT ON TABLE public.event_risks IS 'EB-G: risk assessment items (score = likelihood x impact).';
