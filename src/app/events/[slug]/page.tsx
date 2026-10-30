import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin, Users, ShieldAlert, BadgeCheck, CheckCircle2, ArrowRight, Music2, Disc3, Utensils, Palette, Layers, Trees, Clock, Navigation, ChevronDown, Sparkles, Accessibility, MessageCircle, Tag, Image as ImageIcon, PlayCircle, Armchair } from "lucide-react";
import { FollowButton } from "@/components/public/follow-button";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MapView } from "@/components/kit/client";
import { EventActions, TicketPicker, RecordView } from "@/components/customer/public-event-client";
import { listingHref } from "@/lib/links";
import { eventTypeLabel } from "@/lib/format";
import { serveSponsored } from "@/lib/ads/serve";
import { SponsoredRow } from "@/components/ads/sponsored";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shareCard, related as relatedEvents } from "@/lib/public/directory";
import { blockOrder, blockVisible, type Block } from "@/lib/page-blocks";
import { heroTicketCta, isSellable, safeMerchUrl } from "@/lib/public/ticket-cta";
import { parseVideo, watchUrl } from "@/lib/public/video";
import { VideoEmbed } from "@/components/public/video-embed";
import { loadEventExtras } from "@/lib/public/event-extras";
import { BannerStrip, SponsorsSection, OnlineSection, DatesSection, MerchSection, AccessFacts } from "@/components/public/event-sections";
import { EventGettingThere } from "@/components/public/event-getting-there";
import { loadGettingThere } from "@/lib/public/getting-there";

// The plan renders on the server (no map code in the browser); dynamic() splits its small pan/zoom client frame and preloads its CSS.
const PublicPlan = dynamic(() => import("@/components/venue-plan/public-plan").then(m => m.PublicPlan));

const TZ = "Europe/London";
const COLS = "id,name,slug,description,event_type,starts_at,ends_at,venue_name,location,city,cover_image,tags,settings,status,workspace_id,venue_listing_id,capacity,series_id,parent_event_id";
/** Public read; `preview` lets signed-in workspace members see an unpublished page (RLS still decides what they can read). */
async function load(slug: string, preview = false) {
  const supabase = await createClient();
  // Events without a slug are linked by id (Discover, Home); same visibility rules either way.
  const key = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug) ? "id" : "slug";
  if (preview) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { const { data: e } = await supabase.from("events").select(COLS).eq(key, slug).not("workspace_id", "is", null).maybeSingle(); if (e) return { supabase, e, preview: true }; }
  }
  const { data: e } = await supabase.from("events_public").select(COLS).eq(key, slug).eq("visibility", "public").in("status", ["published", "on_sale", "live"]).maybeSingle();
  return { supabase, e, preview: false };
}
export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }): Promise<Metadata> {
  const { slug } = await params; const sp = await searchParams; const { supabase, e, preview } = await load(slug, sp.preview === "1");
  if (!e) return { title: "Event not found", robots: { index: false } };
  // Page editor › SEO & sharing (settings.seo) sets the title and description; the rules below for who gets a card are unchanged.
  const seo = ((e.settings ?? {}) as { seo?: { title?: string; description?: string } }).seo ?? {};
  const seoTitle = seo.title?.trim() || null, seoDesc = seo.description?.trim() || null;
  // W01: link previews come only from event_share_card (listed public events; query-free image; canonical URL). Unlisted, ended,
  // restricted or preview renders get no Open Graph card and are not indexed.
  // W11 (lane C): types whose rules say share_preview = false (private guest privacy) never get a card, even when listed.
  // event_type_rules is a static taxonomy read granted to authenticated/service only, so the server asks with the service client.
  const rules = e.event_type ? await (createAdminClient() as unknown as SupabaseClient).rpc("event_type_rules", { p_type: e.event_type }).then(r => r.data as { share_preview?: boolean } | null, () => null) : null;
  const card = preview || rules?.share_preview === false ? null : await shareCard(supabase as unknown as SupabaseClient, e.id);
  if (!card) return { title: seoTitle ?? e.name, robots: { index: false, follow: false }, alternates: { canonical: `/events/${e.slug ?? e.id}` } };
  const title = seoTitle ?? card.title, description = seoDesc ?? card.description;
  return { title, description, alternates: { canonical: card.url },
    openGraph: { title, description, url: card.url, type: "website", images: card.image ? [card.image] : [] },
    twitter: { card: card.image ? "summary_large_image" : "summary", title, description, images: card.image ? [card.image] : [] } };
}
const FEAT: Record<string, typeof Music2> = { "Live Music": Music2, "DJ Sets": Disc3, "Food & Drink": Utensils, "Art Installations": Palette, "Multiple Stages": Layers, Outdoor: Trees };

const LAUNCH: Record<string, [string, string]> = { draft: ["Not on sale", "off"], coming_soon: ["Coming soon", "off"], countdown: ["On sale soon", "off"], presale: ["Presale live", ""], on_sale: ["On Sale Now", ""], final_release: ["Final release", ""], low_availability: ["Selling fast", "warn"], sold_out: ["Sold out", "off"], waitlist: ["Waitlist open", "off"], postponed: ["Postponed", "warn"], cancelled: ["Cancelled", "bad"], ended: ["Event ended", "off"] };

export default async function PublicEventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  // Waitlist offer links land here; checkout owns the "Use my reserved tickets" flow.
  if (sp.waitlist_offer && /^[0-9a-f-]{36}$/i.test(sp.waitlist_offer)) redirect(`/checkout/${encodeURIComponent(slug)}?waitlist_offer=${sp.waitlist_offer}`);
  const { supabase, e, preview } = await load(slug, sp.preview === "1");
  if (!e) notFound();
  const s = (e.settings ?? {}) as Record<string, unknown>;
  const on = (b: Block) => blockVisible(s, b);
  const gettingThere = loadGettingThere(supabase, e.id);   // lane D: public parking / transport (202610294081)
  const [{ data: tiers }, { data: lineup }, { data: venue }, { data: org }, { data: related }, { data: { user } }, x, { data: seated }] = await Promise.all([
    supabase.from("ticket_tiers").select("id,name,description,kind,price,quantity,sold,held,status,sale_end,badge,sort,color").eq("event_id", e.id).not("status", "in", "(draft,hidden)").order("sort"),
    supabase.from("programme_items").select("id,title,detail,area,starts_at,duration_minutes,image").eq("event_id", e.id).eq("kind", "programme").order("starts_at"),
    e.venue_listing_id ? supabase.from("listings").select("id,name,slug,kind,image,location,description,rating,review_count,capacity_max,tags,lat,lng,details").eq("id", e.venue_listing_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("public_organizer", { p_event: e.id }),
    // Related = directory_related (listed events only; its score and "why" reasons are dropped, never shown).
    relatedEvents(supabase as unknown as SupabaseClient, e.id, 4).then(data => ({ data })),
    supabase.auth.getUser(),
    loadEventExtras(supabase, e),
    // Reserved seating exists when the published layout created seat inventory (same rule checkout uses for its seat picker).
    supabase.from("event_seats").select("tier_id").eq("event_id", e.id).not("tier_id", "is", null).limit(1),
  ]);
  // Sponsored related events (Q23 'event_related'): a separate labelled row; never this event or one already listed organically.
  const relatedAds = preview ? [] : await serveSponsored("event_related", { city: e.city }, [e.id, ...(related ?? []).map(r => r.id)]);
  const { data: savedRow } = user ? await supabase.from("saved_items").select("item_key").eq("user_id", user.id).eq("item_key", `event:${e.id}`).maybeSingle() : { data: null };
  const o = (org ?? [])[0] as { name: string; cover_image: string; verified: boolean; events_count: number; followers: number } | undefined;
  const d = e.starts_at ? new Date(e.starts_at) : null;
  const dayStr = d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "Date TBC";
  const t = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }) : "";
  const tk = (tiers ?? []).map(x => ({ id: x.id, name: x.name, sub: x.description || (x.kind === "vip" ? "Fast entry • VIP area" : x.kind === "group" ? "Per person" : "General admission"), price: Number(x.price), left: Math.max(0, x.quantity - x.sold - x.held), qty: x.quantity, status: x.status, badge: x.badge }));
  const onSale = tk.some(x => x.status === "on_sale" && x.left > 0);
  const settingsGallery = ((s.gallery as string[] | undefined) ?? []).filter(Boolean);
  // Photos: cover, the organiser's page gallery, then Q23 public galleries (alt text and credit kept).
  const photoList = [...new Map([e.cover_image, ...settingsGallery].filter(Boolean).map(u => [u as string, { url: u as string, alt: "", credit: null as string | null }])).values()];
  for (const p of x.photos) if (!photoList.some(q => q.url === p.url)) photoList.push(p);
  const photos = photoList.map(p => p.url);
  const faqs = (s.faqs as { q: string; a: string }[] | undefined) ?? [];
  const highlights = (s.highlights as string[] | undefined) ?? [];
  const features = (s.features as string[] | undefined) ?? e.tags ?? [];
  const pins = venue?.lat && venue?.lng ? [{ id: venue.id, lat: venue.lat, lng: venue.lng, label: venue.name }] : [];
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.venue_name, e.location].filter(Boolean).join(", "))}`;
  const gt = await gettingThere;
  const mode = x.virtual?.format === "hybrid" ? "MixedEventAttendanceMode" : x.virtual?.sessions.length ? "OnlineEventAttendanceMode" : "OfflineEventAttendanceMode";
  const ld = { "@context": "https://schema.org", "@type": "Event", name: e.name, startDate: e.starts_at, endDate: e.ends_at, eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: `https://schema.org/${mode}`, location: { "@type": "Place", name: e.venue_name, address: e.location }, image: photos.slice(0, 3), description: e.description, offers: tk.map(x => ({ "@type": "Offer", name: x.name, price: x.price, priceCurrency: "GBP", availability: x.left > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut" })), organizer: o ? { "@type": "Organization", name: o.name } : undefined };

  // §50 launch state (server-computed): drives the badge and whether checkout is offered.
  const { data: launchRaw } = e ? await supabase.rpc("event_launch_state" as never, { p_event: e.id } as never) : { data: null };
  const launch = (launchRaw as string | null) ?? null;
  // Same rule as checkout: paid tiers need a seller whose Stripe account can take payments (anon-allowed Q07 read).
  const { data: readiness } = await supabase.rpc("event_payment_readiness", { p_event: e.id });
  const sellerReady = readiness === "ready" || !tk.some(x => x.price > 0);
  const waitlist = s.waiting_list === true || ((s as { ticket_pro?: { sales?: { waiting_list?: boolean } } }).ticket_pro?.sales?.waiting_list === true);
  const { data: followRow } = user && e.workspace_id ? await supabase.from("follows").select("subject_key").eq("subject_kind", "organizer").eq("subject_key", e.workspace_id).maybeSingle() : { data: null };
  const venueAccess = ((venue?.details as { info?: { accessibility?: string } } | null)?.info?.accessibility) ?? null;
  const endStr = e.ends_at ? new Date(e.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : null;
  const dateLine = endStr && endStr !== dayStr ? `${dayStr.split(" ")[0]} – ${endStr}` : dayStr;
  const sale = launch ? (LAUNCH[launch] ?? [launch, "off"]) : onSale ? ["On sale", ""] : tk.length ? ["Sold out", "off"] : ["Coming soon", "off"];
  const exp = photos.slice(1, 5);
  const venueHref = venue ? listingHref(venue.kind, venue.slug, venue.id) : null;
  const artists = (lineup ?? []).filter(l => l.image).slice(0, 6);
  const slugOrId = e.slug ?? e.id;

  // Page editor (settings): saved block order + visibility, hero CTAs, overlay and video.
  const cta = (s.cta ?? {}) as { primary?: string; secondary?: string };
  const overlay = ["light", "none"].includes(String(s.hero_overlay)) ? String(s.hero_overlay) : "dark";
  const video = parseVideo(s.hero_video);
  const showLineup = on("performers") && artists.length > 0, showSchedule = on("programme") && (lineup ?? []).length > 0;
  const primary = on("tickets") ? heroTicketCta({ label: cta.primary?.trim() || "Buy tickets", launch, sellerReady, buyable: tk.filter(x => x.status === "on_sale" && x.left > 0).length, waitlist, anySoldOut: tk.some(x => x.status === "sold_out" || (x.status === "on_sale" && x.left === 0)) }) : null;
  const secondaryHref = showLineup ? "#lineup" : showSchedule ? "#schedule" : null;
  const seatsCta = (seated ?? []).length > 0 && isSellable(launch) && sellerReady && onSale ? <Link className="k-btn primary" href={`/checkout/${slugOrId}`}><Armchair size={16} />Choose seats</Link> : null;

  // Programme grouped by day when the event spans several (Q40 days, else the calendar date); stage / room from `area`.
  const dayKey = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }) : "Time TBC";
  const progDays = [...new Set((lineup ?? []).map(l => dayKey(l.starts_at)))];
  const dayLabel = new Map(x.extras.days.map(dd => [dayKey(dd.starts_at ?? `${dd.date}T12:00:00Z`), dd.label]));

  const sections: Partial<Record<Block, ReactNode>> = {
    performers: showLineup && <section id="lineup" className="ce-card pe3-lineup"><div className="k-between"><h2>Line-up</h2>{showSchedule && <a className="k-link" href="#schedule">View full schedule <ArrowRight size={14} /></a>}</div>
      <div className="pe3-artists">{artists.map(l => <article key={l.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image} alt="" /><b>{l.title}</b><small>{l.area || "Live"}</small><small><Clock size={11} />{l.starts_at ? new Date(l.starts_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }) : ""} {t(l.starts_at)}</small></article>)}</div></section>,
    programme: (showSchedule || x.virtual?.sessions.length) && <>{showSchedule && <section id="schedule" className="ce-card pe3-sched"><h2>Programme</h2>
      {progDays.map(dk => <div key={dk} className="pe3-sched-day">{progDays.length > 1 && <h3>{dayLabel.get(dk) ? `${dayLabel.get(dk)} · ${dk}` : dk}</h3>}
        <ol className="pe-sched-l">{(lineup ?? []).filter(l => dayKey(l.starts_at) === dk).map(l => <li key={l.id}><time>{t(l.starts_at)}</time><span className="k-grow"><b>{l.title}</b>{l.detail ? <small>{l.detail}</small> : null}</span>{l.area && <em>{l.area}</em>}</li>)}</ol></div>)}</section>}
      <OnlineSection virtual={x.virtual} /></>,
    venue: <section id="venue" className="pe3-venue"><h2>Venue</h2>
      <div className="ce-card pe3-venue-g">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={venue?.image || e.cover_image || "/assets/gd/hero-neon.webp"} alt="" />
        <div className="pe3-venue-info"><h3>{venue?.name ?? e.venue_name}</h3><small>{venue?.location ?? e.location}</small>{venue?.description ? <p>{String(venue.description).slice(0, 180)}</p> : null}
          {(venue?.tags ?? []).length > 0 && <ul>{(venue?.tags ?? []).slice(0, 6).map((tg: string) => <li key={tg}><CheckCircle2 size={14} />{tg}</li>)}</ul>}
          {x.extras.venues.length > 1 && <ul className="pe3-venues" aria-label="Event venues">{x.extras.venues.map(v => <li key={`${v.name}${v.role}`}><MapPin size={14} />{v.listing_slug ? <Link href={`/venues/${v.listing_slug}`}>{v.name}</Link> : v.name}<small>{v.role === "primary" ? "Main venue" : v.role === "satellite" ? "Satellite venue" : "Also at"}</small></li>)}</ul>}
          <div className="pe3-venue-acts"><a className="k-btn outline" href={maps} target="_blank" rel="noopener noreferrer"><Navigation size={15} />Get directions</a>{venueHref && <Link className="k-link" href={venueHref}>View venue <ArrowRight size={14} /></Link>}</div></div>
        <div className="pe3-venue-map">{pins.length ? <MapView pins={pins} center={pins[0]} zoom={13} height={300} ariaLabel={`Map of ${e.venue_name}`} /> : <div className="pe-nomap">{e.location}</div>}</div></div></section>,
    map: <PublicPlan id="event-map" title="Event map" intro="The organiser's site plan: stages, zones, facilities, entrances and seating." label={`Event map for ${e.name}`} base={x.plan.base} overlay={x.plan.overlay} spaces={x.plan.spaces}
      tiers={(tiers ?? []).map(tr => ({ id: tr.id, name: tr.name, color: tr.color }))} cta={seatsCta} />,
    getting_there: gt && <EventGettingThere data={gt} maps={maps} />,
    sponsors: <SponsorsSection partners={x.extras.partners} />,
    gallery: photos.length > 0 && <>{exp.length > 0 && <section id="experience" className="pe3-exp"><h2>Event experience</h2><div className="pe3-exp-g">{exp.map((p, i) => <article key={p + i} className="ce-card">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt={photoList[i + 1]?.alt ?? ""} /><b>{features[i] ?? "Highlights"}</b>{highlights[i] ? <small>{highlights[i]}</small> : null}</article>)}</div></section>}
      <section id="photos" className="pe3-photos"><div className="k-between"><h2>Photos &amp; videos</h2><span className="k-small"><ImageIcon size={13} /> {photos.length} photos</span></div>
        <div className="pe3-photos-g">{photoList.slice(0, 6).map((p, i) => <span key={p.url + i}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.url} alt={p.alt} loading="lazy" />{i === 5 && photos.length > 6 && <b>+{photos.length - 6}<small>More photos</small></b>}</span>)}</div>
        {photoList.some(p => p.credit) && <p className="px-note">Photos: {[...new Set(photoList.map(p => p.credit).filter(Boolean))].join(", ")}</p>}</section></>,
    faqs: faqs.length > 0 && <div id="faqs" className="pe3-faqrow"><section className="ce-card pe-faqs"><h2>FAQ</h2><div className="pe-faq-g">{faqs.map(f => <details key={f.q}><summary>{f.q}<ChevronDown size={15} /></summary><p>{f.a}</p></details>)}</div></section>
      <aside className="ce-card pe3-support"><MessageCircle size={26} aria-hidden /><b>Still have questions?</b><small>Our support team can help with tickets, refunds and access.</small><Link className="k-btn outline" href="/help#contact">Contact support <ArrowRight size={14} /></Link></aside></div>,
    related: (related ?? []).length > 0 && <section id="related" className="pe3-similar"><div className="k-between"><h2>Similar events</h2><Link className="k-link" href={e.city ? `/events/in/${encodeURIComponent(e.city.toLowerCase())}` : "/events"}>View all events <ArrowRight size={14} /></Link></div>
      <div className="pe3-sim-g">{(related ?? []).map(r => <Link key={r.id} className="ce-card" href={`/events/${r.slug ?? r.id}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={r.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><span><b>{r.name}</b><small>{r.starts_at ? new Date(r.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : ""}</small><small>{r.city}</small></span></Link>)}</div></section>,
  };
  const hasMap = [...x.plan.base, ...x.plan.overlay].some(el => !el.hidden && el.type !== "layer" && el.type !== "basemap");
  const TAB: Partial<Record<Block, [string, string] | null>> = { performers: showLineup ? ["lineup", "Line-up"] : null, programme: showSchedule ? ["schedule", "Programme"] : x.virtual?.sessions.length ? ["online", "Online"] : null, venue: ["venue", "Venue"], getting_there: gt ? ["getting-there", "Getting there"] : null, map: hasMap ? ["event-map", "Map"] : null, sponsors: x.extras.partners.length ? ["sponsors", "Sponsors"] : null, gallery: photos.length ? ["photos", "Photos"] : null, faqs: faqs.length ? ["faqs", "FAQ"] : null, related: (related ?? []).length ? ["related", "Similar events"] : null };

  // About + ticket card share the top row (wherever the first of them is placed); organiser / details / accessibility share the info row.
  const rows: ReactNode[] = []; const tabs: [string, string][] = []; let top = false, info = false;
  for (const b of blockOrder(s)) {
    if (b === "hero" || !on(b)) continue;
    if (b === "about" || b === "tickets") {
      if (top) continue; top = true;
      const showAbout = on("about"), showTickets = on("tickets");
      if (showAbout) tabs.push(["about", "Overview"]); if (showTickets) tabs.push(["tickets", "Tickets"]);
      rows.push(<div key="top" className={`pe3-top${showAbout && showTickets ? "" : " solo"}`}>
        {showAbout && <section id="about" className="ce-card pe3-about"><h2>About this event</h2><p>{e.description}</p>
          {video && <div id="video"><VideoEmbed video={video} poster={(s.hero_image as string) || e.cover_image || null} title={`${e.name} video`} /></div>}
          {features.length > 0 && <ul className="pe3-minis">{features.slice(0, 4).map((f, i) => { const I = FEAT[f] ?? Sparkles; return <li key={f}><span><I size={20} aria-hidden /></span><p><b>{f}</b>{highlights[i] ? <small>{highlights[i]}</small> : null}</p></li>; })}</ul>}
          {photos[1] && on("gallery") && <a className="pe3-banner" href="#photos">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photos[1]} alt="" /><span><b>Event highlights</b><small>{photos.length} photos from the organiser</small></span></a>}</section>}
        {showTickets && <aside id="tickets" className="ce-card pe3-tickets"><div className="k-between"><h2>Get your tickets</h2><span className={`pe-sale ${sale[1]}`}><CheckCircle2 size={13} />{sale[0]}</span></div>
          <TicketPicker slug={e.slug!} tiers={tk} signedIn={!!user} eventId={e.id} launch={launch} sellerReady={sellerReady} waitlist={waitlist} /></aside>}
      </div>);
      const dates = <DatesSection key="dates" extras={x.extras} series={x.series} parent={x.parent} />; rows.push(dates);
      if (x.series || x.parent || x.extras.passes.length || x.extras.sub_events.length || x.extras.days.length > 1) tabs.push(["dates", "Dates"]);
      rows.push(<MerchSection key="merch" merch={x.merch} url={safeMerchUrl(s.merch_url)} />);
      continue;
    }
    if (b === "organiser" || b === "accessibility") {
      if (info) continue; info = true;
      const showOrg = on("organiser"), showAccess = on("accessibility");
      tabs.push(["info", "Info"]);
      rows.push(<div key="info" id="info" className={`pe3-three n${1 + Number(showOrg) + Number(showAccess)}`}>
        {showOrg && <section className="ce-card pe3-org"><h2>Organiser</h2>{o ? <><div className="pe3-org-row">{o.cover_image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={o.cover_image} alt="" /> : <span className="pe-org-av">{o.name.slice(0, 1)}</span>}<span className="k-grow"><b>{o.name}{o.verified && <i><BadgeCheck size={12} />Verified</i>}</b><small>Event organiser · {o.events_count} events</small></span>
            {e.workspace_id && <FollowButton kind="organizer" subject={e.workspace_id} label="Follow" initial={!!followRow} signedIn={!!user} next={`/events/${slugOrId}`} />}</div>
          {e.workspace_id && <Link className="k-link" href={`/organizers/${e.workspace_id}`}>View organiser profile <ArrowRight size={13} /></Link>}</> : <p className="k-small">Organiser details aren&apos;t public.</p>}</section>}
        <section className="ce-card pe3-details"><h2>Event details</h2><dl>
          <div><dt><CalendarDays size={16} aria-hidden />Date</dt><dd>{dateLine}<small>{t(e.starts_at)} – {t(e.ends_at)}</small></dd></div>
          <div><dt><Clock size={16} aria-hidden />Curfew</dt><dd>{(s.curfew as string) ? String(s.curfew) : "See venue"}</dd></div>
          <div><dt><MapPin size={16} aria-hidden />Location</dt><dd>{e.venue_name}<small>{e.location}</small></dd></div>
          <div><dt><Music2 size={16} aria-hidden />Event type</dt><dd>{eventTypeLabel(e.event_type)}</dd></div>
          <div><dt><ShieldAlert size={16} aria-hidden />Age restriction</dt><dd>{s.age_limit ? `${String(s.age_limit)}+ (ID required)` : "All ages"}</dd></div>
          <div><dt><Tag size={16} aria-hidden />Categories</dt><dd className="pe3-cats">{features.slice(0, 3).map(f => <span key={f}>{f}</span>)}</dd></div></dl></section>
        {/* Q26: the organiser's approved public accessibility facts first; the venue's published note otherwise. */}
        {showAccess && <section id="accessibility" className="ce-card pe3-access"><h2>Accessibility</h2>{x.extras.accessibility ? <AccessFacts a={x.extras.accessibility} />
            : <p className="pe3-access-lead"><Accessibility size={18} aria-hidden /><span>{venueAccess ?? "The organiser hasn’t published accessibility details yet. Ask them before you book."}</span></p>}
          {venueHref && <Link className="k-link" href={venueHref}>View venue accessibility <ArrowRight size={13} /></Link>}</section>}
      </div>);
      continue;
    }
    const node = sections[b]; if (!node) continue;
    rows.push(<div key={b} className="pe3-block" data-block={b}>{node}</div>);
    const tab = TAB[b]; if (tab) tabs.push(tab);
  }

  // Layout after the public event reference (PUB-239): full-bleed hero, section tabs, then the organiser's block order.
  return <div className="pe pe3">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    <RecordView itemKey={`event:${e.id}`} signedIn={!!user} />
    {preview && !["published", "on_sale", "live"].includes(e.status) && <div className="k-notice amber pe-previewbar">Preview — this page isn&apos;t public yet. Publish it from the page editor.</div>}
    <section className={`pe3-hero ov-${overlay}`} aria-labelledby="pe-title">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="pe3-hero-bg" src={(s.hero_image as string) || e.cover_image || "/assets/gd/hero-neon.webp"} alt="" />
      <EventActions eventId={e.id} name={e.name} saved={!!savedRow} signedIn={!!user} />
      <div className="pe3-hero-copy"><span className="pe3-type">{eventTypeLabel(e.event_type)}</span>
        <h1 id="pe-title">{(s.hero_title as string) || e.name}</h1>{(s.subtitle as string) ? <p>{String(s.subtitle)}</p> : null}
        <dl className="pe3-facts"><div><dt><CalendarDays size={22} aria-label="Date" /></dt><dd><b>{dateLine}</b><small>{d ? d.toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ }) : ""} {t(e.starts_at)} – {t(e.ends_at)}</small></dd></div>
          <div><dt><MapPin size={22} aria-label="Venue" /></dt><dd><b>{e.venue_name || e.city}</b><small>{e.city ? `${e.city}, UK` : e.location}</small></dd></div>
          <div><dt><Users size={22} aria-label="Attendance" /></dt><dd><b>{(Number(s.attendance) || e.capacity || 0).toLocaleString("en-GB")}+</b><small>Expected attendees</small></dd></div></dl>
        {(primary || secondaryHref || video) && <div className="pe3-ctas" data-testid="hero-ctas">
          {primary && (primary.href ? <a className="k-btn primary" href={primary.href}>{primary.label}</a> : <span className="k-btn primary" aria-disabled="true">{primary.label}</span>)}
          {secondaryHref && <a className="k-btn ghost-light" href={secondaryHref}>{cta.secondary?.trim() || (showLineup ? "View line-up" : "View schedule")}</a>}
          {video && (on("about") ? <a className="k-btn ghost-light" href="#video"><PlayCircle size={17} />Watch video</a> : <a className="k-btn ghost-light" href={watchUrl(video)} target="_blank" rel="noopener noreferrer nofollow"><PlayCircle size={17} />Watch video</a>)}</div>}</div>
      {on("gallery") && photos.length > 1 && <div className="pe3-thumbs">{photos.slice(1, 5).map((p, i) => <a key={p + i} href="#photos" className="pe3-th" aria-label={`View photo ${i + 2}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt="" /></a>)}{photos.length > 5 && <a href="#photos" className="pe3-th more" aria-label={`View all ${photos.length} photos`}>+{photos.length - 5}</a>}</div>}
    </section>
    <nav className="pe3-tabs" aria-label="Sections">{tabs.map(([id, l], i) => <a key={id} href={`#${id}`} className={i === 0 ? "on" : ""}>{l}</a>)}</nav>
    <BannerStrip banners={x.banners} />
    {rows}
    {relatedAds.length > 0 && <SponsoredRow items={relatedAds} title="Sponsored events" />}
  </div>;
}
