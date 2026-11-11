"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BarChart3, CalendarDays, CircleCheck, ClipboardList, Clock3, FileText, Megaphone, MapPin, Search, Settings2, Ticket, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import { TLink } from "../tracked-link";
import { Scope } from "../motion";
import { cx, ph, vars } from "../ui";
import { HREF } from "@/lib/public/site";
import { trackPublic } from "../track";

/** 2.4 LifecycleRibbon: seven named stages; each stage's detail is a different micro-component (budget, provider match, hold,
 *  tickets, promotion, run sheet, settlement). Click / keyboard to inspect — no scroll-jacking, nothing changes under the reader. */
type Stage = { key: string; name: string; sub: string; icon: LucideIcon; title: string; text: string; points: string[]; cta?: [string, string] };
const STAGES: Stage[] = [
  { key: "plan", name: "Plan", sub: "Budget and set goals", icon: CalendarDays, title: "Plan your event", text: "Set the event type, location, date, guest estimate and budget. Everything after this is shaped by the plan.", points: ["Event type and requirements", "Budget planning", "Timeline and key milestones"], cta: ["Start Planning", HREF.startBuilding] },
  { key: "source", name: "Source", sub: "Find venues and suppliers", icon: Search, title: "Source with context", text: "Venues and suppliers are matched to the date, location, guest count and what the event still needs.", points: ["Matched to the event, not a directory", "Availability and response time", "Backups for critical roles"] },
  { key: "book", name: "Book", sub: "Confirm and manage", icon: FileText, title: "Book in the right order", text: "Hold what depends on the venue, confirm when it’s safe, and keep every quote and contract on the event.", points: ["Conditional holds with an expiry", "Quotes and contracts in one place", "Dependencies made visible"] },
  { key: "sell", name: "Sell", sub: "Tickets and payments", icon: Ticket, title: "Sell tickets", text: "Ticket tiers, release windows and checkout sit on the same event, so sales and capacity never drift apart.", points: ["Tiers and release windows", "Checkout through Stripe", "Capacity linked to the venue"], cta: ["For Organisers", "/organisers"] },
  { key: "promote", name: "Promote", sub: "Reach your audience", icon: Megaphone, title: "Promote where people look", text: "Publish once and list the event across the Gala Dock discovery surfaces you choose.", points: ["Event page and calendar listing", "Venue and category pages", "Event-native media"] },
  { key: "run", name: "Run", sub: "Manage on the day", icon: Settings2, title: "Run the day", text: "The run sheet, provider arrivals and check-in come from the same record, so the team sees one version of the day.", points: ["Run sheet and timings", "Provider arrivals", "Door check-in"] },
  { key: "settle", name: "Settle", sub: "Payouts and reporting", icon: BarChart3, title: "Settle and close out", text: "Sellers are paid out through Stripe, and payouts are released on approved triggers. Reporting closes the event.", points: ["Payouts through Stripe", "Released on approved triggers", "Event reporting"] },
];

function Detail({ k }: { k: string }) {
  switch (k) {
    case "plan": return <div className="gpl-ld gpl-ld-plan">
      <div className="gpl-ld-title"><b>Birthday Party</b><small>A celebration with the people who matter most.</small></div>
      <p className="gpl-ld-chips">{["Birthday", "Wedding", "Corporate", "Festival", "Other"].map((c, i) => <span key={c} className={cx("gp-chip", i === 0 ? "is-info" : "")}>{c}</span>)}</p>
      <img src={"/assets/preferences-party.webp"} alt="" width={322} height={166} loading="lazy" />
      <p className="gpl-ld-facts"><span><MapPin size={15} />London</span><span><CalendarDays size={15} />24 Jul</span><span><UsersRound size={15} />~120 guests</span><span><Wallet size={15} />£5,000</span></p>
    </div>;
    case "source": return <ul className="gpl-ld gpl-ld-rows">{[["Riverside Hall", "Venue · Southwark", 96, "v-grand-hall.webp"], ["SoundWave DJs", "Entertainment", 91, "s-dj-marcus.webp"], ["Lens & Light", "Photography", 88, "s-snapshot.webp"]].map(([n, s, f, img]) => <li key={n as string}>
      <img src={ph(img as string)} alt="" width={64} height={48} loading="lazy" /><span><b>{n}</b><small>{s}</small></span><span className="gp-ring is-ok" style={vars({ "--p": f as number, "--s": "46px" })}><b>{f}%</b></span><small className="gpl-ld-fit">fit</small></li>)}</ul>;
    case "book": return <ol className="gpl-ld gpl-ld-steps">{[["Venue requested", "Sent to Riverside Hall", "ok", "Done"], ["DJ held", "Held until Fri 16:00", "wait", "Holding"], ["Venue confirms", "Unlocks the held suppliers", "info", "Next"], ["Suppliers confirm", "Booking window opens", "plain", "Then"]].map(([t, s, tone, l]) => <li key={t}><span className={`gpl-ld-dot is-${tone}`} /><span><b>{t}</b><small>{s}</small></span><span className={`gp-chip is-${tone}`}>{l}</span></li>)}</ol>;
    case "sell": return <ul className="gpl-ld gpl-ld-tiers">{[["Early bird", 100, 100, "Sold out"], ["General admission", 82, 120, "On sale"], ["VIP table", 6, 20, "On sale"]].map(([n, s, c, l]) => <li key={n as string}><span><b>{n}</b><small>{s} / {c} sold</small></span><span className={cx("gp-bar", (s as number) === (c as number) && "is-ok")}><i style={{ width: `${Math.round((s as number) / (c as number) * 100)}%` }} /></span><span className={`gp-chip ${(s as number) === (c as number) ? "is-ok" : "is-info"}`}>{l}</span></li>)}</ul>;
    case "promote": return <ul className="gpl-ld gpl-ld-chan">{[["Gala Dock Discover", "Event discovery"], ["London event calendar", "Local listings"], ["Venue page", "Shown on the venue profile"], ["Category pages", "Birthday & party"]].map(([n, s], i) => <li key={n}><span><b>{n}</b><small>{s}</small></span><span className={cx("gpl-ld-switch", i < 3 && "is-on")}><i /></span><span className="gp-sr">{i < 3 ? "On" : "Off"}</span></li>)}</ul>;
    case "run": return <ol className="gpl-ld gpl-ld-run">{[["17:00", "Venue access", "Done"], ["18:00", "Catering set up", "Done"], ["19:00", "Guests arrive", "Now"], ["20:00", "DJ set", "Next"], ["23:30", "Last orders", ""]].map(([t, n, s]) => <li key={t} className={cx(s === "Now" && "is-now")}><time>{t}</time><b>{n}</b>{s && <span className={`gp-chip ${s === "Done" ? "is-ok" : s === "Now" ? "is-info" : ""}`}>{s}</span>}</li>)}</ol>;
    default: return <div className="gpl-ld gpl-ld-settle">
      <dl>{[["Ticket sales", "£3,240"], ["Platform fees", "Shown per sale"], ["Supplier payments", "Through Stripe"]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <p className="gp-note"><Wallet size={18} />Payouts go to each seller’s own Stripe account and are released on approved triggers, such as the event passing with no issue raised.</p>
    </div>;
  }
}

export function Lifecycle() {
  const [i, setI] = useState(0);
  const s = STAGES[i]!;
  const pick = (n: number) => { setI(n); trackPublic("section_interaction", "landing", `lifecycle_${STAGES[n]!.key}`); };
  return <Scope className="gpl-life" amount={0.15}>
    <div className="gpl-life-ribbon">
      <span className="gpl-life-track" aria-hidden="true"><motion.i initial={false} animate={{ scaleX: i / (STAGES.length - 1) }} transition={{ type: "spring", stiffness: 140, damping: 26 }} /></span>
      <ol>
        {STAGES.map((st, n) => {
          const Icon = st.icon;
          return <li key={st.key} className={cx(n < i && "is-done", n === i && "is-on")} data-rv="fade" style={vars({ "--d": n * 90 })}>
            <button type="button" aria-current={n === i ? "step" : undefined} aria-controls="gpl-life-detail" onClick={() => pick(n)}>
              <span className="gpl-life-ic"><Icon size={22} aria-hidden="true" /></span>
              <b>{n + 1}. {st.name}</b><small>{st.sub}</small>
            </button>
            {n === i && <div className="gpl-life-inline" aria-hidden="true"><p>{st.text}</p></div>}
          </li>;
        })}
      </ol>
    </div>
    <div id="gpl-life-detail" className="gpl-life-detail gp-panel" aria-live="polite" data-rv="rise" style={vars({ "--d": 300 })}>
      <div className="gpl-life-copy">
        <p className="gpl-life-step">Stage {i + 1} of {STAGES.length}</p>
        <h3 className="gp-h3">{s.title}</h3>
        <p className="gp-body">{s.text}</p>
        <ul className="gpl-life-points">{s.points.map(p => <li key={p}><CircleCheck size={18} aria-hidden="true" />{p}</li>)}</ul>
        {s.cta && <TLink href={s.cta[1]} surface="landing" variant={`lifecycle_${s.key}`} className="gp-btn gp-btn--primary gp-btn--sm">{s.cta[0]}<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></TLink>}
      </div>
      <div className="gpl-life-visual">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={s.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .28, ease: [0.2, 0.7, 0.2, 1] }}><Detail k={s.key} /></motion.div>
        </AnimatePresence>
      </div>
      <aside className="gpl-life-record" aria-label="Event record">
        <div className="gpl-life-record-h"><b>Event record</b><span className="gp-state is-ok"><CircleCheck size={14} />In progress</span></div>
        <ol>{STAGES.map((st, n) => <li key={st.key} className={cx(n < i && "is-done", n === i && "is-on")}><i aria-hidden="true">{n < i ? <CircleCheck size={16} /> : n === i ? <Clock3 size={16} /> : <ClipboardList size={14} />}</i><span><b>{st.name}</b><small>{n < i ? "Complete" : n === i ? "Current stage" : "Upcoming"}</small></span></li>)}</ol>
      </aside>
    </div>
  </Scope>;
}
