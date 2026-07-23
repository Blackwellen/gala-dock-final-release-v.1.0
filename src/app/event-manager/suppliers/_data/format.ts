import { ANCHOR_DATE } from "./demo-data";

/** Format an ISO date as "10 Jul 2026", or "—" when absent/invalid. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Whole-day difference from the anchor date; positive = future, negative = past. */
export function daysFromToday(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - ANCHOR_DATE.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** "N days ago" for a past date, "—" if absent. */
export function relativePast(value: string | null | undefined): string {
  const n = daysFromToday(value);
  if (n === null) return "—";
  const days = Math.abs(n);
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/** "in N days" / "Due today" / "Overdue" for a future-leaning date. */
export function relativeFuture(value: string | null | undefined): string {
  const n = daysFromToday(value);
  if (n === null) return "—";
  if (n < 0) return "Overdue";
  if (n === 0) return "Due today";
  if (n === 1) return "In 1 day";
  return `In ${n} days`;
}

export function isOverdue(value: string | null | undefined): boolean {
  const n = daysFromToday(value);
  return n !== null && n < 0;
}

export function formatGBP(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}
