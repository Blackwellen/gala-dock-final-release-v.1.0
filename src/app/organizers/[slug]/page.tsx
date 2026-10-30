import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarDays, MapPin, Star, Ticket, Users, Camera, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { eventTypeLabel } from "@/lib/format";
import { FollowButton } from "@/components/public/follow-button";

const TZ = "Europe/London";
async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_workspace", { p_workspace: id });
  const w = (data ?? [])[0];
  if (!w) return null;
  const { data: events } = await supabase.from("events_public").select("id,name,slug,starts_at,city,venue_name,cover_image,event_type,status,settings,tags").eq("workspace_id", id).eq("visibility", "public").in("status", ["published", "on_sale", "live"]).order("starts_at");
  return { supabase, w, events: events ?? [] };
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const id = (await params).slug; const r = await load(id);
  return r ? { title: `${r.w.name} — events`, description: `Upcoming public events from ${r.w.name} on Gala Dock.`, alternates: { canonical: `/organizers/${id}` }, openGraph: { title: `${r.w.name} — events`, url: `/organizers/${id}`, type: "profile", images: r.w.cover_image ? [r.w.cover_image] : [] } } : { title: "Organiser not found", robots: { index: false } };
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
  const id = (await params).slug; const r = await load(id); if (!r) notFound();
  const { supabase, w, events } = r; const now = new Date().toISOString();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: followRow } = user ? await supabase.from("follows").select("subject_key").eq("subject_kind", "organizer").eq("subject_key", id).maybeSingle() : { data: null };
  const upcoming = events.filter(e => (e.starts_at ?? "") >= now);
  const past = events.filter(e => (e.starts_at ?? "") < now).reverse();
  const ratings = events.map(e => Number((e.settings as Record<string, unknown>)?.rating ?? 0)).filter(Boolean);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const cities = [...new Set(events.map(e => e.city).filter(Boolean))] as string[];
  const types = [...new Set(events.map(e => eventTypeLabel(e.event_type)))].slice(0, 5);
  const photos = events.map(e => e.cover_image).filter(Boolean).slice(0, 6) as string[];
  const since = new Date(w.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const hero = w.cover_image || upcoming[0]?.cover_image || "/assets/gd/hero-neon.webp";
  return <div className="og3">
    <section className="pl3-hero og3-hero" aria-labelledby="og-title">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="pl3-hero-bg" src={hero} alt="" />
      <div className="og3-acts"><FollowButton kind="organizer" subject={id} label="Follow" initial={!!followRow} signedIn={!!user} next={`/organizers/${id}`} /><a className="k-btn primary" href="#upcoming"><Ticket size={15} />See events</a></div>
      <div className="pl3-hero-copy"><span className="og3-logo" aria-hidden="true">{w.name.slice(0, 1)}</span>
        <h1 id="og-title">{w.name} {w.verified && <BadgeCheck size={30} aria-label="Verified organiser" />}</h1><p>Event organiser on Gala Dock since {since}</p>
        <div className="pl3-meta">{cities[0] && <span><MapPin size={16} />{cities[0]}{cities.length > 1 ? ` + ${cities.length - 1} more` : ""}</span>}<span><CalendarDays size={16} />{w.events_count} public events</span><span><Users size={16} />{w.upcoming} upcoming</span>{avg && <span><Star size={16} fill="#f59e0b" color="#f59e0b" />{avg.toFixed(1)} average rating</span>}</div>
        {types.length > 0 && <div className="pl3-chips">{types.map(c => <span key={c}>{c}</span>)}</div>}</div>
      {photos.length > 1 && <div className="pl3-mosaic">{photos.slice(1, 3).map((p, i) => <a key={p + i} href="#media" className={`pl3-m${i}`} aria-label={`View photo ${i + 2}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt="" /></a>)}<a href="#media" className="pl3-m3" aria-label="View media"><Camera size={16} /><b>{photos.length}</b><small>Photos</small></a></div>}
    </section>
    <nav className="pe3-tabs" aria-label="Sections">{[["upcoming", "Upcoming events"], ["past", "Past events"], ["about", "About"], ["media", "Media"]].filter(([k]) => (k !== "past" || past.length > 0) && (k !== "media" || photos.length > 0)).map(([k, l], i) => <a key={k} href={`#${k}`} className={i === 0 ? "on" : ""}>{l}</a>)}</nav>
    <section id="upcoming" className="pl3-row"><div className="k-between"><h2>Upcoming events <span className="og3-n">({upcoming.length})</span></h2></div>
      {upcoming.length ? <div className="pl3-g4">{upcoming.map(e => <EventCard key={e.id} e={e} />)}</div> : <p className="ce-card k-small">No upcoming public events right now.</p>}</section>
    {past.length > 0 && <section id="past" className="pl3-row"><div className="k-between"><h2>Past events</h2></div><div className="pl3-g4">{past.slice(0, 4).map(e => <EventCard key={e.id} e={e} past />)}</div></section>}
    <dl className="og3-stats"><div className="ce-card"><dt><CalendarDays size={26} /></dt><dd><b>{w.events_count}</b><small>Public events</small></dd></div><div className="ce-card"><dt><Ticket size={26} /></dt><dd><b>{w.upcoming}</b><small>Upcoming</small></dd></div><div className="ce-card"><dt><Star size={26} /></dt><dd><b>{avg ? `${avg.toFixed(1)}/5` : "—"}</b><small>Average event rating</small></dd></div><div className="ce-card"><dt><MapPin size={26} /></dt><dd><b>{cities.length || "—"}</b><small>{cities.length === 1 ? "City" : "Cities"}</small></dd></div></dl>
    <section id="about" className="ce-card og3-about"><div><h2>About {w.name}</h2><p>{w.name} runs {types.length ? types.join(", ").toLowerCase() : "public"} events{cities.length ? ` in ${cities.slice(0, 3).join(", ")}` : ""} and has been organising on Gala Dock since {since}.</p>
      <ul className="pe3-minis">{[["Event types", types.slice(0, 2).join(" · ") || "Various"], ["Cities", cities.slice(0, 2).join(" · ") || "—"], ["On Gala Dock", `Since ${since}`], ["Verification", w.verified ? "Verified organiser" : "Not yet verified"]].map(([t, s]) => <li key={t}><span><Sparkles size={18} aria-hidden /></span><p><b>{t}</b><small>{s}</small></p></li>)}</ul></div>
      {photos[0] && <a href="#media" className="pl3-feature og3-feature">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photos[0]} alt="" /><span><b>Recent events</b><small>{photos.length} photos</small></span></a>}</section>
    {photos.length > 0 && <section id="media" className="pl3-row"><div className="k-between"><h2>Media gallery</h2></div><div className="pe3-photos-g">{photos.map((p, i) => <span key={p + i}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt="" loading="lazy" /></span>)}</div></section>}
  </div>;
}
