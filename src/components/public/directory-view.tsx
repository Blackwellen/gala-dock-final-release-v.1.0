import Link from "next/link";
import { CalendarDays, MapPin, Search, ArrowRight, ChevronLeft, ChevronRight, Sparkles, Megaphone, Ticket, LayoutGrid, Music2, Moon, Utensils, Palette, Users, Briefcase, Trophy, HeartPulse, PartyPopper, Mic2, Gift, Video, CircleDot } from "lucide-react";
import type { DirEvent, Directory, Facets, CalendarDay } from "@/lib/public/directory";
import { cityLabel } from "@/lib/public/directory";
import { eventTypeLabel } from "@/lib/format";
import { FollowButton } from "@/components/public/follow-button";

/**
 * Public events directory (London Events Discovery Marketplace reference, PUB-241): hero, category strip, search + date
 * windows, featured (editorial) and sponsored rows kept apart from the chronological organic list, month calendar, popular
 * dates, explore-by-type and a follow CTA. Every count comes from the directory reads; nothing is invented.
 */
const TZ = "Europe/London";
const ICON: Record<string, typeof Music2> = { music: Music2, nightlife: Moon, food_drink: Utensils, arts_culture: Palette, family: Users, business: Briefcase, sports: Trophy,
  wellness: HeartPulse, festival: PartyPopper, conference: Mic2, comedy: Mic2, party: Gift, webinar: Video, charity: HeartPulse, gala: Sparkles, community: Users };
export const dayBadge = (iso: string) => { const d = new Date(iso); return { m: d.toLocaleDateString("en-GB", { month: "short", timeZone: TZ }).toUpperCase(), d: d.toLocaleDateString("en-GB", { day: "2-digit", timeZone: TZ }) }; };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const price = (p: number | null | undefined) => p == null ? null : p === 0 ? "Free" : `From £${Number.isInteger(p) ? p : p.toFixed(2)}`;

export function EventCard({ e, tag }: { e: DirEvent; tag?: { text: string; tone: "featured" | "sponsored" } }) {
  const b = dayBadge(e.starts_at); const p = price(e.from_price);
  return <article className="dir-card">
    <Link href={`/events/${e.slug ?? e.id}`} className="dir-card-img" aria-label={`${e.name}, ${when(e.starts_at)}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/oe-neon.webp"} alt="" loading="lazy" />
      {tag && <span className={`dir-tag ${tag.tone}`}>{tag.text}</span>}
      <span className="dir-date"><small>{b.m}</small><b>{b.d}</b></span>
    </Link>
    <div className="dir-card-b">
      <h3><Link href={`/events/${e.slug ?? e.id}`}>{e.name}</Link></h3>
      <p><MapPin size={13} aria-hidden />{[e.venue_name, e.city].filter(Boolean).join(", ") || "Location to be announced"}</p>
      <p><CalendarDays size={13} aria-hidden />{when(e.starts_at)}</p>
      <div className="dir-card-f">{e.event_type && <span className="dir-chip">{eventTypeLabel(e.event_type)}</span>}{p && <b className="dir-price">{p}</b>}</div>
    </div>
  </article>;
}

export type DirectoryViewProps = {
  heading: string; eyebrow: string; intro: string; place: string; basePath: string;
  dir: Directory; facets: Facets; activeCategory?: string | null; activeCity?: string | null;
  q: string; range: "upcoming" | "today" | "weekend" | "month"; page: number; pageSize: number;
  month: { label: string; anchor: string; prev: string; next: string; days: CalendarDay[] };
  popular: { label: string; href: string; count: number }[];
  follow?: { kind: "city" | "category"; subject: string; following: boolean; signedIn: boolean } | null;
  hero?: string | null;
};

export function DirectoryView(p: DirectoryViewProps) {
  const qs = (o: Record<string, string | number | null | undefined>) => { const u = new URLSearchParams(); const m = { q: p.q || null, when: p.range === "upcoming" ? null : p.range, page: null, ...o }; for (const [k, v] of Object.entries(m)) if (v != null && v !== "" && !(k === "page" && Number(v) <= 1)) u.set(k, String(v)); const s = u.toString(); return s ? `?${s}` : ""; };
  const at = p.place ? ` ${p.place}` : "";
  const shown = p.dir.events; const from = (p.page - 1) * p.pageSize;
  const sponsored = p.dir.featured.filter(f => f.sponsored); const editorial = p.dir.featured.filter(f => !f.sponsored);
  const ranges = [["today", "Today"], ["weekend", "This weekend"], ["month", "This month"], ["upcoming", "Upcoming"]] as const;
  return <div className="dir">
    <section className="dir-hero" style={p.hero ? { backgroundImage: `linear-gradient(90deg, #0b1437e6 0%, #0b143799 55%, #0b143733 100%), url(${p.hero})` } : undefined}>
      <div className="dir-hero-in">
        <span className="dir-eyebrow"><CircleDot size={10} aria-hidden />{p.eyebrow}</span>
        <h1>{p.heading}</h1>
        <p>{p.intro}</p>
        <dl className="dir-stats"><div><dt><CalendarDays size={20} aria-hidden /></dt><dd><b>{p.dir.total.toLocaleString("en-GB")}</b><small>Upcoming events</small></dd></div>
          <div><dt><LayoutGrid size={20} aria-hidden /></dt><dd><b>{p.facets.categories.length}</b><small>Categories</small></dd></div>
          <div><dt><MapPin size={20} aria-hidden /></dt><dd><b>{p.facets.cities.length}</b><small>Cities</small></dd></div></dl>
      </div>
    </section>

    <nav className="dir-cats" aria-label="Event types">
      <Link href={p.activeCity ? `/events/in/${p.activeCity}` : "/events"} aria-current={!p.activeCategory ? "page" : undefined}><span><Ticket size={18} aria-hidden /></span>All events</Link>
      {p.facets.categories.slice(0, 10).map(c => { const I = ICON[c.key] ?? Sparkles; return <Link key={c.key} href={`/events/category/${encodeURIComponent(c.key)}`} aria-current={p.activeCategory === c.key ? "page" : undefined}><span><I size={18} aria-hidden /></span>{eventTypeLabel(c.key)}</Link>; })}
    </nav>

    <div className="dir-grid">
      <div className="dir-main">
        <div className="dir-find">
          <div><h2>Find events{at}</h2><p>Explore {p.dir.total.toLocaleString("en-GB")} upcoming event{p.dir.total === 1 ? "" : "s"}. Filter by date and type.</p></div>
          {p.follow && <FollowButton kind={p.follow.kind} subject={p.follow.subject} initial={p.follow.following} signedIn={p.follow.signedIn} next={p.basePath} label={p.follow.kind === "city" ? "Follow this city" : "Follow this category"} />}
        </div>
        <form className="dir-filters" action={p.basePath} role="search">
          <label className="dir-search"><Search size={16} aria-hidden /><input name="q" defaultValue={p.q} placeholder={`Search events${at}…`} aria-label="Search events" /></label>
          {p.range !== "upcoming" && <input type="hidden" name="when" value={p.range} />}
          <button className="k-btn primary" type="submit">Search</button>
        </form>
        <div className="dir-chips" role="group" aria-label="Dates">{ranges.map(([k, l]) => <Link key={k} href={`${p.basePath}${qs({ when: k === "upcoming" ? null : k })}`} aria-current={p.range === k ? "page" : undefined}>{l}</Link>)}
          <Link href={`/events/calendar${p.activeCity ? `?city=${p.activeCity}` : ""}`} className="dir-chip-cal"><CalendarDays size={14} aria-hidden />Calendar</Link></div>

        {editorial.length > 0 && <section className="dir-sec" aria-labelledby="dir-feat"><div className="dir-sec-h"><div><h2 id="dir-feat">Featured events</h2><p>Picked by the Gala Dock team</p></div></div>
          <div className="dir-cards three">{editorial.slice(0, 3).map(f => <EventCard key={f.event.id} e={f.event} tag={{ text: f.label || "Featured", tone: "featured" }} />)}</div></section>}
        {sponsored.length > 0 && <section className="dir-sec dir-spons" aria-labelledby="dir-spons"><div className="dir-sec-h"><div><h2 id="dir-spons"><Megaphone size={16} aria-hidden />Sponsored</h2><p>Paid placements, shown separately from the event list below.</p></div></div>
          <div className="dir-cards three">{sponsored.slice(0, 3).map(f => <EventCard key={f.event.id} e={f.event} tag={{ text: "Sponsored", tone: "sponsored" }} />)}</div></section>}

        <section className="dir-sec" aria-labelledby="dir-all">
          <div className="dir-sec-h"><div><h2 id="dir-all">{p.q ? `Results for “${p.q}”` : `All events${at}`} <span>({p.dir.total.toLocaleString("en-GB")})</span></h2><p>Soonest first</p></div></div>
          {shown.length ? <div className="dir-cards">{shown.map(e => <EventCard key={e.id} e={e} />)}</div>
            : <div className="dir-empty"><CalendarDays size={26} aria-hidden /><b>No events match</b><p>{p.q ? "Try a different search, or clear the filters." : "Nothing is listed for these dates yet. Try another date range."}</p><Link className="k-btn outline" href={p.basePath}>Clear filters</Link></div>}
          {p.dir.total > p.pageSize && <nav className="dir-pager" aria-label="Pages">
            {p.page > 1 ? <Link className="k-btn outline" href={`${p.basePath}${qs({ page: p.page - 1 })}`}><ChevronLeft size={15} aria-hidden />Previous</Link> : <span />}
            <small>Showing {from + 1}–{from + shown.length} of {p.dir.total.toLocaleString("en-GB")} events</small>
            {from + shown.length < p.dir.total ? <Link className="k-btn outline" href={`${p.basePath}${qs({ page: p.page + 1 })}`}>Load more events<ArrowRight size={15} aria-hidden /></Link> : <span />}
          </nav>}
        </section>
      </div>

      <aside className="dir-side">
        <section className="dir-box dir-cal" aria-labelledby="dir-cal-h">
          <div className="dir-cal-h"><h2 id="dir-cal-h">Calendar view</h2><span><Link href={`${p.basePath}${qs({ m: p.month.prev })}`} aria-label="Previous month" className="k-icon-btn plain"><ChevronLeft size={16} /></Link><b>{p.month.label}</b><Link href={`${p.basePath}${qs({ m: p.month.next })}`} aria-label="Next month" className="k-icon-btn plain"><ChevronRight size={16} /></Link></span></div>
          <MonthGrid anchor={p.month.anchor} days={p.month.days} city={p.activeCity ?? null} />
        </section>
        <section className="dir-box" aria-labelledby="dir-pop"><h2 id="dir-pop">Popular dates</h2>
          <ul className="dir-pop">{p.popular.map(x => <li key={x.label}><Link href={x.href}><CalendarDays size={14} aria-hidden />{x.label}<small>{x.count} event{x.count === 1 ? "" : "s"}</small></Link></li>)}</ul></section>
        {p.facets.cities.length > 0 && <section className="dir-box" aria-labelledby="dir-cities"><h2 id="dir-cities">Cities</h2>
          <ul className="dir-pop">{p.facets.cities.slice(0, 8).map(c => <li key={c.key}><Link href={`/events/in/${encodeURIComponent(c.key)}`} aria-current={p.activeCity === c.key ? "page" : undefined}><MapPin size={14} aria-hidden />{cityLabel(c.key)}<small>{c.events} event{c.events === 1 ? "" : "s"}</small></Link></li>)}</ul></section>}
        <section className="dir-host"><h2>Host an event{at}?</h2><p>Create your event page, sell tickets and book venues and suppliers in one place.</p><Link className="k-btn primary" href="/register?intent=organizer">List your event <ArrowRight size={15} aria-hidden /></Link></section>
      </aside>
    </div>

    {p.facets.categories.length > 0 && <section className="dir-explore" aria-labelledby="dir-exp"><div className="dir-sec-h"><div><h2 id="dir-exp">Explore by event type</h2></div></div>
      <ul>{p.facets.categories.slice(0, 6).map(c => { const I = ICON[c.key] ?? Sparkles; return <li key={c.key}><Link href={`/events/category/${encodeURIComponent(c.key)}`}><span className="dir-exp-ic"><I size={22} aria-hidden /></span><b>{eventTypeLabel(c.key)}</b><small>{c.events} event{c.events === 1 ? "" : "s"}</small></Link></li>; })}</ul></section>}
  </div>;
}

function MonthGrid({ anchor, days, city }: { anchor: string; days: CalendarDay[]; city: string | null }) {
  const [y, m] = anchor.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1)); const lead = (first.getUTCDay() + 6) % 7; const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const busy = new Map(days.map(d => [d.date, d.events.length]));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)] as (number | null)[];
  return <div className="dir-month" role="grid" aria-label="Month">
    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span key={d} className="dir-dow" role="columnheader">{d}</span>)}
    {cells.map((d, i) => { if (!d) return <span key={`x${i}`} />; const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; const c = busy.get(iso) ?? 0;
      return c ? <Link key={iso} role="gridcell" href={`/events/calendar?range=today&date=${iso}${city ? `&city=${city}` : ""}`} className={`dir-day on ${iso === today ? "today" : ""}`} aria-label={`${d} — ${c} event${c === 1 ? "" : "s"}`}>{d}</Link>
        : <span key={iso} role="gridcell" className={`dir-day ${iso === today ? "today" : ""}`}>{d}</span>; })}
  </div>;
}
