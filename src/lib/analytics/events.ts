/**
 * Q35 product analytics: shared, client-safe definitions. The authoritative list (and allowed props per event) lives in
 * public.analytics_event_definitions; capture drops anything not defined there and strips props that are not allowed or look
 * like personal data (e-mail, phone-like digit runs, URLs, tokens, strings over 64 chars).
 */
export const CLIENT_EVENTS = [
  "page.viewed", "feature.used", "search.performed", "listing.viewed", "event.viewed", "checkout.started", "checkout.completed",
  "signup.started", "onboarding.step_completed", "request.started", "request.submitted", "wallet.opened", "scanner.opened",
  "pwa.installed", "pwa.offline_used", "pwa.updated",
] as const;
export type ClientEvent = typeof CLIENT_EVENTS[number];
export type PropValue = string | number | boolean;
export type TrackInput = { name: ClientEvent; path?: string; props?: Record<string, PropValue>; eventId?: string; listingId?: string; at?: string };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TOKEN_SURFACES = /^\/(pay|portal|p|proposal|proposals\/share|contract|contracts\/sign|rsvp|invite|invites|r|ref|guest|share|t|reset-password|auth\/callback)(\/|$)/;

/** Mirrors public.analytics_normalise_path: route template only (no query, hash, ids or tokens). The server normalises again. */
export function normalisePath(path: string): string {
  let p = (path.split("?")[0] ?? "").split("#")[0] ?? "";
  if (!p.startsWith("/")) return "";
  if (TOKEN_SURFACES.test(p)) return p.replace(/^(\/[^/]+).*$/, "$1/:token");
  p = p.replace(UUID, ":id").replace(/\/[A-Za-z0-9_-]{20,}/g, "/:token").replace(/\/[0-9]{3,}/g, "/:n").replace(/@/g, "");
  return p.slice(0, 200);
}

export const isClientEvent = (name: unknown): name is ClientEvent => typeof name === "string" && (CLIENT_EVENTS as readonly string[]).includes(name);
