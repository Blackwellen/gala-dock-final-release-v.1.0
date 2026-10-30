import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeKey } from "@/lib/stripe";
import { modeOfSecretKey } from "@/lib/payments/stripe-mode";
import { httpStripeClient, platformBillingStripe, type StripeClient } from "@/lib/payments/stripe-client";
import { billingMode, priceColumn, priceFor, automaticTaxEnabled, BillingModeError, changeDirection, overageItemParams, packCheckoutParams, planChangeParams, planCheckoutParams, type PlanPrice } from "./core";

/**
 * Subscription billing service (Q28). Server-authoritative: the caller's role is checked here with the service client, prices
 * come from plan_prices / credit_packs, and entitlements change only when the signed Stripe webhook arrives
 * (billing_apply_subscription). Runs in the platform key's mode (billingMode); prices are the ones mapped for that mode (priceFor):
 * stripe_price_test in test, stripe_price_live in live — an unmapped price refuses with a clear message, never the other mode's id.
 */
type Admin = ReturnType<typeof createAdminClient>;
const untypedDb = (db: Admin) => db as unknown as { from(t: string): any; rpc(fn: string, a: Record<string, unknown>): any };   // eslint-disable-line @typescript-eslint/no-explicit-any
export type BillingResult = { ok: true; url?: string; message: string } | { ok: false; error: string };

export function billingClient(client?: StripeClient) {
  return platformBillingStripe(client ?? httpStripeClient(billingMode(stripeKey()).key));
}
/** Platform mode for billing, from the key prefix (an injected test client with no key configured runs as test). */
const billingLive = () => modeOfSecretKey(stripeKey()) === "live";

/**
 * Gala Dock's gb_vat account tax id(s), read from Stripe (GET tax_ids on the platform account, cached 10 minutes per process and per
 * client) — so the id always belongs to the account of the key in use (live txi_… vs sandbox txi_…). A failure never blocks billing.
 */
let taxIdCache: { at: number; client: unknown; ids: string[] } | null = null;
async function accountTaxIds(stripe: ReturnType<typeof billingClient>, client?: StripeClient) {
  if (taxIdCache && taxIdCache.client === (client ?? null) && Date.now() - taxIdCache.at < 600_000) return taxIdCache.ids;
  try {
    const r = await stripe.listAccountTaxIds();
    const ids = (r?.data ?? []).filter(t => t.type === "gb_vat").map(t => t.id);
    taxIdCache = { at: Date.now(), client: client ?? null, ids };
    return ids;
  } catch { return []; }
}

async function ownerOf(db: Admin, workspaceId: string, userId: string) {
  const { data } = await untypedDb(db).from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).eq("status", "active").maybeSingle();
  return data?.role === "owner";
}
async function workspace(db: Admin, id: string) {
  const { data } = await untypedDb(db).from("workspaces").select("id,name,kind,plan,status").eq("id", id).maybeSingle();
  return data as { id: string; name: string; kind: "organizer" | "provider"; plan: string | null; status: string } | null;
}
async function customerFor(db: Admin, stripe: ReturnType<typeof billingClient>, ws: { id: string; name: string }, email: string | null) {
  // Only a customer of the platform's mode is reused: a test cus_ never goes to the live API (202610295003: live replaces test).
  const live = billingLive();
  const { data } = await untypedDb(db).from("billing_customers").select("stripe_customer_id,livemode").eq("workspace_id", ws.id).maybeSingle();
  if (data?.stripe_customer_id && !!data.livemode === live) return data.stripe_customer_id as string;
  const c = await stripe.createCustomer({ name: ws.name.slice(0, 200), ...(email ? { email } : {}), "metadata[workspace_id]": ws.id, "metadata[source]": "gala_dock" }, `gd-customer-${live ? "live" : "test"}-${ws.id}`);
  const { error } = await untypedDb(db).rpc("billing_link_customer", { p_workspace: ws.id, p_customer: c.id, p_livemode: !!c.livemode });
  if (error) throw new Error(`billing_link_customer: ${error.message}`);
  return c.id;
}
const friendly = (e: unknown) => e instanceof BillingModeError ? (e.message === "billing_price_unmapped" ? "This plan isn’t set up for billing yet." : e.message === "billing_test_mode_only" ? "Plan billing is in test mode only during the beta." : "Billing isn’t configured.") : "Couldn’t start billing. Please try again.";

/** Upgrade from Starter (Checkout) or change an existing plan (subscription update). Owner only. */
export async function choosePlan(o: { workspaceId: string; userId: string; email: string | null; plan: string; interval: string; origin: string; returnPath: string; stripe?: StripeClient }): Promise<BillingResult> {
  const db = createAdminClient();
  if (!(await ownerOf(db, o.workspaceId, o.userId))) return { ok: false, error: "Only the workspace owner can change the plan." };
  const ws = await workspace(db, o.workspaceId);
  if (!ws || ws.status !== "active") return { ok: false, error: "This workspace can’t change plan right now." };
  const { data: price } = await untypedDb(db).from("plan_prices").select("*").eq("kind", ws.kind).eq("plan", o.plan).eq("billing_interval", o.interval).eq("active", true).maybeSingle();
  const p = price as PlanPrice | null;
  if (!p || !p.self_serve) return { ok: false, error: o.plan === "enterprise" ? "Enterprise is arranged with our team — contact sales." : "That plan isn’t available." };
  try {
    const stripe = billingClient(o.stripe);
    const live = billingLive(), priceId = priceFor(p, live);   // mapped price of the platform's mode, or "isn't set up for billing yet"
    const { data: sub } = await untypedDb(db).from("workspace_subscriptions").select("*").eq("workspace_id", ws.id).maybeSingle();
    if (sub && ["active", "trialing", "past_due"].includes(sub.status)) {
      if (sub.status === "past_due") return { ok: false, error: "Update your payment method before changing plan." };
      const { data: curPrice } = await untypedDb(db).from("plan_prices").select("*").eq(priceColumn(live), sub.stripe_price_id).maybeSingle();
      const dir = curPrice ? changeDirection(curPrice as PlanPrice, p) : "upgrade";
      if (dir === "same") return { ok: false, error: "You’re already on this plan." };
      const current = await stripe.retrieveSubscription(sub.stripe_subscription_id);
      const item = current.items.data[0];
      const periodEnd = Number(item?.current_period_end ?? current.current_period_end ?? 0);
      await stripe.updateSubscription(current.id, planChangeParams({ itemId: item!.id, price: priceId, direction: dir, currentPlan: String(sub.plan), periodEnd, accountTaxIds: await accountTaxIds(stripe, o.stripe) }),
        `gd-plan-${ws.id}-${priceId}-${sub.last_event_created}`);
      return { ok: true, message: dir === "upgrade" ? "Plan upgraded — the prorated difference is invoiced now." : "Plan change scheduled for the end of this billing period." };
    }
    const customer = await customerFor(db, stripe, ws, o.email);
    const session = await stripe.createCheckout("subscription", planCheckoutParams({ customer, price: priceId, workspaceId: ws.id, plan: p.plan, interval: p.billing_interval, automaticTax: automaticTaxEnabled(),
      successUrl: `${o.origin}${o.returnPath}${o.returnPath.includes("?") ? "&" : "?"}billing=success`, cancelUrl: `${o.origin}${o.returnPath}` }),
      `gd-plan-checkout-${ws.id}-${priceId}-${new Date().toISOString().slice(0, 13)}`);
    return session.url ? { ok: true, url: session.url, message: "Taking you to secure payment…" } : { ok: false, error: "Couldn’t start checkout." };
  } catch (e) { return { ok: false, error: friendly(e) }; }
}

/** Cancel at period end (entitlements stay until then) or undo a pending cancellation. Owner only. */
export async function setCancelAtPeriodEnd(o: { workspaceId: string; userId: string; cancel: boolean; stripe?: StripeClient }): Promise<BillingResult> {
  const db = createAdminClient();
  if (!(await ownerOf(db, o.workspaceId, o.userId))) return { ok: false, error: "Only the workspace owner can cancel the plan." };
  const { data: sub } = await untypedDb(db).from("workspace_subscriptions").select("stripe_subscription_id,status,last_event_created").eq("workspace_id", o.workspaceId).maybeSingle();
  if (!sub || !["active", "trialing", "past_due"].includes(sub.status)) return { ok: false, error: "There’s no active plan to change." };
  try {
    await billingClient(o.stripe).updateSubscription(sub.stripe_subscription_id, { cancel_at_period_end: String(o.cancel) }, `gd-cancel-${sub.stripe_subscription_id}-${o.cancel}-${sub.last_event_created}`);
    return { ok: true, message: o.cancel ? "Your plan will end at the close of this billing period." : "Your plan will continue." };
  } catch (e) { return { ok: false, error: friendly(e) }; }
}

/** One-off AI credit pack. Packs are sold only while active — the margin guard refuses activation below 75% after fees. */
export async function buyCreditPack(o: { workspaceId: string; userId: string; email: string | null; packId: string; origin: string; returnPath: string; stripe?: StripeClient }): Promise<BillingResult> {
  const db = createAdminClient();
  if (!(await ownerOf(db, o.workspaceId, o.userId))) return { ok: false, error: "Only the workspace owner can buy credits." };
  const ws = await workspace(db, o.workspaceId);
  const { data: pack } = await untypedDb(db).from("credit_packs").select("id,name,active,workspace_kinds,stripe_price_test,stripe_price_live").eq("id", o.packId).maybeSingle();
  if (!ws || !pack || !(pack.workspace_kinds as string[]).includes(ws.kind)) return { ok: false, error: "That credit pack isn’t available." };
  if (!pack.active) return { ok: false, error: "Credit packs aren’t on sale yet." };
  if (!(billingLive() ? pack.stripe_price_live : pack.stripe_price_test)) return { ok: false, error: "This credit pack isn’t set up for billing yet." };
  try {
    const stripe = billingClient(o.stripe);
    const priceId = priceFor(pack, billingLive());
    const customer = await customerFor(db, stripe, ws, o.email);
    const session = await stripe.createCheckout("ai_credits", packCheckoutParams({ customer, price: priceId, workspaceId: ws.id, packId: pack.id, automaticTax: automaticTaxEnabled(), accountTaxIds: await accountTaxIds(stripe, o.stripe),
      successUrl: `${o.origin}${o.returnPath}`, cancelUrl: `${o.origin}${o.returnPath}` }), `gd-pack-${ws.id}-${pack.id}-${Date.now()}`);
    return session.url ? { ok: true, url: session.url, message: "Taking you to secure payment…" } : { ok: false, error: "Couldn’t start checkout." };
  } catch (e) { return { ok: false, error: friendly(e) }; }
}

/** App job 'billing.invoice_overage': each accrued month of overage on a workspace with a billing customer becomes one Stripe
 *  invoice item (idempotency key per charge), attached to that customer's next invoice; invoice.paid then settles it. */
export async function invoiceAccruedOverage(db: Admin = createAdminClient(), stripeClient?: StripeClient) {
  const stripe = billingClient(stripeClient);
  const { data, error } = await untypedDb(db).rpc("billing_overage_due", { p_before: null });
  if (error) throw new Error(`billing_overage_due: ${error.message}`);
  let invoiced = 0;
  for (const c of (data ?? []) as { id: string; period: string; credits: number; amount_minor: number; stripe_customer_id: string }[]) {
    const item = await stripe.createInvoiceItem(overageItemParams({ customer: c.stripe_customer_id, amountMinor: c.amount_minor, currency: "gbp", credits: c.credits, period: c.period, chargeId: c.id }), `gd-overage-${c.id}`);
    const { error: e } = await untypedDb(db).rpc("billing_mark_overage_invoiced", { p_id: c.id, p_item: item.id });
    if (e) throw new Error(`billing_mark_overage_invoiced: ${e.message}`);
    invoiced++;
  }
  return { invoiced };
}
