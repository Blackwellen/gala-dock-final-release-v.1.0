-- Gala Dock — Supplier & RFQ section depth (Phase 2 of the supplier-section rebuild).
-- Additive only: extends the existing suppliers/rfqs schema (suppliers, supplier_categories,
-- supplier_contacts, supplier_files, supplier_activity, supplier_health, rfqs, rfq_recipients,
-- event_suppliers — all already live) with the tables/columns needed to back:
--   - Active/Paused/Missing Documents/Recently Used/Archived derived views
--   - document compliance workflow (requirements, risk, outreach/chaser tracking)
--   - full RFQ response/comparison/award workflow
-- workspace_id + RLS on every new table, via the same is_workspace_member/has_workspace_role
-- helpers used by prior migrations (see 20260614_levels_11_15_tables.sql).

-- ───────── suppliers: attributes not covered by existing columns ─────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IN ('premium', 'preferred', 'verified')),
  ADD COLUMN IF NOT EXISTS coverage_regions text[] NOT NULL DEFAULT '{}';

-- ───────── supplier_files: compliance/document workflow depth ─────────
-- `kind` stays the existing broad category enum (logo/contract/cert/tnc/other); these
-- columns add the document-type-level compliance tracking the Missing Documents screen needs.
ALTER TABLE public.supplier_files
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('requested', 'uploaded', 'processing', 'under_review', 'approved', 'rejected', 'expired', 'superseded')),
  ADD COLUMN IF NOT EXISTS risk_level text
    CHECK (risk_level IN ('critical', 'high', 'medium', 'low', 'compliant')),
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS issuing_body text,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Which document types are required per category, so "Missing Documents" can be derived
-- (required type with no matching non-archived, approved supplier_files row = missing).
CREATE TABLE IF NOT EXISTS public.supplier_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.supplier_categories(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  default_risk_level text NOT NULL DEFAULT 'medium'
    CHECK (default_risk_level IN ('critical', 'high', 'medium', 'low')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, category_id, document_type)
);

-- Chaser/reminder outreach history, drives the Missing Documents "Outreach Status" column
-- and the "Recent Chaser Activity" insight-rail card.
CREATE TABLE IF NOT EXISTS public.supplier_compliance_outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  document_type text,
  status text NOT NULL DEFAULT 'not_contacted'
    CHECK (status IN ('not_contacted', 'request_sent', 'reminder_sent', 'email_opened', 'awaiting_response', 'supplier_responded', 'under_review', 'escalated', 'complete')),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'phone', 'portal', 'internal')),
  sent_at timestamptz,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_compliance_outreach_supplier_idx ON public.supplier_compliance_outreach(supplier_id);

-- ───────── Pause / reactivate lifecycle ─────────
CREATE TABLE IF NOT EXISTS public.supplier_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN (
    'low_utilisation', 'seasonal', 'project_complete', 'capacity_constraints',
    'strategic_review', 'supplier_consolidation', 'regulatory_hold',
    'performance_review', 'commercial_dispute', 'requested_by_supplier', 'other'
  )),
  reason_detail text,
  note text,
  paused_at timestamptz NOT NULL DEFAULT now(),
  paused_by uuid REFERENCES auth.users(id),
  reactivated_at timestamptz,
  reactivated_by uuid REFERENCES auth.users(id),
  reactivation_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_pauses_supplier_idx ON public.supplier_pauses(supplier_id);
-- Only one currently-open pause per supplier at a time.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_pauses_open_unique
  ON public.supplier_pauses(supplier_id) WHERE reactivated_at IS NULL;

-- ───────── Archive / restore lifecycle + retention ─────────
CREATE TABLE IF NOT EXISTS public.supplier_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  previous_category_id uuid REFERENCES public.supplier_categories(id) ON DELETE SET NULL,
  previous_tier text,
  reason text NOT NULL CHECK (reason IN (
    'business_closed', 'out_of_business', 'no_longer_working_with_us', 'performance_issues',
    'duplicate_supplier', 'seasonal_pause', 'contract_ended', 'compliance_failure',
    'supplier_request', 'commercial_decision', 'other'
  )),
  reason_detail text,
  archived_by uuid REFERENCES auth.users(id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  can_be_restored boolean NOT NULL DEFAULT true,
  retention_until date,
  legal_hold boolean NOT NULL DEFAULT false,
  restored_at timestamptz,
  restored_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_archives_supplier_idx ON public.supplier_archives(supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_archives_open_unique
  ON public.supplier_archives(supplier_id) WHERE restored_at IS NULL;

-- ───────── Recently Used favouriting (per-user star, matches the table's star toggle) ─────────
CREATE TABLE IF NOT EXISTS public.supplier_stars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, user_id)
);

-- ───────── RFQs: depth for category/budget/response-deadline/award ─────────
ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS budget_low_cents bigint,
  ADD COLUMN IF NOT EXISTS budget_high_cents bigint,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS response_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS clarification_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_criteria jsonb,
  ADD COLUMN IF NOT EXISTS awarded_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS awarded_at timestamptz;
-- rfqs.status is free-text (not enum-constrained); the app standardises on:
-- draft | sent | responses_received | under_review | awarded | closed | cancelled

ALTER TABLE public.rfq_recipients
  ADD COLUMN IF NOT EXISTS invited_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS declined_reason text;
-- rfq_recipients.status free-text; app vocabulary: invited | viewed | responded | declined | accepted

CREATE TABLE IF NOT EXISTS public.rfq_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_status_history_rfq_idx ON public.rfq_status_history(rfq_id);

CREATE TABLE IF NOT EXISTS public.rfq_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  subject jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_activity_rfq_idx ON public.rfq_activity(rfq_id);

-- Formal quote responses (rfq_recipients tracks invite/response *status*; this is the actual
-- submitted quote content, versioned so suppliers can revise before the deadline).
CREATE TABLE IF NOT EXISTS public.rfq_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'withdrawn', 'superseded')),
  total_amount_cents bigint,
  currency text NOT NULL DEFAULT 'GBP',
  lead_time_days integer,
  valid_until date,
  exclusions text,
  assumptions text,
  notes text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_responses_rfq_idx ON public.rfq_responses(rfq_id);
CREATE INDEX IF NOT EXISTS rfq_responses_supplier_idx ON public.rfq_responses(supplier_id);

CREATE TABLE IF NOT EXISTS public.rfq_response_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rfq_response_id uuid NOT NULL REFERENCES public.rfq_responses(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_response_line_items_response_idx ON public.rfq_response_line_items(rfq_response_id);

-- Award decision. Converting an award into a real booking creates/links an event_suppliers row
-- (event_suppliers already has contract_value_cents/role/contact fields) — award_committed_at
-- marks that conversion happened so it's not repeated.
CREATE TABLE IF NOT EXISTS public.rfq_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  rfq_response_id uuid REFERENCES public.rfq_responses(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  awarded_by uuid REFERENCES auth.users(id),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  award_reason text,
  savings_cents bigint,
  event_supplier_id uuid REFERENCES public.event_suppliers(id) ON DELETE SET NULL,
  booking_committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rfq_awards_rfq_unique ON public.rfq_awards(rfq_id);

-- ───────── RLS: same is_workspace_member / has_workspace_role pattern as prior migrations ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'supplier_document_requirements', 'supplier_compliance_outreach', 'supplier_pauses',
    'supplier_archives', 'supplier_stars', 'rfq_status_history', 'rfq_activity',
    'rfq_responses', 'rfq_response_line_items', 'rfq_awards'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY %1$I ON public.%2$I FOR SELECT USING (public.is_workspace_member(workspace_id));', t || '_select', t);
    EXECUTE format('CREATE POLICY %1$I ON public.%2$I FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''manager'']::workspace_role[]));', t || '_insert', t);
    EXECUTE format('CREATE POLICY %1$I ON public.%2$I FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''manager'']::workspace_role[])) WITH CHECK (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''manager'']::workspace_role[]));', t || '_update', t);
    EXECUTE format('CREATE POLICY %1$I ON public.%2$I FOR DELETE USING (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'']::workspace_role[]));', t || '_delete', t);
  END LOOP;
END $$;

-- Awards are commercially sensitive: require manager+ to award (INSERT), but allow member-level
-- roles to still SELECT/UPDATE their own draft rfq_responses (suppliers are not app users here —
-- there is no supplier-portal auth role in this codebase yet; see migration notes below).
DROP POLICY IF EXISTS rfq_awards_insert ON public.rfq_awards;
CREATE POLICY rfq_awards_insert ON public.rfq_awards
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::workspace_role[]));

-- ───────── Notes for the next migration pass ─────────
-- 1. No supplier-portal auth role exists in this codebase (workspace_role is owner/admin/
--    manager/member — all internal operator roles). rfq_responses/rfq_response_line_items RLS
--    above only covers internal workspace members. A genuine external supplier-submission flow
--    (supplier logs in via a portal token, submits a response, cannot see competitors' rows)
--    needs its own auth boundary — e.g. a signed `supplier_portal_tokens`-style session that
--    RLS keys off instead of auth.uid() membership. Deferred until that portal auth model is
--    designed; do not treat rfq_responses as supplier-submittable until then.
-- 2. supplier_document_requirements is seeded empty by this migration — the demo seed (next
--    migration/seed file) must populate it per category, and the "missing documents" derivation
--    logic (a required type with no matching approved, non-archived supplier_files row) lives in
--    application code, not a DB view, to keep it testable and adjustable without a migration.
