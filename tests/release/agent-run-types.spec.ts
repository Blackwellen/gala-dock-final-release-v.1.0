import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { watchHolds } from "../../src/lib/agent/watch";

// Release spec §12: Watch and Event-driven routine run types (Ask / task / mission / routine / approval runs are covered in agent.spec).
const db = admin as unknown as SupabaseClient;
const cron = { Authorization: `Bearer ${process.env.CRON_SECRET}` };

test.describe("agent run types", () => {
  let owner: { id: string; email: string }, ws: string;
  test.beforeAll(async () => {
    owner = await createUser("rt-o");
    ws = await seedWorkspace(owner.id, "organizer", "Run Types Org");
  });
  test.afterAll(async () => {
    await db.from("agent_watches").delete().eq("workspace_id", ws);
    await db.from("agent_routines").delete().eq("workspace_id", ws);
    await db.from("agent_runs").delete().eq("workspace_id", ws);
    await db.from("events").delete().eq("workspace_id", ws);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("watch conditions", () => {
    expect(watchHolds({ path: "status", op: "eq", value: "accepted" }, "accepted", null)).toBe(true);
    expect(watchHolds({ path: "n", op: "gte", value: 100 }, 99, null)).toBe(false);
    expect(watchHolds({ path: "x", op: "changed" }, "b", "a")).toBe(true);
    expect(watchHolds({ path: "x", op: "changed" }, "a", null)).toBe(false);   // first observation is a baseline, not a change
    expect(watchHolds({ path: "", op: "exists" }, [], null)).toBe(false);
  });

  test("a watch only uses read-only tools and fires without model calls", async ({ request }) => {
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    const exp = new Date(Date.now() + 864e5).toISOString();
    expect((await c.rpc("create_agent_watch", { p_workspace: ws, p_title: "Bad", p_tool: "task.create", p_input: {}, p_condition: { path: "", op: "exists" }, p_every: 5, p_expires: exp })).error?.message).toMatch(/read_only/);
    const { data: id, error } = await c.rpc("create_agent_watch", { p_workspace: ws, p_title: "First event appears", p_tool: "events.list", p_input: {}, p_condition: { path: "0.name", op: "exists" }, p_every: 1, p_expires: exp });
    expect(error).toBeNull();
    // Nothing yet → stays active with backoff.
    await request.post(`${BASE}/api/agent/worker`, { headers: cron });
    let w = (await db.from("agent_watches").select("status,checks,next_check_at").eq("id", id).single()).data!;
    expect(w.status).toBe("active"); expect(w.checks).toBe(1);
    // An event appears → fires on the next due check.
    await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: "Watched Gala", starts_at: new Date(Date.now() + 5 * 864e5).toISOString() });
    await db.from("agent_watches").update({ next_check_at: new Date().toISOString() }).eq("id", id);
    await request.post(`${BASE}/api/agent/worker`, { headers: cron });
    w = (await db.from("agent_watches").select("status,checks,next_check_at").eq("id", id).single()).data!;
    expect(w.status).toBe("triggered");
    expect((await db.from("notifications").select("title").eq("user_id", owner.id).like("title", "Watch triggered%")).data!.length).toBe(1);
    expect((await db.from("ai_usage_events").select("id").eq("workspace_id", ws)).data!.length).toBe(0);   // no AI spend
  });

  test("event-driven routines wake on matching domain events, never on the agent's own actions", async () => {
    const far = "2999-01-01T00:00:00Z";
    const { data: r } = await db.from("agent_routines").insert({ workspace_id: ws, owner_id: owner.id, title: "On cancellation", detail: "Find a replacement", schedule: "on booking.cancelled",
      trigger: { type: "event", event: "booking.cancelled" }, actions: [], enabled: true, next_run_at: far }).select("id").single();
    await db.from("audit_events").insert({ actor_id: owner.id, actor_type: "agent", workspace_id: ws, event: "booking.cancelled", metadata: {} });
    expect(new Date((await db.from("agent_routines").select("next_run_at").eq("id", r!.id).single()).data!.next_run_at).getFullYear()).toBe(2999);
    await db.from("audit_events").insert({ actor_id: owner.id, actor_type: "user", workspace_id: ws, event: "booking.cancelled", metadata: { booking: "b1", ip: "1.1.1.1" } });
    const after = (await db.from("agent_routines").select("next_run_at,last_event").eq("id", r!.id).single()).data!;
    expect(new Date(after.next_run_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(JSON.stringify(after.last_event)).toContain("booking.cancelled");
    expect(JSON.stringify(after.last_event)).not.toContain("1.1.1.1");
  });
});
