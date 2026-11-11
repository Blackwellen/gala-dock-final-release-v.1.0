// DEC-107 on Stripe (owner 2026-11-11) — unit specs. No browser, no database, no Stripe: pure rules + a fake Stripe client.
// Run: npx playwright test tests/payments/dec107-rules.spec.ts --project=desktop --workers=1 --trace=off
import { test, expect } from "@playwright/test";
import { connectedMerchantStripe, platformFeeStripe, PaymentRouteError, type StripeClient, type StripeRequest } from "../../src/lib/payments/stripe-client";
import { adminFeeRefundable, dec107FeeRefund } from "../../src/lib/payments/rules";
import { refundMerchantCharge } from "../../src/lib/payments/service";
import { capGroupToAvailable, planReleaseGroups, reserveSplit, type DueRelease } from "../../src/lib/payments/releases-core";

class FakeStripe implements StripeClient {
  calls: StripeRequest[] = [];
  constructor(private charge = { id: "ch_1", amount: 11000, amount_refunded: 0, currency: "gbp", application_fee: "fee_1", application_fee_amount: 1800 }, private fee = { id: "fee_1", amount: 1800, amount_refunded: 0, currency: "gbp", account: "acct_S" }) {}
  async request<T>(r: StripeRequest): Promise<T> {
    this.calls.push(r);
    if (r.path.startsWith("payment_intents/")) return { id: "pi_1", latest_charge: this.charge } as T;
    if (r.path === "application_fees/fee_1") return this.fee as T;
    if (r.path.startsWith("application_fees?charge=")) return { data: this.charge.application_fee ? [this.fee] : [] } as T;
    if (r.path === "refunds") return { id: "re_1", status: "succeeded", amount: Number(r.params?.amount), currency: "gbp", payment_intent: "pi_1", metadata: {} } as T;
    if (r.path === "application_fees/fee_1/refunds") return { id: "fr_1", amount: Number(r.params?.amount) } as T;
    if (r.path === "payouts") return { id: "po_1", status: "pending", amount: Number(r.params?.amount) } as T;
    throw new Error(`unexpected ${r.method} ${r.path}`);
  }
}

test.describe("DEC-107 fee refunds", () => {
  test("seller fee refunded pro rata; admin fee kept on a customer cancellation", () => {
    // £100 price + £10 admin fee; application fee = £8 seller fee + £10 admin fee. Customer cancels, £50 back.
    const r = dec107FeeRefund({ refundMinor: 5000, customerFeeRefundMinor: 0, sellerAmountMinor: 10000, sellerFeeMinor: 800 });
    expect(r).toEqual({ priceMinor: 5000, sellerFeeRefundMinor: 400, customerFeeRefundMinor: 0, applicationFeeRefundMinor: 400 });
    expect(adminFeeRefundable("customer_cancelled")).toBe(false);
  });
  test("event / provider cancellation refunds everything (law): whole seller fee and the admin fee", () => {
    const r = dec107FeeRefund({ refundMinor: 11000, customerFeeRefundMinor: 1000, sellerAmountMinor: 10000, sellerFeeMinor: 800 });
    expect(r.applicationFeeRefundMinor).toBe(1800);
    expect(adminFeeRefundable("event_cancelled") && adminFeeRefundable("provider_cancelled")).toBe(true);
  });
  test("never more than the fee left, never a negative or oversize refund", () => {
    expect(dec107FeeRefund({ refundMinor: 11000, customerFeeRefundMinor: 1000, sellerAmountMinor: 10000, sellerFeeMinor: 800, feeRemainingMinor: 300 }).applicationFeeRefundMinor).toBe(300);
    expect(() => dec107FeeRefund({ refundMinor: 12000, customerFeeRefundMinor: 0, sellerAmountMinor: 10000, sellerFeeMinor: 800 })).toThrow("refund_exceeds_price");
    expect(() => dec107FeeRefund({ refundMinor: 100, customerFeeRefundMinor: 200, sellerAmountMinor: 10000, sellerFeeMinor: 800 })).toThrow("fee_part_exceeds_refund");
  });
  test("refundMerchantCharge (split): refund on the seller's account without auto fee refund, then an explicit application-fee refund", async () => {
    const stripe = new FakeStripe();
    const out = await refundMerchantCharge({ stripe, data: null as never }, { account: "acct_S", paymentIntent: "pi_1", amountMinor: 5000, reason: "customer_cancelled", idempotencyKey: "refund:c1:PO-1",
      split: { sellerAmountMinor: 10000, sellerFeeMinor: 800, customerFeeRefundMinor: 0 } });
    const refund = stripe.calls.find(c => c.path === "refunds")!;
    expect(refund.stripeAccount).toBe("acct_S");
    expect(refund.params).toMatchObject({ amount: "5000", refund_application_fee: "false", "metadata[seller_fee_refund_minor]": "400" });
    const fee = stripe.calls.find(c => c.path === "application_fees/fee_1/refunds")!;
    expect(fee.stripeAccount).toBeUndefined();                         // platform object
    expect(fee.params).toMatchObject({ amount: "400" });
    expect(fee.idempotencyKey).toBe("refund:c1:PO-1:fee");
    expect(out.feeRefund?.amount).toBe(400);
  });
  test("refuses to refund before the application fee is linked (worker retries whole)", async () => {
    const stripe = new FakeStripe({ id: "ch_1", amount: 11000, amount_refunded: 0, currency: "gbp", application_fee: null as never, application_fee_amount: 1800 });
    await expect(refundMerchantCharge({ stripe, data: null as never }, { account: "acct_S", paymentIntent: "pi_1", amountMinor: 5000, reason: "customer_cancelled", idempotencyKey: "k",
      split: { sellerAmountMinor: 10000, sellerFeeMinor: 800, customerFeeRefundMinor: 0 } })).rejects.toThrow("application_fee_not_linked");
    expect(stripe.calls.some(c => c.path === "refunds")).toBe(false);
  });
});

test.describe("DEC-107 releases", () => {
  const row = (o: Partial<DueRelease>): DueRelease => ({ id: "r", part: "main", workspace_id: "ws1", stripe_account_id: "acct_S", payment_intent: "pi_1", event_id: "ev1",
    sale_kind: "ticket_sale", currency: "GBP", source_type: "checkout_order", source_ref: "GD-1", reserve_minor: null, trigger: "event_completed_review", ...o });
  test("reserves are objective and capped at 50 %", () => {
    expect(reserveSplit(10000, { kind: "standard", bps: 1000, days: 30 })).toEqual({ payMinor: 9000, reserveMinor: 1000 });
    expect(reserveSplit(10000, null)).toEqual({ payMinor: 10000, reserveMinor: 0 });
    expect(() => reserveSplit(10000, { kind: "risk", bps: 6000, days: 60 })).toThrow("reserve_above_cap");
  });
  test("ticket sales, resales and merch of one event become one payout; another event is separate", () => {
    const nets = new Map([["pi_1", { netMinor: 9000 }], ["pi_2", { netMinor: 4500 }], ["pi_3", { netMinor: 2000 }]]);
    const groups = planReleaseGroups([
      row({ id: "a", payment_intent: "pi_1" }), row({ id: "b", payment_intent: "pi_2", sale_kind: "ticket_resale", source_ref: "GD-R" }),
      row({ id: "c", payment_intent: "pi_3", event_id: "ev2" }), row({ id: "d", part: "reserve", payment_intent: "pi_9", reserve_minor: 700 }),
    ], nets, new Map([["ws1", null]]));
    const ev1 = groups.find(g => g.eventId === "ev1")!;
    expect(ev1.items.map(i => i.id)).toEqual(["a", "b", "d"]);
    expect(ev1.payoutMinor).toBe(9000 + 4500 + 700);
    expect(groups.find(g => g.eventId === "ev2")!.payoutMinor).toBe(2000);
  });
  test("a new seller's main release keeps the standard reserve in its own balance", () => {
    const [g] = planReleaseGroups([row({ id: "a" })], new Map([["pi_1", { netMinor: 10000 }]]), new Map([["ws1", { kind: "standard", bps: 1000, days: 30 }]]));
    expect(g.payoutMinor).toBe(9000);
    expect(g.items[0]).toMatchObject({ amount_minor: 9000, reserve_kind: "standard", reserve_bps: 1000, reserve_minor: 1000, reserve_days: 30 });
  });
  test("covered liability: a short balance pays what is there, items reduced in order, shortfall reported", () => {
    const [g] = planReleaseGroups([row({ id: "a" }), row({ id: "b", payment_intent: "pi_2" })], new Map([["pi_1", { netMinor: 6000 }], ["pi_2", { netMinor: 4000 }]]), new Map());
    const { group, shortfallMinor } = capGroupToAvailable(g, 7000);
    expect(group.payoutMinor).toBe(7000); expect(shortfallMinor).toBe(3000);
    expect(group.items.map(i => i.amount_minor)).toEqual([6000, 1000]);
    expect(capGroupToAvailable(g, 20000).shortfallMinor).toBe(0);
  });
  test("a charge that can't be read blocks its group instead of guessing", () => {
    const [g] = planReleaseGroups([row({ id: "a" })], new Map([["pi_1", { netMinor: 0, error: "no_charge" }]]), new Map());
    expect(g.error).toBe("no_charge");
  });
  test("payouts come from the seller's own balance; transfers are impossible on the seller rail", async () => {
    const stripe = new FakeStripe();
    const m = connectedMerchantStripe(stripe);
    await m.payout("acct_S", { amountMinor: 9000, currency: "GBP", description: "Gala Dock release", metadata: { event_id: "ev1" } }, "release:abc");
    expect(stripe.calls.at(-1)).toMatchObject({ method: "POST", path: "payouts", stripeAccount: "acct_S", idempotencyKey: "release:abc" });
    expect(() => m.retrieve("acct_S", "transfers")).toThrow(PaymentRouteError);
    expect(() => m.payout("acct_S", { amountMinor: 0, currency: "GBP", description: "x", metadata: {} }, "k")).toThrow("invalid_payout_amount");
    expect(() => platformFeeStripe(stripe).refund("tr_1", 10, {}, "k")).toThrow("invalid_application_fee");
  });
});
