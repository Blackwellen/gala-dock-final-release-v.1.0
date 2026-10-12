import Link from "next/link";

export const RANGES = [7, 30, 90] as const;
export const parseRange = (v: unknown) => (RANGES.includes(Number(v) as never) ? Number(v) : 30) as (typeof RANGES)[number];

/** Period picker for event charts (7 / 30 / 90 days). A link group, so the server reloads the series for that window. */
export function RangeLinks({ eventId, tab, current }: { eventId: string; tab: string; current: number }) {
  return <div className="k-seg ev-range" role="group" aria-label="Period">{RANGES.map(r =>
    <Link key={r} href={`/organizer/events/${eventId}?tab=${tab}&range=${r}`} aria-current={r === current ? "page" : undefined} scroll={false}>{r}d</Link>)}</div>;
}
