# Supplier Section — Reference Image Map

Source folder: `working_imagesS_suppliers/`
All 7 images opened and visually inspected. Verified mapping (differs slightly from the
prompt's guessed ordering — confirmed by reading each image directly):

| # | Filename | Route / view | Primary tab | Status tab |
|---|----------|---------------|-------------|------------|
| 1 | `ChatGPT Image Jul 10, 2026, 11_35_18 PM (1).png` | `/event-manager/suppliers?view=all` | Suppliers | All Suppliers |
| 2 | `ChatGPT Image Jul 10, 2026, 11_35_20 PM (2).png` | `/event-manager/suppliers?view=paused` | Suppliers | Paused |
| 3 | `ChatGPT Image Jul 10, 2026, 11_35_20 PM (3).png` | `/event-manager/suppliers?view=archived` | Suppliers | Archived |
| 4 | `ChatGPT Image Jul 10, 2026, 11_35_20 PM (4).png` | `/event-manager/rfqs` | RFQs | All RFQs |
| 5 | `ChatGPT Image Jul 10, 2026, 11_35_21 PM (5).png` | `/event-manager/suppliers?view=active` | Suppliers | Active |
| 6 | `ChatGPT Image Jul 10, 2026, 11_35_21 PM (6).png` | `/event-manager/suppliers?view=missing-documents` | Suppliers | Missing Documents |
| 7 | `ChatGPT Image Jul 10, 2026, 11_35_22 PM (7).png` | `/event-manager/suppliers?view=recently-used` | Suppliers | Recently Used |

This differs from the prompt's guessed mapping — images 4 and 6 in particular were
reassigned after visual inspection (image 4 is RFQs, not Missing Documents; image 6 is
Missing Documents, not Active).

## Shared header (all 7 screens)

- Left sidebar: navy, Gala Dock logo, EVENTS / SUPPLIERS / OPERATIONS / FINANCE groups.
  "Suppliers" and "RFQs" both live under a **Suppliers** sidebar group with `RFQs` as a
  sibling item (not a page tab) — the primary Suppliers/RFQs tab pair sits inside the page
  header itself, directly under the H1.
- Topbar: global search (⌘K), Create, Copilot, notifications (badge count), help, user menu.
- Page header: H1 "Suppliers" / "RFQs", one-line subtitle, action row right-aligned:
  `Send Onboarding Invite` (Suppliers) / `Send RFQ Invite` (RFQs), `Filter`, `Import`,
  `Export`, primary CTA button (`+ Add Supplier` / `+ New RFQ`) in brand purple.
- Primary tabs: `Suppliers | RFQs` — underline-style, directly below H1/subtitle row.
- Status tab strip (Suppliers only) / RFQ status strip (RFQs): pill-style counts baked into
  each tab label, active tab has brand-purple underline + text, count is a small muted
  numeral to the right of the label.
- KPI row: 6–7 white cards, icon top-left in tinted rounded square, label uppercase small
  muted, big bold value, small delta line ("↑ 12% vs last month").
- Toolbar row: search input (icon-prefixed) + up to 4 dropdown filters + "More filters"
  (badge with active count) + Saved views selector + bookmark icon, all right-aligned after
  search.
- Main table: white card, border, subtle header row (uppercase 11px muted), row hover,
  avatar/logo left of primary entity cell, action icons/menu on the right.
- Right insight rail: fixed ~280px column, 4 stacked cards, each with a title + "View all"
  link, donut/bar/line chart or activity list.
- Pagination footer: "Showing X to Y of Z", page number pills, rows-per-page selector.

## Per-image detail

### Image 1 — All Suppliers
- KPIs (7): Total Suppliers, Active Suppliers, Paused, Missing Documents, Insurance
  Expiring Soon, Avg Response Rate, Avg Lead Time.
- Filters: search, Category, Location, Compliance, More Filters (badge "2"), Saved views
  (Default View), bookmark.
- Table columns: Supplier (logo+name+rating), Primary Contact (name/email/phone stacked),
  Category (+coverage tier chip: Premium/Preferred/Verified), Coverage (region text),
  Onboarding (circular % ring), Documents (Complete/Missing chip + "x/y" fraction),
  Insurance Expiry (date + "in N days"/"Expired"), Response Rate (% + inline sparkline),
  Recently Used (star toggle), Last Booked (date), Actions (mail icon + kebab menu).
- Right rail: Supplier Health (donut: Healthy/At Risk/Expired/Incomplete), Top Categories
  (horizontal bars), Recent Activity (avatar+text+timestamp feed), Compliance Snapshot
  (big % + mini bar sparkline).
- Demo total shown: 248 suppliers, 186 active, 12 paused, 27 missing docs.

### Image 5 — Active Suppliers
- KPIs (6): Active Suppliers, Fully Onboarded, Complete Documents, Insurance Current, Avg
  Response Rate, Avg Lead Time.
- Same table shape as Image 1, filtered to `status = active` only. Coverage filter added.
- Right rail: Supplier Health, Category Mix (renamed from Top Categories), Recent Activity,
  Compliance Snapshot.
- **Inconsistency**: image shows 428/312 active suppliers vs. 248/186 in image 1's "Active"
  status-tab count. Not reproduced — the demo seed uses one coherent total (from image 1:
  248 total / 186 active) and every screen's KPI is calculated live from it.

### Image 2 — Paused Suppliers
- KPIs (6): Total Suppliers, Active Suppliers, Paused Suppliers, Missing Documents,
  Insurance Expiring Soon, Avg Response Rate.
- Filters add: Pause Reason dropdown.
- Table columns: Supplier, Primary Contact, Pause Reason (chip + subtext reason detail),
  Paused On (date + "N days ago"), Last Used (date + "N days ago"), Compliance (ring % +
  "x/y" docs, "Missing Docs" chip when incomplete), Notes/Alerts (icon + short text),
  Actions (`Reactivate` button + kebab).
- Right rail: Pause Reasons (donut), Dormant Suppliers (list with day counts, sorted desc),
  Reactivation Opportunities (list with fit badge: High/Medium fit), Recent Admin Actions
  (avatar+action+timestamp).

### Image 3 — Archived Suppliers
- KPIs (6): Total Archived, Archived This Month, Avg Time to Archive, Can Be Restored,
  Permanently Expired, Data Retention (static policy duration, not a count).
- Filters: Archived Date, Reason, Category, Can Be Restored.
- Table columns: Supplier, Previous Category (+former tier chip), Archived Date (+ "N days
  ago"), Reason (bold reason + light subtext detail), Archived By (avatar+name+role),
  Can Be Restored (✓/✗ Yes/No), Retention Until (date + "N years left"), Last Activity
  (date), Actions (`Restore` button + kebab).
- Right rail: Archive Reasons (donut), Archived Over Time (12-month line chart), Retention &
  Deletion (policy card: retention years, auto-delete toggle state, deletions in last 12mo,
  next scheduled deletion date), Recent Archive Activity (avatar+action+timestamp).

### Image 6 — Missing Documents
- KPIs (6): High Risk Suppliers, Overdue Documents, Expiring in 30 Days, Total Missing
  Documents, At-Risk Contract Value (£), Compliance Score (%).
- Filters: Document Type, Risk Level, Due Date, Location, Contact Owner, More Filters.
- Table columns: Supplier (+coverage subtext), Missing Documents (stacked red chips, "+N
  more" overflow), Highest Risk (dot + label: High/Medium/Low, "Compliance risk" subtext),
  Due Date (Overdue in red / Due in N days), Progress (ring %), Outreach Status (dot + label
  + "Last chased N days ago" subtext), Last Contact (date), Actions (`Request Docs` /
  `Send Reminder` button depending on state + kebab).
- Right rail: Compliance Risk Overview (donut: High/Medium/Low Risk + Compliant, "N
  suppliers at risk of non-compliance" footer line), Overdue by Document Type (horizontal
  bars), Recent Chaser Activity (icon+text+timestamp), Supplier Health (donut, gauge-style
  center %).

### Image 7 — Recently Used
- KPIs (6): Total Suppliers, Active Suppliers, Recently Used This Month, Avg Response Rate,
  Last-Booked Velocity (days), Repeat Booking Rate (%).
- Filters: Category, Location, Coverage, Performance, More Filters.
- Table columns: Supplier (sort arrow on header), Last Event Used (event name + location,
  date + category subtext), Upcoming Bookings (count + "Next: date"), Recent Spend (90
  Days) (£, bold), Performance Score (ring + label: Excellent/Very Good/Good), Last Booked
  (date + "N days ago"), Event Categories (chips, "+N" overflow), Actions (mail icon +
  kebab).
- Right rail: Recent Supplier Activity (avatar+text+timestamp), Top Booked Categories
  (horizontal bars), Upcoming Event Allocations (event name/date + "N suppliers allocated"),
  Performance Trends (90 days) (big score + line sparkline).

### Image 4 — RFQs
- Status tabs: All RFQs, Draft, Sent, Responses Received, Under Review, Awarded, Closed —
  each with a live count.
- KPIs (7): Total RFQs, Active RFQs, Responses Received, Awarded RFQs, Avg Response Time
  (hrs), Projected Value (£), Estimated Savings (£).
- Filters: search, Event Type, Category, Status, Due Date, More Filters (badge "3"),
  Saved views.
- Table columns: RFQ Title (icon + title + "RFQ-2025-NNN" code), Event (name + date +
  location), Category (chip), Suppliers Invited (count + coverage subtext), Responses
  (count + ring %), Quote Range (£ low – £ high), Due Date (date + "Overdue"/"In N
  days"/"Due today"), Status (chip), Awarded Supplier ("–" until awarded), Actions
  (eye icon + kebab).
- Right rail: Response Analytics (donut: Responded/Pending/Declined/No Response), Award Rate
  (big % + trend line + "N of M RFQs awarded"), Recent Supplier Responses (avatar+text
  +timestamp), Category Demand (list with % share, "This month" label).

## Normalised demo dataset

The reference images carry **inconsistent totals between screens** (e.g. Active Suppliers
shows 428/312 while the All Suppliers screen's own "Active" status tab shows 186). Per the
brief, this is not reproduced. The build uses one relational demo dataset — every KPI, tab
count and insight-rail number on every screen is **derived from that same dataset**, not
hardcoded per screen. Baseline reference values (from Image 1, treated as source of truth):
248 total suppliers / 186 active / 12 paused / 27 missing documents / 23 archived / 63
recently used, and 132 total RFQs (from Image 4).
