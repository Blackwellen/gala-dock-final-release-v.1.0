// Q58 bughunt-money — unit specs for the release-net fixes. No browser, no database, no Stripe.
// Run: npx playwright test tests/payments/money-bughunt.spec.ts --project=desktop --workers=1 --trace=off
// The database fixes (hold-vs-order guard, net price_paid, dispute closes once, owed refund blocks payout) are exercised by
// scripts/db/exercises/202611146201_money_bughunt_fixes.sql (dry-run --exercise).
import { test, expect } from "@playwright/test";
import { capGroupToAvailable, disputedMinor, planReleaseGroups, type DueRelease } from "../../src/lib/payments/releases-core";

const row = (o: Partial<DueRelease> = {}): DueRelease => ({ id: "r1", part: "main", workspace_id: "ws", stripe_account_id: "acct_S", payment_intent: "pi_1", event_id: "ev1",
  sale_kind: "ticket_sale", currency: "GBP", source_type: "checkout_order", source_ref: "GD-1", reserve_minor: null, trigger: "event_completed_review", ...o });

test.describe("release net counts disputed money", () => {
  test("open and lost disputes are deducted; won and inquiry-closed are not", () => {
    expect(disputedMinor([])).toBe(0);
    expect(disputedMinor([{ amount_minor: 1000, outcome: null }])).toBe(1000);
    expect(disputedMinor([{ amount_minor: 1000, outcome: "lost" }])).toBe(1000);
    expect(disputedMinor([{ amount_minor: 1000, outcome: "won" }, { amount_minor: 500, outcome: "warning_closed" }])).toBe(0);
    expect(disputedMinor([{ amount_minor: 1000, outcome: "lost" }, { amount_minor: 700, outcome: null }, { amount_minor: 300, outcome: "won" }])).toBe(1700);
  });

  test("a lost chargeback is not paid out again from the seller's other money", () => {
    // £110 charge, £15 application fee kept, £110 lost dispute → nothing of this sale is payable.
    const gross = 11000, feeKept = 1500, lost = disputedMinor([{ amount_minor: 11000, outcome: "lost" }]);
    const net = Math.max(0, gross - 0 - feeKept - lost);
    const [g] = planReleaseGroups([row()], new Map([["pi_1", { netMinor: net }]]), new Map([["ws", null]]));
    expect(g.payoutMinor).toBe(0);
    // Before Q58 only open disputes counted: the group asked for £95 and the cap paid it from other events' money in the balance.
    const [old] = planReleaseGroups([row()], new Map([["pi_1", { netMinor: gross - feeKept }]]), new Map([["ws", null]]));
    expect(capGroupToAvailable(old, 50_000).group.payoutMinor).toBe(9500);
  });
});

// ── follow-ups (coordinator a–g): failed refunds, crash-safe re-runs, retry keys ──
import { refundedForTag, refundKey } from "../../src/lib/payments/service";
import { routeEvent } from "../../src/lib/payments/webhook-core";
import type { StripeClient, StripeRequest } from "../../src/lib/payments/stripe-client";

test.describe("refund retries and failures", () => {
  test("a retry of the same attempt keeps the historic Stripe key; a retry after a failed refund gets a new one", () => {
    expect(refundKey("ticket-refund:GD-1", 0)).toBe("ticket-refund:GD-1");
    expect(refundKey("ticket-refund:GD-1", null)).toBe("ticket-refund:GD-1");
    expect(refundKey("refund:c1:PO-1", 1)).toBe("refund:c1:PO-1:a1");
    expect(refundKey("refund:c1:PO-1", 2)).not.toBe(refundKey("refund:c1:PO-1", 1));
  });

  test("crash-safe re-run counts what Stripe already refunded for this tag, in the seller's account, ignoring failed refunds", async () => {
    const calls: StripeRequest[] = [];
    const client: StripeClient = { async request<T>(r: StripeRequest) { calls.push(r); return { data: [
      { amount: 1500, status: "succeeded", metadata: { cancellation: "c1" } },
      { amount: 700, status: "pending", metadata: { cancellation: "c1" } },
      { amount: 400, status: "failed", metadata: { cancellation: "c1" } },
      { amount: 900, status: "succeeded", metadata: { cancellation: "c2" } },
      { amount: 300, status: "succeeded" },
    ] } as T; } };
    const total = await refundedForTag({ stripe: client, data: null as never }, "acct_S1", "pi_1", "cancellation", "c1");
    expect(total).toBe(2200);
    expect(calls[0].stripeAccount).toBe("acct_S1");
    expect(calls[0].path).toBe("refunds?payment_intent=pi_1&limit=100");
    await expect(refundedForTag({ stripe: client, data: null as never }, "not-an-account", "pi_1", "instruction", "x")).rejects.toThrow();
  });

  test("charge.refund.updated reaches the refund handler (a failed refund is undone there)", () => {
    const ev = (type: string, account?: string) => ({ id: "evt_1", type, account, data: { object: { id: "re_1", status: "failed" } } });
    expect(routeEvent(ev("charge.refund.updated", "acct_S1"))).toBe("charge_refunded");
    expect(routeEvent(ev("charge.refunded", "acct_S1"))).toBe("charge_refunded");
  });
});
