import Link from "next/link";
import type { Metadata } from "next";
import { Restricted } from "@/components/workspace/kit";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { dateShort, time } from "@/lib/format";
import { Head, TabBar, Pill } from "../_b/kit";
import { PERM, REASONS } from "./perm";
import "@/styles/admin-b.css";
import "@/styles/admin-conversations.css";

export const metadata: Metadata = { title: "Break-glass access" };

type Report = { id: string; created_at: string; status: string; reason: string; case_type: string; case_reference: string; requires_approval: boolean; expires_at: string | null; closed_at: string | null;
  notify_affected: boolean | null; notify_withheld_reason: string | null; requester: string; approver: string | null; requested: number; affected_users: number; opens: number; minutes: number; flags: string[] };
const stamp = (iso: string | null) => iso ? `${dateShort(iso)} ${time(iso)}` : "—";
const FLAG: Record<string, string> = { frequent_requests: "5+ requests in 7 days", out_of_hours: "Out of hours", self_involved: "Requester is a participant", broad_access: "Opened 10+ conversations", notification_withheld: "Notification withheld" };
const TONE: Record<string, string> = { active: "open", pending: "pending", closed: "resolved", expired: "neutral", rejected: "closed", revoked: "closed" };

/** Break-glass hub (release-readiness §5): no browsing — grants, approvals and the compliance report. Requests start from a support/trust case. */
export default async function BreakGlassPage(props: PageProps<"/admin/conversations">) {
  const sp = await props.searchParams;
  const admin = await getAdmin();
  const can = admin.permissions.has(PERM), audit = admin.permissions.has("audit");
  if (!can && !audit) return <Restricted area="Break-glass conversation access" />;
  const tab = sp.tab === "approvals" || sp.tab === "report" ? sp.tab : "grants";
  const days = 30, now = requestTime(), from = new Date(now - days * 864e5).toISOString(), to = new Date(now).toISOString();
  const { data } = await untyped(admin.db as never).rpc("admin_break_glass_report", { p_from: from, p_to: to });
  const rows = (data ?? []) as Report[];
  const pending = rows.filter(r => r.status === "pending");
  const flagged = rows.filter(r => r.flags.length);
  const label = (k: string) => REASONS.find(r => r[0] === k)?.[1] ?? k;
  const href = (t: string) => `/admin/conversations${t === "grants" ? "" : `?tab=${t}`}`;
  const table = (list: Report[], empty: string) => <section className="adb-panel"><table className="adb-table">
    <thead><tr><th>Requested</th><th>Case</th><th>Reason</th><th>Requester</th><th>Approver</th><th className="r">Conversations</th><th className="r">Opened</th><th className="r">Minutes</th><th>Status</th><th>Flags</th></tr></thead>
    <tbody>{list.length ? list.map(r => <tr key={r.id}><td><Link href={`/admin/conversations/${r.id}`}><b>{stamp(r.created_at)}</b></Link></td><td>{r.case_type === "trust" ? "Trust" : "Support"} · {r.case_reference}</td>
      <td>{label(r.reason)}</td><td>{r.requester}</td><td>{r.approver ?? (r.requires_approval ? "Awaiting" : "Not required")}</td><td className="r">{r.requested}</td><td className="r">{r.opens}</td><td className="r">{r.minutes}</td>
      <td><Pill status={TONE[r.status] ?? "neutral"} label={r.status[0].toUpperCase() + r.status.slice(1)} /></td><td className="acv-flags">{r.flags.map(f => <span key={f}>{FLAG[f] ?? f}</span>)}</td></tr>)
      : <tr><td colSpan={10} className="adb-none">{empty}</td></tr>}</tbody></table></section>;

  return <div className="adb acv">
    <Head title="Break-glass access" subtitle="Controlled, read-only access to member conversations for safeguarding, fraud, abuse, disputes, legal requests and critical support. Start a request from a support or trust case." />
    <TabBar active={tab} tabs={[{ key: "grants", label: "Access grants", href: href("grants"), count: rows.filter(r => r.status === "active").length },
      { key: "approvals", label: "Awaiting approval", href: href("approvals"), count: pending.length }, { key: "report", label: "Compliance report", href: href("report"), count: flagged.length }]} />
    {tab === "grants" && table(rows, `No break-glass requests in the last ${days} days.`)}
    {tab === "approvals" && table(pending, "Nothing awaiting approval. You can’t approve your own requests.")}
    {tab === "report" && <>
      <section className="adb-panel acv-kpis"><div><b>{rows.length}</b><small>Requests ({days} days)</small></div><div><b>{rows.filter(r => r.requires_approval).length}</b><small>Needed approval</small></div>
        <div><b>{rows.reduce((n, r) => n + r.opens, 0)}</b><small>Conversations opened</small></div><div><b>{Math.round(rows.reduce((n, r) => n + Number(r.minutes), 0))}</b><small>Minutes of access</small></div>
        <div><b>{flagged.length}</b><small>Flagged for review</small></div><div><b>{rows.filter(r => r.notify_affected === false).length}</b><small>Notifications withheld</small></div></section>
      <p className="acv-hint">For DPO / administrator review. Flags: unusual frequency, out-of-hours requests, requesters involved in the conversation, broad access, and withheld notifications. See docs/compliance/dpia-break-glass-access.md.</p>
      {table(flagged, "No suspicious access patterns in this period.")}
    </>}
  </div>;
}
