import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Eye, Pencil, ChevronDown, Building2, MapPin, Phone, Mail, Globe, CalendarCheck, PoundSterling, Users, Tag, ClipboardList, Map as MapIcon,
  ArrowRight, Sparkles, CircleCheck, CircleAlert, Accessibility, SquareParking, ScrollText, Clock, UserRound, BarChart3, Package as PackageIcon, ImagePlus, CalendarRange, Plus } from "lucide-react";
import "@/styles/provider-venue.css";
import { Kpi, Ring, Chip, Tabs, Empty, Thumb, Avatar } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { money, day, requestTime, delta, titleCase } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { workspaceListings, workspaceSpaces, workspaceJobs, workspaceItems, itemState, dailySeries } from "@/lib/provider/queries";
import { RowMenu } from "../../_components/row-menu";
import { MenuButton } from "../../_components/menu-button";
import { duplicateListing } from "../../listings/actions";
import { setPackageStatus } from "../../listings/actions";
import { saveVenueInfo, saveCommercial } from "./actions";
import { ShareVenue, LiveToggle, OverviewMap } from "./interactive";
import { SpacesEditor } from "../_components/spaces-editor";
import type { StructureMeta } from "./actions";
import type { MapEl } from "../_components/venue-map";
import { VenueCommercialEngine } from "@/components/venue/commercial-engine";
import { PublicAvailabilityToggle } from "@/components/provider/public-availability-toggle";

export const metadata: Metadata = { title: "Venue" };
type Info = { event_types?: string[]; accessibility?: string; parking?: string; licences?: string[]; curfew?: string; staffing?: string };
type Commercial = { rate_from?: number; rate_to?: number; minimum_spend?: number; deposit_pct?: number; balance_days?: number; security_deposit?: number; lead_days?: number;
  cancellation?: { window: string; refund: number }[]; holds?: { enabled: boolean; hours: number } };
const TABS = ["overview", "spaces", "packages", "operations", "commercial"] as const;
const enquiryChip: Record<string, { label: string; tone: "blue" | "purple" | "green" | "amber" | "grey" | "red" }> = {
  sent: { label: "Enquiry", tone: "blue" }, awaiting: { label: "Enquiry", tone: "blue" }, clarification: { label: "In Discussion", tone: "purple" }, quoted: { label: "Quote Sent", tone: "green" },
  held: { label: "On Hold", tone: "amber" }, confirmed: { label: "Booked", tone: "green" }, expired: { label: "Expired", tone: "grey" }, declined: { label: "Declined", tone: "red" },
};

export default async function VenueProfile(props: PageProps<"/provider/venues/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const sp = await props.searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? sp.tab as typeof TABS[number] : "overview";
  const [ctx, listings, allSpaces, jobs, items] = await Promise.all([getProvider(), workspaceListings(), workspaceSpaces(), workspaceJobs(), workspaceItems()]);
  const v = listings.find(l => l.id === id && l.kind === "venue");
  if (!v) notFound();
  const now = requestTime();
  const spaces = allSpaces.filter(s => s.venue_id === v.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [structure, latestStructure, packages, spaceDetail] = await Promise.all([
    one<{ version: number; elements: MapEl[] }>(ctx.db.from("venue_structures").select("version,elements").eq("venue_id", v.id).eq("status", "published").maybeSingle()),
    one<{ version: number; status: string; elements: MapEl[]; calibration: StructureMeta["calibration"] | null; capacity_max: number | null; rule_pack: string | null }>(ctx.db.from("venue_structures").select("version,status,elements,calibration,capacity_max,rule_pack").eq("venue_id", v.id).order("version", { ascending: false }).limit(1).maybeSingle()),
    rows<{ id: string; name: string; status: string; description: string; base_price: number; price_basis: string; min_guests: number | null; max_guests: number | null; image: string; inclusions: string[]; space_ids: string[] }>(
      ctx.db.from("packages").select("id,name,status,description,base_price,price_basis,min_guests,max_guests,image,inclusions,space_ids").eq("listing_id", v.id).order("created_at", { ascending: false })),
    tab === "spaces" ? rows<{ id: string; area_sqm: number | null; layouts: Record<string, number>; amenities: string[]; turnaround_minutes: number; min_hours: number; details: Record<string, unknown> }>(
      ctx.db.from("spaces").select("id,area_sqm,layouts,amenities,turnaround_minutes,min_hours,details").eq("venue_id", v.id)) : Promise.resolve([]),
  ]);
  const d = v.details as { type?: string; contact?: { phone?: string; email?: string; website?: string }; features?: string[]; info?: Info; commercial?: Commercial };
  const info = d.info ?? {}, contact = d.contact ?? {}, commercial = d.commercial ?? {};
  const live = v.published && !v.paused_at;
  const capOf = (s: typeof spaces[number]) => Math.max(s.capacity_seated ?? 0, s.capacity_standing ?? 0);
  const mapSpaces = spaces.map(s => ({ id: s.id, name: s.name, capacity: capOf(s), indoor: s.indoor, image: s.image }));
  const venueJobs = jobs.filter(j => (j.listing_id === v.id || spaces.some(s => s.id === j.space_id)) && j.role === "primary");
  const active = venueJobs.filter(j => j.status !== "cancelled");
  const D = 864e5, since = now - 30 * D, before = now - 60 * D;
  const inWin = (iso: string, a: number, b: number) => { const t = new Date(iso).getTime(); return t >= a && t < b; };
  const bookingsNow = active.filter(j => inWin(j.created_at, since, now)).length, bookingsPrev = active.filter(j => inWin(j.created_at, before, since)).length;
  const revenue = active.reduce((a, j) => a + j.value, 0);
  const revNow = active.filter(j => inWin(j.created_at, since, now)).reduce((a, j) => a + j.value, 0), revPrev = active.filter(j => inWin(j.created_at, before, since)).reduce((a, j) => a + j.value, 0);
  // Occupancy: booked space-hours in the next 30 days over operating hours (14h/day per published space).
  const openHours = spaces.filter(s => s.status === "published").length * 30 * 14;
  const bookedHours = active.filter(j => ["held", "confirmed", "active"].includes(j.status) && inWin(j.starts_at, now, now + 30 * D)).reduce((a, j) => a + (new Date(j.ends_at).getTime() - new Date(j.starts_at).getTime()) / 36e5, 0);
  const occupancy = openHours ? Math.min(100, Math.round((100 * bookedHours) / openHours)) : 0;
  const avgValue = active.length ? Math.round(revenue / active.length) : 0;
  const avgNow = active.filter(j => inWin(j.created_at, since, now)), avgPrev = active.filter(j => inWin(j.created_at, before, since));
  const avgDelta = avgNow.length && avgPrev.length ? delta(avgNow.reduce((a, j) => a + j.value, 0) / avgNow.length, avgPrev.reduce((a, j) => a + j.value, 0) / avgPrev.length) : null;
  const photos = [v.image, ...(v.gallery ?? [])].filter(Boolean);
  // Listing quality: each area scored out of 10 from what's actually on the listing.
  const quality: [string, number, string][] = [
    ["Photos & media", Math.min(10, Math.round((photos.length / 12) * 10)), `${photos.length} photos`],
    ["Description", Math.min(10, Math.round(v.description.length / 15)), ""],
    ["Pricing clarity", (v.price_from ? 4 : 0) + (commercial.minimum_spend !== undefined ? 3 : 0) + (spaces.length && spaces.every(s => s.rate_hourly) ? 3 : 0), ""],
    ["Availability setup", spaces.length ? Math.round((10 * spaces.filter(s => s.status === "published" && capOf(s) > 0).length) / spaces.length) : 0, ""],
    ["Policies & cancellation", (commercial.cancellation?.length ? 6 : 0) + (commercial.deposit_pct !== undefined ? 4 : 0), ""],
    ["Verification & compliance", (v.verified ? 6 : 0) + (v.review_status === "approved" ? 3 : 0) + (structure?.elements.some(e => e.type === "exit") ? 1 : 0), ""],
  ];
  const qScore = Math.round((quality.reduce((a, [, s]) => a + s, 0) / (quality.length * 10)) * 100);
  const upcoming = active.filter(j => new Date(j.starts_at).getTime() >= now && ["held", "confirmed"].includes(j.status)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3);
  const enquiries = items.filter(i => i.listing_id === v.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  const totalCap = spaces.reduce((a, s) => a + capOf(s), 0), indoorCap = spaces.filter(s => s.indoor).reduce((a, s) => a + capOf(s), 0);
  const tags = v.tags ?? [], features = d.features ?? [];
  const pkgSpaces = (ids: string[]) => spaces.filter(s => ids.includes(s.id)).map(s => s.name).join(", ");
  const weekendShare = (() => { const ev = items.filter(i => i.listing_id === v.id && i.event?.starts_at); if (ev.length < 4) return null;
    return Math.round((100 * ev.filter(i => [0, 5, 6].includes(new Date(i.event!.starts_at!).getUTCDay())).length) / ev.length); })();
  const blockedSoon = active.filter(j => inWin(j.starts_at, now, now + 60 * D)).length;
  const insights = [
    weekendShare !== null && weekendShare >= 50 ? { icon: BarChart3, tone: "purple", title: "Review weekend rates", text: `${weekendShare}% of your enquiries are for Fri–Sun dates. Consider a weekend rate.`, cta: "Review pricing", href: `/provider/venues/${v.id}?tab=commercial` } : null,
    !packages.some(p => /wedding/i.test(p.name)) && (info.event_types ?? []).some(t => /wedding/i.test(t)) ? { icon: PackageIcon, tone: "purple", title: "Create a wedding package", text: "You list weddings as a typical event but have no wedding package yet.", cta: "Create package", href: "/provider/packages/new?step=1" } : null,
    photos.length < 12 ? { icon: ImagePlus, tone: "blue", title: "Improve photo coverage", text: `You have ${photos.length} photos. Listings with 12+ photos, including setups, are easier to choose.`, cta: "Add photos", href: `/provider/venues/new?venue=${v.id}&step=1` } : null,
    { icon: CalendarRange, tone: "amber", title: "Optimise availability", text: `${blockedSoon} booking${blockedSoon === 1 ? "" : "s"} in the next 60 days. Keep your calendar current so requests aren’t missed.`, cta: "Review calendar", href: "/provider/calendar" },
  ].filter(Boolean).slice(0, 4) as { icon: typeof BarChart3; tone: string; title: string; text: string; cta: string; href: string }[];

  return <div className="pv">
    <Link href="/provider/listings/venues" className="ws-back pv-back"><ArrowLeft aria-hidden="true" />Back to Venues</Link>
    <header className="pv-head">
      <div className="pv-head-main">
        <div className="pv-title"><h1>{v.name}</h1>{live ? <Chip tone="green" dot>Published</Chip> : v.paused_at ? <Chip tone="red" dot>Paused</Chip> : <Chip tone="amber" dot>Draft</Chip>}</div>
        <p className="pv-sub"><span>{v.location}</span>{tags.slice(0, 4).map(t => <i key={t}>{t}</i>)}{tags.length > 4 && <i>+{tags.length - 4}</i>}</p>
      </div>
      <div className="pv-head-actions">
        {v.slug && live && <Link href={`/venues/${v.slug}`} className="ws-btn outline" target="_blank"><ExternalLink aria-hidden="true" />View public page</Link>}
        <ShareVenue path={v.slug && live ? `/venues/${v.slug}` : `/provider/venues/${v.id}`} />
        {v.slug && <Link href={`/venues/${v.slug}?preview=1`} className="ws-btn outline" target="_blank"><Eye aria-hidden="true" />Preview</Link>}
        <RowMenu label="More venue actions" entries={[{ kind: "action", label: "Duplicate venue", run: duplicateListing.bind(null, v.id) }, { kind: "link", label: "Open calendar", href: "/provider/calendar" }, { kind: "link", label: "Venue bookings", href: `/provider/bookings?q=${encodeURIComponent(v.name)}` }]} />
        <MenuButton label="Edit venue" className="ws-btn primary pv-edit" trigger={<><Pencil aria-hidden="true" />Edit venue<ChevronDown aria-hidden="true" /></>} entries={[
          { kind: "link", label: "Identity & photos", href: `/provider/venues/new?venue=${v.id}&step=1` }, { kind: "link", label: "Spaces & map", href: `/provider/venues/${v.id}?tab=spaces` },
          { kind: "link", label: "Key information", href: `/provider/venues/${v.id}?tab=operations` }, { kind: "link", label: "Commercial terms", href: `/provider/venues/${v.id}?tab=commercial` }]} />
      </div>
    </header>
    <Tabs base={`/provider/venues/${v.id}`} active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "spaces", label: "Spaces & Map" }, { key: "packages", label: "Packages" }, { key: "operations", label: "Operations" }, { key: "commercial", label: "Commercial" }]} />

    {tab === "spaces" ? <SpacesEditor venueId={v.id} version={structure?.version ?? 0} elements={latestStructure?.elements ?? structure?.elements ?? []} latestVersion={latestStructure?.version ?? 0}
      meta={{ calibration: latestStructure?.calibration ?? undefined, capacity_max: latestStructure?.capacity_max ?? null, rule_pack: latestStructure?.rule_pack ?? "uk_default" }} geo={(v.details as { geo?: { lat: number; lng: number } }).geo ?? (v.lat !== null && v.lng !== null ? { lat: Number(v.lat), lng: Number(v.lng) } : null)}
      spaces={spaces.map(s => { const x = spaceDetail.find(r => r.id === s.id); return { id: s.id, name: s.name, status: s.status, indoor: s.indoor, image: s.image, capacity_standing: s.capacity_standing, capacity_seated: s.capacity_seated,
        rate_hourly: s.rate_hourly, area_sqm: x?.area_sqm ?? null, layouts: x?.layouts ?? {}, amenities: x?.amenities ?? [], turnaround_minutes: x?.turnaround_minutes ?? 60, min_hours: x?.min_hours ?? 2, description: String(x?.details?.description ?? "") }; })} />
    : <div className="pv-body">
      <div className="pv-main">
        {tab === "overview" && <>
          <section className="pv-hero">
            <div className="pv-cover">{/* eslint-disable-next-line @next/next/no-img-element */}
              {v.image ? <img src={v.image} alt={`${v.name} main photo`} /> : <span className="qb-noimg" />}
              <Link href={`/provider/venues/new?venue=${v.id}&step=1`} className="pv-addphotos"><Plus aria-hidden="true" />Add photos</Link></div>
            <div className="pv-about">
              <ul className="pv-gallery">{(v.gallery ?? []).slice(0, 5).map((g, i, arr) => <li key={g + i}>{/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g} alt="" />{i === arr.length - 1 && photos.length > 6 && <span>+{photos.length - 6}</span>}</li>)}</ul>
              <div className="pv-about-cols">
                <ul className="pv-contact">
                  <li><Building2 aria-hidden="true" />{v.name}</li>
                  <li><MapPin aria-hidden="true" /><span>{v.location}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name} ${v.location}`)}`} target="_blank" rel="noreferrer">Get directions</a></span></li>
                  {contact.phone && <li><Phone aria-hidden="true" /><a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a></li>}
                  {contact.email && <li><Mail aria-hidden="true" /><a href={`mailto:${contact.email}`}>{contact.email}</a></li>}
                  {contact.website && <li><Globe aria-hidden="true" /><a href={`https://${contact.website}`} target="_blank" rel="noreferrer">{contact.website}</a></li>}
                  {!contact.phone && !contact.email && <li className="muted"><Link href={`/provider/venues/${v.id}?tab=operations`}>Add contact details</Link></li>}
                </ul>
                <div className="pv-desc"><p>{v.description}</p><ul>{features.map(f => <li key={f}><CircleCheck aria-hidden="true" />{f}</li>)}</ul></div>
              </div>
            </div>
          </section>
          <section className="ws-kpis pv-kpis" aria-label="Venue performance">
            <Kpi icon={CalendarCheck} tone="blue" label="Total bookings" value={active.length} delta={delta(bookingsNow, bookingsPrev)} series={dailySeries(active, j => j.created_at, () => 1, 30, now)} />
            <Kpi icon={PoundSterling} tone="green" label="Venue revenue" value={money(revenue)} delta={delta(revNow, revPrev)} series={dailySeries(active, j => j.created_at, j => j.value, 30, now)} />
            <Kpi icon={Users} tone="purple" label="Occupancy rate" value={`${occupancy}%`} series={dailySeries(active.filter(j => j.status !== "completed"), j => j.starts_at, () => 1, 30, now + 30 * D)} />
            <Kpi icon={Tag} tone="orange" label="Average event value" value={money(avgValue)} delta={avgDelta} series={dailySeries(active, j => j.created_at, j => j.value, 30, now)} />
          </section>
          <div className="pv-pair">
            <section className="ws-panel pv-info"><div className="ws-panel-head"><h2><ClipboardList aria-hidden="true" />Key information</h2><Link className="ws-link" href={`/provider/venues/${v.id}?tab=operations`}><Pencil aria-hidden="true" />Edit</Link></div>
              <dl>
                <dt>Venue type</dt><dd>{d.type ?? titleCase(v.category)}</dd>
                <dt>Total capacity</dt><dd>Up to {totalCap.toLocaleString("en-GB")} (across all spaces)</dd>
                <dt>Indoor capacity</dt><dd>{indoorCap.toLocaleString("en-GB")}</dd>
                <dt>Outdoor capacity</dt><dd>{(totalCap - indoorCap).toLocaleString("en-GB")}</dd>
                <dt>Minimum hire</dt><dd>{commercial.minimum_spend ? `From ${money(commercial.minimum_spend)}` : v.price_from ? `From ${money(v.price_from)}/hr` : "On request"}</dd>
                <dt>Booking modes</dt><dd className="pv-modes">{v.booking_mode === "instant" && <i className="instant">Instant Book</i>}{v.booking_mode !== "enquiry" && <i className="request">Request to Book</i>}{v.booking_mode === "enquiry" && <i>Enquiry only</i>}</dd>
                <dt>Typical event types</dt><dd>{(info.event_types ?? []).join(", ") || "—"}</dd>
                <dt>Accessibility</dt><dd><Accessibility aria-hidden="true" />{info.accessibility || "Not specified"}</dd>
                <dt>Parking</dt><dd><SquareParking aria-hidden="true" />{info.parking || "Not specified"}</dd>
                <dt>Licences</dt><dd><ScrollText aria-hidden="true" />{(info.licences ?? []).join(", ") || "—"}</dd>
                <dt>Curfew</dt><dd><Clock aria-hidden="true" />{info.curfew || "None"}</dd>
                <dt>Staffing</dt><dd><UserRound aria-hidden="true" />{info.staffing || "—"}</dd>
              </dl></section>
            <section className="ws-panel pv-map"><div className="ws-panel-head"><h2><MapIcon aria-hidden="true" />Spaces &amp; venue map</h2><Link className="ws-link" href={`/provider/venues/${v.id}?tab=spaces`}>View all spaces <ArrowRight aria-hidden="true" /></Link></div>
              <OverviewMap elements={structure?.elements ?? []} spaces={mapSpaces} venueId={v.id} /></section>
          </div>
        </>}

        {tab === "packages" && <section className="ws-panel pv-pkgs"><div className="ws-panel-head"><h2>Packages</h2><Link href="/provider/packages/new?step=1" className="ws-btn primary sm"><Plus aria-hidden="true" />Create package</Link></div>
          {packages.length ? <ul>{packages.map(p => <li key={p.id}><Thumb src={p.image} w={72} h={56} /><div><Link href={`/provider/packages/${p.id}`}><b>{p.name}</b></Link>
            <small>{pkgSpaces(p.space_ids) || "No space linked"}{p.max_guests ? ` • ${p.min_guests ?? 1}–${p.max_guests} guests` : ""}</small><p>{p.description}</p></div>
            <span className="pv-pkg-price">{money(p.base_price)}{p.price_basis === "per_person" ? " pp" : p.price_basis === "hourly" ? "/hr" : ""}</span>
            <Chip tone={p.status === "published" ? "green" : p.status === "paused" ? "red" : "amber"}>{titleCase(p.status)}</Chip>
            <RowMenu label={`Actions for ${p.name}`} entries={[{ kind: "link", label: "Edit package", href: `/provider/packages/${p.id}` },
              p.status === "published" ? { kind: "action", label: "Pause package", run: setPackageStatus.bind(null, p.id, "paused") } : { kind: "action", label: "Publish package", run: setPackageStatus.bind(null, p.id, "published") }]} /></li>)}</ul>
            : <Empty icon={PackageIcon} title="No packages yet" text="Bundle a space with catering, AV or staffing so clients can book in one step." />}</section>}

        {tab === "operations" && <PublicAvailabilityToggle listingId={v.id} kind="venue" on={(v.details as { public_availability?: unknown } | null)?.public_availability === true} canManage={ctx.can.manage} publicHref={v.slug && live ? `/venues/${v.slug}` : null} />}
        {tab === "operations" && <section className="ws-panel pv-form"><div className="ws-panel-head"><h2>Key information &amp; contact</h2><Link className="ws-link" href={`/provider/venues/${v.id}/logistics`}>Loading bays &amp; delivery slots <ArrowRight aria-hidden="true" /></Link></div>
          <ActionForm action={saveVenueInfo.bind(null, v.id)} className="pv-grid">
            <label>Venue type<input name="type" defaultValue={d.type ?? ""} maxLength={60} /></label>
            <label>Address<input name="location" defaultValue={v.location} maxLength={160} required /></label>
            <label className="wide">Description<textarea name="description" defaultValue={v.description} rows={4} minLength={40} maxLength={2000} required /></label>
            <label className="wide">Features <small>Comma separated — shown as highlights</small><input name="features" defaultValue={features.join(", ")} /></label>
            <label>Phone<input name="phone" defaultValue={contact.phone ?? ""} inputMode="tel" maxLength={40} /></label>
            <label>Email<input name="email" type="email" defaultValue={contact.email ?? ""} maxLength={120} /></label>
            <label>Website<input name="website" defaultValue={contact.website ?? ""} maxLength={120} /></label>
            <label>Typical event types <small>Comma separated</small><input name="event_types" defaultValue={(info.event_types ?? []).join(", ")} /></label>
            <label>Accessibility<input name="accessibility" defaultValue={info.accessibility ?? ""} maxLength={200} /></label>
            <label>Parking<input name="parking" defaultValue={info.parking ?? ""} maxLength={200} /></label>
            <label>Licences <small>Comma separated</small><input name="licences" defaultValue={(info.licences ?? []).join(", ")} /></label>
            <label>Curfew<input name="curfew" type="time" defaultValue={info.curfew ?? ""} /></label>
            <label>Staffing<input name="staffing" defaultValue={info.staffing ?? ""} maxLength={200} /></label>
            <div className="wide pv-form-foot"><button type="submit" className="ws-btn primary">Save information</button></div>
          </ActionForm></section>}

        {tab === "commercial" && <section className="ws-panel pv-form"><div className="ws-panel-head"><h2>Commercial terms</h2><small>Changes apply to new quotes and bookings only — accepted bookings keep their snapshot.</small></div>
          <ActionForm action={saveCommercial.bind(null, v.id)} className="pv-grid">
            <label>Booking mode<select name="booking_mode" defaultValue={v.booking_mode} className="ws-select"><option value="request">Request to Book</option><option value="instant">Instant Book</option><option value="enquiry">Enquiry only</option></select></label>
            <label>Rate from (£/hr)<input name="rate_from" type="number" min={0} defaultValue={commercial.rate_from ?? v.price_from ?? ""} /></label>
            <label>Rate to (£/hr)<input name="rate_to" type="number" min={0} defaultValue={commercial.rate_to ?? ""} /></label>
            <label>Minimum spend (£)<input name="minimum_spend" type="number" min={0} defaultValue={commercial.minimum_spend ?? 0} /></label>
            <label>Deposit (%)<input name="deposit_pct" type="number" min={0} max={100} defaultValue={commercial.deposit_pct ?? 30} /></label>
            <label>Balance due (days before)<input name="balance_days" type="number" min={0} defaultValue={commercial.balance_days ?? 14} /></label>
            <label>Security deposit (£)<input name="security_deposit" type="number" min={0} defaultValue={commercial.security_deposit ?? 0} /></label>
            <label>Minimum lead time (days)<input name="lead_days" type="number" min={0} defaultValue={commercial.lead_days ?? 0} /></label>
            <fieldset className="wide pv-cancel"><legend>Cancellation policy</legend>
              {[0, 1, 2].map(i => <div key={i}><input name={`c_window_${i}`} placeholder={["7+ days", "3–7 days", "<3 days"][i]} defaultValue={commercial.cancellation?.[i]?.window ?? ""} aria-label={`Window ${i + 1}`} />
                <input name={`c_refund_${i}`} type="number" min={0} max={100} defaultValue={commercial.cancellation?.[i]?.refund ?? ""} aria-label={`Refund % for window ${i + 1}`} /><span>% refund</span></div>)}</fieldset>
            <label className="pv-check"><input type="checkbox" name="holds" defaultChecked={commercial.holds?.enabled ?? true} />Allow provisional holds</label>
            <label>Hold length (hours)<input name="hold_hours" type="number" min={1} max={168} defaultValue={commercial.holds?.hours ?? 48} /></label>
            <div className="wide pv-form-foot"><button type="submit" className="ws-btn primary">Save commercial terms</button></div>
          </ActionForm></section>}
        {tab === "commercial" && <VenueCommercialEngine venueId={v.id} workspaceId={ctx.workspace.id} canManage={ctx.can.manage} />}
      </div>

      <aside className="pv-rail">
        <section className="ws-panel pv-status"><div className="ws-panel-head"><h2>Listing status</h2><Link className="ws-link" href="/provider/listings/venues">All listings <ArrowRight aria-hidden="true" /></Link></div>
          {v.review_status === "restricted" || v.review_status === "suspended" ? <p className="pv-restricted"><CircleAlert aria-hidden="true" />Restricted by Gala Dock review — contact support to resolve.</p> : <LiveToggle venueId={v.id} live={live} />}
          <div className="pv-quality"><h2>Listing quality</h2>
          <div className="pv-q"><Ring value={qScore} size={64} /><ul>{quality.map(([l, s]) => <li key={l}>{s >= 8 ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span>{l}</span><b>{s}/10</b></li>)}</ul></div>
          <Link className="ws-btn outline block" href={`/provider/agent?goal=${encodeURIComponent(`Improve the quality of my ${v.name} listing`)}`}><Sparkles aria-hidden="true" />Improve with Gala Agent</Link></div></section>
        <section className="ws-panel pv-list"><div className="ws-panel-head"><h2>Upcoming bookings</h2><Link className="ws-link" href="/provider/bookings">View all <ArrowRight aria-hidden="true" /></Link></div>
          {upcoming.length ? <ul>{upcoming.map(j => <li key={j.id}><Thumb src={j.image || v.image} w={44} h={44} /><span><Link href={`/provider/bookings/${j.id}`}><b>{j.event_name}</b></Link><small>{day(j.starts_at)}</small>
            <small><MapPin aria-hidden="true" />{spaces.find(s => s.id === j.space_id)?.name ?? v.name}</small></span>
            <span className="pv-list-end"><Chip tone={j.status === "confirmed" ? "green" : "amber"} dot>{j.status === "confirmed" ? "Confirmed" : "On hold"}</Chip><small>{j.guests ?? "—"} guests</small></span></li>)}</ul>
            : <p className="pv-none">No upcoming bookings.</p>}</section>
        <section className="ws-panel pv-list"><div className="ws-panel-head"><h2>Recent enquiries</h2><Link className="ws-link" href="/provider/opportunities">View all <ArrowRight aria-hidden="true" /></Link></div>
          {enquiries.length ? <ul>{enquiries.map(i => { const st = enquiryChip[itemState(i, now)] ?? { label: titleCase(i.status), tone: "grey" as const }; return <li key={i.id}>
            <Avatar name={i.event?.client_name || i.event?.name || "Client"} size={28} /><span><Link href={`/provider/opportunities/${i.id}`}><b>{i.event?.name ?? i.request?.title ?? "Request"}</b></Link><small>{day(i.created_at, { day: "numeric", month: "short", year: "numeric" })}</small></span>
            <span className="pv-list-end row"><Chip tone={st.tone}>{st.label}</Chip><small>{i.event?.guest_count ?? "—"} guests</small></span></li>; })}</ul>
            : <p className="pv-none">No enquiries yet.</p>}</section>
      </aside>
    </div>}
    {tab === "overview" && <section className="ws-panel pv-insights"><div className="ws-panel-head"><h2><Sparkles aria-hidden="true" />Gala Agent insights<small>Recommendations from your venue’s own data.</small></h2>
            <Link className="ws-link" href={`/provider/agent?goal=${encodeURIComponent(`Improve performance of ${v.name}`)}`}>Open in Gala Agent <ArrowRight aria-hidden="true" /></Link></div>
            <ul>{insights.map(i => <li key={i.title}><span className={`pv-ins-ic ${i.tone}`}><i.icon aria-hidden="true" /></span><div><b>{i.title}</b><p>{i.text}</p><Link href={i.href} className="ws-btn outline sm">{i.cta}</Link></div></li>)}</ul></section>}
  </div>;
}
