import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped, type Db } from "@/lib/workspace/db";
import { stripe, stripeKey, stripeMode } from "@/lib/stripe";
import { idForMode, isStaleAccountError } from "@/lib/payments/stripe-mode";
import { connectCountrySupport } from "@/lib/payments/connect-countries";
import type { StripeAccount } from "@/lib/commerce/connect";
import { partnerAccountStatus } from "./rules";

/**
 * Q68 (owner update 2026-11-14): partners are paid by Stripe Connect. Each approved partner onboards a platform-controlled
 * (no Stripe dashboard) connected account with only the `transfers` capability, in a country from connect-countries.ts. When an
 * admin settles a statement Gala Dock transfers the balance (+ VAT for UK VAT-registered partners) from its platform balance —
 * one transfer per statement, idempotency key from the database — and then creates a manual payout to the partner's bank.
 * The database enforces every rule (admin_partner_statement_prepare / _transferred / _transfer_failed / _payout); this module
 * only talks to Stripe. Test mode only until the owner says live.
 */

export type PartnerPayoutRow = { id: string; user_id: string | null; status: string; payout_country: string | null; stripe_account_id: string | null; stripe_account_id_live: string | null; payout_status: string; details: { email?: string; country_code?: string } | null };
type Status = "not_connected" | "incomplete" | "pending" | "active" | "restricted";

async function sync(partnerId: string, livemode: boolean, account: string | null, status: Status, country: string | null) {
  const { error } = await untyped(createAdminClient() as never).rpc("partner_payout_account_sync", { p_partner: partnerId, p_livemode: livemode, p_account: account, p_status: status, p_country: country });
  if (error) throw new Error(`partner_payout_sync: ${error.message}`);
}

export type OnboardResult = { ok: true; url: string } | { ok: false; error: string; status: number };

/** Creates (or resumes) the partner's connected account and returns a Stripe-hosted onboarding link. */
export async function startPartnerOnboarding(p: PartnerPayoutRow, email: string, origin: string): Promise<OnboardResult> {
  if (!stripeKey()) return { ok: false, error: "Payouts aren’t configured in this environment yet.", status: 503 };
  const mode = stripeMode();
  if (mode === "unconfigured") return { ok: false, error: "Payouts aren’t configured in this environment yet.", status: 503 };
  if (p.status === "terminated") return { ok: false, error: "This partnership has ended.", status: 403 };
  const country = (p.payout_country ?? p.details?.country_code ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, error: "Your partner record has no country yet. Contact partner support to add it, so Stripe verifies the right country.", status: 422 };
  const support = connectCountrySupport(country);
  if (!support.supported) return { ok: false, error: `Stripe payouts aren’t available for partners in ${country} yet. Your commission keeps accruing on your statements; contact partner support to arrange payment.`, status: 422 };
  let accountId = idForMode(mode, { test: p.stripe_account_id, live: p.stripe_account_id_live });
  if (accountId) {
    try {
      const existing = await stripe<StripeAccount>(`accounts/${accountId}`);
      // Stripe can't change an account's country: an unfinished account opened for another country is replaced.
      if (existing.country && existing.country !== country && !existing.details_submitted) accountId = null;
    } catch (e) { if (!isStaleAccountError(e)) throw e; accountId = null; }
  }
  if (!accountId) {
    const account = await stripe<{ id: string }>("accounts", {
      country, email,
      "controller[fees][payer]": "application", "controller[losses][payments]": "stripe",
      "controller[stripe_dashboard][type]": "none", "controller[requirement_collection]": "stripe",
      "settings[payouts][schedule][interval]": "manual",
      "capabilities[transfers][requested]": "true",
      "metadata[partner_id]": p.id, "metadata[purpose]": "gala_dock_partner",
    }, { idempotencyKey: `partner-account-${p.id}-${mode}-${country}` });
    accountId = account.id;
    await sync(p.id, mode === "live", accountId, "incomplete", country);
  }
  const back = `${origin}/partner/payouts`;
  const link = await stripe<{ url: string }>("account_links", { account: accountId, refresh_url: back, return_url: back, type: "account_onboarding" });
  return { ok: true, url: link.url };
}

/** Re-reads the partner's account and stores the real status. */
export async function refreshPartnerAccount(p: PartnerPayoutRow): Promise<Status> {
  const mode = stripeMode();
  const accountId = idForMode(mode, { test: p.stripe_account_id, live: p.stripe_account_id_live });
  if (!accountId || mode === "unconfigured") return "not_connected";
  try {
    const a = await stripe<StripeAccount>(`accounts/${accountId}`);
    const status = partnerAccountStatus(a);
    await sync(p.id, mode === "live", accountId, status, a.country ?? p.payout_country);
    return status;
  } catch (e) {
    if (isStaleAccountError(e)) { await sync(p.id, mode === "live", null, "not_connected", null); return "not_connected"; }
    throw e;
  }
}

type Prepared = { statement_id: string; account: string; currency: string; amount_minor: number; vat_minor: number; idempotency_key: string; self_bill_number: string; period_start: string };
const code = (e: unknown) => (e as { code?: string; message?: string } | null)?.code ?? (e instanceof Error ? e.message : "stripe_error");

/** Bank payout from the partner's connected balance (manual payouts): pays out what the transfer delivered, in that currency. */
async function payoutToBank(db: Db, statementId: string, transferId: string, account: string, reason: string) {
  try {
    const tr = await stripe<{ destination_payment?: string }>(`transfers/${transferId}`);
    const dp = tr.destination_payment ? await stripe<{ amount: number; currency: string }>(`charges/${tr.destination_payment}`, undefined, { stripeAccount: account }) : null;
    if (!dp) throw new Error("no_destination_payment");
    const po = await stripe<{ id: string; status: string }>("payouts", { amount: String(dp.amount), currency: dp.currency, "metadata[partner_statement]": statementId, description: "Gala Dock partner commission" },
      { stripeAccount: account, idempotencyKey: `partner-payout-${statementId}` });
    await db.rpc("admin_partner_statement_payout", { p_statement: statementId, p_payout: po.id, p_status: ["pending", "in_transit", "paid", "failed", "canceled"].includes(po.status) ? po.status : "pending", p_reason: reason });
    return { ok: true as const, payout: po.id };
  } catch (e) {
    await db.rpc("admin_partner_statement_payout", { p_statement: statementId, p_payout: null, p_status: "not_sent", p_reason: reason });
    return { ok: false as const, error: code(e) };
  }
}

export type SettleResult = { ok: true; transfer: string; payout: string | null; payoutError?: string } | { ok: false; error: string; stage: "prepare" | "transfer" | "record" };

/**
 * Pay a statement via Stripe. `db` is the ADMIN's own client: every database step re-checks the admin permission, aal2 and reason.
 * Order: prepare (locks the statement 'processing', fixes the amount + key) → transfer (idempotent) → transferred → bank payout.
 */
export async function payPartnerStatement(db: Db, statementId: string, reason: string): Promise<SettleResult> {
  const mode = stripeMode();
  if (mode === "unconfigured") return { ok: false, error: "stripe_not_configured", stage: "prepare" };
  const { data, error } = await db.rpc("admin_partner_statement_prepare", { p_statement: statementId, p_livemode: mode === "live", p_reason: reason });
  if (error) return { ok: false, error: error.message, stage: "prepare" };
  const p = data as Prepared;
  let transferId: string;
  try {
    const tr = await stripe<{ id: string }>("transfers", {
      amount: String(p.amount_minor), currency: p.currency, destination: p.account, transfer_group: `partner_statement_${p.statement_id}`,
      description: `Gala Dock partner commission ${p.self_bill_number}`,
      "metadata[partner_statement]": p.statement_id, "metadata[self_bill_number]": p.self_bill_number, "metadata[vat_minor]": String(p.vat_minor),
    }, { idempotencyKey: p.idempotency_key });
    transferId = tr.id;
  } catch (e) {
    await db.rpc("admin_partner_statement_transfer_failed", { p_statement: statementId, p_error: code(e), p_reason: reason });
    return { ok: false, error: code(e), stage: "transfer" };
  }
  const { error: recErr } = await db.rpc("admin_partner_statement_transferred", { p_statement: statementId, p_transfer: transferId, p_reason: reason });
  // The transfer exists at Stripe; a recording failure leaves the statement 'processing' and a retry (same key) records it.
  if (recErr) return { ok: false, error: recErr.message, stage: "record" };
  const po = await payoutToBank(db, statementId, transferId, p.account, reason);
  return po.ok ? { ok: true, transfer: transferId, payout: po.payout } : { ok: true, transfer: transferId, payout: null, payoutError: po.error };
}

/** Retry the bank payout for a paid statement whose payout wasn't sent. */
export async function retryPartnerBankPayout(db: Db, statementId: string, reason: string) {
  const { data } = await db.from("partner_statements").select("id,transfer_id,partner_id,status").eq("id", statementId).maybeSingle();
  const st = data as { id: string; transfer_id: string | null; partner_id: string; status: string } | null;
  if (!st?.transfer_id || st.status !== "paid") return { ok: false as const, error: "invalid_state" };
  const { data: pr } = await db.from("partners").select("stripe_account_id,stripe_account_id_live").eq("id", st.partner_id).maybeSingle();
  const acct = idForMode(stripeMode(), { test: (pr as { stripe_account_id: string | null } | null)?.stripe_account_id ?? null, live: (pr as { stripe_account_id_live: string | null } | null)?.stripe_account_id_live ?? null });
  if (!acct) return { ok: false as const, error: "payouts_not_set_up" };
  return payoutToBank(db, statementId, st.transfer_id, acct, reason);
}

/** Recover a negative statement by reversing part of the partner's latest transfer (works while funds are still in their balance). */
export async function recoverPartnerClawback(db: Db, statementId: string, reason: string) {
  const { data, error } = await db.rpc("admin_partner_statement_recovery_prepare", { p_statement: statementId, p_reason: reason });
  if (error) return { ok: false as const, error: error.message };
  const r = data as { statement_id: string; source_statement: string; transfer_id: string; amount_minor: number; idempotency_key: string };
  try {
    const rev = await stripe<{ id: string; amount: number }>(`transfers/${r.transfer_id}/reversals`, { amount: String(r.amount_minor), "metadata[partner_statement]": r.statement_id }, { idempotencyKey: r.idempotency_key });
    const { error: recErr } = await db.rpc("admin_partner_statement_recovered", { p_statement: r.statement_id, p_source: r.source_statement, p_reversal: rev.id, p_amount_minor: rev.amount, p_reason: reason });
    if (recErr) return { ok: false as const, error: recErr.message };
    return { ok: true as const, amount_minor: rev.amount };
  } catch (e) { return { ok: false as const, error: code(e) }; }
}
