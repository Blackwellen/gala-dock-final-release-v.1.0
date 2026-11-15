"use server";

import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin/context";

type R = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERR = (m: string) => /reason_required/.test(m) ? "Give a reason (at least 5 characters) — the reporter is told the outcome."
  : /case_closed/.test(m) ? "Already decided." : /not_authorized/.test(m) ? "You need the Trust & Safety permission on a verified (MFA) session." : "Couldn’t save the decision.";

/** Q74: decide a content report (listing / event / review / profile). Messages are decided by the messaging lane's action. */
export async function decideContentReport(f: FormData): Promise<R> {
  const admin = await getAdmin();
  if (!admin.permissions.has("trust")) return { ok: false, error: "You need the Trust & Safety permission." };
  const id = String(f.get("id") ?? ""), decision = String(f.get("decision") ?? ""), note = String(f.get("note") ?? "").trim();
  const source = String(f.get("source") ?? "content");
  if (!UUID.test(id) || !["actioned", "dismissed"].includes(decision)) return { ok: false, error: "Choose a decision." };
  const remove = f.get("remove") === "on";
  const { error } = source === "message"
    ? await admin.db.rpc("admin_decide_message_report" as never, { p_report: id, p_decision: decision, p_note: note, p_remove: remove } as never)
    : await admin.db.rpc("admin_decide_content_report" as never, { p_report: id, p_decision: decision, p_note: note, p_remove: remove } as never);
  if (error) return { ok: false, error: ERR(error.message) };
  revalidatePath("/admin/moderation");
  return { ok: true, message: decision === "actioned" ? "Actioned — reporters are told the outcome." : "Dismissed — reporters are told the outcome." };
}
