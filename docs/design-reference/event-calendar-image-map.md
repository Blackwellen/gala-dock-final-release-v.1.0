# Event Calendar — Design Reference Image Map

Source folder: `working_imagesS_event_calendar/`

## Image 1 → Month View
**File:** `ChatGPT Image Jun 30, 2026, 12_07_33 PM (1).png`
**Route:** `/event-manager/calendar?view=month&date=2026-06-01`

Key design elements:
- Deep navy sidebar, Calendar active (indigo-600 pill), workspace = "Grannit Holdings"
- White content area, H1 "Calendar", subtitle
- Stats strip top-right: "42 items this month / 18 events • 12 tasks • 8 bookings • 4 run sheets"
- Toolbar: ← → | "June 2026" | Today | [All Items▾] [•Event] [•Run Sheet] [•Booking] [•Task] [More Filters] | [Calendar | Agenda] [Month | Week | Day]
- 7-column Mon→Sun grid, 6 week rows
- Day cells: date number (today = indigo circle), compact event cards (time + title + badge + owner avatar)
- Image cards: thumbnail right-aligned for Theatre/Nightclub/Gala events
- Multi-day banner spanning Jun 15–21 (full row): city-skyline photo BG, "Pulse Summit & After Dark 2026", venue, Corporate badge, avatar row +4
- Right panel (280px): Month At A Glance (4 icon-counts), Upcoming Highlights (4 event cards), Team Schedule (4 people + progress bars)

Items visible by date:
- Jun 1: Supplier Coordination Call (Booking)
- Jun 2: Venue Walkthrough (Booking)
- Jun 3: Investor Webinar (Webinar)
- Jun 4: Run Sheet Review (Run Sheet)
- Jun 6: Private Party (Event)
- Jun 8: Compliance Check (Task)
- Jun 9: Menu Finalisation (Task)
- Jun 10: Invoices Due (Finance)
- Jun 11: Theatre Gala Night + image (Theatre)
- Jun 12: Press Preview + image (Event)
- Jun 13: After Dark + image (Nightlife)
- Jun 15–21: **MULTI-DAY BANNER** Pulse Summit & After Dark 2026
- Jun 22: Sustainability Report (Task)
- Jun 23: AV Load-in (Run Sheet)
- Jun 24: Gala Dinner + image (Event)
- Jun 25: Supplier Final Balance (Finance)
- Jun 26: Food Festival 2026 + image (Festival)
- Jun 29: Post-Event Survey (Task)
- Jun 30: Debrief Meeting (Event)

## Image 2 → Agenda View
**File:** `ChatGPT Image Jun 30, 2026, 12_07_33 PM (2).png`
**Route:** `/event-manager/calendar?view=agenda&date=2026-06-09`

Key design elements:
- Same shell, Agenda switch active, date label "Jun 9 – Jul 6, 2026" with ▾
- "Sort by: Date & Time" dropdown
- Grouped list by day with count badge
- Column headers: Time | Venue / Platform | Owner | Status
- Each row: [Date tile] [Thumbnail or icon] [Title + subtitle + badge] [Time] [Venue] [Owner avatar+name+role] [Status badge] [... menu]
- Right panel: Agenda Summary donut (42 total: 18 events, 12 tasks, 8 bookings, 4 run sheets + 5 due today, 2 overdue), Upcoming Highlights, Team Load next 7 days, Overdue/Needs Attention

Rows visible:
**Today • Monday, June 9 (4)**:
1. Pulse Summit & After Dark 2026 / Corporate image / 9:30 AM–5:30 PM / Riverside CC Main Hall / Jane Cooper Event Manager / In Progress
2. Compliance Check / Q2 Audit / task icon / 9:30–11:00 AM / — / Cody Fisher Ops Lead / Due Today
3. Menu Finalisation / Gala Dinner / doc icon / 12:00–1:00 PM / Gala Dock HQ / Darrell Steward Producer / Due Today
4. Run Sheet: Pulse Summit / Daily Run Sheet / RS icon / All day / Riverside CC / Esther Howard Logistics / Published

**Tuesday, June 10 (2)**:
1. Wedding Tasting / Harrison & Lee / food image / 11:00 AM–1:00 PM / The Loft Private Dining / Leslie Alexander Sales Mgr / Confirmed
2. Invoices Due / 3 Invoices / finance icon / All day / — / Cody Fisher / Due Today

**Wednesday, June 11 (3)**:
1. Theatre Gala Rehearsal / Grand Opera House / theatre image / 7:00–10:00 PM / Grand Opera House Main Stage / Esther Howard / Scheduled
2. After Dark Club Night / VIP Afterparty / dark image / 8:00 PM–2:00 AM / The Loft Nightclub / Darrell Steward / Confirmed
3. Press Preview Run Sheet / Grand Opera House / RS icon / All day / Grand Opera House / Jane Cooper / Draft

## Image 3 → Week View
**File:** `ChatGPT Image Jun 30, 2026, 12_07_34 PM (3).png`
**Route:** `/event-manager/calendar?view=week&date=2026-06-16`

Key design elements:
- Date range "Jun 16 – Jun 22, 2026", Week active
- All-day row: Pulse Summit banner (Mon-Thu/Fri), Food Festival (Fri-Sat), Theatre Gala Night (Sat)
- Time grid 7:00 AM – 11:00 PM, 7 columns (Mon 16 – Sun 22)
- Dense event blocks: color-coded by type, positioned by absolute time
- Some blocks have thumbnail images
- Right panel: Today's Highlights (5 events, 4 RS checkpoints, 3 tasks due, 2 supplier deliveries), Team Availability (4 people + %, "View full team schedule"), Upcoming Deadlines (3 items), Resource Bookings (3 venues + "View all bookings")

Time blocks per day (representative):
Mon 16: Run Sheet Checkpoint 7:30, Venue Walkthrough 8:00, Supplier Coordination Call 9:00, Executive Briefing 11:00, Task: Marketing Assets 2:00, Finance: Budget Review 3:00, Run Sheet: Load-in Plan 5:00, Welcome Reception 7:00
Tue 17: AV Equipment Confirmation 7:00, Venue Walkthrough 8:00, Webinar Rehearsal 10:00, Catering Tasting 1:00, Speaker Deck Review 2:30, Run Sheet: Stage Plot 4:00, Finance: Sponsor Invoicing 6:30, Networking Drive 8:00
Wed 18: Run Sheet Checkpoint 7:00, Supplier Check-in Call 9:30, Run Sheet Rehearsal Checkpoint 11:30, Security Briefing 1:30, Investor Webinar 3:30, Gala Dinner 6:30
Thu 19: Venue Tech Walkthrough 8:00, Finance: Final Budget Sign-Off 10:00, Run Sheet: Opening Session Check 12:00, Theatre Gala Dress Rehearsal 2:00, Talent Call Time 5:30, After Dark Launch 7:00, Gala Rehearsal 8:00, After Party Set Up 10:30
Fri 20: Run Sheet: Day of Ops Brief 7:00, Festival Ops Brief 9:00, Food Festival Opens 2:00, Vendor Check-In 5:00, Headline Set 8:00
Sat 21: Cast Call Time 9:00, Matinee Show 12:30, Gala Performance 5:00, Closing Night Party 8:00

## Image 4 → Day View
**File:** `ChatGPT Image Jun 30, 2026, 12_07_34 PM (4).png`
**Route:** `/event-manager/calendar?view=day&date=2026-06-18`

Key design elements:
- "Thursday, June 18 2026" with calendar icon, Day active
- 5 operational lane columns + time axis
- Time axis 7 AM – 12 AM (midnight) on far left
- Right panel: main event card (Pulse Summit image, date, location, owner, 4 metrics), Upcoming Guests (3 people), Team on Duty (3 people), Open Tasks donut (12 remaining, 8 overdue, 6 due today, 10 upcoming), Quick Add (Event, Task, Run Sheet, Booking, Note)

Columns:
1. **MAIN EVENT** / Pulse Summit & After Dark 2026
   - 7:00–8:30: Keynote Stage Setup
   - 9:00–9:30: Registration Opens
   - 10:15–11:00: Opening Keynote
   - 11:15–12:00: Breakout Session A
   - 12:00–1:30: VIP Lunch & Networking
   - 1:45–2:30: Breakout Session B
   - 2:45–3:30: Panel Discussion
   - 4:00–4:45: Closing Keynote
   - 5:30–6:30: Livestream Rehearsal
   - 7:00–8:00: Guest Check-In & Welcome
   - 8:00–9:00: Theatre Gala Show
   - 9:15–10:45: After Dark Club Set
   - 11:00–12:00: Post-Event Debrief

2. **TASKS** / Operational Tasks
   - 7:00: Confirm AV run sheet ✓
   - 8:00: Final signage check ✓
   - 9:00: Registration desk ready
   - 10:30: Speaker green room check
   - 12:00: VIP lunch seating plan
   - 1:00: Room turnover A→B
   - 3:15: Prepare closing remarks
   - 5:00: Livestream tech check
   - 6:15: After dark setup complete
   - 7:00: Guest experience check
   - 10:45: Post-event clean down ✓
   - 11:30: Debrief & feedback capture

3. **SUPPLIERS** / Deliveries & Services
   - 5:30–8:30: AV Crew Arrival (Sound & Vision Pro)
   - 8:00–9:00: Catering Delivery (Gala Catering Co.)
   - 8:30–10:00: Floral Installation (Bloom & Co.)
   - 9:00–11:00: Registration Tech Setup (EventTech Solutions)
   - 11:30–1:00: VIP Lunch Service (Gala Catering Co.)
   - 2:00–4:00: Photography & Video (Frame & Focus)
   - 4:30–6:00: Stage Reset Crew (StagePro Services)
   - 6:00–8:00: Dinner Service Prep (Gala Catering Co.)
   - 8:30–11:00: Bar & Beverages (Premium Pour)
   - 10:30–12:00: Strike & Load Out (StagePro Services)

4. **TEAM** / On Duty
   - 6:00–2:00: Morning Ops Crew (8 members)
   - 8:00–4:00: Production Team (12 members)
   - 9:00–5:00: Event Managers (4 members)
   - 2:00–10:00: Evening Ops Crew (10 members)
   - 6:00–12:00: After Dark Crew (9 members)
   - 10:00–1:00: Night Wrap Crew (6 members)

5. **VENUE BOOKINGS** / Spaces & Resources
   - 6:00–7:00: Grand Ballroom (Main Stage & Seating)
   - 7:00–5:00: Riverside Hall A (Breakout Room)
   - 7:00–5:00: Riverside Hall B (Breakout Room)
   - 9:00–6:00: Registration Lobby (Check-In Area)
   - 12:00–2:00: Skyline Suite (VIP Lunch)
   - 5:00–11:00: Grand Ballroom (Dinner & After Dark)
   - 8:30–12:00: The Loft (After Dark Club)

## Badge Colour System

| Type | Background | Text | Border |
|------|-----------|------|--------|
| Event | blue-50 | blue-700 | blue-200 |
| Run Sheet | brand-50 | brand-700 | brand-200 |
| Booking | green-50 | green-700 | green-200 |
| Task | amber-50 | amber-700 | amber-200 |
| Finance | red-50 | red-700 | red-200 |
| Webinar | violet-50 | violet-700 | violet-200 |
| Theatre | purple-100 | purple-800 | purple-200 |
| Nightlife | #1a1a2e | white | none |
| Festival | teal-50 | teal-700 | teal-200 |
| Corporate | brand-600 | white | none |

## Team
| Person | Role | Initials | Load |
|--------|------|----------|------|
| Jane Cooper | Event Manager | JC | 85% |
| Darrell Steward | Producer | DS | 72% |
| Cody Fisher | Operations Lead | CF | 68% |
| Esther Howard | Logistics Coordinator | EH | 55% |
| Leslie Alexander | Sales Manager | LA | — |
