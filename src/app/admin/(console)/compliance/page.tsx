import type { Metadata } from "next";
import { Restricted } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { getAdmin } from "@/lib/admin/context";
import { Head, Pill, TabBar } from "../_b/kit";
import { must } from "../_a/lib";
import { reviewComplianceSignal, setSanctionsOverride } from "./actions";
import { SANCTIONED_COUNTRIES, SANCTIONED_REGIONS, SANCTIONS_CHECKED_ON } from "@/lib/legal/sanctions";
import { DUE_DILIGENCE } from "@/lib/tax/platform-reporting";
import "@/styles/admin-b.css";
import "@/styles/admin-d.css";

export const metadata: Metadata = { title: "Compliance" };

type Signal = { id: string; kind: string; country: string | null; amount_minor: number | null; tax_minor: number | null; currency: string | null; product: string | null;
  occurred_at: string; livemode: boolean; detail: Record<string, unknown>; reviewed_at: string | null; review_note: string };
type Override = { id: string; subject_type: string; subject_id: string; reason: string; granted_at: string; expires_at: string | null; revoked_at: string | null };
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }) : "—";
const amt = (m: number | null, c: string | null) => m == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: c ?? "GBP" }).format(m / 100);

/**
 * Q74 compliance desk: tax/sanctions staff alerts (Stripe Tax not_collecting consumer sales — register there; EU: IE OSS by the 10th
 * of the next month), sanctions overrides (audited), and the annual UK platform-reporting export (PORR 2023).
 */
export default async function CompliancePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getAdmin();
  const canCommerce = admin.permissions.has("commerce"), canTrust = admin.permissions.has("trust");
  if (!canCommerce && !canTrust) return <Restricted area="Compliance" />;
  const sp = await props.searchParams;
  const tab = sp.tab === "sanctions" || sp.tab === "reporting" ? sp.tab : "signals";
  const signals = tab === "signals" ? (must<Signal[] | null>(await admin.db.from("compliance_signals" as never).select("id,kind,country,amount_minor,tax_minor,currency,product,occurred_at,livemode,detail,reviewed_at,review_note").order("occurred_at", { ascending: false }).limit(200)) ?? []) : [];
  const overrides = tab === "sanctions" && canTrust ? (must<Override[] | null>(await admin.db.from("sanctions_overrides" as never).select("id,subject_type,subject_id,reason,granted_at,expires_at,revoked_at").order("granted_at", { ascending: false }).limit(100)) ?? []) : [];
  const year = new Date().getUTCFullYear();
  return <div className="adb adm-page">
    <Head title="Compliance" subtitle="Tax registrations, sanctions and HMRC platform reporting" />
    <TabBar active={tab} tabs={[{ key: "signals", label: "Tax & sanctions alerts", href: "/admin/compliance", count: null },
      { key: "sanctions", label: "Sanctions", href: "/admin/compliance?tab=sanctions" }, { key: "reporting", label: "Platform reporting", href: "/admin/compliance?tab=reporting" }]} />
    {tab === "signals" && <section className="adb-panel" style={{ display: "grid", gap: 10 }}>
      <p className="adb-sub">Each row is a paid Gala Dock own-sale (plan, credit pack, boost) where Stripe Tax collected nothing from a consumer in a zero-threshold country, or a billing address in a sanctioned country. Register in that country (EU: submit the IE non-Union OSS application by the date shown so it backdates), then mark reviewed.</p>
      {!signals.length && <p>No alerts.</p>}
      <table className="adb-table"><thead><tr><th>When</th><th>Kind</th><th>Country</th><th>Product</th><th>Amount</th><th>Tax</th><th>Mode</th><th>Status</th></tr></thead>
        <tbody>{signals.map(s => <tr key={s.id}><td>{when(s.occurred_at)}</td><td>{s.kind === "tax_not_collecting" ? "Tax not collected" : "Sanctioned billing country"}{s.detail?.oss_deadline ? <small> · OSS by {String(s.detail.oss_deadline)}</small> : null}</td>
          <td>{s.country ?? "—"}</td><td>{s.product ?? "—"}</td><td>{amt(s.amount_minor, s.currency)}</td><td>{amt(s.tax_minor, s.currency)}</td><td>{s.livemode ? "live" : "test"}</td>
          <td>{s.reviewed_at ? <span title={s.review_note}><Pill status="completed" label="Reviewed" /></span>
            : <ActionForm action={reviewComplianceSignal}><input type="hidden" name="id" value={s.id} /><input name="note" required minLength={5} placeholder="Action taken" /> <button className="adb-btn sm" type="submit">Mark reviewed</button></ActionForm>}</td></tr>)}</tbody></table>
    </section>}
    {tab === "sanctions" && <section className="adb-panel" style={{ display: "grid", gap: 10 }}>
      <p className="adb-sub">Blocked (checked {SANCTIONS_CHECKED_ON}): {[...Object.values(SANCTIONED_COUNTRIES), ...Object.values(SANCTIONED_REGIONS)].join(", ")}. Applied at sign-up and onboarding country, listing and event publish, payout set-up, partner applications and checkout. Change the list only with a migration and src/lib/legal/sanctions.ts together.</p>
      {canTrust ? <>
        <ActionForm action={setSanctionsOverride} resetOnSuccess><div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select name="active" defaultValue="grant" aria-label="Grant or revoke"><option value="grant">Grant override</option><option value="revoke">Revoke override</option></select>
          <select name="type" defaultValue="workspace" aria-label="Subject type"><option value="workspace">Workspace</option><option value="user">User</option></select>
          <input name="subject_id" required placeholder="Workspace or user id" style={{ width: 320 }} />
          <input name="expires" type="date" aria-label="Expires (optional)" />
          <input name="reason" required minLength={10} maxLength={1000} placeholder="Legal basis (counsel reference, OFSI licence, mistaken geolocation…)" style={{ flex: "1 1 320px" }} />
          <button className="adb-btn primary" type="submit">Save</button></div></ActionForm>
        <table className="adb-table"><thead><tr><th>Subject</th><th>Reason</th><th>Granted</th><th>Expires</th><th>State</th></tr></thead>
          <tbody>{overrides.map(o => <tr key={o.id}><td>{o.subject_type} <code>{o.subject_id}</code></td><td>{o.reason}</td><td>{when(o.granted_at)}</td><td>{when(o.expires_at)}</td><td>{o.revoked_at ? `revoked ${when(o.revoked_at)}` : "active"}</td></tr>)}</tbody></table>
      </> : <p>Sanctions overrides need the Trust &amp; Safety permission.</p>}
    </section>}
    {tab === "reporting" && <section className="adb-panel" style={{ display: "grid", gap: 10 }}>
      <p className="adb-sub">UK platform reporting (Platform Operators Regulations 2023): venues and suppliers give tax details at payout set-up; missing details get a request and reminders on days {DUE_DILIGENCE.reminder1Day} and {DUE_DILIGENCE.reminder2Day}, then payouts are held from day {DUE_DILIGENCE.holdDay} (verify against the Regulations). Report due to HMRC by 31 January; send each seller a copy.</p>
      {canCommerce ? <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[year - 1, year].map(y => <span key={y}><a className="adb-btn" href={`/admin/compliance/platform-reporting?year=${y}&format=csv`}>{y} CSV</a> <a className="adb-btn" href={`/admin/compliance/platform-reporting?year=${y}&format=xml`}>{y} XML (draft)</a></span>)}
      </p> : <p>The export needs the Commerce permission.</p>}
      <p className="adb-sub">The file contains tax numbers and dates of birth: store it only in the restricted finance folder and delete working copies after filing. Each download is audited. The XML is not yet validated against HMRC’s schema (verify before filing).</p>
    </section>}
  </div>;
}
