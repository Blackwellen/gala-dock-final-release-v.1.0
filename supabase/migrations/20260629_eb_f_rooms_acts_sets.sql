-- Gala Dock — EB-F: multi-room + acts (DJ/artist/speaker/host) + set-time schedules.
-- Workspace-scoped, RLS via is_workspace_member, money in pence. Idempotent.

CREATE TABLE IF NOT EXISTS public.event_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity integer,
  layout_mode text CHECK (layout_mode IS NULL OR layout_mode IN ('seated','standing','hybrid','capacity')),
  notes text,
  sort integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_rooms_event_idx ON public.event_rooms (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_acts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'dj' CHECK (kind IN ('dj','artist','band','speaker','host','mc','other')),
  supplier_id uuid,
  fee_cents bigint NOT NULL DEFAULT 0,
  fee_type text NOT NULL DEFAULT 'flat' CHECK (fee_type IN ('flat','hourly')),
  rider_notes text,
  contact text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_acts_event_idx ON public.event_acts (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_act_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  act_id uuid REFERENCES public.event_acts(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.event_rooms(id) ON DELETE SET NULL,
  label text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  soundcheck_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_act_sets_event_idx ON public.event_act_sets (workspace_id, event_id);
CREATE INDEX IF NOT EXISTS event_act_sets_room_idx ON public.event_act_sets (room_id, starts_at);

ALTER TABLE public.event_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_acts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_act_sets ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_rooms','event_acts','event_act_sets'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id))', t||'_select', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_write') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id))', t||'_write', t);
    END IF;
  END LOOP;
END$$;

COMMENT ON TABLE public.event_act_sets IS 'EB-F: set times per room — overlap = scheduling conflict (validated in app).';
