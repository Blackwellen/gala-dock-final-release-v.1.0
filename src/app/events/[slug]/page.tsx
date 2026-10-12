import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin, Users, ShieldAlert, Star, BadgeCheck, CheckCircle2, ArrowRight, Music2, Disc3, Utensils, Palette, Layers, Trees, Clock, Navigation, ChevronDown, Ticket, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MapView } from "@/components/kit/client";
import { EventActions, TicketPicker, RecordView } from "@/components/customer/public-event-client";
import { listingHref } from "@/lib/links";
import { eventTypeLabel } from "@/lib/format";

const TZ = "Europe/London";
const COLS = "id,name,slug,description,event_type,starts_at,ends_at,venue_name,location,city,cover_image,tags,settings,status,workspace_id,venue_listing_id,capacity";
/** Public read; `preview` lets signed-in workspace members see an unpublished page (RLS still decides what they can read). */
async function load(slug: string, preview = false) {
  const supabase = await createClient();
  if (preview) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { const { data: e } = await supabase.from("events").select(COLS).eq("slug", slug).not("workspace_id", "is", null).maybeSingle(); if (e) return { supabase, e, preview: true }; }
  }
  const { data: e } = await supabase.from("events").select(COLS).eq("slug", slug).eq("visibility", "public").in("status", ["published", "on_sale", "live"]).maybeSingle();
  return { supabase, e, preview: false };
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const { e } = await load(slug);
  return e ? { title: e.name, description: e.description?.slice(0, 160), openGraph: { title: e.name, description: e.description?.slice(0, 160), images: e.cover_image ? [e.cover_image] : [] } } : { title: "Event not found" };
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
  const vis = ((s.page_blocks as { visible?: Record<string, boolean> } | undefined)?.visible ?? {}); const on = (k: string) => vis[k] !== false;
  const [{ data: tiers }, { data: lineup }, { data: venue }, { data: org }, { data: related }, { data: { user } }] = await Promise.all([
    supabase.from("ticket_tiers").select("id,name,description,kind,price,quantity,sold,held,status,sale_end,badge,sort").eq("event_id", e.id).not("status", "in", "(draft,hidden)").order("sort"),
    supabase.from("programme_items").select("id,title,detail,area,starts_at,duration_minutes,image").eq("event_id", e.id).eq("kind", "programme").order("starts_at"),
    e.venue_listing_id ? supabase.from("listings").select("id,name,slug,kind,image,location,rating,review_count,capacity_max,tags,lat,lng,details").eq("id", e.venue_listing_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("public_organizer", { p_event: e.id }),
    supabase.from("events").select("id,name,slug,starts_at,city,cover_image,event_type").eq("visibility", "public").in("status", ["published", "on_sale", "live"]).neq("id", e.id).gte("starts_at", new Date().toISOString()).order("starts_at").limit(4),
    supabase.auth.getUser(),
  ]);
  const { data: savedRow } = user ? await supabase.from("saved_items").select("item_key").eq("user_id", user.id).eq("item_key", `event:${e.id}`).maybeSingle() : { data: null };
  const o = (org ?? [])[0] as { name: string; cover_image: string; verified: boolean; events_count: number; followers: number } | undefined;
  const d = e.starts_at ? new Date(e.starts_at) : null;
  const dayStr = d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "Date TBC";
  const t = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }) : "";
  const tk = (tiers ?? []).map(x => ({ id: x.id, name: x.name, sub: x.description || (x.kind === "vip" ? "Fast entry • VIP area" : x.kind === "group" ? "Per person" : "General admission"), price: Number(x.price), left: Math.max(0, x.quantity - x.sold - x.held), qty: x.quantity, status: x.status, badge: x.badge }));
  const sold = (tiers ?? []).reduce((a, x) => a + x.sold, 0);
  const onSale = tk.some(x => x.status === "on_sale" && x.left > 0);
  const gallery = ((s.gallery as string[] | undefined) ?? []).filter(Boolean);
  const photos = [e.cover_image, ...gallery].filter(Boolean) as string[];
  const faqs = (s.faqs as { q: string; a: string }[] | undefined) ?? [];
  const highlights = (s.highlights as string[] | undefined) ?? [];
  const features = (s.features as string[] | undefined) ?? e.tags ?? [];
  const rating = s.rating ? Number(s.rating) : null; const reviews = s.reviews ? Number(s.reviews) : null;
  const pins = venue?.lat && venue?.lng ? [{ id: venue.id, lat: venue.lat, lng: venue.lng, label: venue.name }] : [];
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.venue_name, e.location].filter(Boolean).join(", "))}`;
  const ld = { "@context": "https://schema.org", "@type": "Event", name: e.name, startDate: e.starts_at, endDate: e.ends_at, eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", location: { "@type": "Place", name: e.venue_name, address: e.location }, image: photos.slice(0, 3), description: e.description, offers: tk.map(x => ({ "@type": "Offer", name: x.name, price: x.price, priceCurrency: "GBP", availability: x.left > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut" })), organizer: o ? { "@type": "Organization", name: o.name } : undefined };

  // §50 launch state (server-computed): drives the badge and whether checkout is offered.
  const { data: launchRaw } = e ? await supabase.rpc("event_launch_state" as never, { p_event: e.id } as never) : { data: null };
  const launch = (launchRaw as string | null) ?? null;
  return <div className="pe">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    <RecordView itemKey={`event:${e.id}`} signedIn={!!user} />
    {preview && !["published", "on_sale", "live"].includes(e.status) && <div className="k-notice amber pe-previewbar">Preview — this page isn&apos;t public yet. Publish it from the page editor.</div>}
    <nav className="pe-crumbs" aria-label="Breadcrumb"><Link href="/discover">Discover</Link><span>/</span><Link href="/discover?tab=events&results=1">Events</Link><span>/</span><span aria-current="page">{e.name}</span></nav>
    <div className="pe-grid">
      <div className="pe-main">
        <section className="ce-card pe-head">
          <div className="pe-hero">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={(s.hero_image as string) || e.cover_image || "/assets/gd/hero-neon.webp"} alt="" />{s.badge ? <span className="pe-feat">{String(s.badge) === "Trending" ? "Featured Event" : String(s.badge)}</span> : null}
            <EventActions eventId={e.id} name={e.name} saved={!!savedRow} signedIn={!!user} />
            <div className="pe-strip">{photos.slice(1, 6).map((p, i) => <a key={p + i} href="#gallery" className="pe-th" aria-label={`View photo ${i + 2}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt="" />{i === 4 && photos.length > 6 && <b>+{photos.length - 6} photos</b>}</a>)}</div></div>
          <div className="pe-title">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="pe-poster" src={(s.poster as string) || e.cover_image || "/assets/gd/oe-neon.webp"} alt="" />
            <div className="k-grow"><h1>{(s.hero_title as string) || e.name}</h1><div className="pe-chips"><span className="p"><Music2 size={13} />{eventTypeLabel(e.event_type)}</span>{o?.verified && <span className="b"><BadgeCheck size={13} />Verified Event</span>}{rating && rating >= 4.7 && <span className="a"><Star size={13} />Top Rated</span>}</div>
              {rating && <p className="pe-rate"><Star size={15} fill="#f59e0b" color="#f59e0b" /><b>{rating.toFixed(1)}</b>{reviews && <span>({reviews.toLocaleString("en-GB")} reviews)</span>}</p>}</div>
            <p className="pe-blurb">{(s.subtitle as string) || e.description}</p></div>
          <dl className="pe-facts"><div><dt><CalendarDays size={22} /></dt><dd><b>{dayStr}</b><small>{d ? d.toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ }) : ""}, {t(e.starts_at)} – {t(e.ends_at)}</small></dd></div>
            <div><dt><MapPin size={22} /></dt><dd><b>{e.venue_name || e.city}</b><small>{e.location}</small></dd></div>
            <div><dt><Users size={22} /></dt><dd><b>{(Number(s.attendance) || e.capacity || 0).toLocaleString("en-GB")}+</b><small>Expected attendance</small></dd></div>
            {s.age_limit ? <div><dt><ShieldAlert size={22} /></dt><dd><b>{String(s.age_limit)}+</b><small>Age requirement</small></dd></div> : null}</dl>
          {features.length > 0 && <div className="pe-feats">{features.slice(0, 6).map(f => { const I = FEAT[f] ?? Sparkles; return <span key={f}><I size={14} />{f}</span>; })}</div>}
        </section>
        <nav className="pe-tabs" aria-label="Sections">{[["about", "Overview"], ["lineup", "Lineup"], ["venue", "Venue"], ["tickets", "Tickets"], ["gallery", "Gallery"], ["faqs", "FAQs"], ["related", "Related Events"]].map(([id, l], i) => <a key={id} href={`#${id}`} className={i === 0 ? "on" : ""}>{l}</a>)}</nav>
        <div className="pe-two">
          <section id="about" className="ce-card pe-about"><h2>About This Event</h2><p>{e.description}</p>{highlights.length > 0 && <ul>{highlights.map(h => <li key={h}><CheckCircle2 size={17} />{h}</li>)}</ul>}</section>
          {on("performers") && <section id="lineup" className="ce-card pe-lineup"><div className="k-between"><h2>Lineup Highlights</h2><a className="k-link" href="#schedule">Full schedule <ArrowRight size={14} /></a></div>
            <div className="pe-artists">{(lineup ?? []).filter(l => l.image).slice(0, 4).map(l => <article key={l.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image} alt="" /><b>{l.title}</b><span className="pe-role">{l.area || "Live"}</span><small><Clock size={12} />{t(l.starts_at)} – {t(l.starts_at && l.duration_minutes ? new Date(new Date(l.starts_at).getTime() + l.duration_minutes * 6e4).toISOString() : null)}</small></article>)}</div>
            {(lineup ?? []).length > 0 && <details id="schedule" className="pe-sched"><summary>Full schedule <ChevronDown size={14} /></summary><ol>{(lineup ?? []).map(l => <li key={l.id}><time>{t(l.starts_at)}</time><b>{l.title}</b><small>{l.area}</small></li>)}</ol></details>}</section>}
        </div>
        <div className="pe-three">
          {on("venue") && <section id="venue" className="ce-card pe-venue"><div className="k-between"><h2>Venue Details</h2>{venue && <Link className="k-link" href={listingHref(venue.kind, venue.slug, venue.id)}>View venue <ArrowRight size={14} /></Link>}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={venue?.image || e.cover_image || "/assets/gd/hero-neon.webp"} alt="" />
            <div className="k-between"><b>{venue?.name ?? e.venue_name}</b>{venue && <span className="pe-vr"><Star size={13} fill="#f59e0b" color="#f59e0b" />{Number(venue.rating).toFixed(1)} <small>({venue.review_count} reviews)</small></span>}</div>
            <small className="pe-vsub">{[e.city, venue?.capacity_max ? `${venue.capacity_max.toLocaleString("en-GB")} capacity` : null].filter(Boolean).join(" • ")}</small>
            <div className="pe-vtags">{(venue?.tags ?? []).slice(0, 6).map(tg => <span key={tg}>{tg}</span>)}</div></section>}
          <section className="ce-card pe-map"><h2>Location &amp; Map</h2>{pins.length ? <MapView pins={pins} center={pins[0]} zoom={13} height={150} mapKey={process.env.MAP_TILER_API_KEY ?? ""} ariaLabel={`Map of ${e.venue_name}`} /> : <div className="pe-nomap">{e.location}</div>}
            <a className="k-btn outline pe-dir" href={maps} target="_blank" rel="noopener noreferrer"><Navigation size={15} />Get directions</a></section>
          {on("gallery") && <section id="gallery" className="ce-card pe-gal"><h2>Event Gallery</h2><div className="pe-gal-g">{photos.slice(0, 6).map((p, i) => <span key={p + i}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt="" />{i === 5 && photos.length > 6 && <b>+{photos.length - 6} more</b>}</span>)}</div></section>}
        </div>
        {on("faqs") && faqs.length > 0 && <section id="faqs" className="ce-card pe-faqs"><h2>Frequently Asked Questions</h2><div className="pe-faq-g">{faqs.map(f => <details key={f.q}><summary>{f.q}<ChevronDown size={15} /></summary><p>{f.a}</p></details>)}</div></section>}
        {on("related") && (related ?? []).length > 0 && <section id="related" className="ce-card pe-related"><div className="k-between"><h2>Related Events</h2><Link className="k-link" href="/discover?tab=events&results=1">More events <ArrowRight size={14} /></Link></div>
          <div className="pe-rel-g">{(related ?? []).map(r => <Link key={r.id} href={r.slug ? `/events/${r.slug}` : "#"}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={r.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><span><b>{r.name}</b><small>{eventTypeLabel(r.event_type)} • {r.starts_at ? new Date(r.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ }) : ""} • {r.city}</small></span></Link>)}</div></section>}
      </div>
      <aside className="pe-side">
        <section id="tickets" className="ce-card pe-tickets"><div className="k-between"><h2>Get Tickets</h2><span className={`pe-sale ${launch ? (LAUNCH[launch]?.[1] ?? "off") : onSale ? "" : "off"}`}><CheckCircle2 size={13} />{launch ? LAUNCH[launch]?.[0] ?? launch : onSale ? "On Sale Now" : tk.length ? "Sold out" : "Coming soon"}</span></div>
          <TicketPicker slug={e.slug!} tiers={tk} signedIn={!!user} eventId={e.id} launch={launch} waitlist={((e.settings ?? {}) as Record<string, unknown>).waiting_list === true || (((e.settings ?? {}) as { ticket_pro?: { sales?: { waiting_list?: boolean } } }).ticket_pro?.sales?.waiting_list === true)} /></section>
        <div className="pe-stats"><div><Users size={24} /><span><b>{(Number(s.attendance) || 0).toLocaleString("en-GB")}+</b><small>Expected attendance</small></span></div><div><Ticket size={24} /><span><b>{sold >= 1000 ? `${(sold / 1000).toFixed(1)}K` : sold}</b><small>Tickets sold</small></span></div></div>
        {s.resale !== false && <Link href={user ? "/account/tickets" : "/login?next=/account/tickets"} className="ce-card pe-resale"><span className="pe-resale-ic"><Ticket size={22} /></span><span className="k-grow"><b>Resale &amp; Transfer</b><small>Can&apos;t make it? Resell or transfer your tickets safely through Gala Dock.</small></span><ArrowRight size={16} /></Link>}
        {o && <section className="ce-card pe-org"><div className="k-between"><h2>Event Promoter</h2>{e.workspace_id && <Link className="k-link" href={`/organizers/${e.workspace_id}`}>View profile <ArrowRight size={13} /></Link>}</div>
          <div className="pe-org-row">{/* eslint-disable-next-line @next/next/no-img-element */}{o.cover_image ? <img src={o.cover_image} alt="" /> : <span className="pe-org-av">{o.name.slice(0, 1)}</span>}<span className="k-grow"><b>{o.name} {o.verified && <i><BadgeCheck size={12} />Verified</i>}</b>{rating && <small><Star size={13} fill="#f59e0b" color="#f59e0b" />{rating.toFixed(1)}</small>}</span></div>
          <dl className="pe-org-stats"><div><dt>{o.events_count}</dt><dd>Events</dd></div><div><dt>{o.followers.toLocaleString("en-GB")}</dt><dd>Saves</dd></div><div><dt>{rating?.toFixed(1) ?? "—"}</dt><dd>Avg rating</dd></div></dl></section>}
        <section className="ce-card pe-help"><h2>Good to know</h2><ul><li><CheckCircle2 size={15} />Secure checkout and instant confirmation</li><li><CheckCircle2 size={15} />Mobile tickets with a QR code</li>{s.transfers !== false && <li><CheckCircle2 size={15} />Free transfers to friends</li>}{s.age_limit ? <li><ShieldAlert size={15} />{String(s.age_limit)}+ — bring photo ID</li> : null}</ul></section>
      </aside>
    </div>
  </div>;
}
