"use client";

import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { submitCredential } from "./credentials-actions";

/** Upload → /api/uploads (type-sniffed, private) → submit for review. Expiry captured when the credential expires; insurance also records the cover amount. */
export function CredentialUpload({ workspaceId, credentialKey, label, expires, insurance = false, minCover = null }: { workspaceId: string; credentialKey: string; label: string; expires: boolean; insurance?: boolean; minCover?: number | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function onSubmit(form: FormData) {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return setMessage("Choose a PDF, PNG or JPG.");
    setBusy(true); setMessage("");
    try {
      const body = new FormData(); body.set("file", file); body.set("purpose", "document");
      const res = await fetch("/api/uploads", { method: "POST", body });
      const up = await res.json();
      if (!res.ok) { setMessage(up.error ?? "Upload failed."); return; }
      const out = await submitCredential({ workspaceId, credentialKey, filePath: up.path, fileName: up.name, expiresOn: String(form.get("expires") ?? ""), reference: String(form.get("reference") ?? ""), issuer: String(form.get("issuer") ?? ""), cover: String(form.get("cover") ?? "") });
      if ("error" in out) setMessage(out.error ?? "Could not submit."); else { setMessage("Submitted for review."); setOpen(false); }
    } catch { setMessage("Upload failed. Check your connection."); } finally { setBusy(false); }
  }
  if (!open) return <div className="pc-upload-row"><button type="button" className="ws-btn outline sm" onClick={() => setOpen(true)}><Upload aria-hidden="true" size={14} />Upload</button>{message && <small role="status">{message}</small>}</div>;
  return <form action={onSubmit} className="pc-upload" aria-label={`Upload ${label}`}>
    <label>File<input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required /></label>
    <label>Issuer<input name="issuer" maxLength={120} placeholder="e.g. insurer or licensing authority" /></label>
    <label>Reference<input name="reference" maxLength={80} placeholder="Policy or licence number" /></label>
    {expires && <label>Expires<input name="expires" type="date" required /></label>}
    {insurance && <label>Cover amount (£){minCover ? <small>Minimum £{(minCover / 100).toLocaleString("en-GB")}</small> : null}<input name="cover" type="number" inputMode="numeric" min={1} step={1} required placeholder="e.g. 5000000" /></label>}
    <div className="pc-upload-actions"><button type="button" className="ws-btn outline sm" onClick={() => setOpen(false)}>Cancel</button>
      <button className="ws-btn primary sm" disabled={busy}>{busy ? <><Loader2 size={14} className="spin" aria-hidden="true" />Submitting…</> : "Submit for review"}</button></div>
    {message && <small role="alert" className="pc-error">{message}</small>}
  </form>;
}
