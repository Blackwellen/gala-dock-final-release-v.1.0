// Q48: `<input type="datetime-local">` values carry no timezone ("2026-07-04T19:00"). Parsing it with `new Date(v)` on the server
// reads it as UTC instead, which moved every edited time one hour later during BST (and, on an on-sale event, made an untouched date
// look "changed" and blocked the save).
// Q72: a naive value is a wall-clock time in the EVENT's zone (events.timezone). Every helper takes that zone; it defaults to
// Europe/London, so existing UK data and call sites that don't pass a zone behave exactly as before. Pure module: client + server.
import { DEFAULT_TZ, utcToWallString, wallToUtcIso } from "@/lib/i18n/tz";

/** datetime-local value (wall time in `tz`, default London) or any ISO instant → UTC ISO string; null for blank or unparseable input. */
export function wallToIso(v: string | null | undefined, tz: string = DEFAULT_TZ): string | null {
  return wallToUtcIso(v, tz);
}

/** UTC instant → "YYYY-MM-DDTHH:mm" wall time in `tz` (default London) for a datetime-local input ("" when blank). */
export function isoToWall(iso: string | null | undefined, tz: string = DEFAULT_TZ): string {
  return utcToWallString(iso, tz);
}

/** Same instant to the minute (datetime-local inputs drop seconds). */
export const sameMinute = (a: string | null, b: string | null) => (a && b ? Math.floor(Date.parse(a) / 60000) === Math.floor(Date.parse(b) / 60000) : a === b);
