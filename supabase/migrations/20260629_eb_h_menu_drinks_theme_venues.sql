-- Gala Dock — EB-H: menu / drinks / theme + multi-venue. RLS via is_workspace_member. Idempotent.

CREATE TABLE IF NOT EXISTS public.event_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','secondary','backup')),
  address text,
  city text,
  country text,
  capacity integer,
  timezone text,
  notes text,
  sort integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_venues_event_idx ON public.event_venues (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  course text NOT NULL DEFAULT 'main' CHECK (course IN ('canape','starter','main','dessert','kids','side','drink','other')),
  description text,
  dietary text,
  allergens text,
  price_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  package text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_menu_items_event_idx ON public.event_menu_items (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_drinks_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'package' CHECK (kind IN ('open_bar','cash_bar','tokens','vip_bottle','package')),
  price_per_head_cents bigint NOT NULL DEFAULT 0,
  min_spend_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_drinks_packages_event_idx ON public.event_drinks_packages (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_theme_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  palette text,
  moodboard_path text,
  decor_supplier text,
  decor_budget_cents bigint NOT NULL DEFAULT 0,
  room_id uuid REFERENCES public.event_rooms(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_theme_plans_event_idx ON public.event_theme_plans (workspace_id, event_id);

ALTER TABLE public.event_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_drinks_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_theme_plans ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_venues','event_menu_items','event_drinks_packages','event_theme_plans'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id))', t||'_select', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_write') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id))', t||'_write', t);
    END IF;
  END LOOP;
END$$;
