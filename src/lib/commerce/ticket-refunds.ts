import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { stripe } from "@/lib/stripe";

/**
 * Executes queued ticket-order refunds (event cancellation). Full amount incl. booking fee, to the original payment method,
 * idempotent per order (`ticket-refund:<order_ref>`), so a retry or a concurrent worker can never refund twice.
 */
export async function processTicketRefunds(limit = 25) {
  const db = untyped(createAdminClient() as never);
  const { data, error: claimError } = await db.rpc("claim_ticket_refunds", { p_limit: limit });
  if (claimError) throw new Error("Could not claim ticket refunds.");
  let refunded = 0, failed = 0, pending = 0;
  for (const o of (data ?? []) as { order_ref: string; stripe_session: string | null; stripe_refund_id: string | null; refund_reason: string | null; amount: number; fee: number; event_id: string; buyer_id: string }[]) {
    try {
      if (!o.stripe_session) throw new Error("no_payment_record");
      const s = await stripe<{ payment_intent: string | null; amount_total: number }>(`checkout/sessions/${o.stripe_session}`);
      if (!s.payment_intent) throw new Error("no_payment_intent");
      type Refund = { id: string; status: string; amount: number };
      const r = o.stripe_refund_id ? await stripe<Refund>(`refunds/${o.stripe_refund_id}`) : await stripe<Refund>("refunds", { payment_intent: s.payment_intent, reason: "requested_by_customer", "metadata[order_ref]": o.order_ref, "metadata[reason]": o.refund_reason ?? "event_cancelled" },
        { idempotencyKey: `ticket-refund:${o.order_ref}` });
      const saved = await db.from("checkout_orders").update({ stripe_refund_id: r.id, updated_at: new Date().toISOString() }).eq("order_ref", o.order_ref);
      if (saved.error) throw new Error("Could not record the Stripe refund.");
      if (["failed", "canceled"].includes(r.status)) throw new Error(`stripe_refund_${r.status}`);
      if (r.status !== "succeeded") { pending++; continue; }
      const completed = await db.from("checkout_orders").update({ refund_status: "refunded", status: "refunded", refunded_at: new Date().toISOString(), refund_error: null, updated_at: new Date().toISOString() }).eq("order_ref", o.order_ref);
      if (completed.error) throw new Error("Could not record the completed refund.");
      const tickets = await db.from("tickets").update({ status: "refunded" }).eq("order_ref", o.order_ref).in("status", ["cancelled", "valid"]);
      if (tickets.error) throw new Error("Could not update refunded tickets.");
      const { data: ev } = await db.from("events").select("workspace_id").eq("id", o.event_id).single();
      await db.from("audit_events").insert({ actor_type: "system", workspace_id: (ev as { workspace_id: string } | null)?.workspace_id ?? null, event: "ticket.refunded",
        metadata: { order_ref: o.order_ref, refund_id: r.id, amount_minor: r.amount, reason: o.refund_reason ?? "event_cancelled" } });
      refunded++;
    } catch (e) {
      failed++;
      await db.from("checkout_orders").update({ refund_status: "failed", refund_error: (e as Error).message.slice(0, 200), updated_at: new Date().toISOString() }).eq("order_ref", o.order_ref);
    }
  }
  return { refunded, failed, pending };
}
