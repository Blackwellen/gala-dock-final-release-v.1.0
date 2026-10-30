"use client";
import { useState } from "react";
import { Plus, Pencil, Check, X, Link2, Send, Ban, RotateCcw, Upload, Ticket, CalendarPlus, ShieldCheck, Loader2, Trash2, FileSignature, Copy, Play, Square, ArrowRightLeft, UserPlus, KeyRound, type LucideIcon } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { confirmDialog, alertDialog, copyText } from "@/lib/ui/dialogs";

/**
 * Generic, declarative forms for the event operations sections (partners, logistics, compliance, accessibility, weather)
 * and the team panels. Server components describe the fields and pass a (bound) Server Action; every control is named,
 * errors from the database commands come back as friendly text and stay visible inside the dialog.
 */
type Result = { ok: boolean; error?: string; message?: string; data?: unknown; redirect?: string };
export type FieldOption = [value: string, label: string];
export type Field = {
  name: string; label: string;
  type?: "text" | "email" | "url" | "number" | "date" | "datetime" | "textarea" | "select" | "checkbox" | "tri" | "rows";
  options?: FieldOption[]; required?: boolean; defaultValue?: string | number | boolean | null | Record<string, unknown>[];
  placeholder?: string; hint?: string; min?: number; max?: number; step?: number; maxLength?: number; full?: boolean;
  /** For type "rows": the columns of each repeated row (no nested rows). */
  columns?: Field[]; maxRows?: number;
};
const ICONS: Record<string, LucideIcon> = { plus: Plus, edit: Pencil, check: Check, x: X, link: Link2, send: Send, ban: Ban, undo: RotateCcw, upload: Upload, ticket: Ticket,
  calendar: CalendarPlus, shield: ShieldCheck, trash: Trash2, sign: FileSignature, copy: Copy, play: Play, stop: Square, swap: ArrowRightLeft, user: UserPlus, key: KeyRound };
export type IconName = keyof typeof ICONS;

const localDT = (v: unknown) => { if (typeof v !== "string" || !v) return ""; const d = new Date(v); if (Number.isNaN(d.getTime())) return ""; return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
const initial = (f: Field): unknown => {
  if (f.type === "rows") return Array.isArray(f.defaultValue) ? f.defaultValue.map(r => Object.fromEntries((f.columns ?? []).map(c => [c.name, r[c.name] ?? initial(c)]))) : [];
  if (f.type === "checkbox") return f.defaultValue === true;
  if (f.type === "tri") return f.defaultValue === true ? "yes" : f.defaultValue === false ? "no" : "";
  if (f.type === "datetime") return localDT(f.defaultValue);
  if (f.type === "date") return typeof f.defaultValue === "string" ? f.defaultValue.slice(0, 10) : "";
  if (f.type === "select") return f.defaultValue != null ? String(f.defaultValue) : f.required ? f.options?.[0]?.[0] ?? "" : "";
  return f.defaultValue == null ? "" : String(f.defaultValue);
};
const out = (f: Field, v: unknown): unknown => {
  if (f.type === "rows") return (v as Record<string, unknown>[]).map(r => Object.fromEntries((f.columns ?? []).map(c => [c.name, out(c, r[c.name])])));
  if (f.type === "checkbox") return v === true;
  if (f.type === "tri") return v === "yes" ? true : v === "no" ? false : null;
  if (f.type === "datetime") return v ? new Date(String(v)).toISOString() : "";
  return typeof v === "string" ? v.trim() : v;
};

function Input({ f, value, set, id }: { f: Field; value: unknown; set: (v: unknown) => void; id: string }) {
  const common = { id, name: f.name, required: f.required, "aria-label": f.label };
  if (f.type === "textarea") return <textarea {...common} className="k-textarea" rows={3} maxLength={f.maxLength ?? 2000} placeholder={f.placeholder} value={String(value)} onChange={e => set(e.target.value)} />;
  if (f.type === "select") return <select {...common} className="k-input" value={String(value)} onChange={e => set(e.target.value)}>{!f.required && <option value="">—</option>}{(f.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  if (f.type === "tri") return <select {...common} className="k-input" value={String(value)} onChange={e => set(e.target.value)}><option value="">Not answered (derived)</option><option value="yes">Yes</option><option value="no">No</option></select>;
  if (f.type === "checkbox") return <span className="eo-check"><input {...common} type="checkbox" checked={value === true} onChange={e => set(e.target.checked)} /><span>{f.hint ?? "Yes"}</span></span>;
  const type = f.type === "datetime" ? "datetime-local" : f.type === "number" ? "number" : f.type ?? "text";
  return <input {...common} className="k-input" type={type} min={f.min} max={f.max} step={f.step ?? (f.type === "number" ? "any" : undefined)} maxLength={f.type === "number" ? undefined : f.maxLength ?? 300} placeholder={f.placeholder} value={String(value)} onChange={e => set(e.target.value)} inputMode={f.type === "number" ? "decimal" : undefined} />;
}

function Rows({ f, value, set, uid }: { f: Field; value: Record<string, unknown>[]; set: (v: Record<string, unknown>[]) => void; uid: string }) {
  const cols = f.columns ?? [];
  const blank = () => Object.fromEntries(cols.map(c => [c.name, initial(c)]));
  return <fieldset className="eo-rows"><legend>{f.label}{f.required && <b aria-hidden> *</b>}</legend>
    {value.map((r, i) => <div key={i} className="eo-row" role="group" aria-label={`${f.label} ${i + 1}`}>
      {cols.map(c => <label key={c.name} className={`k-field ${c.type === "checkbox" ? "eo-row-check" : ""}`}><span>{c.label}</span><Input f={c} id={`${uid}-${f.name}-${i}-${c.name}`} value={r[c.name]} set={v => set(value.map((x, j) => j === i ? { ...x, [c.name]: v } : x))} /></label>)}
      <button type="button" className="k-icon-btn plain" aria-label={`Remove ${f.label.toLowerCase()} ${i + 1}`} onClick={() => set(value.filter((_, j) => j !== i))}><Trash2 size={14} /></button></div>)}
    {value.length < (f.maxRows ?? 50) && <button type="button" className="k-btn ghost sm" onClick={() => set([...value, blank()])}><Plus size={13} />Add {f.label.toLowerCase().replace(/s$/, "")}</button>}
    {f.hint && <small className="k-hint">{f.hint}</small>}</fieldset>;
}

/** Shows what a command returned (clash lists, generated links) after it succeeded. */
async function showData(data: unknown) {
  const d = data as { lines?: string[]; copy?: string; title?: string } | undefined;
  if (d?.copy) { await copyText(d.copy, d.title ?? "Copy link"); return; }
  if (d?.lines?.length) await alertDialog({ title: d.title ?? "Done", message: d.lines.join(" • ") });
}

export function FormDialog({ label, icon, variant = "outline", size = "sm", title, sub, fields, action, submitLabel = "Save", disabledReason, wide, iconOnly, className = "" }: {
  label: string; icon?: IconName; variant?: "primary" | "outline" | "ghost" | "soft" | "danger"; size?: "sm" | "md"; title: string; sub?: string; fields: Field[];
  action: (values: Record<string, unknown>) => Promise<Result>; submitLabel?: string; disabledReason?: string | null; wide?: boolean; iconOnly?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false); const [err, setErr] = useState(""); const { run, pending } = useAction();
  const [v, setV] = useState<Record<string, unknown>>({}); const uid = `fd-${title.replace(/\W+/g, "-").toLowerCase()}`;
  const Icon = icon ? ICONS[icon] : null;
  const start = () => { setV(Object.fromEntries(fields.map(f => [f.name, initial(f)]))); setErr(""); setOpen(true); };
  const btnCls = `k-btn ${variant} ${size === "sm" ? "sm" : ""} ${className}`;
  if (disabledReason) return <button type="button" className={btnCls} aria-disabled="true" disabled title={disabledReason} aria-label={iconOnly ? `${label} — ${disabledReason}` : undefined}>{Icon && <Icon size={14} />}{!iconOnly && label}</button>;
  return <>
    <button type="button" className={btnCls} onClick={start} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined}>{Icon && <Icon size={14} />}{!iconOnly && label}</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={title} sub={sub} wide={wide}>
      <form className="eo-form" onSubmit={async e => { e.preventDefault(); setErr("");
        const values = Object.fromEntries(fields.map(f => [f.name, out(f, v[f.name])]));
        const r = await run(() => action(values));
        if (r.ok) { setOpen(false); await showData(r.data); } else setErr(r.error ?? "Couldn't save that change."); }}>
        <div className="eo-grid">{fields.map(f => f.type === "rows"
          ? <div key={f.name} className="eo-full"><Rows f={f} uid={uid} value={(v[f.name] as Record<string, unknown>[]) ?? []} set={x => setV(p => ({ ...p, [f.name]: x }))} /></div>
          : <label key={f.name} className={`k-field ${f.full || f.type === "textarea" ? "eo-full" : ""}`} htmlFor={`${uid}-${f.name}`}><span>{f.label}{f.required && <b aria-hidden> *</b>}</span>
            <Input f={f} id={`${uid}-${f.name}`} value={v[f.name] ?? ""} set={x => setV(p => ({ ...p, [f.name]: x }))} />{f.hint && f.type !== "checkbox" && <small>{f.hint}</small>}</label>)}</div>
        {err && <div className="k-notice red eo-err" role="alert">{err}</div>}
        <div className="k-row eo-foot"><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="k-spin" />}{submitLabel}</button></div>
      </form></Dialog></>;
}

/** One-click command (with an optional confirmation). */
export function ActionButton({ label, icon, action, confirm, variant = "outline", disabledReason, iconOnly, className = "" }: {
  label: string; icon?: IconName; action: () => Promise<Result>; confirm?: { title: string; message?: string; danger?: boolean; confirmLabel?: string };
  variant?: "primary" | "outline" | "ghost" | "soft" | "danger"; disabledReason?: string | null; iconOnly?: boolean; className?: string;
}) {
  const { run, pending } = useAction(); const Icon = icon ? ICONS[icon] : null;
  const cls = `k-btn ${variant} sm ${className}`;
  if (disabledReason) return <button type="button" className={cls} disabled aria-disabled="true" title={disabledReason} aria-label={iconOnly ? `${label} — ${disabledReason}` : undefined}>{Icon && <Icon size={14} />}{!iconOnly && label}</button>;
  return <button type="button" className={cls} disabled={pending} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} onClick={async () => {
    if (confirm && !(await confirmDialog({ title: confirm.title, message: confirm.message, danger: confirm.danger, confirmLabel: confirm.confirmLabel ?? label }))) return;
    const r = await run(action); if (r.ok) await showData(r.data);
  }}>{pending ? <Loader2 size={14} className="k-spin" /> : Icon && <Icon size={14} />}{!iconOnly && label}</button>;
}

/** Copies an absolute link built from a path on this site. */
export function CopyPathButton({ path, label = "Copy link" }: { path: string; label?: string }) {
  return <button type="button" className="k-btn ghost sm" onClick={() => void copyText(`${window.location.origin}${path}`, label)}><Copy size={13} />{label}</button>;
}
