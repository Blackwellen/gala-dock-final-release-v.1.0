"use client";

import { useState, useTransition } from "react";
import { setPayoutMethod } from "./actions";

// Q68: promoter commission is paid by the organiser directly, outside Gala Dock. The old "Stripe" option promised an onboarding link
// that no flow sends, so it is gone (the database refuses it too).
const OPTIONS = [
  { value: "bank_transfer", label: "Bank transfer", hint: "The organiser pays you by bank transfer and will ask you for your bank details directly. Gala Dock never asks for them." },
  { value: "paypal", label: "PayPal", hint: "The organiser pays the PayPal account on your sign-in email." },
];

export function PayoutMethodForm({ promoterId, current }: { promoterId: string; current: string | null }) {
  const [value, setValue] = useState(current && current !== "stripe" ? current : "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return <form className="pp-pay-form" onSubmit={e => { e.preventDefault(); start(async () => {
    const r = await setPayoutMethod(promoterId, value || null);
    setMsg(r.ok ? { ok: true, text: "Saved. The organiser sees your preference and pays you directly." } : { ok: false, text: r.error ?? "Couldn’t save." });
  }); }}>
    <fieldset><legend className="pt-sr">Payout method</legend>
      {OPTIONS.map(o => <label key={o.value} className={value === o.value ? "on" : ""}><input type="radio" name="method" value={o.value} checked={value === o.value} onChange={() => { setValue(o.value); setMsg(null); }} />
        <span><b>{o.label}</b><small>{o.hint}</small></span></label>)}
    </fieldset>
    <div><button type="submit" className="pt-btn primary" disabled={pending || !value || value === current}>{pending ? "Saving…" : "Save payout method"}</button>
      {msg && <p className={msg.ok ? "ok" : "err"} role="status">{msg.text}</p>}</div>
  </form>;
}
