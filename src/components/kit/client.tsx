"use client";
// Interactive UI primitives (menus, dialogs, toasts, toggles, map, agent ask box).
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const pop = useRef<HTMLDivElement>(null); const id = useId();
  const [box, setBox] = useState<{ host: HTMLElement; style: React.CSSProperties } | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  // The list renders at the shell root (fixed), so cards, tables and banners with overflow:hidden can never clip it. It sits
  // under its trigger, flips above when there's more room there, caps its height to the space left (content scrolls inside)
  // and stays inside the window horizontally. Coordinates are divided by the shell's CSS zoom (--k-zoom).
  const place = useCallback(() => {
    const t = ref.current; if (!t) return;
    const host = (t.closest(".k-root, .ws-app, .pt-app") as HTMLElement | null) ?? document.body;
    const z = parseFloat(getComputedStyle(host).zoom || "1") || 1, r = t.getBoundingClientRect(), vw = document.documentElement.clientWidth || innerWidth, vh = document.documentElement.clientHeight || innerHeight, gap = 8;
    const h = pop.current ? pop.current.scrollHeight * z : 0, w = pop.current ? pop.current.offsetWidth * z : (width ?? 220) * z;
    const below = vh - r.bottom - gap - 6, above = r.top - gap - 6, up = h > below && above > below;
    const avail = Math.max(120, up ? above : below);
    let left = align === "right" ? r.right - w : r.left; left = Math.min(Math.max(gap, left), vw - gap - w);
    const style: React.CSSProperties = { position: "fixed", left: left / z, width, maxHeight: Math.min(avail, 440 * z) / z, overflowY: "auto", zIndex: 1100,
      ...(up ? { top: "auto", bottom: (vh - r.top + 6) / z } : { top: (r.bottom + 6) / z }) };
    setBox({ host, style });
  }, [align, width]);
  useEffect(() => {
    if (!open) return;
    place(); const raf = requestAnimationFrame(place); // second pass once the list has its real size
    const onMove = (e: Event) => { if (e.target instanceof Node && pop.current?.contains(e.target)) return; place(); };
    addEventListener("resize", onMove); addEventListener("scroll", onMove, true);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onMove); removeEventListener("scroll", onMove, true); };
  }, [open, place]);
  const close = () => setOpen(false);
  return <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
    {trigger({ open, toggle: () => setOpen(o => !o), id })}
    {open && box && createPortal(<AnimatePresence>{open && <motion.div ref={pop} id={id} role="menu" aria-label={label} className="k-pop" data-portal="" style={box.style} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .12 }}>
      {typeof children === "function" ? children(close) : children}
    </motion.div>}</AnimatePresence>, box.host)}
  </div>;
}

// ── Dialog / drawer ───────────────────────────────────────────────────────
export function Dialog({ open, onClose, title, sub, children, wide, footer }: { open: boolean; onClose: () => void; title: string; sub?: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the open/close effect: callers usually pass an inline arrow, and
  // re-running on every render would steal focus back to the first field (and the opener) on each keystroke.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => { const el = ref.current; if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])")?.focus(); }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && ref.current) { // focus trap
        const f = [...ref.current.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter(el => !el.hasAttribute("disabled"));
        if (!f.length) return; const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => { window.clearTimeout(t); document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [open]);
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
  useEffect(() => { queueMicrotask(() => setNow(Date.now())); const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const c = countdown(to, now ?? new Date(to).getTime() - 1);
  if (compact) return <span className="k-tnum" suppressHydrationWarning>{now == null ? "—" : c.done ? "Expired" : c.days ? `${c.days}d ${c.hours}h` : `${c.hours}h ${c.mins}m`}</span>;
  return <div className="k-row" style={{ gap: 14 }} aria-label="Time remaining" suppressHydrationWarning>{([["Days", c.days], ["Hours", c.hours], ["Mins", c.mins], ["Secs", c.secs]] as const).map(([l, v]) => <div key={l} style={{ textAlign: "center", minWidth: 34 }}><b style={{ display: "block", fontSize: 19, fontWeight: 750, color: "#fff" }} className="k-tnum">{now == null ? "–" : v}</b><small style={{ fontSize: 9.5, color: "#ffffffb0" }}>{l}</small></div>)}</div>;
}
/** Client tab state for in-page sections (non-URL). */
export function useTabs<T extends string>(initial: T) { const [tab, setTab] = useState<T>(initial); return { tab, setTab, props: (k: T) => ({ role: "tab" as const, "aria-selected": tab === k, onClick: () => setTab(k) }) }; }

// ── Gala Agent ask box (server-side model call via /api/agent/ask) ────────
/** Renders Gala Agent replies: headings, bullet/numbered lists, **bold** and `code` — never raw HTML. */
function AgentReply({ text }: { text: string }) {
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part);
  const out: ReactNode[] = []; let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => { if (list) { const L = list.ordered ? "ol" : "ul"; out.push(<L key={out.length}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</L>); list = null; } };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd(), b = /^\s*[-*•]\s+(.*)/.exec(line), n = /^\s*\d+[.)]\s+(.*)/.exec(line), h = /^#{1,6}\s+(.*)/.exec(line);
    if (b || n) { const ordered = !!n; if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; } list.items.push((b ?? n)![1]!); continue; }
    flush();
    if (h) out.push(<b key={out.length} className="k-agent-h">{inline(h[1]!)}</b>); else if (line.trim()) out.push(<p key={out.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="k-agent-reply">{out}</div>;
}
export function AgentAsk({ scope, eventId, placeholder = "Ask anything...", suggestions = [], compact, context }: { scope: "organizer"; eventId?: string; placeholder?: string; suggestions?: string[]; compact?: boolean;
  /** What the person is looking at (a listing, lead or proposal), sent with every question so answers are about it. */ context?: string }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [reply, setReply] = useState<string | null>(null); const toast = useKitToast();
  async function ask(text: string) {
    if (!text.trim() || busy) return; setBusy(true); setReply(null);
    try {
      const r = await fetch("/api/agent/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, eventId, question: text.slice(0, 1500), focus: context?.slice(0, 2000) }) });
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
    <div aria-live="polite">{reply && <AgentReply text={reply} />}</div>
  </div>;
}

// ── Map: implementation in ./map-view (interactive, clustered, zoom-aware, proxied tiles) ──
export { MapView, type MapPin } from "./map-view";
