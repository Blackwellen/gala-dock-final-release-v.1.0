import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// §95 global search: one permission-aware system; no leakage across tenants; geospatial filter for listings.
const db = admin as unknown as SupabaseClient;
type Hit = { kind: string; id: string; title: string; link: string };

test.describe("global search", () => {
  let a: { id: string; email: string }, b: { id: string; email: string }, wsA: string, wsB: string, evA: string, evB: string, provWs: string;
  const tag = `Zq${Date.now().toString(36)}`;
  test.beforeAll(async () => {
    [a, b] = await Promise.all([createUser("s-a"), createUser("s-b")]);
    [wsA, wsB] = await Promise.all([seedWorkspace(a.id, "organizer", "Search A"), seedWorkspace(b.id, "organizer", "Search B")]);
    provWs = await seedWorkspace(b.id, "provider", "Search Prov");
    evA = ((await db.from("events").insert({ owner_id: a.id, workspace_id: wsA, name: `${tag} Gala A` }).select("id").single()).data as { id: string }).id;
    evB = ((await db.from("events").insert({ owner_id: b.id, workspace_id: wsB, name: `${tag} Secret B` }).select("id").single()).data as { id: string }).id;
    await db.from("leads").insert({ workspace_id: wsB, name: `${tag} private lead`, client_name: `${tag} Client`, stage: "new" });
    await db.from("listings").insert([{ workspace_id: provWs, name: `${tag} London Hall`, kind: "venue", category: "venue", published: true, lat: 51.5074, lng: -0.1278 },
      { workspace_id: provWs, name: `${tag} Leeds Hall`, kind: "venue", category: "venue", published: true, lat: 53.8008, lng: -1.5491 }]);
  });
  test.afterAll(async () => {
    await db.from("listings").update({ published: false }).eq("workspace_id", provWs);
    await db.from("events").delete().in("id", [evA, evB]);
    await db.from("workspaces").delete().in("id", [wsA, wsB, provWs]);
    await cleanup();
  });

  test("results are scoped to what the caller can access", async () => {
    const ca = await signedIn(a.email) as unknown as SupabaseClient;
    const { data } = await ca.rpc("global_search", { p_q: tag, p_workspace: wsA, p_limit: 40 });
    const hits = data as Hit[];
    expect(hits.some(h => h.title.includes("Gala A"))).toBe(true);
    expect(JSON.stringify(hits)).not.toContain("Secret B");
    expect(JSON.stringify(hits)).not.toContain("private lead");
    // Can't search inside someone else's workspace.
    expect((await ca.rpc("global_search", { p_q: tag, p_workspace: wsB, p_limit: 40 })).error?.message).toMatch(/not_authorized/);
  });

  test("marketplace listings are geospatially filtered", async () => {
    const ca = await signedIn(a.email) as unknown as SupabaseClient;
    const { data } = await ca.rpc("global_search", { p_q: tag, p_workspace: null, p_limit: 40, p_lat: 51.5, p_lng: -0.12, p_radius_km: 50 });
    const venues = (data as Hit[]).filter(h => h.kind === "venue").map(h => h.title);
    expect(venues.join()).toContain("London Hall");
    expect(venues.join()).not.toContain("Leeds Hall");
  });
});
