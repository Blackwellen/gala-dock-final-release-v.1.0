-- =============================================================================
-- Gala Dock — Events: expenses, budget lines, guests column fix
-- Idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DO guards
-- =============================================================================

-- ─── ENUM: event_budget_line_status ──────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_budget_line_status') THEN
    CREATE TYPE public.event_budget_line_status AS ENUM ('planned', 'committed', 'paid');
  END IF;
END$$;

-- ─── EVENT BUDGET LINES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_budget_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id         uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category         text NOT NULL,
  description      text,
  position         integer NOT NULL DEFAULT 0,
  quantity         numeric NOT NULL DEFAULT 1,
  unit_cost_cents  bigint NOT NULL DEFAULT 0,
  currency         text NOT NULL DEFAULT 'GBP',
  source_id        uuid,
  source_kind      text,
  status           public.event_budget_line_status NOT NULL DEFAULT 'planned',
  supplier_ref     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_budget_lines_event_idx      ON public.event_budget_lines (workspace_id, event_id);
CREATE INDEX IF NOT EXISTS event_budget_lines_category_idx   ON public.event_budget_lines (workspace_id, event_id, category);
CREATE INDEX IF NOT EXISTS event_budget_lines_status_idx     ON public.event_budget_lines (workspace_id, event_id, status);

ALTER TABLE public.event_budget_lines ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_budget_lines' AND policyname='event_budget_lines_workspace_select') THEN
    CREATE POLICY event_budget_lines_workspace_select ON public.event_budget_lines FOR SELECT
      USING (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_budget_lines' AND policyname='event_budget_lines_workspace_write') THEN
    CREATE POLICY event_budget_lines_workspace_write ON public.event_budget_lines FOR ALL
      USING (public.is_workspace_member(workspace_id))
      WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
END$$;

-- ─── EVENT EXPENSES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_expenses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id              uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  description           text NOT NULL,
  category              text,
  amount_cents          bigint NOT NULL DEFAULT 0,
  expense_date          date,
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','paid')),
  supplier_id           uuid,
  receipt_storage_key   text,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_expenses_event_idx      ON public.event_expenses (workspace_id, event_id);
CREATE INDEX IF NOT EXISTS event_expenses_date_idx       ON public.event_expenses (workspace_id, event_id, expense_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS event_expenses_category_idx   ON public.event_expenses (workspace_id, event_id, category);

ALTER TABLE public.event_expenses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_expenses' AND policyname='event_expenses_workspace_select') THEN
    CREATE POLICY event_expenses_workspace_select ON public.event_expenses FOR SELECT
      USING (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_expenses' AND policyname='event_expenses_workspace_write') THEN
    CREATE POLICY event_expenses_workspace_write ON public.event_expenses FOR ALL
      USING (public.is_workspace_member(workspace_id))
      WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
END$$;

-- ─── FIX event_guests: add columns expected by guests/page.tsx ───────────────
-- guests/page.tsx queries: full_name, email, company, segment, rsvp_status,
--   attendance_mode, check_in_status, dietary_requirements, accessibility_needs
-- Previous migration created table with: name, dietary_notes, accessibility_notes
-- We add the missing columns idempotently.

ALTER TABLE public.event_guests ADD COLUMN IF NOT EXISTS full_name             text;
ALTER TABLE public.event_guests ADD COLUMN IF NOT EXISTS company               text;
ALTER TABLE public.event_guests ADD COLUMN IF NOT EXISTS segment               text
  DEFAULT 'customer' CHECK (segment IN ('vip','speaker','sponsor','staff','customer','partner','media','exhibitor','other') OR segment IS NULL);
ALTER TABLE public.event_guests ADD COLUMN IF NOT EXISTS attendance_mode       text
  DEFAULT 'in_person' CHECK (attendance_mode IN ('in_person','online','hybrid') OR attendance_mode IS NULL);
ALTER TABLE public.event_guests ADD COLUMN IF NOT EXISTS check_in_status       text
  DEFAULT 'not_arrived' CHECK (check_in_status IN ('not_arrived','checked_in','checked_out','no_show') OR check_in_status IS NULL);
ALTER TABLE public.event_guests ADD COLUMN IF NOT EXISTS dietary_requirements  text;
ALTER TABLE public.event_guests ADD COLUMN IF NOT EXISTS accessibility_needs   text;

-- Backfill full_name — handle both schema variants:
--   • 20260614 migration: first_name + last_name columns (no 'name' column)
--   • 20260630 migration: name column (no first_name/last_name)
-- Use DO block to avoid "column does not exist" error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_guests' AND column_name = 'name') THEN
    UPDATE public.event_guests SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_guests' AND column_name = 'first_name') THEN
    UPDATE public.event_guests SET full_name = TRIM(CONCAT(first_name, ' ', last_name))
    WHERE full_name IS NULL AND first_name IS NOT NULL;
  END IF;
END$$;

-- Index on segment for filtering
CREATE INDEX IF NOT EXISTS event_guests_segment_idx ON public.event_guests (workspace_id, event_id, segment) WHERE deleted_at IS NULL;
