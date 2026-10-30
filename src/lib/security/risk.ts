"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Fraud / abuse review commands (Q33, domains 211–212). Every rule lives in the database: these actions validate input and
 * translate errors. Admin commands need the `trust` admin permission, a verified second factor (aal2) and a reason
 * (admin_require); all are audited. Nothing here bans, deletes or moves money: decisions clear / action / escalate a signal,
 * and holds only pause Gala Dock-controlled payout releases or require step-up until review.
 * Evidence and thresholds are admin-only; subjects see their holds' plain reasons through myRiskHolds().
 */
const Id = z.string().uuid();
const Reason = z.string().trim().min(5).max(500);
const why = (m: string) => /step_up_required|aal2|mfa/.test(m) ? "Verify your second factor, then try again."
  : /not_authorized|42501/.test(m) ? "You don't have permission for this." : /reason_required/.test(m) ? "Add a reason (at least 5 characters)."
  : /already_appealed/.test(m) ? "You've already asked for a review of this hold." : /not_active/.test(m) ? "This hold is no longer active."
  : /statement_too_short/.test(m) ? "Tell us a little more (at least 20 characters)." : /rate_limited/.test(m) ? "Too many requests — try again tomorrow."
  : /already_decided/.test(m) ? "This review has already been decided." : /not_found|P0002/.test(m) ? "Not found." : "Could not save.";
async function sb() { return untyped(await createClient()); }
async function call<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const { data, error } = await (await sb()).rpc(fn, args);
  return error ? { ok: false, error: why(error.message) } : { ok: true, data: data as T };
}

export type RiskDecision = "clear" | "action" | "escalate";
export type RiskHold = { id: string; kind: "payout" | "step_up"; subject_type: "user" | "workspace"; subject_id: string; reason: string; status: string; placed_at: string; appeal_status: string | null };

export async function decideRiskSignal(signalId: string, decision: RiskDecision, reason: string) {
  if (!Id.safeParse(signalId).success || !["clear", "action", "escalate"].includes(decision) || !Reason.safeParse(reason).success) return { ok: false, error: "Check the decision and reason." } as ActionResult<never>;
  return call<{ ok: boolean; case_id: string | null }>("risk_signal_decide", { p_signal: signalId, p_decision: decision, p_reason: reason });
}

export async function placeRiskHold(kind: "payout" | "step_up", subjectType: "user" | "workspace", subjectId: string, reason: string, signalId?: string) {
  if (!Id.safeParse(subjectId).success || !Reason.safeParse(reason).success || (signalId && !Id.safeParse(signalId).success)) return { ok: false, error: "Check the hold details." } as ActionResult<never>;
  return call<string>("risk_hold_place", { p_kind: kind, p_subject_type: subjectType, p_subject_id: subjectId, p_reason: reason, p_signal: signalId ?? null });
}

export async function releaseRiskHold(holdId: string, reason: string) {
  if (!Id.safeParse(holdId).success || !Reason.safeParse(reason).success) return { ok: false, error: "Check the reason." } as ActionResult<never>;
  return call<null>("risk_hold_release", { p_hold: holdId, p_reason: reason });
}

export async function decideRiskAppeal(caseId: string, outcome: "upheld" | "overturned", reason: string) {
  if (!Id.safeParse(caseId).success || !Reason.safeParse(reason).success) return { ok: false, error: "Check the outcome and reason." } as ActionResult<never>;
  return call<null>("risk_appeal_decide", { p_case: caseId, p_outcome: outcome, p_reason: reason });
}

/** The signed-in user's holds (and holds on workspaces they manage). */
export async function myRiskHolds() { return call<RiskHold[]>("my_risk_holds", {}); }

export async function appealRiskHold(holdId: string, statement: string) {
  if (!Id.safeParse(holdId).success || statement.trim().length < 20 || statement.length > 2000) return { ok: false, error: "Tell us a little more (at least 20 characters)." } as ActionResult<never>;
  return call<string>("risk_hold_appeal", { p_hold: holdId, p_statement: statement.trim() });
}
