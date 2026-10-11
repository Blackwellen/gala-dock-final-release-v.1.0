"use server";
import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";

import { PERM } from "./perm";
export type Opened = {
  log_id: string; expires_at: string;
  conversation: { id: string; kind: string; subject: string; created_at: string };
  participants: { name: string; type: "person" | "workspace"; left: boolean }[];
  messages: { id: string; sender: string; body: string; deleted: boolean; edited: boolean; attachments: number; created_at: string }[];
};
type R<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; stepUp?: boolean };

const ERR: Record<string, string> = {
  forbidden: "You don’t have break-glass conversation access.", justification_required: "Write a justification of at least 20 characters.",
  choose_conversations: "Choose between 1 and 20 conversations.", open_case_required: "Access must be requested from an open support or trust case.",
  conversation_out_of_scope: "That conversation doesn’t involve the people on this case.", not_pending: "This request has already been decided.",
  cannot_approve_own_request: "Another administrator must approve your request.", note_required: "Add a short note for the decision.",
  grant_not_active: "This access grant isn’t active (pending approval, expired or closed).", no_grant: "Access grant not found.",
  step_up_required: "Verify with your authenticator app to continue.", withheld_reason_required: "Give a reason (10+ characters) for withholding the user notification.",
};
const fail = (e: { message: string }): { ok: false; error: string; stepUp?: boolean } => { const k = Object.keys(ERR).find(x => e.message.includes(x)); return { ok: false, error: k ? ERR[k] : "Something went wrong.", stepUp: k === "step_up_required" }; };
async function ctx() { const a = await getAdmin(); return a.permissions.has(PERM) ? untyped(a.db as never) : null; }

export async function requestAccess(input: { caseType: "support" | "trust"; caseId: string; reason: string; justification: string; conversations: string[]; minutes: number }): Promise<R<{ id: string; status: string }>> {
  const db = await ctx(); if (!db) return { ok: false, error: ERR.forbidden };
  const { data, error } = await db.rpc("admin_request_break_glass", { p_case_type: input.caseType, p_case: input.caseId, p_reason: input.reason, p_justification: input.justification.trim().slice(0, 2000), p_conversations: input.conversations, p_minutes: input.minutes });
  if (error) return fail(error);
  revalidatePath("/admin/conversations");
  return { ok: true, data: data as { id: string; status: string } };
}

export async function decideAccess(grant: string, approve: boolean, note: string): Promise<R> {
  const db = await ctx(); if (!db) return { ok: false, error: ERR.forbidden };
  const { error } = await db.rpc("admin_decide_break_glass", { p_grant: grant, p_approve: approve, p_note: note });
  if (error) return fail(error);
  revalidatePath("/admin/conversations"); revalidatePath(`/admin/conversations/${grant}`);
  return { ok: true, message: approve ? "Access approved" : "Request rejected" };
}

/** Message text is only ever returned here: active grant, in scope, step-up within 10 minutes; logged individually. */
export async function openConversation(grant: string, conversation: string): Promise<R<Opened>> {
  const db = await ctx(); if (!db) return { ok: false, error: ERR.forbidden };
  const { data, error } = await db.rpc("admin_open_conversation", { p_grant: grant, p_conv: conversation });
  if (error) return fail(error);
  return { ok: true, data: data as Opened };
}

export async function touchConversation(log: string, close = false): Promise<void> {
  const db = await ctx(); if (!db) return;
  await db.rpc("admin_touch_conversation", { p_log: log, p_close: close });
}

export async function closeAccess(grant: string, notify: boolean, withheldReason: string): Promise<R> {
  const db = await ctx(); if (!db) return { ok: false, error: ERR.forbidden };
  const { error } = await db.rpc("admin_close_break_glass", { p_grant: grant, p_notify: notify, p_withheld_reason: withheldReason || null });
  if (error) return fail(error);
  revalidatePath("/admin/conversations"); revalidatePath(`/admin/conversations/${grant}`);
  return { ok: true, message: notify ? "Access closed — affected users notified" : "Access closed — notification withheld" };
}
