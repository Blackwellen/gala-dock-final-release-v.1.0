/**
 * Public webhook / event-feed catalogue (Q30, domain 192). Mirrors public.webhook_payload_fields (migration 202610293023; parity is
 * tested in tests/release/q30-api-webhooks.spec.ts). Only these fields ever leave the platform for a type, and a global deny
 * pattern (scores, ranking reasons, internal notes, contact data, tokens, secrets, private links) applies on top in SQL.
 * Bump schemaVersion when a type's payload changes incompatibly. Pure data.
 */
export const WEBHOOK_API_VERSION = "2026-10-29";
export const WEBHOOK_TYPES = {
  "event.created": ["event_id", "name", "starts_at", "ends_at", "status", "event_type"],
  "event.updated": ["event_id", "name", "starts_at", "ends_at", "status", "changed"],
  "event.published": ["event_id", "name", "starts_at", "status"],
  "event.cancelled": ["event_id", "name", "status", "refunds"],
  "booking.requested": ["item_id", "event_id", "listing_id", "category", "status"],
  "booking.created": ["item_id", "event_id", "listing_id", "category", "status"],
  "booking.confirmed": ["item_id", "event_id", "listing_id", "status", "amount", "currency"],
  "booking.cancelled": ["item_id", "event_id", "listing_id", "status"],
  "booking.cancellation_applied": ["item_id", "event_id", "cancellation_id", "kind", "refund_amount", "currency"],
  "quote.received": ["quote_id", "item_id", "event_id", "total", "currency", "valid_until"],
  "quote.accepted": ["quote_id", "item_id", "event_id", "total", "currency"],
  "proposal.accepted": ["proposal_id", "event_id", "client_id", "total", "currency"],
  "ticket.order.paid": ["order_ref", "event_id", "tier_id", "quantity", "amount", "currency"],
  "ticket.transferred": ["ticket_id", "event_id", "tier_id"],
  "ticket.resold": ["ticket_id", "event_id", "tier_id", "amount", "currency"],
  "payment.succeeded": ["payment_id", "order_ref", "event_id", "amount", "currency"],
  "payment.refunded": ["payment_id", "order_ref", "ticket_id", "event_id", "amount", "currency"],
  "dispute.opened": ["dispute_id", "item_id", "event_id", "status"],
  "agent.run.completed": ["run_id", "status"],
  "listing.published": ["listing_id", "name", "category"],
  "review.published": ["review_id", "listing_id", "rating"],
  "provider.document.expiring": ["document_id", "kind", "expires_at"],
} as const satisfies Record<string, readonly string[]>;
export type WebhookType = keyof typeof WEBHOOK_TYPES;
/** Subscribable types (ping is the test delivery and always allowed). */
export const WEBHOOK_EVENTS = Object.keys(WEBHOOK_TYPES) as WebhookType[];
/** Same deny pattern as public.webhook_field_denied. */
export const DENIED_FIELD = /(^|_)(score|scores|reason|reasons|rank|ranking|weight|weights|internal|private|note|notes|ip|user_agent|email|phone|token|secret|hash|password|host_url|speaker_url|join_url|storage_path|key)($|_)/i;
