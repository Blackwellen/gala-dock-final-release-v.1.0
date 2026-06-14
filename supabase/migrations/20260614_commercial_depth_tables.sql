-- Gala Dock — Commercial Depth feature tables
-- Additive migration. All tables carry workspace_id and RLS matching the
-- established has_workspace_role / is_workspace_member pattern.
-- Roles enum: workspace_role (owner, admin, manager, member, viewer)

-- ───────────────────────── LEADS ─────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  company_name text,
  event_type text,
  event_date date,
  event_location text,
  guest_count_estimate integer,
  budget_estimate_cents bigint,
  stage text NOT NULL DEFAULT 'new-enquiry',
  source text,
  assigned_to uuid REFERENCES auth.users(id),
  converted_event_id uuid REFERENCES public.events(id),
  lost_reason text,
  notes text,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_workspace_idx ON public.leads(workspace_id);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON public.leads(workspace_id, stage);

CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail text,
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_activities_lead_idx ON public.lead_activities(lead_id);

-- ───────────────────────── PROPOSALS ─────────────────────────
CREATE TABLE IF NOT EXISTS public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  title text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  event_type text,
  event_date date,
  event_location text,
  guest_count integer,
  intro_text text,
  terms_text text,
  status text NOT NULL DEFAULT 'draft',
  valid_until date,
  total_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  deposit_pct numeric,
  signed_by_name text,
  signed_by_email text,
  signed_at timestamptz,
  signed_ip text,
  converted_invoice_id uuid REFERENCES public.invoices(id),
  share_token text UNIQUE,
  viewed_at timestamptz,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_workspace_idx ON public.proposals(workspace_id);
CREATE INDEX IF NOT EXISTS proposals_share_token_idx ON public.proposals(share_token);

CREATE TABLE IF NOT EXISTS public.proposal_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint GENERATED ALWAYS AS ((quantity * unit_price_cents)::bigint) STORED,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_line_items_proposal_idx ON public.proposal_line_items(proposal_id);

-- ───────────────────────── EVENT GUESTS ─────────────────────────
CREATE TABLE IF NOT EXISTS public.event_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  guest_type text NOT NULL DEFAULT 'day',
  rsvp_status text NOT NULL DEFAULT 'pending',
  meal_choice text,
  dietary_notes text,
  table_number text,
  seat_number text,
  plus_one_name text,
  notes text,
  check_in_token text UNIQUE,
  checked_in_at timestamptz,
  imported_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_guests_event_idx ON public.event_guests(event_id);

-- ───────────────────────── COMMUNICATIONS ─────────────────────────
CREATE TABLE IF NOT EXISTS public.communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  subject text,
  body text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  comm_type text NOT NULL DEFAULT 'email',
  participant_name text,
  participant_email text,
  participant_phone text,
  thread_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS communications_workspace_idx ON public.communications(workspace_id);
CREATE INDEX IF NOT EXISTS communications_thread_idx ON public.communications(thread_id);

-- ───────────────────────── PAYMENT SCHEDULES ─────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  label text NOT NULL,
  amount_cents bigint NOT NULL,
  percentage numeric,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_payment_schedules_invoice_idx ON public.invoice_payment_schedules(invoice_id);

-- ───────────────────────── FORMS ─────────────────────────
CREATE TABLE IF NOT EXISTS public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  form_type text NOT NULL DEFAULT 'custom',
  status text NOT NULL DEFAULT 'draft',
  share_token text UNIQUE,
  submission_count integer NOT NULL DEFAULT 0,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forms_workspace_idx ON public.forms(workspace_id);

CREATE TABLE IF NOT EXISTS public.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  field_type text NOT NULL,
  label text NOT NULL,
  placeholder text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS form_fields_form_idx ON public.form_fields(form_id);

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitter_email text,
  submitter_name text,
  ip_address text,
  user_agent text,
  created_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_submissions_form_idx ON public.form_submissions(form_id);

-- ───────────────────────── VENUE DOCS / NOTES ─────────────────────────
CREATE TABLE IF NOT EXISTS public.venue_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  filename text NOT NULL,
  storage_key text NOT NULL,
  file_size_bytes bigint,
  expiry_date date,
  status text NOT NULL DEFAULT 'active',
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_documents_venue_idx ON public.venue_documents(venue_id);

CREATE TABLE IF NOT EXISTS public.venue_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_notes_venue_idx ON public.venue_notes(venue_id);

-- ───────────────────────── RLS ─────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads','lead_activities','proposals','proposal_line_items','event_guests',
    'communications','invoice_payment_schedules','forms','form_fields',
    'form_submissions','venue_documents','venue_notes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format($p$
      CREATE POLICY %1$I ON public.%2$I
      FOR SELECT USING (public.is_workspace_member(workspace_id));
    $p$, t || '_select', t);

    EXECUTE format($p$
      CREATE POLICY %1$I ON public.%2$I
      FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::workspace_role[]));
    $p$, t || '_insert', t);

    EXECUTE format($p$
      CREATE POLICY %1$I ON public.%2$I
      FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::workspace_role[]))
      WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','manager']::workspace_role[]));
    $p$, t || '_update', t);

    EXECUTE format($p$
      CREATE POLICY %1$I ON public.%2$I
      FOR DELETE USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]));
    $p$, t || '_delete', t);
  END LOOP;
END $$;
