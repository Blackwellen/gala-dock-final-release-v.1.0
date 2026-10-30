"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Event dependency graph (domain 36), task dependencies (42.5) and the canonical event brief (39). Every rule is enforced in the
 * database commands (event_dependencies guard, add/remove/set_task_dependencies, decide_event_dependency_approval,
 * save_event_brief); these actions only validate input and translate errors.
 */
const Id = z.string().uuid();
const DependentKind = z.enum(["task", "milestone", "ticket_tier", "booking"]);
const PrereqKind = z.enum(["task", "milestone", "ticket_tier", "booking", "payment", "team", "venue", "compliance", "approval"]);
const AddDep = z.object({ event_id: Id, dependent_kind: DependentKind, dependent_id: Id, prerequisite_kind: PrereqKind, prerequisite_id: Id.nullable().optional(),
  hard: z.boolean().default(true), lag_minutes: z.number().int().min(0).max(525600).default(0), note: z.string().max(500).default(""), approval_expires_at: z.string().datetime().nullable().optional() });

export type DependencyGraph = {
  nodes: { key: string; kind: string; id: string | null; label: string | null; due_at: string | null; met: boolean }[];
  edges: { id: string; dependent: string; prerequisite: string; hard: boolean; lag_minutes: number; met: boolean; note: string; approval_status: string | null; approval_expires_at: string | null }[];
  blocked: { key: string; blocked_by: string[] }[];
  critical_path: string[];
};

const why = (m: string) => /dependency_cycle/.test(m) ? "That would create a circular dependency." : /dependency_item_not_in_event/.test(m) ? "Both items must belong to this event."
  : /not_authorized|42501/.test(m) ? "You don't have permission to change this event's plan." : /blocked_by_dependencies/.test(m) ? "Finish the items this depends on first."
  : /already_decided/.test(m) ? "This approval has already been decided." : /approval_expired/.test(m) ? "This approval request has expired."
  : /too_many_dependencies/.test(m) ? "A task can depend on at most 50 others." : /invalid_brief/.test(m) ? "Some brief fields are too long or in the wrong format."
  : /not_found|P0002/.test(m) ? "That item no longer exists. Refresh and try again." : /check constraint|23514/.test(m) ? "An item can't depend on itself." : "Could not update the plan.";

async function sb() { return untyped(await createClient()); }

export async function getDependencyGraph(eventId: string): Promise<ActionResult<DependencyGraph>> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Invalid event." };
  const { data, error } = await (await sb()).rpc("event_dependency_graph", { p_event: eventId });
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true, data: data as DependencyGraph };
}

export async function addDependency(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = AddDep.safeParse(input); if (!p.success) return { ok: false, error: "Choose what depends on what." };
  const d = p.data;
  const { data, error } = await (await sb()).rpc("add_event_dependency", { p_event: d.event_id, p_dependent_kind: d.dependent_kind, p_dependent_id: d.dependent_id,
    p_prerequisite_kind: d.prerequisite_kind, p_prerequisite_id: d.prerequisite_id ?? null, p_hard: d.hard, p_lag_minutes: d.lag_minutes, p_note: d.note, p_approval_expires_at: d.approval_expires_at ?? null });
  if (error) return { ok: false, error: why(error.message) };
  revalidatePath(`/organizer/events/${d.event_id}`); revalidatePath(`/account/events/${d.event_id}`);
  return { ok: true, data: { id: (data as { id: string }).id }, message: "Dependency added." };
}

export async function removeDependency(dependencyId: string): Promise<ActionResult> {
  if (!Id.safeParse(dependencyId).success) return { ok: false, error: "Invalid dependency." };
  const { error } = await (await sb()).rpc("remove_event_dependency", { p_dependency: dependencyId });
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true, message: "Dependency removed." };
}

export async function setTaskDependencies(taskId: string, prerequisites: string[]): Promise<ActionResult> {
  if (!Id.safeParse(taskId).success || !z.array(Id).max(50).safeParse(prerequisites).success) return { ok: false, error: "Invalid task." };
  const { error } = await (await sb()).rpc("set_task_dependencies", { p_task: taskId, p_prerequisites: prerequisites });
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true, message: "Task dependencies saved." };
}

export async function decideApproval(dependencyId: string, approve: boolean, reason = ""): Promise<ActionResult> {
  if (!Id.safeParse(dependencyId).success) return { ok: false, error: "Invalid approval." };
  const { error } = await (await sb()).rpc("decide_event_dependency_approval", { p_dependency: dependencyId, p_approve: approve, p_reason: reason.slice(0, 500) });
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true, message: approve ? "Approved." : "Rejected." };
}

const Str = z.string().trim().min(1).max(300);
const Brief = z.object({
  goals: z.array(Str).max(20).default([]), client_needs: z.string().max(4000).default(""), scope: z.string().max(4000).default(""),
  audience: z.object({ size: z.number().int().min(0).max(1_000_000).optional(), adults: z.number().int().min(0).optional(), children: z.number().int().min(0).optional(), ages: z.string().max(60).optional(), profile: z.string().max(1000).optional() }).default({}),
  budget_min: z.number().min(0).nullable().optional(), budget_max: z.number().min(0).nullable().optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  location_needs: z.string().max(2000).default(""), venue_needs: z.record(z.string().max(40), z.union([z.string().max(1000), z.number(), z.boolean()])).default({}),
  supplier_needs: z.record(z.string().max(40), z.string().max(2000)).default({}), style: z.record(z.string().max(40), z.string().max(500)).default({}),
  must_haves: z.array(Str).max(30).default([]), constraints: z.array(Str).max(30).default([]),
  accessibility: z.record(z.string().max(40), z.union([z.string().max(1000), z.boolean()])).default({}), success_measures: z.array(Str).max(20).default([]),
  internal_notes: z.string().max(4000).default(""),
}).refine(b => b.budget_min == null || b.budget_max == null || b.budget_max >= b.budget_min, "The budget maximum must be at least the minimum.");

/** Save a new brief version. Pass the version you edited (optimistic concurrency); a conflict returns the current version. */
export async function saveBrief(eventId: string, input: unknown, expectedVersion: number | null, changeNote = ""): Promise<ActionResult<{ version: number; conflict?: boolean }>> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Invalid event." };
  const p = Brief.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the brief." };
  const { data, error } = await (await sb()).rpc("save_event_brief", { p_event: eventId, p_brief: p.data, p_expected_version: expectedVersion, p_change_note: changeNote.slice(0, 300) });
  if (error) return { ok: false, error: why(error.message) };
  const r = data as { ok: boolean; version?: number; conflict?: boolean; current?: number };
  if (!r.ok) return { ok: false, error: `Someone saved a newer brief (version ${r.current}). Reload to see it before saving.`, data: { version: Number(r.current ?? 0), conflict: true } };
  revalidatePath(`/organizer/events/${eventId}`); revalidatePath(`/account/events/${eventId}`);
  return { ok: true, data: { version: r.version! }, message: `Brief saved (version ${r.version}).` };
}

/** Current brief (team) — RLS limits it to people who can open the event. */
export async function getBrief(eventId: string) {
  if (!Id.safeParse(eventId).success) return null;
  const { data } = await (await sb()).from("event_briefs").select("*").eq("event_id", eventId).eq("is_current", true).maybeSingle();
  return data as Record<string, unknown> | null;
}

/** Latest brief version with a display name for its author (for the conflict notice and compare view). */
export async function getBriefLatest(eventId: string): Promise<ActionResult<{ brief: Record<string, unknown> | null; author: string }>> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Invalid event." };
  const client = await createClient(); const db = untyped(client);
  const { data, error } = await db.from("event_briefs").select("*").eq("event_id", eventId).eq("is_current", true).maybeSingle();
  if (error) return { ok: false, error: "Could not load the brief." };
  const b = data as Record<string, unknown> | null;
  return { ok: true, data: { brief: b, author: b ? await briefAuthor(client, eventId, String(b.created_by ?? "")) : "" } };
}

/** Display name for a brief author: "you", the teammate's crew-directory name in the event's workspace, or "a teammate". */
async function briefAuthor(client: Awaited<ReturnType<typeof createClient>>, eventId: string, userId: string): Promise<string> {
  if (!userId) return "a teammate";
  const { data: { user } } = await client.auth.getUser();
  if (user?.id === userId) return "you";
  const { data: ev } = await client.from("events").select("workspace_id").eq("id", eventId).maybeSingle();
  if (!ev?.workspace_id) return "a teammate";
  const { data: c } = await client.from("crew_members").select("name").eq("workspace_id", ev.workspace_id).eq("user_id", userId).limit(1).maybeSingle();
  return c?.name || "a teammate";
}

/** A booked provider's scoped copy of the brief (no client contact details, no budget, only their category's needs). */
export async function getProviderBrief(buildItemId: string) {
  if (!Id.safeParse(buildItemId).success) return null;
  const { data, error } = await (await sb()).rpc("provider_event_brief", { p_build_item: buildItemId });
  return error ? null : (data as Record<string, unknown> | null);
}
