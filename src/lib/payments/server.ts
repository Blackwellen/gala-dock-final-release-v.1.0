import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped, type Db } from "@/lib/workspace/db";
import { stripeClient } from "@/lib/stripe";
import type { MarketplaceOrder, PaymentData, PaymentDeps } from "./service";
import type { SellerAccount } from "./rules";

/** Supabase-backed data layer for the payment service. Service role: callers authorise the actor before reaching here. */
export function supabasePaymentData(db: Db = untyped(createAdminClient() as never)): PaymentData {
  const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  };
  return {
    sellerAccount: async ws => (await rpc<SellerAccount | null>("seller_payment_account", { p_workspace: ws })) ?? null,
    prepareMarketplaceOrder: (ref, account, merchant, terms, group) =>
      rpc<MarketplaceOrder>("payment_order_direct_prepare", { p_ref: ref, p_account: account, p_merchant: merchant, p_terms: terms, p_group: group ?? null }),
    markMarketplacePending: async (ref, session) => { await rpc("payment_order_pending", { p_ref: ref, p_session: session }); },
    prepareTicketOrder: async (ref, seller, account, fee, merchant, feeRule) => {
      await rpc("checkout_order_direct_prepare", { p_ref: ref, p_seller: seller, p_account: account, p_fee_minor: fee, p_merchant: merchant, p_fee_rule: feeRule });
    },
    setTicketSession: async (ref, session) => {
      const { error } = await db.from("checkout_orders").update({ stripe_session: session, updated_at: new Date().toISOString() }).eq("order_ref", ref);
      if (error) throw new Error(error.message);
    },
  };
}

/** Production dependencies, or null when Stripe isn't configured in this environment. */
export function paymentDeps(db?: Db): PaymentDeps | null {
  const client = stripeClient();
  return client ? { stripe: client, data: supabasePaymentData(db) } : null;
}
