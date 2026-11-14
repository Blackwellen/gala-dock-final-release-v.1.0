/**
 * Subscription billing rules (Q28, cards 176–180). Pure: no I/O, so unit tests import it directly.
 * Gala Dock's plans, AI credit packs and overage are platform own-sales on the Gala Dock Stripe account (never Connect).
 */
export type PlanPrice = { kind: "organizer" | "provider"; plan: "pro" | "business" | "enterprise"; billing_interval: "month" | "year"; price_minor: number; currency: string;
  self_serve: boolean; active: boolean; stripe_price_test: string | null; stripe_price_live: string | null };

const TEST_KEY = /^(sk|rk)_test_/;
export class BillingModeError extends Error {}
/** @deprecated Test-only gate of the beta (Q28). Billing now uses billingMode() + priceFor(); kept for existing callers/specs. */
export function assertTestModeKey(key: string | undefined | null): string {
  if (!key) throw new BillingModeError("billing_not_configured");
  if (!TEST_KEY.test(key)) throw new BillingModeError("billing_test_mode_only");
  return key;
}

const LIVE_KEY = /^(sk|rk)_live_/;
/**
 * Go-live (A2): platform billing runs in the mode of the platform key — test with sk_test_/rk_test_, live with sk_live_/rk_live_.
 * Anything else is refused before any Stripe call. The price used is always the one mapped for that same mode (priceFor).
 */
export function billingMode(key: string | undefined | null): { key: string; live: boolean } {
  if (!key) throw new BillingModeError("billing_not_configured");
  if (LIVE_KEY.test(key)) return { key, live: true };
  if (TEST_KEY.test(key)) return { key, live: false };
  throw new BillingModeError("billing_not_configured");
}
/** The Stripe price for the platform mode, or a BillingModeError when that mode has no mapped price (never the other mode's id). */
export function priceFor(row: { stripe_price_test?: string | null; stripe_price_live?: string | null }, live: boolean): string {
  const id = live ? row.stripe_price_live : row.stripe_price_test;
  if (!id || !/^price_[A-Za-z0-9]+$/.test(id)) throw new BillingModeError("billing_price_unmapped");
  return id;
}
export const priceColumn = (live: boolean) => (live ? "stripe_price_live" : "stripe_price_test") as "stripe_price_live" | "stripe_price_test";

export const PLAN_ORDER = ["starter", "pro", "business", "enterprise"] as const;
/** Monthly-equivalent price: used to decide whether a change is an upgrade (now, prorated) or a downgrade (end of period). */
export const monthlyEquivalent = (p: Pick<PlanPrice, "price_minor" | "billing_interval">) => p.billing_interval === "year" ? p.price_minor / 12 : p.price_minor;
export function changeDirection(from: Pick<PlanPrice, "plan" | "price_minor" | "billing_interval">, to: Pick<PlanPrice, "plan" | "price_minor" | "billing_interval">) {
  const a = PLAN_ORDER.indexOf(from.plan), b = PLAN_ORDER.indexOf(to.plan);
  if (a !== b) return b > a ? "upgrade" : "downgrade";
  const ma = monthlyEquivalent(from), mb = monthlyEquivalent(to);
  return mb === ma ? "same" : mb > ma ? "upgrade" : "downgrade";
}

/**
 * VAT on platform own-sales (owner decision 2026-10-28): Stripe Tax automatic tax, behind the BILLING_AUTOMATIC_TAX switch.
 * Catalogue prices are ex VAT (tax_behavior=exclusive, set by scripts/billing/stripe-test-catalogue.mjs), so VAT is added on top.
 * Stripe Tax needs a billing address for the existing customer: Checkout collects it and saves it back to the customer.
 * Off (default) → no tax params at all, so checkout keeps working until the Stripe account has Tax head office + registration.
 */
export const automaticTaxEnabled = (env: Record<string, string | undefined> = process.env) => /^(1|on|true)$/i.test(env.BILLING_AUTOMATIC_TAX ?? "");
export function taxParams(enabled: boolean): Record<string, string> {
  // Q67: business customers can enter their own VAT number at checkout (shown on the invoice; Stripe Tax applies reverse charge where due).
  return enabled ? { "automatic_tax[enabled]": "true", billing_address_collection: "required", "customer_update[address]": "auto", "customer_update[name]": "auto", "tax_id_collection[enabled]": "true" } : {};
}

/**
 * Gala Dock's own VAT number (account tax id, gb_vat) on invoices Gala Dock issues AS THE MERCHANT — platform own-sales only (plans,
 * AI credit packs, overage). Never used for direct charges on connected accounts: those are the seller's sales (seller's VAT).
 * `key` is the Stripe param prefix, e.g. "invoice_settings" or "invoice_creation[invoice_data]". Invalid ids are dropped.
 */
export function accountTaxIdParams(key: string, ids: readonly string[] | undefined): Record<string, string> {
  return Object.fromEntries((ids ?? []).filter(id => /^txi_[A-Za-z0-9]+$/.test(id)).slice(0, 5).map((id, i) => [`${key}[account_tax_ids][${i}]`, id]));
}

/** Checkout Session params for a plan subscription (mode=subscription). Prices come from the server catalogue only. */
export function planCheckoutParams(o: { customer: string; price: string; workspaceId: string; plan: string; interval: string; successUrl: string; cancelUrl: string; automaticTax?: boolean }) {
  return {
    ...taxParams(!!o.automaticTax),
    mode: "subscription", customer: o.customer, client_reference_id: o.workspaceId,
    "line_items[0][price]": o.price, "line_items[0][quantity]": "1",
    success_url: o.successUrl, cancel_url: o.cancelUrl, allow_promotion_codes: "false",
    "metadata[purpose]": "subscription", "metadata[workspace_id]": o.workspaceId, "metadata[plan]": o.plan, "metadata[interval]": o.interval,
    "subscription_data[metadata][workspace_id]": o.workspaceId, "subscription_data[metadata][plan]": o.plan,
  } as Record<string, string>;
}

/** Checkout Session params for a one-off AI credit pack (mode=payment). */
export function packCheckoutParams(o: { customer: string; price: string; workspaceId: string; packId: string; successUrl: string; cancelUrl: string; automaticTax?: boolean; accountTaxIds?: readonly string[] }) {
  const vat = accountTaxIdParams("invoice_creation[invoice_data]", o.accountTaxIds);
  return {
    ...taxParams(!!o.automaticTax),
    // A one-off payment only gets an invoice (VAT receipt) when invoice_creation is on; it then carries Gala Dock's VAT number.
    ...(Object.keys(vat).length ? { "invoice_creation[enabled]": "true", ...vat } : {}),
    mode: "payment", customer: o.customer, client_reference_id: o.workspaceId,
    "line_items[0][price]": o.price, "line_items[0][quantity]": "1",
    success_url: o.successUrl, cancel_url: o.cancelUrl,
    "metadata[purpose]": "ai_credits", "metadata[workspace_id]": o.workspaceId, "metadata[pack_id]": o.packId,
    "payment_intent_data[metadata][purpose]": "ai_credits", "payment_intent_data[metadata][workspace_id]": o.workspaceId,
  } as Record<string, string>;
}

/**
 * Subscription update params for a plan change. Upgrades swap the price now and invoice the prorated difference immediately.
 * Downgrades swap the price without proration (the lower price applies from the next invoice) and record the previous plan
 * plus the period end, so billing_apply_subscription keeps the higher entitlements until then.
 */
export function planChangeParams(o: { itemId: string; price: string; direction: "upgrade" | "downgrade" | "revert"; currentPlan: string; currentPrice?: string; periodEnd: number; accountTaxIds?: readonly string[]; automaticTax?: boolean }) {
  // Q67: with BILLING_AUTOMATIC_TAX on, a plan change also turns Stripe Tax on for subscriptions created before the switch.
  const base: Record<string, string> = { "items[0][id]": o.itemId, "items[0][price]": o.price, cancel_at_period_end: "false", ...accountTaxIdParams("invoice_settings", o.accountTaxIds), ...(o.automaticTax ? { "automatic_tax[enabled]": "true" } : {}) };
  const clear = { "metadata[gd_previous_plan]": "", "metadata[gd_downgrade_at]": "", "metadata[gd_previous_price]": "" };
  // Q60 "revert": undo a scheduled downgrade — the previous (already paid) price comes back with NO proration. Upgrading back with
  // always_invoice would charge the difference a second time for a period the customer already paid at the higher price.
  if (o.direction === "revert") return { ...base, proration_behavior: "none", ...clear };
  return o.direction === "upgrade"
    ? { ...base, proration_behavior: "always_invoice", ...clear }
    : { ...base, proration_behavior: "none", "metadata[gd_previous_plan]": o.currentPlan, "metadata[gd_downgrade_at]": String(o.periodEnd), "metadata[gd_previous_price]": o.currentPrice ?? "" };
}

/**
 * Q60: how a plan change is applied. A change of billing interval resets Stripe's billing cycle and invoices immediately whatever
 * proration_behavior says, so it is always applied now and prorated ("upgrade" path, credit for unused time) — never as an
 * end-of-period downgrade that would bill the new interval in full today with no credit. While a downgrade is scheduled, the
 * only change allowed is choosing the previous price again ("revert"); anything else must wait until it is undone.
 */
export function planChangeMode(o: { from: Pick<PlanPrice, "plan" | "price_minor" | "billing_interval"> | null; to: Pick<PlanPrice, "plan" | "price_minor" | "billing_interval">;
  toPrice: string; scheduledFromPrice?: string | null }): "upgrade" | "downgrade" | "revert" | "same" | "scheduled" {
  if (o.scheduledFromPrice) return o.scheduledFromPrice === o.toPrice ? "revert" : "scheduled";
  if (!o.from) return "upgrade";
  const dir = changeDirection(o.from, o.to);
  if (dir === "same") return "same";
  return o.from.billing_interval !== o.to.billing_interval ? "upgrade" : dir;
}

/** Q60: a different subscription went live while the mirror still held a live one (two Checkout tabs): the old one must be cancelled. */
export function supersededSubscription(before: { stripe_subscription_id?: string | null; status?: string | null } | null | undefined, incoming: { id: string; status?: unknown }) {
  return !!before?.stripe_subscription_id && before.stripe_subscription_id !== incoming.id
    && ["active", "trialing", "past_due"].includes(String(before.status)) && ["active", "trialing"].includes(String(incoming.status));
}

/** Invoice item for one month's accrued, owner-approved AI overage (ex VAT, at the documented overage rate). */
export function overageItemParams(o: { customer: string; amountMinor: number; currency: string; credits: number; period: string; chargeId: string }) {
  return {
    customer: o.customer, amount: String(o.amountMinor), currency: o.currency.toLowerCase(), tax_behavior: "exclusive",   // ex VAT, like the catalogue prices
    description: `Gala Agent overage — ${Number(o.credits).toLocaleString("en-GB", { maximumFractionDigits: 3 })} credits (${o.period.slice(0, 7)})`,
    "metadata[purpose]": "ai_overage", "metadata[overage_charge]": o.chargeId, "metadata[period]": o.period,
  } as Record<string, string>;
}

/**
 * Q67: Checkout cannot set account_tax_ids on the subscription it creates (subscription_data has no invoice_settings.account_tax_ids),
 * so the first invoice relies on the Stripe account's default tax id (invoice settings, set by the owner — CLOSE_OUT_RUNBOOK) and
 * the webhook then writes Gala Dock's VAT number onto the subscription for every later invoice. Empty when there is no valid id.
 */
export function subscriptionTaxIdParams(ids: readonly string[] | undefined): Record<string, string> {
  return accountTaxIdParams("invoice_settings", ids);
}

/** Truthful VAT line for the plan picker, whichever way BILLING_AUTOMATIC_TAX is set. */
export function planVatCopy(automaticTax: boolean): string {
  return automaticTax
    ? "Prices exclude VAT. UK VAT (or your country's tax where it applies) is calculated by Stripe from your billing address and added at checkout; invoices show Gala Dock's VAT number GB508480488."
    : "Prices shown are what you pay: VAT is not added to Gala Dock plan invoices at the moment.";
}

/**
 * Q67 customer portal configuration for Gala Dock plans: update cards, see/download invoices, update billing details (incl. a
 * VAT number), cancel at the end of the period. Plan changes stay in Settings (our proration/downgrade rules), so subscription
 * updates are off. metadata[gd_purpose]=plans marks the configuration Gala Dock created and reuses.
 */
export const PORTAL_PURPOSE = "plans";
export function portalConfigurationParams(o: { returnUrl: string; privacyUrl: string; termsUrl: string }): Record<string, string> {
  return {
    "business_profile[headline]": "Gala Dock — manage your plan billing",
    "business_profile[privacy_policy_url]": o.privacyUrl, "business_profile[terms_of_service_url]": o.termsUrl,
    default_return_url: o.returnUrl,
    "features[payment_method_update][enabled]": "true",
    "features[invoice_history][enabled]": "true",
    "features[customer_update][enabled]": "true",
    "features[customer_update][allowed_updates][0]": "email", "features[customer_update][allowed_updates][1]": "address",
    "features[customer_update][allowed_updates][2]": "name", "features[customer_update][allowed_updates][3]": "tax_id",
    "features[subscription_cancel][enabled]": "true", "features[subscription_cancel][mode]": "at_period_end",
    "features[subscription_cancel][proration_behavior]": "none",
    "features[subscription_update][enabled]": "false",
    "metadata[gd_purpose]": PORTAL_PURPOSE,
  };
}
export function portalSessionParams(o: { customer: string; returnUrl: string; configuration: string }): Record<string, string> {
  return { customer: o.customer, return_url: o.returnUrl, configuration: o.configuration };
}
/** Who may open the plan billing portal: the owner and finance (they see invoices and cards; only the owner changes the plan here). */
export const PORTAL_ROLES = ["owner", "finance"] as const;
