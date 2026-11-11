"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  BadgeCheck, Boxes, CalendarDays, CalendarRange, Camera, CircleCheck, Clock3, FileText, Hammer, House, LayoutGrid, MapPin, MessageCircleQuestion,
  Package, Siren, Star, UsersRound, Wallet, Wrench, X, Zap, type LucideIcon, Hourglass, Handshake, PackageCheck,
} from "lucide-react";
import { Count, Scope, useActivated, useVisibleInterval } from "../motion";
import { Pressed, TabBar, panelProps } from "../controls";
import { cx, DemoTag, ph, pounds, vars } from "../ui";
import { trackPublic } from "../track";

const S = "providers";
const STAGES = ["Match", "Quote", "Book", "Deliver", "Earn"] as const;

/* ── 4.1 OpportunityStream ─────────────────────────────────────────────────────────────────────────────────────────────── */
const OPPS = [
  { title: "Wedding", need: "Photographer", kind: "Service request", where: "Richmond · Sat 14 Sep", value: "£1,250", at: 4, note: "Paid out through Stripe", img: "me-wedding.webp" },
  { title: "Birthday", need: "Hall hire", kind: "Venue request", where: "Croydon · Sat 21 Sep", value: "£1,400", at: 2, note: "Booking confirmed", img: "me-birthday.webp" },
  { title: "Comedy night", need: "Security", kind: "Service request", where: "Camden · Fri 27 Sep", value: "£360", at: 1, note: "Quote sent", img: "ev-comedy-c.webp" },
];
export function OpportunityStream() {
  const [ref, on] = useActivated<HTMLDivElement>(0.3);
  const [active, setActive] = useState(0);
  return <div ref={ref} className="gpp-stream">
    <ol className="gpp-opps" aria-label="Example opportunities moving from match to earnings">
      {OPPS.map((o, i) => {
        const reached = on ? o.at : 0;
        return <li key={o.title} className={cx("gpp-opp gp-card", `is-n${i}`, active === i && "is-active", on && "is-on")} style={vars({ "--d": i * 180 })} onMouseEnter={() => setActive(i)}>
          <img src={ph(o.img)} alt="" width={120} height={88} loading="lazy" />
          <div className="gpp-opp-body">
            <p className="gpp-opp-kind"><span className={`gp-chip ${o.kind.startsWith("Venue") ? "is-violet" : "is-info"}`}>{o.kind}</span><span className="gpp-opp-value">{o.value}</span></p>
            <b>{o.title} · {o.need}</b>
            <small><MapPin size={13} aria-hidden="true" />{o.where}</small>
            <ol className="gpp-stage" aria-label={`Stage: ${STAGES[o.at]}`}>
              {STAGES.map((s, n) => <li key={s} className={cx(n < reached && "is-done", n === reached && "is-on")} style={vars({ "--d": 400 + i * 180 + n * 220 })}><i aria-hidden="true" /><span>{s}</span></li>)}
            </ol>
            <span className={cx("gp-state", o.at === 4 ? "is-ok" : "is-info")}>{o.at === 4 ? <CircleCheck size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}{o.note}</span>
          </div>
        </li>;
      })}
    </ol>
    <div className="gpp-stream-dots" role="group" aria-label="Show an opportunity">
      {OPPS.map((o, i) => <button key={o.title} type="button" aria-pressed={active === i} onClick={() => setActive(i)} aria-label={`${o.title} · ${o.need}`}><i /></button>)}
    </div>
    <DemoTag className="gpp-stream-tag" />
  </div>;
}

/* ── 4.2 Adaptive provider workspace ───────────────────────────────────────────────────────────────────────────────────── */
type Mode = "venue" | "supplier" | "mixed";
const MODULES: Record<string, [string, string, LucideIcon]> = {
  spaces: ["Spaces", "Rooms, layouts and capacities", House], packages: ["Packages", "Hire bundles and minimum spends", Package],
  availability: ["Availability", "One calendar for every space and service", CalendarRange], bookings: ["Bookings", "Requests, holds, contracts and payments", CalendarDays],
  services: ["Services", "What you offer and how it’s priced", Wrench], jobs: ["Jobs", "Confirmed work with briefs and timings", Hammer],
  team: ["Team", "Crew, roles and shifts", UsersRound], equipment: ["Equipment", "Kit allocated to each job", Boxes],
};
const MODE_MODS: Record<Mode, string[]> = {
  venue: ["spaces", "packages", "availability", "bookings"],
  supplier: ["services", "jobs", "team", "equipment"],
  mixed: ["spaces", "services", "packages", "availability", "bookings", "team"],
};
const SHARED = ["Opportunities", "Quotes", "Messages", "Payouts", "Reviews"];
export function AdaptiveWorkspace() {
  const [mode, setMode] = useState<Mode>("venue");
  const set = (m: Mode) => { setMode(m); trackPublic("section_interaction", S, `workspace_${m}`); };
  const items = [{ key: "venue" as const, label: "Venue", icon: House }, { key: "supplier" as const, label: "Supplier", icon: Wrench }, { key: "mixed" as const, label: "Venue + Services", icon: LayoutGrid }];
  return <div className="gpp-ws gp-panel">
    <div className="gpp-ws-top">
      <TabBar idBase="gpp-ws" label="Business type" items={items} value={mode} onChange={set} className="gpp-ws-tabs" />
      <DemoTag />
    </div>
    {items.map(it => <div key={it.key} {...panelProps("gpp-ws", it.key, it.key === mode)} className="gpp-ws-panel">
      {it.key === mode && <LayoutGroup id="gpp-ws">
        <p className="gpp-ws-sum">{mode === "venue" ? "A venue workspace: spaces, packages, availability and bookings." : mode === "supplier" ? "A supplier workspace: services, jobs, team and equipment." : "Both, without duplication: one availability calendar and one bookings list across spaces and services."}</p>
        <ul className={cx("gpp-mods", `is-${mode}`)}>
          {MODE_MODS[mode].map(k => { const [n, d, I] = MODULES[k]!; return <motion.li layout layoutId={`gpp-mod-${k}`} key={k} className="gpp-mod" transition={{ type: "spring", stiffness: 300, damping: 32 }}>
            <span className="gpp-mod-ic"><I size={22} aria-hidden="true" /></span><b>{n}</b><small>{d}</small>
          </motion.li>; })}
        </ul>
      </LayoutGroup>}
    </div>)}
    <div className="gpp-ws-shared"><span>Always included</span><ul>{SHARED.map(s => <li key={s}><CircleCheck size={15} aria-hidden="true" />{s}</li>)}</ul></div>
  </div>;
}

/* ── 4.3 Respond before the opportunity disappears ─────────────────────────────────────────────────────────────────────── */
const START = 3 * 3600 + 42 * 60 + 18;
const STATES: [string, string, LucideIcon, string][] = [
  ["hold", "Conditional hold", Hourglass, "Reserve the date while the customer confirms the venue. The hold expires on its own — nothing is charged."],
  ["standby", "Standby", Handshake, "Agree to be the backup. If the primary provider drops out, you are offered the booking first."],
  ["emergency", "Emergency", Siren, "Mark short-notice availability so you appear in last-minute searches for your category and area."],
];
const ACTIONS: Record<string, string> = {
  quote: "Your quote goes to the customer with your availability and package attached.",
  ask: "Questions keep the request open and are visible in the same thread.",
  decline: "Declining quickly is better than not replying — it protects your response rate.",
};
export function RespondDemo() {
  const [ref, inView] = useActivated<HTMLDivElement>(0.4);
  const [left, setLeft] = useState(START);
  const [state, setState] = useState("hold");
  const [act, setAct] = useState<string | null>(null);
  useVisibleInterval(inView && left > START - 600, 1000, () => setLeft(l => l - 1));
  const hh = String(Math.floor(left / 3600)).padStart(2, "0"), mm = String(Math.floor(left % 3600 / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  const warm = left < START - 20;
  return <div ref={ref} className="gpp-respond">
    <article className="gpp-req gp-panel" aria-label="Example opportunity">
      <header className="gpp-req-h">
        <img src={"/assets/preferences-party.webp"} alt="" width={120} height={80} loading="lazy" />
        <div><span className="gp-chip is-violet">Venue request</span><h3>80-person birthday · Saturday · Croydon</h3><p>Hall hire · 18:00 – 00:00 · budget £1,200 – £1,600</p></div>
        <DemoTag />
      </header>
      <div className={cx("gpp-count", warm && "is-warm")}>
        <Clock3 size={22} aria-hidden="true" />
        <span aria-hidden="true"><b className="gpp-count-n">{hh}:{mm}:{ss}</b> remaining to respond</span>
        <span className="gp-sr">About 3 hours 42 minutes left to respond in this example.</span>
      </div>
      <ul className="gpp-req-tags">{["Bar area", "Step-free access", "DJ power supply", "Late licence"].map(t => <li key={t} className="gp-chip">{t}</li>)}</ul>
      <div className="gpp-req-acts">
        <button type="button" className="gp-btn gp-btn--primary gp-btn--sm" aria-pressed={act === "quote"} onClick={() => setAct("quote")}><FileText size={17} aria-hidden="true" />Quote</button>
        <button type="button" className="gp-btn gp-btn--ghost gp-btn--sm" aria-pressed={act === "ask"} onClick={() => setAct("ask")}><MessageCircleQuestion size={17} aria-hidden="true" />Ask a question</button>
        <button type="button" className="gp-btn gp-btn--ghost gp-btn--sm" aria-pressed={act === "decline"} onClick={() => setAct("decline")}><X size={17} aria-hidden="true" />Decline</button>
      </div>
      <p className="gpp-req-out" aria-live="polite">{act ? ACTIONS[act] : "Choose a response to see what happens next. Nothing is sent from this example."}</p>
      <p className="gpp-req-note"><BadgeCheck size={17} aria-hidden="true" />Response time feeds the reliability shown to customers. Fast, clear answers — including a quick “no” — rank better than silence.</p>
    </article>
    <div className="gpp-states" role="radiogroup" aria-label="Specialist availability states">
      {STATES.map(([k, l, I, d]) => <button key={k} type="button" role="radio" aria-checked={state === k} className={cx("gpp-state", state === k && "is-on")}
        onClick={() => { setState(k); trackPublic("section_interaction", S, `state_${k}`); }}
        onKeyDown={e => { const i = STATES.findIndex(s => s[0] === state); if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setState(STATES[(i + 1) % 3]![0]); } if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setState(STATES[(i + 2) % 3]![0]); } }}
        tabIndex={state === k ? 0 : -1}>
        <span className="gpp-state-ic"><I size={20} aria-hidden="true" /></span><span><b>{l}</b><small>{d}</small></span>
      </button>)}
    </div>
  </div>;
}

/* ── 4.4 Package builder ───────────────────────────────────────────────────────────────────────────────────────────────── */
type Offer = "venue" | "supplier";
const OFFERS = {
  venue: { title: "Hall hire + bar + security", type: "Venue package", img: "v-grand-hall.webp", base: 900, unit: "per evening", avail: "Fri – Sun · 17:00 – 00:00",
    addons: [["Bar service", 250], ["Security team (2)", 180], ["Stage & lighting", 220]] as [string, number][], extra: [["Minimum spend", "£1,500 food & drink"], ["Staffing", "Duty manager included"]] as [string, string][] },
  supplier: { title: "Wedding photography — 8 hours", type: "Service package", img: "s-snapshot.webp", base: 850, unit: "per day", avail: "Weekends · up to 8 hours",
    addons: [["Second shooter", 250], ["Printed album", 180], ["Same-day preview", 90]] as [string, number][], extra: [["Travel", "Included within 25 miles"], ["Delivery", "Edited gallery in 4 weeks"]] as [string, string][] },
};
export function PackageBuilder() {
  const [sel, setSel] = useState<Offer>("venue");
  const [on, setOn] = useState<Record<string, boolean>>({ "venue:Bar service": true, "supplier:Second shooter": true });
  const total = useMemo(() => { const o = OFFERS[sel]; return o.base + o.addons.filter(([n]) => on[`${sel}:${n}`]).reduce((t, [, p]) => t + p, 0); }, [sel, on]);
  return <Scope className="gpp-offers" amount={0.2}>
    <Pressed idBase="gpp-offer" label="Example offer" value={sel} onChange={k => { setSel(k); trackPublic("section_interaction", S, `offer_${k}`); }} items={[{ key: "venue", label: "Venue offer", icon: House }, { key: "supplier", label: "Supplier offer", icon: Camera }]} className="gpp-offer-switch" />
    <div className="gpp-offer-pair">
      {(["venue", "supplier"] as const).map((k, i) => { const o = OFFERS[k], active = sel === k; return <motion.section layout key={k} className={cx("gpp-offer gp-card", active && "is-on", `is-${k}`)} aria-label={o.title} data-rv="rise" style={vars({ "--d": i * 140 })} onClick={() => !active && setSel(k)}>
        <header><img src={ph(o.img)} alt="" width={84} height={64} loading="lazy" /><div><small>{o.type}</small><h3>{o.title}</h3></div></header>
        <dl className="gpp-offer-rows">
          <div><dt>Availability</dt><dd>{o.avail}</dd></div>
          <div><dt>Base price</dt><dd>{pounds(o.base)} <small>{o.unit}</small></dd></div>
          {o.extra.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
        </dl>
        <AnimatePresence initial={false}>{active && <motion.fieldset initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="gpp-addons">
          <legend>Add-ons</legend>
          {o.addons.map(([n, p]) => { const id = `gpp-${k}-${n.replace(/\W+/g, "-")}`; return <label key={n} htmlFor={id}><input id={id} type="checkbox" checked={!!on[`${k}:${n}`]} onChange={e => setOn(s => ({ ...s, [`${k}:${n}`]: e.target.checked }))} /><span>{n}</span><em>+{pounds(p)}</em></label>; })}
        </motion.fieldset>}</AnimatePresence>
        {!active && <button type="button" className="gp-link gpp-offer-pick" onClick={() => setSel(k)}>Edit this example</button>}
      </motion.section>; })}
    </div>
    <div className="gpp-offer-sum gp-card" aria-live="polite">
      <span><small>{OFFERS[sel].title}</small><b><Count value={total} format={pounds} /></b><em>{OFFERS[sel].unit}</em></span>
      <span className="gpp-offer-sum-note"><PackageCheck size={18} aria-hidden="true" />Customers see the package price before they request. Platform fees are on Pricing.</span>
    </div>
  </Scope>;
}

/* ── 4.5 Reliability lifecycle ring ────────────────────────────────────────────────────────────────────────────────────── */
const RING: [string, string, LucideIcon][] = [
  ["Booking", "The customer confirms and the job joins your calendar.", CalendarDays], ["Preparation", "Brief, timings and requirements in one place.", FileText],
  ["Arrival", "Check in on the day so the organiser can see you’re on site.", MapPin], ["Delivery", "Do the work; changes are recorded on the booking.", Zap],
  ["Completion", "The customer confirms the job is done.", CircleCheck], ["Payment", "Payouts through Stripe, released on approved triggers.", Wallet],
  ["Verified review", "Only customers with a completed booking can review.", Star],
];
export function ReliabilityRing() {
  const [sel, setSel] = useState(0);
  const R = 150, C = 200;
  const pt = (i: number) => { const a = -Math.PI / 2 + i * 2 * Math.PI / RING.length; return [C + R * Math.cos(a), C + R * Math.sin(a)] as const; };
  return <Scope className="gpp-ring-wrap" amount={0.25}>
    <div className="gpp-ring">
      <svg viewBox="0 0 400 400" aria-hidden="true">
        <circle cx={C} cy={C} r={R} fill="none" stroke="#e7ecf5" strokeWidth="2" />
        <circle cx={C} cy={C} r={R} fill="none" stroke="#2457e6" strokeWidth="2.5" className="gp-draw" pathLength={1} transform={`rotate(-90 ${C} ${C})`} style={vars({ "--d": 200 })} />
      </svg>
      <div className="gpp-ring-score" data-rv="pop" style={vars({ "--d": 500 })}><small>Example reliability</small><b>98%</b><span>on-time, completed bookings</span></div>
      <ol className="gpp-ring-stages">
        {RING.map(([n, , I], i) => { const [x, y] = pt(i); return <li key={n} style={{ left: `${x / 4}%`, top: `${y / 4}%`, ...vars({ "--d": 400 + i * 120 }) }} data-rv="pop">
          <button type="button" aria-pressed={sel === i} onClick={() => setSel(i)} onFocus={() => setSel(i)} onMouseEnter={() => setSel(i)} className={cx("gpp-ring-node", sel === i && "is-on", i >= 4 && "is-end")}>
            <span><I size={18} aria-hidden="true" /></span><b>{n}</b>
          </button>
        </li>; })}
      </ol>
      <p className="gpp-ring-note" aria-live="polite"><b>{RING[sel]![0]}.</b> {RING[sel]![1]}</p>
    </div>
    <ol className="gpp-ring-list">{RING.map(([n, d]) => <li key={n}><b>{n}</b><span>{d}</span></li>)}</ol>
  </Scope>;
}
