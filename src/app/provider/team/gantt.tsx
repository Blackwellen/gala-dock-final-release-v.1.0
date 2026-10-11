import Link from "next/link";
import { Avatar } from "@/components/workspace/kit";
import { day, time } from "@/lib/workspace/format";
import type { BlockRow, ShiftRow } from "./data";

type Crew = { id: string; name: string; role: string; avatar: string | null };
type Bar = { key: string; start: number; end: number; title: string; sub: string; tone: string; href?: string; label: string };
type Placed = Bar & { a: number; z: number; lane: number };

/** Each day column shows 08:00–24:00 (the working window in the designs); times outside clamp to the column edge. */
const H0 = 8, H1 = 24;

/**
 * Team availability as a week gantt ("Gala Dock Team Dashboard"): one row per person, bars placed by real start/end time,
 * running across days when an assignment does; overlapping items stack into lanes so nothing is hidden.
 */
export function TeamGantt({ crew, shifts, blocks, days, base }: { crew: Crew[]; shifts: ShiftRow[]; blocks: BlockRow[]; days: number[]; base: string }) {
  const weekStart = days[0], weekEnd = days[6] + 864e5;
  // Position along the 7-column axis (0..7). Hours are read in London time via the day boundaries passed in.
  const pos = (t: number) => {
    if (t <= weekStart) return 0;
    if (t >= weekEnd) return 7;
    const i = Math.min(6, Math.floor((t - weekStart) / 864e5)), into = (t - days[i]) / 36e5;
    return i + Math.min(1, Math.max(0, (into - H0) / (H1 - H0)));
  };
  const tone = (s: ShiftRow) => /setup|breakdown|load/i.test(s.title) ? "setup" : /site|meeting|visit/i.test(s.title) ? "meet" : /wedding|gala|party|reception/i.test(s.title) ? "special" : "event";
  const rows = crew.map(c => {
    const raw: Bar[] = [
      ...shifts.filter(s => s.crew_id === c.id).map(s => ({ key: s.id, start: +new Date(s.starts_at), end: +new Date(s.ends_at), title: s.title, sub: s.location, tone: tone(s),
        href: s.job_id ? `/provider/bookings/${s.job_id}` : `${base}/${c.id}?tab=assignments`, label: `${s.title}, ${day(s.starts_at, { weekday: "short", day: "numeric", month: "short" })} ${time(s.starts_at)}–${time(s.ends_at)}` })),
      ...blocks.filter(b => b.crew_id === c.id).map(b => ({ key: b.id, start: +new Date(b.starts_at), end: +new Date(b.ends_at), title: b.kind === "open" ? "Available" : b.note || "Unavailable", sub: "",
        tone: b.kind === "open" ? "free" : /holiday|leave/i.test(b.note) ? "hol" : "off", label: `${b.kind === "open" ? "Available" : b.note || "Unavailable"}, ${day(b.starts_at, { weekday: "short", day: "numeric", month: "short" })}` })),
    ];
    const bars = raw.filter(b => b.end > weekStart && b.start < weekEnd).map((b): Omit<Placed, "lane"> => ({ ...b, a: pos(b.start), z: Math.max(pos(b.end), pos(b.start) + 0.18) }))
      .filter(b => b.z > b.a).sort((x, y) => x.a - y.a);
    const laneEnd: number[] = [];
    const placed: Placed[] = bars.map(b => { let l = laneEnd.findIndex(e => e <= b.a + 0.01); if (l < 0) { l = laneEnd.length; laneEnd.push(0); } laneEnd[l] = b.z; return { ...b, lane: l }; });
    return { c, placed, lanes: Math.max(1, laneEnd.length) };
  });
  return <div className="pt-gantt" role="table" aria-label="Team availability this week">
    <div className="pt-g-head" role="row"><span role="columnheader"><span className="sr-only">Team member</span></span>
      {days.map(d => <b key={d} role="columnheader">{day(new Date(d + 12 * 36e5).toISOString(), { weekday: "short", day: "numeric", month: "short" })}</b>)}</div>
    {rows.map(({ c, placed, lanes }) => <div key={c.id} className="pt-g-row" role="row">
      <Link href={`${base}/${c.id}`} className="pt-who" role="rowheader"><Avatar src={c.avatar} name={c.name} size={30} /><span><b>{c.name}</b><small>{c.role}</small></span></Link>
      <div className="pt-g-track" role="cell" style={{ height: lanes * 44 + 6 }}>
        {placed.map(b => { const style = { left: `${(b.a / 7) * 100}%`, width: `calc(${((b.z - b.a) / 7) * 100}% - 6px)`, top: 4 + b.lane * 44 };
          const body = <><b>{b.title}</b>{b.sub && <small>{b.sub}</small>}</>;
          return b.href ? <Link key={b.key} href={b.href} className={`pt-bar ${b.tone}`} style={style} title={b.label} aria-label={b.label}>{body}</Link>
            : <span key={b.key} className={`pt-bar ${b.tone}`} style={style} title={b.label}>{body}</span>; })}
      </div></div>)}
  </div>;
}
