"use client";

import { useState } from "react";

/** Starts or resumes Stripe-hosted payout onboarding (no bank details touch Gala Dock). */
export function ConnectButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "provider", step: 4 }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn’t open Stripe."); setBusy(false); return; }
      window.location.assign(data.url);
    } catch { setError("Couldn’t reach Stripe. Try again."); setBusy(false); }
  }
  return <><button type="button" className="ws-btn primary sm" onClick={go} disabled={busy}>{busy ? "Opening Stripe…" : label}</button>{error && <small role="alert" className="pc-error">{error}</small>}</>;
}
