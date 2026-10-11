import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Restricted } from "@/components/workspace/kit";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { Head } from "../../_b/kit";
import { PERM } from "../perm";
import { RequestForm } from "../review";
import "@/styles/admin-b.css";
import "@/styles/admin-conversations.css";

export const metadata: Metadata = { title: "Request conversation access" };

/** Step 1–5 of the §5 flow: opened from a support/trust case; scope = conversations involving that case's people (metadata only). */
export default async function RequestAccessPage(props: PageProps<"/admin/conversations/request">) {
  const sp = await props.searchParams;
  const admin = await getAdmin();
  if (!admin.permissions.has(PERM)) return <Restricted area="Break-glass conversation access" />;
  const caseType = sp.type === "trust" ? "trust" : "support", caseId = typeof sp.case === "string" && /^[0-9a-f-]{36}$/i.test(sp.case) ? sp.case : null;
  const back = caseType === "trust" ? `/admin/trust?case=${caseId ?? ""}` : `/admin/support/${caseId ?? ""}`;
  if (!caseId) return <div className="adb acv"><Head title="Request conversation access" subtitle="Open a support or trust case first, then choose Request conversation access." /></div>;
  const db = untyped(admin.db as never);
  const [{ data: scope, error }, { data: kase }, { data: holders }] = await Promise.all([
    db.rpc("admin_case_conversations", { p_case_type: caseType, p_case: caseId }),
    caseType === "trust" ? db.from("trust_cases").select("reference,category,subject_name,status").eq("id", caseId).maybeSingle() : db.from("support_cases").select("reference,subject,requester_name,status").eq("id", caseId).maybeSingle(),
    // Four-eyes approval applies only when another administrator holds the permission (DPO policy, migration 202610270001).
    db.from("platform_admins").select("user_id").contains("permissions", [PERM]).neq("user_id", admin.userId),
  ]);
  if (error || !kase) return <div className="adb acv"><Head title="Request conversation access" subtitle="That case wasn’t found." /></div>;
  const k = kase as { reference: string; subject?: string; category?: string; requester_name?: string; subject_name?: string; status: string };
  const s = scope as { affected_users: { id: string; name: string }[]; conversations: { id: string; subject: string; kind: string; messages: number; last_message_at: string }[] };
  return <div className="adb acv">
    <Link className="adb-back" href={back}><ArrowLeft aria-hidden="true" />Back to case {k.reference}</Link>
    <Head title="Request conversation access" subtitle={`${caseType === "trust" ? "Trust & Safety" : "Support"} case ${k.reference} · ${k.subject ?? k.category ?? ""} · people on the case: ${s.affected_users.map(u => u.name).join(", ") || "none"}`} />
    <RequestForm caseType={caseType} caseId={caseId} conversations={s.conversations} approvers={(holders ?? []).length} />
  </div>;
}
