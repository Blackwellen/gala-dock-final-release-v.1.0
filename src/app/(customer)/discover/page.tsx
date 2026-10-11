import Link from "next/link";
import { Calendar, MapPin, Clock, ChevronRight, ArrowRight, Star, Sparkles, LayoutGrid, List, Map as MapIcon, Music, Wine, Utensils, Laugh, Users, Briefcase, Heart as HeartIcon, MoreHorizontal, Flame, BadgeCheck, Ticket, Building2, Wrench } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { publicEvents, savedKeys, CATEGORY_CHIPS, type PublicEvent } from "@/lib/data/customer";
import { LISTING_COLS, type Listing } from "@/lib/data/marketplace";
import { Chip, Tag, Beta, Empty } from "@/components/kit";
import { SaveHeart, MapView } from "@/components/kit/client";
import { DiscoverSearch, AgentBrief } from "@/components/customer/discover-client";
import { dateBadge, time12, money, num, dateShort } from "@/lib/format";

export const metadata = { title: "Discover" };
type SP = Record<string, string | string[] | undefined>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const CHIP_ICON: Record<string, React.ComponentType<{ size?: number }>> = { tonight: Flame, weekend: Calendar, music: Music, nightlife: Wine, food: Utensils, comedy: Laugh, family: Users, corporate: Briefcase, wedding: HeartIcon };
const CHIP_COLOR: Record<string, string> = { tonight: "#ef4444", weekend: "#f59e0b", music: "#7c3aed", nightlife: "#7c3aed", food: "#ef4444", comedy: "#7c3aed", family: "#2563eb", corporate: "#2563eb", wedding: "#ec4899" };
const BADGE_TONE: Record<string, string> = { Trending: "dark", "Last tickets": "red", Featured: "blue", Popular: "green" };

export default async function Discover({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const ctx = await getCustomer("/discover");
  const tab = (["venues", "services"].includes(s(sp.tab)) ? s(sp.tab) : "events") as "events" | "venues" | "services";
  const chip = s(sp.chip); const isDate = ["tonight", "weekend"].includes(chip);
  const results = s(sp.results) === "1" || !!s(sp.q) || !!chip || tab !== "events";
  const view = (["list", "map"].includes(s(sp.view)) ? s(sp.view) : "cards") as "cards" | "list" | "map";
  const saved = await savedKeys(ctx);
  const events = await publicEvents(ctx, { q: tab === "events" ? s(sp.q) : undefined, cat: !isDate ? chip : undefined, date: isDate ? chip : s(sp.date) || undefined, city: s(sp.city) || undefined });
  const listQ = (kind: "venue" | "service", limit: number) => { let q = ctx.supabase.from("listings").select(LISTING_COLS).eq("published", true).eq("kind", kind); if (results && tab !== "events" && s(sp.q)) { const t = s(sp.q).replace(/[%,()]/g, ""); q = q.or(`name.ilike.%${t}%,category.ilike.%${t}%,description.ilike.%${t}%`); } if (results && s(sp.city)) q = q.ilike("location", `%${s(sp.city)}%`); return q.order("review_count", { ascending: false }).limit(limit); };
  const [{ data: venuesRaw }, { data: servicesRaw }] = await Promise.all([listQ("venue", results ? 60 : 12), listQ("service", results ? 60 : 12)]);
  const venues = (venuesRaw ?? []) as unknown as Listing[], services = (servicesRaw ?? []) as unknown as Listing[];
  const featured = events.find(e => e.slug === "neon-nights") ?? events[0];
  const featVenues = ["the-loft-london", "riverside-events-center", "the-harper"].map(k => venues.find(v => v.slug === k)).filter(Boolean) as Listing[];
  const popServices = ["elite-sounds-dj", "taste-catering-co", "luxe-event-decor"].map(k => services.find(v => v.slug === k)).filter(Boolean) as Listing[];
  const popular = ["neon-nights", "summer-rooftop-party", "taste-tango-fest", "comedy-central-live"].map(k => events.find(e => e.slug === k)).filter(Boolean) as PublicEvent[];
  const qs = (patch: Record<string, string | null>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v); for (const [k, v] of Object.entries(patch)) v == null ? p.delete(k) : p.set(k, v); return `/discover?${p}`; };
  const evHref = (e: PublicEvent) => `/events/${e.slug ?? e.id}`;
  const lHref = (l: Listing) => `/discover/${l.kind}/${l.slug ?? l.id}`;

  return <div className="ds">
    <section className="ds-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/gd/hero-discover.webp" alt="" className="ds-hero-bg" />
      <div className="ds-hero-text"><h1>Discover incredible events, venues and services</h1><p>Concerts, festivals, private parties, venues, catering, DJs and more near you and around the world.</p></div>
      {featured && <Link href={evHref(featured)} className="ds-feat"><b className="ds-feat-h">Featured Event</b><div className="k-row" style={{ gap: 10 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={featured.cover_image} alt="" /><span className="ds-feat-date"><small>{dateBadge(featured.starts_at).mon}</small><b>{dateBadge(featured.starts_at).day}</b></span><span className="ds-feat-info"><b>{featured.name}</b><span><MapPin size={13} />{featured.location}</span><span><Clock size={13} />{time12(featured.starts_at)} – {time12(featured.ends_at)}</span></span><span className="ds-feat-go"><ChevronRight size={18} /></span></div></Link>}
    </section>
    <section className="ds-panel">
      <div className="ds-tabs" role="tablist">{([["events", "Events", Ticket], ["venues", "Venues", Building2], ["services", "Services", Wrench]] as const).map(([k, l, I]) => <Link key={k} href={qs({ tab: k === "events" ? null : k, chip: null, results: results ? "1" : null })} role="tab" aria-selected={tab === k}><I size={17} />{l}</Link>)}</div>
      <DiscoverSearch tab={tab} />
      <div className="ds-chips">{CATEGORY_CHIPS.map(([k, l]) => { const I = CHIP_ICON[k]!; return <Link key={k} href={qs({ chip: chip === k ? null : k, results: "1", tab: null })} className="ds-chip" aria-pressed={chip === k}><span style={{ color: CHIP_COLOR[k] }}><I size={15} /></span>{l}</Link>; })}<Link href={qs({ results: "1" })} className="ds-chip"><MoreHorizontal size={15} />More</Link></div>
    </section>

    {!results ? <div className="ds-grid">
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <section className="ds-card"><div className="ds-sec-head"><div><h2>Popular events near you</h2><p>Handpicked events based on your interests, location and what&apos;s trending right now.</p></div><Link className="k-link" href={qs({ results: "1" })}>View all events <ArrowRight size={13} /></Link></div>
          <div className="ds-events">{popular.map(e => <EventCard key={e.id} e={e} saved={saved.has(`event:${e.id}`)} href={evHref(e)} />)}{!popular.length && <Empty title="No public events right now" />}</div></section>
        <div className="ds-two">
          <section className="ds-card"><div className="ds-sec-head"><div><h2>Featured venues</h2><p>Unique spaces for unforgettable events.</p></div><Link className="k-link" href={qs({ tab: "venues", results: "1" })}>View all venues <ArrowRight size={13} /></Link></div>
            <div className="ds-mini">{featVenues.map(v => <MiniCard key={v.id} l={v} href={lHref(v)} saved={saved.has(`listing:${v.id}`)} />)}</div></section>
          <section className="ds-card"><div className="ds-sec-head"><div><h2>Popular services</h2><p>Trusted suppliers to bring your event to life.</p></div><Link className="k-link" href={qs({ tab: "services", results: "1" })}>View all services <ArrowRight size={13} /></Link></div>
            <div className="ds-mini">{popServices.map(v => <MiniCard key={v.id} l={v} href={lHref(v)} saved={saved.has(`listing:${v.id}`)} service />)}</div></section>
        </div>
      </div>
      <div className="k-col" style={{ gap: 14 }}>
        <section className="ds-card ds-map-card"><div className="k-between" style={{ marginBottom: 10 }}><h2 style={{ fontSize: 14 }}>Events near {s(sp.city) ? s(sp.city)[0]!.toUpperCase() + s(sp.city).slice(1) : "London"}</h2><div className="k-seg"><Link role="tab" aria-selected href={qs({ results: "1", view: "map" })}><MapIcon size={13} />Map</Link><Link role="tab" aria-selected={false} href={qs({ results: "1", view: "list" })}><List size={13} />List</Link></div></div>
          <MapView pins={events.filter(e => e.lat).map(e => ({ id: e.id, lat: e.lat!, lng: e.lng!, label: e.name }))} center={{ lat: 51.507, lng: -0.11 }} zoom={11} height={210} mapKey={process.env.MAP_TILER_API_KEY} ariaLabel="Map of events near you" /></section>
        <section className="ds-card"><div className="k-row" style={{ gap: 10, marginBottom: 10 }}><Sparkles size={22} className="k-blue" /><h2 style={{ fontSize: 16 }}>Gala Agent</h2><Beta /></div><AgentBrief /></section>
      </div>
    </div> : <div className={`ds-results ${view === "map" ? "with-map" : ""}`}>
      <div className="k-col" style={{ gap: 12, minWidth: 0 }}>
        <div className="k-between"><div className="k-row" style={{ gap: 12 }}><div className="k-seg solid">{([["cards", "Cards", LayoutGrid], ["list", "List", List], ["map", "Map", MapIcon]] as const).map(([k, l, I]) => <Link key={k} role="tab" aria-selected={view === k} href={qs({ view: k === "cards" ? null : k })}><I size={14} />{l}</Link>)}</div><span className="k-small k-muted">{num(tab === "events" ? events.length : tab === "venues" ? venues.length : services.length)} results{s(sp.q) ? ` for “${s(sp.q)}”` : ""}</span></div><Link className="k-link" href="/discover">Back to Discover</Link></div>
        {tab === "events" ? (events.length ? (view === "list" ? <div className="ds-list">{events.map(e => <Link key={e.id} href={evHref(e)} className="ds-li">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image} alt="" /><span className="k-grow"><b>{e.name}</b><span className="k-xs k-muted"><Calendar size={11} /> {dateShort(e.starts_at)} · {time12(e.starts_at)}</span><span className="k-xs k-muted"><MapPin size={11} /> {e.location}</span></span><span style={{ textAlign: "right" }}><small className="k-xs k-muted">From</small><b style={{ display: "block" }}>{e.minPrice != null ? (e.minPrice ? money(e.minPrice) : "Free") : "—"}</b><Chip tone={e.remaining < 100 ? "red" : "green"}>{e.remaining < 100 ? `${e.remaining} left` : "Available"}</Chip></span></Link>)}</div> : <div className="ds-events ds-events-grid">{events.map(e => <EventCard key={e.id} e={e} saved={saved.has(`event:${e.id}`)} href={evHref(e)} />)}</div>) : <Empty title="No events match" text="Try another date, area or category." />)
          : (() => { const L = tab === "venues" ? venues : services; return L.length ? (view === "list" ? <div className="ds-list">{L.map(l => <Link key={l.id} href={lHref(l)} className="ds-li">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image} alt="" /><span className="k-grow"><b>{l.name} {l.verified && <BadgeCheck size={13} className="k-blue" />}</b><span className="k-xs k-muted"><Star size={11} fill="#f59e0b" color="#f59e0b" /> {l.rating.toFixed(1)} ({l.review_count}) · {l.category}</span><span className="k-xs k-muted"><MapPin size={11} /> {l.location}{l.capacity_max ? ` · up to ${num(l.capacity_max)}` : ""}</span></span><span style={{ textAlign: "right" }}><small className="k-xs k-muted">From</small><b style={{ display: "block" }}>{money(l.price_from)}</b><small className="k-xs k-muted">{l.price_unit}</small></span></Link>)}</div> : <div className="ds-events ds-events-grid">{L.map(l => <ListingCard key={l.id} l={l} href={lHref(l)} saved={saved.has(`listing:${l.id}`)} />)}</div>) : <Empty title={`No ${tab} match`} />; })()}
      </div>
      {view === "map" && <div className="ds-results-map"><MapView pins={(tab === "events" ? events.filter(e => e.lat).map(e => ({ id: e.id, lat: e.lat!, lng: e.lng!, label: e.name, price: e.minPrice != null ? money(e.minPrice) : "" })) : (tab === "venues" ? venues : services).filter(l => l.lat).map(l => ({ id: l.id, lat: l.lat!, lng: l.lng!, label: l.name, price: money(l.price_from) })))} center={{ lat: 51.507, lng: -0.11 }} zoom={11} height="100%" mapKey={process.env.MAP_TILER_API_KEY} showPrices ariaLabel="Results map" /></div>}
    </div>}
  </div>;
}

function EventCard({ e, saved, href }: { e: PublicEvent; saved: boolean; href: string }) {
  const b = dateBadge(e.starts_at); const badge = String(e.settings.badge ?? (e.remaining < 100 ? "Last tickets" : ""));
  const rating = Number(e.settings.rating ?? 0), reviews = Number(e.settings.reviews ?? 0);
  return <article className="ds-ev">
    <Link href={href} className="ds-ev-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image} alt="" />{badge && <span className={`ds-badge ${BADGE_TONE[badge] ?? "blue"}`}>{badge}</span>}</Link>
    <SaveHeart itemKey={`event:${e.id}`} saved={saved} className="ds-heart" label={e.name} size={17} />
    <div className="ds-ev-body">
      <div className="k-row" style={{ gap: 12, alignItems: "flex-start" }}><span className="ds-ev-date"><small>{b.mon}</small><b>{b.day}</b></span><span className="k-grow" style={{ minWidth: 0 }}><Link href={href}><b className="ds-ev-name">{e.name}</b></Link><span className="ds-ev-loc"><MapPin size={12} />{e.location}</span>{rating > 0 && <span className="ds-ev-rate"><Star size={13} fill="#f59e0b" color="#f59e0b" /><b>{rating.toFixed(1)}</b> ({reviews >= 1000 ? `${(reviews / 1000).toFixed(1)}k` : reviews})</span>}</span></div>
      <div className="k-row" style={{ gap: 6, margin: "8px 0 0" }}>{e.tags.slice(0, 2).map((t, i) => <span key={t} className={`ds-tag ${["purple", "pink", "green", "amber"][(e.event_type.length + i) % 4]}`}>{t}</span>)}</div>
      <div className="k-between ds-ev-foot"><span>From <b>{e.minPrice != null ? (e.minPrice ? money(e.minPrice) : "Free") : "—"}</b></span><Link href={`${href}#tickets`} className="k-btn primary">Buy Tickets <ArrowRight size={14} /></Link></div>
    </div>
  </article>;
}
function MiniCard({ l, href, saved, service }: { l: Listing; href: string; saved: boolean; service?: boolean }) {
  return <article className="ds-mc"><Link href={href} className="ds-mc-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image} alt="" /></Link><SaveHeart itemKey={`listing:${l.id}`} saved={saved} className="ds-heart sm" label={l.name} size={15} />
    <div className="ds-mc-body"><Link href={href}><b>{l.name}</b></Link>{!service && <div className="k-between ds-mc-meta"><span><MapPin size={10} />{l.location.split(",")[0]}, {l.city}</span><span>From {money(l.price_from)}/{l.price_unit.replace("per ", "")}</span></div>}
      <span className="ds-mc-rate"><Star size={11} fill="#f59e0b" color="#f59e0b" /><b>{l.rating.toFixed(1)}</b> ({l.review_count})</span>{service && <b className="ds-mc-price">From {money(l.price_from)}{l.price_unit.includes("guest") || l.price_unit.includes("person") ? " / person" : ""}</b>}
      <div className="k-row ds-mc-tags">{l.tags.slice(0, 3).map(t => <span key={t}>{t}</span>)}</div></div></article>;
}
function ListingCard({ l, href, saved }: { l: Listing; href: string; saved: boolean }) {
  return <article className="ds-ev"><Link href={href} className="ds-ev-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image} alt="" />{l.badge && <span className="ds-badge blue">{l.badge}</span>}</Link><SaveHeart itemKey={`listing:${l.id}`} saved={saved} className="ds-heart" label={l.name} size={17} />
    <div className="ds-ev-body"><div className="k-between"><Link href={href}><b className="ds-ev-name">{l.name}</b></Link><b>{money(l.price_from)}<small className="k-xs k-muted"> /{l.price_unit.replace("per ", "")}</small></b></div>
      <span className="ds-ev-rate"><Star size={13} fill="#f59e0b" color="#f59e0b" /><b>{l.rating.toFixed(1)}</b> ({l.review_count} reviews){l.verified && <Chip tone="blue" icon={BadgeCheck}>Verified</Chip>}</span>
      <span className="ds-ev-loc"><MapPin size={12} />{l.location}{l.capacity_max ? ` · ${num(l.capacity_max)} capacity` : ` · ${l.category}`} · responds in {l.response_hours}h</span>
      <div className="k-row k-wrap" style={{ gap: 5, marginTop: 6 }}>{l.tags.slice(0, 4).map(t => <Tag key={t}>{t}</Tag>)}</div>
      <div className="k-grid k-g2" style={{ gap: 8, marginTop: 10 }}><Link className="k-btn outline" href={href}>View details</Link><Link className="k-btn primary" href={`/plan?step=1&listing=${l.id}`}>Start event</Link></div></div></article>;
}
