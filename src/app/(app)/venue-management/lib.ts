// Shared helpers for the Venue Management section (Level 14, Option B).
// Money is stored in *_cents columns → rendered as GBP £.

/** Booking lifecycle statuses used across venue-management. */
export const BOOKING_STATUSES = [
  "enquiry",
  "held",
  "confirmed",
  "completed",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export function coerceBookingStatus(raw: string | null | undefined): BookingStatus {
  const v = String(raw ?? "enquiry");
  return (BOOKING_STATUSES as readonly string[]).includes(v)
    ? (v as BookingStatus)
    : "enquiry";
}

/** Visual treatment for a booking status pill (StatusBadge doesn't cover these). */
export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; classes: string; kanbanDot: string }
> = {
  enquiry: {
    label: "Enquiry",
    classes: "bg-info-50 text-info-600 border-info-200",
    kanbanDot: "bg-info-500",
  },
  held: {
    label: "Held",
    classes: "bg-warning-50 text-warning-600 border-warning-200",
    kanbanDot: "bg-warning-500",
  },
  confirmed: {
    label: "Confirmed",
    classes: "bg-success-50 text-success-700 border-success-200",
    kanbanDot: "bg-success-500",
  },
  completed: {
    label: "Completed",
    classes: "bg-surface-100 text-surface-600 border-surface-200",
    kanbanDot: "bg-surface-400",
  },
  cancelled: {
    label: "Cancelled",
    classes: "bg-danger-50 text-danger-600 border-danger-200",
    kanbanDot: "bg-danger-500",
  },
};

/** Format a *_cents value as GBP (£). Returns "—" when null/undefined. */
export function formatGBP(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Format an ISO timestamp/date as a short UK date, or "—" when empty. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Format an ISO timestamp as a UK date + time, or "—" when empty. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format an ISO timestamp as just a time (HH:MM), or "—" when empty. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Local YYYY-MM-DD key for a date string (for calendar bucketing). */
export function dateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when a booking counts toward "upcoming" (future + not cancelled/completed). */
export function isUpcoming(status: string, startAt: string | null): boolean {
  if (status === "cancelled" || status === "completed") return false;
  if (!startAt) return status === "enquiry" || status === "held" || status === "confirmed";
  const t = new Date(startAt).getTime();
  return !Number.isNaN(t) && t >= Date.now();
}

export const STAFF_ROLE_LABEL: Record<string, string> = {
  "venue-manager": "Venue Manager",
  "head-chef": "Head Chef",
  "sous-chef": "Sous Chef",
  "floor-manager": "Floor Manager",
  "av-technician": "AV Technician",
  "bar-manager": "Bar Manager",
  server: "Server",
  porter: "Porter",
  security: "Security",
  other: "Other",
};

export const STAFF_ROLES = Object.keys(STAFF_ROLE_LABEL);

/** Whole-hours between two ISO timestamps (for staff shift duration). */
export function shiftHours(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  return Math.round(((b - a) / (1000 * 60 * 60)) * 10) / 10;
}
