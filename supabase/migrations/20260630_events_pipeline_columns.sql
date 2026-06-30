-- =============================================================================
-- Gala Dock — Events Pipeline: add missing columns needed by pipeline UI
-- Idempotent: all changes use ADD COLUMN IF NOT EXISTS / DO/IF NOT EXISTS guards
-- =============================================================================

-- ─── owner, risk, readiness, next-action ──────────────────────────────────────
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS owner_user_id      uuid REFERENCES auth.users(id);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS risk_level         text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS readiness_score    integer DEFAULT 0 CHECK (readiness_score BETWEEN 0 AND 100);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS next_action        text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS next_action_due    date;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS quote_value_cents  bigint DEFAULT 0;

-- ─── fields already referenced in queries but missing from schema ─────────────
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS client_company     text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location           text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS guest_count_evening integer;

-- ─── pipeline loss tracking ───────────────────────────────────────────────────
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS loss_reason        text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancelled_at       timestamptz;

-- ─── risk_level constraint (safe to add idempotently) ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_risk_level_check' AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_risk_level_check
      CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high', 'critical'));
  END IF;
END$$;

-- ─── indexes to support pipeline filtering ────────────────────────────────────
CREATE INDEX IF NOT EXISTS events_risk_level_idx       ON public.events (workspace_id, risk_level) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS events_owner_idx            ON public.events (workspace_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS events_next_action_due_idx  ON public.events (workspace_id, next_action_due) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS events_readiness_idx        ON public.events (workspace_id, readiness_score) WHERE deleted_at IS NULL;

-- ─── event_guests: ensure deleted_at exists (table may already exist from 20260614) ──
ALTER TABLE public.event_guests ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ─── event_guests table (referenced by overview page) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.event_guests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name              text NOT NULL,
  email             text,
  phone             text,
  guest_type        text DEFAULT 'general'
    CHECK (guest_type IN ('general','vip','speaker','sponsor','staff','media','press','other')),
  rsvp_status       text NOT NULL DEFAULT 'pending'
    CHECK (rsvp_status IN ('pending','confirmed','declined','waitlisted','attended','no_show')),
  dietary_notes     text,
  accessibility_notes text,
  ticket_ref        text,
  table_seat_ref    text,
  checked_in_at     timestamptz,
  notes             text,
  created_by        uuid REFERENCES auth.users(id),
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_guests_event_idx    ON public.event_guests (workspace_id, event_id);
CREATE INDEX IF NOT EXISTS event_guests_rsvp_idx     ON public.event_guests (workspace_id, event_id, rsvp_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS event_guests_checkin_idx  ON public.event_guests (workspace_id, event_id, checked_in_at) WHERE checked_in_at IS NOT NULL;

-- RLS for event_guests
ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_guests' AND policyname='event_guests_workspace_select') THEN
    CREATE POLICY event_guests_workspace_select ON public.event_guests FOR SELECT
      USING (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='event_guests' AND policyname='event_guests_workspace_write') THEN
    CREATE POLICY event_guests_workspace_write ON public.event_guests FOR ALL
      USING (public.is_workspace_member(workspace_id))
      WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
END$$;
