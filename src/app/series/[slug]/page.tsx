import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays, MapPin, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { seriesPage } from "@/lib/public/directory";
import { dayBadge } from "@/components/public/directory-view";

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const load = cache(async (slug: string) => SLUG.test(slug) ? seriesPage((await createClient()) as unknown as SupabaseClient, slug) : null);
const KIND: Record<string, string> = { series: "Event series", recurring: "Recurring event", tour: "Tour", festival: "Festival", conference: "Conference" };

export async function generateMetadata({ params }: PageProps<"/series/[slug]">): Promise<Metadata> {
  const { slug } = await params; const s = await load(slug.toLowerCase());
  if (!s) return { title: "Series not found", robots: { index: false } };
  const description = (s.description ?? `${KIND[s.kind] ?? "Series"} on Gala Dock — ${s.occurrences.length} upcoming date${s.occurrences.length === 1 ? "" : "s"}.`).slice(0, 160);
  return { title: s.name, description, alternates: { canonical: `/series/${s.slug}` }, openGraph: { title: s.name, description, url: `/series/${s.slug}`, type: "website" } };
}

/** Public series / tour / festival page (Q40 series_page): only listed dates appear. */
export default async function SeriesPublicPage({ params }: PageProps<"/series/[slug]">) {
  const { slug } = await params; const s = await load(slug.toLowerCase()); if (!s) notFound();
  return <div className="dir">
    <section className="dir-hero slim"><div className="dir-hero-in"><span className="dir-eyebrow"><Repeat size={12} aria-hidden />{KIND[s.kind] ?? "Series"}</span><h1>{s.name}</h1>{s.description && <p>{s.description}</p>}</div></section>
    <section className="dir-sec" aria-labelledby="ser-dates"><div className="dir-sec-h"><div><h2 id="ser-dates">Dates <span>({s.occurrences.length})</span></h2><p>Choose a date to see tickets.</p></div></div>
      {s.occurrences.length ? <ol className="ser-list">{s.occurrences.map(o => { const b = dayBadge(o.starts_at); return <li key={o.id}><Link href={`/events/${o.slug ?? o.id}`}>
        <span className="dir-date static"><small>{b.m}</small><b>{b.d}</b></span>
        <span className="ser-t"><b>{o.name}</b><small><CalendarDays size={13} aria-hidden />{new Date(o.starts_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}</small>
          <small><MapPin size={13} aria-hidden />{[o.venue_name, o.city].filter(Boolean).join(", ") || "Location to be announced"}</small></span>
        <span className="k-btn outline sm">Tickets</span></Link></li>; })}</ol>
        : <div className="dir-empty"><CalendarDays size={26} aria-hidden /><b>No upcoming dates</b><p>New dates appear here as soon as they go on sale.</p><Link className="k-btn outline" href="/events">Browse all events</Link></div>}
    </section>
  </div>;
}
