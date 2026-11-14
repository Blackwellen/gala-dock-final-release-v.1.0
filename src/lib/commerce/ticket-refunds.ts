import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { stripe, stripeLive } from "@/lib/stripe";
import { paymentDeps } from "@/lib/payments/server";
import { refundKey, refundMerchantCharge } from "@/lib/payments/service";

/**
 * Executes queued ticket-order refunds (event cancellation). Full amount incl. booking fee, to the original payment method,
 * idempotent per order (`ticket-refund:<order_ref>`), so a retry or a concurrent worker can never refund twice.
 */
export async function processTicketRefunds(limit = 25) {
  const db = untyped(createAdminClient() as never);
  const { data, error: claimError } = await db.rpc("claim_ticket_refunds", { p_limit: limit });
  if (claimError) throw new Error("Could not claim ticket refunds.");
  let refunded = 0, failed = 0, pending = 0;
  const deps = paymentDeps(db);
  for (const o of (data ?? []) as { order_ref: string; stripe_session: string | null; stripe_refund_id: string | null; refund_reason: string | null; amount: number; fee: number; event_id: string; buyer_id: string;
    strategy?: string; connected_account_id?: string | null; stripe_payment_intent?: string | null; refund_attempt?: number | null }[]) {
    try {
      if (!o.stripe_session) throw new Error("no_payment_record");
      type Refund = { id: string | null; status: string; amount: number };
      let r:Refund;
      const direct = o.strategy === "direct" && !!o.connected_account_id;
      // Direct charge (Q07): the charge, and therefore the refund, lives on the organiser's connected account.
      const acct = direct ? { stripeAccount: o.connected_account_id! } : {};
      const s = await stripe<{ payment_intent: string | null; amount_total: number }>(`checkout/sessions/${o.stripe_session}`, undefined, acct);
      if (!s.payment_intent) throw new Error("no_payment_intent");
      if(o.stripe_refund_id)r=await stripe<Refund>(`refunds/${o.stripe_refund_id}`, undefined, acct);
      else if(direct){
        if(!deps)throw new Error("stripe_not_configured");
        const reason = o.refund_reason === "hold_expired" ? "hold_expired" : "event_cancelled";
        // DEC-107: an event cancellation (or our expired hold) refunds the whole purchase by law, so the seller fee and the
        // booking fee both go back to the organiser's balance as an application-fee refund.
        const { data: fees } = await db.from("checkout_orders").select("application_fee_minor").eq("order_ref", o.order_ref).maybeSingle();
        const priceMinor = Math.round(Number(o.amount) * 100), bookingFeeMinor = Math.round(Number(o.fee) * 100);
        const appFee = Number((fees as { application_fee_minor: number | null } | null)?.application_fee_minor ?? bookingFeeMinor);
        // Q58: a retry after a FAILED refund (stripe_refund_failed → refund_attempt + 1) needs a new key, or Stripe returns the cached failure.
        const key = refundKey(`ticket-refund:${o.order_ref}`, o.refund_attempt);
        const done = await refundMerchantCharge(deps, { account: o.connected_account_id!, paymentIntent: s.payment_intent, reason, idempotencyKey: key, metadata: { order_ref: o.order_ref },
          split: { sellerAmountMinor: priceMinor, sellerFeeMinor: Math.max(0, appFee - bookingFeeMinor), customerFeeRefundMinor: bookingFeeMinor } });
        r = { id: done.refund.id, status: done.refund.status, amount: done.refund.amount };
        // Q58: ticket refunds get a payment_refunds row too, so refunds_exceed_charge and reconciliation see them.
        const { error: re } = await db.from("payment_refunds").upsert({ stripe_refund_id: done.refund.id, stripe_account_id: o.connected_account_id, payment_intent_id: s.payment_intent,
          source_type: "checkout_order", source_ref: o.order_ref, amount_minor: done.refund.amount, refund_application_fee: !!done.feeRefund, fee_policy: "dec107", reason_code: reason,
          idempotency_key: key, status: ["succeeded", "failed", "canceled"].includes(done.refund.status) ? done.refund.status : "pending", livemode: stripeLive() }, { onConflict: "idempotency_key" });
        if (re) throw new Error(`refund_row: ${re.message}`);
      }
      else {
        const intent=await stripe<{latest_charge:{paid:boolean;amount:number;amount_refunded:number}|null}>(`payment_intents/${s.payment_intent}?expand[]=latest_charge`);
        const charge=intent.latest_charge;
        if(!charge?.paid||charge.amount!==s.amount_total)throw new Error("payment_verification_failed");
        // A previous confirmed resale refund may already have returned the whole purchase (no booking fee).
        // Mark completion from Stripe's charge, rather than repeatedly attempting to refund an empty balance.
        if(charge.amount_refunded===charge.amount){
          let confirmed=0,cursor="",more=true,pages=0;
          while(more&&confirmed<charge.amount&&pages++<100){
            const query=new URLSearchParams({payment_intent:s.payment_intent,limit:"100",...(cursor?{starting_after:cursor}:{})});
            const list=await stripe<{data:Refund[];has_more:boolean}>(`refunds?${query}`);
            confirmed+=list.data.filter(x=>x.status==="succeeded").reduce((sum,x)=>sum+x.amount,0);
            more=list.has_more;cursor=list.data.at(-1)?.id??"";if(more&&!cursor)throw new Error("refund_reconciliation_required");
          }
          if(confirmed<charge.amount)throw new Error("refund_confirmation_pending");
          r={id:null,status:"succeeded",amount:0};
        }else r=await stripe<Refund>("refunds", { payment_intent: s.payment_intent, reason: "requested_by_customer", "metadata[order_ref]": o.order_ref, "metadata[reason]": o.refund_reason ?? "event_cancelled" },
          { idempotencyKey: `ticket-refund:${o.order_ref}` });
      }
      const saved = await db.from("checkout_orders").update({ stripe_refund_id: r.id, updated_at: new Date().toISOString() }).eq("order_ref", o.order_ref);
      if (saved.error) throw new Error("Could not record the Stripe refund.");
      if (["failed", "canceled"].includes(r.status)) throw new Error(`stripe_refund_${r.status}`);
      if (r.status !== "succeeded") { pending++; continue; }
      const completed = await db.from("checkout_orders").update({ refund_status: "refunded", status: "refunded", refunded_at: new Date().toISOString(), refund_error: null, updated_at: new Date().toISOString() }).eq("order_ref", o.order_ref);
      if (completed.error) throw new Error("Could not record the completed refund.");
      const tickets = await db.from("tickets").update({ status: "refunded" }).eq("order_ref", o.order_ref).in("status", ["cancelled", "valid"]);
      if (tickets.error) throw new Error("Could not update refunded tickets.");
      const { data: ev } = await db.from("events").select("workspace_id").eq("id", o.event_id).single();
      await db.from("audit_events").insert({ actor_type: "system", workspace_id: (ev as { workspace_id: string } | null)?.workspace_id ?? null, event: "ticket.refunded",
        metadata: { order_ref: o.order_ref, refund_id: r.id, amount_minor: r.amount, reason: o.refund_reason ?? "event_cancelled" } });
      refunded++;
    } catch (e) {
      failed++;
      await db.from("checkout_orders").update({ refund_status: "failed", refund_error: (e as Error).message.slice(0, 200), updated_at: new Date().toISOString() }).eq("order_ref", o.order_ref);
    }
  }
  return { refunded, failed, pending };
}
