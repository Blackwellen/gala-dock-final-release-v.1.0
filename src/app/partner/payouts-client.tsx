"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTaxDetails } from "./actions";

/** Q68: starts / resumes Stripe-hosted onboarding of the partner's payout account (POST /partner/payouts → Stripe link). */
export function PayoutSetupButton({ label }: { label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <div className="pr-pay-setup">
    <button type="button" className="pt-btn primary" disabled={pending} onClick={() => start(async () => {
      setError("");
      try {
        const res = await fetch("/partner/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const j = await res.json().catch(() => ({})) as { url?: string; error?: string };
        if (res.ok && j.url) { window.location.assign(j.url); return; }
        setError(j.error ?? "Couldn’t start payout setup. Please try again.");
      } catch { setError("Network error — please try again."); }
    })}>{pending ? "Opening Stripe…" : label}</button>
    {error && <p className="pt-notice red" role="alert">{error}</p>}
  </div>;
}

export function TaxDetailsForm({ registered, number }: { registered: boolean; number: string | null }) {
  const router = useRouter();
  const [vat, setVat] = useState(registered);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return <form className="pr-form" onSubmit={e => { e.preventDefault(); if (pending) return; const f = new FormData(e.currentTarget); setMsg(null); start(async () => {
    const r = await saveTaxDetails(f);
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  }); }}>
    <label className="pr-check"><input type="checkbox" name="vat_registered" checked={vat} onChange={e => setVat(e.target.checked)} /><span>I’m VAT-registered</span></label>
    {vat && <label><span>VAT number</span><input name="vat_number" required defaultValue={number ?? ""} pattern="[A-Za-z]{2}[A-Za-z0-9 ]{2,16}" maxLength={20} placeholder="GB123456789" /></label>}
    {msg && <p className={`pt-notice ${msg.ok ? "green" : "red"}`} role="status">{msg.text}</p>}
    <button type="submit" className="pt-btn outline" disabled={pending}>{pending ? "Saving…" : "Save tax details"}</button>
  </form>;
}
