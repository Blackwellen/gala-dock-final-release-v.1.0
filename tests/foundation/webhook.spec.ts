import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { admin, BASE, cleanup, createUser, seedWorkspace } from "../phase1/helpers";

// Signs payloads with the local test secret, exactly as Stripe does (t=..,v1=HMAC-SHA256).
// Signs with the sandbox platform endpoint secret from .env (the route accepts any configured endpoint secret).
const secret = fs.readFileSync(".env", "utf8").match(/^STRIPE_WEBHOOK_SECRET_SANDBOX=(.+)$/m)?.[1]?.trim() ?? "";
const send = async (event: object, sign = true) => {
  const body = JSON.stringify(event); const t = Math.floor(Date.now() / 1000);
  const sig = sign ? `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}` : `t=${t},v1=deadbeef`;
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": sig, "content-type": "application/json" }, body });
  return { status: res.status, body: await res.json() };
};

test.describe("stripe webhook: idempotent, authoritative", () => {
  let owner: { id: string }, ws: string, eventId: string, ref: string;
  const acct = `acct_test_${randomUUID().slice(0, 8)}`;
  const refs: string[] = [];

  test.beforeAll(async () => {
    expect(secret, "STRIPE_WEBHOOK_SECRET_SANDBOX in .env").toMatch(/^whsec_/);
    owner = await createUser("wh-owner");
    ws = await seedWorkspace(owner.id, "provider", "Webhook Provider");
    await admin.from("workspaces").update({ stripe_account_id: acct } as never).eq("id", ws);
    const ev = await admin.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: "Webhook Event" } as never).select("id").single();
    eventId = (ev.data as { id: string }).id;
  });
  test.beforeEach(async () => {
    ref = `GD-T${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    refs.push(ref);
    const o = await admin.from("checkout_orders").insert({ order_ref: ref, event_id: eventId, buyer_id: owner.id, token: randomUUID(), amount: 50, fee: 5, currency: "GBP", status: "paid", lines: [], kind: "primary" } as never);
    expect(o.error).toBeNull();
  });
  test.afterAll(async () => { await admin.from("checkout_orders").delete().in("order_ref", refs); await cleanup(); });

  test("rejects unsigned/forged payloads", async () => {
    expect((await send({ id: "evt_x", type: "ping", data: { object: { id: "x" } } }, false)).status).toBe(400);
  });

  test("account.updated syncs Connect state once; duplicates are ignored", async () => {
    const id = `evt_${randomUUID()}`;
    const event = { id, type: "account.updated", data: { object: { id: acct, type: "express", country: "GB", details_submitted: true, charges_enabled: true, payouts_enabled: false, capabilities: { transfers: "pending" }, requirements: { currently_due: ["external_account"], past_due: [], disabled_reason: null } } } };
    expect((await send(event)).body).toEqual({ received: true });
    const dup = await send(event);
    expect(dup.body.duplicate).toBe(true);
    const { data: ca } = await admin.from("connect_accounts" as never).select("verification_state,payouts_enabled,requirements_currently_due").eq("workspace_id", ws).single();
    expect(ca).toMatchObject({ verification_state: "action_required", payouts_enabled: false });
    expect((await admin.rpc("payout_eligible" as never, { p_workspace: ws } as never)).data).toBe(false);
    // Becomes verified on a later authoritative update; one verification record per state change.
    await send({ id: `evt_${randomUUID()}`, type: "account.updated", data: { object: { ...event.data.object, payouts_enabled: true, capabilities: { transfers: "active" }, requirements: { currently_due: [], past_due: [], disabled_reason: null } } } });
    expect((await admin.rpc("payout_eligible" as never, { p_workspace: ws } as never)).data).toBe(true);
    const { data: recs } = await admin.from("verification_records" as never).select("status").eq("workspace_id", ws).order("created_at");
    expect((recs as { status: string }[]).map(r => r.status)).toEqual(["action_required", "verified"]);
    expect((await admin.from("workspaces").select("payout_status").eq("id", ws).single()).data).toMatchObject({ payout_status: "active" });
  });

  test("payment_intent.succeeded posts one balanced ledger transaction", async () => {
    const pi = `pi_${randomUUID().slice(0, 12)}`;
    const event = { id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", data: { object: { id: pi, amount_received: 5500, currency: "gbp", metadata: { order_ref: ref } } } };
    expect((await send(event)).status).toBe(200); expect((await send({ ...event, id: `evt_${randomUUID()}` })).status).toBe(200); // a second delivery with a new event id must still not double-post
    const { data: txs } = await admin.from("ledger_transactions" as never).select("id,kind").eq("stripe_ref", pi);
    expect(txs).toHaveLength(1);
    const { data: lines } = await admin.from("ledger_entries" as never).select("account,amount_minor").eq("transaction_id", (txs as { id: string }[])[0].id);
    const byAccount = Object.fromEntries((lines as { account: string; amount_minor: number }[]).map(l => [l.account, Number(l.amount_minor)]));
    // £5.00 booking fee includes £0.83 Gala Dock VAT, which is owed to HMRC rather than revenue.
    expect(byAccount).toEqual({ cash_stripe: 5500, platform_fee: -417, tax_payable: -83, provider_payable: -5000 });
  });

  test("charge.dispute.* mirrors the chargeback, opens one support case and posts funds movements once", async () => {
    const pi = `pi_${randomUUID().slice(0, 12)}`, dp = `dp_${randomUUID().slice(0, 12)}`;
    expect((await send({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", data: { object: { id: pi, amount_received: 5500, currency: "gbp", metadata: { order_ref: ref } } } })).status).toBe(200);
    const dispute = (status: string) => ({ id: dp, amount: 4000, currency: "gbp", charge: `ch_${pi}`, payment_intent: pi, reason: "fraudulent", status, evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86400, submission_count: 0 } });
    expect((await send({ id: `evt_${randomUUID()}`, type: "charge.dispute.created", data: { object: dispute("needs_response") } })).body).toEqual({ received: true });
    await send({ id: `evt_${randomUUID()}`, type: "charge.dispute.funds_withdrawn", data: { object: dispute("needs_response") } });
    await send({ id: `evt_${randomUUID()}`, type: "charge.dispute.funds_withdrawn", data: { object: dispute("needs_response") } }); // redelivery under a new id
    await send({ id: `evt_${randomUUID()}`, type: "charge.dispute.closed", data: { object: dispute("won") } });
    await send({ id: `evt_${randomUUID()}`, type: "charge.dispute.funds_reinstated", data: { object: dispute("won") } });
    const row = (await admin.from("stripe_disputes" as never).select("status,outcome,order_ref,event_id").eq("stripe_dispute_id", dp).single()).data;
    expect(row).toEqual({ status: "won", outcome: "won", order_ref: ref, event_id: eventId });
    const { count } = await admin.from("support_cases").select("id", { count: "exact", head: true }).contains("related", { stripe_dispute_id: dp });
    expect(count).toBe(1);
    const { data: txs } = await admin.from("ledger_transactions" as never).select("kind").eq("source_id", dp).order("posted_at");
    expect((txs as { kind: string }[]).map(t => t.kind)).toEqual(["dispute", "reversal"]);
    await admin.from("support_cases").delete().contains("related", { stripe_dispute_id: dp });
    await admin.from("stripe_disputes" as never).delete().eq("stripe_dispute_id", dp);
  });

  test("charge.refunded records each cumulative refund once and never issues a refund", async () => {
    const ch = `ch_${randomUUID().slice(0, 12)}`;
    const refund = (amount: number) => ({ id: `evt_${randomUUID()}`, type: "charge.refunded", data: { object: { id: ch, amount_refunded: amount, currency: "gbp", metadata: { order_ref: ref } } } });
    await send(refund(1000)); await send(refund(1000)); await send(refund(2500));
    const { data: txs } = await admin.from("ledger_transactions" as never).select("id").eq("stripe_ref", ch).order("posted_at");
    expect(txs).toHaveLength(2);
    const amounts: number[] = [];
    for (const tx of txs as { id: string }[]) {
      const { data: cash } = await admin.from("ledger_entries" as never).select("amount_minor").eq("transaction_id", tx.id).eq("account", "cash_stripe").single();
      const entry = cash as unknown as { amount_minor: number } | null;
      expect(entry).not.toBeNull();
      amounts.push(Number(entry!.amount_minor));
    }
    expect(amounts).toEqual([-1000, -1500]); // Repeat cumulative 1000 posts no increment; cumulative 2500 posts only the difference.
  });
});
