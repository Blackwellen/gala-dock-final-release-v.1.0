"use server";
import { z } from "zod";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { canTransition } from "@/lib/domain/state-machines";
import type { EventBlocker } from "@/lib/events/lifecycle";
import type { ActionResult } from "./shell";

/**
 * Status menu options for one event (W11 / W03): only moves the `event` state machine allows from the current status, with the
 * role rule event_transition applies (cancel / postpone / suspend / archive = owners and managers; finance can't change status)
 * and a live `event_lifecycle_blockers` preview for every gated target, so the menu never offers a move the database refuses
 * without saying why and where to fix it. Read-only: nothing is changed here.
 */
export type StatusOption = { to: string; allowed: boolean; reason: string | null; blockers: EventBlocker[] };
export type StatusOptions = { status: string; role: string; canWrite: boolean; options: StatusOption[] };

/** The product menu (a curated subset of the machine; branches are offered where they make sense to an organiser). */
const MENU: Record<string, string[]> = { draft: ["planning", "ready"], planning: ["ready", "published", "postponed", "cancelled"], ready: ["published", "on_sale", "planning", "postponed", "cancelled"], published: ["on_sale", "ready", "postponed", "cancelled"], on_sale: ["live", "published", "postponed", "suspended", "cancelled"], live: ["completed", "suspended"], suspended: ["on_sale", "live", "cancelled"], postponed: ["planning", "cancelled"], completed: ["closed"], closed: ["archived"], cancelled: ["archived"], archived: [] };
const BRANCH = new Set(["cancelled", "postponed", "suspended", "archived"]);
const GATED = new Set(["ready", "published", "on_sale", "live", "completed"]);

export async function eventStatusOptions(eventId: string): Promise<ActionResult<StatusOptions>> {
  if (!z.string().uuid().safeParse(eventId).success) return { ok: false, error: "Invalid event." };
  const ctx = await getOrganizer(); const db = untyped(ctx.supabase);
  const { data: e } = await ctx.supabase.from("events").select("id,status,workspace_id").eq("id", eventId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found in this workspace." };
  const { data: canWrite } = await db.rpc("has_permission", { p_workspace: ctx.workspace.id, p_permission: "events.write" });
  const role = String(ctx.role);
  const manager = ["owner", "manager"].includes(role);
  const targets = (MENU[e.status] ?? []).filter(to => canTransition("event", e.status, to));
  const options = await Promise.all(targets.map(async (to): Promise<StatusOption> => {
    if (canWrite !== true) return { to, allowed: false, reason: `Your role (${role}) can view this event but can't change its status.`, blockers: [] };
    if (BRANCH.has(to) && !manager) return { to, allowed: false, reason: "Only owners and managers can cancel, postpone, suspend or archive an event.", blockers: [] };
    if (!GATED.has(to)) return { to, allowed: true, reason: null, blockers: [] };
    const { data, error } = await db.rpc("event_lifecycle_blockers", { p_event: e.id, p_to: to });
    if (error) return { to, allowed: true, reason: null, blockers: [] };   // preview unavailable: event_transition still checks on submit
    const blockers = (Array.isArray(data) ? data : []) as EventBlocker[];
    return { to, allowed: blockers.length === 0, reason: blockers.length ? `${blockers.length} thing${blockers.length === 1 ? "" : "s"} to fix first` : null, blockers };
  }));
  return { ok: true, data: { status: e.status, role, canWrite: canWrite === true, options } };
}
