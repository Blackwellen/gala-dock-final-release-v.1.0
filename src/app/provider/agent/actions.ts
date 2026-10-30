"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { routineNextRun } from "@/lib/agent/schedule-db";
import { FAR_FUTURE_ISO } from "@/lib/agent/schedule";

/** Approve a proposal, then perform it with the approver's own permissions (RLS + role checks in each RPC). Reject leaves everything unchanged. */
export async function decideApproval(id: string, approve: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Approval not found." };
  const { db, workspace } = await getProvider();
  const { data: a, error } = await db.rpc("decide_agent_approval", { p_approval: id, p_approve: approve });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/provider/agent");
  if (!approve) return { ok: true, message: "Declined — nothing was changed" };
  const ap = a as { action: string; payload: Record<string, string> };
  const p = ap.payload ?? {}, target = isUuid(p.id ?? "") ? p.id : null;
  let result = "", redirect: string | undefined, err: { message: string } | null = null;
  if (ap.action === "quote.review" && target) { result = "Opened for quoting"; redirect = `/provider/opportunities/${target}/quote?step=1`; }
  else if (!target) err = { message: "invalid_target" };
  else if (ap.action === "listing.pause" || ap.action === "listing.unpause") { ({ error: err } = await db.rpc("provider_pause_listing", { p_listing: target, p_pause: ap.action === "listing.pause" })); result = ap.action === "listing.pause" ? "Listing paused" : "Listing unpaused"; }
  else if (ap.action === "hold.release") { ({ error: err } = await db.rpc("provider_release_hold", { p_item: target })); result = "Hold released"; }
  else if (ap.action === "message.reply") { if (!(p.body ?? "").trim()) err = { message: "empty_message" }; else { ({ error: err } = await db.rpc("provider_send_message", { p_thread: target, p_body: p.body.slice(0, 4000) })); result = "Reply sent"; } }
  else if (ap.action === "availability.block") {
    const s = new Date(p.starts), e = new Date(p.ends);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) err = { message: "invalid_block" };
    else { const { data: sp } = await db.from("spaces").select("id").eq("id", target).maybeSingle();
      ({ error: err } = await db.rpc("provider_set_availability", { p_ws: workspace.id, p_kind: "blocked", p_starts: s.toISOString(), p_ends: e.toISOString(), p_listing: sp ? null : target, p_space: sp ? target : null, p_note: "Blocked via Gala Agent" })); result = "Dates blocked"; }
  } else err = { message: "tool_not_permitted" };
  const outcome = err ? `Couldn’t complete: ${friendly(err)}` : result;
  await db.rpc("agent_record_result", { p_approval: id, p_result: outcome });
  revalidatePath("/provider/agent");
  return err ? { ok: false, error: outcome } : { ok: true, message: `Approved — ${result.toLowerCase()}`, redirect };
}

export async function toggleRoutine(id: string, enabled: boolean): Promise<ActionResult> {
  const { db } = await getProvider();
  const { error } = await db.rpc("provider_toggle_routine", { p_routine: id, p_enabled: enabled });
  if (error) return { ok: false, error: friendly(error) };
  if (enabled) { // the RPC only defaults a missing time to +1h: set the real next due time (the RPC already checked the role)
    const admin = createAdminClient();
    const { data: r } = await admin.from("agent_routines").select("id,workspace_id,schedule,trigger,last_run_at").eq("id", id).maybeSingle();
    if (r) { const next = await routineNextRun(admin as never, r as never, new Date()); await admin.from("agent_routines").update({ next_run_at: (next ?? new Date(FAR_FUTURE_ISO)).toISOString() }).eq("id", id); }
  }
  revalidatePath("/provider/agent");
  return { ok: true, message: enabled ? "Routine on" : "Routine paused" };
}

export async function controlRun(id: string, action: "pause" | "resume" | "cancel"): Promise<ActionResult> {
  const { db } = await getProvider();
  const { error } = await db.rpc("agent_control_run", { p_run: id, p_action: action });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/provider/agent");
  return { ok: true, message: action === "cancel" ? "Run cancelled" : action === "pause" ? "Run paused" : "Run resumed" };
}

/** Starts a durable run with a goal (quick tools, insight buttons). The worker picks it up; it only ever proposes changes. */
export async function startRun(goal: string): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const g = goal.trim().slice(0, 2000);
  if (g.length < 3) return { ok: false, error: "Describe what Gala Agent should do." };
  const { error } = await db.rpc("start_agent_run", { p_ws: workspace.id, p_surface: "provider", p_goal: g, p_tools: null, p_constraints: { note: "" }, p_idempotency: randomUUID() });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/provider/agent");
  return { ok: true, message: "Run started — you’ll see progress under Active runs", redirect: "/provider/agent" };
}
