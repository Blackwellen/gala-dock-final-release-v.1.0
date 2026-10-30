// Q40 → Q07 · Merchandise on direct charges (migration 202610291047). Two layers, never live Stripe:
//  1. Unit: createMerchDirectCheckout / executeMerchCardRefund with a fake Stripe client and an in-memory data layer.
//  2. API: merch_reserve as a disposable buyer, merch_direct_prepare, then signed FIXTURE webhook events (sandbox Connect endpoint
//     secret from .env) posted to the dev server on :3107 — payment, retries, duplicate charge, late payment, refunds, fee refund.
// Run: node node_modules/@playwright/test/cli.js test tests/payments/merch-direct-charges.spec.ts --trace=off --reporter=list
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StripeClient, StripeRequest } from "../../src/lib/payments/stripe-client";
import type { SellerAccount } from "../../src/lib/payments/rules";
import { createMerchDirectCheckout, executeMerchCardRefund, type MerchOrder, type MerchPaymentData } from "../../src/lib/payments/merch-service";
import { signStripePayload } from "../../src/lib/payments/webhook-core";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// ───────────────────────── layer 1: fakes ─────────────────────────
class FakeStripe implements StripeClient {
  calls: StripeRequest[] = [];
  sessions = new Map<string, Record<string, unknown>>();
  failNext = false;
  refundStatus = "succeeded";
  async request<T>(r: StripeRequest): Promise<T> {
    this.calls.push(r);
    if (this.failNext) { this.failNext = false; throw new Error("api_connection_error"); }
    if (r.method === "POST" && r.path === "checkout/sessions") {
      const existing = [...this.sessions.values()].find(s => s._idem === r.idempotencyKey && s._account === r.stripeAccount);
      if (existing) return existing as T;
      const id = `cs_test_m${this.sessions.size + 1}`;
      const s = { id, url: `https://checkout.stripe.test/${id}`, status: "open", payment_status: "unpaid", _idem: r.idempotencyKey, _account: r.stripeAccount, params: r.params };
      this.sessions.set(id, s); return s as T;
    }
    if (r.method === "GET" && r.path.startsWith("checkout/sessions/")) {
      const s = this.sessions.get(decodeURIComponent(r.path.split("/")[2].split("?")[0]));
      if (!s || s._account !== r.stripeAccount) throw new Error("resource_missing");
      return s as T;
    }
    if (r.method === "POST" && r.path === "refunds") return { id: `re_${this.calls.length}`, status: this.refundStatus, amount: Number(r.params?.amount ?? 0), currency: "gbp", payment_intent: r.params?.payment_intent } as T;
    throw new Error(`unexpected ${r.method} ${r.path}`);
  }
}
const ready = (ws: string, acct: string, over: Partial<SellerAccount> = {}): SellerAccount => ({ workspace_id: ws, name: "Organiser", stripe_account_id: acct, charges_enabled: true,
  card_payments: "active", details_submitted: true, disabled_reason: null, past_due: [], country: "GB", default_currency: "gbp", ...over });
class MemoryMerch implements MerchPaymentData {
  sellers = new Map<string, SellerAccount>();
  orders = new Map<string, MerchOrder>();
  refunds = new Map<string, { id: string; order_ref: string; account: string; payment_intent: string; amount_minor: number; reason: "customer_cancelled" | "hold_expired"; idempotency_key: string; status: string; stripe?: string | null }>();
  async sellerAccount(ws: string) { return this.sellers.get(ws) ?? null; }
  async prepareMerchOrder(ref: string, account: string) {
    const o = this.orders.get(ref)!;
    if (o.application_fee_minor == null) Object.assign(o, { connected_account_id: account, application_fee_minor: Math.round(o.total_minor * 0.12) });
    return { ...o };
  }
  async setMerchSession(ref: string, s: string) { this.orders.get(ref)!.stripe_checkout_session = s; }
  async claimCardRefund(id: string) {
    const r = this.refunds.get(id);
    if (!r || r.status === "succeeded" || r.status === "processing") return null;
    r.status = "processing"; return { ...r };
  }
  async cardRefundResult(id: string, stripe: string | null, status: string) { Object.assign(this.refunds.get(id)!, { status, stripe }); }
}
const NOW = Date.parse("2026-10-29T12:00:00Z");
function setup() {
  const stripe = new FakeStripe(), data = new MemoryMerch();
  data.sellers.set("ws-o", ready("ws-o", "acct_ORG1"));
  data.orders.set("GD-M-AAAAAAAAAA", { order_ref: "GD-M-AAAAAAAAAA", workspace_id: "ws-o", status: "pending", total_minor: 5000, currency: "GBP", expires_at: new Date(NOW + 31 * 60_000).toISOString(),
    connected_account_id: null, application_fee_minor: null, stripe_checkout_session: null, event_id: "ev" });
  return { stripe, data, deps: { stripe, data, now: () => NOW } };
}
const input = (o: MerchOrder) => ({ order: o, lines: [{ name: "Tee", qty: 2, unit_minor: 2500 }], eventName: "Neon Nights", customerEmail: "buyer@example.test",
  successUrl: "https://x.test/ok", cancelUrl: "https://x.test/no" });

test.describe("merch checkout on the organiser's connected account (unit, fake Stripe)", () => {
  test("direct charge in the seller context, DB fee as application_fee_amount, merch_order metadata, no transfer params", async () => {
    const { stripe, data, deps } = setup();
    const r = await createMerchDirectCheckout(deps, input(data.orders.get("GD-M-AAAAAAAAAA")!));
    expect(r.ok).toBe(true);
    const c = stripe.calls.find(x => x.path === "checkout/sessions")!;
    expect(c.stripeAccount).toBe("acct_ORG1");
    expect(c.params!["payment_intent_data[application_fee_amount]"]).toBe("600");
    expect(c.params!["metadata[merch_order]"]).toBe("GD-M-AAAAAAAAAA");
    expect(c.params!["payment_intent_data[metadata][merch_order]"]).toBe("GD-M-AAAAAAAAAA");
    expect(Object.keys(c.params!).some(k => /transfer|destination|on_behalf_of/.test(k))).toBe(false);
    expect(Number(c.params!.expires_at) - NOW / 1000).toBe(1800);
    expect(data.orders.get("GD-M-AAAAAAAAAA")!.stripe_checkout_session).toBe((r as { sessionId: string }).sessionId);
  });
  test("double submit reuses the open session (one charge path)", async () => {
    const { stripe, data, deps } = setup();
    const a = await createMerchDirectCheckout(deps, input(data.orders.get("GD-M-AAAAAAAAAA")!));
    const b = await createMerchDirectCheckout(deps, input(data.orders.get("GD-M-AAAAAAAAAA")!));
    expect(b).toMatchObject({ ok: true, reused: true, sessionId: (a as { sessionId: string }).sessionId });
    expect(stripe.calls.filter(x => x.method === "POST" && x.path === "checkout/sessions").length).toBe(1);
  });
  test("seller not ready, expired reservation or tampered lines: refused before any Stripe call", async () => {
    for (const over of [{ card_payments: "inactive" }, { disabled_reason: "rejected.fraud" }, { stripe_account_id: null }] as Partial<SellerAccount>[]) {
      const { stripe, data, deps } = setup(); data.sellers.set("ws-o", ready("ws-o", "acct_ORG1", over));
      expect(await createMerchDirectCheckout(deps, input(data.orders.get("GD-M-AAAAAAAAAA")!))).toMatchObject({ ok: false, code: "seller_not_ready" });
      expect(stripe.calls.length).toBe(0);
    }
    const { stripe, data, deps } = setup();
    const o = data.orders.get("GD-M-AAAAAAAAAA")!;
    expect(await createMerchDirectCheckout(deps, input({ ...o, expires_at: new Date(NOW + 10_000).toISOString() }))).toMatchObject({ ok: false, code: "expired" });
    expect(await createMerchDirectCheckout(deps, { ...input(o), lines: [{ name: "Tee", qty: 1, unit_minor: 2500 }] })).toMatchObject({ ok: false, code: "invalid_order" });
    expect(await createMerchDirectCheckout(deps, input({ ...o, status: "paid" }))).toMatchObject({ ok: false, code: "invalid_order" });
    expect(stripe.calls.length).toBe(0);
  });
  test("Stripe outage: nothing marked, honest message", async () => {
    const { stripe, data, deps } = setup(); stripe.failNext = true;
    expect(await createMerchDirectCheckout(deps, input(data.orders.get("GD-M-AAAAAAAAAA")!))).toMatchObject({ ok: false, code: "stripe_unavailable" });
    expect(data.orders.get("GD-M-AAAAAAAAAA")!.stripe_checkout_session).toBeNull();
  });
  test("card refund: on the connected charge with the row's idempotency key; fee policy by reason; claimed once", async () => {
    const { stripe, data, deps } = setup();
    data.refunds.set("r1", { id: "r1", order_ref: "GD-M-AAAAAAAAAA", account: "acct_ORG1", payment_intent: "pi_m1", amount_minor: 2500, reason: "customer_cancelled", idempotency_key: "merch-refund:GD-M-AAAAAAAAAA:1", status: "requested" });
    data.refunds.set("r2", { id: "r2", order_ref: "GD-M-AAAAAAAAAA", account: "acct_ORG1", payment_intent: "pi_m1", amount_minor: 5000, reason: "hold_expired", idempotency_key: "merch-refund:GD-M-AAAAAAAAAA:expired", status: "requested" });
    expect(await executeMerchCardRefund(deps, "r1")).toMatchObject({ result: "succeeded", policy: "retained" });
    expect(await executeMerchCardRefund(deps, "r2")).toMatchObject({ result: "succeeded", policy: "full" });
    const [c1, c2] = stripe.calls.filter(x => x.path === "refunds");
    expect(c1).toMatchObject({ stripeAccount: "acct_ORG1", idempotencyKey: "merch-refund:GD-M-AAAAAAAAAA:1" });
    expect(c1.params).toMatchObject({ payment_intent: "pi_m1", amount: "2500", refund_application_fee: "false", "metadata[merch_order]": "GD-M-AAAAAAAAAA" });
    expect(c2.params).toMatchObject({ amount: "5000", refund_application_fee: "true" });
    expect(await executeMerchCardRefund(deps, "r1")).toMatchObject({ result: "skipped" });   // done rows are never refunded again
    expect(stripe.calls.filter(x => x.path === "refunds").length).toBe(2);
  });
  test("card refund failure is recorded for the retry job; pending stays pending", async () => {
    const { stripe, data, deps } = setup();
    data.refunds.set("r3", { id: "r3", order_ref: "GD-M-AAAAAAAAAA", account: "acct_ORG1", payment_intent: "pi_m1", amount_minor: 100, reason: "customer_cancelled", idempotency_key: "k3", status: "requested" });
    stripe.failNext = true;
    expect(await executeMerchCardRefund(deps, "r3")).toMatchObject({ result: "failed" });
    expect(data.refunds.get("r3")!.status).toBe("failed");
    stripe.refundStatus = "pending";
    expect(await executeMerchCardRefund(deps, "r3")).toMatchObject({ result: "pending" });
  });
});

// ───────────────────────── layer 2: database + signed fixture webhooks ─────────────────────────
const env = fs.readFileSync(".env", "utf8");
const CONNECT = env.match(/^STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT=(.+)$/m)?.[1]?.trim() ?? "";
const PLATFORM = env.match(/^STRIPE_WEBHOOK_SECRET_SANDBOX=(.+)$/m)?.[1]?.trim() ?? "";
const send = async (event: object, secret = CONNECT) => {
  const body = JSON.stringify(event);
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": signStripePayload(body, secret), "content-type": "application/json" }, body });
  return { status: res.status, body: await res.json() };
};
const db = admin as unknown as SupabaseClient;
const rid = (p: string) => `${p}_test_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
const ledger = async (key: string) => {
  const { data: tx } = await db.from("ledger_transactions").select("id,kind,basis,source_type").eq("idempotency_key", key);
  if (!tx?.length) return null;
  const { data } = await db.from("ledger_entries").select("account,amount_minor").eq("transaction_id", tx[0].id);
  return { count: tx.length, kind: tx[0].kind as string, basis: tx[0].basis as string, source: tx[0].source_type as string, lines: data as { account: string; amount_minor: number }[] };
};
const sum = (l: { account?: string; amount_minor: number }[], acct?: string) => l.filter(x => !acct || x.account === acct).reduce((a, x) => a + Number(x.amount_minor), 0);

test.describe.serial("merch direct charge: webhook → ledger → merch_mark_paid → refunds (fixture events, no Stripe API)", () => {
  let org: { id: string; email: string }, fan: { id: string; email: string }, other: { id: string; email: string };
  let orgC: SupabaseClient, fanC: SupabaseClient, otherC: SupabaseClient;
  let W: string, ev: string, stock: string, item: string, ref: string;
  const acct = `acct_test_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const pi = rid("pi"), ch = rid("ch"), fee = rid("fee");

  test.beforeAll(async () => {
    expect(CONNECT, "STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT in .env").toMatch(/^whsec_/);
    [org, fan, other] = await Promise.all([createUser("q40m-org"), createUser("q40m-fan"), createUser("q40m-other")]);
    W = await seedWorkspace(org.id, "organizer", "Q40 Merch Seller");
    expect((await db.from("connect_accounts").insert({ workspace_id: W, stripe_account_id: acct, account_type: "standard", charges_enabled: true, payouts_enabled: true,
      details_submitted: true, card_payments_capability: "active", transfers_capability: "active", verification_state: "verified" })).error).toBeNull();
    ev = (await insertEventFixture({ owner_id: org.id, workspace_id: W, name: "Q40 Merch Night", visibility: "public", status: "published",
      starts_at: new Date(Date.now() + 7 * 864e5).toISOString() }, "merch-direct-charges").select("id").single()).data!.id;
    [orgC, fanC, otherC] = await Promise.all([org, fan, other].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
    stock = ((await orgC.rpc("save_stock_item", { p_workspace: W, p_item: null, p_data: { category: "merchandise", name: "Q40 merch tee", sku: `M-${randomUUID().slice(0, 6)}` } })).data as { id: string }).id;
    expect((await orgC.rpc("record_stock_movement", { p_item: stock, p_kind: "receive", p_quantity: 5, p_request_id: randomUUID() })).error).toBeNull();
    item = ((await orgC.rpc("save_merch_item", { p_workspace: W, p_item: null, p_data: { stock_item_id: stock, name: "Q40 merch tee", price_minor: 2500, status: "on_sale" } })).data as { id: string }).id;
  });
  test.afterAll(async () => {
    // Ledger rows are immutable by design: fixture postings stay, tied to the disposable workspace (purged by the fixture purge).
    const { data: os } = await db.from("merch_orders").select("id").eq("workspace_id", W);
    await db.from("merch_card_refunds").delete().in("order_id", (os ?? []).map(o => o.id as string));
    await db.from("application_fee_records").delete().eq("stripe_account_id", acct);
    await db.from("merch_orders").delete().eq("workspace_id", W);
    await db.from("merch_items").delete().eq("workspace_id", W);
    await db.from("events").delete().eq("id", ev);
    await cleanup();
  });

  test("checkout prepare: only the organiser's ready account; fee snapshot ≤ total; buyer can't call service functions", async () => {
    const r = (await fanC.rpc("merch_reserve", { p_event: ev, p_items: [{ merch_item_id: item, qty: 2 }], p_request_id: randomUUID() })).data as { order_ref: string; total_minor: number };
    ref = r.order_ref; expect(r.total_minor).toBe(5000);
    expect((await fanC.rpc("merch_direct_prepare", { p_ref: ref, p_account: acct, p_merchant: {} })).error?.message).toMatch(/permission denied/);
    expect((await fanC.rpc("merch_order_direct_paid", { p_ref: ref, p_pi: pi, p_charge: ch, p_amount_minor: 5000, p_account: acct })).error?.message).toMatch(/permission denied/);
    expect((await db.rpc("merch_direct_prepare", { p_ref: ref, p_account: "acct_someoneelse", p_merchant: {} })).error?.message).toMatch(/seller_not_ready/);
    const p = (await db.rpc("merch_direct_prepare", { p_ref: ref, p_account: acct, p_merchant: { test: true } })).data as { application_fee_minor: number; connected_account_id: string; expires_at: string };
    expect(p.connected_account_id).toBe(acct);
    expect(p.application_fee_minor).toBeGreaterThan(0); expect(p.application_fee_minor).toBeLessThanOrEqual(5000);
    expect(Date.parse(p.expires_at)).toBeGreaterThan(Date.now() + 29 * 60_000);   // reservation covers the 30-min session
    expect(((await db.rpc("merch_direct_prepare", { p_ref: ref, p_account: acct, p_merchant: {} })).data as { application_fee_minor: number }).application_fee_minor).toBe(p.application_fee_minor);
    expect((await db.rpc("merch_set_session", { p_ref: ref, p_session: rid("cs") })).error).toBeNull();
    // the buyer sees their order; another user doesn't
    expect(((await otherC.from("merch_orders").select("id").eq("order_ref", ref)).data ?? []).length).toBe(0);
  });

  test("payment_intent.succeeded (connected): ledger once, platform cash = application fee, order paid, stock sold; retries are no-ops", async () => {
    const event = { id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", account: acct, created: 2000,
      data: { object: { id: pi, amount_received: 5000, currency: "gbp", latest_charge: ch, application_fee: fee, metadata: { merch_order: ref } } } };
    expect((await send(event)).body).toEqual({ received: true });
    expect((await send(event)).body.duplicate).toBe(true);                                   // same event: deduped
    expect((await send({ ...event, id: `evt_${randomUUID()}` })).body).toEqual({ received: true });   // Stripe resends a new event id: still once
    const l = (await ledger(`stripe:pi:${pi}`))!;
    expect(l).toMatchObject({ count: 1, kind: "merch_order", basis: "direct_charge_memo", source: "merch_order" });
    const { data: o } = await db.from("merch_orders").select("status,stripe_payment_intent,stripe_charge,application_fee_minor,stripe_application_fee").eq("order_ref", ref).single();
    expect(o).toMatchObject({ status: "paid", stripe_payment_intent: pi, stripe_charge: ch, stripe_application_fee: fee });
    expect(sum(l.lines)).toBe(0);
    expect(sum(l.lines, "cash_stripe")).toBe(Number(o!.application_fee_minor));
    expect(sum(l.lines, "merchant_gmv")).toBe(-5000);
    const { data: s } = await db.from("stock_items").select("on_hand,reserved").eq("id", stock).single();
    expect(s).toMatchObject({ on_hand: 3, reserved: 0 });
    expect(((await db.from("stock_movements").select("id").eq("item_id", stock).eq("kind", "sale").eq("ref", ref)).data ?? []).length).toBe(1);
  });

  test("context and amount are enforced: a platform-endpoint delivery or a wrong amount never marks an order", async () => {
    const r2 = (await fanC.rpc("merch_reserve", { p_event: ev, p_items: [{ merch_item_id: item, qty: 1 }], p_request_id: randomUUID() })).data as { order_ref: string };
    await db.rpc("merch_direct_prepare", { p_ref: r2.order_ref, p_account: acct, p_merchant: {} });
    const p2 = rid("pi");
    // Connect object signed by the platform endpoint → ignored (account context)
    expect((await send({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", account: acct, data: { object: { id: p2, amount_received: 2500, metadata: { merch_order: r2.order_ref } } } }, PLATFORM)).body.ignored).toBe("account_context");
    expect((await send({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", account: acct, data: { object: { id: p2, amount_received: 2499, latest_charge: rid("ch"), metadata: { merch_order: r2.order_ref } } } })).body).toEqual({ received: true });
    const { data: o } = await db.from("merch_orders").select("status").eq("order_ref", r2.order_ref).single();
    expect(o!.status).toBe("pending");
    expect(await ledger(`stripe:pi:${p2}`)).toBeNull();
    await db.from("merch_orders").update({ status: "cancelled" }).eq("order_ref", r2.order_ref);
    await db.rpc("merch_release_lines", { p_order: (await db.from("merch_orders").select("id").eq("order_ref", r2.order_ref).single()).data!.id });
  });

  test("a second successful charge for the same order is posted and queued for a full 'duplicate' refund, never marked twice", async () => {
    const p3 = rid("pi");
    expect((await send({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", account: acct, data: { object: { id: p3, amount_received: 5000, latest_charge: rid("ch"), metadata: { merch_order: ref } } } })).body).toEqual({ received: true });
    expect((await ledger(`stripe:pi:${p3}`))!.count).toBe(1);
    const { data: o } = await db.from("merch_orders").select("id,stripe_payment_intent").eq("order_ref", ref).single();
    expect(o!.stripe_payment_intent).toBe(pi);
    const { data: rf } = await db.from("merch_card_refunds").select("reason,amount_minor,status").eq("order_id", o!.id).eq("reason", "duplicate");
    expect(rf).toHaveLength(1); expect(rf![0]).toMatchObject({ amount_minor: 5000 });
  });

  test("staff refund: refunds.approve only; queues a card refund on the connected charge; charge.refunded posts the delta once", async () => {
    expect((await fanC.rpc("merch_request_refund", { p_order_ref: ref, p_lines: [{ merch_item_id: item, qty: 1 }], p_restock: true, p_reason: "customer_cancelled" })).error?.message).toMatch(/not_authorized/);
    const r = (await orgC.rpc("merch_request_refund", { p_order_ref: ref, p_lines: [{ merch_item_id: item, qty: 1 }], p_restock: true, p_reason: "customer_cancelled" })).data as { refund_minor: number; card_refund: string; card_refund_id: string };
    expect(r).toMatchObject({ refund_minor: 2500, card_refund: "queued" });
    expect((await orgC.rpc("merch_request_refund", { p_order_ref: ref, p_lines: [{ merch_item_id: item, qty: 2 }], p_restock: true, p_reason: "customer_cancelled" })).error?.message).toMatch(/refund_exceeds_order/);
    const c = (await db.rpc("merch_card_refund_claim", { p_id: r.card_refund_id })).data as { claimed: boolean; account: string; payment_intent: string; amount_minor: number; reason: string; idempotency_key: string };
    expect(c).toMatchObject({ claimed: true, account: acct, payment_intent: pi, amount_minor: 2500, reason: "customer_cancelled" });
    expect(((await db.rpc("merch_card_refund_claim", { p_id: r.card_refund_id })).data as { claimed: boolean }).claimed).toBe(false);   // no double execution
    await db.rpc("merch_card_refund_result", { p_id: r.card_refund_id, p_stripe_refund: rid("re"), p_status: "pending" });
    const refunded = { id: `evt_${randomUUID()}`, type: "charge.refunded", account: acct, created: 3000,
      data: { object: { id: ch, payment_intent: pi, amount_refunded: 2500, currency: "gbp", metadata: { merch_order: ref } } } };
    expect((await send(refunded)).body).toEqual({ received: true });
    expect((await send({ ...refunded, id: `evt_${randomUUID()}` })).body).toEqual({ received: true });
    const l = (await ledger(`stripe:direct-refund:${ch}:2500`))!;
    expect(l).toMatchObject({ count: 1, kind: "refund", source: "merch_order" });
    expect(sum(l.lines, "seller_refunds")).toBe(2500); expect(sum(l.lines, "cash_stripe")).toBe(0);   // refunds never touch platform cash
    const { data: o } = await db.from("merch_orders").select("id,status,refunded_minor,card_refunded_minor").eq("order_ref", ref).single();
    expect(o).toMatchObject({ status: "partially_refunded", refunded_minor: 2500, card_refunded_minor: 2500 });
    expect((await db.from("merch_card_refunds").select("status").eq("id", r.card_refund_id).single()).data!.status).toBe("succeeded");
    expect((await db.from("stock_items").select("on_hand").eq("id", stock).single()).data!.on_hand).toBe(4);   // restocked
  });

  test("application_fee.refunded resolves the merch order and moves platform cash back by the fee refund only", async () => {
    const { data: o } = await db.from("merch_orders").select("application_fee_minor").eq("order_ref", ref).single();
    const feeObj = (refunded: number) => ({ id: `evt_${randomUUID()}`, type: refunded ? "application_fee.refunded" : "application_fee.created", created: 4000 + refunded,
      data: { object: { id: fee, account: acct, charge: ch, amount: Number(o!.application_fee_minor), amount_refunded: refunded, currency: "gbp" } } });
    expect((await send(feeObj(0), PLATFORM)).body).toEqual({ received: true });
    expect((await send(feeObj(100), PLATFORM)).body).toEqual({ received: true });
    expect((await send(feeObj(100), PLATFORM)).body).toEqual({ received: true });
    const l = (await ledger(`stripe:fee-refund:${fee}:100`))!;
    expect(l).toMatchObject({ count: 1, kind: "application_fee_refund", source: "merch_order" });
    expect(sum(l.lines, "cash_stripe")).toBe(-100); expect(sum(l.lines)).toBe(0);
  });

  test("payment after the reservation expired: posted, order expired, stock released, full 'hold_expired' refund queued once", async () => {
    const r = (await fanC.rpc("merch_reserve", { p_event: ev, p_items: [{ merch_item_id: item, qty: 1 }], p_request_id: randomUUID() })).data as { order_ref: string };
    await db.rpc("merch_direct_prepare", { p_ref: r.order_ref, p_account: acct, p_merchant: {} });
    await db.from("merch_orders").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("order_ref", r.order_ref);
    const p4 = rid("pi"), e = { id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", account: acct, data: { object: { id: p4, amount_received: 2500, latest_charge: rid("ch"), metadata: { merch_order: r.order_ref } } } };
    expect((await send(e)).body).toEqual({ received: true });
    expect((await send({ ...e, id: `evt_${randomUUID()}` })).body).toEqual({ received: true });
    const { data: o } = await db.from("merch_orders").select("id,status,refund_required").eq("order_ref", r.order_ref).single();
    expect(o).toMatchObject({ status: "expired", refund_required: true });
    expect((await ledger(`stripe:pi:${p4}`))!.count).toBe(1);
    const { data: rf } = await db.from("merch_card_refunds").select("reason,amount_minor").eq("order_id", o!.id);
    expect(rf).toEqual([{ reason: "hold_expired", amount_minor: 2500 }]);
    expect((await db.from("stock_items").select("reserved").eq("id", stock).single()).data!.reserved).toBe(0);
  });
});
