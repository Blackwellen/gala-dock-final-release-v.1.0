import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Restricted } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { dateShort } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";
import { Head, TabBar, Pill } from "../../_b/kit";
import { updatePrivacyRequest } from "./actions";
import { ActionButton } from "@/components/workspace/actions";
import { placeLegalHold, releaseLegalHold, retentionPreview, purgeDryRun } from "../../_d/actions";
import { stamp } from "../../_b/format";
import "@/styles/admin-d.css";
import "@/styles/admin-b.css";
import "@/styles/admin-conversations.css";

export const metadata: Metadata = { title: "Privacy requests" };

type Req = { id: string; reference: string; kind: string; status: string; requester_email: string; detail: string; received_at: string; due_at: string; extended_reason: string | null; refusal_reason: string | null; outcome: string | null; completed_at: string | null };
const OPEN = ["received", "verifying", "in_progress", "extended"];
const KIND: Record<string, string> = { access: "Access (copy of data)", portability: "Portability", erasure: "Erasure", rectification: "Rectification", restriction: "Restriction", objection: "Objection" };
const TONE: Record<string, string> = { received: "pending", verifying: "pending", in_progress: "open", extended: "pending", completed: "resolved", refused: "closed", withdrawn: "neutral" };

/** Data subject requests (UK GDPR Arts. 15–21; §89): one month to respond, one extension of up to two further months with a reason. */
export default async function PrivacyRequestsPage(props: PageProps<"/admin/support/privacy">) {
  const sp = await props.searchParams;
  const admin = await getAdmin();
  const privacy = admin.permissions.has("privacy") || admin.permissions.has("audit"), fixtures = admin.permissions.has("workspaces") || admin.permissions.has("audit");
  if (!admin.permissions.has("support") && !privacy && !fixtures) return <Restricted area="Privacy requests" />;
  const ops = ["holds", "retention", "fixtures"].includes(String(sp.tab)) ? String(sp.tab) as "holds" | "retention" | "fixtures" : null;
  if (ops) return <PrivacyOps tab={ops} privacy={privacy} canFixtures={fixtures} />;
  if (!admin.permissions.has("support") && !admin.permissions.has("audit")) return <Restricted area="Privacy requests" />;
  const tab = sp.tab === "closed" ? "closed" : "open";
  const { data } = await untyped(admin.db as never).from("privacy_requests").select("id,reference,kind,status,requester_email,detail,received_at,due_at,extended_reason,refusal_reason,outcome,completed_at").order("due_at").limit(300);
  const all = (data ?? []) as Req[], now = requestTime();
  const open = all.filter(r => OPEN.includes(r.status)), closed = all.filter(r => !OPEN.includes(r.status)).sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  const days = (iso: string) => Math.ceil((new Date(iso).getTime() - now) / 864e5);
  const rows = tab === "open" ? open : closed, canEdit = admin.permissions.has("support");
  const sel = typeof sp.id === "string" ? all.find(r => r.id === sp.id) ?? null : null;
  return <div className="adb acv">
    <Link className="adb-back" href="/admin/support"><ArrowLeft aria-hidden="true" />Support</Link>
    <Head title="Privacy requests" subtitle="Requests to access, export, correct, erase, restrict or object to the use of personal data. Respond within one month; one extension of up to two months is allowed with a reason." />
    <PrivacyTabs active={tab} open={open.length} closed={closed.length} />
    <div className={`acv-split ${sel ? "has-detail" : ""}`}>
      <section className="adb-panel"><table className="adb-table">
        <thead><tr><th>Reference</th><th>Request</th><th>Requester</th><th>Received</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>{rows.length ? rows.map(r => { const d = days(r.due_at), soon = OPEN.includes(r.status) && d <= 7;
          return <tr key={r.id} className={sel?.id === r.id ? "sel" : ""}><td><Link href={`/admin/support/privacy?${tab === "closed" ? "tab=closed&" : ""}id=${r.id}`}><b>{r.reference}</b></Link></td><td>{KIND[r.kind] ?? r.kind}</td><td>{r.requester_email}</td>
            <td>{dateShort(r.received_at)}</td><td className={soon ? "acv-due" : ""}>{dateShort(r.due_at)}{OPEN.includes(r.status) && <small>{d < 0 ? `${-d} days overdue` : d === 0 ? "Due today" : `${d} days left`}</small>}</td>
            <td><Pill status={TONE[r.status] ?? "neutral"} label={r.status.replace("_", " ")} /></td></tr>; })
          : <tr><td colSpan={6} className="adb-none">{tab === "open" ? "No open privacy requests." : "No closed requests yet."}</td></tr>}</tbody></table></section>
      {sel && <section className="adb-panel acv-facts">
        <h2>{sel.reference} · {KIND[sel.kind] ?? sel.kind}</h2>
        <dl><div><dt>Requester</dt><dd>{sel.requester_email}</dd></div><div><dt>Received</dt><dd>{dateShort(sel.received_at)}</dd></div><div><dt>Due</dt><dd>{dateShort(sel.due_at)}</dd></div>
          {sel.detail && <div><dt>Details</dt><dd>{sel.detail}</dd></div>}
          {sel.extended_reason && <div><dt>Extension reason</dt><dd>{sel.extended_reason}</dd></div>}
          {sel.refusal_reason && <div><dt>Refusal reason</dt><dd>{sel.refusal_reason}</dd></div>}
          {sel.outcome && <div><dt>Outcome</dt><dd>{sel.outcome}</dd></div>}</dl>
        {canEdit && OPEN.includes(sel.status) && <ActionForm action={updatePrivacyRequest.bind(null, sel.id)} className="acv-close" resetOnSuccess>
          <h3>Update status</h3>
          <label>Status<select className="adb-select" name="status" defaultValue={sel.status === "received" ? "verifying" : "in_progress"}>
            <option value="verifying">Verifying identity</option><option value="in_progress">In progress</option>
            {!sel.extended_reason && <option value="extended">Extend by up to 2 months (reason required)</option>}
            <option value="completed">Completed</option><option value="refused">Refused (reason required)</option><option value="withdrawn">Withdrawn by requester</option></select></label>
          <label>Note to requester <small>(required for extensions and refusals; for completion, describe what was provided)</small><input name="note" maxLength={1000} /></label>
          <button type="submit" className="adb-btn primary">Save and notify</button>
        </ActionForm>}
      </section>}
    </div>
  </div>;
}

function PrivacyTabs({ active, open, closed }: { active: string; open?: number; closed?: number }) {
  return <TabBar active={active} tabs={[{ key: "open", label: "Open requests", href: "/admin/support/privacy", count: open ?? null }, { key: "closed", label: "Closed", href: "/admin/support/privacy?tab=closed", count: closed ?? null },
    { key: "holds", label: "Legal holds", href: "/admin/support/privacy?tab=holds" }, { key: "retention", label: "Retention", href: "/admin/support/privacy?tab=retention" },
    { key: "fixtures", label: "Test fixtures", href: "/admin/support/privacy?tab=fixtures" }]} />;
}

type Hold = { id: string; reference: string; matter: string; reason: string; status: string; created_at: string; released_at: string | null; release_reason: string | null };
type Rule = { key: string; table_name: string; action: string; retention_days: number; basis: string; enabled: boolean; legal_review_required: boolean; version: number };
type Run = { id: string; started_at: string; preview: boolean; results: Record<string, { rows?: number; enabled?: boolean }> | null; error: string | null };
type Purge = { id: string; reason: string; workspace_ids: string[]; dry_run: boolean; users_to_remove: string[] | null; created_at: string };

/** Q32 legal holds, retention schedule + preview, and the test-fixture purge DRY RUN (the console never executes a purge). */
async function PrivacyOps({ tab, privacy, canFixtures }: { tab: "holds" | "retention" | "fixtures"; privacy: boolean; canFixtures: boolean }) {
  const admin = await getAdmin();
  const db = untyped(admin.db as never);
  const head = <><Link className="adb-back" href="/admin/support"><ArrowLeft aria-hidden="true" />Support</Link>
    <Head title="Privacy requests" subtitle="Data subject requests, legal holds, the retention schedule and test-data clean-up. Retention periods are drafts pending legal review." />
    <PrivacyTabs active={tab} /></>;
  if (tab !== "fixtures" && !privacy) return <div className="adb acv add">{head}<Restricted area="Legal holds and retention" /></div>;
  if (tab === "fixtures" && !canFixtures) return <div className="adb acv add">{head}<Restricted area="Test fixtures" /></div>;
  if (tab === "holds") {
    const [{ data: h }, { data: subj }] = await Promise.all([db.from("legal_holds").select("id,reference,matter,reason,status,created_at,released_at,release_reason").order("created_at", { ascending: false }).limit(100),
      db.from("legal_hold_subjects").select("hold_id,subject_type,subject_id")]);
    const holds = (h ?? []) as Hold[], subjects = (subj ?? []) as { hold_id: string; subject_type: string; subject_id: string }[];
    return <div className="adb acv add">{head}
      <div className="add-split">
        <section className="adb-panel"><div className="adb-sec-h"><h2>Legal holds</h2><small>Active holds block erasure, retention purges and fixture purges for their subjects, and pin their files.</small></div>
          <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Reference</th><th>Matter</th><th>Subjects</th><th>Placed</th><th>Status</th><th /></tr></thead>
            <tbody>{holds.length ? holds.map(x => <tr key={x.id}><td><b>{x.reference}</b></td><td>{x.matter}<small>{x.reason}</small></td>
              <td>{subjects.filter(s => s.hold_id === x.id).map(s => <small key={s.subject_id} className="add-mono">{s.subject_type}:{s.subject_id.slice(0, 8)}</small>)}</td>
              <td>{stamp(x.created_at)}</td><td><Pill status={x.status === "active" ? "hold" : "resolved"} label={x.status} />{x.released_at && <small>{stamp(x.released_at)} · {x.release_reason}</small>}</td>
              <td>{x.status === "active" && <ActionButton action={releaseLegalHold} args={[x.id]} reason confirm={{ title: "Release legal hold", body: "Erasure and retention resume for these subjects. Files it pinned are unpinned.", cta: "Release" }}>Release</ActionButton>}</td></tr>)
              : <tr><td colSpan={6} className="adb-none">No legal holds.</td></tr>}</tbody></table></section>
        <section className="adb-panel"><div className="adb-sec-h"><h2>Place a hold</h2></div>
          <ActionForm action={placeLegalHold} className="add-stack" resetOnSuccess>
            <label>Matter<input name="matter" required minLength={3} maxLength={200} placeholder="e.g. Chargeback dispute DP-2231" /></label>
            <label>Subjects <small>(user:&lt;id&gt;, workspace:&lt;id&gt; or event:&lt;id&gt;, separated by spaces)</small><textarea name="subjects" required rows={3} /></label>
            <label>Reason (audited)<textarea name="reason" required minLength={5} rows={3} /></label>
            <button className="adb-btn primary" type="submit">Place legal hold</button>
          </ActionForm></section>
      </div></div>;
  }
  if (tab === "retention") {
    const [{ data: r }, { data: runs }] = await Promise.all([db.from("data_retention_rules").select("key,table_name,action,retention_days,basis,enabled,legal_review_required,version").order("key"),
      db.from("retention_runs").select("id,started_at,preview,results,error").order("started_at", { ascending: false }).limit(10)]);
    const rules = (r ?? []) as Rule[], list = (runs ?? []) as Run[], lastPreview = list.find(x => x.preview), lastRun = list.find(x => !x.preview);
    return <div className="adb acv add">{head}
      <section className="adb-panel"><div className="adb-sec-h"><h2>Retention schedule</h2>
        <ActionButton action={retentionPreview} variant="primary" confirm={{ title: "Preview retention", body: "Counts what each rule would remove right now and records the preview. Nothing is deleted.", cta: "Run preview" }}>Preview what would be removed</ActionButton></div>
        <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Rule</th><th>Data</th><th>Action</th><th className="r">Keep (days)</th><th>Basis</th><th>Status</th><th className="r">Last preview</th><th className="r">Last run</th></tr></thead>
          <tbody>{rules.map(x => <tr key={x.key}><td><b>{x.key}</b><small>v{x.version}</small></td><td>{x.table_name}</td><td>{x.action}</td><td className="r">{x.retention_days}</td><td><small>{x.basis}</small></td>
            <td><Pill status={x.enabled ? "active" : "paused"} label={x.enabled ? "Enabled" : x.legal_review_required ? "Awaiting legal review" : "Disabled"} /></td>
            <td className="r">{lastPreview?.results?.[x.key]?.rows ?? "—"}</td><td className="r">{lastRun?.results?.[x.key]?.rows ?? "—"}</td></tr>)}</tbody></table>
        <p className="add-note">Last preview {lastPreview ? stamp(lastPreview.started_at) : "never"} · last scheduled run {lastRun ? stamp(lastRun.started_at) : "never"}. The daily sweep (04:05) skips anything under a legal hold. Finance, audit, consent and privacy-request records are retained.</p>
      </section></div>;
  }
  const [{ data: ws }, { data: purges }] = await Promise.all([db.from("workspaces").select("id,name,kind,created_at").eq("is_test_fixture", true).order("created_at", { ascending: false }).limit(200),
    db.from("fixture_purges").select("id,reason,workspace_ids,dry_run,users_to_remove,created_at").order("created_at", { ascending: false }).limit(15)]);
  const list = (ws ?? []) as { id: string; name: string; kind: string; created_at: string }[], log = (purges ?? []) as Purge[];
  return <div className="adb acv add">{head}
    <div className="add-split">
      <section className="adb-panel"><div className="adb-sec-h"><h2>Flagged test workspaces</h2><small>{list.length} flagged by the test helpers</small></div>
        <p className="add-warnbox">This console only runs a <b>dry run</b>: it lists what a purge would delete and records the dry run for review. The real purge is a reviewed script run by the coordinator. Workspaces under legal hold, with ledger postings, live Stripe objects or real members are refused.</p>
        <ActionForm action={purgeDryRun} className="add-stack">
          <ul className="add-checks">{list.length ? list.map(w => <li key={w.id}><label><input type="checkbox" name="ws" value={w.id} className="adb-check" />{w.name}<small>· {w.kind} · {stamp(w.created_at)}</small></label></li>)
            : <li className="adb-none">No flagged test workspaces.</li>}</ul>
          <label>Reason (audited)<input name="reason" required minLength={5} placeholder="e.g. Clean up Q16 fixtures after the regression run" /></label>
          <button className="adb-btn primary" type="submit" disabled={!list.length}>Dry run — nothing is deleted</button>
        </ActionForm></section>
      <section className="adb-panel"><div className="adb-sec-h"><h2>Purge log</h2><small>Append-only</small></div>
        <ul className="ads-trail">{log.length ? log.map(p => <li key={p.id}><b>{p.dry_run ? "Dry run" : "Purge executed"} · {p.workspace_ids.length} workspace{p.workspace_ids.length === 1 ? "" : "s"}</b><small>{stamp(p.created_at)} · {p.reason}{p.users_to_remove?.length ? ` · ${p.users_to_remove.length} test sign-ins` : ""}</small></li>)
          : <li><small>No purges recorded.</small></li>}</ul></section>
    </div></div>;
}
