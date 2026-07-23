-- =============================================================================
-- Gala Dock — Tasks Section Depth (My/All/Event/Supplier/Overdue/Templates)
-- Extends the canonical `tasks` / `task_templates` / `task_template_items`
-- tables (already live) with the columns and child tables needed to power
-- the full Tasks module: checklist items, dependencies, watchers, R2-backed
-- attachments, activity log, status history (for drag-and-drop + resolution
-- rate), and template usage analytics.
-- Idempotent: uses ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.
-- RLS: via existing public.is_workspace_member() helper.
-- =============================================================================

-- ─── New task_status value: "review" ─────────────────────────────────────────
-- Must not be referenced elsewhere in this same migration file (Postgres
-- forbids using a new enum value in the transaction that added it).
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'review';

-- ─── tasks: additional columns ────────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS category           text,
  ADD COLUMN IF NOT EXISTS phase              text,
  ADD COLUMN IF NOT EXISTS next_action        text,
  ADD COLUMN IF NOT EXISTS venue_id           uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS milestone_label    text,
  ADD COLUMN IF NOT EXISTS is_milestone       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason     text,
  ADD COLUMN IF NOT EXISTS original_due_at    timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source             text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS template_id        uuid REFERENCES public.task_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS timezone           text NOT NULL DEFAULT 'Europe/London';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_source_check'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_source_check
      CHECK (source IN ('manual', 'template', 'automation', 'recurring'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tasks_workspace_status_idx   ON public.tasks (workspace_id, status);
CREATE INDEX IF NOT EXISTS tasks_workspace_due_idx      ON public.tasks (workspace_id, due_at);
CREATE INDEX IF NOT EXISTS tasks_workspace_event_idx    ON public.tasks (workspace_id, event_id);
CREATE INDEX IF NOT EXISTS tasks_workspace_supplier_idx ON public.tasks (workspace_id, supplier_id);
CREATE INDEX IF NOT EXISTS tasks_template_idx           ON public.tasks (template_id);

-- ─── task_checklist_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title        text NOT NULL,
  is_done      boolean NOT NULL DEFAULT false,
  sort         integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS task_checklist_items_task_idx ON public.task_checklist_items (task_id, sort);

-- Note: `task_dependencies` (task_id, depends_on_task_id, kind, created_by,
-- created_at) already exists live with a `task_dep_kind` ('blocks'|'relates')
-- column and a composite key (no separate id/workspace_id) — nothing to add here.

-- ─── task_watchers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_watchers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_watchers_unique UNIQUE (task_id, user_id)
);

-- Note: `task_attachments` (workspace_id, task_id, mime, size_bytes,
-- storage_path, uploaded_by, created_at, deleted_at) already exists live —
-- `storage_path` holds the R2 object key (which embeds the original
-- filename via r2Key()'s naming convention). Nothing to add here.

-- ─── task_activity (activity feed) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_activity (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES auth.users(id),
  action       text NOT NULL,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_activity_task_idx ON public.task_activity (task_id, created_at DESC);

-- ─── task_status_history (drag-and-drop audit + resolution-rate insight) ────
CREATE TABLE IF NOT EXISTS public.task_status_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  from_status  text,
  to_status    text NOT NULL,
  was_overdue  boolean NOT NULL DEFAULT false,
  changed_by   uuid REFERENCES auth.users(id),
  changed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_status_history_task_idx ON public.task_status_history (task_id, changed_at DESC);

-- ─── task_templates: additional columns ──────────────────────────────────────
ALTER TABLE public.task_templates
  ADD COLUMN IF NOT EXISTS description       text,
  ADD COLUMN IF NOT EXISTS category          text,
  ADD COLUMN IF NOT EXISTS icon              text NOT NULL DEFAULT 'ListChecks',
  ADD COLUMN IF NOT EXISTS use_case          text,
  ADD COLUMN IF NOT EXISTS is_active         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS automation_ready  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version           integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by        uuid REFERENCES auth.users(id);

-- ─── task_template_items: additional columns ─────────────────────────────────
ALTER TABLE public.task_template_items
  ADD COLUMN IF NOT EXISTS category text;

-- ─── task_template_usage (Apply / Duplicate / Edit tracking) ────────────────
CREATE TABLE IF NOT EXISTS public.task_template_usage (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_id           uuid NOT NULL REFERENCES public.task_templates(id) ON DELETE CASCADE,
  action                text NOT NULL CHECK (action IN ('applied', 'duplicated', 'edited')),
  applied_to_event_id   uuid REFERENCES public.events(id) ON DELETE SET NULL,
  applied_to_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  tasks_created         integer NOT NULL DEFAULT 0,
  actor_id              uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_template_usage_template_idx ON public.task_template_usage (template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_template_usage_workspace_idx ON public.task_template_usage (workspace_id, created_at DESC);

-- =============================================================================
-- RLS POLICIES — apply to every new table via the existing workspace helper
-- =============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'task_checklist_items',
    'task_watchers',
    'task_activity',
    'task_status_history',
    'task_template_usage'
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
