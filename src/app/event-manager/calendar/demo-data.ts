// Gala Dock — Calendar demo data (June 2026) matching the 4 reference images.
// Used when no live Supabase data is available (dev / demo workspace).
// ALL items are clearly marked demo-only — never visible in production without a real workspace.

import type {
  CalendarItem,
  DayLaneItem,
  TeamMember,
  UpcomingHighlight,
  OverdueItem,
  ResourceBooking,
  UpcomingDeadline,
  Guest,
  CalendarSummary,
} from "./types";

// ─── Unsplash CDN placeholders (royalty-free, safe for demo) ─────────────────
const IMGS = {
  skyline:
    "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=80",
  theatre:
    "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=400&q=80",
  gala:
    "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=400&q=80",
  nightlife:
    "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
  wedding:
    "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=400&q=80",
  festival:
    "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&q=80",
  corporate:
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=80",
  catering:
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80",
};

// ─── Team ──────────────────────────────────────────────────────────────────────
export const DEMO_TEAM: TeamMember[] = [
  { name: "Jane Cooper", role: "Event Manager", initials: "JC", avatarColor: "#6366f1", load: 85 },
  { name: "Darrell Steward", role: "Producer", initials: "DS", avatarColor: "#0ea5e9", load: 72 },
  { name: "Cody Fisher", role: "Operations Lead", initials: "CF", avatarColor: "#10b981", load: 68 },
  { name: "Esther Howard", role: "Logistics Coordinator", initials: "EH", avatarColor: "#f59e0b", load: 55 },
  { name: "Leslie Alexander", role: "Sales Manager", initials: "LA", avatarColor: "#ec4899", load: 40 },
];

const JC = DEMO_TEAM[0];
const DS = DEMO_TEAM[1];
const CF = DEMO_TEAM[2];
const EH = DEMO_TEAM[3];
const LA = DEMO_TEAM[4];

// ─── Month view items ─────────────────────────────────────────────────────────
export const DEMO_MONTH_ITEMS: CalendarItem[] = [
  {
    id: "demo-001",
    title: "Supplier Coordination Call",
    startsAt: "2026-06-01T10:00:00Z",
    endsAt: "2026-06-01T11:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed",
    tone: "green", badgeLabel: "Booking", badgeType: "booking",
    owner: CF, href: "/event-manager/events",
  },
  {
    id: "demo-002",
    title: "Venue Walkthrough",
    startsAt: "2026-06-02T09:00:00Z",
    endsAt: "2026-06-02T11:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "venue_booking", kind: "venue_booking", status: "confirmed",
    tone: "green", badgeLabel: "Booking", badgeType: "booking",
    venueName: "Riverside Convention Center",
    owner: JC, href: "/event-manager/events",
  },
  {
    id: "demo-003",
    title: "Investor Webinar",
    startsAt: "2026-06-03T14:00:00Z",
    endsAt: "2026-06-03T15:30:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "scheduled",
    tone: "violet", badgeLabel: "Webinar", badgeType: "webinar",
    platformName: "Zoom", owner: DS,
    href: "/event-manager/events",
  },
  {
    id: "demo-004",
    title: "Run Sheet Review",
    startsAt: "2026-06-04T11:00:00Z",
    endsAt: "2026-06-04T12:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "run_sheet", kind: "run_sheet", status: "draft",
    tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet",
    owner: EH, href: "/event-manager/events",
  },
  {
    id: "demo-005",
    title: "Private Party",
    startsAt: "2026-06-06T19:00:00Z",
    endsAt: "2026-06-06T23:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "confirmed",
    tone: "blue", badgeLabel: "Event", badgeType: "event",
    venueName: "The Loft", owner: LA,
    href: "/event-manager/events",
  },
  {
    id: "demo-006",
    title: "Compliance Check",
    subtitle: "Q2 Audit",
    startsAt: "2026-06-08T09:30:00Z",
    endsAt: "2026-06-08T11:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "task", kind: "task", status: "due_today",
    tone: "amber", badgeLabel: "Task", badgeType: "task",
    owner: CF, href: "/event-manager/events",
  },
  {
    id: "demo-007",
    title: "Menu Finalisation",
    subtitle: "Gala Dinner",
    startsAt: "2026-06-09T12:00:00Z",
    endsAt: "2026-06-09T13:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "task", kind: "task", status: "due_today",
    tone: "amber", badgeLabel: "Task", badgeType: "task",
    owner: DS, href: "/event-manager/events",
  },
  {
    id: "demo-008",
    title: "Pulse Summit & After Dark 2026",
    subtitle: "Multi-day conference & evening events",
    startsAt: "2026-06-09T09:30:00Z",
    endsAt: "2026-06-09T17:30:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "in_progress",
    tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate",
    venueName: "Riverside Convention Center",
    imageUrl: IMGS.corporate,
    owner: JC, href: "/event-manager/events",
  },
  {
    id: "demo-009",
    title: "Run Sheet: Pulse Summit",
    subtitle: "Daily Run Sheet",
    startsAt: "2026-06-09T00:00:00Z",
    endsAt: "2026-06-09T23:59:00Z",
    allDay: true, multiDay: false,
    sourceType: "run_sheet", kind: "run_sheet", status: "published",
    tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet",
    venueName: "Riverside Convention Center",
    owner: EH, href: "/event-manager/events",
  },
  {
    id: "demo-010",
    title: "Invoices Due",
    subtitle: "3 Invoices",
    startsAt: "2026-06-10T00:00:00Z",
    allDay: true, multiDay: false,
    sourceType: "finance", kind: "finance", status: "due_today",
    tone: "red", badgeLabel: "Finance", badgeType: "finance",
    owner: CF, href: "/event-manager/events",
  },
  {
    id: "demo-011",
    title: "Wedding Tasting",
    subtitle: "Harrison & Lee",
    startsAt: "2026-06-10T11:00:00Z",
    endsAt: "2026-06-10T13:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "confirmed",
    tone: "pink", badgeLabel: "Wedding", badgeType: "wedding",
    venueName: "The Loft Private Dining",
    imageUrl: IMGS.wedding,
    owner: LA, href: "/event-manager/events",
  },
  {
    id: "demo-012",
    title: "Theatre Gala Night",
    startsAt: "2026-06-11T19:00:00Z",
    endsAt: "2026-06-11T22:30:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "scheduled",
    tone: "purple", badgeLabel: "Theatre", badgeType: "theatre",
    venueName: "Grand Opera House",
    imageUrl: IMGS.theatre,
    owner: EH, href: "/event-manager/events",
  },
  {
    id: "demo-013",
    title: "Theatre Gala Rehearsal",
    startsAt: "2026-06-11T19:00:00Z",
    endsAt: "2026-06-11T22:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "scheduled",
    tone: "purple", badgeLabel: "Theatre", badgeType: "theatre",
    venueName: "Grand Opera House Main Stage",
    imageUrl: IMGS.theatre,
    owner: EH, href: "/event-manager/events",
  },
  {
    id: "demo-014",
    title: "Press Preview",
    startsAt: "2026-06-12T10:00:00Z",
    endsAt: "2026-06-12T12:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "confirmed",
    tone: "blue", badgeLabel: "Event", badgeType: "event",
    imageUrl: IMGS.gala,
    owner: DS, href: "/event-manager/events",
  },
  {
    id: "demo-015",
    title: "After Dark Club Night",
    subtitle: "VIP Afterparty",
    startsAt: "2026-06-13T20:00:00Z",
    endsAt: "2026-06-14T02:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "confirmed",
    tone: "nightlife", badgeLabel: "Nightlife", badgeType: "nightlife",
    venueName: "The Loft Nightclub",
    imageUrl: IMGS.nightlife,
    owner: DS, href: "/event-manager/events",
  },
  {
    id: "demo-016",
    title: "Press Preview Run Sheet",
    startsAt: "2026-06-11T00:00:00Z",
    endsAt: "2026-06-11T23:59:00Z",
    allDay: true, multiDay: false,
    sourceType: "run_sheet", kind: "run_sheet", status: "draft",
    tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet",
    venueName: "Grand Opera House",
    owner: JC, href: "/event-manager/events",
  },
  // MULTI-DAY BANNER — Pulse Summit Jun 15–21
  {
    id: "demo-017",
    title: "Pulse Summit & After Dark 2026",
    subtitle: "Riverside Convention Center",
    startsAt: "2026-06-15T00:00:00Z",
    endsAt: "2026-06-21T23:59:00Z",
    allDay: true, multiDay: true,
    sourceType: "event", kind: "event", status: "in_progress",
    tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate",
    venueName: "Riverside Convention Center",
    imageUrl: IMGS.skyline,
    owner: JC,
    teamCount: 12,
    teamAvatars: ["JC", "DS", "CF", "EH"],
    href: "/event-manager/events",
  },
  {
    id: "demo-018",
    title: "Sustainability Report",
    startsAt: "2026-06-22T09:00:00Z",
    endsAt: "2026-06-22T10:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "task", kind: "task", status: "pending",
    tone: "amber", badgeLabel: "Task", badgeType: "task",
    owner: CF, href: "/event-manager/events",
  },
  {
    id: "demo-019",
    title: "AV Load-in",
    startsAt: "2026-06-23T07:00:00Z",
    endsAt: "2026-06-23T11:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "run_sheet", kind: "run_sheet", status: "scheduled",
    tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet",
    owner: EH, href: "/event-manager/events",
  },
  {
    id: "demo-020",
    title: "Gala Dinner",
    startsAt: "2026-06-24T19:00:00Z",
    endsAt: "2026-06-24T23:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "confirmed",
    tone: "blue", badgeLabel: "Event", badgeType: "event",
    venueName: "Grand Ballroom",
    imageUrl: IMGS.gala,
    owner: JC, href: "/event-manager/events",
  },
  {
    id: "demo-021",
    title: "Supplier Final Balance",
    startsAt: "2026-06-25T00:00:00Z",
    allDay: true, multiDay: false,
    sourceType: "finance", kind: "finance", status: "pending",
    tone: "red", badgeLabel: "Finance", badgeType: "finance",
    owner: CF, href: "/event-manager/events",
  },
  {
    id: "demo-022",
    title: "Food Festival 2026",
    startsAt: "2026-06-26T12:00:00Z",
    endsAt: "2026-06-28T21:00:00Z",
    allDay: false, multiDay: true,
    sourceType: "event", kind: "event", status: "scheduled",
    tone: "teal", badgeLabel: "Festival", badgeType: "festival",
    venueName: "Victoria Park",
    imageUrl: IMGS.festival,
    owner: LA, href: "/event-manager/events",
  },
  {
    id: "demo-023",
    title: "Post-Event Survey",
    startsAt: "2026-06-29T09:00:00Z",
    allDay: false, multiDay: false,
    sourceType: "task", kind: "task", status: "pending",
    tone: "amber", badgeLabel: "Task", badgeType: "task",
    owner: DS, href: "/event-manager/events",
  },
  {
    id: "demo-024",
    title: "Debrief Meeting",
    startsAt: "2026-06-30T10:00:00Z",
    endsAt: "2026-06-30T11:30:00Z",
    allDay: false, multiDay: false,
    sourceType: "event", kind: "event", status: "scheduled",
    tone: "blue", badgeLabel: "Event", badgeType: "event",
    owner: JC, href: "/event-manager/events",
  },
];

// ─── Week view items (Jun 16–22) ──────────────────────────────────────────────
export const DEMO_WEEK_ITEMS: CalendarItem[] = [
  // Mon Jun 16
  { id: "w-001", title: "Run Sheet Checkpoint", startsAt: "2026-06-16T07:30:00Z", endsAt: "2026-06-16T08:00:00Z", allDay: false, multiDay: false, sourceType: "run_sheet", kind: "run_sheet", status: "scheduled", tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet", owner: EH, href: "/event-manager/events" },
  { id: "w-002", title: "Venue Walkthrough", startsAt: "2026-06-16T08:00:00Z", endsAt: "2026-06-16T09:00:00Z", allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", venueName: "Riverside CC", owner: JC, href: "/event-manager/events" },
  { id: "w-003", title: "Supplier Coordination Call", startsAt: "2026-06-16T09:00:00Z", endsAt: "2026-06-16T10:00:00Z", allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", owner: CF, href: "/event-manager/events" },
  { id: "w-004", title: "Executive Briefing", startsAt: "2026-06-16T11:00:00Z", endsAt: "2026-06-16T12:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", owner: DS, href: "/event-manager/events" },
  { id: "w-005", title: "Task: Marketing Assets", startsAt: "2026-06-16T14:00:00Z", endsAt: "2026-06-16T15:00:00Z", allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", owner: LA, href: "/event-manager/events" },
  { id: "w-006", title: "Finance: Budget Review", startsAt: "2026-06-16T15:00:00Z", endsAt: "2026-06-16T16:00:00Z", allDay: false, multiDay: false, sourceType: "finance", kind: "finance", status: "scheduled", tone: "red", badgeLabel: "Finance", badgeType: "finance", owner: CF, href: "/event-manager/events" },
  { id: "w-007", title: "Run Sheet: Load-in Plan", startsAt: "2026-06-16T17:00:00Z", endsAt: "2026-06-16T18:00:00Z", allDay: false, multiDay: false, sourceType: "run_sheet", kind: "run_sheet", status: "draft", tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet", owner: EH, href: "/event-manager/events" },
  { id: "w-008", title: "Welcome Reception", startsAt: "2026-06-16T19:00:00Z", endsAt: "2026-06-16T21:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "blue", badgeLabel: "Event", badgeType: "event", venueName: "Riverside Foyer", imageUrl: IMGS.gala, owner: JC, href: "/event-manager/events" },
  // Tue Jun 17
  { id: "w-009", title: "AV Equipment Confirmation", startsAt: "2026-06-17T07:00:00Z", endsAt: "2026-06-17T07:30:00Z", allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", owner: CF, href: "/event-manager/events" },
  { id: "w-010", title: "Venue Walkthrough", startsAt: "2026-06-17T08:00:00Z", endsAt: "2026-06-17T09:00:00Z", allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", owner: JC, href: "/event-manager/events" },
  { id: "w-011", title: "Webinar Rehearsal", startsAt: "2026-06-17T10:00:00Z", endsAt: "2026-06-17T11:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "violet", badgeLabel: "Webinar", badgeType: "webinar", owner: DS, href: "/event-manager/events" },
  { id: "w-012", title: "Catering Tasting", startsAt: "2026-06-17T13:00:00Z", endsAt: "2026-06-17T14:30:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "blue", badgeLabel: "Event", badgeType: "event", imageUrl: IMGS.catering, owner: LA, href: "/event-manager/events" },
  { id: "w-013", title: "Speaker Deck Review", startsAt: "2026-06-17T14:30:00Z", endsAt: "2026-06-17T15:30:00Z", allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", owner: DS, href: "/event-manager/events" },
  { id: "w-014", title: "Run Sheet: Stage Plot", startsAt: "2026-06-17T16:00:00Z", endsAt: "2026-06-17T17:00:00Z", allDay: false, multiDay: false, sourceType: "run_sheet", kind: "run_sheet", status: "draft", tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet", owner: EH, href: "/event-manager/events" },
  { id: "w-015", title: "Finance: Sponsor Invoicing", startsAt: "2026-06-17T18:30:00Z", endsAt: "2026-06-17T19:30:00Z", allDay: false, multiDay: false, sourceType: "finance", kind: "finance", status: "pending", tone: "red", badgeLabel: "Finance", badgeType: "finance", owner: CF, href: "/event-manager/events" },
  { id: "w-016", title: "Networking Drive", startsAt: "2026-06-17T20:00:00Z", endsAt: "2026-06-17T22:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "blue", badgeLabel: "Event", badgeType: "event", owner: JC, href: "/event-manager/events" },
  // Wed Jun 18
  { id: "w-017", title: "Run Sheet Checkpoint", startsAt: "2026-06-18T07:00:00Z", endsAt: "2026-06-18T07:30:00Z", allDay: false, multiDay: false, sourceType: "run_sheet", kind: "run_sheet", status: "published", tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet", owner: EH, href: "/event-manager/events" },
  { id: "w-018", title: "Supplier Check-in Call", startsAt: "2026-06-18T09:30:00Z", endsAt: "2026-06-18T10:30:00Z", allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", owner: CF, href: "/event-manager/events" },
  { id: "w-019", title: "Run Sheet Rehearsal", startsAt: "2026-06-18T11:30:00Z", endsAt: "2026-06-18T12:30:00Z", allDay: false, multiDay: false, sourceType: "run_sheet", kind: "run_sheet", status: "published", tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet", owner: EH, href: "/event-manager/events" },
  { id: "w-020", title: "Security Briefing", startsAt: "2026-06-18T13:30:00Z", endsAt: "2026-06-18T14:30:00Z", allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "scheduled", tone: "amber", badgeLabel: "Task", badgeType: "task", owner: CF, href: "/event-manager/events" },
  { id: "w-021", title: "Investor Webinar", startsAt: "2026-06-18T15:30:00Z", endsAt: "2026-06-18T17:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "violet", badgeLabel: "Webinar", badgeType: "webinar", platformName: "Zoom", owner: DS, href: "/event-manager/events" },
  { id: "w-022", title: "Gala Dinner", startsAt: "2026-06-18T18:30:00Z", endsAt: "2026-06-18T22:30:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "blue", badgeLabel: "Event", badgeType: "event", venueName: "Grand Ballroom", imageUrl: IMGS.gala, owner: JC, href: "/event-manager/events" },
  // Thu Jun 19
  { id: "w-023", title: "Venue Tech Walkthrough", startsAt: "2026-06-19T08:00:00Z", endsAt: "2026-06-19T09:00:00Z", allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", owner: JC, href: "/event-manager/events" },
  { id: "w-024", title: "Finance: Final Budget Sign-Off", startsAt: "2026-06-19T10:00:00Z", endsAt: "2026-06-19T11:00:00Z", allDay: false, multiDay: false, sourceType: "finance", kind: "finance", status: "pending", tone: "red", badgeLabel: "Finance", badgeType: "finance", owner: CF, href: "/event-manager/events" },
  { id: "w-025", title: "Run Sheet: Opening Session", startsAt: "2026-06-19T12:00:00Z", endsAt: "2026-06-19T13:00:00Z", allDay: false, multiDay: false, sourceType: "run_sheet", kind: "run_sheet", status: "published", tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet", owner: EH, href: "/event-manager/events" },
  { id: "w-026", title: "Theatre Gala Dress Rehearsal", startsAt: "2026-06-19T14:00:00Z", endsAt: "2026-06-19T17:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "purple", badgeLabel: "Theatre", badgeType: "theatre", venueName: "Grand Opera House", imageUrl: IMGS.theatre, owner: EH, href: "/event-manager/events" },
  { id: "w-027", title: "Talent Call Time", startsAt: "2026-06-19T17:30:00Z", endsAt: "2026-06-19T18:30:00Z", allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "scheduled", tone: "amber", badgeLabel: "Task", badgeType: "task", owner: DS, href: "/event-manager/events" },
  { id: "w-028", title: "After Dark Launch", startsAt: "2026-06-19T19:00:00Z", endsAt: "2026-06-19T23:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "nightlife", badgeLabel: "Nightlife", badgeType: "nightlife", venueName: "The Loft", imageUrl: IMGS.nightlife, owner: DS, href: "/event-manager/events" },
  { id: "w-029", title: "Gala Rehearsal", startsAt: "2026-06-19T20:00:00Z", endsAt: "2026-06-19T22:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "purple", badgeLabel: "Theatre", badgeType: "theatre", owner: EH, href: "/event-manager/events" },
  // Fri Jun 20
  { id: "w-030", title: "Run Sheet: Day of Ops Brief", startsAt: "2026-06-20T07:00:00Z", endsAt: "2026-06-20T08:00:00Z", allDay: false, multiDay: false, sourceType: "run_sheet", kind: "run_sheet", status: "published", tone: "brand", badgeLabel: "Run Sheet", badgeType: "run_sheet", owner: EH, href: "/event-manager/events" },
  { id: "w-031", title: "Festival Ops Brief", startsAt: "2026-06-20T09:00:00Z", endsAt: "2026-06-20T10:00:00Z", allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "scheduled", tone: "amber", badgeLabel: "Task", badgeType: "task", owner: LA, href: "/event-manager/events" },
  { id: "w-032", title: "Food Festival Opens", startsAt: "2026-06-20T14:00:00Z", endsAt: "2026-06-20T21:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "teal", badgeLabel: "Festival", badgeType: "festival", venueName: "Victoria Park", imageUrl: IMGS.festival, owner: LA, href: "/event-manager/events" },
  { id: "w-033", title: "Vendor Check-In", startsAt: "2026-06-20T17:00:00Z", endsAt: "2026-06-20T18:00:00Z", allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", owner: CF, href: "/event-manager/events" },
  { id: "w-034", title: "Headline Set", startsAt: "2026-06-20T20:00:00Z", endsAt: "2026-06-20T22:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "teal", badgeLabel: "Festival", badgeType: "festival", owner: DS, href: "/event-manager/events" },
  // Sat Jun 21
  { id: "w-035", title: "Cast Call Time", startsAt: "2026-06-21T09:00:00Z", endsAt: "2026-06-21T10:00:00Z", allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "scheduled", tone: "amber", badgeLabel: "Task", badgeType: "task", owner: EH, href: "/event-manager/events" },
  { id: "w-036", title: "Matinee Show", startsAt: "2026-06-21T12:30:00Z", endsAt: "2026-06-21T15:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "purple", badgeLabel: "Theatre", badgeType: "theatre", venueName: "Grand Opera House", imageUrl: IMGS.theatre, owner: EH, href: "/event-manager/events" },
  { id: "w-037", title: "Gala Performance", startsAt: "2026-06-21T17:00:00Z", endsAt: "2026-06-21T20:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "purple", badgeLabel: "Theatre", badgeType: "theatre", venueName: "Grand Opera House", owner: EH, href: "/event-manager/events" },
  { id: "w-038", title: "Closing Night Party", startsAt: "2026-06-21T20:00:00Z", endsAt: "2026-06-21T23:00:00Z", allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "nightlife", badgeLabel: "Nightlife", badgeType: "nightlife", venueName: "The Loft", imageUrl: IMGS.nightlife, owner: DS, href: "/event-manager/events" },
  // Multi-day all-day (Pulse Summit banner)
  { id: "w-039", title: "Pulse Summit & After Dark 2026", subtitle: "Riverside Convention Center", startsAt: "2026-06-15T00:00:00Z", endsAt: "2026-06-21T23:59:00Z", allDay: true, multiDay: true, sourceType: "event", kind: "event", status: "in_progress", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", venueName: "Riverside Convention Center", imageUrl: IMGS.skyline, owner: JC, teamCount: 12, teamAvatars: ["JC", "DS", "CF", "EH"], href: "/event-manager/events" },
  { id: "w-040", title: "Theatre Gala Night", startsAt: "2026-06-21T00:00:00Z", endsAt: "2026-06-21T23:59:00Z", allDay: true, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "purple", badgeLabel: "Theatre", badgeType: "theatre", owner: EH, href: "/event-manager/events" },
];

// ─── Day view items (Jun 18 — 5 lanes) ───────────────────────────────────────
export const DEMO_DAY_ITEMS: DayLaneItem[] = [
  // MAIN EVENT lane
  { id: "d-001", laneType: "main_event", title: "Keynote Stage Setup", startsAt: "2026-06-18T07:00:00Z", endsAt: "2026-06-18T08:30:00Z", startHour: 7, startMinute: 0, durationMinutes: 90, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "completed", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-002", laneType: "main_event", title: "Registration Opens", startsAt: "2026-06-18T09:00:00Z", endsAt: "2026-06-18T09:30:00Z", startHour: 9, startMinute: 0, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "completed", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-003", laneType: "main_event", title: "Opening Keynote", startsAt: "2026-06-18T10:15:00Z", endsAt: "2026-06-18T11:00:00Z", startHour: 10, startMinute: 15, durationMinutes: 45, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "completed", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-004", laneType: "main_event", title: "Breakout Session A", startsAt: "2026-06-18T11:15:00Z", endsAt: "2026-06-18T12:00:00Z", startHour: 11, startMinute: 15, durationMinutes: 45, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "completed", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-005", laneType: "main_event", title: "VIP Lunch & Networking", startsAt: "2026-06-18T12:00:00Z", endsAt: "2026-06-18T13:30:00Z", startHour: 12, startMinute: 0, durationMinutes: 90, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "in_progress", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-006", laneType: "main_event", title: "Breakout Session B", startsAt: "2026-06-18T13:45:00Z", endsAt: "2026-06-18T14:30:00Z", startHour: 13, startMinute: 45, durationMinutes: 45, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-007", laneType: "main_event", title: "Panel Discussion", startsAt: "2026-06-18T14:45:00Z", endsAt: "2026-06-18T15:30:00Z", startHour: 14, startMinute: 45, durationMinutes: 45, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-008", laneType: "main_event", title: "Closing Keynote", startsAt: "2026-06-18T16:00:00Z", endsAt: "2026-06-18T16:45:00Z", startHour: 16, startMinute: 0, durationMinutes: 45, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-009", laneType: "main_event", title: "Livestream Rehearsal", startsAt: "2026-06-18T17:30:00Z", endsAt: "2026-06-18T18:30:00Z", startHour: 17, startMinute: 30, durationMinutes: 60, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-010", laneType: "main_event", title: "Guest Check-In & Welcome", startsAt: "2026-06-18T19:00:00Z", endsAt: "2026-06-18T20:00:00Z", startHour: 19, startMinute: 0, durationMinutes: 60, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "corporate", badgeLabel: "Corporate", badgeType: "corporate", href: "/event-manager/events" },
  { id: "d-011", laneType: "main_event", title: "Theatre Gala Show", startsAt: "2026-06-18T20:00:00Z", endsAt: "2026-06-18T21:00:00Z", startHour: 20, startMinute: 0, durationMinutes: 60, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "purple", badgeLabel: "Theatre", badgeType: "theatre", href: "/event-manager/events" },
  { id: "d-012", laneType: "main_event", title: "After Dark Club Set", startsAt: "2026-06-18T21:15:00Z", endsAt: "2026-06-18T22:45:00Z", startHour: 21, startMinute: 15, durationMinutes: 90, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "nightlife", badgeLabel: "Nightlife", badgeType: "nightlife", href: "/event-manager/events" },
  { id: "d-013", laneType: "main_event", title: "Post-Event Debrief", startsAt: "2026-06-18T23:00:00Z", endsAt: "2026-06-19T00:00:00Z", startHour: 23, startMinute: 0, durationMinutes: 60, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "blue", badgeLabel: "Event", badgeType: "event", href: "/event-manager/events" },
  // TASKS lane
  { id: "d-100", laneType: "task", title: "Confirm AV run sheet", startsAt: "2026-06-18T07:00:00Z", endsAt: "2026-06-18T07:30:00Z", startHour: 7, startMinute: 0, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "completed", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-101", laneType: "task", title: "Final signage check", startsAt: "2026-06-18T08:00:00Z", endsAt: "2026-06-18T08:30:00Z", startHour: 8, startMinute: 0, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "completed", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-102", laneType: "task", title: "Registration desk ready", startsAt: "2026-06-18T09:00:00Z", endsAt: "2026-06-18T09:30:00Z", startHour: 9, startMinute: 0, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-103", laneType: "task", title: "Speaker green room check", startsAt: "2026-06-18T10:30:00Z", endsAt: "2026-06-18T11:00:00Z", startHour: 10, startMinute: 30, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-104", laneType: "task", title: "VIP lunch seating plan", startsAt: "2026-06-18T12:00:00Z", endsAt: "2026-06-18T12:30:00Z", startHour: 12, startMinute: 0, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-105", laneType: "task", title: "Room turnover A→B", startsAt: "2026-06-18T13:00:00Z", endsAt: "2026-06-18T13:30:00Z", startHour: 13, startMinute: 0, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-106", laneType: "task", title: "Prepare closing remarks", startsAt: "2026-06-18T15:15:00Z", endsAt: "2026-06-18T15:45:00Z", startHour: 15, startMinute: 15, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-107", laneType: "task", title: "Livestream tech check", startsAt: "2026-06-18T17:00:00Z", endsAt: "2026-06-18T17:30:00Z", startHour: 17, startMinute: 0, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-108", laneType: "task", title: "After dark setup complete", startsAt: "2026-06-18T18:15:00Z", endsAt: "2026-06-18T18:45:00Z", startHour: 18, startMinute: 15, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-109", laneType: "task", title: "Guest experience check", startsAt: "2026-06-18T19:00:00Z", endsAt: "2026-06-18T19:30:00Z", startHour: 19, startMinute: 0, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-110", laneType: "task", title: "Post-event clean down", startsAt: "2026-06-18T22:45:00Z", endsAt: "2026-06-18T23:15:00Z", startHour: 22, startMinute: 45, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "completed", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  { id: "d-111", laneType: "task", title: "Debrief & feedback capture", startsAt: "2026-06-18T23:30:00Z", endsAt: "2026-06-19T00:00:00Z", startHour: 23, startMinute: 30, durationMinutes: 30, allDay: false, multiDay: false, sourceType: "task", kind: "task", status: "pending", tone: "amber", badgeLabel: "Task", badgeType: "task", href: "/event-manager/events" },
  // SUPPLIERS lane
  { id: "d-200", laneType: "supplier_booking", title: "AV Crew Arrival", subtitle: "Sound & Vision Pro", supplierCompany: "Sound & Vision Pro", startsAt: "2026-06-18T05:30:00Z", endsAt: "2026-06-18T08:30:00Z", startHour: 5, startMinute: 30, durationMinutes: 180, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-201", laneType: "supplier_booking", title: "Catering Delivery", subtitle: "Gala Catering Co.", supplierCompany: "Gala Catering Co.", startsAt: "2026-06-18T08:00:00Z", endsAt: "2026-06-18T09:00:00Z", startHour: 8, startMinute: 0, durationMinutes: 60, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-202", laneType: "supplier_booking", title: "Floral Installation", subtitle: "Bloom & Co.", supplierCompany: "Bloom & Co.", startsAt: "2026-06-18T08:30:00Z", endsAt: "2026-06-18T10:00:00Z", startHour: 8, startMinute: 30, durationMinutes: 90, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-203", laneType: "supplier_booking", title: "Registration Tech Setup", subtitle: "EventTech Solutions", supplierCompany: "EventTech Solutions", startsAt: "2026-06-18T09:00:00Z", endsAt: "2026-06-18T11:00:00Z", startHour: 9, startMinute: 0, durationMinutes: 120, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-204", laneType: "supplier_booking", title: "VIP Lunch Service", subtitle: "Gala Catering Co.", supplierCompany: "Gala Catering Co.", startsAt: "2026-06-18T11:30:00Z", endsAt: "2026-06-18T13:00:00Z", startHour: 11, startMinute: 30, durationMinutes: 90, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-205", laneType: "supplier_booking", title: "Photography & Video", subtitle: "Frame & Focus", supplierCompany: "Frame & Focus", startsAt: "2026-06-18T14:00:00Z", endsAt: "2026-06-18T16:00:00Z", startHour: 14, startMinute: 0, durationMinutes: 120, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-206", laneType: "supplier_booking", title: "Stage Reset Crew", subtitle: "StagePro Services", supplierCompany: "StagePro Services", startsAt: "2026-06-18T16:30:00Z", endsAt: "2026-06-18T18:00:00Z", startHour: 16, startMinute: 30, durationMinutes: 90, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-207", laneType: "supplier_booking", title: "Dinner Service Prep", subtitle: "Gala Catering Co.", supplierCompany: "Gala Catering Co.", startsAt: "2026-06-18T18:00:00Z", endsAt: "2026-06-18T20:00:00Z", startHour: 18, startMinute: 0, durationMinutes: 120, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-208", laneType: "supplier_booking", title: "Bar & Beverages", subtitle: "Premium Pour", supplierCompany: "Premium Pour", startsAt: "2026-06-18T20:30:00Z", endsAt: "2026-06-18T23:00:00Z", startHour: 20, startMinute: 30, durationMinutes: 150, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-209", laneType: "supplier_booking", title: "Strike & Load Out", subtitle: "StagePro Services", supplierCompany: "StagePro Services", startsAt: "2026-06-18T22:30:00Z", endsAt: "2026-06-19T00:00:00Z", startHour: 22, startMinute: 30, durationMinutes: 90, allDay: false, multiDay: false, sourceType: "supplier_booking", kind: "supplier_booking", status: "scheduled", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  // TEAM lane
  { id: "d-300", laneType: "team", title: "Morning Ops Crew", teamCount: 8, startsAt: "2026-06-18T06:00:00Z", endsAt: "2026-06-18T14:00:00Z", startHour: 6, startMinute: 0, durationMinutes: 480, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "blue", badgeLabel: "Event", badgeType: "event", href: "/event-manager/events" },
  { id: "d-301", laneType: "team", title: "Production Team", teamCount: 12, startsAt: "2026-06-18T08:00:00Z", endsAt: "2026-06-18T16:00:00Z", startHour: 8, startMinute: 0, durationMinutes: 480, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "blue", badgeLabel: "Event", badgeType: "event", href: "/event-manager/events" },
  { id: "d-302", laneType: "team", title: "Event Managers", teamCount: 4, startsAt: "2026-06-18T09:00:00Z", endsAt: "2026-06-18T17:00:00Z", startHour: 9, startMinute: 0, durationMinutes: 480, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "blue", badgeLabel: "Event", badgeType: "event", href: "/event-manager/events" },
  { id: "d-303", laneType: "team", title: "Evening Ops Crew", teamCount: 10, startsAt: "2026-06-18T14:00:00Z", endsAt: "2026-06-18T22:00:00Z", startHour: 14, startMinute: 0, durationMinutes: 480, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "blue", badgeLabel: "Event", badgeType: "event", href: "/event-manager/events" },
  { id: "d-304", laneType: "team", title: "After Dark Crew", teamCount: 9, startsAt: "2026-06-18T18:00:00Z", endsAt: "2026-06-19T00:00:00Z", startHour: 18, startMinute: 0, durationMinutes: 360, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "confirmed", tone: "nightlife", badgeLabel: "Nightlife", badgeType: "nightlife", href: "/event-manager/events" },
  { id: "d-305", laneType: "team", title: "Night Wrap Crew", teamCount: 6, startsAt: "2026-06-18T22:00:00Z", endsAt: "2026-06-19T01:00:00Z", startHour: 22, startMinute: 0, durationMinutes: 180, allDay: false, multiDay: false, sourceType: "event", kind: "event", status: "scheduled", tone: "blue", badgeLabel: "Event", badgeType: "event", href: "/event-manager/events" },
  // VENUE BOOKINGS lane
  { id: "d-400", laneType: "venue_booking", title: "Grand Ballroom", subtitle: "Main Stage & Seating", startsAt: "2026-06-18T06:00:00Z", endsAt: "2026-06-18T07:00:00Z", startHour: 6, startMinute: 0, durationMinutes: 60, allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-401", laneType: "venue_booking", title: "Riverside Hall A", subtitle: "Breakout Room", startsAt: "2026-06-18T07:00:00Z", endsAt: "2026-06-18T17:00:00Z", startHour: 7, startMinute: 0, durationMinutes: 600, allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-402", laneType: "venue_booking", title: "Riverside Hall B", subtitle: "Breakout Room", startsAt: "2026-06-18T07:00:00Z", endsAt: "2026-06-18T17:00:00Z", startHour: 7, startMinute: 0, durationMinutes: 600, allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-403", laneType: "venue_booking", title: "Registration Lobby", subtitle: "Check-In Area", startsAt: "2026-06-18T09:00:00Z", endsAt: "2026-06-18T18:00:00Z", startHour: 9, startMinute: 0, durationMinutes: 540, allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-404", laneType: "venue_booking", title: "Skyline Suite", subtitle: "VIP Lunch", startsAt: "2026-06-18T12:00:00Z", endsAt: "2026-06-18T14:00:00Z", startHour: 12, startMinute: 0, durationMinutes: 120, allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-405", laneType: "venue_booking", title: "Grand Ballroom", subtitle: "Dinner & After Dark", startsAt: "2026-06-18T17:00:00Z", endsAt: "2026-06-18T23:00:00Z", startHour: 17, startMinute: 0, durationMinutes: 360, allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "green", badgeLabel: "Booking", badgeType: "booking", href: "/event-manager/events" },
  { id: "d-406", laneType: "venue_booking", title: "The Loft", subtitle: "After Dark Club", startsAt: "2026-06-18T20:30:00Z", endsAt: "2026-06-19T00:00:00Z", startHour: 20, startMinute: 30, durationMinutes: 210, allDay: false, multiDay: false, sourceType: "venue_booking", kind: "venue_booking", status: "confirmed", tone: "nightlife", badgeLabel: "Nightlife", badgeType: "nightlife", href: "/event-manager/events" },
];

// ─── Right panel data ─────────────────────────────────────────────────────────
export const DEMO_SUMMARY: CalendarSummary = {
  totalItems: 42,
  eventCount: 18,
  taskCount: 12,
  bookingCount: 8,
  runSheetCount: 4,
  financeCount: 3,
  dueTodayCount: 5,
  overdueCount: 2,
};

export const DEMO_HIGHLIGHTS: UpcomingHighlight[] = [
  { id: "h-001", date: "2026-06-11", month: "JUN", day: "11", title: "Theatre Gala Night", time: "7:00 PM", venue: "Grand Opera House", badgeLabel: "Theatre", badgeType: "theatre" },
  { id: "h-002", date: "2026-06-13", month: "JUN", day: "13", title: "After Dark Club Night", time: "8:00 PM", venue: "The Loft", badgeLabel: "Nightlife", badgeType: "nightlife" },
  { id: "h-003", date: "2026-06-15", month: "JUN", day: "15", title: "Pulse Summit & After Dark 2026", time: "9:00 AM", venue: "Riverside Convention Center", badgeLabel: "Corporate", badgeType: "corporate" },
  { id: "h-004", date: "2026-06-24", month: "JUN", day: "24", title: "Gala Dinner", time: "7:00 PM", venue: "Grand Ballroom", badgeLabel: "Event", badgeType: "event" },
];

export const DEMO_OVERDUE: OverdueItem[] = [
  { id: "o-001", title: "Deposit Confirmation", subtitle: "Harrison & Lee Wedding", badgeType: "finance", badgeLabel: "Finance", dueLabel: "2 days overdue", dueUrgency: "overdue" },
  { id: "o-002", title: "Site Survey Sign-Off", subtitle: "Victoria Park Festival", badgeType: "task", badgeLabel: "Task", dueLabel: "Due today", dueUrgency: "today" },
];

export const DEMO_RESOURCES: ResourceBooking[] = [
  { id: "r-001", name: "Riverside Convention Center", dateRange: "Jun 15–21", imageUrl: IMGS.skyline },
  { id: "r-002", name: "Grand Opera House", dateRange: "Jun 11 & 21", imageUrl: IMGS.theatre },
  { id: "r-003", name: "Victoria Park", dateRange: "Jun 26–28", imageUrl: IMGS.festival },
];

export const DEMO_DEADLINES: UpcomingDeadline[] = [
  { id: "dl-001", title: "Pulse Summit: Final Run Sheet", subtitle: "3 outstanding items", dueLabel: "Due in 2 days", badgeType: "run_sheet", badgeLabel: "Run Sheet" },
  { id: "dl-002", title: "Theatre Gala: Marketing Assets", dueLabel: "Due in 4 days", badgeType: "task", badgeLabel: "Task" },
  { id: "dl-003", title: "Festival Supplier Payments", subtitle: "£12,400 pending", dueLabel: "Due in 6 days", badgeType: "finance", badgeLabel: "Finance" },
];

export const DEMO_DAY_GUESTS: Guest[] = [
  { id: "g-001", name: "Alexandra Chen", role: "VIP Keynote Speaker", time: "10:00 AM", status: "confirmed", initials: "AC", avatarColor: "#6366f1" },
  { id: "g-002", name: "Marcus Adeyemi", role: "Investor Guest", time: "12:00 PM", status: "confirmed", initials: "MA", avatarColor: "#0ea5e9" },
  { id: "g-003", name: "Priya Nair", role: "Press Pass", time: "2:00 PM", status: "pending", initials: "PN", avatarColor: "#10b981" },
  { id: "g-004", name: "Thomas Whitfield", role: "Sponsor Representative", time: "9:00 AM", status: "confirmed", initials: "TW", avatarColor: "#f59e0b" },
  { id: "g-005", name: "Sofia Reyes", role: "VIP Guest", time: "7:00 PM", status: "pending", initials: "SR", avatarColor: "#ec4899" },
  { id: "g-006", name: "James O'Brien", role: "Media", time: "2:30 PM", status: "declined", initials: "JO", avatarColor: "#64748b" },
];

export const DEMO_DAY_TEAM_ON_DUTY = [
  { ...JC, status: "on_site" },
  { ...DS, status: "on_site" },
  { ...EH, status: "on_site" },
];
