import type { Metadata } from "next";
import Link from "next/link";
import { Restricted } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { getAdmin } from "@/lib/admin/context";
import { Head, Pill, TabBar } from "../_b/kit";
import { must } from "../_a/lib";
import { decideContentReport } from "./actions";
import "@/styles/admin-b.css";
import "@/styles/admin-d.css";

export const metadata: Metadata = { title: "Moderation queue" };

type Item = { source: "content" | "message" | "review_legacy"; id: string; subject_type: string; subject_id: string; subject_name: string; excerpt: string; reason_code: string;
  reasons: string[]; notes: string[] | null; reports: number; priority: "urgent" | "high" | "normal"; status: string; created_at: string; case_id: string | null; case_ref: string | null };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
const TONE: Record<string, string> = { urgent: "failed", high: "pending", normal: "scheduled" };
const TYPE: Record<string, string> = { listing: "Listing", event: "Event", review: "Review", workspace: "Business profile", message: "Message" };
const subjectHref = (i: Item) => i.subject_type === "listing" ? `/admin/marketplace/listings/${i.subject_id}` : i.subject_type === "event" ? `/admin/events?id=${i.subject_id}`
  : i.subject_type === "workspace" ? `/admin/workspaces/${i.subject_id}` : i.subject_type === "message" ? "/admin/trust/message-reports" : null;

/**
 * Q74 (owner decision D8; Online Safety Act 2023 ss.10, 20, 21): ONE moderation queue — reports on listings, events, reviews and
 * business profiles (content_reports), on messages (message_reports, Q52) and legacy review reports — urgent first (child safety,
 * illegal content), then high severity. Decisions notify every reporter; restrictions on accounts/listings go through Trust & Safety
 * enforcement (statement of reasons + appeal), linked from each case.
 */
export default async function ModerationPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getAdmin();
  if (!admin.permissions.has("trust")) return <Restricted area="Moderation" />;
  const sp = await props.searchParams;
  const status = sp.status === "actioned" || sp.status === "dismissed" ? sp.status : "open";
  const items = (must<Item[] | null>(await admin.db.rpc("admin_moderation_queue" as never, { p_status: status, p_limit: 200 } as never)) ?? []);
  const urgent = items.filter(i => i.priority === "urgent").length;
  return <div className="adb adm-page">
    <Head title="Moderation queue" subtitle={status === "open" ? `${items.length} open subject${items.length === 1 ? "" : "s"}${urgent ? ` · ${urgent} urgent` : ""}` : `Recently ${status}`} />
    <TabBar active={status} tabs={[{ key: "open", label: "Open", href: "/admin/moderation" }, { key: "actioned", label: "Actioned", href: "/admin/moderation?status=actioned" }, { key: "dismissed", label: "Dismissed", href: "/admin/moderation?status=dismissed" }]} />
    <p className="adb-sub" style={{ margin: "8px 0" }}>Online Safety Act: take illegal content down swiftly once aware of it; urgent items (child safety, illegal content) first. CSEA: follow the Safeguarding Policy and report to the NCA/police. Every decision tells the reporter the outcome.</p>
    {!items.length && <section className="adb-panel"><p>No {status} reports.</p></section>}
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>{items.map(i => {
      const href = subjectHref(i);
      return <li key={`${i.source}:${i.id}`} className="adb-panel" style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Pill status={TONE[i.priority] ?? "scheduled"} label={i.priority} /><b>{TYPE[i.subject_type] ?? i.subject_type}: {i.subject_name || "—"}</b>
          <small>{i.reports} report{i.reports === 1 ? "" : "s"} · {i.reasons.join(", ")} · first {when(i.created_at)}</small>
          {i.case_ref && <Link className="adb-link" href={`/admin/trust/${i.case_id}`}>Case {i.case_ref}</Link>}
          {href && <Link className="adb-link" href={href}>Open subject</Link>}
        </div>
        {i.excerpt && <blockquote style={{ margin: 0, padding: "6px 10px", borderLeft: "3px solid #cbd5e1", whiteSpace: "pre-line", maxHeight: 140, overflow: "auto" }}>{i.excerpt.slice(0, 1200)}</blockquote>}
        {!!i.notes?.length && <small>Reporter notes: {i.notes.join(" · ")}</small>}
        {status === "open" && i.source !== "review_legacy" && <ActionForm action={decideContentReport} resetOnSuccess>
          <input type="hidden" name="id" value={i.id} /><input type="hidden" name="source" value={i.source} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select name="decision" defaultValue="actioned" aria-label="Decision"><option value="actioned">Action taken</option><option value="dismissed">No breach</option></select>
            <input name="note" required minLength={5} maxLength={1000} placeholder="Reason (sent to the reporter in summary; recorded in audit)" style={{ flex: "1 1 280px" }} />
            {(i.subject_type === "review" || i.subject_type === "message") && <label><input type="checkbox" name="remove" /> Remove the {i.subject_type}</label>}
            <button className="adb-btn primary" type="submit">Decide</button>
          </div>
        </ActionForm>}
        {status === "open" && i.source === "review_legacy" && <small>Legacy review report: decide it in <Link href="/admin/trust">Trust &amp; Safety</Link>.</small>}
      </li>;
    })}</ul>
  </div>;
}
