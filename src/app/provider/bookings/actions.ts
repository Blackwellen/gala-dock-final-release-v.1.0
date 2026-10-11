"use server";

import { getProvider } from "@/lib/provider/context";
import { call, friendly, type ActionResult } from "@/lib/workspace/rpc";

const TO = ["confirmed", "active", "completed", "cancelled"] as const;
const done: Record<(typeof TO)[number], string> = {
  confirmed: "Booking confirmed", active: "Marked as started — the event is now active", completed: "Marked as completed (payment status unchanged)", cancelled: "Booking cancelled",
};

/** Lifecycle via provider_job_transition: completion never implies settlement; cancellation needs a reason. */
export async function transitionBooking(jobId: string, to: string, reason: string): Promise<ActionResult> {
  if (!TO.includes(to as (typeof TO)[number])) return { ok: false, error: "Unknown status." };
  const { db } = await getProvider();
  return call(db, "provider_job_transition", { p_job: jobId, p_to: to, p_reason: reason ?? "" }, done[to as (typeof TO)[number]]);
}

export async function assignCrew(jobId: string, data: FormData): Promise<ActionResult> {
  const crew = String(data.get("crew") ?? ""), role = String(data.get("role") ?? "").trim();
  if (!crew) return { ok: false, error: "Choose a team member." };
  const { db } = await getProvider();
  return call(db, "provider_assign_crew", { p_job: jobId, p_crew: crew, p_role: role }, "Team member assigned");
}

/** Issues are tracked as high-priority workspace tasks linked to the booking. */
export async function raiseIssue(jobId: string, data: FormData): Promise<ActionResult> {
  const title = String(data.get("title") ?? "").trim(), detail = String(data.get("detail") ?? "").trim();
  if (title.length < 3) return { ok: false, error: "Describe the issue in a few words." };
  const { db, workspace, userName } = await getProvider();
  const { error } = await db.from("tasks").insert({ workspace_id: workspace.id, title: title.slice(0, 200), detail: JSON.stringify({ kind: "booking_issue", job_id: jobId, body: detail.slice(0, 2000) }),
    category: "booking_issue", priority: "high", assignee_name: userName, status: "todo" });
  return error ? { ok: false, error: friendly(error) } : { ok: true, message: "Issue logged for the team" };
}

export async function requestChange(jobId: string, data: FormData): Promise<ActionResult> {
  const body = String(data.get("change") ?? "").trim();
  if (body.length < 5) return { ok: false, error: "Describe the change you’re requesting." };
  const { db, workspace, userName } = await getProvider();
  const { error } = await db.from("tasks").insert({ workspace_id: workspace.id, title: `Change request: ${body.slice(0, 120)}`, detail: JSON.stringify({ kind: "change_request", job_id: jobId, body: body.slice(0, 2000) }),
    category: "change_request", priority: "medium", assignee_name: userName, status: "todo" });
  return error ? { ok: false, error: friendly(error) } : { ok: true, message: "Change request recorded — commercial terms stay locked until the client agrees" };
}
