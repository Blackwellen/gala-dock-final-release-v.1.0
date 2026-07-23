-- =============================================================================
-- Event Manager Finance section rebuild — schema additions.
-- Idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DO guards.
--
-- Design decisions (see docs/design-reference/finance-section-image-map.md
-- and the release evidence docs for the full rationale):
--   * event_deposits gains partial-payment tracking (paid_cents) and a
--     ledger table, and becomes the single backing table for the Deposits
--     tab — no new "deposit plan" table; one row already IS one milestone.
--   * event_expenses becomes the Accounts Payable / Supplier Bills ledger
--     when supplier_id is set — it already has category/status/supplier_id.
--     We split its overloaded `status` into `approval_status` +
--     `payment_status` (additive, backward compatible) and add due_date,
--     bill_number and a payment ledger table.
--   * ticket_orders/ticket_types get fee/refund/channel columns so Ticket
--     Sales can report gross/fees/net/refunds without new tables.
--   * timesheets is genuinely new — no staffing-cost concept existed.
--   * Cashflow has no dedicated table: it is computed at query time from
--     invoices, event_deposits, event_expenses (supplier bills) and
--     timesheets due dates/balances.
-- =============================================================================

-- ─── EVENT DEPOSITS: partial payments + wider kind vocabulary ───────────────
ALTER TABLE public.event_deposits
  ADD COLUMN IF NOT EXISTS paid_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.event_deposits DROP CONSTRAINT IF EXISTS event_deposits_kind_check;
  ALTER TABLE public.event_deposits ADD CONSTRAINT event_deposits_kind_check
    CHECK (kind IN ('venue_hire','bar','security','other','client_deposit','final_balance','ticketing_reserve','damage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_deposit_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  deposit_id     uuid NOT NULL REFERENCES public.event_deposits(id) ON DELETE CASCADE,
  amount_cents   bigint NOT NULL DEFAULT 0,
  currency       text NOT NULL DEFAULT 'GBP',
  method         text,
  paid_at        timestamptz NOT NULL DEFAULT now(),
  note           text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_deposit_payments_deposit_idx ON public.event_deposit_payments (workspace_id, deposit_id);

-- ─── EVENT EXPENSES → doubles as the Supplier Bills / Accounts Payable ledger ─
ALTER TABLE public.event_expenses
  ADD COLUMN IF NOT EXISTS bill_number text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending_review','awaiting_event_manager','awaiting_finance','approved','rejected','disputed','on_hold')),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','scheduled','processing','part_paid','paid','failed','refunded','cancelled')),
  ADD COLUMN IF NOT EXISTS paid_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill approval/payment status from the legacy single `status` column so
-- existing rows keep meaning what they meant before this migration.
UPDATE public.event_expenses SET
  approval_status = CASE status WHEN 'rejected' THEN 'rejected' ELSE 'approved' END,
  payment_status  = CASE status WHEN 'paid' THEN 'paid' ELSE 'unpaid' END
WHERE approval_status = 'approved' AND payment_status = 'unpaid';

CREATE TABLE IF NOT EXISTS public.event_expense_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  expense_id     uuid NOT NULL REFERENCES public.event_expenses(id) ON DELETE CASCADE,
  amount_cents   bigint NOT NULL DEFAULT 0,
  currency       text NOT NULL DEFAULT 'GBP',
  method         text,
  batch_id       uuid,
  remittance_storage_key text,
  paid_at        timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_expense_payments_expense_idx ON public.event_expense_payments (workspace_id, expense_id);
CREATE INDEX IF NOT EXISTS event_expenses_due_idx ON public.event_expenses (workspace_id, due_date);
CREATE INDEX IF NOT EXISTS event_expenses_approval_idx ON public.event_expenses (workspace_id, approval_status);
CREATE INDEX IF NOT EXISTS event_expenses_payment_idx ON public.event_expenses (workspace_id, payment_status);

CREATE TABLE IF NOT EXISTS public.supplier_payment_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  reference      text NOT NULL,
  total_cents    bigint NOT NULL DEFAULT 0,
  currency       text NOT NULL DEFAULT 'GBP',
  status         text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── TICKET SALES: fees, refunds, channel ────────────────────────────────────
ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS fee_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'website'
    CHECK (channel IN ('website','mobile_app','partner_sites','box_office'));

CREATE INDEX IF NOT EXISTS ticket_orders_channel_idx ON public.ticket_orders (workspace_id, channel);
CREATE INDEX IF NOT EXISTS ticket_orders_status_idx ON public.ticket_orders (workspace_id, status);

-- ─── TIMESHEETS / WAGES: genuinely new domain ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.timesheets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id            uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  staff_assignment_id uuid REFERENCES public.event_staff_assignments(id) ON DELETE SET NULL,
  team_member_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  team_member_name    text NOT NULL,
  role                text,
  department          text NOT NULL DEFAULT 'other'
    CHECK (department IN ('production','operations','front_of_house','security','other')),
  pay_period_start    date NOT NULL,
  pay_period_end      date NOT NULL,
  scheduled_hours      numeric NOT NULL DEFAULT 0,
  actual_hours         numeric NOT NULL DEFAULT 0,
  overtime_hours       numeric NOT NULL DEFAULT 0,
  hourly_rate_cents    bigint NOT NULL DEFAULT 0,
  overtime_rate_cents  bigint NOT NULL DEFAULT 0,
  currency             text NOT NULL DEFAULT 'GBP',
  approval_status      text NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft','submitted','pending','approved','rejected','exported','paid')),
  approved_by          uuid REFERENCES auth.users(id),
  approved_at          timestamptz,
  notes                text,
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS timesheets_event_idx ON public.timesheets (workspace_id, event_id);
CREATE INDEX IF NOT EXISTS timesheets_period_idx ON public.timesheets (workspace_id, pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS timesheets_approval_idx ON public.timesheets (workspace_id, approval_status);
CREATE INDEX IF NOT EXISTS timesheets_department_idx ON public.timesheets (workspace_id, department);

CREATE TABLE IF NOT EXISTS public.payroll_exports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pay_period_start date NOT NULL,
  pay_period_end   date NOT NULL,
  total_cents    bigint NOT NULL DEFAULT 0,
  currency       text NOT NULL DEFAULT 'GBP',
  timesheet_ids  uuid[] NOT NULL DEFAULT '{}',
  storage_key    text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','exported','submitted_to_provider')),
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── FINANCE ACTIVITY LOG (shared, append-only) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_activity_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type    text NOT NULL,
  entity_id      uuid NOT NULL,
  event_id       uuid REFERENCES public.events(id) ON DELETE SET NULL,
  action         text NOT NULL,
  actor_id       uuid REFERENCES auth.users(id),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_activity_log_workspace_idx ON public.finance_activity_log (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_activity_log_entity_idx ON public.finance_activity_log (workspace_id, entity_type, entity_id);

-- =============================================================================
-- RLS — follow the repo's standard is_workspace_member / has_workspace_role
-- loop pattern used across recent migrations.
-- =============================================================================
ALTER TABLE public.event_deposit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_activity_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'event_deposit_payments','event_expense_payments','supplier_payment_batches',
    'timesheets','payroll_exports'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id));', t||'_select', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_insert') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''manager'']::workspace_role[]));', t||'_insert', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_update') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''manager'']::workspace_role[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''manager'']::workspace_role[]));', t||'_update', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname=t||'_delete') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'']::workspace_role[]));', t||'_delete', t);
    END IF;
  END LOOP;
END $$;

-- Finance activity log is append-only for normal members: no UPDATE/DELETE policy at all.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_activity_log' AND policyname='finance_activity_log_select') THEN
    CREATE POLICY finance_activity_log_select ON public.finance_activity_log FOR SELECT USING (public.is_workspace_member(workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_activity_log' AND policyname='finance_activity_log_insert') THEN
    CREATE POLICY finance_activity_log_insert ON public.finance_activity_log FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
END $$;

-- Wage rate / cost data is finance-sensitive: only owner/admin/manager may see
-- timesheets rows (the base *_select policy above already grants that; the
-- SELECT for `timesheets` intentionally does NOT use the plain
-- is_workspace_member() check that read-only/portal roles would satisfy).
-- NOTE: workspace_role enum in this workspace is only
-- ('owner','admin','manager','member') — no separate 'accountant'/'viewer'
-- role exists yet. Wage data is therefore restricted to owner/admin/manager;
-- if a dedicated finance/accountant role is added later, extend these two
-- policies rather than widening them to 'member'.
DROP POLICY IF EXISTS timesheets_select ON public.timesheets;
CREATE POLICY timesheets_select ON public.timesheets FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::workspace_role[]));

DROP POLICY IF EXISTS payroll_exports_select ON public.payroll_exports;
CREATE POLICY payroll_exports_select ON public.payroll_exports FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]));
