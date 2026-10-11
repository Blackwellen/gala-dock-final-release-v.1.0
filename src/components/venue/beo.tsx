"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveEventOrder, approveEventOrder } from "@/lib/venue/actions";
import { BEO_SECTIONS, BEO_FINANCIAL } from "./beo-fields";

/** BEO editor (§62): every save is a new immutable version; sending asks the client to approve that exact version. */
export function BeoEditor({ jobId, initial, financial }: { jobId: string; initial: Record<string, string>; financial: Record<string, string> }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [send, setSend] = useState(false);
  const submit = (f: FormData) => start(async () => {
    const content = Object.fromEntries(BEO_SECTIONS.map(([k]) => [k, String(f.get(k) ?? "")]));
    const fin = Object.fromEntries(BEO_FINANCIAL.map(([k]) => [k, String(f.get(`fin_${k}`) ?? "")]));
    const r = await saveEventOrder(jobId, content, fin, String(f.get("note") ?? ""), send);
    setMsg(r.ok ? { ok: true, t: send ? "New version sent to the client for approval." : "Saved as a new draft version." } : { ok: false, t: r.error });
    if (r.ok) router.refresh();
  });
  return <form className="mk-form" aria-label="Event order" action={submit}>
    {BEO_SECTIONS.map(([k, label, hint]) => <label key={k} className="mk-field wide"><span>{label}</span><textarea name={k} rows={k === "times" || k === "catering" ? 4 : 2} maxLength={4000} defaultValue={initial[k] ?? ""} placeholder={hint} /></label>)}
    <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>Financial summary (£)</legend>
      <div className="mk-form" style={{ border: 0, padding: 0, background: "none" }}>{BEO_FINANCIAL.map(([k, l]) => <label key={k} className="mk-field"><span>{l}</span><input name={`fin_${k}`} inputMode="decimal" maxLength={20} defaultValue={financial[k] ?? ""} /></label>)}</div></fieldset>
    <label className="mk-field wide"><span>What changed in this version</span><input name="note" maxLength={500} placeholder="e.g. Added AV, final numbers 112" /></label>
    <div className="mk-row wide"><button className="mk-btn ghost" onClick={() => setSend(false)} disabled={pending}>Save draft version</button>
      <button className="mk-btn primary" onClick={() => setSend(true)} disabled={pending}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}Send to client for approval</button></div>
    {msg && <p role="status" className={msg.ok ? "mk-note" : "mk-error"}>{msg.t}</p>}
  </form>;
}

export function ApproveBeo({ orderId, version }: { orderId: string; version: number }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  return <><button type="button" className="mk-btn primary" disabled={pending} onClick={() => start(async () => { const r = await approveEventOrder(orderId, version); if (!r.ok) setError(r.error); else router.refresh(); })}>
    {pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}Approve version {version}</button>{error && <p className="mk-error" role="alert">{error}</p>}</>;
}
