import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { stripe } from "@/lib/stripe";
import { paymentDeps } from "@/lib/payments/server";
import { refundMerchantCharge } from "@/lib/payments/service";

type Refund = { id:string; status:string; amount:number; currency:string; payment_intent:string; metadata?:Record<string,string> };
type Job = {id:string;seller_id:string;original_order_ref:string;amount:number;stripe_refund_id:string|null;requested_at:string|null};

/**
 * Original-payer refunds only (organiser buy-back resale settlement). Durable leases and provider IDs survive retries and
 * cancellation. The refund is issued where the original payment was charged:
 *  - Q07 direct charge (`strategy = 'direct'`): on the organiser's connected account (`Stripe-Account`), via
 *    refundMerchantCharge; Gala Dock's application fee is kept (seller-initiated resale, policy `retained`). The ledger memo is
 *    posted by the connected `charge.refunded` webhook (post_direct_refund_delta); settle_resale_refund posts no platform cash.
 *  - Legacy platform charge: on the platform account, exactly as before (settle_resale_refund moves the seller liability).
 * Idempotency key `resale-refund:<payout id>` is the same on both rails; metadata `resale_payout_id` recovers a lost response.
 */
export async function processResaleRefunds(limit=10) {
 const db=untyped(createAdminClient() as never);
 const claimed=await db.rpc("claim_resale_refunds",{p_limit:limit});
 if(claimed.error)throw new Error("Could not claim resale refunds.");
 let refunded=0,pending=0,failed=0;
 for(const job of (claimed.data??[]) as Job[])try {
  const ready=await db.rpc('resale_refund_ready',{p_job:job.id});if(ready.error||ready.data!==true)throw new Error('resale_allocation_missing');
  const purchase=await db.from("checkout_orders").select("buyer_id,stripe_session,status,currency,amount,fee,strategy,connected_account_id").eq("order_ref",job.original_order_ref).single();
  const o=purchase.data;
  if(purchase.error||!o||o.buyer_id!==job.seller_id||o.status!=="issued"||!o.stripe_session||o.currency.toUpperCase()!=="GBP")throw new Error("original_payment_required");
  const direct=o.strategy==="direct";
  if(direct&&!/^acct_[A-Za-z0-9_]+$/.test(o.connected_account_id??""))throw new Error("original_account_missing");
  // Every read and write of a direct charge happens in the organiser's account context; legacy objects live on the platform.
  const ctx=direct?{stripeAccount:o.connected_account_id as string}:{};
  const amount=Math.round(Number(job.amount)*100);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>Math.round(Number(o.amount)*100))throw new Error("invalid_refund_amount");
  const session=await stripe<{payment_intent:string|null;payment_status:string;amount_total:number;currency:string;metadata:Record<string,string>}>(`checkout/sessions/${o.stripe_session}`,undefined,ctx);
  if(!session.payment_intent||session.payment_status!=="paid"||session.metadata?.order_ref!==job.original_order_ref||session.currency?.toUpperCase()!==o.currency.toUpperCase()||session.amount_total!==Math.round((Number(o.amount)+Number(o.fee))*100))throw new Error("payment_verification_failed");
  let refund:Refund|undefined;
  if(job.stripe_refund_id)refund=await stripe<Refund>(`refunds/${job.stripe_refund_id}`,undefined,ctx);
  else {
   // Recover a response lost after Stripe accepted it, including beyond its 24h idempotency retention.
   if(job.requested_at){
    let cursor="",more=true,pages=0;
    while(more&&pages++<100){
     const query=new URLSearchParams({payment_intent:session.payment_intent,limit:"100",...(cursor?{starting_after:cursor}:{})});
     const list=await stripe<{data:Refund[];has_more:boolean}>(`refunds?${query}`,undefined,ctx);
     refund=list.data.find(r=>r.metadata?.resale_payout_id===job.id);if(refund)break;
     more=list.has_more;cursor=list.data.at(-1)?.id??"";if(more&&!cursor)throw new Error("refund_reconciliation_required");
    }
    if(!refund&&(more||Date.now()-Date.parse(job.requested_at)>23*3600e3))throw new Error("refund_reconciliation_required");
   }
   if(!refund){
    const intent=await stripe<{latest_charge:{disputed:boolean;amount:number;amount_refunded:number;currency:string}|null}>(`payment_intents/${session.payment_intent}?expand[]=latest_charge`,undefined,ctx);
    const charge=intent.latest_charge;
    if(!charge||charge.disputed||charge.currency.toUpperCase()!==o.currency.toUpperCase()||charge.amount-charge.amount_refunded<amount)throw new Error("refund_balance_or_dispute");
    if(!job.requested_at){const saved=await db.from("resale_payouts").update({requested_at:new Date().toISOString()}).eq("id",job.id);if(saved.error)throw new Error("Could not record refund request.");}
    if(direct){
     const deps=paymentDeps(db);if(!deps)throw new Error("stripe_not_configured");
     // Seller-initiated resale: the application fee is retained (customer_cancelled policy; legal review pending, ledger.md).
     refund=(await refundMerchantCharge(deps,{account:o.connected_account_id as string,paymentIntent:session.payment_intent,amountMinor:amount,reason:"customer_cancelled",
      idempotencyKey:`resale-refund:${job.id}`,metadata:{order_ref:job.original_order_ref,resale_payout_id:job.id,resale:"ticket_resold"}})).refund;
    } else refund=await stripe<Refund>("refunds",{payment_intent:session.payment_intent,amount:String(amount),reason:"requested_by_customer","metadata[order_ref]":job.original_order_ref,"metadata[resale_payout_id]":job.id,"metadata[reason]":"ticket_resold"},{idempotencyKey:`resale-refund:${job.id}`});
   }
  }
  if(refund.amount!==amount||refund.currency.toUpperCase()!==o.currency.toUpperCase()||refund.payment_intent!==session.payment_intent||refund.metadata?.resale_payout_id!==job.id)throw new Error("refund_verification_failed");
  const saved=await db.from("resale_payouts").update({stripe_refund_id:refund.id,updated_at:new Date().toISOString()}).eq("id",job.id);if(saved.error)throw new Error("Could not record resale refund.");
  if(["failed","canceled"].includes(refund.status))throw new Error(`stripe_refund_${refund.status}`);
  if(refund.status!=="succeeded"){pending++;continue;}
  const completed=await db.rpc("settle_resale_refund",{p_job:job.id,p_refund:refund.id,p_amount:amount,p_currency:o.currency});if(completed.error)throw new Error("Could not confirm resale refund and seller liability.");
  refunded++;
 } catch(error){
  failed++;
  const saved=await db.from("resale_payouts").update({status:"failed",refund_error:(error as Error).message.slice(0,200),updated_at:new Date().toISOString()}).eq("id",job.id);
  if(saved.error)throw new Error("Could not record resale refund failure.");
 }
 return {refunded,pending,failed};
}
