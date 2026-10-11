import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, signedIn } from "../phase1/helpers";

// Release spec §87: demo workspaces are separate, clearly marked, private, resettable and deletable; real workspaces can't be deleted this way.
const db = admin as unknown as SupabaseClient;

test.describe("demo workspaces", () => {
  test.afterAll(async () => { await cleanup(); });

  test("each persona seeds a marked, private demo that can be reset and deleted", async () => {
    const u = await createUser("demo");
    const c = await signedIn(u.email) as unknown as SupabaseClient;
    for (const persona of ["organizer", "venue", "supplier"]) {
      const { data: ws, error } = await c.rpc("create_demo_workspace", { p_persona: persona });
      expect(error, persona).toBeNull();
      const { data: w } = await db.from("workspaces").select("name,settings").eq("id", ws).single();
      expect(w!.name).toMatch(/^Demo · /); expect((w!.settings as { demo: boolean }).demo).toBe(true);
      const { data: evs } = await db.from("events").select("visibility,tags").eq("workspace_id", ws);
      expect(evs!.length).toBeGreaterThan(0); expect(evs!.every(e => e.visibility === "private" && (e.tags as string[]).includes("DEMO"))).toBe(true);
      if (persona !== "organizer") {
        const { data: l } = await db.from("listings").select("published").eq("workspace_id", ws);
        expect(l!.every(x => !x.published)).toBe(true);
        // Not visible publicly.
        expect((await (anon() as unknown as SupabaseClient).from("listings").select("id").eq("workspace_id", ws)).data ?? []).toEqual([]);
      }
    }
    const { data: mine } = await db.from("workspaces").select("id,settings").eq("owner_id", u.id);
    const org = mine!.find(w => (w.settings as { demo_persona: string }).demo_persona === "organizer")!;
    expect((await db.from("ticket_tiers").select("id").in("event_id", ((await db.from("events").select("id").eq("workspace_id", org.id)).data ?? []).map(e => e.id))).data!.length).toBeGreaterThan(0);
    // Reset replaces the workspace; delete removes it; a 4th demo is refused.
    expect((await c.rpc("create_demo_workspace", { p_persona: "organizer" })).error?.message).toMatch(/limit_reached/);
    const { data: fresh, error: re } = await c.rpc("reset_demo_workspace", { p_workspace: org.id });
    expect(re).toBeNull(); expect(fresh).not.toBe(org.id);
    expect((await db.from("workspaces").select("id").eq("id", org.id)).data).toEqual([]);
    expect((await c.rpc("delete_demo_workspace", { p_workspace: fresh })).error).toBeNull();
    // A real workspace can't be deleted through the demo path.
    const { data: real } = await db.from("workspaces").insert({ owner_id: u.id, name: "Real Co", kind: "organizer", settings: {} }).select("id").single();
    expect((await c.rpc("delete_demo_workspace", { p_workspace: real!.id })).error?.message).toMatch(/not_a_demo_workspace/);
    for (const w of (await db.from("workspaces").select("id,settings").eq("owner_id", u.id)).data ?? []) { if ((w.settings as { demo?: boolean }).demo) await c.rpc("delete_demo_workspace", { p_workspace: w.id }); }
    await db.from("workspaces").delete().eq("id", real!.id);
  });
});
