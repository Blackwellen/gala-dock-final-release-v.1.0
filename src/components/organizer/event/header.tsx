import Link from "next/link";
import { CalendarDays, Clock, MapPin, Play, LayoutDashboard, ListChecks, Megaphone, Settings2, Wallet, Video, MoreHorizontal, ChevronDown } from "lucide-react";
import { Crumbs } from "@/components/kit";
import { dateLong, timeRange, eventTypeLabel } from "@/lib/format";
import type { ProEvent } from "@/lib/data/event";
import { StatusMenu, HeroActions, TabActions } from "./controls";

export const EVENT_TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "plan", label: "Plan", icon: ListChecks },
  { key: "sell", label: "Sell & Promote", icon: Megaphone },
  { key: "operations", label: "Operations", icon: Settings2 },
  { key: "money", label: "Money", icon: Wallet },
] as const;
export type EventTab = typeof EVENT_TABS[number]["key"];

/** Shared professional event header: breadcrumb, hero, five tabs, contextual actions. */
export function EventHeader({ e, tab, canMoney }: { e: ProEvent; tab: EventTab | null; canMoney: boolean }) {
  const hero = (e.settings.hero_image as string | undefined) || e.cover_image;
  const isPublic = e.visibility === "public" && ["published", "on_sale", "live"].includes(e.status);
  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Events", href: "/organizer/events" }, { label: e.name, href: `/organizer/events/${e.id}` }]} />
    <section className="eh-hero" aria-label={`${e.name} header`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {hero && <img src={hero} alt="" />}
      <div className="eh-hero-text">
        <span className="eh-type">{eventTypeLabel(e.event_type).toUpperCase()}</span>
        <h1>{e.name}</h1>
        <div className="eh-meta"><span><CalendarDays size={16} />{dateLong(e.starts_at, e.timezone)}</span><span><Clock size={16} />{timeRange(e.starts_at, e.ends_at, e.timezone)}</span><span><MapPin size={16} />{[e.venue_name, e.city].filter(Boolean).join(", ") || "Venue to be confirmed"}</span></div>
      </div>
      {hero && <span className="eh-play" aria-hidden><Play size={18} fill="currentColor" /></span>}
      <div className="eh-hero-actions">{(["virtual_event", "live_audio", "podcast_recording", "hybrid", "remote_conference"].includes(e.event_type) || ((e.settings ?? {}) as { virtual?: boolean }).virtual === true) && <Link className="k-btn outline eh-online" href={`/organizer/events/${e.id}/virtual`}><Video size={15} />Online session</Link>}<StatusMenu id={e.id} status={e.status} /><HeroActions id={e.id} name={e.name} slug={e.slug} isPublic={isPublic} /></div>
    </section>
    <div className="eh-tabs">
      <nav className="k-tabs" aria-label="Event sections" style={{ borderBottom: 0 }}>{EVENT_TABS.filter(t => t.key !== "money" || canMoney).map(t => <Link key={t.key} href={`/organizer/events/${e.id}${t.key === "overview" ? "" : `?tab=${t.key}`}`} className="k-tab" aria-current={tab === t.key ? "page" : undefined} scroll={false}>{t.label}</Link>)}</nav>
      <TabActions id={e.id} name={e.name} status={e.status} basics={{ name: e.name, description: e.description, starts_at: e.starts_at, ends_at: e.ends_at, venue_name: e.venue_name, location: e.location, capacity: e.capacity, client_name: e.client_name, tags: e.tags }} />
    </div>
  </>;
}

/** Section sub-tabs (URL driven). External sections link to dedicated editor routes. */
type SubTab = { key: string; label: string; href: string; icon: React.ComponentType<{ size?: number }> };
/** `more` sections sit behind a "More" disclosure so the row stays on one line at 1536. When one of them is active, the disclosure
 *  itself shows that section (highlighted, current) and the menu lists the others — the row never grows. */
export function SubTabs({ items, current, more = [] }: { items: SubTab[]; current: string; more?: SubTab[] }) {
  const active = more.find(i => i.key === current);
  const nav = <nav className="eh-sub" aria-label="Section">{items.map(i => <Link key={i.key} href={i.href} className="eh-subtab" aria-current={i.key === current ? "page" : undefined} scroll={false}><i.icon size={16} />{i.label}</Link>)}</nav>;
  if (!more.length) return nav;
  return <div className="eh-sub-wrap">{nav}
    <details className="eh-more"><summary className={`eh-subtab${active ? " on" : ""}`} aria-label={active ? `${active.label} (more sections)` : "More sections"}>{active ? <><active.icon size={16} />{active.label}</> : <><MoreHorizontal size={16} />More</>}<ChevronDown size={14} aria-hidden /></summary>
      <div className="eh-more-menu" role="menu">{more.map(i => <Link key={i.key} href={i.href} className="eh-more-item" role="menuitem" aria-label={i.label} aria-current={i.key === current ? "page" : undefined} scroll={false}><i.icon size={15} />{i.label}</Link>)}</div></details></div>;
}
