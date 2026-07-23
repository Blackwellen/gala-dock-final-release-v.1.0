# Tasks-section migration — RESOLVED (applied via PAT)

**Update:** once you gave the go-ahead ("use pat"), this was applied directly
against the live Gala Dock project via the Supabase Management API using
`SUPABASE_ACCESS_TOKEN`, bypassing the CLI migration-history issue entirely
(no CLI history reconciliation needed for this approach). The demo seed was
also applied. Verified live: 42 tasks, 5 templates, 6 demo suppliers under
the `Grannit Holdings` workspace. `database.types.ts` was regenerated from
the live schema and confirmed identical to the earlier hand patch.

**Remaining manual item:** authenticated Chrome MCP visual QA — see
`docs/qa/task-section-visual-qa.md` for exactly what's needed (a
`DEV_QA_EMAIL` from you, or you doing the click-through yourself).

The original context below is kept for the record.

## Why this was originally manual

The Supabase CLI's local migration history (`supabase/migrations/`) is missing
files for ~130 migrations that exist on the linked remote project (they were
applied directly at some point, including the original `tasks` /
`task_templates` / `task_template_items` tables). `supabase db push` refuses
to run until that history is reconciled.

The CLI's own repair path (`supabase migration repair --status applied ...`)
turned out to require a local placeholder file per remote-only version, which
wasn't part of what you approved, and the alternative (`--status reverted`)
is a different operation your session's safety layer correctly held for
separate sign-off. Rather than force either, the safe path is: you run the
new SQL directly, and I keep building the app against it.

## What to do

1. Open the Supabase dashboard for the **Gala Dock** project → SQL Editor.
2. Paste and run the full contents of:
   `supabase/migrations/20260711_tasks_section_depth.sql`
3. Confirm it completes without error (it's idempotent — safe to re-run).
4. Tell Claude it's applied, or re-run the build — it will regenerate
   `src/lib/supabase/database.types.ts` against the live schema next.

## What this migration does

- Adds `'review'` to the `task_status` enum (used by the All Tasks Kanban).
- Adds columns to `tasks`: `category`, `phase`, `next_action`, `venue_id`,
  `milestone_label`, `is_milestone`, `blocked_reason`, `original_due_at`,
  `reschedule_count`, `source`, `template_id`, `timezone`.
- Adds new tables: `task_checklist_items`, `task_watchers`, `task_activity`,
  `task_status_history`, `task_template_usage`.
- Adds columns to `task_templates`: `description`, `category`, `icon`,
  `use_case`, `is_active`, `automation_ready`, `version`, `updated_at`,
  `updated_by`; and `category` to `task_template_items`.
- Applies workspace-scoped RLS (`is_workspace_member`) to every new table,
  matching the existing pattern in `20260630_event_core_tables.sql`.

Note: `task_attachments` and `task_dependencies` already existed live with a
different schema than first assumed (`mime`/`storage_path`/`deleted_at` and a
`kind: 'blocks'|'relates'` composite-key table, respectively) — discovered via
a `tsc` type conflict mid-build. The app code was adapted to the real schema;
the migration does not touch either table.

## After the migration: load the demo seed

1. In the Supabase SQL Editor, open
   `supabase/seeds/task-section-demo-seed.sql`.
2. Replace `<WORKSPACE_ID>` with your real workspace UUID and run it
   (idempotent — safe to re-run).
3. It creates 6 demo suppliers, ~30 tasks across the Pulse Summit / Theatre
   Gala / After Dark Club Night events, 5 task templates with items, and
   backfills display names onto real workspace members whose profile has no
   name set yet (never overwrites an existing name).
4. It requires at least one existing `workspace_members` row for the target
   workspace — it will raise an error naming that requirement if none exist.

## Separate, longer-term cleanup (not done in this pass)

There is a legacy `event_tasks` table (created in
`20260630_event_core_tables.sql`) that is a *separate* task table used only
by `/event-manager/events/[eventId]/tasks`. It duplicates the canonical
`tasks` table used by the main `/event-manager/tasks` module. Reconciling
these (migrating `event_tasks` rows into `tasks` and repointing the event
detail tab) is a real data migration with its own risk and was out of scope
for this pass — flagged here so it doesn't get lost.

Separately, once you have a spare few minutes, it's worth fully reconciling
the local `supabase/migrations/` folder against the remote project (e.g. via
`supabase db pull` on a quiet moment) so future `supabase db push` calls stop
hitting this same history mismatch.
