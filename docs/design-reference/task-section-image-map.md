# Tasks Section — Reference Image Map

Source directory: `working_imagesS_tasks/`
Verified by opening each image and reading its visible content (not filename guessing).

| # | Filename | Mapped Screen | Route (`tab`, `view`) |
|---|----------|----------------|------------------------|
| 1 | `ChatGPT Image Jul 10, 2026, 11_58_08 PM (1).png` | Templates | `/event-manager/tasks?tab=templates&view=grid` |
| 2 | `ChatGPT Image Jul 10, 2026, 11_58_09 PM (2).png` | All Tasks | `/event-manager/tasks?tab=all-tasks&view=kanban` |
| 3 | `ChatGPT Image Jul 10, 2026, 11_58_09 PM (3).png` | Supplier Tasks | `/event-manager/tasks?tab=supplier-tasks&view=list` |
| 4 | `ChatGPT Image Jul 10, 2026, 11_58_09 PM (4).png` | Overdue | `/event-manager/tasks?tab=overdue&view=kanban` |
| 5 | `ChatGPT Image Jul 10, 2026, 11_58_10 PM (5).png` | My Tasks | `/event-manager/tasks?tab=my-tasks&view=list` |
| 6 | `ChatGPT Image Jul 10, 2026, 11_58_11 PM (6).png` | Event Tasks | `/event-manager/tasks?tab=event-tasks&view=list` |

## Per-screen detail

### 1. Templates (`tab=templates&view=grid`)
- KPI cards: Active Templates, Most Used This Month, Event Templates, Supplier Follow-up Templates.
- Toolbar: search, Category, Use Case, Owner, Tags, Filters, Sort.
- Header actions: Template Categories, Grid/List switch, New Template split button.
- Grid of template cards (icon, name, description, category/tasks/used stats, owner, Active badge, Apply/Duplicate/Edit) + a "Create New Template" card.
- Insight rail: Template Usage donut (Applied/Duplicated/Edited), Most Popular Categories, Recently Updated, Automation Readiness.
- Sidebar shows Calendar as its own top-level item, distinct from Tasks — confirms Gantt/Calendar must live outside Tasks.

### 2. All Tasks (`tab=all-tasks&view=kanban`)
- KPI cards: Due Today, Overdue, Completed This Week, Supplier Tasks Pending.
- Kanban, 4 columns: To Do, In Progress, Review, Done — requires a `review` task status (didn't previously exist in the `task_status` enum).
- Insight rail: Total Tasks donut, Priority Breakdown, Tasks by Event, Overdue by Event.

### 3. Supplier Tasks (`tab=supplier-tasks&view=list`)
- KPI cards: Supplier Tasks Pending, Overdue, Completed This Week, Compliance Follow-ups.
- Table columns: Task, Supplier, Linked Event, Category, Due Date, Priority, Status, Owner, Documents, Next Step.
- Pagination footer ("Showing 1 to 10 of 14 results").
- Insight rail: Supplier Task Timing donut, Compliance Follow-ups, Onboarding Progress, Recently Updated Suppliers.

### 4. Overdue (`tab=overdue&view=kanban`)
- 5 KPI cards (one more than other tabs): Overdue Tasks, Critical & High Priority, Overdue > 7 Days (highlighted red border), Avg Overdue Time, At Risk / Due Soon.
- Kanban, 3 columns: To Do, In Progress, Awaiting Resolution.
- Insight rail: Overdue by Event, Overdue by Owner, Resolution Rate (donut), Critical Tasks.

### 5. My Tasks (`tab=my-tasks&view=list`)
- KPI cards: Due Today, Overdue, Completed This Week, Supplier Tasks Pending.
- Table columns: Task, Event, Due Date, Priority, Status, Assignee, Actions.
- Insight rail: "My Focus" donut, Upcoming Deadlines, Workload by Event, Completion Trend (sparkline).

### 6. Event Tasks (`tab=event-tasks&view=list`)
- KPI cards: Due Today, Overdue, Completed This Week, Supplier Tasks Pending.
- Table columns: Task, Event, Phase/Stage, Owner, Due Date, Priority, Status, Next Action.
- Saved view chip ("Saved View: Event Ops").
- Insight rail: Tasks by Event, Upcoming Milestones, Overdue by Event, Progress Summary (donut).

## Generated-image inconsistencies (not reproduced as contradictory logic)

The six reference images were generated independently and their task counts/tab
badge counts don't agree with each other (e.g. "All Tasks 42" vs "Overdue 12"
in one image vs "Overdue 24" in another; "Templates 6" vs "Templates 24").
Per the build brief, these were **not** hardcoded — the implementation seeds
one coherent dataset (`supabase/seeds/task-section-demo-seed.sql`) and every
tab count / KPI value is calculated live from that data via Supabase queries,
so the six screens are relationally consistent with each other even though
they won't numerically match the AI-generated reference screenshots exactly.
