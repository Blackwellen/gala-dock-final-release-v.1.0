"use client";

import { useEffect, useState } from "react";

/**
 * Workspace display scale: the same rule as Organizer/Customer (src/styles/density.css). The shell root (.ws-app) is zoomed by
 * --k-zoom, driven by the shared "gd-density" choice. This script only publishes the window height in zoomed CSS px (--ws-vh)
 * and a short/tall hint for layouts; it no longer zooms the whole page, so switching workspace keeps one consistent size.
 */
export const DENSITIES = [{ key: "compact", label: "Compact" }, { key: "default", label: "Default" }, { key: "comfortable", label: "Comfortable" }, { key: "reference", label: "Design size" }] as const;
const KEY = "gd-density";
/** Applies the saved density and publishes a short/tall hint for layouts. Window height (--ws-vh) comes from CSS (density.css). */
function apply() {
  let k = "default"; try { k = localStorage.getItem(KEY) || "default"; } catch { /* storage unavailable */ }
  const r = document.documentElement;
  if (k === "default") r.removeAttribute("data-density"); else r.dataset.density = k;
  const z = parseFloat(getComputedStyle(r).getPropertyValue("--k-zoom")) || 1, eh = innerHeight / z;
  r.dataset.wsH = eh < 700 ? "tiny" : eh < 860 ? "short" : "tall"; r.dataset.wsScale = String(Math.round(z * 100));
}

export function DesignScale() {
  useEffect(() => {
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      const r = document.documentElement;
      delete r.dataset.wsH; delete r.dataset.wsScale;
    };
  }, []);
  return null;
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
