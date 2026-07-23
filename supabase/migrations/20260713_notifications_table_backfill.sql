-- =============================================================================
-- Gala Dock — Notifications table backfill migration
-- The `notifications` table is already live in production (used by the bell
-- icon / NotificationsMenu) but has no corresponding migration file in this
-- repo — it was created directly against the linked Supabase project outside
-- version control. This migration lets a fresh database reproduce it.
-- CREATE TABLE IF NOT EXISTS is a no-op against the current production
-- database, which already has this table with matching columns and existing
-- SELECT ("Recipients read own notifications") / UPDATE ("Recipients mark
-- own notifications read") RLS policies — this migration does NOT touch
-- those. It only adds the one policy that was missing: INSERT, needed so
-- the new Inbox messaging code can notify other participants of a message
-- using the sender's own authenticated session (not a service-role client).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  body         text,
  link         text,
  severity     text NOT NULL DEFAULT 'info',
  category     text NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_workspace_idx ON public.notifications (workspace_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Only add INSERT — SELECT/UPDATE already exist in production under
-- different policy names with equivalent semantics (user_id = auth.uid()).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY notifications_insert ON public.notifications FOR INSERT
      WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
END $$;
