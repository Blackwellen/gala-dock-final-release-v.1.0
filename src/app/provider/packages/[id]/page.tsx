import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { ArrowLeft, ExternalLink, Copy, Pencil, ChevronDown, MapPin, Building2, Users, Clock3, PartyPopper, CalendarCheck, PiggyBank, ClipboardList, CircleCheck, CircleX, Puzzle, ArrowRight,
  Sparkles, ChevronRight, CalendarCog, Eye, Settings2, PoundSterling, Percent, MessageSquare, TrendingUp, ImagePlus, BarChart3 } from "lucide-react";
import "@/styles/provider-venue.css";
import "@/styles/provider-venue-setup.css";
import "@/styles/provider-space.css";
import "@/styles/provider-service.css";
import "@/styles/provider-package.css";
import { Chip, Tabs, Thumb } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { money, day, requestTime } from "@/lib/workspace/format";
import { workspaceItems } from "@/lib/provider/queries";
import { MenuButton } from "../../_components/menu-button";
import { RowMenu } from "../../_components/row-menu";
import { duplicatePackage, setPackageLive } from "../actions";
import { loadPackageContext } from "../data";
import { PackageLiveToggle } from "../_components/editors";
import { PkgStep2, PkgStep3 } from "../new/steps";

export const metadata: Metadata = { title: "Package" };
const TABS = ["package", "availability", "performance"] as const;

export default async function PackageProfile(props: PageProps<"/provider/packages/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? sp.tab as typeof TABS[number] : "package";
  const c = await loadPackageContext(id);
  if (!c?.pkg) notFound();
  const { pkg: p, parent, spaces, days, bookings } = c;
  const items = (await workspaceItems()).filter(i => i.listing_id === p.listing_id && i.package === p.name);
  const now = requestTime();
  const d = p.details, photos = [p.image, ...(d.gallery ?? [])].filter(Boolean);
  const linked = spaces.filter(s => p.space_ids.includes(s.id));
  const live = p.status === "published";
  const revenue = bookings.reduce((a, j) => a + j.value, 0), avg = bookings.length ? Math.round(revenue / bookings.length) : 0;
  const conv = items.length ? Math.round((100 * bookings.length) / items.length) : 0;
  const upcoming = bookings.filter(j => new Date(j.starts_at).getTime() >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3);
  const basis = p.price_basis === "per_person" ? " pp" : p.price_basis === "hourly" ? "/hr" : "";
  const rowsInfo: [string, React.ReactNode][] = [["Package name", p.name], ["Linked " + (parent?.kind === "service" ? "service" : "venue"), <>{parent?.name ?? "—"}{linked.length ? ` – ${linked.map(s => s.name).join(", ")}` : ""}
    {parent && <Link className="pkp-view" href={`/provider/${parent.kind === "venue" ? "venues" : "services"}/${parent.id}`}>View {parent.kind}</Link>}</>],
    ["Event type", d.event_type ?? "—"], ["Capacity range", p.max_guests ? `${p.min_guests ?? 1} – ${p.max_guests} guests` : "—"], ["Duration", p.duration_hours ? `${p.duration_hours} hours` : "—"],
    ["Base price", Number(p.base_price) > 0 ? `From ${money(p.base_price)}${basis}` : "Quote only"], ["Price includes", (p.inclusions ?? []).join(", ") || "—"], ["Suitable for", d.suitable_for ?? "All ages"],
    ["Deposit", `${p.deposit_pct}% to secure`], ["Restrictions", [d.restrictions?.age, d.restrictions?.event_types].filter(Boolean).join(" · ") || "None"],
    ["Cancellation", d.cancellation?.length ? d.cancellation.map(x => `${x.window}: ${x.refund}%`).join(", ") : `${parent?.kind === "service" ? "Service" : "Venue"} policy (see terms)`]];
  const recs = [
    photos.length < 6 ? { icon: ImagePlus, title: "Add more photos", text: `${photos.length} photo${photos.length === 1 ? "" : "s"} so far — show the full setup and details.`, cta: "Upload photos", href: `/provider/packages/new?package=${p.id}&step=4` } : null,
    !(p.add_ons ?? []).length ? { icon: Puzzle, title: "Offer add-ons", text: "Optional extras lift average booking value.", cta: "Create add-on", href: `/provider/packages/new?package=${p.id}&step=1` } : null,
    { icon: CalendarCog, title: "Keep dates current", text: `${Object.values(days).filter(x => x === "available").length} available dates in the next year.`, cta: "Review calendar", href: "?tab=availability" },
    { icon: BarChart3, title: "Review pricing", text: bookings.length ? `${bookings.length} booking${bookings.length === 1 ? "" : "s"} at an average of ${money(avg)}.` : "No bookings yet — check your price against similar packages.", cta: "Review pricing", href: "?tab=availability" },
  ].filter(Boolean).slice(0, 4) as { icon: typeof BarChart3; title: string; text: string; cta: string; href: string }[];

  return <div className="pv pkp">
    <Link href="/provider/listings/packages" className="ws-back pv-back"><ArrowLeft aria-hidden="true" />Back to Packages</Link>
    <header className="pv-head">
      <div className="pv-head-main"><div className="pv-title"><h1>{p.name}</h1>{live ? <Chip tone="green" dot>Published</Chip> : p.status === "paused" ? <Chip tone="red" dot>Paused</Chip> : <Chip tone="amber" dot>Draft</Chip>}</div>
        <p className="pv-sub"><span className="pkp-crumb"><MapPin aria-hidden="true" />{parent?.name}{linked[0] && <> <ChevronRight aria-hidden="true" /> <Building2 aria-hidden="true" />{linked[0].name}</>}</span>
          <i>{parent?.kind === "service" ? "Service Package" : "Venue Package"}</i>{d.event_type && <i>{d.event_type}</i>}</p></div>
      <div className="pv-head-actions">
        {live && parent?.slug && <Link href={`/${parent.kind === "venue" ? "venues" : "services"}/${parent.slug}`} target="_blank" className="ws-btn outline"><ExternalLink aria-hidden="true" />View on marketplace</Link>}
        <ActionButton action={duplicatePackage} args={[p.id]}><Copy aria-hidden="true" />Duplicate</ActionButton>
        <RowMenu label="More package actions" entries={[{ kind: "link", label: "Package bookings", href: `/provider/bookings?q=${encodeURIComponent(p.name)}` }, live ? { kind: "action", label: "Pause package", run: setPackageLive.bind(null, p.id, false) } : { kind: "action", label: "Publish package", run: setPackageLive.bind(null, p.id, true) }]} />
        <MenuButton label="Edit package" className="ws-btn primary pv-edit" trigger={<><Pencil aria-hidden="true" />Edit package<ChevronDown aria-hidden="true" /></>} entries={[
          { kind: "link", label: "Offer details", href: `/provider/packages/new?package=${p.id}&step=1` }, { kind: "link", label: "Pricing & rules", href: "?tab=availability" },
          { kind: "link", label: "Availability", href: `/provider/packages/new?package=${p.id}&step=3` }, { kind: "link", label: "Photos", href: `/provider/packages/new?package=${p.id}&step=4` }]} />
      </div>
    </header>
    <Tabs base={`/provider/packages/${p.id}`} active={tab} tabs={[{ key: "package", label: "Package" }, { key: "availability", label: "Availability / Rules" }, { key: "performance", label: "Performance" }]} />

    {tab === "availability" && <><PkgStep2 p={p} parent={parent} days={days} next={`/provider/packages/${p.id}?tab=availability`} label="Save changes" />
      <PkgStep3 p={p} days={days} next={`/provider/packages/${p.id}?tab=availability`} label="Save dates" /></>}
    {tab === "performance" && <section className="ws-kpis pv-kpis" aria-label="Performance">
      {([[CalendarCheck, "Bookings", String(bookings.length)], [PoundSterling, "Revenue", money(revenue)], [TrendingUp, "Average value", money(avg)], [MessageSquare, "Requests naming this package", String(items.length)]] as const).map(([I, l, v]) =>
        <div key={l} className="ws-kpi"><span className="ws-kpi-icon blue"><I aria-hidden="true" /></span><div className="ws-kpi-text"><span>{l}</span><strong>{v}</strong></div></div>)}</section>}

    {tab === "package" && <><div className="pv-body">
      <div className="pv-main">
        <section className="pkp-hero">
          <div className="pv-cover">{/* eslint-disable-next-line @next/next/no-img-element */}
            {photos[0] ? <img src={photos[0]} alt={p.name} /> : <span className="qb-noimg" />}{photos.length > 0 && <span className="psp-count">1 / {photos.length}</span>}</div>
          <ul className="pkp-thumbs">{photos.slice(1, 5).map((x, i, arr) => <li key={x + i}>{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={x} alt="" />{i === arr.length - 1 && photos.length > 5 && <span>+{photos.length - 5} photos</span>}</li>)}
            {photos.length < 2 && <li className="psp-addph"><Link href={`/provider/packages/new?package=${p.id}&step=4`}>Add photos</Link></li>}</ul>
          <div className="ws-panel pkp-price"><small>From</small><b>{Number(p.base_price) > 0 ? money(p.base_price) : "Quote"}{basis && <em>{basis}</em>}</b><span>{p.max_guests ? `for up to ${p.max_guests} guests` : ""}</span>
            <p className="pkp-cta-note">How customers see it:</p>
            <span className="ws-btn primary block" aria-disabled="true">{p.booking_mode === "instant" ? "Book now" : p.booking_mode === "enquiry" ? "Send enquiry" : "Request to Book"}</span>
            <span className="ws-btn outline block" aria-disabled="true">Get a Quote</span></div>
        </section>
        <section className="pkp-facts" aria-label="Package facts">
          {([[Users, "Capacity range", p.max_guests ? `${p.min_guests ?? 1} – ${p.max_guests}` : "—", "guests"], [Clock3, "Duration", p.duration_hours ? `${p.duration_hours}` : "—", "hours"], [PartyPopper, "Event type", d.event_type ?? "—", ""],
            [CalendarCheck, "Booking mode", p.booking_mode === "instant" ? "Instant" : p.booking_mode === "enquiry" ? "Enquiry" : "Request", ""], [PiggyBank, "Deposit", `${p.deposit_pct}%`, "to secure"]] as const).map(([I, l, v, u]) =>
            <div key={l}><span className="ic"><I aria-hidden="true" /></span><p><small>{l}</small><b>{v} <em>{u}</em></b></p></div>)}</section>
        <div className="pkp-grid">
          <section className="ws-panel pv-info pkp-details"><div className="ws-panel-head"><h2><ClipboardList aria-hidden="true" />Package details</h2><Link className="ws-link" href={`/provider/packages/new?package=${p.id}&step=1`}><Pencil aria-hidden="true" />Edit</Link></div>
            <dl>{rowsInfo.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl></section>
          <div className="svp-mid">
            <div className="svp-inc">
              <section className="ws-panel"><h2><CircleCheck aria-hidden="true" className="g" />What’s included</h2><ul>{[...(d.items ?? []).map(i => `${i.name}${i.sub ? ` (${i.sub})` : ""}`), ...(d.features ?? [])].slice(0, 8).map(x => <li key={x}><CircleCheck aria-hidden="true" className="g" />{x}</li>)}</ul></section>
              <section className="ws-panel"><h2><CircleX aria-hidden="true" className="r" />What’s not included</h2><ul>{(d.excluded?.length ? d.excluded : (p.add_ons ?? []).map(a => `${a.name} (available as add-on)`)).slice(0, 7).map(x => <li key={x}><CircleX aria-hidden="true" className="r" />{x}</li>)}
                {!(d.excluded?.length || (p.add_ons ?? []).length) && <li className="pv-none">Nothing listed</li>}</ul></section>
            </div>
            <section className="ws-panel pkp-addons"><div className="ws-panel-head"><h2><Puzzle aria-hidden="true" />Add-ons</h2><Link className="ws-link" href={`/provider/packages/new?package=${p.id}&step=1`}>Manage add-ons <ArrowRight aria-hidden="true" /></Link></div>
              {(p.add_ons ?? []).length ? <ul>{(p.add_ons ?? []).slice(0, 4).map((a, i) => <li key={a.name}>{/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/assets/gd/${["s-gourmet", "ev-tastetango", "ev-neon", "v-harper"][i % 4]}.webp`} alt="" /><b>{a.name}</b><span>{money(a.price)}</span><small><CircleCheck aria-hidden="true" />{a.enabled === false ? "Hidden" : "Optional"}</small></li>)}</ul>
                : <p className="pv-none">No add-ons yet.</p>}</section>
          </div>
        </div>
      </div>
      <aside className="pv-rail">
        <section className="ws-panel pv-status"><div className="ws-panel-head"><h2>Package status</h2></div><PackageLiveToggle id={p.id} live={live} run={setPackageLive} /></section>
        <section className="ws-panel pkp-perf"><div className="ws-panel-head"><h2>Package performance</h2><small>All time</small></div>
          <ul>{([[Eye, "Requests", items.length], [CalendarCheck, "Bookings", bookings.length], [Percent, "Conversion rate", `${conv}%`], [PoundSterling, "Average value", money(avg)], [TrendingUp, "Revenue", money(revenue)]] as const).map(([I, l, v]) =>
            <li key={l}><span className="ic"><I aria-hidden="true" /></span><span>{l}</span><b>{v}</b></li>)}</ul></section>
        <section className="ws-panel pv-list"><div className="ws-panel-head"><h2>Upcoming bookings</h2><Link className="ws-link" href="/provider/bookings">View all <ArrowRight aria-hidden="true" /></Link></div>
          {upcoming.length ? <ul className="psp-next">{upcoming.map(j => <li key={j.id}><Link href={`/provider/bookings/${j.id}`}><span className="psp-date"><small>{day(j.starts_at, { weekday: "short" }).toUpperCase()}</small><b>{day(j.starts_at, { day: "numeric" })}</b><small>{day(j.starts_at, { month: "short" }).toUpperCase()}</small></span>
            <Thumb src={j.image || photos[0]} w={50} h={44} /><span className="psp-ev"><b>{j.event_name}</b><small>{j.guests ?? "—"} guests</small><Chip tone={j.status === "held" ? "amber" : "green"} dot>{j.status === "held" ? "On hold" : j.payment_status === "deposit_paid" ? "Deposit paid" : "Confirmed"}</Chip></span><ChevronRight aria-hidden="true" /></Link></li>)}</ul>
            : <p className="pv-none">No upcoming bookings for this package.</p>}</section>
        <section className="ws-panel psp-quick svp-quick"><h2>Quick actions</h2><ul>
          <li><Link href={`/provider/packages/new?package=${p.id}&step=1`}><Pencil aria-hidden="true" /><b>Edit package details</b><small>Update inclusions, pricing and media</small></Link></li>
          <li><Link href={`/provider/packages/new?package=${p.id}&step=3`}><CalendarCog aria-hidden="true" /><b>Update availability</b><small>Set dates, capacity and booking rules</small></Link></li>
          <li><Link href={live && parent?.slug ? `/${parent.kind === "venue" ? "venues" : "services"}/${parent.slug}` : `/provider/packages/new?package=${p.id}&step=5`}><Eye aria-hidden="true" /><b>Preview on marketplace</b><small>See how it appears to customers</small></Link></li>
          <li><Link href={`/provider/packages/new?package=${p.id}&step=1`}><Settings2 aria-hidden="true" /><b>Manage add-ons</b><small>Create and manage optional extras</small></Link></li></ul></section>
      </aside>
    </div>
      <section className="ws-panel pv-insights"><div className="ws-panel-head"><h2><Sparkles aria-hidden="true" />Gala Agent insights<small>Recommendations from this package’s own data.</small></h2>
        <Link className="ws-link" href={`/provider/agent?goal=${encodeURIComponent(`Improve the ${p.name} package`)}`}>Open in Gala Agent <ArrowRight aria-hidden="true" /></Link></div>
        <ul>{recs.map(r => <li key={r.title}><span className="pv-ins-ic purple"><r.icon aria-hidden="true" /></span><div><b>{r.title}</b><p>{r.text}</p><Link href={r.href} className="ws-btn outline sm">{r.cta}</Link></div></li>)}</ul></section></>}
  </div>;
}
