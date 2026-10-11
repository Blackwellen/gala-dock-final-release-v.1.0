import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LayoutGrid, CircleCheck, FileText, CirclePause, Eye, MessageSquare, CalendarCheck, Users, Box, MapPin, Plus, Upload, ChevronDown, SlidersHorizontal, Map as MapIcon,
  Sparkles, ArrowRight, Clock, ArrowUp, Building2, Wrench, Package as PackageIcon, CircleAlert, TrendingUp } from "lucide-react";
import "@/styles/provider-opps.css";
import "@/styles/provider-listings.css";
import { Kpi, Ring, Empty } from "@/components/workspace/kit";
import { money, requestTime, titleCase } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceListings, workspaceSpaces, workspaceJobs, dailySeries } from "@/lib/provider/queries";
import { RowMenu, type MenuEntry } from "../../_components/row-menu";
import { MenuButton } from "../../_components/menu-button";
import { ParamSelect } from "../../_components/param-select";
import { SearchParam } from "../../_components/search-param";
import { publishListing, pauseListing, duplicateListing, setSpaceStatus, setPackageStatus } from "../actions";

export const metadata: Metadata = { title: "Listings" };
type Kind = "venue" | "space" | "service" | "package";
type Status = "published" | "draft" | "paused" | "restricted";
type Card = { id: string; kind: Kind; name: string; sub: string; image: string; status: Status; quality: number; gaps: string[]; capacity: string; setting: string; location: string;
  mode: string; price: string; views: number | null; enquiries: number | null; bookings: number; href: string; preview: string | null; menu: MenuEntry[]; created: string };
const TYPES: Record<string, Kind> = { venues: "venue", spaces: "space", services: "service", packages: "package" };
const modeLabel: Record<string, string> = { instant: "Instant Book", request: "Request to Book", enquiry: "Enquiry only" };

export default async function ListingsPage(props: PageProps<"/provider/listings/[[...type]]">) {
  const { type: seg } = await props.params;
  const sp = await props.searchParams;
  const typeKey = seg?.[0];
  if (seg && (seg.length > 1 || !TYPES[typeKey!])) notFound();
  const only = typeKey ? TYPES[typeKey] : null;
  const str = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const [ctx, listings, spaces, jobs] = await Promise.all([getProvider(), workspaceListings(), workspaceSpaces(), workspaceJobs()]);
  const caps = ctx.workspace.capabilities;
  const packages = await rows<{ id: string; listing_id: string; name: string; status: string; description: string; base_price: number; price_basis: string; min_guests: number | null; max_guests: number | null; image: string; booking_mode: string; inclusions: string[]; details: Record<string, number>; created_at: string }>(
    ctx.db.from("packages").select("id,listing_id,name,status,description,base_price,price_basis,min_guests,max_guests,image,booking_mode,inclusions,details,created_at").eq("workspace_id", ctx.workspace.id));
  const now = requestTime();
  const bookingsFor = (pred: (j: typeof jobs[number]) => boolean) => jobs.filter(j => pred(j) && j.status !== "cancelled").length;

  // Quality: share of readiness checks met (photos, description, pricing, availability, policy, response, verification).
  const listingQuality = (l: typeof listings[number]) => {
    const c = (l.details?.commercial ?? {}) as Record<string, unknown>;
    const checks: [boolean, string][] = [
      [(l.gallery?.length ?? 0) + (l.image ? 1 : 0) >= 4, "photos"], [l.description.length >= 80, "description"], [!!l.price_from || l.booking_mode === "enquiry", "pricing"],
      [l.kind === "service" || spaces.some(s => s.venue_id === l.id && s.status === "published"), "availability"], [Array.isArray(c.cancellation) || l.kind === "service", "cancellation policy"],
      [!!l.response_hours, "response commitment"], [l.verified || l.review_status === "approved", "verification"],
    ];
    return { score: Math.round((100 * checks.filter(([ok]) => ok).length) / checks.length), gaps: checks.filter(([ok]) => !ok).map(([, n]) => n) };
  };
  const statusOf = (l: { published: boolean; paused_at: string | null; review_status: string }): Status => ["restricted", "suspended"].includes(l.review_status) ? "restricted" : l.published ? "published" : l.paused_at ? "paused" : "draft";

  const cards: Card[] = [];
  if (caps.includes("venue")) for (const l of listings.filter(x => x.kind === "venue")) {
    const q = listingQuality(l), st = statusOf(l);
    cards.push({ id: l.id, kind: "venue", name: l.name, sub: `Venue • ${l.city || l.location}`, image: l.image, status: st, quality: q.score, gaps: q.gaps, capacity: l.capacity_max ? `${l.capacity_min ?? 1} – ${l.capacity_max}` : "—",
      setting: `${spaces.filter(s => s.venue_id === l.id).length} spaces`, location: l.location, mode: modeLabel[l.booking_mode] ?? "Request to Book", price: l.price_from ? `From ${money(l.price_from)}` : "Quote",
      views: l.views, enquiries: l.enquiry_count, bookings: bookingsFor(j => j.listing_id === l.id), href: `/provider/venues/${l.id}`, preview: l.slug ? `/venues/${l.slug}` : null, created: l.created_at,
      menu: [{ kind: "link", label: "Edit venue", href: `/provider/venues/${l.id}` }, ...(l.slug && st === "published" ? [{ kind: "link" as const, label: "Preview public page", href: `/venues/${l.slug}` }] : []),
        ...(st === "published" ? [{ kind: "action" as const, label: "Pause listing", confirm: "Pause this venue? It stops taking new requests; existing bookings are unaffected.", run: pauseListing.bind(null, l.id, true) }]
          : st !== "restricted" ? [{ kind: "action" as const, label: "Publish", run: publishListing.bind(null, l.id) }] : []),
        { kind: "action", label: "Duplicate", run: duplicateListing.bind(null, l.id) }] });
    for (const s of spaces.filter(x => x.venue_id === l.id)) {
      const cap = Math.max(s.capacity_seated ?? 0, s.capacity_standing ?? 0);
      const sq = Math.round(100 * [!!s.image, cap > 0, !!s.rate_hourly, s.status === "published", true].filter(Boolean).length / 5);
      cards.push({ id: s.id, kind: "space", name: s.name, sub: `Venue Space • ${l.name}`, image: s.image, status: s.status as Status, quality: sq, gaps: [], capacity: `${s.capacity_seated ?? "—"} – ${cap}`,
        setting: s.indoor ? "Indoor" : "Outdoor", location: l.city || "London", mode: modeLabel[l.booking_mode] ?? "Request to Book", price: s.rate_hourly ? `From ${money(s.rate_hourly)}/hr` : "Quote",
        views: null, enquiries: null, bookings: bookingsFor(j => j.space_id === s.id), href: `/provider/venues/${l.id}/spaces/${s.id}`, preview: null, created: s.created_at,
        menu: [{ kind: "link", label: "Edit space", href: `/provider/venues/${l.id}/spaces/${s.id}` },
          s.status === "published" ? { kind: "action", label: "Pause space", confirm: "Pause this space? Existing bookings are unaffected.", run: setSpaceStatus.bind(null, l.id, s.id, "paused") } : { kind: "action", label: "Publish space", run: setSpaceStatus.bind(null, l.id, s.id, "published") }] });
    }
  }
  if (caps.includes("service")) for (const l of listings.filter(x => x.kind === "service")) {
    const q = listingQuality(l), st = statusOf(l);
    cards.push({ id: l.id, kind: "service", name: l.name, sub: `Service • ${l.category}`, image: l.image, status: st, quality: q.score, gaps: q.gaps, capacity: l.capacity_max ? `Up to ${l.capacity_max}` : "",
      setting: l.category, location: l.location, mode: modeLabel[l.booking_mode] ?? "Request to Book", price: l.price_from ? `From ${money(l.price_from)}${l.price_unit.includes("guest") ? " pp" : ""}` : "Quote only",
      views: l.views, enquiries: l.enquiry_count, bookings: bookingsFor(j => j.listing_id === l.id), href: `/provider/services/${l.id}`, preview: l.slug ? `/services/${l.slug}` : null, created: l.created_at,
      menu: [{ kind: "link", label: "Edit service", href: `/provider/services/${l.id}` }, ...(l.slug && st === "published" ? [{ kind: "link" as const, label: "Preview public page", href: `/services/${l.slug}` }] : []),
        ...(st === "published" ? [{ kind: "action" as const, label: "Pause listing", confirm: "Pause this service? Existing bookings are unaffected.", run: pauseListing.bind(null, l.id, true) }] : st !== "restricted" ? [{ kind: "action" as const, label: "Publish", run: publishListing.bind(null, l.id) }] : []),
        { kind: "action", label: "Duplicate", run: duplicateListing.bind(null, l.id) }] });
  }
  for (const p of packages) {
    const parent = listings.find(l => l.id === p.listing_id);
    if (!parent || !caps.includes(parent.kind)) continue;
    cards.push({ id: p.id, kind: "package", name: p.name, sub: `Package • ${parent.name}`, image: p.image, status: p.status as Status, quality: Math.round(100 * [!!p.image, p.description.length >= 40, p.base_price > 0, (p.inclusions?.length ?? 0) >= 3].filter(Boolean).length / 4), gaps: [],
      capacity: p.max_guests ? `${p.min_guests ?? 1} – ${p.max_guests}` : "", setting: parent.kind === "venue" ? "Venue + Service" : "Service", location: parent.city || "London", mode: modeLabel[p.booking_mode] ?? "Request to Book",
      price: `From ${money(p.base_price)}${p.price_basis === "per_person" ? " pp" : ""}`, views: null, enquiries: null, bookings: bookingsFor(j => j.package_id === p.id) || Number(p.details?.bookings ?? 0),
      href: `/provider/packages/${p.id}`, preview: null, created: p.created_at,
      menu: [{ kind: "link", label: "Edit package", href: `/provider/packages/${p.id}` },
        p.status === "published" ? { kind: "action", label: "Pause package", run: setPackageStatus.bind(null, p.id, "paused") } : { kind: "action", label: "Publish package", run: setPackageStatus.bind(null, p.id, "published") }] });
  }

  // Filters
  const status = str("status"), q = str("q").toLowerCase(), mode = str("mode"), sort = str("sort") || "updated", loc = str("loc"), kind = only ?? str("kind"), cap = Number(str("cap")) || 0;
  const capMax = (c: Card) => Number(c.capacity.match(/(\d+)\s*$/)?.[1] ?? 0);
  const scoped = cards.filter(c => !kind || c.kind === kind);
  const cities = [...new Set(cards.map(c => c.location).filter(Boolean))].sort();
  const counts = { all: scoped.length, published: scoped.filter(c => c.status === "published").length, draft: scoped.filter(c => c.status === "draft").length, paused: scoped.filter(c => c.status === "paused").length };
  let list = scoped.filter(c => (!status || c.status === status) && (!q || `${c.name} ${c.sub}`.toLowerCase().includes(q)) && (!mode || c.mode === modeLabel[mode]) && (!loc || c.location === loc) && (!cap || capMax(c) >= cap));
  list = list.sort((a, b) => sort === "quality" ? b.quality - a.quality : sort === "bookings" ? b.bookings - a.bookings : sort === "name" ? a.name.localeCompare(b.name) : b.created.localeCompare(a.created));
  const PAGE = 8, page = Math.max(1, Number(str("page")) || 1), pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const base = `/provider/listings${typeKey ? `/${typeKey}` : ""}`;
  const qs = (patch: Record<string, string | null>) => { const n = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]); for (const [k, v] of Object.entries(patch)) { if (v === null) n.delete(k); else n.set(k, v); } return `${base}${n.toString() ? `?${n}` : ""}`; };
  const avgQuality = scoped.length ? Math.round(scoped.reduce((a, c) => a + c.quality, 0) / scoped.length) : 0;
  const primary = listings.find(l => l.kind === "venue") ?? listings[0];
  const pq = primary ? listingQuality(primary) : { score: 0, gaps: [] as string[] };
  const top = [...listings].sort((a, b) => b.views - a.views).slice(0, 3);
  const tabs = [...(caps.includes("venue") ? [["venues", "Venues"], ["spaces", "Spaces"]] : []), ...(caps.includes("service") ? [["services", "Services"]] : []), ["packages", "Packages"]];
  const checklist: [string, boolean, string][] = primary ? [["High quality photos", !pq.gaps.includes("photos"), `${(primary.gallery?.length ?? 0) + (primary.image ? 1 : 0)} photos`], ["Description & features", !pq.gaps.includes("description"), "Complete"],
    ["Pricing clarity", !pq.gaps.includes("pricing"), "Complete"], ["Availability setup", !pq.gaps.includes("availability"), "Complete"], ["Cancellation policy", !pq.gaps.includes("cancellation policy"), "Complete"],
    ["Response commitment", !pq.gaps.includes("response commitment"), `${primary.response_hours}h`], ["Verification & compliance", !pq.gaps.includes("verification"), primary.verified ? "Verified" : "Pending"]] : [];

  return <div className="pl">
    <header className="ws-page-head pl-head">
      <div><h1>Listings</h1><p>Manage your venues, spaces, services and packages from one catalogue.</p></div>
      <div className="ws-page-actions">
        <span className="ws-btn outline pl-import" aria-disabled="true" title="Bulk import from CSV isn’t available yet — add listings individually"><Upload aria-hidden="true" />Import listings</span>
        <MenuButton label="Add listing" className="ws-btn primary pl-add-btn" trigger={<><Plus aria-hidden="true" />Add listing<ChevronDown aria-hidden="true" /></>} entries={[
          ...(caps.includes("venue") ? [{ kind: "link" as const, label: "Add venue", href: "/provider/venues/new?step=1" }, ...(primary?.kind === "venue" ? [{ kind: "link" as const, label: "Add space", href: `/provider/venues/${primary.id}/spaces/new?step=1` }] : [])] : []),
          ...(caps.includes("service") ? [{ kind: "link" as const, label: "Add service", href: "/provider/services/new?step=1" }] : []), { kind: "link", label: "Create package", href: "/provider/packages/new?step=1" }]} />
      </div>
    </header>
    <div className="pl-layout">
      <div className="pl-main">
        <div className="pl-tabs-row">
          <nav className="ws-tabs underline pl-tabs" aria-label="Listing types">{tabs.map(([k, l]) => <Link key={k} href={`/provider/listings/${k}`} aria-current={typeKey === k ? "page" : undefined} className={typeKey === k ? "active" : ""}>{l}</Link>)}</nav>
          <nav className="ws-tabs segment pl-status" aria-label="Status">{([["", "All", counts.all], ["published", "Published", counts.published], ["draft", "Draft", counts.draft], ["paused", "Paused", counts.paused]] as const).map(([k, l, n]) =>
            <Link key={l} href={qs({ status: k || null, page: null })} aria-current={status === k ? "page" : undefined} className={status === k ? "active" : ""}>{l} ({n})</Link>)}</nav>
        </div>
        <section className="ws-kpis pl-kpis" aria-label="Listing figures">
          <Kpi icon={LayoutGrid} tone="blue" label="Total Listings" value={counts.all} series={dailySeries(scoped, c => c.created || null, () => 1, 30, now)} />
          <Kpi icon={CircleCheck} tone="green" label="Published" value={counts.published} series={dailySeries(jobs, j => j.created_at, () => 1, 30, now)} />
          <Kpi icon={FileText} tone="orange" label="Draft" value={counts.draft} />
          <Kpi icon={CirclePause} tone="red" label="Paused" value={counts.paused} />
          <div className="ws-kpi pl-quality"><Ring value={avgQuality} size={58} /><div className="ws-kpi-text"><span>Listing Quality</span><strong className="pl-q">{avgQuality >= 80 ? "Good" : avgQuality >= 60 ? "Fair" : "Needs work"}</strong><small>Avg. of {scoped.length} listing{scoped.length === 1 ? "" : "s"}</small></div></div>
        </section>
        <div className="ws-toolbar pl-toolbar">
          <Suspense><SearchParam placeholder="Search listings..." /></Suspense>
          <Suspense><span className="po-sel"><MapPin aria-hidden="true" /><ParamSelect param="loc" label="Location" value={loc} resetParams={["page"]} options={[{ value: "", label: "Location" }, ...cities.map(c => ({ value: c, label: c }))]} /></span></Suspense>
          {!only && <Suspense><span className="po-sel"><MapPin aria-hidden="true" /><ParamSelect param="kind" label="Listing type" value={kind} resetParams={["page"]} options={[{ value: "", label: "Listing type" }, ...tabs.map(([k, l]) => ({ value: TYPES[k], label: l }))]} /></span></Suspense>}
          <Suspense><span className="po-sel"><Clock aria-hidden="true" /><ParamSelect param="mode" label="Booking mode" value={mode} resetParams={["page"]} options={[{ value: "", label: "Booking mode" }, { value: "instant", label: "Instant Book" }, { value: "request", label: "Request to Book" }, { value: "enquiry", label: "Enquiry only" }]} /></span></Suspense>
          <Suspense><span className="po-sel"><Users aria-hidden="true" /><ParamSelect param="cap" label="Max capacity" value={cap ? String(cap) : ""} resetParams={["page"]} options={[{ value: "", label: "Max capacity" }, ...[50, 100, 250, 500].map(n => ({ value: String(n), label: `${n}+ guests` }))]} /></span></Suspense>
          <Link href={qs({ q: null, mode: null, status: null, loc: null, kind: null, cap: null, page: null })} className="ws-btn outline po-more"><SlidersHorizontal aria-hidden="true" />{q || mode || status || loc || cap || (kind && !only) ? "Clear filters" : "More filters"}</Link>
          <span className="ws-spacer" />
          <label className="po-sort">Sort by <Suspense><ParamSelect param="sort" label="Sort by" value={sort} options={[{ value: "updated", label: "Updated (newest)" }, { value: "quality", label: "Quality" }, { value: "bookings", label: "Most booked" }, { value: "name", label: "Name" }]} /></Suspense></label>
          <nav className="po-views" aria-label="View"><span aria-current="page"><LayoutGrid aria-hidden="true" /></span><span title="Map view is available on the public marketplace"><MapIcon aria-hidden="true" /></span></nav>
        </div>
        {shown.length ? <div className="pl-grid">{shown.map(c => <article key={`${c.kind}:${c.id}`} className="pl-card">
          <div className="pl-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.image ? <img src={c.image} alt="" loading="lazy" /> : <span className="qb-noimg" />}
            <span className={`pl-badge ${c.status}`}>{titleCase(c.status)}</span><RowMenu label={`Actions for ${c.name}`} entries={c.menu} /></div>
          <div className="pl-body">
            <div className="pl-title"><Link href={c.href}><b>{c.name}</b></Link><small>{c.sub}</small><span title={c.gaps.length ? `Missing: ${c.gaps.join(", ")}` : "Quality score"}><Ring value={c.quality} size={34} /></span></div>
            <p className="pl-meta">{c.capacity && <span><Users aria-hidden="true" />{c.capacity}</span>}<span><Box aria-hidden="true" />{c.setting}</span><span><MapPin aria-hidden="true" />{c.location}</span></p>
            <p className="pl-chips"><i className={c.mode === "Instant Book" ? "instant" : c.mode === "Enquiry only" ? "enquiry" : "request"}>{c.mode}</i><i className="price">{c.price}</i></p>
            <p className="pl-stats">{c.views !== null && <span><Eye aria-hidden="true" />{c.views} views</span>}{c.enquiries !== null && <span><MessageSquare aria-hidden="true" />{c.enquiries} enquir{c.enquiries === 1 ? "y" : "ies"}</span>}<span><CalendarCheck aria-hidden="true" />{c.bookings} booking{c.bookings === 1 ? "" : "s"}</span></p>
          </div></article>)}</div>
          : <Empty icon={LayoutGrid} title="No listings match" text={q || mode || status ? "Try clearing the filters." : "Add your first listing to start taking requests."} action={<Link className="ws-btn primary" href={caps.includes("venue") ? "/provider/venues/new?step=1" : "/provider/services/new?step=1"}>Add listing</Link>} />}
        <div className="ws-pager"><span>Showing {list.length ? (page - 1) * PAGE + 1 : 0}–{Math.min(page * PAGE, list.length)} of {list.length} listings</span>
          {pages > 1 && <nav aria-label="Pages">{Array.from({ length: pages }, (_, n) => n + 1).map(n => n === page ? <span key={n} className="cur" aria-current="page">{n}</span> : <Link key={n} href={qs({ page: String(n) })}>{n}</Link>)}</nav>}</div>
      </div>
      <aside className="pl-rail">
        {primary && <section className="ws-panel pl-check"><div className="ws-panel-head"><h2>Listing quality</h2><Link className="ws-link" href={primary.kind === "venue" ? `/provider/venues/${primary.id}` : `/provider/services/${primary.id}`}>View all <ArrowRight aria-hidden="true" /></Link></div>
          <ul>{checklist.map(([l, ok, v]) => <li key={l}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span>{l}</span><b className={ok ? "ok" : "warn"}>{ok ? v : "Needs attention"}</b></li>)}</ul>
          <Link className="ws-btn outline block" href={`/provider/agent?goal=${encodeURIComponent(`Improve the quality of my ${primary.name} listing`)}`}><Sparkles aria-hidden="true" />Improve with Gala Agent</Link></section>}
        <section className="ws-panel pl-top"><div className="ws-panel-head"><h2>Top performing listings</h2><small>By views</small></div>
          <ul>{top.map(l => <li key={l.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {l.image ? <img src={l.image} alt="" /> : <span className="qb-noimg" />}<span><b>{l.name}</b><small>{l.views} views • {l.enquiry_count} enquiries</small></span>
            <em><ArrowUp aria-hidden="true" />{l.views ? Math.round((100 * l.enquiry_count) / l.views) : 0}%</em></li>)}</ul><small className="pl-note"><TrendingUp aria-hidden="true" />% = enquiry conversion from views</small></section>
        <section className="ws-panel pl-quick"><h2>Quick actions</h2><ul>
          {caps.includes("venue") && <li><Link href="/provider/venues/new?step=1"><Building2 aria-hidden="true" /><span><b>Add new venue</b><small>Create a new venue listing</small></span></Link></li>}
          {caps.includes("venue") && primary?.kind === "venue" && <li><Link href={`/provider/venues/${primary.id}/spaces/new?step=1`}><LayoutGrid aria-hidden="true" /><span><b>Add new space</b><small>Create a space within a venue</small></span></Link></li>}
          {caps.includes("service") && <li><Link href="/provider/services/new?step=1"><Wrench aria-hidden="true" /><span><b>Add new service</b><small>Create a service offering</small></span></Link></li>}
          <li><Link href="/provider/packages/new?step=1"><PackageIcon aria-hidden="true" /><span><b>Create package</b><small>Bundle your spaces or services</small></span></Link></li>
        </ul></section>
      </aside>
    </div>
  </div>;
}
