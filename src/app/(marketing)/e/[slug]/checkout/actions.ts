"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createMultiLineCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { computeBreakdown, generateOrderReference, type PriceLine } from "../pricing";

export interface CheckoutLineInput {
  ticketTypeId: string;
  quantity: number;
}

export interface BuyerDetailsInput {
  fullName: string;
  email: string;
  phone: string;
  marketingOptIn: boolean;
  billingAddressLine1: string;
  billingAddressLine2?: string;
  billingCity: string;
  billingRegion: string;
  billingPostalCode: string;
  billingCountry: string;
  deliveryMethod: "mobile" | "email";
  promoCode?: string;
  includeProtection: boolean;
}

/** Re-validate a promo code server-side. Never trust a client-computed discount. */
export async function applyPromoCode(input: {
  slug: string;
  code: string;
  lines: CheckoutLineInput[];
}): Promise<{ ok: boolean; discountCents?: number; error?: string }> {
  const admin = createAdminClient();
  const { data: page } = await admin
    .from("event_public_pages")
    .select("event_id, workspace_id")
    .eq("slug", input.slug)
    .eq("published", true)
    .maybeSingle();
  if (!page) return { ok: false, error: "Event not found." };

  const { data: promo } = await admin
    .from("ticket_promo_codes")
    .select("*")
    .eq("workspace_id", page.workspace_id)
    .ilike("code", input.code.trim())
    .eq("active", true)
    .maybeSingle();
  if (!promo) return { ok: false, error: "That code isn't valid." };
  if (promo.event_id && promo.event_id !== page.event_id) return { ok: false, error: "That code isn't valid for this event." };
  if (promo.starts_at && new Date(promo.starts_at) > new Date()) return { ok: false, error: "That code isn't active yet." };
  if (promo.ends_at && new Date(promo.ends_at) < new Date()) return { ok: false, error: "That code has expired." };
  if (promo.max_redemptions != null && promo.redeemed_count >= promo.max_redemptions) {
    return { ok: false, error: "That code has reached its usage limit." };
  }

  const { data: types } = await admin
    .from("ticket_types")
    .select("id, price_cents")
    .in("id", input.lines.map((l) => l.ticketTypeId));
  const priceById = new Map((types ?? []).map((t) => [t.id, t.price_cents]));
  const subtotalCents = input.lines.reduce((sum, l) => sum + (priceById.get(l.ticketTypeId) ?? 0) * l.quantity, 0);

  const discountCents = promo.percent_off
    ? Math.round((subtotalCents * promo.percent_off) / 100)
    : Math.min(promo.amount_off_cents ?? 0, subtotalCents);

  return { ok: true, discountCents };
}

export async function submitCheckout(
  slug: string,
  lines: CheckoutLineInput[],
  buyer: BuyerDetailsInput
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!stripeConfigured()) return { ok: false, error: "Payments aren't configured yet. Contact the organiser." };
  if (!lines.length) return { ok: false, error: "Your basket is empty." };
  if (!buyer.fullName.trim() || !buyer.email.trim()) return { ok: false, error: "Name and email are required." };

  const admin = createAdminClient();
  const { data: page } = await admin
    .from("event_public_pages")
    .select("event_id, workspace_id, headline")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!page) return { ok: false, error: "This event isn't open for sales." };

  // Re-fetch authoritative prices + inventory — never trust anything computed client-side.
  const { data: types } = await admin
    .from("ticket_types")
    .select("id, name, price_cents, currency, status, quantity, sold, event_id")
    .in("id", lines.map((l) => l.ticketTypeId));

  const priceLines: PriceLine[] = [];
  for (const l of lines) {
    const tt = (types ?? []).find((t) => t.id === l.ticketTypeId);
    if (!tt || tt.event_id !== page.event_id || tt.status !== "on_sale") {
      return { ok: false, error: "One of your tickets is no longer available." };
    }
    const qty = Math.max(1, Math.min(20, Math.floor(l.quantity)));
    if (tt.quantity != null && tt.sold + qty > tt.quantity) {
      return { ok: false, error: `Not enough "${tt.name}" tickets remaining.` };
    }
    priceLines.push({ ticketTypeId: tt.id, name: tt.name, unitPriceCents: tt.price_cents, quantity: qty });
  }
  if (!priceLines.length) return { ok: false, error: "Your basket is empty." };
  const currency = types?.[0]?.currency || "GBP";

  let discountCents = 0;
  let promoId: string | null = null;
  if (buyer.promoCode?.trim()) {
    const promoRes = await applyPromoCode({ slug, code: buyer.promoCode, lines });
    if (promoRes.ok) {
      discountCents = promoRes.discountCents ?? 0;
      const { data: promoRow } = await admin
        .from("ticket_promo_codes")
        .select("id")
        .eq("workspace_id", page.workspace_id)
        .ilike("code", buyer.promoCode.trim())
        .maybeSingle();
      promoId = promoRow?.id ?? null;
    }
  }

  const breakdown = computeBreakdown(priceLines, { discountCents, includeProtection: buyer.includeProtection });
  const orderReference = generateOrderReference();

  // Link to the buyer's customer account if they're logged in — optional, guest checkout unaffected.
  let customerId: string | null = null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: customer } = await supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle();
    customerId = customer?.id ?? null;
  }

  // One ticket_orders row per tier, all sharing order_reference + (later) the same stripe_session_id.
  const discountRatio = breakdown.subtotalCents > 0 ? breakdown.discountCents / breakdown.subtotalCents : 0;
  const orderIds: string[] = [];
  for (const l of priceLines) {
    const lineSubtotal = l.unitPriceCents * l.quantity;
    const lineAfterDiscount = Math.round(lineSubtotal * (1 - discountRatio));
    const { data: order } = await admin
      .from("ticket_orders")
      .insert({
        workspace_id: page.workspace_id,
        event_id: page.event_id,
        ticket_type_id: l.ticketTypeId,
        buyer_name: buyer.fullName.trim(),
        buyer_email: buyer.email.trim(),
        buyer_phone: buyer.phone.trim() || null,
        customer_id: customerId,
        billing_address: {
          line1: buyer.billingAddressLine1,
          line2: buyer.billingAddressLine2 || null,
          city: buyer.billingCity,
          region: buyer.billingRegion,
          postal_code: buyer.billingPostalCode,
          country: buyer.billingCountry,
        },
        delivery_method: buyer.deliveryMethod,
        marketing_opt_in: buyer.marketingOptIn,
        promo_code_id: promoId,
        discount_cents: Math.round(lineSubtotal * discountRatio),
        quantity: l.quantity,
        amount_cents: lineAfterDiscount,
        currency,
        status: "pending",
        order_reference: orderReference,
      })
      .select("id")
      .single();
    if (!order) return { ok: false, error: "Couldn't start checkout." };
    orderIds.push(order.id);
  }

  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const stripeLines = priceLines.map((l) => {
    const lineSubtotal = l.unitPriceCents * l.quantity;
    const lineAfterDiscount = Math.round(lineSubtotal * (1 - discountRatio));
    return { name: l.name, unitAmountCents: Math.round(lineAfterDiscount / l.quantity), quantity: l.quantity };
  });
  const feeCents = breakdown.bookingFeeCents + breakdown.serviceFeeCents + breakdown.protectionCents;
  if (feeCents > 0) stripeLines.push({ name: "Booking, service & protection fees", unitAmountCents: feeCents, quantity: 1 });

  const session = await createMultiLineCheckoutSession({
    lineItems: stripeLines,
    currency,
    customerEmail: buyer.email.trim(),
    successUrl: `${base}/e/${slug}/success?session_id={CHECKOUT_SESSION_ID}&ref=${orderReference}`,
    cancelUrl: `${base}/e/${slug}/checkout`,
    metadata: { order_reference: orderReference, event_id: page.event_id, workspace_id: page.workspace_id },
  });
  if (!session) return { ok: false, error: "Couldn't reach the payment provider." };

  await admin.from("ticket_orders").update({ stripe_session_id: session.id }).in("id", orderIds);
  return { ok: true, url: session.url };
}
