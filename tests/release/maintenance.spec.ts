import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE } from "../phase1/helpers";
import { decide, type Window } from "../../src/lib/maintenance";

// Release spec §9–10: maintenance levels. Decision logic is tested exhaustively offline; the live DB check uses a short,
// admins-only window on the 'resale' module so it cannot affect real users.
const w = (level: number, modules: string[] = [], extra: Partial<Window> = {}): Window => ({ id: `w${level}${modules.join()}`, level, modules, title: `M${level}`, message: "", status_url: null, expected_restore: null,
  audience: "all", dismissible: true, severity: "info", bypass_roles: [], reference: "", starts_at: new Date().toISOString(), ends_at: null, ...extra });

test.describe("maintenance decisions", () => {
  test("M0/M1 never block", () => {
    expect(decide([], "/organizer", "POST").action).toBe("allow");
    expect(decide([w(1)], "/organizer/events", "POST").action).toBe("allow");
  });
  test("M2 takes the named module offline only", () => {
    const ws = [w(2, ["media"])];
    expect(decide(ws, "/studio/abc", "GET").action).toBe("page");
    expect(decide(ws, "/organizer/media", "POST").action).toBe("deny");
    expect(decide(ws, "/organizer/events", "POST").action).toBe("allow");
  });
  test("M3 makes a module read-only; platform M3 freezes writes but not check-in", () => {
    expect(decide([w(3, ["marketplace"])], "/organizer/marketplace", "GET").action).toBe("allow");
    expect(decide([w(3)], "/organizer/events", "POST").action).toBe("deny");
    expect(decide([w(3)], "/organizer/events/e1/scan", "POST").action).toBe("allow");
  });
  test("M4 shows the maintenance page but keeps tickets, check-in and admin up", () => {
    const ws = [w(4)];
    expect(decide(ws, "/", "GET").action).toBe("page");
    expect(decide(ws, "/organizer", "GET").action).toBe("page");
    expect(decide(ws, "/account/tickets/t1", "GET").action).toBe("allow");
    expect(decide(ws, "/organizer/events/e1/scan", "POST").action).toBe("allow");
    expect(decide(ws, "/admin/maintenance", "POST").action).toBe("allow");
    expect(decide(ws, "/api/stripe/webhook", "POST").action).toBe("allow");
  });
  test("M5 lockdown stops sign-in, checkout, agent and API but not event-day check-in", () => {
    const ws = [w(5)];
    expect(decide(ws, "/login", "GET").action).not.toBe("allow");
    expect(decide(ws, "/api/checkout/session", "POST").action).toBe("deny");
    expect(decide(ws, "/api/agent/worker", "POST").action).toBe("deny");
    expect(decide(ws, "/organizer/events/e1/scan", "POST").action).toBe("allow");
    expect(decide(ws, "/admin", "GET").action).toBe("allow");
    // Check-in only stops when explicitly named.
    expect(decide([w(5, ["checkin"])], "/organizer/events/e1/scan", "POST").action).toBe("deny");
  });
});

test.describe("maintenance in the database", () => {
  const db = admin as unknown as SupabaseClient;
  let id = "";
  test.afterAll(async () => { if (id) await db.from("maintenance_windows").update({ ended_at: new Date().toISOString(), end_note: "e2e" }).eq("id", id); });

  test("state is public, levels are scoped, non-admins cannot start windows", async ({ request }) => {
    const { data } = await db.from("maintenance_windows").insert({ level: 2, modules: ["resale"], title: "E2E resale check", audience: "admins", ends_at: new Date(Date.now() + 120_000).toISOString(), reference: "E2E" }).select("id").single();
    id = (data as { id: string }).id;
    const pub = anon() as unknown as SupabaseClient;
    const { data: state } = await pub.rpc("maintenance_state");
    expect((state as { id: string }[]).some(x => x.id === id)).toBe(true);
    expect((await pub.rpc("maintenance_level", { p_module: "resale" })).data).toBe(2);
    expect((await pub.rpc("maintenance_level", { p_module: "checkin" })).data).toBe(0);
    expect((await pub.rpc("start_maintenance", { p: { level: 1, title: "nope" } })).error).not.toBeNull();
    // The public feed exposes banner fields only.
    const feed = await (await request.get(`${BASE}/api/maintenance`)).json();
    expect(JSON.stringify(feed)).not.toContain("bypass_roles");
  });
});
