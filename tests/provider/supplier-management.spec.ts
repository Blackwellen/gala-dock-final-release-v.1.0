import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q11/Q12 supplier management (migration 202610291026) + the Q01 capabilities finding. API level, disposable identities.
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };
type U = { id: string; email: string };

test.describe.configure({ mode: "serial" });
test.describe("Q11/Q12 supplier management", () => {
  let owner: U, staff: U, other: U, buyer: U;
  let ownerC: SupabaseClient, staffC: SupabaseClient, otherC: SupabaseClient, buyerC: SupabaseClient;
  let ws: string, otherWs: string, av: string, event: string;
  const gig = async (name: string, d: number, extra: Record<string, unknown> = {}) =>
    (await ownerC.rpc("provider_create_booking", { p_ws: ws, p: { listing_id: av, mode: "service", client_name: "Client", event_name: name, starts_at: at(d, 18), ends_at: at(d, 23), value: 2000, ...extra } }));

  test.beforeAll(async () => {
    [owner, staff, other, buyer] = await Promise.all(["q12m-owner", "q12m-staff", "q12m-other", "q12m-buyer"].map(l => createUser(l)));
    [ws, otherWs] = await Promise.all([seedWorkspace(owner.id, "provider", "Q12 AV Supplier"), seedWorkspace(other.id, "provider", "Q12 Other Supplier")]);
    await db.from("workspaces").update({ capabilities: ["service"] }).in("id", [ws, otherWs]);
    await db.from("workspace_members").insert({ workspace_id: ws, user_id: staff.id, role: "member", status: "active" });
    av = (await one(db.from("listings").insert({ workspace_id: ws, name: "Q12 AV hire", kind: "service", category: "av", published: false }).select("id").single())).id;
    // An agency: up to 5 concurrent jobs for this service, so equipment is the constraint under test.
    await db.from("provider_capacity_rules").insert({ workspace_id: ws, scope: "listing", listing_id: av, concurrent_limit: 5 });
    event = (await one(db.from("events").insert({ owner_id: buyer.id, name: "Q12 buyer event", starts_at: at(30, 18), ends_at: at(30, 23) }).select("id").single())).id;
    [ownerC, staffC, otherC, buyerC] = await Promise.all([owner, staff, other, buyer].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    for (const w of [ws, otherWs]) {
      await db.from("provider_job_evidence").delete().eq("workspace_id", w);
      await db.from("job_equipment_allocations").delete().eq("workspace_id", w);
      await db.from("shifts").delete().eq("workspace_id", w);
      await db.from("provider_jobs").delete().eq("workspace_id", w);
      await db.from("provider_equipment").delete().eq("workspace_id", w);
      await db.from("service_areas").delete().eq("workspace_id", w);
      await db.from("crew_members").delete().eq("workspace_id", w);
      await db.from("listings").delete().eq("workspace_id", w);
      await db.from("workspaces").delete().eq("id", w);
    }
    await db.from("events").delete().eq("id", event);
    await cleanup();
  });

  test("equipment: two jobs racing for the last unit → one wins; warn policy over-allocates with a flag; maintenance stock is unavailable; cancel frees it", async () => {
    const desk = (await ownerC.rpc("provider_save_equipment", { p_ws: ws, p_equipment: null, p: { name: "Mixing desk", category: "audio", quantity: 1, day_cost: 150 } })).data as string;
    expect(desk).toBeTruthy();
    expect((await staffC.rpc("provider_save_equipment", { p_ws: ws, p_equipment: null, p: { name: "Staff-made", quantity: 9 } })).error).not.toBeNull();
    expect((await staffC.from("provider_equipment").insert({ workspace_id: ws, name: "Direct", quantity: 9 })).error).not.toBeNull();
    const [j1, j2] = await Promise.all([gig("AV gig 1", 31), gig("AV gig 2", 31)]);
    expect([j1.error, j2.error]).toEqual([null, null]);
    const race = await Promise.all([j1, j2].map(j => ownerC.rpc("provider_allocate_equipment", { p_job: j.data, p_equipment: desk, p_quantity: 1 })));
    expect(race.filter(r => r.error)).toHaveLength(1);
    expect(race.find(r => r.error)?.error?.message).toBe("equipment_conflict");
    expect((await otherC.rpc("provider_allocate_equipment", { p_job: j2.data, p_equipment: desk, p_quantity: 1 })).error).not.toBeNull();
    // Cancelling the job that holds the desk frees it for the other.
    const holder = race[0].error ? j2.data : j1.data, waiter = race[0].error ? j1.data : j2.data;
    expect((await ownerC.rpc("provider_job_transition", { p_job: holder, p_to: "cancelled", p_reason: "Client cancelled the gig" })).error).toBeNull();
    expect((await ownerC.rpc("provider_allocate_equipment", { p_job: waiter, p_equipment: desk, p_quantity: 1 })).error).toBeNull();
    // Warn policy: the over-allocation is allowed and flagged.
    const speakers = (await ownerC.rpc("provider_save_equipment", { p_ws: ws, p_equipment: null, p: { name: "Speaker pair", quantity: 2, conflict_policy: "warn", day_cost: 60 } })).data as string;
    const j3 = await gig("AV gig 3", 31);
    expect((await ownerC.rpc("provider_allocate_equipment", { p_job: waiter, p_equipment: speakers, p_quantity: 2 })).error).toBeNull();
    const warned = await ownerC.rpc("provider_allocate_equipment", { p_job: j3.data, p_equipment: speakers, p_quantity: 1 });
    expect(warned.error).toBeNull();
    expect((await db.from("job_equipment_allocations").select("warning").eq("id", warned.data).single()).data?.warning).toMatch(/over-allocated: 3 of 2/);
    // Maintenance stock cannot be allocated.
    expect((await ownerC.rpc("provider_save_equipment", { p_ws: ws, p_equipment: desk, p: { status: "maintenance" } })).error).toBeNull();
    expect((await ownerC.rpc("provider_allocate_equipment", { p_job: j3.data, p_equipment: desk, p_quantity: 1 })).error?.message).toBe("equipment_unavailable");
  });

  test("job profitability = net payout − crew − equipment; evidence is written by the team and readable by the buyer", async () => {
    const crew = (await one(db.from("crew_members").insert({ workspace_id: ws, name: "Q12 Engineer", role: "Engineer", day_rate: 240 }).select("id").single())).id;
    const j = await gig("Profit gig", 32, { value: 1000 });
    expect((await ownerC.rpc("provider_assign_crew", { p_job: j.data, p_crew: crew, p_role: "Sound" })).error).toBeNull(); // 5h shift = 150
    const kit = (await ownerC.rpc("provider_save_equipment", { p_ws: ws, p_equipment: null, p: { name: "Lighting rig", quantity: 1, day_cost: 100 } })).data as string;
    expect((await ownerC.rpc("provider_allocate_equipment", { p_job: j.data, p_equipment: kit, p_quantity: 1 })).error).toBeNull();
    const { data: p } = await ownerC.from("provider_job_profitability").select("value,net_payout,crew_cost,equipment_cost,margin").eq("job_id", j.data).single();
    expect(Number(p!.crew_cost)).toBe(150);
    expect(Number(p!.equipment_cost)).toBe(100);
    expect(Number(p!.margin)).toBeCloseTo(Number(p!.net_payout) - 250, 2);
    expect((await otherC.from("provider_job_profitability").select("job_id").eq("job_id", j.data)).data).toHaveLength(0);
    // Evidence: staff can add; a foreign storage path is refused; other tenants can't; the buyer of the booking can read it.
    await db.from("provider_jobs").update({ event_id: event }).eq("id", j.data);
    expect((await staffC.rpc("provider_add_job_evidence", { p_job: j.data, p_kind: "completion", p_note: "Show delivered", p_path: `${ws}/jobs/${j.data}/signoff.jpg` })).error).toBeNull();
    expect((await staffC.rpc("provider_add_job_evidence", { p_job: j.data, p_kind: "delivery", p_note: "x", p_path: `${otherWs}/stolen.jpg` })).error?.message).toMatch(/path_not_in_workspace/);
    expect((await otherC.rpc("provider_add_job_evidence", { p_job: j.data, p_kind: "damage", p_note: "x", p_path: null })).error).not.toBeNull();
    expect((await buyerC.from("provider_job_evidence").select("kind,note").eq("job_id", j.data)).data).toEqual([{ kind: "completion", note: "Show delivered" }]);
    expect((await otherC.from("provider_job_evidence").select("id").eq("job_id", j.data)).data).toHaveLength(0);
  });

  test("service area: coverage and travel fee by distance", async () => {
    // London (51.5074, -0.1278), 50 km radius, first 10 km free, £1.50/km after, minimum £20.
    expect((await staffC.rpc("provider_save_service_area", { p_ws: ws, p_area: null, p: { label: "London", lat: 51.5074, lng: -0.1278, radius_km: 50 } })).error).not.toBeNull();
    expect((await ownerC.rpc("provider_save_service_area", { p_ws: ws, p_area: null, p: { listing_id: av, label: "London", lat: 51.5074, lng: -0.1278, radius_km: 50,
      free_radius_km: 10, fee_per_km: 1.5, min_travel_fee: 20 } })).error).toBeNull();
    const near = (await ownerC.rpc("service_area_quote", { p_listing: av, p_lat: 51.52, p_lng: -0.10 })).data as Record<string, unknown>;
    expect(near).toMatchObject({ configured: true, covered: true, travel_fee: 0 });
    const reading = (await ownerC.rpc("service_area_quote", { p_listing: av, p_lat: 51.4543, p_lng: -0.9781 })).data as { covered: boolean; distance_km: number; travel_fee: number };
    expect(reading.covered).toBe(false);                                                // Reading ≈ 59 km
    expect(reading.distance_km).toBeGreaterThan(55);
    expect(reading.travel_fee).toBeCloseTo((reading.distance_km - 10) * 1.5, 0);
    expect((await otherC.rpc("service_area_quote", { p_listing: av, p_lat: 51.5, p_lng: -0.1 })).error).not.toBeNull(); // unpublished listing, not a member
  });

  test("Q01: capabilities change only through provider_save_settings once onboarding is complete", async () => {
    const direct = await ownerC.from("workspaces").update({ capabilities: ["venue", "service"] }).eq("id", ws).select("id");
    expect(direct.error?.message).toBe("capabilities_use_settings");
    expect((await ownerC.from("workspaces").update({ name: "Q12 AV Supplier Ltd" }).eq("id", ws).select("id")).error).toBeNull(); // other fields unaffected
    expect((await ownerC.rpc("provider_save_settings", { p_ws: ws, p: { capabilities: ["venue", "service"] } })).error).toBeNull();
    expect((await db.from("workspaces").select("capabilities").eq("id", ws).single()).data?.capabilities).toEqual(["venue", "service"]);
    // During onboarding the owner may still set valid values directly (onboarding route); invalid values are always refused.
    const fresh = (await one(db.from("workspaces").insert({ owner_id: owner.id, kind: "provider", name: "Q12 Onboarding", capabilities: [], settings: {}, is_test_fixture: true } as never).select("id").single())).id;
    expect((await ownerC.from("workspaces").update({ capabilities: ["service"] }).eq("id", fresh).select("id")).error).toBeNull();
    expect((await ownerC.from("workspaces").update({ capabilities: ["admin"] }).eq("id", fresh).select("id")).error?.message).toBe("invalid_capabilities");
    await db.from("workspaces").delete().eq("id", fresh);
  });
});
