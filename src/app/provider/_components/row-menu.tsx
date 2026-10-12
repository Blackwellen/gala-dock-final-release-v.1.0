"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useToast } from "@/components/ui";
import type { ActionResult } from "@/components/workspace/actions";
import { confirmDialog } from "@/lib/ui/dialogs";

export type MenuEntry =
  | { kind: "link"; label: string; href: string }
  | { kind: "action"; label: string; run: () => Promise<ActionResult>; danger?: boolean; confirm?: string };

/** Compact "…" row menu. Destructive entries ask for confirmation before running their server action. */
export function RowMenu({ label, entries }: { label: string; entries: MenuEntry[] }) {
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
    <button type="button" className="pv-menu-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} disabled={pending}><MoreHorizontal aria-hidden="true" /></button>
    {open && <div className="pv-menu-panel" role="menu">{entries.map(e => e.kind === "link"
      ? <Link key={e.label} href={e.href} role="menuitem" onClick={() => setOpen(false)}>{e.label}</Link>
      : <button key={e.label} type="button" role="menuitem" className={e.danger ? "danger" : ""} onClick={async () => {
        setOpen(false);
        if (e.confirm && !(await confirmDialog({ title: e.confirm, confirmLabel: e.label, danger: !!e.danger }))) return;
        start(async () => { const r = await e.run(); toast(r.ok ? (r.message ?? "Done") : r.error); if (r.ok) router.refresh(); });
      }}>{e.label}</button>)}</div>}
  </div>;
}
