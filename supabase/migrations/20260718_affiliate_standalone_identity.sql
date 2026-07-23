-- =============================================================================
-- Gala Dock — Decouple affiliates from operator workspaces
--
-- affiliate_accounts was previously 1:1 with workspace_id only, meaning you had
-- to already own an operator workspace to become an affiliate. Affiliate must be
-- a standalone identity (like `customers`) that never touches a workspace or the
-- workspace switcher. This makes workspace_id optional and adds user_id as the
-- standalone-identity key, backfilling existing rows from the workspace owner so
-- nothing currently working breaks. Idempotent.
-- =============================================================================

-- 1. Make workspace_id optional; add the standalone identity column.
ALTER TABLE public.affiliate_accounts
  ALTER COLUMN workspace_id DROP NOT NULL;

ALTER TABLE public.affiliate_accounts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Backfill: every existing (legacy, workspace-scoped) affiliate account gets
--    user_id set to its workspace owner, so the standalone-identity lookup path
--    resolves correctly for accounts created before this migration too.
UPDATE public.affiliate_accounts a
  SET user_id = w.owner_user_id
  FROM public.workspaces w
  WHERE a.workspace_id = w.id
    AND a.user_id IS NULL;

-- 3. Every affiliate account must be tied to something (a workspace, a user, or both).
ALTER TABLE public.affiliate_accounts
  DROP CONSTRAINT IF EXISTS affiliate_accounts_identity_check;
ALTER TABLE public.affiliate_accounts
  ADD CONSTRAINT affiliate_accounts_identity_check
  CHECK (workspace_id IS NOT NULL OR user_id IS NOT NULL);

-- 4. One standalone affiliate account per user (workspace-linked legacy rows can
--    still coexist with a NULL user_id, or vice versa).
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_accounts_user_id_idx
  ON public.affiliate_accounts (user_id)
  WHERE user_id IS NOT NULL;

-- 5. RLS: standalone affiliates read/manage their own account by user_id. This is
--    additive — the existing workspace-membership policy (defined outside the
--    migrations folder) is untouched, so legacy workspace-linked accounts keep
--    working exactly as before.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_accounts' AND policyname = 'affiliate_accounts_self_standalone'
  ) THEN
    CREATE POLICY affiliate_accounts_self_standalone ON public.affiliate_accounts
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END$$;

COMMENT ON COLUMN public.affiliate_accounts.user_id IS 'Standalone affiliate identity (1 account per user), independent of any operator workspace. NULL only for legacy workspace-linked accounts predating this column.';
COMMENT ON COLUMN public.affiliate_accounts.workspace_id IS 'Legacy workspace-scoped affiliate link. Nullable — new standalone affiliate signups leave this NULL and use user_id instead.';

-- 6. Auto-generate recruit_code on insert when the caller doesn't set one —
--    self-serve standalone signups don't know their own row id ahead of time
--    to derive it client-side the way the 20260630 backfill did.
CREATE OR REPLACE FUNCTION public.affiliate_accounts_set_recruit_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.recruit_code IS NULL THEN
    NEW.recruit_code := upper(substr(md5(NEW.id::text || '-recruit'), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_affiliate_accounts_recruit_code ON public.affiliate_accounts;
CREATE TRIGGER trg_affiliate_accounts_recruit_code
  BEFORE INSERT ON public.affiliate_accounts
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_accounts_set_recruit_code();
