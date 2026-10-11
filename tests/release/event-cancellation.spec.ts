import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Cancellation & Refund Policy §2: organiser cancellation voids tickets, queues full refunds (incl. fees), tells buyers;
// no path can cancel an event with paid orders without queuing refunds. Uses a fake Stripe session: no money moves.
const db = admin as unknown as SupabaseClient;

test.describe("event cancellation refunds", () => {
  let owner: { id: string; email: string }, buyer: { id: string; email: string }, ws: string;
  test.beforeAll(async () => {
    [owner, buyer] = await Promise.all([createUser("cx-o"), createUser("cx-b")]);
    ws = await seedWorkspace(owner.id, "organizer", "Cancel Org");
  });
  test.afterAll(async () => {
    const { data: evs } = await db.from("events").select("id").eq("workspace_id", ws);
    const ids = (evs ?? []).map(e => e.id);
    await db.from("checkout_orders").delete().in("event_id", ids);
    await db.from("events").delete().in("id", ids);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });
  const event = async (name: string) => ((await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name, status: "on_sale", starts_at: new Date(Date.now() + 10 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
  const order = (ev: string, amount: number, ref: string) => db.from("checkout_orders").insert({ order_ref: ref, event_id: ev, buyer_id: buyer.id, token: `tok-${ref}`, amount, fee: amount ? 1.5 : 0, currency: "GBP", status: "issued", stripe_session: amount ? `cs_test_fake_${ref}` : null, kind: "primary" });

  test("direct status change is refused while paid orders exist", async () => {
    const ev = await event("Guarded Gala");
    await order(ev, 20, `GRD${Date.now()}`);
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    expect((await c.from("events").update({ status: "cancelled" }).eq("id", ev)).error?.message).toMatch(/use_cancel_with_refunds/);
  });

  test("cancelling queues refunds, notifies buyers and the worker records the outcome", async ({ request }) => {
    const ev = await event("Rainy Festival");
    const paid = `PAID${Date.now()}`, free = `FREE${Date.now()}`;
    await order(ev, 25, paid); await order(ev, 0, free);
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    expect((await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "short" })).error?.message).toMatch(/reason_required/);
    const { data, error } = await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "Severe weather warning closed the site." });
    expect(error).toBeNull(); expect((data as { orders_to_refund: number }).orders_to_refund).toBe(1);
    const { data: os } = await db.from("checkout_orders").select("order_ref,refund_status").eq("event_id", ev);
    expect(Object.fromEntries((os ?? []).map(o => [o.order_ref, o.refund_status]))).toEqual({ [paid]: "due", [free]: "not_required" });
    expect((await db.from("events").select("status").eq("id", ev).single()).data!.status).toBe("cancelled");
    const { data: n } = await db.from("notifications").select("title,kind").eq("user_id", buyer.id).eq("kind", "ticket_refund");
    expect((n ?? []).some(x => x.title.includes("Rainy Festival"))).toBe(true);
    // Refund notifications are mandatory email (payments category).
    expect((await db.from("email_outbox").select("category").eq("user_id", buyer.id).eq("category", "payments")).data!.length).toBeGreaterThan(0);
    // Worker: the fake session can't be refunded, so the order is marked failed with the reason (retried later), never "refunded".
    const res = await request.post(`${BASE}/api/cron/payments`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(res.ok()).toBe(true);
    const { data: after } = await db.from("checkout_orders").select("refund_status,refund_error").eq("order_ref", paid).single();
    expect(after!.refund_status).toBe("failed"); expect(after!.refund_error).toBeTruthy();
    // A second cancel is refused.
    expect((await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "Severe weather warning closed the site." })).error?.message).toMatch(/invalid_state/);
  });
});
