import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, CalendarDays, Clock, ArrowRight, Layers, X, Maximize2 } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { calendarEntries, LAYERS } from "@/lib/data/calendar";
import { listWorkspaceEvents, withStats } from "@/lib/data/organizer";
import { Crumbs, Card, Chip, Bar, Avatars } from "@/components/kit";
import { MonthCalendar, MiniMonth, londonYmd } from "@/components/organizer/month-calendar";
import { LayerBar, LayerList, SavedViews, AddEntry, TimeGrid } from "@/components/organizer/calendar-client";
import { PhaseChip } from "@/components/organizer/event-bits";
import { money, num, dateShort, timeRange, time, eventTypeLabel } from "@/lib/format";
import { CalendarConnect } from "@/components/customer/account-client";
import { TeamConflicts } from "@/components/ops/readiness-panel";

export const metadata = { title: "Calendar" };
const str = (v: unknown) => (typeof v === "string" ? v : "");
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export default async function CalendarPage({ searchParams }: PageProps<"/organizer/calendar">) {
  const sp = await searchParams; const ctx = await getOrganizer();
  const view = (["month", "week", "day", "agenda"].includes(str(sp.view)) ? str(sp.view) : "week") as "month" | "week" | "day" | "agenda";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.date)) ? str(sp.date) : londonYmd(new Date());
  const dow = (new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7, weekStart = addDays(anchor, -dow);
  const [y, m] = anchor.split("-").map(Number) as [number, number];
  const range = view === "month" ? [addDays(`${y}-${String(m).padStart(2, "0")}-01`, -7), addDays(`${y}-${String(m).padStart(2, "0")}-01`, 42)] : view === "day" ? [anchor, addDays(anchor, 1)] : view === "agenda" ? [anchor, addDays(anchor, 30)] : [weekStart, addDays(weekStart, 7)];
  const all = await calendarEntries(ctx, `${range[0]}T00:00:00Z`, `${range[1]}T00:00:00Z`);
  const active = str(sp.layers) ? (str(sp.layers) === "none" ? [] : str(sp.layers).split(",")) : LAYERS.map(l => l.key);
  const entries = all.filter(e => active.includes(e.layer));
  const counts = Object.fromEntries(LAYERS.map(l => [l.key, all.filter(e => e.layer === l.key).length]));
  const colors = Object.fromEntries(LAYERS.map(l => [l.key, l.color]));
  const qs = (patch: Record<string, string | null>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v); for (const [k, v] of Object.entries(patch)) v == null ? p.delete(k) : p.set(k, v); return `/organizer/calendar?${p}`; };
  const step = view === "month" ? 30 : view === "day" ? 1 : 7;
  const prev = view === "month" ? `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-01` : addDays(anchor, -step), next = view === "month" ? `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01` : addDays(anchor, step);
  const fmtD = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleString("en-GB", { ...o, timeZone: "UTC" });
  const label = view === "month" ? fmtD(anchor, { month: "long", year: "numeric" }) : view === "day" ? fmtD(anchor, { weekday: "long", day: "numeric", month: "short", year: "numeric" }) : view === "agenda" ? `From ${fmtD(anchor, { day: "numeric", month: "short", year: "numeric" })}` : `${fmtD(weekStart, { day: "numeric" })} – ${fmtD(addDays(weekStart, 6), { day: "numeric", month: "short", year: "numeric" })}`;
  const events = await withStats(ctx.supabase, await listWorkspaceEvents(ctx.supabase, ctx.workspace.id));
  const sel = str(sp.sel).startsWith("ev-") ? events.find(e => e.id === str(sp.sel).slice(3)) : null;
  const now = new Date().toISOString(); const upcoming = events.filter(e => e.starts_at && e.starts_at >= now && !["cancelled", "archived"].includes(e.status)).slice(0, 4);
  const { data: selTasks } = sel ? await ctx.supabase.from("tasks").select("id,title,priority,status").eq("event_id", sel.id).neq("status", "done").order("due_at").limit(4) : { data: [] };
  const { data: crew } = await ctx.supabase.from("crew_members").select("name,avatar").eq("workspace_id", ctx.workspace.id).limit(5);

  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Calendar" }]} />
    <div className="k-page-head" style={{ marginTop: -6 }}>
      <div><h1 style={{ fontSize: 30 }}>Calendar</h1><p className="sub" style={{ fontSize: 14.5 }}>Coordinate your events, bookings, team, and activity in one place.</p></div>
      <div className="k-row k-wrap" style={{ gap: 10 }}>
        <Link className="k-btn ghost lg" href={qs({ date: null })}>Today</Link>
        <div className="k-row cal-nav"><Link className="k-icon-btn plain" href={qs({ date: prev })} aria-label="Previous"><ChevronLeft size={17} /></Link><Link className="k-icon-btn plain" href={qs({ date: next })} aria-label="Next"><ChevronRight size={17} /></Link><span className="cal-range">{label}</span></div>
        <div className="k-seg cal-views" role="tablist">{(["month", "week", "day", "agenda"] as const).map(v => <Link key={v} role="tab" aria-selected={view === v} href={qs({ view: v === "week" ? null : v })}>{v[0]!.toUpperCase() + v.slice(1)}</Link>)}</div>
        <SavedViews />
        <AddEntry events={events.map(e => ({ id: e.id, name: e.name }))} defaultDate={anchor} />
      </div>
    </div>
    <TeamConflicts workspaceId={ctx.workspace.id} limit={4} />
    <div className="k-between" style={{ gap: 10 }}><LayerBar layers={LAYERS.map(l => ({ ...l }))} active={active} /><a className="k-btn ghost" href="#layers"><Layers size={15} />Layers</a></div>
    <div className="cal-grid">
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <Card flush>
          {view === "month" && <MonthCalendar year={y} month={m} items={entries.map(e => ({ id: e.id, title: e.title, start: e.start, href: e.href, tone: { events: "blue", tasks: "purple", venue: "green", holds: "amber", shifts: "pink", tickets: "amber", promotion: "purple", emails: "cyan", payments: "red", meetings: "blue", external: "blue" }[e.layer], sub: time(e.start) }))} maxPerDay={3} />}
          {(view === "week" || view === "day") && <TimeGrid days={view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))} entries={entries} colors={colors} selected={str(sp.sel)} />}
          {view === "agenda" && <ol className="cal-agenda">{entries.map(e => <li key={e.id}><span className="cal-ag-date"><b>{fmtD(londonYmd(new Date(e.start)), { day: "numeric" })}</b><small>{fmtD(londonYmd(new Date(e.start)), { weekday: "short", month: "short" })}</small></span><i className="k-dot" style={{ background: colors[e.layer] }} /><span className="k-small k-muted" style={{ width: 48 }}>{time(e.start)}</span><Link href={e.href} className="k-grow"><b className="k-small k-strong">{e.title}</b>{e.sub && <span className="k-xs k-muted" style={{ display: "block" }}>{e.sub}</span>}</Link><Chip tone="gray">{LAYERS.find(l => l.key === e.layer)?.label}</Chip></li>)}{!entries.length && <p className="k-small" style={{ padding: 16 }}>Nothing scheduled in the next 30 days for the selected layers.</p>}</ol>}
          {view !== "agenda" && entries.length === 0 && <p className="k-small" style={{ padding: "8px 16px 14px" }}>Nothing scheduled in this period for the selected layers.</p>}
        </Card>
        {sel && <Card aria-label="Event quick view"><div className="k-between" style={{ borderBottom: "1px solid var(--k-line-2)", paddingBottom: 6, marginBottom: 12 }}><nav className="k-tabs sm" style={{ borderBottom: 0 }}><span className="k-tab" aria-selected>Event details</span><Link className="k-tab" href={`/organizer/events/${sel.id}?tab=plan&section=tasks`}>Tasks</Link><Link className="k-tab" href={`/organizer/events/${sel.id}?tab=operations&section=team`}>Team</Link><Link className="k-tab" href={`/organizer/events/${sel.id}?tab=sell`}>Tickets</Link><Link className="k-tab" href={`/organizer/events/${sel.id}?tab=money`}>Money</Link></nav><div className="k-row"><Link className="k-icon-btn plain" href={`/organizer/events/${sel.id}`} aria-label="Open event"><Maximize2 size={15} /></Link><Link className="k-icon-btn plain" href={qs({ sel: null })} aria-label="Close"><X size={16} /></Link></div></div>
          <div className="cal-sel">
            <div className="k-row" style={{ gap: 14, alignItems: "flex-start" }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={sel.cover_image} alt="" className="cal-sel-img" /><div><Chip tone="pink">{eventTypeLabel(sel.event_type).toUpperCase()}</Chip><h3 style={{ fontSize: 17, margin: "6px 0 3px" }}>{sel.name}</h3><div className="k-xs k-muted">{dateShort(sel.starts_at)} · {timeRange(sel.starts_at, sel.ends_at)}</div><div className="k-xs k-muted k-row" style={{ gap: 4 }}><MapPin size={11} />{sel.venue_name}</div><div style={{ margin: "6px 0" }}><PhaseChip e={sel} /></div><div className="k-between k-xs"><span>{num(sel.sold)} / {num(sel.ticketCap)} sold</span><span>{sel.ticketCap ? Math.round((100 * sel.sold) / sel.ticketCap) : 0}%</span></div><Bar value={sel.ticketCap ? (100 * sel.sold) / sel.ticketCap : 0} label="Sold" /><div style={{ marginTop: 6 }}><Avatars people={crew ?? []} max={4} /></div></div></div>
            <div><h4 className="k-small k-strong">Key info</h4><ul className="cal-kv"><li><MapPin size={13} />{sel.location}</li><li><CalendarDays size={13} />Capacity {num(sel.capacity ?? 0)}</li><li><Clock size={13} />{sel.client_name}</li></ul></div>
            {ctx.canMoney && <div><h4 className="k-small k-strong">Financial summary</h4><div className="k-grid k-g3" style={{ gap: 8, marginTop: 8 }}><div><b>{money(sel.ticketRevenue)}</b><div className="k-xs k-muted">Revenue</div></div><div><b>{money(sel.committed)}</b><div className="k-xs k-muted">Committed costs</div></div><div><b className="k-green">{money(Number(sel.target_profit ?? 0))}</b><div className="k-xs k-muted">Forecast profit</div></div></div></div>}
            <div><h4 className="k-small k-strong">Next actions</h4><ul className="k-col" style={{ gap: 6, listStyle: "none", padding: 0, margin: "8px 0 0" }}>{(selTasks ?? []).map(t => <li key={t.id} className="k-between k-small"><span>{t.title}</span><Chip tone={t.priority === "high" ? "red" : t.priority === "low" ? "green" : "blue"}>{t.priority}</Chip></li>)}{!selTasks?.length && <li className="k-small k-muted">No open tasks.</li>}</ul></div>
          </div>
          <div className="k-row" style={{ gap: 8, marginTop: 12 }}><Link href={`/organizer/events/${sel.id}`} className="k-btn outline">Open event</Link></div></Card>}
      </div>
      <div className="k-col" style={{ gap: 14 }}>
        <Card><div className="k-between" style={{ marginBottom: 6 }}><h2 style={{ fontSize: 15 }}>{fmtD(anchor, { month: "long", year: "numeric" })}</h2><div className="k-row"><Link className="k-icon-btn plain" href={qs({ date: `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-01` })} aria-label="Previous month"><ChevronLeft size={15} /></Link><Link className="k-icon-btn plain" href={qs({ date: `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01` })} aria-label="Next month"><ChevronRight size={15} /></Link></div></div>
          <MiniMonth year={y} month={m} marked={all.map(e => londonYmd(new Date(e.start)))} selected={anchor} hrefFor={d => qs({ date: d })} /></Card>
        <Card id="layers"><div className="k-between" style={{ marginBottom: 8 }}><h2 style={{ fontSize: 15 }}>Calendar layers</h2><Link className="k-link" href="/organizer/settings?tab=integrations">Manage <ArrowRight size={12} /></Link></div><LayerList layers={LAYERS.map(l => ({ ...l }))} active={active} counts={counts} />
          <div className="oc-sync"><b>Sync to your calendar</b><small>Subscribe once — your events stay up to date in Google, Outlook or Apple Calendar.</small><CalendarConnect /></div></Card>
        <Card><div className="k-between" style={{ marginBottom: 8 }}><h2 style={{ fontSize: 15 }}>Upcoming</h2><Link className="k-link" href="/organizer/events?tab=upcoming">View all <ArrowRight size={12} /></Link></div>
          <div className="k-list">{upcoming.map(e => <Link key={e.id} href={qs({ sel: `ev-${e.id}`, date: e.starts_at!.slice(0, 10) })} className="k-li">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image} alt="" className="k-thumb" /><div className="k-grow"><b className="k-small k-strong">{e.name}</b><div className="k-xs k-muted">{dateShort(e.starts_at)} · {time(e.starts_at)}</div><div className="k-xs k-muted k-row" style={{ gap: 3 }}><MapPin size={10} />{e.venue_name}</div></div><PhaseChip e={e} /></Link>)}</div></Card>
      </div>
    </div>
  </>;
}
