# Event Manager Finance — Reference Image Map

Source folder: `working_imagesS_finance/` (note: actual folder name has an extra `S`, differs from the name given in the brief — `working_imagesS_finance`, not `working_images_finance_section`).

Images were generically named by the generator (`ChatGPT Image Jul 11, 2026, 12_39_1X AM (N).png`) and were identified by opening and visually inspecting each one — filenames carry no semantic meaning.

| # | Filename | Finance tab | Route |
|---|----------|-------------|-------|
| 1 | `... (1).png` | Overview | `/event-manager/finance?tab=overview` |
| 2 | `... (2).png` | Wages & Hours | `/event-manager/finance?tab=wages-hours` |
| 3 | `... (3).png` | Quotes | `/event-manager/finance?tab=quotes` |
| 4 | `... (4).png` | Deposits | `/event-manager/finance?tab=deposits` |
| 5 | `... (5).png` | Profit | `/event-manager/finance?tab=profit` |
| 6 | `... (6).png` | Ticket Sales | `/event-manager/finance?tab=ticket-sales` |
| 7 | `... (7).png` | Cashflow | `/event-manager/finance?tab=cashflow` |
| 8 | `... (8).png` | Supplier Payments | `/event-manager/finance?tab=supplier-payments` |
| 9 | `... (9).png` | Invoices | `/event-manager/finance?tab=invoices` |
| 10 | `... (10).png` | Payments | `/event-manager/finance?tab=payments` |

All ten share one shell: `Gala Dock` topbar (logo, global search ⌘K, Create, Copilot, notifications bell w/ count, help, avatar menu), page heading + one-line subtitle, two right-aligned header actions, a horizontal tab strip (Overview / Quotes / Invoices / Payments / Profit / Ticket Sales / Deposits / Supplier Payments / Wages & Hours / Cashflow), a row of 5–6 KPI cards (icon chip, label, value, comparator delta, sparkline), a two/three-column body (main content + a narrower right "insights" rail on most screens), a table below, and a footer strip (`All amounts in GBP` · `Data as of …` · refresh icon) on data-heavy screens.

## Per-screen breakdown

### 1. Overview
- Actions: New Quote, New Invoice
- KPIs: Total Invoiced, Total Paid, Outstanding, Overdue, Gross Profit, Margin
- Body: Revenue vs Payments (area/line, period selector) · Quote Pipeline (donut + legend + 4 stat chips) · Recent Invoices (table, "View all")
- Row 2: Outstanding Payments (table) · Ticket Revenue by Event (bar) · Supplier Costs by Event (bar) · Deposit Milestones (progress bars)
- Row 3: Cashflow Forecast (bar+line combo) · Profit by Event (table)
- Footer: currency + timestamp + refresh

### 2. Wages & Hours
- Actions: Add Timesheet, Run Payroll
- KPIs: Scheduled Hours, Actual Hours Logged, Wage Cost, Overtime Cost, Avg Hourly Cost, Unapproved Timesheets
- Toolbar: search team member, Team, Role, Event, Status, Pay Period (date range), Owner, Saved Views
- Body: Staffing Cost by Event (bar) · Hours by Department (stacked bar: Production/Operations/Front of House/Security/Other) · right rail: Payroll Due card w/ Run Payroll CTA, Top Labour Cost Events, Overtime Alerts, Latest Approvals
- Table: timesheets (ID, Team Member w/ avatar, Role, Event, Scheduled/Actual/Overtime hours, Hourly Rate, Cost, Approval Status, actions) + pagination

### 3. Quotes
- Actions: Create Quote, Export
- KPIs: Total Quotes, Pipeline Value, Sent This Month, Win Rate, Average Margin
- Toolbar: search, Status, Event Type, Owner, date range, Saved Views, Sort
- Right rail: Quote Pipeline (funnel chart), Win Rate by Month (line), Expiring Quotes (Next 14 Days), Top Value Opportunities
- Table: Quote ID, Event/Client, Status badge, Sent Date, Expiry (+ "In N days"), Value, Margin (£ + %), Owner (avatar), Next Action, actions

### 4. Deposits
- Actions: New Deposit, Set Milestone Plan
- KPIs: Total Deposit Value, Paid Deposits, Due Soon (30d), Overdue Deposits, Deposit Coverage %, Avg Deposit Completion %
- Toolbar: search, Event, Deposit Type, Status, Owner, Date Range, Saved Views, Clear filters, Save view
- Table: Deposit ID, Event/Client, Type (icon+label: Client Deposit/Venue Retainer/Bar Deposit/Security Hold/Final Balance Milestone), Total Required, Paid, Balance, Next Due Date, Status badge, Progress bar %, actions
- Right rail: Upcoming Due Deposits, Overdue Exposure (with bar), Largest Deposit Balances, Deposit Completion by Month (bar)
- Row 2: Deposit Milestones by Event (stacked horizontal bar: Paid/Due Soon/Overdue/Scheduled) · Deposit Schedule (Gantt-style timeline)

### 5. Profit
- Actions: Export Report, Compare Events
- KPIs: Gross Revenue, Supplier Costs, Gross Profit, Margin, Average Event Margin, High Margin Events (count)
- Body: Margin Trend (line + avg dashed) · Revenue vs Cost by Event (grouped bar) · Profit Bridge (waterfall: Revenue → Less Supplier Costs → Less Wages Costs → Less Other Costs → Gross Profit)
- Right rail: Event Margin Ranking (list w/ bars), Cost Composition donut (Supplier/Wage/Other %), Margin Erosion Alerts
- Table: Profit by Event (Event, Revenue, Supplier Costs, Wage Costs, Other Costs, Gross Profit, Margin) with totals row + Top Profitable vs Low Margin Events split table

### 6. Ticket Sales
- Actions: Create Ticket Tier, Open Box Office
- KPIs: Tickets Sold, Gross Sales, Net Revenue, Conversion Rate, Avg Order Value, Refund Rate
- Toolbar: search orders/buyers/events, All Events, All Channels, All Ticket Tiers, date range, All Statuses, Saved Views
- Body: Sales Trend (Gross vs Net line) · Ticket Sales by Event (bar, qty) · Revenue by Ticket Tier (donut: VIP/GA/Early Bird/Premium/Group)
- Right rail: Best Performing Events, Ticket Tier Mix (stacked bar), Channel Split (donut: Website/Mobile App/Partner Sites/Box Office), Recent Ticketing Alerts
- Table: Recent Orders (Order ID, Event, Buyer, Ticket Tier, Qty, Gross, Fees, Net, Status)

### 7. Cashflow
- Actions: Export Forecast, Scenario Plan
- KPIs: Forecast Inflow, Forecast Outflow, Net Position, Cash Runway (weeks + health badge), Due in 30 Days, Committed Costs (+ progress bar of % of outflow)
- Toolbar: Date Range, Event, Scenario (Base/Conservative/Upside), Owner, Saved Views, Refresh
- Body: 12-Week Cashflow Forecast (bar inflow/outflow + net line, weekly/monthly toggle) · Due Obligations (tabs: All/Receipts/Payments; Date, Type, Description, Event/Supplier, Amount)
- Row 2: Cashflow by Event (table w/ inflow/outflow/net/net% bar) · Scenario Comparison (metric rows × Base/Conservative/Upside columns)
- Right rail: Liquidity Alerts, Biggest Upcoming Payments, Biggest Expected Receipts, Weekly Net Trend (sparkline+value)

### 8. Supplier Payments
- Actions: Add Supplier Bill, Batch Pay
- KPIs: Supplier Bills Outstanding, Approved to Pay, Paid This Month, Overdue Supplier Bills, Average Payment Time
- Toolbar: search bills, Supplier, Event, Category, Approval Status, Due Date, Payment Status, Saved Views, Sort
- Table: Bill ID, Supplier (logo chip), Linked Event, Category badge, Issue Date, Due Date (+ overdue/due-in flag), Amount, Approval Status badge, Payment Status badge, Owner (avatar), actions
- Right rail: Payables Aging (0-30/31-60/61-90/90+ bars + total), Spend by Supplier Category (donut), Upcoming Payouts, Approval Bottlenecks (per-approver bar)

### 9. Invoices
- Actions: New Invoice, Export
- KPIs: Total Invoiced, Total Paid, Outstanding, Overdue, Collection Rate, Avg Days to Pay
- Toolbar: search, Status, Event, Client, Aging, Owner, Date Range, Saved Views, Sort
- Table: Invoice ID (icon), Client/Event, Issue Date, Due Date, Amount, Amount Paid, Balance, Status badge, Owner (avatar), actions
- Right rail: Aging Summary donut (0-30/31-60/61-90/90+), Collections Trend (area), Overdue Invoices list, Payment Activity feed

### 10. Payments
- Actions: Record Payment, Reconcile
- KPIs: Payments Received This Month, Pending Reconciliation, Failed/Refunded, Average Time to Pay, Card vs Bank Split (%)
- Toolbar: search, Method, Status, Client, Event, Reconciliation, Date Range, Saved Views, Sort
- Table: Payment ID, Linked Invoice, Client/Event, Method (icon: card/bank/Stripe/cash), Received On, Amount, Fees, Net, Status badge, Reconciliation badge, actions
- Right rail: Payments by Method (donut), Cash Received Trend (area), Unreconciled Payments list, Recent Payment Activity feed

## Cross-image consistency notes

- All 10 use one coherent event roster: Tech Summit 2026, Theatre Gala Night, Summer Beats Festival, Club Vibe NYE, AI in Marketing Webinar, Carter Wedding, plus a few extra long-tail events (Corporate Awards 2026, Wedding Showcase, Food & Drink Expo, Vision AV Roadshow, Product Launch London) that appear mainly in Profit/Invoices.
- Figures are **not** perfectly cross-consistent between screens (e.g. Overview's "Total Invoiced" £412,650 vs Invoices tab's £612,840 vs Profit's Gross Revenue £1,286,450) — these are independent AI-generated mockups on different implied date ranges/filters. We will not try to reproduce contradictory numbers; instead we build one relationally valid seed dataset in GBP and let every screen calculate its own KPI/aggregate from real linked records. Visual layout, structure and interaction fidelity is the pixel target — not literal digit-matching against inconsistent mockup totals.
- Currency throughout is GBP with `£` prefix, thousands separators, 2dp.
- Status badge color language is consistent: green = paid/approved/good, amber = pending/due soon/part-paid, red = overdue/failed/rejected, blue = sent/informational, purple = draft/neutral/brand accent.
