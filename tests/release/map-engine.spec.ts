import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q19 Venue / Event Map Engine (domains 85–91; migration 202610291037). Exit gate: the Organizer cannot override Venue
// locks, and publishing fails on invalid capacity / critical safety constraints. API level, disposable identities.
const db = admin as unknown as SupabaseClient;
const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };
type Finding = { code: string; severity: string; element_id?: string };
type Validation = { ok: boolean; errors: Finding[]; warnings: Finding[]; stats: { total: number; seats: number; venue_capacity: number; exits: number; required_exits: number } };
type El = Record<string, unknown>;

test.describe.configure({ mode: "serial" });
test.describe("Q19 map engine", () => {
  let prov: { id: string; email: string }, org: { id: string; email: string }, out: { id: string; email: string };
  let provC: SupabaseClient, provC2: SupabaseClient, orgC: SupabaseClient, orgC2: SupabaseClient, outC: SupabaseClient;
  let P: string, O: string, venue: string, hall: string, studio: string, event: string, ga: string, vip: string, zone: string;
  let mapVersion = 0;

  const structure = (hallId: string, studioId: string): El[] => [
    { id: "hall", type: "room", label: "Hall", space: hallId, x: 0, y: 0, w: 400, h: 300 },
    { id: "studio", type: "room", label: "Studio", space: studioId, x: 450, y: 0, w: 200, h: 150 },
    { id: "exit-1", type: "exit", label: "Fire exit west", x: 0, y: 130, w: 10, h: 20, protected: true },
    { id: "exit-2", type: "exit", label: "Fire exit east", x: 390, y: 130, w: 10, h: 20, protected: true },
    { id: "route", type: "accessible_route", label: "Step-free route", x: 0, y: 280, w: 400, h: 12, locked: true },
    { id: "bar-fixed", type: "bar", label: "Main bar", x: 300, y: 250, w: 60, h: 20, locked: true },
  ];
  const gaArea = (cap: number, extra: El = {}): El => ({ id: "ga", type: "asset", asset: "standing_area", label: "GA floor", x: 20, y: 40, w: 200, h: 200, capacity: cap, tier: ga, zone, ...extra });
  const block: El = { id: "blk", type: "asset", asset: "seat_block", label: "Block V", x: 250, y: 40, w: 60, h: 40, seating: { rows: 4, cols: 5 } };
  const seats = () => Array.from({ length: 20 }, (_, i) => ({ key: `V-${i + 1}`, label: `V${i + 1}`, section: "Block V", kind: "seat", tier: vip, accessible: i < 2, blocked: false }));
  const save = (c: SupabaseClient, overlay: El[], publish: boolean, base: number, s: unknown[] = []) => c.rpc("event_map_save", { p_event: event, p_overlay: overlay, p_seats: s, p_publish: publish, p_base_version: base });
  const codes = (v: Validation, sev: "errors" | "warnings" = "errors") => v[sev].map(f => f.code);

  test.beforeAll(async () => {
    [prov, org, out] = await Promise.all([createUser("q19-p"), createUser("q19-o"), createUser("q19-x")]);
    [P, O] = await Promise.all([seedWorkspace(prov.id, "provider", "Q19 Test Venue"), seedWorkspace(org.id, "organizer", "Q19 Test Organizer")]);
    venue = (await one(db.from("listings").insert({ workspace_id: P, name: "Q19 Test Venue", kind: "venue", category: "venue", published: false, capacity_max: 300 }).select("id").single())).id;
    hall = (await one(db.from("spaces").insert({ workspace_id: P, venue_id: venue, name: "Q19 Hall", capacity_standing: 150, capacity_seated: 100 }).select("id").single())).id;
    studio = (await one(db.from("spaces").insert({ workspace_id: P, venue_id: venue, name: "Q19 Studio", capacity_standing: 40, capacity_seated: 30 }).select("id").single())).id;
    event = (await one(db.from("events").insert({ owner_id: org.id, workspace_id: O, name: "Q19 Test concert", starts_at: at(40), ends_at: at(40.2), venue_listing_id: venue, capacity: 300 }).select("id").single())).id;
    ga = (await one(db.from("ticket_tiers").insert({ event_id: event, name: "Q19 GA", kind: "general", price: 20, quantity: 100 }).select("id").single())).id;
    vip = (await one(db.from("ticket_tiers").insert({ event_id: event, name: "Q19 VIP", kind: "vip", price: 60, quantity: 20 }).select("id").single())).id;
    zone = (await one(db.from("access_zones").insert({ event_id: event, name: "Q19 Floor", kind: "general", capacity: 150 }).select("id").single())).id;
    await one(db.from("access_rules").insert({ event_id: event, zone_id: zone, tier_id: ga }).select("id").single());
    [provC, provC2, orgC, orgC2, outC] = await Promise.all([prov, prov, org, org, out].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("events").delete().eq("id", event);
    await db.from("venue_structures").delete().eq("venue_id", venue);
    await db.from("spaces").delete().eq("venue_id", venue);
    await db.from("listings").delete().eq("id", venue);
    await db.from("workspaces").delete().in("id", [P, O]);
    await cleanup();
  });

  test("structural map: venue-owned, versioned, calibrated; concurrent sessions get a version conflict", async () => {
    const palette = (await orgC.from("map_asset_palettes").select("key,mode,blocks_egress").in("key", ["seat_block", "standing_area", "struct:exit"])).data as { key: string; mode: string; blocks_egress: boolean }[];
    expect(palette.find(p => p.key === "struct:exit")?.mode).toBe("venue");
    expect(palette.find(p => p.key === "seat_block")?.blocks_egress).toBe(true);
    expect((await orgC.rpc("venue_structure_save", { p_venue: venue, p_elements: [], p_publish: true, p_base_version: 0 })).error?.message).toMatch(/not_authorized|42501/);
    expect((await provC.rpc("venue_structure_save", { p_venue: venue, p_elements: structure(hall, studio), p_publish: true, p_base_version: 0, p_meta: { calibration: { units_per_m: 0 } } })).error?.message).toMatch(/invalid_calibration/);
    const r = await provC.rpc("venue_structure_save", { p_venue: venue, p_elements: structure(hall, studio), p_publish: true, p_base_version: 0,
      p_meta: { capacity_max: 300, calibration: { units_per_m: 10, rotation_deg: 0, origin: [0, 0], underlay: { file_ref: "floorplans/q19.pdf", kind: "pdf", opacity: 0.5 } } } });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ version: 1, status: "published" });
    const [a, b] = await Promise.all([
      provC.rpc("venue_structure_save", { p_venue: venue, p_elements: structure(hall, studio), p_publish: false, p_base_version: 1 }),
      provC2.rpc("venue_structure_save", { p_venue: venue, p_elements: structure(hall, studio), p_publish: false, p_base_version: 1 })]);
    const errs = [a.error, b.error].filter(Boolean);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toMatch(/stale_version/);
    // Protected exits can't be dropped from the published structure.
    expect((await provC.rpc("venue_structure_save", { p_venue: venue, p_elements: structure(hall, studio).filter(e => e.id !== "exit-1"), p_publish: true, p_base_version: 2 })).error?.message).toMatch(/protected_element_removed/);
  });

  test("event overlay: versioned; a second session saving on a stale base is refused, not overwritten", async () => {
    const r = await save(orgC, [gaArea(100)], false, 0);
    expect(r.error).toBeNull();
    mapVersion = (r.data as { version: number }).version;
    expect(mapVersion).toBe(1);
    const stale = await save(orgC2, [gaArea(90)], false, 0);
    expect(stale.error?.message).toMatch(/stale_version/);
    expect((await outC.rpc("event_map_save", { p_event: event, p_overlay: [], p_seats: [], p_publish: false, p_base_version: mapVersion })).error?.message).toMatch(/not_authorized/);
    // Direct table writes are refused (venue locks and validation live in the commands).
    expect((await orgC.from("venue_maps").insert({ event_id: event, version: 99, status: "published", structure: {}, overlay: [] })).error?.message).toMatch(/map_write_requires_command|row-level|permission/);
  });

  test("EXIT GATE (1): the organizer cannot move, hide or replace a venue-locked element (server-side)", async () => {
    const moved = { id: "exit-1", type: "exit", label: "Fire exit west", x: 200, y: 130, w: 10, h: 20 };
    const r = await save(orgC, [gaArea(100), moved], false, mapVersion);
    expect(r.error?.message).toMatch(/venue_lock/);
    expect((await save(orgC, [gaArea(100), { id: "route", type: "accessible_route", label: "x", hidden: true }], false, mapVersion)).error?.message).toMatch(/venue_lock/);
    // The legacy editor RPC enforces the same lock.
    expect((await orgC.rpc("organizer_save_event_plan", { p_event: event, p_structure: { format: "plan-v2" }, p_overlay: [{ id: "bar-fixed", type: "asset", asset: "bar", label: "Moved bar", x: 10, y: 10, w: 60, h: 20 }], p_seats: [], p_publish: false })).error?.message).toMatch(/venue_lock/);
    expect(((await db.from("venue_maps").select("version").eq("event_id", event)).data ?? []).length).toBe(1);   // nothing persisted
  });

  test("EXIT GATE (2): capacity overflow and critical safety findings block publish; warnings don't", async () => {
    // 400 standing in the Hall: over the venue licence (300) and the Hall's own capacity (150).
    let r = await save(orgC, [gaArea(400)], true, mapVersion);
    expect(r.error?.message).toMatch(/map_validation_failed/);
    const v1 = (await orgC.rpc("event_map_validate", { p_event: event })).data as Validation;  // latest saved draft (100 standing) is fine
    expect(v1.ok).toBe(true);
    // Validate candidate overlays directly through a draft save + validate.
    r = await save(orgC, [gaArea(400)], false, mapVersion);
    expect(r.error).toBeNull();
    mapVersion = (r.data as { version: number }).version;
    let v = (await orgC.rpc("event_map_validate", { p_event: event })).data as Validation;
    expect(codes(v)).toEqual(expect.arrayContaining(["capacity_exceeded", "room_capacity_exceeded"]));
    // Density, blocked exit, blocked accessible route; narrow aisle is only a warning.
    r = await save(orgC, [gaArea(100, { x: 20, y: 40, w: 40, h: 40 }), { id: "pop-bar", type: "asset", asset: "bar", label: "Pop-up bar", x: 12, y: 132, w: 20, h: 10 },
      { id: "stage", type: "asset", asset: "stage", label: "Stage", x: 100, y: 270, w: 60, h: 20 },
      { id: "t1", type: "asset", asset: "round_table", label: "Table 1", x: 300, y: 150, w: 20, h: 20, table: { seats: 8 } },
      { id: "t2", type: "asset", asset: "round_table", label: "Table 2", x: 325, y: 150, w: 20, h: 20, table: { seats: 8 } }], false, mapVersion);
    expect(r.error).toBeNull();
    mapVersion = (r.data as { version: number }).version;
    v = (await orgC.rpc("event_map_validate", { p_event: event })).data as Validation;
    expect(codes(v)).toEqual(expect.arrayContaining(["density_exceeded", "exit_blocked", "route_blocked"]));
    expect(codes(v, "warnings")).toContain("aisle_narrow");
    expect((await orgC.rpc("organizer_save_event_plan", { p_event: event, p_structure: { format: "plan-v2" }, p_overlay: [gaArea(400)], p_seats: [], p_publish: true })).error?.message).toMatch(/map_validation_failed/);
  });

  test("ticket bindings: tiers and Q18 zones; a valid layout publishes with its validation recorded", async () => {
    // GA tier (100) bound to the standing area in the Floor zone; VIP (20) to a 4×5 seat block.
    const overlay = [gaArea(100), { ...block, tier: vip }];
    expect((await save(orgC, [gaArea(100), { ...block, tier: "00000000-0000-0000-0000-000000000000" }], true, mapVersion, seats())).error?.message).toMatch(/invalid_tier|map_validation_failed/);
    expect((await save(orgC, [gaArea(100, { zone: "00000000-0000-0000-0000-000000000000" }), { ...block, tier: vip }], true, mapVersion, seats())).error?.message).toMatch(/map_validation_failed/);
    expect((await save(orgC, [gaArea(60), { ...block, tier: vip }], true, mapVersion, seats())).error?.message).toMatch(/map_validation_failed/); // GA 100 tickets > 60 places
    const r = await save(orgC, overlay, true, mapVersion, seats());
    expect(r.error).toBeNull();
    const res = r.data as { version: number; status: string; validation: Validation };
    mapVersion = res.version;
    expect(res).toMatchObject({ status: "published", validation: { ok: true, stats: { total: 120, seats: 20, venue_capacity: 300, exits: 2, required_exits: 2 } } });
    const b = (await orgC.rpc("event_map_bindings", { p_event: event })).data as { published: boolean; tiers: { tier_id: string; seats: number; area_capacity: number; zones: string[] }[]; zones: { zone_id: string; elements: string[] }[] };
    expect(b.published).toBe(true);
    expect(b.tiers.find(t => t.tier_id === ga)).toMatchObject({ area_capacity: 100, seats: 0, zones: [zone] });
    expect(b.tiers.find(t => t.tier_id === vip)).toMatchObject({ seats: 20 });
    expect(b.zones.find(z => z.zone_id === zone)?.elements).toEqual(["ga"]);
    expect((await outC.rpc("event_map_bindings", { p_event: event })).error?.message).toMatch(/not_authorized/);
    const row = await one<{ structure_version: number; validation: Validation }>(db.from("venue_maps").select("structure_version,validation").eq("event_id", event).eq("version", mapVersion).single());
    expect(row).toMatchObject({ structure_version: 1, validation: { ok: true } });
  });

  test("lifecycle blockers: a venue capacity change after publish surfaces as an event blocker (service-only hook for Q14)", async () => {
    expect((await db.rpc("event_map_blockers", { p_event: event })).data).toEqual([]);
    expect((await orgC.rpc("event_map_blockers", { p_event: event })).error).not.toBeNull();
    const cur = (await db.from("venue_structures").select("version").eq("venue_id", venue).order("version", { ascending: false }).limit(1).single()).data as { version: number };
    expect((await provC.rpc("venue_structure_save", { p_venue: venue, p_elements: structure(hall, studio), p_publish: true, p_base_version: cur.version, p_meta: { capacity_max: 100 } })).error).toBeNull();
    const bl = (await db.rpc("event_map_blockers", { p_event: event })).data as { key: string; label: string; fix: string }[];
    expect(bl.map(x => x.key)).toContain("map_capacity_exceeded");
    expect(bl[0]!.fix).toBe(`/organizer/events/${event}/map`);
  });

  test("versions: compare and restore never rewrite history; Agent map tools are read-only and workspace-scoped", async () => {
    const cmp = (await orgC.rpc("event_map_compare", { p_event: event, p_a: 1, p_b: mapVersion })).data as { added: string[]; removed: string[]; changed: string[] };
    expect(cmp.added).toContain("blk");
    const before = ((await db.from("venue_maps").select("version").eq("event_id", event)).data ?? []).length;
    const r = await orgC.rpc("event_map_restore", { p_event: event, p_version: 1, p_base_version: mapVersion });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ restored_from: 1, status: "draft" });
    expect(((await db.from("venue_maps").select("version").eq("event_id", event)).data ?? []).length).toBe(before + 1);
    const tool = await db.from("agent_tools").select("id,risk,mutation").in("id", ["map.validate", "map.bindings"]);
    expect((tool.data as { risk: number; mutation: boolean }[]).every(t => t.risk === 0 && !t.mutation)).toBe(true);
    const av = (await db.rpc("agent_invoke_ext", { p_workspace: O, p_tool: "map.validate", p_args: { event_id: event } })).data as Validation & { link: string };
    expect(av.link).toBe(`/organizer/events/${event}/map`);
    expect((await db.rpc("agent_invoke_ext", { p_workspace: P, p_tool: "map.bindings", p_args: { event_id: event } })).error?.message).toMatch(/not_found/);
    expect((await orgC.rpc("agent_invoke_ext", { p_workspace: O, p_tool: "map.validate", p_args: { event_id: event } })).error).not.toBeNull();
  });
});
