import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { SKILLS, skillInvariants, routeTier, memoryRefusal } from "../../src/lib/agent/skills";
import { TOOL, TOOLS, catalogFor, DEFAULT_POLICY } from "../../src/lib/agent/registry";
import { runSuite, BASELINE } from "../../src/lib/agent/eval/harness";
import { ORGANIZER_SCENARIOS, PROVIDER_SCENARIOS } from "../../src/lib/agent/eval/agents";

// Q42 Organizer Agent + Q43 Provider Agent (lane D). Deterministic FakeModel only — no Azure / network calls, no real Gala Agent
// runs on demo data. Database tests use disposable identities and workspaces; every tool call goes through agent_execute_tool.
const db = admin as unknown as SupabaseClient;
type U = { id: string; email: string };
type R = { ok: boolean; refused?: boolean; replayed?: boolean; error?: string | null; output?: unknown; call_id?: string };
const tag = randomBytes(3).toString("hex");
const msg = (e: { message?: string } | null) => e?.message ?? "";

test.describe("Q42/Q43 skills, routing, memory rules and evals (pure)", () => {
  test("skill registry: valid bindings, every required mission, never customer", () => {
    expect(skillInvariants()).toEqual([]);
    const org = ["org.create_event_plan", "org.source_venue", "org.source_suppliers", "org.ticket_strategy", "org.promotion_plan", "org.readiness_review", "org.emergency_recovery", "org.event_day_command", "org.post_event_closeout"];
    const pro = ["pro.find_work", "pro.draft_quote", "pro.protect_sla", "pro.allocate_resources", "pro.venue_occupancy", "pro.emergency_work", "pro.prepare_delivery", "pro.reconcile_payout"];
    for (const id of [...org, ...pro]) expect(SKILLS.find(s => s.id === id), id).toBeTruthy();
    expect(SKILLS.every(s => s.surface === "organizer" || s.surface === "provider")).toBe(true);
    for (const s of SKILLS) expect(s.planCapability).toBe(s.maxRisk >= 3 ? "agent.actions" : null);
    // Required domains are wired: maps, compliance/readiness, hospitality, logistics, campaigns (read-only), money, team, messaging.
    for (const id of ["map.validate", "compliance.overview", "hospitality.summary", "logistics.overview", "campaigns.calendar", "campaigns.report", "money.payables", "team.conflicts",
      "comms.inbox", "bookings.upcoming", "listing.availability", "crew.assign", "equipment.allocate", "availability.emergency_window", "quote.draft"]) expect(TOOL.get(id), id).toBeTruthy();
    expect(TOOLS.some(t => /^campaigns\./.test(t.id) && t.risk > 0)).toBe(false);
    expect(TOOLS.every(t => !(t.exposure as string[]).includes("customer"))).toBe(true);
    for (const id of ["memory.recall", "memory.remember", "mission.wait_for"]) expect(TOOL.get(id)!.exposure).toEqual(["organizer", "provider"]);
  });

  test("model routing per task tier: deep only when entitled, cheap tiers when credit is low or for routines", () => {
    const deep = SKILLS.find(s => s.id === "org.create_event_plan")!, basic = SKILLS.find(s => s.id === "org.ask")!, std = SKILLS.find(s => s.id === "org.source_venue")!;
    expect(routeTier(deep, { deepAllowed: true })).toBe("deep");
    expect(routeTier(deep, { deepAllowed: false })).toBe("standard");
    expect(routeTier(basic, { deepAllowed: true })).toBe("fast");
    expect(routeTier(std, { deepAllowed: true })).toBe("standard");
    expect(routeTier(std, { deepAllowed: true, lowCredit: true })).toBe("fast");
    expect(routeTier(std, { deepAllowed: true, routine: true })).toBe("fast");
    expect(routeTier(null, { deepAllowed: false, requested: "deep" })).toBe("standard");
  });

  test("memory data minimisation: contact, payment, health/dietary and secrets are refused", () => {
    for (const v of ["Call Jo on 07700 900123", "email jo@example.com", "card 4242 4242 4242 4242", "Most guests are vegan", "CEO has a nut allergy", "the api key is abc", "password hunter2"])
      expect(memoryRefusal(v), v).toBe("memory_sensitive_data");
    for (const v of ["Formal British English, short paragraphs", "Prefer venues in Leeds city centre", "Event on 2026-12-01 at 18:00", "Budget ceiling £20,000"]) expect(memoryRefusal(v), v).toBeNull();
  });

  test("Starter catalogue hides R3/R4 (coordinator decision: Starter = R0–R2)", () => {
    for (const surface of ["organizer", "provider"] as const) {
      const starter = catalogFor(surface, DEFAULT_POLICY, { actions: false }), pro = catalogFor(surface, DEFAULT_POLICY);
      expect(starter.every(c => Number(c.risk.slice(1)) <= 2)).toBe(true);
      expect(pro.some(c => Number(c.risk.slice(1)) >= 3)).toBe(true);
    }
  });

  test("eval harness: organizer and provider scenario suites pass with the FakeModel (and the Q41 baseline still passes)", () => {
    for (const [name, list] of [["organizer", ORGANIZER_SCENARIOS], ["provider", PROVIDER_SCENARIOS], ["baseline", BASELINE]] as const) {
      const r = runSuite([...list]);
      expect(r.results.filter(x => !x.pass).map(x => `${x.id}: ${x.failures.join("; ")}`), name).toEqual([]);
      expect(r.passed).toBe(r.total);
      if (name !== "baseline") for (const d of ["accuracy", "safety", "permission", "injection", "cost"] as const) expect(r.scores[d].total, `${name} ${d}`).toBeGreaterThan(0);
    }
  });
});

test.describe.configure({ mode: "serial" });

test.describe("Q42/Q43 governed missions in the database", () => {
  let O: U, OM: U, OB: U, P: U, PM: U, S: U, X: U;
  let W = "", PW = "", SW = "", XW = "", E = "", E2 = "", XE = "", L = "", B = "", B2 = "", RO = "", RP = "", RS = "";
  const exec = async (args: Record<string, unknown>) => {
    const { data, error } = await db.rpc("agent_execute_tool", { p_step: null, p_args: {}, p_idempotency: `q42-${tag}-${randomBytes(4).toString("hex")}`, p_approval: null, p_policy_auto: false, ...args });
    if (error) throw new Error(error.message);
    return data as R;
  };
  const status = async (run: string) => ((await db.from("agent_runs").select("status").eq("id", run).single()).data as { status: string }).status;
  const id = (r: { data: unknown }) => (r.data as { id: string }).id;
  const QUOTE = [{ name: "Room hire", qty: 1, unit_price: 500 }];

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    [O, OM, OB, P, PM, S, X] = await Promise.all(["q42-owner", "q42-mgr", "q42-member", "q43-owner", "q43-mgr", "q42-starter", "q42-out"].map(l => createUser(l)));
    [W, PW, SW, XW] = await Promise.all([seedWorkspace(O.id, "organizer", `Q42 Org ${tag}`), seedWorkspace(P.id, "provider", `Q43 Venue ${tag}`), seedWorkspace(S.id, "organizer", `Q42 Starter ${tag}`), seedWorkspace(X.id, "organizer", `Q42 Other ${tag}`)]);
    await db.from("workspaces").update({ plan: "pro" }).in("id", [W, PW, XW]);   // SW stays on Starter
    await db.from("workspace_members").insert([{ workspace_id: W, user_id: OM.id, role: "manager" }, { workspace_id: W, user_id: OB.id, role: "member" }, { workspace_id: PW, user_id: PM.id, role: "manager" }]);
    const ev = (w: string, o: string, name: string, days: number) => db.from("events").insert({ owner_id: o, workspace_id: w, management: "professional", name, status: "planning", event_type: "gala",
      starts_at: new Date(Date.now() + days * 864e5).toISOString(), ends_at: new Date(Date.now() + days * 864e5 + 5 * 36e5).toISOString(), guest_count: 120 }).select("id").single();
    [E, E2, XE] = [id(await ev(W, O.id, `Q42 Gala ${tag}`, 30)), id(await ev(W, O.id, `Q42 Clash ${tag}`, 40)), id(await ev(XW, X.id, `Q42 Foreign ${tag}`, 30))];
    L = id(await db.from("listings").insert({ workspace_id: PW, name: `Q43 Hall ${tag}`, kind: "venue", category: "venue", city: "Zedtown", published: true, capacity_max: 200, price_from: 500 }).select("id").single());
    B = id(await db.from("build_items").insert({ event_id: E, category: "venue", title: "Q42 venue", amount: 500, status: "sent", role: "primary", listing_id: L }).select("id").single());
    B2 = id(await db.from("build_items").insert({ event_id: E2, category: "venue", title: "Q42 venue 2", amount: 500, status: "sent", role: "primary", listing_id: L }).select("id").single());
    await db.from("provider_jobs").insert({ reference: `Q43-${tag}`, workspace_id: PW, listing_id: L, event_name: "Existing booking", client_name: "Someone",
      starts_at: new Date(Date.now() + 40 * 864e5).toISOString(), ends_at: new Date(Date.now() + 40 * 864e5 + 6 * 36e5).toISOString(), status: "confirmed", role: "primary" });
    const run = (w: string, u: string, surface: string, mission: string | null) => db.from("agent_runs").insert({ workspace_id: w, user_id: u, surface, mode: "do", goal: `Q42/Q43 ${tag} ${surface}`, status: "running", plan: [], mission }).select("id").single();
    RO = id(await run(W, O.id, "organizer", "org.source_venue")); RP = id(await run(PW, P.id, "provider", "pro.draft_quote")); RS = id(await run(SW, S.id, "organizer", null));
  });
  test.afterAll(async () => {
    const ws = [W, PW, SW, XW].filter(Boolean);
    await db.from("agent_runs").delete().in("workspace_id", ws);
    await db.from("agent_memories").delete().in("workspace_id", ws);
    await db.from("agent_policies").delete().in("workspace_id", ws);
    await db.from("provider_jobs").delete().eq("workspace_id", PW);
    await db.from("conversations").delete().eq("workspace_id", W);
    await db.from("build_items").delete().in("id", [B, B2].filter(Boolean));
    await db.from("listings").delete().eq("id", L);
    await db.from("events").delete().in("id", [E, E2, XE].filter(Boolean));
    await db.from("audit_events").delete().in("workspace_id", ws);
    await db.from("workspaces").delete().in("id", ws);
    await cleanup();
  });

  test("Q42 exit gate: a mission pauses for approval and for the provider's response, resumes later and finishes with a complete audit trail", async () => {
    const oc = (await signedIn(O.email)) as unknown as SupabaseClient, pc = (await signedIn(P.email)) as unknown as SupabaseClient;
    expect((await exec({ p_run: RO, p_actor: O.id, p_tool: "calendar.upcoming", p_args: {} })).ok).toBe(true);
    const ask = { to_type: "workspace", to: PW, body: "Could you hold 12 June for our gala?", event_id: E, item_id: B };
    expect((await exec({ p_run: RO, p_actor: O.id, p_tool: "message.party", p_args: ask })).error).toBe("approval_required");
    // The run engine writes the approval card with the exact arguments; the owner decides it as themselves.
    const ap = id(await db.from("agent_approvals").insert({ run_id: RO, workspace_id: W, title: "Send message", action: "message.party", tool_id: "message.party", risk: 3, payload: ask,
      status: "pending", requested_by: O.id, expires_at: new Date(Date.now() + 864e5).toISOString() }).select("id").single());
    await db.from("agent_runs").update({ status: "waiting_approval" }).eq("id", RO);
    expect(msg((await oc.rpc("decide_agent_approval", { p_approval: ap, p_approve: true, p_edited: null })).error)).toBe("");
    await db.from("agent_runs").update({ status: "running" }).eq("id", RO);
    const key = `q42-${tag}-msg`;
    const sent = await exec({ p_run: RO, p_actor: O.id, p_tool: "message.party", p_args: ask, p_approval: ap, p_idempotency: key });
    expect(sent.ok).toBe(true);
    const again = await exec({ p_run: RO, p_actor: O.id, p_tool: "message.party", p_args: ask, p_approval: ap, p_idempotency: key });
    expect(again.replayed).toBe(true); expect(again.call_id).toBe(sent.call_id);   // a retry never sends twice
    // Pause on the provider's answer (no tokens), then resume when it arrives.
    const w1 = (await db.rpc("agent_mission_wait", { p_run: RO, p_step: null, p_item: B, p_hours: 48 })).data as { waiting?: boolean };
    expect(w1.waiting).toBe(true);
    expect(await status(RO)).toBe("waiting_external");
    expect(msg((await pc.rpc("provider_respond", { p_item: B, p_response: "available", p_note: "Free that day" })).error)).toBe("");
    expect(await status(RO)).toBe("queued");
    const w2 = (await db.rpc("agent_mission_wait", { p_run: RO, p_step: null, p_item: B, p_hours: 48 })).data as { satisfied?: boolean; outcome?: string; detail?: { status: string } };
    expect(w2).toMatchObject({ satisfied: true, outcome: "responded", detail: { status: "available" } });
    await db.from("agent_runs").update({ status: "running" }).eq("id", RO);
    expect((await exec({ p_run: RO, p_actor: O.id, p_tool: "event.readiness", p_args: { event_id: E } })).ok).toBe(true);
    expect(msg((await db.from("agent_runs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", RO)).error)).toBe("");
    // Complete audit trail: governed calls (refused + succeeded), the human approval, the wait and the resume.
    const calls = ((await db.from("agent_tool_calls").select("tool_id,status,refusal,decision").eq("run_id", RO)).data ?? []) as { tool_id: string; status: string; refusal: string | null; decision: string }[];
    expect(calls.filter(c => c.status === "succeeded").map(c => c.tool_id).sort()).toEqual(["calendar.upcoming", "event.readiness", "message.party"]);
    expect(calls.find(c => c.status === "refused")?.refusal).toBe("approval_required");
    expect(calls.find(c => c.tool_id === "message.party" && c.status === "succeeded")?.decision).toBe("approved");
    const events = new Set(((await db.from("audit_events").select("event").eq("agent_run_id", RO)).data ?? []).map(a => a.event));
    for (const e of ["agent.tool_refused", "agent.approval_approved", "agent.tool_called", "agent.mission_waiting", "agent.mission_resumed"]) expect(events.has(e), e).toBe(true);
    // Owners see per-run cost.
    expect(msg((await oc.rpc("agent_run_cost", { p_run: RO })).error)).toBe("");
    const costs = (await oc.rpc("agent_workspace_run_costs", { p_workspace: W, p_limit: 10 })).data as { run_id: string; tool_calls: number; cost_gbp: number }[];
    expect(costs.find(c => c.run_id === RO)?.tool_calls).toBe(4);
    const bc = (await signedIn(OB.email)) as unknown as SupabaseClient;
    expect(msg((await bc.rpc("agent_workspace_run_costs", { p_workspace: W, p_limit: 10 })).error)).toMatch(/not_authorized/);
  });

  test("Q42 tools stay inside the human's permission and the run's workspace", async () => {
    expect((await exec({ p_run: RO, p_actor: O.id, p_tool: "compliance.overview", p_args: { event_id: XE } })).error).toBe("run_completed");
    await db.from("agent_runs").update({ status: "running" }).eq("id", RS);
    const RO2 = id(await db.from("agent_runs").insert({ workspace_id: W, user_id: O.id, surface: "organizer", mode: "do", goal: `Q42 ${tag} scope`, status: "running", plan: [] }).select("id").single());
    for (const t of ["compliance.overview", "hospitality.summary", "logistics.overview", "partners.overview", "event.conflicts"])
      expect((await exec({ p_run: RO2, p_actor: O.id, p_tool: t, p_args: { event_id: XE } })).error, t).toContain("not_found");
    expect((await exec({ p_run: RO2, p_actor: O.id, p_tool: "sales.client", p_args: { client_id: crypto.randomUUID() } })).error).toContain("not_found");
    expect((await exec({ p_run: RO2, p_actor: O.id, p_tool: "campaigns.report", p_args: { campaign_id: crypto.randomUUID() } })).error).toContain("not_found");
    expect((await exec({ p_run: RO2, p_actor: X.id, p_tool: "calendar.upcoming", p_args: {} })).error).toBe("not_a_member");
    // Campaign reads need promotion.manage: a member is refused by the human's own permission.
    expect((await exec({ p_run: RO2, p_actor: OB.id, p_tool: "campaigns.calendar", p_args: {} })).error).toContain("permission_denied");
    expect((await exec({ p_run: RO2, p_actor: O.id, p_tool: "opportunities.sla", p_args: {} })).error).toBe("tool_not_exposed");   // provider tool on an organizer run
    expect((await exec({ p_run: RO2, p_actor: O.id, p_tool: "mission.wait_for", p_args: { item_id: B } })).error).toContain("runtime_control_tool");
    for (const t of ["calendar.upcoming", "hospitality.summary", "logistics.overview", "compliance.overview", "map.validate", "seating.suggest"])
      expect((await exec({ p_run: RO2, p_actor: O.id, p_tool: t, p_args: t === "calendar.upcoming" ? {} : { event_id: E } })).ok, t).toBe(true);
  });

  test("Q43 exit gate: the agent never accepts a conflicting job or exceeds the configured pricing / booking authority", async () => {
    for (const t of ["opportunities.sla", "bookings.upcoming", "trust.summary", "money.release_readiness", "memory.recall"]) expect((await exec({ p_run: RP, p_actor: P.id, p_tool: t, p_args: {} })).ok, t).toBe(true);
    expect((await exec({ p_run: RP, p_actor: P.id, p_tool: "listing.readiness", p_args: { listing_id: L } })).ok).toBe(true);
    expect((await exec({ p_run: RP, p_actor: P.id, p_tool: "quote.draft", p_args: { item_id: B, items: QUOTE } })).ok).toBe(true);   // R1: draft only, nothing sent
    // Conflict: a confirmed job already occupies the listing on event 2's date — even as an explicit auto-tool, "available" is refused.
    await db.from("agent_policies").upsert({ workspace_id: PW, mode: "operational", auto_tools: ["opportunity.respond"] });
    const c = await exec({ p_run: RP, p_actor: P.id, p_tool: "opportunity.respond", p_args: { item_id: B2, response: "available" }, p_policy_auto: true });
    expect(c.ok).toBe(false); expect(c.error).toContain("hard_conflict");
    expect(((await db.from("build_items").select("status").eq("id", B2).single()).data as { status: string }).status).toBe("sent");
    // Authority £100: a manager's approval can't send a £500 quote; nor can autopilot; approvals only cover the exact arguments.
    await db.from("agent_policies").upsert({ workspace_id: PW, booking_authority_minor: 10000, mode: "policy_autopilot", autopilot_rules: [{ tool: "quote.send", max_amount_minor: 100000 }] });
    const args = { item_id: B, items: QUOTE };
    const ap = id(await db.from("agent_approvals").insert({ run_id: RP, workspace_id: PW, title: "Quote", action: "quote.send", tool_id: "quote.send", risk: 4, amount: 500, payload: args,
      status: "approved", requested_by: P.id, decided_by: PM.id, decided_at: new Date().toISOString() }).select("id").single());
    expect((await exec({ p_run: RP, p_actor: PM.id, p_tool: "quote.send", p_args: args, p_approval: ap })).error).toBe("exceeds_booking_authority");
    expect((await exec({ p_run: RP, p_actor: PM.id, p_tool: "quote.send", p_args: { item_id: B, items: [{ name: "Room hire", qty: 9, unit_price: 500 }] }, p_approval: ap })).error).toBe("approval_args_mismatch");
    expect((await exec({ p_run: RP, p_actor: P.id, p_tool: "quote.send", p_args: args, p_policy_auto: true })).error).toBe("exceeds_booking_authority");
    await db.from("agent_policies").upsert({ workspace_id: PW, booking_authority_minor: 0, autopilot_rules: [{ tool: "quote.send", max_amount_minor: 1000 }] });
    expect((await exec({ p_run: RP, p_actor: P.id, p_tool: "quote.send", p_args: args, p_policy_auto: true })).error).toBe("approval_required");   // rule's £10 limit enforced in the DB
    // Same-workspace binding for provider tools.
    expect((await exec({ p_run: RP, p_actor: P.id, p_tool: "crew.assign", p_args: { job_id: crypto.randomUUID(), crew_id: crypto.randomUUID() } })).error).toContain("not_found");
    expect((await exec({ p_run: RP, p_actor: P.id, p_tool: "listing.readiness", p_args: { listing_id: crypto.randomUUID() } })).error).toContain("not_found");
  });

  test("plan entitlements: Starter keeps R0–R2; R3/R4 need Pro; skills show why they're locked", async () => {
    expect((await exec({ p_run: RS, p_actor: S.id, p_tool: "message.party", p_args: { to_type: "workspace", to: PW, body: "Hello there" }, p_policy_auto: true })).error).toBe("plan_not_entitled");
    expect((await exec({ p_run: RS, p_actor: S.id, p_tool: "events.list", p_args: {} })).ok).toBe(true);
    expect((await exec({ p_run: RS, p_actor: S.id, p_tool: "memory.remember", p_args: { key: "style", value: "Keep it short" } })).ok).toBe(true);
    const { data: ent } = await db.from("plan_entitlements").select("kind,plan,value").eq("capability", "agent.actions");
    for (const r of (ent ?? []) as { kind: string; plan: string; value: boolean }[]) expect(r.value, `${r.kind}/${r.plan}`).toBe(r.plan !== "starter");
    const sc = (await signedIn(S.email)) as unknown as SupabaseClient, oc = (await signedIn(O.email)) as unknown as SupabaseClient;
    const starter = (await sc.rpc("agent_available_skills", { p_workspace: SW })).data as { id: string; available: boolean; locked_reason: string | null }[];
    expect(starter.find(s => s.id === "org.source_venue")).toMatchObject({ available: false, locked_reason: "plan" });
    expect(starter.find(s => s.id === "org.readiness_review")).toMatchObject({ available: true });
    expect(((await oc.rpc("agent_available_skills", { p_workspace: W })).data as { available: boolean }[]).every(s => s.available)).toBe(true);
    expect(msg((await sc.rpc("agent_available_skills", { p_workspace: W })).error)).toMatch(/not_authorized/);
  });

  test("memory: data-minimised, user-visible, resettable; members can't wipe workspace memory", async () => {
    const oc = (await signedIn(O.email)) as unknown as SupabaseClient, bc = (await signedIn(OB.email)) as unknown as SupabaseClient, xc = (await signedIn(X.email)) as unknown as SupabaseClient;
    expect(msg((await oc.rpc("agent_memory_remember", { p_workspace: W, p_key: "venue.area", p_value: "Prefer Leeds city centre", p_kind: "preference", p_scope: "workspace", p_run: null })).error)).toBe("");
    expect(msg((await oc.rpc("agent_memory_remember", { p_workspace: W, p_key: "contact", p_value: "jo@example.com", p_kind: "fact", p_scope: "workspace", p_run: null })).error)).toBe("memory_sensitive_data");
    expect(msg((await bc.rpc("agent_memory_remember", { p_workspace: W, p_key: "tone", p_value: "Casual", p_kind: "preference", p_scope: "workspace", p_run: null })).error)).toMatch(/not_authorized/);
    expect(msg((await bc.rpc("agent_memory_remember", { p_workspace: W, p_key: "tone", p_value: "Casual", p_kind: "preference", p_scope: "user", p_run: null })).error)).toBe("");
    const mine = (await bc.rpc("agent_memory_list", { p_workspace: W })).data as { key: string; scope: string }[];
    expect(mine.map(m => `${m.scope}:${m.key}`).sort()).toEqual(["user:tone", "workspace:venue.area"]);
    expect(((await oc.rpc("agent_memory_list", { p_workspace: W })).data as unknown[]).length).toBe(1);   // the owner never sees the member's own memory
    expect(msg((await xc.rpc("agent_memory_list", { p_workspace: W })).error)).toMatch(/not_authorized/);
    expect((await xc.from("agent_memories").select("id").eq("workspace_id", W)).data ?? []).toEqual([]);
    expect(msg((await bc.rpc("agent_memory_forget", { p_workspace: W, p_memory: null, p_scope: "workspace" })).error)).toMatch(/not_authorized/);
    expect((await bc.rpc("agent_memory_forget", { p_workspace: W, p_memory: null, p_scope: "user" })).data).toBe(1);
    expect((await oc.rpc("agent_memory_forget", { p_workspace: W, p_memory: null, p_scope: "all" })).data).toBe(1);
    expect((await db.from("agent_memories").select("id").eq("workspace_id", W)).data ?? []).toEqual([]);
    const ex = (await db.from("agent_memories").insert({ workspace_id: W, key: "old.fact", value: "Expired", expires_at: new Date(Date.now() - 10 * 60_000).toISOString() }).select("id").single());
    expect(ex.error).toBeNull();
    await db.rpc("job_agent_memory_retention", { p_job: null });
    expect((await db.from("agent_memories").select("id").eq("workspace_id", W)).data ?? []).toEqual([]);
    const reset = (await db.from("audit_events").select("event").eq("workspace_id", W).eq("event", "agent.memory_reset")).data ?? [];
    expect(reset.length).toBeGreaterThanOrEqual(2);
  });

  test("registry = seed = live for agent_skills (and agent_tools incl. the Q42/Q43 tools)", async () => {
    const generated = execFileSync(process.execPath, ["scripts/gen-agent-tools.mjs"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    expect(fs.readFileSync("supabase/migrations/209912310002_agent_tools_seed.sql", "utf8").trim()).toBe(generated.trim());
    const { data } = await db.from("agent_skills").select("id,version,surface,level,tools,mission,tier,max_risk,plan_capability,status").eq("status", "active");
    const live = new Map(((data ?? []) as { id: string; version: number; surface: string; level: string; tools: string[]; mission: string[]; tier: string; max_risk: number; plan_capability: string | null }[]).map(r => [r.id, r]));
    expect([...live.keys()].sort()).toEqual(SKILLS.map(s => s.id).sort());
    for (const s of SKILLS) expect(live.get(s.id)).toMatchObject({ version: s.version, surface: s.surface, level: s.level, tools: s.tools, mission: s.mission, tier: s.tier, max_risk: s.maxRisk, plan_capability: s.planCapability });
    const { data: tools } = await db.from("agent_tools").select("id");
    expect(((tools ?? []) as { id: string }[]).map(t => t.id).sort()).toEqual(TOOLS.map(t => t.id).sort());
    expect(msg((await db.from("agent_skills").insert({ id: "org.bad_skill", title: "Bad", surface: "organizer", level: "basic", category: "organizer", tools: ["opportunities.list"], mission: [] })).error)).toContain("skill_binding_invalid");
    expect((await db.from("agent_skills").insert({ id: "cus.help", title: "Customer", surface: "customer", level: "basic", category: "organizer", tools: [], mission: [] })).error).not.toBeNull();
  });
});
