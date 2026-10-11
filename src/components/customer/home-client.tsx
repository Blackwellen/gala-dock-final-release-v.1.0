"use client";
import { useRef, useState, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Horizontal scroll-snap carousel with arrow buttons (keyboard and touch scroll still work). */
export function HomeCarousel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => { const el = ref.current; if (!el) return; setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 }); };
  useEffect(() => { update(); const el = ref.current; el?.addEventListener("scroll", update, { passive: true }); window.addEventListener("resize", update); return () => { el?.removeEventListener("scroll", update); window.removeEventListener("resize", update); }; }, []);
  const go = (d: number) => ref.current?.scrollBy({ left: d * (ref.current.clientWidth * 0.8), behavior: "smooth" });
  return <div className="hm-car"><div ref={ref} className="hm-track" tabIndex={0} aria-label="Recommended events">{children}</div>
    {!edge.start && <button className="hm-arrow l" onClick={() => go(-1)} aria-label="Previous"><ChevronLeft size={18} /></button>}
    {!edge.end && <button className="hm-arrow r" onClick={() => go(1)} aria-label="Next"><ChevronRight size={18} /></button>}</div>;
}
