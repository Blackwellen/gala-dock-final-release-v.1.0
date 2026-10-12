"use client";
import { useState } from "react";

/** "View by" area filter for a server-rendered list (<ol data-areas={target}> with <li data-area>): hides rows that don't match. */
export function AreaFilter({ areas, label, target }: { areas: string[]; label: string; target: string }) {
  const [v, setV] = useState("");
  // Only set after a user choice (client-side), so CSS.escape is always available here.
  const css = v ? "[data-areas=\"" + CSS.escape(target) + "\"] > li[data-area]:not([data-area=\"" + CSS.escape(v) + "\"]){display:none}" : "";
  return <>
    <select className="k-select sm" aria-label={`View by ${label.toLowerCase()}`} value={v} onChange={e => setV(e.target.value)}>
      <option value="">All {label.toLowerCase()}s</option>{areas.map(a => <option key={a} value={a}>{a}</option>)}</select>
    {css && <style>{css}</style>}
  </>;
}
