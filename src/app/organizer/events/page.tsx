import Link from "next/link";
import { Plus, ChevronDown, List, LayoutGrid, CalendarDays, CalendarCheck, Radio, CheckCircle2, BarChart3, TrendingUp, ChevronLeft, ChevronRight, MapPin, Users, Clock, Heart, MoreHorizontal, ArrowRight, LayoutTemplate, Calendar } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { listWorkspaceEvents, withStats, type EventStats } from "@/lib/data/organizer";
import { Crumbs, Chip, Bar, Ring, Avatars, Avatar, Card, Empty } from "@/components/kit";
import { EventFilters, EventRowMenu, ImportExport, CreateEventSplit, PerPageMenu } from "@/components/organizer/events-client";
import { TypeChip, PhaseChip, nextAction, readinessTone, phaseOf } from "@/components/organizer/event-bits";
import { MonthCalendar, MiniMonth, londonYmd, type CalItem } from "@/components/organizer/month-calendar";
import { money, num, dateShort, timeRange, eventTypeLabel, EVENT_TYPE_LABEL, time } from "@/lib/format";

export const metadata = { title: "Events" };
type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function EventsPage({ searchParams }: PageProps<"/organizer/events">) {
  const sp = await searchParams as SP;
  const tab = (["all", "upcoming", "live", "completed", "templates"].includes(str(sp.tab)) ? str(sp.tab) : "all");
  const view = (["list", "cards", "calendar"].includes(str(sp.view)) ? str(sp.view) : "list");
  const ctx = await getOrganizer(); const sb = ctx.supabase;
  const all = (await withStats(sb, await listWorkspaceEvents(sb, ctx.workspace.id))).filter(e => e.status !== "archived" || str(sp.status) === "archived");
  const now = new Date().toISOString();
  const isLive = (e: EventStats) => e.status === "live" || (!!e.starts_at && !!e.ends_at && e.starts_at <= now && e.ends_at >= now && !["cancelled", "draft"].includes(e.status));
  const isDone = (e: EventStats) => ["completed", "closed"].includes(e.status) || (!!e.ends_at && e.ends_at < now);
  const isUpcoming = (e: EventStats) => !!e.starts_at && e.starts_at > now && !["cancelled", "completed", "closed"].includes(e.status);
  const counts = { all: all.length, upcoming: all.filter(isUpcoming).length, live: all.filter(isLive).length, completed: all.filter(isDone).length };
  const { data: templates } = await sb.from("event_templates").select("id,name,description,event_types,modules,created_at,source_event_id").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false });
  // Filters (server-side)
  let rows = tab === "upcoming" ? all.filter(isUpcoming) : tab === "live" ? all.filter(isLive) : tab === "completed" ? all.filter(isDone) : all;
  const q = str(sp.q).toLowerCase();
  if (q) rows = rows.filter(e => `${e.name} ${e.client_name} ${e.venue_name} ${e.location}`.toLowerCase().includes(q));
  if (str(sp.client)) rows = rows.filter(e => e.client_name === str(sp.client));
  if (str(sp.type)) rows = rows.filter(e => e.event_type === str(sp.type));
  if (str(sp.venue)) rows = rows.filter(e => e.venue_name === str(sp.venue));
  if (str(sp.status)) rows = rows.filter(e => e.status === str(sp.status));
  if (str(sp.ticketed)) rows = rows.filter(e => (e.ticketCap > 0) === (str(sp.ticketed) === "yes"));
  if (str(sp.city)) rows = rows.filter(e => `${e.city} ${e.location}`.toLowerCase().includes(str(sp.city).toLowerCase()));
  if (str(sp.risk)) rows = rows.filter(e => str(sp.risk) === "high" ? e.readiness < 50 : str(sp.risk) === "medium" ? e.readiness >= 50 && e.readiness < 75 : e.readiness >= 75);
  if (str(sp.date)) { const d = str(sp.date); rows = rows.filter(e => e.starts_at && (d === "past" ? e.starts_at < now : e.starts_at >= now && e.starts_at <= new Date(Date.now() + Number(d) * 864e5).toISOString())); }
  if (!str(sp.date) || str(sp.date) !== "past") rows = [...rows].sort((a, b) => { const ua = isUpcoming(a) || isLive(a), ub = isUpcoming(b) || isLive(b); if (ua !== ub) return ua ? -1 : 1; return ua ? (a.starts_at ?? "").localeCompare(b.starts_at ?? "") : (b.starts_at ?? "").localeCompare(a.starts_at ?? ""); });
  const per = Math.min(50, Math.max(4, Number(str(sp.per)) || 8)); const pages = Math.max(1, Math.ceil(rows.length / per)); const page = Math.min(pages, Math.max(1, Number(str(sp.page)) || 1));
  const pageRows = rows.slice((page - 1) * per, page * per);
  const totalRevenue = all.reduce((s, e) => s + e.ticketRevenue, 0);
  const forecast = all.filter(e => !isDone(e)).reduce((s, e) => s + Number(e.target_profit ?? 0), 0);
  const qs = (patch: Record<string, string | number | null>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v); for (const [k, v] of Object.entries(patch)) v == null ? p.delete(k) : p.set(k, String(v)); return `/organizer/events?${p}`; };
  const me = { name: ctx.name, avatar: "/assets/gd/av-alex-organizer.webp" };
  const types = [...new Set(all.map(e => e.event_type))].map(t => ({ key: t, label: EVENT_TYPE_LABEL[t] ?? eventTypeLabel(t) }));
  const exportRows = rows.map(e => ({ name: e.name, type: eventTypeLabel(e.event_type), date: e.starts_at ?? "", venue: e.venue_name, client: e.client_name, status: phaseOf(e).label, readiness: e.readiness, tickets_sold: e.sold, ticket_capacity: e.ticketCap, budget: Number(e.budget_total ?? 0), forecast_profit: Number(e.target_profit ?? 0) }));

  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Events" }]} />
    <div className="k-page-head" style={{ marginTop: -4 }}>
      <div><h1 style={{ fontSize: 34.5 }}>Events</h1><p className="sub" style={{ fontSize: 15.5 }}>Manage your full event portfolio. Plan, track and deliver unforgettable experiences.</p></div>
      <div className="k-row" style={{ gap: 10 }}><ImportExport rows={exportRows} />
        <CreateEventSplit />
      </div>
    </div>
    <div className="k-between ev-tabs-row">
      <nav className="k-tabs" aria-label="Event lists" style={{ borderBottom: 0 }}>{([["all", "All", counts.all], ["upcoming", "Upcoming", counts.upcoming], ["live", "Live", counts.live], ["completed", "Completed", counts.completed], ["templates", "Templates", templates?.length ?? 0]] as const).map(([k, l, c]) => <Link key={k} href={qs({ tab: k === "all" ? null : k, page: null })} className="k-tab" aria-current={tab === k ? "page" : undefined}>{l}<span className="ev-count">{c}</span></Link>)}</nav>
      <div className="k-seg" role="tablist" aria-label="View">{([["list", "List", List], ["cards", "Cards", LayoutGrid], ["calendar", "Calendar", CalendarDays]] as const).map(([k, l, I]) => <Link key={k} href={qs({ view: k === "list" ? null : k })} role="tab" aria-selected={view === k}><I size={15} />{l}</Link>)}</div>
    </div>
    {tab === "templates" ? <TemplatesGrid templates={templates ?? []} /> : <>
      <EventFilters clients={[...new Set(all.map(e => e.client_name).filter(Boolean))]} venues={[...new Set(all.map(e => e.venue_name).filter(Boolean))]} types={types} owners={[ctx.name]} />
      {view === "list" && <div className="k-grid k-g6 ev-kpis">
        {[[CalendarDays, "blue", num(counts.all), "Total events"], [CalendarCheck, "green", num(counts.upcoming), "Upcoming"], [Radio, "red", num(counts.live), "Live now"], [CheckCircle2, "blue", num(counts.completed), "Completed"], [BarChart3, "blue", money(totalRevenue), "Total revenue"], [TrendingUp, "green", money(forecast), "Forecast profit"]].map(([I, t, v, l]) => { const Icon = I as typeof Radio; return <div key={l as string} className="ev-kpi"><span className={`k-tile ${t as string}`}><Icon size={19} /></span><div><b>{v as string}</b><span>{l as string}</span></div></div>; })}
      </div>}
      {rows.length === 0 ? <Card><Empty icon={CalendarDays} title="No events match these filters" text="Try clearing filters, or create a new event." action={<Link className="k-btn primary" href="/organizer/events/new?step=1"><Plus size={15} />Create Event</Link>} /></Card>
        : view === "list" ? <Card flush aria-label="Events list">
          <div className="k-table-wrap"><table className="k-table ev-table">
            <thead><tr><th style={{ width: 36 }}><input type="checkbox" aria-label="Select all events on this page" /></th><th>Event</th><th>Type</th><th>Date</th><th>Venue</th><th>Owner</th><th>Readiness</th><th>Tickets</th><th>Budget</th><th>Forecast</th><th>Status</th><th>Next action</th><th style={{ width: 44 }}><span className="k-sr">Actions</span></th></tr></thead>
            <tbody>{pageRows.map(e => { const na = nextAction(e); const tp = e.ticketCap ? Math.round((100 * e.sold) / e.ticketCap) : 0; return <tr key={e.id}>
              <td><input type="checkbox" aria-label={`Select ${e.name}`} /></td>
              <td><Link href={`/organizer/events/${e.id}`} className="k-row" style={{ gap: 12 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image} alt="" className="ev-thumb" /><span><b className="ev-name">{e.name}</b><span className="k-small k-muted">{e.client_name || ctx.workspace.name}</span></span></Link></td>
              <td><TypeChip type={e.event_type} /></td>
              <td className="k-nowrap"><div style={{ color: "var(--k-ink)" }}>{dateShort(e.starts_at)}</div><div className="k-small k-muted">{timeRange(e.starts_at, e.ends_at)}</div></td>
              <td><div className="k-ellipsis" style={{ color: "var(--k-ink)", maxWidth: 130 }}>{e.venue_name || "TBC"}</div><div className="k-small k-muted">{e.city || "—"}</div></td>
              <td><Avatar src={me.avatar} name={me.name} size="lg" /></td>
              <td style={{ minWidth: 90 }}><b className="k-small">{e.readiness}%</b><Bar value={e.readiness} tone={readinessTone(e.readiness)} label={`${e.name} readiness`} /></td>
              <td style={{ minWidth: 90 }}><span className="k-small">{e.ticketCap ? `${num(e.sold)} / ${num(e.ticketCap)}` : "Not ticketed"}</span>{e.ticketCap > 0 && <Bar value={tp} label={`${e.name} tickets sold`} />}</td>
              <td className="num">{e.budget_total ? money(e.budget_total) : "—"}</td>
              <td className="num k-green">{e.target_profit ? money(e.target_profit) : "—"}</td>
              <td><PhaseChip e={e} /></td>
              <td><Link href={na.href} className="ev-next"><span className={`ev-next-dot ${na.urgent ? "urgent" : ""}`} />{na.label}</Link></td>
              <td><EventRowMenu id={e.id} name={e.name} slug={e.slug} isPublic={e.visibility === "public" && ["published", "on_sale", "live"].includes(e.status)} /></td>
            </tr>; })}</tbody>
          </table></div>
          <Pager page={page} pages={pages} per={per} total={rows.length} qs={qs} />
        </Card>
        : view === "cards" ? <><div className="ev-cards">{pageRows.map(e => <EventCard key={e.id} e={e} me={me} />)}</div><Pager page={page} pages={pages} per={per} total={rows.length} qs={qs} /></>
        : <CalendarView events={rows} sp={sp} qs={qs} supabase={sb} workspaceId={ctx.workspace.id} counts={counts} totalRevenue={totalRevenue} forecast={forecast} />}
    </>}
  </>;
}

function Pager({ page, pages, per, total, qs }: { page: number; pages: number; per: number; total: number; qs: (p: Record<string, string | number | null>) => string }) {
  return <div className="k-between ev-pager"><span className="k-muted">Showing {total ? (page - 1) * per + 1 : 0}–{Math.min(total, page * per)} of {total} events</span>
    <div className="k-row" style={{ gap: 8 }}>
      <PerPageMenu per={per} hrefs={[8, 16, 24, 50].map(n => ({ n, href: qs({ per: n, page: null }) }))} />
      <Link className="k-icon-btn" aria-disabled={page <= 1} href={qs({ page: Math.max(1, page - 1) })} aria-label="Previous page"><ChevronLeft size={16} /></Link>
      {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5).map(n => <Link key={n} href={qs({ page: n })} className={`k-icon-btn ev-page ${n === page ? "on" : ""}`} aria-current={n === page ? "page" : undefined}>{n}</Link>)}
      <Link className="k-icon-btn" aria-disabled={page >= pages} href={qs({ page: Math.min(pages, page + 1) })} aria-label="Next page"><ChevronRight size={16} /></Link>
    </div></div>;
}

function EventCard({ e, me }: { e: EventStats; me: { name: string; avatar: string } }) {
  const na = nextAction(e); const tp = e.ticketCap ? Math.round((100 * e.sold) / e.ticketCap) : 0; const ph = phaseOf(e);
  return <article className="ev-card">
    <Link href={`/organizer/events/${e.id}`} className="ev-card-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image} alt="" />
      <span className="ev-card-chips"><Chip tone={ph.tone === "gray" ? "gray" : `solid-${ph.tone === "red" ? "purple" : ph.tone === "amber" ? "purple" : ph.tone === "green" ? "green" : "blue"}` as "solid-green"} className={ph.tone === "red" ? "ev-chip-red" : ph.tone === "amber" ? "ev-chip-amber" : ""}>{ph.label}</Chip><TypeChip type={e.event_type} /></span>
      <span className="ev-card-btns"><span className="ev-card-btn" aria-hidden><Heart size={14} /></span><span className="ev-card-btn sq" aria-hidden><MoreHorizontal size={14} /></span></span>
    </Link>
    <div className="ev-card-body">
      <Link href={`/organizer/events/${e.id}`}><b className="ev-card-name">{e.name}</b></Link><span className="k-small k-muted">{e.client_name || "Alex Events"}</span>
      <div className="ev-card-meta"><span><Calendar size={13} />{dateShort(e.starts_at)} <span style={{ marginLeft: 8 }}>{timeRange(e.starts_at, e.ends_at)}</span></span><span><MapPin size={13} />{e.venue_name ? `${e.venue_name}, ${e.city}` : "Venue TBC"}</span><span><Users size={13} />{e.ticketCap ? `${num(e.sold)} / ${num(e.ticketCap)} tickets` : "Not ticketed"}<b style={{ marginLeft: "auto" }}>{e.ticketCap ? `${tp}%` : ""}</b></span></div>
      {e.ticketCap > 0 && <Bar value={tp} label={`${e.name} tickets sold`} />}
      <div className="ev-card-fin"><div><b>{e.budget_total ? money(e.budget_total) : "—"}</b><small>Budget</small></div><div><b className="k-green">{e.target_profit ? money(e.target_profit) : "—"}</b><small>Forecast profit</small></div><div className="k-row" style={{ gap: 6 }}><Ring value={e.readiness} size={30} stroke={4} color={e.readiness >= 75 ? "var(--k-green)" : e.readiness >= 50 ? "var(--k-amber)" : "var(--k-red)"} label="" /><span><b>{e.readiness}%</b><small>Readiness</small></span></div></div>
      <div className="k-between ev-card-foot"><Avatars people={[me]} /><Link href={na.href} className="ev-next"><span className={`ev-next-dot ${na.urgent ? "urgent" : ""}`} />{na.label}<ChevronRight size={13} /></Link></div>
    </div>
  </article>;
}

async function CalendarView({ events, sp, qs, supabase, workspaceId, counts, totalRevenue, forecast }: { events: EventStats[]; sp: SP; qs: (p: Record<string, string | number | null>) => string; supabase: Awaited<ReturnType<typeof getOrganizer>>["supabase"]; workspaceId: string; counts: { all: number; live: number }; totalRevenue: number; forecast: number }) {
  const m = /^(\d{4})-(\d{2})$/.exec(str(sp.month)); const base = events.find(e => e.starts_at && e.starts_at > new Date().toISOString())?.starts_at ?? new Date().toISOString();
  const year = m ? Number(m[1]) : Number(londonYmd(new Date(base)).slice(0, 4)), month = m ? Number(m[2]) : Number(londonYmd(new Date(base)).slice(5, 7));
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString(), monthEnd = new Date(Date.UTC(year, month, 1)).toISOString();
  const { data: entries } = await supabase.from("calendar_entries").select("id,title,starts_at,ends_at,layer,event_id").eq("workspace_id", workspaceId).gte("starts_at", monthStart).lt("starts_at", monthEnd);
  const typeTone: Record<string, string> = { festival: "purple", corporate: "blue", food_drink: "red", nightlife: "pink", wedding: "pink", conference: "blue", community: "green", awards: "amber" };
  const items: CalItem[] = [
    ...events.filter(e => e.starts_at).map(e => ({ id: e.id, title: e.name, start: e.starts_at!, href: `/organizer/events/${e.id}`, tone: typeTone[e.event_type] ?? "blue", image: e.cover_image, sub: timeRange(e.starts_at, e.ends_at), meta: <span className="k-row" style={{ gap: 8 }}><PhaseChip e={e} />{e.ticketCap > 0 && <span className="k-xs k-muted"><Users size={10} /> {num(e.sold)}/{e.ticketCap >= 1000 ? `${(e.ticketCap / 1000).toFixed(e.ticketCap % 1000 ? 1 : 0)}K` : e.ticketCap}</span>}</span> })),
    ...(entries ?? []).map(c => ({ id: c.id, title: c.title, start: c.starts_at, href: c.event_id ? `/organizer/events/${c.event_id}` : "/organizer/calendar", tone: "amber", sub: timeRange(c.starts_at, c.ends_at), meta: <Chip tone="red">Internal</Chip> })),
  ];
  const sel = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.day)) ? str(sp.day) : londonYmd(new Date(base));
  const dayItems = items.filter(i => londonYmd(new Date(i.start)) === sel);
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`, next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return <div className="ev-cal-wrap">
    <Card flush>
      <div className="k-between" style={{ padding: "10px 12px", borderBottom: "1px solid var(--k-line-2)" }}>
        <div className="k-row" style={{ gap: 8 }}><Link className="k-icon-btn" href={qs({ month: prev })} aria-label="Previous month"><ChevronLeft size={16} /></Link><Link className="k-icon-btn" href={qs({ month: next })} aria-label="Next month"><ChevronRight size={16} /></Link><Link className="k-btn outline" href={qs({ month: null, day: null })}>Today</Link><h2 style={{ fontSize: 19, marginLeft: 10 }}>{label}</h2></div>
        <div className="k-seg" role="tablist"><span role="tab" aria-selected>Month</span><Link role="tab" aria-selected={false} href="/organizer/calendar?view=week">Week</Link><Link role="tab" aria-selected={false} href="/organizer/calendar?view=day">Day</Link><Link role="tab" aria-selected={false} href="/organizer/calendar?view=agenda">Agenda</Link></div>
      </div>
      <MonthCalendar year={year} month={month} items={items} maxPerDay={1} />
    </Card>
    <div className="k-col" style={{ gap: 14 }}>
      <Card><div className="k-between" style={{ marginBottom: 8 }}><h2 style={{ fontSize: 15.5 }}>{label}</h2><div className="k-row"><Link className="k-icon-btn plain" href={qs({ month: prev })} aria-label="Previous month"><ChevronLeft size={15} /></Link><Link className="k-icon-btn plain" href={qs({ month: next })} aria-label="Next month"><ChevronRight size={15} /></Link></div></div>
        <MiniMonth year={year} month={month} marked={items.map(i => londonYmd(new Date(i.start)))} selected={sel} hrefFor={d => qs({ day: d })} /></Card>
      <Card><div className="k-between" style={{ marginBottom: 10 }}><h2 style={{ fontSize: 15 }}>Agenda – {new Date(`${sel}T12:00:00Z`).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</h2><span className="k-small k-muted">{dayItems.length} event{dayItems.length === 1 ? "" : "s"}</span></div>
        {dayItems.length ? <div className="k-col" style={{ gap: 10 }}>{dayItems.map(i => <Link key={i.id} href={i.href} className="k-li"><i className={`k-dot tone-dot-${i.tone}`} />{/* eslint-disable-next-line @next/next/no-img-element */}{i.image ? <img src={i.image} alt="" className="k-thumb" /> : <span className="k-thumb" />}<span className="k-grow"><b className="k-small k-strong">{i.title}</b><span className="k-xs k-muted k-row" style={{ gap: 4 }}><Clock size={11} />{time(i.start)}</span></span></Link>)}</div> : <p className="k-small">Nothing scheduled on this day.</p>}
        <Link href="/organizer/calendar?view=day" className="k-btn soft block" style={{ marginTop: 12 }}>View full day <ArrowRight size={13} /></Link></Card>
      <Card><div className="k-between" style={{ marginBottom: 10 }}><h2 style={{ fontSize: 15 }}>Quick stats</h2><Link className="k-link" href="/organizer/money?tab=reports">View reports <ArrowRight size={12} /></Link></div>
        <div className="k-grid k-g2" style={{ gap: 8 }}>{[[CalendarDays, num(counts.all), "Total events", "blue"], [Radio, num(counts.live), "Live now", "red"], [BarChart3, money(totalRevenue), "Ticket revenue", "blue"], [TrendingUp, money(forecast), "Forecast profit", "green"]].map(([I, v, l, t]) => { const Icon = I as typeof Radio; return <div key={l as string} className="ev-qs"><span className={`k-tile sm ${t as string}`}><Icon size={14} /></span><span><b>{v as string}</b><small>{l as string}</small></span></div>; })}</div></Card>
    </div>
  </div>;
}

function TemplatesGrid({ templates }: { templates: { id: string; name: string; description: string; event_types: string[]; modules: unknown; created_at: string }[] }) {
  if (!templates.length) return <Card><Empty icon={LayoutTemplate} title="No templates yet" text="Save any event as a reusable template from its menu. Templates exclude guests, payments, private messages and booking history." /></Card>;
  return <div className="k-grid k-g3">{templates.map(t => { const mods = Object.entries((t.modules ?? {}) as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k); return <Card key={t.id}><div className="k-row" style={{ gap: 10, marginBottom: 8 }}><span className="k-tile purple"><LayoutTemplate size={17} /></span><div><b className="k-strong">{t.name}</b><div className="k-xs k-muted">Created {dateShort(t.created_at)}</div></div></div>
    <p className="k-small" style={{ marginBottom: 10 }}>{t.description}</p><div className="k-row k-wrap" style={{ gap: 5, marginBottom: 12 }}>{t.event_types.map(x => <Chip key={x} tone="blue">{x}</Chip>)}</div>
    <div className="k-xs k-muted" style={{ marginBottom: 12 }}>Includes: {mods.join(", ") || "—"}</div>
    <Link href={`/organizer/events/new?step=1&template=${t.id}`} className="k-btn primary block">Use template</Link></Card>; })}</div>;
}
