"use client";

import { useEffect, useState } from "react";

/**
 * Workspace display scale (same "gd-density" key and html[data-density] values as the Customer/Organizer kit).
 * Workspace type is calibrated to the reference designs, so "default" renders at design size; compact .86, comfortable 1.08,
 * reference 1 (the 1536×1024 design canvas exactly, for 1:1 checks).
 * On desktop windows narrower than the design canvas the layout additionally scales to fit it. Mobile/tablet layouts run at 1:1.
 * The inline script applies the scale before first paint; the effect keeps it in sync and clears it when leaving the workspace.
 */
export const DENSITIES = [{ key: "compact", label: "Compact" }, { key: "default", label: "Default" }, { key: "comfortable", label: "Comfortable" }, { key: "reference", label: "Design size" }] as const;
const KEY = "gd-density";
const compute = `(function(){var k="default";try{k=localStorage.getItem("${KEY}")||"default"}catch(e){}
var w=innerWidth,h=innerHeight,s=1;if(w>=1181){var d=k==="compact"?.86:k==="comfortable"?1.08:k==="reference"?1:1;s=k==="reference"?1:Math.max(.78,Math.min(w/1536,1)*d);}
var r=document.documentElement;r.style.zoom=s===1?"":String(s);var eh=h/s;r.style.setProperty("--ws-vh",eh+"px");
r.dataset.wsH=eh<700?"tiny":eh<860?"short":"tall";r.dataset.wsScale=String(Math.round(s*100));r.dataset.density=k;})()`;
const apply = () => new Function(compute)();

export function DesignScale() {
  useEffect(() => {
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      const r = document.documentElement;
      r.style.zoom = ""; r.style.removeProperty("--ws-vh"); delete r.dataset.wsH; delete r.dataset.wsScale; 
    };
  }, []);
  return <script dangerouslySetInnerHTML={{ __html: compute }} />;
}

/** Display size control for the account menu (per-device preference). */
export function DensityPicker() {
  const [current, setCurrent] = useState(() => (typeof document === "undefined" ? "default" : document.documentElement.dataset.density ?? "default"));
  return <div className="ws-density" role="radiogroup" aria-label="Display size">
    <small>Display size</small>
    <div>{DENSITIES.map(d => <button key={d.key} type="button" role="radio" aria-checked={current === d.key} className={current === d.key ? "on" : ""}
      onClick={() => { try { localStorage.setItem(KEY, d.key); } catch {} setCurrent(d.key); apply(); }}>{d.label}</button>)}</div>
  </div>;
}
