"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { chat, SAFETY, agentConfigured } from "@/lib/agent/llm";
import { buildContext } from "@/lib/agent/context";
import { rateLimit } from "@/lib/security";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";

const SCOPES = ["event", "workspace", "provider", "ticketing", "promotion", "team", "money", "calendar"] as const;
const Run = z.object({ goal: z.string().trim().min(8).max(1500), scope: z.array(z.enum(SCOPES)).max(8), event_id: z.string().uuid().nullable() });

/** Start a planning run: the model drafts a step plan from RLS-scoped context. Runs never execute actions directly —
 *  anything with impact becomes an approval. */
export async function startRun(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = Run.safeParse(input); if (!p.success) return { ok: false, error: "Describe what you want to achieve (at least a few words)." };
  const ctx = await getOrganizer();
  if (!(await rateLimit(`agent-run:${ctx.user.id}`, 20, 3600))) return { ok: false, error: "You've reached the hourly run limit." };
  if (p.data.event_id) { const { data: ev } = await ctx.supabase.from("events").select("id").eq("id", p.data.event_id).eq("workspace_id", ctx.workspace.id).maybeSingle(); if (!ev) return { ok: false, error: "Event not found." }; }
  let plan: { title: string; detail?: string }[] = [];
  if (agentConfigured()) {
    try {
      const context = await buildContext(ctx.supabase, ctx.user.id, "organizer", p.data.event_id ?? undefined);
      const { text } = await chat([{ role: "system", content: `${SAFETY}\nReturn JSON {"steps":[{"title":string,"detail":string}]} with 3-7 concrete steps an event organizer's assistant would take. Never claim to have done anything.` }, { role: "user", content: `<data>\n${context ?? "No records."}\n</data>\nGoal: ${p.data.goal}\nAreas: ${p.data.scope.join(", ") || "any"}` }], { model: "mini", maxTokens: 600, json: true });
      const j = JSON.parse(text || "{}") as { steps?: { title?: string; detail?: string }[] };
      plan = (j.steps ?? []).filter(s => s.title).slice(0, 7).map(s => ({ title: String(s.title).slice(0, 140), detail: String(s.detail ?? "").slice(0, 300) }));
    } catch { /* fall back to a manual plan */ }
  }
  if (!plan.length) plan = [{ title: "Review the goal and current records" }, { title: "Draft the plan and owners" }, { title: "Request approval for any external action" }];
  const admin = createAdminClient();
  const { data, error } = await admin.from("agent_runs").insert({ user_id: ctx.user.id, workspace_id: ctx.workspace.id, event_id: p.data.event_id, goal: p.data.goal, scope: p.data.scope, plan: plan as unknown as Json, status: "waiting_approval", progress: 10, current_step: 1, run_type: "plan", surface: "organizer", triggered_by: "user", agent_name: "Gala Agent", waiting_reason: "Review the proposed plan" }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not start the run." };
  revalidatePath("/organizer/agent"); return { ok: true, message: agentConfigured() ? `Plan drafted with ${plan.length} steps.` : "Run created (AI planning isn't configured here).", data: { id: data.id } };
}

export async function decideApproval(id: string, approve: boolean): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Approval not found." };
  const ctx = await getOrganizer();
  const { error } = await ctx.supabase.rpc("decide_agent_approval", { p_approval: id, p_approve: approve });
  if (error) return { ok: false, error: error.message.includes("already_decided") ? "This was already decided." : error.message.includes("not_authorized") ? "Only owners and managers can approve agent actions." : "Could not record your decision." };
  revalidatePath("/organizer/agent"); return { ok: true, message: approve ? "Approved — it will be carried out by the trusted server process." : "Rejected. Nothing was changed." };
}

export async function toggleRoutine(id: string, enabled: boolean): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Routine not found." };
  const ctx = await getOrganizer();
  const { error } = await ctx.supabase.from("agent_routines").update({ enabled }).eq("id", id).eq("workspace_id", ctx.workspace.id);
  if (error) return { ok: false, error: "Could not update the routine." };
  revalidatePath("/organizer/agent"); return { ok: true, message: enabled ? "Routine on." : "Routine paused." };
}

const Routine = z.object({ title: z.string().trim().min(3).max(80), schedule: z.string().trim().min(3).max(80), detail: z.string().max(300) });
export async function createRoutine(input: unknown): Promise<ActionResult> {
  const p = Routine.safeParse(input); if (!p.success) return { ok: false, error: "Give the routine a name and schedule." };
  const ctx = await getOrganizer();
  const { error } = await ctx.supabase.from("agent_routines").insert({ ...p.data, workspace_id: ctx.workspace.id, enabled: true, approval_policy: "Require approval for high-impact actions" });
  if (error) return { ok: false, error: "Could not create the routine." };
  revalidatePath("/organizer/agent"); return { ok: true, message: "Routine created." };
}
