"use client";
import { useState } from "react";
import { Heart, Send, Download } from "lucide-react";
import { Dialog, useAction, useKitToast } from "@/components/kit/client";
import { selectQuote, messageAllProviders } from "@/lib/actions/marketplace";

export function QuoteSelect({ itemId, role, status, primaryLabel }: { itemId: string; role: string; status: string; primaryLabel: string }) {
  const { run, pending } = useAction(); const [fav, setFav] = useState(false);
  const label = role === "primary" && ["quoted", "available", "held"].includes(status) ? "Primary selected" : primaryLabel;
  return <div className="k-row" style={{ gap: 8 }}>
    <button className={`k-btn ${primaryLabel === "Select as primary" ? "primary" : "outline"} block`} disabled={pending || label === "Primary selected"} onClick={() => void run(() => selectQuote(itemId, primaryLabel === "Select as primary" ? "primary" : "backup"))}>{label}</button>
    <button className="k-icon-btn" aria-pressed={fav} aria-label="Shortlist" onClick={() => setFav(!fav)}><Heart size={15} fill={fav ? "currentColor" : "none"} /></button>
  </div>;
}
export function MessageAll({ requestId }: { requestId: string }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <><button className="k-btn primary block lg" onClick={() => setOpen(true)}><Send size={15} />Message all providers</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Message all providers" sub="Sent to every provider still active on this request, in their own conversation.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => messageAllProviders(requestId, String(new FormData(e.currentTarget).get("body")))); if (r.ok) setOpen(false); }}>
        <textarea className="k-textarea" name="body" required maxLength={5000} placeholder="e.g. Quick reminder that responses are due tomorrow at 5pm." />
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>Send</button></div>
      </form>
    </Dialog></>;
}
export function DownloadComparison({ rows }: { rows: Record<string, string>[] }) {
  const toast = useKitToast();
  return <button className="k-btn outline" onClick={() => { const head = Object.keys(rows[0] ?? {}); const esc = (v: string) => `"${v.replace(/"/g, '""')}"`; const csv = [head.join(","), ...rows.map(r => head.map(h => esc(r[h] ?? "")).join(","))].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "quote-comparison.csv"; a.click(); toast("Comparison downloaded"); }}><Download size={14} />Download comparison</button>;
}
