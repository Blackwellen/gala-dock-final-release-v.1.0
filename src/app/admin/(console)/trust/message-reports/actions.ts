"use server";

import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";

/** Q52: decide a message report (Trust, aal2 — re-checked in admin_decide_message_report, which also audits and tells the reporter). */
export async function decideMessageReport(reportId: string, decision: string, remove: boolean, reason: string): Promise<ActionResult> {
  if (!isUuid(reportId) || !["actioned", "dismissed"].includes(decision)) return { ok: false, error: "Invalid request." };
  if (String(reason ?? "").trim().length < 5) return { ok: false, error: "Write a reason of at least 5 characters — it is recorded in the audit log." };
  const { db } = await getAdmin();
  const { error } = await db.rpc("admin_decide_message_report" as never, { p_report: reportId, p_decision: decision, p_note: String(reason).trim().slice(0, 1000), p_remove: !!remove } as never);
  if (error) return { ok: false, error: /case_closed/.test(error.message) ? "This report has already been decided." : /reason_required/.test(error.message) ? "Write a reason of at least 5 characters." : friendly(error) };
  revalidatePath("/admin/trust/message-reports");
  return { ok: true, message: decision === "dismissed" ? "Report dismissed — the reporter has been told" : remove ? "Message removed — the reporter has been told" : "Report actioned — the reporter has been told" };
}
