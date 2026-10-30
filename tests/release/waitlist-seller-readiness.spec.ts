import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// 202610293036: notify_waitlists() follows the checkout rule — while the seller's Stripe account is not ready and any tier is paid,
// nobody on the waitlist is offered (or notified, or has stock held); once the seller is ready the next waiter is offered.
// Free-only events are offered regardless. API level, disposable identities, no Stripe calls (connect row written as the webhook would).
type Db = SupabaseClient;
type Id = { id: string };
const db = admin as unknown as Db;
const rpc = <T = unknown>(c: Db, fn: string, args: Record<string, unknown>) => c.rpc(fn, args) as unknown as Promise<{ data: T; error: { message: string } | null }>;

test.describe.configure({ mode: "serial" });

test.describe("waitlist offers respect seller payment readiness", () => {
  let owner: { id: string; email: string }, fan: { id: string; email: string }, fanC: Db, ws: string;
  const events: string[] = [];
  const event = async (name: string, price: number) => {
    const ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name, visibility: "public", status: "on_sale",
      starts_at: new Date(Date.now() + 6 * 864e5).toISOString() }, "waitlist-seller-readiness").select("id").single()).data as Id).id;
    events.push(ev);
    const tier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "GA", price, quantity: 5, status: "on_sale" }).select("id").single()).data as Id).id;
    return { ev, tier };
  };
  const waiter = async (ev: string, tier: string) => {
    const w = await rpc<string>(fanC, "join_waitlist", { p_event: ev, p_tier: tier, p_qty: 1 });
    expect(w.error).toBeNull();
    return w.data;
  };
  const state = async (w: string) => (await db.from("ticket_waitlist").select("status").eq("id", w).single()).data as { status: string };
  const held = async (tier: string) => ((await db.from("ticket_tiers").select("held").eq("id", tier).single()).data as { held: number }).held;
  const notified = async (w: string) => ((await db.from("notifications").select("id").eq("user_id", fan.id).eq("kind", "ticket_waitlist").like("link", `%waitlist_offer=${w}`)).data ?? []).length;

  test.beforeAll(async () => {
    [owner, fan] = await Promise.all(["wsr-o", "wsr-f"].map(l => createUser(l)));
    ws = await seedWorkspace(owner.id, "organizer", "Waitlist Readiness Events");
    fanC = (await signedIn(fan.email)) as unknown as Db;
  });
  test.afterAll(async () => {
    if (events.length) { await db.from("ticket_waitlist").delete().in("event_id", events); await db.from("events").delete().in("id", events); }
    await db.from("notifications").delete().eq("user_id", fan.id);
    await db.from("connect_accounts").delete().eq("workspace_id", ws);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("seller not ready + paid tier: no offer, no notification, no hold; ready: offered", async () => {
    const { ev, tier } = await event("WSR Paid Night", 25);
    expect((await rpc<string>(db, "event_payment_readiness", { p_event: ev })).data).toBe("seller_not_ready");
    const w = await waiter(ev, tier);
    await rpc(db, "notify_waitlists", {});
    expect((await state(w)).status).toBe("waiting");
    expect(await notified(w)).toBe(0);
    expect(await held(tier)).toBe(0);

    expect((await db.from("connect_accounts").insert({ workspace_id: ws, stripe_account_id: `acct_test_wsr${randomBytes(4).toString("hex")}`, account_type: "standard", charges_enabled: true,
      payouts_enabled: true, details_submitted: true, card_payments_capability: "active", transfers_capability: "active", verification_state: "verified" })).error).toBeNull();
    expect((await rpc<string>(db, "event_payment_readiness", { p_event: ev })).data).toBe("ready");
    await rpc(db, "notify_waitlists", {});
    expect((await state(w)).status).toBe("offered");
    expect(await notified(w)).toBe(1);
    expect(await held(tier)).toBe(1);
    await db.from("connect_accounts").delete().eq("workspace_id", ws);
  });

  test("seller not ready + free-only event: offered (checkout takes free orders without Stripe)", async () => {
    const { ev, tier } = await event("WSR Free Night", 0);
    expect((await rpc<string>(db, "event_payment_readiness", { p_event: ev })).data).toBe("seller_not_ready");
    const w = await waiter(ev, tier);
    await rpc(db, "notify_waitlists", {});
    expect((await state(w)).status).toBe("offered");
  });

  test("client roles cannot run notify_waitlists", async () => {
    expect((await rpc(fanC, "notify_waitlists", {})).error).not.toBeNull();
  });
});
