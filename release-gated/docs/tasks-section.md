# Tasks Section — Implementation Report

Scope agreed with the user up front: **full functional rebuild** of all six
screens with real Supabase data/mutations/drag-and-drop/templates/R2
attachments — deferring the exhaustive RLS-matrix / automation-engine /
full-test-suite / Chrome-MCP-pixel-QA bureaucracy from the original spec to a
follow-up hardening pass. This report reflects that agreed scope, not the
full 220-point checklist.

## Reference mapping

See `docs/design-reference/task-section-image-map.md` for the verified
image→screen mapping (all six opened and read, not filename-guessed) and
per-screen layout notes.

## Routes

| Route | Behaviour |
|---|---|
| `/event-manager/tasks?tab=my-tasks&view=list` | My Tasks |
| `/event-manager/tasks?tab=all-tasks&view=kanban\|list` | All Tasks |
| `/event-manager/tasks?tab=event-tasks&view=list` | Event Tasks |
| `/event-manager/tasks?tab=supplier-tasks&view=list` | Supplier Tasks |
| `/event-manager/tasks?tab=overdue&view=kanban` | Overdue |
| `/event-manager/tasks?tab=templates&view=grid\|list` | Templates (inside the full shell) |
| `/event-manager/tasks/new`, `/[taskId]`, `/[taskId]/edit` (edit via detail) | Task create/detail |
| `/event-manager/tasks/templates/new`, `/templates/[id]/edit` | Template create/edit |
| `/event-manager/tasks/calendar` | **Redirects** → `/event-manager/calendar?view=gantt` |
| `/event-manager/tasks/templates` (old standalone) | **Redirects** → `/event-manager/tasks?tab=templates&view=grid` |
| `/event-manager/calendar?view=gantt` | New Gantt view, same canonical `tasks` data |

Single canonical route with URL-driven tab/view state, per spec — not six
separate page trees.

## What changed

**Removed**
- `TasksClient.tsx` (old list/board-only client) and `TaskCalendarClient.tsx`
  (old in-Tasks calendar grid) — deleted.
- The "Calendar" tab inside Tasks — gone from `TABS`.
- The disconnected standalone `/tasks/templates` page — now a tab inside the
  full shell (redirect preserves the old URL).

**Added — frontend**
- `TasksWorkspaceClient.tsx` — shared shell (header, tab nav, view switcher,
  New Task/Template split buttons) driving all six screens via `?tab=&view=`.
- `_shared.tsx` — Donut, BarList, Sparkline, PriorityBadge, AssigneeAvatar,
  InsightCard primitives reused across every insight rail.
- `_views/MyTasksView.tsx`, `AllTasksView.tsx`, `EventTasksView.tsx`,
  `SupplierTasksView.tsx`, `OverdueView.tsx`, `TemplatesView.tsx` — one real
  component per screen, each with its own KPI row, filters, and insight rail
  matching the reference layout.
- `calendar/GanttView.tsx` — new Gantt view for the Calendar module, grouped
  by event, reading the same canonical `tasks` rows (no duplicate data).
- Template create/edit routes (`templates/new`, `templates/[id]/edit`) with
  a real item-editing UI.
- Checklist, Files (R2 attachments), and Dependencies added to the task
  detail page (`[taskId]/TaskDetailClient.tsx`), alongside the existing
  Details/Comments/Activity tabs.

**Added — backend**
- Migration `supabase/migrations/20260711_tasks_section_depth.sql`: adds
  `review` to `task_status`; adds `category`/`phase`/`next_action`/`venue_id`/
  `milestone_label`/`is_milestone`/`blocked_reason`/`original_due_at`/
  `reschedule_count`/`source`/`template_id`/`timezone` to `tasks`; adds
  `task_checklist_items`, `task_watchers`, `task_activity`,
  `task_status_history`, `task_template_usage`; extends `task_templates` and
  `task_template_items`; RLS via the existing `is_workspace_member()` helper
  on every new table.
- **Discovered mid-build**: `task_attachments` and `task_dependencies`
  already existed live with a different schema than assumed (`mime` /
  `storage_path` / `deleted_at`, and a `kind: 'blocks'|'relates'`
  composite-key table respectively). Caught by a `tsc` type conflict, not a
  runtime bug — the migration was corrected to leave both tables untouched
  and the app code (`actions.ts`, task detail page) was adapted to the real
  columns.
- `supabase/seeds/task-section-demo-seed.sql` — idempotent seed: 6 suppliers
  (StagePro Lighting, Elite Audio Visual, Catering Collective, Gourmet
  Events Co., Vision AV, SecureGuard Services), ~30 tasks across the
  existing Pulse Summit & After Dark 2026 / Theatre Gala Night / After Dark
  Club Night events (resolved by name, not hardcoded IDs), 5 templates with
  items, template usage history for the analytics donut, checklist items, a
  dependency, and status history. Due dates are all `now() ± interval`, so
  every KPI is computed live, never hardcoded.
- Server actions added to `actions.ts`: `updateTaskStatus` (drag-and-drop,
  writes status history + activity), `rescheduleTask`, `assignTask` /
  `removeTaskAssignee`, `addChecklistItem` / `toggleChecklistItem`,
  `addTaskDependency` / `removeTaskDependency`, `applyTaskTemplate`
  (creates real tasks from template items, due-dated relative to the target
  event's start date), `duplicateTaskTemplate`, `archiveTaskTemplate`,
  `createTaskTemplate` / `updateTaskTemplate` / `addTemplateItem` /
  `removeTemplateItem`, `getTaskAttachmentUploadUrl` (presigned R2 PUT) /
  `attachTaskFile`.

## R2 attachments

Wired through the existing `src/lib/storage/r2.ts` presigned-PUT helper.
`getTaskAttachmentUploadUrl` returns `{ configured: false }` when R2 env vars
aren't set (`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`) —
the Files tab shows a truthful "storage isn't configured" message rather than
a fake success state in that case.

## Drag-and-drop

Native HTML5 DnD on both the All Tasks (4-column) and Overdue (3-column)
Kanban boards. Optimistic local state update → `updateTaskStatus` server
action → rollback to the pre-drag state on failure. Every card also exposes
small "Move to…" buttons as a keyboard-accessible alternative to dragging.

## Templates → real tasks

"Apply" opens a modal to pick a target event/supplier, then calls
`applyTaskTemplate`, which inserts real `tasks` rows (not a fake success
toast) with `due_at` computed from each item's `offset_days` relative to the
target event's `start_at` (or `now()` if none picked), and logs a
`task_template_usage` row for the usage analytics.

## Typecheck / lint / build

- `tsc --noEmit`: clean.
- `eslint` on the entire Tasks module and every edited Calendar file: clean
  (fixed 3 real errors along the way — a React Compiler purity violation from
  `Date.now()` in render, an impure variable-mutation pattern in the Donut
  chart, and an unescaped `'`).
- `next build`: succeeds, all new routes present in the route manifest.

## Migration + seed: now applied to the live database

Both were run directly against the live Gala Dock project via the Supabase
Management API (PAT), once you confirmed that scope. Verified: 42 tasks, 5
templates, 6 demo suppliers created under the `Grannit Holdings` workspace.
`database.types.ts` was regenerated from the live schema afterward and
diffed byte-for-byte against the earlier hand patch — zero differences.

Three real bugs were caught only by hitting the live schema (not by
typecheck/build, which can't see constraint/enum details) — see
`docs/qa/task-section-visual-qa.md` for the exact fixes: a `suppliers.tier`
check-constraint violation, a `task_dependencies` schema mismatch (that
table already existed with a different shape than assumed — no
`workspace_id`, composite PK, `kind` enum), and a missing `::task_priority`
cast in the template-item seed inserts.

**Unrelated pre-existing issue noticed along the way, not touched:**
`src/lib/messaging/actions.ts` has the same `Record<string, unknown>` update
typing problem I fixed in the Tasks `actions.ts` — `tsc --noEmit` flags it,
though `next build` still succeeds. It's an untracked file outside this
task's scope (and possibly mid-edit by another concurrent process in this
environment), so I left it alone. Worth a look separately.

## What is NOT done in this pass (by agreed scope)

- **Full authenticated Chrome MCP pixel QA is not done.** The schema/data are
  live and routes are confirmed reachable + correctly auth-gated (verified
  via redirect checks), but I stopped short of signing in myself: doing so
  required looking up a real user's email (PII, outside what this task
  authorized — correctly blocked), and separately the local Chrome DevTools
  MCP browser profile was already in use by another process and wouldn't
  attach. See `docs/qa/task-section-visual-qa.md` for exactly what's needed
  to finish this (a `DEV_QA_EMAIL` value from you, or you doing the
  click-through yourself against the already-running dev server).
- No full RLS positive/negative test matrix, no automated test suite, no
  automation-engine integration, no saved-views subsystem (filters are
  inline, not a separate drawer + saved-view chip), no exhaustive
  accessibility/perf audit — all explicitly deferred per the scope choice
  made at the start of this session.
- The pre-existing `event_tasks` table (used only by
  `/event-manager/events/[eventId]/tasks`) still duplicates the canonical
  `tasks` table used here. Reconciling those is a real data migration and
  was flagged, not attempted, in this pass.

## Recommended next steps

1. Run the migration + seed (both documented above).
2. Do the Chrome MCP pixel-comparison pass against the six references.
3. Decide whether to fold `event_tasks` into `tasks`.
4. If/when this needs to go fully release-gated per the original 220-item
   checklist (full RLS matrix, automation wiring, test suite, accessibility
   audit, release-evidence scoring), that's a distinct follow-up pass.
