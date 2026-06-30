// Gala Dock — Calendar hub pure date helpers (V1-2).
// No server imports — safe in client + server.
// Month grids are Monday-start, computed in UTC to stay deterministic across environments.
// V1-2 adds: week range, day range, time positioning helpers for Week + Day views.

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function todayMonthKey(): string {
  return monthKeyOf(new Date());
}

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function todayISODateTime(): string {
  return new Date().toISOString();
}

export function parseMonthKey(key: string): { y: number; m: number } {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    const now = new Date();
    return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 };
  }
  return { y, m };
}

export function addMonths(key: string, delta: number): string {
  const { y, m } = parseMonthKey(key);
  return monthKeyOf(new Date(Date.UTC(y, m - 1 + delta, 1)));
}

/** Parse an ISO date string "YYYY-MM-DD" to { y, m, d }. */
export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y: y ?? 2026, m: m ?? 6, d: d ?? 1 };
}

/** Return "YYYY-MM-DD" for a date N days offset from the given ISO date. */
export function addDays(isoDate: string, delta: number): string {
  const { y, m, d } = parseISODate(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing the given ISO date. */
export function weekStartOf(isoDate: string): string {
  const { y, m, d } = parseISODate(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = Sun
  const mondayOffset = (dow + 6) % 7; // Mon = 0
  return addDays(isoDate, -mondayOffset);
}

export interface MonthGrid {
  /** 42 day cells (6 weeks), each "YYYY-MM-DD", Monday-first. */
  days: string[];
  gridStartISO: string;
  gridEndISO: string;
  monthLabel: string;
  /** Numeric month for "in this month" checks (1-12). */
  month: number;
  year: number;
}

export function monthGrid(key: string): MonthGrid {
  const { y, m } = parseMonthKey(key);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - mondayOffset);

  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(gridStart);
    dt.setUTCDate(gridStart.getUTCDate() + i);
    days.push(dt.toISOString().slice(0, 10));
  }
  const gridEnd = new Date(gridStart);
  gridEnd.setUTCDate(gridStart.getUTCDate() + 42);

  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    days,
    gridStartISO: gridStart.toISOString(),
    gridEndISO: gridEnd.toISOString(),
    monthLabel,
    month: m,
    year: y,
  };
}

export interface WeekGrid {
  /** 7 day ISO strings Mon–Sun. */
  days: string[];
  gridStartISO: string;
  gridEndISO: string;
  weekLabel: string;
  /** Monday "YYYY-MM-DD" for URL state. */
  weekKey: string;
}

/** Build 7-day Mon–Sun grid for the week containing `isoDate`. */
export function weekGrid(isoDate: string): WeekGrid {
  const monday = weekStartOf(isoDate);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(monday, i));

  const start = new Date(days[0] + "T00:00:00Z");
  const end = new Date(days[6] + "T23:59:59Z");

  const fmt = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  const weekLabel = `${fmt(days[0])} – ${fmt(days[6])} ${start.getUTCFullYear()}`;

  return {
    days,
    gridStartISO: start.toISOString(),
    gridEndISO: end.toISOString(),
    weekLabel,
    weekKey: monday,
  };
}

/** Labels for day columns in week view: "Mon 16", "Tue 17", etc. */
export function weekDayLabels(days: string[]): Array<{ short: string; num: string; iso: string }> {
  const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((iso, i) => ({
    short: SHORT[i],
    num: iso.slice(8).replace(/^0/, ""),
    iso,
  }));
}

/** Navigate a week by delta weeks. */
export function addWeeks(weekKey: string, delta: number): string {
  return addDays(weekKey, delta * 7);
}

/** Navigate a day. */
export function addDayKey(isoDate: string, delta: number): string {
  return addDays(isoDate, delta);
}

/** Full label for Day view: "Thursday, June 18 2026". */
export function dayLabel(isoDate: string): string {
  return new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Month name + year for month grid header: "June 2026". */
export function monthLabel(isoDate: string): string {
  return new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Range label for agenda view: "Jun 9 – Jul 6, 2026". */
export function agendaRangeLabel(fromISO: string, toISO: string): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const year = toISO.slice(0, 4);
  return `${fmt(fromISO)} – ${fmt(toISO)}, ${year}`;
}

/** Time in minutes from midnight for a datetime string. */
export function timeToMinutes(isoDatetime: string): number {
  const t = isoDatetime.slice(11, 16); // "HH:MM"
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Pixel position from grid top given a time (hour + minute). Grid starts at startHour. */
export function timeToPx(hour: number, minute: number, startHour: number, pxPerHour: number): number {
  return ((hour - startHour) + minute / 60) * pxPerHour;
}

/** Duration in pixels. */
export function durationToPx(minutes: number, pxPerHour: number): number {
  return (minutes / 60) * pxPerHour;
}

/** Format time for display: "10:00 AM". */
export function formatTime(isoDatetime: string): string {
  const [hStr, mStr] = isoDatetime.slice(11, 16).split(":");
  let h = Number(hStr ?? 0);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/** Format time range: "9:30 AM – 5:30 PM". */
export function formatTimeRange(startsAt: string, endsAt?: string | null): string {
  if (!endsAt) return formatTime(startsAt);
  return `${formatTime(startsAt)} – ${formatTime(endsAt)}`;
}

/** "Mon 16" short label for week columns. */
export function shortDayLabel(isoDate: string): string {
  return new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Jun\n15" split label for agenda date tiles. */
export function agendaDateParts(isoDate: string): { month: string; day: string } {
  const dt = new Date(isoDate + "T00:00:00Z");
  return {
    month: dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase(),
    day: String(dt.getUTCDate()),
  };
}

/** Group an array of items by the date portion of startsAt. Returns sorted entries. */
export function groupByDate<T extends { startsAt: string }>(items: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const day = it.startsAt.slice(0, 10);
    if (!day) continue;
    const list = map.get(day) ?? [];
    list.push(it);
    map.set(day, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Get the items for a specific date from a grouped map. */
export function itemsForDay(byDay: Map<string, unknown[]>, isoDate: string): unknown[] {
  return byDay.get(isoDate) ?? [];
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Hours to show on the time axis for week/day views. */
export function timeAxisHours(startHour = 7, endHour = 24): string[] {
  const labels: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    if (h === 0 || h === 24) labels.push("12 AM");
    else if (h < 12) labels.push(`${h}:00 AM`);
    else if (h === 12) labels.push("12 PM");
    else labels.push(`${h - 12}:00 PM`);
  }
  return labels;
}

/** Check if two date strings overlap (inclusive). */
export function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

/** Is item a multi-day item spanning given week row? */
export function spansWeek(
  itemStart: string,
  itemEnd: string,
  weekStart: string,
  weekEnd: string
): boolean {
  return datesOverlap(itemStart.slice(0, 10), itemEnd.slice(0, 10), weekStart, weekEnd);
}

/** Calculate column start (0-6) and span for multi-day in a week row. */
export function multiDaySpan(
  itemStart: string,
  itemEnd: string,
  weekDays: string[]
): { startCol: number; span: number } {
  const itemStartDate = itemStart.slice(0, 10);
  const itemEndDate = itemEnd.slice(0, 10);
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const effectiveStart = itemStartDate < weekStart ? weekStart : itemStartDate;
  const effectiveEnd = itemEndDate > weekEnd ? weekEnd : itemEndDate;

  const startCol = weekDays.indexOf(effectiveStart);
  const endCol = weekDays.indexOf(effectiveEnd);
  const span = (startCol >= 0 && endCol >= 0) ? endCol - startCol + 1 : 7;

  return {
    startCol: startCol >= 0 ? startCol : 0,
    span: Math.max(1, span),
  };
}

/** Format a date for the "Today • Monday, June 9" header in agenda. */
export function agendaDayHeader(isoDate: string, todayISO: string): { label: string; isToday: boolean } {
  const isToday = isoDate === todayISO;
  const dt = new Date(isoDate + "T00:00:00Z");
  const label = dt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return { label, isToday };
}
