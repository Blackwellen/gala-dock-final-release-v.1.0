import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE } from "../phase1/helpers";
import { decide, type Window } from "../../src/lib/maintenance";

// Release spec §9–10: maintenance levels. Decision logic is tested exhaustively offline (pure decide()).
// SAFE ON THE SHARED DATABASE (Q31 S4): the live DB check never creates a window that any real user, the public banner feed or the
// proxy can see. It uses the test-only audience 'qa' (migration 202610292002): qa windows are excluded from maintenance_state(), from
// the one-argument maintenance_level()/assert_writable() and from every real user's audiences (maintenance_audiences never returns
// 'qa'), and start_maintenance refuses them. The test asserts that isolation BEFORE relying on it and ends the window in finally.
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

test.describe("maintenance audiences (decide)", () => {
  test("an audience-scoped window only affects its own surface; 'all' affects everyone", () => {
    const org = w(3, [], { audience: "organizers" }), cust = w(3, [], { audience: "customers" });
    expect(decide([org], "/account/events/e1", "POST").action).toBe("allow");
    expect(decide([org], "/organizer/events", "POST").action).toBe("deny");
    expect(decide([cust], "/organizer/events", "POST").action).toBe("allow");
    expect(decide([cust], "/account/events/e1", "POST").action).toBe("deny");
    expect(decide([w(3)], "/account/events/e1", "POST").action).toBe("deny");
    expect(decide([w(2, ["resale"], { audience: "admins" })], "/account/tickets/resale", "POST").action).toBe("allow");
  });
});

test.describe("maintenance in the database (test-only 'qa' audience; no real user is ever affected)", () => {
  const db = admin as unknown as SupabaseClient;
  const ref = `E2E-QA-${Date.now().toString(36)}`;
  test.afterAll(async () => { await db.from("maintenance_windows").update({ ended_at: new Date().toISOString(), end_note: "e2e qa" }).eq("reference", ref).is("ended_at", null); });

  test("qa windows are evaluated by the audience-aware SQL and are invisible everywhere else; non-admins cannot start windows", async ({ request }) => {
    const pub = anon() as unknown as SupabaseClient;
    const real = ["customers", "organizers", "providers", "admins"];
    const before = { resale: (await pub.rpc("maintenance_level", { p_module: "resale" })).data, real: (await pub.rpc("maintenance_level", { p_module: "resale", p_audiences: real })).data };
    // 1. A window that has not started yet proves the qa audience is accepted without being live for anyone.
    const { data: pending, error: pe } = await db.from("maintenance_windows").insert({ level: 2, modules: ["resale"], title: "E2E qa pending", audience: "qa",
      starts_at: new Date(Date.now() + 365 * 864e5).toISOString(), ends_at: new Date(Date.now() + 366 * 864e5).toISOString(), reference: ref }).select("id").single();
    expect(pe).toBeNull();
    expect(((await pub.rpc("maintenance_state")).data as { id: string }[]).some(x => x.id === (pending as { id: string }).id)).toBe(false);
    // 2. A live qa window (60 s cap, ended in finally). Isolation is asserted immediately: public feed, legacy level, real audiences.
    const { data } = await db.from("maintenance_windows").insert({ level: 2, modules: ["resale"], title: "E2E qa resale check", audience: "qa",
      ends_at: new Date(Date.now() + 60_000).toISOString(), reference: ref }).select("id").single();
    const id = (data as { id: string }).id;
    try {
      expect(((await pub.rpc("maintenance_state")).data as { id: string }[]).some(x => x.id === id)).toBe(false);
      expect((await pub.rpc("maintenance_level", { p_module: "resale" })).data).toBe(before.resale);
      expect((await pub.rpc("maintenance_level", { p_module: "resale", p_audiences: real })).data).toBe(before.real);
      // The audience-aware evaluation sees it for the qa audience only, and only on its module.
      expect((await pub.rpc("maintenance_level", { p_module: "resale", p_audiences: ["qa"] })).data).toBe(2);
      expect((await pub.rpc("maintenance_level", { p_module: "checkin", p_audiences: ["qa"] })).data).toBe(0);
      const feed = await (await request.get(`${BASE}/api/maintenance`)).json();
      expect(JSON.stringify(feed)).not.toContain(id);
      expect(JSON.stringify(feed)).not.toContain("bypass_roles");            // the public feed exposes banner fields only
    } finally {
      await db.from("maintenance_windows").update({ ended_at: new Date().toISOString(), end_note: "e2e qa" }).eq("reference", ref).is("ended_at", null);
    }
    expect((await pub.rpc("maintenance_level", { p_module: "resale", p_audiences: ["qa"] })).data).toBe(0);
    expect((await pub.rpc("start_maintenance", { p: { level: 1, title: "nope", reason: "anonymous attempt" } })).error).not.toBeNull();
  });
});
