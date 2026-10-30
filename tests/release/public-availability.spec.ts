import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Lane D public free/busy calendar (migrations 202610294080 + 202610294082): public_listing_availability(listing, from, to, space?).
// Disposable provider workspace (is_test_fixture, purgeable) with an opted-in venue (two linked spaces + one unrelated space) and an
// opted-in service (per_day = 1). Anon and an outsider get day statuses only; opt-out / missing flag / unpublished / paused return null;
// the 120-day cap and today floor hold; a confirmed booking or a block flips a day to booked.

type Db = SupabaseClient;
const db = admin as unknown as Db;
const RPC = "public_listing_availability";
const london = (add = 0) => { const t = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }) + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + add); return t.toISOString().slice(0, 10); };
// A Wednesday 5–6 weeks out, so the fixture days are open on every rule.
const wed = (() => { for (let i = 35; i < 45; i++) if (new Date(`${london(i)}T12:00:00Z`).getUTCDay() === 3) return i; return 38; })();
const D = london(wed), D2 = london(wed + 1), D3 = london(wed + 7);
const at = (day: string, hh: string) => new Date(`${day}T${hh}:00Z`).toISOString();   // UTC; London is UTC+0 in Dec/Jan, within an hour otherwise
const SECRETS = ["PAV Secret Client", "pav-client@example.com", "PAV Secret Party", "8080.08", "PAV-REF", "PAV block reason"];
type Avail = { from: string; to: string; timezone: string; days: { date: string; status: string }[]; spaces: { id: string; name: string }[] };
const status = (a: Avail | null, d: string) => a?.days.find(x => x.date === d)?.status;

test.describe.configure({ mode: "serial" });

test.describe("public_listing_availability (202610294080 / 4082)", () => {
  let W = ""; let venue = ""; let service = ""; let hall = ""; let suite = ""; let studio = ""; let out: Db;
  const jobs: string[] = []; const blocks: string[] = [];

  test.beforeAll(async () => {
    const [O, X] = await Promise.all([createUser("pav-prov"), createUser("pav-out")]);
    W = await seedWorkspace(O.id, "provider", "PAV Public Availability");
    await db.from("workspaces").update({ capabilities: ["venue", "service"] }).eq("id", W);
    out = await signedIn(X.email) as unknown as Db;
    const v = await db.from("listings").insert({ workspace_id: W, name: "PAV Venue", kind: "venue", category: "Venue", slug: `pav-venue-${Date.now()}`, published: true,
      details: { public_availability: true, hours: { mon: ["09:00", "23:00"], tue: ["09:00", "23:00"], wed: ["09:00", "23:00"], thu: ["09:00", "23:00"], fri: ["09:00", "23:00"], sat: ["09:00", "23:00"], sun: null } } }).select("id").single();
    expect(v.error).toBeNull(); venue = (v.data as { id: string }).id;
    const s = await db.from("listings").insert({ workspace_id: W, name: "PAV Service", kind: "service", category: "DJ", slug: `pav-service-${Date.now()}`, published: true,
      details: { public_availability: true, service: { capacity: { per_day: 1 }, availability: { week: { mon: ["09:00", "23:00"], tue: ["09:00", "23:00"], wed: ["09:00", "23:00"], thu: ["09:00", "23:00"], fri: ["09:00", "23:00"], sat: ["09:00", "23:00"], sun: null } } } } }).select("id").single();
    expect(s.error).toBeNull(); service = (s.data as { id: string }).id;
    const sp = await db.from("spaces").insert([{ workspace_id: W, venue_id: venue, name: "PAV Hall", status: "published" }, { workspace_id: W, venue_id: venue, name: "PAV Suite", status: "published" },
      { workspace_id: W, venue_id: venue, name: "PAV Studio", status: "published" }]).select("id,name");
    expect(sp.error).toBeNull();
    const byName = new Map(((sp.data ?? []) as { id: string; name: string }[]).map(r => [r.name, r.id]));
    hall = byName.get("PAV Hall")!; suite = byName.get("PAV Suite")!; studio = byName.get("PAV Studio")!;
    expect((await db.from("space_links").insert({ workspace_id: W, space_a: hall < suite ? hall : suite, space_b: hall < suite ? suite : hall, kind: "linked" })).error).toBeNull();   // space_links_check: a < b
  });

  test.afterAll(async () => {
    if (jobs.length) await db.from("provider_jobs").delete().in("id", jobs);
    if (blocks.length) await db.from("availability_blocks").delete().in("id", blocks);
    if (W) {
      await db.from("space_links").delete().eq("workspace_id", W);
      await db.from("spaces").delete().eq("workspace_id", W);
      await db.from("listings").delete().eq("workspace_id", W);
      await db.from("workspaces").delete().eq("id", W);
    }
    await cleanup();
  });

  const call = async (client: Db, listing: string, from: string, to: string, space?: string) => {
    const r = await client.rpc(RPC, { p_listing: listing, p_from: from, p_to: to, ...(space ? { p_space: space } : {}) });
    expect(r.error).toBeNull();
    return r.data as Avail | null;
  };

  test("anon gets day statuses only (date + status), plus published space ids and names", async () => {
    const a = await call(anon() as unknown as Db, venue, london(), london(30));
    expect(a).not.toBeNull();
    expect(Object.keys(a!).sort()).toEqual(["days", "from", "spaces", "timezone", "to"]);
    expect(a!.timezone).toBe("Europe/London");
    expect(a!.days).toHaveLength(31);
    for (const d of a!.days) { expect(Object.keys(d).sort()).toEqual(["date", "status"]); expect(["free", "limited", "booked", "closed"]).toContain(d.status); }
    expect(a!.spaces.map(s => s.name).sort()).toEqual(["PAV Hall", "PAV Studio", "PAV Suite"]);
    for (const s of a!.spaces) expect(Object.keys(s).sort()).toEqual(["id", "name"]);
    // Sundays are closed by the opening hours.
    for (const d of a!.days) if (new Date(`${d.date}T12:00:00Z`).getUTCDay() === 0) expect(d.status).toBe("closed");
  });

  test("a confirmed booking or a block flips a day to booked; private fields never leak", async () => {
    expect(status(await call(anon() as unknown as Db, service, D, D), D)).toBe("free");
    const j = await db.from("provider_jobs").insert({ reference: `PAV-REF-${Date.now()}`, workspace_id: W, listing_id: service, mode: "service", client_name: "PAV Secret Client", client_email: "pav-client@example.com",
      event_name: "PAV Secret Party", starts_at: at(D, "18:00"), ends_at: at(D, "23:00"), status: "confirmed", value: 8080.08 }).select("id").single();
    expect(j.error).toBeNull(); jobs.push((j.data as { id: string }).id);
    const s = await call(anon() as unknown as Db, service, D, D3);
    expect(status(s, D)).toBe("booked");
    expect(status(s, D3)).toBe("free");

    expect(status(await call(anon() as unknown as Db, venue, D2, D2), D2)).toBe("free");
    const b = await db.from("availability_blocks").insert({ workspace_id: W, space_id: hall, kind: "blocked", starts_at: at(D2, "00:00"), ends_at: at(D2, "23:59"), note: "PAV block reason" }).select("id").single();
    expect(b.error).toBeNull(); blocks.push((b.data as { id: string }).id);
    expect(status(await call(anon() as unknown as Db, venue, D2, D2), D2)).toBe("limited");            // one of three spaces busy
    expect(status(await call(anon() as unknown as Db, venue, D2, D2, hall), D2)).toBe("booked");
    expect(status(await call(anon() as unknown as Db, venue, D2, D2, suite), D2)).toBe("booked");      // linked to the hall
    expect(status(await call(anon() as unknown as Db, venue, D2, D2, studio), D2)).toBe("free");
    const whole = await db.from("availability_blocks").insert({ workspace_id: W, listing_id: venue, kind: "blocked", starts_at: at(D3, "00:00"), ends_at: at(D3, "23:59"), note: "PAV block reason" }).select("id").single();
    expect(whole.error).toBeNull(); blocks.push((whole.data as { id: string }).id);
    expect(status(await call(anon() as unknown as Db, venue, D3, D3), D3)).toBe("booked");

    const text = JSON.stringify([await call(anon() as unknown as Db, service, london(), london(119)), await call(anon() as unknown as Db, venue, london(), london(119)), await call(out, venue, london(), london(119), hall)]);
    for (const x of SECRETS) expect(text).not.toContain(x);
    expect(text).not.toMatch(/"(client_[a-z]+|event_name|value|amount|currency|reference|note|reason|starts_at|ends_at|booking_id|build_item_id|workspace_id)"/);
  });

  test("an outsider gets exactly what anon gets", async () => {
    const [a, o] = [await call(anon() as unknown as Db, venue, london(), london(60)), await call(out, venue, london(), london(60))];
    expect(o).toEqual(a);
  });

  test("range is capped at 120 days and never starts before today", async () => {
    const a = await call(anon() as unknown as Db, venue, london(-45), london(400));
    expect(a!.from).toBe(london());
    expect(a!.days).toHaveLength(120);
    expect(a!.days[0]!.date).toBe(london());
    expect(a!.days.every(d => d.date >= london())).toBe(true);
    const past = await call(anon() as unknown as Db, venue, london(-30), london(-5));
    expect(past!.days).toEqual([]);
  });

  test("opt-out, missing flag, unpublished, paused, unknown listing and a foreign space return null", async () => {
    const A = anon() as unknown as Db;
    const { data: other } = await db.from("spaces").select("id").neq("workspace_id", W).eq("status", "published").limit(1).maybeSingle();
    if (other) expect(await call(A, venue, london(), london(5), (other as { id: string }).id)).toBeNull();
    expect(await call(A, service, london(), london(5), hall)).toBeNull();
    expect(await call(A, "00000000-0000-4000-8000-000000000000", london(), london(5))).toBeNull();
    const set = async (patch: Record<string, unknown>) => expect((await db.from("listings").update(patch).eq("id", venue)).error).toBeNull();
    const { data: row } = await db.from("listings").select("details").eq("id", venue).single();
    const details = (row as { details: Record<string, unknown> }).details;
    try {
      await set({ details: { ...details, public_availability: false } });
      expect(await call(A, venue, london(), london(5))).toBeNull();
      expect(await call(out, venue, london(), london(5))).toBeNull();
      const { public_availability: _drop, ...rest } = details; void _drop;
      await set({ details: rest });
      expect(await call(A, venue, london(), london(5))).toBeNull();
      await set({ details, paused_at: new Date().toISOString() });
      expect(await call(A, venue, london(), london(5))).toBeNull();
      await set({ paused_at: null, published: false });
      expect(await call(A, venue, london(), london(5))).toBeNull();
      expect(await call(out, venue, london(), london(5))).toBeNull();
    } finally { await set({ details, paused_at: null, published: true }); }
    expect(await call(A, venue, london(), london(5))).not.toBeNull();
  });
});
