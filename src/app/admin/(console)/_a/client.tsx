"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Search, X } from "lucide-react";
import { useToast } from "@/components/ui";
import type { ActionResult } from "@/components/workspace/actions";

type Act = (...args: never[]) => Promise<ActionResult>;
export type AdminMenuEntry =
  | { kind: "link"; label: string; href: string; external?: boolean }
  | { kind: "action"; label: string; action: Act; args?: unknown[]; danger?: boolean; reason?: boolean; reasonOptions?: string[]; confirm?: { title: string; body: string; cta?: string } };

/** Reason dialog shared by menus and toggles. Admin state changes always carry a typed reason (recorded in the audit log). */
function ReasonDialog({ title, body, cta, danger, options, pending, error, onCancel, onSubmit }: {
  title: string; body?: string; cta?: string; danger?: boolean; options?: string[]; pending: boolean; error: string; onCancel: () => void; onSubmit: (reason: string) => void;
}) {
  const id = useId();
  return <div className="ws-dialog-backdrop" onClick={() => !pending && onCancel()}>
    <form className="ws-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} onClick={e => e.stopPropagation()}
      onSubmit={e => { e.preventDefault(); onSubmit(String(new FormData(e.currentTarget).get("reason") ?? "").trim()); }}>
      <div className="ws-dialog-head"><h2 id={`${id}-t`}>{title}</h2><button type="button" aria-label="Close" onClick={onCancel}><X aria-hidden="true" /></button></div>
      {body && <p>{body}</p>}
      <label className="ws-field"><span>Reason (recorded in audit log) *</span>
        {options ? <select name="reason" required defaultValue=""><option value="" disabled>Select a reason…</option>{options.map(o => <option key={o}>{o}</option>)}</select>
          : <textarea name="reason" required minLength={5} rows={3} placeholder="Explain why this action is necessary" autoFocus />}</label>
      {error && <p className="ws-form-error" role="alert">{error}</p>}
      <div className="ws-dialog-actions">
        <button type="button" className="ws-btn outline" onClick={onCancel} disabled={pending}>Cancel</button>
        <button type="submit" className={`ws-btn ${danger ? "danger" : "primary"}`} disabled={pending}>{pending ? "Working…" : cta ?? "Confirm"}</button>
      </div>
    </form>
  </div>;
}

function useRun() {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (action: Act, args: unknown[], done: () => void) => {
    setError("");
    start(async () => {
      const r = await (action as (...a: unknown[]) => Promise<ActionResult>)(...args);
      if (!r.ok) { setError(r.error); return; }
      done();
      if (r.message) toast(r.message);
      if (r.redirect) router.push(r.redirect); else router.refresh();
    });
  };
  return { pending, error, setError, run };
}

/** "…" / "More actions ▾" menu with links and audited actions. */
export function AdminMenu({ label, entries, trigger, className = "aa-dots" }: { label: string; entries: AdminMenuEntry[]; trigger?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Extract<AdminMenuEntry, { kind: "action" }> | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { pending, error, setError, run } = useRun();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return <div className="aa-menu" ref={ref}>
    <button type="button" className={className} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} disabled={pending}>
      {trigger ?? <MoreHorizontal aria-hidden="true" />}</button>
    {open && <div className="aa-menu-panel" role="menu">{entries.map(e => e.kind === "link"
      ? (e.external ? <a key={e.label} href={e.href} role="menuitem" onClick={() => setOpen(false)}>{e.label}</a>
        : <Link key={e.label} href={e.href} role="menuitem" onClick={() => setOpen(false)}>{e.label}</Link>)
      : <button key={e.label} type="button" role="menuitem" className={e.danger ? "danger" : ""} onClick={() => {
        setOpen(false); setError("");
        if (e.reason || e.confirm) setActive(e); else run(e.action, e.args ?? [], () => {});
      }}>{e.label}</button>)}</div>}
    {active && <ReasonDialog title={active.confirm?.title ?? active.label} body={active.confirm?.body} cta={active.confirm?.cta ?? active.label} danger={active.danger}
      options={active.reasonOptions} pending={pending} error={error} onCancel={() => setActive(null)}
      onSubmit={reason => run(active.action, [...(active.args ?? []), reason], () => setActive(null))} />}
  </div>;
}

/** Switch that runs an audited action with a reason (e.g. featured event). */
export function ReasonToggle({ on, label, action, args, disabled }: { on: boolean; label: string; action: Act; args: unknown[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, error, setError, run } = useRun();
  return <>
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`aa-switch ${on ? "on" : ""}`} disabled={disabled || pending}
      onClick={() => { setError(""); setOpen(true); }}><i /></button>
    {open && <ReasonDialog title={on ? `Turn off: ${label}` : `Turn on: ${label}`} cta={on ? "Turn off" : "Turn on"} pending={pending} error={error}
      onCancel={() => setOpen(false)} onSubmit={reason => run(action, [...args, !on, reason], () => setOpen(false))} />}
  </>;
}

/** Select bound to one URL search param. */
export function ParamSelect({ param, options, value, label, className = "aa-select", reset = ["page"] }: {
  param: string; options: { value: string; label: string }[]; value: string; label: string; className?: string; reset?: string[];
}) {
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  return <select aria-label={label} className={className} value={value} onChange={e => {
    const next = new URLSearchParams(sp.toString());
    if (e.target.value === options[0]?.value) next.delete(param); else next.set(param, e.target.value);
    for (const p of reset) next.delete(p);
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

/** Search box bound to `q`; submits on Enter and keeps other filters. */
export function SearchBox({ placeholder, param = "q", className = "aa-search" }: { placeholder: string; param?: string; className?: string }) {
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  const id = useId();
  return <form role="search" className={className} onSubmit={e => {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get(param) ?? "").trim();
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(param, v); else next.delete(param);
    next.delete("page"); next.delete("sel");
    router.push(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  }}>
    <Search aria-hidden="true" /><label className="sr-only" htmlFor={id}>{placeholder}</label>
    <input id={id} name={param} type="search" placeholder={placeholder} defaultValue={sp.get(param) ?? ""} />
  </form>;
}

/** Header checkbox that toggles every row checkbox in the same form. */
export function SelectAll({ label = "Select all rows" }: { label?: string }) {
  return <input type="checkbox" aria-label={label} onChange={e => {
    const form = e.currentTarget.form; if (!form) return;
    for (const el of form.querySelectorAll<HTMLInputElement>("tbody input[type=checkbox]")) el.checked = e.currentTarget.checked;
  }} />;
}
