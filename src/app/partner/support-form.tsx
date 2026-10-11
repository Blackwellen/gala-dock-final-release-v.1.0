"use client";

import { useState, useTransition } from "react";
import { contactSupport } from "./actions";

export function SupportForm() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  if (state.ok) return <p className="pt-notice green" role="status">Thanks — case {state.ok} is with the partnerships team. We’ll reply by email.</p>;
  return <form className="pr-form" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
    const r = await contactSupport(String(f.get("subject") ?? ""), String(f.get("body") ?? ""));
    setState(r.ok ? { ok: r.reference } : { error: r.error });
  }); }}>
    <label><span>Subject</span><input name="subject" required minLength={3} maxLength={200} placeholder="e.g. Referral not attributed" /></label>
    <label><span>How can we help?</span><textarea name="body" required minLength={10} maxLength={5000} rows={6} placeholder="Include the account name, dates and anything else that helps us look into it." /></label>
    {state.error && <p className="pt-notice red" role="alert">{state.error}</p>}
    <button type="submit" className="pt-btn primary" disabled={pending}>{pending ? "Sending…" : "Send to partner support"}</button>
  </form>;
}
