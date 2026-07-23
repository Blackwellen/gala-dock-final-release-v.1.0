import type { TeamAssignmentRow, TeamAvailabilityRow } from "../_data/queries";

export const STANDARD_DAILY_HOURS = 8;
export const STANDARD_WEEKLY_HOURS = 40;

export interface DayCell {
  date: Date;
  iso: string;
  label: string;
  dow: string;
  isWeekend: boolean;
  isToday: boolean;
}

/** Monday-start week containing `anchor`. */
export function getWeekStart(anchor: Date): Date {
  const d = new Date(anchor);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

export function buildWeekDays(weekStart: Date, count = 7): DayCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return {
      date,
      iso: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      dow: date.toLocaleDateString("en-GB", { weekday: "short" }),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isToday: date.getTime() === today.getTime(),
    };
  });
}

export function formatWeekRangeLabel(days: DayCell[]): string {
  if (days.length === 0) return "";
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${first.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${fmt(last)}`;
}

/** call_time/end_time are full timestamptz values (a specific call/wrap moment), not "HH:MM" strings. */
function parseTimestamp(t: string | null): Date | null {
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Hours an assignment occupies on a given calendar day, using call/end time if set. */
export function assignmentHoursOnDay(a: TeamAssignmentRow): number {
  const start = parseTimestamp(a.callTime);
  const end = parseTimestamp(a.endTime);
  if (start && end && end.getTime() > start.getTime()) {
    return (end.getTime() - start.getTime()) / 3_600_000;
  }
  return STANDARD_DAILY_HOURS;
}

/** "9:00 AM" style local time label for a call/end timestamp, or null if unset. */
export function formatCallTime(t: string | null): string | null {
  const d = parseTimestamp(t);
  if (!d) return null;
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

export function assignmentSpansDay(a: TeamAssignmentRow, iso: string): boolean {
  if (!a.startAt) return false;
  const start = a.startAt.slice(0, 10);
  const end = (a.endAt ?? a.startAt).slice(0, 10);
  return iso >= start && iso <= end;
}

export function blockSpansDay(b: TeamAvailabilityRow, iso: string): boolean {
  const start = b.startAt.slice(0, 10);
  const end = b.endAt.slice(0, 10);
  return iso >= start && iso <= end;
}

export type WorkloadStatus = "unavailable" | "overloaded" | "high" | "balanced" | "light";

export const WORKLOAD_STYLES: Record<WorkloadStatus, { label: string; dot: string; text: string; bg: string; border: string }> = {
  unavailable: { label: "Unavailable", dot: "bg-surface-400", text: "text-surface-500", bg: "bg-surface-100", border: "border-surface-200" },
  overloaded: { label: "Overloaded", dot: "bg-danger-500", text: "text-danger-600", bg: "bg-danger-50", border: "border-danger-200" },
  high: { label: "High", dot: "bg-warning-500", text: "text-warning-600", bg: "bg-warning-50", border: "border-warning-200" },
  balanced: { label: "Balanced", dot: "bg-success-500", text: "text-success-700", bg: "bg-success-50", border: "border-success-200" },
  light: { label: "Light", dot: "bg-info-500", text: "text-info-600", bg: "bg-info-50", border: "border-info-200" },
};

export function classifyWorkload(scheduledHours: number, hasFullWeekBlock: boolean): WorkloadStatus {
  if (hasFullWeekBlock && scheduledHours === 0) return "unavailable";
  const pct = scheduledHours / STANDARD_WEEKLY_HOURS;
  if (pct > 1) return "overloaded";
  if (pct >= 0.85) return "high";
  if (pct >= 0.4) return "balanced";
  return "light";
}
