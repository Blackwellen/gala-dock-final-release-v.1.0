"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useRef, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarDays, CircleCheck, FileText, Landmark, Megaphone, Music2, PartyPopper, Settings2, Store, Ticket, Users, Wallet, Zap, type LucideIcon } from "lucide-react";
import { TLink } from "../tracked-link";
import { Scope } from "../motion";
import { cx, ph, vars } from "../ui";

/** 2.2 ThreeTrackRail — Customer, Organiser and Provider tracks, each with its own Need → Gala Dock → Outcome micro-visual. */
const SURFACE = "landing";

function CustomerVisual() {
  const steps: [string, string, string, LucideIcon | string][] = [["Venue", "Confirmed", "ok", "v-grand-hall.webp"], ["DJ", "Added", "info", "s-dj-marcus.webp"], ["Guests", "RSVPs open", "info", Users]];
  return <div className="gpl-tv gpl-tv-cust">
    <span className="gpl-tv-note">From idea…</span>
    <ol className="gpl-tv-chain">
      <li className="gpl-tv-start"><span className="gpl-tv-ic"><PartyPopper size={22} /></span><b>Birthday party</b><small><CalendarDays size={12} />24 Jul</small></li>
      {steps.map(([t, s, tone, v], i) => <li key={t} style={vars({ "--d": 200 + i * 160 })} data-rv="fade">
        {typeof v === "string" ? <img src={ph(v)} alt="" width={96} height={56} loading="lazy" /> : <span className="gpl-tv-ic">{(() => { const I = v; return <I size={22} />; })()}</span>}
        <b>{t}</b><span className={`gp-state is-${tone}`}><CircleCheck size={13} />{s}</span>
      </li>)}
    </ol>
    <span className="gpl-tv-note is-end">…to the day itself</span>
  </div>;
}

function OrganiserVisual() {
  const events: [string, string, number, string][] = [["Comedy Night", "12 Aug · London", 84, "ev-comedy-c.webp"], ["Corporate Summit", "18 Sep · Manchester", 28, "oe-global-tech.webp"], ["Wedding Showcase", "5 Oct · Birmingham", 91, "type-wedding.webp"], ["Summer Festival", "22 Jul · Bristol", 46, "ev-neon-c.webp"]];
  const stages = ["Planning", "Suppliers", "Tickets", "Promotion", "Operations", "Settlement"];
  return <div className="gpl-tv gpl-tv-org">
    <ul className="gpl-tv-events">{events.map(([n, d, r, img], i) => <li key={n} data-rv="fade" style={vars({ "--d": 160 + i * 120 })}>
      <img src={ph(img)} alt="" width={52} height={40} loading="lazy" />
      <span><b>{n}</b><small>{d}</small><span className="gpl-tv-ready"><span className={cx("gp-bar gp-grow", r > 80 && "is-ok")}><i style={{ width: `${r}%`, ...vars({ "--d": 500 + i * 120 }) }} /></span><em>{r}% ready</em></span></span>
    </li>)}</ul>
    <ol className="gpl-tv-stages">{stages.map((s, i) => <li key={s} className={cx(i < 3 && "is-done", i === 3 && "is-on")}><i />{s}</li>)}</ol>
    <span className="gpl-tv-note is-org">Many events. One workspace.</span>
  </div>;
}

function ProviderVisual() {
  const steps: [string, string, LucideIcon, string][] = [["Quote", "£650 sent", FileText, "plain"], ["Booking", "Confirmed", CalendarDays, "ok"], ["Deliver", "Event day", BadgeCheck, "plain"], ["Earn", "Payout via Stripe", Wallet, "info"]];
  return <div className="gpl-tv gpl-tv-pro">
    <span className="gpl-tv-note">From opportunities…</span>
    <ol className="gpl-tv-chain is-pro">
      <li className="gpl-tv-start"><b>New opportunity</b><small className="gpl-tv-tag"><i />Wedding · Photography</small><img src={ph("me-wedding.webp")} alt="" width={110} height={58} loading="lazy" /></li>
      {steps.map(([t, s, I, tone], i) => <li key={t} data-rv="fade" style={vars({ "--d": 200 + i * 150 })}><span className="gpl-tv-ic"><I size={20} /></span><b>{t}</b><span className={`gp-state is-${tone}`}>{s}</span></li>)}
    </ol>
    <span className="gpl-tv-note is-end">…to a growing business</span>
  </div>;
}

type Track = { key: string; icon: LucideIcon; title: string; text: string; cta: string; href: string; visual: () => React.ReactElement; points: [LucideIcon, string, string][] };
const TRACKS: Track[] = [
  { key: "customer", icon: Users, title: "I’m planning my own event", text: "Bring your idea to life with the right venue, suppliers, guests and everything in between.", cta: "Build your event", href: "/build-an-event", visual: CustomerVisual,
    points: [[CalendarDays, "Plan step by step", "One plan, one date"], [Store, "Find suppliers", "Matched to your event"], [Ticket, "Invite or sell", "Guest lists and tickets"]] },
  { key: "organiser", icon: CalendarDays, title: "I organise events professionally", text: "Plan, promote, sell and run multiple events with professional tools and Gala Agent support.", cta: "For Organisers", href: "/organisers", visual: OrganiserVisual,
    points: [[Users, "Manage your portfolio", "Every event in one place"], [Megaphone, "Sell and promote", "Ticketing and discovery"], [Settings2, "Run with confidence", "Event-day operations"]] },
  { key: "provider", icon: Landmark, title: "I provide venues or services", text: "Receive event opportunities, manage enquiries, confirm bookings and grow your business.", cta: "For Providers", href: "/providers", visual: ProviderVisual,
    points: [[Zap, "Receive opportunities", "Matched to your services"], [Music2, "Manage bookings", "Quotes to delivery"], [Wallet, "Get paid", "Through Stripe"]] },
];

export function ThreeWays() {
  const [active, setActive] = useState(1);
  const rail = useRef<HTMLDivElement>(null);
  const go = (i: number) => {
    setActive(i);
    const card = rail.current?.children[i] as HTMLElement | undefined;
    if (card && rail.current) rail.current.scrollTo({ left: card.offsetLeft - rail.current.offsetLeft - 16, behavior: "smooth" });
  };
  const onScroll = () => {
    const r = rail.current; if (!r || r.scrollWidth <= r.clientWidth + 4) return;
    const kids = [...r.children] as HTMLElement[];
    const mid = r.scrollLeft + r.clientWidth / 2;
    let best = 0, d = Infinity;
    kids.forEach((k, i) => { const c = k.offsetLeft - r.offsetLeft + k.offsetWidth / 2; if (Math.abs(c - mid) < d) { d = Math.abs(c - mid); best = i; } });
    if (best !== active) setActive(best);
  };
  return <>
    <Scope as="div" className="gpl-tracks" amount={0.2}>
      <div className="gpl-track-rail" ref={rail} onScroll={onScroll}>
        {TRACKS.map((t, i) => {
          const Icon = t.icon, Visual = t.visual;
          return <article key={t.key} className={cx("gpl-track", `is-${t.key}`, active === i && "is-active")} aria-labelledby={`track-${t.key}`}
            onMouseEnter={() => setActive(i)} onFocusCapture={() => setActive(i)} data-rv="rise" style={vars({ "--d": i * 120 })}>
            <header className="gpl-track-head">
              <span className="gpl-track-ic"><Icon size={26} aria-hidden="true" /></span>
              <div><h3 id={`track-${t.key}`}>{t.title}</h3><p>{t.text}</p></div>
            </header>
            <div className="gpl-track-visual" aria-hidden="true"><Visual /></div>
            <ul className="gpl-track-points">{t.points.map(([I, b, s]) => <li key={b}><I size={20} aria-hidden="true" /><span><b>{b}</b><small>{s}</small></span></li>)}</ul>
            <TLink href={t.href} event="persona_route_select" surface={SURFACE} variant={t.key} className={cx("gp-btn", i === 2 ? "gp-btn--ghost" : "gp-btn--primary", "gpl-track-cta")}>
              {t.cta}<ArrowRight size={18} className="gp-arrow" aria-hidden="true" />
            </TLink>
          </article>;
        })}
      </div>
    </Scope>
    <div className="gpl-track-dots" role="group" aria-label="Show a track">
      {TRACKS.map((t, i) => <button key={t.key} type="button" aria-pressed={active === i} aria-label={t.title} onClick={() => go(i)}><i /></button>)}
    </div>
  </>;
}
