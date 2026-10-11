"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Check, MoreHorizontal, Search } from "lucide-react";
import { useToast } from "@/components/ui";
import type { ActionResult } from "@/components/workspace/actions";

/* Client helpers for Admin B screens (Commerce, Trust, Support, Partners, Agent, Analytics, Settings). */

export type MenuEntry = { kind: "link"; label: string; href: string } | { kind: "action"; label: string; run: () => Promise<ActionResult>; danger?: boolean };

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", esc); };
  }, [open, close]);
  return ref;
}

/** "…" menu or a custom trigger. Actions that need a reason are rendered as ActionButtons elsewhere; menu actions here are non-consequential. */
export function Menu({ label, entries, trigger, className = "adb-dots", align = "right" }: { label: string; entries: MenuEntry[]; trigger?: ReactNode; className?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter(), toast = useToast();
  const ref = useOutside(open, () => setOpen(false));
  return <div className="adb-menu" ref={ref}>
    <button type="button" className={className} aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={pending} onClick={() => setOpen(o => !o)}>{trigger ?? <MoreHorizontal aria-hidden="true" />}</button>
    {open && <div className={`adb-menu-panel ${align}`} role="menu">{entries.map(e => e.kind === "link"
      ? <Link key={e.label} href={e.href} role="menuitem" onClick={() => setOpen(false)}>{e.label}</Link>
      : <button key={e.label} type="button" role="menuitem" className={e.danger ? "danger" : ""} onClick={() => {
        setOpen(false);
        start(async () => { const r = await e.run(); toast(r.ok ? (r.message ?? "Done") : r.error); if (r.ok) router.refresh(); });
      }}>{e.label}</button>)}</div>}
  </div>;
}

/** Select bound to a URL search param (deep-linkable filters). */
export function ParamSelect({ param, options, value, label, className = "adb-select", reset = ["page"] }: { param: string; options: { value: string; label: string }[]; value: string; label: string; className?: string; reset?: string[] }) {
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  return <select aria-label={label} className={className} value={value} onChange={e => {
    const next = new URLSearchParams(sp.toString());
    if (e.target.value === options[0]?.value) next.delete(param); else next.set(param, e.target.value);
    for (const p of reset) next.delete(p);
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

/** Search box bound to `q`; submits on Enter and keeps the other filters. */
export function SearchParam({ placeholder, param = "q", className = "adb-search" }: { placeholder: string; param?: string; className?: string }) {
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  return <form role="search" className={className} onSubmit={e => {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get(param) ?? "").trim();
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(param, v); else next.delete(param);
    next.delete("page");
    router.push(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  }}>
    <Search aria-hidden="true" /><label className="sr-only" htmlFor={`adb-${param}`}>{placeholder}</label>
    <input id={`adb-${param}`} name={param} type="search" placeholder={placeholder} defaultValue={sp.get(param) ?? ""} />
  </form>;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="adb-copy" aria-label={`${label} ${value}`} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard blocked: no-op */ }
  }}>{done ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button>;
}

/** Small toggle-able checkbox used for row selection (selection is visual only; bulk actions are in the toolbar). */
export function RowCheck({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  return <input type="checkbox" className="adb-check" aria-label={label} defaultChecked={defaultChecked} />;
}
