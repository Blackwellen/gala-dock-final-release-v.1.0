import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { connectedDisputeLines } from "@/lib/payments/rules";

/** Subset of a Stripe Dispute object used by the platform (§44 card chargebacks). Stripe stays authoritative. */
export type StripeDispute = {
  id: string; amount: number; currency: string; charge?: string | null; payment_intent?: string | null; reason?: string | null;
  status: string; livemode?: boolean; is_charge_refundable?: boolean; evidence_details?: { due_by?: number | null; submission_count?: number } | null;
};

const CLOSED = new Set(["won", "lost", "warning_closed"]);

/**
 * Mirrors a chargeback into `stripe_disputes`, links it to the Gala Dock order through the payment ledger, opens a support case
 * the first time it is seen, and posts funds movements to the immutable ledger. Gala Dock never decides the outcome —
 * the card issuer does — so the record only reflects what Stripe reports.
 */
export async function syncStripeDispute(d: StripeDispute, eventType: string, account: string | null = null) {
  const db = untyped(createAdminClient() as never);
  const { data: existing } = await db.from("stripe_disputes").select("stripe_dispute_id,order_ref,event_id").eq("stripe_dispute_id", d.id).maybeSingle();
  let orderRef: string | null = existing?.order_ref ?? null, eventId: string | null = existing?.event_id ?? null, workspaceId: string | null = null;
  if (!existing && d.payment_intent) {
    const { data: tx } = await db.from("ledger_transactions").select("source_id,event_id,workspace_id").eq("stripe_ref", d.payment_intent).eq("source_type", "checkout_order").maybeSingle();
    orderRef = tx?.source_id ?? null; eventId = tx?.event_id ?? null; workspaceId = tx?.workspace_id ?? null;
  }
  // Direct charge (Q07): the dispute is on the seller's connected-account charge, so the seller is the merchant and bears it.
  let seller: string | null = null;
  if (account && d.payment_intent) {
    const { data: po } = await db.from("payment_orders").select("payee_workspace_id,event_id,reference").eq("stripe_payment_intent", d.payment_intent).eq("payee_connected_account_id", account).maybeSingle();
    const { data: co } = po ? { data: null } : await db.from("checkout_orders").select("seller_workspace_id,event_id,order_ref").eq("stripe_payment_intent", d.payment_intent).eq("connected_account_id", account).maybeSingle();
    seller = po?.payee_workspace_id ?? co?.seller_workspace_id ?? null;
    workspaceId = workspaceId ?? seller; eventId = eventId ?? po?.event_id ?? co?.event_id ?? null; orderRef = orderRef ?? co?.order_ref ?? null;
  }
  const dueBy = d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000).toISOString() : null;
  const { error } = await db.from("stripe_disputes").upsert({
    stripe_dispute_id: d.id, charge_id: d.charge ?? null, payment_intent_id: d.payment_intent ?? null, amount_minor: d.amount, currency: d.currency.toUpperCase(),
    reason: d.reason ?? null, status: d.status, evidence_due_by: dueBy, livemode: !!d.livemode, order_ref: orderRef, event_id: eventId,
    is_charge_refundable: d.is_charge_refundable ?? null, ...(account ? { stripe_account_id: account, liability: "connected_account" } : {}), outcome: CLOSED.has(d.status) ? d.status : null,
    evidence_submitted_at: (d.evidence_details?.submission_count ?? 0) > 0 ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_dispute_id" });
  if (error) throw new Error(`dispute: ${error.message}`);

  // Ticket orders (Q22/Q33): an open dispute moves the order to `chargeback` through the ticket_order machine, which raises a
  // review flag (never a ban); a won dispute returns it to `issued`. Idempotent per order + dispute, so webhook retries and
  // out-of-order events change nothing twice. Orders the machine can't move (e.g. already refunded) still get the flag.
  let ticket = false;
  if (orderRef) {
    const { data: td, error: te } = await db.rpc("ticket_order_dispute", { p_ref: orderRef, p_dispute: d.id, p_status: d.status });
    if (te) throw new Error(`ticket_dispute: ${te.message}`);
    ticket = !!(td as { ticket?: boolean } | null)?.ticket;
  }
  // Marketplace / invoice disputes go to the unified risk queue (Q33) — review only, never an automatic action. Ticket orders
  // arrive there through their chargeback flag. Idempotent per dispute id.
  if (!ticket && !CLOSED.has(d.status)) {
    const { error: re } = await db.rpc("risk_raise", { p_domain: "payment", p_kind: "chargeback", p_subject_type: "order", p_subject_id: orderRef ?? d.payment_intent ?? d.id,
      p_severity: "review", p_dedupe: `dispute:${d.id}`, p_evidence: { dispute: d.id, reason: d.reason ?? null, amount_minor: d.amount, liability: account ? "connected_account" : "platform" },
      p_workspace: workspaceId ?? seller, p_event: eventId, p_score: 60, p_source: "webhook", p_rule: "payment.chargeback" });
    if (re) throw new Error(`risk: ${re.message}`);
  }

  if (!existing) {
    await db.from("support_cases").insert({
      reference: `SC-${d.id.slice(-6).toUpperCase()}`, subject: `Card dispute ${d.reason ?? ""} — ${(d.amount / 100).toFixed(2)} ${d.currency.toUpperCase()}`.trim(),
      category: "payment", priority: "high", status: "open", workspace_id: workspaceId, amount: d.amount / 100,
      sla_due_at: dueBy ? new Date(Date.parse(dueBy) - 2 * 864e5).toISOString() : null,
      related: { stripe_dispute_id: d.id, order_ref: orderRef, event_id: eventId, payment_intent: d.payment_intent ?? null },
    });
  }

  // Funds movements: Stripe debits the disputed amount, and credits it back if the dispute is won.
  if ((eventType === "charge.dispute.funds_withdrawn" || eventType === "charge.dispute.funds_reinstated") && account) {
    if (!seller) throw new Error("dispute_seller_unknown"); // retried until the charge is recorded (order tolerance)
    const out = eventType.endsWith("withdrawn");
    const { error: le } = await db.rpc("post_memo_ledger_transaction", {
      p_idempotency_key: `stripe:dispute:${account}:${d.id}:${out ? "withdrawn" : "reinstated"}`, p_kind: out ? "dispute" : "reversal", p_currency: d.currency.toUpperCase(),
      p_lines: connectedDisputeLines({ amountMinor: d.amount, seller, withdrawn: out }), p_basis: "direct_charge_memo",
      p_workspace: seller, p_event: eventId, p_source_type: "stripe_dispute", p_source_id: d.id,
      p_description: `Card dispute ${d.id} on seller charge — funds ${out ? "withdrawn" : "reinstated"} by Stripe`, p_stripe_ref: d.charge ?? d.id, p_actor_type: "webhook",
    });
    if (le) throw new Error(`ledger: ${le.message}`);
  } else if (eventType === "charge.dispute.funds_withdrawn" || eventType === "charge.dispute.funds_reinstated") {
    // Legacy platform charge (pre-Q07): the platform was merchant of record.
    const out = eventType.endsWith("withdrawn");
    const { error: le } = await db.rpc("post_ledger_transaction", {
      p_idempotency_key: `stripe:dispute:${d.id}:${out ? "withdrawn" : "reinstated"}`, p_kind: out ? "dispute" : "reversal",
      p_currency: d.currency.toUpperCase(),
      p_lines: [{ account: "disputes", amount_minor: out ? d.amount : -d.amount, party_type: "platform" }, { account: "cash_stripe", amount_minor: out ? -d.amount : d.amount, party_type: "platform" }],
      p_workspace: workspaceId, p_event: eventId, p_source_type: "stripe_dispute", p_source_id: d.id,
      p_description: `Card dispute ${d.id} funds ${out ? "withdrawn" : "reinstated"}`, p_stripe_ref: d.charge ?? d.id, p_actor_type: "webhook",
    });
    if (le) throw new Error(`ledger: ${le.message}`);
  }
}
