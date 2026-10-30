"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import "@/styles/cookie-banner.css";

/*
 * Cookie choice banner (W01). Plain copy, no compliance claims — LEGAL REVIEW PENDING for the wording.
 * Shown until a choice exists (readable `gd_cc` marker); the choice goes to POST /api/consent, which sets `gd_consent`
 * (analytics:yes|no) and, for signed-in people, appends a `cookies_analytics` consent record. Analytics reads that choice.
 * `openCookieSettings()` reopens it (Cookies page).
 */
const HIDDEN = /^\/(admin|maintenance|scan|virtual|guest|rsvp|contract|pay|portal|proposal)(\/|$)/;
export const COOKIE_SETTINGS_EVENT = "gd:cookie-settings";
export function openCookieSettings() { window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT)); }

export function CookieBanner() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => {
    const has = document.cookie.split(";").some(c => c.trim().startsWith("gd_cc="));
    // Deferred so the banner never competes with first paint.
    const t = window.setTimeout(() => { if (!has) setOpen(true); }, 0);
    const reopen = () => { setErr(""); setOpen(true); };
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => { window.clearTimeout(t); window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen); };
  }, []);
  if (!open || HIDDEN.test(path)) return null;
  const choose = async (analytics: boolean) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ analytics }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error || "Couldn’t save your choice — try again."); return; }
      setOpen(false);
    } catch { setErr("Couldn’t save your choice — check your connection."); } finally { setBusy(false); }
  };
  return <section className="gd-consent" role="region" aria-label="Cookie choice">
    <p><b>Cookies on Gala Dock</b>We use essential cookies to run the site. With your OK we’ll also count visits and page use (analytics) to improve Gala Dock. <Link href="/cookies">Read about our cookies</Link>.</p>
    <div className="gd-consent-acts">
      <button type="button" className="gd-consent-btn" disabled={busy} onClick={() => void choose(false)}>Essential only</button>
      <button type="button" className="gd-consent-btn primary" disabled={busy} onClick={() => void choose(true)}>Allow analytics</button>
    </div>
    {err && <small role="alert">{err}</small>}
  </section>;
}

/** Button for the Cookies page: reopens the banner so the visitor can change their choice. */
export function CookieSettingsButton() {
  return <button type="button" className="gd-consent-btn" onClick={openCookieSettings}>Change cookie choice</button>;
}
