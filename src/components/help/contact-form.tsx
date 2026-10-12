"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { contactSupport } from "@/lib/actions/support";

const CATS: [string, string][] = [["booking", "A booking or quote"], ["ticketing", "Tickets or check-in"], ["payment", "A payment or payout"], ["refund", "A refund"], ["account", "My account or workspace"], ["technical", "Something isn’t working"], ["other", "Something else"]];

/** Help Centre contact form → support case (reference shown on success; the case appears under "Your requests"). */
export function ContactForm({ workspaceId, source }: { workspaceId?: string | null; source: string }) {
  const [pending, start] = useTransition(), router = useRouter();
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  if (state.ok) return <div className="hc-sent" role="status"><b>Message sent — case {state.ok}</b><p>Our support team will reply by email and in your support requests, usually within one working day (within 4 hours for payment issues).</p>
    <button type="button" className="hc-btn" onClick={() => setState({})}>Send another message</button></div>;
  return <form className="hc-form" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
    const r = await contactSupport({ subject: String(f.get("subject") ?? ""), body: String(f.get("body") ?? ""), category: String(f.get("category") ?? "other"), workspaceId, source });
    setState(r.ok ? { ok: r.reference } : { error: r.error }); if (r.ok) router.refresh();
  }); }}>
    <label><span>What’s it about?</span><select name="category" defaultValue="other">{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label><span>Subject</span><input name="subject" required minLength={3} maxLength={200} placeholder="e.g. Payout hasn’t arrived" /></label>
    <label><span>How can we help?</span><textarea name="body" required minLength={10} maxLength={5000} rows={5} placeholder="Include the event, booking or order reference, dates and anything else that helps us look into it." /></label>
    {state.error && <p className="hc-err" role="alert">{state.error}</p>}
    <button type="submit" className="hc-btn primary" disabled={pending}>{pending ? "Sending…" : "Send to support"}</button>
  </form>;
}
