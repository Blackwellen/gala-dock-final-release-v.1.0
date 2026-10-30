/**
 * Pure payment rules (cards 123.B, 125.C–D, 127, 130): application-fee calculation and invariants, seller readiness,
 * refund fee policy, and balanced memo-ledger postings. No I/O, so the same code is unit-tested and used by the services.
 * The SQL functions in 202610291009_direct_charge_rpcs.sql post the same line shapes (direct_charge_lines etc.).
 */

// ───────────────────────── fees ─────────────────────────
export type FeeRule = { rate_bps: number; fixed_minor?: number; source?: string; rule_id?: string; plan?: string | null };

/** Commission on the seller's amount: rate + fixed, capped at the amount. Integer minor units only. */
export function commissionMinor(amountMinor: number, rule: FeeRule) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error("invalid_amount");
  const rate = Number(rule.rate_bps), fixed = Number(rule.fixed_minor ?? 0);
  if (!Number.isInteger(rate) || rate < 0 || rate > 5000 || !Number.isInteger(fixed) || fixed < 0) throw new Error("invalid_fee_rule");
  return Math.min(amountMinor, Math.round((amountMinor * rate) / 10000) + fixed);
}

/** Application fee = seller commission + customer-paid platform fees, never more than the gross charge (123.B.5). */
export function applicationFee(p: { amountMinor: number; commissionMinor: number; customerFeeMinor: number }) {
  const gross = p.amountMinor + p.customerFeeMinor;
  const fee = p.commissionMinor + p.customerFeeMinor;
  assertFeeInvariants(gross, fee);
  return { grossMinor: gross, applicationFeeMinor: fee, sellerNetMinor: gross - fee };
}

export function assertFeeInvariants(grossMinor: number, feeMinor: number) {
  if (!Number.isSafeInteger(grossMinor) || grossMinor <= 0) throw new Error("invalid_gross");
  if (!Number.isSafeInteger(feeMinor) || feeMinor < 0 || feeMinor > grossMinor) throw new Error("invalid_application_fee");
}

/** Pounds (numeric DB columns) → pence without float drift. */
export const toMinor = (n: number | string) => Math.round(Number(n) * 100);

// ───────────────────────── seller readiness (125.3–125.4, 123.B.3) ─────────────────────────
export type SellerAccount = { workspace_id: string; name?: string | null; stripe_account_id: string | null; charges_enabled: boolean; card_payments: string;
  details_submitted: boolean; disabled_reason: string | null; past_due: string[]; country: string | null; default_currency: string | null };
export type Readiness = { ready: true; account: string } | { ready: false; reason: "no_account" | "charges_disabled" | "card_payments_inactive" | "restricted" | "requirements_past_due" };

export function sellerReadiness(a: SellerAccount | null | undefined): Readiness {
  if (!a?.stripe_account_id || !/^acct_[A-Za-z0-9_]+$/.test(a.stripe_account_id)) return { ready: false, reason: "no_account" };
  if (a.disabled_reason) return { ready: false, reason: "restricted" };
  if ((a.past_due ?? []).length) return { ready: false, reason: "requirements_past_due" };
  if (!a.charges_enabled) return { ready: false, reason: "charges_disabled" };
  if (a.card_payments !== "active") return { ready: false, reason: "card_payments_inactive" };
  return { ready: true, account: a.stripe_account_id };
}

export const NOT_READY_COPY: Record<Exclude<Readiness, { ready: true }>["reason"], string> = {
  no_account: "The seller hasn’t set up Stripe payments yet, so this can’t be paid online right now.",
  charges_disabled: "The seller’s Stripe account can’t accept payments right now.",
  card_payments_inactive: "The seller’s Stripe account isn’t enabled for card payments yet.",
  restricted: "Stripe has restricted the seller’s account. Payments are paused until the seller resolves it with Stripe.",
  requirements_past_due: "The seller has overdue Stripe verification steps. Payments are paused until they’re completed.",
};

// ───────────────────────── refund fee policy (125.D) ─────────────────────────
export type RefundReason = "provider_cancelled" | "event_cancelled" | "platform_cancelled" | "customer_cancelled" | "goodwill" | "partial_service_failure" | "hold_expired" | "duplicate";
export type FeePolicy = "full" | "proportional" | "retained";

/**
 * Whether Gala Dock's application fee goes back with the refund. Disclosed terms: seller/event/platform fault, an expired
 * hold or a duplicate payment returns the fee in full; a partial service failure returns it pro rata; a customer's own
 * cancellation and goodwill gestures keep the fee (pending legal review of the customer terms — FCA_PAYMENT_PERIMETER_SIGNOFF).
 */
export function feePolicyFor(reason: RefundReason): FeePolicy {
  switch (reason) {
    case "provider_cancelled": case "event_cancelled": case "platform_cancelled": case "hold_expired": case "duplicate": return "full";
    case "partial_service_failure": return "proportional";
    default: return "retained";
  }
}
/** Stripe's refund_application_fee refunds the fee pro rata to the refunded amount, which serves both full and proportional. */
export const refundApplicationFee = (policy: FeePolicy) => policy !== "retained";
export function feeRefundMinor(policy: FeePolicy, p: { refundMinor: number; grossMinor: number; feeMinor: number }) {
  if (policy === "retained") return 0;
  if (p.refundMinor > p.grossMinor) throw new Error("refund_exceeds_charge");
  return Math.floor((p.feeMinor * p.refundMinor) / p.grossMinor);
}

// ───────────────────────── ledger (127) ─────────────────────────
export type Line = { account: string; amount_minor: number; party_type: "platform" | "workspace" | "user"; party_id?: string | null };
const PLATFORM_CASH = "cash_stripe";

export function assertBalanced(lines: Line[]) {
  const live = lines.filter(l => l.amount_minor !== 0);
  if (live.length < 2) throw new Error("ledger_too_few_lines");
  if (live.some(l => !Number.isSafeInteger(l.amount_minor))) throw new Error("ledger_non_integer");
  const sum = live.reduce((a, l) => a + l.amount_minor, 0);
  if (sum !== 0) throw new Error(`ledger_unbalanced:${sum}`);
  return live;
}

/** Direct charge: seller GMV settles in the seller's Stripe balance; platform cash moves only by the application fee. */
export function directChargeLines(p: { grossMinor: number; feeMinor: number; vatMinor: number; seller: string }): Line[] {
  assertFeeInvariants(p.grossMinor, p.feeMinor);
  const vat = Math.min(p.vatMinor, p.feeMinor), s = { party_type: "workspace" as const, party_id: p.seller };
  return assertBalanced([
    { account: "merchant_gmv", amount_minor: -p.grossMinor, ...s },
    { account: "seller_connected_balance", amount_minor: p.grossMinor - p.feeMinor, ...s },
    { account: "seller_application_fees", amount_minor: p.feeMinor, ...s },
    { account: PLATFORM_CASH, amount_minor: p.feeMinor, party_type: "platform" },
    { account: "platform_fee", amount_minor: -(p.feeMinor - vat), party_type: "platform" },
    { account: "tax_payable", amount_minor: -vat, party_type: "platform" },
  ]);
}
/** Refund on the seller's charge: seller-side memo only (comes out of the seller's Stripe balance). */
export function directRefundLines(p: { refundMinor: number; seller: string }): Line[] {
  const s = { party_type: "workspace" as const, party_id: p.seller };
  return assertBalanced([{ account: "seller_refunds", amount_minor: p.refundMinor, ...s }, { account: "seller_connected_balance", amount_minor: -p.refundMinor, ...s }]);
}
/** Application-fee refund: platform cash goes back to the seller's balance. */
export function feeRefundLines(p: { feeRefundMinor: number; vatRefundMinor: number; seller: string }): Line[] {
  const s = { party_type: "workspace" as const, party_id: p.seller };
  return assertBalanced([
    { account: "platform_fee", amount_minor: p.feeRefundMinor - p.vatRefundMinor, party_type: "platform" },
    { account: "tax_payable", amount_minor: p.vatRefundMinor, party_type: "platform" },
    { account: PLATFORM_CASH, amount_minor: -p.feeRefundMinor, party_type: "platform" },
    { account: "seller_application_fees", amount_minor: -p.feeRefundMinor, ...s },
    { account: "seller_connected_balance", amount_minor: p.feeRefundMinor, ...s },
  ]);
}
/** Chargeback on a connected-account charge: the seller is the merchant, so liability is the seller's (131.9). */
export function connectedDisputeLines(p: { amountMinor: number; seller: string; withdrawn: boolean }): Line[] {
  const s = { party_type: "workspace" as const, party_id: p.seller }, d = p.withdrawn ? p.amountMinor : -p.amountMinor;
  return assertBalanced([{ account: "seller_disputes", amount_minor: d, ...s }, { account: "seller_connected_balance", amount_minor: -d, ...s }]);
}
/** Stripe payout from the seller's balance to the seller's bank: informational mirror (129). */
export function connectedPayoutLines(p: { amountMinor: number; seller: string; failed?: boolean }): Line[] {
  const s = { party_type: "workspace" as const, party_id: p.seller }, a = p.failed ? -p.amountMinor : p.amountMinor;
  return assertBalanced([{ account: "seller_payouts", amount_minor: a, ...s }, { account: "seller_connected_balance", amount_minor: -a, ...s }]);
}
/** Gala Dock's own sale (boost, subscription, AI credits): platform revenue and VAT. */
export function platformSaleLines(p: { grossMinor: number; vatMinor: number }): Line[] {
  return assertBalanced([
    { account: PLATFORM_CASH, amount_minor: p.grossMinor, party_type: "platform" },
    { account: "platform_revenue", amount_minor: -(p.grossMinor - p.vatMinor), party_type: "platform" },
    { account: "tax_payable", amount_minor: -p.vatMinor, party_type: "platform" },
  ]);
}
/** Invariant 127.B: a marketplace posting may only touch platform cash by the application fee. */
export function platformCashDelta(lines: Line[]) {
  return lines.filter(l => l.account === PLATFORM_CASH && l.party_type === "platform").reduce((a, l) => a + l.amount_minor, 0);
}
