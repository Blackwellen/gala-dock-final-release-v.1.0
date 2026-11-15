"use client";

import Link from "next/link";
import { useState } from "react";
import { PaymentTermsTick, TraderQuestion, type TraderValue } from "@/components/payments/payment-terms-tick";
import { TaxDetailsForm } from "@/components/payments/tax-details-form";

/** Starts or resumes Stripe-hosted payout onboarding (no bank details touch Gala Dock). DEC-107: Payment Terms tick first. */
export function ConnectButton({ label, kind = "provider" }: { label: string; kind?: "provider" | "organizer" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [help, setHelp] = useState<string | null>(null);
  const [terms, setTerms] = useState<string | null>(null);
  const [ticked, setTicked] = useState(false);
  const [traderVersion, setTraderVersion] = useState<string | null>(null);
  const [trader, setTrader] = useState<TraderValue>({ status: "business", form: "company" });
  const [tax, setTax] = useState<{ workspaceId: string; country: string } | null>(null);   // Q74 (D7): tax details step
  async function go() {
    if (terms && !ticked) { setError("Tick the box to accept the Payment Terms."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/payouts", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, step: 4, from: "money", ...(terms && ticked ? { acceptTerms: true, termsVersion: terms } : {}), ...(traderVersion ? { trader: { ...trader, version: traderVersion } } : {}) }) });
      const data = await res.json();
      if (res.status === 409 && (data.termsRequired || data.traderRequired)) {
        if (data.traderRequired && !traderVersion) setTraderVersion(data.traderVersion);
        if (data.termsRequired && terms !== data.termsVersion) { setTerms(data.termsVersion); setTicked(false); }
        if (data.traderRequired && traderVersion) setError(data.error ?? "Couldn’t save your seller status.");
        setBusy(false); return;
      }
      if (res.status === 409 && data.taxDetailsRequired) { setTax({ workspaceId: data.workspaceId, country: data.country ?? "GB" }); setBusy(false); return; }
      if (!res.ok) { setError(data.error ?? "Couldn’t open Stripe."); setHelp(data.countryUnsupported ? data.help ?? null : null); setBusy(false); return; }
      window.location.assign(data.url);
    } catch { setError("Couldn’t reach Stripe. Try again."); setBusy(false); }
  }
  if (tax) return <div><b className="k-small">Tax details for HMRC reporting</b><TaxDetailsForm workspaceId={tax.workspaceId} defaultCountry={tax.country} compact onSaved={() => { setTax(null); void go(); }} /></div>;
  return <>
    {traderVersion && <TraderQuestion version={traderVersion} value={trader} onChange={setTrader} />}
    {terms && <PaymentTermsTick version={terms} checked={ticked} onChange={setTicked} />}
    <button type="button" className="ws-btn primary sm" onClick={go} disabled={busy}>{busy ? "Opening Stripe…" : terms ? "Accept and continue to Stripe" : label}</button>
    {error && <small role="alert" className="pc-error">{error}{help && <> <Link href={help}>Where you can get paid</Link></>}</small>}
  </>;
}
