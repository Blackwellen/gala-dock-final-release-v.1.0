"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload } from "lucide-react";
import { attachLicenceDocument } from "@/lib/actions/compliance";

/** Q59: view or attach a licence document. Upload goes through /api/uploads (sniffed, registered, scanned); never a pasted path. */
export function LicenceDocument({ eventId, licenceId, hasDocument, disabledReason }: { eventId: string; licenceId: string; hasDocument: boolean; disabledReason: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    if (file.size > 10 * 1024 * 1024) { setMessage("Choose a file under 10MB."); return; }
    setBusy(true); setMessage("");
    try {
      const body = new FormData(); body.set("file", file); body.set("purpose", "document");
      const res = await fetch("/api/uploads", { method: "POST", body });
      const up = await res.json();
      if (!res.ok) { setMessage(up.error ?? "Upload failed."); return; }
      const out = await attachLicenceDocument(eventId, licenceId, String(up.path));
      setMessage(out.ok ? out.message ?? "Document attached." : out.error ?? "Could not attach the document.");
      if (out.ok) router.refresh();
    } catch { setMessage("Upload failed. Check your connection."); } finally { setBusy(false); }
  }
  return <span className="eo-doc">
    {hasDocument && <a className="k-btn ghost sm" href={`/api/compliance/licences/${licenceId}/document`} target="_blank" rel="noreferrer"><FileText size={14} aria-hidden="true" />Document</a>}
    {!disabledReason && <label className="k-btn ghost sm" title={hasDocument ? "Replace the document" : "Attach the licence document"}>
      {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}{hasDocument ? "Replace" : "Attach"}
      <input type="file" hidden accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void onFile(f); }} />
    </label>}
    {message && <small role="status">{message}</small>}
  </span>;
}
