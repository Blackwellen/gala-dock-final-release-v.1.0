"use client";
import { motion } from "framer-motion";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import { cx } from "./ui";

/* Shared interactive primitives for the public pages: ARIA tabs (arrow keys, Home/End, roving tabindex, layoutId indicator),
   pressed-button groups, and an accessible sheet (focus trap, Escape, scroll lock, focus restore). */

export type TabItem<K extends string> = { key: K; label: ReactNode; icon?: LucideIcon; sub?: ReactNode };

export function TabBar<K extends string>({ items, value, onChange, idBase, label, className = "", indicator = "pill" }: {
  items: TabItem<K>[]; value: K; onChange: (k: K) => void; idBase: string; label: string; className?: string; indicator?: "pill" | "line" | "none";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = items.length;
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next]!.key);
    refs.current[next]?.focus();
  };
  return <div role="tablist" aria-label={label} className={cx("gp-tabs", `is-${indicator}`, className)}>
    {items.map((t, i) => {
      const on = t.key === value;
      const Icon = t.icon;
      return <button key={t.key} type="button" role="tab" id={`${idBase}-tab-${t.key}`} aria-selected={on} aria-controls={`${idBase}-panel-${t.key}`}
        tabIndex={on ? 0 : -1} ref={el => { refs.current[i] = el; }} onClick={() => onChange(t.key)} onKeyDown={e => onKey(e, i)} className={cx("gp-tab", on && "is-on")}>
        {on && indicator !== "none" && <motion.span layoutId={`${idBase}-ind`} className="gp-tab-ind" aria-hidden="true" transition={{ type: "spring", stiffness: 420, damping: 38 }} />}
        <span className="gp-tab-label">{Icon && <Icon size={18} aria-hidden="true" />}<span>{t.label}{t.sub && <small>{t.sub}</small>}</span></span>
      </button>;
    })}
  </div>;
}

export const panelProps = (idBase: string, key: string, active: boolean) =>
  ({ role: "tabpanel", id: `${idBase}-panel-${key}`, "aria-labelledby": `${idBase}-tab-${key}`, hidden: !active, tabIndex: 0 }) as const;

/** Toggle-button group (aria-pressed). Used where the control filters or switches a view rather than owning a tab panel. */
export function Pressed<K extends string>({ items, value, onChange, label, idBase, className = "" }: {
  items: { key: K; label: ReactNode; icon?: LucideIcon }[]; value: K; onChange: (k: K) => void; label: string; idBase: string; className?: string;
}) {
  return <div role="group" aria-label={label} className={cx("gp-seg", className)}>
    {items.map(t => {
      const on = t.key === value, Icon = t.icon;
      return <button key={t.key} type="button" aria-pressed={on} onClick={() => onChange(t.key)} className={cx("gp-seg-btn", on && "is-on")}>
        {on && <motion.span layoutId={`${idBase}-thumb`} className="gp-seg-thumb" aria-hidden="true" transition={{ type: "spring", stiffness: 460, damping: 38 }} />}
        <span className="gp-seg-label">{Icon && <Icon size={16} aria-hidden="true" />}{t.label}</span>
      </button>;
    })}
  </div>;
}

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

/** Modal sheet (mobile menus and pickers). Portalled to <body> so sticky/backdrop-filtered ancestors can't trap it. */
export function Sheet({ open, onClose, label, children, side = "bottom", className = "" }: { open: boolean; onClose: () => void; label: string; children: ReactNode; side?: "bottom" | "right"; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const onClose = () => close.current();
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement, prev = root.style.overflow;
    root.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1]!.focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0]!.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); root.style.overflow = prev; opener?.focus?.(); };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className={cx("gp-sheet", `is-${side}`, className)}>
    <div className="gp-sheet-scrim" onClick={onClose} aria-hidden="true" />
    <motion.div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="gp-sheet-panel"
      initial={side === "bottom" ? { y: 40, opacity: 0 } : { x: 40, opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
      <button type="button" className="gp-sheet-close" onClick={onClose} aria-label="Close"><X size={20} aria-hidden="true" /></button>
      {children}
    </motion.div>
  </div>, document.body);
}
