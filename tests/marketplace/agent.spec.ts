import fs from "node:fs";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { decide, DEFAULT_POLICY, TOOL, type Policy } from "../../src/lib/agent/registry";

// Gala Agent runtime (§4–12, §123, §125): policy decisions, tools execute as the human (no privilege escalation), durable
// step execution through the real worker endpoint with checkpoints, approvals, and resume after a decision.
const db = admin as unknown as SupabaseClient;
const secret = fs.readFileSync(".env", "utf8").match(/^CRON_SECRET=(.+)$/m)?.[1]?.trim() ?? "";
const tick = async () => (await fetch(`${BASE}/api/agent/worker`, { method: "POST", headers: { authorization: `Bearer ${secret}` } })).json();

test.describe.configure({ mode: "serial" });
test.describe("gala agent runtime", () => {
  let owner: { id: string; email: string }, member: { id: string; email: string };
  let ownC: SupabaseClient, ws: string, event: string, tier: string, run: string;

  test.beforeAll(async () => {
    [owner, member] = await Promise.all([createUser("ag-own"), createUser("ag-mem")]);
    ws = await seedWorkspace(owner.id, "organizer", "Agent Org");
    await db.from("workspace_members").insert({ workspace_id: ws, user_id: member.id, role: "member" });
    event = ((await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, management: "professional", name: "Agent event", starts_at: new Date(Date.now() + 20 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
    tier = ((await db.from("ticket_tiers").insert({ event_id: event, name: "GA", price: 15, quantity: 100, status: "draft", order_limit: 10 }).select("id").single()).data as { id: string }).id;
    ownC = await signedIn(owner.email) as unknown as SupabaseClient;
  });
  test.afterAll(async () => {
    if (run) await db.from("agent_runs").delete().eq("id", run);
    await db.from("events").delete().eq("id", event);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("policy modes map risk to auto / approval / suggest / blocked", () => {
    const p = (x: Partial<Policy>): Policy => ({ ...DEFAULT_POLICY, quiet_hours: null, ...x });
    expect(decide(TOOL.get("events.list")!, {}, p({ mode: "suggest" }))).toBe("auto");
    expect(decide(TOOL.get("task.create")!, {}, p({ mode: "suggest" }))).toBe("suggest");
    expect(decide(TOOL.get("draft.note")!, {}, p({ mode: "draft" }))).toBe("auto");
    expect(decide(TOOL.get("task.create")!, {}, p({}))).toBe("auto");
    expect(decide(TOOL.get("message.party")!, {}, p({}))).toBe("approval");
    expect(decide(TOOL.get("message.party")!, {}, p({ auto_tools: ["message.party"] }))).toBe("auto");
    expect(decide(TOOL.get("tickets.publish_tier")!, {}, p({}))).toBe("approval");
    const quote = { items: [{ name: "Hire", qty: 1, unit_price: 400 }] };
    expect(decide(TOOL.get("quote.send")!, quote, p({ mode: "policy_autopilot", autopilot_rules: [{ tool: "quote.send", max_amount_minor: 50000 }] }))).toBe("auto");
    expect(decide(TOOL.get("quote.send")!, { items: [{ name: "Hire", qty: 1, unit_price: 900 }] }, p({ mode: "policy_autopilot", autopilot_rules: [{ tool: "quote.send", max_amount_minor: 50000 }] }))).toBe("approval");
    expect(decide(TOOL.get("events.list")!, {}, p({ allowed_tools: ["task.create"] }))).toBe("blocked");
    expect(decide(TOOL.get("message.party")!, {}, p({}), 0.3)).toBe("approval"); // low confidence never auto-executes R3
  });

  test("tools execute as the human: a member can't use the agent to do what their role can't", async () => {
    const r = await db.rpc("agent_invoke", { p_actor: member.id, p_workspace: ws, p_tool: "tickets.publish_tier", p_args: { tier_id: tier } });
    expect(r.error?.message).toMatch(/permission_denied:tickets.manage/);
    const outsider = await createUser("ag-out");
    expect((await db.rpc("agent_invoke", { p_actor: outsider.id, p_workspace: ws, p_tool: "events.list", p_args: {} })).error?.message).toMatch(/not_authorized/);
    const ok = await db.rpc("agent_invoke", { p_actor: member.id, p_workspace: ws, p_tool: "events.list", p_args: {} });
    expect((ok.data as { name: string }[]).map(e => e.name)).toContain("Agent event");
    // Users cannot call agent_invoke themselves.
    expect((await ownC.rpc("agent_invoke", { p_actor: owner.id, p_workspace: ws, p_tool: "events.list", p_args: {} })).error).not.toBeNull();
  });

  test("durable run: worker executes R0 + R2 with checkpoints, stops at the R4 approval, resumes after approval", async () => {
    const { data } = await db.from("agent_runs").insert({ workspace_id: ws, user_id: owner.id, surface: "organizer", mode: "do", goal: "Prepare launch", status: "running", plan: [], idempotency_key: `test:${Date.now()}` }).select("id").single();
    run = (data as { id: string }).id;
    const { error: se } = await db.from("agent_run_steps").insert([
      { run_id: run, seq: 1, tool_id: "events.list", input: {}, reason: "", idempotency_key: `${run}:1` },
      { run_id: run, seq: 2, tool_id: "task.create", input: { event_id: event, title: "Confirm headline act", priority: "high" }, reason: "", idempotency_key: `${run}:2` },
      { run_id: run, seq: 3, tool_id: "tickets.publish_tier", input: { tier_id: tier }, reason: "Launch sales", idempotency_key: `${run}:3` },
    ]);
    expect(se).toBeNull();
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    await tick();
    const steps = (await db.from("agent_run_steps").select("seq,status").eq("run_id", run).order("seq")).data as { seq: number; status: string }[];
    expect(steps.map(s => s.status)).toEqual(["succeeded", "succeeded", "waiting_approval"]);
    expect(((await db.from("agent_runs").select("status").eq("id", run).single()).data as { status: string }).status).toBe("waiting_approval");
    const { count: tasks } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("event_id", event).eq("title", "Confirm headline act");
    expect(tasks).toBe(1);
    // A second tick never repeats completed side effects.
    await db.from("agent_runs").update({ lease_until: null }).eq("id", run);
    await tick();
    expect((await db.from("tasks").select("id", { count: "exact", head: true }).eq("event_id", event).eq("title", "Confirm headline act")).count).toBe(1);
    expect(((await db.from("ticket_tiers").select("status").eq("id", tier).single()).data as { status: string }).status).toBe("draft");
    // Human approves (as the owner); the worker applies it as the approver and finishes the run.
    const { data: ap } = await db.from("agent_approvals").select("id,risk,amount").eq("run_id", run).single();
    expect((ap as { risk: number }).risk).toBe(4);
    expect((await ownC.rpc("decide_agent_approval", { p_approval: (ap as { id: string }).id, p_approve: true, p_edited: null })).error).toBeNull();
    await tick(); await tick();
    expect(((await db.from("ticket_tiers").select("status").eq("id", tier).single()).data as { status: string }).status).toBe("on_sale");
    const r = (await db.from("agent_runs").select("status").eq("id", run).single()).data as { status: string };
    expect(["completed", "partially_completed"]).toContain(r.status);
    const { count: audits } = await db.from("audit_events").select("id", { count: "exact", head: true }).eq("agent_run_id", run);
    expect(audits).toBeGreaterThanOrEqual(3);
  });
});
