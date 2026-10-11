import Link from "next/link";
import { CalendarDays, MapPin, Users, LayoutGrid, ListChecks, Ticket, Wallet, MessagesSquare, ArrowLeft, Crown } from "lucide-react";
import { Countdown } from "@/components/kit/client";
import { HeaderMenu } from "./build-client";
import { dateLong, timeRange12, relative, eventTypeLabel } from "@/lib/format";
import type { MyEventFull } from "@/lib/data/customer-events";

export const CU_TABS = [
  { key: "build", label: "Build", icon: LayoutGrid, path: "" },
  { key: "plan", label: "Plan", icon: ListChecks, path: "/plan" },
  { key: "guests", label: "Guests & Tickets", icon: Ticket, path: "/guests-tickets" },
  { key: "money", label: "Money", icon: Wallet, path: "/money" },
  { key: "messages", label: "Messages", icon: MessagesSquare, path: "/messages" },
] as const;

/** Customer event hero + tabs. variant "full" (profile) shows the countdown; "compact" (build canvas & sub-pages) shows a thumbnail. */
export function CuEventHeader({ d, tab, variant = "compact", buildPath = false }: { d: MyEventFull; tab: string; variant?: "full" | "compact"; buildPath?: boolean }) {
  const e = d.e;
  // Designed heroes ship with their own shading ("baked"); user photos get the legibility gradient.
  const byTab = (e.settings.hero_compact_tabs ?? {}) as Record<string, string>;
  const baked = variant === "compact" ? (byTab[tab] || (e.settings.hero_compact as string | undefined)) : undefined;
  const hero = variant === "compact" ? (baked || (e.settings.hero_image as string | undefined) || "/assets/gd/hero-wedding-compact.webp") : ((e.settings.hero_image as string | undefined) || "/assets/gd/hero-wedding.webp");
  const thumb = (e.settings.thumb as string | undefined) || e.cover_image || hero;
  const onTrack = d.readiness.score >= 50;
  return <>
    <section className={`ce-hero ${variant}${baked ? " baked" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={hero} alt="" className="ce-hero-bg" />
      {variant === "compact" && /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumb} alt="" className="ce-thumb" />}
      <div className="ce-hero-text">
        <div className="ce-chips"><span className="ce-chip purple">{eventTypeLabel(e.event_type)}</span><span className="ce-chip">{e.visibility === "public" ? "Public Event" : "Private Event"}</span></div>
        <h1>{e.name}</h1>
        <div className="ce-meta">
          <span><CalendarDays size={variant === "full" ? 26 : 24} strokeWidth={1.7} /><span><b>{dateLong(e.starts_at).replace(/^(\w+), /, "$1, ")}</b><small>{timeRange12(e.starts_at, e.ends_at)}</small></span></span>
          <span><MapPin size={variant === "full" ? 26 : 24} strokeWidth={1.7} /><span><b>{e.venue_name || "Venue to be confirmed"}</b><small>{e.location}</small></span></span>
          <span><Users size={variant === "full" ? 26 : 24} strokeWidth={1.7} /><span><b>{e.guest_count} guests</b><small>{e.capacity ? `Max ${e.capacity}` : "Capacity TBC"}</small></span></span>
          {variant === "compact" && <span className={`ce-ontrack ce-ontrack-c ${onTrack ? "" : "warn"}`}>{onTrack ? "On track" : "Needs attention"}</span>}
          {variant === "full" && <span className="ce-track"><span className={`ce-ontrack ${onTrack ? "" : "warn"}`}>{onTrack ? "On track" : "Needs attention"}</span><small>Updated {relative(new Date(Date.now() - 2 * 36e5).toISOString())}</small></span>}
        </div>
      </div>
      <div className="ce-hero-right">
        {variant === "full" && e.starts_at && new Date(e.starts_at).getTime() > Date.now() && <div className="ce-count"><Countdown to={e.starts_at} /></div>}
        <div className="k-row" style={{ gap: 10 }}>
          {e.visibility === "public" && e.slug ? <Link className="k-btn ghost ce-btn" href={`/events/${e.slug}`}>Preview Event Page</Link> : <Link className="k-btn ghost ce-btn" href={`/account/events/${e.id}/guests-tickets`}>Preview Event Page</Link>}
          <HeaderMenu id={e.id} name={e.name} />
        </div>
      </div>
    </section>
    <div className="ce-tabs">
      {buildPath && <Link className="ce-back" href="/account/events"><ArrowLeft size={15} />Back to My Events</Link>}
      <div className="ce-tabcard"><nav className="ce-tablist" aria-label="Event sections">{CU_TABS.map(t => <Link key={t.key} href={t.key === "build" ? (buildPath ? `/account/events/${e.id}/build` : `/account/events/${e.id}`) : `/account/events/${e.id}${t.path}`} className="ce-tab" aria-current={tab === t.key ? "page" : undefined}><t.icon size={18} />{t.label}</Link>)}</nav>
      <Link className="k-btn outline ce-upgrade" href={`/account/events?upgrade=${e.id}`}><Crown size={16} />Upgrade to Organizer Mode</Link></div>
    </div>
  </>;
}
