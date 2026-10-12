import Link from "next/link";
import { ArrowRight, MapPin, Clock, ChevronRight, ChevronLeft, CalendarDays, Sparkles, Star, Lightbulb, BellRing, Users, Utensils, Video, ListChecks, Ticket } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { myTickets } from "@/lib/data/customer-tickets";
import { SaveHeart, AgentAsk } from "@/components/kit/client";
import { HomeCarousel } from "@/components/customer/home-client";
import { listingHref } from "@/lib/links";
import { eventTypeLabel } from "@/lib/format";

export const metadata = { title: "Home" };
const TZ = "Europe/London";
const md = (iso: string | null) => iso ? { m: new Date(iso).toLocaleDateString("en-GB", { month: "short", timeZone: TZ }).toUpperCase(), d: new Date(iso).toLocaleDateString("en-GB", { day: "numeric", timeZone: TZ }) } : { m: "TBC", d: "–" };
const t12 = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ }).toUpperCase() : "";
const span = (a: string | null, b: string | null) => a ? `${t12(a)}${b ? ` – ${t12(b)}` : ""}` : "Time TBC";
const TAG: Record<string, string> = { music: "purple", festival: "blue", nightlife: "blue", food_drink: "green", party: "purple", corporate: "blue", conference: "blue", comedy: "amber" };

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getCustomer(); const now = new Date();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") ? sp.day! : now.toLocaleDateString("en-CA", { timeZone: TZ });
  const dayStart = new Date(`${day}T00:00:00Z`).toISOString(), dayEnd = new Date(new Date(`${day}T00:00:00Z`).getTime() + 864e5).toISOString();
  const [tk, { data: mine }, { data: pub }, { data: saved }, { data: recent }] = await Promise.all([
    myTickets(ctx),
    ctx.supabase.from("events").select("id,name,starts_at,ends_at,venue_name,location,city,cover_image,status").eq("owner_id", ctx.user.id).eq("management", "consumer").gte("starts_at", now.toISOString()).neq("status", "cancelled").order("starts_at").limit(6),
    ctx.supabase.from("events").select("id,name,slug,starts_at,ends_at,venue_name,city,location,cover_image,event_type,tags").eq("visibility", "public").in("status", ["published", "on_sale", "live"]).gte("starts_at", now.toISOString()).order("starts_at").limit(24),
    ctx.supabase.from("saved_items").select("item_key").eq("user_id", ctx.user.id).order("created_at", { ascending: false }).limit(40),
    ctx.supabase.from("recently_viewed").select("item_key").eq("user_id", ctx.user.id).limit(20),
  ]);
  const savedKeys = new Set((saved ?? []).map(s => s.item_key));
  // Recommendations: interests + saved/recently-viewed event types, then soonest.
  const interests = ((ctx.profile?.interests as string[] | null) ?? []).map(s => s.toLowerCase());
  const score = (e: { event_type: string; tags: string[] | null; id: string }) => (interests.some(i => eventTypeLabel(e.event_type).toLowerCase().includes(i.split(" ")[0]!) || (e.tags ?? []).some(t => t.toLowerCase().includes(i.split(" ")[0]!))) ? 3 : 0) + (savedKeys.has(`event:${e.id}`) ? 1 : 0);
  const recs = [...(pub ?? [])].sort((a, b) => score(b) - score(a) || (a.starts_at ?? "").localeCompare(b.starts_at ?? "")).slice(0, 8);
  // Upcoming: tickets you hold + events you're planning, merged by date.
  const upcoming = [...tk.upcoming.map(g => ({ key: g.key, name: g.event.name, at: g.event.starts_at, end: g.event.ends_at, place: [g.event.venue_name, g.event.city].filter(Boolean).join(", "), img: g.event.cover_image, href: `/account/tickets/${g.tickets[0]!.id}` })),
    ...(mine ?? []).map(e => ({ key: e.id, name: e.name, at: e.starts_at, end: e.ends_at, place: [e.venue_name, e.city].filter(Boolean).join(", ") || e.location, img: e.cover_image, href: `/account/events/${e.id}` }))].sort((a, b) => (a.at ?? "9").localeCompare(b.at ?? "9"));
  const next = upcoming[0];
  const orders = [...tk.upcoming, ...tk.past].slice(0, 3);
  const listIds = (saved ?? []).filter(s => s.item_key.startsWith("listing:")).map(s => s.item_key.slice(8)).slice(0, 3);
  const [{ data: ls }, { data: tasks }] = await Promise.all([
    listIds.length ? ctx.supabase.from("listings").select("id,name,slug,kind,category,image").in("id", listIds) : Promise.resolve({ data: [] }),
    ctx.supabase.from("tasks").select("id,title,due_at,category,event_id,events!inner(name,owner_id)").eq("events.owner_id", ctx.user.id).gte("due_at", dayStart).lt("due_at", dayEnd).neq("status", "done").order("due_at").limit(6),
  ]);
  const schedule = [...(tasks ?? []).map(t => ({ id: t.id, at: t.due_at!, title: t.title, sub: (t.events as unknown as { name: string }).name, href: `/account/events/${t.event_id}/plan?tab=checklist`, kind: t.category })),
    ...upcoming.filter(u => u.at && u.at >= dayStart && u.at < dayEnd).map(u => ({ id: u.key, at: u.at!, title: u.name, sub: u.place, href: u.href, kind: "event" }))].sort((a, b) => a.at.localeCompare(b.at));
  const shift = (n: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
  const isToday = day === now.toLocaleDateString("en-CA", { timeZone: TZ });
  const hour = Number(now.toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }));
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = ctx.name.split(" ")[0];
  const KIND: Record<string, typeof Users> = { event: Ticket, venue: MapPin, catering: Utensils, food: Utensils, meeting: Video };
  const city = (ctx.profile?.home_area as string | null)?.split(",")[0] || "London";

  return <div className="hm">
    <section className="hm-hero">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/assets/gd/hero-discover.webp" alt="" />
      <div className="hm-hello"><h1>{hello}, {first}</h1><p>Discover unforgettable experiences happening near you and around the world.</p><Link className="k-btn hm-explore" href="/discover?tab=events&results=1">Explore Events <ArrowRight size={17} /></Link></div>
      {next ? <Link href={next.href} className="hm-next"><small>Your next event</small><span className="hm-next-row">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={next.img || "/assets/gd/oe-neon.webp"} alt="" /><span className="hm-cal"><small>{md(next.at).m}</small><b>{md(next.at).d}</b></span><span className="k-grow"><b>{next.name}</b><em><MapPin size={14} />{next.place}</em><em><Clock size={14} />{span(next.at, next.end)}</em></span><span className="hm-go"><ChevronRight size={20} /></span></span></Link>
        : <Link href="/plan" className="hm-next"><small>Nothing booked yet</small><span className="hm-next-row"><span className="k-grow"><b>Plan your first event</b><em>Tell us the occasion and we&apos;ll build a plan.</em></span><span className="hm-go"><ChevronRight size={20} /></span></span></Link>}
    </section>
    <div className="hm-grid">
      <section className="ce-card hm-recs"><div className="k-between hm-h"><div><h2>Recommended for You</h2><p>Events picked based on your interests, past activity, and trending in your area.</p></div><Link className="k-link" href="/discover?tab=events&results=1">View All Events <ArrowRight size={15} /></Link></div>
        <HomeCarousel>{recs.map(e => <article key={e.id} className="hm-card"><div className="hm-card-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><SaveHeart itemKey={`event:${e.id}`} saved={savedKeys.has(`event:${e.id}`)} className="hm-heart" size={17} label={`Save ${e.name}`} /></div>
          <Link href={e.slug ? `/events/${e.slug}` : "#"} className="hm-card-b"><span className="hm-cal sm"><small>{md(e.starts_at).m}</small><b>{md(e.starts_at).d}</b></span><span className="k-grow"><b>{e.name}</b><em><MapPin size={13} />{[e.venue_name, e.city].filter(Boolean).join(", ")}</em></span></Link>
          <div className="hm-tags">{[...new Map([eventTypeLabel(e.event_type), ...(e.tags ?? []).slice(0, 2)].map(t => [t.toLowerCase(), t])).values()].slice(0, 2).map((t, i) => <span key={t} className={i === 0 ? TAG[e.event_type] ?? "blue" : "blue"}>{t}</span>)}</div></article>)}</HomeCarousel>
        {!recs.length && <p className="k-small">No public events on sale right now — check back soon.</p>}</section>
      <section className="ce-card hm-up"><div className="k-between hm-h"><h2>My Upcoming Events</h2><Link className="k-link" href="/account/events">View Calendar <ArrowRight size={15} /></Link></div>
        <ul>{upcoming.slice(0, 3).map(u => <li key={u.key}><Link href={u.href}><span className="hm-cal plain"><small>{md(u.at).m}</small><b>{md(u.at).d}</b></span>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u.img || "/assets/gd/oe-neon.webp"} alt="" /><span className="k-grow"><b>{u.name}</b><em><MapPin size={13} />{u.place}</em><em><Clock size={13} />{span(u.at, u.end)}</em></span><ChevronRight size={17} /></Link></li>)}{!upcoming.length && <li className="k-small">Nothing coming up. <Link href="/discover">Find something to do</Link>.</li>}</ul>
        <Link className="hm-allbook" href="/account/tickets">View All Bookings <ArrowRight size={15} /></Link></section>
      <section className="ce-card hm-orders"><div className="k-between hm-h"><h2>My Tickets &amp; Orders</h2><Link className="k-link" href="/account/tickets">View All Orders <ArrowRight size={15} /></Link></div>
        <ul>{orders.map(g => { const proc = g.tickets.some(t => t.status === "resale_listed"); return <li key={g.key}><Link href={`/account/tickets/${g.tickets[0]!.id}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={g.event.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><span className="k-grow"><b>{g.event.name}</b><em>{g.event.starts_at ? new Date(g.event.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : ""} · {g.tickets.length} Ticket{g.tickets.length === 1 ? "" : "s"}</em></span><span className={`hm-st ${g.when === "past" ? "gray" : proc ? "blue" : "green"}`}>{g.when === "past" ? "Attended" : proc ? "Processing" : "Confirmed"}</span><ChevronRight size={17} /></Link></li>; })}{!orders.length && <li className="k-small">Tickets you buy will show here.</li>}</ul></section>
      <section className="ce-card hm-saved"><div className="k-between hm-h"><h2>Saved Venues &amp; Services</h2><Link className="k-link" href="/account/saved?tab=venues">View All <ArrowRight size={15} /></Link></div>
        <div className="hm-sgrid">{(ls ?? []).map(l => <article key={l.id}><Link href={listingHref(l.kind, l.slug, l.id)} aria-label={l.name}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.image} alt="" /></Link><div className="k-between"><Link href={listingHref(l.kind, l.slug, l.id)}><b>{l.name}</b><em>{l.kind === "venue" ? "Event Venue" : l.category}</em></Link><SaveHeart itemKey={`listing:${l.id}`} saved className="hm-sheart" size={18} label={`Remove ${l.name}`} /></div></article>)}{!(ls ?? []).length && <p className="k-small">Tap the heart on venues and services to keep them here.</p>}</div></section>
      <section className="ce-card hm-sched"><div className="k-between hm-h"><h2>My Schedule</h2><span className="hm-day"><Link href={`/home?day=${shift(-1)}`} aria-label="Previous day"><ChevronLeft size={18} /></Link><b>{isToday ? "Today" : new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</b><Link href={`/home?day=${shift(1)}`} aria-label="Next day"><ChevronRight size={18} /></Link></span></div>
        <ul>{schedule.map((s, i) => { const I = KIND[s.kind] ?? ListChecks; return <li key={s.id}><time>{t12(s.at)}</time><i className={`hm-dot c${i % 3}`} /><Link href={s.href} className="hm-slot"><I size={17} /><span className="k-grow"><b>{s.title}</b><em>{s.sub}</em></span><ChevronRight size={16} /></Link></li>; })}{!schedule.length && <li className="hm-free"><CalendarDays size={18} />Nothing scheduled {isToday ? "today" : "this day"}.</li>}</ul></section>
    </div>
    <section className="hm-agent"><div className="hm-agent-id"><span className="hm-agent-ic"><Sparkles size={26} /></span><div><b>Gala Agent</b><span>Your personal event assistant.</span><small>Get tailored event recommendations, manage your bookings, and discover new experiences — all in one place.</small></div></div>
      <div className="hm-agent-main"><div className="hm-prompts">{([[Star, "Find events near me this weekend", `/discover?tab=events&results=1&when=weekend`], [Lightbulb, `Show rooftop venues in ${city}`, `/discover?tab=venues&results=1&q=rooftop`], [BellRing, "Alert me when tickets for popular events drop", "/account/saved?tab=events"], [Users, "Suggest events for my interests", "/discover?tab=events&results=1"]] as const).map(([I, t, h]) => <Link key={t} href={h} className="hm-prompt"><I size={20} /><span>{t}</span><ArrowRight size={16} /></Link>)}</div>
        <AgentAsk scope="customer" placeholder="Ask Gala Agent anything..." compact /></div></section>
  </div>;
}
