// Q07 · Connect webhook, API level: signed fixture events (sandbox Connect endpoint secret from .env) posted to the running
// dev server, against disposable test identities. No Stripe API call is made: every event carries its full object.
// Needs the Q07 migrations (202610291008–1010) and the dev server on :3107.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { admin, BASE, cleanup, createUser, seedWorkspace } from "../phase1/helpers";
import { signStripePayload } from "../../src/lib/payments/webhook-core";

const env = fs.readFileSync(".env", "utf8");
const CONNECT = env.match(/^STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT=(.+)$/m)?.[1]?.trim() ?? "";
const PLATFORM = env.match(/^STRIPE_WEBHOOK_SECRET_SANDBOX=(.+)$/m)?.[1]?.trim() ?? "";
const send = async (event: object, secret = CONNECT) => {
  const body = JSON.stringify(event);
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": signStripePayload(body, secret), "content-type": "application/json" }, body });
  return { status: res.status, body: await res.json() };
};
const db = admin as unknown as { from: (t: string) => any; rpc: (f: string, a: object) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any
const entries = async (key: string) => {
  const { data: tx } = await db.from("ledger_transactions").select("id,basis").eq("idempotency_key", key).maybeSingle();
  if (!tx) return null;
  const { data } = await db.from("ledger_entries").select("account,amount_minor,party_type,party_id").eq("transaction_id", tx.id);
  return { basis: tx.basis as string, lines: data as { account: string; amount_minor: number; party_type: string; party_id: string | null }[] };
};
const sum = (l: { amount_minor: number }[]) => l.reduce((a, x) => a + Number(x.amount_minor), 0);
const cash = (l: { account: string; amount_minor: number }[]) => sum(l.filter(x => x.account === "cash_stripe"));

test.describe("Stripe Connect webhook (direct charges)", () => {
  let owner: { id: string }, ws: string, eventId: string, ref: string;
  const acct = `acct_test_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const pi = `pi_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`, ch = `ch_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const refs: string[] = [];

  test.beforeAll(async () => {
    expect(CONNECT, "STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT in .env").toMatch(/^whsec_/);
    owner = await createUser("q07-connect");
    ws = await seedWorkspace(owner.id, "organizer", "Q07 Direct Seller");
    expect((await db.from("connect_accounts").insert({ workspace_id: ws, stripe_account_id: acct, account_type: "standard", charges_enabled: true, payouts_enabled: true,
      details_submitted: true, card_payments_capability: "active", transfers_capability: "active", verification_state: "verified" })).error).toBeNull();
    const ev = await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: "Q07 Direct Event" }).select("id").single();
    eventId = ev.data.id;
    ref = `GD-Q7${randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`; refs.push(ref);
    expect((await db.from("checkout_orders").insert({ order_ref: ref, event_id: eventId, buyer_id: owner.id, token: randomUUID(), amount: 50, fee: 5, currency: "GBP", status: "pending", lines: [], kind: "primary" })).error).toBeNull();
    const { data: o } = await db.from("checkout_orders").select("fee,commission").eq("order_ref", ref).single();
    expect((await db.rpc("checkout_order_direct_prepare", { p_ref: ref, p_seller: ws, p_account: acct, p_fee_minor: Math.round((Number(o.fee) + Number(o.commission)) * 100), p_merchant: { test: true }, p_fee_rule: {} })).error).toBeNull();
  });
  test.afterAll(async () => { await db.from("checkout_orders").delete().in("order_ref", refs); await cleanup(); });

  test("event readiness: the organiser's ready Stripe account makes paid tickets purchasable", async () => {
    expect((await db.rpc("event_payment_readiness", { p_event: eventId })).data).toBe("ready");
  });

  test("payment_intent.succeeded on the connected account: memo ledger once, platform cash = application fee only", async () => {
    const { data: o } = await db.from("checkout_orders").select("amount,fee,application_fee_minor").eq("order_ref", ref).single();
    const gross = Math.round((Number(o.amount) + Number(o.fee)) * 100);
    const event = { id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", account: acct, created: 1000,
      data: { object: { id: pi, amount_received: gross, currency: "gbp", latest_charge: ch, application_fee: "fee_test_1", metadata: { order_ref: ref } } } };
    expect((await send(event)).body).toEqual({ received: true });
    expect((await send(event)).body.duplicate).toBe(true);
    const e = await entries(`stripe:pi:${pi}`);
    expect(e?.basis).toBe("direct_charge_memo");
    expect(sum(e!.lines)).toBe(0);
    expect(cash(e!.lines)).toBe(Number(o.application_fee_minor));
    expect(e!.lines.find(l => l.account === "merchant_gmv")).toMatchObject({ amount_minor: -gross, party_id: ws });
    const { data: after } = await db.from("checkout_orders").select("status,stripe_payment_intent,stripe_charge,funds_custodied_by_platform,payment_route").eq("order_ref", ref).single();
    expect(after).toMatchObject({ status: "paid", stripe_payment_intent: pi, stripe_charge: ch, funds_custodied_by_platform: false, payment_route: "DIRECT_CONNECTED_ACCOUNT" });
    const { data: logged } = await db.from("webhook_events").select("stripe_account,endpoint,status").eq("external_id", `${acct}:${event.id}`).single();
    expect(logged).toMatchObject({ stripe_account: acct, endpoint: "connect", status: "processed" });
  });

  test("an event for this order from another account context is rejected as a wrong-account charge", async () => {
    const other = `acct_test_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const r = await send({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", account: other, data: { object: { id: `pi_x${randomUUID().slice(0, 8)}`, amount_received: 1, currency: "gbp", metadata: { order_ref: ref } } } });
    expect(r.body).toEqual({ received: true });
    const { data: audit } = await db.from("audit_events").select("event,metadata").eq("event", "payment.account_mismatch").contains("metadata", { order_ref: ref, got: other });
    expect((audit as unknown[]).length).toBe(1);
  });

  test("a platform-signed event carrying a connected account is ignored (context mismatch)", async () => {
    test.skip(!PLATFORM, "no platform sandbox secret");
    const r = await send({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", account: acct, data: { object: { id: "pi_y", metadata: { order_ref: ref } } } }, PLATFORM);
    expect(r.body).toEqual({ received: true, ignored: "account_context" });
  });

  test("charge.refunded on the connected account: seller-side memo only, idempotent per cumulative total", async () => {
    const event = (total: number) => ({ id: `evt_${randomUUID()}`, type: "charge.refunded", account: acct, data: { object: { id: ch, payment_intent: pi, amount_refunded: total, currency: "gbp", metadata: { order_ref: ref } } } });
    expect((await send(event(1000))).body).toEqual({ received: true });
    expect((await send(event(1000))).body).toEqual({ received: true });   // replay with a new event id: no second posting
    const e = await entries(`stripe:direct-refund:${ch}:1000`);
    expect(sum(e!.lines)).toBe(0);
    expect(cash(e!.lines)).toBe(0);
    const { count } = await db.from("ledger_transactions").select("id", { count: "exact", head: true }).like("idempotency_key", `stripe:direct-refund:${ch}:%`);
    expect(count).toBe(1);
  });

  test("payout.* is mirrored for the seller; an older event never regresses it", async () => {
    const po = `po_test_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const ev = (status: string, created: number) => ({ id: `evt_${randomUUID()}`, type: `payout.${status === "paid" ? "paid" : "updated"}`, account: acct, created,
      data: { object: { id: po, status, amount: 4000, currency: "gbp", arrival_date: 1_800_000_000, method: "standard" } } });
    expect((await send(ev("paid", 2000))).body).toEqual({ received: true });
    expect((await send(ev("in_transit", 1500))).body).toEqual({ received: true });
    const { data: row } = await db.from("connected_payouts").select("status,workspace_id,amount_minor").eq("stripe_payout_id", po).single();
    expect(row).toMatchObject({ status: "paid", workspace_id: ws, amount_minor: 4000 });
    const e = await entries(`stripe:payout:${po}`);
    expect(sum(e!.lines)).toBe(0);
    expect(cash(e!.lines)).toBe(0);
  });

  test("charge.dispute.* on a connected charge: seller is liable, no platform cash moves", async () => {
    const dp = `dp_test_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const obj = { id: dp, amount: 1500, currency: "gbp", charge: ch, payment_intent: pi, reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1_900_000_000, submission_count: 0 } };
    expect((await send({ id: `evt_${randomUUID()}`, type: "charge.dispute.created", account: acct, data: { object: obj } })).body).toEqual({ received: true });
    expect((await send({ id: `evt_${randomUUID()}`, type: "charge.dispute.funds_withdrawn", account: acct, data: { object: obj } })).body).toEqual({ received: true });
    const { data: d } = await db.from("stripe_disputes").select("stripe_account_id,liability,order_ref").eq("stripe_dispute_id", dp).single();
    expect(d).toMatchObject({ stripe_account_id: acct, liability: "connected_account", order_ref: ref });
    const e = await entries(`stripe:dispute:${acct}:${dp}:withdrawn`);
    expect(sum(e!.lines)).toBe(0);
    expect(cash(e!.lines)).toBe(0);
    expect(e!.lines.find(l => l.account === "seller_disputes")).toMatchObject({ amount_minor: 1500, party_id: ws });
  });
});
