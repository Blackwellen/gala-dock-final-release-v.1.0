import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, BadgeCheck, MapPin, Users, Home, Tag, Clock, Sparkles, Award, Briefcase, Calendar, CheckCircle2, ChevronRight, ArrowRight, Building2, Utensils, Car, Accessibility, Layers, Camera, ShieldCheck, Leaf, Scaling, Salad, Package2, Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MapView } from "@/components/kit/client";
import { ListingActions, PlanWithListing, RecordView } from "./public-listing-client";

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
    kind === "venue" ? supabase.from("spaces").select("id,name,indoor,capacity_seated,capacity_standing,image,details").eq("venue_id", l.id).eq("status", "published").order("capacity_seated", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("packages").select("id,name,description,base_price,price_basis,min_guests,max_guests,image,inclusions,details,booking_mode").eq("listing_id", l.id).eq("status", "published").order("base_price"),
    supabase.from("reviews").select("id,rating,ratings,body,created_at").eq("listing_id", l.id).eq("status", "published").order("created_at", { ascending: false }).limit(6),
    supabase.auth.getUser(),
    supabase.from("listings").select("id,name,slug,kind,image,rating,review_count,price_from,price_unit,location").eq("kind", kind).eq("published", true).eq("category", l.category).neq("id", l.id).order("rating", { ascending: false }).limit(4),
  ]);
  const [{ data: myEvents }, { data: savedRow }] = user ? await Promise.all([
    supabase.from("events").select("id,name,starts_at,guest_count,event_type").eq("owner_id", user.id).eq("management", "consumer").in("status", ["draft", "planning", "ready"]).order("starts_at"),
    supabase.from("saved_items").select("item_key").eq("user_id", user.id).eq("item_key", `listing:${l.id}`).maybeSingle(),
  ]) : [{ data: [] }, { data: null }];
  const photos = [l.image, ...(l.gallery ?? [])].filter(Boolean) as string[];
  const amenities = ((d.amenities as string[] | undefined) ?? l.tags ?? []);
  const policies = (d.policies ?? {}) as Record<string, string>;
  const highlights = (d.highlights as { t: string; d: string }[] | undefined) ?? [];
  const sig = d.signature as { kicker: string; title: string; body: string; image: string } | undefined;
  const tiers = (d.price_tiers as { l: string; p: number }[] | undefined) ?? [];
  const cat = kind === "venue" ? "venue" : (l.category.toLowerCase().includes("cater") ? "food" : "extras");
  const href = `/${kind === "venue" ? "venues" : "services"}/${l.slug ?? l.id}`;
  const pins = l.lat && l.lng ? [{ id: l.id, lat: l.lat, lng: l.lng, label: l.name }] : [];
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name}, ${l.location}`)}`;
  const facts = kind === "venue"
    ? [[Users, `${l.capacity_max ?? "—"}`, "Max capacity"], [Layers, "Multiple spaces", `${(spaces ?? []).length || d.spaces || 1} event spaces`], [Home, String(d.setting ?? "Indoor"), "Flexible setup"], [Utensils, "Catering available", String(d.catering ?? "Ask the venue")], [Car, "Parking", String(d.parking ?? "Ask the venue")], [Accessibility, "Accessibility", String(d.accessible ?? "Ask the venue")]] as const
    : [];
  const stats = kind === "service"
    ? [[MapPin, l.location, String(d.coverage ?? "Travels to you")], [Tag, l.category, "Primary category"], [Users, String(d.team ?? "Dedicated team"), "Event staff"], [Clock, `< ${l.response_hours ?? 24} hours`, "Avg. response time"], [Calendar, "Available", "Check your date"]] as const
    : [];
  const ld = { "@context": "https://schema.org", "@type": kind === "venue" ? "EventVenue" : "LocalBusiness", name: l.name, description: l.description, image: photos.slice(0, 3), address: l.location, aggregateRating: l.review_count ? { "@type": "AggregateRating", ratingValue: Number(l.rating), reviewCount: l.review_count } : undefined, priceRange: l.price_from ? `From £${l.price_from}` : undefined };
  const HL = [Award, Leaf, Scaling, Salad, Package2];

  return <div className="pl">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    <RecordView itemKey={`listing:${l.id}`} signedIn={!!user} />
    <nav className="pe-crumbs" aria-label="Breadcrumb"><Link href="/discover">Discover</Link><span>/</span><Link href={`/discover?tab=${kind === "venue" ? "venues" : "services"}&results=1`}>{kind === "venue" ? "Venues" : "Services"}</Link><span>/</span><span aria-current="page">{l.name}</span></nav>
    <div className="pl-grid">
      <div className="pl-main">
        <section className={`pl-gal ${kind}`}>
          <a href="#photos" className="pl-gal-main">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photos[0] ?? "/assets/gd/v-riverside-park.webp"} alt={l.name} />{l.verified && kind === "venue" && <span className="pl-ver"><BadgeCheck size={14} />Verified venue</span>}<span className="pl-count"><Camera size={14} />1 / {photos.length}</span></a>
          {photos.slice(1, 5).map((p, i) => <a key={p + i} href="#photos" className="pl-gal-s" aria-label={`View photo ${i + 2}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt="" />{i === 3 && <span className="pl-all"><Camera size={14} />View all photos ({photos.length})</span>}</a>)}
        </section>
        <section className="pl-head">
          {kind === "service" && d.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="pl-logo" src={String(d.logo)} alt="" /> : null}
          <div className="k-grow">
            <div className="pl-titlerow"><h1>{l.name}</h1>{l.verified && <span className="pl-vchip"><BadgeCheck size={14} />Verified</span>}{kind === "venue" && <span className="pl-price"><small>From</small><b>{money(l.price_from)}</b><small>/ {l.price_unit?.replace(/^per\s*/, "") || "day"}</small></span>}</div>
            <div className="pl-badges"><span className="pl-rate"><Star size={16} fill="#f59e0b" color="#f59e0b" /><b>{Number(l.rating).toFixed(1)}</b><small>({l.review_count} reviews)</small></span>
              {kind === "venue" && <span className="pl-b g"><CheckCircle2 size={14} />Typically responds in {l.response_hours ?? 24} hours</span>}
              {Boolean(d.popular || d.top_rated) && <span className="pl-b p"><Sparkles size={13} />{kind === "venue" ? "Popular choice" : "Top Rated"}</span>}
              {d.events_hosted ? <span className="pl-b"><Briefcase size={13} />{String(d.events_hosted)} events {kind === "venue" ? "hosted" : "catered"}</span> : null}{d.experience ? <span className="pl-b"><Award size={13} />{String(d.experience)} experience</span> : null}</div>
            {kind === "venue" ? <div className="pl-meta"><span><MapPin size={16} />{l.location}</span><span><Users size={16} />{l.capacity_max ?? "—"} capacity</span><span><Home size={16} />{String(d.setting ?? "")}</span>{d.ideal_for ? <span><Tag size={16} />{String(d.ideal_for)}</span> : null}</div>
              : <><p className="pl-tagline">{String(d.tagline ?? "")}</p><p className="pl-desc">{l.description}</p></>}
          </div>
          {kind === "venue" && <Link className="k-link pl-pricing" href="#packages">View pricing details <ChevronRight size={14} /></Link>}
        </section>
        {kind === "service" && <div className="pl-stats">{stats.map(([I, b, s]) => <div key={s}><I size={22} /><span><b>{b}</b><small>{s}</small></span></div>)}</div>}
        <nav className="pe-tabs" aria-label="Sections">{(kind === "venue" ? [["about", "Overview"], ["photos", "Photos"], ["amenities", "Amenities"], ["packages", "Packages"], ["location", "Location"], ["reviews", "Reviews"], ["policies", "Policies"], ["similar", "Similar Venues"]] : [["about", "Overview"], ["packages", "Packages & Menus"], ["photos", "Gallery"], ["reviews", "Reviews"], ["location", "Coverage"], ["policies", "Policies"], ["similar", "Similar"]]).map(([id, lbl], i) => <a key={id} href={`#${id}`} className={i === 0 ? "on" : ""}>{lbl}</a>)}</nav>
        {kind === "venue" ? <section id="about" className="ce-card pl-about"><div><h2>About this venue</h2><p>{l.description}</p></div><div className="pl-facts">{facts.map(([I, b, s]) => <div key={b}><I size={24} /><span><b>{b}</b><small>{s}</small></span></div>)}</div></section>
          : <section id="about" className="pl-sig-row">{sig && <div className="ce-card pl-sig"><div><small>{sig.kicker}</small><h2>{sig.title}</h2><p>{sig.body}</p></div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={sig.image} alt="" /></div>}
            {highlights.length > 0 && <div className="ce-card pl-diff"><b>What makes us different</b><ul>{highlights.map((h, i) => { const I = HL[i % HL.length]!; return <li key={h.t}><span className={`pl-hi c${i % 5}`}><I size={17} /></span><span><b>{h.t}</b><small>{h.d}</small></span></li>; })}</ul></div>}</section>}
        {kind === "venue" && (spaces ?? []).length > 0 && <section className="ce-card pl-spaces"><div className="k-between"><h2>Event spaces</h2><span className="k-link">{(spaces ?? []).length} spaces available</span></div>
          <div className="pl-sp-g">{(spaces ?? []).map(s => <article key={s.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={s.image || photos[0]} alt="" /><b>{s.name}</b><div className="pl-sp-m"><span><Users size={14} />{s.capacity_seated} capacity</span><span><Building2 size={14} />{s.indoor ? "Indoor" : "Outdoor"}</span></div><p>{String((s.details as { description?: string } | null)?.description ?? "")}</p></article>)}</div></section>}
        {kind === "venue" && amenities.length > 0 && <section id="amenities" className="ce-card pl-amen"><h2>Amenities</h2><div>{amenities.map(a => <span key={a}><CheckCircle2 size={14} />{a}</span>)}</div></section>}
        {(pkgs ?? []).length > 0 && <section id="packages" className={`ce-card pl-pkgs ${kind}`}><div className="k-between"><h2>{kind === "venue" ? "Packages" : "Popular packages"}</h2></div>
          <div className="pl-pk-g">{(pkgs ?? []).map(p => { const badge = (p.details as { badge?: string } | null)?.badge; const unit = p.price_basis === "per_person" ? (kind === "venue" ? "person" : "guest") : p.price_basis === "hourly" ? "hour" : "day";
            return <article key={p.id} className={badge === "Most popular" ? "pop" : ""}>{kind === "service" && p.image ? <div className="pl-pk-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.image} alt="" />{badge && <i>{badge}</i>}</div> : badge ? <i className="pl-pk-tag">{badge}</i> : null}
              <div className="pl-pk-b"><div className="k-between"><b>{p.name}</b>{kind === "service" && <strong>{p.price_basis === "per_person" && Number(p.base_price) >= 70 ? "From " : ""}{money(Number(p.base_price))} <small>/ {unit}</small></strong>}</div>{kind === "venue" && <span className="pl-pk-p">From <b>{money(Number(p.base_price))}</b> / {unit}</span>}<p>{p.description}</p>
                {kind === "service" && Array.isArray(p.inclusions) && <ul>{(p.inclusions as string[]).slice(0, 4).map(x => <li key={x}><CheckCircle2 size={13} />{x}</li>)}</ul>}
                {kind === "service" && <div className="pl-pk-acts"><Link className="k-btn outline" href={`${href}#packages`}>View details</Link><PlanWithListing compact listing={{ id: l.id, name: l.name, category: cat, kind }} events={(myEvents ?? []).map(e => ({ id: e.id, name: e.name }))} signedIn={!!user} next={href} /></div>}</div></article>; })}</div></section>}
        <section id="photos" className="ce-card pl-photos"><h2>Photos</h2><div>{photos.map((p, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={p + i} src={p} alt={`${l.name} photo ${i + 1}`} loading="lazy" />)}</div></section>
        <section id="reviews" className="ce-card pl-revs"><div className="k-between"><h2>Reviews</h2><span className="pl-rate"><Star size={16} fill="#f59e0b" color="#f59e0b" /><b>{Number(l.rating).toFixed(1)}</b><small>· {l.review_count} reviews</small></span></div>
          <ul>{(revs ?? []).map(r => <li key={r.id}><span className="pl-stars">{"★".repeat(r.rating)}<span>{"★".repeat(5 - r.rating)}</span></span><p>{r.body}</p><small>Verified booking · {new Date(r.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</small></li>)}{!(revs ?? []).length && <li className="k-small">No written reviews yet.</li>}</ul></section>
        {Object.keys(policies).length > 0 && <section id="policies" className="ce-card pl-pol"><h2>Policies</h2><dl>{Object.entries(policies).map(([k, v]) => <div key={k}><dt>{k[0]!.toUpperCase() + k.slice(1)}</dt><dd>{v}</dd></div>)}</dl></section>}
        {(similar ?? []).length > 0 && <section id="similar" className="ce-card pl-sim"><h2>Similar {kind === "venue" ? "venues" : "providers"}</h2><div>{(similar ?? []).map(s => <Link key={s.id} href={`/${s.kind === "venue" ? "venues" : "services"}/${s.slug ?? s.id}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={s.image} alt="" /><b>{s.name}</b><small><Star size={12} fill="#f59e0b" color="#f59e0b" />{Number(s.rating).toFixed(1)} · {s.location}</small><small>From {money(s.price_from)}</small></Link>)}</div></section>}
      </div>
      <aside className="pl-side">
        {kind === "service" && <ListingActions listingId={l.id} name={l.name} saved={!!savedRow} signedIn={!!user} />}
        <section className="ce-card pl-book"><h2>{kind === "venue" ? "Booking options" : "Book this supplier"}</h2>
          <PlanWithListing listing={{ id: l.id, name: l.name, category: cat, kind, capacity: l.capacity_max }} events={(myEvents ?? []).map(e => ({ id: e.id, name: e.name, guests: e.guest_count }))} signedIn={!!user} next={href} />
          {kind === "venue" && <ListingActions listingId={l.id} name={l.name} saved={!!savedRow} signedIn={!!user} />}</section>
        {kind === "service" && tiers.length > 0 && <section className="ce-card pl-est"><div className="k-between"><h2>Price estimate</h2><span><small>From </small><b>{money(tiers[0]!.p)}</b><small> per guest</small></span></div>
          <div className="pl-tiers">{tiers.map((t, i) => <span key={t.l} className={i === 0 ? "on" : ""}><i /><b>{money(t.p)}{i === tiers.length - 1 ? "+" : ""}</b><small>{t.l}</small></span>)}</div><p>Final pricing depends on menu, guest count, location and production needs. Get a detailed quote for accurate pricing.</p></section>}
        <section className="ce-card pl-quick"><div className="k-between"><h2>{kind === "venue" ? "Quick details" : "Response & availability"}</h2></div>
          <dl><div><dt><Tag size={15} />Price from</dt><dd><b>{money(l.price_from)}</b> {l.price_unit}</dd></div><div><dt><Clock size={15} />Response time</dt><dd>Typically {l.response_hours ?? 24} hours</dd></div><div><dt><Calendar size={15} />Booking mode</dt><dd>{l.instant_book ? "Instant book or quote" : l.booking_mode === "enquiry" ? "Enquiry first" : "Request a quote"}</dd></div>{policies.cancellation && <div><dt><ShieldCheck size={15} />Cancellation policy</dt><dd>{policies.cancellation}</dd></div>}</dl></section>
        <section id="location" className="ce-card pl-loc"><div className="k-between"><h2>Location</h2><a className="k-link" href={maps} target="_blank" rel="noopener noreferrer">View on Google Maps <ChevronRight size={13} /></a></div>
          {pins.length ? <MapView pins={pins} center={pins[0]} zoom={13} height={130} ariaLabel={`Map of ${l.name}`} /> : <div className="pe-nomap">{l.location}</div>}<p className="pl-addr"><MapPin size={14} />{l.location}{kind === "service" && d.coverage ? ` · ${String(d.coverage)}` : ""}</p></section>
        <section className="ce-card pl-agent"><div className="k-row" style={{ gap: 8 }}><Compass size={20} className="pw-spark" /><b>Plan with this {kind === "venue" ? "venue" : "supplier"}</b></div><p>Check your dates, compare similar options, or start planning around it.</p>
          {[[`Is ${l.name} available for my dates?`, user ? `/plan` : `/login?next=${href}`], [`Compare with similar ${kind === "venue" ? "venues" : "suppliers"}`, "#similar"], ["Plan an event around it", "/plan"]].map(([t, h]) => <Link key={t} href={h} className="pl-ask">{t}<ArrowRight size={14} /></Link>)}</section>
      </aside>
    </div>
  </div>;
}
