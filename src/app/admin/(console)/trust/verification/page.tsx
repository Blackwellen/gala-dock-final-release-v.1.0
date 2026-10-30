import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2, ShieldCheck, Scale, Ban, Download } from "lucide-react";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { Head, Kpi, TabBar, Pill } from "../../_b/kit";
import { stamp, ago } from "../../_b/format";
import { reviewDocument, reviewCheck, decideEnforcementAppeal, liftEnforcement } from "../../_d/actions";
import "@/styles/admin-b.css";
import "@/styles/admin-b-trust.css";
import "@/styles/admin-d.css";

export const metadata: Metadata = { title: "Verification review" };

type Doc = { id: string; workspace_id: string; credential_key: string; file_name: string; issuing_organisation: string | null; reference: string | null; effective_from: string | null; expires_on: string | null;
  status: string; rejection_reason: string | null; reviewed_at: string | null; created_at: string; cover_amount_minor: number | null; cover_currency: string | null; renewal_of: string | null };
type Check = { id: string; workspace_id: string | null; user_id: string | null; subject_type: string; kind: string; status: string; legal_name: string | null; trading_name: string | null; company_number: string | null;
  source: string; reason: string | null; submitted_at: string | null; decided_at: string | null; expires_at: string | null };
type Enf = { id: string; reference: string; workspace_id: string | null; subject_type: string; action: string; reason_code: string; note: string; status: string; starts_at: string; ends_at: string | null;
  appeal_deadline: string | null; appeal_case_id: string | null; created_at: string };
type Appeal = { id: string; reference: string; subject_name: string; reason: string; status: string; created_at: string; related: { enforcement_action_id?: string; statement?: string } };
type Code = { code: string; label: string; applies_to: string[] | null };

const PENDING = ["submitted", "in_review"];
const CHECK_PENDING = ["submitted", "pending_review"];
const docTone: Record<string, string> = { submitted: "pending", in_review: "in_review", verified: "approved", rejected: "refunded", expired: "cancelled", superseded: "superseded" };

/** Q08 review queue (domains 116–122): provider evidence, identity / business checks, and enforcement appeals. Trust permission;
 *  every decision is an RPC with MFA + audit; documents open through the scanned, signed, audited download route only. */
export default async function VerificationReviewPage(props: PageProps<"/admin/trust/verification">) {
  const sp = await props.searchParams;
  const { db, allowed } = await requireAdminPermission("trust");
  if (!allowed) return <Restricted area="Trust & Safety" />;
  const tab = ["checks", "appeals", "decided"].includes(String(sp.tab)) ? String(sp.tab) : "documents";
  const now = requestTime();
  const [docs, checks, enf, appeals, codes, types] = await Promise.all([
    rows<Doc>(db.from("provider_documents").select("id,workspace_id,credential_key,file_name,issuing_organisation,reference,effective_from,expires_on,status,rejection_reason,reviewed_at,created_at,cover_amount_minor,cover_currency,renewal_of").order("created_at", { ascending: false }).limit(400)),
    rows<Check>(db.from("verification_checks").select("id,workspace_id,user_id,subject_type,kind,status,legal_name,trading_name,company_number,source,reason,submitted_at,decided_at,expires_at").order("updated_at", { ascending: false }).limit(400)),
    rows<Enf>(db.from("enforcement_actions").select("id,reference,workspace_id,subject_type,action,reason_code,note,status,starts_at,ends_at,appeal_deadline,appeal_case_id,created_at").order("created_at", { ascending: false }).limit(200)),
    rows<Appeal>(db.from("trust_cases").select("id,reference,subject_name,reason,status,created_at,related").eq("queue", "appeal").in("status", ["open", "in_review"]).order("created_at")),
    rows<Code>(db.from("moderation_reason_codes").select("code,label,applies_to").eq("active", true).order("label")),
    rows<{ key: string; label: string }>(db.from("credential_types").select("key,label")),
  ]);
  const wsIds = [...new Set([...docs.map(d => d.workspace_id), ...checks.map(c => c.workspace_id), ...enf.map(e => e.workspace_id)].filter(Boolean) as string[])];
  const names = new Map((wsIds.length ? await rows<{ id: string; name: string }>(db.from("workspaces").select("id,name").in("id", wsIds)) : []).map(w => [w.id, w.name]));
  const label = new Map(types.map(t => [t.key, t.label]));
  const pendingDocs = docs.filter(d => PENDING.includes(d.status)), pendingChecks = checks.filter(c => CHECK_PENDING.includes(c.status));
  const activeEnf = enf.filter(e => e.status === "active");
  const decided = [...docs.filter(d => !PENDING.includes(d.status)).map(d => ({ at: d.reviewed_at ?? d.created_at, what: `${label.get(d.credential_key) ?? d.credential_key} · ${d.file_name}`, who: names.get(d.workspace_id) ?? "Workspace", status: d.status })),
    ...checks.filter(c => !CHECK_PENDING.includes(c.status) && c.decided_at).map(c => ({ at: c.decided_at!, what: `${c.kind.replace("_", " ")} check`, who: (c.workspace_id && names.get(c.workspace_id)) || c.legal_name || "Subject", status: c.status }))]
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  const days = (iso: string | null) => iso ? Math.ceil((new Date(iso).getTime() - now) / 864e5) : null;
  const docCodes = codes.filter(c => !c.applies_to?.length || c.applies_to.some(a => /document|workspace|evidence/.test(a)));

  return <div className="adb ads add">
    <Head back={{ href: "/admin/trust", label: "Trust & Safety" }} title="Verification review" subtitle="Provider evidence, identity and business checks, and appeals against restrictions. Nothing here self-verifies: every decision is yours, recorded with a reason." />
    <section className="add-kpis">
      <Kpi icon={FileCheck2} tone="blue" label="Documents to review" value={pendingDocs.length} note={pendingDocs.length ? `Oldest ${ago(pendingDocs.at(-1)!.created_at, now)}` : "Queue clear"} />
      <Kpi icon={ShieldCheck} tone="purple" label="Checks to review" value={pendingChecks.length} note={`${checks.filter(c => c.status === "verified").length} verified`} />
      <Kpi icon={Scale} tone="green" label="Open appeals" value={appeals.length} note="14-day appeal window" />
      <Kpi icon={Ban} tone="red" label="Active restrictions" value={activeEnf.length} note={`${enf.length} recorded`} />
    </section>
    <TabBar active={tab} tabs={[
      { key: "documents", label: "Documents", href: "/admin/trust/verification", count: pendingDocs.length },
      { key: "checks", label: "Identity & business", href: "/admin/trust/verification?tab=checks", count: pendingChecks.length },
      { key: "appeals", label: "Restrictions & appeals", href: "/admin/trust/verification?tab=appeals", count: appeals.length + activeEnf.length },
      { key: "decided", label: "Recently decided", href: "/admin/trust/verification?tab=decided" }]} />

    {tab === "documents" && <section className="adb-panel">
      <div className="adb-sec-h"><h2>Evidence awaiting review</h2><small>Files open through the malware-scanned, signed and audited download route.</small></div>
      {pendingDocs.length ? <ul className="add-cards">{pendingDocs.map(d => { const left = days(d.expires_on);
        return <li key={d.id} className="add-card">
          <header><b>{label.get(d.credential_key) ?? d.credential_key}</b><Pill status={docTone[d.status] ?? d.status} label={d.status.replace("_", " ")} />{d.renewal_of && <Pill status="info_requested" label="Renewal" />}</header>
          <dl className="adb-kv">
            <div><dt>Workspace</dt><dd><Link href={`/admin/workspaces/${d.workspace_id}`}>{names.get(d.workspace_id) ?? "Workspace"}</Link></dd></div>
            <div><dt>File</dt><dd><a href={`/api/trust/documents/${d.id}`} target="_blank" rel="noreferrer"><Download aria-hidden="true" className="add-i" />{d.file_name}</a></dd></div>
            <div><dt>Issuer / ref</dt><dd>{[d.issuing_organisation, d.reference].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt>Valid</dt><dd>{d.effective_from ?? "—"} → {d.expires_on ?? "no expiry"}{left !== null && <small className={left < 0 ? "add-bad" : left < 30 ? "add-warn" : ""}> {left < 0 ? `expired ${-left}d ago` : `${left}d left`}</small>}</dd></div>
            <div><dt>Cover</dt><dd>{d.cover_amount_minor ? `${(d.cover_amount_minor / 100).toLocaleString("en-GB", { style: "currency", currency: d.cover_currency ?? "GBP", maximumFractionDigits: 0 })}` : "—"}</dd></div>
            <div><dt>Uploaded</dt><dd>{stamp(d.created_at)}</dd></div>
          </dl>
          <ActionForm action={reviewDocument.bind(null, d.id)} className="add-decide">
            <label>Decision<select className="adb-select" name="status" defaultValue="verified"><option value="verified">Verify</option><option value="rejected">Reject</option><option value="in_review">Mark in review</option></select></label>
            <label>Confirm expiry<input type="date" name="expires_on" defaultValue={d.expires_on ?? ""} /></label>
            <label>Cover (£)<input name="cover" inputMode="decimal" defaultValue={d.cover_amount_minor ? String(d.cover_amount_minor / 100) : ""} /></label>
            <label>Reason code<select className="adb-select" name="reason_code" defaultValue=""><option value="">—</option>{docCodes.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
            <label className="wide">Reason (sent to the provider when rejecting)<input name="reason" maxLength={500} placeholder="e.g. Policy number doesn’t match the certificate" /></label>
            <button className="adb-btn primary" type="submit">Record decision</button>
          </ActionForm>
        </li>; })}</ul> : <p className="adb-none">No evidence is waiting for review. New uploads appear here once they pass the malware scan.</p>}
    </section>}

    {tab === "checks" && <section className="adb-panel">
      <div className="adb-sec-h"><h2>Identity and business checks</h2><small>Stripe Connect checks update from Stripe and can’t be decided here.</small></div>
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Subject</th><th>Check</th><th>Details</th><th>Submitted</th><th>Status</th><th>Decide</th></tr></thead>
        <tbody>{checks.length ? checks.slice(0, 100).map(c => <tr key={c.id}>
          <td><b>{(c.workspace_id && names.get(c.workspace_id)) || c.legal_name || "User"}</b><small>{c.subject_type}</small></td>
          <td>{c.kind.replace("_", " ")}<small>{c.source}</small></td>
          <td>{[c.legal_name, c.trading_name, c.company_number && `Co. ${c.company_number}`].filter(Boolean).join(" · ") || "—"}{c.reason && <small>{c.reason}</small>}</td>
          <td>{c.submitted_at ? stamp(c.submitted_at) : "—"}</td>
          <td><Pill status={c.status === "verified" ? "approved" : CHECK_PENDING.includes(c.status) ? "pending" : c.status === "rejected" ? "refunded" : "in_review"} label={c.status.replace("_", " ")} /></td>
          <td>{c.kind !== "stripe_connect" && CHECK_PENDING.includes(c.status) ? <ActionForm action={reviewCheck.bind(null, c.id)} className="add-inline">
            <select className="adb-select" name="to" aria-label="Decision" defaultValue="verified"><option value="verified">Verify</option><option value="action_required">Needs action</option><option value="rejected">Reject</option></select>
            <input type="date" name="expires_at" aria-label="Expires" /><input name="reason" required minLength={5} aria-label="Reason" placeholder="Reason (audited)" />
            <button className="adb-btn" type="submit">Save</button></ActionForm> : <small>{c.kind === "stripe_connect" ? "Stripe-managed" : "Decided"}</small>}</td></tr>)
          : <tr><td colSpan={6} className="adb-none">No identity or business checks have been submitted yet.</td></tr>}</tbody></table>
    </section>}

    {tab === "appeals" && <>
      <section className="adb-panel"><div className="adb-sec-h"><h2>Open appeals</h2></div>
        {appeals.length ? <ul className="ads-trail">{appeals.map(a => { const act = enf.find(e => e.id === a.related?.enforcement_action_id);
          return <li key={a.id} className="add-row"><div><b>{a.reference} · {a.subject_name}</b><small>{act ? `${act.action.replaceAll("_", " ")} · ${act.reason_code.replaceAll("_", " ")} · since ${stamp(act.starts_at)}` : "Restriction"} · appealed {ago(a.created_at, now)}</small>
            {a.related?.statement && <p className="add-quote">“{a.related.statement}”</p>}</div>
            <span className="add-acts">
              <ActionButton action={decideEnforcementAppeal} args={[a.id, "overturned"]} reason variant="primary" confirm={{ title: "Overturn the restriction", body: "Reverses the restriction’s effect and tells the provider. Your reason is recorded.", cta: "Overturn" }}>Overturn</ActionButton>
              <ActionButton action={decideEnforcementAppeal} args={[a.id, "upheld"]} reason confirm={{ title: "Keep the restriction", body: "The restriction stays in place and the provider is told the outcome.", cta: "Keep restriction" }}>Keep</ActionButton>
            </span></li>; })}</ul> : <p className="adb-none">No appeals are waiting.</p>}
      </section>
      <section className="adb-panel"><div className="adb-sec-h"><h2>Active restrictions</h2></div>
        <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Ref</th><th>Subject</th><th>Action</th><th>Reason</th><th>Ends</th><th>Appeal by</th><th /></tr></thead>
          <tbody>{activeEnf.length ? activeEnf.map(e => <tr key={e.id}><td><b>{e.reference}</b></td><td>{(e.workspace_id && names.get(e.workspace_id)) || e.subject_type}</td><td>{e.action.replaceAll("_", " ")}</td>
            <td>{e.reason_code.replaceAll("_", " ")}<small>{e.note}</small></td><td>{e.ends_at ? stamp(e.ends_at) : "Until lifted"}</td><td>{e.appeal_deadline ? stamp(e.appeal_deadline) : "—"}</td>
            <td><ActionButton action={liftEnforcement} args={[e.id]} reason variant="outline" confirm={{ title: "Lift restriction", body: "Ends the restriction now and reverses its effect.", cta: "Lift" }}>Lift</ActionButton></td></tr>)
            : <tr><td colSpan={7} className="adb-none">No active restrictions.</td></tr>}</tbody></table>
      </section>
    </>}

    {tab === "decided" && <section className="adb-panel"><div className="adb-sec-h"><h2>Recently decided</h2></div>
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>When</th><th>Item</th><th>Subject</th><th>Outcome</th></tr></thead>
        <tbody>{decided.length ? decided.map((d, i) => <tr key={i}><td>{stamp(d.at)}</td><td>{d.what}</td><td>{d.who}</td><td><Pill status={docTone[d.status] ?? d.status} label={d.status.replace("_", " ")} /></td></tr>)
          : <tr><td colSpan={4} className="adb-none">Nothing decided yet.</td></tr>}</tbody></table></section>}
  </div>;
}
