import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Eye, Pencil, ChevronDown, Tag, MapPin, Users, MessageSquare, CalendarCheck, Percent, PoundSterling, ClipboardList, CircleCheck, CircleX, PartyPopper, ShieldCheck,
  ArrowRight, Sparkles, Package as PackageIcon, CalendarCog, ListChecks, Copy, BarChart3, Map as MapIcon, CircleAlert } from "lucide-react";
import "@/styles/provider-venue.css";
import "@/styles/provider-venue-setup.css";
import "@/styles/provider-space.css";
import "@/styles/provider-service.css";
import { PublicAvailabilityToggle } from "@/components/provider/public-availability-toggle";
import { Fragment } from "react";
import { Kpi, Ring, Chip, Tabs } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { money, requestTime, delta } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { workspaceListings, workspaceJobs, workspaceItems, dailySeries } from "@/lib/provider/queries";
import { CoverageMap } from "@/components/workspace/coverage-map";
import { RowMenu } from "../../_components/row-menu";
import { MenuButton } from "../../_components/menu-button";
import { duplicateListing } from "../../listings/actions";
import { ShareVenue, LiveToggle } from "../../venues/[id]/interactive";
import { PhotoManager } from "../../venues/_components/photo-manager";
import { saveServiceInfo } from "../actions";
import { SvcStep2, SvcStep3, type Svc, type Pkg } from "../new/steps";

export const metadata: Metadata = { title: "Service" };
const TABS = ["overview", "pricing", "availability", "media"] as const;
const TYPE_IMG: Record<string, string> = { Weddings: "hero-wedding", "Private Parties": "ev-rooftop", "Corporate Events": "v-riverside-conference", Birthdays: "ev-neon", Nightclub: "ev-neon-c", Festivals: "hero-neon", Conferences: "v-riverside-conference", "Live Shows": "ev-comedy" };

export default async function ServiceProfile(props: PageProps<"/provider/services/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const sp = await props.searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? sp.tab as typeof TABS[number] : "overview";
  const [ctx, listings, jobs, items] = await Promise.all([getProvider(), workspaceListings(), workspaceJobs(), workspaceItems()]);
  const s = listings.find(l => l.id === id && l.kind === "service");
  if (!s) notFound();
  const now = requestTime(), D = 864e5, since = now - 30 * D, before = now - 60 * D;
  const svc = ((s.details as { service?: Svc }).service ?? {}) as Svc;
  const pkgs = await rows<Pkg>(ctx.db.from("packages").select("id,name,description,base_price,image,duration_hours,status").eq("listing_id", s.id).order("base_price"));
  const readiness = ((await ctx.db.rpc("listing_readiness", { p_listing: s.id })).data ?? { missing: [] }) as { missing: string[] };
  const live = s.published && !s.paused_at;
  const photos = [s.image, ...(s.gallery ?? [])].filter(Boolean);
  const myJobs = jobs.filter(j => j.listing_id === s.id && j.status !== "cancelled"), myItems = items.filter(i => i.listing_id === s.id);
  const inW = (iso: string, a: number, b: number) => { const t = new Date(iso).getTime(); return t >= a && t < b; };
  const bNow = myJobs.filter(j => inW(j.created_at, since, now)).length, bPrev = myJobs.filter(j => inW(j.created_at, before, since)).length;
  const eNow = myItems.filter(i => inW(i.created_at, since, now)).length, ePrev = myItems.filter(i => inW(i.created_at, before, since)).length;
  const conv = s.enquiry_count ? Math.round((100 * myJobs.length) / Math.max(s.enquiry_count, myItems.length)) : 0;
  const avg = myJobs.length ? Math.round(myJobs.reduce((a, j) => a + j.value, 0) / myJobs.length) : 0;
  const cov = svc.coverage ?? {}, creds = svc.credentials ?? [];
  const quality: [string, number][] = [["Photos & media", Math.min(10, Math.round((photos.length / 12) * 10))], ["Description", Math.min(10, Math.round(s.description.length / 15))],
    ["Pricing clarity", (s.price_from ? 5 : 0) + (pkgs.length ? 5 : 0)], ["Availability setup", svc.availability ? 10 : 3], ["Cancellation policy", svc.cancellation?.length ? 10 : 0],
    ["Verification & compliance", (s.verified ? 5 : 0) + Math.min(5, creds.filter(c => c.reference).length * 2)]];
  const qScore = Math.round((quality.reduce((a, [, x]) => a + x, 0) / 60) * 100);
  const verify: [string, string, boolean][] = [["Identity verification", readiness.missing.includes("verification") ? "Pending" : "Verified", !readiness.missing.includes("verification")],
    ["Payout account", readiness.missing.includes("payouts") ? "Not connected" : "Connected", !readiness.missing.includes("payouts")],
    ["Insurance (public liability)", creds.some(c => c.name.startsWith("Public liability") && c.reference) ? "Added" : "Missing", creds.some(c => c.name.startsWith("Public liability") && c.reference)], ["Photos", photos.length ? "Added" : "Missing", photos.length > 0]];
  const outside = myItems.filter(i => i.event?.city && cov.base && i.event.city !== cov.base).length;
  const recs = [
    !pkgs.some(p => /wedding/i.test(p.name)) && (svc.event_types ?? []).includes("Weddings") ? { icon: PackageIcon, title: "Add a wedding package", text: "You list weddings but have no wedding package yet.", cta: "Create package", href: `/provider/packages/new?step=1&listing=${s.id}` } : null,
    { icon: BarChart3, title: "Review pricing", text: pkgs.length ? `${pkgs.length} package${pkgs.length === 1 ? "" : "s"} from ${money(Math.min(...pkgs.map(p => Number(p.base_price))))}. Compare with your recent quotes.` : "Add packages so customers can book a clear offer.", cta: "Review pricing", href: "?tab=pricing" },
    outside > 0 ? { icon: MapIcon, title: "Expand coverage", text: `${outside} of your enquiries came from outside ${cov.base}.`, cta: "Edit coverage", href: `/provider/services/new?service=${s.id}&step=1` } : { icon: MapIcon, title: "Check your coverage", text: `You cover ${cov.radius_miles ?? 50} miles from ${cov.base ?? "your base"}.`, cta: "Edit coverage", href: `/provider/services/new?service=${s.id}&step=1` },
  ].filter(Boolean) as { icon: typeof BarChart3; title: string; text: string; cta: string; href: string }[];
  const keyRows: [string, string][] = [["Service name", s.name], ["Category", s.category.replace(">", "›")], ["Service type", svc.service_type ?? "—"], ["Coverage area", `${cov.base ?? s.city} · ${cov.radius_miles ?? 50} miles`],
    ["Typical event types", (svc.event_types ?? []).join(", ") || "—"], ["Setup time", `${(svc.setup?.setup_minutes ?? 60) / 60} hour${(svc.setup?.setup_minutes ?? 60) === 60 ? "" : "s"}`], ["Duration options", svc.durations ?? "—"],
    ["Team size", svc.team ?? "—"], ["Equipment included", svc.equipment ?? "—"], ["Travel", svc.travel ?? "—"], ["Public liability", creds.find(c => c.name.startsWith("Public"))?.reference ?? "Not added"], ["Additional docs", svc.docs ?? "—"]];

  return <div className="pv">
    <Link href="/provider/listings/services" className="ws-back pv-back"><ArrowLeft aria-hidden="true" />Back to Services</Link>
    <header className="pv-head">
      <div className="pv-head-main"><div className="pv-title"><h1>{s.name}</h1>{live ? <Chip tone="green" dot>Published</Chip> : s.paused_at ? <Chip tone="red" dot>Paused</Chip> : <Chip tone="amber" dot>Draft</Chip>}</div>
        <p className="psp-meta"><span><Tag aria-hidden="true" />{s.category.replace(">", "›")}</span><span><MapPin aria-hidden="true" />{cov.base ?? s.city} &amp; {cov.radius_miles ?? 50} miles</span>
          <span><Users aria-hidden="true" />{(svc.event_types ?? []).slice(0, 3).join(", ")}{(svc.event_types ?? []).length > 3 ? ` +${(svc.event_types ?? []).length - 3}` : ""}</span></p></div>
      <div className="pv-head-actions">
        {live && s.slug && <Link href={`/services/${s.slug}`} target="_blank" className="ws-btn outline"><ExternalLink aria-hidden="true" />View on marketplace</Link>}
        <ShareVenue path={s.slug && live ? `/services/${s.slug}` : `/provider/services/${s.id}`} />
        {s.slug && <Link href={`/services/${s.slug}?preview=1`} target="_blank" className="ws-btn outline"><Eye aria-hidden="true" />Preview</Link>}
        <RowMenu label="More service actions" entries={[{ kind: "action", label: "Duplicate service", run: duplicateListing.bind(null, s.id) }, { kind: "link", label: "Service bookings", href: `/provider/bookings?q=${encodeURIComponent(s.name)}` }]} />
        <MenuButton label="Edit service" className="ws-btn primary pv-edit" trigger={<><Pencil aria-hidden="true" />Edit service<ChevronDown aria-hidden="true" /></>} entries={[
          { kind: "link", label: "Service & coverage", href: `/provider/services/new?service=${s.id}&step=1` }, { kind: "link", label: "Pricing & packages", href: "?tab=pricing" },
          { kind: "link", label: "Availability & requirements", href: "?tab=availability" }, { kind: "link", label: "Media", href: "?tab=media" }]} />
      </div>
    </header>
    <Tabs base={`/provider/services/${s.id}`} active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "pricing", label: "Pricing & Packages" }, { key: "availability", label: "Availability & Requirements" }, { key: "media", label: "Media & Performance" }]} />

    {tab === "pricing" && <SvcStep2 s={s} svc={svc} pkgs={pkgs} next={`/provider/services/${s.id}?tab=pricing`} label="Save changes" />}
    {tab === "availability" && <SvcStep3 s={s} svc={svc} next={`/provider/services/${s.id}?tab=availability`} verify={verify} label="Save changes" />}
    {tab === "media" && <div className="svp-media"><PhotoManager venueId={s.id} initial={photos} />
      <section className="ws-kpis pv-kpis" aria-label="Performance">
        <Kpi icon={Eye} tone="blue" label="Total views" value={s.views.toLocaleString("en-GB")} />
        <Kpi icon={MessageSquare} tone="teal" label="Enquiries" value={Math.max(s.enquiry_count, myItems.length)} delta={delta(eNow, ePrev)} series={dailySeries(myItems, i => i.created_at, () => 1, 30, now)} />
        <Kpi icon={CalendarCheck} tone="red" label="Bookings" value={myJobs.length} delta={delta(bNow, bPrev)} series={dailySeries(myJobs, j => j.created_at, () => 1, 30, now)} />
        <Kpi icon={Percent} tone="purple" label="Conversion rate" value={`${conv}%`} /></section></div>}

    {tab === "overview" && <><div className="pv-body">
      <div className="pv-main">
        <section className="svp-hero">
          <div className="pv-cover">{/* eslint-disable-next-line @next/next/no-img-element */}
            {photos[0] ? <img src={photos[0]} alt={s.name} /> : <span className="qb-noimg" />}<span className="psp-count">1 / {photos.length}</span></div>
          <ul className="svp-gallery">{photos.slice(1, 9).map((p, i, arr) => <li key={p + i}>{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt="" />{i === arr.length - 1 && photos.length > 9 && <span>+{photos.length - 9} photos</span>}</li>)}
            {photos.length < 2 && <li className="psp-addph"><Link href="?tab=media">Add photos</Link></li>}</ul>
        </section>
        <section className="ws-kpis svp-kpis" aria-label="Service performance">
          <Kpi icon={Eye} tone="blue" label="Total views" value={s.views.toLocaleString("en-GB")} />
          <Kpi icon={MessageSquare} tone="teal" label="Enquiries" value={Math.max(s.enquiry_count, myItems.length)} delta={delta(eNow, ePrev)} series={dailySeries(myItems, i => i.created_at, () => 1, 30, now)} />
          <Kpi icon={CalendarCheck} tone="red" label="Bookings" value={myJobs.length} delta={delta(bNow, bPrev)} series={dailySeries(myJobs, j => j.created_at, () => 1, 30, now)} />
          <Kpi icon={Percent} tone="purple" label="Conversion rate" value={`${conv}%`} />
          <Kpi icon={PoundSterling} tone="orange" label="Average booking value" value={money(avg)} series={dailySeries(myJobs, j => j.created_at, j => j.value, 30, now)} />
        </section>
        <div className="svp-grid">
          <section className="ws-panel pv-info svp-key"><div className="ws-panel-head"><h2><ClipboardList aria-hidden="true" />Key information</h2></div>
            <dl>{keyRows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
            <details className="svp-edit"><summary><Pencil aria-hidden="true" />Edit details</summary>
              <ActionForm action={saveServiceInfo.bind(null, s.id)} className="pv-grid">
                <label>Service type<input name="service_type" defaultValue={svc.service_type ?? ""} /></label><label>Duration options<input name="durations" defaultValue={svc.durations ?? ""} /></label>
                <label>Team size<input name="team" defaultValue={svc.team ?? ""} /></label><label className="wide">Equipment included<input name="equipment" defaultValue={svc.equipment ?? ""} /></label>
                <label>Travel<input name="travel" defaultValue={svc.travel ?? ""} /></label><label>Additional docs<input name="docs" defaultValue={svc.docs ?? ""} /></label>
                <label className="wide">What’s included <small>One per line</small><textarea name="included" rows={4} defaultValue={(svc.included ?? []).join("\n")} /></label>
                <label className="wide">What’s not included <small>One per line</small><textarea name="excluded" rows={3} defaultValue={(svc.excluded ?? []).join("\n")} /></label>
                <div className="wide pv-form-foot"><button type="submit" className="ws-btn primary">Save details</button></div></ActionForm></details></section>
          <div className="svp-mid">
            <div className="svp-inc">
              <section className="ws-panel"><h2><CircleCheck aria-hidden="true" className="g" />What’s included</h2><ul>{(svc.included ?? []).map(x => <li key={x}><CircleCheck aria-hidden="true" className="g" />{x}</li>)}{!(svc.included ?? []).length && <li className="pv-none">Not listed yet</li>}</ul></section>
              <section className="ws-panel"><h2><CircleX aria-hidden="true" className="r" />What’s not included</h2><ul>{(svc.excluded ?? []).map(x => <li key={x}><CircleX aria-hidden="true" className="r" />{x}</li>)}{!(svc.excluded ?? []).length && <li className="pv-none">Not listed yet</li>}</ul></section>
            </div>
            <section className="ws-panel svp-types"><h2><PartyPopper aria-hidden="true" />Event types</h2><ul>{(svc.event_types ?? []).slice(0, 6).map(t => <li key={t}>{/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/assets/gd/${TYPE_IMG[t] ?? "hero-discover"}.webp`} alt="" /><span>{t}</span></li>)}</ul></section>
            <section className="ws-panel svp-creds"><div className="ws-panel-head"><h2><ShieldCheck aria-hidden="true" />Credentials &amp; verification</h2><Link className="ws-link" href={`/provider/services/new?service=${s.id}&step=1`}>View all <ArrowRight aria-hidden="true" /></Link></div>
              <ul><li><ShieldCheck aria-hidden="true" /><span><b>Identity verified</b><small>{s.verified ? "Gala Dock" : "Pending"}</small></span></li>
                {creds.filter(c => c.reference || c.expires).slice(0, 3).map(c => <li key={c.name}><ShieldCheck aria-hidden="true" /><span><b>{c.name.replace(" (equipment)", "")}</b><small>{c.expires ? `Valid until ${new Date(c.expires).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : c.reference}</small></span></li>)}</ul></section>
          </div>
        </div>
      </div>
      <aside className="pv-rail">
        <section className="ws-panel pv-status"><div className="ws-panel-head"><h2>Service status</h2></div>
          {["restricted", "suspended"].includes(s.review_status) ? <p className="pv-restricted"><CircleAlert aria-hidden="true" />Restricted by Gala Dock review — contact support.</p> : <LiveToggle venueId={s.id} live={live} />}
          <div className="pv-quality"><h2>Listing quality</h2><div className="pv-q"><Ring value={qScore} size={64} /><ul>{quality.map(([l, x]) => <li key={l}>{x >= 8 ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span>{l}</span><b>{x}/10</b></li>)}</ul></div></div></section>
        <PublicAvailabilityToggle listingId={s.id} kind="service" on={(s.details as { public_availability?: unknown } | null)?.public_availability === true} canManage={ctx.can.manage} publicHref={s.slug && live ? `/services/${s.slug}` : null} />
        <section className="ws-panel svp-cov"><div className="ws-panel-head"><h2>Coverage area</h2><Link className="ws-link" href={`/provider/services/new?service=${s.id}&step=1`}><Pencil aria-hidden="true" />Edit</Link></div>
          <CoverageMap base={cov.base ?? "London"} radiusMiles={cov.radius_miles ?? 40} width={286} height={150} />
          <p className="svp-legend"><i className="p" />Primary coverage ({cov.radius_miles ?? 40} miles)</p></section>
        <section className="ws-panel psp-quick svp-quick"><h2>Quick actions</h2><ul>
          <li><Link href={`/provider/packages/new?step=1&listing=${s.id}`}><PackageIcon aria-hidden="true" /><b>Create package</b><small>Bundle this service with set pricing</small></Link></li>
          <li><Link href="?tab=availability"><CalendarCog aria-hidden="true" /><b>Update availability</b><small>Lead times, hours and capacity</small></Link></li>
          <li><Link href="?tab=pricing"><ListChecks aria-hidden="true" /><b>Edit requirements</b><small>Customer questions and setup needs</small></Link></li>
          <li><Link href={live && s.slug ? `/services/${s.slug}` : `?tab=media`}><Eye aria-hidden="true" /><b>Preview listing</b><small>See how it appears on the marketplace</small></Link></li>
          <li><Link href={`/provider/services/new?service=${s.id}&step=5`}><Copy aria-hidden="true" /><b>Review &amp; publish</b><small>Check readiness and go live</small></Link></li></ul></section>
      </aside>
    </div>
      <section className="ws-panel pv-insights"><div className="ws-panel-head"><h2><Sparkles aria-hidden="true" />Gala Agent recommendations<small>Suggestions from this service’s own data.</small></h2>
        <Link className="ws-link" href={`/provider/agent?goal=${encodeURIComponent(`Improve ${s.name}`)}`}>Open in Gala Agent <ArrowRight aria-hidden="true" /></Link></div>
        <ul className="svp-recs">{recs.map(r => <li key={r.title}><span className="pv-ins-ic purple"><r.icon aria-hidden="true" /></span><div><b>{r.title}</b><p>{r.text}</p><Link href={r.href} className="ws-btn outline sm">{r.cta}</Link></div></li>)}</ul></section>
    </>}
  </div>;
}
