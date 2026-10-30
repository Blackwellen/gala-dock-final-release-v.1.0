import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users, Globe, Ticket, Radio, TriangleAlert, Download, Filter, CalendarDays, MapPin, Briefcase, Building2, ArrowRight, Headphones, Ban, CircleCheck, ExternalLink, Star, CircleAlert,
  CalendarPlus, ShoppingBag, Pencil } from "lucide-react";
import "@/styles/admin-a-base.css";
import "@/styles/admin-a-events.css";
import { Kpi, Avatar, Thumb, Ring, Restricted } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { money, day, relative, requestTime, delta, titleCase } from "@/lib/workspace/format";
import { AdminMenu, ParamSelect, SearchBox, SelectAll, ReasonToggle } from "../_a/client";
import { PillTabs, Status, DrawerClose, SectionHead, MiniStat, TimelineItem } from "../_a/ui";
import { shortRef, str, qs, rpc, hmRange, type SP } from "../_a/lib";
import { evStatus, readiness, typeTone, typeLabel, type Ev, type EvMetric } from "../_a/events";
import { setEventRestriction, setEventFeatured } from "../_a/actions";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage(props: PageProps<"/admin/events">) {
  const ctx = await requireAdminPermission("events");
  if (!ctx.allowed) return <Restricted area="Events" />;
  const sp = (await props.searchParams) as SP;
  const { db, permissions } = ctx;
  const now = requestTime();
  const filter = ["public", "ticketed", "live", "flagged"].includes(str(sp, "filter")) ? str(sp, "filter") : "all";
  const q = str(sp, "q").trim().toLowerCase().slice(0, 80);
  // Q45 (lane A): filtering, sorting (incl. revenue) and keyset paging happen in SQL — admin_events_page (migration 202610291052).
  const f = (k: string) => str(sp, k);
  const SORTS = ["featured", "newest", "starts", "name"] as const;
  const sort = (SORTS as readonly string[]).includes(f("sort")) ? f("sort") : "featured";
  const per = 50, pg = Math.max(1, Math.floor(Number(f("pg")) || 1));
  const decode = (v: string) => { try { return v ? JSON.parse(Buffer.from(v, "base64url").toString("utf8")) as Record<string, unknown> : null; } catch { return null; } };
  const after = decode(f("after"));
  const filters: Record<string, string> = { tab: filter };
  if (q) filters.q = q;
  for (const k of ["type", "status", "when", "vis", "tix", "owner", "city"]) if (f(k)) filters[k] = f(k);
  type Row = Ev & { st: string; owner_label: string; owner_avatar: string | null; ws_reference: string | null; metrics: EvMetric | null };
  type Page = { rows: Row[]; next: Record<string, unknown> | null; filtered: number; totals: { all: number; pub: number; tix: number; live: number; flag: number }; cities: string[]; types: string[] };
  const [res, overview] = await Promise.all([
    rpc<Page>(db, "admin_events_page", { p_filters: filters, p_sort: sort, p_limit: per, p_after: after }),
    rpc<{ events?: { total_prev: number; cumulative: number[]; created_series: number[] } }>(db, "admin_overview", { p_days: 30 }),
  ]);
  const list = res.rows;
  const selParam = f("sel") === "none" ? null : isUuid(f("sel")) ? f("sel") : list[0]?.id ?? null;
  const selRow = selParam ? list.find(e => e.id === selParam) ?? (await rpc<Page>(db, "admin_events_page", { p_filters: { id: selParam }, p_sort: "featured", p_limit: 1, p_after: null })).rows[0] : undefined;
  const known = selRow && !list.some(e => e.id === selRow.id) ? [...list, selRow] : list;
  const num = (m: EvMetric | null) => m ? { ...m, gross: Number(m.gross), capacity: Number(m.capacity), sold: Number(m.sold) } : undefined;
  const metrics = new Map(known.map(e => [e.id, num(e.metrics)] as const).filter((x): x is [string, EvMetric] => !!x[1]));
  const wsNames = new Map(known.filter(e => e.workspace_id).map(e => [e.workspace_id!, { name: e.owner_label, cover_image: e.owner_avatar ?? "", settings: { reference: e.ws_reference ?? undefined } }]));
  const owners = new Map(known.filter(e => !e.workspace_id).map(e => [e.owner_id, { full_name: e.owner_label, avatar_url: e.owner_avatar ?? "" }]));
  const ownerName = (e: Ev) => (known.find(x => x.id === e.id)?.owner_label) ?? "Personal";
  const cities = res.cities, types = res.types;
  const selId = selRow?.id ?? null;
  const sel = selRow;
  const base = "/admin/events";
  const n = res.totals;
  const encode = (c: Record<string, unknown>) => Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
  const nextHref = res.next ? qs(base, sp, { after: encode(res.next), pg: pg + 1, sel: null }) : null;
  const firstHref = pg > 1 ? qs(base, sp, { after: null, pg: null, sel: null }) : null;
  const from = res.filtered ? (pg - 1) * per + 1 : 0, to = Math.min(res.filtered, (pg - 1) * per + list.length);

  return <div className="aa ae">
    <header className="ws-page-head">
      <div><h1>Events</h1><p>Search and manage customer and professional events across their full lifecycle.</p></div>
      <div className="aa-head-actions"><a className="ws-btn outline" href={qs(`${base}/export`, sp, { page: null, sel: null, per: null })}><Download aria-hidden="true" />Export</a></div>
    </header>
    <section className="aa-kpis ae-kpis" aria-label="Event metrics">
      <Kpi icon={Users} tone="blue" label="Total Events" value={n.all.toLocaleString("en-GB")} delta={overview.events ? delta(n.all, overview.events.total_prev) : null} deltaSuffix="vs last 30 days" series={overview.events?.cumulative} />
      <Kpi icon={Globe} tone="purple" label="Public Events" value={n.pub.toLocaleString("en-GB")} delta={null} />
      <Kpi icon={Ticket} tone="blue" label="Ticketed Events" value={n.tix.toLocaleString("en-GB")} delta={null} />
      <Kpi icon={Radio} tone="red" label="Live Events" value={n.live.toLocaleString("en-GB")} delta={null} />
      <Kpi icon={TriangleAlert} tone="orange" label="Flagged Events" value={n.flag.toLocaleString("en-GB")} delta={null} />
    </section>

    <div className="aa-split">
      <div className="aa-listcol">
        <div className="aa-bar"><PillTabs base={base} sp={sp} active={filter} tabs={[{ key: "all", label: "All Events", count: n.all }, { key: "public", label: "Public", count: n.pub },
          { key: "ticketed", label: "Ticketed", count: n.tix }, { key: "live", label: "Live", count: n.live }, { key: "flagged", label: "Flagged", count: n.flag, tone: "red" }]} /></div>
        <div className="aa-bar"><Suspense><SearchBox placeholder="Search by event name, owner, event ID, location, venue, or keyword..." /></Suspense>
          <Link className="ws-btn outline aa-filters-btn" href={qs(base, {}, { filter: filter === "all" ? null : filter })}><Filter aria-hidden="true" />Clear filters</Link></div>
        <Suspense><div className="aa-filters ae-filters">
          <label>Event type<ParamSelect param="type" label="Event type" value={f("type")} options={[{ value: "", label: "All types" }, ...types.map(t => ({ value: t, label: typeLabel(t) }))]} /></label>
          <label>Status<ParamSelect param="status" label="Status" value={f("status")} options={[{ value: "", label: "All statuses" }, ...["upcoming", "on_sale", "live", "completed", "draft", "cancelled", "restricted"].map(s => ({ value: s, label: titleCase(s) }))]} /></label>
          <label>Date range<ParamSelect param="when" label="Date range" value={f("when")} options={[{ value: "", label: "Any date" }, { value: "upcoming", label: "Upcoming" }, { value: "30", label: "Next 30 days" }, { value: "past", label: "Past" }]} /></label>
          <label>Visibility<ParamSelect param="vis" label="Visibility" value={f("vis")} options={[{ value: "", label: "All" }, { value: "public", label: "Public" }, { value: "private", label: "Private" }]} /></label>
          <label>Ticketing<ParamSelect param="tix" label="Ticketing" value={f("tix")} options={[{ value: "", label: "All" }, { value: "yes", label: "Ticketed" }, { value: "no", label: "Not ticketed" }]} /></label>
          <label>Owner type<ParamSelect param="owner" label="Owner type" value={f("owner")} options={[{ value: "", label: "All" }, { value: "professional", label: "Professional" }, { value: "consumer", label: "Customer" }]} /></label>
          <label>Location<ParamSelect param="city" label="Location" value={f("city")} options={[{ value: "", label: "All locations" }, ...cities.map(c => ({ value: c, label: c }))]} /></label>
        </div></Suspense>

        <form className="aa-table-form" action={`${base}/export`} method="get">
          <div className="aa-table-card">
            <div className="aa-bulk"><span>Selected events</span><button type="submit" className="ws-btn outline sm"><Download aria-hidden="true" />Export selected</button></div>
            <div className="aa-table-scroll"><table className="aa-table ae-table">
              <colgroup><col style={{ width: 26 }} /><col style={{ width: 138 }} /><col style={{ width: 72 }} /><col style={{ width: 96 }} /><col style={{ width: 84 }} /><col style={{ width: 66 }} /><col style={{ width: 50 }} /><col style={{ width: 70 }} /><col style={{ width: 62 }} /><col style={{ width: 56 }} /><col style={{ width: 62 }} /><col style={{ width: 44 }} /><col style={{ width: 44 }} /></colgroup>
              <thead><tr><th className="ck"><SelectAll /></th><th>Event</th><th>Type</th><th>Owner</th><th>Date &amp; time</th><th>Status</th><th>Visibility</th><th>Tickets</th><th>GMV</th><th>Providers</th><th>Readiness</th><th>Flags</th><th className="act">Actions</th></tr></thead>
              <tbody>{list.map(e => {
                const m = metrics.get(e.id), st = evStatus(e, now), r = readiness(e, m), ws = e.workspace_id ? wsNames.get(e.workspace_id) : null, owner = owners.get(e.owner_id);
                return <tr key={e.id} className={e.id === selId ? "sel" : ""}>
                  <td className="ck"><input type="checkbox" name="id" value={e.id} aria-label={`Select ${e.name}`} /></td>
                  <td><Link className="aa-who" href={qs(base, sp, { sel: e.id })} scroll={false}><Thumb src={e.cover_image || null} w={36} h={36} /><div><b>{e.name}</b><small>{shortRef("EVT", e.id, e.settings?.reference)}</small></div></Link></td>
                  <td><span className={`aa-chip ${typeTone(e.event_type)}`}>{typeLabel(e.event_type)}</span></td>
                  <td><span className="aa-who"><Avatar src={ws?.cover_image || owner?.avatar_url || null} name={ownerName(e)} size={22} /><span className="nm">{ownerName(e)}</span></span></td>
                  <td className="ae-date">{day(e.starts_at, { day: "numeric", month: "short", year: "numeric" })}<small>{hmRange(e.starts_at, e.ends_at)}</small><small>{e.city ? `${e.city}, UK` : "—"}</small></td>
                  <td><Status value={st.key} label={st.label} dot={st.key === "live"} /></td>
                  <td><span className={`aa-chip ${e.visibility === "public" ? "green" : "purple"}`}>{titleCase(e.visibility)}</span></td>
                  <td>{m?.capacity ? <><span className="ae-sold">{m.sold.toLocaleString("en-GB")} / {m.capacity.toLocaleString("en-GB")}</span><span className="ae-bar"><i style={{ width: `${Math.min(100, (m.sold / m.capacity) * 100)}%` }} /></span></> : <span className="aa-muted">—</span>}</td>
                  <td>{money(m?.gross ?? 0)}</td>
                  <td className="c">{m?.providers ?? 0}</td>
                  <td><span className="ae-ready"><Ring value={r} size={22} /><span>{r}%</span></span></td>
                  <td>{m?.flags ? <span className="ae-flag"><CircleAlert aria-hidden="true" />{m.flags}</span> : <span className="aa-muted">–</span>}</td>
                  <td className="act"><AdminMenu label={`Actions for ${e.name}`} entries={[
                    { kind: "link", label: "View details", href: qs(base, sp, { sel: e.id }) },
                    ...(permissions.has("tickets") ? [{ kind: "link" as const, label: "Ticketing", href: `/admin/tickets?sel=${e.id}` }] : []),
                    ...(e.workspace_id ? [{ kind: "link" as const, label: "Open workspace", href: `/admin/workspaces/${e.workspace_id}` }] : []),
                    e.status === "suspended"
                      ? { kind: "action", label: "Reinstate event", action: setEventRestriction, args: [e.id, false], reason: true, confirm: { title: `Reinstate ${e.name}?`, body: "The event returns to its previous status. Paused ticket tiers stay paused until resumed in Tickets.", cta: "Reinstate" } }
                      : { kind: "action", label: "Unpublish / Restrict", action: setEventRestriction, args: [e.id, true], reason: true, danger: true, confirm: { title: `Restrict ${e.name}?`, body: "The event is unpublished and ticket sales are paused. Existing tickets stay valid. The organizer can appeal.", cta: "Restrict event" } }]} /></td>
                </tr>;
              })}
              {!list.length && <tr><td colSpan={13}><div className="aa-empty">No events match these filters.</div></td></tr>}</tbody>
            </table></div>
          </div>
        </form>
        <nav className="aa-pager" aria-label="Pagination">
          <span className="aa-pager-per">Sort <Suspense><ParamSelect param="sort" label="Sort events" value={sort === "featured" ? "" : sort} className="aa-select sm"
            options={[{ value: "", label: "Featured, then revenue" }, { value: "newest", label: "Newest" }, { value: "starts", label: "Event date" }, { value: "name", label: "Name A–Z" }]} /></Suspense></span>
          <span className="aa-pager-range">{from.toLocaleString("en-GB")}–{to.toLocaleString("en-GB")} of {res.filtered.toLocaleString("en-GB")}</span>
          <span className="aa-pager-nums">{firstHref && <Link className="ws-btn outline sm" href={firstHref} scroll={false}>First page</Link>}
            {nextHref ? <Link className="ws-btn outline sm" href={nextHref} scroll={false}>Next 50</Link> : <span className="ws-btn outline sm" aria-disabled="true">Next 50</span>}</span>
        </nav>
      </div>
      {sel ? <Suspense fallback={<aside className="aa-drawer" aria-busy="true" />}><EventDrawer e={sel} m={metrics.get(sel.id)} sp={sp} ownerLabel={ownerName(sel)} wsRef={sel.workspace_id ? wsNames.get(sel.workspace_id)?.settings?.reference : undefined}
        canTrust={permissions.has("trust")} canAudit={permissions.has("audit")} canSupport={permissions.has("support")} canTickets={permissions.has("tickets")} canMarket={permissions.has("marketplace")} /></Suspense>
        : <aside className="aa-drawer"><p className="aa-empty">Select an event to see its performance, flags and activity.</p></aside>}
    </div>
  </div>;
}

async function EventDrawer({ e, m, sp, ownerLabel, wsRef, canTrust, canAudit, canSupport, canTickets, canMarket }: { e: Ev; m?: EvMetric; sp: SP; ownerLabel: string; wsRef?: string;
  canTrust: boolean; canAudit: boolean; canSupport: boolean; canTickets: boolean; canMarket: boolean }) {
  const { db } = await requireAdminPermission("events");
  const now = requestTime();
  const [trust, audit, sales] = await Promise.all([
    canTrust ? rows<{ id: string; reference: string; category: string; reason: string; status: string; created_at: string }>(
      db.from("trust_cases").select("id,reference,category,reason,status,created_at").eq("subject_type", "event").or(`subject_id.eq.${e.id},subject_name.eq."${e.name.replaceAll('"', "")}"`).order("created_at", { ascending: false }).limit(3)) : Promise.resolve([]),
    canAudit ? rows<{ id: number; event: string; metadata: Record<string, unknown>; created_at: string }>(db.from("audit_events").select("id,event,metadata,created_at").or(`metadata->>event_id.eq.${e.id},metadata->>event.eq."${e.name.replaceAll('"', "")}"`).order("created_at", { ascending: false }).limit(3)) : Promise.resolve([]),
    canTickets ? rows<{ created_at: string; price_paid: number; order_ref: string; attendee_name: string }>(db.from("tickets").select("created_at,price_paid,order_ref,attendee_name").eq("event_id", e.id).neq("status", "refunded").order("created_at", { ascending: false }).limit(1000)) : Promise.resolve([]),
  ]);
  const st = evStatus(e, now), r = readiness(e, m), base = "/admin/events";
  const daysAgo = (iso: string) => Math.floor((now - new Date(iso).getTime()) / 864e5);
  const series = Array.from({ length: 30 }, (_, i) => sales.filter(t => daysAgo(t.created_at) === 29 - i).reduce((a, t) => a + Number(t.price_paid), 0));
  const cnt = Array.from({ length: 30 }, (_, i) => sales.filter(t => daysAgo(t.created_at) === 29 - i).length);
  const prevSold = sales.filter(t => daysAgo(t.created_at) >= 30 && daysAgo(t.created_at) < 60).length, prevGross = sales.filter(t => daysAgo(t.created_at) >= 30 && daysAgo(t.created_at) < 60).reduce((a, t) => a + Number(t.price_paid), 0);
  const lastOrder = sales[0];
  const publicHref = e.visibility === "public" && e.slug && ["published", "on_sale", "live"].includes(e.status) ? `/events/${e.slug}` : null;

  return <aside className="aa-drawer ae-drawer" aria-label={`${e.name} details`}>
    <div className="aa-drawer-head"><Thumb src={e.cover_image || null} w={100} h={70} /><div><Status value={st.key} label={e.status === "suspended" ? "Restricted" : e.visibility === "public" && st.key !== "draft" ? "Published" : st.label} />
      <h2>{e.name}</h2><small>{shortRef("EVT", e.id, e.settings?.reference)}</small></div><DrawerClose href={qs(base, sp, { sel: "none" })} /></div>
    <nav className="aa-dtabs aw-dtabs" aria-label="Event sections"><span className="t on">Overview</span>
      {canTickets ? <Link href={`/admin/tickets?sel=${e.id}`}>Tickets</Link> : <span className="t">Tickets</span>}
      {canMarket ? <Link href={`/admin/marketplace?tab=requests&q=${encodeURIComponent(e.name)}`}>Providers ({m?.providers ?? 0})</Link> : <span className="t">Providers ({m?.providers ?? 0})</span>}
      {e.workspace_id ? <Link href={`/admin/workspaces/${e.workspace_id}?tab=activity`}>Activity</Link> : <span className="t">Activity</span>}
      <AdminMenu label="More event actions" entries={[{ kind: "link", label: "Export (CSV)", href: `${base}/export?id=${e.id}` }, ...(publicHref ? [{ kind: "link" as const, label: "Public page", href: publicHref }] : [])]} /></nav>
    <ul className="ae-facts">
      <li><CalendarDays aria-hidden="true" />{day(e.starts_at, { day: "numeric", month: "short", year: "numeric" })} · {hmRange(e.starts_at, e.ends_at)}</li>
      <li><MapPin aria-hidden="true" />{[e.venue_name, e.city].filter(Boolean).join(", ") || "Location not set"}{e.city ? ", UK" : ""}{e.venue_listing_id && canMarket && <Link className="aa-link" href={`/admin/marketplace/listings/${e.venue_listing_id}`}>View venue <ArrowRight aria-hidden="true" /></Link>}</li>
      <li><Briefcase aria-hidden="true" />{typeLabel(e.event_type)}</li>
      <li><Building2 aria-hidden="true" />{ownerLabel}{wsRef ? ` (${wsRef})` : ""}{e.workspace_id && <Link className="aa-link" href={`/admin/workspaces/${e.workspace_id}`}>Open <ArrowRight aria-hidden="true" /></Link>}</li>
    </ul>
    <section>
      <SectionHead title={<>Performance <span>(last 30 days)</span></>} href={canTickets ? `/admin/tickets?sel=${e.id}` : undefined} label="View analytics" />
      <div className="ae-perf">
        <MiniStat value={money(series.reduce((a, b) => a + b, 0))} label="Ticket GMV" delta={canTickets ? delta(series.reduce((a, b) => a + b, 0), prevGross) : undefined} />
        <MiniStat value={cnt.reduce((a, b) => a + b, 0).toLocaleString("en-GB")} label="Tickets sold" delta={canTickets ? delta(cnt.reduce((a, b) => a + b, 0), prevSold) : undefined} />
        <MiniStat value={String(m?.providers ?? 0)} label="Providers" />
        <MiniStat value={`${r}%`} label="Readiness" />
      </div>
    </section>
    <section>
      <SectionHead title="Status &amp; visibility" />
      <div className="ae-sv">
        <label>Status<span className="ae-ro">{st.label}</span></label>
        <label>Visibility<span className="ae-ro">{titleCase(e.visibility)}</span></label>
        <label className="sw">Featured event<ReasonToggle on={!!e.settings?.featured} label="Featured event" action={setEventFeatured} args={[e.id]} disabled={e.visibility !== "public" || ["cancelled", "suspended"].includes(e.status)} /></label>
      </div>
    </section>
    {canTrust && <section>
      <SectionHead title="Trust &amp; flags" href={`/admin/trust?q=${encodeURIComponent(e.name)}`} />
      {trust.length ? <ul className="ae-flags">{trust.map(t => <li key={t.id}><span className="ico"><CircleAlert aria-hidden="true" /></span><div><b>{t.category} – {t.reason.slice(0, 40)}</b><small>#{t.reference} · {relative(t.created_at, now)}</small></div>
        <Status value={t.status} dot={false} /></li>)}</ul> : <p className="aa-empty">No trust cases for this event.</p>}
    </section>}
    <section>
      <SectionHead title="Recent activity" href={e.workspace_id ? `/admin/workspaces/${e.workspace_id}?tab=activity` : undefined} />
      <ul className="aa-tls ae-tls">
        {lastOrder && <TimelineItem icon={ShoppingBag} title={`New ticket sale (${lastOrder.attendee_name})`} meta={`${relative(lastOrder.created_at, now)} · ${money(lastOrder.price_paid, "GBP", { cents: true })}`} />}
        {audit.map(a => <TimelineItem key={a.id} icon={a.event.includes("created") ? CalendarPlus : a.event.includes("feature") ? Star : Pencil} title={titleCase(a.event.replace(/\./g, " "))} meta={relative(a.created_at, now)} />)}
        {!lastOrder && !audit.length && <li className="aa-empty">No recent activity.</li>}
      </ul>
    </section>
    <div className="aa-drawer-actions"><div className="row" style={{ ["--n" as string]: 3 }}>
      {publicHref ? <Link className="ws-btn primary" href={publicHref}><ExternalLink aria-hidden="true" />Open event</Link>
        : canTickets ? <Link className="ws-btn primary" href={`/admin/tickets?sel=${e.id}`}><ExternalLink aria-hidden="true" />Open event</Link> : <span />}
      {canSupport ? <Link className="ws-btn outline" href={`/admin/support?q=${encodeURIComponent(e.name)}`}><Headphones aria-hidden="true" />Support</Link> : <span />}
      {e.status === "suspended"
        ? <ActionButton action={setEventRestriction} args={[e.id, false]} reason variant="outline" confirm={{ title: `Reinstate ${e.name}?`, body: "The event returns to its previous status. Paused ticket tiers stay paused until resumed in Tickets.", cta: "Reinstate" }}><CircleCheck aria-hidden="true" />Reinstate</ActionButton>
        : <ActionButton action={setEventRestriction} args={[e.id, true]} reason variant="danger" confirm={{ title: `Restrict ${e.name}?`, body: "The event is unpublished and ticket sales are paused. Existing tickets stay valid. The organizer can appeal.", cta: "Restrict event" }}><Ban aria-hidden="true" />Unpublish / Restrict</ActionButton>}
    </div></div>
  </aside>;
}
