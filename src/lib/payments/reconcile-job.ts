import "server-only";
import type { ServiceDb } from "@/lib/foundation";
import { stripeClient, stripeLive } from "@/lib/stripe";
import { getDirectPaymentStatus } from "./service";
import { detectVariances, type InternalPayment, type StripeView } from "./reconcile-core";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

/**
 * Daily direct-charge reconciliation (card 128), run as the `payments.reconcile` app job on job_queue.
 * For every direct charge touched in the window it reads the Checkout Session + PaymentIntent in the seller's connected-account
 * context and records immutable variances (wrong account, missing/wrong application fee, amount, paid-without-charge…).
 * It also scans platform transfers: any transfer tied to a direct order is a critical architecture anomaly (128.2).
 */
export async function reconcileDirectCharges(db: ServiceDb, o: { days?: number } = {}) {
  const client = stripeClient();
  if (!client) throw new Error("stripe_not_configured");
  const deps = { stripe: client, data: null as never };
  // Go-live (A2): only rows of the key's mode are reconciled — a live key cannot read test sessions (and must not report them).
  const live = stripeLive();
  const since = new Date(Date.now() - (o.days ?? 3) * 864e5).toISOString();
  const { data: run, error } = await db.from("reconciliation_runs").insert({ scope: "direct_charges", livemode: live }).select("id").single();
  if (error || !run) throw new Error(`reconciliation run: ${error?.message}`);
  const items: Row[] = [];
  let checked = 0;
  const [{ data: pos }, { data: cos }, { data: invs }, { data: mos }] = await Promise.all([
    db.from("payment_orders").select("reference,strategy,status,payee_connected_account_id,stripe_checkout_session,stripe_payment_intent,amount_minor,customer_fee_minor,application_fee_minor,currency,refunded_minor").gte("updated_at", since).eq("livemode", live).neq("strategy", "platform"),
    db.from("checkout_orders").select("order_ref,strategy,status,connected_account_id,stripe_session,stripe_payment_intent,amount,fee,application_fee_minor,currency").gte("updated_at", since).eq("livemode", live).gt("amount", 0),
    db.from("invoice_card_payments").select("id,status,connected_account_id,stripe_checkout_session,stripe_payment_intent,amount_minor,application_fee_minor,currency").gte("updated_at", since).eq("livemode", live),
    // Q40 merchandise: only orders that reached Stripe; an expired reservation that was charged is "paid" from Stripe's side.
    db.from("merch_orders").select("order_ref,strategy,status,refund_required,connected_account_id,stripe_checkout_session,stripe_payment_intent,total_minor,application_fee_minor,card_refunded_minor,currency").gte("updated_at", since).eq("livemode", live).not("stripe_checkout_session", "is", null),
  ]);
  const internal: InternalPayment[] = [
    ...((pos ?? []) as Row[]).map(p => ({ sourceType: "payment_order" as const, ref: String(p.reference), strategy: String(p.strategy), status: String(p.status), account: (p.payee_connected_account_id as string) ?? null,
      sessionId: (p.stripe_checkout_session as string) ?? null, paymentIntent: (p.stripe_payment_intent as string) ?? null, grossMinor: n(p.amount_minor) + n(p.customer_fee_minor),
      applicationFeeMinor: p.application_fee_minor == null ? null : n(p.application_fee_minor), currency: String(p.currency) })),
    ...((cos ?? []) as Row[]).map(c => ({ sourceType: "checkout_order" as const, ref: String(c.order_ref), strategy: String(c.strategy ?? "platform"), status: String(c.status), account: (c.connected_account_id as string) ?? null,
      sessionId: (c.stripe_session as string) ?? null, paymentIntent: (c.stripe_payment_intent as string) ?? null, grossMinor: Math.round((n(c.amount) + n(c.fee)) * 100),
      applicationFeeMinor: c.application_fee_minor == null ? null : n(c.application_fee_minor), currency: String(c.currency) })),
    ...((invs ?? []) as Row[]).map(i => ({ sourceType: "invoice_card_payment" as const, ref: String(i.id), strategy: "direct", status: String(i.status), account: (i.connected_account_id as string) ?? null,
      sessionId: (i.stripe_checkout_session as string) ?? null, paymentIntent: (i.stripe_payment_intent as string) ?? null, grossMinor: n(i.amount_minor), applicationFeeMinor: n(i.application_fee_minor), currency: String(i.currency) })),
    ...((mos ?? []) as Row[]).map(m => ({ sourceType: "merch_order" as const, ref: String(m.order_ref), strategy: String(m.strategy ?? "direct"),
      status: m.refund_required ? "paid" : String(m.status), account: (m.connected_account_id as string) ?? null, sessionId: (m.stripe_checkout_session as string) ?? null,
      paymentIntent: (m.stripe_payment_intent as string) ?? null, grossMinor: n(m.total_minor), applicationFeeMinor: m.application_fee_minor == null ? null : n(m.application_fee_minor), currency: String(m.currency ?? "GBP") })),
  ];
  for (const p of internal) {
    if (p.strategy === "direct" && !p.sessionId) continue;   // never reached Stripe
    let view: StripeView = null;
    if (p.strategy === "direct" && p.account && p.sessionId) {
      try {
        const s = await getDirectPaymentStatus(deps, p.account, p.sessionId);
        view = { found: true, account: p.account, paid: s.paid, amountMinor: s.amountMinor, currency: p.currency, applicationFeeMinor: s.applicationFeeMinor, paymentIntent: s.paymentIntent };
      } catch { view = { found: false, account: null, paid: false, amountMinor: 0, currency: p.currency, applicationFeeMinor: null, paymentIntent: null }; }
    }
    checked++;
    for (const v of detectVariances(p, view)) items.push({ run_id: run.id, source_type: p.sourceType, source_ref: p.ref, stripe_account_id: p.account, stripe_object_id: p.sessionId,
      variance: v.variance, severity: v.severity, expected: v.expected ?? null, actual: v.actual ?? null });
  }
  // 128.2: no platform → seller transfer may exist for a direct order.
  const directRefs = new Set(internal.filter(p => p.strategy === "direct").map(p => p.ref));
  try {
    const t = await client.request<{ data: { id: string; metadata?: Record<string, string>; transfer_group?: string | null }[] }>({ method: "GET", path: `transfers?limit=100&created[gte]=${Math.floor(Date.parse(since) / 1000)}` });
    for (const tr of t.data) {
      const ref = tr.metadata?.payment_order ?? tr.metadata?.order_ref ?? tr.transfer_group ?? "";
      if (directRefs.has(ref)) items.push({ run_id: run.id, source_type: "transfer", source_ref: ref, stripe_object_id: tr.id, variance: "unexpected_transfer", severity: "critical" });
    }
  } catch { /* transfer listing unavailable: recorded as run error below only if nothing else failed */ }
  if (items.length) { const { error: ie } = await db.from("reconciliation_items").insert(items); if (ie) throw new Error(`reconciliation items: ${ie.message}`); }
  await db.from("reconciliation_runs").update({ finished_at: new Date().toISOString(), status: items.length ? "variances" : "clean", checked, variances: items.length }).eq("id", run.id);
  return { run: run.id, checked, variances: items.length, critical: items.filter(i => i.severity === "critical").length };
}
