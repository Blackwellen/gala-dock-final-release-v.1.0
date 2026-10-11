import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Ticket, Globe, CalendarDays, Clock3, ShieldAlert, Download, Filter, MapPin, Briefcase, Building2, ArrowRight, Eye, Headphones, PauseCircle, PlayCircle, CircleAlert, Settings2 } from "lucide-react";
import "@/styles/admin-a-base.css";
import "@/styles/admin-a-events.css";
import "@/styles/admin-a-tickets.css";
import { Kpi, Thumb, Restricted } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { money, day, relative, requestTime, delta, titleCase } from "@/lib/workspace/format";
import { AdminMenu, ParamSelect, SearchBox, SelectAll } from "../_a/client";
import { Pager, LineTabs, Status, DrawerClose, SectionHead, MiniStat } from "../_a/ui";
import { shortRef, str, pageOf, qs, rpc, hmRange, periodOf, PERIODS, type SP } from "../_a/lib";
import { EV_COLS, loadEventMetrics, loadWorkspaceNames, evStatus, typeLabel, type Ev, type EvMetric } from "../_a/events";
import { setTicketSales } from "../_a/actions";

export const metadata: Metadata = { title: "Tickets" };
type Daily = { day: string; sold: number; revenue: number; refunded: number; scans: number; anomalies: number };
type Tk = { id: string; code: string; order_ref: string; attendee_name: string; attendee_email: string; status: string; price_paid: number; created_at: string; event_id: string; event: { name: string } | null };

const tierLabel: Record<string, string> = { on_sale: "On sale", sold_out: "Sold out", paused: "Paused", draft: "Draft", scheduled: "Scheduled" };
function risk(e: Ev, m?: EvMetric) {
  const refundRate = m && m.sold + m.refunded ? m.refunded / (m.sold + m.refunded) : 0;
  if ((m?.max_risk ?? 0) >= 70 || e.status === "suspended" || (e.status === "cancelled" && (m?.sold ?? 0) > 0)) return { key: "high", label: "High" };
  if ((m?.flags ?? 0) > 0 || refundRate > 0.02 || (m?.scan_anomalies ?? 0) > 0 || e.status === "cancelled") return { key: "medium", label: "Medium" };
  return { key: "low", label: "Low" };
}
const sumK = (d: Daily[], k: keyof Daily) => d.reduce((a, x) => a + Number(x[k]), 0);

export default async function TicketsPage(props: PageProps<"/admin/tickets">) {
  const ctx = await requireAdminPermission("tickets");
  if (!ctx.allowed) return <Restricted area="Tickets" />;
  const sp = (await props.searchParams) as SP;
  const { db, permissions } = ctx;
  const now = requestTime(), period = periodOf(sp);
  const tab = ["orders", "transfers", "scans", "refunds"].includes(str(sp, "tab")) ? str(sp, "tab") : "events";
  const q = str(sp, "q").trim().toLowerCase().slice(0, 80), f = (k: string) => str(sp, k);
  const { per, page, offset } = pageOf(sp);

  const [all, metrics, wsNames, daily] = await Promise.all([
    rows<Ev>(db.from("events").select(EV_COLS).order("created_at", { ascending: false }).limit(5000)),
    loadEventMetrics(db, period.days), loadWorkspaceNames(db),
    rpc<Daily[]>(db, "admin_ticket_daily", { p_days: period.days }),
  ]);
  const cur = daily.slice(-period.days), prev = daily.slice(0, daily.length - period.days);
  const sold = sumK(cur, "sold"), rev = sumK(cur, "revenue"), refunds = sumK(cur, "refunded"), anomalies = sumK(cur, "anomalies");
  const refundRate = sold + refunds ? (100 * refunds) / (sold + refunds) : 0, prevRefundRate = sumK(prev, "sold") + sumK(prev, "refunded") ? (100 * sumK(prev, "refunded")) / (sumK(prev, "sold") + sumK(prev, "refunded")) : 0;
  const ticketed = all.filter(e => (metrics.get(e.id)?.capacity ?? 0) > 0);
  const activeTicketed = ticketed.filter(e => metrics.get(e.id)?.tier_status === "on_sale" && e.starts_at && new Date(e.starts_at).getTime() > now);
  const cities = [...new Set(ticketed.map(e => e.city).filter(Boolean))].sort(), types = [...new Set(ticketed.map(e => e.event_type))].sort();
  const base = "/admin/tickets";

  const filtered = ticketed.filter(e => {
    const m = metrics.get(e.id);
    if (q && !`${e.name} ${e.settings?.reference ?? ""} ${e.venue_name} ${e.city} ${e.id}`.toLowerCase().includes(q)) return false;
    if (f("type") && e.event_type !== f("type")) return false;
    if (f("estatus") && evStatus(e, now).key !== f("estatus")) return false;
    if (f("tstatus") && (m?.tier_status ?? "draft") !== f("tstatus")) return false;
    if (f("vis") && e.visibility !== f("vis")) return false;
    if (f("risk") && risk(e, m).key !== f("risk")) return false;
    if (f("city") && e.city !== f("city")) return false;
    return true;
  }).sort((a, b) => Number(!!b.settings?.featured) - Number(!!a.settings?.featured) || (metrics.get(b.id)?.gross ?? 0) - (metrics.get(a.id)?.gross ?? 0));
  const list = filtered.slice(offset, offset + per);
  const selId = f("sel") === "none" ? null : isUuid(f("sel")) ? f("sel") : tab === "events" ? list[0]?.id ?? null : null;
  const sel = all.find(e => e.id === selId);

  // Non-event tabs read ticket rows directly (RLS: tickets permission).
  const evFilter = isUuid(f("event")) ? f("event") : null;
  const tickets = tab === "events" ? [] : await (async () => {
    let qb = db.from("tickets").select("id,code,order_ref,attendee_name,attendee_email,status,price_paid,created_at,event_id,event:events(name)");
    if (evFilter) qb = qb.eq("event_id", evFilter);
    if (tab === "transfers") qb = qb.in("status", ["transferred", "resale_listed", "resold"]);
    if (tab === "refunds") qb = qb.eq("status", "refunded");
    if (q) qb = qb.or(`attendee_name.ilike.%${q.replace(/[%,()]/g, "")}%,attendee_email.ilike.%${q.replace(/[%,()]/g, "")}%,order_ref.ilike.%${q.replace(/[%,()]/g, "")}%,code.ilike.%${q.replace(/[%,()]/g, "")}%`);
    return rows<Tk>(qb.order("created_at", { ascending: false }).limit(1000));
  })();
  const scans = tab === "scans" ? await rows<{ id: number; result: string; created_at: string; event: { name: string } | null; ticket: { code: string; attendee_name: string } | null }>(
    (evFilter ? db.from("check_ins").select("id,result,created_at,event:events(name),ticket:tickets(code,attendee_name)").eq("event_id", evFilter) : db.from("check_ins").select("id,result,created_at,event:events(name),ticket:tickets(code,attendee_name)"))
      .order("created_at", { ascending: false }).range(offset, offset + per - 1)) : [];
  const orders = [...tickets.reduce((acc, t) => { const o = acc.get(t.order_ref) ?? { ref: t.order_ref, buyer: t.attendee_name, email: t.attendee_email, event: t.event?.name ?? "", at: t.created_at, n: 0, total: 0, statuses: new Set<string>() };
    o.n++; o.total += Number(t.price_paid); o.statuses.add(t.status); acc.set(t.order_ref, o); return acc; }, new Map<string, { ref: string; buyer: string; email: string; event: string; at: string; n: number; total: number; statuses: Set<string> }>()).values()];
  const orderStatus = (s: Set<string>) => s.size === 1 && s.has("refunded") ? ["refunded", "Refunded"] : s.has("refunded") ? ["pending", "Part refunded"] : s.has("transferred") || s.has("resold") ? ["upcoming", "Transferred"] : ["paid", "Paid"];

  return <div className="aa at">
    <header className="ws-page-head">
      <div><h1>Tickets</h1><p>Operate ticketed events, transactions and admission anomalies.</p></div>
      <div className="aa-head-actions"><a className="ws-btn outline" href={qs(`${base}/export`, sp, { page: null, sel: null, per: null })}><Download aria-hidden="true" />Export</a></div>
    </header>
    <section className="aa-kpis at-kpis" aria-label="Ticketing metrics">
      <Kpi icon={Ticket} tone="blue" label={`Total Tickets Sold (${period.days}d)`} value={sold.toLocaleString("en-GB")} delta={delta(sold, sumK(prev, "sold"))} deltaSuffix={`vs last ${period.days} days`} series={cur.map(d => Number(d.sold))} />
      <Kpi icon={Globe} tone="purple" label={`Total Revenue (${period.days}d)`} value={money(rev)} delta={delta(rev, sumK(prev, "revenue"))} deltaSuffix={`vs last ${period.days} days`} series={cur.map(d => Number(d.revenue))} />
      <Kpi icon={CalendarDays} tone="green" label="Active Events (Ticketed)" value={activeTicketed.length.toLocaleString("en-GB")} delta={null} />
      <Kpi icon={Clock3} tone="red" label="Refund Rate" value={`${refundRate.toFixed(1)}%`} delta={prevRefundRate ? Math.round(((refundRate - prevRefundRate) / prevRefundRate) * 100) : null} deltaSuffix={`vs last ${period.days} days`} invert series={cur.map(d => Number(d.refunded))} />
      <Kpi icon={ShieldAlert} tone="orange" label="Scan Anomalies" value={anomalies.toLocaleString("en-GB")} delta={delta(anomalies, sumK(prev, "anomalies"))} deltaSuffix={`vs last ${period.days} days`} invert series={cur.map(d => Number(d.anomalies))} />
    </section>

    <div className={tab === "events" ? "aa-split" : "am-full"}>
      <div className="aa-listcol">
        <div className="at-head"><LineTabs base={base} sp={{ period: f("period") }} active={tab} className="at-tabs" tabs={[{ key: "events", label: "Events" }, { key: "orders", label: "Orders" }, { key: "transfers", label: "Transfers / Resale" }, { key: "scans", label: "Scans" }, { key: "refunds", label: "Refunds" }]} /></div>
        <div className="aa-bar"><Suspense><SearchBox placeholder={tab === "events" ? "Search by event name, venue, city or event ID..." : "Search by buyer, email, order ID or ticket code..."} /></Suspense>
          <Suspense><ParamSelect param="period" label="Period" value={String(period.days)} className="aa-select at-period" options={[{ value: "30", label: PERIODS["30"]!.label }, { value: "7", label: PERIODS["7"]!.label }, { value: "90", label: PERIODS["90"]!.label }]} /></Suspense>
          <Link className="ws-btn outline aa-filters-btn" href={qs(base, {}, { tab: tab === "events" ? null : tab })}><Filter aria-hidden="true" />Clear filters</Link></div>
        {evFilter && tab !== "events" && <p className="at-scope">Showing {titleCase(tab)} for <b>{all.find(e => e.id === evFilter)?.name ?? "one event"}</b> · <Link className="aa-link" href={qs(base, sp, { event: null, page: null })}>Show all</Link></p>}

        {tab === "events" && <>
          <Suspense><div className="aa-filters at-filters">
            <label>Event type<ParamSelect param="type" label="Event type" value={f("type")} options={[{ value: "", label: "All types" }, ...types.map(t => ({ value: t, label: typeLabel(t) }))]} /></label>
            <label>Event status<ParamSelect param="estatus" label="Event status" value={f("estatus")} options={[{ value: "", label: "All statuses" }, ...["upcoming", "on_sale", "live", "completed", "draft", "cancelled", "restricted"].map(s => ({ value: s, label: titleCase(s) }))]} /></label>
            <label>Ticket status<ParamSelect param="tstatus" label="Ticket status" value={f("tstatus")} options={[{ value: "", label: "All statuses" }, ...Object.entries(tierLabel).map(([value, label]) => ({ value, label }))]} /></label>
            <label>Visibility<ParamSelect param="vis" label="Visibility" value={f("vis")} options={[{ value: "", label: "All" }, { value: "public", label: "Public" }, { value: "private", label: "Private" }]} /></label>
            <label>Fraud/risk<ParamSelect param="risk" label="Fraud risk" value={f("risk")} options={[{ value: "", label: "All" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} /></label>
            <label>Location<ParamSelect param="city" label="Location" value={f("city")} options={[{ value: "", label: "All locations" }, ...cities.map(c => ({ value: c, label: c }))]} /></label>
          </div></Suspense>
          <form className="aa-table-form" action={`${base}/export`} method="get">
            <div className="aa-table-card">
              <div className="aa-bulk"><span>Selected events</span><button type="submit" className="ws-btn outline sm"><Download aria-hidden="true" />Export selected</button></div>
              <div className="aa-table-scroll"><table className="aa-table ae-table at-table">
                <colgroup><col style={{ width: 26 }} /><col style={{ width: 160 }} /><col style={{ width: 100 }} /><col style={{ width: 104 }} /><col style={{ width: 104 }} /><col style={{ width: 70 }} /><col style={{ width: 92 }} /><col style={{ width: 50 }} /><col style={{ width: 70 }} /><col style={{ width: 52 }} /></colgroup>
                <thead><tr><th className="ck"><SelectAll /></th><th>Event</th><th>Date &amp; time</th><th>Venue</th><th>Sold / Capacity</th><th>Revenue</th><th className="c">Status</th><th className="c">Risk</th><th></th><th className="act">Actions</th></tr></thead>
                <tbody>{list.map(e => {
                  const m = metrics.get(e.id), r = risk(e, m), pctSold = m?.capacity ? Math.round((100 * m.sold) / m.capacity) : 0;
                  const ended = !!e.starts_at && new Date(e.ends_at ?? e.starts_at).getTime() < now;
                  const ts = e.status === "cancelled" ? "cancelled" : e.status === "suspended" ? "suspended" : ended ? "ended" : m?.tier_status ?? "draft";
                  return <tr key={e.id} className={e.id === selId ? "sel" : ""}>
                    <td className="ck"><input type="checkbox" name="id" value={e.id} aria-label={`Select ${e.name}`} /></td>
                    <td><Link className="aa-who" href={qs(base, sp, { sel: e.id })} scroll={false}><Thumb src={e.cover_image || null} w={42} h={36} /><div><b>{e.name}</b><small>{shortRef("EVT", e.id, e.settings?.reference)}</small></div></Link></td>
                    <td>{day(e.starts_at, { day: "numeric", month: "short", year: "numeric" })}<small>{hmRange(e.starts_at, e.ends_at)}</small></td>
                    <td>{e.venue_name || "—"}<small>{e.city ? `${e.city}, UK` : ""}</small></td>
                    <td><span className="ae-sold">{(m?.sold ?? 0).toLocaleString("en-GB")} / {(m?.capacity ?? 0).toLocaleString("en-GB")}</span><span className="at-meter"><span className="ae-bar"><i style={{ width: `${Math.min(100, pctSold)}%` }} /></span><small>{pctSold}%</small></span></td>
                    <td>{money(m?.gross ?? 0)}</td>
                    <td className="c"><span className={`at-ts ${ts}`}>{ts === "cancelled" ? "Cancelled" : ts === "suspended" ? "Restricted" : ts === "ended" ? "Ended" : tierLabel[ts] ?? titleCase(ts)}</span></td>
                    <td className="c"><span className={`at-risk ${r.key}`} title={`${r.label} risk`}><CircleAlert aria-hidden="true" /></span></td>
                    <td><span className={`at-rl ${r.key}`}>{r.label}</span></td>
                    <td className="act"><AdminMenu label={`Actions for ${e.name}`} entries={[
                      { kind: "link", label: "View orders", href: qs(base, {}, { tab: "orders", event: e.id }) },
                      { kind: "link", label: "View scans", href: qs(base, {}, { tab: "scans", event: e.id }) },
                      ...(permissions.has("events") ? [{ kind: "link" as const, label: "Open in Events", href: `/admin/events?sel=${e.id}` }] : []),
                      ...(m?.tier_status === "on_sale" ? [{ kind: "action" as const, label: "Pause ticket sales", action: setTicketSales, args: [e.id, true], reason: true, danger: true, confirm: { title: `Pause sales for ${e.name}?`, body: "All on-sale ticket types stop selling immediately. Issued tickets stay valid.", cta: "Pause sales" } }]
                        : m?.tier_status === "paused" && e.status !== "suspended" ? [{ kind: "action" as const, label: "Resume ticket sales", action: setTicketSales, args: [e.id, false], reason: true, confirm: { title: `Resume sales for ${e.name}?`, body: "Paused ticket types go back on sale (or sold out if full).", cta: "Resume sales" } }] : [])]} /></td>
                  </tr>;
                })}
                {!list.length && <tr><td colSpan={10}><div className="aa-empty">No ticketed events match these filters.</div></td></tr>}</tbody>
              </table></div>
            </div>
          </form>
          <Pager base={base} sp={sp} page={page} per={per} total={filtered.length} />
        </>}

        {(tab === "orders" || tab === "refunds") && <><div className="aa-table-card"><div className="aa-table-scroll"><table className="aa-table at-orders">
          <thead><tr><th>Order ID</th><th>Buyer</th><th>Event</th><th>Tickets</th><th>Total</th><th>Placed</th><th>Status</th></tr></thead>
          <tbody>{orders.slice(offset, offset + per).map(o => { const [k, label] = orderStatus(o.statuses); return <tr key={o.ref}><td><b>#{o.ref}</b></td><td>{o.buyer}<small>{o.email}</small></td><td>{o.event}</td><td>{o.n}</td>
            <td>{money(o.total, "GBP", { cents: true })}</td><td>{relative(o.at, now)}</td><td><Status value={k!} label={label} /></td></tr>; })}
            {!orders.length && <tr><td colSpan={7}><div className="aa-empty">No {tab === "refunds" ? "refunded orders" : "orders"} found.</div></td></tr>}</tbody></table></div></div>
          <Pager base={base} sp={sp} page={page} per={per} total={orders.length} /></>}
        {tab === "transfers" && <><div className="aa-table-card"><div className="aa-table-scroll"><table className="aa-table at-orders">
          <thead><tr><th>Ticket</th><th>Holder</th><th>Event</th><th>Order</th><th>Price</th><th>Updated</th><th>Status</th></tr></thead>
          <tbody>{tickets.slice(offset, offset + per).map(t => <tr key={t.id}><td><b>{t.code}</b></td><td>{t.attendee_name}<small>{t.attendee_email}</small></td><td>{t.event?.name}</td><td>#{t.order_ref}</td>
            <td>{money(t.price_paid, "GBP", { cents: true })}</td><td>{relative(t.created_at, now)}</td><td><Status value="upcoming" label={titleCase(t.status)} dot={false} /></td></tr>)}
            {!tickets.length && <tr><td colSpan={7}><div className="aa-empty">No transfers or resale listings.</div></td></tr>}</tbody></table></div></div>
          <Pager base={base} sp={sp} page={page} per={per} total={tickets.length} /></>}
        {tab === "scans" && <><div className="aa-table-card"><div className="aa-table-scroll"><table className="aa-table at-orders">
          <thead><tr><th>Scanned</th><th>Event</th><th>Ticket</th><th>Attendee</th><th>Result</th></tr></thead>
          <tbody>{scans.map(s => <tr key={s.id}><td>{day(s.created_at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>{s.event?.name}</td><td>{s.ticket?.code ?? "—"}</td><td>{s.ticket?.attendee_name ?? "—"}</td>
            <td><Status value={s.result === "admitted" ? "verified" : "cancelled"} label={titleCase(s.result)} /></td></tr>)}
            {!scans.length && <tr><td colSpan={5}><div className="aa-empty">No scans recorded.</div></td></tr>}</tbody></table></div></div>
          <Pager base={base} sp={sp} page={page} per={per} total={offset + scans.length + (scans.length === per ? per : 0)} /></>}
      </div>
      {tab === "events" && (sel ? <Suspense fallback={<aside className="aa-drawer" aria-busy="true" />}><TicketDrawer e={sel} m={metrics.get(sel.id)} sp={sp} days={period.days} org={sel.workspace_id ? wsNames.get(sel.workspace_id) : undefined}
        canEvents={permissions.has("events")} canSupport={permissions.has("support")} canMarket={permissions.has("marketplace")} /></Suspense>
        : <aside className="aa-drawer"><p className="aa-empty">Select an event to see its ticketing performance.</p></aside>)}
    </div>
  </div>;
}

async function TicketDrawer({ e, m, sp, days, org, canEvents, canSupport, canMarket }: { e: Ev; m?: EvMetric; sp: SP; days: number; org?: { id: string; name: string; settings: { reference?: string } | null };
  canEvents: boolean; canSupport: boolean; canMarket: boolean }) {
  const { db } = await requireAdminPermission("tickets");
  const [daily, recent] = await Promise.all([
    rpc<Daily[]>(db, "admin_ticket_daily", { p_days: days, p_event: e.id }),
    rows<{ order_ref: string; attendee_name: string; status: string; price_paid: number; created_at: string }>(db.from("tickets").select("order_ref,attendee_name,status,price_paid,created_at").eq("event_id", e.id).order("created_at", { ascending: false }).limit(60)),
  ]);
  const cur = daily.slice(-days), prev = daily.slice(0, daily.length - days);
  const sold = sumK(cur, "sold"), rev = sumK(cur, "revenue"), rf = sumK(cur, "refunded"), prf = sumK(prev, "refunded"), pSold = sumK(prev, "sold");
  const capPct = m?.capacity ? Math.round((100 * m.sold) / m.capacity) : 0, capPrev = m?.capacity ? Math.round((100 * (m.sold - sold)) / m.capacity) : 0;
  const rRate = sold + rf ? (100 * rf) / (sold + rf) : 0, pRate = pSold + prf ? (100 * prf) / (pSold + prf) : 0;
  const orders = [...recent.reduce((acc, t) => { const o = acc.get(t.order_ref) ?? { ref: t.order_ref, buyer: t.attendee_name, n: 0, total: 0, refunded: true }; o.n++; o.total += Number(t.price_paid); o.refunded &&= t.status === "refunded"; acc.set(t.order_ref, o); return acc; },
    new Map<string, { ref: string; buyer: string; n: number; total: number; refunded: boolean }>()).values()].slice(0, 5);
  const base = "/admin/tickets", ts = m?.tier_status;
  const cumulative = cur.reduce<number[]>((a, d) => [...a, (a.at(-1) ?? 0) + Number(d.sold)], []);

  return <aside className="aa-drawer at-drawer" aria-label={`${e.name} ticketing`}>
    <div className="aa-drawer-head"><Thumb src={e.cover_image || null} w={104} h={70} /><div><Status value={ts === "on_sale" ? "verified" : ts === "paused" ? "pending" : "draft"} label={ts ? tierLabel[ts] ?? titleCase(ts) : "No tickets"} />
      <h2>{e.name}</h2><small>{shortRef("EVT", e.id, e.settings?.reference)}</small></div><DrawerClose href={qs(base, sp, { sel: "none" })} /></div>
    <nav className="aa-dtabs aw-dtabs" aria-label="Ticketing sections"><span className="t on">Overview</span>
      <Link href={qs(base, {}, { tab: "orders", event: e.id })}>Orders</Link><Link href={qs(base, {}, { tab: "transfers", event: e.id })}>Tickets</Link>
      <Link href={qs(base, {}, { tab: "scans", event: e.id })}>Scans</Link><Link href={qs(base, {}, { tab: "refunds", event: e.id })}>Refunds</Link>
      <AdminMenu label="More ticketing actions" entries={[{ kind: "link", label: "Export (CSV)", href: `${base}/export?id=${e.id}` }]} /></nav>
    <section>
      <SectionHead title="Event summary" href={canEvents ? `/admin/events?sel=${e.id}` : undefined} label="Open event" />
      <ul className="ae-facts">
        <li><CalendarDays aria-hidden="true" />{day(e.starts_at, { day: "numeric", month: "short", year: "numeric" })} · {hmRange(e.starts_at, e.ends_at)}</li>
        <li><MapPin aria-hidden="true" />{[e.venue_name, e.city].filter(Boolean).join(", ")}{e.city ? ", UK" : ""}{e.venue_listing_id && canMarket && <Link className="aa-link" href={`/admin/marketplace/listings/${e.venue_listing_id}`}>View venue <ArrowRight aria-hidden="true" /></Link>}</li>
        <li><Briefcase aria-hidden="true" />{typeLabel(e.event_type)}</li>
        <li><Building2 aria-hidden="true" />{org ? `${org.name}${org.settings?.reference ? ` (${org.settings.reference})` : ""}` : "Customer event"}{org && <Link className="aa-link" href={`/admin/workspaces/${org.id}`}>View organizer <ArrowRight aria-hidden="true" /></Link>}</li>
      </ul>
    </section>
    <section>
      <SectionHead title="Ticketing performance"><span className="at-pill">{PERIODS[String(days)]?.label ?? `Last ${days} days`}</span></SectionHead>
      <div className="aa-minis">
        <MiniStat value={sold.toLocaleString("en-GB")} label="Tickets sold" delta={delta(sold, pSold)} series={cur.map(d => Number(d.sold))} tone="blue" />
        <MiniStat value={money(rev)} label="Revenue (GMV)" delta={delta(rev, sumK(prev, "revenue"))} series={cur.map(d => Number(d.revenue))} tone="purple" />
        <MiniStat value={`${capPct}%`} label="Capacity sold" delta={capPrev ? delta(capPct, capPrev) : null} series={cumulative} tone="green" />
        <MiniStat value={`${rRate.toFixed(1)}%`} label="Refund rate" delta={pRate ? Math.round(((rRate - pRate) / pRate) * 100) : null} invert series={cur.map(d => Number(d.refunded))} tone="orange" />
      </div>
    </section>
    <section>
      <SectionHead title="Recent orders" href={qs(base, {}, { tab: "orders", event: e.id })} />
      {orders.length ? <table className="aa-mtable at-recent"><thead><tr><th>Order ID</th><th>Buyer</th><th>Tickets</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>{orders.map(o => <tr key={o.ref}><td><b>#{o.ref}</b></td><td>{o.buyer}</td><td>{o.n}</td><td>{money(o.total, "GBP", { cents: true })}</td><td>{o.refunded ? <Status value="refunded" label="Refunded" /> : <Status value="paid" label="Paid" />}</td></tr>)}</tbody></table>
        : <p className="aa-empty">No orders yet.</p>}
    </section>
    <div className="aa-drawer-actions">
      <SectionHead title="Actions" />
      <div className="row at-actions">
        <Link className="ws-btn outline" href={qs(base, {}, { tab: "orders", event: e.id })}><Eye aria-hidden="true" />View orders</Link>
        {canEvents ? <Link className="ws-btn outline" href={`/admin/events?sel=${e.id}`}><Settings2 aria-hidden="true" />Manage event</Link> : <span />}
        {canSupport ? <Link className="ws-btn outline" href={`/admin/support?q=${encodeURIComponent(e.name)}`}><Headphones aria-hidden="true" />Support</Link> : <span />}
        {ts === "paused" && e.status !== "suspended"
          ? <ActionButton action={setTicketSales} args={[e.id, false]} reason variant="outline" confirm={{ title: `Resume sales for ${e.name}?`, body: "Paused ticket types go back on sale (or sold out if full).", cta: "Resume sales" }}><PlayCircle aria-hidden="true" />Resume sales</ActionButton>
          : <ActionButton action={setTicketSales} args={[e.id, true]} reason variant="danger" disabled={ts !== "on_sale"} title={ts !== "on_sale" ? "No ticket types are on sale" : undefined}
            confirm={{ title: `Pause sales for ${e.name}?`, body: "All on-sale ticket types stop selling immediately. Issued tickets stay valid.", cta: "Pause sales" }}><PauseCircle aria-hidden="true" />Pause sales</ActionButton>}
      </div>
    </div>
  </aside>;
}
