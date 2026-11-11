"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Compass, LayoutGrid, MapPin, Ticket, Coins, UsersRound } from "lucide-react";
import { Scope } from "../motion";
import { cx, DemoTag, vars } from "../ui";
import { trackPublic } from "../track";

/** 3.4 LaunchDesk — poster (left, never dominant), ticket release timeline (centre), distribution destinations (right) and the
 *  sales trajectory as a shared baseline. Choosing a release phase lights the destinations that phase opens and moves the marker. */
const PHASES = [
  { key: "soon", name: "Coming Soon", date: "1 Jun", note: "Event page live", aim: "Build awareness · save the date", sold: 0, x: 14 },
  { key: "pre", name: "Presale", date: "15 Jun", note: "Early access", aim: "Reward your early audience", sold: 680, x: 38 },
  { key: "gen", name: "General Release", date: "1 Jul", note: "Open to all", aim: "Main ticket sales · drive volume", sold: 1240, x: 64 },
  { key: "final", name: "Final Release", date: "20 Jul", note: "Last tickets", aim: "Create urgency · final push", sold: 1780, x: 86 },
] as const;
const DEST: [string, string, typeof Compass, number][] = [
  ["Gala Dock Discover", "Featured in event discovery", Compass, 0], ["London event calendar", "Listed in the local calendar", CalendarDays, 0],
  ["Venue page", "Shown on the venue profile", MapPin, 1], ["Category pages", "Listed under relevant categories", LayoutGrid, 2], ["Event promoters", "Open to verified promoters", UsersRound, 2],
];
const TOTAL = 2000;
// Cumulative sales curve (viewBox 0 0 1000 220): Jun → Aug.
const CURVE = "M40 200 C 160 198, 230 192, 300 184 S 420 150, 470 140 S 600 104, 660 90 S 800 60, 860 52 S 940 46, 980 44";

export function LaunchDesk() {
  const [p, setP] = useState(1);
  const ph = PHASES[p]!;
  const pick = (i: number) => { setP(i); trackPublic("section_interaction", "organisers", `release_${PHASES[i]!.key}`); };
  return <Scope className="gpo-launch" amount={0.12}>
    <div className="gpo-launch-top">
      <figure className="gpo-poster" data-rv="left" aria-label="Example event poster: Summer Sessions, Saturday 24 July, Riverside Hall London">
        <div aria-hidden="true">
          <p className="gpo-poster-top"><span>SAT<br /><b>24 JUL</b></span><span>RIVERSIDE HALL<br />LONDON</span></p>
          <p className="gpo-poster-title">SUMMER<br />SESSIONS</p>
          <p className="gpo-poster-sub">HOUSE · TECH · GOOD VIBES</p>
          <p className="gpo-poster-acts">DJ MARKO · LEAH J · THE SIGNALS</p>
        </div>
      </figure>
      <div className="gpo-releases gp-card" data-rv="rise" style={vars({ "--d": 120 })}>
        <div className="gpo-releases-h"><div><h3>Ticket release timeline</h3><p>Plan releases to build momentum.</p></div><DemoTag /></div>
        <div className="gpo-phases-wrap">
          <span className="gpo-phase-line" aria-hidden="true"><motion.i initial={false} animate={{ scaleX: p / 3 }} transition={{ type: "spring", stiffness: 140, damping: 24 }} /></span>
          <ol className="gpo-phases">
          {PHASES.map((x, i) => <li key={x.key} className={cx(i < p && "is-done", i === p && "is-on")}>
            <button type="button" aria-current={i === p ? "step" : undefined} onClick={() => pick(i)}>
              <i aria-hidden="true" /><b>{x.name}</b><small>{x.date}</small><small>{x.note}</small>
              <span className={`gp-chip ${i < p ? "is-ok" : i === p ? "is-info" : ""}`}>{i < p ? "Completed" : i === p ? "Current" : "Upcoming"}</span>
              <span className="gpo-phase-aim">{x.aim}</span>
            </button>
          </li>)}
          </ol>
        </div>
      </div>
      <div className="gpo-dist gp-card" data-rv="right" style={vars({ "--d": 220 })}>
        <h3>Distribute across Gala Dock</h3><p>Choose where the event is listed as each release opens.</p>
        <ul aria-live="polite">{DEST.map(([n, s, I, at]) => { const on = at <= p; return <li key={n} className={cx(on && "is-on")}>
          <span className="gpo-dist-ic"><I size={20} aria-hidden="true" /></span><span><b>{n}</b><small>{s}</small></span>
          <span className="gpo-switch" aria-hidden="true"><i /></span><span className="gp-sr">{on ? "Listed" : "Opens later"}</span>
        </li>; })}</ul>
      </div>
    </div>
    <div className="gpo-sales gp-card" data-rv="rise" style={vars({ "--d": 300 })}>
      <div className="gpo-sales-copy">
        <h3>Projected ticket sales</h3><p>How the event can build with each release phase.</p>
        <dl>
          <div><dt><Ticket size={18} aria-hidden="true" />Total tickets</dt><dd>{TOTAL.toLocaleString("en-GB")}</dd></div>
          <div><dt><Coins size={18} aria-hidden="true" />Projected revenue</dt><dd>£48,500</dd></div>
          <div><dt><UsersRound size={18} aria-hidden="true" />Sold by {ph.name.toLowerCase()}</dt><dd>{ph.sold.toLocaleString("en-GB")} ({Math.round(ph.sold / TOTAL * 100)}%)</dd></div>
        </dl>
      </div>
      <figure className="gpo-chart">
        <svg viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="gpo-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2457e6" stopOpacity=".16" /><stop offset="1" stopColor="#2457e6" stopOpacity="0" /></linearGradient></defs>
          {[44, 96, 148, 200].map(y => <line key={y} x1="40" x2="980" y1={y} y2={y} stroke="#eef1f6" />)}
          <path d={`${CURVE} L980 200 L40 200 Z`} fill="url(#gpo-area)" />
          <path d={CURVE} className="gp-draw" pathLength={1} fill="none" stroke="#2457e6" strokeWidth="3" style={vars({ "--d": 500 })} />
          {PHASES.map((x, i) => <line key={x.key} x1={x.x * 10} x2={x.x * 10} y1="20" y2="200" stroke={i === p ? "#2457e6" : "#cdd5e3"} strokeDasharray="4 5" />)}
        </svg>
        <div className="gpo-chart-labels" aria-hidden="true">{PHASES.map((x, i) => <span key={x.key} style={{ left: `${x.x}%` }} className={cx(i === p && "is-on")}>{x.name}</span>)}</div>
        <motion.span className="gpo-chart-tip" aria-hidden="true" initial={false} animate={{ left: `${ph.x}%` }} transition={{ type: "spring", stiffness: 160, damping: 24 }}>
          <b>{ph.sold.toLocaleString("en-GB")} tickets</b><small>{Math.round(ph.sold / TOTAL * 100)}% of total</small>
        </motion.span>
        <figcaption className="gp-sr">Example cumulative sales: none during Coming Soon, 680 by the end of presale, 1,240 by general release and 1,780 by the final release, of 2,000 tickets.</figcaption>
        <p className="gpo-chart-x" aria-hidden="true"><span>Jun</span><span>Jul</span><span>Aug</span></p>
      </figure>
    </div>
  </Scope>;
}
