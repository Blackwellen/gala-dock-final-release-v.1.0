import type { QuoteStatus, InvoiceStatus, ProposalStatus } from "@/lib/supabase/types";

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

/** Compact currency for KPI tiles/charts, e.g. "£1.29M", "£624K". */
export function formatCentsCompact(cents: number, currency = "GBP"): string {
  const value = (cents ?? 0) / 100;
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? "-" : ""}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${value < 0 ? "-" : ""}${symbol}${(abs / 1_000).toFixed(1)}K`;
  return `${value < 0 ? "-" : ""}${symbol}${abs.toFixed(0)}`;
}

/** Client-facing sales quote (proposals table) → StatusBadge status. */
export function proposalBadgeStatus(
  status: ProposalStatus | string
): "draft" | "sent" | "viewed" | "negotiating" | "won" | "lost" | "expired" | "converted" {
  switch (status) {
    case "draft": return "draft";
    case "sent": return "sent";
    case "viewed": return "viewed";
    case "signed": return "won";
    case "converted": return "converted";
    case "declined": return "lost";
    case "expired": return "expired";
    default: return "draft";
  }
}

/** Supplier bill approval_status (event_expenses) → StatusBadge status. */
export function billApprovalBadgeStatus(
  status: string
): "pending-review" | "awaiting-finance" | "approved" | "rejected" | "disputed" | "on-hold" {
  switch (status) {
    case "pending_review": return "pending-review";
    case "awaiting_event_manager": return "awaiting-finance";
    case "awaiting_finance": return "awaiting-finance";
    case "approved": return "approved";
    case "rejected": return "rejected";
    case "disputed": return "disputed";
    case "on_hold": return "on-hold";
    default: return "pending-review";
  }
}

/** Supplier bill payment_status (event_expenses) → StatusBadge status. */
export function billPaymentBadgeStatus(
  status: string
): "unpaid" | "scheduled" | "processing" | "part-paid" | "paid" | "failed" | "refunded" | "cancelled" {
  switch (status) {
    case "unpaid": return "unpaid";
    case "scheduled": return "scheduled";
    case "processing": return "processing";
    case "part_paid": return "part-paid";
    case "paid": return "paid";
    case "failed": return "failed";
    case "refunded": return "refunded";
    case "cancelled": return "cancelled";
    default: return "unpaid";
  }
}

/** event_deposits.status → StatusBadge status. */
export function depositBadgeStatus(
  status: string
): "pending" | "due-soon" | "part-paid" | "paid" | "overdue" | "refunded" | "waived" | "forfeited" {
  switch (status) {
    case "pending": return "pending";
    case "partial": return "part-paid";
    case "paid": return "paid";
    case "refunded": return "refunded";
    case "withheld": return "forfeited";
    default: return "pending";
  }
}

/** timesheets.approval_status → StatusBadge status. */
export function timesheetBadgeStatus(
  status: string
): "draft" | "submitted" | "pending" | "approved" | "rejected" | "exported" | "paid" {
  switch (status) {
    case "draft": return "draft";
    case "submitted": return "submitted";
    case "pending": return "pending";
    case "approved": return "approved";
    case "rejected": return "rejected";
    case "exported": return "exported";
    case "paid": return "paid";
    default: return "pending";
  }
}

/** ticket_orders.status → StatusBadge status. */
export function ticketOrderBadgeStatus(
  status: string
): "pending" | "paid" | "cancelled" | "refunded" {
  switch (status) {
    case "pending": return "pending";
    case "paid": return "paid";
    case "cancelled": return "cancelled";
    case "refunded": return "refunded";
    default: return "pending";
  }
}

/** invoice_payments.status → StatusBadge status. */
export function paymentBadgeStatus(
  status: string
): "pending" | "paid" | "failed" | "refunded" {
  switch (status) {
    case "pending": return "pending";
    case "succeeded": return "paid";
    case "failed": return "failed";
    case "refunded": return "refunded";
    default: return "pending";
  }
}

/** Days between today and an ISO date; negative = overdue. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Human "In 3 days" / "3 days overdue" / "Today" label for a due date. */
export function dueLabel(date: string | null): string {
  const days = daysUntil(date);
  if (days === null) return "—";
  if (days === 0) return "Today";
  if (days > 0) return `In ${days} day${days === 1 ? "" : "s"}`;
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
}

/**
 * Sum a per-event cost map, but ONLY for events present in a per-event revenue
 * map. Headline "Gross Profit"/"Margin" KPIs must compare revenue and cost on
 * the SAME set of events — summing cost across every event in the workspace
 * (including ones with no invoice yet) against revenue from only the invoiced
 * events produces a nonsensical negative "profit". Costs for not-yet-invoiced
 * events remain real and are still shown per-event elsewhere; this helper only
 * governs the workspace-wide headline aggregate.
 */
export function sumMatchedCosts(
  revenueByEvent: Map<string, number>,
  costByEvent: Map<string, number>
): number {
  let total = 0;
  for (const eventId of revenueByEvent.keys()) {
    total += costByEvent.get(eventId) ?? 0;
  }
  return total;
}

/** Fixed GBP palette for chart series/donut legends across all Finance tabs. */
export const FINANCE_CHART_COLORS = {
  brand: "#7c3aed",
  brandLight: "#a78bfa",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  violet: "#8b5cf6",
  teal: "#14b8a6",
  pink: "#ec4899",
  slate: "#94a3b8",
};
