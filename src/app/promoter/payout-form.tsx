"use client";

import { useState, useTransition } from "react";
import { setPayoutMethod } from "./actions";

const OPTIONS = [
  { value: "bank_transfer", label: "Bank transfer", hint: "The organiser’s payment provider will email you a secure form for your account details." },
  { value: "paypal", label: "PayPal", hint: "Paid to the PayPal account on your sign-in email." },
  { value: "stripe", label: "Stripe", hint: "Connect a Stripe account when the organiser sends the onboarding link." },
];

export function PayoutMethodForm({ promoterId, current }: { promoterId: string; current: string | null }) {
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return <form className="pp-pay-form" onSubmit={e => { e.preventDefault(); start(async () => {
    const r = await setPayoutMethod(promoterId, value || null);
    setMsg(r.ok ? { ok: true, text: "Saved. The organiser will be in touch to verify your details before the next payout." } : { ok: false, text: r.error ?? "Couldn’t save." });
  }); }}>
    <fieldset><legend className="pt-sr">Payout method</legend>
      {OPTIONS.map(o => <label key={o.value} className={value === o.value ? "on" : ""}><input type="radio" name="method" value={o.value} checked={value === o.value} onChange={() => { setValue(o.value); setMsg(null); }} />
        <span><b>{o.label}</b><small>{o.hint}</small></span></label>)}
    </fieldset>
    <div><button type="submit" className="pt-btn primary" disabled={pending || !value || value === current}>{pending ? "Saving…" : "Save payout method"}</button>
      {msg && <p className={msg.ok ? "ok" : "err"} role="status">{msg.text}</p>}</div>
  </form>;
}
