"use client";
import Link from "next/link";
import { List, LayoutGrid, CalendarDays } from "lucide-react";

// Order follows the ORG-002 design (List · Cards · Calendar); Cards is the default.
const VIEWS = [["list", "List", List], ["cards", "Cards", LayoutGrid], ["calendar", "Calendar", CalendarDays]] as const;

function remember(cookie: string, v: string) { document.cookie = `${cookie}=${v}; path=/organizer; max-age=${60 * 60 * 24 * 365}; samesite=lax`; }

/** View switcher that remembers the organizer's last choice in `cookie` (read by /organizer/events when the URL has no ?view). */
export function EventsViewSeg({ view, hrefs, cookie }: { view: string; hrefs: Record<(typeof VIEWS)[number][0], string>; cookie: string }) {
  return <div className="k-seg" role="group" aria-label="View">{VIEWS.map(([k, l, I]) => <Link key={k} href={hrefs[k]} onClick={() => remember(cookie, k)} aria-current={view === k ? "page" : undefined}><I size={15} />{l}</Link>)}</div>;
}
