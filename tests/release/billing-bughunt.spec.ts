import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { planChangeMode, planChangeParams, supersededSubscription } from "../../src/lib/billing/core";
import { platformBillingStripe, PaymentRouteError, type StripeClient, type StripeRequest } from "../../src/lib/payments/stripe-client";

// Q60 billing / subscriptions / credit packs bug hunt (Phase A, code + DB). Pure, stubbed and source checks only: no network.
// The DB half (FIFO credit expiry, credit-pack refund reversal) is exercised by scripts/db/exercises/202611146501_billing_bughunt_fixes.sql.
const src = (f: string) => readFileSync(f, "utf8");
const pro = { plan: "pro" as const, price_minor: 5900, billing_interval: "month" as const };
const proYear = { plan: "pro" as const, price_minor: 59000, billing_interval: "year" as const };
const biz = { plan: "business" as const, price_minor: 22900, billing_interval: "month" as const };

test("scheduled downgrade: re-choosing the previous price reverts with NO proration (was a second prorated charge); other changes wait", () => {
  expect(planChangeMode({ from: pro, to: biz, toPrice: "price_biz", scheduledFromPrice: "price_biz" })).toBe("revert");
  expect(planChangeMode({ from: pro, to: proYear, toPrice: "price_proy", scheduledFromPrice: "price_biz" })).toBe("scheduled");
  const revert = planChangeParams({ itemId: "si_1", price: "price_biz", direction: "revert", currentPlan: "business", periodEnd: 0 });
  expect(revert).toMatchObject({ proration_behavior: "none", "items[0][price]": "price_biz", "metadata[gd_previous_plan]": "", "metadata[gd_downgrade_at]": "", "metadata[gd_previous_price]": "" });
  // A downgrade remembers the price it came from, so it can be undone exactly.
  expect(planChangeParams({ itemId: "si_1", price: "price_pro", direction: "downgrade", currentPlan: "business", currentPrice: "price_biz", periodEnd: 1800000000 }))
    .toMatchObject({ proration_behavior: "none", "metadata[gd_previous_plan]": "business", "metadata[gd_previous_price]": "price_biz", "metadata[gd_downgrade_at]": "1800000000" });
  expect(planChangeParams({ itemId: "si_1", price: "price_biz", direction: "upgrade", currentPlan: "pro", periodEnd: 1 })).toMatchObject({ proration_behavior: "always_invoice", "metadata[gd_previous_price]": "" });
});

test("interval switches apply now and prorated (Stripe resets the cycle and bills at once); same tier+interval is refused", () => {
  expect(planChangeMode({ from: pro, to: proYear, toPrice: "p" })).toBe("upgrade");        // was 'downgrade': full yearly charge today, no credit
  expect(planChangeMode({ from: biz, to: proYear, toPrice: "p" })).toBe("upgrade");
  expect(planChangeMode({ from: biz, to: pro, toPrice: "p" })).toBe("downgrade");          // same interval → end of period
  expect(planChangeMode({ from: pro, to: biz, toPrice: "p" })).toBe("upgrade");
  expect(planChangeMode({ from: pro, to: pro, toPrice: "p" })).toBe("same");
  expect(planChangeMode({ from: null, to: pro, toPrice: "p" })).toBe("upgrade");
});

test("duplicate subscription (two Checkout tabs) is detected only when a different sub goes live over a live one", () => {
  expect(supersededSubscription({ stripe_subscription_id: "sub_old", status: "active" }, { id: "sub_new", status: "active" })).toBe(true);
  expect(supersededSubscription({ stripe_subscription_id: "sub_old", status: "past_due" }, { id: "sub_new", status: "trialing" })).toBe(true);
  expect(supersededSubscription({ stripe_subscription_id: "sub_old", status: "canceled" }, { id: "sub_new", status: "active" })).toBe(false);
  expect(supersededSubscription({ stripe_subscription_id: "sub_old", status: "active" }, { id: "sub_new", status: "incomplete" })).toBe(false);
  expect(supersededSubscription({ stripe_subscription_id: "sub_same", status: "active" }, { id: "sub_same", status: "active" })).toBe(false);
  expect(supersededSubscription(null, { id: "sub_new", status: "active" })).toBe(false);
});

test("platform adapter cancels a subscription with proration on the platform account only", async () => {
  const seen: StripeRequest[] = [];
  const fake: StripeClient = { request: async <T,>(r: StripeRequest) => { seen.push(r); return { id: "sub_1" } as T; } };
  await platformBillingStripe(fake).cancelSubscription("sub_1", "k");
  expect(seen[0]).toMatchObject({ method: "DELETE", path: "subscriptions/sub_1?prorate=true", idempotencyKey: "k" });
  expect(seen[0]!.stripeAccount).toBeUndefined();
  expect(() => platformBillingStripe(fake).cancelSubscription("x", "k")).toThrow(PaymentRouteError);
});

test("webhook: refunded credit pack reverses credits; duplicate subscription cancelled; plan_kind_mismatch acknowledged", () => {
  const w = src("src/app/api/stripe/webhook/route.ts");
  const refund = w.slice(w.indexOf('case "charge_refunded"'), w.indexOf('case "account_updated"'));
  expect(refund).toMatch(/rpc\("billing_credit_pack_refunded", \{ p_charge: object/);
  expect(refund.indexOf("billing_credit_pack_refunded")).toBeLessThan(refund.indexOf("legacyRefund(db, object)"));
  const sub = w.slice(w.indexOf('case "subscription"'), w.indexOf('case "invoice"'));
  expect(sub).toMatch(/supersededSubscription\(before, object\)/);
  expect(sub).toMatch(/cancelSupersededSubscription\(/);
  expect(sub).toMatch(/plan_kind_mismatch/);
});

test("service: scheduled downgrade can be undone; superseded sub cancelled only when older and same customer; audit rows", () => {
  const s = src("src/lib/billing/service.ts");
  expect(s).toMatch(/export async function undoScheduledChange/);
  expect(s).toMatch(/direction: "revert"/);
  expect(s).toMatch(/Number\(old\.created \?\? 0\) <= Number\(cur\.created \?\? 0\)/);
  expect(s).toMatch(/old\.customer === cur\.customer/);
  expect(s).toMatch(/"billing\.duplicate_subscription"/);
  expect(s).toMatch(/"billing\.plan_change_requested"/);
  expect(s).toMatch(/credits=success/);
  expect(src("src/lib/actions/billing.ts")).toMatch(/export async function undoPlanChangeAction/);
});

test("UI: credit packs can be bought (was no button anywhere); plan panel offers undo, interval switch and pay-open-invoice", () => {
  const packs = src("src/components/billing/credit-packs.tsx");
  expect(packs).toMatch(/action=\{buyCreditPackAction\}/);
  expect(packs).toMatch(/workspace_kinds \?\? \[\]\)\.includes\(kind\)/);
  for (const f of ["src/app/organizer/settings/page.tsx", "src/app/provider/settings/page.tsx"]) expect(src(f)).toMatch(/<CreditPacks /);
  const plan = src("src/components/billing/plan-billing.tsx");
  expect(plan).toMatch(/action=\{undoPlanChangeAction\}/);
  expect(plan).toMatch(/S\?\.billing_interval !== "month"/);
  expect(plan).toMatch(/dueInvoice\?\.hosted_invoice_url/);
  expect(plan).toMatch(/!S\.cancel_at_period_end \? <> · renews/);
});

test("organiser plan card reads the billed plan and catalogue caps, not settings.plan and hard-coded limits", () => {
  const p = src("src/app/organizer/settings/page.tsx");
  expect(p).not.toMatch(/Number\(s\.plan_price/);
  expect(p).not.toMatch(/"Up to 100 active events", "25 team members"/);
  expect(p).toMatch(/loadPricing\(\)\)\.plans\.find\(p => p\.kind === "organizer" && p\.plan === planKey\)/);
});

test("migration 202611146501: FIFO credit balance, refund reversal, per-kind notification links, service-only grants", () => {
  const m = src("supabase/migrations/202611146501_billing_bughunt_fixes.sql");
  expect(m).toMatch(/create or replace function public\.ai_credit_balance/);
  expect(m).toMatch(/bal := public\.ai_credit_balance\(p_workspace\);/);
  expect(m).toMatch(/create or replace function public\.billing_credit_pack_refunded/);
  expect(m).toMatch(/'\/provider\/settings\?tab=billing'/);
  expect(m).toMatch(/'\/provider\/settings\?tab=agent'/);
  expect(m).toMatch(/revoke all on function public\.ai_credit_balance\(uuid, timestamptz\), public\.billing_credit_pack_refunded\(jsonb, boolean\) from public, anon, authenticated/);
});
