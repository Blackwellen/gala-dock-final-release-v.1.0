import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Pencil, ChevronDown, MapPin, Building2, Users, Ruler, ArrowUpFromLine, DoorOpen, PoundSterling, CircleCheck, ClipboardList, LayoutGrid,
  ArrowRight, ChevronRight, Plus, CalendarX2, Copy, Eye, Settings2, Sparkles, ImagePlus, BarChart3, Armchair, Accessibility } from "lucide-react";
import "@/styles/provider-venue.css";
import "@/styles/provider-space.css";
import { Chip, Tabs, Thumb } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { money, day, time, requestTime, titleCase } from "@/lib/workspace/format";
import { loadSpaceContext, buildRulesInput } from "../data";
import { duplicateSpace } from "../actions";
import { MenuButton } from "../../../../_components/menu-button";
import { VenueMap } from "../../../_components/venue-map";
import { LayoutGlyph, LAYOUT_LABEL } from "../../../_components/layout-glyph";
import { SpaceBasicsForm } from "../../../_components/space-basics";
import { SpaceRulesForm } from "../../../_components/space-rules";

export const metadata: Metadata = { title: "Space" };
const TABS = ["overview", "layouts", "availability"] as const;

export default async function SpaceProfile(props: PageProps<"/provider/venues/[id]/spaces/[spaceId]">) {
  const { id, spaceId } = await props.params;
  const sp = await props.searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? sp.tab as typeof TABS[number] : "overview";
  const c = await loadSpaceContext(id, spaceId);
  if (!c?.space) notFound();
  const { venue, space: s, spaces, structure, jobs } = c;
  const d = s.details, dim = d.dimensions ?? {};
  const now = requestTime();
  const cap = Math.max(s.capacity_standing ?? 0, s.capacity_seated ?? 0);
  const photos = [s.image, ...(d.gallery ?? [])].filter(Boolean);
  const live = s.status === "published" && venue.published;
  const next = jobs.filter(j => j.space_id === s.id && j.role === "primary" && ["held", "confirmed", "active"].includes(j.status) && new Date(j.ends_at).getTime() >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 4);
  const hireFrom = s.rate_hourly ? s.rate_hourly * Number(s.min_hours) : null;
  const layouts = Object.entries(s.layouts).sort((a, b) => b[1] - a[1]);
  const defaultLayout = d.default_layout ?? layouts[0]?.[0];
  const area = s.area_sqm ?? 0;
  const recs = [
    area && s.layouts.cabaret === undefined ? { icon: Armchair, title: "Add a cabaret layout", text: `At ${area} sqm this space fits roughly ${Math.round(area / 1.75 / 10) * 10} cabaret guests.`, cta: "Add layout", href: `?tab=layouts` } : null,
    !d.accessibility ? { icon: Accessibility, title: "Describe accessibility", text: "Organisers filter by step-free access. Add accessibility details to appear in those searches.", cta: "Add details", href: `/provider/venues/${id}/spaces/new?step=2&space=${s.id}` } : null,
    photos.length < 8 ? { icon: ImagePlus, title: "Improve media coverage", text: `${photos.length} photo${photos.length === 1 ? "" : "s"} so far. Add setups for each layout so clients can picture their event.`, cta: "Add photos", href: `/provider/venues/new?venue=${id}&step=1` } : null,
    { icon: BarChart3, title: "Review pricing", text: s.rate_hourly ? `${money(s.rate_hourly)}/hr with a ${s.min_hours}h minimum. Compare against your recent quotes.` : "No rate set — requests will need a quote.", cta: "Adjust pricing", href: `?tab=availability` },
  ].filter(Boolean).slice(0, 3) as { icon: typeof Armchair; title: string; text: string; cta: string; href: string }[];
  const keyRows: [string, string][] = [
    ["Space name", s.name], ["Space type", d.space_type ?? (s.indoor ? "Indoor space" : "Outdoor space")], ["Capacity (max)", `${cap}${layouts.length > 1 ? " (varies by layout)" : ""}`],
    ["Dimensions", dim.length && dim.width ? `${dim.length} m (L) × ${dim.width} m (W)${dim.ceiling ? ` × ${dim.ceiling} m (H)` : ""}` : "—"], ["Typical use", (d.use_cases ?? []).join(", ") || "—"],
    ["Access", d.access || "—"], ["Accessibility", d.accessibility || "—"], ["Fixed features", (d.layout_features ?? []).join(", ") || "—"],
    ["Amenities / AV", [...s.amenities, ...(d.av ?? [])].join(", ") || "—"], ["Toilets", d.toilets || "—"], ["Bar", d.bar || "—"], ["Catering", d.catering || "—"],
    ["Curfew", d.curfew || ((venue.details as { info?: { curfew?: string } }).info?.curfew ?? "—")], ["Turnaround", `${s.turnaround_minutes} minutes`],
  ];

  return <div className="pv psp">
    <Link href={`/provider/venues/${id}?tab=spaces`} className="ws-back pv-back"><ArrowLeft aria-hidden="true" />Back to {venue.name}</Link>
    <header className="pv-head">
      <div className="pv-head-main">
        <div className="pv-title"><h1>{s.name}</h1>{s.status === "published" ? <Chip tone="green" dot>Published</Chip> : s.status === "paused" ? <Chip tone="red" dot>Paused</Chip> : <Chip tone="amber" dot>Draft</Chip>}</div>
        <p className="psp-meta"><span><MapPin aria-hidden="true" />{venue.name}</span><span><Building2 aria-hidden="true" />{d.space_type ?? (s.indoor ? "Indoor Space" : "Outdoor Space")}</span>
          <span><Users aria-hidden="true" />{cap} capacity</span>{area ? <span><Ruler aria-hidden="true" />{area.toLocaleString("en-GB")} m²</span> : null}<span><MapPin aria-hidden="true" />{venue.location}</span></p>
      </div>
      <div className="pv-head-actions">
        {live && venue.slug && <Link href={`/venues/${venue.slug}`} target="_blank" className="ws-btn outline"><ExternalLink aria-hidden="true" />View on marketplace</Link>}
        <ActionButton action={duplicateSpace} args={[id, s.id]}><Copy aria-hidden="true" />Duplicate</ActionButton>
        <MenuButton label="Edit space" className="ws-btn primary pv-edit" trigger={<><Pencil aria-hidden="true" />Edit space<ChevronDown aria-hidden="true" /></>} entries={[
          { kind: "link", label: "Space & layouts", href: `/provider/venues/${id}/spaces/${s.id}?tab=layouts` }, { kind: "link", label: "Features & amenities", href: `/provider/venues/${id}/spaces/new?step=2&space=${s.id}` },
          { kind: "link", label: "Access & operations", href: `/provider/venues/${id}/spaces/new?step=3&space=${s.id}` }, { kind: "link", label: "Availability & rules", href: `/provider/venues/${id}/spaces/${s.id}?tab=availability` }]} />
      </div>
    </header>
    <Tabs base={`/provider/venues/${id}/spaces/${s.id}`} active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "layouts", label: "Layouts" }, { key: "availability", label: "Availability & Rules" }]} />

    {tab === "layouts" && <SpaceBasicsForm venueId={id} initial={{ id: s.id, name: s.name, indoor: s.indoor, area_sqm: s.area_sqm, capacity_standing: s.capacity_standing, layouts: s.layouts, details: d }} submitLabel="Save layouts" />}
    {tab === "availability" && <SpaceRulesForm venueId={id} input={buildRulesInput(c, s)} />}

    {tab === "overview" && <>
      <div className="psp-top">
        <div className="psp-cover">{/* eslint-disable-next-line @next/next/no-img-element */}
          {photos[0] ? <img src={photos[0]} alt={`${s.name}`} /> : <span className="qb-noimg" />}<span className="psp-count">1 / {photos.length || 0}</span></div>
        <ul className="psp-thumbs">{photos.slice(1, 7).map((p, i, arr) => <li key={p + i}>{/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p} alt="" />{i === arr.length - 1 && photos.length > 7 && <span>+{photos.length - 7}</span>}</li>)}
          {photos.length < 2 && <li className="psp-addph"><Link href={`/provider/venues/new?venue=${id}&step=1`}><Plus aria-hidden="true" />Add photos</Link></li>}</ul>
        <section className="ws-panel psp-loc"><div className="ws-panel-head"><h2>Location in venue</h2><Link className="ws-link" href={`/provider/venues/${id}?tab=spaces`}>Open full map <ArrowRight aria-hidden="true" /></Link></div>
          <div className="psp-map">{structure?.elements.length ? <VenueMap elements={structure.elements} spaces={spaces.map(x => ({ id: x.id, name: x.name, capacity: Math.max(x.capacity_standing ?? 0, x.capacity_seated ?? 0), indoor: x.indoor }))}
            selected={s.id} dim={sid => sid !== s.id} labelSize={22} /> : <p className="pv-none">No venue map yet.</p>}</div></section>
      </div>
      <section className="psp-stats" aria-label="Space facts">
        <div><span className="ic blue"><Users aria-hidden="true" /></span><p><small>Capacity (max)</small><b>{cap}</b></p></div>
        <div><span className="ic blue"><Ruler aria-hidden="true" /></span><p><small>Area</small><b>{area ? `${area.toLocaleString("en-GB")} m²` : "—"}</b></p></div>
        <div><span className="ic blue"><ArrowUpFromLine aria-hidden="true" /></span><p><small>Ceiling height</small><b>{dim.ceiling ? `${dim.ceiling} m` : s.indoor ? "—" : "Open air"}</b></p></div>
        <div><span className="ic blue"><DoorOpen aria-hidden="true" /></span><p><small>Access</small><b className="sm">{(d.access ?? "—").split(",")[0]}</b>{d.access?.includes(",") && <em>{d.access.split(",").slice(1).join(",").trim()}</em>}</p></div>
        <div><span className="ic red"><PoundSterling aria-hidden="true" /></span><p><small>Typical hire from</small><b>{hireFrom ? money(hireFrom) : "Quote"}</b>{hireFrom ? <em>{s.min_hours}h minimum</em> : null}</p></div>
        <div><span className="ic green"><CircleCheck aria-hidden="true" /></span><p><small>Status</small><b className="sm st">{titleCase(s.status)}</b><em>{live ? "Live on marketplace" : d.booking_type === "operational" ? "Operational only" : "Not on marketplace"}</em></p></div>
      </section>
      <div className="psp-grid">
        <section className="ws-panel psp-key"><div className="ws-panel-head"><h2><ClipboardList aria-hidden="true" />Key details</h2><Link className="ws-link" href={`/provider/venues/${id}/spaces/new?step=3&space=${s.id}`}><Pencil aria-hidden="true" />Edit</Link></div>
          <dl>{keyRows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
        <section className="ws-panel psp-layouts"><div className="ws-panel-head"><h2><LayoutGrid aria-hidden="true" />Layouts</h2><span><Link className="ws-link" href="?tab=layouts">Add layout</Link><Link className="ws-link" href="?tab=layouts">View all <ArrowRight aria-hidden="true" /></Link></span></div>
          <ul>{layouts.slice(0, 6).map(([k, v]) => <li key={k}><b>{LAYOUT_LABEL[k] ?? titleCase(k)}</b>{k === defaultLayout && <em>Default</em>}<LayoutGlyph type={k} size={86} /><small>{v} capacity</small></li>)}
            <li className="psp-custom"><Link href="?tab=layouts"><span><Plus aria-hidden="true" /></span><span><b>Custom Layout</b><small>Create a custom layout with your own configuration</small></span></Link></li></ul></section>
        <section className="ws-panel pv-insights psp-recs"><div className="ws-panel-head"><h2><Sparkles aria-hidden="true" />Gala Agent recommendations<small>Suggestions from this space’s own data.</small></h2></div>
          <ul>{recs.map(r => <li key={r.title}><span className="pv-ins-ic purple"><r.icon aria-hidden="true" /></span><div><b>{r.title}</b><p>{r.text}</p><Link href={r.href} className="ws-btn outline sm">{r.cta}</Link></div></li>)}</ul></section>
        <div className="psp-side">
          <section className="ws-panel psp-next"><div className="ws-panel-head"><h2>Availability &amp; next bookings</h2><Link className="ws-link" href={`/provider/calendar?space=${s.id}`}>View calendar <ArrowRight aria-hidden="true" /></Link></div>
            {next.length ? <ul>{next.map(j => <li key={j.id}><Link href={`/provider/bookings/${j.id}`}>
              <span className="psp-date"><small>{day(j.starts_at, { weekday: "short" }).toUpperCase()}</small><b>{day(j.starts_at, { day: "numeric" })}</b><small>{day(j.starts_at, { month: "short", year: "numeric" })}</small></span>
              <Thumb src={j.image || s.image} w={50} h={50} /><span className="psp-ev"><b>{j.event_name}</b><small>{time(j.starts_at)} – {time(j.ends_at)}</small>
                {j.status === "held" ? <Chip tone="amber" dot>On hold</Chip> : <Chip tone="green" dot>{j.status === "active" ? "In progress" : "Confirmed"}</Chip>}</span><ChevronRight aria-hidden="true" /></Link></li>)}</ul>
              : <p className="pv-none">No upcoming bookings for this space.</p>}</section>
          <section className="ws-panel psp-quick"><h2>Quick actions</h2><ul>
            <li><Link href={`/provider/calendar?space=${s.id}&view=month`}><CalendarX2 aria-hidden="true" /><b>Block dates</b><small>Set unavailable dates for this space</small></Link></li>
            <li><Link href={`/provider/venues/${id}/spaces/${s.id}?tab=layouts`}><Copy aria-hidden="true" /><b>Edit layouts</b><small>Capacities, default layout and features</small></Link></li>
            <li><Link href={live && venue.slug ? `/venues/${venue.slug}` : `/provider/venues/${id}`}><Eye aria-hidden="true" /><b>Preview listing</b><small>See how this space appears on the marketplace</small></Link></li>
            <li><Link href={`/provider/venues/${id}/spaces/${s.id}?tab=availability`}><Settings2 aria-hidden="true" /><b>Manage rules</b><small>Minimum duration, turnaround, linked spaces</small></Link></li></ul></section>
        </div>
      </div>
    </>}
  </div>;
}
