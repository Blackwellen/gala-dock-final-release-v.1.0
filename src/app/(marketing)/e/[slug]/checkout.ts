"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";

// V1.5 15-4: ticket checkout. Validates the ticket type (on-sale, published event), creates a
// pending ticket_order (service-role — the buyer is anon), opens a Stripe Checkout session, and
// returns its URL. Fulfilment (mark paid + increment sold) happens on the success return.
export async function createTicketCheckout(input: {
  slug: string;
  ticketTypeId: string;
  quantity: number;
  email: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!stripeConfigured()) return { ok: false, error: "Payments are not configured." };
  const qty = Math.max(1, Math.min(20, Math.floor(input.quantity || 1)));

  const admin = createAdminClient();
  const { data: tt } = await admin
    .from("ticket_types")
    .select("id, workspace_id, event_id, name, price_cents, currency, status, quantity, sold")
    .eq("id", input.ticketTypeId)
    .maybeSingle();
  if (!tt || tt.status !== "on_sale") return { ok: false, error: "Tickets aren't on sale." };

  // Confirm the event is published (gate the public purchase).
  const { data: pub } = await admin
    .from("event_public_pages")
    .select("id")
    .eq("event_id", tt.event_id)
    .eq("published", true)
    .maybeSingle();
  if (!pub) return { ok: false, error: "This event isn't open for sales." };

  if (tt.quantity != null && tt.sold + qty > tt.quantity) {
    return { ok: false, error: "Not enough tickets remaining." };
  }

  const amount = tt.price_cents * qty;
  const { data: order } = await admin
    .from("ticket_orders")
    .insert({
      workspace_id: tt.workspace_id,
      event_id: tt.event_id,
      ticket_type_id: tt.id,
      buyer_email: input.email.trim() || null,
      quantity: qty,
      amount_cents: amount,
      currency: tt.currency || "GBP",
      status: "pending",
    })
    .select("id")
    .single();
  if (!order) return { ok: false, error: "Couldn't start checkout." };

  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const session = await createCheckoutSession({
    productName: tt.name,
    unitAmountCents: tt.price_cents,
    currency: tt.currency || "GBP",
    quantity: qty,
    customerEmail: input.email.trim() || undefined,
    successUrl: `${base}/e/${input.slug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/e/${input.slug}`,
    metadata: { order_id: order.id },
  });
  if (!session) return { ok: false, error: "Couldn't reach the payment provider." };

  await admin.from("ticket_orders").update({ stripe_session_id: session.id }).eq("id", order.id);
  return { ok: true, url: session.url };
}
