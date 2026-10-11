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
    <TabBar active={tab} tabs={[{ key: "open", label: "Open", href: "/admin/support/privacy", count: open.length }, { key: "closed", label: "Closed", href: "/admin/support/privacy?tab=closed", count: closed.length }]} />
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
