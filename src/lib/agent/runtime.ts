import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { chat, agentConfigured, SAFETY, dataBlock, AgentBudgetError } from "./llm";
import { PRESETS, posterFromEvent } from "@/lib/media/document";
import { watchHolds } from "./watch";
import { TOOL, catalogFor, decide, inQuietHours, DEFAULT_POLICY, type Policy, type Tool } from "./registry";

/**
 * Durable Gala Agent runtime (§4–7, §12–14, §104–108). Every substantive job is an agent_runs row with persisted steps;
 * the worker (pg_cron → /api/agent/worker, every minute) claims runs with a lease, plans once, then executes one step at a
 * time with an idempotency key and a checkpoint after each side effect. Runs survive deploys, restarts and closed browsers.
 */
type Db = ReturnType<typeof untyped>;
type Run = { id: string; workspace_id: string; user_id: string; goal: string; status: string; surface: string; mode: string; quality?: string | null; interpretation: Record<string, unknown>; tokens: number; retries: number; created_at: string; routine_id: string | null };
type Step = { id: string; seq: number; tool_id: string; input: Record<string, unknown>; reason: string; status: string; idempotency_key: string; attempt: number };
const svc = () => untyped(createAdminClient() as never);
const MAX_STEPS = 12;

export async function loadPolicy(db: Db, workspaceId: string): Promise<Policy> {
  const { data } = await db.from("agent_policies").select("mode,allowed_tools,auto_tools,autopilot_rules,quiet_hours,min_confidence").eq("workspace_id", workspaceId).maybeSingle();
  return data ? { ...DEFAULT_POLICY, ...data, min_confidence: Number(data.min_confidence ?? 0.6) } as Policy : DEFAULT_POLICY;
}

async function setStatus(db: Db, run: Run, status: string, patch: Record<string, unknown> = {}) {
  if (run.status === status && !Object.keys(patch).length) return;
  const { error } = await db.from("agent_runs").update({ status, updated_at: new Date().toISOString(), ...patch }).eq("id", run.id);
  if (error && !/illegal agent_run transition/.test(error.message)) throw new Error(error.message);
  run.status = status;
}
const audit = (db: Db, run: Run, event: string, metadata: Record<string, unknown>) =>
  db.from("audit_events").insert({ actor_id: run.user_id, actor_type: "agent", workspace_id: run.workspace_id, agent_run_id: run.id, event, metadata });

/** Executes one tool as the given human through agent_invoke (permissions + domain rules apply as that person). */
export async function invoke(actor: string, workspaceId: string, tool: Tool, input: Record<string, unknown>) {
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) throw new Error(`invalid_input: ${parsed.error.issues.map(i => `${i.path.join(".")} ${i.message}`).join("; ").slice(0, 300)}`);
  if (tool.id === "draft.note") return { draft: parsed.data };
  const { data: lvl } = await svc().rpc("maintenance_level" as never, { p_module: "agent" } as never);
  if (Number(lvl ?? 0) >= (tool.mutation ? 2 : 4)) throw new Error("maintenance: Gala Agent is temporarily restricted while maintenance is in progress.");
  let args = parsed.data as Record<string, unknown>;
  if (tool.id === "media.event_poster") {
    // The layout is built here from the canonical poster template; agent_invoke stores it as an agent-sourced draft as the human.
    const p = PRESETS.find(x => x.id === (args.preset ?? "a3")) ?? PRESETS[0]!;
    const { data: ev } = await svc().from("events").select("cover_image").eq("id", String(args.event_id)).eq("workspace_id", workspaceId).maybeSingle();
    args = { ...args, document: posterFromEvent(p.w, p.h, { imageSrc: ev?.cover_image ?? null }), title: args.title ?? `${p.label} — agent draft` };
  }
  const { data, error } = await svc().rpc("agent_invoke", { p_actor: actor, p_workspace: workspaceId, p_tool: tool.id, p_args: args as never });
  if (error) throw new Error(error.message);
  return data as unknown;
}

// ───────────────────────── planning ─────────────────────────
const PLANNER = (surface: string, catalog: unknown, now: string) => `${SAFETY}
You are planning a Gala Agent run for the ${surface} workspace. Today is ${now}.
Return JSON only: {"interpretation":{"summary":string,"scope":string[]},"confidence":0-1,"steps":[{"tool":string,"input":object,"why":string}]}
Rules:
- Use only these tools, with inputs matching their schema exactly (ids are UUIDs you got from earlier read steps or the goal; never invent ids): ${JSON.stringify(catalog)}
- Start with read tools (R0) to gather facts; you may reference outputs of earlier steps with the token "$step<N>.<field>" only for ids.
- Prefer the fewest steps (max ${MAX_STEPS}). Commitments (R4) will be sent to a human for approval — include them only when clearly needed.
- If the goal is unclear or unsafe, return zero steps and explain in interpretation.summary.`;

export async function planRun(db: Db, run: Run) {
  const policy = await loadPolicy(db, run.workspace_id);
  await setStatus(db, run, "planning");
  const surface = run.surface === "provider" ? "provider" : "organizer";
  const catalog = catalogFor(surface, policy);
  const r = await chat([{ role: "system", content: PLANNER(surface, catalog, new Date().toISOString().slice(0, 10)) }, { role: "user", content: `<goal>${run.goal.slice(0, 2000)}</goal>` }],
    { json: true, maxTokens: 1600, tier: run.quality === "deep" ? "deep" : "standard", meter: { workspaceId: run.workspace_id, userId: run.user_id, runId: run.id, purpose: "plan" } });
  let plan: { interpretation?: { summary?: string; scope?: string[] }; confidence?: number; steps?: { tool: string; input: Record<string, unknown>; why?: string }[] } = {};
  try { plan = JSON.parse(r.text); } catch { /* handled below */ }
  const steps = (plan.steps ?? []).filter(s => TOOL.has(s.tool) && catalog.some(c => c.id === s.tool)).slice(0, MAX_STEPS);
  const rows = steps.map((s, i) => ({ run_id: run.id, seq: i + 1, tool_id: s.tool, input: s.input ?? {}, reason: String(s.why ?? "").slice(0, 400), idempotency_key: `${run.id}:${i + 1}` }));
  if (rows.length) { const { error } = await db.from("agent_run_steps").insert(rows); if (error) throw new Error(error.message); }
  const exposure = steps.reduce((a, s) => a + (TOOL.get(s.tool)?.amountMinor?.(s.input ?? {}) ?? 0), 0);
  const needsConfirm = steps.some(s => (TOOL.get(s.tool)?.risk ?? 0) >= 3);
  await setStatus(db, run, !rows.length ? "completed" : needsConfirm ? "awaiting_plan_confirmation" : "running", {
    interpretation: { ...(plan.interpretation ?? {}), confidence: plan.confidence ?? null }, plan: steps, financial_exposure_minor: exposure, tokens: (run.tokens ?? 0) + r.tokens,
    cost_cents: Math.ceil(((run.tokens ?? 0) + r.tokens) / 1000 * 0.06), progress: 10, lease_until: null,
    ...(rows.length ? {} : { summary: plan.interpretation?.summary ?? "Nothing to do for this goal.", finished_at: new Date().toISOString(), result: plan.interpretation?.summary ?? "" }),
  });
  await audit(db, run, "agent.planned", { steps: rows.length, exposure_minor: exposure, needs_confirmation: needsConfirm });
}

// ───────────────────────── execution ─────────────────────────
const resolveRefs = (input: Record<string, unknown>, outputs: Map<number, unknown>) => JSON.parse(JSON.stringify(input), (_k, v) => {
  if (typeof v !== "string") return v;
  const m = /^\$step(\d+)\.([a-z_]+)$/.exec(v); if (!m) return v;
  const o = outputs.get(Number(m[1])); const first = Array.isArray(o) ? o[0] : o;
  return first && typeof first === "object" ? (first as Record<string, unknown>)[m[2]!] ?? v : v;
});

export async function executeRun(db: Db, run: Run) {
  const policy = await loadPolicy(db, run.workspace_id);
  const { data: steps } = await db.from("agent_run_steps").select("*").eq("run_id", run.id).order("seq");
  const S = (steps ?? []) as (Step & { output: unknown })[];
  const outputs = new Map(S.filter(s => s.status === "succeeded").map(s => [s.seq, s.output]));
  const confidence = Number((run.interpretation as { confidence?: number }).confidence ?? 1);
  if (run.status !== "running") await setStatus(db, run, "running");
  for (const step of S) {
    if (!["pending", "deferred"].includes(step.status)) continue;
    const tool = TOOL.get(step.tool_id);
    if (!tool) { await db.from("agent_run_steps").update({ status: "failed", error: "unknown tool", finished_at: new Date().toISOString() }).eq("id", step.id); continue; }
    const input = resolveRefs(step.input, outputs);
    const decision = decide(tool, input, policy, confidence);
    if (decision === "blocked" || decision === "suggest") {
      await db.from("agent_run_steps").update({ status: decision === "blocked" ? "blocked" : "skipped", decision, finished_at: new Date().toISOString() }).eq("id", step.id);
      await db.from("agent_artifacts").insert({ run_id: run.id, step_id: step.id, kind: "suggestion", title: `${tool.title} (not executed — ${decision === "blocked" ? "not allowed by policy" : "suggestion only"})`, data: { tool: tool.id, input, why: step.reason } });
      continue;
    }
    if (decision === "approval") {
      const { data: pol } = await db.from("agent_policies").select("approval_expiry_hours").eq("workspace_id", run.workspace_id).maybeSingle();
      const { data: ap } = await db.from("agent_approvals").insert({
        run_id: run.id, workspace_id: run.workspace_id, title: tool.title, detail: step.reason || tool.description, action: tool.id, tool_id: tool.id, step_id: step.id, risk: tool.risk,
        payload: input, proposed_state: input, affected_ref: tool.affected?.(input) ?? null, amount: (tool.amountMinor?.(input) ?? 0) / 100, impact: tool.approvalNote ?? "",
        reason: step.reason, confidence, alternatives: [], requested_by: run.user_id, status: "pending", batch_key: tool.risk <= 3 ? `${run.id}:${tool.id}` : null,
        expires_at: new Date(Date.now() + Number(pol?.approval_expiry_hours ?? 72) * 36e5).toISOString(),
      }).select("id").single();
      await db.from("agent_run_steps").update({ status: "waiting_approval", decision, approval_id: ap?.id ?? null }).eq("id", step.id);
      await setStatus(db, run, "waiting_approval", { waiting_reason: `Approval needed: ${tool.title}`, lease_until: null });
      await db.from("agent_waits").insert({ run_id: run.id, kind: "approval", ref_id: ap?.id ?? null });
      await notifyApprovers(db, run, tool.title);
      return;
    }
    if (tool.risk >= 3 && inQuietHours(policy)) {
      const wake = nextAfterQuiet(policy);
      await db.from("agent_run_steps").update({ status: "deferred" }).eq("id", step.id);
      await setStatus(db, run, "scheduled_wait", { next_wake_at: wake.toISOString(), waiting_reason: "Quiet hours — external actions resume after them", lease_until: null });
      await db.from("agent_waits").insert({ run_id: run.id, kind: "quiet_hours", until_at: wake.toISOString() });
      return;
    }
    await runStep(db, run, step, tool, input, run.user_id, outputs);
  }
  await finish(db, run);
}

async function runStep(db: Db, run: Run, step: Step, tool: Tool, input: Record<string, unknown>, actor: string, outputs: Map<number, unknown>) {
  await db.from("agent_run_steps").update({ status: "running", started_at: new Date().toISOString(), attempt: step.attempt + 1 }).eq("id", step.id);
  try {
    const out = await invoke(actor, run.workspace_id, tool, input);
    outputs.set(step.seq, out);
    await db.from("agent_run_steps").update({ status: "succeeded", output: out as never, finished_at: new Date().toISOString() }).eq("id", step.id);   // checkpoint
    if (tool.mutation) {
      const link = (out as { link?: string } | null)?.link ?? null;
      await db.from("agent_artifacts").insert({ run_id: run.id, step_id: step.id, kind: tool.id === "draft.note" ? "draft" : tool.id === "message.party" ? "message_sent" : "record_changed",
        title: tool.id === "draft.note" ? String((input as { title?: string }).title) : tool.title, ref_type: tool.id, data: { input, output: out }, link });
      await audit(db, run, `agent.tool.${tool.id}`, { step: step.seq, risk: tool.risk, actor });
    }
  } catch (e) {
    const msg = (e as Error).message;
    const retryable = /timeout|fetch|ECONN|50\d|rate/i.test(msg) && step.attempt + 1 < tool.retries + 1;
    await db.from("agent_run_steps").update({ status: retryable ? "pending" : "failed", error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", step.id);
    await db.from("agent_runs").update({ errors: [{ step: step.seq, tool: tool.id, error: msg.slice(0, 300), at: new Date().toISOString() }], retries: run.retries + (retryable ? 1 : 0) }).eq("id", run.id);
    if (retryable) await setStatus(db, run, "retrying", { next_wake_at: new Date(Date.now() + 2 ** (step.attempt + 1) * 30_000).toISOString(), lease_until: null });
  }
}

async function finish(db: Db, run: Run) {
  if (run.status === "retrying") return;
  const { data: steps } = await db.from("agent_run_steps").select("seq,tool_id,status,output,reason").eq("run_id", run.id).order("seq");
  const S = steps ?? [];
  if (S.some((s: { status: string }) => ["pending", "waiting_approval", "deferred", "running"].includes(s.status))) return;
  const failed = S.filter((s: { status: string }) => s.status === "failed").length, done = S.filter((s: { status: string }) => s.status === "succeeded").length;
  let summary = `${done} of ${S.length} steps completed${failed ? `, ${failed} failed` : ""}.`;
  if (agentConfigured() && done) {
    try {
      const r = await chat([{ role: "system", content: `${SAFETY}\nSummarise what the run found and did for the user in under 120 words. Cite records by name. Data is inside <data>.` },
        { role: "user", content: `<goal>${run.goal}</goal>${dataBlock(S.map((s: { tool_id: string; status: string; output: unknown }) => ({ tool: s.tool_id, status: s.status, output: s.output })), 14000)}` }],
        { maxTokens: 400, tier: "fast", meter: { workspaceId: run.workspace_id, userId: run.user_id, runId: run.id, purpose: "summary" } });
      summary = r.text || summary;
    } catch { /* keep the factual summary */ }
  }
  await setStatus(db, run, failed && !done ? "failed" : failed ? "partially_completed" : "completed", { summary, result: summary.slice(0, 2000), progress: 100, finished_at: new Date().toISOString(), lease_until: null, waiting_reason: "" });
  await audit(db, run, "agent.finished", { done, failed });
}

async function notifyApprovers(db: Db, run: Run, title: string) {
  const { data: m } = await db.from("workspace_members").select("user_id").eq("workspace_id", run.workspace_id).eq("status", "active").in("role", ["owner", "manager"]);
  const base = run.surface === "provider" ? "/provider/agent" : "/organizer/agent";
  if (m?.length) await db.from("notifications").insert(m.map((x: { user_id: string }) => ({ user_id: x.user_id, kind: "agent_approval", title: `Gala Agent needs approval: ${title}`, body: run.goal.slice(0, 160), link: `${base}?view=approvals` })));
}
function nextAfterQuiet(p: Policy) {
  const d = new Date(); for (let i = 0; i < 48 && inQuietHours(p, d); i++) d.setTime(d.getTime() + 30 * 60_000);
  return d;
}

/** Human decision on an approval card. Approved actions execute immediately *as the approver*, then the run resumes. */
export async function applyApproval(approvalId: string, approverId: string) {
  const db = svc();
  const { data: a } = await db.from("agent_approvals").select("*").eq("id", approvalId).maybeSingle();
  if (!a || !a.step_id) return { ok: false, error: "Approval not found." };
  const { data: step } = await db.from("agent_run_steps").select("*").eq("id", a.step_id).maybeSingle();
  const { data: run } = await db.from("agent_runs").select("*").eq("id", a.run_id).maybeSingle();
  if (!step || !run) return { ok: false, error: "Run not found." };
  if (a.status === "approved") {
    const tool = TOOL.get(a.tool_id)!;
    await runStep(db, run as Run, step as Step, tool, (a.edited_payload ?? a.payload) as Record<string, unknown>, approverId, new Map());
    const { data: s2 } = await db.from("agent_run_steps").select("status,error").eq("id", step.id).single();
    await db.from("agent_approvals").update({ executed_at: new Date().toISOString(), result: s2?.status === "succeeded" ? "executed" : `failed: ${s2?.error ?? ""}`.slice(0, 300) }).eq("id", a.id);
  } else {
    await db.from("agent_run_steps").update({ status: "skipped", finished_at: new Date().toISOString(), error: `${a.status} by human` }).eq("id", step.id);
  }
  await db.from("agent_waits").update({ satisfied_at: new Date().toISOString() }).eq("run_id", a.run_id).eq("ref_id", a.id);
  const { count } = await db.from("agent_approvals").select("id", { count: "exact", head: true }).eq("run_id", a.run_id).eq("status", "pending");
  if (!count) await setStatus(db, run as Run, "queued", { waiting_reason: "", next_wake_at: null });
  return { ok: true };
}

// ───────────────────────── ask mode (read-only, synchronous) ─────────────────────────
export async function ask(userId: string, workspaceId: string, surface: "organizer" | "provider", question: string) {
  if (!agentConfigured()) return { ok: false as const, error: "Gala Agent isn’t configured in this environment." };
  try { return await askInner(userId, workspaceId, surface, question); }
  catch (e) { if (e instanceof AgentBudgetError) return { ok: false as const, error: e.message }; throw e; }
}
async function askInner(userId: string, workspaceId: string, surface: "organizer" | "provider", question: string) {
  const catalog = catalogFor(surface, DEFAULT_POLICY).filter(c => c.risk === "R0");
  const pick = await chat([{ role: "system", content: `${SAFETY}\nChoose up to 3 read-only tools to answer the question. Return JSON {"calls":[{"tool":string,"input":object}]}. Tools: ${JSON.stringify(catalog)}` },
    { role: "user", content: question.slice(0, 1500) }], { json: true, maxTokens: 500, tier: "fast", meter: { workspaceId, userId, purpose: "tool_pick" } });
  let calls: { tool: string; input: Record<string, unknown> }[] = [];
  try { calls = (JSON.parse(pick.text).calls ?? []).filter((c: { tool: string }) => catalog.some(x => x.id === c.tool)).slice(0, 3); } catch { /* answer without data */ }
  const results = [];
  for (const c of calls) { try { results.push({ tool: c.tool, data: await invoke(userId, workspaceId, TOOL.get(c.tool)!, c.input ?? {}) }); } catch (e) { results.push({ tool: c.tool, error: (e as Error).message.slice(0, 200) }); } }
  const answer = await chat([{ role: "system", content: `${SAFETY}\nAnswer using only the data. Link records using their "link" values as markdown links. If data is missing say so. Read-only: suggest actions, don't claim to have taken any.` },
    { role: "user", content: `<question>${question.slice(0, 1500)}</question>${dataBlock(results)}` }], { maxTokens: 700, tier: "standard", meter: { workspaceId, userId, purpose: "answer" } });
  return { ok: true as const, answer: answer.text, sources: results.map(r => r.tool), tokens: pick.tokens + answer.tokens };
}

// ───────────────────────── routines (§13): natural language → compiled, validated structure ─────────────────────────
/** Domain events an event-driven routine can react to (release spec §12 F). Fired from the audit stream, debounced 5 minutes. */
export const ROUTINE_EVENTS = ["booking.cancelled", "booking.confirmed", "booking.requested", "quote.sent", "quote.accepted", "payment.succeeded", "payment.amount_mismatch",
  "cancellation.requested", "dispute.opened", "ticket.purchased", "event.cancelled", "review.published", "request.responded"] as const;
export const FAR_FUTURE = "2999-01-01T00:00:00Z";
export async function compileRoutine(surface: "organizer" | "provider", text: string, meter?: { workspaceId: string; userId: string }) {
  if (!agentConfigured()) return { ok: false as const, error: "Gala Agent isn’t configured in this environment." };
  const catalog = catalogFor(surface, DEFAULT_POLICY);
  const r = await chat([{ role: "system", content: `${SAFETY}\nCompile the routine into JSON {"title":string,"trigger":{"type":"cron","cron":"m h dom mon dow","tz":"Europe/London"},"goal":string,"actions":[{"tool":string,"input":object,"why":string}],"limits":{"max_steps":number}}.
Use 5-field cron for schedules. If the routine should run when something happens instead, use {"type":"event","event":<one of ${JSON.stringify(ROUTINE_EVENTS)}>}. Actions may only use these tools: ${JSON.stringify(catalog)}. Never include R5. Actions run with the same approval rules as any run.` }, { role: "user", content: text.slice(0, 1500) }], { json: true, maxTokens: 900, meter: meter ? { ...meter, purpose: "compile" } : undefined }).catch(e => { if (e instanceof AgentBudgetError) return { text: "", tokens: 0, budget: e.message }; throw e; });
  if ("budget" in r) return { ok: false as const, error: String(r.budget) };
  let c: { title?: string; trigger?: { type: string; cron?: string; tz?: string; event?: string }; goal?: string; actions?: { tool: string; input: Record<string, unknown>; why?: string }[]; limits?: Record<string, unknown> };
  try { c = JSON.parse(r.text); } catch { return { ok: false as const, error: "Couldn’t understand that routine — try rephrasing." }; }
  const actions = (c.actions ?? []).filter(a => catalog.some(x => x.id === a.tool)).slice(0, 8);
  const base = { title: (c.title ?? text).slice(0, 120), goal: (c.goal ?? text).slice(0, 2000), actions, limits: c.limits ?? {} };
  if (c.trigger?.type === "event") {
    if (!c.trigger.event || !(ROUTINE_EVENTS as readonly string[]).includes(c.trigger.event)) return { ok: false as const, error: "Couldn’t work out which event should trigger this." };
    return { ok: true as const, compiled: { ...base, trigger: { type: "event" as const, event: c.trigger.event } } };
  }
  if (!c.trigger?.cron || !/^(\S+\s+){4}\S+$/.test(c.trigger.cron) || !nextCron(c.trigger.cron, new Date())) return { ok: false as const, error: "Couldn’t work out when this should run." };
  return { ok: true as const, compiled: { ...base, trigger: { type: "cron" as const, cron: c.trigger.cron, tz: c.trigger.tz ?? "Europe/London" } } };
}

/** Minimal 5-field cron evaluator (minute hour day-of-month month day-of-week; supports *, lists, ranges, steps). UTC-based. */
export function nextCron(expr: string, from: Date): Date | null {
  const f = expr.trim().split(/\s+/); if (f.length !== 5) return null;
  const parse = (s: string, min: number, max: number) => {
    const set = new Set<number>();
    for (const part of s.split(",")) {
      const [range, stepS] = part.split("/"); const step = stepS ? Number(stepS) : 1;
      const [a, b] = range === "*" ? [min, max] : range!.includes("-") ? range!.split("-").map(Number) : [Number(range), stepS ? max : Number(range)];
      if ([a, b, step].some(n => Number.isNaN(n)) || a! < min || b! > max || step < 1) return null;
      for (let v = a!; v <= b!; v += step) set.add(v);
    }
    return set;
  };
  const [mi, ho, dom, mo, dow] = [parse(f[0]!, 0, 59), parse(f[1]!, 0, 23), parse(f[2]!, 1, 31), parse(f[3]!, 1, 12), parse(f[4]!, 0, 6)];
  if (!mi || !ho || !dom || !mo || !dow) return null;
  const d = new Date(from.getTime() + 60_000); d.setUTCSeconds(0, 0);
  for (let i = 0; i < 60 * 24 * 370; i++) {
    if (mo.has(d.getUTCMonth() + 1) && dom.has(d.getUTCDate()) && dow.has(d.getUTCDay()) && ho.has(d.getUTCHours()) && mi.has(d.getUTCMinutes())) return d;
    d.setTime(d.getTime() + 60_000);
  }
  return null;
}

// ───────────────────────── worker tick ─────────────────────────
export async function workerTick() {
  const db = svc();
  // Maintenance (release spec §9): M2+ on the agent module (or any platform-wide M4/M5) suspends the worker; runs resume afterwards.
  const { data: lvl } = await db.rpc("maintenance_level" as never, { p_module: "agent" } as never);
  if (Number(lvl ?? 0) >= 2) return { routines: 0, planned: 0, executed: 0, expired: 0, errors: [] as string[], paused: `maintenance M${lvl}` };
  const out = { routines: 0, planned: 0, executed: 0, expired: 0, watches: 0, errors: [] as string[] };
  // Expire stale approvals → their steps are skipped and the run resumes.
  const { data: stale } = await db.from("agent_approvals").update({ status: "expired" }).eq("status", "pending").lt("expires_at", new Date().toISOString()).select("id");
  for (const a of stale ?? []) { await applyApproval(a.id, ""); out.expired++; }
  // Durability: decisions recorded but not yet applied (e.g. the browser call died mid-way) are applied as the decider.
  const { data: decided } = await db.from("agent_approvals").select("id,decided_by,status").in("status", ["approved", "rejected"]).is("executed_at", null).not("step_id", "is", null).limit(20);
  for (const a of decided ?? []) {
    const { data: st } = await db.from("agent_run_steps").select("status").eq("approval_id", a.id).maybeSingle();
    if (st?.status === "waiting_approval") await applyApproval(a.id, a.decided_by);
    if (a.status === "rejected") await db.from("agent_approvals").update({ executed_at: new Date().toISOString(), result: "rejected" }).eq("id", a.id);
  }
  // Due compiled routines → runs with pre-compiled steps (no free-text-only routines).
  const { data: due } = await db.from("agent_routines").select("*").eq("enabled", true).lte("next_run_at", new Date().toISOString()).limit(20);
  for (const r of due ?? []) {
    const key = `routine:${r.id}:${r.next_run_at}`;
    const { data: ws } = await db.from("workspaces").select("kind,owner_id").eq("id", r.workspace_id).maybeSingle();
    const { data: run } = await db.from("agent_runs").insert({ workspace_id: r.workspace_id, user_id: r.owner_id ?? ws?.owner_id, surface: ws?.kind ?? "organizer", mode: "routine", goal: `${r.title}: ${r.detail}${r.last_event ? ` (triggered by ${(r.last_event as { event: string }).event})` : ""}`.slice(0, 2000),
      status: "queued", routine_id: r.id, idempotency_key: key, plan: r.actions ?? [] }).select("id").maybeSingle();
    if (run && Array.isArray(r.actions) && r.actions.length) {
      await db.from("agent_run_steps").insert((r.actions as { tool: string; input: Record<string, unknown>; why?: string }[]).filter(a => TOOL.has(a.tool)).map((a, i) => ({ run_id: run.id, seq: i + 1, tool_id: a.tool, input: a.input ?? {}, reason: a.why ?? "", idempotency_key: `${run.id}:${i + 1}` })));
      await db.from("agent_runs").update({ status: "running" }).eq("id", run.id);
    }
    const next = r.trigger?.type === "event" ? new Date(FAR_FUTURE) : r.trigger?.cron ? nextCron(r.trigger.cron, new Date()) : null;
    await db.from("agent_routines").update({ last_run_at: new Date().toISOString(), next_run_at: (next ?? new Date(Date.now() + 864e5)).toISOString(), last_event: null }).eq("id", r.id);
    out.routines++;
  }
  // Watches (§12 E): poll read-only tools as the human; fire on condition; exponential backoff; expire. No model calls.
  out.watches = await tickWatches(db);
  // Claim and advance runs.
  const { data: runs } = await db.rpc("claim_agent_runs", { p_limit: 5, p_lease_seconds: 120 });
  for (const run of (runs ?? []) as Run[]) {
    try {
      if (!run.user_id) { await setStatus(db, run, "failed", { summary: "Run has no requesting user." }); continue; }
      const { count } = await db.from("agent_run_steps").select("id", { count: "exact", head: true }).eq("run_id", run.id);
      if (!count && run.status === "queued") { if (!agentConfigured()) { await setStatus(db, run, "waiting_external", { waiting_reason: "Agent model not configured" }); continue; } await planRun(db, run); out.planned++; }
      else if (!count) { await db.from("agent_runs").update({ lease_until: null }).eq("id", run.id); }   // legacy run without steps: leave untouched
      else if (["queued", "running", "retrying", "scheduled_wait"].includes(run.status)) { await executeRun(db, run); out.executed++; }
    } catch (e) {
      // Budget stops pause the run (never fail or retry-burn it); the owner sees why and can resume after topping up.
      if (e instanceof AgentBudgetError) {
        const { data: cur } = await db.from("agent_runs").select("status").eq("id", run.id).single();
        await setStatus(db, { ...run, status: cur?.status ?? run.status }, "paused", { waiting_reason: e.message.slice(0, 300) });
        await db.from("agent_runs").update({ lease_until: null }).eq("id", run.id);
        await db.from("notifications").insert({ user_id: run.user_id, kind: "agent", title: "Gala Agent task paused", body: e.message.slice(0, 300), link: `/${run.surface === "provider" ? "provider" : "organizer"}/agent` });
        continue;
      }
      out.errors.push(`${run.id}: ${(e as Error).message}`); await db.from("agent_runs").update({ lease_until: null, errors: [{ error: (e as Error).message.slice(0, 300), at: new Date().toISOString() }] }).eq("id", run.id); }
  }
  return out;
}

// ───────────────────────── watches ─────────────────────────
type Watch = { id: string; workspace_id: string; user_id: string; title: string; tool_id: string; input: Record<string, unknown>; condition: { path: string; op: string; value?: unknown };
  check_every_minutes: number; backoff_factor: number; max_checks: number; checks: number; expires_at: string; last_value: unknown; status: string };
const at = (o: unknown, path: string) => path.split(".").filter(Boolean).reduce<unknown>((v, k) => (v == null ? undefined : Array.isArray(v) && /^\d+$/.test(k) ? v[Number(k)] : (v as Record<string, unknown>)[k]), o);
async function tickWatches(db: Db) {
  const now = new Date();
  await db.from("agent_watches").update({ status: "expired" }).eq("status", "active").lt("expires_at", now.toISOString());
  const { data } = await db.from("agent_watches").select("*").eq("status", "active").lte("next_check_at", now.toISOString()).order("next_check_at").limit(25);
  let n = 0;
  for (const w of (data ?? []) as Watch[]) {
    const tool = TOOL.get(w.tool_id);
    if (!tool || tool.risk !== 0) { await db.from("agent_watches").update({ status: "failed", last_error: "Tool is no longer available as read-only." }).eq("id", w.id); continue; }
    try {
      const result = await invoke(w.user_id, w.workspace_id, tool, w.input ?? {});
      const value = at(result, w.condition.path ?? "");
      const fired = watchHolds(w.condition, value, w.last_value);
      const checks = w.checks + 1;
      const delay = Math.min(w.check_every_minutes * Math.pow(Number(w.backoff_factor), Math.min(checks, 12) - 1), 1440);
      if (fired) {
        await db.from("agent_watches").update({ status: "triggered", triggered_at: now.toISOString(), last_value: value ?? null, last_checked_at: now.toISOString(), checks }).eq("id", w.id);
        await db.from("notifications").insert({ user_id: w.user_id, kind: "agent", title: `Watch triggered: ${w.title}`.slice(0, 160), body: `Condition met (${w.condition.path} ${w.condition.op}${w.condition.value !== undefined ? ` ${JSON.stringify(w.condition.value)}` : ""}). Current value: ${String(JSON.stringify(value) ?? "").slice(0, 200)}`, link: "/organizer/agent" });
        await db.from("audit_events").insert({ actor_id: w.user_id, actor_type: "agent", workspace_id: w.workspace_id, event: "agent.watch_triggered", metadata: { watch_id: w.id } });
      } else {
        await db.from("agent_watches").update({ checks, last_value: value ?? null, last_checked_at: now.toISOString(), last_error: null,
          status: checks >= w.max_checks ? "expired" : "active", next_check_at: new Date(now.getTime() + delay * 60_000).toISOString() }).eq("id", w.id);
      }
      n++;
    } catch (e) {
      await db.from("agent_watches").update({ last_error: (e as Error).message.slice(0, 200), next_check_at: new Date(now.getTime() + Math.min(w.check_every_minutes * 4, 1440) * 60_000).toISOString() }).eq("id", w.id);
    }
  }
  return n;
}
