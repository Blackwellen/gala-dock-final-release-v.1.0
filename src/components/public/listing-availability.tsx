import "@/styles/public-availability.css";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityCalendar, type PublicAvailability } from "./listing-availability-client";

/** London calendar day as YYYY-MM-DD, offset by `add` days. */
export function londonDay(add = 0) {
  const t = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }) + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + add);
  return t.toISOString().slice(0, 10);
}

/**
 * Public free/busy calendar for a venue or service page (migration 202610294080, public_listing_availability).
 * Renders nothing unless the provider opted in (details.public_availability) and the listing is published: the RPC returns null otherwise.
 * Day statuses only (free / limited / booked / closed) for today + 119 days; dates are always confirmed on request.
 */
export async function ListingAvailability({ listingId, kind, name }: { listingId: string; kind: "venue" | "service"; name: string }) {
  const sb = await createClient();
  const { data, error } = await sb.rpc("public_listing_availability", { p_listing: listingId, p_from: londonDay(), p_to: londonDay(119) });
  const a = (error ? null : data) as PublicAvailability | null;
  if (!a || !Array.isArray(a.days) || a.days.length === 0) return null;
  return <section id="availability" className="pl3-row la" aria-labelledby="la-h">
    <div className="k-between la-head"><h2 id="la-h">Availability</h2><span className="k-small">Next {Math.round(a.days.length / 30)} months</span></div>
    <AvailabilityCalendar initial={a} listingId={listingId} kind={kind} name={name} />
  </section>;
}
