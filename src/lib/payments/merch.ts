import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped, type Db } from "@/lib/workspace/db";
import { stripeClient } from "@/lib/stripe";
import type { SellerAccount, RefundReason } from "./rules";
import { executeMerchCardRefund, type MerchDeps, type MerchOrder, type MerchPaymentData } from "./merch-service";

/** Supabase-backed data layer for merchandise payments (service role; callers authorise the actor first). */
export function supabaseMerchData(db: Db = untyped(createAdminClient() as never)): MerchPaymentData {
  const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  };
  return {
    sellerAccount: async ws => (await rpc<SellerAccount | null>("seller_payment_account", { p_workspace: ws })) ?? null,
    prepareMerchOrder: (ref, account, merchant) => rpc<MerchOrder>("merch_direct_prepare", { p_ref: ref, p_account: account, p_merchant: merchant }),
    setMerchSession: async (ref, session) => { await rpc("merch_set_session", { p_ref: ref, p_session: session }); },
    claimCardRefund: async id => {
      const c = await rpc<{ claimed: boolean; id: string; order_ref: string; account: string; payment_intent: string; amount_minor: number; reason: RefundReason; idempotency_key: string }>("merch_card_refund_claim", { p_id: id });
      return c?.claimed ? { id: c.id, order_ref: c.order_ref, account: c.account, payment_intent: c.payment_intent, amount_minor: Number(c.amount_minor), reason: c.reason, idempotency_key: c.idempotency_key } : null;
    },
    cardRefundResult: async (id, refund, status, error) => { await rpc("merch_card_refund_result", { p_id: id, p_stripe_refund: refund, p_status: status, p_error: error ?? null }); },
  };
}

export function merchDeps(db?: Db): MerchDeps | null {
  const client = stripeClient();
  return client ? { stripe: client, data: supabaseMerchData(db) } : null;
}

/** Runs every due card refund (job 'merch.card_refunds', and right after the webhook or a staff refund queues one). */
export async function processMerchCardRefunds(db: Db = untyped(createAdminClient() as never), limit = 25) {
  const deps = merchDeps(db);
  if (!deps) return { deferred: "stripe_not_configured" };
  const { data, error } = await db.rpc("merch_card_refunds_due", { p_limit: limit });
  if (error) throw new Error(`merch refunds due: ${error.message}`);
  const ids = ((data ?? []) as (string | { merch_card_refunds_due: string })[]).map(r => (typeof r === "string" ? r : r.merch_card_refunds_due));
  const results = [];
  for (const id of ids) results.push(await executeMerchCardRefund(deps, id));
  return { processed: results.length, succeeded: results.filter(r => r.result === "succeeded").length, failed: results.filter(r => r.result === "failed").length };
}
