"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CircleCheck, Fingerprint, Megaphone, Ticket, UsersRound, Wallet, House, Store, IdCard, type LucideIcon } from "lucide-react";
import { Scope } from "../motion";
import { cx, DemoTag, ph, vars, type Tone } from "../ui";
import { trackPublic } from "../track";

/** 2.6 EventRecordTree: root EVENT with seven branches; one BranchDetail explains one relationship at a time. */
type Branch = { key: string; label: string; meta: string; tone: Tone; icon: LucideIcon; img?: string; pos: [number, number]; path: string; facts: [string, string][]; links: string[] };
const BRANCHES: Branch[] = [
  { key: "venue", label: "Venue", meta: "1 booked", tone: "ok", icon: House, img: "v-grand-hall.webp", pos: [50, 3], path: "M300 104 V150", facts: [["Venue", "Riverside Hall"], ["Capacity", "50–250"], ["Date", "24 Jul"]], links: ["Capacity checks the guest list and ticket allocation", "Access times feed the event-day run sheet", "The venue booking carries its own contract and payment schedule"] },
  { key: "providers", label: "Providers", meta: "4 selected", tone: "info", icon: Store, img: "s-dj-marcus.webp", pos: [17, 21], path: "M146 168 C180 168 196 196 230 214", facts: [["Selected", "DJ, catering, photographer, security"], ["Backups", "1 standby"], ["Quotes", "4 accepted"]], links: ["Each booking is held against the same event date", "Arrival times sit on the run sheet", "Quotes and invoices roll into the event budget"] },
  { key: "tickets", label: "Tickets", meta: "182 / 240 sold", tone: "ok", icon: Ticket, img: "tk-neon.webp", pos: [83, 21], path: "M454 168 C420 168 404 196 370 214", facts: [["Sold", "182 of 240"], ["Tiers", "3"], ["Check-in", "Ready"]], links: ["Ticket capacity can never exceed the venue’s", "Buyers become the guest list automatically", "Sales land in the event’s money view"] },
  { key: "team", label: "Team", meta: "6 assigned", tone: "plain", icon: IdCard, img: "s-sax-groove.webp", pos: [14, 52], path: "M146 300 H230", facts: [["Assigned", "6 people"], ["Roles", "Lead, door, bar"], ["Shifts", "17:00–01:00"]], links: ["Shifts follow the run sheet", "Permissions follow each person’s role", "Every change is recorded on the event"] },
  { key: "guests", label: "Guests", meta: "120 invited", tone: "info", icon: UsersRound, img: "ev-neon-c.webp", pos: [86, 52], path: "M454 300 H370", facts: [["Invited", "120"], ["RSVPs", "86 yes"], ["Dietary", "12 notes"]], links: ["Numbers update catering and staffing", "Ticket holders and invitees share one list", "Check-in reads the same list at the door"] },
  { key: "promotion", label: "Promotion", meta: "Event page live", tone: "info", icon: Megaphone, pos: [27, 84], path: "M196 418 C196 392 240 388 262 378", facts: [["Event page", "Live"], ["Listings", "Discover, calendar"], ["Poster", "Approved"]], links: ["The event page reads dates and tickets from the record", "Listings update when the event changes", "Promotion stops when tickets sell out"] },
  { key: "money", label: "Money", meta: "£5,600 estimated", tone: "ok", icon: Wallet, pos: [73, 84], path: "M404 418 C404 392 360 388 338 378", facts: [["Budget", "£5,600"], ["Confirmed", "£3,400"], ["Ticket sales", "£2,180"]], links: ["Every booking and sale lands in one budget", "Payments go through Stripe", "Settlement closes against the same record"] },
];

export function RecordTree() {
  const [sel, setSel] = useState("venue");
  const b = BRANCHES.find(x => x.key === sel)!;
  const pick = (k: string) => { setSel(k); trackPublic("section_interaction", "landing", `record_${k}`); };
  return <Scope className="gpl-rec" amount={0.15}>
    <div className="gpl-rec-tree" data-focus={sel}>
      <svg className="gpl-rec-lines" viewBox="0 0 600 520" preserveAspectRatio="none" aria-hidden="true">
        <circle cx="300" cy="290" r="214" className="gpl-rec-orbit" />
        {BRANCHES.map((x, i) => <path key={x.key} d={x.path} pathLength={1} className={cx("gp-draw", sel === x.key && "is-on")} style={vars({ "--d": 380 + i * 110 })} />)}
      </svg>
      <div className="gpl-rec-root" data-rv="pop" style={vars({ "--d": 80 })}>
        <img src={"/assets/preferences-party.webp"} alt="" width={322} height={166} />
        <span className="gp-chip is-violet gpl-rec-live">Live planning</span>
        <b>Maya’s 30th Birthday</b>
        <span className="gpl-rec-meta"><span><CalendarDays size={14} aria-hidden="true" />24 Jul · London</span><span><UsersRound size={14} aria-hidden="true" />120 guests</span></span>
        <span className="gpl-rec-id"><Fingerprint size={14} aria-hidden="true" />Event ID <code>GD-EV-07124</code></span>
      </div>
      <ul className="gpl-rec-branches" aria-label="Parts of the event record">
        {BRANCHES.map((x, i) => {
          const Icon = x.icon;
          return <li key={x.key} style={vars({ "--x": x.pos[0], "--y": x.pos[1], "--d": 480 + i * 110 })} data-rv="pop">
            <button type="button" aria-pressed={sel === x.key} aria-controls="gpl-rec-detail" onClick={() => pick(x.key)} className={cx("gpl-rec-node", sel === x.key && "is-on")}>
              {x.img ? <img src={ph(x.img)} alt="" width={56} height={48} loading="lazy" /> : <span className="gpl-rec-ic"><Icon size={22} aria-hidden="true" /></span>}
              <span><b>{x.label}</b><span className={`gp-state is-${x.tone === "violet" ? "info" : x.tone}`}>{x.meta}</span></span>
            </button>
          </li>;
        })}
      </ul>
    </div>
    <div id="gpl-rec-detail" className="gpl-rec-detail gp-card" aria-live="polite" data-rv="right" style={vars({ "--d": 400 })}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={b.key} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: .25 }}>
          <header><span className="gpl-rec-ic is-lg">{(() => { const I = b.icon; return <I size={24} aria-hidden="true" />; })()}</span><div><small>Branch</small><h3>{b.label}</h3></div><span className={`gp-chip is-${b.tone === "plain" ? "info" : b.tone}`}>{b.meta}</span></header>
          <dl className="gpl-rec-facts">{b.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <h4>How it connects</h4>
          <ul className="gpl-rec-links">{b.links.map(l => <li key={l}><CircleCheck size={17} aria-hidden="true" />{l}</li>)}</ul>
          <p className="gpl-rec-same"><Fingerprint size={15} aria-hidden="true" />Same event ID: <code>GD-EV-07124</code></p>
        </motion.div>
      </AnimatePresence>
      <DemoTag className="gpl-rec-tag" />
    </div>
  </Scope>;
}
