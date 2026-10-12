import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, login, seedWorkspace, signedIn } from "../phase1/helpers";

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

// Organizer Terms 2.4: buyers always refunded in full; organiser platform fees depend on why the event was cancelled.
test.describe("cancellation fees by cause", () => {
  let owner: { id: string; email: string }, buyer: { id: string }, staff: { id: string; email: string }, ws: string;
  test.beforeAll(async () => {
    [owner, buyer, staff] = await Promise.all([createUser("cf-o"), createUser("cf-b"), createUser("cf-admin")]);
    ws = await seedWorkspace(owner.id, "organizer", "Fees Org");
    await db.from("platform_admins").insert({ user_id: staff.id, title: "Test reviewer", permissions: ["tickets", "commerce"] });
  });
  test.afterAll(async () => {
    const { data: evs } = await db.from("events").select("id").eq("workspace_id", ws);
    const ids = (evs ?? []).map(e => e.id);
    await db.from("platform_charges").delete().in("event_id", ids);
    await db.from("checkout_orders").delete().in("event_id", ids);
    await db.from("events").delete().in("id", ids);
    await db.from("workspaces").delete().eq("id", ws);
    await db.from("platform_admins").delete().eq("user_id", staff.id);
    await cleanup();
  });
  // 2 tickets at £20: £2 booking fees (buyer, incl. VAT) + £2 commission (5%) + £0.40 VAT on it → £4.40 platform fees.
  const sold = async (name: string) => {
    const ev = ((await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name, status: "on_sale", starts_at: new Date(Date.now() + 10 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
    const ref = `CF${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const r = await db.from("checkout_orders").insert({ order_ref: ref, event_id: ev, buyer_id: buyer.id, token: `tok-${ref}`, amount: 40, fee: 2, commission: 2, currency: "GBP", status: "issued", stripe_session: `cs_test_fake_${ref}`, kind: "primary" });
    expect(r.error).toBeNull();
    return ev;
  };
  const charge = async (ev: string) => (await db.from("platform_charges").select("amount,status").eq("event_id", ev).maybeSingle()).data;
  const refund = async (ev: string) => (await db.from("checkout_orders").select("refund_status").eq("event_id", ev).single()).data?.refund_status;

  test("own decision: buyers refunded, fees payable", async () => {
    const ev = await sold("Low Sales Night");
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    const { data, error } = await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "Not enough tickets sold to run it.", p_cause: "organiser" });
    expect(error).toBeNull();
    expect(data).toMatchObject({ fees_due: 4.4, fees_on_hold: 0, cause: "organiser" });
    expect(await refund(ev)).toBe("due");
    expect(await charge(ev)).toEqual({ amount: 4.4, status: "due" });
  });

  test("force majeure: needs an explanation, fees on hold, waived when accepted", async () => {
    const ev = await sold("Flooded Fair");
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    expect((await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "The venue flooded overnight.", p_cause: "force_majeure", p_fm_detail: "flood" })).error?.message).toMatch(/fm_detail_required/);
    expect((await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "The venue flooded overnight.", p_cause: "platform" })).error?.message).toMatch(/not_authorized/);
    const { data, error } = await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "The venue flooded overnight.", p_cause: "force_majeure",
      p_fm_detail: "River burst its banks; the council closed the venue. Closure notice: https://example.org/notice" });
    expect(error).toBeNull();
    expect(data).toMatchObject({ fees_due: 0, fees_on_hold: 4.4, cause: "force_majeure" });
    expect(await refund(ev)).toBe("due");                       // buyers refunded regardless
    expect(await charge(ev)).toEqual({ amount: 4.4, status: "on_hold" });
    // The organiser can't decide their own claim; a Gala Dock reviewer can.
    expect((await c.rpc("admin_review_force_majeure", { p_event: ev, p_approve: true, p_reason: "self-approve" })).error?.message).toMatch(/not_authorized/);
    const s = await signedIn(staff.email) as unknown as SupabaseClient;
    expect((await s.rpc("admin_review_force_majeure", { p_event: ev, p_approve: true, p_reason: "Council closure notice checked." })).error).toBeNull();
    expect(await charge(ev)).toEqual({ amount: 4.4, status: "waived" });
    expect((await db.from("event_cancellations").select("fm_status").eq("event_id", ev).single()).data?.fm_status).toBe("approved");
    const { data: n } = await db.from("notifications").select("title").eq("user_id", owner.id).ilike("title", "Force majeure accepted%");
    expect(n?.length).toBe(1);
    expect((await s.rpc("admin_review_force_majeure", { p_event: ev, p_approve: false, p_reason: "second decision" })).error?.message).toMatch(/invalid_state/);
  });

  test("cancel dialog: organiser chooses the cause and explains force majeure", async ({ page }) => {
    const ev = await sold("Storm Gala");
    await login(page, owner.email, `/organizer/events/${ev}`);
    await page.getByRole("button", { name: "Change status" }).click({ timeout: 30_000 });
    await page.getByRole("menuitem", { name: "Cancelled" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Whatever the reason, every buyer gets a full refund")).toBeVisible();
    await dialog.getByLabel("Message to attendees: why the event is cancelled").fill("A red weather warning has closed the site.");
    await dialog.getByRole("radio", { name: /Force majeure/ }).check();
    const confirm = dialog.getByRole("button", { name: "Confirm" });
    await expect(confirm).toBeDisabled();                         // explanation required
    await dialog.getByLabel(/What happened, and how it stops the event/).fill("Met Office red warning for wind covering the site; the venue has closed. https://example.org/warning");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect.poll(async () => (await charge(ev))?.status, { timeout: 20_000 }).toBe("on_hold");
    expect((await db.from("event_cancellations").select("cause,fm_status").eq("event_id", ev).single()).data).toEqual({ cause: "force_majeure", fm_status: "pending" });
  });

  test("force majeure rejected: fees become payable and the organiser is told why", async () => {
    const ev = await sold("Headliner Pulled Out");
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "Our headliner cancelled at short notice.", p_cause: "force_majeure", p_fm_detail: "The headline act cancelled their tour for personal reasons." });
    const s = await signedIn(staff.email) as unknown as SupabaseClient;
    expect((await s.rpc("admin_review_force_majeure", { p_event: ev, p_approve: false, p_reason: "A performer cancelling isn’t force majeure under 2.4(c)." })).error).toBeNull();
    expect(await charge(ev)).toEqual({ amount: 4.4, status: "due" });
    const { data: n } = await db.from("notifications").select("body").eq("user_id", owner.id).ilike("title", "Force majeure not accepted%");
    expect(n?.[0]?.body).toMatch(/performer cancelling/);
  });
});
