import Link from "next/link";
import { CalendarDays, Building2, Brush, Search, MapPin, Star, Columns3, Wand2, ArrowRight, Heart } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { SaveHeart } from "@/components/kit/client";
import { SavedSort, SavedEventActions, SavedListingActions, CompareSaved } from "@/components/customer/saved-client";
import { buildCategoryOf } from "@/lib/build-categories";
import { listingHref } from "@/lib/links";
import { eventTypeLabel } from "@/lib/format";

export const metadata = { title: "Saved" };
type L = { id: string; name: string; slug: string | null; kind: string; category: string; location: string; city: string; image: string; rating: number; review_count: number; capacity_max: number | null; price_from: number | null; price_unit: string; badge: string | null; instant_book: boolean; tags: string[] | null; details: Record<string, unknown> | null };

export default async function SavedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getCustomer();
  const tab = (["venues", "services"].includes(sp.tab ?? "") ? sp.tab : "events") as "events" | "venues" | "services";
  const q = (sp.q ?? "").toLowerCase(); const sort = sp.sort ?? "recent";
  const [{ data: saved }, { data: recent }, { data: myEvents }] = await Promise.all([
    ctx.supabase.from("saved_items").select("item_key,created_at").eq("user_id", ctx.user.id).order("created_at", { ascending: false }),
    ctx.supabase.from("recently_viewed").select("item_key,viewed_at").eq("user_id", ctx.user.id).order("viewed_at", { ascending: false }).limit(4),
    ctx.supabase.from("events").select("id,name,starts_at,status").eq("owner_id", ctx.user.id).eq("management", "consumer").in("status", ["draft", "planning", "ready"]).order("starts_at"),
  ]);
  const savedAt = new Map((saved ?? []).map(s => [s.item_key, s.created_at]));
  const ids = (p: string, rows: { item_key: string }[] | null) => (rows ?? []).filter(s => s.item_key.startsWith(`${p}:`)).map(s => s.item_key.slice(p.length + 1)).filter(x => /^[0-9a-f-]{36}$/i.test(x));
  const evIds = ids("event", saved), lIds = [...new Set([...ids("listing", saved), ...ids("listing", recent)])];
  const [{ data: evs }, { data: ls }, { data: tiers }] = await Promise.all([
    evIds.length ? ctx.supabase.from("events_public").select("id,name,slug,starts_at,status,venue_name,city,location,cover_image,event_type,tags").in("id", evIds) : Promise.resolve({ data: [] }),
    lIds.length ? ctx.supabase.from("listings").select("id,name,slug,kind,category,location,city,image,rating,review_count,capacity_max,price_from,price_unit,badge,instant_book,tags,details").in("id", lIds) : Promise.resolve({ data: [] }),
    evIds.length ? ctx.supabase.from("ticket_tiers").select("event_id,quantity,sold,status,sale_start").in("event_id", evIds) : Promise.resolve({ data: [] }),
  ]);
  const notify = new Set((saved ?? []).filter(s => s.item_key.startsWith("notify:")).map(s => s.item_key.slice(13)));
  const order = <T extends { id: string; name: string }>(rows: T[], key: (r: T) => string, extra?: (a: T, b: T) => number) => [...rows].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : extra && sort !== "recent" ? extra(a, b) : (savedAt.get(key(b)) ?? "").localeCompare(savedAt.get(key(a)) ?? ""));
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  const events = order((evs ?? []).filter(e => match(`${e.name} ${e.venue_name} ${e.city}`)), e => `event:${e.id}`, (a, b) => (a.starts_at ?? "9").localeCompare(b.starts_at ?? "9"));
  const listings = (ls ?? []) as unknown as L[];
  const savedL = listings.filter(l => savedAt.has(`listing:${l.id}`) && match(`${l.name} ${l.category} ${l.location}`));
  const byRating = (a: L, b: L) => sort === "price" ? Number(a.price_from ?? 9e9) - Number(b.price_from ?? 9e9) : Number(b.rating) - Number(a.rating);
  const venues = order(savedL.filter(l => l.kind === "venue"), l => `listing:${l.id}`, byRating), services = order(savedL.filter(l => l.kind !== "venue"), l => `listing:${l.id}`, byRating);
  const evBadge = (e: { id: string; status: string }) => { const t = (tiers ?? []).filter(x => x.event_id === e.id); const left = t.reduce((s, x) => s + Math.max(0, x.quantity - x.sold), 0), cap = t.reduce((s, x) => s + x.quantity, 0);
    if (!t.length || t.every(x => x.status === "scheduled" || x.status === "draft")) return ["Coming soon", "blue"]; if (left === 0) return ["Sold out", "red"]; if (cap && left / cap < 0.2) return ["Limited availability", "amber"]; return ["On sale", "green"]; };
  const lBadge = (l: L) => l.badge ? [l.badge, /top|popular/i.test(l.badge) ? "amber" : "green"] : l.instant_book ? ["Instant book", "green"] : Number(l.rating) >= 4.8 ? ["Top rated", "amber"] : ["Available", "green"];
  const recentRows = (recent ?? []).map(r => listings.find(l => `listing:${l.id}` === r.item_key)).filter((x): x is L => !!x);
  const evOpts = (myEvents ?? []).map(e => ({ id: e.id, name: e.name }));
  const tabHref = (t: string) => `/account/saved?tab=${t}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${sort !== "recent" ? `&sort=${sort}` : ""}`;
  const head = (d: string | null) => d ? { m: new Date(d).toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" }).toUpperCase(), d: new Date(d).toLocaleDateString("en-GB", { day: "numeric", timeZone: "Europe/London" }) } : null;
  const listCard = (l: L) => { const [b, tone] = lBadge(l); return <article key={l.id} className="sv-card">
    <div className="sv-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image} alt="" /><SaveHeart itemKey={`listing:${l.id}`} saved className="sv-heart" size={17} label={`Remove ${l.name} from saved`} /><span className={`sv-badge ${tone}`}>{b}</span></div>
    <div className="sv-body"><div className="sv-title"><span><b><Link href={listingHref(l.kind, l.slug, l.id)}>{l.name}</Link></b>
      <small className="sv-meta"><Star size={13} fill="#f59e0b" color="#f59e0b" /><em>{Number(l.rating).toFixed(1)}</em> ({l.review_count}) • {l.kind === "venue" ? `Up to ${l.capacity_max ?? "—"} guests` : l.category}</small>
      <small className="sv-loc"><MapPin size={13} />{l.kind === "venue" ? l.location : `${l.city || l.location} • ${String((l.details as { travel?: string } | null)?.travel ?? "Travels UK wide")}`}</small></span></div>
      <SavedListingActions listing={{ id: l.id, name: l.name, kind: l.kind, href: listingHref(l.kind, l.slug, l.id), category: buildCategoryOf(l.kind, l.category) }} events={evOpts} /></div></article>; };

  return <div className="sv">
    <div className="sv-head"><div><h1>Saved</h1><p>Keep your favourite events, venues and services in one place. Add them to an event when you&apos;re ready.</p></div>
      <form className="sv-tools" action="/account/saved"><input type="hidden" name="tab" value={tab} /><span className="sv-search"><Search size={18} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search your saved items..." aria-label="Search your saved items" /></span><SavedSort value={sort} /></form></div>
    <nav className="sv-tabs" aria-label="Saved categories">{([["events", CalendarDays, "Events", events.length], ["venues", Building2, "Venues", venues.length], ["services", Brush, "Services", services.length]] as const).map(([k, I, l, n]) => <Link key={k} href={tabHref(k)} aria-current={tab === k ? "page" : undefined}><I size={19} />{l} ({n})</Link>)}</nav>
    {sp.compare && <CompareSaved kind={sp.compare === "services" ? "services" : "venues"} rows={(sp.compare === "services" ? services : venues).map(l => ({ id: l.id, name: l.name, href: listingHref(l.kind, l.slug, l.id), rating: Number(l.rating), reviews: l.review_count, price: l.price_from == null ? null : Number(l.price_from), unit: l.price_unit, capacity: l.capacity_max, location: l.location, category: l.category }))} />}
    <div className={`sv-grid tab-${tab}`}>
      <section className="ce-card sv-col" data-col="events"><h2>Events</h2><p className="sv-sub">Events you&apos;re interested in attending or using as inspiration.</p>
        {events.map(e => { const [b, tone] = evBadge(e); const h = head(e.starts_at); return <article key={e.id} className="sv-card">
          <div className="sv-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><SaveHeart itemKey={`event:${e.id}`} saved className="sv-heart" size={17} label={`Remove ${e.name} from saved`} />
            <span className="sv-chips">{[eventTypeLabel(e.event_type), ...(e.tags ?? []).filter(t => t.toLowerCase() !== eventTypeLabel(e.event_type).toLowerCase()).slice(0, 1)].map((t, i) => <i key={t} className={i === 0 ? "p" : ""}>{t}</i>)}</span><span className={`sv-badge ${tone}`}>{b}</span></div>
          <div className="sv-body"><div className="sv-title">{h && <span className="sv-date"><small>{h.m}</small><b>{h.d}</b></span>}<span><b><Link href={e.slug ? `/events/${e.slug}` : "#"}>{e.name}</Link></b><small className="sv-loc"><MapPin size={13} />{[e.venue_name, e.city].filter(Boolean).join(", ") || e.location}</small></span></div>
            <SavedEventActions event={{ id: e.id, name: e.name, slug: e.slug, comingSoon: b === "Coming soon", soldOut: b === "Sold out", notify: notify.has(e.id) }} /></div></article>; })}
        {!events.length && <div className="sv-empty"><Heart size={22} />{q ? "No saved events match." : <>Tap the heart on any event to save it here. <Link href="/discover?tab=events&results=1">Browse events</Link></>}</div>}</section>
      <section className="ce-card sv-col" data-col="venues"><h2>Venues</h2><p className="sv-sub">Venues you&apos;ve saved for future events.</p>{venues.map(listCard)}{!venues.length && <div className="sv-empty"><Heart size={22} />{q ? "No saved venues match." : <>Save venues while you browse. <Link href="/discover?tab=venues&results=1">Find venues</Link></>}</div>}</section>
      <section className="ce-card sv-col" data-col="services"><h2>Services</h2><p className="sv-sub">Suppliers and services you&apos;ve saved.</p>{services.map(listCard)}{!services.length && <div className="sv-empty"><Heart size={22} />{q ? "No saved services match." : <>Save suppliers while you browse. <Link href="/discover?tab=services&results=1">Find services</Link></>}</div>}</section>
      <aside className="sv-side">
        <section className="ce-card sv-agent"><div className="k-row" style={{ gap: 8 }}><Columns3 size={22} className="pw-spark" /><b>Compare &amp; decide</b></div><p>Put your saved options side by side, or find similar ones nearby.</p>
          <Link className="k-btn primary sv-ab" href={`/account/saved?tab=${tab}&compare=${tab === "services" ? "services" : "venues"}`}><Columns3 size={16} />Compare saved items</Link>
          <Link className="k-btn outline sv-ab" href={`/discover?tab=${tab === "events" ? "events" : tab}&results=1`}><Search size={16} />Find similar options</Link>
          <Link className="k-btn outline sv-ab" href="/plan"><Wand2 size={16} />Help me plan an event</Link></section>
        <section className="ce-card sv-recent"><div className="k-between"><b>Recently viewed</b><Link className="k-link" href="/discover?results=1">View all <ArrowRight size={13} /></Link></div>
          <ul>{recentRows.map(l => <li key={l.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image} alt="" /><Link href={listingHref(l.kind, l.slug, l.id)} className="k-grow"><b>{l.name}</b><small>{l.kind === "venue" ? "Venue" : l.category}</small></Link><SaveHeart itemKey={`listing:${l.id}`} saved={savedAt.has(`listing:${l.id}`)} className="sv-rheart" size={17} label={`Save ${l.name}`} /></li>)}{!recentRows.length && <li className="k-small">Venues and services you look at will appear here.</li>}</ul></section>
        <section className="sv-ready"><b>Ready to start planning?</b><p>Add your saved items to a new or existing event and start building your perfect package.</p><Link className="k-btn primary sv-ab" href="/plan">Create new event <ArrowRight size={16} /></Link><Link className="k-btn outline sv-ab" href="/account/events"><CalendarDays size={16} />Choose existing event</Link></section>
      </aside>
    </div>
  </div>;
}
