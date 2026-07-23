"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession, stripeConfigured, createTransfer } from "@/lib/stripe";

const DEFAULT_SUPPLIER_COMMISSION_BPS = 500; // 5%
const DEFAULT_BUYER_ADMIN_FEE_BPS = 100; // 1%

// Guest-usable — mirrors the guest ticket checkout pattern in (marketing)/e/[slug]/checkout.ts:
// no auth.uid() to key RLS off for an anonymous builder, so mutations go through the service-role
// admin client from server actions. A logged-in customer's board is still linked (customer_id) so
// it shows up in their dashboard, but access to a specific draft is by its unguessable id — same
// trust model as every other guest/token flow in this codebase (proposal links, portal tokens).

export async function startBuild(formData: FormData) {
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let customerId: string | null = null;
  if (user) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    customerId = customer?.id ?? null;
  }

  const eventType = String(formData.get("eventType") ?? "other");
  const eventDate = String(formData.get("eventDate") ?? "") || null;
  const guestCount = Number(formData.get("guestCount") ?? 0) || null;
  const budgetPounds = Number(formData.get("budget") ?? 0);
  const postcode = String(formData.get("postcode") ?? "").trim() || null;

  const { data: event, error } = await admin
    .from("marketplace_events")
    .insert({
      customer_id: customerId,
      event_type: eventType,
      event_date: eventDate,
      guest_count: guestCount,
      budget_cents: budgetPounds > 0 ? Math.round(budgetPounds * 100) : null,
      postcode,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !event) throw new Error("Couldn't start your event. Please try again.");

  redirect(`/build/${event.id}`);
}

export async function addItem(eventId: string, listingId: string) {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("marketplace_events")
    .select("id, status")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || event.status !== "draft") throw new Error("This event can no longer be edited.");

  const { data: listing } = await admin
    .from("marketplace_listings")
    .select("id, price_from_cents, status")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.status !== "live") throw new Error("This listing is no longer available.");

  const { error } = await admin.from("marketplace_event_items").insert({
    marketplace_event_id: eventId,
    listing_id: listingId,
    price_cents: listing.price_from_cents,
  });
  if (error) throw new Error(error.message);
}

export async function removeItem(eventId: string, itemId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("marketplace_event_items")
    .delete()
    .eq("id", itemId)
    .eq("marketplace_event_id", eventId);
  if (error) throw new Error(error.message);
}

export async function checkoutBoard(eventId: string, contactEmail: string) {
  if (!stripeConfigured()) throw new Error("Payments are not configured yet.");

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("marketplace_events")
    .select("id, status, event_type")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || event.status !== "draft") throw new Error("This event can no longer be checked out.");

  const { data: items } = await admin
    .from("marketplace_event_items")
    .select("id, listing_id, price_cents")
    .eq("marketplace_event_id", eventId);
  if (!items || items.length === 0) throw new Error("Add at least one supplier before checking out.");

  // Snapshot each listing's owning workspace commission/fee override (default 5%/1%) so the total
  // charged matches what marketplace_bookings will compute after payment.
  const listingIds = items.map((i) => i.listing_id);
  const { data: listings } = await admin
    .from("marketplace_listings")
    .select("id, workspace_id, title")
    .in("id", listingIds);
  const workspaceIds = [...new Set((listings ?? []).map((l) => l.workspace_id))];
  const { data: workspaces } = await admin
    .from("workspaces")
    .select("id, marketplace_admin_fee_bps")
    .in("id", workspaceIds);
  const feeByWorkspace = new Map((workspaces ?? []).map((w) => [w.id, w.marketplace_admin_fee_bps ?? DEFAULT_BUYER_ADMIN_FEE_BPS]));
  const workspaceByListing = new Map((listings ?? []).map((l) => [l.id, l.workspace_id]));

  let buyerTotalCents = 0;
  for (const item of items) {
    const feeBps = feeByWorkspace.get(workspaceByListing.get(item.listing_id) ?? "") ?? DEFAULT_BUYER_ADMIN_FEE_BPS;
    buyerTotalCents += item.price_cents + Math.round((item.price_cents * feeBps) / 10000);
  }

  await admin.from("marketplace_events").update({ guest_email: contactEmail.trim() || null }).eq("id", eventId);

  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const session = await createCheckoutSession({
    productName: `Your event (${event.event_type.replace(/_/g, " ")}) — ${items.length} supplier${items.length > 1 ? "s" : ""}`,
    unitAmountCents: buyerTotalCents,
    currency: "GBP",
    quantity: 1,
    customerEmail: contactEmail.trim() || undefined,
    successUrl: `${base}/build/${eventId}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/build/${eventId}`,
    metadata: { marketplace_event_id: eventId },
  });
  if (!session) throw new Error("Couldn't reach the payment provider.");

  await admin.from("marketplace_events").update({ stripe_session_id: session.id }).eq("id", eventId);
  redirect(session.url);
}

/** Called from the success page after Stripe confirms payment. Idempotent — safe to call twice. */
export async function fulfilBoard(eventId: string): Promise<{ confirmed: boolean }> {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from("marketplace_events")
    .select("id, status, customer_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { confirmed: false };
  if (event.status === "checked_out") return { confirmed: true };
  if (event.status !== "draft") return { confirmed: false };

  const { data: items } = await admin
    .from("marketplace_event_items")
    .select("id, listing_id, price_cents")
    .eq("marketplace_event_id", eventId);
  if (!items || items.length === 0) return { confirmed: false };

  const { data: listings } = await admin
    .from("marketplace_listings")
    .select("id, workspace_id")
    .in("id", items.map((i) => i.listing_id));
  const { data: workspaces } = await admin
    .from("workspaces")
    .select("id, marketplace_admin_fee_bps, marketplace_commission_bps, stripe_connect_account_id, stripe_connect_payouts_enabled")
    .in("id", [...new Set((listings ?? []).map((l) => l.workspace_id))]);
  const wsById = new Map((workspaces ?? []).map((w) => [w.id, w]));
  const workspaceByListing = new Map((listings ?? []).map((l) => [l.id, l.workspace_id]));

  for (const item of items) {
    const workspaceId = workspaceByListing.get(item.listing_id);
    const ws = workspaceId ? wsById.get(workspaceId) : null;
    const supplierCommissionBps = ws?.marketplace_commission_bps ?? DEFAULT_SUPPLIER_COMMISSION_BPS;
    const buyerAdminFeeBps = ws?.marketplace_admin_fee_bps ?? DEFAULT_BUYER_ADMIN_FEE_BPS;

    const { data: booking } = await admin
      .from("marketplace_bookings")
      .insert({
        listing_id: item.listing_id,
        supplier_workspace_id: workspaceId!,
        buyer_customer_id: event.customer_id,
        marketplace_event_id: eventId,
        booking_date: new Date().toISOString().slice(0, 10),
        price_cents: item.price_cents,
        supplier_commission_bps: supplierCommissionBps,
        buyer_admin_fee_bps: buyerAdminFeeBps,
        status: "confirmed",
      })
      .select("id, supplier_payout_cents, currency")
      .single();

    if (booking) {
      await admin.from("marketplace_event_items").update({ booking_id: booking.id }).eq("id", item.id);

      // Attempt an immediate transfer if the supplier has finished Connect onboarding; otherwise
      // the payout stays pending for a manual "release payout" step once they connect.
      if (ws?.stripe_connect_account_id && ws.stripe_connect_payouts_enabled) {
        const transfer = await createTransfer({
          amountCents: booking.supplier_payout_cents,
          currency: booking.currency,
          destinationAccountId: ws.stripe_connect_account_id,
          metadata: { marketplace_booking_id: booking.id },
        });
        if (transfer) {
          await admin.from("marketplace_bookings").update({ stripe_transfer_id: transfer.id }).eq("id", booking.id);
        }
      }
    }
  }

  await admin.from("marketplace_events").update({ status: "checked_out" }).eq("id", eventId);
  return { confirmed: true };
}
