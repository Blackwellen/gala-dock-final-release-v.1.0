import * as nodeCrypto from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import * as registry from "../../src/lib/agent/registry";
import * as plan from "../../src/lib/agent/plan";
import * as minimiseMod from "../../src/lib/agent/minimise";
import * as prompt from "../../src/lib/agent/prompt";
import * as skills from "../../src/lib/agent/skills";
import * as watch from "../../src/lib/agent/watch";
import * as resilience from "../../src/lib/agent/resilience";
import { BASELINE, runSuite } from "../../src/lib/agent/eval/harness";

// Q53 Gala Agent bug hunt (lane bughunt-agent). Phase A: code + database only — no browser, no dev server, and never a real
// model: llm.ts runs against a stubbed fetch, and the runtime (planRun / executeRun / advanceRun / applyApproval / ask) runs with
// a scripted chat() on disposable fixture workspaces in the live database. No Azure call, no live Gala Agent tool call.
const db = admin as unknown as SupabaseClient;
const tag = nodeCrypto.randomBytes(3).toString("hex");

/** Loads a server-only TS module in this realm with its imports replaced by test doubles (same technique as observability.spec). */
function load<T>(file: string, deps: Record<string, unknown>, env: Record<string, string | undefined> = process.env): T {
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  const req = (n: string) => { if (n in deps) return deps[n]; throw new Error(`unexpected import ${n}`); };
  new Function("require", "module", "exports", "process", js)(req, mod, mod.exports, { ...process, env });
  return mod.exports as T;
}

// ── 1. Pure rules ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe("Q53 turn-loop rules (pure)", () => {
  test("step error classification: rate_limited retries, pause / cancel / kill switch / maintenance suspend, the rest fail", () => {
    const c = resilience.classifyStepError;
    expect(c("refused: rate_limited")).toBe("retry");                 // was a permanent failure ("will retry shortly" was untrue)
    expect(c("refused: run_paused")).toBe("suspend");                 // was: every remaining step failed when a run was paused
    expect(c("refused: run_cancelled")).toBe("suspend");
    expect(c("refused: workspace_kill_switch — switched off")).toBe("suspend");
    expect(c("maintenance: Gala Agent is temporarily restricted")).toBe("suspend");
    expect(c("refused: plan_not_entitled")).toBe("fail");
    expect(c("invalid_input: items separate rate")).toBe("fail");    // the old /rate/ test retried this
    expect(c("permission_denied:events.write")).toBe("fail");
    expect(c("generate_failed")).toBe("fail");
    expect(c("canceling statement due to statement timeout")).toBe("retry");
    expect(c("fetch failed")).toBe("retry");
    expect(c("agent_http_503")).toBe("retry");
  });

  test("Azure retry policy: retryable statuses, Retry-After honoured and capped, content filter detected", () => {
    expect([408, 409, 429, 500, 502, 503, 504].every(resilience.isRetryableStatus)).toBe(true);
    expect([400, 401, 403, 404, 422].some(resilience.isRetryableStatus)).toBe(false);
    expect(resilience.retryDelayMs(0, "2")).toBe(2000);
    expect(resilience.retryDelayMs(0, "120")).toBe(8000);
    expect(resilience.retryDelayMs(0, new Date(Date.now() + 3000).toUTCString(), 8000)).toBeLessThanOrEqual(3000);
    const backoff = resilience.retryDelayMs(2, null);
    expect(backoff).toBeGreaterThanOrEqual(2000); expect(backoff).toBeLessThan(2250);
    expect(resilience.isContentFilter(400, '{"error":{"code":"content_filter","innererror":{"code":"ResponsibleAIPolicyViolation"}}}')).toBe(true);
    expect(resilience.isContentFilter(400, '{"error":{"code":"invalid_request"}}')).toBe(false);
  });

  test("references fill id arguments only: retrieved text can't become a message body or a memory value", () => {
    const catalog = registry.catalogFor("organizer", registry.DEFAULT_POLICY);
    const p = plan.parsePlan(JSON.stringify({ steps: [
      { tool: "comms.inbox", input: {} },
      { tool: "memory.remember", input: { key: "supplier.note", value: "$step1.subject" } },
      { tool: "message.party", input: { to_type: "user", to: "$step1.id", body: "$step1.body" } },
      { tool: "event.readiness", input: { event_id: "$step1.id" } },
    ] }), catalog);
    expect(p.steps.map(s => s.tool)).toEqual(["comms.inbox", "event.readiness"]);
    expect(p.dropped.filter(d => d.reason === "bad_reference")).toHaveLength(2);
    expect(resilience.isRefKey("event_id") && resilience.isRefKey("to") && !resilience.isRefKey("body") && !resilience.isRefKey("value")).toBe(true);
  });

  test("evaluation harness: baseline incl. the Q53 injection and Starter scenarios passes", () => {
    const r = runSuite(BASELINE);
    expect(r.results.filter(x => !x.pass).map(x => `${x.id}: ${x.failures.join("; ")}`)).toEqual([]);
    expect(BASELINE.map(s => s.id)).toEqual(expect.arrayContaining(["inj-ref-into-free-text", "perm-starter-no-actions"]));
  });
});

// ── 2. llm.ts against a stubbed Azure endpoint ───────────────────────────────────────────────────────────────────────────────
type Llm = { chat: (m: { role: string; content: string }[], o?: Record<string, unknown>) => Promise<{ text: string; tokens: number }>;
  __setAgentFetchForTests: (f: unknown) => void; AgentBudgetError: new (m: string) => Error; AgentSafetyError: new (m: string) => Error; SAFETY_REFUSAL: string };
test.describe("Q53 llm.ts resilience (stubbed fetch, never Azure)", () => {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  let budgetOk = true;
  const fakeAdmin = {
    rpc: async (name: string, args: Record<string, unknown>) => { rpcCalls.push({ name, args }); return { data: name === "ai_provider_attempt" ? budgetOk : null, error: null }; },
    from: () => ({ select: async () => ({ data: [] }) }),
  };
  const env = { AZURE_OPENAI_API_KEY: "test-key-not-a-secret", AZURE_OPENAI_ENDPOINT: "https://azure.example.invalid/", AGENT_MODEL_MINI: "mini-dep", AGENT_MODEL_NANO: "nano-dep" };
  const llm = load<Llm>("src/lib/agent/llm.ts", { "server-only": {}, "@/lib/supabase/admin": { createAdminClient: () => fakeAdmin }, "./resilience": resilience, "./prompt": prompt }, env);
  type Reply = { status: number; body?: unknown; retryAfter?: string } | "network";
  const calls: string[] = [];
  const script = (replies: Reply[]) => {
    calls.length = 0; rpcCalls.length = 0;
    llm.__setAgentFetchForTests(async (url: string) => {
      calls.push(url);
      const r = replies.shift() ?? { status: 500 };
      if (r === "network") throw new TypeError("fetch failed");
      const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {});
      return { ok: r.status < 300, status: r.status, headers: { get: (h: string) => (h === "retry-after" ? r.retryAfter ?? null : null) }, text: async () => text, json: async () => JSON.parse(text) };
    });
  };
  const okBody = (content: string, finish = "stop") => ({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  const meter = { workspaceId: null, userId: null, purpose: "q53" };
  test.afterAll(() => llm.__setAgentFetchForTests(null));

  test("429 with Retry-After is retried on the same deployment, metered once", async () => {
    budgetOk = true; script([{ status: 429, retryAfter: "0" }, { status: 200, body: okBody("hello") }]);
    expect((await llm.chat([{ role: "user", content: "hi" }], { meter })).text).toBe("hello");
    expect(calls).toHaveLength(2); expect(calls.every(u => u.includes("/deployments/mini-dep/"))).toBe(true);
    expect(rpcCalls.filter(c => c.name === "ai_provider_attempt")).toHaveLength(2);   // every attempt is counted (6006)
    expect(rpcCalls.filter(c => c.name === "record_ai_usage_traced")).toHaveLength(1);
  });
  test("persistent 503 fails over to the next deployment", async () => {
    script([{ status: 503, retryAfter: "0" }, { status: 503, retryAfter: "0" }, { status: 200, body: okBody("from nano") }]);
    expect((await llm.chat([{ role: "user", content: "hi" }], { meter })).text).toBe("from nano");
    expect(calls.map(u => /deployments\/([^/]+)/.exec(u)![1])).toEqual(["mini-dep", "mini-dep", "nano-dep"]);
  });
  test("a network error is retried", async () => {
    script(["network", { status: 200, body: okBody("after blip") }]);
    expect((await llm.chat([{ role: "user", content: "hi" }])).text).toBe("after blip");
  });
  test("content filtering is a refusal (never retried); 401 is not retried; spent budgets refuse before any call", async () => {
    script([{ status: 400, body: { error: { code: "content_filter" } } }]);
    const e1 = await llm.chat([{ role: "user", content: "x" }]).catch(e => e);
    expect(e1).toBeInstanceOf(llm.AgentSafetyError); expect(e1.message).toBe(llm.SAFETY_REFUSAL); expect(calls).toHaveLength(1);
    script([{ status: 200, body: okBody("", "content_filter") }]);
    expect(await llm.chat([{ role: "user", content: "x" }], { meter }).catch(e => e)).toBeInstanceOf(llm.AgentSafetyError);
    expect(rpcCalls.filter(c => c.name === "record_ai_usage_traced")).toHaveLength(1);      // filtered completions still cost tokens
    script([{ status: 401 }, { status: 200, body: okBody("never") }]);
    expect((await llm.chat([{ role: "user", content: "x" }]).catch(e => e)).message).toBe("agent_http_401"); expect(calls).toHaveLength(1);
    budgetOk = false; script([{ status: 200, body: okBody("never") }]);
    expect(await llm.chat([{ role: "user", content: "x" }]).catch(e => e)).toBeInstanceOf(llm.AgentBudgetError); expect(calls).toHaveLength(0);
    budgetOk = true;
  });
});

// ── 3. Runtime turn loop on fixtures (scripted model) ────────────────────────────────────────────────────────────────────────
class AgentBudgetError extends Error {}
class AgentSafetyError extends Error {}
type Chat = (messages: { role: string; content: string }[], opts?: { meter?: { purpose?: string } }) => Promise<{ text: string; tokens: number }>;
let model: Record<string, string | Error> = {};
const prompts: { purpose: string; text: string }[] = [];
const fakeChat: Chat = async (messages, opts) => {
  const purpose = opts?.meter?.purpose ?? "none";
  prompts.push({ purpose, text: messages.map(m => m.content).join("\n") });
  const r = model[purpose];
  if (r instanceof Error) throw r;
  return { text: r ?? "", tokens: 10 };
};
type Row = Record<string, unknown> & { id: string; status: string };
type Runtime = {
  planRun: (d: unknown, r: Row) => Promise<void>; executeRun: (d: unknown, r: Row) => Promise<void>; advanceRun: (d: unknown, r: Row) => Promise<string>;
  applyApproval: (id: string, by: string) => Promise<{ ok: boolean; error?: string }>; ask: (u: string, w: string, s: "organizer", q: string) => Promise<{ ok: boolean; error?: string; sources?: string[]; answer?: string }>;
};
const runtime = load<Runtime>("src/lib/agent/runtime.ts", {
  "server-only": {}, "node:crypto": nodeCrypto,
  "@/lib/supabase/admin": { createAdminClient: () => admin }, "@/lib/workspace/db": { untyped: (x: unknown) => x },
  "./locale": { localeDirective: () => "" }, "@/lib/i18n/workspace": { workspaceLocale: () => ({ timezone: "Europe/London", currency: "GBP" }) },   // i18n lane imports (stubs)
  "./llm": { chat: fakeChat, agentConfigured: () => true, SAFETY: "SAFETY", dataBlock: prompt.dataBlock, AgentBudgetError, AgentSafetyError },
  "./resilience": resilience, "@/lib/media/document": { PRESETS: [{ id: "a3", w: 1, h: 1, label: "A3" }], posterFromEvent: () => ({}) },
  "./watch": watch, "./registry": registry, "./minimise": minimiseMod, "./plan": plan, "./skills": skills, "./schedule-db": { routineNextRun: async () => null },
});

test.describe("Q53 runtime turn loop (scripted model, fixture workspaces)", () => {
  test.describe.configure({ mode: "serial" });
  let owner: { id: string; email: string }, wsA: string, wsB: string, evA: string, evB: string;
  const runs: string[] = [];
  const getRun = async (id: string) => (await db.from("agent_runs").select("*").eq("id", id).single()).data as Row;
  // Fixture runs are never left claimable: the shared database has a live worker (pg_cron → production /api/agent/worker) that
  // would otherwise pick them up and call the real model. They start paused (or awaiting confirmation when they must be planned)
  // with a lease held, the runtime is handed the row "as claimed", and hold() re-takes the lease after a step that clears it.
  const LEASE = () => new Date(Date.now() + 15 * 60_000).toISOString();
  const hold = (id: string) => db.from("agent_runs").update({ lease_until: LEASE() }).eq("id", id);
  const claimed = (r: Row, status = "queued") => ({ ...r, status });
  const newRun = async (steps: { tool: string; input: Record<string, unknown> }[], status = "paused") => {
    const { data, error } = await db.from("agent_runs").insert({ workspace_id: wsA, user_id: owner.id, surface: "organizer", mode: "do", goal: `Q53 ${tag} ${runs.length}`, status, plan: [], lease_until: LEASE(),
      idempotency_key: `q53-${tag}-${runs.length}-${nodeCrypto.randomBytes(3).toString("hex")}` }).select("id").single();
    if (error) throw new Error(error.message);
    runs.push(data!.id);
    if (steps.length) await db.from("agent_run_steps").insert(steps.map((s, i) => ({ run_id: data!.id, seq: i + 1, tool_id: s.tool, input: s.input, reason: "q53", idempotency_key: `${data!.id}:${i + 1}` })));
    return getRun(data!.id);
  };
  const steps = async (run: string) => ((await db.from("agent_run_steps").select("seq,tool_id,status,error").eq("run_id", run).order("seq")).data ?? []) as { seq: number; tool_id: string; status: string; error: string | null }[];

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    owner = await createUser("q53-owner");
    wsA = await seedWorkspace(owner.id, "organizer", `Q53 A ${tag}`);
    wsB = await seedWorkspace(owner.id, "organizer", `Q53 B ${tag}`);   // same human, second workspace
    await db.from("workspaces").update({ plan: "pro" }).in("id", [wsA, wsB]);
    const mk = async (w: string) => ((await db.from("events").insert({ owner_id: owner.id, workspace_id: w, management: "professional", name: `Q53 ${tag}`, status: "planning", event_type: "gala",
      starts_at: new Date(Date.now() + 30 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
    evA = await mk(wsA); evB = await mk(wsB);
  });
  test.afterAll(async () => {
    await db.from("agent_memories").delete().in("workspace_id", [wsA, wsB]);
    await db.from("agent_runs").delete().in("workspace_id", [wsA, wsB]);
    await db.from("agent_policies").delete().in("workspace_id", [wsA, wsB]);
    await db.from("tasks").delete().in("event_id", [evA, evB]);
    await db.from("events").delete().in("id", [evA, evB]);
    await db.from("audit_events").delete().in("workspace_id", [wsA, wsB]);
    await db.from("workspaces").delete().in("id", [wsA, wsB]);
    await cleanup();
  });

  test("greeting plans zero steps and completes with the conversational reply (was stuck in 'planning')", async () => {
    model = { plan: JSON.stringify({ interpretation: { summary: "greeting" }, steps: [] }), tool_pick: '{"calls":[]}', answer: "Hello! What would you like to plan?" };
    const run = await newRun([], "awaiting_plan_confirmation");
    await runtime.planRun(db, run);
    const r = await getRun(run.id);
    expect(r.status).toBe("completed"); expect(r.summary).toBe("Hello! What would you like to plan?");
  });

  test("a model outage while planning re-queues with backoff, then fails clearly; content filtering fails with a refusal", async () => {
    model = { plan: new Error("agent_http_503") };
    const run = await newRun([], "awaiting_plan_confirmation");
    expect(await runtime.advanceRun(db, claimed(run))).toBe("recovered");
    let r = await getRun(run.id);
    expect(r.status).toBe("queued"); expect(r.retries).toBe(1); expect(Date.parse(String(r.next_wake_at))).toBeGreaterThan(Date.now());
    await db.from("agent_runs").update({ retries: 2 }).eq("id", run.id);
    await runtime.advanceRun(db, await getRun(run.id));   // re-queued with next_wake_at in the future, so no worker claims it meanwhile
    r = await getRun(run.id);
    expect(r.status).toBe("failed"); expect(String(r.summary)).toMatch(/couldn’t plan this task/);
    model = { plan: new AgentSafetyError("Gala Agent can’t help with that request.") };
    const run2 = await newRun([], "awaiting_plan_confirmation");
    await runtime.advanceRun(db, claimed(run2));
    expect((await getRun(run2.id)).status).toBe("failed");
    expect((await getRun(run2.id)).summary).toBe("Gala Agent can’t help with that request.");
  });

  test("tool arguments can't reach another workspace of the same person (event.budget / task.create on workspace B)", async () => {
    model = { summary: "Summary" };
    const run = await newRun([{ tool: "event.budget", input: { event_id: evA } }, { tool: "event.budget", input: { event_id: evB } }, { tool: "task.create", input: { event_id: evB, title: `Q53 cross ${tag}` } }]);
    await runtime.executeRun(db, claimed(run));
    const s = await steps(run.id);
    expect(s.map(x => x.status)).toEqual(["succeeded", "failed", "failed"]);
    expect(s[1]!.error).toContain("not_found"); expect(s[2]!.error).toContain("not_found");
    expect((await db.from("tasks").select("id", { count: "exact", head: true }).eq("event_id", evB)).count).toBe(0);
    expect((await getRun(run.id)).status).toBe("partially_completed");
  });

  test("cancel takes effect before the next step; the workspace switch pauses the run without failing its steps", async () => {
    const run = await newRun([{ tool: "events.list", input: {} }]);
    await db.from("agent_runs").update({ status: "cancelled" }).eq("id", run.id);
    await runtime.executeRun(db, claimed(run, "running"));            // a worker that claimed it just before the cancel
    expect((await steps(run.id)).map(x => x.status)).toEqual(["pending"]);
    expect((await db.from("agent_tool_calls").select("id", { count: "exact", head: true }).eq("run_id", run.id)).count).toBe(0);
    const run2 = await newRun([{ tool: "events.list", input: {} }, { tool: "event.readiness", input: { event_id: evA } }]);
    await db.from("agent_policies").upsert({ workspace_id: wsA, kill_switch: true });
    expect(await runtime.advanceRun(db, claimed(run2))).toBe("paused");
    await db.from("agent_policies").update({ kill_switch: false }).eq("workspace_id", wsA);
    const r2 = await getRun(run2.id);
    expect(r2.status).toBe("paused"); expect(String(r2.waiting_reason)).toMatch(/switched off/i);
    expect((await steps(run2.id)).map(x => x.status)).toEqual(["pending", "pending"]);
  });

  test("human-in-the-loop: always_ask approval → decided as the owner → executed as the approver once → run completes; audited", async () => {
    model = { summary: "Created the task." };
    await db.from("agent_policies").upsert({ workspace_id: wsA, mode: "always_ask", kill_switch: false });
    const run = await newRun([{ tool: "task.create", input: { event_id: evA, title: `Q53 approved ${tag}` } }]);
    await runtime.executeRun(db, claimed(run));
    expect((await getRun(run.id)).status).toBe("waiting_approval");
    await hold(run.id);
    const { data: ap } = await db.from("agent_approvals").select("id,status,tool_id,payload").eq("run_id", run.id).single();
    expect(ap!.tool_id).toBe("task.create");
    const oc = await signedIn(owner.email) as unknown as SupabaseClient;
    expect((await oc.rpc("decide_agent_approval", { p_approval: ap!.id, p_approve: true, p_edited: null })).error).toBeNull();
    expect((await runtime.applyApproval(ap!.id, owner.id)).ok).toBe(true);
    expect((await runtime.applyApproval(ap!.id, owner.id)).ok).toBe(true);      // a second executor replays, never repeats
    expect((await db.from("tasks").select("id", { count: "exact", head: true }).eq("event_id", evA).eq("title", `Q53 approved ${tag}`)).count).toBe(1);
    await runtime.executeRun(db, await getRun(run.id));
    expect((await getRun(run.id)).status).toBe("completed");
    const { data: calls } = await db.from("agent_tool_calls").select("status,decision,args_hash,actor_id").eq("run_id", run.id);
    expect(calls!.some(c => c.status === "succeeded" && c.decision === "approved" && c.actor_id === owner.id && c.args_hash)).toBe(true);
    const { data: ev } = await db.from("audit_events").select("event").eq("agent_run_id", run.id);
    expect(ev!.map(e => e.event)).toEqual(expect.arrayContaining(["agent.approval_approved", "agent.tool_called"]));
    await db.from("agent_policies").update({ mode: "execute_with_approval" }).eq("workspace_id", wsA);
  });

  test("plan confirmation can't be skipped by pause + resume (runtime + agent_control_run)", async () => {
    model = { plan: JSON.stringify({ interpretation: { summary: "hold" }, confidence: 0.9, steps: [{ tool: "marketplace.request_hold", input: { item_id: nodeCrypto.randomUUID(), hours: 24 }, why: "hold" }] }) };
    const run = await newRun([], "awaiting_plan_confirmation");
    await runtime.planRun(db, run);
    await hold(run.id);
    let r = await getRun(run.id);
    expect(r.status).toBe("awaiting_plan_confirmation"); expect((r.interpretation as { needs_confirmation?: boolean }).needs_confirmation).toBe(true);
    await db.from("agent_runs").update({ status: "paused" }).eq("id", run.id);
    const oc = await signedIn(owner.email) as unknown as SupabaseClient;
    expect((await oc.rpc("agent_control_run", { p_run: run.id, p_action: "resume" })).error).toBeNull();
    expect((await getRun(run.id)).status).toBe("awaiting_plan_confirmation");
    await db.from("agent_runs").update({ status: "paused" }).eq("id", run.id);
    await db.from("agent_runs").update({ status: "queued", lease_until: LEASE() }).eq("id", run.id);   // any other path that queues it unconfirmed
    await runtime.executeRun(db, await getRun(run.id));
    r = await getRun(run.id);
    expect(r.status).toBe("paused"); expect((await steps(run.id))[0]!.status).toBe("pending");
  });

  test("Ask: the workspace allow-list applies, every tool call is audited with argument names only, outages are plain messages", async () => {
    await db.from("agent_policies").upsert({ workspace_id: wsA, allowed_tools: ["events.list"] });
    model = { tool_pick: JSON.stringify({ calls: [{ tool: "event.readiness", input: { event_id: evA } }, { tool: "events.list", input: {} }] }), answer: "You have one event." };
    const a = await runtime.ask(owner.id, wsA, "organizer", "What's coming up?");
    expect(a.ok).toBe(true); expect(a.sources).toEqual(["events.list"]);
    const pick = prompts.filter(p => p.purpose === "tool_pick").at(-1)!;
    expect(pick.text).not.toContain('"event.readiness"');
    const { data: au } = await db.from("audit_events").select("event,actor_id,metadata").eq("workspace_id", wsA).eq("event", "agent.tool_called").contains("metadata", { via: "ask" });
    expect(au!.some(x => x.actor_id === owner.id && (x.metadata as { tool: string }).tool === "events.list" && Array.isArray((x.metadata as { arg_keys: unknown }).arg_keys))).toBe(true);
    model = { tool_pick: '{"calls":[]}', answer: new Error("agent_http_500") };
    expect(await runtime.ask(owner.id, wsA, "organizer", "Hello")).toEqual({ ok: false, error: "Gala Agent couldn’t answer just now. Please try again in a moment." });
    model = { tool_pick: new AgentSafetyError("Gala Agent can’t help with that request.") };
    expect(await runtime.ask(owner.id, wsA, "organizer", "something filtered")).toEqual({ ok: false, error: "Gala Agent can’t help with that request." });
    await db.from("agent_policies").update({ allowed_tools: null }).eq("workspace_id", wsA);
  });

  test("activity export: runs and governed tool calls as CSV through the person's RLS client, never the arguments", async () => {
    const exp = load<{ agentActivityCsv: (d: unknown, w: string, days: number) => Promise<string> }>("src/lib/agent/export.ts",
      { "server-only": {}, "@/lib/provider/csv": { csvCell: (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; } } });
    const oc = await signedIn(owner.email) as unknown as SupabaseClient;
    const csv = await exp.agentActivityCsv(oc, wsA, 7);
    expect(csv.split("\n")[0]).toBe("record,run_id,at,finished_at,mode_or_tool,risk,decision,status,refusal,person,goal,summary,tokens,cost_pence,retries_or_ms");
    expect(csv).toContain("tool_call,"); expect(csv).toContain("task.create");
    expect(csv).not.toContain(`Q53 approved ${tag}`);    // the task title was an argument: never exported
    expect(await exp.agentActivityCsv(oc, wsB, 7)).not.toContain("task.create");
  });

  test("Q67 hand-off: agent tool writes run as the human (auth.uid()), so plan-limit triggers apply to agent-created records", async () => {
    const run = await newRun([], "awaiting_plan_confirmation");   // not paused: paused runs refuse tool calls (run_paused)
    const { data, error } = await db.rpc("agent_execute_tool", { p_run: run.id, p_step: null, p_actor: owner.id, p_tool: "memory.remember",
      p_args: { key: "q53.calls", value: "Prefers morning calls", scope: "user" }, p_idempotency: `q53-mem-${tag}`, p_approval: null, p_policy_auto: false });
    expect(error).toBeNull(); expect((data as { ok: boolean }).ok).toBe(true);
    const { data: m } = await db.from("agent_memories").select("user_id,created_by").eq("workspace_id", wsA).eq("key", "q53.calls").single();
    expect(m!.user_id).toBe(owner.id);   // agent_memory_remember reads auth.uid(): the same identity the plan-limit triggers check
  });
});
