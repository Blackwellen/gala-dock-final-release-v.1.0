// Q07 · Direct-charge payment foundation — unit specs. No browser, no database, no Stripe: the orchestration service runs
// with a fake Stripe client and an in-memory data layer; webhooks use payloads signed here with a test secret.
// Run: node node_modules/@playwright/test/cli.js test tests/payments --reporter=list
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { connectedMerchantStripe, platformSalesStripe, PaymentRouteError, type StripeClient, type StripeRequest } from "../../src/lib/payments/stripe-client";
import { applicationFee, assertBalanced, commissionMinor, connectedDisputeLines, connectedPayoutLines, directChargeLines, directRefundLines, feePolicyFor, feeRefundLines,
  feeRefundMinor, platformCashDelta, platformSaleLines, refundApplicationFee, sellerReadiness, type SellerAccount } from "../../src/lib/payments/rules";
import { createDirectMerchantCheckout, createOrderGroupCheckouts, createTicketDirectCheckout, getDirectPaymentStatus, refundMerchantCharge, type MarketplaceOrder, type PaymentData } from "../../src/lib/payments/service";
import { contextIsConsistent, isNewer, matchEndpoint, routeEvent, signStripePayload, verifyStripeSignature, webhookDedupeKey, type StripeEvent } from "../../src/lib/payments/webhook-core";
import { detectVariances, duplicateCharges, type InternalPayment } from "../../src/lib/payments/reconcile-core";

// ───────────────────────── fakes ─────────────────────────
class FakeStripe implements StripeClient {
  calls: StripeRequest[] = [];
  sessions = new Map<string, Record<string, unknown>>();
  failNext = false;
  async request<T>(r: StripeRequest): Promise<T> {
    this.calls.push(r);
    if (this.failNext) { this.failNext = false; throw new Error("api_connection_error"); }
    if (r.method === "POST" && r.path === "checkout/sessions") {
      // Stripe idempotency: the same key returns the same session.
      const existing = [...this.sessions.values()].find(s => s._idem === r.idempotencyKey && s._account === r.stripeAccount);
      if (existing) return existing as T;
      const id = `cs_test_${this.sessions.size + 1}`;
      const s = { id, url: `https://checkout.stripe.test/${id}`, status: "open", payment_status: "unpaid", _idem: r.idempotencyKey, _account: r.stripeAccount, params: r.params,
        amount_total: Object.entries(r.params ?? {}).filter(([k]) => k.endsWith("[unit_amount]")).reduce((a, [k, v]) => a + Number(v) * Number(r.params![k.replace("[price_data][unit_amount]", "[quantity]")] ?? 1), 0),
        client_reference_id: r.params?.client_reference_id ?? null, currency: r.params?.["line_items[0][price_data][currency]"] ?? "gbp", metadata: {}, payment_intent: null };
      this.sessions.set(id, s); return s as T;
    }
    if (r.method === "GET" && r.path.startsWith("checkout/sessions/")) {
      const s = this.sessions.get(decodeURIComponent(r.path.split("/")[2].split("?")[0]));
      if (!s || s._account !== r.stripeAccount) throw new Error("resource_missing");   // objects live in one account context only
      return s as T;
    }
    if (r.method === "POST" && r.path === "refunds") return { id: `re_${this.calls.length}`, status: "succeeded", amount: Number(r.params?.amount ?? 0), currency: "gbp", payment_intent: r.params?.payment_intent, metadata: {} } as T;
    if (r.method === "POST" && r.path === "payment_methods") return { id: "pm_clone_1" } as T;
    throw new Error(`unexpected ${r.method} ${r.path}`);
  }
  pay(id: string, o: { pi: string; amount?: number; fee?: number | null }) {
    const s = this.sessions.get(id)!;
    Object.assign(s, { payment_status: "paid", status: "complete", payment_intent: { id: o.pi, status: "succeeded", amount_received: o.amount ?? s.amount_total, latest_charge: `ch_${o.pi}`, application_fee_amount: o.fee === undefined ? Number((s.params as Record<string, string>)["payment_intent_data[application_fee_amount]"]) : o.fee } });
  }
}

const ready = (ws: string, acct: string, over: Partial<SellerAccount> = {}): SellerAccount => ({ workspace_id: ws, name: "Seller", stripe_account_id: acct, charges_enabled: true, card_payments: "active",
  details_submitted: true, disabled_reason: null, past_due: [], country: "GB", default_currency: "gbp", ...over });

class MemoryData implements PaymentData {
  sellers = new Map<string, SellerAccount>();
  orders = new Map<string, MarketplaceOrder>();
  tickets = new Map<string, { seller: string; account: string; fee: number; session?: string }>();
  async sellerAccount(ws: string) { return this.sellers.get(ws) ?? null; }
  async prepareMarketplaceOrder(ref: string, account: string) {
    const o = this.orders.get(ref)!;
    const s = [...this.sellers.values()].find(x => x.workspace_id === o.payee_workspace_id);
    if (!sellerReadiness(s).ready || s!.stripe_account_id !== account) throw new Error("seller_not_ready");   // same check as payment_order_direct_prepare
    if (o.strategy === "direct" && o.payee_connected_account_id !== account && o.stripe_checkout_session) throw new Error("merchant_changed");
    Object.assign(o, { strategy: "direct", payee_connected_account_id: account, application_fee_minor: Math.min(o.platform_fee_minor + o.customer_fee_minor, o.amount_minor + o.customer_fee_minor) });
    return { ...o };
  }
  async markMarketplacePending(ref: string, session: string) { Object.assign(this.orders.get(ref)!, { status: "payment_pending", stripe_checkout_session: session }); }
  async prepareTicketOrder(ref: string, seller: string, account: string, fee: number) {
    if (!sellerReadiness(this.sellers.get(seller)).ready) throw new Error("seller_not_ready");
    this.tickets.set(ref, { seller, account, fee });
  }
  async setTicketSession(ref: string, session: string) { this.tickets.get(ref)!.session = session; }
}

const order = (ref: string, ws: string, over: Partial<MarketplaceOrder> = {}): MarketplaceOrder => ({ reference: ref, kind: "deposit", status: "amount_due", amount_minor: 30000, customer_fee_minor: 750,
  platform_fee_minor: 2400, application_fee_minor: null, currency: "GBP", description: "Deposit — Riverside Hall", payee_workspace_id: ws, stripe_checkout_session: null,
  payee_connected_account_id: null, strategy: "separate_transfer", ...over });

function setup() {
  const stripe = new FakeStripe(), data = new MemoryData();
  data.sellers.set("ws-a", ready("ws-a", "acct_A1")); data.sellers.set("ws-b", ready("ws-b", "acct_B2"));
  return { stripe, data, deps: { stripe, data, now: () => Date.parse("2026-10-28T12:00:00Z") } };
}
const urls = { customerEmail: "buyer@example.test", successUrl: "https://x.test/ok", cancelUrl: "https://x.test/no" };

// ───────────────────────── fees ─────────────────────────
test.describe("application fee (125.C)", () => {
  test("commission from the rule, capped at the amount; customer fees added; fee <= gross", () => {
    expect(commissionMinor(30000, { rate_bps: 800 })).toBe(2400);
    expect(commissionMinor(30000, { rate_bps: 800, fixed_minor: 30 })).toBe(2430);
    expect(commissionMinor(100, { rate_bps: 5000, fixed_minor: 500 })).toBe(100);
    expect(commissionMinor(333, { rate_bps: 1000 })).toBe(33);
    expect(applicationFee({ amountMinor: 30000, commissionMinor: 2400, customerFeeMinor: 750 })).toEqual({ grossMinor: 30750, applicationFeeMinor: 3150, sellerNetMinor: 27600 });
  });
  test("invalid inputs are rejected, never silently charged", () => {
    expect(() => commissionMinor(1.5, { rate_bps: 800 })).toThrow("invalid_amount");
    expect(() => commissionMinor(100, { rate_bps: 9000 })).toThrow("invalid_fee_rule");
    expect(() => commissionMinor(100, { rate_bps: -1 })).toThrow("invalid_fee_rule");
    expect(() => applicationFee({ amountMinor: 100, commissionMinor: 200, customerFeeMinor: 0 })).toThrow("invalid_application_fee");
  });
});

// ───────────────────────── seller readiness ─────────────────────────
test.describe("seller readiness fails closed (123.B.3, 125.3)", () => {
  test("every blocking state has its own reason", () => {
    expect(sellerReadiness(null)).toEqual({ ready: false, reason: "no_account" });
    expect(sellerReadiness(ready("w", "acct_1", { stripe_account_id: "bogus" }))).toEqual({ ready: false, reason: "no_account" });
    expect(sellerReadiness(ready("w", "acct_1", { disabled_reason: "requirements.past_due" }))).toEqual({ ready: false, reason: "restricted" });
    expect(sellerReadiness(ready("w", "acct_1", { past_due: ["external_account"] }))).toEqual({ ready: false, reason: "requirements_past_due" });
    expect(sellerReadiness(ready("w", "acct_1", { charges_enabled: false }))).toEqual({ ready: false, reason: "charges_disabled" });
    expect(sellerReadiness(ready("w", "acct_1", { card_payments: "inactive" }))).toEqual({ ready: false, reason: "card_payments_inactive" });
    expect(sellerReadiness(ready("w", "acct_1"))).toEqual({ ready: true, account: "acct_1" });
  });
  test("checkout is blocked before any Stripe call when the seller isn't ready", async () => {
    const { stripe, data, deps } = setup();
    data.sellers.set("ws-a", ready("ws-a", "acct_A1", { card_payments: "inactive" }));
    data.orders.set("PO-AAAA0001", order("PO-AAAA0001", "ws-a"));
    const r = await createDirectMerchantCheckout(deps, { order: data.orders.get("PO-AAAA0001")!, ...urls });
    expect(r).toMatchObject({ ok: false, code: "seller_not_ready" });
    expect(stripe.calls).toHaveLength(0);
  });
  test("account restricted between order creation and payment start: blocked", async () => {
    const { stripe, data, deps } = setup();
    data.orders.set("PO-AAAA0002", order("PO-AAAA0002", "ws-a"));
    const o = data.orders.get("PO-AAAA0002")!;
    data.sellers.set("ws-a", ready("ws-a", "acct_A1", { disabled_reason: "rejected.fraud" }));
    expect(await createDirectMerchantCheckout(deps, { order: o, ...urls })).toMatchObject({ ok: false, code: "seller_not_ready" });
    expect(stripe.calls).toHaveLength(0);
  });
});

// ───────────────────────── orchestration service ─────────────────────────
test.describe("marketplace direct charge (123.1, 123.J)", () => {
  test("charge is created in the seller's account context with the DB fee as application_fee_amount", async () => {
    const { stripe, data, deps } = setup();
    data.orders.set("PO-AAAA0003", order("PO-AAAA0003", "ws-a"));
    const r = await createDirectMerchantCheckout(deps, { order: data.orders.get("PO-AAAA0003")!, ...urls });
    expect(r).toMatchObject({ ok: true, account: "acct_A1", reused: false });
    expect(stripe.calls).toHaveLength(1);
    const c = stripe.calls[0];
    expect(c.stripeAccount).toBe("acct_A1");
    expect(c.params!["payment_intent_data[application_fee_amount]"]).toBe("3150");     // 2400 commission + 750 customer admin fee
    expect(c.params!["line_items[0][price_data][unit_amount]"]).toBe("30000");
    expect(c.params!["line_items[1][price_data][unit_amount]"]).toBe("750");
    expect(Object.keys(c.params!).some(k => /transfer|destination|on_behalf_of/.test(k))).toBe(false);
    expect(c.idempotencyKey).toMatch(/^PO-AAAA0003:direct:acct_A1:/);
    expect(data.orders.get("PO-AAAA0003")).toMatchObject({ strategy: "direct", payee_connected_account_id: "acct_A1", status: "payment_pending", stripe_checkout_session: "cs_test_1" });
  });
  test("duplicate submit cannot double charge: the open session is reused", async () => {
    const { stripe, data, deps } = setup();
    data.orders.set("PO-AAAA0004", order("PO-AAAA0004", "ws-a"));
    const first = await createDirectMerchantCheckout(deps, { order: data.orders.get("PO-AAAA0004")!, ...urls });
    const second = await createDirectMerchantCheckout(deps, { order: data.orders.get("PO-AAAA0004")!, ...urls });
    expect(first.ok && second.ok && first.sessionId === second.sessionId).toBe(true);
    expect(second).toMatchObject({ reused: true });
    expect(stripe.calls.filter(c => c.method === "POST")).toHaveLength(1);
    expect(stripe.calls[1]).toMatchObject({ method: "GET", stripeAccount: "acct_A1" });
  });
  test("concurrent double submit hits Stripe with the same idempotency key → one session", async () => {
    const { stripe, data, deps } = setup();
    data.orders.set("PO-AAAA0005", order("PO-AAAA0005", "ws-a"));
    const o = data.orders.get("PO-AAAA0005")!;
    const [a, b] = await Promise.all([createDirectMerchantCheckout(deps, { order: { ...o }, ...urls }), createDirectMerchantCheckout(deps, { order: { ...o }, ...urls })]);
    expect(a.ok && b.ok && a.sessionId === b.sessionId).toBe(true);
    expect(stripe.sessions.size).toBe(1);
  });
  test("Stripe outage is reported without marking anything paid", async () => {
    const { stripe, data, deps } = setup();
    data.orders.set("PO-AAAA0006", order("PO-AAAA0006", "ws-a"));
    stripe.failNext = true;
    expect(await createDirectMerchantCheckout(deps, { order: data.orders.get("PO-AAAA0006")!, ...urls })).toMatchObject({ ok: false, code: "stripe_unavailable" });
    expect(data.orders.get("PO-AAAA0006")!.status).toBe("amount_due");
  });
  test("payment status is read in the seller's context; a redirect alone proves nothing", async () => {
    const { stripe, data, deps } = setup();
    data.orders.set("PO-AAAA0007", order("PO-AAAA0007", "ws-a"));
    const r = await createDirectMerchantCheckout(deps, { order: data.orders.get("PO-AAAA0007")!, ...urls });
    if (!r.ok) throw new Error("expected session");
    expect((await getDirectPaymentStatus(deps, "acct_A1", r.sessionId)).paid).toBe(false);
    stripe.pay(r.sessionId, { pi: "pi_1" });
    expect(await getDirectPaymentStatus(deps, "acct_A1", r.sessionId)).toMatchObject({ paid: true, paymentIntent: "pi_1", amountMinor: 30750, applicationFeeMinor: 3150, reference: "PO-AAAA0007" });
    await expect(getDirectPaymentStatus(deps, "acct_B2", r.sessionId)).rejects.toThrow("resource_missing");   // wrong account context
  });
  test("multi-vendor cart: one direct charge per seller, partial success preserved (123.C)", async () => {
    const { stripe, data, deps } = setup();
    data.sellers.set("ws-c", ready("ws-c", "acct_C3", { charges_enabled: false }));
    for (const [ref, ws] of [["PO-GRP00001", "ws-a"], ["PO-GRP00002", "ws-b"], ["PO-GRP00003", "ws-c"]]) data.orders.set(ref, order(ref, ws));
    const g = await createOrderGroupCheckouts(deps, "OG-1", [...data.orders.values()].map(o => ({ order: o, successUrl: urls.successUrl, cancelUrl: urls.cancelUrl })), urls.customerEmail);
    expect(g.state).toBe("partial");
    expect(g.results.map(r => r.result.ok)).toEqual([true, true, false]);
    expect(stripe.calls.map(c => c.stripeAccount)).toEqual(["acct_A1", "acct_B2"]);
    expect(stripe.calls.every(c => c.params!["payment_intent_data[application_fee_amount]"] === "3150")).toBe(true);
    expect(data.orders.get("PO-GRP00001")!.status).toBe("payment_pending");
  });
  test("ticket sale: direct charge on the organiser with booking fee + commission as the application fee", async () => {
    const { stripe, data, deps } = setup();
    const r = await createTicketDirectCheckout(deps, { orderRef: "GD-ABCDE12345", eventId: "e1", eventName: "Neon Nights", sellerWorkspaceId: "ws-b", currency: "GBP", customerEmail: "b@x.test",
      lines: [{ name: "GA", unitMinor: 2500, qty: 2 }, { name: "VIP", unitMinor: 6000, qty: 1, description: "A1" }], bookingFeeMinor: 330, commissionMinor: 440, feeRule: {},
      successUrl: urls.successUrl, cancelUrl: urls.cancelUrl, expiresAtSec: 1_900_000_000 });
    expect(r).toMatchObject({ ok: true, account: "acct_B2" });
    const p = stripe.calls[0].params!;
    expect(stripe.calls[0].stripeAccount).toBe("acct_B2");
    expect(p["payment_intent_data[application_fee_amount]"]).toBe("770");
    expect(p["line_items[2][price_data][unit_amount]"]).toBe("330");
    expect(stripe.sessions.get("cs_test_1")!.amount_total).toBe(11330);
    expect(data.tickets.get("GD-ABCDE12345")).toMatchObject({ seller: "ws-b", account: "acct_B2", fee: 770, session: "cs_test_1" });
  });
  test("ticket sale with no ready organiser account is not purchasable", async () => {
    const { stripe, deps } = setup();
    const r = await createTicketDirectCheckout(deps, { orderRef: "GD-X", eventId: "e1", eventName: "E", sellerWorkspaceId: "ws-none", currency: "GBP", customerEmail: "", lines: [{ name: "GA", unitMinor: 100, qty: 1 }],
      bookingFeeMinor: 0, commissionMinor: 0, feeRule: {}, successUrl: "", cancelUrl: "", expiresAtSec: 1 });
    expect(r).toMatchObject({ ok: false, code: "seller_not_ready" });
    expect(stripe.calls).toHaveLength(0);
  });
});

// ───────────────────────── adapters ─────────────────────────
test.describe("adapter restrictions (124.B)", () => {
  test("connected adapter requires an account and an application fee and rejects transfer/destination params", () => {
    const c = connectedMerchantStripe(new FakeStripe());
    const base = { mode: "payment", "payment_intent_data[application_fee_amount]": "10" };
    expect(() => c.createCheckout("", base, "k")).toThrow(PaymentRouteError);
    expect(() => c.createCheckout("acct_1", { mode: "payment" }, "k")).toThrow("application_fee_required");
    for (const k of ["payment_intent_data[transfer_data][destination]", "payment_intent_data[transfer_group]", "payment_intent_data[on_behalf_of]", "source_transaction", "destination"])
      expect(() => c.createCheckout("acct_1", { ...base, [k]: "x" }, "k")).toThrow(/forbidden_param/);
    expect(() => c.retrieve("acct_1", "transfers")).toThrow("forbidden_path");
  });
  test("platform adapter refuses marketplace purposes and application fees", () => {
    const p = platformSalesStripe(new FakeStripe());
    expect(() => p.createCheckout("deposit" as never, { mode: "payment" }, "k")).toThrow("marketplace_charge_on_platform");
    expect(() => p.createCheckout("ticket_order" as never, { mode: "payment" }, "k")).toThrow("marketplace_charge_on_platform");
    expect(() => p.createCheckout("platform_boost", { mode: "payment", "payment_intent_data[application_fee_amount]": "1" }, "k")).toThrow("application_fee_on_platform_sale");
  });
});

// ───────────────────────── refunds ─────────────────────────
test.describe("refunds on the connected charge (130, 125.D)", () => {
  test("fee policy by reason", () => {
    expect(feePolicyFor("provider_cancelled")).toBe("full");
    expect(feePolicyFor("event_cancelled")).toBe("full");
    expect(feePolicyFor("hold_expired")).toBe("full");
    expect(feePolicyFor("partial_service_failure")).toBe("proportional");
    expect(feePolicyFor("customer_cancelled")).toBe("retained");
    expect(feePolicyFor("goodwill")).toBe("retained");
    expect(refundApplicationFee("retained")).toBe(false);
    expect(feeRefundMinor("proportional", { refundMinor: 15375, grossMinor: 30750, feeMinor: 3150 })).toBe(1575);
    expect(feeRefundMinor("retained", { refundMinor: 30750, grossMinor: 30750, feeMinor: 3150 })).toBe(0);
    expect(() => feeRefundMinor("full", { refundMinor: 40000, grossMinor: 30750, feeMinor: 3150 })).toThrow("refund_exceeds_charge");
  });
  test("provider cancellation refunds on the seller account and returns the fee; customer cancellation keeps it", async () => {
    const { stripe, deps } = setup();
    await refundMerchantCharge(deps, { account: "acct_A1", paymentIntent: "pi_1", amountMinor: 30750, reason: "provider_cancelled", idempotencyKey: "refund:c1:PO-1" });
    await refundMerchantCharge(deps, { account: "acct_A1", paymentIntent: "pi_2", amountMinor: 10000, reason: "customer_cancelled", idempotencyKey: "refund:c2:PO-2" });
    expect(stripe.calls.map(c => [c.stripeAccount, c.params!.refund_application_fee, c.idempotencyKey])).toEqual([["acct_A1", "true", "refund:c1:PO-1"], ["acct_A1", "false", "refund:c2:PO-2"]]);
    await expect(refundMerchantCharge(deps, { account: "acct_A1", paymentIntent: "pi_3", amountMinor: 0, reason: "goodwill", idempotencyKey: "k" })).rejects.toThrow("invalid_refund_amount");
    await expect(refundMerchantCharge(deps, { account: "", paymentIntent: "pi_3", reason: "goodwill", idempotencyKey: "k" })).rejects.toThrow("connected_account_required");
  });
});

// ───────────────────────── ledger ─────────────────────────
test.describe("ledger posting rules (127)", () => {
  test("direct charge: balanced, GMV is seller-side, platform cash moves only by the application fee", () => {
    const lines = directChargeLines({ grossMinor: 30750, feeMinor: 3150, vatMinor: 525, seller: "ws-a" });
    expect(lines.reduce((a, l) => a + l.amount_minor, 0)).toBe(0);
    expect(platformCashDelta(lines)).toBe(3150);
    expect(lines.find(l => l.account === "merchant_gmv")).toMatchObject({ amount_minor: -30750, party_type: "workspace", party_id: "ws-a" });
    expect(lines.find(l => l.account === "seller_connected_balance")!.amount_minor).toBe(27600);
    expect(lines.find(l => l.account === "tax_payable")!.amount_minor).toBe(-525);
    expect(lines.some(l => l.account === "provider_payable")).toBe(false);   // no Gala Dock liability to the seller
  });
  test("refund, fee refund, dispute and payout postings all balance; only the fee refund touches platform cash", () => {
    const sets = [directRefundLines({ refundMinor: 1000, seller: "s" }), feeRefundLines({ feeRefundMinor: 315, vatRefundMinor: 52, seller: "s" }),
      connectedDisputeLines({ amountMinor: 30750, seller: "s", withdrawn: true }), connectedDisputeLines({ amountMinor: 30750, seller: "s", withdrawn: false }),
      connectedPayoutLines({ amountMinor: 27600, seller: "s" }), connectedPayoutLines({ amountMinor: 27600, seller: "s", failed: true })];
    for (const s of sets) expect(s.reduce((a, l) => a + l.amount_minor, 0)).toBe(0);
    expect(sets.map(platformCashDelta)).toEqual([0, -315, 0, 0, 0, 0]);
    expect(platformSaleLines({ grossMinor: 4900, vatMinor: 817 }).reduce((a, l) => a + l.amount_minor, 0)).toBe(0);
  });
  test("randomised: every direct charge + refund + fee refund keeps platform cash = net fee", () => {
    let seed = 7; const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % n;
    for (let i = 0; i < 500; i++) {
      const gross = 100 + rnd(500000), fee = rnd(gross + 1), vat = rnd(fee + 1), refund = rnd(gross + 1), fr = feeRefundMinor("proportional", { refundMinor: refund, grossMinor: gross, feeMinor: fee });
      const all = [...directChargeLines({ grossMinor: gross, feeMinor: fee, vatMinor: vat, seller: "s" }), ...(refund ? directRefundLines({ refundMinor: refund, seller: "s" }) : []),
        ...(fr ? feeRefundLines({ feeRefundMinor: fr, vatRefundMinor: Math.min(fr, Math.floor(fr * vat / Math.max(fee, 1))), seller: "s" }) : [])];
      expect(all.reduce((a, l) => a + l.amount_minor, 0)).toBe(0);
      expect(platformCashDelta(all)).toBe(fee - fr);
    }
  });
  test("unbalanced or single-line postings are rejected", () => {
    expect(() => assertBalanced([{ account: "cash_stripe", amount_minor: 1, party_type: "platform" }, { account: "platform_fee", amount_minor: -2, party_type: "platform" }])).toThrow("ledger_unbalanced");
    expect(() => assertBalanced([{ account: "cash_stripe", amount_minor: 0, party_type: "platform" }])).toThrow("ledger_too_few_lines");
  });
});

// ───────────────────────── webhooks ─────────────────────────
test.describe("webhooks (123.H, 258.3)", () => {
  const SECRET = "whsec_test_platform", CONNECT = "whsec_test_connect";
  const ev = (o: Partial<StripeEvent>): StripeEvent => ({ id: "evt_1", type: "payment_intent.succeeded", created: 100, data: { object: { id: "pi_1" } }, ...o });
  test("signature: valid, tampered, wrong secret, expired", () => {
    const body = JSON.stringify(ev({})), now = 1_800_000_000;
    const sig = signStripePayload(body, SECRET, now);
    expect(verifyStripeSignature(body, sig, SECRET, now)).toBe(true);
    expect(verifyStripeSignature(body + " ", sig, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, sig, CONNECT, now)).toBe(false);
    expect(verifyStripeSignature(body, sig, SECRET, now + 301)).toBe(false);
    expect(verifyStripeSignature(body, null, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, "t=1,v1=00", SECRET, now)).toBe(false);
  });
  test("the Connect endpoint secret identifies Connect deliveries", () => {
    const body = JSON.stringify(ev({ account: "acct_A1" })), now = 1_800_000_000;
    const secrets = [{ secret: SECRET, endpoint: "platform" as const }, { secret: CONNECT, endpoint: "connect" as const }];
    expect(matchEndpoint(body, signStripePayload(body, CONNECT, now), secrets, now)).toBe("connect");
    expect(matchEndpoint(body, signStripePayload(body, SECRET, now), secrets, now)).toBe("platform");
    expect(matchEndpoint(body, signStripePayload(body, "whsec_other", now), secrets, now)).toBeNull();
  });
  test("dedupe is per event id + account context; legacy platform keys unchanged", () => {
    expect(webhookDedupeKey({ id: "evt_1" })).toBe("evt_1");
    expect(webhookDedupeKey({ id: "evt_1", account: "acct_A1" })).toBe("acct_A1:evt_1");
    expect(webhookDedupeKey({ id: "evt_1", account: "acct_A1" })).not.toBe(webhookDedupeKey({ id: "evt_1", account: "acct_B2" }));
  });
  test("account context must match the endpoint", () => {
    expect(contextIsConsistent(ev({ account: "acct_A1" }), "connect")).toBe(true);
    expect(contextIsConsistent(ev({}), "connect")).toBe(false);
    expect(contextIsConsistent(ev({ account: "acct_A1" }), "platform")).toBe(false);
    expect(contextIsConsistent(ev({ account: "nope" }), "connect")).toBe(false);
  });
  test("routing covers Connect payouts, connected disputes and application fees", () => {
    expect(routeEvent(ev({ type: "payout.paid", account: "acct_A1" }))).toBe("payout");
    expect(routeEvent(ev({ type: "payout.paid" }))).toBe("ignored");
    expect(routeEvent(ev({ type: "charge.dispute.funds_withdrawn", account: "acct_A1" }))).toBe("dispute");
    expect(routeEvent(ev({ type: "application_fee.refunded" }))).toBe("application_fee");
    expect(routeEvent(ev({ type: "capability.updated", account: "acct_A1" }))).toBe("account_updated");
    expect(routeEvent(ev({ type: "checkout.session.async_payment_succeeded" }))).toBe("checkout_completed");
    expect(routeEvent(ev({ type: "customer.created" }))).toBe("ignored");
  });
  test("order tolerance: an older event never overwrites a newer mirror", () => {
    expect(isNewer(null, 5)).toBe(true);
    expect(isNewer(10, 10)).toBe(true);
    expect(isNewer(10, 9)).toBe(false);
  });
});

// ───────────────────────── reconciliation ─────────────────────────
test.describe("reconciliation variances (128.6)", () => {
  const i = (o: Partial<InternalPayment> = {}): InternalPayment => ({ sourceType: "payment_order", ref: "PO-1", strategy: "direct", status: "protected_pending_delivery", account: "acct_A1", sessionId: "cs_1",
    paymentIntent: "pi_1", grossMinor: 30750, applicationFeeMinor: 3150, currency: "GBP", ...o });
  const s = { found: true, account: "acct_A1", paid: true, amountMinor: 30750, currency: "gbp", applicationFeeMinor: 3150, paymentIntent: "pi_1" };
  test("clean match has no variances", () => expect(detectVariances(i(), s)).toEqual([]));
  test("each mismatch is detected", () => {
    const names = (x: ReturnType<typeof detectVariances>) => x.map(v => v.variance);
    expect(names(detectVariances(i(), { ...s, account: "acct_B2" }))).toContain("wrong_account_context");
    expect(names(detectVariances(i(), { ...s, applicationFeeMinor: null }))).toContain("missing_application_fee");
    expect(names(detectVariances(i(), { ...s, applicationFeeMinor: 100 }))).toContain("application_fee_mismatch");
    expect(names(detectVariances(i(), { ...s, amountMinor: 1 }))).toContain("amount_mismatch");
    expect(names(detectVariances(i({ status: "payment_pending" }), s))).toContain("charge_without_booking_update");
    expect(names(detectVariances(i(), { ...s, paid: false }))).toContain("booking_paid_without_charge");
    expect(names(detectVariances(i(), null))).toContain("booking_paid_without_charge");
    expect(names(detectVariances(i({ account: null }), s))).toContain("missing_seller_connected_account");
    expect(names(detectVariances(i(), { ...s, transferIds: ["tr_1"] }))).toContain("unexpected_transfer");
    expect(names(detectVariances(i({ strategy: "separate_transfer" }), null))).toEqual(["legacy_platform_collection"]);
    expect(detectVariances(i({ strategy: "platform" }), null)).toEqual([]);
    expect(duplicateCharges([{ ref: "PO-1", paymentIntent: "pi_1" }, { ref: "PO-1", paymentIntent: "pi_2" }, { ref: "PO-2", paymentIntent: "pi_3" }])).toEqual([{ ref: "PO-1", paymentIntents: ["pi_1", "pi_2"] }]);
  });
});

// ───────────────────────── static architecture guard ─────────────────────────
test.describe("no platform-collection pattern in core seller flows (123.B.7, 128.B)", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []);
  // Allowed: the adapter's own forbidden-parameter list, the legacy refund/reversal path for pre-switch orders, and the read-only
  // transfer scan that detects anomalies.
  const ALLOW = new Set(["src/lib/payments/stripe-client.ts", "src/lib/commerce/legacy-platform-refunds.ts", "src/lib/payments/reconcile-job.ts"].map(p => path.join(ROOT, p)));
  const PATTERNS: [string, RegExp][] = [["transfers.create", /transfers\.create/], ["Stripe transfers endpoint", /(stripe\w*(<[^>]*>)?\(\s*|path:\s*)["'`]transfers/], ["transfer_data", /transfer_data/],
    ["transfer_group", /transfer_group/], ["source_transaction", /source_transaction/], ["destination param", /\bdestination\s*:\s*acct|\[destination\]|["']destination["']\s*:/]];
  test("src/ has no transfers.create / transfer_data / destination charges outside the allowlist", () => {
    const hits: string[] = [];
    for (const f of walk(path.join(ROOT, "src"))) {
      if (ALLOW.has(f)) continue;
      const text = fs.readFileSync(f, "utf8");
      for (const [name, re] of PATTERNS) if (re.test(text)) hits.push(`${path.relative(ROOT, f)}: ${name}`);
    }
    expect(hits).toEqual([]);
  });
  test("forbidden custody / FCA wording is absent from app surfaces (123.I, 126)", () => {
    const BANNED = /held by gala dock|gala dock holds your money|funds held|fca protected|fca regulated|client money held|held in (gala dock )?escrow|released by gala dock|protected until (delivery|the service)|held safely/i;
    const dirs = ["src/components", "src/lib", "src/app/(customer)", "src/app/provider", "src/app/organizer", "src/app/checkout", "src/app/pay", "src/app/payments", "src/app/admin"];
    const hits = dirs.flatMap(d => fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : [])
      .filter(f => !f.includes(path.join("src", "lib", "payments")) && !f.endsWith("orchestrator.ts") && BANNED.test(fs.readFileSync(f, "utf8"))).map(f => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
  test("migrations: direct orders are excluded from the release scan and custody is derived, never defaulted", () => {
    const rpc = fs.readFileSync(path.join(ROOT, "supabase/migrations/202610291009_direct_charge_rpcs.sql"), "utf8");
    const schema = fs.readFileSync(path.join(ROOT, "supabase/migrations/202610291008_direct_charge_schema.sql"), "utf8");
    expect(rpc).toMatch(/and po\.strategy <> 'direct'/);
    expect(schema).toMatch(/funds_custodied_by_platform boolean generated always as \(strategy in \('separate_transfer','destination'\)\) stored/);
    expect(schema).not.toMatch(/escrow_accounts|wallet_balances|client_money_accounts/);
    expect(rpc).not.toMatch(/transfers|transfer_data/);
  });
});
