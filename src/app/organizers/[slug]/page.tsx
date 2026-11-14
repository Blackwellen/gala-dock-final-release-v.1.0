import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache, type CSSProperties } from "react";
import { ArrowRight, BadgeCheck, CalendarDays, MapPin, Ticket, Users, Camera, Sparkles, Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { eventTypeLabel } from "@/lib/format";
import { FollowButton } from "@/components/public/follow-button";
import { accentVars } from "@/lib/brand/accent";
import { siteUrl } from "@/lib/site-url";
import { jsonLdScript, organizerJsonLd, websiteHref } from "@/lib/profiles/rules";

const TZ = "Europe/London";
type Org = { id: string; name: string; cover_image: string | null; verified: boolean; created_at: string; events_count: number; upcoming: number; description: string | null; website: string | null; brand_color: string | null };
// Q62: public_organizer_profile (not public_workspace) so what the organiser edits in Settings — description, website, brand colour — reaches
// the page; cached per request so generateMetadata and the page share one load.
const load = cache(async (id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_organizer_profile" as never, { p_workspace: id } as never);
  const w = ((data ?? []) as Org[])[0];
  if (!w) return null;
  const { data: events } = await supabase.from("events_public").select("id,name,slug,starts_at,city,venue_name,cover_image,event_type,status,tags").eq("workspace_id", id).eq("visibility", "public").in("status", ["published", "on_sale", "live"]).order("starts_at");
  return { supabase, w, events: events ?? [] };
});
/** Profile URLs are the workspace id; an upper-case copy would be a second URL for the same page. */
async function idOf(params: Promise<{ slug: string }>) {
  const raw = (await params).slug; const id = raw.toLowerCase();
  if (raw !== id && /^[0-9a-f-]{36}$/.test(id)) permanentRedirect(`/organizers/${id}`);
  return id;
}
const aboutText = (w: Org) => w.description || `Upcoming public events from ${w.name} on Gala Dock.`;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const id = await idOf(params); const r = await load(id);
  if (!r) return { title: "Organiser not found", robots: { index: false } };
  const description = aboutText(r.w).slice(0, 160);
  return { title: `${r.w.name} — events`, description, alternates: { canonical: `/organizers/${id}` },
    openGraph: { title: `${r.w.name} — events`, description, url: `/organizers/${id}`, type: "profile", images: r.w.cover_image ? [r.w.cover_image] : [] },
    twitter: { card: r.w.cover_image ? "summary_large_image" : "summary", title: `${r.w.name} — events`, description } };
}
type Ev = { id: string; name: string; slug: string | null; starts_at: string | null; city: string | null; venue_name: string | null; cover_image: string | null; event_type: string | null; tags: string[] | null };
function EventCard({ e, past = false }: { e: Ev; past?: boolean }) {
  const d = e.starts_at ? new Date(e.starts_at) : null;
  const href = `/events/${e.slug ?? e.id}`;
  return <article className="ce-card og3-ev">
    <Link href={href} className="og3-ev-img" tabIndex={-1} aria-hidden="true">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/oe-neon.webp"} alt="" />{d && !past && <span className="pl3-date"><small>{d.toLocaleDateString("en-GB", { month: "short", timeZone: TZ })}</small><b>{d.toLocaleDateString("en-GB", { day: "2-digit", timeZone: TZ })}</b></span>}</Link>
    <div><Link href={href} className="og3-ev-name">{e.name}</Link>
      {past && <small><CalendarDays size={13} />{d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "Date TBC"}</small>}
      <small><MapPin size={13} />{[e.venue_name, e.city].filter(Boolean).join(", ") || "Online"}</small>
      {!past && <span className="og3-tags"><i>{eventTypeLabel(e.event_type)}</i>{(e.tags ?? []).filter(t => !t.includes("_")).slice(0, 1).map(t => <i key={t}>{t}</i>)}</span>}
      {!past && <Link className="k-btn primary og3-cta" href={href}><Ticket size={15} />View event <ArrowRight size={14} /></Link>}</div>
  </article>;
}

/** Public organiser profile after PUB-242: full-bleed hero, tabs, upcoming / past events, stat strip, about + media, footer. */
export default async function OrganizerProfile({ params }: { params: Promise<{ slug: string }> }) {
  const id = await idOf(params); const r = await load(id); if (!r) notFound();
  const { supabase, w, events } = r; const now = new Date().toISOString();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: followRow } = user ? await supabase.from("follows").select("subject_key").eq("subject_kind", "organizer").eq("subject_key", id).maybeSingle() : { data: null };
  const upcoming = events.filter(e => (e.starts_at ?? "") >= now);
  const past = events.filter(e => (e.starts_at ?? "") < now).reverse();
  // Q62: the "average rating" was the mean of events.settings.rating — a value the organiser types into their own event settings, not
  // reviews. Showing it as a rating is a fake-review risk (DMCC Act 2024), so it is gone until events have real attendee reviews.
  const cities = [...new Set(events.map(e => e.city).filter(Boolean))] as string[];
  const types = [...new Set(events.map(e => eventTypeLabel(e.event_type)))].slice(0, 5);
  const photos = events.filter(e => e.cover_image).slice(0, 6).map(e => ({ src: e.cover_image as string, alt: `${e.name} — event photo` }));
  const since = new Date(w.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const hero = w.cover_image || upcoming[0]?.cover_image || "/assets/gd/hero-neon.webp";
  const site = websiteHref(w.website);
  const brand = accentVars(w.brand_color);   // Q67 accent, clamped to WCAG AA; Gala Dock buttons and navigation keep their colours
  const ld = organizerJsonLd({ name: w.name, url: `${siteUrl()}/organizers/${id}`, description: w.description, image: w.cover_image, website: site });
  return <div className={`og3${brand["--org-accent"] ? " pe-branded" : ""}`} style={brand as CSSProperties}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
    <section className="pl3-hero og3-hero" aria-labelledby="og-title">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="pl3-hero-bg" src={hero} alt="" />
      <div className="og3-acts"><FollowButton kind="organizer" subject={id} label="Follow" initial={!!followRow} signedIn={!!user} next={`/organizers/${id}`} /><a className="k-btn primary" href="#upcoming"><Ticket size={15} />See events</a></div>
      <div className="pl3-hero-copy"><span className="og3-logo" aria-hidden="true" style={brand["--org-accent"] ? { background: "var(--org-accent)", color: "var(--org-accent-on)" } : undefined}>{w.name.slice(0, 1)}</span>
        <h1 id="og-title">{w.name} {w.verified && <BadgeCheck size={30} aria-label="Verified organiser" />}</h1><p>Event organiser on Gala Dock since {since}</p>
        <div className="pl3-meta">{cities[0] && <span><MapPin size={16} />{cities[0]}{cities.length > 1 ? ` + ${cities.length - 1} more` : ""}</span>}<span><CalendarDays size={16} />{w.events_count} public events</span><span><Users size={16} />{w.upcoming} upcoming</span></div>
        {types.length > 0 && <div className="pl3-chips">{types.map(c => <span key={c}>{c}</span>)}</div>}</div>
      {photos.length > 1 && <div className="pl3-mosaic">{photos.slice(1, 3).map((p, i) => <a key={p.src + i} href="#media" className={`pl3-m${i}`} aria-label={`View photo ${i + 2}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.src} alt="" /></a>)}<a href="#media" className="pl3-m3" aria-label="View media"><Camera size={16} /><b>{photos.length}</b><small>Photos</small></a></div>}
    </section>
    <nav className="pe3-tabs" aria-label="Sections">{[["upcoming", "Upcoming events"], ["past", "Past events"], ["about", "About"], ["media", "Media"]].filter(([k]) => (k !== "past" || past.length > 0) && (k !== "media" || photos.length > 0)).map(([k, l], i) => <a key={k} href={`#${k}`} className={i === 0 ? "on" : ""}>{l}</a>)}</nav>
    <section id="upcoming" className="pl3-row"><div className="k-between"><h2>Upcoming events <span className="og3-n">({upcoming.length})</span></h2></div>
      {upcoming.length ? <div className="pl3-g4">{upcoming.map(e => <EventCard key={e.id} e={e} />)}</div> : <p className="ce-card k-small">No upcoming public events right now.</p>}</section>
    {past.length > 0 && <section id="past" className="pl3-row"><div className="k-between"><h2>Past events</h2></div><div className="pl3-g4">{past.slice(0, 4).map(e => <EventCard key={e.id} e={e} past />)}</div></section>}
    <dl className="og3-stats"><div className="ce-card"><dt><CalendarDays size={26} /></dt><dd><b>{w.events_count}</b><small>Public events</small></dd></div><div className="ce-card"><dt><Ticket size={26} /></dt><dd><b>{w.upcoming}</b><small>Upcoming</small></dd></div><div className="ce-card"><dt><Sparkles size={26} aria-hidden /></dt><dd><b>{new Date(w.created_at).toLocaleDateString("en-GB", { year: "numeric", timeZone: TZ })}</b><small>On Gala Dock since</small></dd></div><div className="ce-card"><dt><MapPin size={26} /></dt><dd><b>{cities.length || "—"}</b><small>{cities.length === 1 ? "City" : "Cities"}</small></dd></div></dl>
    <section id="about" className="ce-card og3-about"><div><h2>About {w.name}</h2>{w.description ? <p style={{ whiteSpace: "pre-line" }}>{w.description}</p> : <p>{w.name} runs {types.length ? types.join(", ").toLowerCase() : "public"} events{cities.length ? ` in ${cities.slice(0, 3).join(", ")}` : ""} and has been organising on Gala Dock since {since}.</p>}
      {site && <p><a className="k-link" href={site} target="_blank" rel="noopener noreferrer nofollow ugc"><Globe size={14} aria-hidden /> {new URL(site).hostname.replace(/^www\./, "")}<span className="k-sr"> (opens in a new tab)</span></a></p>}
      <ul className="pe3-minis">{[["Event types", types.slice(0, 2).join(" · ") || "Various"], ["Cities", cities.slice(0, 2).join(" · ") || "—"], ["On Gala Dock", `Since ${since}`], ["Verification", w.verified ? "Verified organiser" : "Not yet verified"]].map(([t, s]) => <li key={t}><span><Sparkles size={18} aria-hidden /></span><p><b>{t}</b><small>{s}</small></p></li>)}</ul></div>
      {photos[0] && <a href="#media" className="pl3-feature og3-feature">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photos[0].src} alt="" /><span><b>Recent events</b><small>{photos.length} photos</small></span></a>}</section>
    {photos.length > 0 && <section id="media" className="pl3-row"><div className="k-between"><h2>Media gallery</h2></div><div className="pe3-photos-g">{photos.map((p, i) => <span key={p.src + i}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.src} alt={p.alt} loading="lazy" /></span>)}</div></section>}
  </div>;
}
