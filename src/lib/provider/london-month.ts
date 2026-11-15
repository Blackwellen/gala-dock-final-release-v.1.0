import { dateIn, zonedToUtc, DEFAULT_TZ } from "@/lib/i18n/tz";

/**
 * Q49: provider Money statements grouped transactions into UTC months (and printed UTC dates), so a payment at 00:30 on
 * 1 July (BST) landed on June's statement. Business months are the WORKSPACE's months: Q76 adds the zone (workspace
 * settings.timezone, see workspaceLocale) — Europe/London by default, so UK statements are unchanged. Pure: server and client.
 */
export const londonDateKey = (iso: string, tz: string = DEFAULT_TZ) => Number.isNaN(Date.parse(iso)) ? iso.slice(0, 10) : dateIn(iso, tz);
export const londonMonthKey = (iso: string, tz: string = DEFAULT_TZ) => londonDateKey(iso, tz).slice(0, 7);
export const currentLondonMonth = (now = Date.now(), tz: string = DEFAULT_TZ) => londonMonthKey(new Date(now).toISOString(), tz);

/** [from, to) UTC instants of a calendar month "YYYY-MM" in `tz`. */
export function londonMonthRange(ym: string, tz: string = DEFAULT_TZ): [number, number] {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return [zonedToUtc(y, m, 1, 0, 0, tz).getTime(), zonedToUtc(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, 0, tz).getTime()];
}

/** "July 2026" for "2026-07". */
export const londonMonthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
