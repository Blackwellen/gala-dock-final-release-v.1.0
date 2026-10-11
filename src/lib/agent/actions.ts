"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit } from "@/lib/security";
import { ask, applyApproval, compileRoutine, nextCron, FAR_FUTURE } from "./runtime";
import { TOOL } from "./registry";

// Gala Agent UI actions (§5, §10–13). Seat = the workspace the person is acting in; membership is re-checked server-side.
type Surface = "organizer" | "provider";
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATHS = ["/organizer/agent", "/provider/agent"];
const bump = () => PATHS.forEach(p => revalidatePath(p, "page"));

async function seat(workspaceId: string, roles = ["owner", "manager", "member", "finance"]) {
  if (!UUID.test(workspaceId)) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb.from("workspace_members").select("role,status,workspaces(kind)").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (!m || m.status !== "active" || !roles.includes(m.role)) return null;
  return { sb, user, role: m.role as string, kind: (m.workspaces as unknown as { kind: Surface }).kind };
}

/** Do / Goal mode: creates a durable run; the worker plans and executes it. */
export async function startRun(workspaceId: string, goal: string, mission?: string, quality: "fast" | "standard" | "deep" = "standard"): Promise<R<string>> {
  const s = await seat(workspaceId); if (!s) return { ok: false, error: "You don’t have access to this workspace." };
  if (goal.trim().length < 6) return { ok: false, error: "Describe what you want done." };
  if (!(await rateLimit(`agent-run:${s.user.id}`, 30, 3600))) return { ok: false, error: "Too many runs this hour." };
  const db = untyped(createAdminClient() as never);
  const { data: pol } = await db.from("agent_policies").select("max_parallel_runs").eq("workspace_id", workspaceId).maybeSingle();
  const { count } = await db.from("agent_runs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("status", ["queued", "planning", "running", "retrying", "awaiting_plan_confirmation"]);
  if ((count ?? 0) >= Number(pol?.max_parallel_runs ?? 3)) return { ok: false, error: "The maximum number of active runs is reached. Finish or cancel one first." };
  const key = createHash("sha256").update(`${s.user.id}:${goal.trim()}:${Math.floor(Date.now() / 60000)}`).digest("hex");
  const { data, error } = await db.from("agent_runs").insert({ workspace_id: workspaceId, user_id: s.user.id, surface: s.kind, mode: mission ? "mission" : "do", mission: mission ?? null,
    goal: goal.trim().slice(0, 2000), status: "queued", idempotency_key: key, plan: [], triggered_by: "user", quality: ["fast", "standard", "deep"].includes(quality) ? quality : "standard" }).select("id").single();
  if (error) return error.code === "23505" ? { ok: false, error: "That run was already started." } : { ok: false, error: "Couldn’t start the run." };
  await db.from("audit_events").insert({ actor_id: s.user.id, actor_type: "user", workspace_id: workspaceId, agent_run_id: data.id, event: "agent.run_started", metadata: { mission: mission ?? null } });
  bump();
  return { ok: true, data: data.id };
}

async function ownRun(runId: string) {
  if (!UUID.test(runId)) return null;
  const sb = await createClient();
  const { data: run } = await sb.from("agent_runs").select("id,workspace_id,status,user_id").eq("id", runId).maybeSingle();
  if (!run) return null;
  const s = await seat(run.workspace_id as string, ["owner", "manager"]); const { data: { user } } = await sb.auth.getUser();
  return s || run.user_id === user?.id ? { run, userId: user!.id } : null;
}

export async function confirmPlan(runId: string): Promise<R> {
  const o = await ownRun(runId); if (!o) return { ok: false, error: "Run not found." };
  if (o.run.status !== "awaiting_plan_confirmation") return { ok: false, error: "This plan isn’t waiting for confirmation." };
  await untyped(createAdminClient() as never).from("agent_runs").update({ status: "running", next_wake_at: null, updated_at: new Date().toISOString() }).eq("id", runId);
  bump(); return { ok: true };
}
export async function controlRun(runId: string, action: "cancel" | "pause" | "resume"): Promise<R> {
  const o = await ownRun(runId); if (!o) return { ok: false, error: "Run not found." };
  const to = action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "queued";
  const db = untyped(createAdminClient() as never);
  const { error } = await db.from("agent_runs").update({ status: to, lease_until: null, updated_at: new Date().toISOString(), ...(action === "cancel" ? { finished_at: new Date().toISOString() } : {}) }).eq("id", runId);
  if (error) return { ok: false, error: "That isn’t possible from the run’s current state." };
  if (action === "cancel") await db.from("agent_approvals").update({ status: "cancelled" }).eq("run_id", runId).eq("status", "pending");
  await db.from("audit_events").insert({ actor_id: o.userId, actor_type: "user", workspace_id: o.run.workspace_id, agent_run_id: runId, event: `agent.run_${action}`, metadata: {} });
  bump(); return { ok: true };
}

/** Approve / reject / edit-and-approve; approved actions run immediately as the approver. Batches only share low-risk tools of one run. */
export async function decideApproval(approvalId: string, approve: boolean, edited?: Record<string, unknown>): Promise<R> {
  if (!UUID.test(approvalId)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser(); if (!user) return { ok: false, error: "Please sign in again." };
  const { data: before } = await untyped(sb as never).from("agent_approvals").select("tool_id,payload").eq("id", approvalId).maybeSingle();
  if (edited && before?.tool_id) { const parsed = TOOL.get(before.tool_id)?.input.safeParse({ ...(before.payload as object), ...edited }); if (!parsed?.success) return { ok: false, error: "The edited values aren’t valid." }; }
  const { error } = await sb.rpc("decide_agent_approval" as never, { p_approval: approvalId, p_approve: approve, p_edited: edited ? { ...(before?.payload as object), ...edited } : null } as never);
  if (error) return { ok: false, error: /already_decided/.test(error.message) ? "Already decided." : /expired/.test(error.message) ? "This approval expired." : "You can’t decide this approval." };
  const r = await applyApproval(approvalId, user.id);
  bump(); return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Couldn’t apply the decision." };
}
export async function approveBatch(runId: string, batchKey: string): Promise<R<number>> {
  const sb = await createClient();
  const { data } = await untyped(sb as never).from("agent_approvals").select("id,risk").eq("run_id", runId).eq("batch_key", batchKey).eq("status", "pending").lte("risk", 3);
  let n = 0; for (const a of data ?? []) { const r = await decideApproval(a.id, true); if (r.ok) n++; }
  return { ok: true, data: n };
}

export async function askAgent(workspaceId: string, question: string): Promise<R<{ answer: string; sources: string[] }>> {
  const s = await seat(workspaceId); if (!s) return { ok: false, error: "You don’t have access to this workspace." };
  if (!(await rateLimit(`agent-ask:${s.user.id}`, 40, 3600))) return { ok: false, error: "Too many questions this hour." };
  const r = await ask(s.user.id, workspaceId, s.kind, question);
  if (!r.ok) return r;
  await untyped(createAdminClient() as never).from("agent_runs").insert({ workspace_id: workspaceId, user_id: s.user.id, surface: s.kind, mode: "ask", goal: question.slice(0, 2000), status: "completed",
    summary: r.answer.slice(0, 4000), result: r.answer.slice(0, 2000), tokens: r.tokens, progress: 100, finished_at: new Date().toISOString(), plan: r.sources });
  return { ok: true, data: { answer: r.answer, sources: r.sources } };
}

/** Routines (§13): compiled + validated before they can be saved. */
export async function saveRoutine(workspaceId: string, text: string): Promise<R> {
  const s = await seat(workspaceId, ["owner", "manager"]); if (!s) return { ok: false, error: "Only owners and managers can create routines." };
  const c = await compileRoutine(s.kind, text, { workspaceId, userId: s.user.id });
  if (!c.ok) return c;
  const t = c.compiled.trigger;
  const next = t.type === "event" ? new Date(FAR_FUTURE) : nextCron(t.cron, new Date());
  const { error } = await untyped(createAdminClient() as never).from("agent_routines").insert({ workspace_id: workspaceId, owner_id: s.user.id, title: c.compiled.title, detail: c.compiled.goal,
    schedule: t.type === "event" ? `on ${t.event}` : t.cron, trigger: t, actions: c.compiled.actions, limits: c.compiled.limits, compiled_at: new Date().toISOString(), enabled: true, next_run_at: next?.toISOString(), approval_policy: "policy" });
  if (error) return { ok: false, error: "Couldn’t save the routine." };
  bump(); return { ok: true };
}
export async function toggleRoutine(routineId: string, enabled: boolean): Promise<R> {
  if (!UUID.test(routineId)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { data: r } = await sb.from("agent_routines").select("workspace_id").eq("id", routineId).maybeSingle();
  if (!r || !(await seat(r.workspace_id, ["owner", "manager"]))) return { ok: false, error: "Not allowed." };
  await untyped(createAdminClient() as never).from("agent_routines").update({ enabled }).eq("id", routineId);
  bump(); return { ok: true };
}

/** Agent policy (§11). Owners only; a user can never grant the agent more than their own role (enforced at execution). */
export async function savePolicy(workspaceId: string, p: { mode: string; allowedTools: string[] | null; autoTools: string[]; quietFrom: string; quietTo: string; approvalExpiryHours: number;
  maxParallel: number; maxRunMinutes: number; minConfidence: number; dailySpendCapMinor: number; monthlySpendCapMinor: number; refundThresholdMinor: number; bookingAuthorityMinor: number;
  autopilotRules: { tool: string; max_amount_minor?: number }[] }): Promise<R> {
  const s = await seat(workspaceId, ["owner"]); if (!s) return { ok: false, error: "Only the workspace owner can change Agent policy." };
  if (!["always_ask", "suggest", "draft", "execute_with_approval", "operational", "policy_autopilot"].includes(p.mode)) return { ok: false, error: "Choose a mode." };
  const known = (ids: string[]) => ids.filter(i => TOOL.has(i) && TOOL.get(i)!.risk < 5);
  const { error } = await s.sb.from("agent_policies" as never).upsert({
    workspace_id: workspaceId, mode: p.mode, allowed_tools: p.allowedTools ? known(p.allowedTools) : null, auto_tools: known(p.autoTools).filter(i => TOOL.get(i)!.risk === 3),
    quiet_hours: { from: p.quietFrom || "21:00", to: p.quietTo || "08:00", tz: "Europe/London" }, approval_expiry_hours: Math.max(1, Math.min(720, p.approvalExpiryHours)),
    max_parallel_runs: Math.max(1, Math.min(20, p.maxParallel)), max_run_minutes: Math.max(5, Math.min(10080, p.maxRunMinutes)), min_confidence: Math.max(0, Math.min(1, p.minConfidence)),
    daily_spend_cap_minor: Math.max(0, p.dailySpendCapMinor), monthly_spend_cap_minor: Math.max(0, p.monthlySpendCapMinor), refund_threshold_minor: Math.max(0, p.refundThresholdMinor),
    booking_authority_minor: Math.max(0, p.bookingAuthorityMinor),
    autopilot_rules: p.mode === "policy_autopilot" ? p.autopilotRules.filter(r => TOOL.has(r.tool) && TOOL.get(r.tool)!.risk <= 4) : [],
    updated_by: s.user.id, updated_at: new Date().toISOString(),
  } as never);
  if (error) return { ok: false, error: "Couldn’t save the policy." };
  await untyped(createAdminClient() as never).from("audit_events").insert({ actor_id: s.user.id, actor_type: "user", workspace_id: workspaceId, event: "agent.policy_changed", metadata: { mode: p.mode } });
  bump(); return { ok: true };
}

/** Watch (§12 E): fire when a read-only tool's value meets a condition. No model calls while waiting. */
export async function createWatch(workspaceId: string, w: { title: string; tool: string; input: Record<string, unknown>; path: string; op: string; value?: unknown; everyMinutes: number; expiresInDays: number }): Promise<R<string>> {
  const s = await seat(workspaceId); if (!s) return { ok: false, error: "You don’t have access to this workspace." };
  const t = TOOL.get(w.tool); if (!t || t.risk !== 0) return { ok: false, error: "Watches can only use read-only tools." };
  const parsed = t.input.safeParse(w.input ?? {}); if (!parsed.success) return { ok: false, error: "Those tool inputs aren’t valid." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("create_agent_watch" as never, { p_workspace: workspaceId, p_title: w.title, p_tool: w.tool, p_input: parsed.data, p_condition: { path: w.path, op: w.op, value: w.value },
    p_every: w.everyMinutes, p_expires: new Date(Date.now() + Math.min(Math.max(w.expiresInDays, 1), 90) * 864e5).toISOString() } as never);
  if (error) return { ok: false, error: /limit_reached/.test(error.message) ? "This workspace already has 50 active watches." : /invalid_condition/.test(error.message) ? "Choose a valid condition." : "Couldn’t create the watch." };
  bump(); return { ok: true, data: data as unknown as string };
}

/** Batch mission (§12 H): one read, draft or low-risk tool across many records. Previewed (awaiting confirmation) before anything runs;
 *  per-record steps then run under the normal approval rules; pause/resume via the run controls; partial success is reported per record. */
export async function startBatch(workspaceId: string, title: string, tool: string, inputs: Record<string, unknown>[]): Promise<R<string>> {
  const s = await seat(workspaceId); if (!s) return { ok: false, error: "You don’t have access to this workspace." };
  const t = TOOL.get(tool); if (!t || t.risk > 2) return { ok: false, error: "Batches can use read, draft or low-risk internal tools only." };
  if (!inputs.length || inputs.length > 200) return { ok: false, error: "A batch needs between 1 and 200 records." };
  const bad = inputs.findIndex(i => !t.input.safeParse(i).success); if (bad >= 0) return { ok: false, error: `Record ${bad + 1} has invalid inputs.` };
  const db = untyped(createAdminClient() as never);
  const { data: run, error } = await db.from("agent_runs").insert({ workspace_id: workspaceId, user_id: s.user.id, surface: s.kind, mode: "mission", run_type: "batch", goal: title.slice(0, 2000), status: "queued",
    idempotency_key: createHash("sha256").update(`${s.user.id}:batch:${tool}:${JSON.stringify(inputs)}:${Math.floor(Date.now() / 60000)}`).digest("hex"), plan: [], triggered_by: "user", batch: { tool, count: inputs.length } }).select("id").single();
  if (error || !run) return { ok: false, error: "Couldn’t start the batch." };
  const { error: se } = await db.from("agent_run_steps").insert(inputs.map((input, i) => ({ run_id: run.id, seq: i + 1, tool_id: tool, input, reason: `Record ${i + 1} of ${inputs.length}`, idempotency_key: `${run.id}:${i + 1}` })));
  if (se) return { ok: false, error: "Couldn’t create the batch steps." };
  await db.from("agent_runs").update({ status: "planning" }).eq("id", run.id);
  await db.from("agent_runs").update({ status: "awaiting_plan_confirmation", interpretation: { summary: `${t.title} for ${inputs.length} records`, scope: [tool] } }).eq("id", run.id);
  bump(); return { ok: true, data: run.id };
}
