/* Portal display formatting (Europe/London, en-GB). Pure functions — safe on server and client. */
const TZ = "Europe/London";

export function fmt(value: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (value === null || value === undefined || value === "") return "—";
  const d = value instanceof Date ? value : new Date(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(d);
}

/** "24 – 25 Oct 2026", "24 Oct – 2 Nov 2026" or a single day. */
export function dateRange(start: string | null, end: string | null) {
  if (!start) return "Date to be confirmed";
  const a = new Date(start), b = end ? new Date(end) : null;
  const key = (d: Date, o: Intl.DateTimeFormatOptions) => fmt(d, o);
  if (!b || key(a, { day: "numeric", month: "numeric", year: "numeric" }) === key(b, { day: "numeric", month: "numeric", year: "numeric" })) return fmt(a);
  if (key(a, { month: "numeric", year: "numeric" }) === key(b, { month: "numeric", year: "numeric" })) return `${fmt(a, { day: "numeric" })} – ${fmt(b)}`;
  return `${fmt(a, { day: "numeric", month: "short" })} – ${fmt(b)}`;
}

/** "Sat 18:00 – Sun 02:00" */
export function timeRange(start: string | null, end: string | null) {
  if (!start) return "Times to be confirmed";
  const t = (d: string) => `${fmt(d, { weekday: "short" })} ${fmt(d, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  return end ? `${t(start)} – ${t(end)}` : t(start);
}

/** "2h ago" (compact) or "2 hours ago" (long). */
export function ago(iso: string | null | undefined, now: number, long = false) {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  const unit = (n: number, s: string, l: string) => (long ? `${n} ${l}${n === 1 ? "" : "s"} ago` : `${n}${s} ago`);
  if (mins < 1) return "just now";
  if (mins < 60) return unit(mins, "m", "minute");
  const h = Math.round(mins / 60);
  if (h < 24) return unit(h, "h", "hour");
  const d = Math.round(h / 24);
  return d < 30 ? unit(d, "d", "day") : fmt(iso);
}

const STATUS: Record<string, string> = { draft: "Draft", planning: "In Planning", ready: "Ready", published: "Published", on_sale: "On Sale", live: "Live", completed: "Completed",
  closed: "Closed", archived: "Archived", cancelled: "Cancelled", postponed: "Postponed", suspended: "Suspended" };
export const statusLabel = (s: string) => STATUS[s] ?? s;

export function pctDelta(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}
