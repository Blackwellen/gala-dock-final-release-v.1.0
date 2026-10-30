import "server-only";
import { stripe, stripeClient, stripeMode } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CustomerCtx } from "@/lib/data/context";

export type SavedCard = { id: string; brand: string; last4: string; exp: string; wallet: string | null; isDefault: boolean };
type PM = { id: string; customer: string | null; card?: { brand: string; last4: string; exp_month: number; exp_year: number; wallet?: { type: string } | null } };

/**
 * The caller's Stripe customer id for the CURRENT mode, created on first use (stored server-side; never writable by the client).
 * Test customers live in profiles.stripe_customer_id, live ones in stripe_customer_id_live (202610295001): a test cus_ is never sent
 * to the live API.
 */
export async function stripeCustomer(ctx: CustomerCtx, create = true): Promise<string | null> {
  const mode = stripeMode();
  if (mode === "unconfigured") throw new Error("stripe_not_configured");
  // Inline (no extra module import): tests/release/saved-payment-methods.spec.ts loads this file with a stubbed require.
  const col = mode === "live" ? "stripe_customer_id_live" : "stripe_customer_id";
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select(col).eq("id", ctx.user.id).single();
  if (error) throw new Error("payment_profile_unavailable");
  const existing = (data as unknown as Record<string, string | null> | null)?.[col];
  if (existing) return existing;
  if (!create) return null;
  const c = await stripe<{ id: string }>("customers", { email: ctx.user.email ?? "", name: ctx.name, "metadata[user_id]": ctx.user.id });
  await admin.from("profiles").update({ [col]: c.id } as never).eq("id", ctx.user.id);
  return c.id;
}

export async function savedCards(ctx: CustomerCtx): Promise<{ cards: SavedCard[]; unavailable: boolean }> {
  try {
    const cid = await stripeCustomer(ctx, false); if (!cid) return { cards: [], unavailable: false };
    const [list, cust] = await Promise.all([stripe<{ data: PM[] }>(`payment_methods?customer=${cid}&type=card&limit=10`), stripe<{ invoice_settings?: { default_payment_method?: string | null } }>(`customers/${cid}`)]);
    const def = cust.invoice_settings?.default_payment_method ?? list.data[0]?.id;
    return { cards: list.data.map(p => ({ id: p.id, brand: p.card?.brand ?? "card", last4: p.card?.last4 ?? "••••", exp: p.card ? `${String(p.card.exp_month).padStart(2, "0")}/${p.card.exp_year}` : "", wallet: p.card?.wallet?.type ?? null, isDefault: p.id === def })), unavailable: false };
  } catch { return { cards: [], unavailable: true }; }
}

/** Confirms a payment method belongs to this customer before acting on it. */
export async function ownCard(ctx: CustomerCtx, pm: string) {
  if (!/^pm_[A-Za-z0-9]+$/.test(pm)) return null;
  const cid = await stripeCustomer(ctx, false); if (!cid) return null;
  const p = await stripe<PM>(`payment_methods/${pm}`).catch(() => null);
  return p && p.customer === cid ? { cid, pm: p } : null;
}

/**
 * Saved cards with direct charges (Q07, card 124.C). Cards are saved on the platform customer; a direct charge runs on the
 * seller's connected account, so the card must be cloned there for that one charge. The current checkouts use Stripe-hosted
 * Checkout Sessions, which collect the card on the seller's account, so nothing calls this yet — it is the adapter step for
 * a future PaymentIntent + Elements flow. Returns the cloned PaymentMethod id on the connected account.
 */
export async function cloneCardToSeller(ctx: CustomerCtx, pm: string, account: string, idempotencyKey: string) {
  const own = await ownCard(ctx, pm);
  const client = stripeClient();
  if (!own || !client) return null;
  const { connectedMerchantStripe } = await import("@/lib/payments/stripe-client");
  return connectedMerchantStripe(client).clonePaymentMethod(account, { customer: own.cid, paymentMethod: pm }, idempotencyKey);
}
