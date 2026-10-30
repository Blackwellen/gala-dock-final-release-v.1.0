import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q28 AI profitability assurance (migrations 202610291012, 1015, 1016). API level against the shared project; NO provider calls:
// the metering RPCs are driven directly with fixed token counts (budget for real AI spend: £0). Gala Dock's AI is Azure OpenAI only.
const db = admin as unknown as SupabaseClient;
type Report = { flags: { code: string; severity: string }[]; totals: { cost_minor: number; absorbed_cost_minor: number; unbilled_plan_cost_minor: number }; packs: { name: string; margin_bps: number; target_bps: number }[] };
const report = async () => { const r = await db.rpc("ai_profitability_report", { p_month: null }); expect(r.error).toBeNull(); return r.data as Report; };

test.describe.configure({ mode: "serial" });
test.describe("Q28 AI profitability", () => {
  let owner: { id: string; email: string }, ws: string, paid: string;
  test.beforeAll(async () => {
    owner = await createUser("q28-o");
    ws = await seedWorkspace(owner.id, "provider", "Q28 Metered Provider");
    paid = await seedWorkspace(owner.id, "organizer", "Q28 Paid Plan Org");
    await db.from("workspaces").update({ plan: "pro" }).eq("id", paid);
    await db.from("ai_budgets").insert([{ workspace_id: ws, monthly_allowance: 5, per_run_limit: 1000, allow_overage: true, overage_limit: 1000, hard_cap: false }, { workspace_id: paid, monthly_allowance: 1000, per_run_limit: 1000 }]);
  });
  test.afterAll(async () => {
    await db.from("ai_usage_events").delete().eq("user_id", owner.id).is("workspace_id", null);   // platform-absorbed fixture rows (keep the live month clean)
    for (const w of [ws, paid]) await db.from("workspaces").delete().eq("id", w); await cleanup();
  });

  test("pack guard: £25/£89/£219 clear 75% after card fees; Azure list prices; packs active; below-margin packs refused", async () => {
    // Owner decisions 2026-10-28: packs repriced (202610291015), Azure price book → padded list prices, Claude rows unused (202610291016).
    const r = await report();
    const byName = Object.fromEntries(r.packs.map(p => [p.name, p]));
    expect(r.packs.map(p => [p.name, (p as unknown as { price_minor: number }).price_minor])).toEqual([["Top-up S", 2500], ["Top-up M", 8900], ["Top-up L", 21900]]);
    expect(byName["Top-up S"]!.margin_bps).toBe(7770);
    expect(byName["Top-up M"]!.margin_bps).toBe(7580);
    expect(byName["Top-up L"]!.margin_bps).toBe(7557);
    for (const p of r.packs) expect(p.margin_bps).toBeGreaterThanOrEqual(p.target_bps);
    // Break-even for 75%: price ≥ (20p + cost) / 0.235 → 500 credits need £22.13.
    expect(((await db.rpc("ai_pack_margin_bps", { p_credits: 500, p_price_minor: 2213 })).data as number)).toBeGreaterThanOrEqual(7500);
    expect(((await db.rpc("ai_pack_margin_bps", { p_credits: 500, p_price_minor: 2200 })).data as number)).toBeLessThan(7500);
    const prices = (await db.from("ai_model_prices").select("model,provider,source,active,input_per_mtok,cached_input_per_mtok,output_per_mtok,fx_to_gbp")).data as { model: string; provider: string; source: string; active: boolean; input_per_mtok: number; cached_input_per_mtok: number; output_per_mtok: number; fx_to_gbp: number }[];
    const az = Object.fromEntries(prices.filter(p => p.provider === "azure_openai").map(p => [p.model, [Number(p.input_per_mtok), Number(p.cached_input_per_mtok), Number(p.output_per_mtok), Number(p.fx_to_gbp), p.source, p.active]]));
    expect(az).toEqual({ standard: [0.825, 0.0825, 4.95, 0.8, "list_price", true], fast: [0.22, 0.022, 1.375, 0.8, "list_price", true], deep: [5, 0.5, 25, 0.8, "list_price", true] });
    expect(prices.filter(p => p.provider === "anthropic").every(p => !p.active)).toBe(true);   // kept for history, unused
    expect(r.flags.some(f => f.code === "price_book_estimate")).toBe(false);
    const packs = (await db.from("credit_packs").select("active,stripe_price_test").in("name", ["Top-up S", "Top-up M", "Top-up L"])).data as { active: boolean; stripe_price_test: string | null }[];
    expect(packs.length).toBe(3);
    expect(packs.every(p => p.active && /^price_/.test(p.stripe_price_test ?? ""))).toBe(true);
    const temp = await db.from("credit_packs").insert({ name: "Q28 temp pack", credits: 100, price_minor: 100, active: true, workspace_kinds: ["organizer"] }).select("id");
    expect(temp.error?.message).toMatch(/pack_below_margin/);
    const { data: s } = await db.from("credit_packs").select("id").eq("name", "Top-up S").single();
    const cut = await db.from("credit_packs").update({ price_minor: 2000 }).eq("id", (s as { id: string }).id).select("id");   // repricing an active pack below target is refused
    expect(cut.error?.message).toMatch(/pack_below_margin/);
  });

  test("overage accrues a receivable at the documented 4p rate, accumulating per month", async () => {
    const r1 = (await db.rpc("record_ai_usage", { p_workspace: ws, p_user: owner.id, p_run: null, p_purpose: "q28-test", p_model: "standard", p_input: 1_000_000, p_cached: 0, p_output: 1_000_000 })).data as { credits: number; overage: number };
    expect(Number(r1.overage)).toBeGreaterThan(0);
    const o1 = (await db.from("ai_overage_charges").select("credits,amount_minor,rate_minor,status").eq("workspace_id", ws).single()).data as { credits: number; amount_minor: number; rate_minor: number; status: string };
    expect(Number(o1.rate_minor)).toBe(4); expect(o1.status).toBe("accrued");
    expect(Number(o1.credits)).toBeCloseTo(Number(r1.overage), 3);
    expect(o1.amount_minor).toBe(Math.ceil(Number(r1.overage) * 4));
    const r2 = (await db.rpc("record_ai_usage", { p_workspace: ws, p_user: owner.id, p_run: null, p_purpose: "q28-test", p_model: "fast", p_input: 100_000, p_cached: 0, p_output: 100_000 })).data as { overage: number };
    const o2 = (await db.from("ai_overage_charges").select("credits,amount_minor").eq("workspace_id", ws).single()).data as { credits: number; amount_minor: number };
    expect(Number(o2.credits)).toBeCloseTo(Number(r1.overage) + Number(r2.overage), 3);
    expect(o2.amount_minor).toBe(Math.ceil((Number(r1.overage) + Number(r2.overage)) * 4));
  });

  test("report flags: estimates, unbilled paid-plan allowance (cleared by a live subscription), provider invoice drift", async () => {
    const before = await report();
    expect(before.flags.some(f => f.code === "price_book_estimate")).toBe(false);   // Azure list prices since 202610291016
    await db.rpc("record_ai_usage", { p_workspace: paid, p_user: owner.id, p_run: null, p_purpose: "q28-test", p_model: "standard", p_input: 200_000, p_cached: 0, p_output: 100_000 });
    const flagged = await report();
    expect(flagged.flags.find(f => f.code === "plan_revenue_not_billed")?.severity).toBe("high");
    const unbilled = Number(flagged.totals.unbilled_plan_cost_minor);
    expect(unbilled).toBeGreaterThan(0);
    await db.from("workspace_subscriptions").insert({ workspace_id: paid, stripe_subscription_id: `sub_q28test${Date.now()}`, kind: "organizer", plan: "pro", billing_interval: "month", status: "active" });
    const cleared = await report();
    expect(Number(cleared.totals.unbilled_plan_cost_minor)).toBeLessThan(unbilled);   // this workspace's allowance cost is now covered
    // Provider invoice entry is commerce-admin only.
    const u = await signedIn(owner.email) as unknown as SupabaseClient;
    expect((await u.rpc("admin_record_ai_provider_invoice", { p_period: "2026-10-01", p_amount: 1, p_currency: "USD", p_fx: 0.79, p_reference: "INV-1", p_provider: "anthropic" })).error?.message).toMatch(/not_authorized/);
    expect((await u.rpc("ai_profitability_report", { p_month: null })).error?.message).toMatch(/not_authorized/);
  });

  test("unmetered_runs is scoped to runs after meter go-live (setting), historic runs untouched", async () => {
    const s = (await db.from("ai_economics_settings").select("meter_live_on").single()).data as { meter_live_on: string };
    expect(s.meter_live_on).toBe("2026-10-11");
    // The real historic run (2026-10-11, before the meter) no longer raises the flag for October.
    const oct = (await db.rpc("ai_profitability_report", { p_month: "2026-10-01" })).data as Report;
    const before = oct.flags.some(f => f.code === "unmetered_runs");
    const historic = (await db.from("agent_runs").select("id,tokens").eq("id", "5784b15d-9b84-4f69-8bb0-e4c3254ea868").maybeSingle()).data as { tokens: number } | null;
    if (historic) expect(historic.tokens).toBe(2715);                                 // not rewritten
    // A run created now with tokens and no metered usage IS flagged; removing it clears the flag again.
    const { data: run, error } = await db.from("agent_runs").insert({ workspace_id: ws, user_id: owner.id, goal: "q28 unmetered fixture", tokens: 123, status: "completed" }).select("id").single();
    expect(error).toBeNull();
    try {
      const now = await report();
      expect(now.flags.find(f => f.code === "unmetered_runs")?.severity).toBe("high");
    } finally { await db.from("agent_runs").delete().eq("id", (run as { id: string }).id); }
    if (!before) expect((await report()).flags.some(f => f.code === "unmetered_runs")).toBe(false);
  });

  test("daily alert job notifies platform admins once per day when a high flag is present", async () => {
    // With list prices and live subscriptions the real month may carry no high flag; a fixture unmetered run raises one.
    const { data: run } = await db.from("agent_runs").insert({ workspace_id: ws, user_id: owner.id, goal: "q28 alert fixture", tokens: 50, status: "completed" }).select("id").single();
    const { data: id, error } = await db.rpc("enqueue_job", { p_kind: "ai.profitability_alert", p_payload: {}, p_dedupe_key: `q28-test:${Date.now()}` });
    expect(error).toBeNull(); expect(id).toBeTruthy();
    try { await db.rpc("run_db_jobs", { p_limit: 5, p_kinds: ["ai.profitability_alert"] }); }
    finally { await db.from("agent_runs").delete().eq("id", (run as { id: string }).id); }
    const { data: job } = await db.from("job_queue").select("status,result").eq("id", id as string).single();
    expect((job as { status: string }).status).toBe("succeeded");
    expect(Number((job as { result: { high: number } }).result.high)).toBeGreaterThan(0);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const { data: notes } = await db.from("notifications").select("user_id").like("title", "AI profitability:%").gte("created_at", today.toISOString());
    const perAdmin = new Map<string, number>(); for (const n of (notes ?? []) as { user_id: string }[]) perAdmin.set(n.user_id, (perAdmin.get(n.user_id) ?? 0) + 1);
    expect(perAdmin.size).toBeGreaterThan(0);
    expect([...perAdmin.values()].every(c => c === 1)).toBe(true);
  });

  test("Azure metering: a hard-capped workspace is refused at preflight; pre-workspace asks are platform-absorbed", async () => {
    await db.from("ai_budgets").update({ hard_cap: true, allow_overage: false }).eq("workspace_id", ws);
    const pre = await db.rpc("ai_preflight", { p_workspace: ws, p_run: null, p_tier: "standard", p_estimate: 50 });
    expect(pre.error?.message).toMatch(/ai_hard_cap|ai_daily_limit/);              // llm.ts chat() → AgentBudgetError → provider route 402
    const before = Number((await report()).totals.absorbed_cost_minor);
    const r = (await db.rpc("record_ai_usage", { p_workspace: null, p_user: owner.id, p_run: null, p_purpose: "onboarding:organisation", p_model: "standard", p_input: 20_000, p_cached: 0, p_output: 5_000 })).data as { cost_gbp_minor: number };
    expect(Number(r.cost_gbp_minor)).toBeCloseTo((20_000 * 0.825 + 5_000 * 4.95) / 1e6 * 0.8 * 100, 3);   // padded Azure list price
    expect(Number((await report()).totals.absorbed_cost_minor)).toBeCloseTo(before + Number(r.cost_gbp_minor), 1);
  });

  test("Azure OpenAI only: no Anthropic SDK or messages.create anywhere; agents use the metered llm.ts chat(); customer cannot reach AI", async () => {
    const root = path.resolve(__dirname, "../../src");
    const files: string[] = [];
    const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(ts|tsx|js|mjs)$/.test(f.name)) files.push(p); } };
    walk(root);
    const rel = (p: string) => path.relative(root, p).replaceAll("\\", "/");
    const src = (f: string) => fs.readFileSync(f, "utf8");
    expect(files.filter(f => /messages\.create\(|@anthropic-ai\/sdk|anthropic-meter|lib\/agent\/claude|api\.anthropic\.com|ANTHROPIC_API_KEY/.test(src(f))).map(rel)).toEqual([]);
    expect(fs.existsSync(path.join(root, "lib/agent/anthropic-meter.ts")) || fs.existsSync(path.join(root, "lib/agent/claude.ts"))).toBe(false);
    // Every Azure completion goes through chat() in llm.ts (preflight + record_ai_usage).
    expect(files.filter(f => /chat\/completions/.test(src(f))).map(rel)).toEqual(["lib/agent/llm.ts"]);
    const providerAgent = src(path.join(root, "lib/provider/agent.ts")), providerRoute = src(path.join(root, "app/api/agent/provider/route.ts"));
    expect(providerAgent).toMatch(/from "@\/lib\/agent\/llm"/); expect(providerAgent).toMatch(/provider_agent_meter_required/);
    expect(providerRoute).toMatch(/workspaceId: workspace\.id/); expect(providerRoute).toMatch(/AgentBudgetError[\s\S]*402/);
    const onboarding = src(path.join(root, "app/api/agent/onboarding/route.ts"));
    expect(onboarding).toMatch(/from "@\/lib\/agent\/llm"/); expect(onboarding).toMatch(/workspaceId: null/);
    expect(onboarding).toMatch(/rateLimit\(`agent:\$\{user\.id\}`, 10, 300\)/); expect(onboarding).toMatch(/40, 86_400/);
    const customer = files.filter(f => /^(app\/\(customer\)|components\/customer)\//.test(rel(f)));
    expect(customer.length).toBeGreaterThan(5);
    expect(customer.filter(f => /\/api\/agent|@\/lib\/agent\/|lib\/provider\/agent|anthropic/i.test(src(f))).map(rel)).toEqual([]);
    expect(onboarding).toMatch(/step === "preferences"/);   // customer preferences step refused server-side
    expect(src(path.join(root, "components/onboarding.tsx"))).not.toMatch(/AgentInline step="preferences"/);
  });
});
