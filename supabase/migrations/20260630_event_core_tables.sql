-- =============================================================================
-- Gala Dock — Event Manager Core Tables
-- Creates the primary events table and all event profile sub-tables that power
-- the 21-tab event profile experience.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and DO/IF NOT EXISTS guards.
-- RLS: via is_workspace_member() helper.
-- =============================================================================

-- ─── EVENTS (primary record) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  slug                   text,
  status                 text NOT NULL DEFAULT 'new_enquiry'
    CHECK (status IN ('new_enquiry','briefing','quoting','awaiting_approval','confirmed','in_delivery','completed','cancelled')),
  event_type             text,
  event_format           text DEFAULT 'in_person' CHECK (event_format IN ('in_person','online','hybrid')),
  start_at               timestamptz,
  end_at                 timestamptz,
  venue_name_snapshot    text,
  venue_address_snapshot text,
  floor_plan_url         text,
  guest_count_day        integer,
  capacity_online        integer,
  budget_cents           bigint DEFAULT 0,
  currency               text NOT NULL DEFAULT 'GBP',
  client_name            text,
  client_email           text,
  client_phone           text,
  description            text,
  objectives             text,
  brief_notes            text,
  is_public              boolean NOT NULL DEFAULT false,
  is_ticketed            boolean NOT NULL DEFAULT false,
  is_vip                 boolean NOT NULL DEFAULT false,
  is_hybrid              boolean NOT NULL DEFAULT false,
  tags                   text[],
  cover_image_url        text,
  created_by             uuid REFERENCES auth.users(id),
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_workspace_idx ON public.events (workspace_id);
CREATE INDEX IF NOT EXISTS events_status_idx    ON public.events (workspace_id, status);
CREATE INDEX IF NOT EXISTS events_start_idx     ON public.events (workspace_id, start_at);

-- ─── EVENT SUPPLIERS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_suppliers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id              uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  supplier_id           uuid,                      -- optional link to suppliers table
  supplier_name         text NOT NULL,
  role                  text,
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','contracted','invoiced','paid','cancelled')),
  contract_value_cents  bigint DEFAULT 0,
  contact_name          text,
  contact_email         text,
  contact_phone         text,
  notes                 text,
  created_by            uuid REFERENCES auth.users(id),
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_suppliers_event_idx ON public.event_suppliers (workspace_id, event_id);

-- ─── EVENT TASKS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title             text NOT NULL,
  status            text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','waiting','approved','completed','blocked')),
  priority          text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical')),
  department        text,
  due_date          date,
  assignee_user_id  uuid REFERENCES auth.users(id),
  notes             text,
  archived_at       timestamptz,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_tasks_event_idx  ON public.event_tasks (workspace_id, event_id);
CREATE INDEX IF NOT EXISTS event_tasks_status_idx ON public.event_tasks (workspace_id, event_id, status);

-- ─── EVENT RUN SHEET ITEMS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_run_sheet_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  section      text,                        -- day grouping header
  title        text NOT NULL,
  start_time   text,                        -- HH:MM, local time
  end_time     text,
  department   text,                        -- av, catering, host, vip, logistics, general
  notes        text,
  position     integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id),
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_run_sheet_event_idx ON public.event_run_sheet_items (workspace_id, event_id, position);

-- ─── EVENT TRANSACTIONS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  transaction_type  text NOT NULL CHECK (transaction_type IN ('income','expense','transfer')),
  reference         text,
  description       text,
  supplier_name     text,
  category          text,
  amount_cents      bigint NOT NULL DEFAULT 0,
  status            text DEFAULT 'pending',
  payment_status    text DEFAULT 'unpaid',
  transaction_date  date,
  created_by        uuid REFERENCES auth.users(id),
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_transactions_event_idx ON public.event_transactions (workspace_id, event_id);

-- ─── EVENT INVOICES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id         uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  invoice_number   text,
  supplier_name    text,
  amount_cents     bigint NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','approved','paid','overdue','disputed','cancelled')),
  due_date         date,
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_invoices_event_idx ON public.event_invoices (workspace_id, event_id);

-- ─── EVENT LOGISTICS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_logistics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  item_type       text NOT NULL DEFAULT 'delivery'
    CHECK (item_type IN ('delivery','collection','transport','setup','teardown','other')),
  title           text NOT NULL,
  supplier_name   text,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','in_transit','arrived','delayed','cancelled')),
  scheduled_date  date,
  access_time     text,
  zone            text,
  quantity        integer DEFAULT 1,
  notes           text,
  created_by      uuid REFERENCES auth.users(id),
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_logistics_event_idx ON public.event_logistics (workspace_id, event_id, scheduled_date);

-- ─── EVENT DOCUMENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name              text NOT NULL,
  file_type         text,
  category          text DEFAULT 'other',
  file_size_bytes   bigint,
  storage_path      text,                    -- R2/storage path (never public URL)
  uploaded_by_name  text,
  uploaded_by       uuid REFERENCES auth.users(id),
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_documents_event_idx ON public.event_documents (workspace_id, event_id);

-- ─── EVENT COMMS (messages feed) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_comms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  subject         text,
  channel         text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','sms','whatsapp','in_app','portal')),
  recipient_name  text,
  recipient_type  text,                      -- guest_group, supplier, speaker_group, vip_group, internal
  direction       text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending','sent','read','failed','cancelled')),
  body_preview    text,                      -- first 200 chars of body
  sent_at         timestamptz,
  created_by      uuid REFERENCES auth.users(id),
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_comms_event_idx ON public.event_comms (workspace_id, event_id, created_at DESC);

-- ─── EVENT ACTIVITY (audit/feed) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_activity (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  action_type   text NOT NULL,               -- created, updated, deleted, commented, uploaded, status_change, sent, assigned
  entity_type   text,                        -- event, task, supplier, guest, document, comms, expense
  entity_id     uuid,
  entity_label  text,
  actor_id      uuid REFERENCES auth.users(id),
  actor_name    text,
  description   text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_activity_event_idx ON public.event_activity (workspace_id, event_id, created_at DESC);

-- ─── EVENT ZONES (for Event Map / capacity tracking) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.event_zones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id            uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  zone_type           text DEFAULT 'general',
  name                text NOT NULL,
  capacity            integer,
  current_occupancy   integer DEFAULT 0,
  status              text NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active','inactive','warning','alert')),
  notes               text,
  created_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_zones_event_idx ON public.event_zones (workspace_id, event_id);

-- ─── EVENT STAFF (assignments specifically for events) ───────────────────────
-- Note: event_staff_assignments already exists (L11-15 migration).
-- Adding event_staff as an alias/view-friendly table for UI display.
-- If event_staff_assignments already exists, we skip creating event_staff here
-- and the pages that use event_staff should query event_staff_assignments instead.
-- (No CREATE here — handled in staffing tab's own page which uses event_staff_assignments)

-- =============================================================================
-- RLS POLICIES — Apply to all new tables
-- =============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'events',
    'event_suppliers',
    'event_tasks',
    'event_run_sheet_items',
    'event_transactions',
    'event_invoices',
    'event_logistics',
    'event_documents',
    'event_comms',
    'event_activity',
    'event_zones'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = tbl AND policyname = tbl || '_workspace_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id))',
        tbl || '_workspace_select', tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = tbl AND policyname = tbl || '_workspace_write'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL
          USING (public.is_workspace_member(workspace_id))
          WITH CHECK (public.is_workspace_member(workspace_id))',
        tbl || '_workspace_write', tbl
      );
    END IF;
  END LOOP;
END$$;
