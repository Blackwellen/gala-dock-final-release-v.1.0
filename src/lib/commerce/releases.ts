import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { stripeLive } from "@/lib/stripe";
import { paymentDeps } from "@/lib/payments/server";
import { connectedMerchantStripe, platformFeeStripe } from "@/lib/payments/stripe-client";
import { refundMerchantCharge } from "@/lib/payments/service";
import { capGroupToAvailable, planReleaseGroups, type DueRelease, type ChargeNet } from "@/lib/payments/releases-core";
import type { Order } from "@/lib/commerce/orchestrator";

/**
 * DEC-107 payouts (owner 2026-11-11, docs/backend/payments/dec107-gala-dock.md). Seller accounts have no Stripe dashboard and a
 * MANUAL payout schedule, so money stays in the seller's own Stripe balance until a release trigger. Each run:
 *   1. dec107_release_sweep(): creates releases for charged DEC-107 records and marks them due on an approved trigger;
 *   2. executes agreed refunds (settlement, accepted recommendation, checked award, default rule) on the seller's charge;
 *   3. pays due releases out of the seller's balance, one payout per seller × event (resales and merch group under their event),
 *      net of refunds, Gala Dock's application fee, open card disputes and the objective reserve. Never a platform transfer.
 * Idempotent: a payout's idempotency key is the hash of its release ids; the DB refuses to record a payout for a paused seller.
 */
export async function processReleases(limit = 100) {
  const db = untyped(createAdminClient() as never);
  const out = { sweep: null as unknown, refunds: 0, payouts: 0, released: 0, waiting: 0, errors: [] as string[] };
  const sweep = await db.rpc("dec107_release_sweep");
  if (sweep.error) { out.errors.push(`sweep: ${sweep.error.message}`); return out; }
  out.sweep = sweep.data;
  await db.rpc("dec107_dispute_deadlines");
  await db.rpc("dec107_retry_failed_payouts");   // failed payouts come back once the seller fixes the bank details (or after 24 h)
  const deps = paymentDeps(db);
  if (!deps) return out;
  out.refunds = await processRefundInstructions(out.errors);

  const live = stripeLive();
  const { data: due, error } = await db.rpc("dec107_releases_due", { p_livemode: live, p_limit: limit });
  if (error) { out.errors.push(`due: ${error.message}`); return out; }
  const rows = (due ?? []) as DueRelease[];
  if (!rows.length) return out;
  const merchant = connectedMerchantStripe(deps.stripe);
  // Net per charge, read from Stripe in the seller's context (books = provider balance by construction).
  const nets = new Map<string, ChargeNet>();
  for (const r of rows) {
    if (r.part !== "main" || !r.payment_intent || nets.has(r.payment_intent)) continue;
    try {
      const c = await merchant.charge(r.stripe_account_id, r.payment_intent);
      if (!c) { nets.set(r.payment_intent, { netMinor: 0, error: "no_charge" }); continue; }
      const feeId = typeof c.application_fee === "string" ? c.application_fee : c.application_fee?.id ?? null;
      let feeKept = Number(c.application_fee_amount ?? 0);
      const f = feeId ? await platformFeeStripe(deps.stripe).retrieve(feeId) : await platformFeeStripe(deps.stripe).forCharge(c.id);
      if (f) feeKept = f.amount - f.amount_refunded;
      const { data: disputed } = await db.from("stripe_disputes").select("amount_minor").eq("payment_intent_id", r.payment_intent).is("outcome", null);
      const open = ((disputed ?? []) as { amount_minor: number }[]).reduce((a, d) => a + Number(d.amount_minor), 0);
      nets.set(r.payment_intent, { netMinor: Math.max(0, c.amount - c.amount_refunded - feeKept - open) });
    } catch (e) { nets.set(r.payment_intent, { netMinor: 0, error: (e as Error).message }); }
  }
  const reserves = new Map<string, { kind: string; bps: number; days: number } | null>();
  for (const r of rows) {
    if (r.part !== "main" || reserves.has(r.workspace_id)) continue;
    const { data } = await db.rpc("dec107_reserve_for", { p_workspace: r.workspace_id, p_account: r.stripe_account_id, p_livemode: live });
    const row = ((data ?? []) as { kind: string; bps: number; days: number }[])[0];
    reserves.set(r.workspace_id, row ?? null);
  }
  for (const g of planReleaseGroups(rows, nets, reserves)) {
    const ids = g.items.map(i => i.id);
    if (g.error) { await db.rpc("dec107_release_failed", { p_ids: ids, p_error: g.error }); out.errors.push(`${g.key}: ${g.error}`); continue; }
    const group = createHash("sha256").update(ids.slice().sort().join(",")).digest("hex").slice(0, 32);
    try {
      let payoutId: string | null = null, paidItems: typeof g.items | null = null;
      if (g.payoutMinor > 0) {
        const bal = await merchant.balance(g.account);
        const avail = bal.available.find(b => b.currency.toUpperCase() === g.currency)?.amount ?? 0;
        let pay = g;
        if (avail < g.payoutMinor) {
          // Covered liability: a chargeback/refund already debited this seller's balance. Pay what is there; the shortfall is the
          // seller's own liability recovered from these releases (never platform money, never an overdraft).
          const capped = capGroupToAvailable(g, Math.max(0, avail));
          pay = capped.group; out.waiting += capped.shortfallMinor > 0 ? 1 : 0;
          // Owner 2026-11-11: the seller carries chargebacks; what its balance, reserve and later releases can't cover falls to Gala
          // Dock (platform-managed fallback). Record it: recovered from later releases first, absorbed by staff decision otherwise.
          await db.from("dec107_covered_liabilities").insert({ workspace_id: g.workspaceId, stripe_account_id: g.account, event_id: g.eventId, amount_minor: capped.shortfallMinor,
            recovered_minor: capped.shortfallMinor, status: "recovered", reason: "recovered_from_release", resolved_at: new Date().toISOString(), livemode: live });
          // A negative balance means the seller's own money no longer covers it: open a liability (later releases first, else staff decide).
          if (avail < 0) await db.from("dec107_covered_liabilities").insert({ workspace_id: g.workspaceId, stripe_account_id: g.account, event_id: g.eventId, amount_minor: -avail,
            reason: "negative_seller_balance", livemode: live });
          await db.from("audit_events").insert({ actor_type: "system", workspace_id: g.workspaceId, event: "payout.covered_liability",
            metadata: { account: g.account, event_id: g.eventId, due_minor: g.payoutMinor, paid_minor: avail, shortfall_minor: capped.shortfallMinor } });
          await db.rpc("notify_workspace", { p_ws: g.workspaceId, p_roles: ["owner", "manager", "finance"], p_kind: "payout_shortfall", p_title: "Payout reduced by a chargeback or refund",
            p_body: `£${(capped.shortfallMinor / 100).toFixed(2)} of this release was used to cover a chargeback or refund already taken from your Stripe balance. If you win the chargeback, the money comes back and is paid out with that sale.`, p_link: "/provider/money" });
          if (pay.payoutMinor <= 0) { await db.rpc("dec107_release_failed", { p_ids: ids, p_error: `waiting_for_available_balance:${avail}<${g.payoutMinor}` }); continue; }
        }
        const p = await merchant.payout(g.account, { amountMinor: pay.payoutMinor, currency: g.currency, description: g.description,
          metadata: { gd_release_group: group, event_id: g.eventId ?? "", releases: String(ids.length), trigger: g.trigger } }, `release:${group}`);
        payoutId = p.id; paidItems = pay.items;
        out.payouts++;
      }
      // Nothing left to pay (fully refunded, or all of it held as reserve): the releases close with amount 0 and no payout id.
      const rec = await db.rpc("dec107_release_paid", { p_items: paidItems ?? g.items, p_payout: payoutId, p_group: group });
      if (rec.error) throw new Error(rec.error.message);
      out.released += Number(rec.data ?? 0);
    } catch (e) {
      const msg = (e as Error).message;
      await db.rpc("dec107_release_failed", { p_ids: ids, p_error: msg });
      out.errors.push(`${g.key}: ${msg}`);
    }
  }
  return out;
}

/** Agreed refunds on the seller's charge (DEC-107: the admin fee is kept; the seller fee on the refunded part goes back). */
async function processRefundInstructions(errors: string[]) {
  const db = untyped(createAdminClient() as never);
  const deps = paymentDeps(db);
  if (!deps) return 0;
  const { data } = await db.from("dec107_refund_instructions").select("id,basis,build_item_id,amount_minor,refunded_minor,idempotency_key").in("status", ["due", "failed"]).limit(20);
  let done = 0;
  for (const ri of (data ?? []) as { id: string; basis: string; build_item_id: string; amount_minor: number; refunded_minor: number; idempotency_key: string }[]) {
    await db.from("dec107_refund_instructions").update({ status: "processing" }).eq("id", ri.id);
    const { data: orders } = await db.from("payment_orders").select("*").eq("build_item_id", ri.build_item_id).eq("strategy", "direct").not("stripe_payment_intent", "is", null).order("created_at", { ascending: false });
    let remaining = Number(ri.amount_minor) - Number(ri.refunded_minor), refunded = Number(ri.refunded_minor), error: string | null = null;
    for (const po of (orders ?? []) as Order[]) {
      if (remaining <= 0) break;
      const refundable = po.amount_minor - po.refunded_minor;   // the price only: the admin fee is not refunded on a dispute outcome
      const amt = Math.min(remaining, refundable);
      if (amt <= 0 || !po.payee_connected_account_id) continue;
      try {
        const custFee = Number(po.customer_fee_minor ?? 0);
        const { refund } = await refundMerchantCharge(deps, { account: po.payee_connected_account_id, paymentIntent: po.stripe_payment_intent!, amountMinor: amt, reason: "goodwill",
          idempotencyKey: `${ri.idempotency_key}:${po.reference}`, metadata: { payment_order: po.reference, dec107_basis: ri.basis, instruction: ri.id },
          mode: { rowLivemode: (po as { livemode?: boolean | null }).livemode, platformLive: stripeLive() },
          split: { sellerAmountMinor: po.amount_minor, sellerFeeMinor: Math.max(0, Number(po.application_fee_minor ?? po.platform_fee_minor) - custFee), customerFeeRefundMinor: 0 } });
        await db.from("payment_refunds").upsert({ stripe_refund_id: refund.id, stripe_account_id: po.payee_connected_account_id, payment_intent_id: po.stripe_payment_intent,
          source_type: `dec107_${ri.basis}`, source_ref: ri.id, amount_minor: amt, refund_application_fee: true, fee_policy: "dec107", reason_code: ri.basis,
          idempotency_key: `${ri.idempotency_key}:${po.reference}`, status: refund.status === "succeeded" ? "succeeded" : "pending" }, { onConflict: "idempotency_key" });
        remaining -= amt; refunded += amt;
      } catch (e) { error = (e as Error).message; break; }
    }
    // Capped at what is held: a default-rule claim larger than the payments refunds what there is (the rest stays a debt between the parties).
    const status = error ? "failed" : "done";
    await db.from("dec107_refund_instructions").update({ status, refunded_minor: refunded, error: error ?? (remaining > 0 ? `capped_at_held:${remaining}` : null), executed_at: error ? null : new Date().toISOString() }).eq("id", ri.id);
    if (error) errors.push(`refund instruction ${ri.id}: ${error}`); else done++;
  }
  return done;
}
