"use client";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { useHydrated } from "@/lib/use-hydrated";
import { createElement, useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

/**
 * Public-site motion contract (blueprint §1.5). Entrance choreography is CSS that only exists under `html.gp-motion` (set before
 * first paint by the root layout when the visitor has not asked for reduced motion), triggered by Framer Motion's `useInView`.
 * So: server HTML always contains every word at full opacity (SEO, no-JS, reduced motion, axe), nothing re-flows, and only
 * transform / opacity / stroke-dashoffset animate. Interactive state changes use Framer Motion components directly
 * (layoutId indicators, layout reorder, drag), which <MotionConfig reducedMotion="user"> in the root Providers turns off.
 */
export function useScope<T extends Element>(amount = 0.25) {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { once: true, amount });
  useEffect(() => { document.documentElement.classList.add("gp-ready"); }, []);
  return [ref, inView] as const;
}

type ScopeProps = { as?: ElementType; className?: string; children?: ReactNode; amount?: number; id?: string; style?: CSSProperties; onIn?: () => void } & Record<string, unknown>;

/** Marks a region whose `[data-rv]` children and `.gp-draw` paths play once when it scrolls into view. */
export function Scope({ as = "div", className = "", children, amount = 0.25, onIn, ...rest }: ScopeProps) {
  const [ref, inView] = useScope<HTMLElement>(amount);
  useEffect(() => { if (inView) onIn?.(); }, [inView, onIn]);
  return createElement(as, { ref, className: `${className}${inView ? " is-in" : ""}`, "data-scope": "", ...rest }, children);
}

/** True once the element is in view; false until then. Under reduced motion it is true immediately (final state, no sequence). */
export function useActivated<T extends Element>(amount = 0.35) {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { once: true, amount });
  const reduce = useReducedMotion();
  // Hydration-safe: the server and the hydrating render both see "not yet"; reduced motion then jumps straight to the end.
  const hydrated = useHydrated();
  return [ref, inView || (hydrated && !!reduce)] as const;
}

/** Number interpolation (blueprint: "summary values interpolate"). Renders the final value on the server and under reduced motion. */
export function Count({ value, format = n => Math.round(n).toLocaleString("en-GB"), duration = 0.7 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce || from.current === value) { from.current = value; setShown(value); return; }
    const c = animate(from.current, value, { duration, ease: [0.2, 0.7, 0.2, 1], onUpdate: setShown });
    from.current = value;
    return () => c.stop();
  }, [value, reduce, duration]);
  return <>{format(shown)}</>;
}

/** Runs `tick` every `ms` only while `active` and the tab is visible (blueprint §10.5: pause animation offscreen / hidden). */
export function useVisibleInterval(active: boolean, ms: number, tick: () => void) {
  const cb = useRef(tick);
  useEffect(() => { cb.current = tick; });
  useEffect(() => {
    if (!active) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id && document.visibilityState === "visible") id = setInterval(() => cb.current(), ms); };
    const stop = () => { if (id) clearInterval(id); id = null; };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    start(); document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [active, ms]);
}
