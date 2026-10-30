import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, BASE, insertEventFixture } from "../phase1/helpers";

// Paid placement delivery: only active, in-window boosts on public live events are served (with optional city/category
// targeting), counters only move for active boosts, and the click redirect can't be used as an open redirect.
const db = admin as unknown as SupabaseClient;

test.describe("boost delivery and analytics", () => {
  let owner: { id: string; email: string }, ws: string, ev: string, boost: string, pending: string;
  test.beforeAll(async () => {
    owner = await createUser("boost-dl");
    ws = await seedWorkspace(owner.id, "organizer", "Boost Delivery Org");
    ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, name: "Sponsored Night", slug: `sponsored-night-${Date.now()}`, status: "on_sale", visibility: "public", starts_at: new Date(Date.now() + 20 * 864e5).toISOString() }, "boost-delivery").select("id").single()).data as { id: string }).id;
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    boost = (await c.rpc("create_promotion_boost", { p_event: ev, p_product: "featured_event_7d", p_targeting: { cities: ["London"], categories: [] } })).data as string;
    const po = (await c.rpc("create_boost_payment_order", { p_boost: boost })).data as { reference: string; amount_minor: number };
    expect((await db.rpc("payment_order_succeeded", { p_ref: po.reference, p_pi: `pi_test_dl_${Date.now()}`, p_charge: `ch_test_dl_${Date.now()}`, p_amount_minor: po.amount_minor, p_livemode: false })).error).toBeNull();
    pending = (await c.rpc("create_promotion_boost", { p_event: ev, p_product: "featured_event_7d" })).data as string; // never paid
  });
  test.afterAll(async () => {
    await db.from("promotion_boosts").delete().eq("workspace_id", ws);
    await db.from("events").update({ status: "completed" }).eq("id", ev);
    await cleanup();
  });

  test("active boosts are served to anonymous visitors, respecting targeting", async () => {
    const a = anon() as unknown as SupabaseClient;
    const ids = async (city: string | null) => (((await a.rpc("active_boosts", { p_placement: "discover", p_city: city, p_limit: 12 })).data ?? []) as { boost_id: string }[]).map(r => r.boost_id);
    expect(await ids(null)).toContain(boost);
    expect(await ids("london")).toContain(boost);
    expect(await ids("Manchester")).not.toContain(boost);
    expect(await ids(null)).not.toContain(pending);
  });

  test("impressions and clicks count for active boosts only", async () => {
    const a = anon() as unknown as SupabaseClient;
    const before = (await db.from("promotion_boosts").select("impressions,clicks").eq("id", boost).single()).data!;
    expect((await a.rpc("record_boost_event", { p_boost: boost, p_kind: "impression" })).error).toBeNull();
    expect((await a.rpc("record_boost_event", { p_boost: boost, p_kind: "click" })).error).toBeNull();
    expect((await a.rpc("record_boost_event", { p_boost: boost, p_kind: "bogus" })).error?.message).toMatch(/invalid_kind/);
    await a.rpc("record_boost_event", { p_boost: pending, p_kind: "impression" });
    const after = (await db.from("promotion_boosts").select("impressions,clicks").eq("id", boost).single()).data!;
    expect(after.impressions).toBe(before.impressions + 1);
    expect(after.clicks).toBe(before.clicks + 1);
    expect((await db.from("promotion_boosts").select("impressions").eq("id", pending).single()).data!.impressions).toBe(0);
  });

  test("click route records and only redirects to event pages", async ({ request }) => {
    const ok = await request.get(`${BASE}/api/boosts/${boost}/click?to=/events/sponsored-night`, { maxRedirects: 0 });
    expect(ok.status()).toBe(302);
    expect(new URL(ok.headers()["location"]!).pathname).toBe("/events/sponsored-night");
    for (const to of ["https://evil.example/x", "//evil.example", "/events/../admin", "/admin"]) {
      const r = await request.get(`${BASE}/api/boosts/${boost}/click?to=${encodeURIComponent(to)}`, { maxRedirects: 0 });
      const loc = new URL(r.headers()["location"]!);
      expect(loc.host).toBe(new URL(BASE).host);
      expect(loc.pathname).toBe("/discover");
    }
  });
});
