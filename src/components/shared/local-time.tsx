"use client";
// Q72 · Viewer-local time hint next to an event time shown in the EVENT's zone. Renders nothing on the server and when the
// viewer's browser zone has the same offset as the event's at that instant, so UK visitors to UK events see no change.
import { useHydrated } from "@/lib/use-hydrated";
import { todayIn, tzOffsetMinutes, wallParts } from "@/lib/i18n/tz";
import { t } from "@/lib/i18n/messages";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "(18:00 your time)" or "(Sun 4 Jul, 02:00 your time)" when the calendar day differs. */
export function LocalTimeHint({ iso, tz, className }: { iso: string | null | undefined; tz: string; className?: string }) {
  const ready = useHydrated();
  if (!ready || !iso) return null;
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return null;
  let viewer = "";
  try { viewer = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
  if (!viewer || viewer === tz || tzOffsetMinutes(d, viewer) === tzOffsetMinutes(d, tz)) return null;
  const v = wallParts(d, viewer), e = wallParts(d, tz);
  const hm = `${String(v.h).padStart(2, "0")}:${String(v.mi).padStart(2, "0")}`;
  const label = v.d === e.d && v.mo === e.mo ? hm : `${DOW[v.dow]} ${v.d} ${MON[v.mo - 1]}, ${hm}`;
  return <small className={className} style={className ? undefined : { opacity: 0.75, marginLeft: 6 }}>({t("checkout.your_time", { time: label })})</small>;
}

/**
 * Q72 · "Today" (YYYY-MM-DD) for date-picker minimums in the VIEWER's zone. Server render and hydration use `fallbackTz`
 * (London by default) so the markup matches; after hydration it switches to the browser's own calendar date. Replaces
 * `new Date().toISOString().slice(0, 10)`, which is the UTC date (yesterday between 00:00 and 01:00 BST).
 */
export function useToday(fallbackTz: string = "Europe/London"): string {
  const ready = useHydrated();
  let tz = fallbackTz;
  if (ready) { try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || fallbackTz; } catch { /* keep fallback */ } }
  return todayIn(tz);
}
