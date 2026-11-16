import * as nodeCrypto from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { test, expect } from "@playwright/test";
import * as registry from "../../src/lib/agent/registry";
import * as grounding from "../../src/lib/agent/grounding";
import * as plan from "../../src/lib/agent/plan";
import * as minimiseMod from "../../src/lib/agent/minimise";
import * as prompt from "../../src/lib/agent/prompt";
import * as skills from "../../src/lib/agent/skills";
import * as watch from "../../src/lib/agent/watch";
import * as resilience from "../../src/lib/agent/resilience";

// Gala Agent grounding (owner request 2026-11-16: "connected to the limits of the workspace … answers don't have enough info … it
// doesn't believe it's in Gala Dock"). Mocked model and an in-memory database only: no Azure call, no live database, no dev server.
const src = (f: string) => readFileSync(f, "utf8");
function load<T>(file: string, deps: Record<string, unknown>): T {
  const js = ts.transpileModule(src(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  const req = (n: string) => { if (n in deps) return deps[n]; throw new Error(`unexpected import ${n}`); };
  new Function("require", "module", "exports", "process", js)(req, mod, mod.exports, process);
  return mod.exports as T;
}

const WS = "11111111-1111-4111-8111-111111111111", USER = "22222222-2222-4222-8222-222222222222", EV = "33333333-3333-4333-8333-333333333333";
type Limits = grounding.WorkspaceLimits;
const limits = (o: Partial<Limits> = {}): Limits => ({
  workspaceId: WS, workspaceName: "Alex Events", surface: "organizer", role: "owner", plan: "pro", capabilities: { actions: true, deep: false, api: true },
  credits: { allowance: 1000, allowance_left: 640, balance: 250, available: 890, used_this_month: 360, used_today: 12, pct: 36, hard_cap: true, allow_overage: false, overage_limit: 0, daily_limit: null, per_run_limit: 50, soft_caps: [70, 85, 95], deep_allowed: false },
  planLimits: { plan: "pro", events: { used: 13, max: 25 }, seats: { used: 5, max: 10 }, listings: { used: 0, max: null } },
  policy: { mode: "execute_with_approval", booking_authority_minor: 500_000, refund_threshold_minor: 10_000, daily_spend_cap_minor: 0, monthly_spend_cap_minor: 2_000_000, discount_authority_pct: 0, allowed_tools: null, kill_switch: false, quiet_hours: { from: "21:00", to: "08:00", tz: "Europe/London" } },
  timezone: "Europe/London", currency: "GBP", now: new Date("2026-11-16T10:00:00Z"), ...o,
});

test.describe("Gala Agent grounding: identity and live workspace limits (pure)", () => {
  test("every surface states it IS Gala Dock's agent and what Gala Dock is", () => {
    for (const s of ["organizer", "provider"] as const) {
      const id = grounding.platformIdentity(s);
      expect(id).toMatch(/You are Gala Agent, the built-in AI assistant of Gala Dock/);
      expect(id).toMatch(/running inside Gala Dock right now/);
      expect(id).toMatch(/connected event platform/);
      for (const verb of ["PLAN", "SOURCE and BOOK", "SELL", "PROMOTE", "RUN", "SETTLE"]) expect(id).toContain(verb);
      expect(id).toMatch(/never customers/);
      expect(id).toMatch(/What you can't do/);
    }
    expect(grounding.platformIdentity("provider")).toMatch(/PROVIDER/);
    expect(grounding.platformIdentity("organizer")).toMatch(/ORGANISER/);
  });

  test("the workspace block carries plan, role, capabilities, credits, plan limits, policy, date, zone and page", () => {
    const f = grounding.workspaceFacts(limits(), "the event \"Neon Nights Festival\"");
    expect(f).toMatch(/"Alex Events" — organizer workspace on the Pro plan\. The person is the workspace owner/);
    expect(f).toMatch(/Monday 16 November 2026|Monday, 16 November 2026/);
    expect(f).toMatch(/Europe\/London\. Currency GBP/);
    expect(f).toMatch(/890 credits available now — 640 credits of the 1,000 credits monthly allowance left \(36% used\), 250 credits bought, 12 credits used today/);
    expect(f).toMatch(/per-task limit 50 credits; hard cap on, no overage/);
    expect(f).toMatch(/active events 13 of 25, team seats 5 of 10/);
    expect(f).toMatch(/booking authority £5,000 \(above that only the owner can approve\)/);
    expect(f).toMatch(/£20,000\/month/);
    expect(f).toMatch(/refunds above £100 need a person/);
    expect(f).toMatch(/quiet hours 21:00–08:00/);
    expect(f).toMatch(/external actions and commitments .* yes, each one approved by a person/);
    expect(f).toMatch(/CURRENT PAGE: the person is looking at the event "Neon Nights Festival"/);
    const starter = grounding.workspaceFacts(limits({ plan: "starter", capabilities: { actions: false, deep: false, api: false } }));
    expect(starter).toMatch(/Starter plan/);
    expect(starter).toMatch(/NO \(needs Pro or above; you can still read, draft and create tasks\)/);
    expect(starter).toMatch(/LIMITS TO MENTION .*External actions need Pro or above/);
    expect(grounding.workspaceFacts(limits({ credits: null, policy: null }))).toMatch(/AI credits: status unavailable[\s\S]*Agent policy: defaults/);
  });

  test("answers are asked to be specific and grounded", () => {
    expect(grounding.ANSWER_STYLE).toMatch(/Lead with the direct answer/);
    expect(grounding.ANSWER_STYLE).toMatch(/names, dates \(with zone\), amounts/);
    expect(grounding.ANSWER_STYLE).toMatch(/say exactly what is missing/);
    expect(grounding.ANSWER_STYLE).toMatch(/limit that applies \(plan, credits, booking authority, spend caps\)/);
  });

  test("limits are checked before an action is proposed, with a plain explanation", () => {
    const T = registry.TOOL;
    // Plan gate: Starter has no agent.actions → R3 / R4 blocked, R0–R2 allowed.
    const starter = limits({ plan: "starter", capabilities: { actions: false, deep: false, api: false } });
    const g1 = grounding.gateTool(starter, T.get("message.party")!, {});
    expect(g1).toMatchObject({ ok: false, code: "plan_not_entitled" });
    expect((g1 as { message: string }).message).toMatch(/needs the Pro plan or above \(this workspace is on Starter\).*Settings → Billing/);
    expect(grounding.gateTool(starter, T.get("tickets.publish_tier")!, {}).ok).toBe(false);
    expect(grounding.gateTool(starter, T.get("task.create")!, {}).ok).toBe(true);
    expect(grounding.gateTool(starter, T.get("events.list")!, {}).ok).toBe(true);
    // Policy modes.
    expect(grounding.gateTool(limits({ policy: { ...limits().policy!, mode: "draft" } }), T.get("task.create")!, {})).toMatchObject({ ok: false, code: "policy_draft_only" });
    expect(grounding.gateTool(limits({ policy: { ...limits().policy!, mode: "draft" } }), T.get("draft.note")!, {}).ok).toBe(true);
    expect(grounding.gateTool(limits({ policy: { ...limits().policy!, mode: "suggest" } }), T.get("draft.note")!, {})).toMatchObject({ ok: false, code: "policy_suggest_only" });
    expect(grounding.gateTool(limits({ policy: { ...limits().policy!, allowed_tools: ["events.list"] } }), T.get("task.create")!, {})).toMatchObject({ ok: false, code: "policy_blocks_tool" });
    expect(grounding.gateTool(limits({ policy: { ...limits().policy!, kill_switch: true } }), T.get("events.list")!, {})).toMatchObject({ ok: false, code: "workspace_kill_switch" });
    // Spend caps and booking authority (amounts from the tool, e.g. a provider quote).
    const quote = (gbp: number) => ({ item_id: EV, items: [{ name: "Hire", qty: 1, unit_price: gbp }] });
    const pro = limits({ surface: "provider" });
    const over = grounding.gateTool(pro, T.get("quote.send")!, quote(25_000));
    expect(over).toMatchObject({ ok: false, code: "exceeds_monthly_spend_cap" });
    expect((over as { message: string }).message).toMatch(/£25,000 is above the workspace's monthly Agent spend cap of £20,000/);
    const owner = grounding.gateTool(pro, T.get("quote.send")!, quote(6_000));
    expect(owner).toMatchObject({ ok: true });
    expect((owner as { note?: string }).note).toMatch(/£6,000 is above the £5,000 booking authority, so only the workspace owner can approve it/);
    expect((grounding.gateTool(pro, T.get("quote.send")!, quote(100)) as { note?: string }).note).toMatch(/needs a person's approval/);
    // R5 never (synthetic tool).
    expect(grounding.gateTool(limits(), { id: "payout.change", risk: 5, title: "Change payout account" }, {})).toMatchObject({ ok: false, code: "risk_r5_never" });
  });

  test("credits: an exhausted or daily-capped workspace gets the reason and what to do, before any model call", () => {
    expect(grounding.creditBlock(limits())).toBeNull();
    const none = grounding.creditBlock(limits({ credits: { ...limits().credits!, available: 0, allowance_left: 0, balance: 0, pct: 100 } }));
    expect(none).toMatch(/used its Gala Agent credits for the month.*buy a credit pack or approve overage in Settings → Agent/);
    expect(grounding.creditBlock(limits({ credits: { ...limits().credits!, daily_limit: 10, used_today: 12 } }))).toMatch(/today's Gala Agent limit \(10 credits\)/);
    expect(grounding.creditBlock(limits({ policy: { ...limits().policy!, kill_switch: true } }))).toMatch(/switched off/);
    expect(grounding.limitWarnings(limits({ credits: { ...limits().credits!, pct: 88 } })).join(" ")).toMatch(/used 88% of its monthly AI allowance/);
    expect(grounding.limitWarnings(limits({ planLimits: { plan: "starter", events: { used: 3, max: 3 } } })).join(" ")).toMatch(/Active events are at the plan limit \(3\/3\)/);
  });

  test("planner gate removes over-limit steps and explains them; recurring series ask which date", () => {
    const starter = limits({ plan: "starter", capabilities: { actions: false, deep: false, api: false } });
    const r = grounding.gateSteps(starter, [{ tool: "events.list", input: {} }, { tool: "marketplace.request_hold", input: { item_id: EV, hours: 48 } }]);
    expect(r.steps.map(s => s.tool)).toEqual(["events.list"]);
    expect(r.blocked).toEqual([expect.objectContaining({ tool: "marketplace.request_hold", code: "plan_not_entitled" })]);
    expect(grounding.limitSummary("I'll check the event.", r, 1)).toMatch(/^Part of this is over a limit[\s\S]*Pro plan[\s\S]*What I can still do: I'll check the event\./);
    expect(grounding.limitSummary("x", { blocked: r.blocked, notes: [] }, 0)).toMatch(/^I can’t do this as asked because of this workspace’s limits:[\s\S]*Nothing was changed\.$/);
    const ev = (id: string, d: string, status = "draft") => ({ id, name: "Warehouse Sessions: Bassline", starts_at: d, status });
    const series = [ev("a", "2027-01-23T22:00:00Z"), ev("b", "2027-02-06T22:00:00Z"), { id: "c", name: "Neon Nights Festival", starts_at: "2026-12-12T18:00:00Z", status: "on_sale" }];
    const now = new Date("2026-11-16T10:00:00Z");
    expect(grounding.ambiguousEvent("Create a task on Warehouse Sessions to book door staff", series, now)?.map(e => e.id)).toEqual(["a", "b"]);
    expect(grounding.ambiguousEvent("Create a task on Warehouse Sessions on 6 Feb to book door staff", series, now)).toBeNull();
    expect(grounding.ambiguousEvent("Readiness for Neon Nights Festival", series, now)).toBeNull();
    expect(grounding.ambiguityQuestion(grounding.ambiguousEvent("warehouse sessions door staff", series, now)!)).toMatch(/^Which "Warehouse Sessions" do you mean\? There are 2 upcoming: .*23 Jan 2027.*6 Feb 2027.*Nothing was changed\.$/);
  });

  test("answer clean-up and plain tool errors", () => {
    expect(grounding.tidyAnswer("[Open](\\/organizer\\/events\\/abc) and [event.budget](#)")).toBe("[Open](/organizer/events/abc) and event.budget");
    expect(grounding.toolErrorText("permission_denied:finance.read")).toMatch(/role doesn't include the "finance.read" permission.*Settings, Team/);
    expect(grounding.toolErrorText("not_found")).toMatch(/no such record/);
  });
});

// ── Mocked model through the real runtime (in-memory database) ───────────────────────────────────────────────────────────────
class AgentBudgetError extends Error {}
class AgentSafetyError extends Error {}
type Msg = { role: string; content: string };
type State = { caps: Record<string, boolean>; credit: Record<string, unknown>; policy: Record<string, unknown> | null; updates: { table: string; patch: Record<string, unknown> }[]; inserts: { table: string; rows: unknown }[] };
function fakeDb(st: State) {
  const one = (table: string): unknown => ({
    workspaces: { name: "Alex Events", plan: st.caps["agent.actions"] ? "pro" : "starter", settings: {}, kind: "organizer" },
    profiles: { language: "en-GB" }, workspace_members: { role: "owner", status: "active" }, agent_policies: st.policy, agent_runtime_controls: { kill_switch: false },
  } as Record<string, unknown>)[table] ?? null;
  const many = (table: string): unknown[] => table === "events" ? [{ id: EV, name: "Neon Nights Festival", starts_at: "2026-12-12T18:00:00Z", status: "on_sale" }] : [];
  const from = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const k of ["select", "eq", "neq", "in", "order", "limit", "gte", "lt", "gt", "or", "not", "is", "lte"]) b[k] = () => b;
    b.maybeSingle = async () => ({ data: one(table), error: null });
    b.single = async () => ({ data: one(table) ?? { id: "row" }, error: null });
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: many(table), error: null, count: 0 }).then(res, rej);
    b.update = (patch: Record<string, unknown>) => { st.updates.push({ table, patch }); return b; };
    b.insert = (rows: unknown) => { st.inserts.push({ table, rows }); return b; };
    b.delete = () => b;
    return b;
  };
  const rpc = async (fn: string, args: Record<string, unknown> = {}) => ({ error: null, data:
    fn === "has_capability" ? st.caps[String(args.p_capability)] === true
      : fn === "ai_credit_status" ? st.credit
      : fn === "plan_limit_status" ? { plan: st.caps["agent.actions"] ? "pro" : "starter", events: { used: 13, max: 25 }, seats: { used: 5, max: 10 } }
      : fn === "maintenance_level" ? 0 : fn === "agent_invoke" ? [{ id: EV, name: "Neon Nights Festival", link: `/organizer/events/${EV}` }] : null });
  return { from, rpc };
}
const CREDIT = { allowance: 1000, allowance_left: 990, balance: 0, available: 990, used_this_month: 10, used_today: 1, pct: 1, hard_cap: true, allow_overage: false, overage_limit: 0, daily_limit: null, per_run_limit: 50, soft_caps: [70, 85, 95], deep_allowed: false };

function harness(st: State, model: Record<string, string>) {
  const calls: { purpose: string; messages: Msg[] }[] = [];
  const chat = async (messages: Msg[], opts?: { meter?: { purpose?: string } }) => {
    const purpose = opts?.meter?.purpose ?? "none"; calls.push({ purpose, messages });
    return { text: model[purpose] ?? "", tokens: 10 };
  };
  const db = fakeDb(st);
  const runtime = load<{ ask: (u: string, w: string, s: "organizer", q: string, o?: object) => Promise<{ ok: boolean; code?: string; error?: string; answer?: string; sources?: string[] }>; planRun: (d: unknown, r: Record<string, unknown>) => Promise<void> }>("src/lib/agent/runtime.ts", {
    "server-only": {}, "node:crypto": nodeCrypto, "@/lib/supabase/admin": { createAdminClient: () => db }, "@/lib/workspace/db": { untyped: (x: unknown) => x },
    "./locale": { localeDirective: () => "Today is 16 November 2026 in Europe/London (GMT)." }, "@/lib/i18n/workspace": { workspaceLocale: () => ({ timezone: "Europe/London", currency: "GBP" }) },
    "./llm": { chat, agentConfigured: () => true, SAFETY: "SAFETY", dataBlock: prompt.dataBlock, AgentBudgetError, AgentSafetyError },
    "./resilience": resilience, "@/lib/media/document": { PRESETS: [{ id: "a3", w: 1, h: 1, label: "A3" }], posterFromEvent: () => ({}) },
    "./watch": watch, "./registry": registry, "./minimise": minimiseMod, "./plan": plan, "./skills": skills, "./schedule-db": { routineNextRun: async () => null }, "./grounding": grounding,
  });
  return { runtime, calls, db };
}
const fresh = (o: Partial<State> = {}): State => ({ caps: { "agent.actions": true, "agent.deep": false, "api.access": true }, credit: { ...CREDIT }, policy: null, updates: [], inserts: [], ...o });

test.describe("Gala Agent grounding through the runtime (mocked model)", () => {
  test("Ask: tool pick and answer prompts carry identity, workspace, plan, credits, limits and the page; answers are not capped at 700 tokens", async () => {
    const st = fresh();
    const { runtime, calls } = harness(st, { tool_pick: JSON.stringify({ calls: [{ tool: "events.list", input: {} }] }), answer: "Gala Dock is the connected event platform. [Neon](\\/organizer\\/events\\/x)" });
    const r = await runtime.ask(USER, WS, "organizer", "What is this platform?", { page: "the event \"Neon Nights Festival\"", eventId: EV });
    expect(r.ok).toBe(true);
    expect(r.answer).toBe("Gala Dock is the connected event platform. [Neon](/organizer/events/x)");
    expect(r.sources).toEqual(["events.list"]);
    const pick = calls.find(c => c.purpose === "tool_pick")!.messages[0]!.content;
    const answer = calls.find(c => c.purpose === "answer")!.messages[0]!.content;
    for (const p of [pick, answer]) {
      expect(p).toMatch(/You are Gala Agent, the built-in AI assistant of Gala Dock/);
      expect(p).toMatch(/"Alex Events" — organizer workspace on the Pro plan\. The person is the workspace owner/);
      expect(p).toMatch(/AI credits \(1 credit = 1p\): 990 credits available now/);
      expect(p).toMatch(/Plan limits: active events 13 of 25/);
      expect(p).toMatch(/Agent policy: defaults/);
      expect(p).toMatch(/Today is 16 November 2026/);
      expect(p).toMatch(/CURRENT PAGE: the person is looking at the event "Neon Nights Festival"/);
    }
    expect(pick).toMatch(/Call tools whenever the answer depends on this workspace's records/);
    expect(pick).toContain(`${EV} | Neon Nights Festival | 2026-12-12 | on_sale`);
    expect(pick).toContain(`The current page's event id: ${EV}`);
    expect(answer).toMatch(/Lead with the direct answer/);
    const src = readFileSync("src/lib/agent/runtime.ts", "utf8");
    expect(src).toMatch(/purpose: opts\.purpose \?\? "answer", traceId \} \}\)/);
    expect(src).toMatch(/maxTokens: 2000, tier: "standard", meter: \{ workspaceId, userId, purpose: opts\.purpose/);
  });

  test("Ask: a workspace with no credits is told why and what to do, and no model is called", async () => {
    const st = fresh({ credit: { ...CREDIT, available: 0, allowance_left: 0, pct: 100 } });
    const { runtime, calls } = harness(st, {});
    const r = await runtime.ask(USER, WS, "organizer", "How are ticket sales?");
    expect(r).toMatchObject({ ok: false, code: "credits" });
    expect(r.error).toMatch(/used its Gala Agent credits for the month.*Settings → Agent/);
    expect(calls).toHaveLength(0);
  });

  test("Planner: on Starter an external action is blocked before it is proposed, with the plan limit explained (no second model call)", async () => {
    const st = fresh({ caps: { "agent.actions": false, "agent.deep": false, "api.access": false } });
    const planJson = JSON.stringify({ interpretation: { summary: "I'll ask the caterer to hold the date.", scope: [] }, confidence: 0.9,
      steps: [{ tool: "marketplace.request_hold", input: { item_id: EV, hours: 48 }, why: "hold" }] });
    const { runtime, calls } = harness(st, { plan: planJson });
    await runtime.planRun(fakeDb(st), { id: "run-1", workspace_id: WS, user_id: USER, goal: "Ask the caterer to hold the date for 48 hours", status: "queued", surface: "organizer", mode: "do", interpretation: {}, tokens: 0, retries: 0, created_at: "", routine_id: null });
    const plannerPrompt = calls.find(c => c.purpose === "plan")!.messages[0]!.content;
    expect(plannerPrompt).toMatch(/You are Gala Agent, the built-in AI assistant of Gala Dock/);
    expect(plannerPrompt).toMatch(/Starter plan/);
    expect(plannerPrompt).toMatch(/UNAVAILABLE right now .*marketplace\.request_hold: Request a hold is an external action, which needs the Pro plan or above/);
    expect(plannerPrompt).not.toMatch(/"id":"marketplace\.request_hold"/);   // not offered in the catalogue
    expect(calls.map(c => c.purpose)).toEqual(["plan"]);                    // the limit is the answer: no ask fallback
    const done = st.updates.filter(u => u.table === "agent_runs").map(u => u.patch).find(p => p.status === "completed")!;
    expect(String(done.summary)).toMatch(/^I can’t do this as asked because of this workspace’s limits:[\s\S]*needs the Pro plan or above \(this workspace is on Starter\)[\s\S]*Nothing was changed\./);
    expect((done.interpretation as { limits_blocked: { code: string }[] }).limits_blocked[0]!.code).toBe("plan_not_entitled");
    expect(st.inserts.some(i => i.table === "agent_run_steps")).toBe(false);
  });

  test("Planner: R4 on Pro is kept for approval and the approval note says so", async () => {
    const st = fresh();
    const planJson = JSON.stringify({ interpretation: { summary: "Put the tier on sale.", scope: [] }, confidence: 0.9, steps: [{ tool: "tickets.publish_tier", input: { tier_id: EV }, why: "publish" }] });
    const { runtime } = harness(st, { plan: planJson });
    await runtime.planRun(fakeDb(st), { id: "run-2", workspace_id: WS, user_id: USER, goal: "Put the VIP tier on sale", status: "queued", surface: "organizer", mode: "do", interpretation: {}, tokens: 0, retries: 0, created_at: "", routine_id: null });
    const p = st.updates.filter(u => u.table === "agent_runs").map(u => u.patch).find(x => x.status === "awaiting_plan_confirmation")!;
    expect(p).toBeTruthy();
    expect((p.interpretation as { approval_notes: string[] }).approval_notes).toEqual(["Put tickets on sale needs a person's approval before anything happens."]);
  });
});

test.describe("No Gala Agent in the customer workspace", () => {
  test("no tool is exposed to customers, the Ask route refuses the customer scope, and grounding only knows organiser / provider", () => {
    expect(registry.TOOLS.every(t => !(t.exposure as string[]).includes("customer"))).toBe(true);
    const route = src("src/app/api/agent/ask/route.ts");
    expect(route).toMatch(/if \(parsed\.data\.scope === "customer"\) return NextResponse\.json\(\{ error: "Gala Agent is available in Organizer and Provider workspaces\." \}, \{ status: 403 \}\)/);
    // The refusal comes before any model or limits work.
    expect(route.indexOf('scope === "customer"')).toBeLessThan(route.indexOf("await ask("));
    expect(grounding.platformIdentity("organizer")).toMatch(/Gala Agent helps organisers and providers only \(never customers\)/);
    expect(src("src/lib/agent/grounding.ts")).not.toMatch(/"customer"/);
  });

  test("provider chat is grounded too (identity + live limits on every turn, credit block before the model)", async () => {
    const calls: Msg[][] = [];
    const st = fresh();
    const mod = load<{ askProviderAgent: (s: string, g: string, h: Msg[], m: object, gr?: string) => Promise<unknown>; providerGrounding: (db: unknown, ws: string, u: string) => Promise<{ text: string; blocked: string | null }> }>("src/lib/provider/agent.ts", {
      "server-only": {}, "@/lib/agent/llm": { agentConfigured: () => true, chat: async (m: Msg[]) => { calls.push(m); return { text: JSON.stringify({ reply: "ok", proposals: [] }), tokens: 1 }; } },
      "@/lib/supabase/admin": { createAdminClient: () => fakeDb(st) }, "@/lib/agent/grounding": grounding,
    });
    const g = await mod.providerGrounding(fakeDb(st), WS, USER);
    expect(g.text).toMatch(/You are Gala Agent, the built-in AI assistant of Gala Dock[\s\S]*PROVIDER[\s\S]*AI credits/);
    expect(g.blocked).toBeNull();
    await mod.askProviderAgent("LISTING …", "What's due?", [], { workspaceId: WS, userId: USER, purpose: "provider_chat" }, g.text);
    expect(calls[0]![0]!.content).toMatch(/^IDENTITY: You are Gala Agent/);
    expect(src("src/app/api/agent/provider/route.ts")).toMatch(/if \(g\.blocked\) return json\(\{ error: g\.blocked, budget: true \}, 402\)/);
  });
});
