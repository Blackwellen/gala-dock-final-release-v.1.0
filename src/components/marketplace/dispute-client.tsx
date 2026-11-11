"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, X } from "lucide-react";
import { addDisputeEntry, offerDisputeSettlement, acceptDisputeSettlement, requestIndependentResolution, recordDisputeFiling } from "@/lib/marketplace/actions";

/** Adds a statement or evidence to a dispute. Files go through /api/uploads (type-sniffed, private) and are attached by path. */
export function DisputeEntryForm({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<{ path: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true); setError("");
    try {
      for (const file of Array.from(list).slice(0, 10 - files.length)) {
        const fd = new FormData(); fd.set("file", file); fd.set("purpose", "document");
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const out = await res.json();
        if (!res.ok) { setError(out.error ?? "Upload failed."); break; }
        setFiles(f => [...f, { path: out.path, name: out.name ?? file.name }]);
      }
    } catch { setError("Upload failed. Check your connection."); } finally { setUploading(false); }
  }
  const submit = () => start(async () => {
    setError("");
    const r = await addDisputeEntry(disputeId, files.length ? "evidence" : "statement", body, files);
    if (!r.ok) { setError(r.error); return; }
    setBody(""); setFiles([]); router.refresh();
  });
  return <form className="mk-form" action={submit} aria-label="Add to the dispute">
    <label className="mk-field wide"><span>Add a statement or evidence</span><textarea rows={3} maxLength={6000} value={body} onChange={e => setBody(e.target.value)} placeholder="What happened, timings, what you’d consider fair…" /></label>
    {files.length > 0 && <ul className="mk-row wide" style={{ listStyle: "none", margin: 0, padding: 0 }}>{files.map(f => <li key={f.path} className="mk-tag grey">{f.name}
      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(x => x.filter(y => y.path !== f.path))} style={{ border: 0, background: "none", cursor: "pointer", display: "inline-flex", padding: "0 0 0 4px" }}><X size={12} /></button></li>)}</ul>}
    <div className="mk-row wide" style={{ justifyContent: "space-between" }}>
      <label className="mk-btn ghost" style={{ cursor: files.length >= 10 ? "not-allowed" : "pointer" }}>{uploading ? <Loader2 size={14} className="mk-spin" aria-hidden="true" /> : <Paperclip size={14} aria-hidden="true" />}Attach PDF or photo
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple hidden disabled={uploading || files.length >= 10} onChange={e => { void upload(e.target.files); e.target.value = ""; }} /></label>
      <button className="mk-btn primary" disabled={pending || uploading || (!body.trim() && !files.length)}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}Add to dispute</button>
    </div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

/** DEC-107 settlement: either party offers a refund; only the other party can accept it. Accepting closes the dispute. */
export function SettlementPanel({ disputeId, open }: { disputeId: string; open: { id: string; refund_minor: number; party: string; mine: boolean } | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const offer = () => start(async () => {
    setError(""); const r = await offerDisputeSettlement(disputeId, Number(amount), note);
    if (!r.ok) { setError(r.error); return; } setAmount(""); setNote(""); router.refresh();
  });
  const accept = (id: string) => start(async () => {
    setError(""); const r = await acceptDisputeSettlement(id);
    if (!r.ok) { setError(r.error); return; } router.refresh();
  });
  return <div className="mk-form">
    {open && <p className="mk-note">Open offer: refund £{(open.refund_minor / 100).toFixed(2)} ({open.mine ? "your offer, waiting for the other side" : `offered by the ${open.party === "provider" ? "provider" : "organiser"}`}).</p>}
    {open && !open.mine && <button type="button" className="mk-btn primary" disabled={pending} onClick={() => accept(open.id)}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}Accept this settlement</button>}
    <label className="mk-field"><span>Offer a settlement: refund to the organiser (£)</span><input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
    <label className="mk-field"><span>Note (optional)</span><input maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
    <button type="button" className="mk-btn ghost" disabled={pending || amount === ""} onClick={offer}>Send offer</button>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </div>;
}

const ROUTE_LABEL: Record<string, string> = { court: "Court", mediation_if_both_agree: "Mediation (if both agree)", arbitration: "Arbitration",
  arbitration_if_consumer_consents_after_dispute_started: "Arbitration (only with the consumer's consent now)" };

/** Disputes Policy clause 8.3: ask for independent resolution, then record proof of filing within 14 days. */
export function IndependentResolution({ disputeId, options, escalated, filed }: { disputeId: string; options: string[]; escalated: boolean; filed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [route, setRoute] = useState(options.find(o => o !== "settlement") ?? "");
  const [provider, setProvider] = useState(""), [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setError(""); const r = await fn(); if (!r.ok) setError(r.error ?? "Something went wrong."); else router.refresh(); });
  if (filed) return <p className="mk-note">Proof of filing recorded. The payment stays where it is until an award, a settlement or the payment hold limit.</p>;
  return <div className="mk-form">
    {!escalated ? <>
      <label className="mk-field"><span>Route</span><select value={route} onChange={e => setRoute(e.target.value)}>{options.filter(o => o !== "settlement").map(o => <option key={o} value={o}>{ROUTE_LABEL[o] ?? o.replace(/_/g, " ")}</option>)}</select></label>
      <button type="button" className="mk-btn ghost" disabled={pending || !route} onClick={() => run(() => requestIndependentResolution(disputeId, route))}>Ask for independent resolution</button>
    </> : <>
      <p className="mk-note">File with the provider or court yourself, then record it here within 14 days.</p>
      <label className="mk-field"><span>Provider or court</span><input maxLength={120} value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. CEDR, County Court" /></label>
      <label className="mk-field"><span>Case or claim reference</span><input maxLength={120} value={ref} onChange={e => setRef(e.target.value)} /></label>
      <button type="button" className="mk-btn primary" disabled={pending} onClick={() => run(() => recordDisputeFiling(disputeId, provider, ref))}>Record proof of filing</button>
    </>}
    {error && <p className="mk-error" role="alert">{error}</p>}
  </div>;
}
