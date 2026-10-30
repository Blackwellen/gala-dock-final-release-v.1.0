import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/security";
import { ipHash } from "@/lib/comms/public";
import { parseSearchParams, publicSearch } from "@/lib/search/public";

/**
 * Q06 public, signed-out discovery API for events, venues, services and organisers/providers (backend for lane B's public pages).
 * GET /api/public/search?q=&type=event,venue&lat=&lng=&radius_km=&limit=&offset=
 * Organic results only: drafts, private events, unpublished or paused listings never appear (index flag + live RLS predicate).
 * Sponsored placements come from Q23 serve_ad_slots separately and are never mixed into this ranking.
 */
export async function GET(request: Request) {
  const p = parseSearchParams(new URL(request.url));
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
  if (!(await rateLimit(`public-search:${ipHash(request)}`, 120, 60))) return NextResponse.json({ error: "Too many searches. Please slow down." }, { status: 429 });
  try {
    const r = await publicSearch(p);
    return NextResponse.json({ query: p.q, results: r.value, organic_only: true, cache: { hit: r.hit, version: r.version } },
      { headers: { "Cache-Control": "no-store" } });   // no CDN copy: visibility changes apply immediately
  } catch { return NextResponse.json({ error: "Search is unavailable right now." }, { status: 503 }); }
}
