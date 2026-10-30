"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { appealEnforcement } from "./credentials-actions";

/** Appeal path for a Trust & Safety action (one appeal per action, before the deadline). */
export function AppealForm({ actionId }: { actionId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function onSubmit(form: FormData) {
    setBusy(true); setMessage("");
    try {
      const out = await appealEnforcement({ actionId, statement: String(form.get("statement") ?? "") });
      if ("error" in out) setMessage(out.error ?? "Could not send the appeal."); else { setMessage("Appeal sent to Trust & Safety."); setOpen(false); }
    } finally { setBusy(false); }
  }
  if (!open) return <div className="pc-upload-row"><button type="button" className="ws-btn outline sm" onClick={() => setOpen(true)}>Appeal</button>{message && <small role="status">{message}</small>}</div>;
  return <form action={onSubmit} className="pc-upload" aria-label="Appeal this action">
    <label className="pc-wide">Why should this be reversed?<textarea name="statement" minLength={20} maxLength={2000} required rows={3} /></label>
    <div className="pc-upload-actions"><button type="button" className="ws-btn outline sm" onClick={() => setOpen(false)}>Cancel</button>
      <button className="ws-btn primary sm" disabled={busy}>{busy ? <><Loader2 size={14} className="spin" aria-hidden="true" />Sending…</> : "Send appeal"}</button></div>
    {message && <small role="alert" className="pc-error">{message}</small>}
  </form>;
}
