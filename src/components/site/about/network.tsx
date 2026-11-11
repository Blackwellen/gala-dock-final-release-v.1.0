"use client";
import { useState } from "react";
import { cx, vars } from "../ui";
import { Scope } from "../motion";

/** 7.4 Event network: connections draw outward from EVENT; focusing a node shows one relationship. Accessible list alongside. */
const NODES: [string, string][] = [
  ["Customer", "Plans the event and books what it needs."], ["Organiser", "Runs events professionally, often many at once."],
  ["Venue", "Hosts the event and sets what is possible on the day."], ["Provider", "Delivers food, music, photography, staff and more."],
  ["Guest", "Buys a ticket or accepts an invitation, then shows up."], ["Partner", "Promotes events and brings audiences."],
  ["Developer", "Connects other systems through the API, MCP and webhooks."],
];
export function Network() {
  const [sel, setSel] = useState(0);
  const pos = NODES.map((_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / NODES.length; return [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)] as const; });
  return <Scope className="gpa-net" amount={0.25}>
    <div className="gpa-net-vis">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {pos.map(([x, y], i) => <line key={i} x1="50" y1="50" x2={x} y2={y} pathLength={1} className={cx("gp-draw", sel === i && "is-on")} style={vars({ "--d": 200 + i * 120 })} />)}
      </svg>
      <span className="gpa-net-core" data-rv="pop">EVENT</span>
      <ul aria-label="Who the event connects">{NODES.map(([n], i) => <li key={n} style={{ left: `${pos[i]![0]}%`, top: `${pos[i]![1]}%`, ...vars({ "--d": 400 + i * 120 }) }} data-rv="pop">
        <button type="button" aria-pressed={sel === i} onClick={() => setSel(i)} onFocus={() => setSel(i)} onMouseEnter={() => setSel(i)} className={cx("gpa-net-node", sel === i && "is-on")}>{n}</button>
      </li>)}</ul>
    </div>
    <p className="gpa-net-note" aria-live="polite"><b>{NODES[sel]![0]}.</b> {NODES[sel]![1]}</p>
    <dl className="gpa-net-list">{NODES.map(([n, d]) => <div key={n}><dt>{n}</dt><dd>{d}</dd></div>)}</dl>
  </Scope>;
}
