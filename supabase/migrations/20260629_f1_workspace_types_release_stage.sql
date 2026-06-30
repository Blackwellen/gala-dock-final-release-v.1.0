-- Gala Dock — F1: Workspace types + release-stage (platform / marketplace foundation)
-- Additive, idempotent. Adds:
--   workspaces.workspace_type  organizer | venue | supplier   (default organizer)
--   workspaces.release_stage   v1 | v1_5 | v2                  (default v1)
-- These drive the feature-flag resolver in src/lib/flags. See docs/MASTER-PLAN.md §4
-- and docs/specs/README.md (F1). No data backfill needed — defaults apply to all rows.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS workspace_type text NOT NULL DEFAULT 'organizer',
  ADD COLUMN IF NOT EXISTS release_stage  text NOT NULL DEFAULT 'v1';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_workspace_type_check') THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_workspace_type_check
      CHECK (workspace_type IN ('organizer', 'venue', 'supplier'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_release_stage_check') THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_release_stage_check
      CHECK (release_stage IN ('v1', 'v1_5', 'v2'));
  END IF;
END$$;

COMMENT ON COLUMN public.workspaces.workspace_type IS
  'Workspace persona: organizer (default — the Event Delivery OS), venue (operator), supplier. Drives nav, onboarding, entitlements and which marketplace surfaces are visible.';
COMMENT ON COLUMN public.workspaces.release_stage IS
  'Per-workspace rollout stage (v1 | v1_5 | v2) for early-access cohorts. Global default comes from the RELEASE_STAGE env; the flag resolver takes the higher-privilege of the two where applicable.';

CREATE INDEX IF NOT EXISTS workspaces_workspace_type_idx ON public.workspaces (workspace_type);
