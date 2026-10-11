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
  const { data } = await db.rpc("claim_ticket_refunds", { p_limit: limit });
  let refunded = 0, failed = 0;
  for (const o of (data ?? []) as { order_ref: string; stripe_session: string | null; amount: number; fee: number; event_id: string; buyer_id: string }[]) {
    try {
      if (!o.stripe_session) throw new Error("no_payment_record");
      const s = await stripe<{ payment_intent: string | null; amount_total: number }>(`checkout/sessions/${o.stripe_session}`);
      if (!s.payment_intent) throw new Error("no_payment_intent");
      const r = await stripe<{ id: string; status: string; amount: number }>("refunds", { payment_intent: s.payment_intent, reason: "requested_by_customer", "metadata[order_ref]": o.order_ref, "metadata[reason]": "event_cancelled" },
        { idempotencyKey: `ticket-refund:${o.order_ref}` });
      await db.from("checkout_orders").update({ refund_status: "refunded", status: "refunded", refunded_at: new Date().toISOString(), refund_error: null, updated_at: new Date().toISOString() }).eq("order_ref", o.order_ref);
      await db.from("tickets").update({ status: "refunded" }).eq("order_ref", o.order_ref).in("status", ["cancelled", "valid"]);
      const { data: ev } = await db.from("events").select("workspace_id").eq("id", o.event_id).single();
      await db.from("audit_events").insert({ actor_type: "system", workspace_id: (ev as { workspace_id: string } | null)?.workspace_id ?? null, event: "ticket.refunded",
        metadata: { order_ref: o.order_ref, refund_id: r.id, amount_minor: r.amount, reason: "event_cancelled" } });
      refunded++;
    } catch (e) {
      failed++;
      await db.from("checkout_orders").update({ refund_status: "failed", refund_error: (e as Error).message.slice(0, 200), updated_at: new Date().toISOString() }).eq("order_ref", o.order_ref);
    }
  }
  return { refunded, failed };
}
