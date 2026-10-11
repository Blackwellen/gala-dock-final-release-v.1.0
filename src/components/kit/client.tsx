"use client";
// Interactive UI primitives (menus, dialogs, toasts, toggles, map, agent ask box).
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, Heart, Sparkles, ArrowRight, Send, Plus, Minus, CheckCircle2, AlertTriangle } from "lucide-react";
import { countdown } from "@/lib/format";
import { DensityInit } from "./density";
import { DesignOverlay } from "./design-overlay";

// ── Toasts ────────────────────────────────────────────────────────────────
type ToastFn = (message: string, tone?: "ok" | "error") => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useKitToast = () => useContext(ToastCtx);
export function KitProviders({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error"; id: number } | null>(null);
  const notify = useCallback<ToastFn>((message, tone = "ok") => { const id = Date.now(); setToast({ message, tone, id }); window.setTimeout(() => setToast(t => (t?.id === id ? null : t)), 5000); }, []);
  return <ToastCtx.Provider value={notify}><DensityInit />{process.env.NODE_ENV === "development" && <DesignOverlay />}{children}
    <AnimatePresence>{toast && <motion.div key={toast.id} role={toast.tone === "error" ? "alert" : "status"} className={`k-toast ${toast.tone === "error" ? "error" : ""}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
      {toast.tone === "error" ? <AlertTriangle size={17} aria-hidden /> : <CheckCircle2 size={17} aria-hidden />}<span className="k-grow">{toast.message}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><X size={15} /></button>
    </motion.div>}</AnimatePresence>
  </ToastCtx.Provider>;
}

// ── Server action / API caller with toast + refresh ───────────────────────
export function useAction() {
  const router = useRouter(); const toast = useKitToast(); const [pending, setPending] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: T; redirect?: string }>, opts: { success?: string; refresh?: boolean } = {}) => {
    setPending(true);
    try {
      const r = await fn();
      if (!r.ok) { toast(r.error ?? "Something went wrong. Please try again.", "error"); return r; }
      if (opts.success ?? r.message) toast((opts.success ?? r.message)!);
      if (r.redirect) router.push(r.redirect); else if (opts.refresh !== false) router.refresh();
      return r;
    } catch { toast("Network error — your change was not saved.", "error"); return { ok: false as const }; } finally { setPending(false); }
  }, [router, toast]);
  return { run, pending };
}

// ── Popover menu ──────────────────────────────────────────────────────────
export function Menu({ trigger, children, align = "right", width, label }: { trigger: (p: { open: boolean; toggle: () => void; id: string }) => ReactNode; children: ReactNode | ((close: () => void) => ReactNode); align?: "left" | "right"; width?: number; label: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const close = () => setOpen(false);
  return <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
    {trigger({ open, toggle: () => setOpen(o => !o), id })}
    <AnimatePresence>{open && <motion.div id={id} role="menu" aria-label={label} className="k-pop" style={{ top: "calc(100% + 6px)", [align]: 0, width }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .12 }}>
      {typeof children === "function" ? children(close) : children}
    </motion.div>}</AnimatePresence>
  </div>;
}

// ── Dialog / drawer ───────────────────────────────────────────────────────
export function Dialog({ open, onClose, title, sub, children, wide, footer }: { open: boolean; onClose: () => void; title: string; sub?: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) { // focus trap
        const f = [...ref.current.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter(el => !el.hasAttribute("disabled"));
        if (!f.length) return; const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => { window.clearTimeout(t); document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [open, onClose]);
  return <AnimatePresence>{open && <motion.div className="k-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`k-dialog ${wide ? "wide" : ""}`} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }}>
      <div className="k-dialog-head"><div><h2>{title}</h2>{sub && <p style={{ marginTop: 3, fontSize: 12.5 }}>{sub}</p>}</div><button className="k-icon-btn plain" data-close aria-label="Close" onClick={onClose}><X size={17} /></button></div>
      {children}
      {footer && <div className="k-row" style={{ justifyContent: "flex-end", marginTop: 16, gap: 8 }}>{footer}</div>}
    </motion.div>
  </motion.div>}</AnimatePresence>;
}
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open, onClose]);
  return <AnimatePresence>{open && <>
    <motion.div className="k-backdrop" style={{ zIndex: 84 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
    <motion.aside role="dialog" aria-modal="true" aria-label={title} className="k-drawer" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}>
      <div className="k-dialog-head"><h2 style={{ fontSize: 17 }}>{title}</h2><button className="k-icon-btn plain" aria-label="Close" onClick={onClose}><X size={17} /></button></div>{children}
    </motion.aside></>}</AnimatePresence>;
}

// ── Controls ──────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label, disabled, name }: { checked: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean; name?: string }) {
  return <><button type="button" role="switch" aria-checked={checked} aria-label={label} className="k-toggle" disabled={disabled} onClick={() => onChange?.(!checked)} />{name && <input type="hidden" name={name} value={checked ? "on" : ""} />}</>;
}
export function NumberStepper({ value, onChange, min = 0, max = 100000, step = 1, label, name }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; name?: string }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return <div className="k-stepper-num"><button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))}><Minus size={14} /></button><input aria-label={label} name={name} inputMode="numeric" value={value} onChange={e => onChange(clamp(Number(e.target.value.replace(/\D/g, "")) || 0))} /><button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))}><Plus size={14} /></button></div>;
}
export function SaveHeart({ itemKey, saved: initial, className = "heart", size = 15, label = "Save" }: { itemKey: string; saved: boolean; className?: string; size?: number; label?: string }) {
  const [saved, setSaved] = useState(initial); const toast = useKitToast(); const router = useRouter();
  async function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const next = !saved; setSaved(next);
    const r = await fetch("/api/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: itemKey, saved: next }) }).catch(() => null);
    if (!r?.ok) { setSaved(!next); const j = await r?.json().catch(() => null); toast(j?.error ?? "Could not update saved items.", "error"); return; }
    toast(next ? "Saved to your collection" : "Removed from saved"); router.refresh();
  }
  return <button type="button" className={className} aria-pressed={saved} aria-label={saved ? `Remove ${label} from saved` : `Save ${label}`} onClick={toggle}><Heart size={size} fill={saved ? "currentColor" : "none"} /></button>;
}
/** Live countdown to a server-authoritative timestamp. */
export function Countdown({ to, compact }: { to: string; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const c = countdown(to, now ?? new Date(to).getTime() - 1);
  if (compact) return <span className="k-tnum" suppressHydrationWarning>{now == null ? "—" : c.done ? "Expired" : c.days ? `${c.days}d ${c.hours}h` : `${c.hours}h ${c.mins}m`}</span>;
  return <div className="k-row" style={{ gap: 14 }} aria-label="Time remaining" suppressHydrationWarning>{([["Days", c.days], ["Hours", c.hours], ["Mins", c.mins], ["Secs", c.secs]] as const).map(([l, v]) => <div key={l} style={{ textAlign: "center", minWidth: 34 }}><b style={{ display: "block", fontSize: 19, fontWeight: 750, color: "#fff" }} className="k-tnum">{now == null ? "–" : v}</b><small style={{ fontSize: 9.5, color: "#ffffffb0" }}>{l}</small></div>)}</div>;
}
/** Client tab state for in-page sections (non-URL). */
export function useTabs<T extends string>(initial: T) { const [tab, setTab] = useState<T>(initial); return { tab, setTab, props: (k: T) => ({ role: "tab" as const, "aria-selected": tab === k, onClick: () => setTab(k) }) }; }

// ── Gala Agent ask box (server-side model call via /api/agent/ask) ────────
export function AgentAsk({ scope, eventId, placeholder = "Ask anything...", suggestions = [], compact }: { scope: "customer" | "organizer"; eventId?: string; placeholder?: string; suggestions?: string[]; compact?: boolean }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [reply, setReply] = useState<string | null>(null); const toast = useKitToast();
  async function ask(text: string) {
    if (!text.trim() || busy) return; setBusy(true); setReply(null);
    try {
      const r = await fetch("/api/agent/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, eventId, question: text.slice(0, 1500) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast(j.error ?? "Gala Agent is unavailable right now.", "error"); else setReply(j.answer);
    } catch { toast("Gala Agent is unavailable right now.", "error"); } finally { setBusy(false); }
  }
  return <div>
    {suggestions.length > 0 && <div className="k-agent-actions">{suggestions.map(s => <button key={s} type="button" className="k-agent-action" onClick={() => { setQ(s); void ask(s); }}><Sparkles size={13} aria-hidden /><span className="k-grow">{s}</span><ArrowRight size={13} aria-hidden className="k-muted" /></button>)}</div>}
    <form className="k-agent-ask" style={compact ? { marginTop: 8 } : undefined} onSubmit={e => { e.preventDefault(); void ask(q); }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label="Ask Gala Agent" maxLength={1500} />
      <button type="submit" aria-label="Send to Gala Agent" disabled={busy}>{busy ? <span className="k-skel" style={{ width: 12, height: 12, borderRadius: "50%" }} /> : <Send size={13} />}</button>
    </form>
    <div aria-live="polite">{reply && <div className="k-agent-reply">{reply}</div>}</div>
  </div>;
}

// ── Map (MapTiler raster tiles, Web Mercator) ─────────────────────────────
export type MapPin = { id: string; lat: number; lng: number; label?: string; price?: string; href?: string };
const TILE = 256;
const project = (lat: number, lng: number, z: number) => { const s = Math.sin((lat * Math.PI) / 180), sc = TILE * 2 ** z; return { x: ((lng + 180) / 360) * sc, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * sc }; };
const unproject = (x: number, y: number, z: number) => { const sc = TILE * 2 ** z, lng = (x / sc) * 360 - 180, n = Math.PI - (2 * Math.PI * y) / sc; return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng }; };
export function MapView({ pins, center, zoom: z0 = 11, height = 220, mapKey, selected, onSelect, style = "streets-v2-light", showPrices, ariaLabel = "Map of results" }: { pins: MapPin[]; center?: { lat: number; lng: number }; zoom?: number; height?: number | string; mapKey?: string; selected?: string | null; onSelect?: (id: string) => void; style?: string; showPrices?: boolean; ariaLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null); const [size, setSize] = useState({ w: 400, h: 220 }); const [zoom, setZoom] = useState(z0);
  const initialCenter = useMemo(() => center ?? (pins.length ? { lat: pins.reduce((s, p) => s + p.lat, 0) / pins.length, lng: pins.reduce((s, p) => s + p.lng, 0) / pins.length } : { lat: 51.5072, lng: -0.1276 }), [center, pins]);
  const [c, setC] = useState(initialCenter); const drag = useRef<{ x: number; y: number; c: { lat: number; lng: number } } | null>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height })); ro.observe(el); return () => ro.disconnect(); }, []);
  const cp = project(c.lat, c.lng, zoom), ox = Math.round(cp.x - size.w / 2), oy = Math.round(cp.y - size.h / 2); // whole pixels: identical SSR + client style values
  const tiles: { x: number; y: number; key: string }[] = [];
  const max = 2 ** zoom;
  for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + size.w) / TILE); tx++) for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + size.h) / TILE); ty++) if (ty >= 0 && ty < max) tiles.push({ x: tx, y: ty, key: `${zoom}/${tx}/${ty}` });
  return <div ref={ref} className="k-map" style={{ height }} role="application" aria-label={ariaLabel}
    onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, c }; }}
    onPointerMove={e => { const d = drag.current; if (!d) return; const p = project(d.c.lat, d.c.lng, zoom); setC(unproject(p.x - (e.clientX - d.x), p.y - (e.clientY - d.y), zoom)); }}
    onPointerUp={() => { drag.current = null; }} onWheel={e => { setZoom(zz => Math.max(3, Math.min(17, zz + (e.deltaY < 0 ? 1 : -1)))); }}
    onKeyDown={e => { const step = 60, p = project(c.lat, c.lng, zoom); const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }; if (m[e.key]) { e.preventDefault(); setC(unproject(p.x + m[e.key]![0], p.y + m[e.key]![1], zoom)); } if (e.key === "+") setZoom(zz => Math.min(17, zz + 1)); if (e.key === "-") setZoom(zz => Math.max(3, zz - 1)); }} tabIndex={0}>
    <div className="tiles" aria-hidden>{mapKey && tiles.map(t => { const wx = ((t.x % max) + max) % max;
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={t.key} alt="" draggable={false} src={`https://api.maptiler.com/maps/${style}/256/${zoom}/${wx}/${t.y}.png?key=${mapKey}`} style={{ left: t.x * TILE - ox, top: t.y * TILE - oy }} />; })}</div>
    {!mapKey && <div className="k-empty" style={{ position: "absolute", inset: 0 }}><small>Map tiles unavailable — MAP_TILER_API_KEY is not configured.</small></div>}
    {pins.map(p => { const pp = project(p.lat, p.lng, zoom); const left = Math.round(pp.x - ox), top = Math.round(pp.y - oy); if (left < -40 || top < -40 || left > size.w + 40 || top > size.h + 40) return null;
      return <button key={p.id} type="button" className="pin" style={{ left, top }} aria-pressed={selected === p.id} aria-label={p.label ?? "Location"} onPointerDown={e => e.stopPropagation()} onClick={() => onSelect?.(p.id)}>{showPrices && p.price ? <span className="price">{p.price}</span> : <span className="dot"><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} /></span>}</button>; })}
    <div className="zoom"><button type="button" aria-label="Zoom in" onPointerDown={e => e.stopPropagation()} onClick={() => setZoom(zz => Math.min(17, zz + 1))}><Plus size={14} /></button><button type="button" aria-label="Zoom out" onPointerDown={e => e.stopPropagation()} onClick={() => setZoom(zz => Math.max(3, zz - 1))}><Minus size={14} /></button></div>
    <span className="attr">© MapTiler © OpenStreetMap contributors</span>
  </div>;
}
