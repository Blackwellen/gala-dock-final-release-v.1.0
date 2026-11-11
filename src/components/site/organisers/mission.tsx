"use client";
/* eslint-disable @next/next/no-img-element -- fixed-size illustration thumbnails with reserved dimensions */
import { useState } from "react";
import { motion } from "framer-motion";
import { CircleCheck, Circle, Clock3, Goal, LoaderCircle, ShieldCheck } from "lucide-react";
import { Scope } from "../motion";
import { cx, DemoTag, ph, vars } from "../ui";
import { trackPublic } from "../track";

/** 3.6 Gala Agent mission canvas — goal, progress and durable steps with modes, an external wait, and an approval only on the
 *  consequential step. A static, deterministic illustration: no model is called on this page, and no chat bubbles. */
type Step = { n: number; title: string; sub: string; mode: "Task" | "Mission" | "Routine" | "Wait" | "Approval"; status: "done" | "wait" | "approve"; detail: string; when: string; img?: string };
const STEPS: Step[] = [
  { n: 1, title: "Validate venue", sub: "Confirm availability, capacity and requirements", mode: "Task", status: "done", detail: "Riverside Hall confirmed for 250", when: "2 hours ago" },
  { n: 2, title: "Build ticket plan", sub: "Tiers, pricing and release strategy", mode: "Mission", status: "done", detail: "4 ticket tiers drafted", when: "3 hours ago" },
  { n: 3, title: "Check supplier availability", sub: "Key suppliers (DJ, bar, security)", mode: "Task", status: "done", detail: "All primary suppliers available", when: "5 hours ago" },
  { n: 4, title: "Prepare event poster", sub: "Create and finalise artwork", mode: "Task", status: "done", detail: "Poster v3 ready for review", when: "1 day ago", img: "ev-neon-c.webp" },
  { n: 5, title: "Configure calendar distribution", sub: "Gala Dock, London calendar and venue page", mode: "Mission", status: "done", detail: "3 destinations configured", when: "1 day ago" },
  { n: 6, title: "Await photographer quote", sub: "Follow up and confirm availability", mode: "Wait", status: "wait", detail: "Provider replied · quote due within 24 hours", when: "1 hour ago" },
  { n: 7, title: "Set up promotion schedule", sub: "Plan social posts and email reminders", mode: "Routine", status: "done", detail: "10 posts scheduled as drafts", when: "1 day ago" },
  { n: 8, title: "Prepare run sheet", sub: "Timings, staff and responsibilities", mode: "Task", status: "done", detail: "Run sheet v1.2 complete", when: "4 hours ago" },
  { n: 9, title: "Approval: publish event", sub: "Review final details and publish to ticketing", mode: "Approval", status: "approve", detail: "Ready to publish — needs your approval", when: "Now" },
];
const FILTERS = [["all", "All actions"], ["done", "Completed"], ["wait", "Waiting"], ["approve", "Needs approval"]] as const;
type F = typeof FILTERS[number][0];

export function Mission() {
  const [filter, setFilter] = useState<F>("all");
  const [approved, setApproved] = useState(false);
  const done = STEPS.filter(s => s.status === "done").length;
  const list = STEPS.filter(s => filter === "all" || s.status === filter);
  return <Scope className="gpo-mission gp-panel" amount={0.15}>
    <header className="gpo-mission-h">
      <span className="gpo-agent-av"><img src="/assets/agent-character.png" alt="" width={64} height={64} loading="lazy" /></span>
      <div><p className="gpo-mission-title">Gala Agent</p><p>Turning your event plan into action</p></div>
      <span className="gp-chip is-ok"><i />Active</span>
      <DemoTag />
    </header>
    <div className="gpo-goal" data-rv="fade">
      <Goal size={26} aria-hidden="true" />
      <div><small>Current goal</small><b>Prepare this event for launch and identify anything blocking readiness.</b><p>Working through 9 actions across planning, suppliers, ticketing and promotion.</p></div>
      <div className="gpo-goal-prog"><span><b>{done + (approved ? 1 : 0)} / 9</b> actions done</span><span className="gp-bar is-ok gp-grow"><i style={{ width: `${Math.round((done + (approved ? 1 : 0)) / 9 * 100)}%`, ...vars({ "--d": 300 }) }} /></span></div>
    </div>
    <div className="gp-pills gpo-mission-filters" role="group" aria-label="Filter actions">
      {FILTERS.map(([k, l]) => <button key={k} type="button" className="gp-pill" aria-pressed={filter === k} onClick={() => { setFilter(k); trackPublic("section_interaction", "organisers", `mission_${k}`); }}>{l} ({k === "all" ? 9 : STEPS.filter(s => s.status === k).length})</button>)}
    </div>
    <ol className="gpo-steps-list" aria-label="Mission actions">
      {list.map((s, i) => {
        const isApprove = s.status === "approve";
        const finished = s.status === "done" || (isApprove && approved);
        return <motion.li layout="position" key={s.n} className={cx("gpo-mstep", isApprove && "is-approve", s.status === "wait" && "is-wait")} data-rv={isApprove ? "rise" : "fade"} style={vars({ "--d": isApprove ? 1500 : 150 + i * 120 })}>
          <span className="gpo-mstep-n">{s.n}</span>
          <span className={cx("gpo-mstep-ic", finished && "is-done", s.status === "wait" && "gp-pulse")} aria-hidden="true">{finished ? <CircleCheck size={22} /> : s.status === "wait" ? <LoaderCircle size={20} /> : <Circle size={22} />}</span>
          <span className="gpo-mstep-t"><b>{s.title}</b><small>{s.sub}</small></span>
          <span className={`gpo-mode is-${s.mode.toLowerCase()}`}>{s.mode}</span>
          <span className={cx("gp-state", finished ? "is-ok" : s.status === "wait" ? "is-wait" : "is-info")}>{finished ? <CircleCheck size={15} aria-hidden="true" /> : s.status === "wait" ? <Clock3 size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}{finished ? (isApprove ? "Approved" : "Completed") : s.status === "wait" ? "Waiting" : "Awaiting your approval"}</span>
          <span className="gpo-mstep-d">{s.img && <img src={ph(s.img)} alt="" width={52} height={36} loading="lazy" />}{isApprove && approved ? "Published to ticketing by you" : s.detail}</span>
          {isApprove ? <span className="gpo-mstep-act">
            {!approved ? <button type="button" className="gp-btn gp-btn--primary gp-btn--xs" onClick={() => { setApproved(true); trackPublic("section_interaction", "organisers", "mission_approve"); }}>Review &amp; publish</button>
              : <button type="button" className="gp-btn gp-btn--ghost gp-btn--xs" onClick={() => setApproved(false)}>Undo (example)</button>}
          </span> : <time className="gpo-mstep-when">{s.when}</time>}
        </motion.li>;
      })}
    </ol>
    <p className="gpo-mission-foot" aria-live="polite"><ShieldCheck size={16} aria-hidden="true" />{approved ? "Approved. In Gala Dock, consequential steps like publishing run only after a person approves them." : "Publishing is consequential, so Gala Agent stops and asks. Nothing goes live without your approval."}</p>
  </Scope>;
}
