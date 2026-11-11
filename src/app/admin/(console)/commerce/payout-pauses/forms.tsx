"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pausePayouts, liftPause } from "./actions";

const LABEL: Record<string, string> = {
  court_order: "Court or tribunal order", regulator_or_law_enforcement: "Regulator or law-enforcement request", payment_provider_instruction: "Payment provider (Stripe) instruction",
  sanctions_screening: "Sanctions screening match pending", seller_insolvency: "Seller insolvency event", seller_request: "The seller's own request",
};

export function PauseForm({ sellers }: { sellers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <form className="add-form" action={f => start(async () => {
    setError("");
    const r = await pausePayouts(String(f.get("ws") ?? ""), String(f.get("basis") ?? ""), String(f.get("reference") ?? ""), String(f.get("note") ?? ""));
    if (!r.ok) setError(r.error); else router.refresh();
  })}>
    <label><span>Seller workspace</span><select className="adb-select" name="ws" required defaultValue=""><option value="" disabled>Choose a seller with payouts set up</option>{sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label><span>Legal basis (Payment Terms clause 9)</span><select className="adb-select" name="basis" required defaultValue=""><option value="" disabled>Choose…</option>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label><span>Reference</span><input name="reference" required minLength={3} maxLength={200} placeholder="Order number, case or claim reference" /></label>
    <label><span>Note (internal)</span><textarea name="note" rows={2} maxLength={1000} /></label>
    <p className="add-muted">Suspicion alone is never a basis. On suspicion: suspend the account, refuse new work and report — the money stays in the seller’s own Stripe balance.</p>
    <button className="adb-btn primary" disabled={pending}>{pending ? "Pausing…" : "Pause payouts"}</button>
    {error && <p className="add-error" role="alert">{error}</p>}
  </form>;
}

export function LiftForm({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <form className="add-row" action={f => start(async () => {
    setError(""); const r = await liftPause(id, String(f.get("note") ?? ""));
    if (!r.ok) setError(r.error); else router.refresh();
  })}>
    <input name="note" required minLength={5} maxLength={1000} placeholder="Why the pause is lifted" aria-label="Reason for lifting the pause" />
    <button className="adb-btn" disabled={pending}>Lift</button>
    {error && <span className="add-error" role="alert">{error}</span>}
  </form>;
}

export const basisLabel = (b: string) => LABEL[b] ?? b;
