-- Gala Dock — Levels 11-15 feature tables (supplier depth, staffing, floor plans,
-- venue-side management, mood board, expenses). Additive. workspace_id + RLS on all.

-- ───────── L11 Supplier depth ─────────
CREATE TABLE IF NOT EXISTS public.supplier_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  unit text,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_rate_cards_supplier_idx ON public.supplier_rate_cards(supplier_id);

CREATE TABLE IF NOT EXISTS public.supplier_blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  blocked_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_blocked_dates_supplier_idx ON public.supplier_blocked_dates(supplier_id);

CREATE TABLE IF NOT EXISTS public.supplier_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review text,
  rated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_ratings_supplier_idx ON public.supplier_ratings(supplier_id);

CREATE TABLE IF NOT EXISTS public.rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  title text NOT NULL,
  scope text,
  status text NOT NULL DEFAULT 'draft',
  due_date date,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfqs_workspace_idx ON public.rfqs(workspace_id);

CREATE TABLE IF NOT EXISTS public.rfq_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited',
  responded_at timestamptz,
  quote_amount_cents bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_recipients_rfq_idx ON public.rfq_recipients(rfq_id);

CREATE TABLE IF NOT EXISTS public.supplier_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  storage_key text,
  value_cents bigint,
  signed_at timestamptz,
  expires_at date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_contracts_supplier_idx ON public.supplier_contracts(supplier_id);

-- ───────── L12 Team & staffing ─────────
CREATE TABLE IF NOT EXISTS public.event_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  staff_name text,
  role text,
  call_time timestamptz,
  end_time timestamptz,
  status text NOT NULL DEFAULT 'assigned',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_staff_assignments_event_idx ON public.event_staff_assignments(event_id);

CREATE TABLE IF NOT EXISTS public.team_availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  block_type text NOT NULL DEFAULT 'unavailable',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_availability_user_idx ON public.team_availability_blocks(user_id);

-- ───────── L13 Floor plans ─────────
CREATE TABLE IF NOT EXISTS public.event_floor_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Main Layout',
  canvas_json jsonb NOT NULL DEFAULT '{"elements":[]}'::jsonb,
  canvas_width integer NOT NULL DEFAULT 1000,
  canvas_height integer NOT NULL DEFAULT 700,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_floor_plans_event_idx ON public.event_floor_plans(event_id);

-- ───────── L14 Venue-side management ─────────
CREATE TABLE IF NOT EXISTS public.venue_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity_seated integer,
  capacity_standing integer,
  area_sqm numeric,
  hire_fee_cents bigint,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_spaces_venue_idx ON public.venue_spaces(venue_id);

CREATE TABLE IF NOT EXISTS public.venue_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  space_id uuid REFERENCES public.venue_spaces(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_email text,
  status text NOT NULL DEFAULT 'enquiry',
  start_at timestamptz,
  end_at timestamptz,
  headcount integer,
  total_cents bigint NOT NULL DEFAULT 0,
  notes text,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_bookings_venue_idx ON public.venue_bookings(venue_id);

CREATE TABLE IF NOT EXISTS public.venue_fb_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  per_head_cents bigint NOT NULL DEFAULT 0,
  min_headcount integer,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_fb_packages_venue_idx ON public.venue_fb_packages(venue_id);

CREATE TABLE IF NOT EXISTS public.venue_booking_fb_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.venue_bookings(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.venue_fb_packages(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_booking_fb_booking_idx ON public.venue_booking_fb_selections(booking_id);

CREATE TABLE IF NOT EXISTS public.venue_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.venue_bookings(id) ON DELETE CASCADE,
  staff_name text NOT NULL,
  role text,
  shift_start timestamptz,
  shift_end timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_staff_venue_idx ON public.venue_staff_assignments(venue_id);

-- ───────── L15 Mood board + expenses ─────────
CREATE TABLE IF NOT EXISTS public.event_mood_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Mood Board',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_mood_boards_event_idx ON public.event_mood_boards(event_id);

CREATE TABLE IF NOT EXISTS public.mood_board_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  mood_board_id uuid NOT NULL REFERENCES public.event_mood_boards(id) ON DELETE CASCADE,
  storage_key text,
  caption text,
  color_hex text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mood_board_items_board_idx ON public.mood_board_items(mood_board_id);

CREATE TABLE IF NOT EXISTS public.event_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category text,
  description text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  expense_date date,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  receipt_storage_key text,
  status text NOT NULL DEFAULT 'recorded',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_expenses_event_idx ON public.event_expenses(event_id);

-- ───────── RLS ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'supplier_rate_cards','supplier_blocked_dates','supplier_ratings','rfqs','rfq_recipients',
    'supplier_contracts','event_staff_assignments','team_availability_blocks','event_floor_plans',
    'venue_spaces','venue_bookings','venue_fb_packages','venue_booking_fb_selections',
    'venue_staff_assignments','event_mood_boards','mood_board_items','event_expenses'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY %1$I ON public.%2$I FOR SELECT USING (public.is_workspace_member(workspace_id));', t || '_select', t);
    EXECUTE format('CREATE POLICY %1$I ON public.%2$I FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''manager'']::workspace_role[]));', t || '_insert', t);
    EXECUTE format('CREATE POLICY %1$I ON public.%2$I FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''manager'']::workspace_role[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''manager'']::workspace_role[]));', t || '_update', t);
    EXECUTE format('CREATE POLICY %1$I ON public.%2$I FOR DELETE USING (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'']::workspace_role[]));', t || '_delete', t);
  END LOOP;
END $$;
