"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

import type { MenuEntry } from "./row-menu";

/** Menu with a custom trigger (e.g. "Add listing ▾"); same behaviour as RowMenu. */
export function MenuButton({ label, entries, trigger, className }: { label: string; entries: MenuEntry[]; trigger: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return <div className="pv-menu" ref={ref}>
    <button type="button" className={className} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} disabled={pending}>{trigger}</button>
    {open && <div className="pv-menu-panel" role="menu">{entries.map(e => e.kind === "link"
      ? <Link key={e.label} href={e.href} role="menuitem" onClick={() => setOpen(false)}>{e.label}</Link>
      : <button key={e.label} type="button" role="menuitem" className={e.danger ? "danger" : ""} onClick={() => {
        if (e.confirm && !window.confirm(e.confirm)) return;
        setOpen(false);
        start(async () => { const r = await e.run(); toast(r.ok ? (r.message ?? "Done") : r.error); if (r.ok) router.refresh(); });
      }}>{e.label}</button>)}</div>}
  </div>;
}
