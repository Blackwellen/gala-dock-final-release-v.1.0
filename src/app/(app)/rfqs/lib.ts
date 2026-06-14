import { formatCurrency } from "@/lib/utils";

/**
 * RFQ status values stored on `rfqs.status` (text column).
 * Recipient status values stored on `rfq_recipients.status` (text column).
 */
export const RFQ_STATUSES = ["draft", "sent", "responses-received", "closed", "awarded"] as const;
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
  "responses-received": "Responses In",
  closed: "Closed",
  awarded: "Awarded",
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
    case "responses-received":
      return "in-progress";
    case "awarded":
      return "won";
    case "closed":
      return "closed";
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
