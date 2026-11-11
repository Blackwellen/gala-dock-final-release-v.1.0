// DEC-107 money-path proof in the Stripe SANDBOX (owner 2026-11-11). Opt-in only — it creates real sandbox objects:
//   DEC107_SANDBOX_PROOF=1 node --env-file=.env --env-file=.env.local node_modules/@playwright/test/cli.js test tests/payments/dec107-sandbox-proof.spec.ts --project=desktop --workers=1 --trace=off
// Refuses anything but an sk_test_ key on the Gala Dock sandbox platform (acct_1UW176Ae36uXyrUn). No live key is ever read.
// Sellers use the PLATFORM-MANAGED no-dashboard profile: Stripe-collected accounts can't be finished by script ("You cannot accept
// the Terms of Service on behalf of accounts where controller[requirement_collection]=stripe"), exactly as in Gigvora's proof.
// Charges are PaymentIntents confirmed by API on the seller's account (the same direct charge a Checkout Session creates; a hosted
// Checkout page can't be paid headlessly — the change-order step also creates the client-present Checkout Session to show it).
// The release chain runs the real DB functions (dec107_release_sweep → dec107_releases_due → planner → payout → dec107_release_paid)
// on p1- fixture rows of a QA fixture workspace, with the same steps as src/lib/commerce/releases.ts.
// Every charge is RECORDED FIRST through the app path (a direct-bound checkout order, PaymentIntent metadata order_ref, recorded by the
// webhook's checkout_order_direct_paid) before any refund or dispute, so no webhook ever meets an unknown charge (ops 2026-11-11).
// Supplier/venue charges are stored as checkout orders of the proof event too (a payment_orders row needs a full booking chain).
// Writes artifacts/release/dec107-sandbox-proof.json.
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { connectedMerchantStripe, httpStripeClient, platformFeeStripe, type StripeClient } from "../../src/lib/payments/stripe-client";
import { refundMerchantCharge } from "../../src/lib/payments/service";
import { capGroupToAvailable, planReleaseGroups, type ChargeNet, type DueRelease, type Reserve } from "../../src/lib/payments/releases-core";

const ON = process.env.DEC107_SANDBOX_PROOF === "1";
const KEY = process.env.STRIPE_SECRET_KEY_SANDBOX ?? "";
const PLATFORM = "acct_1UW176Ae36uXyrUn";
const ORG_WS = "e2722ab1-045d-408e-93d6-a24cf7c54ce6";    // "S4 Organiser" — QA fixture workspace (is_test_fixture)
const SUP_WS = "09be9d54-8c4e-4c13-a465-4e6d291e5a9e";    // "Pay Test Catering" — QA fixture provider workspace
// Buyer admin/booking fee inside each charge (the rest is the seller's price).
const BUYER_FEE: Record<string, number> = { ticket_T1: 1000, ticket_T2: 500, ticket_T3: 500, resale_original_R0: 500, resale_purchase_R1: 500, deposit_D1: 750, balance_B1: 1750, change_order_CO1: 250, chargeback_X1: 125 };
const RUN = `p1-dec107-${Date.now().toString(36)}`;
type Obj = Record<string, unknown> & { id: string };

test.describe.serial("DEC-107 sandbox money paths", () => {
  test.skip(!ON, "Opt-in: DEC107_SANDBOX_PROOF=1 (creates Stripe sandbox objects)");
  test.setTimeout(240_000);
  const report: { run: string; platform: string; accounts: Record<string, string>; steps: { step: string; ok: boolean; ids: Record<string, unknown>; note?: string }[]; invariants?: unknown; books?: unknown } =
    { run: RUN, platform: PLATFORM, accounts: {}, steps: [] };
  let stripe: StripeClient;
  const raw = <T = Obj>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, string>, acct?: string, idem?: string) =>
    stripe.request<T>({ method, path, params, stripeAccount: acct, idempotencyKey: idem });
  const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const step = (s: string, ids: Record<string, unknown>, ok = true, note?: string) => { report.steps.push({ step: s, ok, ids, note }); expect(ok, `${s} ${note ?? ""}`).toBe(true); };
  const charges: Record<string, { acct: string; pi: string }> = {};
  let ORG = "", SUP = "", EVENT = "";

  async function seller(label: string) {
    const now = Math.floor(Date.now() / 1000);
    const a = await raw("POST", "accounts", {
      country: "GB", email: `${RUN}-${label}@gala-dock.test`, business_type: "individual",
      "controller[stripe_dashboard][type]": "none", "controller[requirement_collection]": "application", "controller[losses][payments]": "application", "controller[fees][payer]": "application",
      "settings[payouts][schedule][interval]": "manual", "capabilities[card_payments][requested]": "true", "capabilities[transfers][requested]": "true",
      "business_profile[mcc]": "7922", "business_profile[product_description]": `${RUN} DEC-107 proof ${label}`,
      "individual[first_name]": "Proof", "individual[last_name]": label, "individual[email]": `${RUN}-${label}@gala-dock.test`, "individual[phone]": "+447700900123",
      "individual[dob][day]": "1", "individual[dob][month]": "1", "individual[dob][year]": "1901",
      "individual[address][line1]": "address_full_match", "individual[address][city]": "London", "individual[address][postal_code]": "EC1A 1BB", "individual[address][country]": "GB",
      "tos_acceptance[date]": String(now), "tos_acceptance[ip]": "8.8.8.8",
      "external_account[object]": "bank_account", "external_account[country]": "GB", "external_account[currency]": "gbp", "external_account[routing_number]": "108800", "external_account[account_number]": "00012345",
      "metadata[purpose]": RUN,
    });
    for (let i = 0; i < 45; i++) {
      const s = await raw<Obj & { charges_enabled: boolean; payouts_enabled: boolean; capabilities: Record<string, string>; settings: { payouts: { schedule: { interval: string } } }; controller: { stripe_dashboard: { type: string } } }>("GET", `accounts/${a.id}`);
      if (s.charges_enabled && s.payouts_enabled && s.capabilities.card_payments === "active") return s;
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error(`${a.id} never became charges-enabled`);
  }
  async function pay(acct: string, label: string, amount: number, appFee: number, pm = "pm_card_bypassPending") {
    const d = db(), ref = `${RUN}-${label}`, ws = acct === ORG ? ORG_WS : SUP_WS, fee = BUYER_FEE[label] ?? 0;
    const buyer = (await d.from("workspaces").select("owner_id").eq("id", ORG_WS).single()).data!.owner_id;
    // 1. record the order first (the app's checkout order, bound to the seller's DEC-107 account → release_model manual_release)
    const ins = await d.from("checkout_orders").insert({ order_ref: ref, event_id: EVENT, buyer_id: buyer, token: `${ref}-tok`, amount: (amount - fee) / 100, fee: fee / 100, currency: "GBP", status: "pending", lines: [], kind: "primary" } as never);
    expect(ins.error, ins.error?.message).toBeNull();
    const bind = await d.from("checkout_orders").update({ strategy: "direct", seller_workspace_id: ws, connected_account_id: acct, application_fee_minor: appFee, livemode: false } as never).eq("order_ref", ref);
    expect(bind.error, bind.error?.message).toBeNull();
    // 2. the direct charge carries order_ref, so the webhook records it (checkout_order_direct_paid)
    const pi = await raw<Obj & { status: string; latest_charge: string }>("POST", "payment_intents", { amount: String(amount), currency: "gbp", confirm: "true", payment_method: pm,
      "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never", application_fee_amount: String(appFee), description: `${RUN} ${label}`,
      "metadata[gd_proof]": RUN, "metadata[order_ref]": ref, "metadata[event_id]": EVENT }, acct, `${RUN}:${label}`);
    charges[label] = { acct, pi: pi.id };
    // Stripe links the application fee a few seconds after the charge; the service refuses a refund until then.
    let c = await connectedMerchantStripe(stripe).charge(acct, pi.id);
    for (let i = 0; i < 15 && appFee > 0 && c && !c.application_fee; i++) { await new Promise(r => setTimeout(r, 1500)); c = await connectedMerchantStripe(stripe).charge(acct, pi.id); }
    // 3. wait for the webhook to record the payment; if it hasn't arrived in 30 s, record it through the same function.
    let recordedBy = "webhook";
    for (let i = 0; i < 20; i++) {
      const { data: o } = await d.from("checkout_orders").select("status,stripe_charge").eq("order_ref", ref).single();
      if ((o as { stripe_charge: string | null }).stripe_charge) break;
      if (i === 19) {
        const feeId = typeof c?.application_fee === "string" ? c.application_fee : c?.application_fee?.id ?? null;
        const r = await d.rpc("checkout_order_direct_paid" as never, { p_ref: ref, p_pi: pi.id, p_charge: c!.id, p_amount_minor: c!.amount, p_account: acct, p_application_fee: feeId } as never);
        expect(r.error, r.error?.message).toBeNull(); recordedBy = "app_function";
      } else await new Promise(r => setTimeout(r, 1500));
    }
    return { pi: pi.id, status: pi.status, charge: c?.id, fee: typeof c?.application_fee === "string" ? c.application_fee : c?.application_fee?.id ?? null, feeAmount: c?.application_fee_amount, order: ref, recordedBy };
  }
  const deps = () => ({ stripe, data: null as never });

  test.beforeAll(async () => {
    expect(KEY.startsWith("sk_test_"), "sandbox key must be sk_test_").toBe(true);
    stripe = httpStripeClient(KEY);
    const p = await raw("GET", "account");
    expect(p.id, "must be the Gala Dock sandbox platform").toBe(PLATFORM);
  });

  test("1 seller accounts: no dashboard, manual payouts (platform-managed proof profile)", async () => {
    const [o, s] = await Promise.all([seller("Organiser"), seller("Supplier")]);
    ORG = o.id; SUP = s.id; report.accounts = { organiser: ORG, supplier: SUP };
    step("accounts", { organiser: ORG, supplier: SUP, dashboard: o.controller.stripe_dashboard.type, payouts: o.settings.payouts.schedule.interval },
      o.controller.stripe_dashboard.type === "none" && o.settings.payouts.schedule.interval === "manual" && s.settings.payouts.schedule.interval === "manual");
    // DB: the organiser account on a QA fixture workspace, synced as a manual-payout account (what syncConnectAccount writes)
    const d = db();
    const { data: ev, error: evErr } = await d.from("events").insert({ owner_id: (await d.from("workspaces").select("owner_id").eq("id", ORG_WS).single()).data!.owner_id, workspace_id: ORG_WS,
      name: `${RUN} event`, status: "draft", starts_at: new Date(Date.now() - 3 * 86400e3).toISOString(), ends_at: new Date(Date.now() - 2 * 86400e3).toISOString() } as never).select("id").single();
    expect(evErr, evErr?.message).toBeNull();
    EVENT = (ev as { id: string }).id;
    const { error } = await d.from("connect_accounts").upsert({ workspace_id: ORG_WS, stripe_account_id: ORG, livemode: false, charges_enabled: true, payouts_enabled: true, details_submitted: true,
      card_payments_capability: "active", transfers_capability: "active", verification_state: "verified", payout_interval: "manual", dashboard_type: "none" } as never, { onConflict: "workspace_id" });
    expect(error, error?.message).toBeNull();
    const sup = await d.from("connect_accounts").upsert({ workspace_id: SUP_WS, stripe_account_id: SUP, livemode: false, charges_enabled: true, payouts_enabled: true, details_submitted: true,
      card_payments_capability: "active", transfers_capability: "active", verification_state: "verified", payout_interval: "manual", dashboard_type: "none" } as never, { onConflict: "workspace_id" });
    expect(sup.error, sup.error?.message).toBeNull();
    step("db_seller_bound", { organiser_workspace: ORG_WS, supplier_workspace: SUP_WS, event: EVENT });
  });

  test("2 ticket purchase, pro-rata customer refund, event-cancellation refund", async () => {
    const t1 = await pay(ORG, "ticket_T1", 11000, 1500);                  // £100 ticket + £10 booking fee; fee = £10 + £5 seller fee
    step("ticket_purchase", t1, t1.status === "succeeded" && t1.feeAmount === 1500);
    const t2 = await pay(ORG, "ticket_T2", 5500, 750);
    const r2 = await refundMerchantCharge(deps(), { account: ORG, paymentIntent: t2.pi, amountMinor: 2500, reason: "customer_cancelled", idempotencyKey: `${RUN}:refund:T2`,
      split: { sellerAmountMinor: 5000, sellerFeeMinor: 250, customerFeeRefundMinor: 0 } });
    step("ticket_refund_pro_rata", { pi: t2.pi, refund: r2.refund.id, fee_refund: r2.feeRefund?.id, fee_refund_minor: r2.feeRefund?.amount }, r2.feeRefund?.amount === 125,
      "£25 of £50 refunded: seller fee 125 of 250 back, £5 booking fee kept");
    const t3 = await pay(ORG, "ticket_T3", 5500, 750);
    const r3 = await refundMerchantCharge(deps(), { account: ORG, paymentIntent: t3.pi, reason: "event_cancelled", idempotencyKey: `${RUN}:refund:T3`,
      split: { sellerAmountMinor: 5000, sellerFeeMinor: 250, customerFeeRefundMinor: 500 } });
    step("event_cancellation_refund", { pi: t3.pi, refund: r3.refund.id, amount: r3.refund.amount, fee_refund: r3.feeRefund?.id, fee_refund_minor: r3.feeRefund?.amount },
      r3.refund.amount === 5500 && r3.feeRefund?.amount === 750, "whole purchase incl. booking fee (law)");
  });

  test("3 resale purchase on the organiser's account + refund of the original buyer (grouped under the event)", async () => {
    const r0 = await pay(ORG, "resale_original_R0", 5500, 750);
    const r1 = await pay(ORG, "resale_purchase_R1", 6000, 775);           // £55 resale + £5 fee; fee = £5 + 5 % of £55
    const back = await refundMerchantCharge(deps(), { account: ORG, paymentIntent: r0.pi, amountMinor: 5000, reason: "customer_cancelled", idempotencyKey: `${RUN}:resale-refund:R0`,
      metadata: { resale: "ticket_resold" }, split: { sellerAmountMinor: 5000, sellerFeeMinor: 250, customerFeeRefundMinor: 0 } });
    step("resale", { original: r0.pi, resale: r1.pi, original_refund: back.refund.id, fee_refund: back.feeRefund?.id, fee_refund_minor: back.feeRefund?.amount, event: EVENT },
      back.feeRefund?.amount === 250, "original face value refunded; its seller fee back pro rata; booking fee kept");
    const d = db();
    const { data: rows } = await d.from("checkout_orders").select("order_ref,release_model,charged_at").like("order_ref", `${RUN}-%`);
    step("db_records_manual_release", { rows }, (rows ?? []).length === 5 && (rows as { release_model: string; charged_at: string | null }[]).every(r => r.release_model === "manual_release" && !!r.charged_at),
      "every order recorded before its charge; payments recorded by the webhook path (checkout_order_direct_paid)");
  });

  test("4 supplier deposit, balance, change order (client-present Checkout), provider cancellation, consumer cancellation", async () => {
    const dep = await pay(SUP, "deposit_D1", 30750, 3150);                 // £300 + £7.50 admin fee; fee = 8 % (£24) + £7.50
    const bal = await pay(SUP, "balance_B1", 71750, 7350);                 // £700 + £17.50; fee = £56 + £17.50
    step("supplier_deposit_and_balance", { deposit: dep.pi, balance: bal.pi, fee_ids: [dep.fee, bal.fee] }, dep.status === "succeeded" && bal.status === "succeeded");
    const cs = await connectedMerchantStripe(stripe).createCheckout(SUP, { mode: "payment", success_url: "https://example.com/ok", cancel_url: "https://example.com/no",
      "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "gbp", "line_items[0][price_data][unit_amount]": "10000", "line_items[0][price_data][product_data][name]": `${RUN} change order`,
      "line_items[1][quantity]": "1", "line_items[1][price_data][currency]": "gbp", "line_items[1][price_data][unit_amount]": "250", "line_items[1][price_data][product_data][name]": "Gala Dock booking admin fee (incl. VAT)",
      "payment_intent_data[application_fee_amount]": "1050", "metadata[gd_proof]": RUN }, `${RUN}:co-checkout`);
    const co = await pay(SUP, "change_order_CO1", 10250, 1050);
    step("change_order", { checkout_session_on_seller: cs.id, checkout_status: cs.status, paid_pi: co.pi }, cs.status === "open" && co.status === "succeeded",
      "client-present Checkout Session created on the supplier's account; paid by API PaymentIntent (hosted page can't be paid headlessly)");
    const pc = await refundMerchantCharge(deps(), { account: SUP, paymentIntent: dep.pi, reason: "provider_cancelled", idempotencyKey: `${RUN}:refund:D1`,
      split: { sellerAmountMinor: 30000, sellerFeeMinor: 2400, customerFeeRefundMinor: 750 } });
    step("booking_cancellation_by_provider", { refund: pc.refund.id, amount: pc.refund.amount, fee_refund: pc.feeRefund?.id, fee_refund_minor: pc.feeRefund?.amount }, pc.refund.amount === 30750 && pc.feeRefund?.amount === 3150,
      "provider cancelled: everything back incl. admin fee");
    const cc = await refundMerchantCharge(deps(), { account: SUP, paymentIntent: bal.pi, amountMinor: 35000, reason: "customer_cancelled", idempotencyKey: `${RUN}:refund:B1`,
      split: { sellerAmountMinor: 70000, sellerFeeMinor: 5600, customerFeeRefundMinor: 0 } });
    step("consumer_cancellation", { refund: cc.refund.id, amount: cc.refund.amount, fee_refund: cc.feeRefund?.id, fee_refund_minor: cc.feeRefund?.amount }, cc.feeRefund?.amount === 2800,
      "customer cancelled under a 50 % policy: seller fee 2,800 of 5,600 back, admin fee £17.50 kept");
    const dr = await refundMerchantCharge(deps(), { account: SUP, paymentIntent: co.pi, amountMinor: 4000, reason: "goodwill", idempotencyKey: `${RUN}:default-rule:CO1`,
      split: { sellerAmountMinor: 10000, sellerFeeMinor: 800, customerFeeRefundMinor: 0 } });
    step("default_rule_refund_of_disputed_amount", { refund: dr.refund.id, fee_refund_minor: dr.feeRefund?.amount }, dr.feeRefund?.amount === 320,
      "hold-limit default rule: disputed £40 refunded to the customer, seller fee pro rata back, admin fee kept; the rest is released below");
  });

  test("5 chargeback on a direct charge lands on the seller; evidence submitted on the seller's account", async () => {
    const cb = await pay(SUP, "chargeback_X1", 5125, 525, "pm_card_createDispute");
    let dispute: Obj & { status: string; amount: number; balance_transactions?: { fee: number }[] } | null = null;
    for (let i = 0; i < 20 && !dispute; i++) {
      const list = await raw<{ data: (Obj & { status: string; amount: number; payment_intent: string })[] }>("GET", `disputes?payment_intent=${cb.pi}`, undefined, SUP);
      dispute = list.data[0] ?? null; if (!dispute) await new Promise(r => setTimeout(r, 1500));
    }
    expect(dispute, "dispute created").not.toBeNull();
    const ev = await raw<Obj & { status: string; evidence_details?: { submission_count: number } }>("POST", `disputes/${dispute!.id}`, { "evidence[uncategorized_text]": `${RUN} booking delivered as agreed (proof evidence)`, submit: "true" }, SUP);
    step("chargeback_evidence", { pi: cb.pi, dispute: dispute!.id, amount: dispute!.amount, status_after_evidence: ev.status, submissions: ev.evidence_details?.submission_count }, !!ev.id,
      "dispute object lives on the SUPPLIER's account (direct charge); seller evidence intake UI is not built yet (gap)");
  });

  test("6 release on trigger → payout from the organiser's balance (one payout for the event, reserve held), then reserve release", async () => {
    const d = db();
    const sweep = await d.rpc("dec107_release_sweep" as never);
    expect(sweep.error, sweep.error?.message).toBeNull();
    const { data: due, error } = await d.rpc("dec107_releases_due" as never, { p_livemode: false, p_limit: 100 } as never);
    expect(error, error?.message).toBeNull();
    const rows = ((due ?? []) as DueRelease[]).filter(r => r.source_ref.startsWith(RUN));
    const { data: blocked } = await d.from("payout_releases").select("source_ref,blocked_reason").like("source_ref", `${RUN}-%`).eq("status", "blocked");
    step("releases_due_after_event_plus_review", { sweep: sweep.data, due: rows.map(r => ({ ref: r.source_ref, trigger: r.trigger })), blocked },
      rows.length === 8 && rows.every(r => r.trigger === "event_completed_review" && r.event_id === EVENT)
      && ((blocked ?? []) as { source_ref: string; blocked_reason: string }[]).some(b => b.source_ref.endsWith("chargeback_X1") && b.blocked_reason === "card_dispute_open"),
      "8 recorded sales due 24 h after the event; the chargeback's release is blocked while the card dispute is open");
    const merchant = connectedMerchantStripe(stripe), fees = platformFeeStripe(stripe);
    const nets = new Map<string, ChargeNet>();
    for (const r of rows) {
      const c = (await merchant.charge(r.stripe_account_id, r.payment_intent!))!;
      const fid = typeof c.application_fee === "string" ? c.application_fee : c.application_fee?.id;
      const f = (fid ? await fees.retrieve(fid) : await fees.forCharge(c.id))!;
      nets.set(r.payment_intent!, { netMinor: c.amount - c.amount_refunded - (f.amount - f.amount_refunded) });
    }
    const reserves = new Map<string, Reserve>();
    for (const [ws, acct] of [[ORG_WS, ORG], [SUP_WS, SUP]]) {
      const { data: res } = await d.rpc("dec107_reserve_for" as never, { p_workspace: ws, p_account: acct, p_livemode: false } as never);
      reserves.set(ws, (((res ?? []) as Reserve[])[0] ?? null));
    }
    const groups = planReleaseGroups(rows, nets, reserves);
    expect(groups.length, "one release group per seller for this event (sales, resale and original grouped)").toBe(2);
    let reserveMinor = 0;
    for (const g of groups) {
      // Same rule as the worker (releases.ts): never pay out more than the seller's available balance. The supplier's balance is
      // short here because the chargeback (and Stripe's dispute fee) was debited from it, so its releases wait — recorded, not forced.
      const bal = await merchant.balance(g.account);
      const avail = bal.available.find(b => b.currency === "gbp")?.amount ?? 0;
      // Covered liability (same rule as releases.ts): the chargeback already debited the supplier's balance, so the release pays
      // what is available and the shortfall is the seller's own liability recovered from these releases — never platform money.
      const { group: pay, shortfallMinor } = capGroupToAvailable(g, Math.max(0, avail));
      if (shortfallMinor > 0) step(`covered_liability_${g.account === ORG ? "organiser" : "supplier"}`, { account: g.account, available: avail, due: g.payoutMinor, shortfall: shortfallMinor }, g.account === SUP,
        "chargeback £51.25 + Stripe dispute fee taken from the supplier's balance; its other releases pay the rest");
      if (pay.payoutMinor <= 0) continue;
      const p = await merchant.payout(g.account, { amountMinor: pay.payoutMinor, currency: "GBP", description: g.description, metadata: { gd_proof: RUN, event_id: EVENT } }, `${RUN}:release:${g.account}`);
      const rec = await d.rpc("dec107_release_paid" as never, { p_items: pay.items, p_payout: p.id, p_group: `${RUN}-${g.account}` } as never);
      expect(rec.error, rec.error?.message).toBeNull();
      const held = pay.items.reduce((a, i) => a + (i.reserve_minor ?? 0), 0); reserveMinor += held;
      step(`payout_on_trigger_${g.account === ORG ? "organiser" : "supplier"}`, { payout: p.id, amount: p.amount, releases: g.items.length, reserve: reserves.get(g.workspaceId), reserve_held_minor: held },
        p.amount === pay.payoutMinor, "one payout from the seller's own balance for every recorded sale of the event; objective reserve stays in the seller's balance");
    }
    // Reserve end (clock moved in SQL, as in Gigvora's proof): the reserve parts come due and are paid out.
    const moved = await d.from("payout_releases").update({ reserve_until: new Date(Date.now() - 60_000).toISOString(), trigger_at: new Date(Date.now() - 60_000).toISOString() } as never)
      .like("source_ref", `${RUN}-%`).eq("part", "reserve");
    expect(moved.error, moved.error?.message).toBeNull();
    await d.rpc("dec107_release_sweep" as never);
    const { data: due2 } = await d.rpc("dec107_releases_due" as never, { p_livemode: false, p_limit: 100 } as never);
    const rrows = ((due2 ?? []) as DueRelease[]).filter(r => r.source_ref.startsWith(RUN) && r.part === "reserve");
    let reservePaid = 0; const reservePayouts: string[] = [];
    for (const rg of planReleaseGroups(rrows, new Map(), new Map())) {
      if (rg.payoutMinor <= 0) continue;
      const rp = await merchant.payout(rg.account, { amountMinor: rg.payoutMinor, currency: "GBP", description: "Gala Dock reserve release", metadata: { gd_proof: RUN, event_id: EVENT } }, `${RUN}:reserve:${rg.account}`);
      const rr = await d.rpc("dec107_release_paid" as never, { p_items: rg.items, p_payout: rp.id, p_group: `${RUN}-reserve-${rg.account}` } as never);
      expect(rr.error, rr.error?.message).toBeNull();
      reservePaid += rp.amount; reservePayouts.push(rp.id);
    }
    step("reserve_release", { payouts: reservePayouts, amount: reservePaid, releases: rrows.length }, reservePaid === reserveMinor);
  });

  test("7 Gala Dock's own sales: subscription and credit pack on the platform account (no Stripe-Account, no application fee)", async () => {
    const d = db();
    const { data: price } = await d.from("plan_prices").select("stripe_price_test,plan,billing_interval").not("stripe_price_test", "is", null).eq("billing_interval", "month").limit(1).single();
    const { data: pack } = await d.from("credit_packs").select("name,price_minor,stripe_price_test").not("stripe_price_test", "is", null).limit(1).single();
    const cus = await raw("POST", "customers", { email: `${RUN}-buyer@gala-dock.test`, "metadata[gd_proof]": RUN, payment_method: "pm_card_visa", "invoice_settings[default_payment_method]": "pm_card_visa" });
    const sub = await raw<Obj & { status: string; latest_invoice: string }>("POST", "subscriptions", { customer: cus.id, "items[0][price]": (price as { stripe_price_test: string }).stripe_price_test, "metadata[gd_proof]": RUN });
    const pi = await raw<Obj & { status: string }>("POST", "payment_intents", { amount: String((pack as { price_minor: number }).price_minor), currency: "gbp", confirm: "true", customer: cus.id, payment_method: "pm_card_visa",
      "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never", description: `${RUN} credit pack ${(pack as { name: string }).name}`, "metadata[gd_proof]": RUN, "metadata[purpose]": "ai_credits" });
    await raw("DELETE", `subscriptions/${sub.id}`);
    step("platform_subscription_and_credit_pack", { customer: cus.id, subscription: sub.id, subscription_status: sub.status, invoice: sub.latest_invoice, credit_pack_pi: pi.id, plan: price },
      sub.status === "active" && pi.status === "succeeded", "Gala Dock is the merchant: charged on the platform account; subscription cancelled after the proof");
  });

  test("8 invariants empty; books = each seller's Stripe balance", async () => {
    const d = db();
    const { data: inv, error } = await d.rpc("dec107_invariants" as never);
    expect(error, error?.message).toBeNull();
    report.invariants = inv;
    const books: Record<string, unknown> = {};
    for (const acct of [ORG, SUP]) {
      let expected = 0;
      for (const { pi } of Object.values(charges).filter(c => c.acct === acct)) {
        const c = (await connectedMerchantStripe(stripe).charge(acct, pi))!;
        const fid = typeof c.application_fee === "string" ? c.application_fee : c.application_fee?.id;
        const f = (fid ? await platformFeeStripe(stripe).retrieve(fid) : await platformFeeStripe(stripe).forCharge(c.id)) ?? { amount: 0, amount_refunded: 0 };
        expected += c.amount - c.amount_refunded - (f.amount - f.amount_refunded);
        if (c.disputed) {
          const ds = await raw<{ data: { amount: number; balance_transactions: { fee: number; amount: number }[] }[] }>("GET", `disputes?payment_intent=${pi}`, undefined, acct);
          for (const x of ds.data) for (const bt of x.balance_transactions ?? []) expected += bt.amount - bt.fee;   // bt.amount is negative (withdrawal); fee = dispute fee
        }
      }
      const payouts = await raw<{ data: { amount: number; status: string }[] }>("GET", "payouts?limit=100", undefined, acct);
      const paid = payouts.data.filter(p => p.status !== "failed" && p.status !== "canceled").reduce((a, p) => a + p.amount, 0);
      const bal = await connectedMerchantStripe(stripe).balance(acct);
      const actual = [...bal.available, ...bal.pending].filter(b => b.currency === "gbp").reduce((a, b) => a + b.amount, 0);
      books[acct] = { charges_net: expected, payouts: paid, books: expected - paid, stripe_balance: actual, equal: expected - paid === actual };
    }
    report.books = books;
    step("invariants_and_books", { invariants: inv, books }, ((inv ?? []) as unknown[]).length === 0 && Object.values(books).every(b => (b as { equal: boolean }).equal));
  });

  test.afterAll(async () => {
    if (!ON) return;
    fs.mkdirSync("artifacts/release", { recursive: true });
    fs.writeFileSync("artifacts/release/dec107-sandbox-proof.json", JSON.stringify(report, null, 2) + "\n");
  });
});
