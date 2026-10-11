"use server";

import { getAdmin } from "@/lib/admin/context";
import { friendly as baseFriendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";

/* Server actions for Admin B screens. Every state change goes through a security-definer RPC that checks the admin
   permission, requires a reason where consequential, and writes audit_events. Nothing here moves money. */

const extra: [RegExp, string][] = [
  [/not_refundable/, "Only completed customer payments can be refunded."],
  [/refund_exceeds_amount/, "That refund is larger than what remains refundable on this payment."],
  [/not_retryable/, "Only failed or pending payouts can be retried."],
  [/invalid_amount/, "Enter an amount above £0."],
  [/no_draft/, "There are no unpublished changes in this section."],
  [/invalid_subject/, "Enter a subject (at least 3 characters)."],
  [/body_required/, "Write a message first."],
  [/invalid_value/, "Those settings couldn’t be read — check the values and try again."],
];
const friendly = (e: { message?: string } | null) => extra.find(([re]) => re.test(e?.message ?? ""))?.[1] ?? baseFriendly(e);
async function rpc(fn: string, args: Record<string, unknown>, message: string, redirect?: string): Promise<ActionResult> {
  const { db } = await getAdmin();
  const { error } = await db.rpc(fn, args);
  return error ? { ok: false, error: friendly(error) } : { ok: true, message, redirect };
}
const bad = (error = "That record no longer exists."): ActionResult => ({ ok: false, error });
const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

// ── Commerce ──
export async function requestRefund(txId: string, amount: number, caseId: string | null, reason: string): Promise<ActionResult> {
  if (!isUuid(txId) || (caseId !== null && !isUuid(caseId))) return bad();
  return rpc("admin_request_money", { p_kind: "refund", p_transaction: txId, p_partner: null, p_case: caseId, p_amount: amount, p_reason: reason },
    "Refund request recorded. Stripe isn’t connected for refunds yet, so no money has moved — it stays pending until processed.");
}
export async function retryPayout(txId: string, amount: number, reason: string): Promise<ActionResult> {
  if (!isUuid(txId)) return bad();
  return rpc("admin_request_money", { p_kind: "payout_retry", p_transaction: txId, p_partner: null, p_case: null, p_amount: amount, p_reason: reason },
    "Payout retry requested. It stays pending until Stripe Connect processes it.");
}
export async function cancelMoneyRequest(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_cancel_money_request", { p_request: id, p_reason: reason }, "Request cancelled");
}
export async function addNote(data: FormData): Promise<ActionResult> {
  const type = str(data, "entity_type"), id = str(data, "entity_id"), body = str(data, "body");
  if (!isUuid(id) || !["transaction", "partner", "trust_case", "support_case"].includes(type)) return bad();
  return rpc("admin_add_note", { p_entity_type: type, p_entity: id, p_body: body }, "Note added");
}

// ── Support ──
export async function createSupportCase(data: FormData): Promise<ActionResult> {
  const { db } = await getAdmin();
  const { data: id, error } = await db.rpc("admin_create_support_case", {
    p_subject: str(data, "subject"), p_category: str(data, "category") || "other", p_priority: str(data, "priority") || "medium", p_requester: str(data, "requester"), p_body: str(data, "body"),
    p_related: { type_label: "", requester: { name: str(data, "requester"), email: str(data, "email") }, ...(isUuid(str(data, "transaction_id")) ? { transaction_id: str(data, "transaction_id") } : {}) },
  });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, message: "Support case created", redirect: `/admin/support/${id as string}` };
}
export async function replyCase(data: FormData): Promise<ActionResult> {
  const id = str(data, "case_id");
  if (!isUuid(id)) return bad();
  return rpc("admin_reply_case", { p_case: id, p_body: str(data, "body"), p_internal: str(data, "mode") === "internal" }, str(data, "mode") === "internal" ? "Internal note added" : "Reply sent");
}
export async function assignCase(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_assign_case", { p_case: id }, "Assigned to you");
}
export async function setCaseStatus(id: string, status: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_update_case", { p_case: id, p_status: status, p_reason: reason, p_outcome: null }, status === "escalated" ? "Case escalated" : `Case marked ${status}`);
}
export async function resolveCase(id: string, reason: string, outcome: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_update_case", { p_case: id, p_status: "resolved", p_reason: reason, p_outcome: outcome }, "Case resolved");
}

// ── Trust & Safety ──
export async function decideTrust(id: string, decision: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  const msg = decision === "actioned" ? "Restriction recorded" : decision === "dismissed" ? "Case resolved — no action" : "Moved to review";
  return rpc("admin_decide_trust", { p_case: id, p_decision: decision, p_reason: reason }, msg);
}
export async function assignTrust(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_assign_trust", { p_case: id }, "Assigned to you");
}
export async function requestEvidence(id: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_request_trust_evidence", { p_case: id, p_reason: reason }, "Evidence requested");
}
export async function createTrustCase(data: FormData): Promise<ActionResult> {
  const { db } = await getAdmin();
  const { data: id, error } = await db.rpc("admin_create_trust_case", {
    p_queue: str(data, "queue"), p_category: str(data, "category"), p_subject_type: str(data, "subject_type"), p_subject_name: str(data, "subject_name"),
    p_risk: Number(str(data, "risk") || 0), p_reason: str(data, "reason"),
  });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, message: "Case opened", redirect: `/admin/trust?case=${id as string}` };
}

// ── Partners ──
export async function setPartnerStatus(id: string, status: string, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_set_partner_status", { p_partner: id, p_status: status, p_reason: reason }, status === "paused" ? "Partner paused" : status === "active" ? "Partner reactivated" : "Partner terminated");
}
export async function setPartnerTerms(data: FormData): Promise<ActionResult> {
  const id = str(data, "partner_id"), pct = Number(str(data, "rate"));
  if (!isUuid(id)) return bad();
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) return { ok: false, error: "Commission must be between 0% and 50%." };
  return rpc("admin_set_partner_terms", { p_partner: id, p_commission_bps: Math.round(pct * 100), p_reason: str(data, "reason") }, "Commission terms updated");
}
export async function requestPartnerPayout(id: string, amount: number, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_request_money", { p_kind: "partner_payout", p_transaction: null, p_partner: id, p_case: null, p_amount: amount, p_reason: reason },
    "Partner payout requested. It stays pending until Stripe Connect processes it — no money has moved.");
}

// ── Agent & Integrations ──
export async function decideAgentApproval(id: string, approve: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_decide_agent_approval", { p_approval: id, p_approve: approve }, approve ? "Approved" : "Rejected — nothing was changed");
}
export async function controlRun(id: string, action: string): Promise<ActionResult> {
  if (!isUuid(id) || !["pause", "resume", "cancel"].includes(action)) return bad();
  return rpc("agent_control_run", { p_run: id, p_action: action }, action === "pause" ? "Run paused" : action === "resume" ? "Run resumed" : "Run cancelled");
}
export async function startAdminRun(data: FormData): Promise<ActionResult> {
  const goal = str(data, "goal"), tools = data.getAll("tools").map(String).filter(Boolean);
  const { db } = await getAdmin();
  const { error } = await db.rpc("start_agent_run", { p_ws: null, p_surface: "admin", p_goal: goal, p_tools: tools.length ? tools : null, p_constraints: { note: "Started from Admin console" }, p_idempotency: `admin-${crypto.randomUUID()}` });
  if (error) return { ok: false, error: /goal_required/.test(error.message) ? "Describe what the Agent should do (at least 3 characters)." : friendly(error) };
  return { ok: true, message: "Run queued — Gala Agent will plan it and ask for approval before acting." };
}
export async function setIntegration(id: string, enabled: boolean, reason: string): Promise<ActionResult> {
  if (!isUuid(id)) return bad();
  return rpc("admin_set_integration", { p_id: id, p_enabled: enabled, p_reason: reason }, enabled ? "Connector enabled" : "Connector disabled");
}

// ── Settings (draft → publish → rollback) ──
const SECTIONS = ["general", "commerce", "marketplace", "ticketing", "trust", "agent", "communications", "integrations"];
export async function saveSettingsDraft(data: FormData): Promise<ActionResult> {
  const section = str(data, "section");
  if (!SECTIONS.includes(section)) return bad("That setting can’t be changed here.");
  let base: Record<string, unknown> = {};
  try { base = JSON.parse(str(data, "base") || "{}"); } catch { return bad("Those settings couldn’t be read — reload and try again."); }
  const value: Record<string, unknown> = { ...base };
  for (const [k, raw] of data.entries()) {
    if (!k.startsWith("f:")) continue;
    const [, type, key] = k.split(":");
    if (!key) continue;
    const v = String(raw);
    if (type === "n") { const n = Number(v); if (!Number.isFinite(n) || n < 0) return bad(`“${key.replaceAll("_", " ")}” must be a number of 0 or more.`); value[key] = n; }
    else if (type === "b") value[key] = v === "on" || v === "true";
    else if (type === "l") value[key] = data.getAll(k).map(String).filter(Boolean);
    else if (type === "c") value[key] = v.split(",").map(x => x.trim()).filter(Boolean);
    else value[key] = v.slice(0, 2000);
  }
  // Unchecked checkboxes are absent from FormData: declared booleans default to false, declared lists to [].
  for (const k of data.getAll("bools").map(String)) if (!data.has(`f:b:${k}`)) value[k] = false;
  for (const k of data.getAll("lists").map(String)) if (!data.has(`f:l:${k}`)) value[k] = [];
  if (section === "general" && typeof value.support_email === "string" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.support_email)) return bad("Enter a valid support email address.");
  return rpc("admin_save_setting_draft", { p_section: section, p_value: value, p_summary: str(data, "summary") }, "Draft saved — publish to make it live");
}
export async function publishSettingsDraft(section: string, reason: string): Promise<ActionResult> {
  if (!SECTIONS.includes(section)) return bad("That setting can’t be changed here.");
  return rpc("admin_publish_setting_draft", { p_section: section, p_reason: reason }, "Changes published");
}
export async function discardSettingsDraft(section: string, reason: string): Promise<ActionResult> {
  if (!SECTIONS.includes(section)) return bad("That setting can’t be changed here.");
  return rpc("admin_discard_setting_draft", { p_section: section, p_reason: reason }, "Draft discarded");
}
export async function rollbackSetting(section: string, version: number, reason: string): Promise<ActionResult> {
  if (!SECTIONS.includes(section) || !Number.isInteger(version)) return bad("That version can’t be restored.");
  return rpc("admin_rollback_setting", { p_section: section, p_version: version, p_reason: reason }, `Rolled back to v${version} (published as a new version)`);
}
