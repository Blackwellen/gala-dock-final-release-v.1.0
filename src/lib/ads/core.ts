/**
 * Owned ad inventory — pure helpers (Q23, cards 140–145). No I/O: unit tests import this module directly.
 * Sponsored items are a separate, labelled layer: they are inserted BETWEEN organic results at fixed positions and never
 * reorder, replace or re-rank organic items (backend §13.17; Q09 reliability/ranking relies on this separation).
 */
import { createHmac } from "node:crypto";

export type PlacementKey = "discover_hero" | "discover_feed" | "category_top" | "search_results" | "event_related" | "marketplace_top";
export type ServedSlot = { token: string; boost_id: string; slot: number; subject_kind: "event" | "listing"; event_id: string | null; listing_id: string | null };
export type FeedItem<T, S> = { kind: "organic"; item: T; rank: number } | { kind: "sponsored"; slot: S; label: "Sponsored" };

/**
 * Interleave sponsored slots after organic positions (1-based), e.g. [4, 8] → after the 4th and 8th organic result.
 * Organic order and ranks are preserved exactly (never promoted inside the organic list). A sponsored subject whose organic copy is
 * already within the slot window (the first max(positions) organic results) is dropped, so an ad never repeats what is on screen.
 * Q56: it used to drop a sponsored subject that appeared ANYWHERE organically — and an unfiltered Discover list contains every public
 * event, so the paid in-feed slot almost never rendered. A copy further down the list (labelled once as Sponsored above it) is fine.
 */
export const slotWindow = (positions: number[]) => Math.max(0, ...positions.filter(p => Number.isInteger(p) && p > 0));
/** Organic ids within the slot window: pass them to serve_ad_slots as p_exclude so no token is issued for an ad that can't render. */
export const windowIds = <T extends { id: string }>(organic: T[], positions: number[]) => organic.slice(0, slotWindow(positions)).map(o => o.id);
export function interleave<T extends { id: string }, S extends { subjectId: string }>(organic: T[], sponsored: S[], positions: number[]): FeedItem<T, S>[] {
  const shown = new Set(windowIds(organic, positions));
  const queue = sponsored.filter(s => !shown.has(s.subjectId));
  const at = new Set(positions.filter(p => Number.isInteger(p) && p > 0));
  const out: FeedItem<T, S>[] = [];
  organic.forEach((item, i) => {
    out.push({ kind: "organic", item, rank: i + 1 });
    if (at.has(i + 1) && queue.length) out.push({ kind: "sponsored", slot: queue.shift()!, label: "Sponsored" });
  });
  return out;
}

/** The organic layer of a mixed feed, in order — what ranking, reliability and analytics may ever see. */
export const organicOnly = <T, S>(feed: FeedItem<T, S>[]) => feed.flatMap(f => f.kind === "organic" ? [f.item] : []);

export const TOKEN_RE = /^[0-9a-f]{36}$/;
export const AD_DEST_RE = /^\/(events|venues|services)\/[A-Za-z0-9-]{1,120}$/;
export const clickHref = (token: string) => `/api/ads/click?t=${token}`;

const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|monitor|curl|wget|python-requests|node-fetch/i;
export const isBot = (ua: string | null | undefined) => !ua || BOT_RE.test(ua);

/**
 * Cookie-less anonymous viewer id: HMAC(secret, UTC day + IP + user agent). Rotates daily, is never stored raw, and needs no
 * cookie (the cookie policy promises no advertising cookies). Signed-in viewers use their user id instead (hashed in the DB).
 */
export function anonViewerId(secret: string, ip: string, ua: string, now = new Date()) {
  return createHmac("sha256", secret).update(`${now.toISOString().slice(0, 10)}|${ip}|${ua}`).digest("hex");
}
