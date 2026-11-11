"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateDispute, adminDecideCancellation, adminEnterAward, adminCheckAward } from "./actions";

// DEC-107 (2026-11-11): staff recommend only. No staff "Resolve": the parties accept the recommendation or settle, or an
// independent award is entered and checked by a second person (AwardEntry below), or the hold-limit default rule applies.
const NEXT: Record<string, [string, string][]> = {
  opened: [["evidence_collection", "Request evidence"], ["review", "Start review"], ["resolution_proposed", "Issue recommendation"], ["escalated", "Mark escalated (independent)"]],
  evidence_collection: [["review", "Start review"], ["resolution_proposed", "Issue recommendation"], ["escalated", "Mark escalated (independent)"]],
  provider_response: [["review", "Start review"], ["resolution_proposed", "Issue recommendation"], ["escalated", "Mark escalated (independent)"]],
  review: [["evidence_collection", "Request more evidence"], ["resolution_proposed", "Issue recommendation"], ["escalated", "Mark escalated (independent)"]],
  resolution_proposed: [["review", "Back to review"], ["escalated", "Mark escalated (independent)"]],
  escalated: [["review", "Back to review"], ["resolution_proposed", "Issue recommendation"]],
};

/** Dispute step form: every change needs a reason; a recommendation is non-binding and moves money only if both parties accept it. */
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
      <label><span>Recommended refund to customer (£)</span><input name="refund" type="number" min={0} step="0.01" /></label>
      <label><span>Credit (£)</span><input name="credit" type="number" min={0} step="0.01" /></label>
      <label className="wide"><span>Terms</span><input name="terms" maxLength={500} placeholder="e.g. Provider refunds the late-arrival portion" /></label>
    </div>}
    <label><span>Reason (shared with both parties)</span><textarea name="note" rows={3} minLength={5} maxLength={2000} required /></label>
    <button className="adb-btn primary" disabled={pending || !to}>{pending ? "Saving…" : to === "resolution_proposed" ? "Issue recommendation (not binding)" : "Record step"}</button>
    {error && <p className="add-error" role="alert">{error}</p>}
  </form>;
}

export function CancellationDecision({ id, paid }: { id: string; paid: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const decide = (accept: boolean, f: FormData) => start(async () => {
    setError("");
    const r = await adminDecideCancellation(id, accept, String(f.get("note") ?? ""), "");
    if (!r.ok) setError(r.error); else router.refresh();
  });
  // DEC-107: approving applies the cancellation policy agreed at booking; staff never set another amount.
  return <form className="add-form" action={f => decide(true, f)}>
    <p className="add-muted">Approving applies the cancellation policy agreed at booking (paid £{paid.toFixed(2)}). A different refund needs the parties to settle in a dispute, or an independent award.</p>
    <label><span>Reason (shared with both parties)</span><textarea name="note" rows={2} minLength={5} maxLength={1000} required /></label>
    <div className="add-row"><button className="adb-btn primary" disabled={pending}>Approve under the booking policy</button>
      <button className="adb-btn" type="button" disabled={pending} onClick={e => decide(false, new FormData(e.currentTarget.form!))}>Reject</button></div>
    {error && <p className="add-error" role="alert">{error}</p>}
  </form>;
}

/** Independent award (ADR, arbitration or court): one member of staff enters it, a second checks it; only then does money move. */
export function AwardEntry({ id, awards }: { id: string; awards: { id: string; refund_minor: number; provider: string; reference: string; status: string; mine: boolean }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const open = awards.filter(a => a.status === "entered");
  return <div className="add-form">
    {open.map(a => <form key={a.id} className="add-form" action={f => start(async () => {
      setError(""); const r = await adminCheckAward(a.id, f.get("confirm") === "yes", String(f.get("note") ?? ""));
      if (!r.ok) setError(r.error); else router.refresh();
    })}>
      <p><b>Award to check:</b> £{(a.refund_minor / 100).toFixed(2)} refund · {a.provider} · ref {a.reference}{a.mine ? " (entered by you — a second person must check it)" : ""}</p>
      {!a.mine && <><label><span>Check note</span><textarea name="note" rows={2} minLength={5} required /></label>
        <div className="add-row"><button className="adb-btn primary" name="confirm" value="yes" disabled={pending}>Confirm award matches the document</button>
          <button className="adb-btn" name="confirm" value="no" disabled={pending}>Reject</button></div></>}
    </form>)}
    <form className="add-form" action={f => start(async () => {
      setError(""); const r = await adminEnterAward(id, String(f.get("refund") ?? ""), String(f.get("provider") ?? ""), String(f.get("reference") ?? ""), String(f.get("sha") ?? ""));
      if (!r.ok) setError(r.error); else router.refresh();
    })}>
      <div className="add-two">
        <label><span>Award: refund to customer (£)</span><input name="refund" type="number" min={0} step="0.01" required /></label>
        <label><span>Provider or court</span><input name="provider" maxLength={120} required placeholder="e.g. CEDR, ProMediate, County Court" /></label>
        <label><span>Case or claim reference</span><input name="reference" maxLength={120} required /></label>
        <label><span>Award document SHA-256 (optional)</span><input name="sha" maxLength={64} pattern="[0-9a-fA-F]{64}" /></label>
      </div>
      <button className="adb-btn" disabled={pending}>Enter independent award</button>
    </form>
    {error && <p className="add-error" role="alert">{error}</p>}
  </div>;
}
