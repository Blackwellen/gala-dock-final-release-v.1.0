"use client";

import { useState, useTransition } from "react";
import { saveTaxDetails } from "@/lib/actions/tax-details";
import { validateTaxDetails, type TaxDetailsErrors, type TaxDetailsInput } from "@/lib/tax/platform-reporting";
import { countryProfile } from "@/lib/i18n/countries";

/**
 * Q74 (D7): Tax details for HMRC platform reporting (Platform Operators Regulations 2023). Shown at payout set-up for venues and
 * suppliers, and on Money → Tax details. Sensitive: the TIN and date of birth are never shown back in full.
 */
export function TaxDetailsForm({ workspaceId, defaultCountry = "GB", onSaved, compact = false }: { workspaceId: string; defaultCountry?: string; onSaved?: () => void; compact?: boolean }) {
  const [v, setV] = useState<Partial<TaxDetailsInput>>({ seller_type: "entity", country: defaultCountry, tin_country: defaultCountry });
  const [errors, setErrors] = useState<TaxDetailsErrors>({}), [error, setError] = useState(""), [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const set = <K extends keyof TaxDetailsInput>(k: K, val: TaxDetailsInput[K]) => setV(x => ({ ...x, [k]: val }));
  const prof = countryProfile(v.country);   // Q76: address rules for the address country
  const err = (k: keyof TaxDetailsInput) => errors[k] ? <small className="pc-error" role="alert">{errors[k]}</small> : null;
  const submit = () => {
    const e = validateTaxDetails(v); setErrors(e); setError("");
    if (Object.keys(e).length) return;
    start(async () => { const r = await saveTaxDetails(workspaceId, v); if (!r.ok) { setError(r.error); setErrors(r.errors ?? {}); } else { setDone(r.message); onSaved?.(); } });
  };
  if (done) return <p role="status" className="k-small">{done}</p>;
  const individual = v.seller_type === "individual";
  return <form className="tdf" onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: "grid", gap: 8, marginTop: compact ? 8 : 0 }}>
    <p className="k-small k-muted">UK law (the Platform Operators Regulations 2023) requires us to collect these details and report your earnings to HMRC once a year. HMRC may share them with other tax authorities. We give you a copy of what we report.</p>
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="k-small"><b>You sell as</b></legend>
      <label className="k-small"><input type="radio" name="seller_type" checked={!individual} onChange={() => set("seller_type", "entity")} /> A company or other organisation</label>{" "}
      <label className="k-small"><input type="radio" name="seller_type" checked={individual} onChange={() => set("seller_type", "individual")} /> An individual (including sole traders)</label></fieldset>
    <label className="k-small">{individual ? "Full legal name" : "Registered company name"}<input className="k-input" value={v.legal_name ?? ""} onChange={e => set("legal_name", e.target.value)} maxLength={200} autoComplete={individual ? "name" : "organization"} />{err("legal_name")}</label>
    {individual
      ? <label className="k-small">Date of birth<input className="k-input" type="date" value={v.date_of_birth ?? ""} onChange={e => set("date_of_birth", e.target.value)} autoComplete="bday" />{err("date_of_birth")}</label>
      : <label className="k-small">Company number<input className="k-input" value={v.company_number ?? ""} onChange={e => set("company_number", e.target.value)} maxLength={20} placeholder="01234567" />{err("company_number")}</label>}
    <label className="k-small">{v.country === "GB" ? (individual ? "UTR or National Insurance number" : "Company UTR") : "Tax identification number"}<input className="k-input" value={v.tin ?? ""} onChange={e => set("tin", e.target.value)} maxLength={30} disabled={!!v.tin_not_issued} autoComplete="off" />{err("tin")}</label>
    <label className="k-small"><input type="checkbox" checked={!!v.tin_not_issued} onChange={e => set("tin_not_issued", e.target.checked)} /> My country doesn’t issue a tax number</label>
    <label className="k-small">VAT number (if registered)<input className="k-input" value={v.vat_number ?? ""} onChange={e => set("vat_number", e.target.value)} maxLength={20} placeholder="GB123456789" />{err("vat_number")}</label>
    <label className="k-small">{individual ? "Home address" : "Registered address"} — line 1<input className="k-input" value={v.address_line1 ?? ""} onChange={e => set("address_line1", e.target.value)} maxLength={200} autoComplete="address-line1" />{err("address_line1")}</label>
    <label className="k-small">Address line 2 (optional)<input className="k-input" value={v.address_line2 ?? ""} onChange={e => set("address_line2", e.target.value)} maxLength={200} autoComplete="address-line2" /></label>
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
      <label className="k-small">Town or city<input className="k-input" value={v.city ?? ""} onChange={e => set("city", e.target.value)} maxLength={100} autoComplete="address-level2" />{err("city")}</label>
      {/* Q76: postcode label per country (Eircode, ZIP code …), hidden where the country has none; region where the address uses one. */}
      {prof?.postcode !== null && <label className="k-small">{prof?.postcodeLabel ?? "Postcode"}<input className="k-input" value={v.postal_code ?? ""} onChange={e => set("postal_code", e.target.value)} maxLength={20} autoComplete="postal-code" />{err("postal_code")}</label>}
      {prof?.address.includes("region") && <label className="k-small">{prof.regionLabel ?? "Region"}<input className="k-input" value={v.region ?? ""} onChange={e => set("region", e.target.value)} maxLength={100} autoComplete="address-level1" /></label>}
      <label className="k-small">Country (ISO code)<input className="k-input" value={v.country ?? ""} onChange={e => { const c = e.target.value.toUpperCase().slice(0, 2); set("country", c); set("tin_country", c); }} maxLength={2} autoComplete="country" />{err("country")}</label>
    </div>
    <label className="k-small"><input type="checkbox" checked={!!v.confirmed_accurate} onChange={e => set("confirmed_accurate", e.target.checked)} /> These details are correct, and I’ll update them if they change.</label>{err("confirmed_accurate")}
    {error && <p className="pc-error" role="alert">{error}</p>}
    <div><button type="submit" className="ws-btn primary sm" disabled={pending}>{pending ? "Saving…" : "Save tax details"}</button></div>
  </form>;
}
