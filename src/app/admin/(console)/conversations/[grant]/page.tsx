import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, ShieldAlert } from "lucide-react";
import { Restricted } from "@/components/workspace/kit";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { dateShort, time } from "@/lib/format";
import { Head, Pill } from "../../_b/kit";
import { PERM, REASONS } from "../perm";
import { DecideForm, Reader, CloseForm } from "../review";
import "@/styles/admin-b.css";
import "@/styles/admin-conversations.css";

export const metadata: Metadata = { title: "Break-glass grant" };
type Grant = { id: string; requester_id: string; approver_id: string | null; reason: string; justification: string; case_type: string; case_id: string; case_reference: string; conversation_ids: string[]; affected_user_ids: string[];
  status: string; requires_approval: boolean; decision_note: string | null; created_at: string; expires_at: string | null; closed_at: string | null; notify_affected: boolean | null; notify_withheld_reason: string | null };
const stamp = (iso: string | null) => iso ? `${dateShort(iso)} ${time(iso)}` : "—";

/** One grant: who/why/case, approval, the in-scope conversations (open → step-up → read-only transcript), access log and closure. */
export default async function GrantPage(props: PageProps<"/admin/conversations/[grant]">) {
  const { grant } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(grant)) notFound();
  const admin = await getAdmin();
  if (!admin.permissions.has(PERM) && !admin.permissions.has("audit")) return <Restricted area="Break-glass conversation access" />;
  const db = untyped(admin.db as never);
  await db.rpc("bg_expire").then(() => null, () => null);
  const { data: g } = await db.from("break_glass_grants").select("*").eq("id", grant).maybeSingle();
  if (!g) notFound();
  const G = g as Grant;
  const [{ data: convs }, { data: log }, { data: people }] = await Promise.all([
    db.rpc("admin_grant_conversations", { p_grant: G.id }),
    db.from("break_glass_access_log").select("id,conversation_id,admin_id,opened_at,closed_at,last_seen_at").eq("grant_id", G.id).order("opened_at", { ascending: false }),
    db.from("profiles").select("id,full_name").in("id", [G.requester_id, G.approver_id, ...G.affected_user_ids].filter(Boolean) as string[]),
  ]);
  const name = (id: string | null) => (people as { id: string; full_name: string }[] | null)?.find(p => p.id === id)?.full_name || "—";
  const mine = G.requester_id === admin.userId, active = G.status === "active" && !!G.expires_at && new Date(G.expires_at).getTime() > requestTime();
  const C = (convs ?? []) as { id: string; subject: string; kind: string; last_message_at: string }[];
  const L = (log ?? []) as { id: string; conversation_id: string; opened_at: string; closed_at: string | null; last_seen_at: string }[];
  return <div className="adb acv">
    <Link className="adb-back" href="/admin/conversations"><ArrowLeft aria-hidden="true" />Break-glass access</Link>
    <Head title={`${REASONS.find(r => r[0] === G.reason)?.[1] ?? G.reason} · ${G.case_type === "trust" ? "Trust" : "Support"} case ${G.case_reference}`}
      subtitle={`Requested by ${name(G.requester_id)} on ${stamp(G.created_at)}${G.approver_id ? ` · ${G.status === "rejected" ? "rejected" : "approved"} by ${name(G.approver_id)}` : ""}`}
      badges={<Pill status={G.status === "active" ? "open" : G.status === "pending" ? "pending" : "neutral"} label={G.status[0].toUpperCase() + G.status.slice(1)} />} />
    <div className="acv-grant">
      <section className="adb-panel acv-facts">
        <dl><div><dt>Justification</dt><dd>{G.justification}</dd></div>
          <div><dt>Case</dt><dd><Link href={G.case_type === "trust" ? `/admin/trust?case=${G.case_id}` : `/admin/support/${G.case_id}`}>{G.case_reference}</Link></dd></div>
          <div><dt>Affected users</dt><dd>{G.affected_user_ids.map(name).join(", ") || "—"}</dd></div>
          <div><dt>Window</dt><dd>{G.expires_at ? <><Clock aria-hidden="true" />until {stamp(G.expires_at)}</> : G.requires_approval ? "Starts when approved" : "—"}</dd></div>
          {G.decision_note && <div><dt>Decision note</dt><dd>{G.decision_note}</dd></div>}
          {G.closed_at && <div><dt>Closed</dt><dd>{stamp(G.closed_at)} · {G.notify_affected ? "affected users notified" : `notification withheld: ${G.notify_withheld_reason}`}</dd></div>}</dl>
        {G.status === "pending" && (mine ? <p className="acv-note"><ShieldAlert aria-hidden="true" />Waiting for another administrator to approve.</p> : admin.permissions.has(PERM) && <DecideForm grant={G.id} />)}
        {mine && ["active", "expired", "pending"].includes(G.status) && <CloseForm grant={G.id} />}
      </section>
      <section className="adb-panel acv-convs"><h2>Conversations in scope</h2>
        {!active && <p className="acv-hint">{G.status === "pending" ? "Reading is available once approved." : "This grant is no longer active — conversations can’t be opened."}</p>}
        <ul>{C.map(c => <li key={c.id}><div><b>{c.subject || "Untitled conversation"}</b><small>{c.kind} · last message {stamp(c.last_message_at)} · opened {L.filter(l => l.conversation_id === c.id).length}×</small></div>
          {active && mine && <Reader grant={G.id} conversation={c.id} subject={c.subject} />}</li>)}</ul>
        <h2>Access log</h2>
        <table className="adb-table"><thead><tr><th>Conversation</th><th>Opened</th><th>Closed</th><th className="r">Minutes</th></tr></thead>
          <tbody>{L.length ? L.map(l => <tr key={l.id}><td>{C.find(c => c.id === l.conversation_id)?.subject || "Conversation"}</td><td>{stamp(l.opened_at)}</td><td>{l.closed_at ? stamp(l.closed_at) : "Open"}</td>
            <td className="r">{Math.max(0, Math.round((new Date(l.closed_at ?? l.last_seen_at).getTime() - new Date(l.opened_at).getTime()) / 6e4))}</td></tr>) : <tr><td colSpan={4} className="adb-none">Nothing opened yet.</td></tr>}</tbody></table>
      </section>
    </div>
  </div>;
}
