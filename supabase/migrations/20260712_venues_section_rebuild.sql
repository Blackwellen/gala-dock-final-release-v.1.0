-- Venues section rebuild — Event Manager venue directory + relationship depth.
-- Extends the existing workspace-scoped public.venues table (do not touch
-- public.venue_management-owned booking tables). Idempotent, RLS via
-- is_workspace_member, money in *_cents. Follows the same conventions as
-- 20260712_finance_section_rebuild.sql / 20260629_eb_e_venue_bar_deposits.sql.

-- =============================================================================
-- 1. Extend public.venues with relationship / suitability / geo fields
-- =============================================================================
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS is_preferred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating numeric(2,1),
  ADD COLUMN IF NOT EXISTS suitability_score numeric(2,1),
  ADD COLUMN IF NOT EXISTS response_time_hours numeric(6,2),
  ADD COLUMN IF NOT EXISTS avg_spend_cents bigint,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS preferred_since date,
  ADD COLUMN IF NOT EXISTS preferred_reason text,
  ADD COLUMN IF NOT EXISTS preferred_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS relationship_owner_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS review_date date,
  ADD COLUMN IF NOT EXISTS what3words text,
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS best_fit_event_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS accessibility_features jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS venues_workspace_preferred_idx ON public.venues (workspace_id) WHERE is_preferred = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS venues_workspace_name_idx ON public.venues (workspace_id, name);

-- =============================================================================
-- 2. Extend venue_documents with versioning + category
-- =============================================================================
ALTER TABLE public.venue_documents
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS parent_document_id uuid REFERENCES public.venue_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS r2_key text,
  ADD COLUMN IF NOT EXISTS checksum text;

CREATE INDEX IF NOT EXISTS venue_documents_expiry_idx ON public.venue_documents (workspace_id, expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS venue_documents_current_idx ON public.venue_documents (workspace_id, venue_id) WHERE is_current = true;

-- =============================================================================
-- 3. Extend venue_notes with type / tags / reminders / links
-- =============================================================================
ALTER TABLE public.venue_notes
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reminder_date date,
  ADD COLUMN IF NOT EXISTS related_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS venue_notes_pinned_idx ON public.venue_notes (workspace_id, venue_id) WHERE is_pinned = true;

-- =============================================================================
-- 4. New relational tables
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.venue_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id     uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name         text NOT NULL,
  role         text,
  email        text,
  phone        text,
  is_primary   boolean NOT NULL DEFAULT false,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_contacts_venue_idx ON public.venue_contacts (workspace_id, venue_id);

-- public.venue_spaces already exists (20260614 levels/commercial-depth migrations)
-- with: id, workspace_id, venue_id, name, description, capacity_seated,
-- capacity_standing, area_sqm, hire_fee_cents, sort_order, created_at, updated_at.
-- Extend additively rather than recreating.
ALTER TABLE public.venue_spaces
  ADD COLUMN IF NOT EXISTS space_type text,
  ADD COLUMN IF NOT EXISTS theatre_capacity integer,
  ADD COLUMN IF NOT EXISTS banquet_capacity integer,
  ADD COLUMN IF NOT EXISTS cabaret_capacity integer,
  ADD COLUMN IF NOT EXISTS classroom_capacity integer,
  ADD COLUMN IF NOT EXISTS reception_capacity integer,
  ADD COLUMN IF NOT EXISTS boardroom_capacity integer,
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS ceiling_height_m numeric(5,2),
  ADD COLUMN IF NOT EXISTS preferred_uses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS av_readiness text,
  ADD COLUMN IF NOT EXISTS accessibility text,
  ADD COLUMN IF NOT EXISTS restrictions text,
  ADD COLUMN IF NOT EXISTS cover_media_id uuid;
CREATE INDEX IF NOT EXISTS venue_spaces_venue_idx ON public.venue_spaces (workspace_id, venue_id);

CREATE TABLE IF NOT EXISTS public.venue_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id     uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  space_id     uuid REFERENCES public.venue_spaces(id) ON DELETE SET NULL,
  category     text NOT NULL DEFAULT 'gallery',
  r2_key       text NOT NULL,
  alt_text     text,
  caption      text,
  is_cover     boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_media_venue_idx ON public.venue_media (workspace_id, venue_id, sort_order);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venue_spaces_cover_media_fk'
  ) THEN
    ALTER TABLE public.venue_spaces
      ADD CONSTRAINT venue_spaces_cover_media_fk FOREIGN KEY (cover_media_id) REFERENCES public.venue_media(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.venue_site_maps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id      uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'site_plan', -- site_plan | floor_plan
  label         text,
  r2_key        text NOT NULL,
  version       integer NOT NULL DEFAULT 1,
  is_published  boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_site_maps_venue_idx ON public.venue_site_maps (workspace_id, venue_id, kind);

CREATE TABLE IF NOT EXISTS public.venue_access_details (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id              uuid NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
  main_entrance         text,
  secondary_entrance    text,
  event_entrance        text,
  supplier_entrance     text,
  access_hours          text,
  security_process      text,
  on_site_parking       text,
  nearest_car_park      text,
  coach_parking         text,
  nearest_station       text,
  loading_bay           text,
  loading_bay_height_m  numeric(5,2),
  loading_access_hours  text,
  vehicle_restrictions  text,
  dock_leveller         boolean,
  service_lift          boolean,
  step_free_access      boolean,
  accessible_toilets    boolean,
  passenger_lifts       integer,
  hearing_loop          boolean,
  accessible_parking    boolean,
  travel_times          jsonb NOT NULL DEFAULT '[]'::jsonb,
  nearby_hotels         jsonb NOT NULL DEFAULT '[]'::jsonb,
  logistics_reminders   jsonb NOT NULL DEFAULT '[]'::jsonb,
  local_area_notes      text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venue_activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id     uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  title        text NOT NULL,
  description  text,
  actor_id     uuid REFERENCES auth.users(id),
  source       text,
  entity_type  text,
  entity_id    uuid,
  outcome      text,
  is_internal  boolean NOT NULL DEFAULT true,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_activity_log_venue_idx ON public.venue_activity_log (workspace_id, venue_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.venue_commercial_terms (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id                 uuid NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
  hire_rate_from_cents     bigint,
  hourly_rate_cents        bigint,
  half_day_rate_cents      bigint,
  day_rate_cents           bigint,
  evening_rate_cents       bigint,
  weekend_rate_cents       bigint,
  min_hire_hours           numeric(4,1),
  vat_treatment            text,
  min_spend_weekday_cents  bigint,
  min_spend_weekend_cents  bigint,
  standard_deposit_pct     numeric(5,2),
  security_deposit_cents   bigint,
  deposit_refundable       boolean NOT NULL DEFAULT true,
  payment_terms_days       integer,
  final_balance_days       integer,
  currency                 text NOT NULL DEFAULT 'GBP',
  bar_deposit_cents        bigint,
  fb_minimum_cents         bigint,
  fb_minimum_per_head_cents bigint,
  service_charge_pct       numeric(5,2),
  corkage_policy           text,
  cancellation_terms       jsonb NOT NULL DEFAULT '[]'::jsonb,
  supplier_restrictions    jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_status          text NOT NULL DEFAULT 'not_contracted',
  contract_signed_date     date,
  contract_effective_date  date,
  contract_expiry_date     date,
  auto_renewal             boolean NOT NULL DEFAULT false,
  notice_period_days       integer,
  next_review_date         date,
  negotiation_notes        text,
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_commercial_terms_review_idx ON public.venue_commercial_terms (workspace_id, next_review_date);

CREATE TABLE IF NOT EXISTS public.venue_commercial_transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id           uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  transaction_type   text NOT NULL,
  amount_cents       bigint NOT NULL,
  currency           text NOT NULL DEFAULT 'GBP',
  due_date           date,
  paid_status        text NOT NULL DEFAULT 'open',
  related_event_id   uuid REFERENCES public.events(id) ON DELETE SET NULL,
  related_proposal_id uuid,
  notes              text,
  created_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_commercial_transactions_venue_idx ON public.venue_commercial_transactions (workspace_id, venue_id, due_date);
CREATE INDEX IF NOT EXISTS venue_commercial_transactions_status_idx ON public.venue_commercial_transactions (workspace_id, paid_status) WHERE paid_status <> 'paid';

CREATE TABLE IF NOT EXISTS public.venue_holds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id       uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_id       uuid REFERENCES public.events(id) ON DELETE SET NULL,
  space_id       uuid REFERENCES public.venue_spaces(id) ON DELETE SET NULL,
  hold_type      text NOT NULL DEFAULT 'first_option',
  status         text NOT NULL DEFAULT 'requested',
  start_at       timestamptz,
  end_at         timestamptz,
  expiry_date    date,
  venue_contact_id uuid REFERENCES public.venue_contacts(id) ON DELETE SET NULL,
  confirmation_reference text,
  fee_cents      bigint,
  deposit_cents  bigint,
  notes          text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_holds_venue_idx ON public.venue_holds (workspace_id, venue_id, status);
CREATE INDEX IF NOT EXISTS venue_holds_expiry_idx ON public.venue_holds (workspace_id, expiry_date) WHERE status IN ('requested','provisional','first_option','second_option');

CREATE TABLE IF NOT EXISTS public.venue_room_blocks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id         uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_id         uuid REFERENCES public.events(id) ON DELETE SET NULL,
  room_type        text,
  num_rooms        integer NOT NULL DEFAULT 0,
  nightly_rate_cents bigint,
  start_date       date,
  end_date         date,
  release_date     date,
  attrition_terms  text,
  deposit_cents    bigint,
  booking_code     text,
  booking_link     text,
  status           text NOT NULL DEFAULT 'requested',
  contact_id       uuid REFERENCES public.venue_contacts(id) ON DELETE SET NULL,
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_room_blocks_venue_idx ON public.venue_room_blocks (workspace_id, venue_id, status);
CREATE INDEX IF NOT EXISTS venue_room_blocks_release_idx ON public.venue_room_blocks (workspace_id, release_date);

-- =============================================================================
-- 5. RLS — standard is_workspace_member / has_workspace_role loop pattern
-- =============================================================================
ALTER TABLE public.venue_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_site_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_access_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_commercial_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_commercial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_room_blocks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'venue_contacts','venue_spaces','venue_media','venue_site_maps',
    'venue_access_details','venue_activity_log',
    'venue_commercial_transactions','venue_holds','venue_room_blocks'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id));', t||'_select', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_write') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));', t||'_write', t);
    END IF;
  END LOOP;
END $$;

-- Commercial terms are finance-sensitive: restrict writes to owner/admin/manager,
-- everyone in the workspace may still read (matches "venue.commercial.view" vs
-- "venue.commercial.manage" split in the spec).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_commercial_terms' AND policyname='venue_commercial_terms_select') THEN
    CREATE POLICY venue_commercial_terms_select ON public.venue_commercial_terms FOR SELECT USING (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venue_commercial_terms' AND policyname='venue_commercial_terms_write') THEN
    CREATE POLICY venue_commercial_terms_write ON public.venue_commercial_terms FOR ALL
      USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::workspace_role[]))
      WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::workspace_role[]));
  END IF;
END $$;
