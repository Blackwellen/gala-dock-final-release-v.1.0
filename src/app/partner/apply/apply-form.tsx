"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyToPartnerProgramme } from "../actions";

type Country = { code: string; name: string; payouts: boolean };

export function ApplyForm({ email, name, countries, termsVersion }: { email: string; name: string; countries: Country[]; termsVersion: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [vat, setVat] = useState(false);
  const [country, setCountry] = useState("GB");
  const payouts = countries.find(c => c.code === country)?.payouts ?? false;
  return <form className="pr-form pr-apply-form" onSubmit={e => { e.preventDefault(); if (pending) return; const f = new FormData(e.currentTarget); setError(""); start(async () => {
    const r = await applyToPartnerProgramme(f);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  }); }}>
    <input type="hidden" name="terms_version" value={termsVersion} />
    <label><span>Your name</span><input name="contact_name" required minLength={2} maxLength={120} defaultValue={name} autoComplete="name" /></label>
    <label><span>Email</span><input value={email} readOnly aria-readonly="true" /><small>We use your Gala Dock sign-in email. To apply with another address, sign in with it.</small></label>
    <label><span>Business or trading name</span><input name="business_name" required minLength={2} maxLength={160} autoComplete="organization" /></label>
    <label><span>Business type</span><select name="business_type" required defaultValue="company">
      <option value="company">Limited company</option><option value="sole_trader">Sole trader</option><option value="individual">Individual</option><option value="charity">Charity or association</option><option value="other">Other</option></select></label>
    <label><span>Country</span><select name="country" required value={country} onChange={e => setCountry(e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
      {!payouts && <small className="pr-warn">Stripe payouts aren’t available in this country yet. You can still apply and earn; we’ll agree another way to pay you.</small>}</label>
    <label><span>Website or main social profile</span><input name="website" type="url" maxLength={300} placeholder="https://" /></label>
    <label><span>Who will you refer, and how?</span><textarea name="audience" maxLength={1000} rows={4} placeholder="e.g. venues in Manchester through our newsletter" /></label>
    <label className="pr-check"><input type="checkbox" name="vat_registered" checked={vat} onChange={e => setVat(e.target.checked)} /><span>I’m VAT-registered</span></label>
    {vat && <label><span>VAT number</span><input name="vat_number" required pattern="[A-Za-z]{2}[A-Za-z0-9 ]{2,16}" maxLength={20} placeholder="GB123456789" /></label>}
    <label className="pr-check"><input type="checkbox" name="accept_terms" required /><span>I accept the Gala Dock Affiliate &amp; Partner Terms (version {termsVersion}).</span></label>
    <label className="pr-check"><input type="checkbox" name="accept_self_billing" required /><span>I agree that Gala Dock issues self-billed statements for my commission, and that I won’t issue my own invoices for the same amounts.</span></label>
    {error && <p className="pt-notice red" role="alert">{error}</p>}
    <button type="submit" className="pt-btn primary" disabled={pending}>{pending ? "Sending…" : "Submit application"}</button>
  </form>;
}
