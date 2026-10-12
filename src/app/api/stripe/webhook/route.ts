import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { finalise } from "@/lib/checkout";
import { syncConnectAccount, type StripeAccount } from "@/lib/commerce/connect";
import { syncStripeDispute, type StripeDispute } from "@/lib/commerce/disputes";

/** Verifies a Stripe-Signature header (v1 HMAC-SHA256, 5-minute tolerance). */
function verify(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=") as [string, string]));
  const t = Number(parts.t); if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return header.split(",").filter(p => p.startsWith("v1=")).some(p => { const a = Buffer.from(p.slice(3)), b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); });
}

type StripeEvent = { id: string; type: string; livemode?: boolean; account?: string; data: { object: Record<string, unknown> & { id: string; metadata?: Record<string, string> } } };

/** Posts a balanced ledger transaction for a succeeded ticket-order payment (amounts from Stripe are authoritative). */
async function ledgerForPayment(db: ReturnType<typeof untyped>, pi: StripeEvent["data"]["object"]) {
  const ref = pi.metadata?.order_ref;
  const amount = Number(pi.amount_received ?? 0);
  if (!ref || !amount) return;
  const { data: order } = await db.from("checkout_orders").select("fee,commission,currency,event_id,buyer_id,kind").eq("order_ref", ref).maybeSingle();
  if (!order) return;
  const { data: event } = order.event_id ? await db.from("events").select("workspace_id,owner_id").eq("id", order.event_id).maybeSingle() : { data: null };
  // Platform revenue = buyer booking fee + seller commission; the rest is payable to the seller.
  const fee = Math.min(amount, Math.round((Number(order.fee ?? 0) + Number(order.commission ?? 0)) * 100));
  const seller = event?.workspace_id ? { party_type: "workspace", party_id: event.workspace_id } : { party_type: "user", party_id: event?.owner_id ?? null };
  const lines = [
    { account: "cash_stripe", amount_minor: amount, party_type: "platform" },
    ...(fee ? [{ account: "platform_fee", amount_minor: -fee, party_type: "platform" }] : []),
    { account: "provider_payable", amount_minor: -(amount - fee), ...seller },
  ];
  const { error } = await db.rpc("post_ledger_transaction", {
    p_idempotency_key: `stripe:pi:${pi.id}`, p_kind: order.kind === "resale" ? "ticket_resale" : "ticket_order",
    p_currency: String(pi.currency ?? order.currency ?? "gbp").toUpperCase(), p_lines: lines,
    p_workspace: event?.workspace_id ?? null, p_event: order.event_id ?? null, p_source_type: "checkout_order", p_source_id: ref,
    p_description: `Ticket order ${ref}`, p_stripe_ref: pi.id, p_actor_type: "webhook",
  });
  if (error) throw new Error(`ledger: ${error.message}`);
}

/** Records refunds in the ledger. Refunds themselves are issued by finalise()/admin flows — never here. */
async function ledgerForRefund(db: ReturnType<typeof untyped>, charge: StripeEvent["data"]["object"]) {
  const refunded = Number(charge.amount_refunded ?? 0);
  const ref = charge.metadata?.order_ref;
  if (!refunded) return;
  const { data: order } = ref ? await db.from("checkout_orders").select("event_id").eq("order_ref", ref).maybeSingle() : { data: null };
  const { data: event } = order?.event_id ? await db.from("events").select("workspace_id").eq("id", order.event_id).maybeSingle() : { data: null };
  // Keyed on the cumulative refunded amount: each new partial refund posts once, retries post nothing.
  const { error } = await db.rpc("post_ledger_transaction", {
    p_idempotency_key: `stripe:refund:${charge.id}:${refunded}`, p_kind: "refund", p_currency: String(charge.currency ?? "gbp").toUpperCase(),
    p_lines: [{ account: "refunds", amount_minor: refunded, party_type: "platform" }, { account: "cash_stripe", amount_minor: -refunded, party_type: "platform" }],
    p_workspace: event?.workspace_id ?? null, p_event: order?.event_id ?? null, p_source_type: ref ? "checkout_order" : "charge", p_source_id: ref ?? charge.id,
    p_description: `Refund ${ref ?? charge.id} (cumulative ${refunded})`, p_stripe_ref: charge.id, p_actor_type: "webhook",
  });
  if (error) throw new Error(`ledger: ${error.message}`);
}

/** Stripe webhook: authoritative payment/Connect state. Each event is processed once (claim → handle → finish). */
export async function POST(request: Request) {
  // One URL serves four Stripe endpoints (live/sandbox × platform/Connect); each signs with its own secret.
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_CONNECT, process.env.STRIPE_WEBHOOK_SECRET_SANDBOX, process.env.STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT].filter((v): v is string => !!v);
  if (!secrets.length) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!secrets.some(secret => verify(payload, signature, secret))) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const event = JSON.parse(payload) as StripeEvent;
  const db = untyped(createAdminClient() as never);

  const { data: claimed, error: claimError } = await db.rpc("claim_webhook_event", { p_provider: "stripe", p_external_id: event.id, p_type: event.type, p_livemode: !!event.livemode });
  if (claimError) return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  if (!claimed) return NextResponse.json({ received: true, duplicate: true });

  try {
    const object = event.data.object;
    const ref = object.metadata?.order_ref;
    if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && ref) await finalise(ref);
    if (event.type === "checkout.session.expired" && ref) {
      const { data: o } = await db.from("checkout_orders").select("token,status").eq("order_ref", ref).maybeSingle();
      if (o?.status === "pending") { await db.rpc("release_checkout", { p_token: o.token }); await db.from("checkout_orders").update({ status: "expired" }).eq("order_ref", ref); }
    }
    const po = object.metadata?.payment_order;
    if (event.type === "payment_intent.succeeded") {
      if (po) { const { error } = await db.rpc("payment_order_succeeded", { p_ref: po, p_pi: object.id, p_charge: String(object.latest_charge ?? ""), p_amount_minor: Number(object.amount_received ?? 0), p_livemode: !!event.livemode }); if (error) throw new Error(`payment_order: ${error.message}`); }
      else await ledgerForPayment(db, object);
    }
    if (event.type === "payment_intent.payment_failed" && po) await db.rpc("payment_order_failed", { p_ref: po, p_reason: String((object.last_payment_error as { message?: string } | undefined)?.message ?? "declined") });
    if (event.type === "checkout.session.expired" && po) await db.rpc("payment_order_failed", { p_ref: po, p_reason: "checkout_expired" });
    if (event.type === "charge.refunded") {
      await ledgerForRefund(db, object);
      if (object.payment_intent) await db.rpc("payment_order_refunded", { p_pi: String(object.payment_intent), p_refunded_minor: Number(object.amount_refunded ?? 0) });
    }
    if (event.type === "account.updated") await syncConnectAccount(object as unknown as StripeAccount);
    if (event.type.startsWith("charge.dispute.")) {
      await syncStripeDispute(object as unknown as StripeDispute, event.type);
      if (object.payment_intent) await db.rpc("payment_order_disputed", { p_pi: String(object.payment_intent), p_open: !["won", "lost", "warning_closed"].includes(String(object.status)) });
    }
    // Only now is the event done; a throw above leaves it claimable so Stripe's retry completes it.
    await db.rpc("finish_webhook_event", { p_provider: "stripe", p_external_id: event.id, p_status: "processed" });
    return NextResponse.json({ received: true });
  } catch (error) {
    await db.rpc("finish_webhook_event", { p_provider: "stripe", p_external_id: event.id, p_status: "failed", p_error: error instanceof Error ? error.message : "error" });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
