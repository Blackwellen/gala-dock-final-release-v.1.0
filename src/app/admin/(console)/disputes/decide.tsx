"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateDispute, adminDecideCancellation } from "./actions";

const NEXT: Record<string, [string, string][]> = {
  opened: [["evidence_collection", "Request evidence"], ["review", "Start review"], ["resolution_proposed", "Propose resolution"], ["resolved", "Resolve"], ["escalated", "Escalate"]],
  evidence_collection: [["review", "Start review"], ["resolution_proposed", "Propose resolution"], ["resolved", "Resolve"], ["escalated", "Escalate"]],
  provider_response: [["review", "Start review"], ["resolution_proposed", "Propose resolution"], ["resolved", "Resolve"], ["escalated", "Escalate"]],
  review: [["evidence_collection", "Request more evidence"], ["resolution_proposed", "Propose resolution"], ["resolved", "Resolve"], ["escalated", "Escalate"]],
  resolution_proposed: [["review", "Back to review"], ["resolved", "Resolve (decision)"], ["escalated", "Escalate"]],
  escalated: [["review", "Back to review"], ["resolution_proposed", "Propose resolution"], ["resolved", "Resolve (decision)"]],
};

/** Dispute decision form: every change needs a reason; proposals carry structured terms the parties accept. */
export function DisputeDecision({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [to, setTo] = useState(NEXT[status]?.[0]?.[0] ?? "");
  const [error, setError] = useState("");
  if (!NEXT[status]) return <p className="add-muted">This dispute is closed.</p>;
  return <form className="add-form" action={f => start(async () => {
    setError("");
    const r = await adminUpdateDispute(id, to, String(f.get("note") ?? ""), String(f.get("refund") ?? ""), String(f.get("credit") ?? ""), String(f.get("terms") ?? ""));
    if (!r.ok) setError(r.error); else router.refresh();
  })}>
    <label><span>Next step</span><select className="adb-select" value={to} onChange={e => setTo(e.target.value)}>{NEXT[status]!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    {to === "resolution_proposed" && <div className="add-two">
      <label><span>Refund to customer (£)</span><input name="refund" type="number" min={0} step="0.01" /></label>
      <label><span>Credit (£)</span><input name="credit" type="number" min={0} step="0.01" /></label>
      <label className="wide"><span>Terms</span><input name="terms" maxLength={500} placeholder="e.g. Provider refunds the late-arrival portion" /></label>
    </div>}
    <label><span>Reason (shared with both parties)</span><textarea name="note" rows={3} minLength={5} maxLength={2000} required /></label>
    <button className="adb-btn primary" disabled={pending || !to}>{pending ? "Saving…" : "Record decision"}</button>
    {error && <p className="add-error" role="alert">{error}</p>}
  </form>;
}

export function CancellationDecision({ id, paid }: { id: string; paid: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const decide = (accept: boolean, f: FormData) => start(async () => {
    setError("");
    const r = await adminDecideCancellation(id, accept, String(f.get("note") ?? ""), String(f.get("refund") ?? ""));
    if (!r.ok) setError(r.error); else router.refresh();
  });
  return <form className="add-form" action={f => decide(true, f)}>
    <label><span>Refund (£, max {paid.toFixed(2)})</span><input name="refund" type="number" min={0} max={paid} step="0.01" required /></label>
    <label><span>Reason (shared with both parties)</span><textarea name="note" rows={2} minLength={5} maxLength={1000} required /></label>
    <div className="add-row"><button className="adb-btn primary" disabled={pending}>Approve cancellation</button>
      <button className="adb-btn" type="button" disabled={pending} onClick={e => decide(false, new FormData(e.currentTarget.form!))}>Reject</button></div>
    {error && <p className="add-error" role="alert">{error}</p>}
  </form>;
}
