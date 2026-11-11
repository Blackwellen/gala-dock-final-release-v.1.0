"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Seller's chargeback evidence: statement + up to 4 private, AV-scanned uploads, saved as a draft or submitted to the issuer. */
export function ChargebackEvidenceForm({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ path: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true); setMsg(null);
    try {
      for (const file of Array.from(list).slice(0, 4 - files.length)) {
        const fd = new FormData(); fd.set("file", file); fd.set("purpose", "document");
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const out = await res.json();
        if (!res.ok) { setMsg({ ok: false, text: out.error ?? "Upload failed." }); break; }
        setFiles(f => [...f, { path: out.path, name: out.name ?? file.name }]);
      }
    } catch { setMsg({ ok: false, text: "Upload failed. Check your connection." }); } finally { setBusy(false); }
  }
  async function send(submit: boolean) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/chargebacks/${encodeURIComponent(disputeId)}/evidence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, files, submit }) });
      const out = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: out.error ?? "Couldn’t send the evidence." }); return; }
      setMsg({ ok: true, text: submit ? "Evidence submitted to the card issuer." : "Evidence saved with Stripe. Submit it before the due date." });
      router.refresh();
    } catch { setMsg({ ok: false, text: "Couldn’t reach the server. Try again." }); } finally { setBusy(false); }
  }
  return <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
    <label style={{ display: "grid", gap: 4 }}><span>What was booked or bought, and what was delivered</span>
      <textarea rows={4} maxLength={15000} value={text} onChange={e => setText(e.target.value)} placeholder="Order or booking reference, date, what the customer received, any messages agreeing the service…" /></label>
    <label className="ws-btn sm" style={{ justifySelf: "start", cursor: files.length >= 4 ? "not-allowed" : "pointer" }}>Attach PDF or photo ({files.length}/4)
      <input type="file" accept="application/pdf,image/png,image/jpeg" multiple hidden disabled={busy || files.length >= 4} onChange={e => { void upload(e.target.files); e.target.value = ""; }} /></label>
    {files.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }}>{files.map(f => <li key={f.path}>{f.name}</li>)}</ul>}
    <p className="muted" style={{ fontSize: 12, margin: 0 }}>Files are checked for malware before they are sent to Stripe. Submitting is final.</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="ws-btn sm" disabled={busy || text.trim().length < 20} onClick={() => send(false)}>Save draft with Stripe</button>
      <button type="button" className="ws-btn primary sm" disabled={busy || text.trim().length < 20} onClick={() => send(true)}>Submit evidence</button>
    </div>
    {msg && <small role={msg.ok ? "status" : "alert"} className={msg.ok ? "" : "pc-error"}>{msg.text}</small>}
  </div>;
}
