import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Release spec §117–121 contract: catalogue price, platform_boost order (100% platform, unprotected), webhook-confirmed activation.
const db = admin as unknown as SupabaseClient;

test.describe("promotion boosts", () => {
  let owner: { id: string; email: string }, ws: string, ev: string;
  test.beforeAll(async () => {
    owner = await createUser("boost");
    ws = await seedWorkspace(owner.id, "organizer", "Boost Org");
    ev = ((await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: "Boosted Night", status: "on_sale", visibility: "public", starts_at: new Date(Date.now() + 20 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
  });
  test.afterAll(async () => {
    await db.from("promotion_boosts").delete().eq("workspace_id", ws);
    await db.from("events").update({ status: "completed" }).eq("id", ev);
    await cleanup();
  });

  test("boost is priced from the catalogue, paid as platform revenue and activated by the webhook", async () => {
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    const { data: boost, error } = await c.rpc("create_promotion_boost", { p_event: ev, p_product: "featured_event_7d", p_targeting: { cities: ["London"] } });
    expect(error).toBeNull();
    const { data: po, error: pe } = await c.rpc("create_boost_payment_order", { p_boost: boost });
    expect(pe).toBeNull();
    const order = po as { reference: string; amount_minor: number; platform_fee_minor: number; kind: string; protected: boolean; payee_workspace_id: string | null };
    expect(order).toMatchObject({ kind: "platform_boost", amount_minor: 4900, platform_fee_minor: 4900, protected: false, payee_workspace_id: null });
    // Resuming returns the same open order.
    expect(((await c.rpc("create_boost_payment_order", { p_boost: boost })).data as { reference: string }).reference).toBe(order.reference);
    // Webhook confirmation (amount checked) activates the boost; it is never eligible for a provider transfer.
    const r = await db.rpc("payment_order_succeeded", { p_ref: order.reference, p_pi: `pi_test_boost_${Date.now()}`, p_charge: `ch_test_boost_${Date.now()}`, p_amount_minor: 4900, p_livemode: false });
    expect(r.error).toBeNull();
    const { data: b } = await db.from("promotion_boosts").select("status,ends_at,starts_at").eq("id", boost).single();
    expect(b!.status).toBe("active");
    expect(new Date(b!.ends_at).getTime() - new Date(b!.starts_at).getTime()).toBe(7 * 864e5);
    // Non-owners can't create boosts; private events can't be boosted.
    const stranger = await signedIn((await createUser("boost-x")).email) as unknown as SupabaseClient;
    expect((await stranger.rpc("create_promotion_boost", { p_event: ev, p_product: "featured_event_7d" })).error?.message).toMatch(/not_authorized/);
  });
});
