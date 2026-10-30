import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Phase 6 engines (§85–88): explainable readiness domains, feasibility with fix paths, team conflicts, provider check-ins.
const db = admin as unknown as SupabaseClient;
type Domain = { key: string; state: string; reason: string; fix: string };
type Feas = { key: string; severity: string; message: string; fix: string };

test.describe.configure({ mode: "serial" });
test.describe("readiness, feasibility, team conflicts, live check-ins", () => {
  let owner: { id: string; email: string }, prov: { id: string; email: string }, out: { id: string; email: string };
  let ownC: SupabaseClient, provC: SupabaseClient, outC: SupabaseClient, ws: string, provWs: string, event: string, venueItem: string, djItem: string;
  const start = new Date(Date.now() + 10 * 864e5); start.setUTCHours(18, 0, 0, 0);
  const iso = (h: number) => new Date(start.getTime() + h * 36e5).toISOString();

  test.beforeAll(async () => {
    [owner, prov, out] = await Promise.all([createUser("ops-own"), createUser("ops-prov"), createUser("ops-out")]);
    ws = await seedWorkspace(owner.id, "organizer", "Ops Org");
    provWs = await seedWorkspace(prov.id, "provider", "Ops Venue Co");
    const venue = ((await db.from("listings").insert({ workspace_id: provWs, name: "Ops Hall", kind: "venue", category: "venue", published: false, capacity_max: 150 }).select("id").single()).data as { id: string }).id;
    const dj = ((await db.from("listings").insert({ workspace_id: provWs, name: "Ops DJ", kind: "service", category: "dj", published: false, details: { setup_minutes: 240 } }).select("id").single()).data as { id: string }).id;
    const space = ((await db.from("spaces").insert({ workspace_id: provWs, venue_id: venue, name: "Main room", capacity_standing: 150, details: { setup_minutes: 120 } }).select("id").single()).data as { id: string }).id;
    event = ((await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, management: "professional", name: "Ops test", starts_at: iso(0), ends_at: iso(5), guest_count: 220, capacity: 200 }).select("id").single()).data as { id: string }).id;
    venueItem = ((await db.from("build_items").insert({ event_id: event, listing_id: venue, category: "venue", title: "Ops Hall", status: "confirmed", amount: 2000 }).select("id").single()).data as { id: string }).id;
    djItem = ((await db.from("build_items").insert({ event_id: event, listing_id: dj, category: "dj", title: "Ops DJ", status: "confirmed", amount: 500 }).select("id").single()).data as { id: string }).id;
    await db.from("provider_jobs").insert({ reference: "BK-OPS1", workspace_id: provWs, build_item_id: venueItem, event_id: event, listing_id: venue, space_id: space, mode: "venue", client_name: "Ops", event_name: "Ops test", starts_at: iso(0), ends_at: iso(5), status: "confirmed" });
    await db.from("ticket_tiers").insert({ event_id: event, name: "GA", price: 10, quantity: 250 });
    [ownC, provC, outC] = await Promise.all([signedIn(owner.email), signedIn(prov.email), signedIn(out.email)]) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("provider_jobs").delete().eq("workspace_id", provWs);
    await db.from("events").delete().eq("id", event);
    await db.from("workspaces").delete().in("id", [ws, provWs]);
    await cleanup();
  });

  test("§88 feasibility flags capacity, ticket and setup incompatibilities with fix paths", async () => {
    expect((await outC.rpc("event_feasibility", { p_event: event })).error?.message).toMatch(/not_authorized/);
    const { data } = await ownC.rpc("event_feasibility", { p_event: event });
    const f = data as Feas[];
    const keys = f.map(x => x.key);
    expect(keys).toEqual(expect.arrayContaining(["guests_over_capacity", "tickets_over_capacity", "setup_window", "security_coverage"]));
    expect(f.find(x => x.key === "guests_over_capacity")).toMatchObject({ severity: "blocker", fix: `/organizer/events/${event}?tab=plan&section=guests` });
    expect(f.find(x => x.key === "setup_window")?.message).toMatch(/Ops DJ needs 4h to set up but Main room gives 2h access/);
  });

  test("§87 readiness is explainable per domain and blocked by feasibility blockers", async () => {
    const { data } = await ownC.rpc("event_readiness", { p_event: event });
    const r = data as { score: number; state: string; domains: Domain[]; checks: { key: string; ok: boolean }[] };
    const by = Object.fromEntries(r.domains.map(d => [d.key, d]));
    expect(by.venue.state).toBe("ready");
    expect(by.suppliers.state).toBe("ready");
    expect(by.staff.state).toBe("not_required");
    expect(by.feasibility.state).toBe("blocked");
    expect(r.state).toBe("blocked");
    expect(r.checks.length).toBe(r.domains.length); // legacy consumers keep working
    for (const d of r.domains) expect(d.reason.length).toBeGreaterThan(3);
  });

  test("§85 team conflicts: double booking, unfilled shift, unavailable crew", async () => {
    const crew = ((await db.from("crew_members").insert({ workspace_id: ws, name: "Sam Crew", role: "Steward", member_type: "crew", skills: [] }).select("id").single()).data as { id: string }).id;
    // Since Q12 (migration 202610291023) overlapping shifts are refused unless the person's capacity policy is "warn";
    // this fixture needs the overlap to exist so the conflict report can be checked.
    expect((await db.from("provider_capacity_rules").insert({ workspace_id: ws, scope: "crew", crew_id: crew, policy: "warn" })).error).toBeNull();
    const { error: se } = await db.from("shifts").insert([
      { workspace_id: ws, event_id: event, crew_id: crew, role: "Steward", title: "Doors", starts_at: iso(-1), ends_at: iso(2), status: "confirmed", location: "Ops Hall" },
      { workspace_id: ws, event_id: event, crew_id: crew, role: "Steward", title: "Bar float", starts_at: iso(1), ends_at: iso(4), status: "confirmed", location: "Ops Hall" },
      { workspace_id: ws, event_id: event, crew_id: null, role: "Security", title: "Front door security", starts_at: iso(0), ends_at: iso(5), status: "pending", location: "Ops Hall" },
    ]);
    expect(se).toBeNull();
    expect((await db.from("availability_blocks").insert({ workspace_id: ws, crew_id: crew, kind: "blocked", starts_at: iso(3), ends_at: iso(6), note: "Holiday" })).error).toBeNull();
    expect((await outC.rpc("team_conflicts", { p_workspace: ws })).error?.message).toMatch(/not_authorized/);
    const { data } = await ownC.rpc("team_conflicts", { p_workspace: ws });
    const kinds = (data as { kind: string }[]).map(c => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(["overlap", "unfilled", "unavailable", "missing_role"]));
    const { data: r } = await ownC.rpc("event_readiness", { p_event: event });
    expect((r as { domains: Domain[] }).domains.find(d => d.key === "staff")?.state).toBe("attention");
  });

  test("§86 provider check-ins: provider reports en route; only the event team checks in or marks absent", async () => {
    expect((await provC.rpc("set_provider_checkin", { p_item: djItem, p_status: "en_route", p_eta: iso(-2), p_note: "20 min away" })).error).toBeNull();
    expect((await provC.rpc("set_provider_checkin", { p_item: djItem, p_status: "checked_in" })).error?.message).toMatch(/invalid_status/);
    expect((await outC.rpc("set_provider_checkin", { p_item: djItem, p_status: "arrived" })).error?.message).toMatch(/not_authorized/);
    expect((await ownC.rpc("set_provider_checkin", { p_item: djItem, p_status: "checked_in" })).error).toBeNull();
    const c = (await ownC.from("provider_checkins").select("status,arrived_at,note").eq("build_item_id", djItem).single()).data as { status: string; arrived_at: string | null };
    expect(c.status).toBe("checked_in");
    expect(c.arrived_at).not.toBeNull();
  });
});
