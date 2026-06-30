import type { Event } from "@/lib/supabase/types";

/**
 * Shared helpers for the Events module.
 *
 * The `events.status` column is free text in the live DB and stores
 * snake_case lifecycle values (e.g. `new_enquiry`, `in_delivery`). The UI
 * primitives (StatusBadge, EventCard, EventHero) expect kebab-case ids
 * (e.g. `new-enquiry`, `in-delivery`). These helpers translate between the
 * two and provide consistent GBP / date formatting.
 */

export type UiEventStatus =
  | "new-enquiry"
  | "briefing"
  | "quoting"
  | "awaiting-approval"
  | "confirmed"
  | "in-delivery"
  | "completed"
  | "cancelled";

const KNOWN_UI_STATUSES: UiEventStatus[] = [
  "new-enquiry",
  "briefing",
  "quoting",
  "awaiting-approval",
  "confirmed",
  "in-delivery",
  "completed",
  "cancelled",
];

/** Normalise a raw DB status (snake_case / free text) to a kebab-case UI status. */
export function toUiStatus(raw: string | null | undefined): UiEventStatus {
  const kebab = (raw ?? "").trim().toLowerCase().replace(/_/g, "-");
  return (KNOWN_UI_STATUSES as string[]).includes(kebab)
    ? (kebab as UiEventStatus)
    : "new-enquiry";
}

/** Convert a kebab-case UI status back to the snake_case value stored in the DB. */
export function toDbStatus(ui: string): string {
  return ui.trim().toLowerCase().replace(/-/g, "_");
}

/** Tabs shown on the events list, mapped to the DB status they filter by. */
export const STATUS_TABS: { label: string; status: string | null }[] = [
  { label: "All Events", status: null },
  { label: "New Enquiries", status: "new_enquiry" },
  { label: "Briefing", status: "briefing" },
  { label: "Quoting", status: "quoting" },
  { label: "Awaiting Approval", status: "awaiting_approval" },
  { label: "Confirmed", status: "confirmed" },
  { label: "In Delivery", status: "in_delivery" },
  { label: "Completed", status: "completed" },
  { label: "Cancelled/Lost", status: "cancelled" },
];

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

/** Format an integer pence/cents value as GBP (e.g. 2800000 -> "£28,000"). */
export function formatGbpFromCents(cents: number | null | undefined): string {
  return GBP.format((cents ?? 0) / 100);
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Format an ISO timestamp as "14 Jun 2026", or a fallback when absent. */
export function formatEventDate(
  iso: string | null | undefined,
  fallback = "Date TBC"
): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return DATE_FMT.format(d);
}

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Format an ISO timestamp as "14:30", or a fallback when absent. */
export function formatTimeOfDay(
  iso: string | null | undefined,
  fallback = "—"
): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return TIME_FMT.format(d);
}

/** Best display label for the client on an event row. */
export function clientLabel(event: Pick<Event, "client_name" | "client_company">): string {
  return event.client_name || event.client_company || "—";
}

/** Best display label for the venue on an event row. */
export function venueLabel(
  event: Pick<Event, "venue_name_snapshot" | "location">
): string | undefined {
  return event.venue_name_snapshot || event.location || undefined;
}
