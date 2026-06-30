-- Gala Dock — EB-L: inventory/equipment + incident log + public event layer. Idempotent.

CREATE TABLE IF NOT EXISTS public.event_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('radio','wristband','scanner','barrier','staging','lighting','av','decor','other')),
  quantity integer NOT NULL DEFAULT 0,
  assigned integer NOT NULL DEFAULT 0,
  lost integer NOT NULL DEFAULT 0,
  damaged integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_inventory_event_idx ON public.event_inventory_items (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('medical','security','complaint','safeguarding','lost_property','technical','other')),
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  description text,
  owner_name text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  evidence_path text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_incidents_event_idx ON public.event_incidents (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_public_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  published boolean NOT NULL DEFAULT false,
  headline text,
  summary text,
  hero_path text,
  seo_title text,
  seo_description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_public_pages_event_idx ON public.event_public_pages (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','attended','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_registrations_event_idx ON public.event_registrations (workspace_id, event_id);

CREATE TABLE IF NOT EXISTS public.event_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_public_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_inventory_items','event_incidents','event_public_pages','event_registrations','event_waitlist'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id))', t||'_select', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_write') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id))', t||'_write', t);
    END IF;
  END LOOP;
END$$;

-- Public layer: anyone may read a PUBLISHED public page; anyone may register / join the waitlist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_public_pages' AND policyname='event_public_pages_anon') THEN
    CREATE POLICY event_public_pages_anon ON public.event_public_pages FOR SELECT USING (published = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_registrations' AND policyname='event_registrations_anon_insert') THEN
    CREATE POLICY event_registrations_anon_insert ON public.event_registrations FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.event_public_pages p WHERE p.event_id = event_registrations.event_id AND p.published = true)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_waitlist' AND policyname='event_waitlist_anon_insert') THEN
    CREATE POLICY event_waitlist_anon_insert ON public.event_waitlist FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.event_public_pages p WHERE p.event_id = event_waitlist.event_id AND p.published = true)
    );
  END IF;
END$$;

COMMENT ON TABLE public.event_public_pages IS 'EB-L: public/SEO event pages (published rows are anon-readable). Registrations + waitlist gate on a published page.';
