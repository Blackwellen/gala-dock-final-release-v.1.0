import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { stripeLive } from "@/lib/stripe";
import { paymentDeps } from "@/lib/payments/server";
import { connectedMerchantStripe, platformFeeStripe } from "@/lib/payments/stripe-client";
import { refundedForTag, refundKey, refundMerchantCharge } from "@/lib/payments/service";
import { capGroupToAvailable, disputedMinor, planReleaseGroups, type DueRelease, type ChargeNet } from "@/lib/payments/releases-core";
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
      // Open disputes AND lost ones: Stripe withdrew the disputed amount from this charge's money and (when lost) never gives it back.
      // Q58: counting only open disputes paid a lost chargeback's amount out again from the seller's other money.
      const { data: disputed } = await db.from("stripe_disputes").select("amount_minor,outcome").eq("payment_intent_id", r.payment_intent);
      const open = disputedMinor((disputed ?? []) as { amount_minor: number; outcome: string | null }[]);
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
        let pay = g, shortfall = 0;
        if (avail < g.payoutMinor) {
          // Covered liability: a chargeback/refund already debited this seller's balance. Pay what is there; the shortfall is the
          // seller's own liability recovered from these releases (never platform money, never an overdraft).
          const capped = capGroupToAvailable(g, Math.max(0, avail));
          pay = capped.group; shortfall = capped.shortfallMinor; out.waiting += shortfall > 0 ? 1 : 0;
          // A negative balance means the seller's own money no longer covers it: open ONE liability per account (later releases first,
          // else staff decide). Q58: this ran on every cron tick while the balance stayed short, stacking duplicate liabilities.
          if (avail < 0) await openNegativeBalanceLiability(db, g, -avail, live);
          // Nothing payable: wait. Q58: nothing is "recovered" and nobody is notified until money actually moves.
          if (pay.payoutMinor <= 0) { await db.rpc("dec107_release_failed", { p_ids: ids, p_error: `waiting_for_available_balance:${avail}<${g.payoutMinor}` }); continue; }
        }
        const p = await merchant.payout(g.account, { amountMinor: pay.payoutMinor, currency: g.currency, description: g.description,
          metadata: { gd_release_group: group, event_id: g.eventId ?? "", releases: String(ids.length), trigger: g.trigger } }, `release:${group}`);
        payoutId = p.id; paidItems = pay.items;
        out.payouts++;
        if (shortfall > 0) {
          // Owner 2026-11-11: the seller carries chargebacks; what its balance, reserve and later releases can't cover falls to Gala
          // Dock (platform-managed fallback). Recorded once, after the reduced payout was actually made (Q58: not before, and not per tick).
          const cur = g.currency === "GBP" ? "£" : `${g.currency} `;
          const { error: le } = await db.from("dec107_covered_liabilities").insert({ workspace_id: g.workspaceId, stripe_account_id: g.account, event_id: g.eventId, amount_minor: shortfall,
            recovered_minor: shortfall, status: "recovered", reason: "recovered_from_release", resolved_at: new Date().toISOString(), livemode: live });
          if (le) out.errors.push(`${g.key}: covered liability not recorded: ${le.message}`);
          await db.from("audit_events").insert({ actor_type: "system", workspace_id: g.workspaceId, event: "payout.covered_liability",
            metadata: { account: g.account, event_id: g.eventId, due_minor: g.payoutMinor, paid_minor: pay.payoutMinor, available_minor: avail, shortfall_minor: shortfall, payout: p.id } });
          await db.rpc("notify_workspace", { p_ws: g.workspaceId, p_roles: ["owner", "manager", "finance"], p_kind: "payout_shortfall", p_title: "Payout reduced by a chargeback or refund",
            p_body: `${cur}${(shortfall / 100).toFixed(2)} of this release was used to cover a chargeback or refund already taken from your Stripe balance. If you win the chargeback, the money comes back to your Stripe balance.`, p_link: "/provider/money" });
        }
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

/** One open negative-balance liability per seller account and mode; a deeper negative balance raises its amount, never adds a row. */
async function openNegativeBalanceLiability(db: ReturnType<typeof untyped>, g: { workspaceId: string; account: string; eventId: string | null }, amountMinor: number, live: boolean) {
  const { data: open } = await db.from("dec107_covered_liabilities").select("id,amount_minor").eq("stripe_account_id", g.account).eq("livemode", live)
    .eq("reason", "negative_seller_balance").eq("status", "recovering").limit(1).maybeSingle();
  if (open) {
    if (amountMinor > Number((open as { amount_minor: number }).amount_minor)) await db.from("dec107_covered_liabilities").update({ amount_minor: amountMinor }).eq("id", (open as { id: string }).id);
    return;
  }
  await db.from("dec107_covered_liabilities").insert({ workspace_id: g.workspaceId, stripe_account_id: g.account, event_id: g.eventId, amount_minor: amountMinor, reason: "negative_seller_balance", livemode: live });
  await db.from("audit_events").insert({ actor_type: "system", workspace_id: g.workspaceId, event: "payout.negative_balance_liability", metadata: { account: g.account, amount_minor: amountMinor } });
}

/** Agreed refunds on the seller's charge (DEC-107: the admin fee is kept; the seller fee on the refunded part goes back). */
async function processRefundInstructions(errors: string[]) {
  const db = untyped(createAdminClient() as never);
  const deps = paymentDeps(db);
  if (!deps) return 0;
  // Q58: atomic claim (FOR UPDATE SKIP LOCKED); due rows, failed ones after an hour, and 'processing' rows a crashed run left (15 min).
  const { data, error: claimError } = await db.rpc("claim_dec107_refund_instructions", { p_limit: 20 });
  if (claimError) { errors.push(`refund instructions claim: ${claimError.message}`); return 0; }
  let done = 0;
  for (const ri of (data ?? []) as { id: string; basis: string; build_item_id: string; amount_minor: number; refunded_minor: number; idempotency_key: string; refund_attempt?: number }[]) {
    const { data: orders } = await db.from("payment_orders").select("*").eq("build_item_id", ri.build_item_id).eq("strategy", "direct").not("stripe_payment_intent", "is", null).order("created_at", { ascending: false });
    const list = ((orders ?? []) as Order[]).filter(po => !!po.payee_connected_account_id);
    let refunded = Number(ri.refunded_minor), error: string | null = null;
    // Crash-safe re-run: what Stripe already refunded for this instruction (metadata.instruction, failed refunds excluded) is the truth.
    try {
      let onStripe = 0;
      for (const po of list) onStripe += await refundedForTag(deps, po.payee_connected_account_id!, po.stripe_payment_intent!, "instruction", ri.id);
      refunded = onStripe;
    } catch (e) { error = (e as Error).message; }
    let remaining = error ? 0 : Number(ri.amount_minor) - refunded;
    for (const po of list) {
      if (remaining <= 0 || error) break;
      const refundable = po.amount_minor - po.refunded_minor;   // the price only: the admin fee is not refunded on a dispute outcome
      const amt = Math.min(remaining, refundable);
      if (amt <= 0) continue;
      try {
        const custFee = Number(po.customer_fee_minor ?? 0);
        const key = refundKey(`${ri.idempotency_key}:${po.reference}`, ri.refund_attempt);
        const { refund, feeRefund } = await refundMerchantCharge(deps, { account: po.payee_connected_account_id!, paymentIntent: po.stripe_payment_intent!, amountMinor: amt, reason: "goodwill",
          idempotencyKey: key, metadata: { payment_order: po.reference, dec107_basis: ri.basis, instruction: ri.id },
          mode: { rowLivemode: (po as { livemode?: boolean | null }).livemode, platformLive: stripeLive() },
          split: { sellerAmountMinor: po.amount_minor, sellerFeeMinor: Math.max(0, Number(po.application_fee_minor ?? po.platform_fee_minor) - custFee), customerFeeRefundMinor: 0 } });
        if (refund.status === "failed" || refund.status === "canceled") throw new Error(`stripe_refund_${refund.status}`);
        // Q58: this row used to violate payment_refunds' CHECKs (source_type dec107_*, fee_policy dec107) and the error was ignored.
        const { error: re } = await db.from("payment_refunds").upsert({ stripe_refund_id: refund.id, stripe_account_id: po.payee_connected_account_id, payment_intent_id: po.stripe_payment_intent,
          source_type: `dec107_${ri.basis}`, source_ref: ri.id, amount_minor: amt, refund_application_fee: !!feeRefund, fee_policy: "dec107", reason_code: ri.basis,
          idempotency_key: key, status: refund.status === "succeeded" ? "succeeded" : "pending", livemode: stripeLive() }, { onConflict: "idempotency_key" });
        if (re) errors.push(`refund row ${ri.id}: ${re.message}`);
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
