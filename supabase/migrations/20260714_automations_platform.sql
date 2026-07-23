-- =============================================================================
-- Gala Dock — Automations Platform (Overview / Recipes / My Automations /
-- Canvas Builder / Runs & Logs / Usage & Limits / AI Builder / Integrations /
-- Approvals / Errors).
--
-- Extends the existing LIVE `smart_rules` engine (smart_rules, smart_rule_runs,
-- smart_rule_actions_log) rather than creating a second automation engine, per
-- project convention. Adds: versioning, canvas definitions, recipe usage
-- tracking, integration connections + webhooks + deliveries, a generic
-- approval-request system (first one in the repo — nothing to extend), error
-- incident grouping, and usage-event tracking for billing/limits.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS throughout.
-- RLS: via existing public.is_workspace_member() helper.
-- =============================================================================

-- ─── smart_rule_run_status: new values (own statement — Postgres rule) ──────
ALTER TYPE public.smart_rule_run_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE public.smart_rule_run_status ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE public.smart_rule_run_status ADD VALUE IF NOT EXISTS 'waiting_approval';
ALTER TYPE public.smart_rule_run_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.smart_rule_run_status ADD VALUE IF NOT EXISTS 'skipped';

-- ─── smart_rules: automation-platform columns ────────────────────────────────
ALTER TABLE public.smart_rules
  ADD COLUMN IF NOT EXISTS status               text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS module               text NOT NULL DEFAULT 'operations',
  ADD COLUMN IF NOT EXISTS environment          text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS tags                 text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipe_id            text,
  ADD COLUMN IF NOT EXISTS complexity           text NOT NULL DEFAULT 'easy',
  ADD COLUMN IF NOT EXISTS definition_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS draft_definition_json jsonb,
  ADD COLUMN IF NOT EXISTS active_version_id    uuid,
  ADD COLUMN IF NOT EXISTS draft_version_id     uuid,
  ADD COLUMN IF NOT EXISTS archived_at          timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smart_rules_status_check') THEN
    ALTER TABLE public.smart_rules
      ADD CONSTRAINT smart_rules_status_check
      CHECK (status IN ('draft','review_requested','approved','published','active','paused','archived','disabled','invalid'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smart_rules_complexity_check') THEN
    ALTER TABLE public.smart_rules
      ADD CONSTRAINT smart_rules_complexity_check
      CHECK (complexity IN ('easy','medium','advanced'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS smart_rules_workspace_status_idx ON public.smart_rules (workspace_id, status);
CREATE INDEX IF NOT EXISTS smart_rules_workspace_module_idx ON public.smart_rules (workspace_id, module);

-- ─── automation_versions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id   uuid NOT NULL REFERENCES public.smart_rules(id) ON DELETE CASCADE,
  version_number  integer NOT NULL,
  definition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version  integer NOT NULL DEFAULT 1,
  change_summary  text,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review_requested','approved','published','rejected')),
  checksum        text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  approved_by     uuid REFERENCES auth.users(id),
  approved_at     timestamptz,
  published_by    uuid REFERENCES auth.users(id),
  published_at    timestamptz,
  CONSTRAINT automation_versions_unique UNIQUE (automation_id, version_number)
);
CREATE INDEX IF NOT EXISTS automation_versions_automation_idx ON public.automation_versions (automation_id, version_number DESC);
CREATE INDEX IF NOT EXISTS automation_versions_workspace_idx ON public.automation_versions (workspace_id);

-- ─── automation_recipe_favourites ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_recipe_favourites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_recipe_favourites_unique UNIQUE (workspace_id, user_id, recipe_id)
);

-- ─── automation_recipe_usage ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_recipe_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  recipe_id     text NOT NULL,
  automation_id uuid REFERENCES public.smart_rules(id) ON DELETE SET NULL,
  actor_id      uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_recipe_usage_recipe_idx ON public.automation_recipe_usage (workspace_id, recipe_id);

-- ─── smart_rule_runs: execution metadata columns ─────────────────────────────
ALTER TABLE public.smart_rule_runs
  ADD COLUMN IF NOT EXISTS workspace_id     uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS trigger_source   text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS environment      text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS initiated_by     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_of_run_id  uuid REFERENCES public.smart_rule_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replay_of_run_id uuid REFERENCES public.smart_rule_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS started_at       timestamptz NOT NULL DEFAULT now();

-- Backfill workspace_id on existing rows from the parent rule (safe no-op if empty).
UPDATE public.smart_rule_runs r
SET workspace_id = sr.workspace_id
FROM public.smart_rules sr
WHERE r.rule_id = sr.id AND r.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS smart_rule_runs_workspace_idx    ON public.smart_rule_runs (workspace_id, ts DESC);
CREATE INDEX IF NOT EXISTS smart_rule_runs_status_idx       ON public.smart_rule_runs (workspace_id, status);
CREATE INDEX IF NOT EXISTS smart_rule_runs_rule_idx         ON public.smart_rule_runs (rule_id, ts DESC);

-- ─── smart_rule_actions_log: step metadata columns ───────────────────────────
ALTER TABLE public.smart_rule_actions_log
  ADD COLUMN IF NOT EXISTS workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS node_id       text,
  ADD COLUMN IF NOT EXISTS node_type     text,
  ADD COLUMN IF NOT EXISTS step_index    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms   integer,
  ADD COLUMN IF NOT EXISTS started_at    timestamptz NOT NULL DEFAULT now();

UPDATE public.smart_rule_actions_log a
SET workspace_id = sr.workspace_id
FROM public.smart_rules sr
WHERE a.rule_id = sr.id AND a.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS smart_rule_actions_log_run_idx ON public.smart_rule_actions_log (run_id, step_index);

-- ─── integration_connections ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  connect_type   text NOT NULL DEFAULT 'api_key' CHECK (connect_type IN ('oauth','api_key','coming_soon')),
  status         text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','error')),
  environment    text NOT NULL DEFAULT 'production',
  config         jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_last4   text,
  connected_by   uuid REFERENCES auth.users(id),
  connected_at   timestamptz,
  last_sync_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_connections_unique UNIQUE (workspace_id, provider)
);

-- ─── integration_webhooks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_webhooks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id      uuid REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  direction          text NOT NULL CHECK (direction IN ('incoming','outgoing')),
  endpoint_url       text,
  token              text,
  secret_hash        text,
  retry_policy       jsonb NOT NULL DEFAULT '{"strategy":"exponential_backoff","max_retries":5,"initial_delay_ms":1000,"max_delay_ms":300000}'::jsonb,
  subscribed_events  text[] NOT NULL DEFAULT '{}',
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_webhooks_workspace_idx ON public.integration_webhooks (workspace_id);

-- ─── integration_webhook_deliveries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_webhook_deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  webhook_id    uuid NOT NULL REFERENCES public.integration_webhooks(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed','rate_limited')),
  response_code integer,
  attempt       integer NOT NULL DEFAULT 1,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_webhook_deliveries_webhook_idx ON public.integration_webhook_deliveries (webhook_id, created_at DESC);

-- ─── approval_requests (first generic approvals system in the repo) ─────────
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id   uuid REFERENCES public.smart_rules(id) ON DELETE CASCADE,
  run_id          uuid REFERENCES public.smart_rule_runs(id) ON DELETE SET NULL,
  request_type    text NOT NULL,
  module          text NOT NULL DEFAULT 'operations',
  trigger_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_state    jsonb,
  after_state     jsonb,
  priority        text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','changes_requested','escalated')),
  reason          text,
  submitted_by    uuid REFERENCES auth.users(id),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  reviewer_id     uuid REFERENCES auth.users(id),
  due_at          timestamptz,
  decided_by      uuid REFERENCES auth.users(id),
  decided_at      timestamptz
);
CREATE INDEX IF NOT EXISTS approval_requests_workspace_status_idx ON public.approval_requests (workspace_id, status);
CREATE INDEX IF NOT EXISTS approval_requests_reviewer_idx ON public.approval_requests (reviewer_id);
CREATE INDEX IF NOT EXISTS approval_requests_due_idx ON public.approval_requests (due_at);

-- ─── approval_comments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approval_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  approval_id  uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES auth.users(id),
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approval_comments_approval_idx ON public.approval_comments (approval_id, created_at);

-- ─── automation_error_incidents (grouped by fingerprint) ─────────────────────
CREATE TABLE IF NOT EXISTS public.automation_error_incidents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id   uuid REFERENCES public.smart_rules(id) ON DELETE CASCADE,
  fingerprint     text NOT NULL,
  title           text NOT NULL,
  message         text,
  severity        text NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical','warning','info')),
  module          text NOT NULL DEFAULT 'operations',
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  impact          text NOT NULL DEFAULT 'low' CHECK (impact IN ('low','medium','high')),
  node_id         text,
  node_type       text,
  stack_trace     text,
  payload_preview jsonb,
  suggested_fix   text,
  owner_id        uuid REFERENCES auth.users(id),
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  occurrences     integer NOT NULL DEFAULT 1,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES auth.users(id),
  CONSTRAINT automation_error_incidents_unique UNIQUE (workspace_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS automation_error_incidents_workspace_status_idx ON public.automation_error_incidents (workspace_id, status);
CREATE INDEX IF NOT EXISTS automation_error_incidents_severity_idx ON public.automation_error_incidents (workspace_id, severity);

-- ─── automation_error_occurrences ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_error_occurrences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  incident_id  uuid NOT NULL REFERENCES public.automation_error_incidents(id) ON DELETE CASCADE,
  run_id       uuid REFERENCES public.smart_rule_runs(id) ON DELETE SET NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  message      text
);
CREATE INDEX IF NOT EXISTS automation_error_occurrences_incident_idx ON public.automation_error_occurrences (incident_id, occurred_at DESC);

-- ─── automation_usage_events (billing/usage rollups) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_usage_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES public.smart_rules(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('run','ai_credit','webhook_event','approval_task','storage_mb')),
  module        text NOT NULL DEFAULT 'operations',
  quantity      integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_usage_events_workspace_kind_idx ON public.automation_usage_events (workspace_id, kind, created_at DESC);

-- =============================================================================
-- RLS POLICIES — apply to every new table via the existing workspace helper
-- =============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'automation_versions',
    'automation_recipe_favourites',
    'automation_recipe_usage',
    'integration_connections',
    'integration_webhooks',
    'integration_webhook_deliveries',
    'approval_requests',
    'approval_comments',
    'automation_error_incidents',
    'automation_error_occurrences',
    'automation_usage_events'
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
END $$;
