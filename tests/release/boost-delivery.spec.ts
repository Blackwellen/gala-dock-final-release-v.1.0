import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, BASE, insertEventFixture } from "../phase1/helpers";

// Paid placement delivery (legacy path): the retired anonymous boost RPCs stay closed to client roles, and the legacy click redirect
// can't be used as an open redirect. Serving, pacing and integrity of sponsored slots: tests/marketplace/ad-inventory.spec.ts.
const db = admin as unknown as SupabaseClient;

test.describe("boost delivery and analytics", () => {
  let owner: { id: string; email: string }, ws: string, ev: string, boost: string;
  test.beforeAll(async () => {
    owner = await createUser("boost-dl");
    ws = await seedWorkspace(owner.id, "organizer", "Boost Delivery Org");
    ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, name: "Sponsored Night", slug: `sponsored-night-${Date.now()}`, status: "on_sale", visibility: "public", starts_at: new Date(Date.now() + 20 * 864e5).toISOString() }, "boost-delivery").select("id").single()).data as { id: string }).id;
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    boost = (await c.rpc("create_promotion_boost", { p_event: ev, p_product: "featured_event_7d", p_targeting: { cities: ["London"], categories: [] } })).data as string;
    const po = (await c.rpc("create_boost_payment_order", { p_boost: boost })).data as { reference: string; amount_minor: number };
    expect((await db.rpc("payment_order_succeeded", { p_ref: po.reference, p_pi: `pi_test_dl_${Date.now()}`, p_charge: `ch_test_dl_${Date.now()}`, p_amount_minor: po.amount_minor, p_livemode: false })).error).toBeNull();
  });
  test.afterAll(async () => {
    await db.from("promotion_boosts").delete().eq("workspace_id", ws);
    await db.from("events").update({ status: "completed" }).eq("id", ev);
    await cleanup();
  });

  // Q75 (202611150002): the legacy anonymous active_boosts / record_boost_event RPCs are retired (sponsored slots are served through
  // serve_ad_slots / record_ad_view / record_ad_click, server-only). Client roles can no longer call them.
  test("legacy boost RPCs are not callable by client roles", async () => {
    const a = anon() as unknown as SupabaseClient;
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    for (const cl of [a, c]) {
      expect((await cl.rpc("active_boosts", { p_placement: "discover", p_city: null, p_limit: 12 })).error).not.toBeNull();
      expect((await cl.rpc("record_boost_event", { p_boost: boost, p_kind: "impression" })).error).not.toBeNull();
    }
  });

  test("legacy click route only redirects to event pages", async ({ request }) => {
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
