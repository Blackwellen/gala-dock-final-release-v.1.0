import { COUNTRIES } from "@/lib/master-data";
import { CONNECT_COPY, unsupportedWorkspaceCountry } from "@/lib/payments/connect-countries";

/**
 * Q49 connect-country rule in the provider wizards: a workspace whose business country can't take payments through Gala Dock
 * keeps every listing and package enquiry-only (the DB trigger enforce_seller_country_booking_mode rewrites booking_mode). The
 * wizards used to offer Instant/Request anyway and report "saved" while the trigger silently flipped the mode back.
 * Returns the country's name when it is set and unsupported, else null.
 */
export const enquiryOnlyCountry = (settings: unknown): string | null => unsupportedWorkspaceCountry(settings, COUNTRIES);

/** The booking mode a wizard may actually save, and the copy to show when it was forced to enquiry-only. */
export function sellerBookingMode(settings: unknown, wanted: string): { mode: string; note: string | null } {
  const country = enquiryOnlyCountry(settings);
  if (!country || wanted === "enquiry") return { mode: wanted, note: null };
  return { mode: "enquiry", note: CONNECT_COPY.listingFallback };
}
