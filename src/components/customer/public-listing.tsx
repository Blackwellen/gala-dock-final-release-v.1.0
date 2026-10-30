import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, BadgeCheck, MapPin, Users, Home, Tag, Clock, Award, Calendar, CheckCircle2, ChevronRight, ArrowRight, Utensils, Car, Accessibility, Layers, Camera, ShieldCheck, Leaf, Scaling, Salad, Package2, Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MapView } from "@/components/kit/client";
import { ListingActions, PlanWithListing, RecordView } from "./public-listing-client";
import { ListingAvailability } from "@/components/public/listing-availability";
import { PublicPlan, planHasContent } from "@/components/venue-plan/public-plan";
import type { MapEl } from "@/app/provider/venues/_components/venue-map";
import { untyped } from "@/lib/workspace/db";
import { SpaceCard, ListingMenus, ListingBars, type PublicBar, ListingGalleries, ListingBanner, VenueGoodToKnow, ServiceDetailsSection, venueFacts, coverageLine, type PublicSpace, type PublicMenu, type PublicMenuSection, type PublicMenuItem, type PublicGallery, type ServiceDetails } from "./public-listing-extras";

type Kind = "venue" | "service";
const money = (n: number | null | undefined) => n == null ? "On request" : `£${Number(n).toLocaleString("en-GB")}`;
const COLS = "id,name,slug,kind,category,description,location,city,image,gallery,price_from,price_unit,capacity_min,capacity_max,rating,review_count,response_hours,verified,instant_book,booking_mode,badge,tags,lat,lng,details,workspace_id";

export async function loadListing(kind: Kind, slug: string) {
  const supabase = await createClient();
  const q = supabase.from("listings").select(COLS).eq("kind", kind).eq("published", true);
  const { data } = await (/^[0-9a-f-]{36}$/i.test(slug) ? q.eq("id", slug) : q.eq("slug", slug)).maybeSingle();
  return { supabase, l: data };
}

export async function PublicListing({ kind, slug }: { kind: Kind; slug: string }) {
  const { supabase, l } = await loadListing(kind, slug);
  if (!l) notFound();
  const d = (l.details ?? {}) as Record<string, unknown>;
  const [{ data: spaces }, { data: pkgs }, { data: revs }, { data: { user } }, { data: similar }] = await Promise.all([
    kind === "venue" ? supabase.from("spaces").select("id,name,indoor,capacity_seated,capacity_standing,image,details,area_sqm,layouts,amenities").eq("venue_id", l.id).eq("status", "published").order("capacity_seated", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("packages").select("id,name,description,base_price,price_basis,min_guests,max_guests,image,inclusions,details,booking_mode").eq("listing_id", l.id).eq("status", "published").order("base_price"),
    supabase.from("reviews").select("id,rating,ratings,body,created_at").eq("listing_id", l.id).eq("status", "published").order("created_at", { ascending: false }).limit(6),
    supabase.auth.getUser(),
    supabase.from("listings").select("id,name,slug,kind,image,rating,review_count,price_from,price_unit,location").eq("kind", kind).eq("published", true).eq("category", l.category).neq("id", l.id).order("rating", { ascending: false }).limit(4),
  ]);
  const [{ data: myEvents }, { data: savedRow }] = user ? await Promise.all([
    supabase.from("events").select("id,name,starts_at,guest_count,event_type").eq("owner_id", user.id).eq("management", "consumer").in("status", ["draft", "planning", "ready"]).order("starts_at"),
    supabase.from("saved_items").select("item_key").eq("user_id", user.id).eq("item_key", `listing:${l.id}`).maybeSingle(),
  ]) : [{ data: [] }, { data: null }];
  // W01 Part 2: what providers publish beyond the listing row — floor plan (published venue_structures), menus (published, attached to
  // this listing; a venue also shows menus of its own provider's published catering listings), public media galleries + banner, trust badge.
  const db = untyped(supabase);
  const wsId = (l as { workspace_id?: string | null }).workspace_id ?? null;
  const isCatering = kind === "service" && /cater|food|drink|bar/i.test(l.category ?? "");
  const [{ data: structure }, { data: siblings }, { data: gals }, { data: banners }, { data: trust }] = await Promise.all([
    kind === "venue" ? db.from("venue_structures").select("elements").eq("venue_id", l.id).eq("status", "published").order("version", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    kind === "venue" && wsId ? db.from("listings").select("id,name,slug,kind,category").eq("workspace_id", wsId).eq("kind", "service").eq("published", true).neq("id", l.id) : Promise.resolve({ data: [] }),
    db.from("media_galleries").select("id,title,listing_id,event_id").eq("visibility", "public").eq("status", "published").or(wsId ? `listing_id.eq.${l.id},and(workspace_id.eq.${wsId},listing_id.is.null,event_id.is.null)` : `listing_id.eq.${l.id}`).order("updated_at", { ascending: false }).limit(4),
    db.from("media_assets").select("url,alt_text,title,kind,format").eq("listing_id", l.id).eq("usage_scope", "public").in("status", ["approved", "published"]).or("kind.eq.banner,format.in.(banner,wide)").order("updated_at", { ascending: false }).limit(1),
    supabase.rpc("listing_trust" as never, { p_listing: l.id } as never),
  ]);
  const caterers = ((siblings ?? []) as { id: string; name: string; slug: string | null; kind: string; category: string }[]).filter(x => /cater|food|drink|bar/i.test(x.category ?? ""));
  const menuListings = kind === "venue" || isCatering ? [l.id, ...caterers.map(x => x.id)] : [];
  const { data: menuRows } = menuListings.length ? await db.from("menus").select("id,name,kind,description,serving_style,pricing,price,min_guests,max_guests,final_numbers_days,listing_id").eq("status", "published").in("listing_id", menuListings).order("name") : { data: [] };
  const { data: barRows } = menuListings.length ? await db.from("bar_packages").select("id,name,model,description,per_person,price,min_spend,token_price,corkage_per_bottle,hours_from,hours_to,licensing,listing_id").eq("status", "published").in("listing_id", menuListings).order("name") : { data: [] };
  const menuIds = ((menuRows ?? []) as { id: string }[]).map(m => m.id);
  const galIds = ((gals ?? []) as { id: string }[]).map(g => g.id);
  const [{ data: secRows }, { data: itemRows }, { data: galItems }] = await Promise.all([
    menuIds.length ? db.from("menu_sections").select("id,menu_id,name,sort").in("menu_id", menuIds) : Promise.resolve({ data: [] }),
    menuIds.length ? db.from("menu_items").select("id,menu_id,section_id,name,description,price,unit,dietary,allergens,allergen_status,course,sort,available").in("menu_id", menuIds) : Promise.resolve({ data: [] }),
    galIds.length ? db.from("media_gallery_items").select("gallery_id,sort,caption,asset:media_assets(url,alt_text,title)").in("gallery_id", galIds).order("sort") : Promise.resolve({ data: [] }),
  ]);
  const byListing = new Map<string, { name: string; href: string }>([[l.id, { name: l.name, href: `/${kind === "venue" ? "venues" : "services"}/${l.slug ?? l.id}` }], ...caterers.map(c => [c.id, { name: c.name, href: `/services/${c.slug ?? c.id}` }] as [string, { name: string; href: string }])]);
  const menus: PublicMenu[] = ((menuRows ?? []) as (Omit<PublicMenu, "listing"> & { listing_id: string })[]).map(m => ({ ...m, price: m.price == null ? null : Number(m.price), listing: byListing.get(m.listing_id) ?? null }));
  const num = (v: unknown) => v == null ? null : Number(v);
  const bars: PublicBar[] = ((barRows ?? []) as { id: string; name: string; model: string; description: string | null; per_person: unknown; price: unknown; min_spend: unknown; token_price: unknown; corkage_per_bottle: unknown; hours_from: string | null; hours_to: string | null; licensing: { min_age?: number } | null; listing_id: string }[])
    .map(b => ({ id: b.id, name: b.name, model: b.model, description: b.description, per_person: num(b.per_person), price: num(b.price), min_spend: num(b.min_spend), token_price: num(b.token_price), corkage_per_bottle: num(b.corkage_per_bottle), hours_from: b.hours_from, hours_to: b.hours_to, min_age: b.licensing?.min_age ?? null, listing: byListing.get(b.listing_id) ?? null }));
  type Asset = { url: string; alt_text: string | null; title: string | null };
  const galleries: PublicGallery[] = ((gals ?? []) as { id: string; title: string }[]).map(g => ({ id: g.id, title: g.title || "Gallery",
    items: ((galItems ?? []) as unknown as { gallery_id: string; caption: string | null; asset: Asset | Asset[] | null }[]).map(i => ({ ...i, asset: Array.isArray(i.asset) ? i.asset[0] ?? null : i.asset }))
      .filter(i => i.gallery_id === g.id && i.asset?.url).map(i => ({ url: i.asset!.url, alt: i.asset!.alt_text || i.asset!.title || g.title || `${l.name} photo`, caption: i.caption })) }));
  const banner = ((banners ?? []) as { url: string; alt_text: string | null; title: string | null }[]).map(b => ({ url: b.url, alt: b.alt_text, title: b.title }))[0] ?? null;
  const plan = ((structure as { elements?: MapEl[] } | null)?.elements ?? []) as MapEl[];
  const hasPlan = kind === "venue" && Array.isArray(plan) && planHasContent(plan);
  const verifiedBadge = !!(trust as { badge?: boolean } | null)?.badge;
  const svc = ((d.service ?? {}) as ServiceDetails);
  const showPrice = kind === "venue" || svc.pricing?.show_price !== false;
  const vf = venueFacts(d as never);
  // Called directly (plain server render functions) so the tab bar knows whether the section exists.
  const details = kind === "venue" ? VenueGoodToKnow({ d: d as never }) : ServiceDetailsSection({ s: svc });
  const photos = [l.image, ...(l.gallery ?? [])].filter(Boolean) as string[];
  const amenities = ((d.amenities as string[] | undefined) ?? (vf.features.length ? vf.features : l.tags) ?? []);
  const policies = (d.policies ?? {}) as Record<string, string>;
  const highlights = (d.highlights as { t: string; d: string }[] | undefined) ?? [];
  const sig = d.signature as { kicker: string; title: string; body: string; image: string } | undefined;
  const tiers = (d.price_tiers as { l: string; p: number }[] | undefined) ?? [];
  const cat = kind === "venue" ? "venue" : (l.category.toLowerCase().includes("cater") ? "food" : "extras");
  const href = `/${kind === "venue" ? "venues" : "services"}/${l.slug ?? l.id}`;
  const pins = l.lat && l.lng ? [{ id: l.id, lat: l.lat, lng: l.lng, label: l.name }] : [];
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name}, ${l.location}`)}`;
  // Facts show only what the provider entered (legacy flat keys first, then the editor's nested ones); nothing is invented.
  type Fact = readonly [typeof Users, string, string];
  const pick = (...v: unknown[]) => v.map(x => typeof x === "string" && x.trim() ? x.trim() : null).find(Boolean) ?? null;
  const nSpaces = (spaces ?? []).length || Number(d.spaces) || 0;
  const facts: Fact[] = kind === "venue" ? ([
    l.capacity_max ? [Users, l.capacity_max.toLocaleString("en-GB"), "Max capacity"] : null,
    nSpaces ? [Layers, `${nSpaces} event space${nSpaces === 1 ? "" : "s"}`, (spaces ?? []).some(s => !s.indoor) && (spaces ?? []).some(s => s.indoor) ? "Indoor & outdoor" : "Bookable spaces"] : null,
    pick(d.setting) ? [Home, String(d.setting), "Setting"] : null,
    pick(d.catering, vf.catering) ? [Utensils, "Catering", pick(d.catering, vf.catering)!] : null,
    pick(d.parking, vf.parking) ? [Car, "Parking", pick(d.parking, vf.parking)!] : null,
    pick(d.accessible, vf.accessibility) ? [Accessibility, "Accessibility", pick(d.accessible, vf.accessibility)!] : null,
  ].filter(Boolean) as unknown as Fact[]) : [];
  const cover = pick(d.coverage, coverageLine(svc.coverage));
  const stats: Fact[] = kind === "service" ? ([
    [MapPin, l.location, cover ?? "Based here"], [Tag, l.category, "Primary category"],
    pick(d.team, svc.team) ? [Users, pick(d.team, svc.team)!, "Event team"] : null,
    [Clock, `< ${l.response_hours ?? 24} hours`, "Response commitment"],
  ].filter(Boolean) as unknown as Fact[]) : [];
  const ld = { "@context": "https://schema.org", "@type": kind === "venue" ? "EventVenue" : "LocalBusiness", name: l.name, description: l.description, image: photos.slice(0, 3), address: l.location, aggregateRating: l.review_count ? { "@type": "AggregateRating", ratingValue: Number(l.rating), reviewCount: l.review_count } : undefined, priceRange: l.price_from ? `From £${l.price_from}` : undefined };
  const HL = [Award, Leaf, Scaling, Salad, Package2];

  const { data: upcoming } = kind === "venue" ? await supabase.from("events_public").select("id,name,slug,starts_at,cover_image,event_type").eq("venue_listing_id", l.id).eq("visibility", "public").in("status", ["published", "on_sale", "live"]).gte("starts_at", new Date().toISOString()).order("starts_at").limit(4) : { data: [] };
  const chips = (l.tags ?? []).slice(0, 5) as string[];
  const shownFacts = kind === "venue" ? facts.slice(0, 5) : stats;
  // Layout after the public profile references (PUB-240 venue / PUB-238 service): full-bleed hero with photo mosaic, section tabs,
  // About + booking card, full-width spaces / packages / events / photos / reviews / location rows, similar, footer.
  return <div className="pl pl3">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    <RecordView itemKey={`listing:${l.id}`} signedIn={!!user} />
    <section className="pl3-hero" aria-labelledby="pl-title">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="pl3-hero-bg" src={photos[0] ?? "/assets/gd/v-riverside-park.webp"} alt="" />
      <ListingActions listingId={l.id} name={l.name} saved={!!savedRow} signedIn={!!user} />
      <div className="pl3-hero-copy">{l.verified || verifiedBadge ? <span className="pl3-type"><BadgeCheck size={13} />{kind === "venue" ? "Verified venue" : `Verified · ${l.category}`}</span> : <span className="pl3-type">{l.category}</span>}
        <h1 id="pl-title">{l.name}</h1><p>{String(d.tagline ?? "") || l.description?.split(". ")[0]}</p>
        <div className="pl3-meta"><span><MapPin size={16} />{l.location}</span>{l.review_count > 0 && <span><Star size={16} fill="#f59e0b" color="#f59e0b" />{Number(l.rating).toFixed(1)} ({l.review_count} reviews)</span>}{kind === "venue" ? (l.capacity_max ? <span><Users size={16} />{l.capacity_max.toLocaleString("en-GB")} capacity</span> : null) : cover ? <span><Compass size={16} />{cover}</span> : null}{showPrice && l.price_from ? <span><Tag size={16} />From {money(l.price_from)}{l.price_unit ? ` ${l.price_unit}` : ""}</span> : <span><Tag size={16} />Price on request</span>}</div>
        {chips.length > 0 && <div className="pl3-chips">{chips.map(c => <span key={c}>{c}</span>)}</div>}</div>
      {photos.length > 1 && <div className="pl3-mosaic">{photos.slice(1, 4).map((p, i) => <a key={p + i} href="#photos" className={`pl3-m${i}`} aria-label={`View photo ${i + 2}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt="" /></a>)}
        <a href="#photos" className="pl3-m3" aria-label={`View all ${photos.length} photos`}><Camera size={16} /><b>{photos.length}</b><small>View all photos</small></a></div>}
    </section>
    <nav className="pe3-tabs pl3-tabs" aria-label="Sections">{(kind === "venue"
      ? [["about", "Overview", true], ["spaces", "Spaces", (spaces ?? []).length > 0], ["floorplan", "Floor plan", hasPlan], ["packages", "Packages", (pkgs ?? []).length > 0], ["menus", "Menus", menus.length > 0], ["bars", "Bar", bars.length > 0], ["details", "Good to know", !!details], ["events", "Events", (upcoming ?? []).length > 0], ["photos", "Photos", true], ["reviews", "Reviews", true], ["location", "Location", true], ["similar", "Similar venues", (similar ?? []).length > 0]]
      : [["about", "Overview", true], ["packages", "Packages", (pkgs ?? []).length > 0], ["menus", "Menus", menus.length > 0], ["bars", "Bar", bars.length > 0], ["details", "Details", !!details], ["photos", "Gallery", true], ["reviews", "Reviews", true], ["location", "Coverage", true], ["similar", "Similar", (similar ?? []).length > 0]]
    ).filter(([, , show]) => show).map(([id, lbl], i) => <a key={String(id)} href={`#${id}`} className={i === 0 ? "on" : ""}>{lbl}</a>)}</nav>
    <ListingBanner banner={banner} name={l.name} />
    <div className="pl3-top">
      <section id="about" className="ce-card pl3-about"><h2>About {l.name}</h2><p>{l.description}</p>
        {shownFacts.length > 0 && <ul className="pl3-facts">{shownFacts.map(([I, b, s2]) => <li key={String(s2) + b}><span><I size={20} aria-hidden /></span><p><b>{b}</b><small>{s2}</small></p></li>)}</ul>}
        {/* eslint-disable-next-line @next/next/no-img-element */}<a href="#photos" className="pl3-feature"><img src={(sig?.image) || photos[1] || photos[0] || "/assets/gd/v-riverside-park.webp"} alt="" /><span><b>{sig?.title ?? `Inside ${l.name}`}</b><small>{photos.length} photos</small></span></a>
        {photos.length > 2 && <div className="pl3-thumbs">{photos.slice(2, 7).map((p, i) => <a key={p + i} href="#photos" aria-label={`View photo ${i + 3}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt="" /></a>)}</div>}</section>
      <aside className="pl3-side">
        <section id="book" className="ce-card pl-book pl3-book"><div className="k-between"><h2>{kind === "venue" ? "Check availability" : "Book or request a quote"}</h2><span className="pe-sale"><CheckCircle2 size={13} />Responds within {l.response_hours ?? 24}h</span></div>
          <PlanWithListing listing={{ id: l.id, name: l.name, category: cat, kind, capacity: l.capacity_max, workspaceId: (l as { workspace_id?: string }).workspace_id ?? null }} events={(myEvents ?? []).map(e => ({ id: e.id, name: e.name, guests: e.guest_count }))} signedIn={!!user} next={href} />
          <ul className="pl3-trust"><li><CheckCircle2 size={14} />Free enquiry — no payment at this stage</li><li><CheckCircle2 size={14} />Typically responds in {l.response_hours ?? 24} hours</li><li><CheckCircle2 size={14} />{l.instant_book ? "Instant book or custom quote" : "Custom quote for your event"}</li></ul></section>
        {kind === "service" && showPrice && tiers.length > 0 && <section className="ce-card pl-est"><div className="k-between"><h2>Price estimate</h2><span><small>From </small><b>{money(tiers[0]!.p)}</b><small> per guest</small></span></div>
          <div className="pl-tiers">{tiers.map((t, i) => <span key={t.l} className={i === 0 ? "on" : ""}><i /><b>{money(t.p)}{i === tiers.length - 1 ? "+" : ""}</b><small>{t.l}</small></span>)}</div></section>}
        <section className="ce-card pl-agent"><div className="k-row" style={{ gap: 8 }}><Compass size={20} className="pw-spark" /><b>Plan with this {kind === "venue" ? "venue" : "supplier"}</b></div>
          {[[`Is ${l.name} available for my dates?`, user ? (myEvents?.length ? "#book" : "/plan") : `/login?next=${href}`], [`Compare with similar ${kind === "venue" ? "venues" : "suppliers"}`, (similar ?? []).length > 0 ? "#similar" : `/discover?tab=${kind === "venue" ? "venues" : "services"}&results=1`], ["Plan an event around it", "/plan"]].map(([t, h]) => <Link key={t} href={h} className="pl-ask">{t}<ArrowRight size={14} /></Link>)}</section>
      </aside>
    </div>
    <ListingAvailability listingId={l.id} kind={kind} name={l.name} />
    {kind === "venue" && (spaces ?? []).length > 0 && <section id="spaces" className="pl3-row"><div className="k-between"><h2>Venue spaces</h2><span className="k-small">{(spaces ?? []).length} space{(spaces ?? []).length === 1 ? "" : "s"}</span></div>
      <div className="pl3-g4">{((spaces ?? []) as PublicSpace[]).slice(0, 8).map(s => <SpaceCard key={s.id} s={s} fallback={photos[0]} />)}</div></section>}
    {hasPlan && <PublicPlan id="floorplan" title="Floor plan" intro="The venue's published layout: spaces, capacities, entrances, step-free routes and facilities. Each event can add its own layout on top."
      label={`${l.name} floor plan`} base={plan} overlay={[]} spaces={(spaces ?? []).map(s => ({ id: s.id, name: s.name, capacity: Math.max(s.capacity_standing ?? 0, s.capacity_seated ?? 0), indoor: s.indoor }))} />}
    {(pkgs ?? []).length > 0 && <div id="packages" className={`pl3-pkrow ${kind === "service" && highlights.length > 0 ? "with-why" : ""}`}><section className="pl3-row"><div className="k-between"><h2>{kind === "venue" ? "Event packages" : "Our service packages"}</h2></div>
      <div className="pl3-g3">{(pkgs ?? []).slice(0, 3).map(p => { const badge = (p.details as { badge?: string } | null)?.badge; const unit = p.price_basis === "per_person" ? (kind === "venue" ? "person" : "guest") : p.price_basis === "hourly" ? "hour" : "day";
        return <article key={p.id} className={`ce-card pl3-pk ${kind}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.image || photos[(pkgs ?? []).indexOf(p) + 1] || photos[0]} alt="" />{badge && <i className="pl3-pk-tag">{badge}</i>}
          <div><b>{p.name}</b><p>{p.description}</p>{Array.isArray(p.inclusions) && <ul>{(p.inclusions as string[]).slice(0, 4).map(x => <li key={x}><CheckCircle2 size={13} />{x}</li>)}</ul>}
            {showPrice ? <strong>From {money(Number(p.base_price))} <small>/ {unit}</small></strong> : <strong>Price on request</strong>}
            {kind === "service" && <div className="pl-pk-acts"><PlanWithListing compact listing={{ id: l.id, name: l.name, category: cat, kind }} events={(myEvents ?? []).map(e => ({ id: e.id, name: e.name }))} signedIn={!!user} next={href} /></div>}</div></article>; })}</div></section>
      {kind === "service" && highlights.length > 0 && <aside className="ce-card pl3-why"><h2>Why choose us?</h2><ul>{highlights.map((h, i) => { const I = HL[i % HL.length]!; return <li key={h.t}><span className={`pl-hi c${i % 5}`}><I size={17} /></span><span><b>{h.t}</b><small>{h.d}</small></span></li>; })}</ul></aside>}</div>}
    <ListingMenus menus={menus} sections={(secRows ?? []) as PublicMenuSection[]} items={((itemRows ?? []) as PublicMenuItem[]).map(x => ({ ...x, price: x.price == null ? null : Number(x.price) }))} own={l.name} />
    <ListingBars bars={bars} own={l.name} />
    {details}
    {kind === "venue" && (upcoming ?? []).length > 0 && <section id="events" className="pl3-row"><div className="k-between"><h2>Upcoming events at this venue</h2><Link className="k-link" href={l.city ? `/events/in/${encodeURIComponent(String(l.city).toLowerCase())}` : "/events"}>View all events <ArrowRight size={14} /></Link></div>
      <div className="pl3-g4">{(upcoming ?? []).map(ev => { const dt = ev.starts_at ? new Date(ev.starts_at) : null; return <Link key={ev.id} href={`/events/${ev.slug ?? ev.id}`} className="ce-card pl3-ev">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={ev.cover_image || "/assets/gd/oe-neon.webp"} alt="" />{dt && <span className="pl3-date"><small>{dt.toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" })}</small><b>{dt.toLocaleDateString("en-GB", { day: "2-digit", timeZone: "Europe/London" })}</b></span>}<b>{ev.name}</b><small>{dt ? dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "Date TBC"}</small></Link>; })}</div></section>}
    <section id="photos" className="pl3-row"><div className="k-between"><h2>{kind === "venue" ? "Photos" : "Recent events"}</h2><span className="k-small"><Camera size={13} /> {photos.length} photos</span></div>
      <div className="pe3-photos-g">{photos.slice(0, 6).map((p, i) => <span key={p + i}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt={`${l.name} photo ${i + 1}`} loading="lazy" />{i === 5 && photos.length > 6 && <b>+{photos.length - 6}<small>More photos</small></b>}</span>)}</div></section>
    <ListingGalleries galleries={galleries} />
    <section id="reviews" className="pl3-row"><div className="k-between"><h2>Reviews <span className="pl-rate"><Star size={16} fill="#f59e0b" color="#f59e0b" /><b>{Number(l.rating).toFixed(1)}</b><small>· {l.review_count} reviews</small></span></h2></div>
      <ul className="pl3-g3 pl3-revs">{(revs ?? []).slice(0, 3).map(r => <li key={r.id} className="ce-card"><span className="pl-stars">{"★".repeat(r.rating)}<span>{"★".repeat(5 - r.rating)}</span></span><p>{r.body}</p><small>Verified booking · {new Date(r.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</small></li>)}{!(revs ?? []).length && <li className="ce-card k-small">No written reviews yet.</li>}</ul></section>
    <div id="location" className="pl3-two">
      <section className="ce-card pl-loc"><div className="k-between"><h2>{kind === "venue" ? "Location & getting here" : "Service areas"}</h2><a className="k-link" href={maps} target="_blank" rel="noopener noreferrer">View on Google Maps <ChevronRight size={13} /></a></div>
        {pins.length ? <MapView pins={pins} center={pins[0]} zoom={13} height={220} ariaLabel={`Map of ${l.name}`} /> : <div className="pe-nomap">{l.location}</div>}<p className="pl-addr"><MapPin size={14} />{l.location}{kind === "service" && d.coverage ? ` · ${String(d.coverage)}` : ""}</p></section>
      <section className="ce-card pl-quick"><h2>{kind === "venue" ? "Venue details" : "Response & availability"}</h2>
        <dl><div><dt><Tag size={15} />Price from</dt><dd><b>{money(l.price_from)}</b> {l.price_unit}</dd></div><div><dt><Clock size={15} />Response time</dt><dd>Typically {l.response_hours ?? 24} hours</dd></div><div><dt><Calendar size={15} />Booking mode</dt><dd>{l.instant_book ? "Instant book or quote" : l.booking_mode === "enquiry" ? "Enquiry first" : "Request a quote"}</dd></div>
          {Object.entries(policies).slice(0, 3).map(([k, v]) => <div key={k}><dt><ShieldCheck size={15} />{k[0]!.toUpperCase() + k.slice(1)}</dt><dd>{v}</dd></div>)}</dl>
        {kind === "venue" && amenities.length > 0 && <div className="pl3-amen">{amenities.slice(0, 8).map(a => <span key={a}><CheckCircle2 size={13} />{a}</span>)}</div>}</section>
    </div>
    {(similar ?? []).length > 0 && <section id="similar" className="pl3-row"><div className="k-between"><h2>Similar {kind === "venue" ? "venues" : "services"}</h2></div><div className="pe3-sim-g">{(similar ?? []).map(s => <Link key={s.id} className="ce-card" href={`/${s.kind === "venue" ? "venues" : "services"}/${s.slug ?? s.id}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={s.image} alt="" /><span><b>{s.name}</b><small><Star size={12} fill="#f59e0b" color="#f59e0b" />{Number(s.rating).toFixed(1)} · {s.location}</small><small>From {money(s.price_from)}</small></span></Link>)}</div></section>}
  </div>;
}
