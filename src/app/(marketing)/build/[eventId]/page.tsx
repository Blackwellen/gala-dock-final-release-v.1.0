import { notFound } from "next/navigation";
import { Plus, X, MapPin } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { MARKETPLACE_CATEGORIES, categoryLabel } from "@/app/event-manager/marketplace/categories";
import { addItem, removeItem } from "../actions";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function BuildBoardPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("marketplace_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) notFound();

  const { data: items } = await admin
    .from("marketplace_event_items")
    .select("id, listing_id, price_cents")
    .eq("marketplace_event_id", eventId);
  const cartItems = items ?? [];
  const cartListingIds = new Set(cartItems.map((i) => i.listing_id));

  const { data: listings } = await admin
    .from("marketplace_listings")
    .select("id, title, category, price_from_cents, price_unit, currency, coverage_regions")
    .eq("status", "live")
    .order("category");
  const list = listings ?? [];

  const listingById = new Map(list.map((l) => [l.id, l]));
  const total = cartItems.reduce((sum, i) => sum + i.price_cents, 0);
  const budget = event.budget_cents ?? 0;
  const overBudget = budget > 0 && total > budget;

  function fmt(cents: number) {
    return (cents / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
  }

  const isCheckedOut = event.status === "checked_out";

  return (
    <div className="bg-surface-50 min-h-[calc(100vh-64px)] pb-32">
      <header className="bg-[#0e0c27] text-white">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <h1 className="text-2xl font-bold tracking-tight capitalize">
            {event.event_type.replace(/_/g, " ")}
          </h1>
          <p className="mt-1 text-white/70 text-sm">
            {event.event_date ? new Date(event.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Date TBC"}
            {event.guest_count ? ` · ${event.guest_count} guests` : ""}
            {event.postcode ? ` · ${event.postcode}` : ""}
          </p>
        </div>
      </header>

      {isCheckedOut ? (
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <h2 className="text-xl font-semibold text-surface-900">This event is already booked</h2>
          <p className="mt-2 text-sm text-surface-500">All suppliers have been confirmed and paid.</p>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
          {MARKETPLACE_CATEGORIES.map((cat) => {
            const catListings = list.filter((l) => l.category === cat.value);
            if (catListings.length === 0) return null;
            return (
              <section key={cat.value}>
                <h2 className="text-sm font-semibold text-surface-900 mb-3">{cat.label}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catListings.map((l) => {
                    const inCart = cartListingIds.has(l.id);
                    const suffix = l.price_unit === "per_hour" ? "/hr" : l.price_unit === "per_head" ? "/head" : l.price_unit === "per_day" ? "/day" : "";
                    return (
                      <div key={l.id} className="rounded-xl border border-surface-200 bg-white p-4">
                        <h3 className="text-sm font-semibold text-surface-900">{l.title}</h3>
                        <p className="mt-1 text-sm text-surface-600">
                          From {fmt(l.price_from_cents)}{suffix}
                        </p>
                        {l.coverage_regions.length > 0 && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-surface-400">
                            <MapPin className="w-3 h-3" /> {l.coverage_regions.slice(0, 2).join(", ")}
                          </p>
                        )}
                        {inCart ? (
                          <form action={removeItem.bind(null, eventId, cartItems.find((i) => i.listing_id === l.id)!.id)}>
                            <button
                              type="submit"
                              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-danger-200 text-danger-600 text-xs font-medium hover:bg-danger-50 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          </form>
                        ) : (
                          <form action={addItem.bind(null, eventId, l.id)}>
                            <button
                              type="submit"
                              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {list.length === 0 && (
            <div className="rounded-xl border border-surface-200 bg-white p-10 text-center text-surface-500">
              No suppliers are listed yet — check back soon.
            </div>
          )}
        </div>
      )}

      {!isCheckedOut && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-surface-200 shadow-lg">
          <div className="mx-auto max-w-5xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-surface-500">
                {cartItems.length} supplier{cartItems.length === 1 ? "" : "s"} added
                {budget > 0 && ` · Budget ${fmt(budget)}`}
              </p>
              <p className={`text-lg font-semibold ${overBudget ? "text-danger-600" : "text-surface-900"}`}>
                {fmt(total)}
              </p>
            </div>
            <CheckoutForm eventId={eventId} disabled={cartItems.length === 0} guestEmail={event.guest_email} />
          </div>
        </div>
      )}
    </div>
  );
}
