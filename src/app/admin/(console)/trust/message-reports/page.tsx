import type { Metadata } from "next";
import Link from "next/link";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { getAdmin } from "@/lib/admin/context";
import { requestTime } from "@/lib/workspace/format";
import { REPORT_REASONS } from "@/lib/messaging/safety";
import { Head, TabBar, Pill, Pager } from "../../_b/kit";
import { stamp, ago } from "../../_b/format";
import { decideMessageReport } from "./actions";
import "@/styles/admin-b.css";
import "@/styles/admin-d.css";

export const metadata: Metadata = { title: "Message reports" };

type Row = { id: string; source: string; reported_name: string; reason_code: string; note: string; excerpt: string; message_at: string | null; status: string;
  case_id: string | null; decided_at: string | null; decision_note: string; message_removed: boolean; created_at: string };
const PER = 25;
const REASON = Object.fromEntries(REPORT_REASONS) as Record<string, string>;

/** Q52 (Online Safety Act): messages people reported from their inbox. Each report snapshots the message text, so Trust can decide
 *  without opening the conversation; reports on one sender collect in a single Fraud / Abuse case. Deciding tells the reporter the
 *  outcome; "Remove message" hides it from both sides (the snapshot and the audit log keep it). */
export default async function MessageReportsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const admin = await getAdmin();
  if (!admin.permissions.has("trust")) return <Restricted area="Message reports" />;
  const tab = sp.tab === "closed" ? "closed" : "open";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const now = requestTime();
  let q = admin.db.from("message_reports" as never).select("id,source,reported_name,reason_code,note,excerpt,message_at,status,case_id,decided_at,decision_note,message_removed,created_at", { count: "exact" });
  q = tab === "open" ? q.eq("status", "open") : q.neq("status", "open");
  const { data, count, error } = await q.order(tab === "open" ? "created_at" : "decided_at", { ascending: tab === "open", nullsFirst: false }).range((page - 1) * PER, page * PER - 1);
  if (error) throw new Error(error.message);   // never show "no reports" when the read failed
  const list = (data ?? []) as unknown as Row[];
  const href = (p: number) => `/admin/trust/message-reports?${new URLSearchParams({ ...(tab === "closed" ? { tab } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return <div className="adb add">
    <Head back={{ href: "/admin/trust", label: "Back to Trust & Safety" }} title="Message reports"
      subtitle="Messages people reported from their inbox (oldest first). Dismiss, action, or remove the message for both sides; the reporter is told the outcome and every decision is audited." />
    <TabBar active={tab} tabs={[{ key: "open", label: "Open", href: "/admin/trust/message-reports" }, { key: "closed", label: "Decided", href: "/admin/trust/message-reports?tab=closed" }]} />
    <section className="adb-panel">
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true">
        <thead><tr><th>Sender</th><th>Reported message</th><th>Reason</th><th>{tab === "open" ? "Reported" : "Decision"}</th><th /></tr></thead>
        <tbody>{list.length ? list.map(r => <tr key={r.id}>
          <td><b>{r.reported_name || "Member"}</b>{r.case_id && <small><Link href={`/admin/trust/${r.case_id}`}>Open case</Link></small>}<small>{r.source === "thread" ? "Event thread" : "Inbox"}</small></td>
          <td><small>{r.excerpt.slice(0, 400)}{r.excerpt.length > 400 ? "…" : ""}</small>{r.message_at && <small>Sent {stamp(r.message_at)}</small>}</td>
          <td><small>{REASON[r.reason_code] ?? r.reason_code}</small>{r.note && <small>“{r.note.slice(0, 240)}”</small>}</td>
          <td>{tab === "open" ? <small>{ago(r.created_at, now)}</small> : <><Pill status={r.status === "actioned" ? "hold" : "grey"} label={r.status === "actioned" ? (r.message_removed ? "Removed" : "Actioned") : "Dismissed"} /><small>{r.decision_note.slice(0, 200)}</small></>}</td>
          <td>{tab === "open" && <span className="add-acts">
            <ActionButton action={decideMessageReport} args={[r.id, "dismissed", false]} reason variant="outline" confirm={{ title: "Dismiss this report", body: "The message stays. The reporter is told it didn’t break the rules. Your reason is recorded in the audit log.", cta: "Dismiss" }}>Dismiss</ActionButton>
            <ActionButton action={decideMessageReport} args={[r.id, "actioned", false]} reason variant="outline" confirm={{ title: "Action this report", body: "Use this when you’ve acted on the sender’s account from the case. The message stays visible. The reporter is told action was taken.", cta: "Mark actioned" }}>Actioned</ActionButton>
            <ActionButton action={decideMessageReport} args={[r.id, "actioned", true]} reason variant="danger" confirm={{ title: "Remove this message", body: "The message disappears for everyone in the conversation. The report keeps a copy for the record and the reporter is told.", cta: "Remove message" }}>Remove message</ActionButton>
          </span>}</td>
        </tr>) : <tr><td colSpan={5} className="adb-none">{tab === "open" ? "No open message reports." : "No decided reports yet."}</td></tr>}</tbody>
      </table>
      {(count ?? 0) > PER && <Pager total={count ?? 0} page={page} per={PER} href={href} />}
    </section>
  </div>;
}
