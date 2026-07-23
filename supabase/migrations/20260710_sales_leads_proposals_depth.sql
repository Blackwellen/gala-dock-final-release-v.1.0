-- Gala Dock — Sales section depth: extend leads + proposals for the
-- 3-step lead wizard, qualification/scoring, and richer proposal cards.
-- Additive-only; existing rows get safe defaults.

-- ───────────────────────── LEADS ─────────────────────────
ALTER TABLE public.leads
  -- Contact & Source (wizard step 1)
  ADD COLUMN IF NOT EXISTS lead_title text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS alt_email text,
  ADD COLUMN IF NOT EXISTS alt_phone text,
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enquiry_channel text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text,
  ADD COLUMN IF NOT EXISTS campaign text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS response_sla_hours integer,
  ADD COLUMN IF NOT EXISTS preferred_contact_time text,
  ADD COLUMN IF NOT EXISTS contact_timezone text,
  -- Event Details (wizard step 2)
  ADD COLUMN IF NOT EXISTS event_format text,
  ADD COLUMN IF NOT EXISTS date_flexibility text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS budget_min_cents bigint,
  ADD COLUMN IF NOT EXISTS budget_max_cents bigint,
  ADD COLUMN IF NOT EXISTS event_purpose text,
  ADD COLUMN IF NOT EXISTS ticketing_type text,
  ADD COLUMN IF NOT EXISTS venue_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS additional_requirements text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accessibility_notes text,
  ADD COLUMN IF NOT EXISTS is_international boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_platform text,
  ADD COLUMN IF NOT EXISTS multi_room boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alcohol_bar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minors_present boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS licensing_notes text,
  ADD COLUMN IF NOT EXISTS reference_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Qualification & Review (wizard step 3)
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS probability_pct integer,
  ADD COLUMN IF NOT EXISTS response_due_date date,
  ADD COLUMN IF NOT EXISTS follow_up_cadence text,
  ADD COLUMN IF NOT EXISTS lead_temperature text,
  ADD COLUMN IF NOT EXISTS decision_maker boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qualification jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lead_score integer,
  ADD COLUMN IF NOT EXISTS lead_score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS next_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS internal_comments text,
  -- Draft / wizard lifecycle + card imagery
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wizard_step text NOT NULL DEFAULT 'contact',
  ADD COLUMN IF NOT EXISTS cover_theme text;

CREATE INDEX IF NOT EXISTS leads_priority_idx ON public.leads(workspace_id, priority);
CREATE INDEX IF NOT EXISTS leads_draft_idx ON public.leads(workspace_id, is_draft);

COMMENT ON COLUMN public.leads.cover_theme IS
  'Deterministic thumbnail theme key (derived from event_type) — no external image URL is stored.';

-- ───────────────────────── PROPOSALS ─────────────────────────
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS margin_pct numeric,
  ADD COLUMN IF NOT EXISTS cover_theme text,
  ADD COLUMN IF NOT EXISTS next_action_label text,
  ADD COLUMN IF NOT EXISTS next_action_due date,
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.proposals.cover_theme IS
  'Deterministic thumbnail theme key (derived from event_type) — no external image URL is stored.';

-- Backfill owner_id from created_by for existing rows so the UI has an owner avatar.
UPDATE public.proposals SET owner_id = created_by WHERE owner_id IS NULL;
