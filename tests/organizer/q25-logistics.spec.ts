import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q25 Travel / parking / accommodation / logistics (domains 154–157) — API-level, disposable identities, RLS-bound clients.
// Exit gate: travel / loading / access constraints feed schedule (talent arrival vs programme), feasibility (event_feasibility →
// event_readiness) and readiness (event_ops_readiness / lifecycle hook), plus conflicts on Home / Event.
type U = { id: string; email: string };
type Id = { id: string };
type Item = { key: string; severity: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const H = 36e5, day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const ymd = (ms: number) => iso(ms).slice(0, 10);
const rpc = async (c: SupabaseClient, fn: string, args: Record<string, unknown>) => { const r = await c.rpc(fn, args); if (r.error) throw new Error(`${fn}: ${r.error.message}`); return r.data as Record<string, unknown>; };
const items = async (c: SupabaseClient, ev: string) => ((await rpc(c, "event_ops_readiness", { p_event: ev })).items as Item[]);

test.describe.configure({ mode: "serial" });

test.describe("Q25 travel, parking, accommodation & logistics", () => {
  let O: U, M: U, V: U, X: U, G: U; let oc: SupabaseClient, mc: SupabaseClient, vc: SupabaseClient, xc: SupabaseClient, gc: SupabaseClient;
  let W: string, VW: string, XW: string, L: string, E: string, XE: string, VAN: string, CREW: string, SPK: string, IT: string, BAY: string, MOVE: string;
  const t0 = Date.now() + 5 * day;

  test.beforeAll(async () => {
    [O, M, V, X, G] = await Promise.all([createUser("q25-owner"), createUser("q25-member"), createUser("q25-venue"), createUser("q25-other"), createUser("q25-guest")]);
    W = await seedWorkspace(O.id, "organizer", "Q25 Events");
    VW = await seedWorkspace(V.id, "provider", "Q25 Venue Co");
    XW = await seedWorkspace(X.id, "organizer", "Q25 Other Org");
    await db.from("workspace_members").insert({ workspace_id: W, user_id: M.id, role: "member", status: "active" });
    L = ((await db.from("listings").insert({ workspace_id: VW, name: "Q25 Hall", kind: "venue", category: "venue", published: false }).select("id").single()).data as Id).id;
    E = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, management: "professional", name: "Q25 Summit", status: "planning", starts_at: iso(t0), ends_at: iso(t0 + 6 * H), venue_listing_id: L }).select("id").single()).data as Id).id;
    XE = ((await db.from("events").insert({ owner_id: X.id, workspace_id: XW, management: "professional", name: "Q25 Secret Launch", status: "planning", starts_at: iso(t0), ends_at: iso(t0 + 4 * H), venue_listing_id: L }).select("id").single()).data as Id).id;
    VAN = ((await db.from("provider_equipment").insert({ workspace_id: W, name: "Q25 Van", category: "vehicle", quantity: 1, details: { seats: 8 } }).select("id").single()).data as Id).id;
    CREW = ((await db.from("crew_members").insert({ workspace_id: W, name: "Dee Driver", role: "Driver" }).select("id").single()).data as Id).id;
    IT = ((await db.from("programme_items").insert({ event_id: E, starts_at: iso(t0 + H), duration_minutes: 45, title: "Keynote", kind: "programme", area: "Hall" }).select("id").single()).data as Id).id;
    await db.from("guests").insert({ event_id: E, name: "Gil Guest", email: G.email });
    [oc, mc, vc, xc, gc] = await Promise.all([as(O), as(M), as(V), as(X), as(G)]);
    SPK = (await rpc(oc, "party_save", { p_event: E, p: { kind: "speaker", name: "Dr Keynote", arrival_buffer_minutes: 60 } })).id as string;
    await rpc(oc, "party_transition", { p_party: SPK, p_to: "confirmed" });
    await rpc(oc, "party_slot_set", { p_party: SPK, p_item: IT, p_role: "speaker", p_status: "confirmed" });
  });
  test.afterAll(async () => {
    await db.from("events").delete().in("workspace_id", [W, XW]);
    await db.from("listings").delete().eq("id", L);
    await db.from("workspaces").delete().in("id", [W, VW, XW]);
    await cleanup();
  });

  test("schedule: an accepted travel rider needs transport; arrival after slot minus buffer is a blocker + conflict; fixing it clears both", async () => {
    const rider = (await rpc(oc, "rider_submit", { p_party: SPK, p_kind: "travel", p_summary: "Travel", p_items: [{ category: "ground_transport", description: "Airport pickup" }, { category: "accommodation", description: "1 night" }] })).id as string;
    await rpc(oc, "rider_decide", { p_rider: rider, p_decision: "accepted", p_note: "ok" });
    let it = await items(oc, E);
    expect(it.some(i => i.key === "talent_no_transport")).toBe(true);
    expect(it.some(i => i.key === "talent_no_room")).toBe(true);
    const mv = await rpc(oc, "transport_save", { p_event: E, p: { kind: "talent", party_id: SPK, crew_id: CREW, passengers: 2, from_place: "LHR T5", to_place: "Q25 Hall", pickup_point: "Arrivals",
      departs_at: iso(t0 + 15 * 60e3), arrives_at: iso(t0 + 30 * 60e3), vehicle_equipment_id: VAN, private: { passenger_names: "Dr Keynote, PA", flight_number: "BA117", contact_phone: "+44 7000 000000" } } });
    MOVE = mv.id as string;
    // Vehicle locked through the Q12/Q17 resource allocation (one rule for jobs and events).
    expect(((await db.from("job_equipment_allocations").select("event_id,status").eq("id", mv.allocation_id as string).single()).data as { event_id: string; status: string })).toEqual({ event_id: E, status: "reserved" });
    expect((await oc.rpc("transport_save", { p_event: E, p: { kind: "crew", passengers: 12, departs_at: iso(t0 + day), arrives_at: iso(t0 + day + H), vehicle_equipment_id: VAN } })).error?.message).toMatch(/vehicle_capacity_exceeded/);
    it = await items(oc, E);
    expect(it.some(i => i.key === "talent_no_transport")).toBe(false);
    expect(it.find(i => i.key === "talent_late_arrival")?.severity).toBe("blocker");
    expect(((await oc.rpc("event_conflicts", { p_event: E })).data as { kind: string }[]).some(c => c.kind === "ops_talent_late_arrival")).toBe(true);
    expect(((await oc.rpc("event_feasibility", { p_event: E })).data as { key: string; severity: string }[]).some(f => f.key === "talent_late_arrival" && f.severity === "blocker")).toBe(true);
    expect(((await oc.rpc("event_ops_blockers", { p_event: E, p_to: "ready" })).data as { key: string }[]).some(b => b.key === "ops_talent_late_arrival")).toBe(true);
    const moved = await rpc(oc, "transport_save", { p_event: E, p: { departs_at: iso(t0 - 2 * H), arrives_at: iso(t0 - H) }, p_id: MOVE });
    expect(moved.allocation_id).not.toBe(mv.allocation_id);   // re-locked for the new window
    expect(((await db.from("job_equipment_allocations").select("status").eq("id", mv.allocation_id as string).single()).data as { status: string }).status).toBe("released");
    expect((await items(oc, E)).some(i => i.key === "talent_late_arrival")).toBe(false);
  });

  test("sensitive travel data: managers read passenger details, plain members and outsiders do not; attendees see only public shuttles", async () => {
    expect(((await oc.from("transport_private").select("flight_number").eq("movement_id", MOVE)).data ?? [])).toEqual([{ flight_number: "BA117" }]);
    expect(((await mc.from("transport_private").select("flight_number").eq("movement_id", MOVE)).data ?? [])).toEqual([]);
    expect(((await mc.from("transport_movements").select("id").eq("id", MOVE)).data ?? [])).toHaveLength(1);
    expect(((await xc.from("transport_movements").select("id").eq("event_id", E)).data ?? [])).toEqual([]);
    const memberView = (await rpc(mc, "event_logistics_overview", { p_event: E })).transport as { private: unknown }[];
    expect(memberView.every(t => t.private === null)).toBe(true);
    await rpc(oc, "transport_save", { p_event: E, p: { kind: "shuttle", public_info: true, passengers: 40, from_place: "Station", to_place: "Q25 Hall", pickup_point: "Stop A", departs_at: iso(t0 - H), arrives_at: iso(t0 - 40 * 60e3) } });
    const guestView = await rpc(gc, "my_event_travel", { p_event: E });
    expect(guestView.shuttles as unknown[]).toHaveLength(1);
    expect(guestView.my_transport).toEqual([]);
    expect((await rpc(xc, "my_event_travel", { p_event: E })).shuttles).toEqual([]);
  });

  test("parking: capacity and accessible spaces enforced server-side with machine-readable errors; one permit per vehicle", async () => {
    const area = (await rpc(oc, "parking_area_save", { p_event: E, p: { name: "Crew car park", kind: "staff", capacity: 2, accessible_spaces: 1, access_route: "Gate B" } })).id as string;
    expect((await mc.rpc("parking_issue_permit", { p_area: area, p: { holder_kind: "staff", holder_name: "Member" } })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(oc, "parking_issue_permit", { p_area: area, p: { holder_kind: "staff", holder_name: "Dee Driver", crew_id: CREW, vehicle_reg: "ab12 cde" } })).remaining).toBe(0);
    const full = await oc.rpc("parking_issue_permit", { p_area: area, p: { holder_kind: "staff", holder_name: "Second Car", vehicle_reg: "XY99ZZZ" } });
    expect(full.error?.message).toBe("parking_full");
    expect(JSON.parse(full.error!.details)).toMatchObject({ capacity: 1, used: 1 });
    await rpc(oc, "parking_issue_permit", { p_area: area, p: { holder_kind: "accessible", holder_name: "Blue Badge", accessible: true } });
    expect((await oc.rpc("parking_issue_permit", { p_area: area, p: { holder_kind: "accessible", holder_name: "Blue Two", accessible: true } })).error?.message).toBe("accessible_parking_full");
    await rpc(oc, "parking_area_save", { p_event: E, p: { capacity: 4 }, p_id: area });
    expect((await oc.rpc("parking_issue_permit", { p_area: area, p: { holder_kind: "staff", holder_name: "Same Van", vehicle_reg: "AB12CDE" } })).error?.message).toBe("duplicate_permit");
    expect((await oc.rpc("parking_area_save", { p_event: E, p: { capacity: 1 }, p_id: area })).error?.message).toMatch(/capacity_below_issued/);
  });

  test("accommodation: per-night capacity, duplicate occupant guard, cost snapshot, cut-off readiness and post-cut-off refusal", async () => {
    const blk = (await rpc(oc, "accommodation_block_save", { p_event: E, p: { hotel_name: "Q25 Hotel", rooms_total: 1, check_in: ymd(t0 - day), check_out: ymd(t0 + day), cutoff_date: ymd(Date.now() + 2 * day), nightly_rate: 120 } })).id as string;
    const r1 = await rpc(oc, "room_allocate", { p_block: blk, p: { occupant_kind: "talent", occupant_name: "Dr Keynote", party_id: SPK, nights_from: ymd(t0 - day), nights_to: ymd(t0) } });
    expect(Number(r1.cost)).toBe(120);
    expect((await oc.rpc("room_allocate", { p_block: blk, p: { occupant_kind: "crew", occupant_name: "Dee Driver", crew_id: CREW } })).error?.message).toBe("rooms_full");
    await rpc(oc, "accommodation_block_save", { p_event: E, p: { rooms_total: 2, nightly_rate: 150 }, p_id: blk });
    expect(Number((await rpc(oc, "room_allocate", { p_block: blk, p: { occupant_kind: "crew", occupant_name: "Dee Driver", crew_id: CREW } })).cost)).toBe(300);
    expect((await oc.rpc("room_allocate", { p_block: blk, p: { occupant_kind: "crew", occupant_name: "Dee Driver", crew_id: CREW, nights_from: ymd(t0) } })).error?.message).toBe("duplicate_room_allocation");
    expect(Number(((await db.from("room_allocations").select("cost").eq("id", r1.id as string).single()).data as { cost: number }).cost)).toBe(120);   // history not rewritten
    let it = await items(oc, E);
    expect(it.some(i => i.key === "talent_no_room")).toBe(false);
    expect(it.some(i => i.key === "rooms_cutoff")).toBe(true);
    await db.from("accommodation_blocks").update({ cutoff_date: ymd(Date.now() - day) }).eq("id", blk);
    expect((await oc.rpc("room_allocate", { p_block: blk, p: { occupant_kind: "guest", occupant_name: "Late Guest" } })).error?.message).toBe("block_past_cutoff");
    it = await items(oc, E);
    expect(it.some(i => i.key === "rooms_cutoff")).toBe(false);
  });

  test("loading: venue-owned bay; overlapping windows refused across tenants (turnaround included) without leaking; feasibility warnings", async () => {
    expect((await oc.rpc("loading_bay_save", { p: { listing_id: L, name: "Hijack" } })).error?.message).toMatch(/not_authorized/);
    BAY = (await rpc(vc, "loading_bay_save", { p: { listing_id: L, name: "Dock 1", turnaround_minutes: 15, access_route: "Gate C via Service Rd" } })).id as string;
    const w = await rpc(oc, "logistics_window_book", { p_event: E, p: { bay_id: BAY, kind: "load_in", supplier_name: "Q25 AV", starts_at: iso(t0 - 3 * H), ends_at: iso(t0 - 2 * H) } });
    expect(((await db.from("logistics_windows").select("access_route").eq("id", w.id as string).single()).data as { access_route: string }).access_route).toBe("Gate C via Service Rd");
    const clash = await xc.rpc("logistics_window_book", { p_event: XE, p: { bay_id: BAY, kind: "delivery", starts_at: iso(t0 - 2 * H + 5 * 60e3), ends_at: iso(t0 - H) } });
    expect(clash.error?.message).toBe("loading_slot_taken");
    expect(clash.error?.details ?? "").not.toMatch(/Q25 Summit|Q25 AV/);
    await rpc(xc, "logistics_window_book", { p_event: XE, p: { bay_id: BAY, kind: "delivery", starts_at: iso(t0 - 2 * H + 20 * 60e3), ends_at: iso(t0 + 30 * 60e3) } });
    expect(((await vc.from("logistics_windows").select("id").eq("bay_id", BAY)).data ?? [])).toHaveLength(2);   // venue sees its dock schedule
    expect(((await xc.from("logistics_windows").select("id").eq("event_id", E)).data ?? [])).toEqual([]);     // tenants never see each other
    expect((await items(xc, XE)).some(i => i.key === "delivery_after_start")).toBe(true);
    const own = (await rpc(oc, "loading_bay_save", { p: { event_id: E, name: "Side door" } })).id as string;
    await rpc(oc, "logistics_window_book", { p_event: E, p: { bay_id: own, kind: "collection", starts_at: iso(t0 + 2 * H), ends_at: iso(t0 + 3 * H) } });
    expect((await items(oc, E)).some(i => i.key === "collection_before_end")).toBe(true);
    expect((await oc.rpc("logistics_window_book", { p_event: E, p: { bay_id: own, kind: "delivery", starts_at: iso(t0 + 2.1 * H), ends_at: iso(t0 + 2.5 * H) } })).error?.message).toBe("loading_slot_taken");
    expect((await rpc(oc, "event_logistics_overview", { p_event: E })).windows as unknown[]).toHaveLength(2);
  });
});
