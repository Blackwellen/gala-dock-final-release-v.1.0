"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { Layers, X, Eye, EyeOff } from "lucide-react";

// Route → reference (first match wins). Used to preselect the right design.
const MAP: [RegExp, string, string?][] = [
  [/^\/organizer$/, "Gala·Dock Event Command Centre.png"],
  [/^\/organizer\/events$/, "Modern Event Management Dashboard.png"],
  [/^\/organizer\/events\/[^/]+$/, "Neon Nights Festival Dashboard.png", "overview"],
  [/^\/organizer\/calendar/, "Gala·Dock Event Calendar Dashboard.png"],
  [/^\/organizer\/sales\/leads/, "Gala Dock Festival Sales Dashboard.png"],
  [/^\/organizer\/sales\/proposals/, "Gala Dock Festival Proposal Dashboard.png"],
  [/^\/organizer\/sales/, "Gala Dock Sales Dashboard.png"],
  [/^\/organizer\/proposals\/new/, "SaaS Proposal Builder_ Offer & Pricing.png"],
  [/^\/organizer\/marketplace/, "Gala·Dock Venue Marketplace Dashboard.png"],
  [/^\/organizer\/team\/[^/]+/, "Gala·Dock Team Profile Dashboard.png"],
  [/^\/organizer\/team/, "Gala Dock Team Dashboard.png"],
  [/^\/organizer\/money\/invoices\/new/, "Gala·Dock Invoice Creation Dashboard.png"],
  [/^\/organizer\/money\/invoices/, "Gala Dock Invoice Dashboard.png"],
  [/^\/organizer\/money/, "Gala Dock Event Finance Dashboard.png"],
  [/^\/organizer\/agent/, "Gala Agent Event Operations Dashboard.png"],
  [/^\/organizer\/settings/, "Gala Dock Workspace Settings Dashboard.png"],
  [/^\/discover/, "Gala Dock Event Discovery Dashboard.png"],
  [/^\/plan/, "GalaDock Event Planning Wizard.png"],
  [/^\/account\/events\/[^/]+\/build/, "GalaDock Wedding Event Planner Dashboard.png"],
  [/^\/account\/events\/[^/]+\/messages/, "Gala·Dock Wedding Messaging Dashboard.png"],
  [/^\/account\/events\/[^/]+\/money/, "Gala·Dock Wedding Money Dashboard.png"],
  [/^\/account\/events\/[^/]+\/guests/, "Gala·Dock Guest Management Dashboard.png"],
  [/^\/account\/events\/[^/]+$/, "Gala·Dock Wedding Event Dashboard.png"],
  [/^\/account\/events$/, "Modern My Events Dashboard.png"],
  [/^\/account\/tickets/, "Gala·Dock Ticket Dashboard.png"],
  [/^\/account\/saved/, "Gala·Dock Saved Events Dashboard.png"],
  [/^\/account\/reviews/, "Gala·Dock Reviews Dashboard.png"],
  [/^\/account$/, "Gala·Dock Account Dashboard.png"],
];
const KEY = "gd-overlay";

/** Dev-only pixel overlay: reference image over the live page, opacity / difference blend, width-matched. Toggle: Alt+O. */
export function DesignOverlay() {
  const pathname = usePathname(); const params = useSearchParams();
  const [files, setFiles] = useState<string[]>([]); const [open, setOpen] = useState(false); const [show, setShow] = useState(false);
  const [file, setFile] = useState(""); const [opacity, setOpacity] = useState(.5); const [diff, setDiff] = useState(false); const [dy, setDy] = useState(0); const [mounted, setMounted] = useState(false);
  const suggested = useMemo(() => { const m = MAP.find(([re]) => re.test(pathname)); return m ? `customer & Organizer workspace/${m[1]}` : ""; }, [pathname]);
  useEffect(() => { queueMicrotask(() => { setMounted(true); try { const s = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (s.opacity) setOpacity(s.opacity); if (s.diff) setDiff(s.diff); } catch { /* ignore */ } }); }, []);
  useEffect(() => { if (!open || files.length) return; fetch("/api/dev/designs").then(r => r.json()).then(j => setFiles(j.files ?? [])).catch(() => setFiles([])); }, [open, files.length]);
  useEffect(() => { const next = params.get("ref") ? `customer & Organizer workspace/${params.get("ref")}` : suggested; queueMicrotask(() => setFile(next)); }, [suggested, params]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === "o") { e.preventDefault(); setShow(s => !s); setOpen(true); } }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ opacity, diff })); } catch { /* ignore */ } }, [opacity, diff]);
  useEffect(() => { // render at reference scale (zoom 1) while comparing; restore the saved density afterwards
    const el = document.documentElement; if (!show) return;
    const prev = el.getAttribute("data-density"); el.setAttribute("data-density", "reference");
    return () => { if (prev) el.setAttribute("data-density", prev); else el.removeAttribute("data-density"); };
  }, [show]);
  if (process.env.NODE_ENV !== "development" || !mounted) return null;
  return createPortal(<>
    {show && file && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/dev/designs?file=${encodeURIComponent(file)}`} alt="" aria-hidden style={{ position: "fixed", left: 0, top: dy, width: "100vw", height: "auto", opacity, mixBlendMode: diff ? "difference" : "normal", pointerEvents: "none", zIndex: 9998 }} />}
    <div style={{ position: "fixed", right: 12, bottom: 76, zIndex: 9999, fontFamily: "Inter, sans-serif", fontSize: 12 }}>
      {open ? <div style={{ width: 300, background: "#0f1538", color: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 10px 30px #0006", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b>Design overlay</b><button onClick={() => setOpen(false)} aria-label="Close overlay panel" style={{ color: "#fff" }}><X size={14} /></button></div>
        <select value={file} onChange={e => setFile(e.target.value)} style={{ background: "#1c2350", color: "#fff", border: "1px solid #39407a", borderRadius: 6, padding: 4 }}>{suggested && <option value={suggested}>Suggested: {suggested.split("/")[1]}</option>}{files.map(f => <option key={f} value={f}>{f.split("/")[1]}</option>)}</select>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>Opacity <input type="range" min={0} max={1} step={.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))} style={{ flex: 1 }} />{Math.round(opacity * 100)}%</label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>Offset Y <input type="range" min={-200} max={200} value={dy} onChange={e => setDy(Number(e.target.value))} style={{ flex: 1 }} />{dy}px</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={diff} onChange={e => setDiff(e.target.checked)} />Difference blend (mismatches glow)</label>
        <div style={{ display: "flex", gap: 6 }}><button onClick={() => setShow(s => !s)} style={{ flex: 1, background: "#1b64f5", color: "#fff", borderRadius: 6, padding: "6px 8px", display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>{show ? <EyeOff size={13} /> : <Eye size={13} />}{show ? "Hide" : "Show"} (Alt+O)</button></div>
        <small style={{ color: "#aab0d6" }}>Matches viewport width. References are 1536px wide — set the window to 1536px for 1:1.</small>
      </div> : <button onClick={() => setOpen(true)} aria-label="Open design overlay" style={{ width: 36, height: 36, borderRadius: "50%", background: "#0f1538", color: "#fff", display: "grid", placeItems: "center", boxShadow: "0 4px 14px #0005" }}><Layers size={16} /></button>}
    </div>
  </>, document.body);
}
