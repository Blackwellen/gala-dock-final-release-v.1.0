"use client";
import { useState } from "react";
import { Dialog, useAction } from "@/components/kit/client";

/** Shared client helpers for the S2 event sections (access, registration, inventory, online). */
export const toIso = (local: string) => (local ? new Date(local).toISOString() : null);
export const toLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const intOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v))) || null);

/** Button that runs an action, optionally after a confirm dialog with a reason. */
export function ActionButton({ label, run, className = "k-btn outline sm", confirm, reason, disabled, title, children }: {
  label: string; run: (reason: string) => Promise<{ ok: boolean; error?: string; message?: string }>; className?: string;
  confirm?: { title: string; text: string; cta: string; danger?: boolean }; reason?: { label: string; required?: boolean }; disabled?: boolean; title?: string; children?: React.ReactNode;
}) {
  const { run: exec, pending } = useAction();
  const [open, setOpen] = useState(false); const [why, setWhy] = useState("");
  const go = async () => { const r = await exec(() => run(why.trim())); if (r.ok) { setOpen(false); setWhy(""); } };
  return <>
    <button type="button" className={className} aria-label={label} title={title ?? label} disabled={disabled || pending} onClick={() => (confirm ? setOpen(true) : void go())}>{children ?? label}</button>
    {confirm && <Dialog open={open} onClose={() => setOpen(false)} title={confirm.title}
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className={`k-btn ${confirm.danger ? "danger" : "primary"}`} disabled={pending || (!!reason?.required && !why.trim())} onClick={() => void go()}>{confirm.cta}</button></>}>
      <p className="k-small" style={{ margin: 0 }}>{confirm.text}</p>
      {reason && <label className="k-field" style={{ marginTop: 12 }}><span>{reason.label}{reason.required && <b> *</b>}</span><textarea className="k-textarea" value={why} maxLength={300} onChange={e => setWhy(e.target.value)} /></label>}
    </Dialog>}
  </>;
}
