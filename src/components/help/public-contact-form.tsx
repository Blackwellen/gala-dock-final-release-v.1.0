"use client";

import { useState } from "react";
import Link from "next/link";
import { Turnstile, TURNSTILE_SITE_KEY } from "@/components/turnstile";

const TOPICS: [string, string][] = [["general", "A general question"], ["sales", "Plans and pricing (sales)"], ["support", "Help with something on Gala Dock"], ["partnerships", "Partnerships"], ["press", "Press"], ["privacy", "Privacy or my data"]];

/** Signed-out Help Centre contact form → POST /api/contact (same-origin, honeypot, per-IP and per-email rate limits, Turnstile when
 *  CONTACT_TURNSTILE is on in production). Shows the submission reference on success. */
export function PublicContactForm({ topic = "general" }: { topic?: string }) {
  const [state, setState] = useState<{ ok?: string; error?: string; pending?: boolean }>({});
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  if (state.ok) return <div className="hc-sent" role="status"><b>Message sent{state.ok !== "sent" ? ` — reference ${state.ok}` : ""}</b><p>Thanks — our team will reply to the email address you gave, usually within one working day.</p>
    <button type="button" className="hc-btn" onClick={() => { setState({}); setToken(""); setResetKey(k => k + 1); }}>Send another message</button></div>;
  return <form className="hc-form" data-testid="public-contact-form" onSubmit={async e => {
    e.preventDefault();
    if (TURNSTILE_SITE_KEY && !token) { setState({ error: "Please complete the security check." }); return; }
    const f = new FormData(e.currentTarget);
    setState({ pending: true });
    const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      name: f.get("name"), email: f.get("email"), topic: f.get("topic"), message: f.get("message"), website: f.get("website"), turnstile: token }) }).catch(() => null);
    const j = await r?.json().catch(() => null) as { ok?: boolean; reference?: string | null; error?: string } | null;
    if (r?.ok && j?.ok) setState({ ok: j.reference ?? "sent" });
    else { setState({ error: j?.error ?? "Couldn’t send your message. Please email support@galadock.com." }); setToken(""); setResetKey(k => k + 1); }
  }}>
    <label><span>Your name</span><input name="name" required maxLength={120} autoComplete="name" /></label>
    <label><span>Email</span><input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
    <label><span>What’s it about?</span><select name="topic" defaultValue={TOPICS.some(([v]) => v === topic) ? topic : "general"}>{TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label><span>Message</span><textarea name="message" required minLength={10} maxLength={5000} rows={5} placeholder="Tell us what you need. Include any event, order or booking reference." /></label>
    {/* Honeypot: hidden from people and assistive tech; bots that fill it are accepted silently and dropped. */}
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <Turnstile onToken={setToken} resetKey={resetKey} />
    {state.error && <p className="hc-err" role="alert">{state.error}</p>}
    <p className="hc-sub">We use your details only to reply. See our <Link href="/privacy">privacy notice</Link>.</p>
    <button type="submit" className="hc-btn primary" disabled={state.pending}>{state.pending ? "Sending…" : "Send message"}</button>
  </form>;
}
