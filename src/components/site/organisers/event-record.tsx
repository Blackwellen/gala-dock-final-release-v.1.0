"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, CalendarDays, CircleCheck, Clock3, Coins, House, ListChecks, MapPin, Megaphone, Sparkles, Tag, UsersRound } from "lucide-react";
import { TabBar, panelProps } from "../controls";
import { cx, DemoTag, pounds, vars } from "../ui";
import { trackPublic } from "../track";

/** 3.2 The Event Record — one canonical event shown through five views (Overview, Plan, Sell & Promote, Operations, Money).
 *  Every panel is in the DOM (inactive ones `hidden`), so the copy is server-rendered; only the active one animates. */
const TABS = [
  { key: "overview", label: "Overview", icon: House },
  { key: "plan", label: "Plan", icon: CalendarDays },
  { key: "sell", label: "Sell & Promote", icon: Megaphone },
  { key: "ops", label: "Operations", icon: ListChecks },
  { key: "money", label: "Money", icon: Coins },
] as const;
type K = typeof TABS[number]["key"];

function Overview() {
  return <div className="gpo-v gpo-v-overview">
    <section className="gpo-tile"><h3>Event readiness</h3>
      <div className="gpo-ready"><span className="gp-ring" style={vars({ "--p": 78, "--s": "112px" })}><b className="gpo-ready-n">78%</b></span>
        <dl>{[["Completed", "12 / 18", "ok"], ["In progress", "4 / 18", "info"], ["Not started", "2 / 18", "plain"]].map(([k, v, t]) => <div key={k}><dt><i className={`is-${t}`} />{k}</dt><dd>{v}</dd></div>)}</dl></div>
      <p className="gpo-agent-note"><Sparkles size={18} aria-hidden="true" /><span><b>Gala Agent is monitoring this event</b>Watching suppliers, ticket sales and key deadlines.</span></p>
      <h3>Key details</h3>
      <dl className="gpo-details">{[[CalendarDays, "Date & time", "24 Jul, 18:00 – 01:00"], [MapPin, "Location", "Riverside Hall, London"], [UsersRound, "Expected guests", "120"], [Tag, "Event type", "Birthday party"], [Building2, "Venue", "Confirmed"]].map(([I, k, v]) => { const Icon = I as typeof CalendarDays; return <div key={k as string}><dt><Icon size={16} aria-hidden="true" />{k as string}</dt><dd>{v === "Confirmed" ? <span className="gp-chip is-ok">Confirmed</span> : v as string}</dd></div>; })}</dl>
    </section>
    <section className="gpo-tile"><h3>Event timeline</h3>
      <ol className="gpo-steps">{["Plan", "Source", "Book", "Sell", "Promote", "Run", "Settle"].map((s, i) => <li key={s} className={cx(i === 0 && "is-done", i === 1 && "is-on")}><i />{s}<small>{i === 0 ? "Completed" : i === 1 ? "In progress" : "Upcoming"}</small></li>)}</ol>
      <h3 className="gpo-mt">Upcoming milestones</h3>
      <ul className="gpo-miles">{[["12", "Jun", "Confirm remaining suppliers", "DJ, mobile bar, security", "In progress", "info"], ["18", "Jun", "Finalise event menu", "Catering · 2 options", "Awaiting decision", "wait"], ["24", "Jun", "Launch ticket sales", "Early bird release", "Upcoming", "plain"], ["01", "Jul", "Confirm staffing schedule", "Bar staff, security, venue team", "Upcoming", "plain"], ["10", "Jul", "Final run sheet review", "Timings and responsibilities", "Upcoming", "plain"]].map(([d, m, t, s, l, tone]) => <li key={t}><time><b>{d}</b>{m}</time><span><b>{t}</b><small>{s}</small></span><span className={`gp-chip is-${tone}`}>{l}</span></li>)}</ul>
    </section>
    <section className="gpo-tile"><h3>Recent activity</h3>
      <ul className="gpo-activity">{[["Venue booking confirmed", "Riverside Hall", "2 hours ago", "ok"], ["Menu proposal received", "The Gourmet Kitchen", "4 hours ago", "plain"], ["Ticket page draft created", "Early bird tickets", "6 hours ago", "plain"], ["DJ availability confirmed", "SoundWave Events", "1 day ago", "ok"]].map(([t, s, w, tone]) => <li key={t}><i className={`is-${tone}`} /><span><b>{t}</b><small>{s}</small></span><time>{w}</time></li>)}</ul>
    </section>
  </div>;
}

function Plan() {
  return <div className="gpo-v gpo-v-plan">
    <section className="gpo-tile"><h3>Programme</h3>
      <ol className="gpo-prog">{[["17:00", "Venue access & set-up", "Venue team"], ["18:00", "Catering service begins", "The Gourmet Kitchen"], ["19:00", "Guests arrive", "Door team"], ["20:00", "DJ set", "SoundWave Events"], ["22:30", "Cake & speeches", "Host"], ["01:00", "Close & clear down", "Venue team"]].map(([t, n, w]) => <li key={t}><time>{t}</time><span><b>{n}</b><small>{w}</small></span></li>)}</ol>
    </section>
    <section className="gpo-tile"><h3>Supplier dependencies</h3>
      <div className="gpo-deps">
        <span className="gpo-dep is-root"><House size={18} aria-hidden="true" />Venue <em className="gp-chip is-ok">Confirmed</em></span>
        <ul>{[["Catering", "Needs kitchen access times", "ok", "Confirmed"], ["DJ", "Needs power & load-in slot", "ok", "Confirmed"], ["Mobile bar", "Needs licence check", "wait", "Held until Fri"], ["Security", "Needs final guest count", "plain", "Requested"]].map(([n, s, t, l]) => <li key={n} className="gpo-dep"><span><b>{n}</b><small>{s}</small></span><em className={`gp-chip is-${t}`}>{l}</em></li>)}</ul>
      </div>
    </section>
  </div>;
}

function Sell() {
  return <div className="gpo-v gpo-v-sell">
    <section className="gpo-tile"><h3>Release timeline</h3>
      <ol className="gpo-release">{[["Coming soon", "1 Jun", "Done"], ["Presale", "15 Jun", "Now"], ["General", "1 Jul", "Next"], ["Final release", "20 Jul", ""]].map(([n, d, s]) => <li key={n} className={cx(s === "Done" && "is-done", s === "Now" && "is-on")}><i /><b>{n}</b><small>{d}</small>{s && <span className={`gp-chip ${s === "Done" ? "is-ok" : s === "Now" ? "is-info" : ""}`}>{s === "Now" ? "Current" : s === "Next" ? "Upcoming" : "Completed"}</span>}</li>)}</ol>
    </section>
    <section className="gpo-tile gpo-poster-tile"><div className="gpo-mini-poster" aria-hidden="true"><small>SAT 24 JUL</small><b>Maya’s<br />30th</b><small>Riverside Hall</small></div>
      <div><h3>Listed on</h3><ul className="gpo-listed">{["Gala Dock Discover", "London event calendar", "Venue page"].map(l => <li key={l}><CircleCheck size={16} aria-hidden="true" />{l}</li>)}</ul></div>
    </section>
  </div>;
}

function Ops() {
  return <div className="gpo-v gpo-v-ops">
    <section className="gpo-tile"><h3>Run sheet</h3>
      <ol className="gpo-prog is-live">{[["18:00", "Doors open", "Done"], ["19:00", "Guests arrive", "Now"], ["20:00", "DJ set", "Next"], ["22:30", "Cake & speeches", ""]].map(([t, n, s]) => <li key={t} className={cx(s === "Now" && "is-on")}><time>{t}</time><span><b>{n}</b></span>{s && <span className={`gp-chip ${s === "Done" ? "is-ok" : s === "Now" ? "is-info" : ""}`}>{s}</span>}</li>)}</ol>
    </section>
    <section className="gpo-tile"><h3>Event map</h3>
      <svg className="gpo-floor" viewBox="0 0 320 200" role="img" aria-label="Floor plan: stage, bar, dance floor, tables and entrance">
        <rect x="4" y="4" width="312" height="192" rx="12" fill="#f7f8fa" stroke="#dfe5ef" />
        <rect x="18" y="18" width="110" height="38" rx="8" fill="#e8efff" /><text x="73" y="42" textAnchor="middle" fontSize="12" fill="#1b45c4" fontWeight="600">Stage · DJ</text>
        <rect x="210" y="18" width="92" height="38" rx="8" fill="#fff5e6" /><text x="256" y="42" textAnchor="middle" fontSize="12" fill="#965800" fontWeight="600">Bar</text>
        <rect x="88" y="72" width="140" height="60" rx="10" fill="#fff" stroke="#c9d7fb" strokeDasharray="4 4" /><text x="158" y="106" textAnchor="middle" fontSize="12" fill="#283150">Dance floor</text>
        {[[36, 150], [76, 150], [116, 150], [204, 150], [244, 150], [284, 150]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="13" fill="#fff" stroke="#c3cbdb" />)}
        <rect x="138" y="176" width="44" height="14" rx="4" fill="#e7f7f0" /><text x="160" y="187" textAnchor="middle" fontSize="9" fill="#0b7d5f" fontWeight="700">ENTRANCE</text>
      </svg>
    </section>
  </div>;
}

function Money() {
  const rows: [string, number, number][] = [["Venue", 1800, 1800], ["Catering", 1600, 1480], ["Entertainment", 650, 650], ["Staffing", 900, 960], ["Promotion", 250, 180]];
  const max = 1900;
  return <div className="gpo-v gpo-v-money">
    <section className="gpo-tile"><h3>Budget → actual</h3>
      <ul className="gpo-budget">{rows.map(([n, b, a]) => <li key={n}><span>{n}</span><span className="gpo-bars"><i style={{ width: `${b / max * 100}%` }} className="is-budget" /><i style={{ width: `${a / max * 100}%` }} className={cx("is-actual", a > b && "is-over")} /></span><em>{pounds(a)}<small> of {pounds(b)}</small></em></li>)}</ul>
      <p className="gpo-legend"><span><i className="is-budget" />Budget</span><span><i className="is-actual" />Actual</span><span><i className="is-over" />Over budget</span></p>
    </section>
    <section className="gpo-tile gpo-margin"><h3>Margin</h3>
      <dl>{[["Ticket & sponsor income", "£6,400"], ["Costs to date", "£5,070"], ["Projected margin", "£1,330"]].map(([k, v], i) => <div key={k} className={cx(i === 2 && "is-total")}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <span className="gp-ring is-ok" style={vars({ "--p": 21, "--s": "84px" })}><b>21%</b></span>
    </section>
  </div>;
}

const VIEWS: Record<K, () => React.ReactElement> = { overview: Overview, plan: Plan, sell: Sell, ops: Ops, money: Money };

export function EventRecord() {
  const [tab, setTab] = useState<K>("overview");
  const set = (k: K) => { setTab(k); trackPublic("section_interaction", "organisers", `record_${k}`); };
  return <div className="gpo-record gp-panel">
    <header className="gpo-record-h">
      <img src={"/assets/preferences-party.webp"} alt="" width={120} height={72} loading="lazy" />
      <div><p className="gpo-record-title">Maya’s 30th Birthday <span className="gp-chip is-ok">Live planning</span></p>
        <p className="gpo-record-meta"><span><CalendarDays size={15} aria-hidden="true" />24 Jul</span><span><MapPin size={15} aria-hidden="true" />London</span><span><UsersRound size={15} aria-hidden="true" />120 guests</span>{["Birthday", "Indoor", "Evening"].map(t => <span key={t} className="gp-chip">{t}</span>)}</p></div>
      <DemoTag />
    </header>
    <TabBar idBase="gpo-rec" label="Event record views" items={TABS.map(t => ({ ...t }))} value={tab} onChange={set} className="gpo-record-tabs" />
    <label className="gpo-record-select"><span className="gp-sr">Event record view</span>
      <select value={tab} onChange={e => set(e.target.value as K)}>{TABS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
    </label>
    <div className="gpo-record-stage">
      {TABS.map(t => { const V = VIEWS[t.key]; const on = t.key === tab; return <div key={t.key} {...panelProps("gpo-rec", t.key, on)} className="gpo-record-panel">
        {on ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, ease: [0.2, 0.7, 0.2, 1] }}><V /></motion.div> : <V />}
      </div>; })}
    </div>
    <p className="gpo-record-foot"><Clock3 size={15} aria-hidden="true" />Five views of the same record — a change in one shows up in all of them.</p>
  </div>;
}
