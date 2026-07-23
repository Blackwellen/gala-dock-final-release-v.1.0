// Gala Dock — Calendar hub extended types (V1-2).
// Covers all 4 views: Month, Agenda, Week, Day.

export type ViewMode = "month" | "week" | "day" | "agenda" | "gantt";
export type SectionMode = "calendar" | "agenda";

export type SourceType =
  | "event"
  | "run_sheet"
  | "task"
  | "supplier_booking"
  | "venue_booking"
  | "finance"
  | "note";

export type BadgeType =
  | "event"
  | "run_sheet"
  | "booking"
  | "task"
  | "finance"
  | "webinar"
  | "theatre"
  | "nightlife"
  | "festival"
  | "corporate"
  | "wellness"
  | "wedding";

export interface CalendarPerson {
  name: string;
  role: string;
  initials: string;
  avatarColor?: string;
  load?: number; // 0–100
}

/** Rich calendar item used across all 4 views. */
export interface CalendarItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  // Source
  sourceType: SourceType;
  kind: string; // legacy dot-tone compat
  status: string;
  priority?: string;
  tone: string; // legacy
  // Time
  startsAt: string; // ISO datetime
  endsAt?: string | null; // ISO datetime
  allDay: boolean;
  multiDay: boolean;
  // Location
  venueName?: string | null;
  venueRoom?: string | null;
  locationText?: string | null;
  platformName?: string | null;
  // Owner
  owner?: CalendarPerson | null;
  // Badge
  badgeLabel: string;
  badgeType: BadgeType;
  // Media
  imageUrl?: string | null;
  // Links
  eventId?: string | null;
  supplierId?: string | null;
  href: string;
  // Day view specific
  laneType?: "main_event" | "task" | "supplier_booking" | "team" | "venue_booking";
  teamCount?: number;
  teamAvatars?: string[];
  supplierCompany?: string;
  // Agenda extras
  eventAssociation?: string;
}

export interface CalendarSummary {
  totalItems: number;
  eventCount: number;
  taskCount: number;
  bookingCount: number;
  runSheetCount: number;
  financeCount: number;
  dueTodayCount: number;
  overdueCount: number;
}

export interface TeamMember {
  name: string;
  role: string;
  initials: string;
  avatarColor: string;
  load: number; // 0–100
}

export interface UpcomingHighlight {
  id: string;
  date: string; // ISO date
  month: string;
  day: string;
  title: string;
  time?: string;
  venue?: string;
  badgeLabel: string;
  badgeType: BadgeType;
}

export interface OverdueItem {
  id: string;
  title: string;
  subtitle?: string;
  badgeType: BadgeType;
  badgeLabel: string;
  dueLabel: string;
  dueUrgency: "overdue" | "soon" | "today";
}

export interface ResourceBooking {
  id: string;
  name: string;
  dateRange: string;
  imageUrl?: string;
}

export interface UpcomingDeadline {
  id: string;
  title: string;
  subtitle?: string;
  dueLabel: string;
  badgeType: BadgeType;
  badgeLabel: string;
}

export interface Guest {
  id: string;
  name: string;
  role: string;
  time: string;
  status: "confirmed" | "pending" | "declined";
  initials: string;
  avatarColor?: string;
}

export interface DayLaneItem extends CalendarItem {
  startHour: number; // 0–23
  startMinute: number; // 0–59
  durationMinutes: number;
}

/** Badge styling lookup. */
export const BADGE_STYLES: Record<BadgeType, string> = {
  event:        "bg-blue-50 text-blue-700 border border-blue-200",
  run_sheet:    "bg-brand-50 text-brand-700 border border-brand-200",
  booking:      "bg-green-50 text-green-700 border border-green-200",
  task:         "bg-amber-50 text-amber-700 border border-amber-200",
  finance:      "bg-red-50 text-red-700 border border-red-200",
  webinar:      "bg-violet-50 text-violet-700 border border-violet-200",
  theatre:      "bg-purple-100 text-purple-800 border border-purple-200",
  nightlife:    "bg-[#1a1a2e] text-white border-transparent",
  festival:     "bg-teal-50 text-teal-700 border border-teal-200",
  corporate:    "bg-brand-600 text-white border-transparent",
  wellness:     "bg-emerald-50 text-emerald-700 border border-emerald-200",
  wedding:      "bg-pink-50 text-pink-700 border border-pink-200",
};

/** Left-border colour for week/day event blocks. */
export const BLOCK_BORDER: Record<BadgeType, string> = {
  event:        "border-l-blue-500",
  run_sheet:    "border-l-brand-500",
  booking:      "border-l-green-500",
  task:         "border-l-amber-500",
  finance:      "border-l-red-500",
  webinar:      "border-l-violet-500",
  theatre:      "border-l-purple-500",
  nightlife:    "border-l-[#4a1d96]",
  festival:     "border-l-teal-500",
  corporate:    "border-l-brand-700",
  wellness:     "border-l-emerald-500",
  wedding:      "border-l-pink-500",
};

/** Background tint for week/day event blocks. */
export const BLOCK_BG: Record<BadgeType, string> = {
  event:        "bg-blue-50",
  run_sheet:    "bg-brand-50",
  booking:      "bg-green-50",
  task:         "bg-amber-50",
  finance:      "bg-red-50",
  webinar:      "bg-violet-50",
  theatre:      "bg-purple-50",
  nightlife:    "bg-[#1a1a2e]",
  festival:     "bg-teal-50",
  corporate:    "bg-brand-50",
  wellness:     "bg-emerald-50",
  wedding:      "bg-pink-50",
};

export const BLOCK_TEXT: Record<BadgeType, string> = {
  event:        "text-blue-900",
  run_sheet:    "text-brand-900",
  booking:      "text-green-900",
  task:         "text-amber-900",
  finance:      "text-red-900",
  webinar:      "text-violet-900",
  theatre:      "text-purple-900",
  nightlife:    "text-white",
  festival:     "text-teal-900",
  corporate:    "text-brand-900",
  wellness:     "text-emerald-900",
  wedding:      "text-pink-900",
};
