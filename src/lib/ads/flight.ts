// Q56: boost start dates are London calendar days. Pure module (client + server + unit tests).
// Before: the dialog sent `${day}T09:00` parsed in the browser's own timezone, and the server refused any start more than a minute in
// the past — so buying with the default date (today) failed every day after 09:00 ("Choose a start date from today onwards").
import { wallToIso } from "@/lib/events/wall-time";

/** Where each boost product is actually shown (Q56: the "homepage" product is served in the Discover hero; search is a labelled row). */
export const BOOST_PLACEMENT: Record<string, string> = { discover: "Featured on Discover", category: "Spotlight in its category", homepage: "Discover hero (rotating)",
  search: "Sponsored row in matching searches", marketplace: "Sponsored marketplace tile" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in London as YYYY-MM-DD (the min / default of the start-date input). */
export const londonToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/**
 * The boost start instant for a chosen London day: today (or an earlier day) → null, meaning "start now"; a later day → 00:00 London
 * that day. Invalid input → undefined (refuse).
 */
export function boostStartIso(day: string | null | undefined, now = new Date()): string | null | undefined {
  if (!day) return null;
  if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return undefined;
  if (day <= londonToday(now)) return null;
  return wallToIso(`${day}T00:00`);
}
