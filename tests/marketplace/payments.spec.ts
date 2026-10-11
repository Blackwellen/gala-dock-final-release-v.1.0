import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Payment orchestration (§38–43): DB-computed amounts + commission snapshot, webhook-confirmed payment with ledger, protection → release,
// cancellation refund queue, refund/dispute state sync. Stripe is simulated only at the signed-webhook boundary.
const db = admin as unknown as SupabaseClient;
const secret = fs.readFileSync(".env", "utf8").match(/^STRIPE_WEBHOOK_SECRET_SANDBOX=(.+)$/m)?.[1]?.trim() ?? "";
const send = async (event: object) => {
  const body = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`, "content-type": "application/json" }, body });
  return { status: res.status, body: await res.json() };
};
type PO = { reference: string; amount_minor: number; platform_fee_minor: number; status: string; commission: { rate_bps: number; source: string } };

test.describe.configure({ mode: "serial" });
test.describe("payment orchestration", () => {
  let org: { id: string; email: string }, prov: { id: string; email: string }, out: { id: string; email: string };
  let orgC: SupabaseClient, outC: SupabaseClient, provWs: string, listing: string, event: string, item: string, po: PO;
  const pi = `pi_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  test.beforeAll(async () => {
    [org, prov, out] = await Promise.all([createUser("pay-org"), createUser("pay-prov"), createUser("pay-out")]);
    provWs = await seedWorkspace(prov.id, "provider", "Pay Test Catering");
    await db.from("workspaces").update({ commission_bps: 1200 }).eq("id", provWs);
    listing = ((await db.from("listings").insert({ workspace_id: provWs, name: "Pay Test Catering", kind: "service", category: "catering", published: true }).select("id").single()).data as { id: string }).id;
    event = ((await db.from("events").insert({ owner_id: org.id, name: "Pay test", starts_at: new Date(Date.now() + 40 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
    item = ((await db.from("build_items").insert({ event_id: event, listing_id: listing, category: "catering", title: "Pay Test Catering", status: "quoted", amount: 2000, deposit: 500,
      terms_snapshot: { cancellation: { tiers: [{ days_before: 30, refund_pct: 100 }, { days_before: 0, refund_pct: 0 }] } } }).select("id").single()).data as { id: string }).id;
    [orgC, outC] = await Promise.all([signedIn(org.email), signedIn(out.email)]) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("booking_cancellations").delete().eq("event_id", event);
    await db.from("provider_jobs").delete().eq("workspace_id", provWs);
    await db.from("payment_orders").delete().eq("event_id", event).then(() => null, () => null); // ledger rows keep their references (immutable by design)
    await db.from("events").delete().eq("id", event);
    // The immutable ledger keeps the workspace referenced; take it out of the marketplace instead of deleting.
    await db.from("listings").update({ published: false }).eq("workspace_id", provWs);
    await db.from("workspaces").update({ status: "suspended" }).eq("id", provWs);
    await cleanup();
  });

  test("order amount and commission come from the database, never the client; outsiders cannot create orders", async () => {
    expect((await outC.rpc("create_payment_order", { p_kind: "deposit", p_item: item })).error?.message).toMatch(/not_authorized/);
    const { data, error } = await orgC.rpc("create_payment_order", { p_kind: "deposit", p_item: item });
    expect(error).toBeNull();
    po = data as PO;
    expect(po).toMatchObject({ amount_minor: 50000, platform_fee_minor: 6000, status: "amount_due" });
    expect(po.commission).toMatchObject({ rate_bps: 1200, source: "workspace" });
    // Same request again resumes the same order (idempotent), not a second charge.
    expect(((await orgC.rpc("create_payment_order", { p_kind: "deposit", p_item: item })).data as PO).reference).toBe(po.reference);
    // A rule beats the workspace rate and is snapshotted.
    const { data: rule } = await db.from("commission_rules").insert({ name: "Test catering promo", workspace_id: provWs, category: "catering", rate_bps: 500 }).select("id").single();
    const { data: c } = await db.rpc("resolve_commission", { p_workspace: provWs, p_category: "catering" });
    expect(c).toMatchObject({ source: "rule", rate_bps: 500 });
    await db.from("commission_rules").delete().eq("id", (rule as { id: string }).id);
  });

  test("a redirect never confirms; the signed webhook does — once, with a balanced ledger and protection", async () => {
    expect(((await db.from("build_items").select("status").eq("id", item).single()).data as { status: string }).status).toBe("quoted");
    const ev = (amount: number) => ({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", livemode: false, data: { object: { id: pi, amount_received: amount, latest_charge: `ch_${pi}`, currency: "gbp", metadata: { payment_order: po.reference } } } });
    expect((await send(ev(50000))).status).toBe(200);
    expect((await send(ev(50000))).status).toBe(200); // redelivery with a new event id
    const order = (await db.from("payment_orders").select("status,stripe_payment_intent").eq("reference", po.reference).single()).data;
    expect(order).toEqual({ status: "protected_pending_delivery", stripe_payment_intent: pi });
    const b = (await db.from("build_items").select("status,terms_snapshot").eq("id", item).single()).data as { status: string; terms_snapshot: { payment_order: string; commission: { rate_bps: number } } };
    expect(b.status).toBe("confirmed");
    expect(b.terms_snapshot).toMatchObject({ payment_order: po.reference, commission: { rate_bps: 1200 } });
    const { data: txs } = await db.from("ledger_transactions").select("id").eq("stripe_ref", pi);
    expect(txs).toHaveLength(1);
    const { data: lines } = await db.from("ledger_entries").select("account,amount_minor").eq("transaction_id", (txs as { id: string }[])[0].id);
    expect(Object.fromEntries((lines as { account: string; amount_minor: number }[]).map(l => [l.account, Number(l.amount_minor)]))).toEqual({ cash_stripe: 50000, platform_fee: -6000, provider_payable: -44000 });
  });

  test("tampered amount is rejected and recorded, not applied", async () => {
    const { data } = await orgC.rpc("create_payment_order", { p_kind: "balance_payment", p_item: item });
    const bal = data as PO;
    expect(bal.amount_minor).toBe(150000);
    await send({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", data: { object: { id: `pi_bad${randomUUID().slice(0, 8)}`, amount_received: 100, latest_charge: "ch_bad", metadata: { payment_order: bal.reference } } } });
    expect(((await db.from("payment_orders").select("status,failure_reason").eq("reference", bal.reference).single()).data as { status: string; failure_reason: string })).toMatchObject({ status: "failed", failure_reason: "amount_mismatch:100" });
  });

  test("release waits for delivery and is blocked by an open dispute", async () => {
    await db.rpc("payment_release_scan");
    expect(((await db.from("payment_orders").select("status").eq("reference", po.reference).single()).data as { status: string }).status).toBe("protected_pending_delivery");
    await db.from("build_items").update({ status: "fulfilled" }).eq("id", item);
    const { data: did } = await orgC.rpc("open_booking_dispute", { p_item: item, p_reason: "partial_service", p_summary: "Half the canapés never arrived", p_amount: 100 });
    await db.rpc("payment_release_scan");
    expect(((await db.from("payment_orders").select("status").eq("reference", po.reference).single()).data as { status: string }).status).toBe("protected_pending_delivery");
    await db.from("booking_dispute_entries").delete().eq("dispute_id", did as string);
    await db.from("booking_disputes").delete().eq("id", did as string);
    await db.from("build_items").update({ status: "fulfilled" }).eq("id", item);
    await db.rpc("payment_release_scan");
    expect(((await db.from("payment_orders").select("status").eq("reference", po.reference).single()).data as { status: string }).status).toBe("eligible_for_provider_transfer");
  });

  test("refunds and chargebacks reconcile onto the order", async () => {
    await send({ id: `evt_${randomUUID()}`, type: "charge.refunded", data: { object: { id: `ch_${pi}`, payment_intent: pi, amount_refunded: 10000, currency: "gbp", metadata: { payment_order: po.reference } } } });
    expect(((await db.from("payment_orders").select("status,refunded_minor").eq("reference", po.reference).single()).data)).toEqual({ status: "partially_refunded", refunded_minor: 10000 });
    await send({ id: `evt_${randomUUID()}`, type: "charge.dispute.created", data: { object: { id: `dp_${randomUUID().slice(0, 10)}`, amount: 40000, currency: "gbp", charge: `ch_${pi}`, payment_intent: pi, status: "needs_response", reason: "fraudulent" } } });
    expect(((await db.from("payment_orders").select("status").eq("reference", po.reference).single()).data as { status: string }).status).toBe("disputed");
    await db.from("stripe_disputes").delete().eq("payment_intent_id", pi);
    await db.from("support_cases").delete().contains("related", { payment_intent: pi });
  });

  test("an accepted cancellation with a refund joins the refund queue", async () => {
    const it2 = ((await db.from("build_items").insert({ event_id: event, listing_id: listing, category: "catering", title: "Second line", status: "confirmed", amount: 800, deposit: 200,
      terms_snapshot: { cancellation: { tiers: [{ days_before: 30, refund_pct: 100 }] } } }).select("id").single()).data as { id: string }).id;
    await db.from("payment_orders").insert({ kind: "deposit", status: "amount_due", event_id: event, build_item_id: it2, payee_workspace_id: provWs, description: "Deposit — Second line", amount_minor: 20000, idempotency_key: `test:${it2}` });
    await db.from("payment_orders").update({ status: "protected_pending_delivery", stripe_payment_intent: `pi_x${randomUUID().slice(0, 8)}` }).eq("build_item_id", it2);
    await db.from("provider_jobs").insert({ reference: `BK-T${randomUUID().slice(0, 5)}`, workspace_id: provWs, build_item_id: it2, event_id: event, listing_id: listing, mode: "service", client_name: "Test", event_name: "Pay test", status: "confirmed", paid_amount: 200 });
    const { data: cid, error } = await orgC.rpc("request_cancellation", { p_item: it2, p_party: "customer", p_kind: "full", p_reason: "Plans changed completely" });
    expect(error).toBeNull();
    expect(((await db.from("booking_cancellations").select("status,refund_status,calculation").eq("id", cid as string).single()).data)).toMatchObject({ status: "completed", refund_status: "due", calculation: { refund_amount: 200 } });
  });
});
