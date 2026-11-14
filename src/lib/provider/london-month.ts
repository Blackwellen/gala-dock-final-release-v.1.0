import { isoToWall } from "@/lib/events/wall-time";
import { londonToUtc } from "@/lib/agent/schedule";

/**
 * Q49: provider Money statements grouped transactions into UTC months (and printed UTC dates), so a payment at 00:30 on
 * 1 July (BST) landed on June's statement. Business months are Europe/London months. Pure: safe on server and client.
 */
export const londonDateKey = (iso: string) => isoToWall(iso).slice(0, 10) || iso.slice(0, 10);
export const londonMonthKey = (iso: string) => londonDateKey(iso).slice(0, 7);
export const currentLondonMonth = (now = Date.now()) => londonMonthKey(new Date(now).toISOString());

/** [from, to) UTC instants of a London calendar month "YYYY-MM". */
export function londonMonthRange(ym: string): [number, number] {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return [londonToUtc(y, m, 1, 0, 0).getTime(), londonToUtc(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, 0).getTime()];
}

/** "July 2026" for "2026-07". */
export const londonMonthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
