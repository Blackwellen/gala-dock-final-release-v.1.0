/** Display formatters shared by Provider and Admin screens. Pure functions; safe on server and client. */

/** Request time for server-rendered screens (deadlines and countdowns are computed against it). */
export const requestTime = () => Date.now();
const locale = "en-GB";

export function money(value: number | string | null | undefined, currency = "GBP", opts: { cents?: boolean; compact?: boolean } = {}) {
  const n = Number(value ?? 0);
  if (opts.compact && Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 }).format(n);
}
export const num = (value: number | null | undefined) => new Intl.NumberFormat(locale).format(Number(value ?? 0));
export const pct = (value: number, digits = 0) => `${value.toFixed(digits)}%`;

export function day(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) {
  return iso ? new Intl.DateTimeFormat(locale, { timeZone: "Europe/London", ...opts }).format(new Date(iso)) : "—";
}
export function time(iso: string | null | undefined) {
  return iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "";
}
export const timeRange = (a?: string | null, b?: string | null) => (a ? `${time(a)} – ${time(b)}` : "");

/** "1h 36m", "2d 4h" — remaining time until a server-issued deadline. Negative means overdue. */
export function countdown(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return { label: "—", overdue: false, urgent: false };
  const ms = new Date(iso).getTime() - now;
  const overdue = ms < 0;
  const mins = Math.floor(Math.abs(ms) / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const label = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  return { label: overdue ? `${label} overdue` : label, overdue, urgent: !overdue && ms < 60 * 60000 };
}

export function relative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
export const titleCase = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

/** Percentage change between two periods, rounded; null when there is no baseline. */
export function delta(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
