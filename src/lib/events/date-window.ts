// Q47: Discover's "Tonight" / "This Weekend" chips in UK time. The server runs in UTC, so `setHours` / `getDay()` on a server Date
// closed "tonight" at 00:59 BST and could pick the wrong day; "weekend" had no start, so on a Tuesday it listed Tuesday to Sunday.
// Pure module: safe on the client and the server.
import { londonOffset, londonToUtc } from "@/lib/agent/schedule";

export type DateWindow = { from: Date | null; to: Date };

/** London wall-clock parts for an instant. */
function londonParts(now: Date) {
  const w = new Date(now.getTime() + londonOffset(now) * 60000);
  return { y: w.getUTCFullYear(), m: w.getUTCMonth() + 1, d: w.getUTCDate(), dow: w.getUTCDay(), h: w.getUTCHours() };
}
/** The London calendar day `days` after (y, m, d). */
function addDays(y: number, m: number, d: number, days: number) {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * The window an event must overlap (`ends_at >= from`, `starts_at <= to`) for a date chip.
 * tonight: until 23:59:59 today (London). weekend: Friday 17:00 → Sunday 23:59:59 (London) — the coming one, or the current one
 * from Friday 17:00 to Sunday night. week / month: the next 7 / 31 days. Unknown values return null.
 */
export function dateWindow(kind: string | undefined, now = new Date()): DateWindow | null {
  const p = londonParts(now);
  const endOf = (day: { y: number; m: number; d: number }) => new Date(londonToUtc(day.y, day.m, day.d, 23, 59).getTime() + 59_999);
  if (kind === "tonight") return { from: null, to: endOf(p) };
  if (kind === "weekend") {
    // Days until Sunday (0 on Sunday); Friday is two days before it.
    const toSun = (7 - p.dow) % 7;
    const sun = addDays(p.y, p.m, p.d, toSun), fri = addDays(sun.y, sun.m, sun.d, -2);
    const start = londonToUtc(fri.y, fri.m, fri.d, 17, 0);
    return { from: start > now ? start : null, to: endOf(sun) };
  }
  if (kind === "week" || kind === "month") return { from: null, to: new Date(now.getTime() + (kind === "week" ? 7 : 31) * 864e5) };
  return null;
}
