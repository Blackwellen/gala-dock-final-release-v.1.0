import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { stripeKey } from "@/lib/stripe";

/**
 * Payment orchestration (master spec §38–43). The only place marketplace money moves through Stripe:
 *  - startPayment(): canonical payment order (DB computes the amount + commission snapshot) → Stripe Checkout.
 *  - processPayments(): release scan → transfers to providers' connected accounts → cancellation refunds (+ transfer reversals).
 * Webhooks confirm every state change; redirects never mark anything paid. Strategy: "separate charges and transfers"
 * (platform collects, protects until delivery, then transfers) — see docs/architecture/payments.md for the legal/merchant assumptions.
 */

export type PayKind = "deposit" | "balance_payment" | "standby_fee" | "emergency_service" | "platform_boost";
type Order = { id: string; reference: string; kind: string; status: string; amount_minor: number; platform_fee_minor: number; refunded_minor: number; transferred_minor: number;
  currency: string; description: string; payee_workspace_id: string | null; build_item_id: string | null; event_id: string | null; stripe_checkout_session: string | null;
  stripe_payment_intent: string | null; stripe_charge: string | null; stripe_transfer: string | null };

/** Stripe REST with an Idempotency-Key, so retries never double-charge, double-transfer or double-refund. */
async function stripeIdem<T>(path: string, params: Record<string, string> | null, idem?: string): Promise<T> {
  const key = stripeKey();
  if (!key) throw new Error("stripe_not_configured");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: params ? new URLSearchParams(params) : undefined, signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.code ?? data?.error?.message ?? "stripe_error");
  return data as T;
}

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
  // Promotion boosts are platform revenue with their own order function (price from the boost catalogue).
  const { data, error } = kind === "platform_boost"
    ? await supabase.rpc("create_boost_payment_order" as never, { p_boost: ids.boostId ?? null } as never)
    : await supabase.rpc("create_payment_order" as never, { p_kind: kind, p_item: ids.itemId ?? null, p_standby: ids.standbyId ?? null } as never);
  if (error) return { ok: false, error: ERR.find(([re]) => re.test(error.message))?.[1] ?? "Couldn’t start the payment. You haven’t been charged." };
  const po = data as unknown as Order;
  if (!stripeKey()) return { ok: false, error: "Card payments aren’t configured in this environment yet." };
  const db = untyped(createAdminClient() as never);
  try {
    if (po.stripe_checkout_session) {
      const s = await stripeIdem<{ status: string; url: string | null }>(`checkout/sessions/${po.stripe_checkout_session}`, null);
      if (s.status === "open" && s.url) return { ok: true, url: s.url, reference: po.reference };
    }
    const back = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/";
    const p: Record<string, string> = {
      mode: "payment", customer_email: user.email ?? "", client_reference_id: po.reference,
      success_url: `${origin}/payments/${po.reference}?back=${encodeURIComponent(back)}`, cancel_url: `${origin}${back}${back.includes("?") ? "&" : "?"}payment=cancelled`,
      expires_at: String(Math.floor(Date.now() / 1000) + 60 * 60),
      "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": po.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(po.amount_minor),
      "line_items[0][price_data][product_data][name]": po.description.slice(0, 200),
      "metadata[payment_order]": po.reference, "payment_intent_data[metadata][payment_order]": po.reference, "payment_intent_data[transfer_group]": po.reference,
      "payment_intent_data[description]": `${po.reference} · ${po.description}`.slice(0, 300),
    };
    const s = await stripeIdem<{ id: string; url: string }>("checkout/sessions", p, `${po.reference}:checkout:${Math.floor(Date.now() / 3_600_000)}`);
    await db.rpc("payment_order_pending", { p_ref: po.reference, p_session: s.id });
    return { ok: true, url: s.url, reference: po.reference };
  } catch {
    return { ok: false, error: "Couldn’t reach the payment provider. You haven’t been charged — please try again." };
  }
}

/** Background processing (cron): release eligible funds to providers and execute queued cancellation refunds. Idempotent. */
export async function processPayments(limit = 20) {
  const db = untyped(createAdminClient() as never);
  const out = { released: 0, transferred: 0, waitingOnboarding: 0, refunds: 0, errors: [] as string[] };
  const { data: scanned } = await db.rpc("payment_release_scan");
  out.released = Number(scanned ?? 0);

  // Transfers: only to providers whose Stripe account can receive them (payout_eligible), with the charge as source.
  const { data: due } = await db.from("payment_orders").select("*").eq("status", "eligible_for_provider_transfer").order("release_eligible_at").limit(limit);
  for (const po of (due ?? []) as Order[]) {
    if (!po.payee_workspace_id || !po.stripe_charge) continue;
    const { data: ok } = await db.rpc("payout_eligible", { p_workspace: po.payee_workspace_id });
    const { data: acct } = await db.from("connect_accounts").select("stripe_account_id").eq("workspace_id", po.payee_workspace_id).maybeSingle();
    if (!ok || !acct?.stripe_account_id) { out.waitingOnboarding++; continue; }
    const share = po.amount_minor > 0 ? (po.amount_minor - po.platform_fee_minor) / po.amount_minor : 0;
    const amount = Math.floor((po.amount_minor - po.refunded_minor) * share);
    if (amount <= 0) continue;
    try {
      const t = await stripeIdem<{ id: string; amount: number }>("transfers", {
        amount: String(amount), currency: po.currency.toLowerCase(), destination: acct.stripe_account_id, transfer_group: po.reference, source_transaction: po.stripe_charge,
        "metadata[payment_order]": po.reference, description: `Gala Dock payout · ${po.description}`.slice(0, 300),
      }, `transfer:${po.reference}`);
      await db.rpc("payment_order_transferred", { p_ref: po.reference, p_transfer: t.id, p_amount_minor: t.amount });
      out.transferred++;
    } catch (e) { out.errors.push(`transfer ${po.reference}: ${(e as Error).message}`); }
  }

  // Cancellation refunds (§45): refund the customer's payments newest-first; reverse the provider transfer pro rata where already released.
  const { data: cancels } = await db.from("booking_cancellations").select("id,build_item_id,calculation,refunded_minor").eq("refund_status", "due").limit(limit);
  for (const c of (cancels ?? []) as { id: string; build_item_id: string; calculation: { refund_amount: number | null }; refunded_minor: number }[]) {
    let remaining = Math.round(Number(c.calculation.refund_amount ?? 0) * 100) - Number(c.refunded_minor);
    await db.rpc("cancellation_refund_progress", { p_cancellation: c.id, p_status: "processing", p_refunded_minor: null, p_error: null });
    const { data: orders } = await db.from("payment_orders").select("*").eq("build_item_id", c.build_item_id).not("stripe_payment_intent", "is", null).order("created_at", { ascending: false });
    let refunded = Number(c.refunded_minor), error: string | null = null;
    for (const po of (orders ?? []) as Order[]) {
      if (remaining <= 0) break;
      const refundable = po.amount_minor - po.refunded_minor;
      const amt = Math.min(remaining, refundable);
      if (amt <= 0) continue;
      try {
        await stripeIdem("refunds", { payment_intent: po.stripe_payment_intent!, amount: String(amt), reason: "requested_by_customer", "metadata[payment_order]": po.reference, "metadata[cancellation]": c.id }, `refund:${c.id}:${po.reference}`);
        if (po.stripe_transfer && po.transferred_minor > 0) {
          const back = Math.min(po.transferred_minor, Math.round(amt * (po.amount_minor - po.platform_fee_minor) / po.amount_minor));
          if (back > 0) await stripeIdem(`transfers/${po.stripe_transfer}/reversals`, { amount: String(back), "metadata[cancellation]": c.id }, `reversal:${c.id}:${po.reference}`);
        }
        remaining -= amt; refunded += amt;
      } catch (e) { error = (e as Error).message; break; }
    }
    await db.rpc("cancellation_refund_progress", { p_cancellation: c.id, p_status: error ? "failed" : remaining > 0 ? "manual" : "refunded", p_refunded_minor: refunded, p_error: error ?? (remaining > 0 ? "Insufficient captured payments to cover the refund" : null) });
    if (!error) out.refunds++; else out.errors.push(`refund ${c.id}: ${error}`);
  }
  return out;
}

/** Customer-facing wording for each payment state (§39 — no escrow claims). */
export const PAYMENT_STATE: Record<string, [string, "green" | "blue" | "orange" | "red" | "grey" | "purple"]> = {
  amount_due: ["Payment due", "orange"], payment_pending: ["Payment pending", "orange"], failed: ["Payment failed", "red"],
  payment_succeeded: ["Paid", "green"], protected_pending_delivery: ["Paid · protected until delivery", "green"],
  eligible_for_provider_transfer: ["Provider payout pending", "blue"], transfer_created: ["Released to provider", "blue"],
  payout_pending: ["Provider payout pending", "blue"], paid_out: ["Paid out to provider", "grey"],
  partially_refunded: ["Partly refunded", "purple"], refunded: ["Refunded", "grey"], disputed: ["Under card dispute", "red"], cancelled: ["Cancelled", "grey"],
};
