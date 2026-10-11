import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users, ShieldCheck, Timer, BellOff, TriangleAlert, Download, Filter, Pencil, ExternalLink, Inbox, Ban, CircleCheck, CalendarCheck, CircleCheckBig, RefreshCw, Clock3, Star } from "lucide-react";
import "@/styles/admin-a-base.css";
import "@/styles/admin-a-events.css";
import "@/styles/admin-a-marketplace.css";
import { Kpi, Avatar, Thumb, Restricted } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, count, isUuid } from "@/lib/workspace/db";
import { money, day, relative, requestTime, delta, titleCase } from "@/lib/workspace/format";
import { AdminMenu, ParamSelect, SearchBox, SelectAll } from "../_a/client";
import { Pager, LineTabs, Status, DrawerClose, SectionHead, KVRows, MiniStat, TimelineItem, Flag } from "../_a/ui";
import { shortRef, str, pageOf, qs, type SP } from "../_a/lib";
import { L_COLS, loadListingMetrics, lHealth, cancelRate, responseRate, modeTone, fmtHours, type Listing, type LMetric } from "../_a/listings";
import { reviewListing } from "../_a/actions";

export const metadata: Metadata = { title: "Marketplace" };
type Item = { id: string; title: string; status: string; amount: number | null; created_at: string; response_deadline: string | null; listing_id: string; event: { name: string; guest_count: number | null } | null };

export default async function MarketplacePage(props: PageProps<"/admin/marketplace">) {
  const ctx = await requireAdminPermission("marketplace");
  if (!ctx.allowed) return <Restricted area="Marketplace" />;
  const sp = (await props.searchParams) as SP;
  const { db, permissions } = ctx;
  const now = requestTime(), since = new Date(now - 30 * 864e5).toISOString(), prevSince = new Date(now - 60 * 864e5).toISOString();
  const tab = ["services", "requests", "reliability"].includes(str(sp, "tab")) ? str(sp, "tab") : "venues";
  const q = str(sp, "q").trim().toLowerCase().slice(0, 80), f = (k: string) => str(sp, k);
  const { per, page, offset } = pageOf(sp);

  const [all, metrics, workspaces, expired, sent, expiredPrev, sentPrev] = await Promise.all([
    rows<Listing>(db.from("listings").select(L_COLS).order("created_at").limit(5000)),
    loadListingMetrics(db, 30),
    rows<{ id: string; name: string; owner_id: string; settings: { reference?: string } | null }>(db.from("workspaces").select("id,name,owner_id,settings")),
    count(db.from("build_items").select("id", { count: "exact", head: true }).not("listing_id", "is", null).eq("status", "expired").gte("created_at", since)),
    count(db.from("build_items").select("id", { count: "exact", head: true }).not("listing_id", "is", null).not("status", "in", "(suggested,draft)").gte("created_at", since)),
    count(db.from("build_items").select("id", { count: "exact", head: true }).not("listing_id", "is", null).eq("status", "expired").gte("created_at", prevSince).lt("created_at", since)),
    count(db.from("build_items").select("id", { count: "exact", head: true }).not("listing_id", "is", null).not("status", "in", "(suggested,draft)").gte("created_at", prevSince).lt("created_at", since)),
  ]);
  const wsMap = new Map(workspaces.map(w => [w.id, w]));
  const owners = (permissions.has("users") || permissions.has("support"))
    ? new Map((await rows<{ id: string; full_name: string; avatar_url: string }>(db.from("profiles").select("id,full_name,avatar_url").in("id", [...new Set(workspaces.map(w => w.owner_id))]))).map(p => [p.id, p])) : new Map<string, { id: string; full_name: string; avatar_url: string }>();
  const ownerOf = (l: Listing) => { const w = wsMap.get(l.workspace_id); return { ws: w, person: w ? owners.get(w.owner_id) : undefined }; };
  const live = all.filter(l => l.published);
  const avgResp = live.length ? live.reduce((a, l) => a + (l.response_hours ?? 0), 0) / live.length : 0;
  const totalDecided = [...metrics.values()].reduce((a, m) => a + m.decided, 0), totalCancelled = [...metrics.values()].reduce((a, m) => a + m.cancelled, 0);
  const created30 = all.filter(l => l.created_at >= since).length;
  const cities = [...new Set(all.map(l => l.city).filter(Boolean))].sort(), cats = [...new Set(all.map(l => l.category).filter(Boolean))].sort();

  const filtered = all.filter(l => {
    const m = metrics.get(l.id), h = lHealth(l, m).key;
    if (tab === "venues" && l.kind !== "venue") return false;
    if (tab === "services" && l.kind !== "service") return false;
    if (q && !`${l.name} ${l.id} ${l.city} ${ownerOf(l).ws?.name ?? ""} ${ownerOf(l).person?.full_name ?? ""}`.toLowerCase().includes(q)) return false;
    if (f("cat") && l.category !== f("cat")) return false;
    if (f("city") && l.city !== f("city")) return false;
    if (f("ver") === "verified" && !l.verified) return false;
    if (f("ver") === "pending" && l.verified) return false;
    if (f("mode") && l.booking_mode !== f("mode")) return false;
    if (f("perf") === "healthy" && h !== "healthy") return false;
    if (f("perf") === "attention" && h === "healthy") return false;
    if (f("spon") === "sponsored" && !l.sponsored) return false;
    if (f("spon") === "none" && l.sponsored) return false;
    return true;
  }).sort(tab === "reliability" ? (a, b) => cancelRate(metrics.get(b.id)) - cancelRate(metrics.get(a.id)) || (b.response_hours ?? 0) - (a.response_hours ?? 0)
    : (a, b) => (metrics.get(b.id)?.requests ?? 0) - (metrics.get(a.id)?.requests ?? 0) || b.review_count - a.review_count);

  const items = tab === "requests" ? await (async () => {
    let qb = db.from("build_items").select("id,title,status,amount,created_at,response_deadline,listing_id,event:events(name,guest_count)", { count: "exact" }).not("listing_id", "is", null).not("status", "in", "(suggested,draft)");
    if (f("status")) qb = qb.eq("status", f("status"));
    const { data, count: n, error } = await qb.order("created_at", { ascending: false }).range(offset, offset + per - 1);
    if (error) throw new Error(error.message);
    return { list: (data ?? []) as unknown as Item[], total: n ?? 0 };
  })() : null;

  const list = filtered.slice(offset, offset + per);
  const selId = f("sel") === "none" ? null : isUuid(f("sel")) ? f("sel") : tab === "requests" ? null : list[0]?.id ?? null;
  const sel = all.find(l => l.id === selId);
  const base = "/admin/marketplace";
  const listingName = new Map(all.map(l => [l.id, l.name]));

  return <div className="aa am">
    <header className="ws-page-head">
      <div><h1>Marketplace</h1><p>Operate venue and service supply, response SLAs and listing quality.</p></div>
      <div className="aa-head-actions"><a className="ws-btn outline" href={qs(`${base}/export`, sp, { page: null, sel: null, per: null })}><Download aria-hidden="true" />Export</a></div>
    </header>
    <LineTabs base={base} sp={{ q: str(sp, "q") }} active={tab} className="am-tabs" tabs={[{ key: "venues", label: "Venues" }, { key: "services", label: "Services" }, { key: "requests", label: "Requests" }, { key: "reliability", label: "Reliability" }]} />

    <section className="aa-kpis am-kpis" aria-label="Marketplace metrics">
      <Kpi icon={Users} tone="blue" label="Total Listings" value={all.length.toLocaleString("en-GB")} delta={delta(all.length, all.length - created30)} deltaSuffix="vs last 30 days" />
      <Kpi icon={ShieldCheck} tone="green" label="Verified Listings" value={all.filter(l => l.verified).length.toLocaleString("en-GB")} delta={null} />
      <Kpi icon={Timer} tone="orange" label="Avg. Response Time" value={`${avgResp.toFixed(1)} hours`} delta={null} />
      <Kpi icon={BellOff} tone="red" label="No-Response Rate" value={`${sent ? ((100 * expired) / sent).toFixed(1) : "0.0"}%`} delta={delta(sent ? expired / sent : 0, sentPrev ? expiredPrev / sentPrev : 0)} deltaSuffix="vs last 30 days" invert />
      <Kpi icon={TriangleAlert} tone="red" label="Cancellation Rate" value={`${totalDecided ? ((100 * totalCancelled) / totalDecided).toFixed(1) : "0.0"}%`} delta={null} />
    </section>

    <div className={tab === "requests" ? "am-full" : "aa-split"}>
      <div className="aa-listcol">
        <div className="aa-bar"><Suspense><SearchBox placeholder={tab === "requests" ? "Search is available on listings — filter requests by status" : "Search venues, services, owners or listing ID..."} /></Suspense>
          <Link className="ws-btn outline aa-filters-btn" href={qs(base, {}, { tab: tab === "venues" ? null : tab })}><Filter aria-hidden="true" />Clear filters</Link></div>
        {tab === "requests" ? <>
          <Suspense><div className="aa-filters am-filters-req"><label>Status<ParamSelect param="status" label="Status" value={f("status")} options={[{ value: "", label: "All statuses" },
            ...["sent", "awaiting", "available", "quoted", "held", "confirmed", "declined", "expired", "cancelled", "fulfilled"].map(s => ({ value: s, label: titleCase(s) }))]} /></label></div></Suspense>
          <div className="aa-table-card"><div className="aa-table-scroll"><table className="aa-table am-req">
            <thead><tr><th>Request</th><th>Event</th><th>Listing</th><th>Guests</th><th>Value</th><th>Received</th><th>Response due</th><th>Status</th></tr></thead>
            <tbody>{items!.list.map(i => <tr key={i.id}><td><b>{i.title}</b></td><td>{i.event?.name ?? "—"}</td>
              <td><Link className="aa-link" href={`${base}/listings/${i.listing_id}`}>{listingName.get(i.listing_id) ?? "Listing"}</Link></td><td>{i.event?.guest_count ?? "—"}</td>
              <td>{i.amount ? money(i.amount) : "—"}</td><td>{relative(i.created_at, now)}</td><td>{i.response_deadline ? day(i.response_deadline, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
              <td><Status value={i.status === "confirmed" || i.status === "fulfilled" ? "confirmed" : i.status === "expired" || i.status === "declined" ? "cancelled" : "pending"} label={titleCase(i.status)} dot={false} /></td></tr>)}
              {!items!.list.length && <tr><td colSpan={8}><div className="aa-empty">No marketplace requests match.</div></td></tr>}</tbody></table></div></div>
          <Pager base={base} sp={sp} page={page} per={per} total={items!.total} />
        </> : <>
          <Suspense><div className="aa-filters am-filters">
            <label>Category<ParamSelect param="cat" label="Category" value={f("cat")} options={[{ value: "", label: "All categories" }, ...cats.map(c => ({ value: c, label: c }))]} /></label>
            <label>Location<ParamSelect param="city" label="Location" value={f("city")} options={[{ value: "", label: "All locations" }, ...cities.map(c => ({ value: c, label: c }))]} /></label>
            <label>Verification<ParamSelect param="ver" label="Verification" value={f("ver")} options={[{ value: "", label: "All statuses" }, { value: "verified", label: "Verified" }, { value: "pending", label: "Pending" }]} /></label>
            <label>Availability mode<ParamSelect param="mode" label="Availability mode" value={f("mode")} options={[{ value: "", label: "All modes" }, { value: "instant", label: "Instant" }, { value: "request", label: "Request" }, { value: "enquiry", label: "Enquiry" }]} /></label>
            <label>Performance<ParamSelect param="perf" label="Performance" value={f("perf")} options={[{ value: "", label: "All performance" }, { value: "healthy", label: "Healthy" }, { value: "attention", label: "Needs attention" }]} /></label>
            <label>Sponsored<ParamSelect param="spon" label="Sponsored" value={f("spon")} options={[{ value: "", label: "All listings" }, { value: "sponsored", label: "Sponsored" }, { value: "none", label: "Not sponsored" }]} /></label>
          </div></Suspense>
          <form className="aa-table-form" action={`${base}/export`} method="get">
            <div className="aa-table-card">
              <div className="aa-bulk"><span>Selected listings</span><button type="submit" className="ws-btn outline sm"><Download aria-hidden="true" />Export selected</button></div>
              <div className="aa-table-scroll"><table className="aa-table ae-table am-table">
                <colgroup><col style={{ width: 26 }} /><col style={{ width: 120 }} /><col style={{ width: 58 }} /><col style={{ width: 98 }} /><col style={{ width: 80 }} /><col style={{ width: 72 }} /><col style={{ width: 66 }} /><col style={{ width: 52 }} /><col style={{ width: 46 }} /><col style={{ width: 56 }} /><col style={{ width: 74 }} /><col style={{ width: 68 }} /><col style={{ width: 44 }} /></colgroup>
                <thead><tr><th className="ck"><SelectAll /></th><th>Listing</th><th>Type</th><th>Owner</th><th>Location</th><th>Verification</th><th>Availability</th><th className="c">Requests (30d)</th><th className="c">Resp. time</th><th className="c">Cancel rate</th><th>Health</th><th>Sponsored</th><th className="act">Actions</th></tr></thead>
                <tbody>{list.map(l => {
                  const m = metrics.get(l.id), h = lHealth(l, m), o = ownerOf(l);
                  return <tr key={l.id} className={l.id === selId ? "sel" : ""}>
                    <td className="ck"><input type="checkbox" name="id" value={l.id} aria-label={`Select ${l.name}`} /></td>
                    <td><Link className="aa-who" href={qs(base, sp, { sel: l.id })} scroll={false}><Thumb src={l.image || null} w={40} h={36} /><div><b>{l.name}</b><small>{shortRef("LST", l.id, (l.details as { reference?: string } | null)?.reference)}</small></div></Link></td>
                    <td><span className={`aa-chip ${l.kind === "venue" ? "pink" : "purple"}`}>{titleCase(l.kind)}</span></td>
                    <td><span className="aa-who"><Avatar src={o.person?.avatar_url} name={o.person?.full_name ?? o.ws?.name ?? "Owner"} size={22} /><span className="nm">{o.person?.full_name ?? o.ws?.name ?? "—"}</span></span></td>
                    <td>{l.kind === "service" && !l.city ? "Nationwide" : `${l.city || "—"}${l.city ? ", UK" : ""}`}</td>
                    <td>{l.verified ? <Status value="verified" label="Verified" /> : <Status value="pending" label="Pending" />}</td>
                    <td><span className={`aa-chip ${modeTone(l.booking_mode)}`}>{titleCase(l.booking_mode)}</span></td>
                    <td className="c">{m?.requests ?? 0}</td>
                    <td className="c">{fmtHours(l.response_hours)}</td>
                    <td className="c">{cancelRate(m).toFixed(1)}%</td>
                    <td><Status value={h.key} label={h.label} /></td>
                    <td>{l.sponsored ? <span className="aa-chip red">Sponsored</span> : <span className="aa-muted">–</span>}</td>
                    <td className="act"><AdminMenu label={`Actions for ${l.name}`} entries={[
                      { kind: "link", label: "Open listing review", href: `${base}/listings/${l.id}` },
                      ...(l.review_status !== "approved" ? [{ kind: "action" as const, label: "Approve", action: reviewListing, args: [l.id, "approve"], reason: true, confirm: { title: `Approve ${l.name}?`, body: "Marks the listing verified and approved for the marketplace.", cta: "Approve" } }] : []),
                      { kind: "action", label: "Request changes", action: reviewListing, args: [l.id, "request_changes"], reason: true, confirm: { title: `Request changes to ${l.name}?`, body: "The provider is asked to update the listing. It stays live meanwhile.", cta: "Request changes" } },
                      { kind: "action", label: "Suspend listing", action: reviewListing, args: [l.id, "suspend"], reason: true, danger: true, confirm: { title: `Suspend ${l.name}?`, body: "The listing is unpublished immediately. The provider can appeal.", cta: "Suspend listing" } }]} /></td>
                  </tr>;
                })}
                {!list.length && <tr><td colSpan={13}><div className="aa-empty">No listings match these filters.</div></td></tr>}</tbody>
              </table></div>
            </div>
          </form>
          <Pager base={base} sp={sp} page={page} per={per} total={filtered.length} />
        </>}
      </div>
      {tab !== "requests" && (sel ? <Suspense fallback={<aside className="aa-drawer" aria-busy="true" />}><ListingDrawer l={sel} m={metrics.get(sel.id)} sp={sp} owner={ownerOf(sel)} /></Suspense>
        : <aside className="aa-drawer"><p className="aa-empty">Select a listing to see its details and reliability.</p></aside>)}
    </div>
  </div>;
}

async function ListingDrawer({ l, m, sp, owner }: { l: Listing; m?: LMetric; sp: SP; owner: { ws?: { id: string; name: string; settings: { reference?: string } | null }; person?: { id: string; full_name: string; avatar_url: string } } }) {
  const { db } = await requireAdminPermission("marketplace");
  const now = requestTime();
  const [m90, recent] = await Promise.all([
    loadListingMetrics(db, 90).then(x => x.get(l.id)),
    rows<{ id: string; status: string; created_at: string; updated_at: string; event: { name: string; guest_count: number | null; event_type: string } | null }>(
      db.from("build_items").select("id,status,created_at,updated_at,event:events(name,guest_count,event_type)").eq("listing_id", l.id).not("status", "in", "(suggested,draft)").order("updated_at", { ascending: false }).limit(2)),
  ]);
  const h = lHealth(l, m), base = "/admin/marketplace", review = `${base}/listings/${l.id}`;
  const modes = [l.instant_book || l.booking_mode === "instant" ? "Instant" : null, "Request", l.booking_mode === "enquiry" ? "Enquiry" : null].filter(Boolean).join(" / ");
  const rr = responseRate(m90);

  return <aside className="aa-drawer am-drawer" aria-label={`${l.name} details`}>
    <div className="aa-drawer-head"><Thumb src={l.image || null} w={80} h={56} /><div><h2>{l.name} {l.verified && <Status value="verified" label="Verified" />}</h2>
      <small>{shortRef("LST", l.id)} · {titleCase(l.kind)}</small></div><DrawerClose href={qs(base, sp, { sel: "none" })} /></div>
    <nav className="aa-dtabs aw-dtabs" aria-label="Listing sections"><span className="t on">Overview</span><Link href={`${review}?tab=verification`}>Availability</Link><Link href={`${review}?tab=performance`}>Performance</Link><Link href={`${review}?tab=verification`}>Trust</Link>
      <AdminMenu label="More listing actions" entries={[{ kind: "link", label: "Open listing review", href: review }, { kind: "link", label: "Export (CSV)", href: `${base}/export?id=${l.id}` }]} /></nav>
    <section className="aw-details">
      <SectionHead title="Listing details"><Link className="aa-edit" href={review}><Pencil aria-hidden="true" />Review</Link></SectionHead>
      <KVRows rows={[
        ["Name", l.name], ["Type", <span key="t" className={`aa-chip ${l.kind === "venue" ? "pink" : "purple"}`}>{titleCase(l.kind)}</span>],
        ["Owner", owner.person ? <Link className="aa-who" href={`/admin/users/${owner.person.id}`}><Avatar src={owner.person.avatar_url} name={owner.person.full_name} size={18} /><span>{owner.person.full_name} ({owner.ws?.settings?.reference ?? owner.ws?.name})</span></Link> : owner.ws?.name ?? "—"],
        ["Location", <span key="l" className="aa-loc"><Flag country="GB" />{l.city || "—"}, UK</span>],
        ["Categories", [l.category, ...(l.tags ?? []).slice(0, 2)].filter(Boolean).join(", ")],
        ["Availability", modes], ["Capacity", l.capacity_max ? `${l.capacity_min ?? 1} – ${l.capacity_max.toLocaleString("en-GB")}` : "—"],
        ["Created", day(l.created_at, { day: "numeric", month: "short", year: "numeric" })],
        ["Verification", l.verified ? <Status key="v" value="verified" label="Verified" /> : <Status key="v" value="pending" label="Pending" />],
        ["Featured", l.sponsored ? <Status key="f" value="verified" label="Sponsored" /> : "No"],
        ["Status", <Status key="s" value={h.key === "healthy" || h.key === "review" ? (l.published ? "active" : "draft") : h.key} label={l.published ? (l.paused_at ? "Paused" : "Active") : "Unpublished"} />],
      ]} />
    </section>
    <section>
      <SectionHead title={<>Performance <span>(last 90 days)</span></>} href={`${review}?tab=performance`} label="View analytics" />
      <div className="aa-minis">
        <MiniStat value={(m90?.requests ?? 0).toLocaleString("en-GB")} label="Requests" delta={delta(m90?.requests ?? 0, m90?.requests_prev ?? 0)} />
        <MiniStat value={fmtHours(l.response_hours)} label="Avg response" />
        <MiniStat value={`${cancelRate(m90).toFixed(1)}%`} label="Cancellation rate" />
        <MiniStat value={money(m90?.revenue ?? 0)} label="Revenue (GMV)" />
      </div>
    </section>
    <section>
      <SectionHead title="Reliability &amp; trust" href={`${review}?tab=verification`} label="View details" />
      <div className="am-rel">
        <div><span className="ico green"><CircleCheck aria-hidden="true" /></span><b>{rr === null ? "—" : `${rr}%`}</b><small>Response rate</small></div>
        <div><span className="ico red"><Clock3 aria-hidden="true" /></span><b>{cancelRate(m90).toFixed(1)}%</b><small>Cancellation rate</small></div>
        <div><span className="ico amber"><Star aria-hidden="true" /></span><b>{l.rating ? `${Number(l.rating).toFixed(1)} / 5` : "—"}</b><small>Avg rating</small></div>
      </div>
    </section>
    <section>
      <SectionHead title="Recent activity" href={`${base}?tab=requests`} />
      <ul className="aa-tls ae-tls am-tls">{recent.length ? recent.map(r => <TimelineItem key={r.id} icon={r.status === "confirmed" ? CircleCheckBig : r.status === "cancelled" ? RefreshCw : r.status === "sent" || r.status === "awaiting" ? Inbox : CalendarCheck}
        tone={r.status === "confirmed" ? "green" : "blue"} title={r.status === "sent" || r.status === "awaiting" ? "New request received" : `Request ${r.status}`}
        meta={`${relative(r.updated_at, now)} · ${r.event?.name ?? "Event"}${r.event?.guest_count ? ` (${r.event.guest_count} guests)` : ""}`} />) : <li className="aa-empty">No requests yet.</li>}</ul>
    </section>
    <div className="aa-drawer-actions"><div className="row am-actions">
      <Link className="ws-btn primary" href={review}><ExternalLink aria-hidden="true" />Open listing</Link>
      <Link className="ws-btn outline" href={`${base}?tab=requests`}><Inbox aria-hidden="true" />View requests</Link>
      {l.review_status === "suspended"
        ? <ActionButton action={reviewListing} args={[l.id, "approve"]} reason variant="outline" confirm={{ title: `Reinstate ${l.name}?`, body: "Approves the listing again. The provider must republish it.", cta: "Approve" }}><CircleCheck aria-hidden="true" />Reinstate</ActionButton>
        : <ActionButton action={reviewListing} args={[l.id, "suspend"]} reason variant="danger" confirm={{ title: `Suspend ${l.name}?`, body: "The listing is unpublished immediately. The provider can appeal.", cta: "Suspend listing" }}><Ban aria-hidden="true" />Suspend listing</ActionButton>}
    </div></div>
  </aside>;
}
