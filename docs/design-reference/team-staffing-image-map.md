# Team & Staffing — Reference Image Map

Source folder: `working_imagesS_Team/` (repo root). All 10 files use the generic
export filename pattern `ChatGPT Image Jul 12, 2026, 09_51_0X PM (N).png` — they
do **not** carry the descriptive names listed in the build brief. All ten were
opened and visually inspected before mapping. Approx. 1672×941, DSF 1.

Viewport for QA pass: **1672 × 941, device scale factor 1**.

## Shell resolution

Images (1)(2)(3)(4)(5)(6)(7)(8)(10) show only a top bar (logo, global search,
Create, Copilot, bell, help, avatar) with **no left sidebar** — content starts
flush at the left edge. Image (9) shows an invented left icon-rail sidebar
(Home / Workforce / Schedule / Events / People / Analytics / Requests /
Messages / Settings) that matches none of the other nine and does not match
the app's real `AppSidebar`.

Per AGENTS.md §3 (global shell rule): the real Gala Dock shell
(`AppShellClient` → `AppSidebar` + `TopNav`) is preserved for all ten screens.
Neither the "no sidebar" majority nor image (9)'s invented sidebar overrides
it. Pixel-matching applies to the **content region only**, measured from the
shell's content boundary inward.

## Screen map

| # | Filename (index) | Screen | Route | Notes |
|---|---|---|---|---|
| 1 | (1) | Workload Gantt | `/event-manager/team/workload` | Page tabs "Workload / Availability" at top of content, under H1. |
| 2 | (2) | Availability Planner | `/event-manager/team/availability` | Same page tabs, "Availability" active. Shares KPI-strip/filter-bar chrome with (1). |
| 3 | (3) | Team Directory — List | `/event-manager/team/members?view=list` | Breadcrumb "Team & Staffing > Team Members". |
| 4 | (4) | Team Directory — Cards | `/event-manager/team/members?view=cards` | Page tabs "Team Directory / Availability" (variant labelling — treat as same tab set as 1/2, "Team Directory" = the Workload+Directory group landing). Card/List toggle top-right of toolbar. |
| 5 | (5) | Member Profile — Overview | `/event-manager/team/members/[memberId]/overview` | Subject: **Grace Williams**, Production Manager. Tabs: Overview / Roles & Skills / Schedule / Assignments / Documents / Notes / Activity / Payroll & Commercial / Settings. |
| 6 | (6) | Member Profile — Schedule | `/event-manager/team/members/[memberId]/schedule` | Subject: **Olivia Bennett**, Event Manager. Different tab set/order than (5) and (7) — see "Tab set reconciliation" below. |
| 7 | (7) | Member Profile — Roles & Skills | `/event-manager/team/members/[memberId]/roles-skills` | Subject: **Olivia Bennett**. Header shows member ID chip "TM-10048", verified badge, shield icon. |
| 8 | (8) | Find Team Members | `/event-manager/team/find` | Left filter rail + results table/list + right shortlist + coverage map. |
| 9 | (9) | Team Insights | `/event-manager/team/insights` | Only image with invented sidebar — ignored per shell rule; content region reproduced 1:1. |
| 10 | (10) | Open Roles & Staffing Requests | `/event-manager/team/staffing-requests` | Tabs: Open Roles / Staffing Requests / Filled Roles / All Roles. |

### Tab set reconciliation (profile sub-tabs)

The three profile images show three *different* tab orders/sets:

- (5) Grace Williams — Overview, Roles & Skills, Schedule, Assignments, Documents, Notes, Activity, Payroll / Commercial, Settings
- (6) Olivia Bennett (schedule) — Overview, Schedule, Availability, Assignments, Skills & Roles, Time Off, Activity, Documents
- (7) Olivia Bennett (roles) — Overview, Workload, Availability, Roles & Skills, Performance, Documents, Activity Log

Per build brief §5, the canonical tab set is fixed (Overview, Workload,
Schedule, Availability, Assignments, Roles & Skills, Time Off, Performance,
Documents, Notes, Activity, Payroll / Commercial, Settings) and every profile
page renders the same tab bar; only the active tab differs per screen. The
per-image variations are treated as generation artefacts, not intentional
per-person tab sets.

## Per-screen measurements & content notes

### 1 — Workload Gantt
- H1 "Team & Staffing", subtitle "Workload across the team, who is available, and who is out of office", primary CTA "Add Availability" top-right.
- Page tabs: Workload (active) | Availability.
- KPI strip: 6 cards — Team Members (48), Events Staffed (17, "this week"), Overloaded (3, "3 members"), Active Out-of-Office (4, "4 members"), Total Hours This Week (1,246h, "+8% vs last week"), Open Role Gaps (6, "6 unfilled shifts"). Icon-in-tinted-square top-left of each card, value large, sublabel small grey.
- Toolbar row: date range `< May 19 – May 25, 2025 >` with calendar icon, Week/2 Weeks/Month segmented control, All Roles / All Event Types / All Locations / Availability: All / All Skills dropdowns, "More filters", "Saved views".
- Left frozen column: avatar + name + role/skill chips + workload status pill (Balanced/High/Overloaded/Light/Unavailable) + "Xh / 40h" capacity fraction + thin progress bar under it.
- Timeline: day columns Mon–Sun with per-day capacity header (e.g. "8h", "0h" for Sat/Sun), vertical "Today" dashed line + pill marker, coloured assignment blocks (green=confirmed, orange=tentative/hold, red=overallocated, blue=travel/setup, grey=out-of-office/unavailable) each showing event name, time range, location, role.
- Right rail: "Workload Balance" (donut: Light/Balanced/High/Overloaded counts+%), "Understaffed Shifts" (count badge + list of event/date/role/gap-count, "View all gaps"), "Team Availability Mix" (stacked bar: Available/Tentative/Out of Office %, "View Availability").
- Legend footer: coloured dot + label row (Confirmed, Tentative/Hold, Overallocated, Travel/Setup, Unavailable), "All times shown in local time", zoom control (100%, −/+).

### 2 — Availability Planner
- Same header/KPI-strip chrome as (1) but KPI set differs: Team Members, Events Staffed, Overloaded, Active Out-of-Office, Availability This Week (92%, "+6% vs last week"), Scheduled Leave (7, "7 team members").
- Page tabs: Workload | Availability (active).
- Grid: rows = members (avatar, name, role, location pin), columns = 7 days + "Week Total" column; cells show status word (Available/Tentative/Training/Sick Leave/Holiday/"OOO") + hour count or "All day"; weekend columns show "OOO / All day" pattern in the sample.
- Legend: Available/Tentative/Training/Sick Leave/Holiday/OOO dot-colour key.
- Right rail: "Availability Summary" donut (Available/Tentative/Unavailable %), "Upcoming Leave" list (name, leave type, date range), "Coverage Risks" (count badge + event/date/role, "Low coverage"/"No coverage" red/orange pill), "This Week's Coverage by Role" (role name + fraction "2/2" + progress bar + Fully/Partially/Not-covered legend dots).

### 3 — Team Directory (List)
- H1 "Team Members", subtitle "Manage your staffing network, roles, skills and availability", CTA "Add Team Member" top-right.
- KPI strip (5 cards): Total Team Members (48), Active This Week (42, "+12% vs last week"), Available Now (18, "37% of team"), Pending Compliance (7, "Require attention"), Average Utilisation (78%, "+6% vs last week").
- Toolbar: search input, filter funnel icon, All Roles / All Departments / All Locations / All Statuses / All Skills dropdowns, More filters, Saved views, list/card view-toggle icons, export/download icon far right.
- Table columns: checkbox, Team Member (avatar+name+location), Role (title + skill chips), Department, Locations/Coverage, Status pill, Availability (dot+label+hours), Utilisation (% + progress bar), Next Assignment (event+date), Compliance (icon+status), Actions (kebab).
- Pagination footer: "Showing 1 to 8 of 48 members", numbered pager, "Show 10 per page" selector.
- Right rail: "Team by Role" donut (5 categories with counts+%), "Recently Updated Profiles" list (avatar, name, role, change description, relative time, coloured dot), "View all updates" link.

### 4 — Team Directory (Cards)
- H1 "Team & Staffing", same subtitle text as (1) — reused hero pattern, confirms Directory is the same top-level "Team & Staffing" landing group as Workload/Availability, with its own KPI set: Team Members, Open Roles, Total Capacity (1,246h), Average Utilization, Overloaded, Out of Office.
- Tabs row this time literally reads "Team Directory | Availability" (2-tab variant — a generation artefact; treated per canonical 6-tab shared nav, see brief §5).
- Toolbar: search, filter icon, All Roles/All Locations/All Skills/Availability:All/All Compliance dropdowns, More filters, Card/List toggle (Card active), Sort by, Saved views.
- Cards (4-column grid, 12/page): avatar w/ presence dot, kebab menu, name, role, location pin, skill chips (+N overflow), "RATE/TYPE" line, "AVAILABILITY" status pill, "CURRENT LOAD" fraction + progress bar, "NEXT EVENT" date+name, "COMPLIANCE" chip row, footer buttons Message / View Profile / Schedule.
- Bottom legend: Balanced/Light/High/Overloaded/Unavailable colour key.
- Right rail: "Role Mix" donut, "Availability Split" donut, "New Joiners" list (name, role, join date), "Recently Active" list (name, action, relative time).
- Floating Copilot bubble bottom-right (purple circle, sparkle icon) — present on every screen except profile detail pages in this set; keep consistent with the real GalaCopilot bubble already in the shell.

### 5 — Member Profile Overview (Grace Williams)
- Breadcrumb "Team & Staffing > Team Members > Grace Williams".
- Header: large circular avatar, name + "Active" green pill, role subtitle, email/phone/location icon-rows, right-side meta (Local Time, Availability, Member Since), action buttons Edit Profile / Assign to Event / Message / More.
- Tab bar (9): Overview (active), Roles & Skills, Schedule, Assignments, Documents, Notes, Activity, Payroll / Commercial, Settings.
- Card grid row 1: Personal Details (edit icon), Emergency Contact (edit icon), Skills Summary (progress bars per skill + level word, "View all skills (N)"), Employment Details (edit icon).
- Card grid row 2: Preferences (edit icon), Weekly Capacity (mini day-by-day bar chart + legend), Upcoming Assignments (date-chip rows + status pill, "View all"), Compliance Snapshot (icon rows + status pill, "View all").
- Bottom-width card: Performance Summary — big rating number + stars + review count, Key Strengths chips, Recent Feedback quote block, Last Review date + "View all reviews".

### 6 — Member Schedule (Olivia Bennett)
- Breadcrumb "Team & Staffing > Team Members > Olivia Bennett".
- Header: avatar w/ presence dot, name + Active pill, role + skill chips subtitle, meta row (Joined date, location, email), right meta (Role & Skills, Default Location, Standard Capacity, Manager w/ avatar), Actions dropdown + Message button.
- Tab bar: Overview, Schedule (active), Availability, Assignments, Skills & Roles, Time Off, Preferences, Activity, Documents.
- Section header "Schedule" + subtitle, action buttons "Add Availability"/"Assign Shift".
- Controls row: date range, This Week/2 Weeks/Month, View: Week dropdown, Group by: None dropdown, "Recurring Schedule" summary chip + Edit.
- KPI mini-strip (4): Total Capacity 40h, Scheduled 36h(90%), Tentative 2h(5%), Unavailable 2h(5%).
- Calendar grid: hour rows (8AM–6PM) × day columns, all-day row on top, coloured event blocks (green=confirmed, orange/red-outline=tentative, blue=internal, red=out-of-office, hatched grey=unavailable), current-time vertical line, drag-handle affordance dots, lock icon on non-editable unavailable blocks.
- Legend + "Tip: Drag to move, resize from bottom-right corner, or click to edit" + zoom control.
- Right rail: Weekly Capacity donut, Upcoming Events list, Travel/Setup Windows list (+Add), Scheduling Conflicts card (warning row + "Resolve" button).

### 7 — Member Roles & Skills (Olivia Bennett)
- Breadcrumb-less compact header variant: avatar, name + Active pill + verified badge + small shield icon, role subtitle, member-ID chip "TM-10048", email/phone/local-time meta row, "Back to Team" + Message + "Edit Profile" (dropdown chevron) buttons.
- Tab bar: Overview, Workload, Availability, Roles & Skills (active), Performance, Documents, Activity Log.
- 3-column card grid: Primary Role / Secondary Roles (+Add Role) / Regions Covered (+Add Region) / Availability Preferences / Rates (Day/Hour/OT rate rows, "Billable" chip, "View rate history") in col 1; Role History (timeline dots) / Licenses & Certifications (status pill: Valid/green, "Expiring Soon"/orange) in col 2; Core Skills (progress bars), Language Skills (progress bars), Software Knowledge (progress bars) in col 3.
- Below: 4-card row — Experience (years/events/types/avg size stat block), Training Records (list + status pill), Documents (file rows + kebab), Recommended Assignments (event rows + match % pill, "View all").
- Footer strip: Compliance Status legend dots (Compliant/Expiring Soon/Expired), "Last updated by … " audit line, lock icon + "Private profile. Only visible to authorized team members."

### 8 — Find Team Members
- H1 "Find Team Members", subtitle "Search by role, skills, area, and availability to find the right people for your events.", right-side "Saved Searches" dropdown + "Clear all" + "Save Search" button.
- Left filter rail (collapsible, "Hide" toggle): free-text search, Role, Seniority, Department, Location/Area, Travel Radius (slider + presets 10/25/50/100/200mi), Availability, Languages, Certifications, Day Rate min/max, Employment Type, "More filters" expand.
- Results header: "Results (128)", active filter chips w/ remove ×, "Clear all", List/Card toggle, Sort by dropdown.
- Table: Team Member, Coverage Area, Core Skills chips, Availability (dot+label+hrs/week), Utilisation (radial % gauge + "Booked" label), Next Available (date + "in Nd"), Rating (star+count+badge word), Actions (View Profile / Assign / Shortlist buttons stacked).
- Pagination: "Show 25", "Showing 1–25 of 128 results".
- Bottom tip bar: lightbulb icon tip text + "Need help finding talent? Request Sourcing Support →".
- Right rail: Shortlist panel (count badge, avatar rows w/ remove ×, "View Shortlist" button), Coverage & Availability map card (radius circle over city map, expand icon, "128 Available in area" + distance-band legend with counts, "View on Map").

### 9 — Team Insights
- H1 "Team Insights", subtitle "Real-time capacity, performance, and staffing insights across your organization", right-side date-range picker + Filters button.
- KPI strip (6): Total Scheduled Hours (1,246h), Utilisation Rate (78%), Overtime Hours (72h), Cost This Month ($318,540), Average Event Coverage (92%), Open Staffing Gaps (24).
- Row 2 (4 cards): Utilisation by Department (ranked bar list w/ trend arrows), Workload Distribution (donut by department), Availability Mix (donut Available/Tentative/Unavailable), Recommended Actions (icon-tile rows w/ link).
- Row 3 (4 cards): Upcoming Staffing Risks (table: event/date/risk-pill/gap), Team Coverage by Region (world-map dots + legend w/ hrs), Role Demand vs Supply (table: role/demand/supply/gap/status-pill), Staffing Alerts (count badge + icon rows).
- Row 4 (3 cards): Overtime Trend (line/area chart w/ risk-colour legend), Top Performers (table: member/utilisation/rating/events/feedback), Upcoming Expiring Certifications (table: member/cert/expires/days-left) — plus **Insights Summary** narrative card (AI-style paragraph) — must be explicitly labelled as AI-generated per brief §16/§601.

### 10 — Open Roles & Staffing Requests
- H1 "Open Roles & Staffing Requests", subtitle "Identify, review, and fill event staffing gaps to keep every event fully covered.", CTA "New Staffing Request".
- Tabs: Open Roles (active), Staffing Requests, Filled Roles, All Roles.
- KPI strip (5): Open Roles (48), Urgent Requests (12), Filled This Week (23), Pending Confirmations (15), Average Fill Time (18h).
- Toolbar: search, All Events/All Roles/All Locations dropdowns, date range, All Urgency/All Status dropdowns, More filters, Saved views.
- Table: event thumbnail+name+date, Role Needed + category chip, Date & Time, Location, Qty Req., Urgency pill (Urgent/High/Medium/Normal, coloured dot), Status (needed-within text or Open), Shortlist (count + "N new"), Assigned Lead (avatar+name), Actions (View button + kebab).
- Pagination: "Showing 1 to 7 of 48 results".
- Right rail: Fill Rate donut (Filled/In Progress/Open/Cancelled + %), Candidate Pipeline funnel list (New/Screening/Shortlisted/Interviewing/Offered/Confirmed counts, "View pipeline"), Upcoming High-Risk Events (warning icon rows, "N roles at risk", "View all at-risk events").

## Image-generation artefacts NOT to reproduce

- Invented left sidebar in image (9) — replaced by real `AppSidebar`.
- Inconsistent profile tab sets/order across (5)/(6)/(7) — normalized to one canonical tab bar per brief §5.
- Two different "Team & Staffing" hero copy variants reused verbatim across (1)/(4)/(6) — kept as shared hero text for the relevant tab group, not duplicated ad hoc.
- Placeholder numeric coincidences (e.g. "1,246h" appearing identically in Workload KPI and Insights KPI) are treated as intentional cross-screen consistency, not an artefact — the same live aggregate should genuinely produce the same number on both screens.
- Minor label inconsistency "Card / List" vs "List / Card" toggle ordering — standardize on List-first (matches directory list being the default/canonical view per route redirect rules).
- Any AI-drawn avatar photos are placeholders only; real seed data must not imply real photographed people — use the project's existing avatar/initial-fallback pattern instead of these generated faces.
