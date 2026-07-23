-- Team & Staffing directory schema — DRAFT, NOT YET APPLIED.
-- Extends the existing event_staff_assignments / team_availability_blocks /
-- workspace_members model with the normalized fields the Team Directory,
-- Member Profile, Find Team, Insights and Staffing Requests screens need:
-- department, canonical roles, skills, regional coverage, certifications,
-- rates, and staffing requests/candidates for open-role sourcing.

-- ───────── Departments & canonical roles ─────────
CREATE TABLE IF NOT EXISTS public.team_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.staffing_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  department_id uuid REFERENCES public.team_departments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

-- ───────── Per-member profile extension (1:1 with workspace_members) ─────────
CREATE TABLE IF NOT EXISTS public.team_member_profiles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  member_code text,
  department_id uuid REFERENCES public.team_departments(id) ON DELETE SET NULL,
  primary_role_id uuid REFERENCES public.staffing_roles(id) ON DELETE SET NULL,
  employment_type text NOT NULL DEFAULT 'employee'
    CHECK (employment_type IN ('employee','contractor','freelancer','temporary','agency','volunteer','external')),
  home_location text,
  phone text,
  standard_weekly_hours numeric NOT NULL DEFAULT 40,
  travel_radius_miles integer,
  willing_to_travel boolean NOT NULL DEFAULT true,
  day_rate_cents integer,
  hour_rate_cents integer,
  overtime_rate_cents integer,
  currency text NOT NULL DEFAULT 'GBP',
  rates_visible_to text NOT NULL DEFAULT 'managers' CHECK (rates_visible_to IN ('managers','self','everyone')),
  rating numeric,
  avatar_file_id uuid,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

-- ───────── Skills, equipment, languages ─────────
CREATE TABLE IF NOT EXISTS public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.team_member_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  proficiency text NOT NULL DEFAULT 'intermediate'
    CHECK (proficiency IN ('beginner','intermediate','advanced','expert')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_id)
);
CREATE INDEX IF NOT EXISTS team_member_skills_user_idx ON public.team_member_skills(user_id);

-- ───────── Regional coverage ─────────
CREATE TABLE IF NOT EXISTS public.team_member_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region_name text NOT NULL,
  tier text NOT NULL DEFAULT 'secondary' CHECK (tier IN ('primary','secondary','tertiary')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, region_name)
);

-- ───────── Certifications ─────────
CREATE TABLE IF NOT EXISTS public.certification_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  issuer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.team_member_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  certification_type_id uuid NOT NULL REFERENCES public.certification_types(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring_soon','expired')),
  issued_at date,
  expires_at date,
  document_file_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_member_certs_user_idx ON public.team_member_certifications(user_id);
CREATE INDEX IF NOT EXISTS team_member_certs_expiry_idx ON public.team_member_certifications(expires_at);

-- ───────── Staffing requests (open roles) & candidates ─────────
CREATE TABLE IF NOT EXISTS public.staffing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  role_id uuid REFERENCES public.staffing_roles(id) ON DELETE SET NULL,
  role_label text NOT NULL,
  quantity_required integer NOT NULL DEFAULT 1,
  quantity_filled integer NOT NULL DEFAULT 0,
  start_at timestamptz,
  end_at timestamptz,
  location text,
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('urgent','high','medium','normal')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft','open','sourcing','shortlisting','offered','pending_confirmation','partially_filled','filled','cancelled','expired')),
  budget_cents integer,
  currency text NOT NULL DEFAULT 'GBP',
  notes text,
  assigned_lead_id uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staffing_requests_event_idx ON public.staffing_requests(event_id);
CREATE INDEX IF NOT EXISTS staffing_requests_status_idx ON public.staffing_requests(workspace_id, status);

CREATE TABLE IF NOT EXISTS public.staffing_request_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.staffing_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','screening','shortlisted','interviewing','offered','confirmed','declined','withdrawn')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);
CREATE INDEX IF NOT EXISTS staffing_candidates_request_idx ON public.staffing_request_candidates(request_id);

-- ───────── RLS ─────────
ALTER TABLE public.team_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffing_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certification_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffing_request_candidates ENABLE ROW LEVEL SECURITY;

-- Simple, consistent policy shape used elsewhere in this codebase: any
-- non-deleted member of the workspace can read; write requires workspace
-- membership too (finer-grained role checks can be layered on later via
-- workspace_members.role for manager-only actions like rates).
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = auth.uid()
      AND wm.deleted_at IS NULL
  );
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'team_departments','staffing_roles','team_member_profiles','skills',
    'team_member_skills','team_member_regions','certification_types',
    'team_member_certifications','staffing_requests','staffing_request_candidates'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_workspace_member(workspace_id));',
      t || '_select_members', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));',
      t || '_write_members', t
    );
  END LOOP;
END $$;

-- Rate fields (day_rate_cents/hour_rate_cents/overtime_rate_cents) are
-- exposed through team_member_profiles above at row level for any workspace
-- member; the app layer (not RLS) hides those specific columns from users
-- without team.rates.view, matching the pattern already used for other
-- commercially-sensitive fields elsewhere in this codebase. A stricter
-- column-level approach (a separate team_member_rates table with its own
-- manager-only RLS policy) is the safer long-term shape and is recommended
-- as a follow-up once role-permission plumbing (team.rates.view) exists.
