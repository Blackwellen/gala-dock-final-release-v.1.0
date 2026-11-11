"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronDown, CircleAlert, CircleCheck, Clock3, MapPin, Sparkles, UsersRound } from "lucide-react";
import { Scope, useActivated } from "../motion";
import { cx, DemoTag, ph, vars, type Tone } from "../ui";

/** 3.1 EventCommandRibbon — four active events: phase, readiness, ticket pace and one blocker only. A focus line steps across the
 *  portfolio once on entry and then follows the pointer / keyboard; a blocker expands on hover or focus. Not a dashboard screenshot. */
type Row = { name: string; date: string; place: string; guests: string; phase: string; phaseTone: Tone; phaseSub: string; ready: number; sold: number; cap: number; blocker: string; detail: string; bTone: "wait" | "plain" | "ok"; img: string };
const ROWS: Row[] = [
  { name: "Summer Music Festival", date: "12–14 Jul", place: "Hyde Park, London", guests: "25,000 guests", phase: "On track", phaseTone: "ok", phaseSub: "Event setup", ready: 78, sold: 18240, cap: 25000, blocker: "Confirm final stage production", detail: "Production quote expires Friday — approve it to lock the stage build.", bTone: "wait", img: "hero-neon.webp" },
  { name: "Corporate Awards Dinner", date: "3 Oct", place: "The Riverside, London", guests: "1,200 guests", phase: "Planning", phaseTone: "info", phaseSub: "Venue & suppliers", ready: 52, sold: 640, cap: 1200, blocker: "Awaiting menu confirmation", detail: "The caterer has two menu options waiting for your choice.", bTone: "plain", img: "v-grand-hall.webp" },
  { name: "NYE Nightclub Event", date: "31 Dec", place: "Shoreditch, London", guests: "3,000 guests", phase: "Selling", phaseTone: "violet", phaseSub: "Tickets & promotion", ready: 68, sold: 2040, cap: 3000, blocker: "Finalise security staffing", detail: "Two door supervisors still to assign for the late shift.", bTone: "plain", img: "ev-neon.webp" },
  { name: "Private Wedding", date: "21 Jun", place: "Kew, London", guests: "200 guests", phase: "Final checks", phaseTone: "wait", phaseSub: "Run sheet ready", ready: 92, sold: 185, cap: 200, blocker: "All set — no blockers", detail: "Every supplier has confirmed arrival times.", bTone: "ok", img: "type-wedding.webp" },
];

export function CommandRibbon() {
  const [ref, on] = useActivated<HTMLDivElement>(0.3);
  const [focus, setFocus] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  // One pass across the portfolio on entry, then rest on the event with the blocker (no endless loop).
  useEffect(() => {
    if (!on) return;
    const ids = [1, 2, 3, 0].map((n, i) => setTimeout(() => setFocus(n), 650 + i * 650));
    return () => ids.forEach(clearTimeout);
  }, [on]);
  return <div ref={ref} className="gpo-ribbon gp-panel">
    <header className="gpo-ribbon-h">
      <div><p className="gpo-ribbon-title">Your events</p><p>Live overview across the portfolio</p></div>
      <span className="gpo-agent-pill"><Sparkles size={16} aria-hidden="true" />Gala Agent watching 3 events<i aria-hidden="true" /></span>
      <DemoTag />
    </header>
    <Scope as="ul" className="gpo-rows" aria-label="Example event portfolio" amount={0.2}>
      {ROWS.map((r, i) => <li key={r.name} className={cx("gpo-row", focus === i && "is-focus")} data-rv="right" style={vars({ "--d": 100 + i * 110 })}
        onMouseEnter={() => setFocus(i)} onFocusCapture={() => setFocus(i)}>
        {focus === i && <motion.span layoutId="gpo-focus" className="gpo-focus" aria-hidden="true" transition={{ type: "spring", stiffness: 260, damping: 30 }} />}
        <img src={ph(r.img)} alt="" width={84} height={72} loading="lazy" />
        <div className="gpo-row-ev"><b>{r.name}</b><small><CalendarDays size={13} aria-hidden="true" />{r.date}</small><small><MapPin size={13} aria-hidden="true" />{r.place}</small><small><UsersRound size={13} aria-hidden="true" />{r.guests}</small></div>
        <div className="gpo-row-col"><span className="gpo-k">Phase</span><span className={`gp-chip is-${r.phaseTone}`}>{r.phase}</span><small>{r.phaseSub}</small></div>
        <div className="gpo-row-col is-ready"><span className="gpo-k">Readiness</span><span className={cx("gp-ring", r.ready > 90 && "is-ok", r.phaseTone === "violet" && "is-violet")} style={vars({ "--p": r.ready, "--s": "50px" })}><b>{r.ready}%</b></span></div>
        <div className="gpo-row-col is-sold"><span className="gpo-k">Tickets sold</span><b><span className="gp-blue">{r.sold.toLocaleString("en-GB")}</span> / {r.cap.toLocaleString("en-GB")}</b><span className="gp-bar gp-grow"><i style={{ width: `${Math.round(r.sold / r.cap * 100)}%`, ...vars({ "--d": 500 + i * 110 }) }} /></span></div>
        <div className="gpo-row-col is-block"><span className="gpo-k">Blocker</span>
          <button type="button" className={`gpo-block is-${r.bTone}`} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => setOpen(i)} onMouseLeave={() => setOpen(null)}>
            {r.bTone === "wait" ? <CircleAlert size={18} aria-hidden="true" /> : r.bTone === "ok" ? <CircleCheck size={18} aria-hidden="true" /> : <Clock3 size={18} aria-hidden="true" />}
            <span>{r.blocker}</span><ChevronDown size={15} aria-hidden="true" className="gpo-block-chev" />
          </button>
          {open === i && <motion.p className="gpo-block-detail" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>{r.detail}</motion.p>}
        </div>
      </li>)}
    </Scope>
  </div>;
}
