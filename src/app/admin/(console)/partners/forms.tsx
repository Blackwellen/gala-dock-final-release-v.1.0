"use client";

import { useState } from "react";
import { ActionForm } from "@/components/workspace/actions";
import { createPartner, decideApplication } from "./actions";

/** Q68 admin "Create partner": name, contact email, type, terms (graded or custom rate), country; optional login invitation. */
export function CreatePartnerForm({ countries }: { countries: { code: string; name: string }[] }) {
  const [terms, setTerms] = useState("standard");
  return <ActionForm action={createPartner} className="adb-form adp-create">
    <label>Partner name<input name="name" required minLength={2} maxLength={120} /></label>
    <label>Contact email<input name="email" type="email" required maxLength={254} /></label>
    <label>Type<select name="kind" defaultValue="affiliate"><option value="affiliate">Affiliate</option><option value="strategic">Strategic partner</option></select></label>
    <label>Country<select name="country" required defaultValue="GB">{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
    <label>Terms<select name="terms" value={terms} onChange={e => setTerms(e.target.value)}>
      <option value="standard">Standard — graded 6% to 10% by active referrals</option><option value="custom">Custom rate (fixed, signed order form)</option></select></label>
    {terms === "custom" && <label>Commission rate (%)<input name="rate" type="number" min={0} max={50} step={0.5} required defaultValue={10} /></label>}
    <label className="adp-check"><input type="checkbox" name="invite" defaultChecked /> Email a login invitation to the contact (14-day link, bound to this email)</label>
    <label>Reason (recorded in audit log)<textarea name="reason" required minLength={5} rows={2} placeholder="e.g. Signed partner agreement, ref …" /></label>
    <button className="adb-btn primary" type="submit">Create partner</button>
  </ActionForm>;
}

/** Approve (choose terms) or reject (reason is shown to the applicant) a pending application. */
export function ApplicationDecision({ id, name }: { id: string; name: string }) {
  const [terms, setTerms] = useState("standard");
  return <details className="adb-pop"><summary className="adb-btn">Review</summary><div className="adb-pop-body">
    <ActionForm action={decideApplication} className="adb-form"><h3>{name}</h3>
      <input type="hidden" name="application_id" value={id} />
      <label>Type (if approved)<select name="kind" defaultValue="affiliate"><option value="affiliate">Affiliate</option><option value="strategic">Strategic partner</option></select></label>
      <label>Terms (if approved)<select name="terms" value={terms} onChange={e => setTerms(e.target.value)}><option value="standard">Standard — graded 6% to 10%</option><option value="custom">Custom rate</option></select></label>
      {terms === "custom" && <label>Commission rate (%)<input name="rate" type="number" min={0} max={50} step={0.5} defaultValue={10} /></label>}
      <label>Reason (audit log; shown to the applicant if rejected)<textarea name="reason" required minLength={5} rows={3} /></label>
      <div className="adp-decide"><button className="adb-btn primary" type="submit" name="decision" value="approve">Approve</button><button className="adb-btn" type="submit" name="decision" value="reject">Reject</button></div>
    </ActionForm></div></details>;
}
