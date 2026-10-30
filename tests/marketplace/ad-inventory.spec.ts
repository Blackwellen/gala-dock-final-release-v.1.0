import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, insertEventFixture } from "../phase1/helpers";
import { interleave, organicOnly, AD_DEST_RE, isBot } from "../../src/lib/ads/core";

// Q23 owned ad inventory (migration 202610291014): rotation, pacing, frequency caps, exhaustion, counter integrity, labelling,
// organic separation and attribution. API level with the service role (serve/view/click are service-only by design).
const db = admin as unknown as SupabaseClient;
const day = 864e5;
type Slot = { token: string; boost_id: string; slot: number; event_id: string | null };
const serve = async (placement: string, viewer: string, o: { seed?: string; now?: string; ctx?: Record<string, string>; exclude?: string[] } = {}) => {
  const r = await db.rpc("serve_ad_slots", { p_placement: placement, p_user: null, p_anon: viewer, p_ctx: o.ctx ?? {}, p_exclude: o.exclude ?? [], p_now: o.now ?? null, p_seed: o.seed ?? null });
  expect(r.error).toBeNull();
  return (r.data ?? []) as Slot[];
};
const vid = () => randomUUID().replaceAll("-", "");

test.describe("Q23 sponsored layer (unit)", () => {
  test("interleave keeps organic order and ranks, labels sponsored, never duplicates an organic subject", () => {
    const organic = Array.from({ length: 10 }, (_, i) => ({ id: `e${i + 1}` }));
    const sp = [{ subjectId: "x1" }, { subjectId: "e2" }, { subjectId: "x2" }, { subjectId: "x3" }];
    const feed = interleave(organic, sp, [4, 8]);
    expect(organicOnly(feed)).toEqual(organic);
    expect(feed.filter(f => f.kind === "organic").map(f => (f as { rank: number }).rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const spon = feed.flatMap((f, i) => f.kind === "sponsored" ? [{ i, s: f.slot.subjectId, label: f.label }] : []);
    expect(spon).toEqual([{ i: 4, s: "x1", label: "Sponsored" }, { i: 9, s: "x2", label: "Sponsored" }]);   // e2 is organic → dropped from the sponsored layer
    expect(interleave(organic.slice(0, 2), sp, [4, 8]).filter(f => f.kind === "sponsored")).toEqual([]);
    expect(AD_DEST_RE.test("/events/neon-nights")).toBe(true);
    expect(AD_DEST_RE.test("https://evil.example/x")).toBe(false);
    expect(isBot("Googlebot/2.1")).toBe(true); expect(isBot("Mozilla/5.0 (Windows NT 10.0) Chrome/130")).toBe(false);
  });

  test("labels and organic separation in the code: every sponsored render is labelled, ranking ignores sponsorship", () => {
    const src = path.resolve(__dirname, "../../src");
    const read = (p: string) => fs.readFileSync(path.join(src, p), "utf8");
    expect(read("components/ads/sponsored.tsx")).toMatch(/<SponsoredLabel \/>[\s\S]*<b>/);
    expect(read("components/ads/sponsored.tsx")).toMatch(/rel="sponsored nofollow"/);
    const discover = read("app/(customer)/discover/page.tsx");
    expect(discover).toMatch(/hero \? <>Featured Event <SponsoredLabel \/>/);
    expect(discover).not.toMatch(/events\.sort\(/);                          // organic results are never re-sorted by a boost
    expect(discover).not.toMatch(/record_boost_event/);                      // nothing counted on render
    expect(read("lib/actions/provider-search.ts")).not.toMatch(/sponsored \? 0\.3/);
  });
});

test.describe.configure({ mode: "serial" });
test.describe("Q23 serving, pacing and integrity (live DB)", () => {
  let owner: { id: string; email: string }, owner2: { id: string; email: string }, wsA: string, wsB: string;
  const ev: string[] = [];
  let A: string, B: string, C: string;
  const city = `q23city${Date.now()}`;
  const mkEvent = async (ws: string, ownerId: string, name: string) => {
    const { data, error } = await insertEventFixture({ owner_id: ownerId, workspace_id: ws, name, slug: `q23-${randomUUID().slice(0, 8)}`, visibility: "public", status: "on_sale",
      starts_at: new Date(Date.now() + 30 * day).toISOString(), ends_at: new Date(Date.now() + 30 * day + 4 * 36e5).toISOString(), city }, "ad-inventory").select("id").single();
    expect(error).toBeNull(); ev.push((data as { id: string }).id); return (data as { id: string }).id;
  };
  const mkBoost = async (ws: string, event: string, amount: number, o: { start?: number; end?: number; goal?: number; product?: string; placement?: string } = {}) => {
    const { data, error } = await db.from("promotion_boosts").insert({ workspace_id: ws, event_id: event, product_key: o.product ?? "featured_event_7d", placement: o.placement ?? "discover", amount_minor: amount,
      status: "active", targeting: { cities: [city] }, starts_at: new Date(Date.now() - (o.start ?? 1) * day).toISOString(), ends_at: new Date(Date.now() + (o.end ?? 6) * day).toISOString(), ...(o.goal ? { impression_goal: o.goal } : {}) }).select("id").single();
    expect(error).toBeNull(); return (data as { id: string }).id;
  };
  const ctx = () => ({ city });

  test.beforeAll(async () => {
    [owner, owner2] = await Promise.all([createUser("q23-a"), createUser("q23-b")]);
    wsA = await seedWorkspace(owner.id, "organizer", "Q23 Advertiser A");
    wsB = await seedWorkspace(owner2.id, "organizer", "Q23 Advertiser B");
  });
  test.afterAll(async () => { for (const e of ev) await db.from("events").delete().eq("id", e); for (const w of [wsA, wsB]) await db.from("workspaces").delete().eq("id", w); await cleanup(); });

  test("rotation is deterministic for a seed and weighted by daily budget; one campaign per advertiser per response", async () => {
    const eA = await mkEvent(wsA, owner.id, "Q23 Big Budget"), eB = await mkEvent(wsB, owner2.id, "Q23 Small Budget");
    A = await mkBoost(wsA, eA, 9000); B = await mkBoost(wsB, eB, 3000);
    const first = await serve("discover_hero", vid(), { seed: "fixed-seed-1", ctx: ctx() });
    const again = await serve("discover_hero", vid(), { seed: "fixed-seed-1", ctx: ctx() });
    expect(first.map(s => s.boost_id)).toEqual(again.map(s => s.boost_id));
    const wins = { [A]: 0, [B]: 0 } as Record<string, number>;
    for (let i = 0; i < 120; i++) { const s = await serve("discover_hero", vid(), { seed: `rot-${i}`, ctx: ctx() }); if (s[0]) wins[s[0].boost_id] = (wins[s[0].boost_id] ?? 0) + 1; }
    expect(wins[A]! + wins[B]!).toBe(120);
    expect(wins[A]!).toBeGreaterThan(wins[B]!);          // 3× the daily budget wins clearly more often…
    expect(wins[B]!).toBeGreaterThan(5);                 // …but the smaller advertiser is not starved
    // Capacity 2 placement with two advertisers → both, never the same advertiser twice.
    const C2 = await mkBoost(wsA, await mkEvent(wsA, owner.id, "Q23 Second A Campaign"), 9000);
    const feed = await serve("discover_feed", vid(), { seed: "cap", ctx: ctx() });
    expect(feed.length).toBe(2);
    const wsOf = async (id: string) => ((await db.from("promotion_boosts").select("workspace_id").eq("id", id).single()).data as { workspace_id: string }).workspace_id;
    expect(new Set(await Promise.all(feed.map(f => wsOf(f.boost_id)))).size).toBe(2);
    await db.from("promotion_boosts").update({ status: "cancelled" }).eq("id", C2);
    // Targeting: a different city context does not get these campaigns; untargeted ones would.
    expect((await serve("discover_hero", vid(), { ctx: { city: "elsewhere-q23" } })).filter(s => [A, B].includes(s.boost_id))).toEqual([]);
  });

  test("frequency cap per viewer per day", async () => {
    await db.from("promotion_boosts").update({ status: "cancelled" }).eq("id", B);
    const v = vid(); let shown = 0;
    for (let i = 0; i < 5; i++) shown += (await serve("discover_hero", v, { ctx: ctx() })).filter(s => s.boost_id === A).length;
    expect(shown).toBe(3);                                                       // discover_hero cap = 3/day
    expect((await serve("discover_hero", vid(), { ctx: ctx() })).some(s => s.boost_id === A)).toBe(true);   // other viewers unaffected
  });

  test("pacing: delivery is spread over the flight; budget exhaustion stops serving", async () => {
    const e = await mkEvent(wsB, owner2.id, "Q23 Paced");
    C = await mkBoost(wsB, e, 3000, { start: 1, end: 9, goal: 100 });           // 10-day flight, 1 day elapsed → ~10% + 1h allowed
    const { data: cand } = await db.rpc("ad_candidates", { p_placement: "discover_hero", p_ctx: ctx(), p_now: new Date().toISOString(), p_exclude: [] });
    const row = ((cand ?? []) as { boost_id: string; allowed: number }[]).find(r => r.boost_id === C)!;
    expect(Number(row.allowed)).toBe(Math.ceil(100 * (1 / 10 + 1 / 240)));
    await db.from("promotion_boosts").update({ delivered_impressions: Number(row.allowed) }).eq("id", C);
    for (let i = 0; i < 10; i++) expect((await serve("discover_hero", vid(), { ctx: ctx(), seed: `p${i}` })).some(s => s.boost_id === C)).toBe(false);   // ahead of pace: held back
    // Later in the flight the same campaign is eligible again (deterministic p_now).
    const later = new Date(Date.now() + 4 * day).toISOString();
    expect(((await db.rpc("ad_candidates", { p_placement: "discover_hero", p_ctx: ctx(), p_now: later, p_exclude: [] })).data as { boost_id: string; allowed: number; delivered: number }[])
      .find(r => r.boost_id === C)!.allowed).toBeGreaterThan(Number(row.allowed));
    await db.from("promotion_boosts").update({ delivered_impressions: 100 }).eq("id", C);
    expect(((await db.rpc("ad_candidates", { p_placement: "discover_hero", p_ctx: ctx(), p_now: later, p_exclude: [] })).data as { boost_id: string }[]).some(r => r.boost_id === C)).toBe(false);
  });

  test("impression and click integrity: single-use tokens bound to the viewer; legacy anon counter deduped", async () => {
    const v = vid();
    const s = (await serve("discover_hero", v, { ctx: ctx() })).find(x => x.boost_id === A)!;
    expect(s.token).toMatch(/^[0-9a-f]{36}$/);
    const before = ((await db.from("promotion_boosts").select("delivered_impressions,delivered_clicks").eq("id", A).single()).data as { delivered_impressions: number; delivered_clicks: number });
    const view = (t: string, viewer: string) => db.rpc("record_ad_view", { p_token: t, p_user: null, p_anon: viewer }).then(r => r.data);
    expect(await view(s.token, vid())).toBe(false);                               // someone else's token
    expect(await view("0".repeat(36), v)).toBe(false);                            // forged token
    expect(await view(s.token, v)).toBe(true);
    expect(await view(s.token, v)).toBe(false);                                   // replay
    const s2 = (await serve("discover_hero", v, { ctx: ctx() })).find(x => x.boost_id === A);
    if (s2) expect(await view(s2.token, v)).toBe(false);                          // same viewer × boost × placement within 30 min
    const click = (t: string, viewer: string) => db.rpc("record_ad_click", { p_token: t, p_user: null, p_anon: viewer }).then(r => r.data as { href: string; counted: boolean });
    expect(await click(s.token, vid())).toMatchObject({ counted: false });
    const c1 = await click(s.token, v); expect(c1.counted).toBe(true); expect(c1.href).toMatch(AD_DEST_RE);
    expect((await click(s.token, v)).counted).toBe(false);
    const after = ((await db.from("promotion_boosts").select("delivered_impressions,delivered_clicks,impressions").eq("id", A).single()).data as { delivered_impressions: number; delivered_clicks: number; impressions: number });
    expect(after.delivered_impressions - before.delivered_impressions).toBe(1);
    expect(after.delivered_clicks - before.delivered_clicks).toBe(1);
    // Client roles cannot call the serving/recording functions at all.
    const a = anon() as unknown as SupabaseClient;
    expect((await a.rpc("record_ad_view", { p_token: s.token, p_user: null, p_anon: v })).error).not.toBeNull();
    expect((await a.rpc("serve_ad_slots", { p_placement: "discover_hero", p_user: null, p_anon: v })).error).not.toBeNull();
    // Legacy anon counter (still called by the deployed page): 10 calls from one client count once.
    for (let i = 0; i < 10; i++) await a.rpc("record_boost_event", { p_boost: A, p_kind: "impression" });
    const legacy = ((await db.from("promotion_boosts").select("impressions,delivered_impressions").eq("id", A).single()).data as { impressions: number; delivered_impressions: number });
    expect(legacy.impressions - after.impressions).toBeLessThanOrEqual(1);
    expect(legacy.delivered_impressions).toBe(after.delivered_impressions);       // legacy calls never touch verified delivery
  });

  test("attribution reconciles to ticket orders and reverses on refund; undelivered budget becomes credit", async () => {
    const buyer = await createUser("q23-buyer");
    const { data: e } = await db.from("promotion_boosts").select("event_id").eq("id", A).single();
    const eventId = (e as { event_id: string }).event_id;
    const s = (await db.rpc("serve_ad_slots", { p_placement: "discover_hero", p_user: buyer.id, p_anon: null, p_ctx: ctx(), p_exclude: [] })).data as Slot[];
    const mine = s.find(x => x.boost_id === A)!;
    expect((await db.rpc("record_ad_click", { p_token: mine.token, p_user: buyer.id, p_anon: null })).data).toMatchObject({ counted: true });
    const ref = `Q23-${randomUUID().slice(0, 8)}`;
    expect((await db.from("checkout_orders").insert({ order_ref: ref, event_id: eventId, buyer_id: buyer.id, token: randomUUID(), amount: 42.5, fee: 2, currency: "GBP", status: "pending" })).error).toBeNull();
    const other = `Q23-${randomUUID().slice(0, 8)}`;                               // a buyer who never clicked: not attributed
    await db.from("checkout_orders").insert({ order_ref: other, event_id: eventId, buyer_id: owner2.id, token: randomUUID(), amount: 10, fee: 1, currency: "GBP", status: "pending" });
    await db.from("checkout_orders").update({ status: "issued" }).in("order_ref", [ref, other]);
    const rep = (await db.rpc("boost_report", { p_boost: A })).data as { conversions: number; attributed_revenue_minor: number; reconciled: { matches: boolean; orders: number; revenue_minor: number }; provenance: Record<string, string> };
    expect(rep.conversions).toBe(1); expect(Number(rep.attributed_revenue_minor)).toBe(4250);
    expect(rep.reconciled).toMatchObject({ matches: true, orders: 1, revenue_minor: 4250 });
    expect(Object.keys(rep.provenance)).toEqual(expect.arrayContaining(["impressions", "clicks", "attribution", "pacing", "credit"]));
    await db.from("checkout_orders").update({ status: "refunded", refund_status: "refunded" }).eq("order_ref", ref);
    const rep2 = (await db.rpc("boost_report", { p_boost: A })).data as { conversions: number; attributed_revenue_minor: number; reconciled: { matches: boolean } };
    expect(rep2.conversions).toBe(0); expect(Number(rep2.attributed_revenue_minor)).toBe(0); expect(rep2.reconciled.matches).toBe(true);
    // Members only: another tenant cannot read the report.
    const { signedIn } = await import("../phase1/helpers");
    const b = await signedIn(owner2.email) as unknown as SupabaseClient;
    expect((await b.rpc("boost_report", { p_boost: A })).error?.message).toMatch(/not_authorized/);
    // Settlement: ended flight with 1 of N delivered → credit for the undelivered share, exactly once.
    await db.from("promotion_boosts").update({ status: "ended" }).eq("id", A);
    await db.rpc("ad_settle_boosts"); await db.rpc("ad_settle_boosts");
    const { data: boost } = await db.from("promotion_boosts").select("amount_minor,impression_goal,delivered_impressions,undelivered_credit_minor,settled_at").eq("id", A).single();
    const bb = boost as { amount_minor: number; impression_goal: number; delivered_impressions: number; undelivered_credit_minor: number; settled_at: string };
    expect(bb.settled_at).toBeTruthy();
    expect(bb.undelivered_credit_minor).toBe(Math.floor(bb.amount_minor * (bb.impression_goal - bb.delivered_impressions) / bb.impression_goal));
    expect(((await db.from("ad_credit_ledger").select("id").eq("boost_id", A)).data ?? []).length).toBe(1);
    await db.from("checkout_orders").delete().in("order_ref", [ref, other]);
  });
});
