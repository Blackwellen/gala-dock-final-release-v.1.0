"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { designFor, designMap } from "@/lib/workspace/design-map";
import { pwaDesignFor, pwaDesignMap } from "@/lib/pwa/design-references";

/**
 * Development-only design overlay. Ctrl+Shift+O (or the floating button) lays the reference design for the
 * current route over the live page at the design's native 1536-px canvas, so geometry can be compared 1:1.
 * “Difference” blend makes any misalignment show up as bright edges; aligned regions turn black.
 */
export function DesignOverlay() {
  const pathname = usePathname(), sp = useSearchParams();
  const [pwa,setPwa]=useState(false);
  useEffect(()=>{const media=matchMedia('(max-width:1279px)');const update=()=>setPwa(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const auto = (pwa ? pwaDesignFor(pathname,new URLSearchParams(sp.toString())) : null) ?? designFor(pathname, new URLSearchParams(sp.toString()));
  const [on, setOn] = useState(false);
  const [opacity, setOpacity] = useState(50);
  const [blend, setBlend] = useState<"normal" | "difference">("normal");
  const [pick, setPick] = useState<string>("");
  const [dx, setDx] = useState(0), [dy, setDy] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); setOn(v => !v); }
      if (!on) return;
      if (e.altKey && e.key.startsWith("Arrow")) { e.preventDefault(); const n = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft") setDx(v => v - n); if (e.key === "ArrowRight") setDx(v => v + n); if (e.key === "ArrowUp") setDy(v => v - n); if (e.key === "ArrowDown") setDy(v => v + n); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on]);
  const file = pick || auto?.file || "";
  return <>
    {on && file && <div className="ws-overlay" aria-hidden="true" style={{ opacity: opacity / 100, mixBlendMode: blend, transform: `translate(${dx}px, ${dy}px)` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/dev/design?file=${encodeURIComponent(file)}`} alt="" />
    </div>}
    <div className={`ws-overlay-ctl ${on ? "open" : ""}`}>
      <button type="button" onClick={() => setOn(!on)} title="Design overlay (Ctrl+Shift+O)">{on ? "Hide design" : "Overlay design"}</button>
      {on && <>
        <select value={pick} onChange={e => setPick(e.target.value)} aria-label="Reference design">
          <option value="">{auto ? `Auto: ${auto.label}` : "No design mapped — pick one"}</option>
          {[...pwaDesignMap,...designMap].map(d => <option key={d.label} value={d.file}>{d.label}</option>)}
        </select>
        <label>Opacity <input type="range" min={0} max={100} value={opacity} onChange={e => setOpacity(Number(e.target.value))} /> {opacity}%</label>
        <label><input type="checkbox" checked={blend === "difference"} onChange={e => setBlend(e.target.checked ? "difference" : "normal")} /> Difference</label>
        <span className="ws-overlay-off">Offset {dx},{dy} <button type="button" onClick={() => { setDx(0); setDy(0); }}>Reset</button></span>
        <small>Alt+Arrows nudge · Shift for 10px</small>
      </>}
    </div>
  </>;
}
