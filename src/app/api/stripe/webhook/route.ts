import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped, type Db } from "@/lib/workspace/db";
import { finalise } from "@/lib/checkout";
import { stripe, stripeMode } from "@/lib/stripe";
import { syncConnectAccount, type StripeAccount } from "@/lib/commerce/connect";
import { syncStripeDispute, type StripeDispute } from "@/lib/commerce/disputes";
import { ledgerForTicketPayment } from "@/lib/commerce/ticket-ledger";
import { contextIsConsistent, routeEvent, verifyStripeSignature, webhookDedupeKey, type StripeEvent } from "@/lib/payments/webhook-core";
import { webhookModeDecision, webhookSecrets } from "@/lib/payments/stripe-mode";
import { withObservability } from "@/lib/observability/http";

type Obj = StripeEvent["data"]["object"];
const str = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? String((v as { id: unknown }).id) : "");

/** Legacy platform charges: refunds recorded against platform cash (pre-Q07 orders only). */
async function legacyRefund(db: Db, charge: Obj) {
  const refunded = Number(charge.amount_refunded ?? 0);
  if (!refunded) return;
  const { error } = await db.rpc("post_stripe_refund_delta", { p_charge: charge.id, p_total: refunded, p_currency: String(charge.currency ?? "gbp").toUpperCase(), p_order_ref: charge.metadata?.order_ref ?? null });
  if (error) throw new Error(`ledger: ${error.message}`);
}

const must = async (p: PromiseLike<{ error: { message: string } | null }>, what: string) => { const { error } = await p; if (error) throw new Error(`${what}: ${error.message}`); };

/**
 * Stripe webhook: authoritative payment / Connect state (cards 123.H, 124.4). One URL serves the platform and Connect endpoints
 * (live + sandbox), each with its own signing secret. Connect events carry `account` and are processed in that seller's
 * context: direct charges, refunds, disputes and payouts on the connected account. Each event is processed once per account
 * (claim → handle → finish); handlers are idempotent and order-tolerant, so Stripe retries are safe.
 */
export const POST = withObservability("webhook.stripe", async (request: Request) => {
  // Each signing secret is tagged with its endpoint's mode (unsuffixed = live endpoints, _SANDBOX = test endpoints).
  const secrets = webhookSecrets(process.env);
  if (!secrets.length) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const payload = await request.text();
  const signedBy = secrets.find(s => verifyStripeSignature(payload, request.headers.get("stripe-signature"), s.secret));
  if (!signedBy) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const endpoint = signedBy.endpoint;
  const event = JSON.parse(payload) as StripeEvent;
  const db = untyped(createAdminClient() as never);
  // Go-live guard: only events of the platform's own mode (derived from the key), signed by an endpoint secret of that mode, are
  // processed. A test event reaching a live deployment (or the reverse) is acknowledged with 200 so Stripe stops retrying, never
  // touches state, and is audited without its payload.
  const platform = stripeMode();
  const decision = webhookModeDecision(platform, signedBy.mode, event.livemode);
  if (!decision.accept) {
    await db.from("audit_events").insert({ actor_type: "webhook", event: "stripe.webhook_mode_ignored", metadata: { reason: decision.reason, platform_mode: platform,
      secret_mode: signedBy.mode, event_livemode: event.livemode === true, endpoint, event_id: String(event.id ?? "").slice(0, 80), type: String(event.type ?? "").slice(0, 80),
      account: event.account ?? null } });
    return NextResponse.json({ received: true, ignored: "mode_mismatch" });
  }
  // A connected-account object must never be processed as a platform object, or vice versa.
  if (!contextIsConsistent(event, endpoint)) return NextResponse.json({ received: true, ignored: "account_context" });

  const key = webhookDedupeKey(event);
  const { data: claimed, error: claimError } = await db.rpc("claim_webhook_event", { p_provider: "stripe", p_external_id: key, p_type: event.type, p_livemode: !!event.livemode });
  if (claimError) return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  if (!claimed) return NextResponse.json({ received: true, duplicate: true });
  await db.from("webhook_events").update({ stripe_account: event.account ?? null, object_id: event.data.object.id, endpoint }).eq("provider", "stripe").eq("external_id", key);

  try {
    const object = event.data.object, account = event.account ?? null;
    const ref = object.metadata?.order_ref, po = object.metadata?.payment_order, invoice = object.metadata?.invoice_id, merch = object.metadata?.merch_order;
    switch (routeEvent(event)) {
      case "checkout_completed":
        if (ref) await finalise(ref);
        // Q28 platform sales: credit packs add ledger credits once; a subscription checkout links the billing customer.
        if (!account && object.metadata?.purpose === "ai_credits" && object.payment_status === "paid")
          await must(db.rpc("billing_credit_pack_paid", { p_session: object, p_livemode: !!event.livemode }), "credit_pack");
        if (!account && object.metadata?.purpose === "subscription" && object.metadata?.workspace_id && str(object.customer))
          await must(db.rpc("billing_link_customer", { p_workspace: object.metadata.workspace_id, p_customer: str(object.customer), p_livemode: !!event.livemode }), "billing_customer");
        if (invoice && account && object.payment_status === "paid")
          await must(db.rpc("invoice_card_payment_succeeded", { p_session: object.id, p_pi: str(object.payment_intent), p_amount_minor: Number(object.amount_total ?? 0), p_account: account, p_livemode: !!event.livemode }), "invoice");
        break;
      case "checkout_expired":
        if (ref) {
          const { data: o } = await db.from("checkout_orders").select("token,status").eq("order_ref", ref).maybeSingle();
          if (o?.status === "pending") { await db.rpc("release_checkout", { p_token: o.token }); await db.from("checkout_orders").update({ status: "expired" }).eq("order_ref", ref); }
        }
        if (po) await db.rpc("payment_order_failed", { p_ref: po, p_reason: "checkout_expired" });
        if (invoice) await db.from("invoice_card_payments").update({ status: "expired", updated_at: new Date().toISOString() }).eq("stripe_checkout_session", object.id).eq("status", "pending");
        break;
      case "payment_succeeded": {
        const args = { p_pi: object.id, p_charge: str(object.latest_charge), p_amount_minor: Number(object.amount_received ?? 0) };
        if (po && account) await must(db.rpc("payment_order_succeeded_direct", { p_ref: po, ...args, p_livemode: !!event.livemode, p_account: account,
          p_application_fee: str(object.application_fee) || null, p_application_fee_minor: object.application_fee_amount == null ? null : Number(object.application_fee_amount) }), "payment_order");
        else if (po) await must(db.rpc("payment_order_succeeded", { p_ref: po, ...args, p_livemode: !!event.livemode }), "payment_order");
        else if (ref && account) await must(db.rpc("checkout_order_direct_paid", { p_ref: ref, ...args, p_account: account, p_application_fee: str(object.application_fee) || null }), "ticket_order");
        else if (ref) await ledgerForTicketPayment(db, object);
        // Q40 → Q07: merchandise direct charge on the organiser's account. Ledger once (stripe:pi), then merch_mark_paid; a late or
        // duplicate charge queues a full card refund (merch_card_refunds), executed by the 'merch.card_refunds' job.
        else if (merch && account) await must(db.rpc("merch_order_direct_paid", { p_ref: merch, ...args, p_account: account, p_application_fee: str(object.application_fee) || null, p_livemode: !!event.livemode }), "merch_order");
        break;
      }
      case "payment_failed":
        if (po) await db.rpc("payment_order_failed", { p_ref: po, p_reason: String((object.last_payment_error as { message?: string } | undefined)?.message ?? "declined") });
        break;
      case "charge_refunded": {
        // charge.refund.updated carries a Refund; charge.refunded carries the Charge with its cumulative total.
        if (event.type !== "charge.refunded") break;
        const pi = str(object.payment_intent);
        if (account) await must(db.rpc("post_direct_refund_delta", { p_charge: object.id, p_pi: pi, p_account: account, p_total: Number(object.amount_refunded ?? 0), p_currency: String(object.currency ?? "gbp").toUpperCase() }), "refund");
        else await legacyRefund(db, object);
        if (pi) await db.rpc("payment_order_refunded", { p_pi: pi, p_refunded_minor: Number(object.amount_refunded ?? 0) });
        if (pi && account) await db.rpc("merch_order_card_refunded", { p_pi: pi, p_account: account, p_refunded_minor: Number(object.amount_refunded ?? 0) });
        break;
      }
      case "account_updated": {
        const acct = event.type === "account.updated" ? (object as unknown as StripeAccount) : account ? await stripe<StripeAccount>(`accounts/${account}`) : null;
        if (acct) await syncConnectAccount(acct, platform);
        break;
      }
      case "dispute":
        await syncStripeDispute(object as unknown as StripeDispute, event.type, account);
        if (object.payment_intent) await db.rpc("payment_order_disputed", { p_pi: str(object.payment_intent), p_open: !["won", "lost", "warning_closed"].includes(String(object.status)) });
        break;
      case "external_account":
        if (account) await must(db.rpc("risk_payout_destination_changed", { p_account: account, p_event: event.type }), "risk");
        break;
      case "payout":
        await must(db.rpc("mirror_connected_payout", { p_payout: object, p_account: account, p_event_created: Number(event.created ?? 0), p_livemode: !!event.livemode }), "payout");
        break;
      case "application_fee":
        if (event.type !== "application_fee.refund.updated")
          await must(db.rpc("sync_application_fee", { p_fee: object.id, p_account: str(object.account), p_charge: str(object.charge) || null, p_pi: null,
            p_amount: Number(object.amount ?? 0), p_refunded: Number(object.amount_refunded ?? 0), p_currency: String(object.currency ?? "gbp").toUpperCase(), p_livemode: !!event.livemode }), "application_fee");
        break;
      case "subscription":
      {
        // A subscription that is not a Gala Dock plan (unknown workspace/price) is acknowledged, not retried forever.
        const { error } = await db.rpc("billing_apply_subscription", { p_sub: object, p_event_created: Number(event.created ?? 0), p_livemode: !!event.livemode });
        if (error && !/^unknown_(workspace|price)/.test(error.message)) throw new Error(`subscription: ${error.message}`);
      }
        break;
      case "invoice":
        await must(db.rpc("billing_record_invoice", { p_inv: object, p_event_created: Number(event.created ?? 0), p_livemode: !!event.livemode }), "invoice");
        break;
      default: break;
    }
    // Only now is the event done; a throw above leaves it claimable so Stripe's retry completes it (order tolerance).
    await db.rpc("finish_webhook_event", { p_provider: "stripe", p_external_id: key, p_status: "processed" });
    return NextResponse.json({ received: true });
  } catch (error) {
    await db.rpc("finish_webhook_event", { p_provider: "stripe", p_external_id: key, p_status: "failed", p_error: error instanceof Error ? error.message : "error" });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}, { kind: "webhook" });
