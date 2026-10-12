import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Team conflict engine v2: unavailability entered as a schedule row conflicts with overlapping work, drafts are flagged as
// unconfirmed, and non-work rows never count as work (no false double-booking or unfilled roles).
const db = admin as unknown as SupabaseClient;
const at = (h: number) => new Date(Date.now() + 5 * 864e5 + h * 36e5).toISOString();

test.describe("team conflicts v2", () => {
  let owner: { id: string; email: string }, ws: string, ev: string, crew: string;
  test.beforeAll(async () => {
    owner = await createUser("tc2");
    ws = await seedWorkspace(owner.id, "organizer", "Conflicts Org");
    ev = ((await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: "Clash Night", status: "draft", starts_at: at(0) }).select("id").single()).data as { id: string }).id;
    crew = ((await db.from("crew_members").insert({ workspace_id: ws, name: "Robin Crew", role: "Runner", member_type: "crew", skills: [] }).select("id").single()).data as { id: string }).id;
    expect((await db.from("shifts").insert([
      { workspace_id: ws, event_id: ev, crew_id: crew, role: "Runner", title: "Doors", starts_at: at(0), ends_at: at(4), status: "confirmed", location: "Hall" },
      { workspace_id: ws, event_id: null, crew_id: crew, role: "Unavailable", title: "Unavailable", starts_at: at(2), ends_at: at(10), status: "unavailable", location: "" },
      { workspace_id: ws, event_id: ev, crew_id: crew, role: "Runner", title: "Breakdown", starts_at: at(12), ends_at: at(14), status: "draft", location: "Hall" },
    ])).error).toBeNull();
  });
  test.afterAll(async () => { await db.from("shifts").delete().eq("workspace_id", ws); await db.from("crew_members").delete().eq("workspace_id", ws); await db.from("events").delete().eq("id", ev); await cleanup(); });

  test("unavailable rows conflict with work; drafts are unconfirmed; non-work rows aren't work", async () => {
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    const { data, error } = await c.rpc("team_conflicts", { p_workspace: ws });
    expect(error).toBeNull();
    const rows = data as { kind: string; message: string }[];
    expect(rows.find(r => r.kind === "unavailable")?.message).toMatch(/Robin Crew is marked unavailable during Doors/);
    expect(rows.find(r => r.kind === "unconfirmed")?.message).toMatch(/Breakdown isn’t confirmed yet/);
    expect(rows.some(r => r.kind === "overlap")).toBe(false);
    expect(rows.some(r => r.kind === "unfilled")).toBe(false);
  });
});
