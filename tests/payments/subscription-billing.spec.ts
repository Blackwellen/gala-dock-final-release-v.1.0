import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { deliverWebhook, sandboxWebhookSecrets } from "../../scripts/lib/stripe-test-mode.mjs";
import { assertTestModeKey, automaticTaxEnabled, BillingModeError, changeDirection, taxParams, overageItemParams, packCheckoutParams, planChangeParams, planCheckoutParams } from "../../src/lib/billing/core";
import { platformBillingStripe, PaymentRouteError, type StripeClient, type StripeRequest } from "../../src/lib/payments/stripe-client";
import { routeEvent, type StripeEvent } from "../../src/lib/payments/webhook-core";

// Q28 subscription billing (migration 202610291013). Unit rules + signed fixture webhooks delivered to the running app
// (sandbox platform endpoint secret). No Stripe network calls and no charges: fixtures carry test-mode price ids.
const db = admin as unknown as SupabaseClient;
const now = () => Math.floor(Date.now() / 1000);
const evt = (type: string, object: Record<string, unknown>, created = now()) => ({ id: `evt_q28_${randomUUID().replaceAll("-", "")}`, object: "event", type, created, livemode: false, data: { object } });

test.describe("Q28 billing rules (unit)", () => {
  test("test-mode only, upgrade vs downgrade, params never carry Connect or fee fields", () => {
    expect(() => assertTestModeKey("sk_live_x")).toThrow(BillingModeError);
    expect(() => assertTestModeKey("")).toThrow(BillingModeError);
    expect(assertTestModeKey("sk_test_abc")).toBe("sk_test_abc");
    expect(assertTestModeKey("rk_test_abc")).toBe("rk_test_abc");
    const pro = { plan: "pro" as const, price_minor: 5900, billing_interval: "month" as const }, biz = { plan: "business" as const, price_minor: 22900, billing_interval: "month" as const };
    expect(changeDirection(pro, biz)).toBe("upgrade");
    expect(changeDirection(biz, pro)).toBe("downgrade");
    expect(changeDirection(pro, { plan: "pro", price_minor: 59000, billing_interval: "year" })).toBe("downgrade");   // £590/yr < £59/mo × 12
    expect(planChangeParams({ itemId: "si_1", price: "price_b", direction: "upgrade", currentPlan: "pro", periodEnd: 1 })).toMatchObject({ proration_behavior: "always_invoice", "metadata[gd_previous_plan]": "" });
    expect(planChangeParams({ itemId: "si_1", price: "price_p", direction: "downgrade", currentPlan: "business", periodEnd: 1800000000 })).toMatchObject({ proration_behavior: "none", "metadata[gd_previous_plan]": "business", "metadata[gd_downgrade_at]": "1800000000" });
    const all = [planCheckoutParams({ customer: "cus_1", price: "price_1", workspaceId: "w", plan: "pro", interval: "month", successUrl: "s", cancelUrl: "c" }),
      packCheckoutParams({ customer: "cus_1", price: "price_1", workspaceId: "w", packId: "p", successUrl: "s", cancelUrl: "c" }),
      overageItemParams({ customer: "cus_1", amountMinor: 120, currency: "GBP", credits: 30, period: "2026-09-01", chargeId: "x" })];
    for (const p of all) expect(Object.keys(p).some(k => /transfer|destination|on_behalf_of|application_fee/.test(k))).toBe(false);
  });

  test("VAT: Stripe Tax automatic tax is behind BILLING_AUTOMATIC_TAX; prices and overage are ex VAT", () => {
    expect(automaticTaxEnabled({})).toBe(false);
    expect(automaticTaxEnabled({ BILLING_AUTOMATIC_TAX: "off" })).toBe(false);
    expect(automaticTaxEnabled({ BILLING_AUTOMATIC_TAX: "on" })).toBe(true);
    expect(taxParams(false)).toEqual({});
    const base = { customer: "cus_1", price: "price_1", workspaceId: "w", successUrl: "s", cancelUrl: "c" };
    const off = planCheckoutParams({ ...base, plan: "pro", interval: "month" });
    expect(Object.keys(off).some(k => /automatic_tax|customer_update|billing_address/.test(k))).toBe(false);
    for (const p of [planCheckoutParams({ ...base, plan: "pro", interval: "month", automaticTax: true }), packCheckoutParams({ ...base, packId: "p", automaticTax: true })]) {
      expect(p).toMatchObject({ "automatic_tax[enabled]": "true", billing_address_collection: "required", "customer_update[address]": "auto" });
    }
    expect(overageItemParams({ customer: "cus_1", amountMinor: 120, currency: "GBP", credits: 30, period: "2026-09-01", chargeId: "x" }).tax_behavior).toBe("exclusive");
  });

  test("platform billing adapter: never a Stripe-Account header, refuses transfer / fee params and wrong modes", async () => {
    const seen: StripeRequest[] = [];
    const fake: StripeClient = { request: async <T,>(r: StripeRequest) => { seen.push(r); return { id: r.path.startsWith("customers") ? "cus_1" : "x", url: "u" } as T; } };
    const b = platformBillingStripe(fake);
    await b.createCustomer({ name: "x" }, "k1");
    await b.createCheckout("subscription", { mode: "subscription", "line_items[0][price]": "price_1" }, "k2");
    expect(seen.every(r => !r.stripeAccount)).toBe(true);
    expect(() => b.createCheckout("subscription", { mode: "payment" }, "k")).toThrow(PaymentRouteError);
    expect(() => b.createCheckout("ai_credits", { mode: "payment", "payment_intent_data[transfer_data][destination]": "acct_1" }, "k")).toThrow(PaymentRouteError);
    expect(() => b.createInvoiceItem({ customer: "cus_1", amount: "1", "application_fee_amount": "1" }, "k")).toThrow(PaymentRouteError);
    expect(() => b.updateSubscription("not-a-sub", {}, "k")).toThrow(PaymentRouteError);
  });

  test("webhook routing: subscription and invoice events are platform-only", () => {
    const ev = (o: Partial<StripeEvent>) => ({ id: "evt_1", type: "x", data: { object: { id: "o" } }, ...o }) as StripeEvent;
    expect(routeEvent(ev({ type: "customer.subscription.updated" }))).toBe("subscription");
    expect(routeEvent(ev({ type: "customer.subscription.deleted" }))).toBe("subscription");
    expect(routeEvent(ev({ type: "invoice.paid" }))).toBe("invoice");
    expect(routeEvent(ev({ type: "invoice.payment_failed" }))).toBe("invoice");
    expect(routeEvent(ev({ type: "customer.subscription.updated", account: "acct_A1" }))).toBe("ignored");
    expect(routeEvent(ev({ type: "invoice.paid", account: "acct_A1" }))).toBe("ignored");
  });
});

test.describe("Q28 subscription lifecycle (signed fixture webhooks → app)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!/^whsec_/.test(sandboxWebhookSecrets().platform), "sandbox platform webhook secret not configured");
  let owner: { id: string; email: string }, ws: string, pro: string, biz: string, sub: string, cus: string, packPrice: string, packId: string;
  const subObj = (status: string, price: string, extra: Record<string, unknown> = {}) => ({ id: sub, object: "subscription", status, customer: cus, cancel_at_period_end: false, livemode: false,
    metadata: { workspace_id: ws, ...(extra.metadata as Record<string, string> ?? {}) }, current_period_start: now() - 86400, current_period_end: now() + 29 * 86400,
    items: { object: "list", data: [{ id: "si_q28", price: { id: price }, current_period_start: now() - 86400, current_period_end: now() + 29 * 86400 }] }, ...extra });
  const plan = async () => ((await db.from("workspaces").select("plan").eq("id", ws).single()).data as { plan: string }).plan;
  const send = async (e: ReturnType<typeof evt>) => { const r = await deliverWebhook(BASE, e, "platform"); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body as { duplicate?: boolean }; };

  test.beforeAll(async () => {
    owner = await createUser("q28-bill");
    ws = await seedWorkspace(owner.id, "organizer", "Q28 Billing Org");
    const { data: prices } = await db.from("plan_prices").select("plan,billing_interval,stripe_price_test").eq("kind", "organizer").eq("billing_interval", "month");
    const P = (prices ?? []) as { plan: string; stripe_price_test: string }[];
    pro = P.find(p => p.plan === "pro")!.stripe_price_test; biz = P.find(p => p.plan === "business")!.stripe_price_test;
    expect(pro).toMatch(/^price_/); expect(biz).toMatch(/^price_/);
    const { data: pk } = await db.from("credit_packs").select("id,stripe_price_test").eq("name", "Top-up S").single();
    packId = (pk as { id: string }).id; packPrice = (pk as { stripe_price_test: string }).stripe_price_test;
    sub = `sub_q28${randomUUID().replaceAll("-", "").slice(0, 16)}`; cus = `cus_q28${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  });
  test.afterAll(async () => { await db.from("workspaces").delete().eq("id", ws); await cleanup(); });

  test("active subscription sets the plan; replay is a no-op; a stale event never overwrites newer state", async () => {
    expect(await plan()).toBe("starter");
    const created = evt("customer.subscription.created", subObj("active", pro));
    await send(created);
    expect(await plan()).toBe("pro");
    expect((await send(created)).duplicate).toBe(true);
    const { count } = await db.from("audit_events").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("event", "billing.subscription_synced");
    expect(count).toBe(1);
    await send(evt("customer.subscription.updated", subObj("active", biz), now() + 5));                 // upgrade applied by Stripe
    expect(await plan()).toBe("business");
    await send(evt("customer.subscription.updated", subObj("canceled", pro), now() - 3600));            // older event, delivered late
    expect(await plan()).toBe("business");
    // Members read their subscription through RLS; another user cannot.
    const o = await signedIn(owner.email) as unknown as SupabaseClient;
    expect(((await o.from("workspace_subscriptions").select("plan,status").eq("workspace_id", ws)).data ?? [])).toEqual([{ plan: "business", status: "active" }]);
    expect((await o.from("workspace_subscriptions").insert({ workspace_id: ws, stripe_subscription_id: "sub_forged", kind: "organizer", plan: "enterprise", billing_interval: "month", status: "active" })).error).not.toBeNull();
  });

  test("end-of-period downgrade keeps entitlements until the period ends; the sweep applies it", async () => {
    const at = now() + 10 * 86400;
    await send(evt("customer.subscription.updated", subObj("active", pro, { metadata: { gd_previous_plan: "business", gd_downgrade_at: String(at) } }), now() + 10));
    expect(await plan()).toBe("business");
    const s = (await db.from("workspace_subscriptions").select("pending_plan,pending_effective_at").eq("workspace_id", ws).single()).data as { pending_plan: string; pending_effective_at: string };
    expect(s.pending_plan).toBe("pro");
    await db.from("workspace_subscriptions").update({ pending_effective_at: new Date(Date.now() - 120_000).toISOString() }).eq("workspace_id", ws);   // 2 min margin: client↔DB clock skew (~1.3 s observed) made a 1 s margin flaky   // time passes
    const { data: id } = await db.rpc("enqueue_job", { p_kind: "billing.sweep", p_payload: {}, p_dedupe_key: `q28-sweep:${randomUUID()}` });
    await db.rpc("run_db_jobs", { p_limit: 5, p_kinds: ["billing.sweep"] });
    expect(((await db.from("job_queue").select("status").eq("id", id as string).single()).data as { status: string }).status).toBe("succeeded");
    expect(await plan()).toBe("pro");
  });

  test("dunning: past_due keeps the plan and notifies owners; grace expiry or cancellation falls back to Starter", async () => {
    await send(evt("customer.subscription.updated", subObj("past_due", pro), now() + 20));
    expect(await plan()).toBe("pro");
    const { data: notes } = await db.from("notifications").select("title").eq("user_id", owner.id).like("title", "Payment failed%");
    expect((notes ?? []).length).toBe(1);
    await send(evt("invoice.payment_failed", { id: `in_q28${randomUUID().replaceAll("-", "").slice(0, 12)}`, object: "invoice", customer: cus, subscription: sub, status: "open", amount_due: 5900, amount_paid: 0, currency: "gbp", attempt_count: 1 }, now() + 21));
    expect(((await db.from("subscription_invoices").select("status,amount_due").eq("workspace_id", ws)).data ?? []).length).toBe(1);
    await db.from("workspace_subscriptions").update({ dunning_since: new Date(Date.now() - 15 * 864e5).toISOString() }).eq("workspace_id", ws);
    await db.rpc("enqueue_job", { p_kind: "billing.sweep", p_payload: {}, p_dedupe_key: `q28-sweep:${randomUUID()}` });
    await db.rpc("run_db_jobs", { p_limit: 5, p_kinds: ["billing.sweep"] });
    expect(await plan()).toBe("starter");
    await send(evt("customer.subscription.updated", subObj("active", pro), now() + 30));                // card updated, Stripe retried
    expect(await plan()).toBe("pro");
    await send(evt("customer.subscription.deleted", subObj("canceled", pro, { ended_at: now() }), now() + 40));
    expect(await plan()).toBe("starter");
  });

  test("overage invoice item settles on invoice.paid; credit pack payment credits once (replays and re-sent sessions)", async () => {
    const { data: oc } = await db.from("ai_overage_charges").insert({ workspace_id: ws, period: "2026-09-01", credits: 30, rate_minor: 4, amount_minor: 120, status: "accrued" }).select("id").single();
    const item = `ii_q28${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    expect((await db.rpc("billing_overage_due", { p_before: null })).data as { id: string }[]).toEqual(expect.arrayContaining([expect.objectContaining({ id: (oc as { id: string }).id })]));
    await db.rpc("billing_mark_overage_invoiced", { p_id: (oc as { id: string }).id, p_item: item });
    await send(evt("invoice.paid", { id: `in_q28${randomUUID().replaceAll("-", "").slice(0, 12)}`, object: "invoice", customer: cus, subscription: sub, status: "paid", amount_due: 6020, amount_paid: 6020, currency: "gbp",
      lines: { data: [{ id: "il_1", invoice_item: item, amount: 120 }, { id: "il_2", amount: 5900 }] } }, now() + 50));
    expect(((await db.from("ai_overage_charges").select("status").eq("id", (oc as { id: string }).id).single()).data as { status: string }).status).toBe("paid");

    const session = { id: `cs_test_q28${randomUUID().replaceAll("-", "").slice(0, 16)}`, object: "checkout.session", mode: "payment", payment_status: "paid", status: "complete", amount_subtotal: 2500, amount_total: 2500, currency: "gbp",   // Top-up S = £25 ex VAT (202610291015)
      customer: cus, metadata: { purpose: "ai_credits", workspace_id: ws, pack_id: packId }, line_items: { data: [{ price: { id: packPrice } }] } };
    const done = evt("checkout.session.completed", session);
    await send(done);
    expect((await send(done)).duplicate).toBe(true);
    await send(evt("checkout.session.completed", session));                                              // same session, new event id
    const { data: rows } = await db.from("ai_credit_ledger").select("credits,payment_ref").eq("workspace_id", ws).eq("kind", "purchase");
    expect(rows).toEqual([{ credits: 500, payment_ref: session.id }]);
    // A session whose amount does not match the server catalogue is refused (the event stays failed for investigation).
    const bad = await deliverWebhook(BASE, evt("checkout.session.completed", { ...session, id: `${session.id}x`, amount_subtotal: 1, amount_total: 1 }), "platform");
    expect(bad.status).toBe(500);
    expect(((await db.from("ai_credit_ledger").select("id").eq("workspace_id", ws).eq("kind", "purchase")).data ?? []).length).toBe(1);
  });
});
