// Q07 · Stripe TEST-MODE end-to-end journey (API level, no browser) against the running dev server (:3107) and real Stripe test
// objects. Skips automatically when there is no sk_test_/rk_test_ key, and when the QA seller's test connected account has not
// finished Stripe's hosted onboarding (Stripe-collected requirements: only the seller can accept Stripe's terms; run
// `node --env-file=.env --env-file=.env.local scripts/seed-q38-demo.mjs --steps=sellers --links` and complete the QA seller link).
// Webhooks: the real test events Stripe recorded (GET /v1/events) are replayed to /api/stripe/webhook, signed with the local
// sandbox endpoint secrets. Test mode only — no live key is read and no key value is logged.
import { randomBytes, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { admin, anon, BASE, cleanup, createUser, PASSWORD, seedWorkspace, insertEventFixture } from "../phase1/helpers";
import { accountReady, buyTicketsTestMode, completeTicketPurchase, deliverWebhook, hasTestKey, listTestAccounts, payCheckoutSessionTestMode, replayTestEvents, sessionCookies, stripeTest, testSecretKey } from "../../scripts/lib/stripe-test-mode.mjs";
import { httpStripeClient } from "../../src/lib/payments/stripe-client";
import { createDirectMerchantCheckout, getDirectPaymentStatus, refundMerchantCharge, type MarketplaceOrder, type PaymentData } from "../../src/lib/payments/service";
import { detectVariances, type InternalPayment } from "../../src/lib/payments/reconcile-core";

const db = admin as unknown as { from: (t: string) => any; rpc: (f: string, a: object) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any
const QA_PURPOSE = "q07_test_mode_verification";
type Line = { account: string; amount_minor: number; party_type: string };
const ledger = async (key: string): Promise<Line[] | null> => {
  const { data: tx } = await db.from("ledger_transactions").select("id").eq("idempotency_key", key).maybeSingle();
  if (!tx) return null;
  const { data } = await db.from("ledger_entries").select("account,amount_minor,party_type").eq("transaction_id", tx.id);
  return data as Line[];
};
const total = (l: Line[]) => l.reduce((a, x) => a + Number(x.amount_minor), 0);
const cash = (l: Line[]) => total(l.filter(x => x.account === "cash_stripe" && x.party_type === "platform"));
const waitFor = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 60_000, every = 3_000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error("timed out"); await new Promise(r => setTimeout(r, every)); }
};

/** Supabase-backed PaymentData for the pure orchestration service (same RPCs as src/lib/payments/server.ts). */
const paymentData: PaymentData = {
  sellerAccount: async ws => (await db.rpc("seller_payment_account", { p_workspace: ws })).data ?? null,
  prepareMarketplaceOrder: async (ref, account, merchant, terms, group) => {
    const { data, error } = await db.rpc("payment_order_direct_prepare", { p_ref: ref, p_account: account, p_merchant: merchant, p_terms: terms, p_group: group ?? null });
    if (error) throw new Error(error.message); return data as MarketplaceOrder;
  },
  markMarketplacePending: async (ref, session) => { const { error } = await db.rpc("payment_order_pending", { p_ref: ref, p_session: session }); if (error) throw new Error(error.message); },
  prepareTicketOrder: async () => { throw new Error("not used"); }, setTicketSession: async () => { throw new Error("not used"); },
};

test.describe("Stripe test mode: direct charges end to end", () => {
  test.skip(!hasTestKey(), "no Stripe test-mode key (STRIPE_SECRET_KEY_SANDBOX=sk_test_…) configured");
  test.describe.configure({ mode: "serial" });

  let acct = "", ws = "", eventId = "", tierId = "", sinceSec = 0;
  let customer: { id: string; email: string };
  let ticket: { orderRef: string; pi: string; charge: string; fee: number; gross: number } | null = null;
  const stripe = () => ({ stripe: httpStripeClient(testSecretKey()!), data: paymentData });

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    // The QA seller: a Q07-configured test connected account (seller pays fees, Stripe bears losses, full dashboard).
    let qa = (await listTestAccounts()).find(a => a.metadata?.gala_dock_purpose === QA_PURPOSE);
    if (!qa) qa = await stripeTest("POST", "accounts", { country: "GB", email: "q07.qa.seller@example.com", business_type: "individual",
      "controller[fees][payer]": "account", "controller[losses][payments]": "stripe", "controller[stripe_dashboard][type]": "full", "controller[requirement_collection]": "stripe",
      "capabilities[card_payments][requested]": "true", "capabilities[transfers][requested]": "true",
      "individual[first_name]": "Quinn", "individual[last_name]": "Seller", "individual[dob][day]": "1", "individual[dob][month]": "1", "individual[dob][year]": "1901",
      "individual[address][line1]": "address_full_match", "individual[address][city]": "London", "individual[address][postal_code]": "EC1A 1BB", "individual[address][country]": "GB",
      "individual[email]": "q07.qa.seller@example.com", "individual[phone]": "+447700900123", "business_profile[mcc]": "7922", "business_profile[url]": "https://accessible.stripe.com",
      "business_profile[support_phone]": "+447700900123", "business_profile[product_description]": "Gala Dock QA seller (test mode)",
      "external_account[object]": "bank_account", "external_account[country]": "GB", "external_account[currency]": "gbp", "external_account[account_number]": "00012345", "external_account[routing_number]": "108800",
      "metadata[gala_dock_purpose]": QA_PURPOSE, "metadata[gala_dock_demo]": "true" }, { idempotencyKey: "q07-qa-seller-v1" });
    const full = await stripeTest("GET", `accounts/${qa!.id}`);
    test.skip(!accountReady(full), `QA seller ${qa!.id} has not finished Stripe hosted onboarding (currently due: ${(full.requirements?.currently_due ?? []).join(", ") || "none"})`);
    acct = full.id;
    sinceSec = Math.floor(Date.now() / 1000) - 5;
    const owner = await createUser("q07-tm-org", "QA Organiser");
    customer = await createUser("q07-tm-buyer", "QA Buyer");
    ws = await seedWorkspace(owner.id, "organizer", "Q07 Test-mode Seller");
    await db.from("connect_accounts").delete().eq("stripe_account_id", acct);   // a previous run's disposable workspace
    // Sync through the app: account.updated → syncConnectAccount (metadata binds the account to this run's workspace).
    const sync = await deliverWebhook(BASE, { id: `evt_q07tm_${randomUUID().replaceAll("-", "")}`, object: "event", type: "account.updated", account: acct, created: Math.floor(Date.now() / 1000), livemode: false,
      data: { object: { ...full, metadata: { ...full.metadata, workspace_id: ws } } } }, "connect");
    expect(sync.status).toBe(200);
    const ev = await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name: "Q07 Test-mode Night", visibility: "public", status: "on_sale",
      starts_at: new Date(Date.now() + 30 * 864e5).toISOString(), ends_at: new Date(Date.now() + 30 * 864e5 + 5 * 3600e3).toISOString(), currency: "GBP", capacity: 100 }, "stripe-test-mode").select("id").single();
    eventId = (ev.data as { id: string }).id;
    const tier = await db.from("ticket_tiers").insert({ event_id: eventId, name: "General Admission", price: 20, quantity: 50, status: "on_sale", sort: 1 }).select("id").single();
    tierId = tier.data.id;
  });
  test.afterAll(async () => {
    // A deposit order that never reached the direct-charge prepare step must not linger as a legacy-strategy row.
    await db.from("payment_orders").delete().like("reference", "PO-Q7TM-%").neq("strategy", "direct");
    await cleanup();
  });

  test("seller readiness comes from the synced Stripe account", async () => {
    const { data: row } = await db.from("connect_accounts").select("stripe_account_id,charges_enabled,card_payments_capability,fees_payer,losses_payments,dashboard_type").eq("workspace_id", ws).single();
    expect(row).toMatchObject({ stripe_account_id: acct, charges_enabled: true, card_payments_capability: "active", fees_payer: "account", losses_payments: "stripe", dashboard_type: "full" });
    expect((await db.rpc("event_payment_readiness", { p_event: eventId })).data).toBe("ready");
  });

  test("ticket purchase: direct charge on the seller with the application fee; tickets issued; ledger memo moves platform cash by the fee only", async () => {
    test.setTimeout(240_000);
    const { cookie } = await sessionCookies(customer.email, PASSWORD);
    const user = anon(); await user.auth.signInWithPassword({ email: customer.email, password: PASSWORD });
    const started = await buyTicketsTestMode({ base: BASE, cookie, userClient: user, eventId, items: [{ tier: tierId, qty: 2 }] });
    expect(started.ok, JSON.stringify(started)).toBe(true);
    const sid = (started as { sessionId: string }).sessionId;
    // The session exists only in the seller's account context.
    await expect(stripeTest("GET", `checkout/sessions/${sid}`)).rejects.toThrow();
    const s = await stripeTest("GET", `checkout/sessions/${sid}`, {}, { account: acct });
    const { data: o0 } = await db.from("checkout_orders").select("order_ref,amount,fee,application_fee_minor,connected_account_id,strategy").eq("stripe_session", sid).single();
    expect(o0).toMatchObject({ strategy: "direct", connected_account_id: acct });
    const gross = Math.round((Number(o0.amount) + Number(o0.fee)) * 100);
    expect(s.amount_total).toBe(gross);
    const done = await completeTicketPurchase(BASE, (started as { cookie: string }).cookie, sid, acct);
    expect(done.paid.paymentIntentStatus ?? "succeeded").toBe("succeeded");
    expect(done.redirect).toContain(`order=${o0.order_ref}`);
    const pi = await stripeTest("GET", `payment_intents/${done.paid.paymentIntent}`, {}, { account: acct });
    expect(pi.application_fee_amount).toBe(Number(o0.application_fee_minor));
    const { data: o } = await db.from("checkout_orders").select("status,stripe_payment_intent").eq("order_ref", o0.order_ref).single();
    expect(o.status).toBe("issued");
    expect((await db.from("tickets").select("id", { count: "exact", head: true }).eq("order_ref", o0.order_ref)).count).toBe(2);
    // Webhooks: replay the real test events (connected account + platform); processing is idempotent.
    await replayTestEvents(BASE, { account: acct, sinceSec, types: ["checkout.session.completed", "payment_intent.succeeded"] });
    await replayTestEvents(BASE, { sinceSec, types: ["application_fee.created"] });
    const again = await replayTestEvents(BASE, { account: acct, sinceSec, types: ["payment_intent.succeeded"] });
    expect(again.every(r => r.body.duplicate === true)).toBe(true);
    const lines = await ledger(`stripe:pi:${pi.id}`);
    expect(lines).not.toBeNull();
    expect(total(lines!)).toBe(0);
    expect(cash(lines!)).toBe(Number(o0.application_fee_minor));
    const { data: feeRow } = await db.from("checkout_orders").select("stripe_application_fee").eq("order_ref", o0.order_ref).single();
    const fee = feeRow?.stripe_application_fee ?? pi.application_fee ?? null;
    test.info().annotations.push({ type: "stripe", description: `ticket ${o0.order_ref} cs=${sid} pi=${pi.id} ch=${pi.latest_charge} fee=${fee ?? "n/a"}` });
    ticket = { orderRef: o0.order_ref, pi: pi.id, charge: pi.latest_charge, fee: Number(o0.application_fee_minor), gross };
  });

  test("partial refund on the seller's charge with the disclosed fee policy (partial service failure → fee pro rata)", async () => {
    test.skip(!ticket, "needs the ticket purchase");
    const amount = 1000;
    const { refund, policy } = await refundMerchantCharge(stripe(), { account: acct, paymentIntent: ticket!.pi, amountMinor: amount, reason: "partial_service_failure", idempotencyKey: `q07tm-refund-${ticket!.orderRef}` });
    expect(policy).toBe("proportional");
    expect(refund.status).toMatch(/succeeded|pending/);
    await waitFor(async () => (await stripeTest("GET", "events", { type: "charge.refunded", "created[gte]": String(sinceSec) }, { account: acct })).data.length > 0, 30_000);
    await replayTestEvents(BASE, { account: acct, sinceSec, types: ["charge.refunded"] });
    await replayTestEvents(BASE, { sinceSec, types: ["application_fee.refunded"] });
    const lines = await ledger(`stripe:direct-refund:${ticket!.charge}:${amount}`);
    expect(lines).not.toBeNull();
    expect(total(lines!)).toBe(0);
    expect(cash(lines!)).toBe(0);   // the refund itself comes out of the seller's balance
    test.info().annotations.push({ type: "stripe", description: `refund ${refund.id} on ${ticket!.charge}` });
  });

  test("marketplace deposit: direct charge to the payee with Gala Dock's commission as the application fee", async () => {
    test.setTimeout(180_000);
    const ref = `PO-Q7TM-${randomBytes(4).toString("hex").toUpperCase()}`;
    const ins = await db.from("payment_orders").insert({ reference: ref, kind: "deposit", status: "amount_due", payer_id: customer.id, event_id: eventId, payee_workspace_id: ws,
      description: "Q07 test-mode deposit", amount_minor: 25_000, currency: "GBP", platform_fee_minor: 2_500, livemode: false, idempotency_key: ref });
    expect(ins.error).toBeNull();
    const { data: po } = await db.from("payment_orders").select("*").eq("reference", ref).single();
    const r = await createDirectMerchantCheckout(stripe(), { order: po as MarketplaceOrder, customerEmail: customer.email, successUrl: `${BASE}/payments/${ref}`, cancelUrl: `${BASE}/` });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const sid = (r as { sessionId: string }).sessionId;
    const paid = await payCheckoutSessionTestMode(sid, acct);
    await replayTestEvents(BASE, { account: acct, sinceSec, types: ["payment_intent.succeeded"] });
    const { data: after } = await db.from("payment_orders").select("status,stripe_payment_intent,payee_connected_account_id,application_fee_minor").eq("reference", ref).single();
    expect(after.payee_connected_account_id).toBe(acct);
    expect(after.stripe_payment_intent).toBe(paid.paymentIntent);
    expect(after.status).not.toMatch(/amount_due|payment_pending|failed/);
    const lines = await ledger(`stripe:pi:${paid.paymentIntent}`) ?? await ledger(`stripe:direct:${paid.paymentIntent}`);
    if (lines) { expect(total(lines)).toBe(0); expect(cash(lines)).toBe(Number(after.application_fee_minor)); }
    test.info().annotations.push({ type: "stripe", description: `deposit ${ref} cs=${sid} pi=${paid.paymentIntent}` });
  });

  test("invoice /pay/[token]: the page's own server action opens Checkout on the organiser's account and the return settles it", async () => {
    test.setTimeout(180_000);
    const token = randomBytes(18).toString("hex");
    const inv = await db.from("invoices").insert({ workspace_id: ws, number: `Q7TM-${randomBytes(3).toString("hex").toUpperCase()}`, client_name: "QA Client", client_email: "qa.client@example.com",
      currency: "GBP", status: "sent", subtotal: 120, tax: 0, total: 120, amount_paid: 0, payment_token: token }).select("id").single();
    expect(inv.error).toBeNull();
    const html = await (await fetch(`${BASE}/pay/${token}`)).text();
    const actionId = /name="\$ACTION_ID_([0-9a-f]+)"/.exec(html)?.[1];
    expect(actionId, "pay form server action").toBeTruthy();
    const form = new FormData(); form.append(`$ACTION_ID_${actionId}`, ""); form.append("token", token);
    const res = await fetch(`${BASE}/pay/${token}`, { method: "POST", body: form, redirect: "manual", headers: { origin: BASE } });
    const location = res.headers.get("location") ?? res.headers.get("x-action-redirect") ?? "";
    const { data: icp } = await db.from("invoice_card_payments").select("stripe_checkout_session,connected_account_id,application_fee_minor").eq("invoice_id", inv.data.id).single();
    expect(icp.connected_account_id).toBe(acct);
    expect(location).toContain("checkout.stripe.com");
    await payCheckoutSessionTestMode(icp.stripe_checkout_session, acct);
    await fetch(`${BASE}/pay/${token}?session=${icp.stripe_checkout_session}`);
    await replayTestEvents(BASE, { account: acct, sinceSec, types: ["checkout.session.completed"] });
    const { data: paid } = await db.from("invoices").select("status,amount_paid").eq("id", inv.data.id).single();
    expect(paid.status).toBe("paid");
    expect(Number(paid.amount_paid)).toBe(120);
    test.info().annotations.push({ type: "stripe", description: `invoice cs=${icp.stripe_checkout_session}` });
  });

  test("dispute (test card that triggers a chargeback): mirrored with the seller as the liable merchant; no platform cash moves", async () => {
    test.setTimeout(240_000);
    const { cookie } = await sessionCookies(customer.email, PASSWORD);
    const user = anon(); await user.auth.signInWithPassword({ email: customer.email, password: PASSWORD });
    const started = await buyTicketsTestMode({ base: BASE, cookie, userClient: user, eventId, items: [{ tier: tierId, qty: 1 }] });
    expect(started.ok).toBe(true);
    const done = await completeTicketPurchase(BASE, (started as { cookie: string }).cookie, (started as { sessionId: string }).sessionId, acct, "tok_createDispute");
    const pi = await stripeTest("GET", `payment_intents/${done.paid.paymentIntent}`, {}, { account: acct });
    await waitFor(async () => (await stripeTest("GET", "disputes", { payment_intent: pi.id }, { account: acct })).data[0], 90_000, 5_000);
    await replayTestEvents(BASE, { account: acct, sinceSec, types: ["payment_intent.succeeded", "charge.dispute.*"] });
    const { data: d } = await db.from("stripe_disputes").select("stripe_dispute_id,stripe_account_id,liability,amount_minor").eq("payment_intent_id", pi.id).single();
    expect(d).toMatchObject({ stripe_account_id: acct, liability: "connected_account" });
    const lines = await ledger(`stripe:dispute:${acct}:${d.stripe_dispute_id}:withdrawn`);
    expect(lines).not.toBeNull();
    expect(total(lines!)).toBe(0);
    expect(cash(lines!)).toBe(0);
    test.info().annotations.push({ type: "stripe", description: `dispute ${d.stripe_dispute_id} pi=${pi.id}` });
  });

  test("payout on the seller account is mirrored (if Stripe lets the platform create one for a full-dashboard account)", async () => {
    let payout: { id: string } | null = null;
    try { payout = await stripeTest("POST", "payouts", { amount: "100", currency: "gbp" }, { account: acct, idempotencyKey: `q07tm-payout-${ws}` }); }
    catch (e) { test.skip(true, `Stripe refused a platform-initiated payout: ${(e as Error).message}`); }
    await replayTestEvents(BASE, { account: acct, sinceSec, types: ["payout.*"] });
    const { data: m } = await db.from("connected_payouts").select("stripe_account_id,amount_minor,status").eq("stripe_payout_id", payout!.id).single();
    expect(m).toMatchObject({ stripe_account_id: acct, amount_minor: 100 });
  });

  test("reconciliation finds no critical variance for this run's direct charges", async () => {
    test.skip(!ticket, "needs the ticket purchase");
    const [{ data: cos }, { data: pos }] = await Promise.all([
      db.from("checkout_orders").select("order_ref,strategy,status,connected_account_id,stripe_session,stripe_payment_intent,amount,fee,application_fee_minor,currency").eq("event_id", eventId),
      db.from("payment_orders").select("reference,strategy,status,payee_connected_account_id,stripe_checkout_session,stripe_payment_intent,amount_minor,customer_fee_minor,application_fee_minor,currency").eq("event_id", eventId),
    ]);
    const rows: InternalPayment[] = [
      ...(cos ?? []).filter((c: any) => c.stripe_session).map((c: any) => ({ sourceType: "checkout_order" as const, ref: c.order_ref, strategy: c.strategy, status: c.status, account: c.connected_account_id, sessionId: c.stripe_session,   // eslint-disable-line @typescript-eslint/no-explicit-any
        paymentIntent: c.stripe_payment_intent, grossMinor: Math.round((Number(c.amount) + Number(c.fee)) * 100), applicationFeeMinor: c.application_fee_minor == null ? null : Number(c.application_fee_minor), currency: c.currency })),
      ...(pos ?? []).filter((p: any) => p.stripe_checkout_session).map((p: any) => ({ sourceType: "payment_order" as const, ref: p.reference, strategy: p.strategy, status: p.status, account: p.payee_connected_account_id, sessionId: p.stripe_checkout_session,   // eslint-disable-line @typescript-eslint/no-explicit-any
        paymentIntent: p.stripe_payment_intent, grossMinor: Number(p.amount_minor) + Number(p.customer_fee_minor ?? 0), applicationFeeMinor: p.application_fee_minor == null ? null : Number(p.application_fee_minor), currency: p.currency })),
    ];
    expect(rows.length).toBeGreaterThan(0);
    const critical: string[] = [];
    for (const p of rows) {
      const s = await getDirectPaymentStatus(stripe(), p.account!, p.sessionId!);
      for (const v of detectVariances(p, { found: true, account: p.account, paid: s.paid, amountMinor: s.amountMinor, currency: p.currency, applicationFeeMinor: s.applicationFeeMinor, paymentIntent: s.paymentIntent }))
        if (v.severity === "critical") critical.push(`${p.ref}: ${v.variance}`);
    }
    expect(critical).toEqual([]);
  });
});
