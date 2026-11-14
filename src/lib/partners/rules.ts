/**
 * Q68 partner payout rules (owner decisions 2026-11-14). Pure: no I/O, safe in tests. The database is the authority
 * (partner_minimum_payout(), admin_partner_statement_prepare in migration 202611146951); these mirror it for copy and tests,
 * and tests/release/q68-partner-decisions.spec.ts keeps both in step.
 */

export type PartnerPayoutFees = { active_account_fee_gbp: number; payout_fixed_fee_gbp: number; payout_bps: number; max_fee_bps: number; floor_gbp: number };
/** Stripe Connect UK pricing for platform-controlled accounts (commerce.partner_payout_fees default). */
export const DEFAULT_PARTNER_PAYOUT_FEES: PartnerPayoutFees = { active_account_fee_gbp: 2, payout_fixed_fee_gbp: 0.1, payout_bps: 25, max_fee_bps: 500, floor_gbp: 50 };
export const PARTNER_EARNING_HOLD_DAYS = 60;

/** Smallest payout whose Connect fees (monthly active-account fee + per-payout fee) are ≤ max_fee_bps of it; never below the floor. */
export function minimumPartnerPayout(f: PartnerPayoutFees = DEFAULT_PARTNER_PAYOUT_FEES): number {
  const share = Math.max((f.max_fee_bps - f.payout_bps) / 10000, 0.0001);
  return Math.max(f.floor_gbp, Math.ceil((f.active_account_fee_gbp + f.payout_fixed_fee_gbp) / share));
}

/** Self-billing VAT: added on top only for UK VAT-registered partners; other VAT-registered partners are reverse charge. */
export function selfBillVat(balance: number, vatRegistered: boolean, country: string | null, rateBps = 2000) {
  const bps = vatRegistered && (country ?? "").toUpperCase() === "GB" ? rateBps : 0;
  const vat = Math.round(balance * bps) / 10000;
  return { bps, vat: Math.round(vat * 100) / 100, total: Math.round((balance + vat) * 100) / 100, reverseCharge: vatRegistered && bps === 0 };
}

/** What happens to a closed statement's balance at month end. */
export function statementOutcome(balance: number, minimum: number): "payable" | "rolls_over" | "carries_negative" {
  return balance < 0 ? "carries_negative" : balance < minimum ? "rolls_over" : "payable";
}

/** Status of a transfers-only partner account (card payments are never enabled on these). */
export function partnerAccountStatus(a: { payouts_enabled?: boolean; details_submitted?: boolean; capabilities?: { transfers?: string }; requirements?: { disabled_reason?: string | null } }):
  "incomplete" | "pending" | "active" | "restricted" {
  if (a.requirements?.disabled_reason?.startsWith("rejected")) return "restricted";
  if (a.payouts_enabled && a.capabilities?.transfers === "active") return "active";
  if (a.details_submitted) return "pending";
  return "incomplete";
}
