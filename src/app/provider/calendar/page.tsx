import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarCheck, LockKeyhole, Users, Clock4, TriangleAlert, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, CalendarCog, SlidersHorizontal, Settings2,
  CalendarX, CalendarPlus, Siren, Sparkles, ArrowRight, CircleCheck, Zap, ChartColumn, UserX, MapPin, Square, SquareCheck } from "lucide-react";
import "@/styles/provider-calendar.css";
import { Kpi, Thumb, Avatar, Tabs, Empty } from "@/components/workspace/kit";
import { requestTime, day } from "@/lib/workspace/format";
import { startOfDay } from "@/lib/provider/queries";
import { ParamSelect } from "../_components/param-select";
import { RowMenu } from "../_components/row-menu";
import { releaseHold } from "../opportunities/actions";
import { calendarData, LAYERS, type Entry, type Layer, type Row } from "./data";
import { AvailabilityDialog } from "./availability-dialog";

export const metadata: Metadata = { title: "Calendar" };
type View = "month" | "week" | "day" | "agenda";
const london = (t: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...o }).format(new Date(t));
const hm = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit" }).format(new Date(t));
const ymd = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(t));
const kindLayer: Record<Entry["kind"], Layer> = { booking: "bookings", hold: "holds", standby: "standby", block: "availability", emergency: "emergency", shift: "team" };

export default async function CalendarPage(props: PageProps<"/provider/calendar">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const view = (["month", "week", "day", "agenda"].includes(str("view")) ? str("view") : "week") as View;
  const now = requestTime();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(str("date")) ? startOfDay(0, new Date(`${str("date")}T12:00:00Z`).getTime()) : startOfDay(0, now);
  const dow = (new Date(anchor + 12 * 36e5).getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = startOfDay(-dow, anchor);
  const monthFirst = (() => { const d = new Date(anchor + 12 * 36e5); return startOfDay(0, Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)); })();
  const monthGridStart = startOfDay(-((new Date(monthFirst + 12 * 36e5).getUTCDay() + 6) % 7), monthFirst);
  const [from, to] = view === "day" ? [anchor, startOfDay(1, anchor)] : view === "month" ? [monthGridStart, startOfDay(42, monthGridStart)] : view === "agenda" ? [anchor, startOfDay(30, anchor)] : [weekStart, startOfDay(7, weekStart)];
  const d = await calendarData(from, to);
  const layerParam = str("layers");
  const layers = new Set<Layer>(layerParam ? layerParam.split(",").filter((l): l is Layer => LAYERS.some(x => x.key === l)) : LAYERS.map(l => l.key));
  const allOn = layers.size === LAYERS.length;
  const spaceFilter = str("space"), crewFilter = str("crew");
  const entries = d.entries.filter(e => layers.has(kindLayer[e.kind]));
  const venueRows = layers.has("resources") || layers.has("bookings") || layers.has("holds") ? d.rows.venue.filter(r => !spaceFilter || r.key === spaceFilter) : [];
  const teamRows = layers.has("team") ? d.rows.team.filter(r => !crewFilter || r.key === crewFilter) : [];
  const days = Array.from({ length: view === "day" ? 1 : 7 }, (_, i) => startOfDay(i, view === "day" ? anchor : weekStart));
  const today = startOfDay(0, now);

  const qs = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(patch)) { if (v === null) n.delete(k); else n.set(k, v); }
    return `/provider/calendar${n.toString() ? `?${n}` : ""}`;
  };
  const toggleLayer = (l: Layer | "all") => {
    if (l === "all") return qs({ layers: null });
    const next = new Set(layers); if (allOn) { next.clear(); next.add(l); } else if (next.has(l)) next.delete(l); else next.add(l);
    return qs({ layers: next.size === LAYERS.length || next.size === 0 ? null : [...next].join(",") });
  };
  const step = view === "day" ? 1 : view === "month" ? 31 : 7;
  const prev = ymd(view === "month" ? startOfDay(-1, monthFirst) : startOfDay(-step, view === "day" ? anchor : weekStart));
  const next = ymd(view === "month" ? startOfDay(32, monthFirst) : startOfDay(step, view === "day" ? anchor : weekStart));
  const rangeLabel = view === "day" ? london(anchor, { weekday: "long", day: "numeric", month: "short", year: "numeric" })
    : view === "month" ? london(monthFirst + 12 * 36e5, { month: "long", year: "numeric" })
    : view === "agenda" ? `${london(from, { day: "numeric", month: "short" })} – ${london(to - 1, { day: "numeric", month: "short", year: "numeric" })}`
    : `${london(weekStart, { month: "short", day: "numeric" })} – ${london(startOfDay(6, weekStart), { day: "numeric" })}, ${london(weekStart, { year: "numeric" })}`;
  const targets = [...d.rows.venue.map(r => ({ value: r.key, label: r.title })), ...d.rows.team.map(r => ({ value: r.key, label: `${r.title} (team)` }))];

  const cell = (row: Row, dayStart: number) => {
    const dayEnd = startOfDay(1, dayStart);
    const list = entries.filter(e => e.rowKey === row.key && e.start < dayEnd && e.end > dayStart).sort((a, b) => a.start - b.start);
    if (!list.length) return row.group === "team" ? <div className="pcal-free">Available</div>
      : <Link className="pcal-free add" href={qs({ action: "open", target: row.key, date: ymd(dayStart) })}>Available<span>+ Add</span></Link>;
    return list.slice(0, 2).map(e => <CalEntry key={e.id} e={e} now={now} />);
  };

  return <div className="pcal">
    <header className="ws-page-head pcal-head">
      <div><h1>Calendar</h1><p>Control your availability, holds, bookings and team capacity.</p></div>
      <div className="ws-page-actions">
        <Link className="ws-btn outline" href="/provider/settings?tab=integrations"><RefreshCw aria-hidden="true" />Sync external calendar</Link>
        <Link className="ws-btn outline" href={qs({ action: "block" })}><CalendarCog aria-hidden="true" />Manage availability</Link>
      </div>
    </header>
    <div className="pcal-layout">
      <div className="pcal-main">
        <Tabs base="/provider/calendar" param="view" active={view} tabs={[{ key: "month", label: "Month" }, { key: "week", label: "Week" }, { key: "day", label: "Day" }, { key: "agenda", label: "Agenda" }]} />
        <nav className="pcal-chips" aria-label="Layers">
          <Link href={toggleLayer("all")} className={allOn ? "on" : ""} aria-pressed={allOn}>All</Link>
          {LAYERS.map(l => <Link key={l.key} href={toggleLayer(l.key)} className={!allOn && layers.has(l.key) ? "on" : ""} aria-pressed={!allOn && layers.has(l.key)}>{l.label}</Link>)}
        </nav>
        <section className="ws-kpis pcal-kpis" aria-label="Calendar figures">
          <Kpi icon={CalendarCheck} tone="blue" label="Confirmed Bookings" value={d.kpi.confirmed} series={sparkFor(d.entries, "booking", from, to)} />
          <Kpi icon={LockKeyhole} tone="pink" label="Conditional Holds" value={d.kpi.holds} series={sparkFor(d.entries, "hold", from, to)} />
          <Kpi icon={Users} tone="purple" label="Standby Commitments" value={d.kpi.standby} series={sparkFor(d.entries, "standby", from, to)} />
          <div className="ws-kpi"><span className="ws-tile blue" style={{ width: 44, height: 44 }}><Clock4 aria-hidden="true" /></span><div className="ws-kpi-text"><span>Available Time</span><strong>{d.kpi.available}%</strong><small className="pcal-kpi-sub">Space hours free this {view === "month" ? "month" : view === "day" ? "day" : "week"}</small></div></div>
          <div className="ws-kpi"><span className="ws-tile red" style={{ width: 44, height: 44 }}><TriangleAlert aria-hidden="true" /></span><div className="ws-kpi-text"><span>Emergency Windows</span><strong>{d.kpi.emergency}</strong><small className="pcal-kpi-sub">Published and upcoming</small></div></div>
        </section>
        <section className="ws-panel pcal-board">
          <div className="pcal-toolbar">
            <Link className="pcal-nav" href={qs({ date: prev })} aria-label="Previous"><ChevronLeft aria-hidden="true" /></Link>
            <Link className="pcal-nav" href={qs({ date: next })} aria-label="Next"><ChevronRight aria-hidden="true" /></Link>
            <b className="pcal-range">{rangeLabel}</b>
            <Link className="ws-btn outline sm" href={qs({ date: null })}>Today</Link>
            <span className="ws-spacer" />
            <Suspense>
              <ParamSelect param="space" label="Venue or service" value={spaceFilter} options={[{ value: "", label: "All venues & services" }, ...d.rows.venue.map(r => ({ value: r.key, label: r.title }))]} />
              <ParamSelect param="crew" label="Team member" value={crewFilter} options={[{ value: "", label: "All team members" }, ...d.rows.team.map(r => ({ value: r.key, label: r.title }))]} />
            </Suspense>
            <Link className="ws-btn outline sm" href={qs({ space: null, crew: null, layers: null })}><SlidersHorizontal aria-hidden="true" />{spaceFilter || crewFilter || !allOn ? "Reset filters" : "More filters"}</Link>
            <Link className="ws-btn outline sm" href="/provider/settings?tab=notifications"><Settings2 aria-hidden="true" />View settings</Link>
          </div>

          {(view === "week" || view === "day") && <div className="pcal-grid" style={{ ["--cols" as string]: days.length }}>
            <div className="pcal-corner" />
            {days.map(t => <div key={t} className={`pcal-dayhead ${t === today ? "today" : ""}`}><b>{london(t + 12 * 36e5, { weekday: view === "day" ? "long" : "short" })}</b><small>{london(t + 12 * 36e5, { day: "numeric", month: "short" })}</small></div>)}
            {venueRows.length > 0 && <div className="pcal-group"><ChevronDown aria-hidden="true" />Spaces &amp; Venues</div>}
            {venueRows.map(r => <RowCells key={r.key} row={r} days={days} cell={cell} />)}
            {teamRows.length > 0 && <div className="pcal-group"><ChevronDown aria-hidden="true" />Team &amp; Resources</div>}
            {teamRows.map(r => <RowCells key={r.key} row={r} days={days} cell={cell} />)}
            {!venueRows.length && !teamRows.length && <div className="pcal-group">No rows match these layers.</div>}
          </div>}

          {view === "month" && <div className="pcal-month">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(n => <b key={n}>{n}</b>)}
            {Array.from({ length: 42 }, (_, i) => startOfDay(i, monthGridStart)).map(t => {
              const list = entries.filter(e => e.start < startOfDay(1, t) && e.end > t && e.kind !== "shift");
              const out = new Date(t + 12 * 36e5).getUTCMonth() !== new Date(monthFirst + 12 * 36e5).getUTCMonth();
              return <Link key={t} href={qs({ view: "day", date: ymd(t) })} className={`pcal-mcell ${out ? "out" : ""} ${t === today ? "today" : ""}`}>
                <span>{london(t + 12 * 36e5, { day: "numeric" })}</span>
                {list.slice(0, 3).map(e => <i key={e.id} className={`pcal-pill ${e.tone} ${e.kind}`}>{e.kind === "hold" ? "Hold · " : e.kind === "emergency" ? "⚡ " : ""}{e.title}</i>)}
                {list.length > 3 && <small>+{list.length - 3} more</small>}</Link>;
            })}
          </div>}

          {view === "agenda" && (() => {
            const list = entries.filter(e => e.kind !== "shift").sort((a, b) => a.start - b.start);
            const byDay = new Map<number, Entry[]>(); for (const e of list) { const k = startOfDay(0, e.start); byDay.set(k, [...(byDay.get(k) ?? []), e]); }
            return byDay.size ? <div className="pcal-agenda">{[...byDay].map(([t, es]) => <section key={t}><h3>{london(t + 12 * 36e5, { weekday: "long", day: "numeric", month: "long" })}</h3>
              <ul>{es.map(e => { const row = [...d.rows.venue, ...d.rows.team].find(r => r.key === e.rowKey); return <li key={e.id}><time>{hm(e.start)} – {hm(e.end)}</time><i className={`pcal-dot ${e.tone}`} />
                {e.href ? <Link href={e.href}><b>{e.title}</b><small>{row?.title} · {e.status}</small></Link> : <span><b>{e.title}</b><small>{row?.title} · {e.status}</small></span>}</li>; })}</ul></section>)}</div>
              : <Empty icon={CalendarCheck} title="Nothing scheduled in the next 30 days" />;
          })()}
        </section>

        <div className="pcal-bottom">
          <section className="ws-panel pcal-upcoming"><h2><Sparkles aria-hidden="true" />Upcoming next 7 days</h2>
            {d.upcoming.length ? <div>{d.upcoming.map(j => <Link key={j.id} href={`/provider/bookings/${j.id}`}><Thumb src={j.image} w={64} h={64} /><span><b>{j.event_name}</b>
              <small><CalendarCheck aria-hidden="true" />{day(j.starts_at, { weekday: "short", day: "numeric", month: "short" })} · {hm(new Date(j.starts_at).getTime())}</small><small><MapPin aria-hidden="true" />{j.spaceName}</small>
              <small><Users aria-hidden="true" />{j.guests ?? "—"} guests</small></span><ChevronRight aria-hidden="true" /></Link>)}</div> : <p className="ws-muted">Nothing booked in the next 7 days.</p>}</section>
          <section className="ws-panel pcal-risk"><div className="ws-panel-head"><h2><TriangleAlert aria-hidden="true" />At risk / needs attention</h2><Link className="ws-link" href="/provider/opportunities?tab=holds">View all <ArrowRight aria-hidden="true" /></Link></div>
            {d.atRisk.length ? <ul>{d.atRisk.slice(0, 3).map(i => <li key={i.id}><LockKeyhole aria-hidden="true" /><span><b>{i.event?.name} (Hold)</b><small>Expires in {Math.max(0, Math.round((new Date(i.hold_expires_at!).getTime() - now) / 36e5))} hours · {i.spaceName}</small></span>
              <Link className="ws-btn outline sm" href={`/provider/opportunities/${i.id}`}>Open</Link></li>)}</ul> : <p className="ws-muted"><CircleCheck aria-hidden="true" /> No holds expiring in the next 48 hours.</p>}</section>
        </div>
      </div>

      <aside className="pcal-rail">
        <MiniMonth anchor={anchor} today={today} hrefFor={t => qs({ date: ymd(t) })} prevHref={qs({ date: ymd(startOfDay(-1, monthFirst)) })} nextHref={qs({ date: ymd(startOfDay(32, monthFirst)) })} busy={new Set(d.entries.filter(e => e.kind === "booking").map(e => startOfDay(0, e.start)))} weekStart={view === "week" ? weekStart : null} />
        <section className="ws-panel pcal-layers"><h2>Calendars &amp; layers</h2><ul>
          {LAYERS.map(l => { const on = layers.has(l.key); return <li key={l.key}><Link href={toggleLayer(l.key)} aria-pressed={on}>{on ? <SquareCheck aria-hidden="true" className="on" /> : <Square aria-hidden="true" />}<i className={`pcal-dot ${l.key}`} />{l.label === "Spaces/Resources" ? "Spaces / resources" : l.label}</Link></li>; })}
          <li><Link href="/provider/settings?tab=integrations"><Square aria-hidden="true" /><i className="pcal-dot ext" />External calendars</Link></li>
        </ul></section>
        <section className="ws-panel pcal-quick"><h2>Quick actions</h2><ul>
          <li><Link href={qs({ action: "block" })}><CalendarX aria-hidden="true" className="blue" /><span><b>Block time</b><small>Set unavailable</small></span></Link></li>
          <li><Link href={qs({ action: "open" })}><CalendarPlus aria-hidden="true" className="green" /><span><b>Open availability</b><small>Make time bookable</small></span></Link></li>
          <li><Link href={qs({ action: "emergency" })}><Siren aria-hidden="true" className="red" /><span><b>Add emergency window</b><small>For last-minute demand</small></span></Link></li>
          <li><Link href="/provider/settings?tab=integrations"><RefreshCw aria-hidden="true" className="blue" /><span><b>Sync external calendar</b><small>Google, Outlook, Apple</small></span></Link></li>
        </ul></section>
        <section className="ws-panel pcal-insights"><div className="ws-panel-head"><h2><Sparkles aria-hidden="true" />Gala Agent insights</h2><Link className="ws-link" href="/provider/agent">Open in Agent <ArrowRight aria-hidden="true" /></Link></div><ul>
          <li><ChartColumn aria-hidden="true" className="blue" /><span><b>{d.busiestDay ? `Busiest: ${london(d.busiestDay[0] + 12 * 36e5, { weekday: "long", day: "numeric", month: "short" })}` : "No bookings in this period"}</b><small>{d.busiestDay ? `${d.busiestDay[1]} bookings on one day — check staffing.` : "Open availability to attract requests."}</small></span></li>
          <li><Zap aria-hidden="true" className="green" /><span><b>{d.kpi.available}% space time available</b><small>{d.kpi.available > 60 ? "Consider an emergency window to fill gaps." : "Capacity is well used this period."}</small></span></li>
          <li><UserX aria-hidden="true" className="purple" /><span><b>{d.unassigned} team member{d.unassigned === 1 ? "" : "s"} without assignments</b><small>In the visible period.</small></span></li>
        </ul></section>
      </aside>
    </div>
    <Suspense><AvailabilityDialog targets={targets} /></Suspense>
  </div>;

  function CalEntry({ e, now: n }: { e: Entry; now: number }) {
    const body = <><b>{e.title}</b><small>{e.kind === "block" || e.kind === "emergency" ? e.sub || `${hm(e.start)} – ${hm(e.end)}` : e.kind === "shift" ? e.status : `${hm(e.start)} – ${hm(e.end)}`}</small>
      {e.kind !== "shift" && <em>{e.kind === "hold" ? <><LockKeyhole aria-hidden="true" />Hold {e.expires ? `(expires ${Math.max(0, Math.round((e.expires - n) / 36e5))}h)` : ""}</> : e.kind === "emergency" ? <><Zap aria-hidden="true" />Emergency</> : e.kind === "standby" ? <><Users aria-hidden="true" />Standby</> : e.kind === "block" ? e.status : <><CircleCheck aria-hidden="true" />{e.status}</>}</em>}</>;
    return <div className={`pcal-entry ${e.tone} ${e.kind}`}>
      {e.href ? <Link href={e.href}>{body}</Link> : <div>{body}</div>}
      {e.kind === "hold" && e.holdItemId && <RowMenu label={`Hold actions for ${e.title}`} entries={[{ kind: "link", label: "Open request", href: e.href! }, { kind: "action", label: "Release hold", danger: true, confirm: "Release this hold? The date becomes available to others.", run: releaseHold.bind(null, e.holdItemId) }]} />}
    </div>;
  }
}

function RowCells({ row, days, cell }: { row: Row; days: number[]; cell: (r: Row, d: number) => React.ReactNode }) {
  return <>
    <div className="pcal-rowhead">{row.group === "team" ? <Avatar src={row.image} name={row.title} size={34} /> : <Thumb src={row.image} w={38} h={38} />}<span><b>{row.title}</b><small>{row.sub}</small></span></div>
    {days.map(t => <div key={t} className="pcal-cell">{cell(row, t)}</div>)}
  </>;
}

function MiniMonth({ anchor, today, hrefFor, prevHref, nextHref, busy, weekStart }: { anchor: number; today: number; hrefFor: (t: number) => string; prevHref: string; nextHref: string; busy: Set<number>; weekStart: number | null }) {
  const a = new Date(anchor + 12 * 36e5);
  const first = startOfDay(0, Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1, 12));
  const gridStart = startOfDay(-((new Date(first + 12 * 36e5).getUTCDay() + 6) % 7), first);
  return <section className="ws-panel pcal-mini"><div className="pcal-mini-head"><h2>{london(first + 12 * 36e5, { month: "long", year: "numeric" })}</h2>
    <Link href={prevHref} aria-label="Previous month"><ChevronLeft aria-hidden="true" /></Link><Link href={nextHref} aria-label="Next month"><ChevronRight aria-hidden="true" /></Link></div>
    <div className="pcal-mini-grid">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(n => <small key={n}>{n}</small>)}
      {Array.from({ length: 42 }, (_, i) => startOfDay(i, gridStart)).map(t => {
        const out = new Date(t + 12 * 36e5).getUTCMonth() !== a.getUTCMonth();
        const inWeek = weekStart !== null && t >= weekStart && t < startOfDay(7, weekStart);
        return <Link key={t} href={hrefFor(t)} className={`${out ? "out" : ""} ${t === today ? "today" : ""} ${t === anchor ? "sel" : ""} ${inWeek ? "week" : ""} ${busy.has(t) ? "busy" : ""}`}>{london(t + 12 * 36e5, { day: "numeric" })}</Link>;
      })}</div></section>;
}

function sparkFor(entries: Entry[], kind: Entry["kind"], from: number, to: number) {
  const n = Math.max(2, Math.min(14, Math.round((to - from) / 864e5)));
  const out = Array<number>(n).fill(0); const w = (to - from) / n;
  for (const e of entries) if (e.kind === kind) { const i = Math.floor((e.start - from) / w); if (i >= 0 && i < n) out[i]++; }
  return out;
}
