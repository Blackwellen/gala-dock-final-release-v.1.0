import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, MapPin, Ticket, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { eventTypeLabel } from "@/lib/format";

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_workspace", { p_workspace: id });
  const w = (data ?? [])[0];
  if (!w) return null;
  const { data: events } = await supabase.from("events").select("id,name,slug,starts_at,city,venue_name,cover_image,event_type,status,settings").eq("workspace_id", id).eq("visibility", "public").in("status", ["published", "on_sale", "live"]).order("starts_at");
  return { w, events: events ?? [] };
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await load((await params).slug); return { title: r ? `${r.w.name} — events` : "Organiser not found" };
}
export default async function OrganizerProfile({ params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug); if (!r) notFound();
  const { w, events } = r; const now = new Date().toISOString();
  const upcoming = events.filter(e => (e.starts_at ?? "") >= now);
  const ratings = events.map(e => Number((e.settings as Record<string, unknown>)?.rating ?? 0)).filter(Boolean);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  return <div className="og">
    <section className="og-hero">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={w.cover_image || upcoming[0]?.cover_image || "/assets/gd/hero-neon.webp"} alt="" />
      <div className="og-id"><span className="og-av">{w.name.slice(0, 1)}</span><div><h1>{w.name} {w.verified && <i><BadgeCheck size={16} />Verified organiser</i>}</h1><p>Organising on Gala Dock since {new Date(w.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p></div></div></section>
    <dl className="og-stats"><div><dt>{w.events_count}</dt><dd>Public events</dd></div><div><dt>{w.upcoming}</dt><dd>Upcoming</dd></div><div><dt>{avg ? <><Star size={16} fill="#f59e0b" color="#f59e0b" />{avg.toFixed(1)}</> : "—"}</dt><dd>Average rating</dd></div></dl>
    <section className="ce-card og-list"><h2>Upcoming events</h2>
      <div className="og-grid">{upcoming.map(e => <Link key={e.id} href={e.slug ? `/events/${e.slug}` : "#"} className="og-card">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><div><span className="og-type">{eventTypeLabel(e.event_type)}</span><b>{e.name}</b><small><CalendarDays size={13} />{e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "Date TBC"}</small><small><MapPin size={13} />{[e.venue_name, e.city].filter(Boolean).join(", ")}</small><span className="og-cta"><Ticket size={14} />Get tickets</span></div></Link>)}
        {!upcoming.length && <p className="k-small">No upcoming public events right now.</p>}</div></section>
  </div>;
}
