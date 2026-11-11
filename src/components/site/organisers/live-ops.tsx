"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CircleAlert, CircleCheck, Circle, Clock3, MapPin, ScanLine, Sparkles, Ticket, UsersRound, ChevronRight } from "lucide-react";
import { useActivated } from "../motion";
import { cx, DemoTag, ph } from "../ui";
import { trackPublic } from "../track";

/** 3.5 Event-Day Command — NOW / NEXT / ISSUE lanes, provider arrivals and the Gala Agent status moving from watch to a suggestion.
 *  A fixed, simulated sequence (no polling): it plays once when visible. Status is always text + icon; updates are polite. */
const AGENT = ["Watching arrivals against the run sheet", "Photographer is 18 minutes late — finding replacement options…", "2 nearby photographers available — ready for your approval"];

export function LiveOps() {
  const [ref, on] = useActivated<HTMLDivElement>(0.25);
  const [step, setStep] = useState(0);
  const [issue, setIssue] = useState(false);
  useEffect(() => {
    if (!on) return;
    const a = setTimeout(() => setStep(1), 1400), b = setTimeout(() => setStep(2), 3600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [on]);
  return <div ref={ref} className="gpo-live">
    <header className="gpo-live-ev gp-card">
      <img src={ph("ev-neon-c.webp")} alt="" width={120} height={72} loading="lazy" />
      <div><p className="gpo-live-name">Summer Sessions <span className="gp-chip is-ok">Live now</span></p>
        <p className="gpo-live-meta"><span><CalendarDays size={15} aria-hidden="true" />24 Jul</span><span><MapPin size={15} aria-hidden="true" />Riverside Hall, London</span><span><UsersRound size={15} aria-hidden="true" />2,500 guests</span></p></div>
      <p className="gpo-live-time"><small>Event time</small><b>18:00 – 01:00</b></p>
      <DemoTag />
    </header>
    <div className="gpo-lanes">
      <section className="gpo-lane is-now gp-card" aria-label="Now">
        <h3 className="gpo-lane-h"><span><Clock3 size={18} aria-hidden="true" />NOW</span><time>18:12</time></h3>
        <div className="gpo-lane-main"><img src={ph("ev-neon.webp")} alt="" width={128} height={86} loading="lazy" /><div><b>Doors open</b><p>Guests are arriving and scanning tickets at the main entrance.</p>
          <span className="gpo-checkin"><span className="gp-bar"><motion.i initial={false} animate={{ scaleX: on ? .94 : .8 }} transition={{ duration: 1.6, ease: [0.2, 0.7, 0.2, 1] }} style={{ width: "100%" }} /></span><small><b>2,341</b> / 2,500 expected · 94%</small></span></div></div>
        <ul className="gpo-now-stats">{[[UsersRound, "2,341", "Guests in"], [ScanLine, "0 min", "Queue time"], [Ticket, "159", "Tickets left"]].map(([I, v, l]) => { const Icon = I as typeof Clock3; return <li key={l as string}><Icon size={18} aria-hidden="true" /><b>{v as string}</b><small>{l as string}</small></li>; })}</ul>
      </section>
      <section className="gpo-lane is-next gp-card" aria-label="Next">
        <h3 className="gpo-lane-h"><span><Circle size={18} aria-hidden="true" />NEXT</span><time>19:30<small>in 1h 18m</small></time></h3>
        <div className="gpo-lane-main"><img src={ph("s-sound-lighting.webp")} alt="" width={110} height={76} loading="lazy" /><div><b>Support act</b><p>The Signal Line · Main stage</p></div></div>
        <ol className="gpo-next-list">{[["19:30", "Support act", "The Signal Line", "45 mins"], ["20:15", "Headline act", "Aurora Heights", "90 mins"], ["21:45", "DJ set", "DJ Marko", "75 mins"]].map(([t, n, w, d], i) => <li key={t} className={cx(i === 0 && "is-on")}><time>{t}</time><span><b>{n}</b><small>{w}</small></span><em>{d}</em></li>)}</ol>
      </section>
      <section className={cx("gpo-lane is-issue gp-card", step > 0 && "is-raised")} aria-label="Issue">
        <h3 className="gpo-lane-h"><span><CircleAlert size={18} aria-hidden="true" />ISSUE</span><time>18 min late</time></h3>
        <div className="gpo-lane-main"><img src={ph("s-snapshot.webp")} alt="" width={110} height={76} loading="lazy" /><div><b>Photographer</b><p>Expected on site at 17:30</p></div></div>
        <button type="button" className="gpo-issue-btn" aria-expanded={issue} onClick={() => { setIssue(!issue); trackPublic("section_interaction", "organisers", "live_issue"); }}>
          <CircleAlert size={18} aria-hidden="true" /><span><b>Provider is 18 minutes late</b><small>See what happens next</small></span><ChevronRight size={18} aria-hidden="true" className="gpo-issue-chev" />
        </button>
        <AnimatePresence initial={false}>{issue && <motion.ol className="gpo-issue-detail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
          <li><CircleCheck size={15} aria-hidden="true" />Provider contacted at 17:45</li>
          <li><CircleCheck size={15} aria-hidden="true" />Backup photographer on standby notified</li>
          <li><Clock3 size={15} aria-hidden="true" />You decide: wait, or confirm the backup</li>
        </motion.ol>}</AnimatePresence>
      </section>
    </div>
    <div className="gpo-live-bottom">
      <section className="gpo-arrivals gp-card" aria-label="Provider arrivals">
        <h3>Provider arrivals</h3><p>Key providers and their on-site status.</p>
        <ul>{[["Security", "On site", "Arrived 16:45", "ok", "s-elite-security.webp"], ["Bar team", "On site", "Arrived 17:10", "ok", "bc-riverside-bars.webp"], ["DJ", "On site", "Arrived 17:20", "ok", "s-dj-marcus.webp"], ["Photographer", "En route", "ETA 18:18", "wait", "s-snapshot.webp"]].map(([n, s, t, tone, img]) => <li key={n}>
          <img src={ph(img)} alt="" width={56} height={56} loading="lazy" /><span><b>{n}</b><span className={`gp-state is-${tone}`}>{tone === "ok" ? <CircleCheck size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}{s}</span><small>{t}</small></span></li>)}</ul>
      </section>
      <section className="gpo-agent gp-card" aria-label="Gala Agent status">
        <h3><Sparkles size={18} aria-hidden="true" />Gala Agent <span className="gp-state is-ok"><i className="gpo-dot" />Active</span></h3>
        <p className="gpo-agent-now" aria-live="polite">{AGENT[step]}</p>
        <ol>{["Contacting nearby photographers", "Checking availability and quotes", "Preparing options for your approval"].map((s, i) => <li key={s} className={cx(step === 2 || (step === 1 && i === 0) ? "is-done" : step === 1 && i === 1 ? "is-on" : "")}>
          {step === 2 || (step === 1 && i === 0) ? <CircleCheck size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}{s}</li>)}</ol>
        {step === 2 && <motion.p className="gpo-agent-ask" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>Nothing is booked until you approve it.</motion.p>}
      </section>
    </div>
  </div>;
}
