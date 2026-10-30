// Lane A2 · Stripe test/live separation (migration 202610295001). Unit rules for mode derivation + webhook mode decisions, then API/DB
// checks against the running dev server (test mode) and the shared database with disposable fixtures (is_test_fixture workspaces,
// p1-*@gala-dock.test users, acct_test_* ids). No Stripe API call is made; no secret value is printed.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { admin, BASE, cleanup, createUser, insertEventFixture, seedWorkspace } from "../phase1/helpers";
import { signStripePayload } from "../../src/lib/payments/webhook-core";
import { accountTaxIdParams, billingMode, BillingModeError, packCheckoutParams, planChangeParams, priceColumn, priceFor } from "../../src/lib/billing/core";
import { columnForMode, idForMode, modeOfPublishableKey, modeOfSecretKey, platformMode, platformSecretKey, publishableKeyFor, webhookModeDecision, webhookSecrets } from "../../src/lib/payments/stripe-mode";

const envFile = fs.readFileSync(".env", "utf8");
const envVal = (k: string) => envFile.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "") ?? "";
const SANDBOX_PLATFORM = envVal("STRIPE_WEBHOOK_SECRET_SANDBOX"), LIVE_PLATFORM = envVal("STRIPE_WEBHOOK_SECRET");
const db = admin as unknown as SupabaseClient;
/** Service-role client that declares the given mode, exactly as src/lib/supabase/admin.ts does. */
const modeClient = (mode: "live" | "test") => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { "x-gala-stripe-mode": mode } } });
const send = async (event: object, secret: string) => {
  const body = JSON.stringify(event);
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": signStripePayload(body, secret), "content-type": "application/json" }, body });
  return { status: res.status, body: await res.json() };
};

test.describe("Stripe mode derivation (unit)", () => {
  test("mode comes from the key prefix only; never an implicit live fallback", () => {
    expect(modeOfSecretKey("sk_live_abc123")).toBe("live");
    expect(modeOfSecretKey("rk_live_abc123")).toBe("live");
    expect(modeOfSecretKey("sk_test_abc123")).toBe("test");
    expect(modeOfSecretKey("rk_test_abc123")).toBe("test");
    for (const bad of ["", null, undefined, "pk_live_abc", "whsec_abc", "sk_live_", "live"]) expect(modeOfSecretKey(bad as string)).toBe("unconfigured");
    // Outside production the sandbox key is the fallback; in production only STRIPE_CONNECT_SECRET_KEY counts. STRIPE_SECRET_KEY is never read.
    expect(platformMode({ STRIPE_SECRET_KEY_SANDBOX: "sk_test_x1", NODE_ENV: "development" })).toBe("test");
    expect(platformMode({ STRIPE_SECRET_KEY_SANDBOX: "sk_test_x1", NODE_ENV: "production" })).toBe("unconfigured");
    expect(platformMode({ STRIPE_SECRET_KEY: "sk_live_x1", NODE_ENV: "production" })).toBe("unconfigured");
    expect(platformMode({ STRIPE_CONNECT_SECRET_KEY: "sk_live_x1", STRIPE_SECRET_KEY_SANDBOX: "sk_test_x1", NODE_ENV: "development" })).toBe("live");
    expect(platformSecretKey({ STRIPE_CONNECT_SECRET_KEY: "", STRIPE_SECRET_KEY_SANDBOX: "sk_test_x1", NODE_ENV: "test" })).toBe("sk_test_x1");
  });
  test("publishable key and per-mode ids follow the platform mode", () => {
    expect(modeOfPublishableKey("pk_live_a1")).toBe("live");
    // Local today: STRIPE_PUBLIC_KEY is pk_live but the platform is test → the sandbox pk is used, never the live one.
    expect(publishableKeyFor("test", { STRIPE_PUBLIC_KEY: "pk_live_a1", STRIPE_PUBLIC_KEY_SANDBOX: "pk_test_b2" })).toBe("pk_test_b2");
    expect(publishableKeyFor("test", { STRIPE_PUBLIC_KEY: "pk_live_a1" })).toBeNull();
    expect(publishableKeyFor("live", { STRIPE_PUBLIC_KEY: "pk_test_b2", STRIPE_PUBLIC_KEY_SANDBOX: "pk_test_b2" })).toBeNull();
    expect(publishableKeyFor("live", { STRIPE_PUBLIC_KEY: "pk_live_a1" })).toBe("pk_live_a1");
    expect(idForMode("live", { test: "acct_test1", live: null })).toBeNull();
    expect(idForMode("test", { test: "acct_test1", live: "acct_live1" })).toBe("acct_test1");
    expect(idForMode("unconfigured", { test: "acct_test1", live: "acct_live1" })).toBeNull();
    expect(columnForMode("live", "stripe_account_id")).toBe("stripe_account_id_live");
    expect(columnForMode("test", "stripe_customer_id")).toBe("stripe_customer_id");
  });
  test("webhook secrets are tagged by endpoint mode; only same-mode events are processed", () => {
    const s = webhookSecrets({ STRIPE_WEBHOOK_SECRET: "whsec_l1", STRIPE_WEBHOOK_SECRET_CONNECT: "whsec_l2", STRIPE_WEBHOOK_SECRET_SANDBOX: "whsec_t1", STRIPE_WEBHOOK_SECRET_SANDBOX_CONNECT: "whsec_t2" });
    expect(s.map(x => `${x.endpoint}:${x.mode}`)).toEqual(["platform:live", "connect:live", "platform:test", "connect:test"]);
    expect(webhookModeDecision("live", "live", true)).toEqual({ accept: true });
    expect(webhookModeDecision("test", "test", false)).toEqual({ accept: true });
    expect(webhookModeDecision("test", "test", undefined)).toEqual({ accept: true });
    expect(webhookModeDecision("live", "live", false)).toEqual({ accept: false, reason: "event_mode_mismatch" });
    expect(webhookModeDecision("live", "test", false)).toEqual({ accept: false, reason: "secret_mode_mismatch" });
    expect(webhookModeDecision("test", "live", true)).toEqual({ accept: false, reason: "secret_mode_mismatch" });
    expect(webhookModeDecision("test", "test", true)).toEqual({ accept: false, reason: "event_mode_mismatch" });
    expect(webhookModeDecision("unconfigured", "test", false)).toEqual({ accept: false, reason: "platform_unconfigured" });
  });
});

test.describe("Platform billing in the key's mode (unit)", () => {
  test("live keys bill with live prices, test keys with test prices; unmapped or unknown refuses", () => {
    expect(billingMode("sk_live_abc")).toEqual({ key: "sk_live_abc", live: true });
    expect(billingMode("rk_test_abc")).toEqual({ key: "rk_test_abc", live: false });
    for (const bad of ["", null, "pk_live_x", "whsec_x"]) expect(() => billingMode(bad as string)).toThrow(BillingModeError);
    const row = { stripe_price_test: "price_TestA1", stripe_price_live: null as string | null };
    expect(priceFor(row, false)).toBe("price_TestA1");
    expect(() => priceFor(row, true)).toThrow("billing_price_unmapped");                 // never falls back to the test id in live
    expect(priceFor({ ...row, stripe_price_live: "price_LiveB2" }, true)).toBe("price_LiveB2");
    expect(() => priceFor({ stripe_price_test: "nope", stripe_price_live: null }, false)).toThrow(BillingModeError);
    expect(priceColumn(true)).toBe("stripe_price_live");
    expect(priceColumn(false)).toBe("stripe_price_test");
  });
});

test.describe("Gala Dock VAT number on platform own-sales invoices (unit)", () => {
  test("credit packs and plan changes carry the account tax id; invalid ids are dropped", () => {
    const ids = ["txi_1UW1J4PCqawznZLzGwPJuTPB", "bogus"];
    expect(accountTaxIdParams("invoice_settings", ids)).toEqual({ "invoice_settings[account_tax_ids][0]": "txi_1UW1J4PCqawznZLzGwPJuTPB" });
    expect(packCheckoutParams({ customer: "cus_1", price: "price_1", workspaceId: "w", packId: "p", successUrl: "s", cancelUrl: "c", accountTaxIds: ids }))
      .toMatchObject({ "invoice_creation[enabled]": "true", "invoice_creation[invoice_data][account_tax_ids][0]": "txi_1UW1J4PCqawznZLzGwPJuTPB" });
    expect(packCheckoutParams({ customer: "cus_1", price: "price_1", workspaceId: "w", packId: "p", successUrl: "s", cancelUrl: "c" })["invoice_creation[enabled]"]).toBeUndefined();
    expect(planChangeParams({ itemId: "si_1", price: "price_2", direction: "upgrade", currentPlan: "pro", periodEnd: 1, accountTaxIds: ids }))
      .toMatchObject({ "invoice_settings[account_tax_ids][0]": "txi_1UW1J4PCqawznZLzGwPJuTPB" });
  });
});

test.describe("Stripe mode separation (dev server in test mode + database)", () => {
  let ws = "", eventId = "";
  const acct = `acct_test_a2${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const txIds: string[] = [];

  test.beforeAll(async () => {
    const owner = await createUser("a2-stripe-mode");
    ws = await seedWorkspace(owner.id, "organizer", "A2 Mode Seller");
    expect((await db.from("connect_accounts").insert({ workspace_id: ws, stripe_account_id: acct, account_type: "standard", charges_enabled: true, payouts_enabled: true,
      details_submitted: true, card_payments_capability: "active", transfers_capability: "active", verification_state: "verified" })).error).toBeNull();
    const ev = await insertEventFixture({ owner_id: owner.id, workspace_id: ws, name: "A2 Mode Event" }, "stripe mode readiness").select("id").single();
    expect(ev.error).toBeNull();
    eventId = (ev.data as { id: string }).id;
  });
  test.afterAll(async () => {
    if (txIds.length) await db.from("transactions").delete().in("id", txIds);
    // A live-flagged row may only be removed (never downgraded); delete the fixture row outright.
    await db.from("connect_accounts").delete().eq("workspace_id", ws);
    await cleanup();
  });

  test("webhook: a live-mode event reaching a test deployment is acknowledged, ignored and audited", async () => {
    test.skip(!/^whsec_/.test(SANDBOX_PLATFORM), "sandbox platform secret not in .env");
    const id = `evt_a2_${randomUUID().replaceAll("-", "")}`;
    const r = await send({ id, type: "checkout.session.completed", livemode: true, created: Math.floor(Date.now() / 1000), data: { object: { id: `cs_live_${id}`, metadata: { order_ref: "GD-A2NONE" } } } }, SANDBOX_PLATFORM);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ received: true, ignored: "mode_mismatch" });
    const { data: audit } = await db.from("audit_events").select("metadata").eq("event", "stripe.webhook_mode_ignored").contains("metadata", { event_id: id });
    expect(audit).toHaveLength(1);
    expect((audit as { metadata: Record<string, unknown> }[])[0].metadata).toMatchObject({ reason: "event_mode_mismatch", platform_mode: "test", secret_mode: "test", event_livemode: true });
    // Never claimed: no webhook_events row, so nothing was processed.
    const { count } = await db.from("webhook_events").select("id", { count: "exact", head: true }).eq("external_id", id);
    expect(count).toBe(0);
  });

  test("webhook: an event signed by a LIVE endpoint secret is ignored by a test deployment", async () => {
    test.skip(!/^whsec_/.test(LIVE_PLATFORM), "live platform secret not in .env");
    const id = `evt_a2_${randomUUID().replaceAll("-", "")}`;
    const r = await send({ id, type: "invoice.paid", livemode: false, data: { object: { id: `in_${id}` } } }, LIVE_PLATFORM);
    expect(r.body).toEqual({ received: true, ignored: "mode_mismatch" });
    const { data: audit } = await db.from("audit_events").select("metadata").eq("event", "stripe.webhook_mode_ignored").contains("metadata", { event_id: id });
    expect((audit as { metadata: Record<string, unknown> }[])[0].metadata).toMatchObject({ reason: "secret_mode_mismatch", secret_mode: "live" });
  });

  test("webhook: a same-mode event is still processed", async () => {
    test.skip(!/^whsec_/.test(SANDBOX_PLATFORM), "sandbox platform secret not in .env");
    const id = `evt_a2_${randomUUID().replaceAll("-", "")}`;
    const r = await send({ id, type: "customer.created", livemode: false, data: { object: { id: `cus_${id}` } } }, SANDBOX_PLATFORM);
    expect(r.body).toEqual({ received: true });
    const { data } = await db.from("webhook_events").select("status,livemode").eq("external_id", id).single();
    expect(data).toMatchObject({ status: "processed", livemode: false });
  });

  test("readiness, seller account and payout eligibility ignore a wrong-mode account (not ready, not an error)", async () => {
    const test_ = modeClient("test"), live = modeClient("live");
    expect((await test_.rpc("event_payment_readiness", { p_event: eventId })).data).toBe("ready");
    expect(((await test_.rpc("seller_payment_account", { p_workspace: ws })).data as { stripe_account_id: string }).stripe_account_id).toBe(acct);
    const r = await live.rpc("event_payment_readiness", { p_event: eventId });
    expect(r.error).toBeNull();
    expect(r.data).toBe("seller_not_ready");
    const sa = (await live.rpc("seller_payment_account", { p_workspace: ws })).data as { stripe_account_id: string | null; charges_enabled: boolean; livemode: boolean };
    expect(sa).toMatchObject({ stripe_account_id: null, charges_enabled: false, livemode: true });
    expect((await live.rpc("payout_eligible", { p_workspace: ws })).data).toBe(false);
    // An anonymous caller cannot choose the mode with the header.
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { headers: { "x-gala-stripe-mode": "live" } } });
    expect((await anon.rpc("stripe_livemode")).data).toBe(false);
    expect((await anon.rpc("event_payment_readiness", { p_event: eventId })).data).toBe("ready");
  });

  test("a live snapshot can never be replaced by a test one; the live row is invisible to test readiness", async () => {
    expect((await db.from("connect_accounts").update({ livemode: true }).eq("workspace_id", ws)).error).toBeNull();
    const down = await db.from("connect_accounts").update({ livemode: false }).eq("workspace_id", ws);
    expect(down.error?.message).toContain("connect_live_row_protected");
    expect((await modeClient("test").rpc("event_payment_readiness", { p_event: eventId })).data).toBe("seller_not_ready");
    expect((await modeClient("live").rpc("event_payment_readiness", { p_event: eventId })).data).toBe("ready");
  });

  test("money rows: historic rows are test, new rows take the request's mode, and a live dashboard filter excludes test rows", async () => {
    const row = (d: string) => ({ workspace_id: ws, kind: "income", description: `A2 fixture ${d}`, amount: 12.5, category: "tickets" });
    const t = await modeClient("test").from("transactions").insert(row("test")).select("id,livemode").single();
    const l = await modeClient("live").from("transactions").insert(row("live")).select("id,livemode").single();
    expect(t.error).toBeNull(); expect(l.error).toBeNull();
    txIds.push(t.data!.id, l.data!.id);
    expect(t.data!.livemode).toBe(false);
    expect(l.data!.livemode).toBe(true);
    // The dashboard queries (organizer/provider money, admin ledger) add .eq("livemode", stripeLive()).
    const liveView = await db.from("transactions").select("id").eq("workspace_id", ws).eq("livemode", true);
    const testView = await db.from("transactions").select("id").eq("workspace_id", ws).eq("livemode", false);
    expect((liveView.data ?? []).map(r => r.id)).toEqual([l.data!.id]);
    expect((testView.data ?? []).map(r => r.id)).toEqual([t.data!.id]);
    // Historic data is all test: no live payment has ever been taken.
    for (const table of ["payment_orders", "checkout_orders", "ledger_transactions", "connected_payouts", "application_fee_records"]) {
      const { count } = await db.from(table).select("*", { count: "exact", head: true }).eq("livemode", true);
      expect(count, table).toBe(0);
    }
    const { count: unflagged } = await db.from("payment_orders").select("*", { count: "exact", head: true }).is("livemode", null);
    expect(unflagged).toBe(0);
  });
});
