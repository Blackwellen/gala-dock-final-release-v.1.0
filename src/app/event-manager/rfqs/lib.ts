import { formatCurrency } from "@/lib/utils";

/**
 * RFQ status values stored on `rfqs.status` (text column).
 * Recipient status values stored on `rfq_recipients.status` (text column).
 *
 * Canonical vocabulary (matches the migration comment in
 * `supabase/migrations/20260711_supplier_rfq_depth.sql`): underscored, e.g.
 * `responses_received` / `under_review`. The suppliers-module read layer
 * (`suppliers/_data/queries.ts`'s `normalizeRfqStatus`) converts this onto a
 * hyphenated *display* union for that module's chips — that's a UI-only
 * transform and does not need to match the DB vocabulary written here.
 */
export const RFQ_STATUSES = [
  "draft",
  "sent",
  "responses_received",
  "under_review",
  "awarded",
  "closed",
  "cancelled",
] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export const RECIPIENT_STATUSES = [
  "pending",
  "viewed",
  "responded",
  "declined",
  "accepted",
  "rejected",
] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export const RFQ_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  responses_received: "Responses In",
  under_review: "Under Review",
  awarded: "Awarded",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  viewed: "Viewed",
  responded: "Responded",
  declined: "Declined",
  accepted: "Accepted",
  rejected: "Rejected",
};

/**
 * Map our domain statuses onto the StatusBadge component's known variants so we
 * get consistent colours without extending the shared badge map.
 */
export function rfqBadgeStatus(status: string): string {
  switch (status) {
    case "draft":
      return "draft";
    case "sent":
      return "sent";
    case "responses_received":
      return "in-progress";
    case "under_review":
      return "pending";
    case "awarded":
      return "won";
    case "closed":
      return "closed";
    case "cancelled":
      return "cancelled";
    default:
      return status;
  }
}

export function recipientBadgeStatus(status: string): string {
  switch (status) {
    case "pending":
      return "pending";
    case "viewed":
      return "viewed";
    case "responded":
      return "sent";
    case "declined":
      return "declined";
    case "accepted":
      return "accepted";
    case "rejected":
      return "rejected";
    default:
      return status;
  }
}

export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatCurrency(cents / 100);
}

export function formatDateShort(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
