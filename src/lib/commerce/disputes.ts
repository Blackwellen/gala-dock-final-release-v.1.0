import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";

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
export async function syncStripeDispute(d: StripeDispute, eventType: string) {
  const db = untyped(createAdminClient() as never);
  const { data: existing } = await db.from("stripe_disputes").select("stripe_dispute_id,order_ref,event_id").eq("stripe_dispute_id", d.id).maybeSingle();
  let orderRef: string | null = existing?.order_ref ?? null, eventId: string | null = existing?.event_id ?? null, workspaceId: string | null = null;
  if (!existing && d.payment_intent) {
    const { data: tx } = await db.from("ledger_transactions").select("source_id,event_id,workspace_id").eq("stripe_ref", d.payment_intent).eq("source_type", "checkout_order").maybeSingle();
    orderRef = tx?.source_id ?? null; eventId = tx?.event_id ?? null; workspaceId = tx?.workspace_id ?? null;
  }
  const dueBy = d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000).toISOString() : null;
  const { error } = await db.from("stripe_disputes").upsert({
    stripe_dispute_id: d.id, charge_id: d.charge ?? null, payment_intent_id: d.payment_intent ?? null, amount_minor: d.amount, currency: d.currency.toUpperCase(),
    reason: d.reason ?? null, status: d.status, evidence_due_by: dueBy, livemode: !!d.livemode, order_ref: orderRef, event_id: eventId,
    is_charge_refundable: d.is_charge_refundable ?? null, outcome: CLOSED.has(d.status) ? d.status : null,
    evidence_submitted_at: (d.evidence_details?.submission_count ?? 0) > 0 ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_dispute_id" });
  if (error) throw new Error(`dispute: ${error.message}`);

  if (!existing) {
    await db.from("support_cases").insert({
      reference: `SC-${d.id.slice(-6).toUpperCase()}`, subject: `Card dispute ${d.reason ?? ""} — ${(d.amount / 100).toFixed(2)} ${d.currency.toUpperCase()}`.trim(),
      category: "payment", priority: "high", status: "open", workspace_id: workspaceId, amount: d.amount / 100,
      sla_due_at: dueBy ? new Date(Date.parse(dueBy) - 2 * 864e5).toISOString() : null,
      related: { stripe_dispute_id: d.id, order_ref: orderRef, event_id: eventId, payment_intent: d.payment_intent ?? null },
    });
  }

  // Funds movements: Stripe debits the disputed amount, and credits it back if the dispute is won.
  if (eventType === "charge.dispute.funds_withdrawn" || eventType === "charge.dispute.funds_reinstated") {
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
