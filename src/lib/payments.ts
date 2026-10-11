import "server-only";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CustomerCtx } from "@/lib/data/context";

export type SavedCard = { id: string; brand: string; last4: string; exp: string; wallet: string | null; isDefault: boolean };
type PM = { id: string; customer: string | null; card?: { brand: string; last4: string; exp_month: number; exp_year: number; wallet?: { type: string } | null } };

/** The caller's Stripe customer id, created on first use (stored server-side; never writable by the client). */
export async function stripeCustomer(ctx: CustomerCtx, create = true): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("stripe_customer_id").eq("id", ctx.user.id).single();
  if (data?.stripe_customer_id) return data.stripe_customer_id;
  if (!create) return null;
  const c = await stripe<{ id: string }>("customers", { email: ctx.user.email ?? "", name: ctx.name, "metadata[user_id]": ctx.user.id });
  await admin.from("profiles").update({ stripe_customer_id: c.id }).eq("id", ctx.user.id);
  return c.id;
}

export async function savedCards(ctx: CustomerCtx): Promise<SavedCard[]> {
  const cid = await stripeCustomer(ctx, false); if (!cid) return [];
  try {
    const [list, cust] = await Promise.all([stripe<{ data: PM[] }>(`payment_methods?customer=${cid}&type=card&limit=10`), stripe<{ invoice_settings?: { default_payment_method?: string | null } }>(`customers/${cid}`)]);
    const def = cust.invoice_settings?.default_payment_method ?? list.data[0]?.id;
    return list.data.map(p => ({ id: p.id, brand: p.card?.brand ?? "card", last4: p.card?.last4 ?? "••••", exp: p.card ? `${String(p.card.exp_month).padStart(2, "0")}/${p.card.exp_year}` : "", wallet: p.card?.wallet?.type ?? null, isDefault: p.id === def }));
  } catch { return []; }
}

/** Confirms a payment method belongs to this customer before acting on it. */
export async function ownCard(ctx: CustomerCtx, pm: string) {
  if (!/^pm_[A-Za-z0-9]+$/.test(pm)) return null;
  const cid = await stripeCustomer(ctx, false); if (!cid) return null;
  const p = await stripe<PM>(`payment_methods/${pm}`).catch(() => null);
  return p && p.customer === cid ? { cid, pm: p } : null;
}
