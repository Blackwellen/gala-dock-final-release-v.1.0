-- Gala Dock — Two-tier affiliate layer.
--
-- Builds on the existing single-tier affiliate system (affiliate_accounts 1:1 workspace,
-- affiliate_links, affiliate_clicks, affiliate_conversions). Adds:
--   • parent_account_id  — the affiliate who recruited this affiliate (self-FK, tier-2)
--   • override_rate_pct  — % the PARENT earns on this affiliate's conversions
--   • recruit_code       — the code this affiliate shares to recruit sub-affiliates
--   • affiliate_overrides — ledger of tier-2 override earnings
--   • trigger            — auto-creates an override row whenever a child conversion lands
-- Idempotent. Money in minor units (pence). RLS via is_workspace_member.

-- 1. Extend affiliate_accounts with the tier-2 columns.
ALTER TABLE public.affiliate_accounts
  ADD COLUMN IF NOT EXISTS parent_account_id uuid REFERENCES public.affiliate_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_rate_pct numeric(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS recruit_code text,
  ADD COLUMN IF NOT EXISTS tier smallint NOT NULL DEFAULT 1;

-- Backfill recruit codes for existing accounts, then enforce uniqueness.
UPDATE public.affiliate_accounts
  SET recruit_code = upper(substr(md5(id::text || '-recruit'), 1, 8))
  WHERE recruit_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_accounts_recruit_code_idx
  ON public.affiliate_accounts (recruit_code);
CREATE INDEX IF NOT EXISTS affiliate_accounts_parent_idx
  ON public.affiliate_accounts (parent_account_id);

-- 2. Override ledger — one row per (parent, source conversion).
CREATE TABLE IF NOT EXISTS public.affiliate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_account_id uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  child_account_id uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  source_conversion_id uuid NOT NULL REFERENCES public.affiliate_conversions(id) ON DELETE CASCADE,
  override_rate_pct numeric(5,2) NOT NULL DEFAULT 0,
  amount_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','void')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_overrides_source_idx
  ON public.affiliate_overrides (source_conversion_id);
CREATE INDEX IF NOT EXISTS affiliate_overrides_parent_idx
  ON public.affiliate_overrides (parent_account_id);
CREATE INDEX IF NOT EXISTS affiliate_overrides_child_idx
  ON public.affiliate_overrides (child_account_id);

ALTER TABLE public.affiliate_overrides ENABLE ROW LEVEL SECURITY;

-- The parent affiliate's workspace members can read their override earnings.
-- (Writes happen via the trigger / service role only — no insert/update policy.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'affiliate_overrides' AND policyname = 'affiliate_overrides_select') THEN
    CREATE POLICY affiliate_overrides_select ON public.affiliate_overrides
      FOR SELECT USING (
        parent_account_id IN (
          SELECT id FROM public.affiliate_accounts WHERE public.is_workspace_member(workspace_id)
        )
      );
  END IF;
END$$;

-- 3. Auto-create the tier-2 override when a child conversion is recorded.
CREATE OR REPLACE FUNCTION public.record_affiliate_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid;
  v_rate numeric(5,2);
BEGIN
  SELECT parent_account_id, override_rate_pct
    INTO v_parent, v_rate
    FROM public.affiliate_accounts
    WHERE id = NEW.account_id;

  IF v_parent IS NOT NULL AND COALESCE(v_rate, 0) > 0 THEN
    INSERT INTO public.affiliate_overrides (
      parent_account_id, child_account_id, source_conversion_id,
      override_rate_pct, amount_cents, currency, status
    )
    VALUES (
      v_parent, NEW.account_id, NEW.id,
      v_rate, floor(NEW.invoice_amount_cents * v_rate / 100.0)::bigint, NEW.currency, 'pending'
    )
    ON CONFLICT (source_conversion_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_affiliate_override ON public.affiliate_conversions;
CREATE TRIGGER trg_affiliate_override
  AFTER INSERT ON public.affiliate_conversions
  FOR EACH ROW EXECUTE FUNCTION public.record_affiliate_override();

COMMENT ON TABLE public.affiliate_overrides IS 'Tier-2 affiliate override earnings: a parent affiliate earns override_rate_pct on each sub-affiliate conversion. amount_cents in pence.';
COMMENT ON COLUMN public.affiliate_accounts.parent_account_id IS 'The affiliate account that recruited this one (tier-2). NULL = top-level affiliate.';
COMMENT ON COLUMN public.affiliate_accounts.override_rate_pct IS 'Percentage the parent affiliate earns on this affiliate''s conversions.';
COMMENT ON COLUMN public.affiliate_accounts.recruit_code IS 'Code this affiliate shares to recruit sub-affiliates.';
