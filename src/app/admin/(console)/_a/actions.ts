"use server";

import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin/context";
import { isUuid } from "@/lib/workspace/db";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";

/* Audited Platform Admin actions for AD-001..AD-009. Permission, reason and audit are enforced in the database
   functions (security definer + has_admin_permission + admin_require); these wrappers only validate input shape. */

const extra: [RegExp, string][] = [
  [/invalid_plan/, "Choose a valid plan."],
  [/invalid_status|invalid_decision/, "That status isn’t allowed."],
  [/body_required/, "Write a note first."],
  [/invalid_entity/, "Notes can’t be added to that record."],
];
const msg = (e: { message?: string } | null) => extra.find(([re]) => re.test(e?.message ?? ""))?.[1] ?? friendly(e);
const reasonOk = (r: unknown) => typeof r === "string" && r.trim().length >= 5;
const NEED_REASON: ActionResult = { ok: false, error: "Please give a reason (at least 5 characters)." };
const NOT_FOUND: ActionResult = { ok: false, error: "That record no longer exists." };

async function run(fn: string, args: Record<string, unknown>, ok: string, paths: string[]): Promise<ActionResult> {
  const { db } = await getAdmin();
  const { error } = await db.rpc(fn, args);
  if (error) return { ok: false, error: msg(error) };
  for (const p of paths) revalidatePath(p);
  return { ok: true, message: ok };
}

export async function setUserStatus(user: string, status: "active" | "restricted", reason: string): Promise<ActionResult> {
  if (!isUuid(user)) return NOT_FOUND;
  if (!["active", "restricted"].includes(status)) return { ok: false, error: "That status isn’t allowed." };
  if (!reasonOk(reason)) return NEED_REASON;
  return run("admin_set_user_status", { p_user: user, p_status: status, p_reason: reason.trim() },
    status === "restricted" ? "User restricted — they can no longer transact" : "User reactivated", ["/admin/users", `/admin/users/${user}`]);
}

export async function revokeSessions(user: string, reason: string): Promise<ActionResult> {
  if (!isUuid(user)) return NOT_FOUND;
  if (!reasonOk(reason)) return NEED_REASON;
  return run("admin_revoke_sessions", { p_user: user, p_reason: reason.trim() }, "All sessions revoked — the user must sign in again", [`/admin/users/${user}`]);
}

export async function addRecordNote(subjectType: "user" | "workspace" | "event" | "listing", subject: string, fd: FormData): Promise<ActionResult> {
  if (!isUuid(subject) || !["user", "workspace", "event", "listing"].includes(subjectType)) return NOT_FOUND;
  const body = String(fd.get("body") ?? "").trim().slice(0, 2000);
  if (body.length < 2) return { ok: false, error: "Write a note first." };
  const path = { user: `/admin/users/${subject}`, workspace: `/admin/workspaces/${subject}`, event: "/admin/events", listing: `/admin/marketplace/listings/${subject}` }[subjectType];
  return run("admin_add_record_note", { p_subject_type: subjectType, p_subject: subject, p_body: body }, "Note added — visible to admins only", [path]);
}

export async function setWorkspaceStatus(ws: string, status: "active" | "suspended", reason: string): Promise<ActionResult> {
  if (!isUuid(ws)) return NOT_FOUND;
  if (!["active", "suspended"].includes(status)) return { ok: false, error: "That status isn’t allowed." };
  if (!reasonOk(reason)) return NEED_REASON;
  return run("admin_set_workspace_status", { p_ws: ws, p_status: status, p_reason: reason.trim() },
    status === "suspended" ? "Workspace suspended — members lose access until reinstated" : "Workspace reinstated", ["/admin/workspaces", `/admin/workspaces/${ws}`]);
}

export async function setWorkspacePlan(ws: string, plan: string, reason: string): Promise<ActionResult> {
  if (!isUuid(ws)) return NOT_FOUND;
  if (!reasonOk(reason)) return NEED_REASON;
  return run("admin_set_workspace_plan", { p_ws: ws, p_plan: plan, p_reason: reason.trim() }, `Plan changed to ${plan[0]?.toUpperCase()}${plan.slice(1)}`, ["/admin/workspaces", `/admin/workspaces/${ws}`]);
}

export async function setWorkspaceCommission(ws: string, bps: number, reason: string): Promise<ActionResult> {
  if (!isUuid(ws)) return NOT_FOUND;
  if (!Number.isInteger(bps) || bps < 0 || bps > 5000) return { ok: false, error: "Commission must be between 0% and 50%." };
  if (!reasonOk(reason)) return NEED_REASON;
  return run("admin_set_workspace_commission", { p_ws: ws, p_bps: bps, p_reason: reason.trim() }, `Commission set to ${bps / 100}%`, ["/admin/workspaces", `/admin/workspaces/${ws}`]);
}

export async function reviewListing(listing: string, decision: "approve" | "request_changes" | "restrict" | "suspend", reason: string): Promise<ActionResult> {
  if (!isUuid(listing)) return NOT_FOUND;
  if (!["approve", "request_changes", "restrict", "suspend"].includes(decision)) return { ok: false, error: "That decision isn’t allowed." };
  if (!reasonOk(reason)) return NEED_REASON;
  const label = { approve: "Listing approved and verified", request_changes: "Changes requested — the provider has been notified", restrict: "Listing restricted and unpublished", suspend: "Listing suspended and unpublished" }[decision];
  return run("admin_review_listing", { p_listing: listing, p_decision: decision, p_reason: reason.trim() }, label, ["/admin/marketplace", `/admin/marketplace/listings/${listing}`]);
}

export async function setEventRestriction(event: string, restrict: boolean, reason: string): Promise<ActionResult> {
  if (!isUuid(event)) return NOT_FOUND;
  if (!reasonOk(reason)) return NEED_REASON;
  return run("admin_set_event_restriction", { p_event: event, p_restrict: !!restrict, p_reason: reason.trim() },
    restrict ? "Event restricted — unpublished and ticket sales paused" : "Event reinstated to its previous status", ["/admin/events", "/admin/tickets"]);
}

export async function setEventFeatured(event: string, featured: boolean, reason: string): Promise<ActionResult> {
  if (!isUuid(event)) return NOT_FOUND;
  if (!reasonOk(reason)) return NEED_REASON;
  return run("admin_set_event_featured", { p_event: event, p_featured: !!featured, p_reason: reason.trim() }, featured ? "Event featured" : "Event no longer featured", ["/admin/events"]);
}

export async function setTicketSales(event: string, pause: boolean, reason: string): Promise<ActionResult> {
  if (!isUuid(event)) return NOT_FOUND;
  if (!reasonOk(reason)) return NEED_REASON;
  return run("admin_set_ticket_sales", { p_event: event, p_pause: !!pause, p_reason: reason.trim() }, pause ? "Ticket sales paused" : "Ticket sales resumed", ["/admin/tickets", "/admin/events"]);
}
