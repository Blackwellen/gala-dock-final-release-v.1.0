"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, X } from "lucide-react";
import { addDisputeEntry } from "@/lib/marketplace/actions";

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
