import "@/styles/public-event-extras.css";
import Link from "next/link";
import { Star, Store, Video, Captions, Hand, FileText, AudioLines, CalendarDays, Layers, Ticket, ShoppingBag, ArrowRight, Accessibility, CheckCircle2, Megaphone, ExternalLink } from "lucide-react";
import type { Banner, Extras, PublicAccess, VirtualSession, EventExtras } from "@/lib/public/event-extras";

/** Public event page sections fed by loadEventExtras (public-safe sources only). Each returns null when it has nothing real to show. */
const TZ = "Europe/London";
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "Date TBC";
const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }) : "";
const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);

/** Published banners: Media Studio banner / wide exports the organiser approved for public use, and published promo campaign pages featuring this event. */
export function BannerStrip({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null;
  return <section className="px-banners" aria-label="Highlights">{banners.slice(0, 2).map(b => {
    const body = <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={b.url} alt={b.alt} loading="lazy" />{b.href && <span><Megaphone size={15} aria-hidden /><b>{b.title}</b><ArrowRight size={14} aria-hidden /></span>}</>;
    return b.href ? <Link key={b.url + b.href} href={b.href} className="px-banner" aria-label={`Featured in ${b.title}`}>{body}</Link> : <figure key={b.url} className="px-banner">{body}</figure>;
  })}</section>;
}

/** Q24 confirmed sponsors and exhibitors: name, package tier and booth only. */
export function SponsorsSection({ partners }: { partners: Extras["partners"] }) {
  if (!partners.length) return null;
  const groups: [string, Extras["partners"]][] = [["Sponsors", partners.filter(p => p.kind === "sponsor")], ["Exhibitors", partners.filter(p => p.kind === "exhibitor")]];
  return <section id="sponsors" className="ce-card px-sponsors" aria-labelledby="px-sp-h"><h2 id="px-sp-h">Sponsors &amp; partners</h2>
    {groups.filter(([, l]) => l.length).map(([g, l]) => <div key={g} className="px-sp-group"><h3>{g}</h3><ul>{l.map(p => <li key={p.name}>
      {p.logo && /^https:\/\//.test(p.logo) ? <span className="px-sp-logo">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.logo} alt={`${p.name} logo`} loading="lazy" /></span>
        : <span className="px-sp-av" aria-hidden>{p.kind === "sponsor" ? <Star size={18} /> : <Store size={18} />}</span>}
      <span className="k-grow"><b>{p.name}</b>{(p.tier || p.booth) && <small>{[p.tier && `${p.tier}${p.kind === "sponsor" ? " sponsor" : ""}`, p.booth && `Booth ${p.booth}`].filter(Boolean).join(" · ")}</small>}</span></li>)}</ul></div>)}
  </section>;
}

const KIND: Record<string, string> = { main: "Main stage", breakout: "Breakout", workshop: "Workshop", webinar: "Webinar", live_audio: "Live audio", podcast: "Podcast", remote: "Remote", replay: "Replay" };
/** Online / hybrid sessions (event_virtual_public). Join links are never on the public page: they are issued to ticket holders. */
export function OnlineSection({ virtual }: { virtual: EventExtras["virtual"] }) {
  if (!virtual || !virtual.sessions.length) return null;
  const fmt = virtual.format === "hybrid" ? "In person and online" : "Online event";
  return <section id="online" className="ce-card px-online" aria-labelledby="px-on-h"><div className="k-between"><h2 id="px-on-h">Online sessions</h2><span className="px-chip"><Video size={13} aria-hidden />{fmt}</span></div>
    <p className="px-sub">Ticket holders join from their ticket in Gala Dock when a session opens.</p>
    <ul className="px-rows">{virtual.sessions.map((s: VirtualSession) => <li key={s.id}><time>{day(s.starts_at)}<small>{time(s.starts_at)}–{time(s.ends_at)}</small></time>
      <span className="k-grow"><b>{s.title}</b><small>{KIND[s.kind] ?? s.kind}{s.track && s.track !== KIND[s.kind] ? ` · ${s.track}` : ""}</small>
        {(s.captions && s.captions !== "none") || s.sign_language || s.transcript || s.audio_description ? <span className="px-a11y">
          {s.captions && s.captions !== "none" && <span><Captions size={12} aria-hidden />{s.captions === "post_event" ? "Captions after the event" : "Live captions"}</span>}
          {s.sign_language && <span><Hand size={12} aria-hidden />Sign language</span>}{s.transcript && <span><FileText size={12} aria-hidden />Transcript</span>}{s.audio_description && <span><AudioLines size={12} aria-hidden />Audio description</span>}</span> : null}</span></li>)}</ul>
  </section>;
}

/** Q40 series / tour dates, parent event, sub-events, days and passes. */
export function DatesSection({ extras, series, parent }: { extras: Extras; series: EventExtras["series"]; parent: EventExtras["parent"] }) {
  const others = series?.others ?? [];
  const days = extras.days.length > 1 ? extras.days : [];
  if (!others.length && !extras.sub_events.length && !days.length && !extras.passes.length && !parent && !series) return null;
  const KINDS: Record<string, string> = { series: "Series", recurring: "Recurring event", tour: "Tour", festival: "Festival", conference: "Conference" };
  const PASS: Record<string, string> = { season: "Season pass", multi_day: "Multi-day pass", multi_venue: "Multi-venue pass", series: "Series pass" };
  return <section id="dates" className="ce-card px-dates" aria-labelledby="px-dt-h"><h2 id="px-dt-h">Dates &amp; passes</h2>
    {(series || parent) && <p className="px-sub">{parent && <>Part of <Link className="k-link" href={`/events/${parent.slug ?? parent.id}`}>{parent.name}</Link>. </>}
      {series && <>{KINDS[series.kind] ?? "Series"}: {series.slug ? <Link className="k-link" href={`/series/${series.slug}`}>{series.name}</Link> : series.name}</>}</p>}
    <div className="px-dt-g">
      {days.length > 0 && <div><h3><CalendarDays size={15} aria-hidden />Event days</h3><ul className="px-list">{days.map(d => <li key={d.date + (d.label ?? "")}><b>{d.label || day(d.date)}</b><small>{d.label ? `${day(d.date)} · ` : ""}{time(d.starts_at)}{d.ends_at ? `–${time(d.ends_at)}` : ""}</small></li>)}</ul></div>}
      {extras.sub_events.length > 0 && <div><h3><Layers size={15} aria-hidden />Also part of this event</h3><ul className="px-list">{extras.sub_events.map(s => <li key={s.slug}><Link href={`/events/${s.slug}`}><b>{s.name}</b><small>{day(s.starts_at)} · {time(s.starts_at)}</small></Link></li>)}</ul></div>}
      {others.length > 0 && <div><h3><CalendarDays size={15} aria-hidden />Other dates</h3><ul className="px-list">{others.map(o => <li key={o.id}><Link href={`/events/${o.slug ?? o.id}`}><b>{day(o.starts_at)}</b><small>{[o.venue_name, o.city].filter(Boolean).join(", ") || o.name}</small></Link></li>)}</ul></div>}
      {extras.passes.length > 0 && <div><h3><Ticket size={15} aria-hidden />Passes</h3><ul className="px-list">{extras.passes.map(p => <li key={p.name}><b>{p.name}</b><small>{PASS[p.kind] ?? "Pass"}{p.includes.length ? ` · includes ${p.includes.join(", ")}` : ""}</small></li>)}</ul></div>}
    </div>
  </section>;
}

/** Merchandise: the organiser's own store (settings.merch_url, owner decision — no Gala Dock merch checkout) and the Q40 items on sale. */
export function MerchSection({ merch, url }: { merch: EventExtras["merch"]; url: string | null }) {
  if (!merch.length && !url) return null;
  return <section id="merch" className="ce-card px-merch" aria-labelledby="px-mr-h"><div className="k-between"><h2 id="px-mr-h">Official merchandise</h2>
      {url ? <a className="k-btn primary" href={url} target="_blank" rel="noopener noreferrer nofollow"><ShoppingBag size={16} aria-hidden />Shop merch<ExternalLink size={13} aria-hidden /></a> : <ShoppingBag size={20} aria-hidden className="px-ic" />}</div>
    {merch.length > 0 && <ul className="px-merch-g">{merch.map(m => <li key={m.id}><b>{m.name}</b><span>{gbp(m.price)}</span></li>)}</ul>}
    {url && <p className="px-note">Opens the organiser&apos;s own store in a new tab.</p>}</section>;
}

/** Q26 accessibility facts the organiser approved for the public summary. */
export function AccessFacts({ a }: { a: PublicAccess }) {
  const facts: [boolean, string][] = [[a.step_free, "Step-free access"], [a.accessible_toilets, "Accessible toilets"], [a.changing_places, "Changing Places toilet"], [a.accessible_seating, "Accessible viewing / seating"],
    [a.companion_seats, "Companion seats"], [a.hearing_loop, "Hearing loop"], [a.bsl, "BSL interpretation"], [a.captioning, "Captioning"], [a.quiet_space, "Quiet space"], [a.assistance_dogs, "Assistance dogs welcome"]];
  const on = facts.filter(([v]) => v);
  return <>
    <p className="pe3-access-lead"><Accessibility size={18} aria-hidden /><span>{a.summary}</span></p>
    {on.length > 0 && <ul className="px-facts" aria-label="Accessibility facts">{on.map(([, l]) => <li key={l}><CheckCircle2 size={14} aria-hidden />{l}</li>)}</ul>}
  </>;
}
