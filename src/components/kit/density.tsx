"use client";
import { useEffect, useState } from "react";
import { Minimize2, Square, Maximize2 } from "lucide-react";

const KEY = "gd-density";
type D = "compact" | "default" | "comfortable";
function apply(d: D) { if (d === "default") document.documentElement.removeAttribute("data-density"); else document.documentElement.setAttribute("data-density", d); }
/** Applies the saved density preference (per device). */
export function DensityInit() { useEffect(() => { try { const d = localStorage.getItem(KEY) as D | null; if (d) apply(d); } catch { /* storage unavailable */ } }, []); return null; }
/** Compact / Default / Comfortable switch for account menus. */
export function DensitySwitch() {
  const [d, setD] = useState<D>("default");
  useEffect(() => { try { setD((localStorage.getItem(KEY) as D | null) ?? "default"); } catch { /* ignore */ } }, []);
  const pick = (v: D) => { setD(v); apply(v); try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };
  return <div style={{ padding: "6px 10px" }}><div className="k-xs k-muted" style={{ marginBottom: 6 }}>Display density</div>
    <div className="k-seg" role="radiogroup" aria-label="Display density" style={{ width: "100%" }}>{([["compact", "Compact", Minimize2], ["default", "Default", Square], ["comfortable", "Large", Maximize2]] as const).map(([v, l, I]) => <button key={v} type="button" role="radio" aria-checked={d === v} aria-pressed={d === v} onClick={() => pick(v)} style={{ flex: 1, justifyContent: "center" }}><I size={12} />{l}</button>)}</div></div>;
}
