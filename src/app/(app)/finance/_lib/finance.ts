import type { QuoteStatus, InvoiceStatus } from "@/lib/supabase/types";

/**
 * Shared helpers for the Finance module. Maps schema enum values to the badge
 * statuses supported by `StatusBadge`, plus small money/date utilities used
 * across the live Finance surfaces.
 */

// StatusBadge supports a fixed union; map the richer quote_status enum onto it.
export function quoteBadgeStatus(
  status: QuoteStatus
):
  | "draft"
  | "sent"
  | "viewed"
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled" {
  switch (status) {
    case "draft":
      return "draft";
    case "rfp_sent":
      return "sent";
    case "viewed":
      return "viewed";
    case "received":
    case "revised":
    case "changes_requested":
      return "pending";
    case "accepted":
      return "accepted";
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    case "withdrawn":
      return "cancelled";
    default:
      return "draft";
  }
}

// invoice_status values all map 1:1 onto StatusBadge-supported statuses.
export function invoiceBadgeStatus(
  status: InvoiceStatus
): "draft" | "sent" | "partial" | "paid" | "overdue" | "void" {
  return status;
}

/** Add `days` to an ISO date string and return an ISO date (or null). */
export function addDays(date: string | null, days: number | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (days ?? 0));
  return d.toISOString();
}

/** Format a *_cents integer as GBP-style currency in major units. */
export function formatCents(cents: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    (cents ?? 0) / 100
  );
}
