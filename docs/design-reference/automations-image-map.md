# Event Manager Automations — Reference Image Map

Source folder: `working_images_automation/` (note: actual folder name differs slightly from the name given in the brief — `working_images_automation`, not `working_images_automations_section`).

Images were generically named by the generator (`ChatGPT Image Jul 11, 2026, 01_13_39-40 PM (N).png`) and were identified by opening and visually inspecting each one — filenames carry no semantic meaning.

| # | Filename | Screen | Route |
|---|----------|--------|-------|
| 1 | `...39 PM (1).png` | Overview | `/event-manager/automations` |
| 2 | `...39 PM (2).png` | Canvas Builder | `/event-manager/automations/builder/[automationId]` |
| 3 | `...39 PM (3).png` | My Automations | `/event-manager/automations/my-automations` |
| 4 | `...39 PM (4).png` | AI Builder | `/event-manager/automations/ai-builder` |
| 5 | `...39 PM (5).png` | Usage & Limits | `/event-manager/automations/usage` |
| 6 | `...39 PM (6).png` | Runs & Logs | `/event-manager/automations/runs` |
| 7 | `...40 PM (7).png` | Recipes | `/event-manager/automations/recipes` |
| 8 | `...40 PM (8).png` | Integrations | `/event-manager/automations/integrations` |
| 9 | `...40 PM (9).png` | Approvals | `/event-manager/automations/approvals` |
| 10 | `...40 PM (10).png` | Errors | `/event-manager/automations/errors` |

All ten reference images already use Gala Dock's real production shell (dark navy sidebar, purple brand accents, `Gala Dock` logo, workspace switcher, global search, Create/Copilot/notifications/help/avatar in the topbar) — **no** cross-contamination from the unrelated "JT Property Manager" shell needed to be stripped; the bottom-left sidebar user block in the source images reads "Jamahl Thomas / JT Property Manager" which is simply the seeded demo user's display name, not a different product shell.

Shared page anatomy across all ten: `PageHeader` (title "Automations", one-line subtitle, right-aligned actions — "AI Builder" secondary + "New automation" primary, plus a per-screen extra action where relevant), a purple-underlined horizontal tab strip (`AUTOMATIONS_TABS` in `src/components/ui/SectionTabs.tsx`: Overview / Recipes / My Automations / Canvas Builder / Runs & Logs / Usage & Limits / AI Builder / Integrations / Approvals / Errors), a KPI card row (icon chip, label, value, delta where a real comparison is available), a two/three-column body (main content + a narrower right "insights" rail on most screens), and — on list-heavy screens — a filter bar + table + pagination.

## Per-screen breakdown

### 1. Overview
- KPIs (6): Total automations, Active, Drafts, Success rate, Runs today, Pending approvals.
- Body: Quick actions card · Featured recipes (6 cards, horizontal) · Recent automation activity (table) · Needs attention (failed runs / pending approvals / disconnected integrations) · Usage snapshot (progress bars) · Automation coverage (donut by module).
- Footer: dismissible AI recommendation banner ("Explore Suggestions").
- Data sources: `smart_rules`, `smart_rule_runs`, `approval_requests`, `integration_connections`, `automation_usage_events` — all real, workspace-scoped via `src/lib/automations/data.ts`.

### 2. Canvas Builder
- Toolbar: back, editable name, Draft/Published status pill, version, undo/redo, zoom controls, Visual/JSON/Code toggle, Save draft, Publish for review, fullscreen.
- Left: searchable/categorised Node Library (drag source), from `AUTOMATION_NODES` in `src/lib/automations/nodes.ts` (28 triggers, 7 conditions, 3 branch, 3 delay, 3 lookup, 5 AI, 9 action, 3 comm, 3 payment, 2 approval, 2 integration, 2 webhook, 3 utility, 3 error, 3 end).
- Centre: `@xyflow/react` (React Flow v12) canvas with a custom `AutomationNodeCard` node type, colour-coded header per node kind, minimap, background grid, zoom/pan controls.
- Right: Inspector (Settings/Inputs/JSON/Test Data tabs) for the selected node.
- Bottom: Dry-run Preview / Execution Steps / Validation / Logs / Outputs tabs — dry-run is an honest **client-side, read-only simulation** that walks the trigger→action chain via connected edges; it never touches real records, matching the reference image's "Read-only simulation — no real records are affected" caption.
- Persistence: Save draft writes to `smart_rules.draft_definition_json`; Publish for review creates a new immutable row in `automation_versions` and flips `smart_rules.status` to `review_requested`.

### 3. My Automations
- KPIs (6): Total, Active, Drafts, Paused, Success rate, Last 7 days runs.
- Toolbar: search, Status/Module/Owner/Tags filters, saved views, bulk select + bulk Pause/Activate/Archive/Export/Delete.
- Table: name (→ Canvas Builder), module badge, trigger (human label), status, last run, success rate, next scheduled run, last edited by, row actions (Open/Duplicate/Pause·Activate/Archive/Export/View runs/Version history).
- Right rail: Recently edited · Drafts needing review · Top performing automations.
- Pagination: server-side.

### 4. Runs & Logs
- KPIs (6): Runs today, Success rate, Avg duration, Failed runs, Approval pauses, Queue depth.
- Left: filterable/paginated Run History table (`smart_rule_runs`, deep-linkable via `?run=`).
- Right: Run Details panel — Retry/Replay/Cancel actions, Timeline/Logs/Payload/Request-Response/Metadata tabs, per-step status + error detail.
- Bottom: Run Status Distribution (donut), Recent Failures, Insights & Anomalies (only real, computed heuristics — no fabricated commentary).

### 5. Usage & Limits
- Top cards (6): Monthly runs used, Remaining runs, AI credits used, Webhook events, Approval tasks, Workspace plan — all from `billing_subscriptions` + `billing_plans.limits_jsonb` (extended with `smart_rule_count`, `automation_ai_credits_per_month`, `automation_webhook_events_per_month`, `automation_approval_tasks_per_month`, `automation_storage_gb`, `automation_execution_concurrency`, `automation_active_integrations`, `automation_active_seats` — see migration below).
- Body: Usage over time (area/line, 30d), Usage by module (donut), Limit thresholds (Healthy/Approaching/Exceeded computed from real %), Plan entitlements table, Overage pricing / Top active seats / Webhook rate limits / Execution concurrency / Storage / Retention / Recommendations — each rendered honestly, with a "not configured" fallback rather than invented numbers where the underlying billing schema has no real value.

### 6. AI Builder
- Main: natural-language prompt box + module chips + Generate Workflow.
- Because no LLM provider is wired into this repo for this feature, workflow generation uses a documented, honest deterministic keyword-matcher against the 7 live triggers / 5 live actions rather than claiming a fake "AI-generated" result — see the AI Builder screen's own header copy for the exact framing used.
- Right: Source context, Connected modules, Required permissions (derived from the real chosen action), Generated JSON preview (the real payload that gets saved).
- Save as Draft inserts a real `smart_rules` row and redirects into the Canvas Builder.

### 7. Recipes
- Category pills (All/Events/Suppliers/Finance/Tasks/Tickets/Documents/Notifications, mapped 1:1 to `RecipeTemplate.group` in `src/lib/automations/recipes.ts` — no invented taxonomy).
- Filter row: search, trigger, module, complexity, favourites (real, backed by `automation_recipe_favourites`), sort by popularity (real, backed by `automation_recipe_usage`), card/list view toggle.
- Featured / Recently Used / Recommended / Popular This Month sections.
- "Use recipe" creates a real disabled/dry-run draft `smart_rules` row (via `useRecipe` server action) mapped from the recipe's `liveTrigger`/`liveAction` to the actual 7-trigger/5-action smart_rules engine.
- Right: Automation Overview, Most Used Recipes, Automation Coverage.

### 8. Integrations
- KPIs (5): Connected integrations, Active webhooks, Failed deliveries, API keys, Last 24h events.
- Left: integration list (Slack, Stripe, Email provider, Twilio, Google Calendar, Zapier, Custom Webhook, REST API) — seeded as demo "connected" rows since no live third-party OAuth apps exist in this environment; the section is explicit that these are demo connection records, not live-calling integrations (no outbound HTTP is actually made to Slack/Stripe/etc. — "Send test event" logs a real row to `integration_webhook_deliveries` rather than performing a real external call).
- Main: Webhook Setup / API Keys / OAuth Connections / Incoming / Outgoing / Field Mappings tabs, delivery table.
- Right: Integration health, Failure alerts, Integration activity, Help.

### 9. Approvals
- KPIs (6): Pending, Approved today, Rejected today, Avg review time, Escalated, Review SLA met.
- Queue table with the seeded example (Supplier doc expiring → request renewal / Document Renewal Approval, with a real before/after insurance-certificate comparison) plus 4 more.
- Lower detail panel: Overview / Details / Before-After / Attachments / Comments / Audit Trail tabs, Approve/Reject/Request changes/Assign reviewer actions (`approval_requests`, `approval_comments`).
- Right: Approvals overview (donut), By module, SLA performance.

### 10. Errors
- KPIs (6): Open errors, Critical, Warning, Resolved today, Impacted automations, Mean time to resolution.
- Analytics: Error trend, Errors by module (donut), Incident heatmap — all derived from `automation_error_incidents` / `automation_error_occurrences`, grouped by a stable fingerprint (not one row per raw run failure).
- Table + detail panel: Overview/Logs/Related Runs/History tabs, Retry Now / Open in Canvas / Assign / Mark Resolved actions. Payload previews and stack traces pass through a redaction helper before rendering (keys matching `key|secret|token|password|authorization` are masked).

## Screenshot artefacts intentionally NOT reproduced
Desktop wallpaper, OS window chrome/black borders, browser address bar, Windows taskbar, and any cropped edges visible only because the source was a full-screen capture.

## Data model
See `supabase/migrations/20260714_automations_platform.sql` — extends the existing live `smart_rules` / `smart_rule_runs` / `smart_rule_actions_log` engine (not a second automation engine) with `automation_versions`, `automation_recipe_favourites`, `automation_recipe_usage`, `integration_connections`, `integration_webhooks`, `integration_webhook_deliveries`, `approval_requests`, `approval_comments`, `automation_error_incidents`, `automation_error_occurrences`, `automation_usage_events`. Demo data: `supabase/seeds/automations-section-demo-seed.sql` (idempotent).
