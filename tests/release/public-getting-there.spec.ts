import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture, updateEventFixture } from "../phase1/helpers";

// Lane D public "Getting there" (migration 202610294081): event_getting_there_save (managers) + public_event_getting_there (anon).
// Disposable organiser workspace (is_test_fixture) with a public on-sale event carrying public and private logistics: a general car
// park and a staff lot, a public shuttle and a talent transfer with private details, permits and a loading window. Only what the
// organiser marked public — with safe fields only — is returned; private / draft events return null; outsiders can't save.

type Db = SupabaseClient;
const db = admin as unknown as Db;
const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const SECRETS = ["GTX gate code 4471", "GTX crew route", "GTX Permit Holder", "GT71XYZ", "GTX Coach AB12", "GTX driver Dave", "07700 900471", "+44 7700 904471", "GTX Passenger", "GTX Talent Hotel", "GTX Loading"];
const PRIVATE_KEYS = /"(access_route|vehicle_[a-z_]+|passengers|passenger_names|contact_phone|flight_number|party_id|crew_id|capacity|code|holder_[a-z]+|status|public_page|public_info|workspace_id|event_id|id)"/;
type GT = { notes: Record<string, string>; parking: Record<string, unknown>[]; shuttles: Record<string, unknown>[] };

test.describe.configure({ mode: "serial" });

test.describe("public_event_getting_there (202610294081)", () => {
  let W = "", ownerId = ""; let owner: Db; let out: Db;
  let pub = "", priv = "", draft = "", gen = "", staff = "", shuttle = "", talent = "";
  const events: string[] = [];
  const mkEvent = async (name: string, visibility: string, status: string) => {
    const r = await insertEventFixture({ workspace_id: W, owner_id: ownerId, management: "professional", name, visibility, status, event_type: "concert", starts_at: iso(40), ends_at: iso(40.2), venue_name: "GTX Arena", location: "London" }, "public_getting_there spec").select("id").single();
    expect(r.error).toBeNull(); const id = (r.data as { id: string }).id; events.push(id); return id;
  };

  test.beforeAll(async () => {
    const [O, X] = await Promise.all([createUser("gtx-org"), createUser("gtx-out")]);
    ownerId = O.id;
    W = await seedWorkspace(O.id, "organizer", "GTX Getting There");
    owner = await signedIn(O.email) as unknown as Db;
    out = await signedIn(X.email) as unknown as Db;
    pub = await mkEvent("GTX Public", "public", "on_sale");
    priv = await mkEvent("GTX Private", "private", "on_sale");
    draft = await mkEvent("GTX Draft", "public", "draft");
    const a = await db.from("parking_areas").insert([
      { event_id: pub, workspace_id: W, name: "GTX Car Park", kind: "general", capacity: 120, accessible_spaces: 8, access_route: "GTX gate code 4471", opens_at: iso(39.9), closes_at: iso(40.3) },
      { event_id: pub, workspace_id: W, name: "GTX Staff Lot", kind: "staff", capacity: 20, accessible_spaces: 0, access_route: "GTX crew route" }]).select("id,name");
    expect(a.error).toBeNull();
    for (const r of (a.data ?? []) as { id: string; name: string }[]) if (r.name === "GTX Car Park") gen = r.id; else staff = r.id;
    expect((await db.from("parking_permits").insert({ area_id: gen, event_id: pub, holder_kind: "staff", holder_name: "GTX Permit Holder", vehicle_reg: "GT71XYZ", code: "GTX4471", status: "issued", valid_from: iso(39.9), valid_to: iso(40) })).error).toBeNull();
    const m = await db.from("transport_movements").insert([
      { event_id: pub, workspace_id: W, kind: "shuttle", passengers: 40, from_place: "Stratford Station", to_place: "GTX Arena", pickup_point: "Bus stop C", departs_at: iso(40), arrives_at: iso(40.02), vehicle_label: "GTX Coach AB12", notes: "GTX driver Dave 07700 900471", status: "planned" },
      { event_id: pub, workspace_id: W, kind: "talent", passengers: 2, from_place: "GTX Talent Hotel", to_place: "Backstage", pickup_point: "", vehicle_label: "", notes: "", departs_at: iso(39.95), arrives_at: iso(39.97), status: "planned" }]).select("id,kind");
    expect(m.error).toBeNull();
    for (const r of (m.data ?? []) as { id: string; kind: string }[]) if (r.kind === "shuttle") shuttle = r.id; else talent = r.id;
    expect((await db.from("transport_private").insert({ movement_id: shuttle, event_id: pub, passenger_names: "GTX Passenger", contact_phone: "+44 7700 904471" })).error).toBeNull();
    expect((await db.from("logistics_windows").insert({ event_id: pub, workspace_id: W, kind: "delivery", supplier_name: "GTX Loading", starts_at: iso(39.8), ends_at: iso(39.85), busy_until: iso(39.85), status: "confirmed" })).error).toBeNull();
  });

  test.afterAll(async () => {
    for (const ev of events) {
      for (const t of ["parking_permits", "transport_private", "logistics_windows"]) await db.from(t).delete().eq("event_id", ev);
      for (const t of ["parking_areas", "transport_movements", "event_getting_there"]) await db.from(t).delete().eq("event_id", ev);
      await db.from("events").delete().eq("id", ev);
    }
    if (W) await db.from("workspaces").delete().eq("id", W);
    await cleanup();
  });

  test("nothing is public until the organiser publishes it", async () => {
    const { data, error } = await (anon() as unknown as Db).rpc("public_event_getting_there", { p_event: pub });
    expect(error).toBeNull();
    expect(data).toEqual({ notes: {}, parking: [], shuttles: [] });
  });

  test("organiser saves notes + public items; private kinds are refused", async () => {
    const save = (p: Record<string, unknown>) => owner.rpc("event_getting_there_save", { p_event: pub, p });
    const ok = await save({ public: true, transit: "Stratford (Elizabeth line) — 8 min walk", dropoff: "Gate 2 lay-by", accessible: "Blue badge bays by Gate 1", cycle: "", parking_ids: [gen], shuttle_ids: [shuttle] });
    expect(ok.error).toBeNull();
    expect(ok.data).toMatchObject({ public: true, notes: 3, parking: 1, shuttles: 1 });
    expect((await save({ parking_ids: [staff] })).error?.message).toBe("parking_not_public");
    expect((await save({ shuttle_ids: [talent] })).error?.message).toBe("transport_not_public");
    expect((await save({ transit: "x".repeat(501) })).error?.message).toBe("note_too_long");
    expect((await out.rpc("event_getting_there_save", { p_event: pub, p: { public: true } })).error).not.toBeNull();
  });

  test("anon sees public items with safe fields only — private ones are never returned", async () => {
    const { data, error } = await (anon() as unknown as Db).rpc("public_event_getting_there", { p_event: pub });
    expect(error).toBeNull();
    const g = data as GT;
    expect(Object.keys(g).sort()).toEqual(["notes", "parking", "shuttles"]);
    expect(g.notes).toEqual({ transit: "Stratford (Elizabeth line) — 8 min walk", dropoff: "Gate 2 lay-by", accessible: "Blue badge bays by Gate 1" });
    expect(g.parking).toHaveLength(1);
    expect(g.parking[0]).toMatchObject({ name: "GTX Car Park", kind: "general", accessible_spaces: 8 });
    expect(Object.keys(g.parking[0]!).sort()).toEqual(["accessible_spaces", "closes_at", "kind", "name", "opens_at"]);
    expect(g.shuttles).toHaveLength(1);
    expect(g.shuttles[0]).toMatchObject({ from: "Stratford Station", to: "GTX Arena", pickup: "Bus stop C" });
    expect(Object.keys(g.shuttles[0]!).sort()).toEqual(["arrives_at", "departs_at", "from", "pickup", "to"]);
    const text = JSON.stringify(g);
    for (const s of SECRETS) expect(text).not.toContain(s);
    expect(text).not.toContain("GTX Staff Lot");
    expect(text).not.toMatch(PRIVATE_KEYS);
    // An outsider gets the same, never more.
    expect((await out.rpc("public_event_getting_there", { p_event: pub })).data).toEqual(g);
  });

  test("notes switched off, closed areas and cancelled shuttles disappear", async () => {
    expect((await owner.rpc("event_getting_there_save", { p_event: pub, p: { public: false, transit: "Stratford (Elizabeth line) — 8 min walk" } })).error).toBeNull();
    let g = (await (anon() as unknown as Db).rpc("public_event_getting_there", { p_event: pub })).data as GT;
    expect(g.notes).toEqual({});
    // 202610294083: draft notes are not readable through REST — not in events.settings, and the notes table is closed to anon/outsiders.
    for (const client of [anon() as unknown as Db, out]) {
      const ev = await client.from("events").select("settings").eq("id", pub).single();
      expect(ev.error).toBeNull();
      expect(JSON.stringify(ev.data)).not.toContain("Elizabeth line");
      expect((ev.data as { settings: Record<string, unknown> | null }).settings ?? {}).not.toHaveProperty("getting_there");
    }
    const anonTable = await (anon() as unknown as Db).from("event_getting_there").select("*").eq("event_id", pub);
    expect(anonTable.error !== null || (anonTable.data ?? []).length === 0).toBe(true);
    expect((await out.from("event_getting_there").select("*").eq("event_id", pub)).data ?? []).toEqual([]);
    const mine = await owner.from("event_getting_there").select("public,notes").eq("event_id", pub).single();
    expect(mine.data).toMatchObject({ public: false, notes: { transit: "Stratford (Elizabeth line) — 8 min walk" } });
    expect(g.parking).toHaveLength(1);   // item flags are independent of the notes switch
    await db.from("parking_areas").update({ status: "closed" }).eq("id", gen);
    await db.from("transport_movements").update({ status: "cancelled" }).eq("id", shuttle);
    g = (await (anon() as unknown as Db).rpc("public_event_getting_there", { p_event: pub })).data as GT;
    expect(g).toEqual({ notes: {}, parking: [], shuttles: [] });
  });

  test("private and draft events return null to anon and outsiders", async () => {
    expect((await updateEventFixture([priv, draft], { settings: { getting_there: { public: true, transit: "GTX hidden" } } }, "public_getting_there spec")).error).toBeNull();
    for (const client of [anon() as unknown as Db, out]) for (const ev of [priv, draft]) {
      const { data, error } = await client.rpc("public_event_getting_there", { p_event: ev });
      expect(error).toBeNull(); expect(data).toBeNull();
    }
  });
});
