import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { stripeLive } from "@/lib/stripe";
import { paymentDeps } from "@/lib/payments/server";
import { createDirectMerchantCheckout, createPlatformCheckout, refundMerchantCharge, type MarketplaceOrder } from "@/lib/payments/service";
import type { RefundReason } from "@/lib/payments/rules";
import { refundLegacyPlatformOrder } from "@/lib/commerce/legacy-platform-refunds";

/**
 * Payment orchestration entry points (backend §13.16, cards 123–132).
 *  - startPayment(): canonical payment order (DB computes the amount + commission snapshot). Marketplace bookings become a
 *    Stripe Connect DIRECT charge on the provider's connected account with Gala Dock's commission as the application fee;
 *    promotion boosts (Gala Dock's own product) stay a platform charge.
 *  - processPayments(): cancellation refunds on the original charge. There is no release/transfer step: direct charges settle
 *    in the seller's own Stripe balance and Stripe pays the seller out on the seller's schedule.
 * Webhooks confirm every state change; redirects never mark anything paid.
 */

export type PayKind = "deposit" | "balance_payment" | "standby_fee" | "emergency_service" | "platform_boost";
type Order = MarketplaceOrder & { id: string; refunded_minor: number; transferred_minor: number; build_item_id: string | null; event_id: string | null;
  stripe_payment_intent: string | null; stripe_charge: string | null; stripe_transfer: string | null };

const ERR: [RegExp, string][] = [
  [/not_authorized/, "You don’t have permission to pay for this booking."], [/already_paid/, "This has already been paid."],
  [/nothing_due/, "There’s nothing left to pay."], [/hold_expired/, "Your hold has expired — request a new hold or quote."],
  [/quote_expired/, "This quote has expired — ask the provider to refresh it."], [/not_bookable|not_confirmed|not_payable/, "This booking can’t be paid right now."],
];

/** Creates (or resumes) the payment order and returns a Stripe Checkout URL. */
export async function startPayment(kind: PayKind, ids: { itemId?: string; standbyId?: string; boostId?: string }, origin: string, returnPath: string): Promise<{ ok: true; url: string; reference: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  // The caller's own client: create_payment_order authorises the payer and prices the order from the database.
  const { data, error } = kind === "platform_boost"
    ? await supabase.rpc("create_boost_payment_order" as never, { p_boost: ids.boostId ?? null } as never)
    : await supabase.rpc("create_payment_order" as never, { p_kind: kind, p_item: ids.itemId ?? null, p_standby: ids.standbyId ?? null } as never);
  if (error) return { ok: false, error: ERR.find(([re]) => re.test(error.message))?.[1] ?? "Couldn’t start the payment. You haven’t been charged." };
  const po = data as unknown as Order;
  const deps = paymentDeps();
  if (!deps) return { ok: false, error: "Card payments aren’t configured in this environment yet." };
  const back = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/";
  const successUrl = `${origin}/payments/${po.reference}?back=${encodeURIComponent(back)}`;
  const cancelUrl = `${origin}${back}${back.includes("?") ? "&" : "?"}payment=cancelled`;

  if (kind === "platform_boost") {
    // Gala Dock's own advertising product: a platform sale, 100% platform revenue (card 124.2).
    const db = untyped(createAdminClient() as never);
    try {
      if (po.stripe_checkout_session) {
        const { platformSalesStripe } = await import("@/lib/payments/stripe-client");
        const s = await platformSalesStripe(deps.stripe).retrieveCheckout(po.stripe_checkout_session);
        if (s.status === "open" && s.url) return { ok: true, url: s.url, reference: po.reference };
      }
      const s = await createPlatformCheckout(deps, "platform_boost", {
        mode: "payment", customer_email: user.email ?? "", client_reference_id: po.reference, success_url: successUrl, cancel_url: cancelUrl,
        expires_at: String(Math.floor(Date.now() / 1000) + 3600), "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": po.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(po.amount_minor), "line_items[0][price_data][product_data][name]": po.description.slice(0, 200),
        "metadata[payment_order]": po.reference, "payment_intent_data[metadata][payment_order]": po.reference,
        "payment_intent_data[description]": `${po.reference} · ${po.description}`.slice(0, 300),
      }, `${po.reference}:platform:${Math.floor(Date.now() / 3_600_000)}`);
      await db.rpc("payment_order_pending", { p_ref: po.reference, p_session: s.id });
      return { ok: true, url: s.url ?? "", reference: po.reference };
    } catch { return { ok: false, error: "Couldn’t reach the payment provider. You haven’t been charged — please try again." }; }
  }

  const r = await createDirectMerchantCheckout(deps, { order: po, customerEmail: user.email ?? "", successUrl, cancelUrl,
    terms: { cancellation_policy_source: "booking_terms_snapshot", accepted_at: new Date().toISOString(), payer: user.id } });
  if (r.ok) return { ok: true, url: r.url, reference: po.reference };
  // Marketplace bookings: the payee is a supplier/venue. Say so plainly (the generic copy says "seller"); nothing was charged.
  if (r.code === "seller_not_ready") return { ok: false, error: SUPPLIER_NOT_READY };
  return { ok: false, error: r.message };
}

/** Shown when a booking's supplier has no ready Stripe account in the current mode (test onboarding unfinished, or not yet re-onboarded in live). */
export const SUPPLIER_NOT_READY = "This supplier can’t take card payments yet — they still need to finish their Stripe payment setup. You haven’t been charged; message them or try again later.";

const reasonFor = (party: string): RefundReason => party === "provider" ? "provider_cancelled" : party === "platform" ? "platform_cancelled" : "customer_cancelled";

/** Background processing (cron): cancellation refunds against the original charges. Idempotent per cancellation + order. */
export async function processPayments(limit = 20) {
  const db = untyped(createAdminClient() as never);
  const deps = paymentDeps();
  const out = { released: 0, transferred: 0, legacyAwaitingDecision: 0, refunds: 0, errors: [] as string[] };
  // Legacy (pre-direct-charge) orders still move through the release scan for reporting; their funds sit in the platform balance
  // and need an owner/legal decision (see docs/payments/ledger.md). No transfer is created here.
  const { data: scanned } = await db.rpc("payment_release_scan");
  out.released = Number(scanned ?? 0);
  const { count } = await db.from("payment_orders").select("id", { count: "exact", head: true }).eq("status", "eligible_for_provider_transfer").neq("strategy", "direct");
  out.legacyAwaitingDecision = count ?? 0;
  if (!deps) return out;

  const { data: cancels } = await db.from("booking_cancellations").select("id,build_item_id,party,calculation,refunded_minor").eq("refund_status", "due").limit(limit);
  for (const c of (cancels ?? []) as { id: string; build_item_id: string; party: string; calculation: { refund_amount: number | null }; refunded_minor: number }[]) {
    // The customer admin fee is refunded too when the provider (or the platform) cancelled; not when the customer did.
    const feeBack = c.party === "provider" || c.party === "platform";
    await db.rpc("cancellation_refund_progress", { p_cancellation: c.id, p_status: "processing", p_refunded_minor: null, p_error: null });
    const { data: orders } = await db.from("payment_orders").select("*").eq("build_item_id", c.build_item_id).not("stripe_payment_intent", "is", null).order("created_at", { ascending: false });
    let remaining = Math.round(Number(c.calculation.refund_amount ?? 0) * 100) - Number(c.refunded_minor)
      + (feeBack ? ((orders ?? []) as Order[]).reduce((a, po) => a + Number(po.customer_fee_minor ?? 0), 0) : 0);
    let refunded = Number(c.refunded_minor), error: string | null = null;
    for (const po of (orders ?? []) as Order[]) {
      if (remaining <= 0) break;
      const refundable = po.amount_minor + (feeBack ? Number(po.customer_fee_minor ?? 0) : 0) - po.refunded_minor;
      const amt = Math.min(remaining, refundable);
      if (amt <= 0) continue;
      try {
        if (po.strategy === "direct" && po.payee_connected_account_id) {
          // Refund on the seller's connected-account charge; the application fee follows the disclosed policy (125.D).
          const { refund, policy } = await refundMerchantCharge(deps, { account: po.payee_connected_account_id, paymentIntent: po.stripe_payment_intent!, amountMinor: amt,
            reason: reasonFor(c.party), idempotencyKey: `refund:${c.id}:${po.reference}`, metadata: { payment_order: po.reference, cancellation: c.id },
            mode: { rowLivemode: (po as { livemode?: boolean | null }).livemode, platformLive: stripeLive() } });
          await db.from("payment_refunds").upsert({ stripe_refund_id: refund.id, stripe_account_id: po.payee_connected_account_id, payment_intent_id: po.stripe_payment_intent,
            source_type: "booking_cancellation", source_ref: c.id, amount_minor: amt, refund_application_fee: policy !== "retained", fee_policy: policy, reason_code: reasonFor(c.party),
            idempotency_key: `refund:${c.id}:${po.reference}`, status: refund.status === "succeeded" ? "succeeded" : "pending" }, { onConflict: "idempotency_key" });
        } else await refundLegacyPlatformOrder(deps.stripe, po, amt, c.id);
        remaining -= amt; refunded += amt;
      } catch (e) { error = (e as Error).message; break; }
    }
    await db.rpc("cancellation_refund_progress", { p_cancellation: c.id, p_status: error ? "failed" : remaining > 0 ? "manual" : "refunded", p_refunded_minor: refunded, p_error: error ?? (remaining > 0 ? "Insufficient captured payments to cover the refund" : null) });
    if (!error) out.refunds++; else out.errors.push(`refund ${c.id}: ${error}`);
  }
  return out;
}

/**
 * Customer-facing wording for each payment state (§39, cards 123.I and 126.D). Payment state only — booking protection and
 * Stripe payout state are shown separately. No escrow, custody or "released by Gala Dock" language.
 */
export const PAYMENT_STATE: Record<string, [string, "green" | "blue" | "orange" | "red" | "grey" | "purple"]> = {
  amount_due: ["Payment due", "orange"], payment_pending: ["Payment pending", "orange"], failed: ["Payment failed", "red"],
  payment_succeeded: ["Paid through Stripe", "green"], protected_pending_delivery: ["Paid through Stripe", "green"],
  eligible_for_provider_transfer: ["Paid through Stripe", "green"], transfer_created: ["Paid through Stripe", "green"],
  payout_pending: ["Stripe payout pending", "blue"], paid_out: ["Stripe payout complete", "grey"],
  partially_refunded: ["Partly refunded", "purple"], refunded: ["Refunded", "grey"], disputed: ["Under card dispute", "red"], cancelled: ["Cancelled", "grey"],
};
