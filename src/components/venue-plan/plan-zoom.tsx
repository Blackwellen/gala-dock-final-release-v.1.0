"use client";
import { useEffect, useRef, useState, type ReactNode, type PointerEvent as RPE } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

const STEPS = [1, 1.5, 2, 3, 4];

/**
 * Pan / zoom frame for a server-rendered plan (the SVG arrives as children, so the map renderer never ships to the browser).
 * Fit-to-width by default; zoom keeps the centre in view; drag with a mouse, swipe on touch (native scrolling), or use the
 * keyboard (+ / − / 0 and the arrow keys once the frame has focus).
 */
export function PlanZoom({ children, label }: { children: ReactNode; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const prev = useRef(1);
  const z = STEPS[i]!;

  useEffect(() => {
    const el = box.current; if (!el) return;
    const k = z / prev.current; prev.current = z;
    const cx = el.scrollLeft + el.clientWidth / 2, cy = el.scrollTop + el.clientHeight / 2;
    el.scrollLeft = cx * k - el.clientWidth / 2; el.scrollTop = cy * k - el.clientHeight / 2;
  }, [z]);

  const down = (e: RPE<HTMLDivElement>) => { if (e.pointerType !== "mouse" || z === 1 || !box.current) return; drag.current = { x: e.clientX, y: e.clientY, l: box.current.scrollLeft, t: box.current.scrollTop }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e: RPE<HTMLDivElement>) => { const d = drag.current, el = box.current; if (!d || !el) return; el.scrollLeft = d.l - (e.clientX - d.x); el.scrollTop = d.t - (e.clientY - d.y); };
  const up = () => { drag.current = null; };

  return <div className="pp-frame">
    <div className="pp-tools" role="toolbar" aria-label="Map zoom">
      <button type="button" onClick={() => setI(v => Math.min(STEPS.length - 1, v + 1))} disabled={i === STEPS.length - 1} aria-label="Zoom in"><ZoomIn size={16} /></button>
      <button type="button" onClick={() => setI(v => Math.max(0, v - 1))} disabled={i === 0} aria-label="Zoom out"><ZoomOut size={16} /></button>
      <button type="button" onClick={() => setI(0)} disabled={i === 0} aria-label="Fit map to width"><Maximize2 size={15} /></button>
    </div>
    <div ref={box} className={`pp-scroll${z > 1 ? " zoomed" : ""}`} tabIndex={0} role="group" aria-label={`${label}. Use plus and minus to zoom.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onKeyDown={e => { if (e.key === "+" || e.key === "=") { e.preventDefault(); setI(v => Math.min(STEPS.length - 1, v + 1)); } else if (e.key === "-") { e.preventDefault(); setI(v => Math.max(0, v - 1)); } else if (e.key === "0") setI(0); }}>
      <div className="pp-canvas" style={{ width: `${z * 100}%`, height: `${z * 100}%` }}>{children}</div>
    </div>
  </div>;
}
