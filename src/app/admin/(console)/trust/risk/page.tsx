import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Radar, Hand, Scale, Ticket } from "lucide-react";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { getAdmin } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { Head, Kpi, TabBar, Pill } from "../../_b/kit";
import { ParamSelect } from "../../_b/ui";
import { stamp, ago } from "../../_b/format";
import { decideSignal, placeHold, releaseHold, decideRiskAppeal, reviewTicketFlag } from "../../_d/actions";
import "@/styles/admin-b.css";
import "@/styles/admin-b-trust.css";
import "@/styles/admin-d.css";

export const metadata: Metadata = { title: "Risk review" };

type Signal = { id: string; domain: string; kind: string; rule_key: string | null; rule_version: number | null; subject_type: string; subject_id: string; user_id: string | null; workspace_id: string | null; event_id: string | null;
  severity: string; score: number | null; source: string; evidence: Record<string, unknown>; occurrences: number; last_seen_at: string; status: string; case_id: string | null; review_note: string | null; created_at: string };
type Hold = { id: string; kind: string; subject_type: string; subject_id: string; reason_code: string; reason_label: string; signal_id: string | null; source: string; status: string; placed_at: string; expires_at: string | null;
  appeal_case_id: string | null; released_at: string | null; release_reason: string | null };
type Flag = { id: string; event_id: string; user_id: string | null; order_ref: string | null; kind: string; severity: string; detail: Record<string, unknown>; status: string; created_at: string; expires_at: string | null; review_note: string | null };
type Appeal = { id: string; reference: string; subject_name: string; reason: string; status: string; created_at: string; related: Record<string, unknown> };
const SEV: Record<string, string> = { info: "low", review: "medium", hold: "high", critical: "urgent" };
const evidenceText = (e: Record<string, unknown>) => Object.entries(e ?? {}).slice(0, 6).map(([k, v]) => `${k.replaceAll("_", " ")}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60)}`).join(" · ");

/** Q33 risk queue + Q22 ticket risk review (domains 211–212). Detectors only raise signals; every consequence here is a human
 *  decision with a reason. Holds are reversible, visible to the subject, and appealable once. Evidence is admin-only. */
export default async function RiskReviewPage(props: PageProps<"/admin/trust/risk">) {
  const sp = await props.searchParams;
  const admin = await getAdmin();
  const trust = admin.permissions.has("trust"), tickets = admin.permissions.has("tickets");
  if (!trust && !tickets) return <Restricted area="Risk review" />;
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const tab = trust ? (["holds", "appeals", "tickets"].includes(s("tab")) ? s("tab") : "signals") : "tickets";
  const now = requestTime(), db = admin.db;
  const [signals, holds, flags, appeals] = await Promise.all([
    trust ? rows<Signal>(db.from("risk_signals").select("id,domain,kind,rule_key,rule_version,subject_type,subject_id,user_id,workspace_id,event_id,severity,score,source,evidence,occurrences,last_seen_at,status,case_id,review_note,created_at").order("last_seen_at", { ascending: false }).limit(500)) : Promise.resolve([] as Signal[]),
    trust ? rows<Hold>(db.from("risk_holds").select("id,kind,subject_type,subject_id,reason_code,reason_label,signal_id,source,status,placed_at,expires_at,appeal_case_id,released_at,release_reason").order("placed_at", { ascending: false }).limit(300)) : Promise.resolve([] as Hold[]),
    rows<Flag>(db.from("ticket_risk_flags").select("id,event_id,user_id,order_ref,kind,severity,detail,status,created_at,expires_at,review_note").order("created_at", { ascending: false }).limit(300)),
    trust ? rows<Appeal>(db.from("trust_cases").select("id,reference,subject_name,reason,status,created_at,related").eq("queue", "appeal").in("status", ["open", "in_review"])) : Promise.resolve([] as Appeal[]),
  ]);
  const holdAppeals = appeals.filter(a => holds.some(h => h.appeal_case_id === a.id));
  const evIds = [...new Set(flags.map(f => f.event_id))];
  const evNames = new Map((evIds.length ? await rows<{ id: string; name: string }>(db.from("events").select("id,name").in("id", evIds)) : []).map(e => [e.id, e.name]));
  const domain = s("domain"), status = s("status") || "open";
  const shown = signals.filter(x => (!domain || x.domain === domain) && (status === "all" || x.status === status));
  const open = signals.filter(x => x.status === "open"), active = holds.filter(h => h.status === "active"), openFlags = flags.filter(f => f.status === "open");
  const domains = [...new Set(signals.map(x => x.domain))].sort();

  return <div className="adb ads add">
    <Head back={{ href: "/admin/trust", label: "Trust & Safety" }} title="Risk review" subtitle="Fraud and abuse signals, reversible holds and appeals. Detectors never ban, delete or move money — you decide, with a reason that is audited." />
    <section className="add-kpis">
      <Kpi icon={Radar} tone="red" label="Open signals" value={open.length} note={`${open.filter(x => x.severity === "hold" || x.severity === "critical").length} high severity`} />
      <Kpi icon={Hand} tone="amber" label="Active holds" value={active.length} note={`${active.filter(h => h.kind === "payout").length} payout · ${active.filter(h => h.kind === "step_up").length} step-up`} />
      <Kpi icon={Scale} tone="green" label="Hold appeals" value={holdAppeals.length} note="Once per hold" />
      <Kpi icon={Ticket} tone="purple" label="Ticket flags open" value={openFlags.length} note={`${flags.length} in the last 300`} />
    </section>
    <TabBar active={tab} tabs={[...(trust ? [{ key: "signals", label: "Signals", href: "/admin/trust/risk", count: open.length }, { key: "holds", label: "Holds", href: "/admin/trust/risk?tab=holds", count: active.length },
      { key: "appeals", label: "Appeals", href: "/admin/trust/risk?tab=appeals", count: holdAppeals.length }] : []), { key: "tickets", label: "Ticket risk", href: "/admin/trust/risk?tab=tickets", count: openFlags.length }]} />

    {tab === "signals" && <section className="adb-panel">
      <div className="adb-sec-h"><h2>Signals</h2><span className="add-acts">
        <Suspense><ParamSelect param="domain" label="Domain" value={domain} options={[{ value: "", label: "All domains" }, ...domains.map(d => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) }))]} /></Suspense>
        <Suspense><ParamSelect param="status" label="Status" value={status} options={[{ value: "open", label: "Open" }, { value: "actioned", label: "Actioned" }, { value: "cleared", label: "Cleared" }, { value: "expired", label: "Expired" }, { value: "all", label: "All" }]} /></Suspense></span></div>
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Signal</th><th>Subject</th><th>Evidence</th><th>Seen</th><th>Severity</th><th>Decide</th></tr></thead>
        <tbody>{shown.length ? shown.slice(0, 100).map(x => <tr key={x.id}>
          <td><b>{x.domain} · {x.kind.replaceAll("_", " ")}</b><small>{x.rule_key ? `${x.rule_key} v${x.rule_version}` : x.source}</small></td>
          <td>{x.subject_type}<small className="add-mono">{x.subject_id.slice(0, 13)}</small>{x.workspace_id && <small><Link href={`/admin/workspaces/${x.workspace_id}`}>Workspace</Link></small>}</td>
          <td><small>{evidenceText(x.evidence) || "—"}</small></td>
          <td>{ago(x.last_seen_at, now)}{x.occurrences > 1 && <small>×{x.occurrences}</small>}</td>
          <td><Pill status={SEV[x.severity] ?? "medium"} label={x.severity} /></td>
          <td>{x.status === "open" ? <span className="add-acts">
            <ActionButton action={decideSignal} args={[x.id, "clear"]} reason confirm={{ title: "Clear signal", body: "No concern. Any hold this signal caused is released.", cta: "Clear" }}>Clear</ActionButton>
            <ActionButton action={decideSignal} args={[x.id, "action"]} reason variant="danger" confirm={{ title: "Action signal", body: "Marks the concern as confirmed. Consequences (holds, restrictions) are separate, reversible steps.", cta: "Action" }}>Action</ActionButton>
            <ActionButton action={decideSignal} args={[x.id, "escalate"]} reason variant="soft" confirm={{ title: "Escalate to a fraud case", body: "Opens a Trust & Safety fraud case with this signal attached.", cta: "Escalate" }}>Escalate</ActionButton>
          </span> : <Pill status={x.status === "cleared" ? "dismissed" : x.status} label={x.status} />}</td></tr>)
          : <tr><td colSpan={6} className="adb-none">No signals match these filters.</td></tr>}</tbody></table>
    </section>}

    {tab === "holds" && <div className="add-split">
      <section className="adb-panel"><div className="adb-sec-h"><h2>Holds</h2></div>
        <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Hold</th><th>Subject</th><th>Reason</th><th>Placed</th><th>Status</th><th /></tr></thead>
          <tbody>{holds.length ? holds.slice(0, 100).map(h => <tr key={h.id}><td><b>{h.kind === "payout" ? "Payout hold" : "Step-up hold"}</b><small>{h.source}</small></td>
            <td>{h.subject_type}<small className="add-mono">{h.subject_id.slice(0, 13)}</small></td><td>{h.reason_label}<small>{h.reason_code}</small></td>
            <td>{stamp(h.placed_at)}{h.expires_at && <small>until {stamp(h.expires_at)}</small>}</td>
            <td><Pill status={h.status === "active" ? "hold" : "resolved"} label={h.status} />{h.appeal_case_id && <small>Appealed</small>}</td>
            <td>{h.status === "active" && <ActionButton action={releaseHold} args={[h.id]} reason confirm={{ title: "Release hold", body: "Lifts the hold now and notifies the subject.", cta: "Release" }}>Release</ActionButton>}</td></tr>)
            : <tr><td colSpan={6} className="adb-none">No holds have been placed.</td></tr>}</tbody></table></section>
      <section className="adb-panel"><div className="adb-sec-h"><h2>Place a hold</h2></div>
        <p className="add-note">A hold never moves money. Payout holds pause promoter/partner payouts and resale seller refunds; step-up holds require two-step verification. The subject sees the plain reason and can appeal once.</p>
        <ActionForm action={placeHold} className="add-stack" resetOnSuccess>
          <label>Kind<select name="kind" defaultValue="payout"><option value="payout">Payout hold</option><option value="step_up">Step-up hold</option></select></label>
          <label>Subject type<select name="subject_type" defaultValue="user"><option value="user">User</option><option value="workspace">Workspace</option></select></label>
          <label>Subject ID<input name="subject_id" required pattern="[0-9a-fA-F-]{36}" placeholder="UUID" /></label>
          <label>Linked signal (optional)<input name="signal_id" placeholder="Signal UUID" /></label>
          <label>Expires after (days, optional)<input name="days" type="number" min={1} max={90} /></label>
          <label>Reason shown to the subject (audited)<textarea name="reason" required minLength={5} rows={3} /></label>
          <button className="adb-btn primary" type="submit">Place hold</button>
        </ActionForm></section>
    </div>}

    {tab === "appeals" && <section className="adb-panel"><div className="adb-sec-h"><h2>Hold appeals</h2></div>
      {holdAppeals.length ? <ul className="ads-trail">{holdAppeals.map(a => { const h = holds.find(x => x.appeal_case_id === a.id)!;
        return <li key={a.id} className="add-row"><div><b>{a.reference} · {a.subject_name}</b><small>{h.kind === "payout" ? "Payout hold" : "Step-up hold"} · {h.reason_label} · appealed {ago(a.created_at, now)}</small>
          {typeof a.related?.statement === "string" && <p className="add-quote">“{a.related.statement}”</p>}</div>
          <span className="add-acts">
            <ActionButton action={decideRiskAppeal} args={[a.id, "overturned"]} reason variant="primary" confirm={{ title: "Grant appeal", body: "Releases the hold and clears the signal behind it.", cta: "Grant" }}>Grant</ActionButton>
            <ActionButton action={decideRiskAppeal} args={[a.id, "upheld"]} reason confirm={{ title: "Keep hold", body: "The hold stays; the subject is told the outcome.", cta: "Keep hold" }}>Keep hold</ActionButton>
          </span></li>; })}</ul> : <p className="adb-none">No hold appeals are waiting.</p>}
    </section>}

    {tab === "tickets" && <section className="adb-panel"><div className="adb-sec-h"><h2>Ticket risk flags</h2><small>Purchase limits, order velocity and shared-client signals from checkout and resale.</small></div>
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Flag</th><th>Event</th><th>Order</th><th>Detail</th><th>Raised</th><th>Severity</th><th>Review</th></tr></thead>
        <tbody>{flags.length ? flags.slice(0, 100).map(f => <tr key={f.id}><td><b>{f.kind.replaceAll("_", " ")}</b></td><td>{evNames.get(f.event_id) ?? "Event"}</td><td>{f.order_ref ?? "—"}</td>
          <td><small>{evidenceText(f.detail) || "—"}</small></td><td>{ago(f.created_at, now)}</td><td><Pill status={SEV[f.severity] ?? f.severity} label={f.severity} /></td>
          <td>{f.status === "open" ? <span className="add-acts">
            <ActionButton action={reviewTicketFlag} args={[f.id, "cleared"]} reason confirm={{ title: "Clear flag", body: "No concern; the buyer’s limits return to normal.", cta: "Clear" }}>Clear</ActionButton>
            <ActionButton action={reviewTicketFlag} args={[f.id, "actioned"]} reason variant="danger" confirm={{ title: "Action flag", body: "Confirms the concern. Cancelling or refunding orders is a separate, explicit step.", cta: "Action" }}>Action</ActionButton>
          </span> : <><Pill status={f.status === "cleared" ? "dismissed" : f.status} label={f.status} />{f.review_note && <small>{f.review_note}</small>}</>}</td></tr>)
          : <tr><td colSpan={7} className="adb-none">No ticket risk flags.</td></tr>}</tbody></table></section>}
  </div>;
}
