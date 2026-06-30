-- Gala Dock — Event Business Layer EB-A: configurable event types + templates.
-- event_types are DATA (admin-extendable), not hard-coded. workspace_id NULL = global default
-- (readable by all, editable by none); workspace rows extend/override. Templates store the
-- per-type config (fields/planning/budget/revenue/risk/ticket/staffing/timeline/checklist) as JSONB.
-- Idempotent. RLS via is_workspace_member. Money in pence at use-sites.

CREATE TABLE IF NOT EXISTS public.event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,   -- NULL = global default
  key text NOT NULL,
  name text NOT NULL,
  category text,                       -- nightlife | public | private | corporate | remote | hybrid | structure | other
  icon text,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_types_global_key ON public.event_types (key) WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_types_ws_key ON public.event_types (workspace_id, key) WHERE workspace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_type_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,   -- NULL = global default
  event_type_id uuid NOT NULL REFERENCES public.event_types(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('fields','planning','budget','revenue','risk','ticket','staffing','timeline','checklist','marketing')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_type_templates_type_idx ON public.event_type_templates (event_type_id, kind);

ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_type_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_types' AND policyname='event_types_select') THEN
    CREATE POLICY event_types_select ON public.event_types FOR SELECT
      USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_types' AND policyname='event_types_write') THEN
    CREATE POLICY event_types_write ON public.event_types FOR ALL
      USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id))
      WITH CHECK (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_type_templates' AND policyname='event_type_templates_select') THEN
    CREATE POLICY event_type_templates_select ON public.event_type_templates FOR SELECT
      USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_type_templates' AND policyname='event_type_templates_write') THEN
    CREATE POLICY event_type_templates_write ON public.event_type_templates FOR ALL
      USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id))
      WITH CHECK (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id));
  END IF;
END$$;

-- Seed global default event types (workspace_id NULL).
INSERT INTO public.event_types (workspace_id, key, name, category, is_default, sort) VALUES
  (NULL,'nightclub','Nightclub Event','nightlife',true,10),
  (NULL,'festival','Festival','public',true,20),
  (NULL,'gig','Gig','public',true,30),
  (NULL,'theatre','Theatre / Show','public',true,40),
  (NULL,'show_large','Large Show','public',true,50),
  (NULL,'show_small','Small Show','public',true,60),
  (NULL,'wedding','Wedding','private',true,70),
  (NULL,'birthday','Birthday','private',true,80),
  (NULL,'childrens_party','Children''s Party','private',true,90),
  (NULL,'private_party','Private Party','private',true,100),
  (NULL,'corporate','Corporate Event','corporate',true,110),
  (NULL,'conference','Conference','corporate',true,120),
  (NULL,'speaker','Speaker Event','corporate',true,130),
  (NULL,'webinar','Webinar','remote',true,140),
  (NULL,'remote','Remote Event','remote',true,150),
  (NULL,'hybrid','Hybrid Event','hybrid',true,160),
  (NULL,'multi_room','Multi-room Event','structure',true,170),
  (NULL,'multi_venue','Multi-venue Event','structure',true,180),
  (NULL,'international','International Event','structure',true,190),
  (NULL,'custom','Custom Event','other',true,200)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.event_types IS 'EB-A: configurable event types (global defaults + per-workspace). Drives type-aware tabs, templates, budgets, risk, ticketing.';
