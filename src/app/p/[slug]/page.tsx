import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { landingPage, type DirEvent } from "@/lib/public/directory";
import { EventCard } from "@/components/public/directory-view";

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const load = cache(async (slug: string) => SLUG.test(slug) ? landingPage((await createClient()) as unknown as SupabaseClient, slug) : null);

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params; const l = await load(slug.toLowerCase());
  if (!l) return { title: "Page not found", robots: { index: false } };
  const description = (l.intro ?? l.title).slice(0, 160);
  return { title: l.title, description, alternates: { canonical: `/p/${l.slug}` }, openGraph: { title: l.title, description, url: `/p/${l.slug}`, type: "website", images: l.hero ? [l.hero.url] : [] } };
}

/** Promo landing page (Q23 landing_page): curated listed events; paid placements are a separate row labelled "Sponsored". */
export default async function PromoLanding({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params; const l = await load(slug.toLowerCase()); if (!l) notFound();
  const events = l.events.map(e => ({ ...e, event_type: null, venue_name: null, ends_at: null, timezone: null })) as DirEvent[];
  const sponsoredIds = new Set(l.sponsored.map(s => s.event_id));
  const organic = events.filter(e => !sponsoredIds.has(e.id));
  return <div className="dir">
    <section className="dir-hero slim" style={l.hero ? { backgroundImage: `linear-gradient(90deg, #0b1437e6, #0b143766), url(${l.hero.url})` } : undefined}>
      <div className="dir-hero-in"><h1>{l.title}</h1>{l.intro && <p>{l.intro}</p>}{l.hero?.credit && <small className="dir-credit">Photo: {l.hero.credit}</small>}</div></section>
    {l.sponsored.length > 0 && <section className="dir-sec dir-spons" aria-labelledby="lp-spons"><div className="dir-sec-h"><div><h2 id="lp-spons"><Megaphone size={16} aria-hidden />Sponsored</h2><p>Paid placements, shown separately.</p></div></div>
      <div className="dir-cards three">{l.sponsored.map(s => { const e = events.find(x => x.id === s.event_id); return e ? <EventCard key={s.event_id} e={e} tag={{ text: "Sponsored", tone: "sponsored" }} /> : null; })}</div></section>}
    <section className="dir-sec" aria-labelledby="lp-ev"><div className="dir-sec-h"><div><h2 id="lp-ev">Events</h2></div></div>
      {organic.length ? <div className="dir-cards">{organic.map(e => <EventCard key={e.id} e={e} />)}</div>
        : <div className="dir-empty"><b>No events on this page right now</b><Link className="k-btn outline" href="/events">Browse all events</Link></div>}</section>
  </div>;
}
