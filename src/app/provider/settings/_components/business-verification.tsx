"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { submitBusinessVerification } from "./credentials-actions";

/** Q59: submit business details for Gala Dock review (manual business verification). One submission at a time. */
export function BusinessVerificationForm({ workspaceId, legalName = "", resubmit = false }: { workspaceId: string; legalName?: string; resubmit?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function onSubmit(form: FormData) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const out = await submitBusinessVerification({ workspaceId, legalName: String(form.get("legal_name") ?? ""), tradingName: String(form.get("trading_name") ?? ""), companyNumber: String(form.get("company_number") ?? "") });
      if ("error" in out) setMessage(out.error ?? "Could not submit your details."); else { setMessage("Sent to Gala Dock for review."); setOpen(false); }
    } catch { setMessage("Could not submit your details. Check your connection."); } finally { setBusy(false); }
  }
  if (!open) return <div className="pc-upload-row"><button type="button" className="ws-btn outline sm" onClick={() => setOpen(true)}>{resubmit ? "Resubmit details" : "Submit business details"}</button>{message && <small role="status">{message}</small>}</div>;
  return <form action={onSubmit} className="pc-upload" aria-label="Business verification details">
    <label>Legal name<input name="legal_name" required minLength={2} maxLength={200} defaultValue={legalName} autoComplete="organization" /></label>
    <label>Trading name<input name="trading_name" maxLength={200} placeholder="If different" /></label>
    <label>Company number<input name="company_number" maxLength={20} placeholder="e.g. Companies House number" /></label>
    <div className="pc-upload-actions"><button type="button" className="ws-btn outline sm" onClick={() => setOpen(false)}>Cancel</button>
      <button className="ws-btn primary sm" disabled={busy}>{busy ? <><Loader2 size={14} className="spin" aria-hidden="true" />Sending…</> : "Send for review"}</button></div>
    {message && <small role="alert" className="pc-error">{message}</small>}
  </form>;
}
