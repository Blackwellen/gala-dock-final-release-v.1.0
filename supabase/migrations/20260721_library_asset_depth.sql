-- Gala Dock — Files & Asset Library schema depth (Phase 3 of the library rebuild).
--
-- Context: the `library_assets` / `library_collections` / `library_versions` /
-- `library_share_links` / `library_settings` tables already exist live in the
-- database with full RLS (is_workspace_member/has_workspace_role, matching the
-- convention from 20260614_levels_11_15_tables.sql), but no migration file for
-- them was ever committed to this repo. This migration is split into two parts:
--
--   PART A — a guarded, idempotent "sync" of the existing library_* schema so
--   it is finally captured in version control. Every statement uses
--   IF NOT EXISTS / DO-block guards, so on the live database (where all of
--   this already exists) it is a safe no-op; on a fresh database it recreates
--   the schema exactly.
--
--   PART B — additive columns/tables that formalize workarounds the UI build
--   (Phase 2) had to use because these didn't exist yet: a real `brands`
--   table, a real `approval_status` column, real `audience`/`visibility`
--   columns on packs, and a bridge column linking library assets to the
--   existing supplier compliance system (`supplier_files`).
--
-- Additive only — no destructive drops, no column removals, no data loss.

-- ═══════════════════════════════════════════════════════════════════════
-- PART A — sync existing library_* schema into version control (no-op live)
-- ═══════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.library_asset_kind AS ENUM (
    'template', 'asset', 'snippet', 'checklist', 'email', 'playbook',
    'menu', 'poster', 'flyer', 'signage', 'presentation', 'floorplan',
    'contract', 'invoice_template', 'rider',
    'video', 'audio', 'image', 'document', 'archive'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.library_collection_kind AS ENUM (
    'event_pack', 'client_pack', 'supplier_pack', 'venue_pack',
    'brand_kit', 'season', 'campaign', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.library_share_scope AS ENUM ('view', 'download');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.library_visibility AS ENUM ('workspace', 'restricted', 'link', 'public_token');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.library_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id),
  kind public.library_asset_kind NOT NULL,
  title text NOT NULL,
  description text,
  storage_path text,
  mime text,
  size_bytes bigint NOT NULL DEFAULT 0,
  sha256 text,
  width integer,
  height integer,
  duration_seconds numeric,
  page_count integer,
  cover_storage_path text,
  tags text[] NOT NULL DEFAULT '{}',
  collection_id uuid,
  entity_type text,
  entity_id uuid,
  visibility public.library_visibility NOT NULL DEFAULT 'workspace',
  pinned_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by_user_id uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.library_asset_links (
  asset_id uuid NOT NULL REFERENCES public.library_assets(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  relation text NOT NULL DEFAULT 'attached',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, entity_type, entity_id, relation)
);

CREATE TABLE IF NOT EXISTS public.library_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL,
  kind public.library_collection_kind NOT NULL DEFAULT 'custom',
  name text NOT NULL,
  description text,
  cover_storage_path text,
  auto_filter jsonb NOT NULL DEFAULT '{}',
  entity_type text,
  entity_id uuid,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS public.library_collection_members (
  collection_id uuid NOT NULL REFERENCES public.library_collections(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.library_assets(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  added_by uuid REFERENCES auth.users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, asset_id)
);

CREATE TABLE IF NOT EXISTS public.library_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.library_assets(id) ON DELETE CASCADE,
  version integer NOT NULL,
  storage_path text,
  sha256 text,
  size_bytes bigint NOT NULL DEFAULT 0,
  note text,
  author_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, version)
);

CREATE TABLE IF NOT EXISTS public.library_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.library_assets(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  scope public.library_share_scope NOT NULL DEFAULT 'view',
  expires_at timestamptz,
  max_uses integer,
  use_count integer NOT NULL DEFAULT 0,
  password_hash text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.library_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  allowed_mime text[] NOT NULL DEFAULT '{}',
  default_visibility public.library_visibility NOT NULL DEFAULT 'workspace',
  retention_days integer,
  storage_quota_bytes bigint NOT NULL DEFAULT 107374182400, -- 100 GB
  watermark_enabled boolean NOT NULL DEFAULT false,
  watermark_text text,
  notify_on_expire boolean NOT NULL DEFAULT true,
  notify_on_share boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_assets_workspace_idx ON public.library_assets(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS library_assets_kind_idx ON public.library_assets(workspace_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS library_assets_entity_idx ON public.library_assets(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS library_assets_collection_idx ON public.library_assets(collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS library_collections_workspace_idx ON public.library_collections(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS library_versions_asset_idx ON public.library_versions(asset_id);
CREATE INDEX IF NOT EXISTS library_share_links_asset_idx ON public.library_share_links(asset_id);
CREATE INDEX IF NOT EXISTS library_share_links_token_idx ON public.library_share_links(token) WHERE revoked_at IS NULL;

ALTER TABLE public.library_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_asset_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_collection_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY library_assets_select ON public.library_assets FOR SELECT USING (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY library_assets_insert ON public.library_assets FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY library_assets_update ON public.library_assets FOR UPDATE USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY library_assets_delete ON public.library_assets FOR DELETE USING (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY library_asset_links_all ON public.library_asset_links USING (
    EXISTS (SELECT 1 FROM public.library_assets a WHERE a.id = library_asset_links.asset_id AND public.is_workspace_member(a.workspace_id))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY library_collections_select ON public.library_collections FOR SELECT USING (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY library_collections_insert ON public.library_collections FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY library_collections_update ON public.library_collections FOR UPDATE USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY library_collections_delete ON public.library_collections FOR DELETE USING (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY library_collection_members_all ON public.library_collection_members USING (
    EXISTS (SELECT 1 FROM public.library_collections c WHERE c.id = library_collection_members.collection_id AND public.is_workspace_member(c.workspace_id))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY library_versions_all ON public.library_versions USING (
    EXISTS (SELECT 1 FROM public.library_assets a WHERE a.id = library_versions.asset_id AND public.is_workspace_member(a.workspace_id))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY library_share_links_all ON public.library_share_links USING (
    EXISTS (SELECT 1 FROM public.library_assets a WHERE a.id = library_share_links.asset_id AND public.is_workspace_member(a.workspace_id))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY library_settings_select ON public.library_settings FOR SELECT USING (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY library_settings_insert ON public.library_settings FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY library_settings_update ON public.library_settings FOR UPDATE
    USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]))
    WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PART B — new depth: brands, approval_status, pack audience/visibility,
-- and a bridge from library_assets to the existing supplier compliance
-- system. All additive; nothing here can break Phase 2's existing queries.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────── Brands: replaces the metadata.brand_name string-matching hack
-- used by the Brand Assets screen (Phase 2) with a real, referenceable table.
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  logo_asset_id uuid REFERENCES public.library_assets(id) ON DELETE SET NULL,
  primary_color text,
  entity_type text,   -- e.g. 'event' when the brand is scoped to one event, null = workspace-level brand
  entity_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);
CREATE INDEX IF NOT EXISTS brands_workspace_idx ON public.brands(workspace_id);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY brands_select ON public.brands FOR SELECT USING (public.is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY brands_insert ON public.brands FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::public.workspace_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY brands_update ON public.brands FOR UPDATE
    USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::public.workspace_role[]))
    WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::public.workspace_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY brands_delete ON public.brands FOR DELETE USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.library_assets
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS library_assets_brand_idx ON public.library_assets(brand_id) WHERE brand_id IS NOT NULL;

-- Backfill: one workspace-level brand per workspace that already has brand-kind
-- assets tagged via the Phase 2 metadata workaround, then point those assets at it.
-- Safe/idempotent — only inserts a brand row the first time this runs per workspace.
INSERT INTO public.brands (workspace_id, name, slug)
SELECT DISTINCT a.workspace_id, w.name, regexp_replace(lower(w.name), '[^a-z0-9]+', '-', 'g')
FROM public.library_assets a
JOIN public.workspaces w ON w.id = a.workspace_id
WHERE a.metadata ? 'brand_name' OR a.metadata ? 'asset_type'
ON CONFLICT (workspace_id, slug) DO NOTHING;

UPDATE public.library_assets a
SET brand_id = b.id
FROM public.brands b
WHERE a.brand_id IS NULL
  AND b.workspace_id = a.workspace_id
  AND (a.metadata ? 'brand_name' OR a.metadata ? 'asset_type')
  AND b.entity_id IS NULL;

-- ───────── Approval workflow: promotes metadata.approval_status (Phase 2
-- workaround, used by Brand Assets/Templates) into a real, indexable column.
ALTER TABLE public.library_assets
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('draft', 'pending_review', 'approved', 'rejected', 'changes_requested', 'superseded', 'archived'));

UPDATE public.library_assets
SET approval_status = metadata->>'approval_status'
WHERE metadata->>'approval_status' IS NOT NULL
  AND metadata->>'approval_status' IN ('draft', 'pending_review', 'approved', 'rejected', 'changes_requested', 'superseded', 'archived')
  AND approval_status = 'approved';

CREATE INDEX IF NOT EXISTS library_assets_approval_idx ON public.library_assets(workspace_id, approval_status) WHERE deleted_at IS NULL;

-- ───────── Event Packs: promotes audience/visibility out of auto_filter jsonb
-- (Phase 2 workaround) into real, filterable/indexable columns. auto_filter
-- keeps carrying the actual smart-pack rule definition — unrelated concern.
ALTER TABLE public.library_collections
  ADD COLUMN IF NOT EXISTS audience text,
  ADD COLUMN IF NOT EXISTS visibility public.library_visibility NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS is_smart boolean NOT NULL DEFAULT false;

UPDATE public.library_collections
SET
  audience = COALESCE(audience, auto_filter->>'audience'),
  is_smart = is_smart OR (auto_filter ? 'rules') OR (auto_filter ? 'smart'),
  visibility = CASE
    WHEN auto_filter->>'visibility' = 'public' THEN 'public_token'::public.library_visibility
    WHEN auto_filter->>'visibility' = 'link' THEN 'link'::public.library_visibility
    WHEN auto_filter->>'visibility' = 'restricted' THEN 'restricted'::public.library_visibility
    ELSE visibility
  END
WHERE auto_filter <> '{}'::jsonb;

CREATE INDEX IF NOT EXISTS library_collections_audience_idx ON public.library_collections(workspace_id, audience) WHERE audience IS NOT NULL;

-- ───────── Supplier Documents bridge: links a library_assets upload to the
-- pre-existing, more mature supplier compliance row (supplier_files, with its
-- review_status/risk_level/due_date workflow from 20260711_supplier_rfq_depth.sql)
-- so Phase 2's metadata-based verification status can be replaced by the real
-- workflow instead of two parallel systems. Nullable + additive: existing
-- supplier_files rows created before the library screen existed are unaffected.
ALTER TABLE public.supplier_files
  ADD COLUMN IF NOT EXISTS library_asset_id uuid REFERENCES public.library_assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS supplier_files_library_asset_idx ON public.supplier_files(library_asset_id) WHERE library_asset_id IS NOT NULL;

-- Note for the next UI pass: once this bridge column is populated by the
-- Supplier Documents screen going forward, verification/expiry should be read
-- from supplier_files (review_status/risk_level/due_date) via this join
-- instead of from library_assets.metadata, retiring that Phase 2 workaround.
