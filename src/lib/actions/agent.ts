"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { agentConfigured } from "@/lib/agent/llm";
import * as Agent from "@/lib/agent/actions";
import type { ActionResult } from "./shell";

// Organizer Gala Agent screen actions — thin adapters over the durable runtime (src/lib/agent/*). Signatures kept for the UI.
const SCOPES = ["event", "workspace", "provider", "ticketing", "promotion", "team", "money", "calendar"] as const;
const Run = z.object({ goal: z.string().trim().min(8).max(1500), scope: z.array(z.enum(SCOPES)).max(8), event_id: z.string().uuid().nullable() });

/** Do/Goal mode: creates a persisted run that the worker plans (typed tools) and executes step by step with approvals. */
export async function startRun(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = Run.safeParse(input); if (!p.success) return { ok: false, error: "Describe what you want to achieve (at least a few words)." };
  const ctx = await getOrganizer();
  let goal = p.data.goal;
  if (p.data.event_id) {
    const { data: ev } = await ctx.supabase.from("events").select("id,name").eq("id", p.data.event_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!ev) return { ok: false, error: "Event not found." };
    goal = `${goal}\n(Event: ${ev.name}, event_id ${ev.id})`;
  }
  if (p.data.scope.length) goal = `${goal}\n(Focus: ${p.data.scope.join(", ")})`;
  const r = await Agent.startRun(ctx.workspace.id, goal);
  if (!r.ok) return r;
  if (p.data.event_id || p.data.scope.length) await untyped(createAdminClient() as never).from("agent_runs").update({ event_id: p.data.event_id, scope: p.data.scope }).eq("id", r.data!);
  revalidatePath("/organizer/agent");
  return { ok: true, message: agentConfigured() ? "Run started — Gala Agent is planning. You can close this page; it keeps working." : "Run queued — AI planning isn’t configured in this environment yet.", data: { id: r.data! } };
}

export async function decideApproval(id: string, approve: boolean): Promise<ActionResult> {
  const r = await Agent.decideApproval(id, approve);
  if (!r.ok) return r;
  revalidatePath("/organizer/agent");
  return { ok: true, message: approve ? "Approved — carried out as you, and the run continues." : "Rejected. Nothing was changed; the run continues without it." };
}

export async function toggleRoutine(id: string, enabled: boolean): Promise<ActionResult> {
  const r = await Agent.toggleRoutine(id, enabled);
  return r.ok ? { ok: true, message: enabled ? "Routine on." : "Routine paused." } : r;
}

const Routine = z.object({ title: z.string().trim().min(3).max(80), schedule: z.string().trim().min(3).max(80), detail: z.string().max(300) });
/** Routines are compiled from natural language into a validated trigger + tool actions before saving (§13). */
export async function createRoutine(input: unknown): Promise<ActionResult> {
  const p = Routine.safeParse(input); if (!p.success) return { ok: false, error: "Give the routine a name and schedule." };
  const ctx = await getOrganizer();
  const r = await Agent.saveRoutine(ctx.workspace.id, `${p.data.title}. Schedule: ${p.data.schedule}. ${p.data.detail}`);
  return r.ok ? { ok: true, message: "Routine compiled and scheduled." } : r;
}
