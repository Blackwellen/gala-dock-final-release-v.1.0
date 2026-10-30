"use server";

import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin/context";
import { friendly as baseFriendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";

/* Q31 remainder server actions: support operations, Trust review queues (Q08 evidence, Q33 risk, Q22 ticket flags), privacy
   (legal holds, retention preview, fixture purge DRY RUN only) and the job console. Every call is a security-definer RPC that
   re-checks the admin permission, MFA (aal2) and the written reason, and writes the audit trail. Nothing here moves money,
   sends email, runs AI or switches maintenance on. */

const extra: [RegExp, string][] = [
  [/reason_required/, "Write a reason of at least 5 characters — it is recorded in the audit log."],
  [/step_up_required/, "Verify your authenticator again, then retry."],
  [/case_closed/, "This case is closed. Open a new case instead."],
  [/invalid_transition|no_change/, "That status change isn’t allowed from the case’s current status."],
  [/invalid_assignee/, "That admin can’t take this case (they need Support, and Trust for safeguarding cases)."],
  [/stale_version/, "Someone else changed this macro. Reload and try again."],
  [/record_not_found/, "No record with that ID exists."],
  [/already_linked/, "That record is already linked."],
  [/already_escalated/, "This case is already with Trust & Safety."],
  [/not_retryable/, "Only failed, dead-lettered or cancelled jobs can be retried."],
  [/not_cancellable/, "Only queued, waiting or stuck jobs can be cancelled (a live worker is still holding this one)."],
  [/already_processed/, "That consumer already processed the event — replaying would duplicate its side effects."],
  [/nothing_to_replay/, "Every consumer has processed this event; there is nothing to replay."],
  [/file_not_cleared/, "The file hasn’t passed the malware scan, so it can’t be verified yet."],
  [/already_expired/, "That expiry date is in the past."],
  [/stripe_managed/, "Stripe decides this check; it updates from Stripe automatically."],
  [/already_decided/, "This has already been decided."],
  [/legal_review_required/, "Enabling this rule needs legal sign-off first."],
  [/not_eligible|refus/i, "One or more workspaces can’t be purged (not test fixtures, under legal hold or holding live money)."],
  [/not_authorized|forbidden/, "Your admin role doesn’t include this action."],
];
const friendly = (e: { message?: string } | null) => extra.find(([re]) => re.test(e?.message ?? ""))?.[1] ?? baseFriendly(e);
const bad = (error = "That record no longer exists."): ActionResult => ({ ok: false, error });
const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
async function rpc(fn: string, args: Record<string, unknown>, message: string, path?: string, redirect?: string): Promise<ActionResult> {
  const { db } = await getAdmin();
  const { error } = await db.rpc(fn, args);
  if (error) return { ok: false, error: friendly(error) };
  if (path) revalidatePath(path);
  return { ok: true, message, redirect };
}

// ── Support ──
export async function assignCaseTo(caseId: string, data: FormData): Promise<ActionResult> {
  const to = str(data, "assignee");
  if (!isUuid(caseId) || !isUuid(to)) return bad("Choose an admin to assign.");
  return rpc("admin_assign_case_to", { p_case: caseId, p_assignee: to, p_reason: str(data, "reason") }, "Case reassigned", `/admin/support/${caseId}`);
}
export async function setCasePriority(caseId: string, data: FormData): Promise<ActionResult> {
  if (!isUuid(caseId)) return bad();
  return rpc("admin_set_case_priority", { p_case: caseId, p_priority: str(data, "priority"), p_reason: str(data, "reason") }, "Priority changed — SLA recalculated", `/admin/support/${caseId}`);
}
export async function closeCase(caseId: string, reason: string): Promise<ActionResult> {
  if (!isUuid(caseId)) return bad();
  return rpc("admin_update_case", { p_case: caseId, p_status: "closed", p_reason: reason, p_outcome: null }, "Case closed", `/admin/support/${caseId}`);
}
export async function applyMacro(caseId: string, data: FormData): Promise<ActionResult> {
  const m = str(data, "macro");
  if (!isUuid(caseId) || !isUuid(m)) return bad("Choose a macro.");
  return rpc("admin_apply_support_macro", { p_case: caseId, p_macro: m }, "Macro applied", `/admin/support/${caseId}`);
}
export async function linkRecord(caseId: string, data: FormData): Promise<ActionResult> {
  if (!isUuid(caseId)) return bad();
  return rpc("admin_link_case_record", { p_case: caseId, p_type: str(data, "record_type"), p_id: str(data, "record_id") }, "Record linked", `/admin/support/${caseId}`);
}
export async function unlinkRecord(caseId: string, linkId: string): Promise<ActionResult> {
  if (!isUuid(linkId)) return bad();
  return rpc("admin_unlink_case_record", { p_link: linkId }, "Link removed", `/admin/support/${caseId}`);
}
export async function escalateToTrust(caseId: string, reason: string): Promise<ActionResult> {
  if (!isUuid(caseId)) return bad();
  return rpc("admin_escalate_case_to_trust", { p_case: caseId, p_reason: reason }, "Escalated to Trust & Safety", `/admin/support/${caseId}`);
}
export async function saveMacro(data: FormData): Promise<ActionResult> {
  const id = str(data, "id"), version = Number(str(data, "version")) || null;
  return rpc("admin_save_support_macro", { p_id: isUuid(id) ? id : null, p_title: str(data, "title"), p_body: str(data, "body"), p_category: str(data, "category") || null,
    p_internal: str(data, "internal") === "on", p_set_status: str(data, "set_status") || null, p_version: isUuid(id) ? version : null }, isUuid(id) ? "Macro updated" : "Macro created", "/admin/support/macros");
}
export async function archiveMacro(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_archive_support_macro", { p_id: id, p_reason: reason }, "Macro archived", "/admin/support/macros");
}
export async function setSlaPolicy(priority: string, data: FormData): Promise<ActionResult> {
  const n = (k: string) => Math.round(Number(str(data, k)));
  return rpc("admin_set_sla_policy", { p_priority: priority, p_first_minutes: n("first"), p_resolution_minutes: n("resolution"), p_auto_close_days: n("auto_close"), p_reason: str(data, "reason") },
    `SLA for ${priority} updated — applies to new cases and priority changes`, "/admin/support/macros");
}

// ── Trust: Q08 evidence, verification checks, enforcement appeals ──
export async function reviewDocument(id: string, data: FormData): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  const status = str(data, "status"), expires = str(data, "expires_on"), cover = str(data, "cover");
  if (!["in_review", "verified", "rejected"].includes(status)) return bad("Choose a decision.");
  return rpc("trust_review_document", { p_document: id, p_status: status, p_reason_code: str(data, "reason_code") || null, p_reason: str(data, "reason") || null,
    p_expires_on: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : null, p_cover_amount_minor: cover && Number.isFinite(Number(cover)) ? Math.round(Number(cover) * 100) : null },
    status === "verified" ? "Document verified" : status === "rejected" ? "Document rejected — the provider has been told why" : "Marked in review", "/admin/trust/verification");
}
export async function reviewCheck(id: string, data: FormData): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  const to = str(data, "to"), exp = str(data, "expires_at");
  return rpc("trust_review_verification", { p_check: id, p_to: to, p_reason_code: str(data, "reason_code") || null, p_reason: str(data, "reason"),
    p_expires_at: /^\d{4}-\d{2}-\d{2}$/.test(exp) ? `${exp}T23:59:59Z` : null }, `Check moved to ${to.replaceAll("_", " ")}`, "/admin/trust/verification");
}
export async function decideEnforcementAppeal(caseId: string, outcome: string, reason: string): Promise<ActionResult> {
  if (!isUuid(caseId) || !["upheld", "overturned"].includes(outcome)) return bad();
  return rpc("trust_decide_appeal", { p_case: caseId, p_outcome: outcome, p_reason: reason }, outcome === "overturned" ? "Appeal upheld for the provider — restriction reversed" : "Restriction kept", "/admin/trust/verification");
}
export async function liftEnforcement(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("trust_lift_enforcement", { p_action: id, p_reason: reason, p_outcome: "lifted" }, "Restriction lifted", "/admin/trust/verification");
}

// ── Trust: Q33 risk signals, holds, appeals; Q22 ticket flags ──
export async function decideSignal(id: string, decision: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id) || !["clear", "action", "escalate"].includes(decision)) return bad();
  return rpc("risk_signal_decide", { p_signal: id, p_decision: decision, p_reason: reason }, decision === "clear" ? "Signal cleared (holds it caused are released)" : decision === "escalate" ? "Escalated to a fraud case" : "Signal actioned", "/admin/trust/risk");
}
export async function placeHold(data: FormData): Promise<ActionResult> {
  const subject = str(data, "subject_id"), signal = str(data, "signal_id"), days = Number(str(data, "days")) || 0;
  if (!isUuid(subject)) return bad("Enter the subject’s ID.");
  return rpc("risk_hold_place", { p_kind: str(data, "kind"), p_subject_type: str(data, "subject_type"), p_subject_id: subject, p_reason: str(data, "reason"),
    p_signal: isUuid(signal) ? signal : null, p_expires: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null }, "Hold placed — the subject has been notified and can appeal", "/admin/trust/risk");
}
export async function releaseHold(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("risk_hold_release", { p_hold: id, p_reason: reason }, "Hold released", "/admin/trust/risk");
}
export async function decideRiskAppeal(caseId: string, outcome: string, reason: string): Promise<ActionResult> {
  if (!isUuid(caseId) || !["upheld", "overturned"].includes(outcome)) return bad();
  return rpc("risk_appeal_decide", { p_case: caseId, p_outcome: outcome, p_reason: reason }, outcome === "overturned" ? "Appeal granted — hold released" : "Hold kept", "/admin/trust/risk");
}
export async function reviewTicketFlag(id: string, status: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id) || !["cleared", "actioned"].includes(status)) return bad();
  return rpc("ticket_risk_review", { p_flag: id, p_status: status, p_note: reason }, status === "cleared" ? "Flag cleared" : "Flag actioned", "/admin/trust/risk");
}

// ── Privacy: legal holds, retention preview, fixture purge (dry run only) ──
export async function placeLegalHold(data: FormData): Promise<ActionResult> {
  const subjects = str(data, "subjects").split(/[\s,]+/).filter(Boolean).map(x => { const [type, id] = x.includes(":") ? x.split(":") : ["user", x]; return { type, id }; });
  if (!subjects.length || subjects.some(s => !["user", "workspace", "event"].includes(s.type!) || !isUuid(s.id ?? ""))) return bad("List subjects as user:<id>, workspace:<id> or event:<id>.");
  return rpc("legal_hold_place", { p_matter: str(data, "matter"), p_reason: str(data, "reason"), p_subjects: subjects }, "Legal hold placed", "/admin/support/privacy");
}
export async function releaseLegalHold(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("legal_hold_release", { p_hold: id, p_reason: reason }, "Legal hold released", "/admin/support/privacy");
}
/** Fixture purge from the console is ALWAYS a dry run (p_dry_run = true). The real purge is a reviewed script run by the coordinator. */
export async function purgeDryRun(form: FormData): Promise<ActionResult> {
  const list = form.getAll("ws").map(String).filter(isUuid), reason = str(form, "reason");
  if (!list.length) return bad("Select at least one test workspace.");
  const { db } = await getAdmin();
  const { data, error } = await db.rpc("admin_purge_test_workspaces", { p_workspaces: list, p_reason: reason, p_dry_run: true });
  if (error) return { ok: false, error: friendly(error) };
  const r = data as { tables?: Record<string, { deleted: number }>; users_to_remove?: string[] } | null;
  const rows = Object.values(r?.tables ?? {}).reduce((n, t) => n + Number(t.deleted ?? 0), 0);
  revalidatePath("/admin/support/privacy");
  return { ok: true, message: `Dry run only — nothing deleted. Would remove ${rows.toLocaleString("en-GB")} rows across ${Object.keys(r?.tables ?? {}).length} tables and ${r?.users_to_remove?.length ?? 0} test sign-ins. Recorded in the purge log for review.` };
}

// ── Job console ──
export async function retryJob(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_job_retry", { p_job: id, p_reason: reason }, "Job queued to run again", "/admin/health/jobs");
}
export async function cancelJob(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_job_cancel", { p_job: id, p_reason: reason }, "Job cancelled", "/admin/health/jobs");
}
export async function replayOutbox(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_outbox_replay", { p_event: id, p_reason: reason }, "Event replayed to consumers that hadn’t processed it", "/admin/health/jobs");
}
/** Retention preview: counts what each enabled rule WOULD remove (recorded as a preview run). Never deletes. */
export async function retentionPreview(): Promise<ActionResult> {
  const { db } = await getAdmin();
  const { data, error } = await db.rpc("privacy_retention_preview", {});
  if (error) return { ok: false, error: friendly(error) };
  const r = (data ?? {}) as Record<string, { rows?: number; enabled?: boolean }>;
  const total = Object.values(r).filter(x => x?.enabled).reduce((n, x) => n + Number(x?.rows ?? 0), 0);
  revalidatePath("/admin/support/privacy");
  return { ok: true, message: `Preview recorded: enabled rules would remove ${total.toLocaleString("en-GB")} rows. Nothing was deleted.` };
}

// ── Gala Agent runtime kill switch (Q41): agent_ops + MFA + reason, audited. Stops new runs and every governed tool call. ──
export async function setAgentKillSwitch(on: boolean, reason: string): Promise<ActionResult> {
  return rpc("admin_set_agent_kill_switch", { p_on: on, p_reason: reason }, on ? "Gala Agent switched off for every workspace" : "Gala Agent switched back on", "/admin/health");
}
