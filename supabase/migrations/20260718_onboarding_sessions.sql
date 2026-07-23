-- =============================================================================
-- Gala Dock — Onboarding session state machine
-- Backs resumable, autosaving onboarding wizards across all portal types
-- (event_manager today; venue_manager/supplier/customer/affiliate reuse this
-- same engine in later phases). Idempotent: guarded CREATE/ADD statements.
-- RLS: strictly self-scoped — a user only ever sees their own sessions/events.
-- =============================================================================

-- ─── ONBOARDING SESSIONS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portal_type        text NOT NULL
    CHECK (portal_type IN ('event_manager','venue_manager','supplier','customer','affiliate')),
  status             text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('not_started','in_progress','awaiting_review','completed','abandoned')),
  current_step       text,
  completed_steps    text[] NOT NULL DEFAULT '{}',
  draft              jsonb NOT NULL DEFAULT '{}'::jsonb,
  workspace_draft_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  started_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

-- Only one active (non-completed, non-abandoned) session per user per portal —
-- this is what makes resume-vs-start-new deterministic.
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_sessions_active_unique
  ON public.onboarding_sessions (user_id, portal_type)
  WHERE status NOT IN ('completed', 'abandoned');

CREATE INDEX IF NOT EXISTS onboarding_sessions_user_idx ON public.onboarding_sessions (user_id);

DROP TRIGGER IF EXISTS onboarding_sessions_set_updated_at ON public.onboarding_sessions;
CREATE TRIGGER onboarding_sessions_set_updated_at
  BEFORE UPDATE ON public.onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_sessions_self_all ON public.onboarding_sessions;
CREATE POLICY onboarding_sessions_self_all ON public.onboarding_sessions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── ONBOARDING EVENTS (lightweight audit trail) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_session_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_session_events_session_idx ON public.onboarding_session_events (session_id);

ALTER TABLE public.onboarding_session_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_session_events_self_all ON public.onboarding_session_events;
CREATE POLICY onboarding_session_events_self_all ON public.onboarding_session_events
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.onboarding_sessions s
    WHERE s.id = onboarding_session_events.session_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.onboarding_sessions s
    WHERE s.id = onboarding_session_events.session_id AND s.user_id = auth.uid()
  ));
