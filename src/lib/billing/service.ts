import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeKey } from "@/lib/stripe";
import { modeOfSecretKey } from "@/lib/payments/stripe-mode";
import { httpStripeClient, platformBillingStripe, StripeApiError, type StripeClient } from "@/lib/payments/stripe-client";
import { billingMode, priceColumn, priceFor, automaticTaxEnabled, BillingModeError, planChangeMode, overageItemParams, packCheckoutParams, planChangeParams, planCheckoutParams, portalConfigurationParams, portalSessionParams, subscriptionTaxIdParams, PORTAL_PURPOSE, PORTAL_ROLES, type PlanPrice } from "./core";
import { siteUrl } from "@/lib/site-url";

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
const label = (p: string) => p ? p[0]!.toUpperCase() + p.slice(1) : p;
/** The price a scheduled downgrade came from (set by planChangeParams), only while that downgrade is still in the future. */
function scheduledDowngradeFrom(sub: { metadata?: Record<string, string> }) {
  const m = sub.metadata ?? {}, at = Number(m.gd_downgrade_at ?? 0);
  return m.gd_previous_plan && /^price_[A-Za-z0-9]+$/.test(m.gd_previous_price ?? "") && at * 1000 > Date.now() ? m.gd_previous_price! : null;
}
async function audit(db: Admin, workspaceId: string, userId: string, event: string, metadata: Record<string, unknown>) {
  await untypedDb(db).from("audit_events").insert({ actor_id: userId, actor_type: "user", workspace_id: workspaceId, event, metadata });
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
      const current = await stripe.retrieveSubscription(sub.stripe_subscription_id);
      const item = current.items.data[0];
      // Q60: a scheduled downgrade has already swapped the price in Stripe; Stripe's metadata names the price it came from.
      const scheduledFrom = scheduledDowngradeFrom(current);
      const mode = planChangeMode({ from: curPrice as PlanPrice | null, to: p, toPrice: priceId, scheduledFromPrice: scheduledFrom });
      if (mode === "same") return { ok: false, error: "You’re already on this plan." };
      if (mode === "scheduled") return { ok: false, error: `A change to ${label(String(sub.plan))} is already scheduled. Choose “Keep my current plan” first, then pick a new plan.` };
      const periodEnd = Number(item?.current_period_end ?? current.current_period_end ?? 0);
      const change = { itemId: item!.id, price: priceId, direction: mode, currentPlan: String(ws.plan ?? sub.plan), currentPrice: String(sub.stripe_price_id ?? ""), periodEnd, accountTaxIds: await accountTaxIds(stripe, o.stripe) } as const;
      const tax = automaticTaxEnabled();
      try {
        await stripe.updateSubscription(current.id, planChangeParams({ ...change, automaticTax: tax }), `gd-plan-${ws.id}-${priceId}-${sub.last_event_created}${tax ? "-tax" : ""}`);
      } catch (e) {
        // Q67: a subscription created before automatic tax was switched on may have no billing address on the customer; the change
        // still goes through (without Stripe Tax) and ops are told, rather than refusing the customer's plan change.
        if (!(tax && e instanceof StripeApiError && /customer_tax_location_invalid|tax/.test(e.code))) throw e;
        await stripe.updateSubscription(current.id, planChangeParams(change), `gd-plan-${ws.id}-${priceId}-${sub.last_event_created}`);
        await audit(db, ws.id, o.userId, "billing.automatic_tax_skipped", { subscription: current.id, reason: e.code });
      }
      await audit(db, ws.id, o.userId, "billing.plan_change_requested", { mode, plan: p.plan, interval: p.billing_interval });
      return { ok: true, message: mode === "upgrade" ? "Plan changed — the prorated difference is invoiced now." : mode === "revert" ? "Scheduled change cancelled — you keep your current plan." : "Plan change scheduled for the end of this billing period." };
    }
    const customer = await customerFor(db, stripe, ws, o.email);
    const session = await stripe.createCheckout("subscription", planCheckoutParams({ customer, price: priceId, workspaceId: ws.id, plan: p.plan, interval: p.billing_interval, automaticTax: automaticTaxEnabled(),
      successUrl: `${o.origin}${o.returnPath}${o.returnPath.includes("?") ? "&" : "?"}billing=success`, cancelUrl: `${o.origin}${o.returnPath}` }),
      `gd-plan-checkout-${ws.id}-${priceId}-${new Date().toISOString().slice(0, 13)}`);
    return session.url ? { ok: true, url: session.url, message: "Taking you to secure payment…" } : { ok: false, error: "Couldn’t start checkout." };
  } catch (e) { return { ok: false, error: friendly(e) }; }
}

/** Q60: undo a scheduled end-of-period downgrade — the previous (already paid) price comes back without proration. Owner only. */
export async function undoScheduledChange(o: { workspaceId: string; userId: string; stripe?: StripeClient }): Promise<BillingResult> {
  const db = createAdminClient();
  if (!(await ownerOf(db, o.workspaceId, o.userId))) return { ok: false, error: "Only the workspace owner can change the plan." };
  const { data: sub } = await untypedDb(db).from("workspace_subscriptions").select("stripe_subscription_id,status,plan,pending_plan,last_event_created").eq("workspace_id", o.workspaceId).maybeSingle();
  if (!sub || !["active", "trialing"].includes(sub.status) || !sub.pending_plan) return { ok: false, error: "There’s no scheduled plan change to undo." };
  try {
    const stripe = billingClient(o.stripe);
    const current = await stripe.retrieveSubscription(sub.stripe_subscription_id);
    const from = scheduledDowngradeFrom(current), item = current.items.data[0];
    if (!from || !item) return { ok: false, error: "There’s no scheduled plan change to undo." };
    await stripe.updateSubscription(current.id, planChangeParams({ itemId: item.id, price: from, direction: "revert", currentPlan: String(sub.plan), periodEnd: 0, accountTaxIds: await accountTaxIds(stripe, o.stripe) }),
      `gd-plan-revert-${current.id}-${sub.last_event_created}`);
    await audit(db, o.workspaceId, o.userId, "billing.plan_change_undone", { subscription: current.id });
    return { ok: true, message: "Scheduled change cancelled — you keep your current plan." };
  } catch (e) { return { ok: false, error: friendly(e) }; }
}

/**
 * Q60: called by the webhook when a second subscription for the same workspace went live (two Checkout tabs). The older one is
 * cancelled now with proration (unused time becomes a credit on the customer's next invoice), so the workspace is never billed twice.
 * If the "old" one is in fact the newer subscription (out-of-order events), nothing is cancelled and ops are told via audit.
 */
export async function cancelSupersededSubscription(workspaceId: string, oldId: string, newId: string, client?: StripeClient) {
  const db = createAdminClient(), stripe = billingClient(client);
  const [old, cur] = await Promise.all([stripe.retrieveSubscription(oldId), stripe.retrieveSubscription(newId)]);
  const oldLive = ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(old.status);
  const cancel = oldLive && old.customer === cur.customer && Number(old.created ?? 0) <= Number(cur.created ?? 0);
  if (cancel) await stripe.cancelSubscription(old.id, `gd-supersede-${old.id}`);
  await untypedDb(db).from("audit_events").insert({ actor_type: "webhook", workspace_id: workspaceId, event: "billing.duplicate_subscription",
    metadata: { cancelled: cancel ? old.id : null, kept: cancel ? cur.id : null, old: old.id, new: cur.id, old_status: old.status } });
  if (cancel) {
    const ws = await workspace(db, workspaceId);
    await untypedDb(db).rpc("notify_workspace", { p_ws: workspaceId, p_roles: ["owner", "finance"], p_kind: "billing", p_title: "Duplicate plan subscription cancelled",
      p_body: "Your workspace had two Gala Dock plan subscriptions. We kept the newest and cancelled the other; its unused time is credited to your next invoice.",
      p_link: ws?.kind === "provider" ? "/provider/settings?tab=billing" : "/organizer/settings?tab=billing" });
  }
  return { cancelled: cancel };
}

/**
 * Q60 partner add-on: the Gala Dock invoice behind a refunded / charged-back platform payment — Charge.invoice (older API), else the
 * mirror (payment intent or charge recorded from invoice.*), else Stripe's invoice_payments (API 2025+). null = not an invoice payment.
 */
export async function invoiceForPayment(o: { chargeInvoice?: string; paymentIntent?: string; charge?: string }, client?: StripeClient): Promise<string | null> {
  if (o.chargeInvoice && /^in_[A-Za-z0-9_]+$/.test(o.chargeInvoice)) return o.chargeInvoice;
  const db = untypedDb(createAdminClient());
  for (const [col, v] of [["stripe_payment_intent", o.paymentIntent], ["stripe_charge", o.charge]] as const) {
    if (!v) continue;
    const { data } = await db.from("subscription_invoices").select("stripe_invoice_id").eq(col, v).limit(1).maybeSingle();
    if (data?.stripe_invoice_id) return String(data.stripe_invoice_id);
  }
  if (!o.paymentIntent) return null;
  try {
    const r = await billingClient(client).invoicePaymentsFor(o.paymentIntent);
    const inv = r?.data?.[0]?.invoice; const id = typeof inv === "string" ? inv : inv?.id;
    return id && /^in_[A-Za-z0-9_]+$/.test(id) ? id : null;
  } catch { return null; }
}

/** Q60 partner add-on: record the card fingerprint of a paid platform payment (only for Gala Dock billing customers). */
export async function recordPaymentFingerprint(customer: string, paymentMethod: string, client?: StripeClient) {
  const db = untypedDb(createAdminClient());
  const { data: known } = await db.from("billing_customers").select("workspace_id").eq("stripe_customer_id", customer).maybeSingle();
  if (!known) return null;
  const pm = await billingClient(client).retrievePaymentMethod(paymentMethod);
  const fp = pm?.card?.fingerprint;
  if (!fp) return null;
  const { data, error } = await db.rpc("billing_record_payment_fingerprint", { p_customer: customer, p_fingerprint: fp });
  if (error) throw new Error(`payment_fingerprint: ${error.message}`);
  return data;
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
      successUrl: `${o.origin}${o.returnPath}${o.returnPath.includes("?") ? "&" : "?"}credits=success`, cancelUrl: `${o.origin}${o.returnPath}` }), `gd-pack-${ws.id}-${pack.id}-${Date.now()}`);
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

// ── Q67: VAT number on Checkout-created subscriptions, customer portal, billing contact sync ─────────────────────────────────────

/**
 * Webhook (checkout.session.completed, purpose=subscription): write Gala Dock's gb_vat account tax id onto the new subscription so
 * every later invoice carries the VAT number (Checkout cannot set it). The first invoice uses the account default (runbook).
 * Idempotent (same params, idempotency key per subscription). Never throws: the caller audits a failure.
 */
export async function applySubscriptionTaxIds(subscriptionId: string, client?: StripeClient) {
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) return { applied: false, reason: "no_subscription" };
  const stripe = billingClient(client);
  const params = subscriptionTaxIdParams(await accountTaxIds(stripe, client));
  if (!Object.keys(params).length) return { applied: false, reason: "no_account_tax_id" };
  await stripe.updateSubscription(subscriptionId, params, `gd-sub-taxid-${subscriptionId}`);
  return { applied: true };
}

/** The active Gala Dock portal configuration: env override, else ours (metadata gd_purpose=plans), else create one in TEST mode only. */
async function portalConfiguration(stripe: ReturnType<typeof billingClient>, returnUrl: string) {
  const fromEnv = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION;
  if (fromEnv && /^bpc_[A-Za-z0-9]+$/.test(fromEnv)) return fromEnv;
  const list = await stripe.listPortalConfigurations();
  const ours = (list?.data ?? []).find(c => c.active && c.metadata?.gd_purpose === PORTAL_PURPOSE);
  if (ours) return ours.id;
  if (billingLive()) throw new BillingModeError("billing_portal_unconfigured");   // live: created by the owner (CLOSE_OUT_RUNBOOK), never on the fly
  const site = siteUrl();
  const created = await stripe.createPortalConfiguration(portalConfigurationParams({ returnUrl, privacyUrl: `${site}/privacy`, termsUrl: `${site}/terms` }), "gd-portal-config-plans-v1");
  return created.id;
}

/** Stripe customer portal for the workspace's Gala Dock plan (cards, invoices, cancel). Owner and finance only. */
export async function openBillingPortal(o: { workspaceId: string; userId: string; origin: string; returnPath: string; stripe?: StripeClient }): Promise<BillingResult> {
  const db = createAdminClient();
  const { data: m } = await untypedDb(db).from("workspace_members").select("role").eq("workspace_id", o.workspaceId).eq("user_id", o.userId).eq("status", "active").maybeSingle();
  if (!m || !(PORTAL_ROLES as readonly string[]).includes(String(m.role))) return { ok: false, error: "Only the workspace owner or finance can manage plan billing." };
  const live = billingLive();
  const { data: bc } = await untypedDb(db).from("billing_customers").select("stripe_customer_id,livemode").eq("workspace_id", o.workspaceId).maybeSingle();
  if (!bc?.stripe_customer_id || !!bc.livemode !== live) return { ok: false, error: "There's no plan billing account yet. Choose a plan first." };
  try {
    const stripe = billingClient(o.stripe);
    const returnUrl = `${o.origin}${o.returnPath}`;
    const configuration = await portalConfiguration(stripe, returnUrl);
    const session = await stripe.createPortalSession(portalSessionParams({ customer: String(bc.stripe_customer_id), returnUrl, configuration }));
    await audit(db, o.workspaceId, o.userId, "billing.portal_opened", { role: m.role });
    return session.url ? { ok: true, url: session.url, message: "Opening Stripe billing…" } : { ok: false, error: "Couldn’t open billing." };
  } catch (e) {
    if (e instanceof BillingModeError && e.message === "billing_portal_unconfigured") return { ok: false, error: "The billing portal isn’t switched on yet. Contact billing support." };
    return { ok: false, error: friendly(e) };
  }
}

const md5 = (v: string) => createHash("md5").update(v.toLowerCase()).digest("hex");
async function authEmail(db: Admin, userId: string) {
  const { data } = await db.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}
/**
 * App job 'billing.sync_customer_contact' (queued by account_email_changed and respond_ownership_transfer): the Stripe billing
 * customer of a workspace carries its OWNER's sign-in email. { workspace_id } → that workspace; { user_id } → every workspace the
 * person owns plus their personal (saved cards) customer. Only customers of the platform key's mode are touched. Idempotent.
 */
export async function syncCustomerContact(payload: { workspace_id?: string; user_id?: string }, db: Admin = createAdminClient(), client?: StripeClient) {
  const live = billingLive(), stripe = billingClient(client), u = untypedDb(db);
  const targets: { customer: string; email: string; owner: string; workspace?: string }[] = [];
  if (payload.workspace_id) {
    const { data: w } = await u.from("workspaces").select("id,owner_id").eq("id", payload.workspace_id).maybeSingle();
    const { data: bc } = await u.from("billing_customers").select("stripe_customer_id,livemode").eq("workspace_id", payload.workspace_id).maybeSingle();
    const email = w?.owner_id ? await authEmail(db, w.owner_id) : null;
    if (bc?.stripe_customer_id && !!bc.livemode === live && email) targets.push({ customer: bc.stripe_customer_id, email, owner: w.owner_id, workspace: w.id });
  }
  if (payload.user_id) {
    const email = await authEmail(db, payload.user_id);
    if (email) {
      const { data: owned } = await u.from("workspaces").select("id").eq("owner_id", payload.user_id);
      const ids = ((owned ?? []) as { id: string }[]).map(x => x.id);
      const { data: bcs } = ids.length ? await u.from("billing_customers").select("workspace_id,stripe_customer_id,livemode").in("workspace_id", ids) : { data: [] };
      for (const bc of (bcs ?? []) as { workspace_id: string; stripe_customer_id: string; livemode: boolean }[]) if (!!bc.livemode === live) targets.push({ customer: bc.stripe_customer_id, email, owner: payload.user_id, workspace: bc.workspace_id });
      const { data: p } = await u.from("profiles").select(live ? "stripe_customer_id_live" : "stripe_customer_id").eq("id", payload.user_id).maybeSingle();
      const personal = (p as Record<string, string | null> | null)?.[live ? "stripe_customer_id_live" : "stripe_customer_id"];
      if (personal) targets.push({ customer: personal, email, owner: payload.user_id });
    }
  }
  let updated = 0;
  for (const t of targets) {
    if (!/^cus_[A-Za-z0-9]+$/.test(t.customer)) continue;
    await stripe.updateCustomer(t.customer, { email: t.email, ...(t.workspace ? { "metadata[owner_user_id]": t.owner } : {}) }, `gd-contact-${t.customer}-${md5(t.email)}-${t.owner.slice(0, 8)}`);
    if (t.workspace) await u.from("audit_events").insert({ actor_type: "system", workspace_id: t.workspace, event: "billing.customer_contact_synced", metadata: { customer: t.customer, owner_user_id: t.owner } });
    updated++;
  }
  return { updated };
}
