import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/security";
import { ipHash } from "@/lib/comms/public";
import { marketplaceSearch, parseMarketplaceParams } from "@/lib/search/public";
import { serveSponsored } from "@/lib/ads/serve";

/**
 * Q09 public marketplace search (signed out): venues/spaces and suppliers/services with packages, filtered by date window
 * availability (Q10–Q12 commitments), price, capacity, location and category, ranked by the versioned organic model.
 * GET /api/public/marketplace?kind=venue&category=&q=&city=&lat=&lng=&radius_km=&date=YYYY-MM-DD|starts_at=&ends_at=
 *     &guests=&min_price=&max_price=&budget=&verified=1&instant=1&package=1&availability=rank|exclude&limit=&offset=
 * Results are ordered organically but carry no score, ranking reasons, model version or feature values (owner decision:
 * explainability is internal — `marketplace_search_explained`, workspace marketplace permission or platform admin only).
 * Sponsored listings come only from Q23 `marketplace_top` slots, in a separate labelled array; they never re-rank organic results.
 */
export async function GET(request: Request) {
  const p = parseMarketplaceParams(new URL(request.url));
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
  if (!(await rateLimit(`public-marketplace:${ipHash(request)}`, 60, 60))) return NextResponse.json({ error: "Too many searches. Please slow down." }, { status: 429 });
  try {
    const r = await marketplaceSearch(p);
    const slots = await serveSponsored("marketplace_top", { city: typeof p.city === "string" ? p.city : null, category: typeof p.category === "string" ? p.category : null },
      r.results.map(x => x.listing_id));
    const sponsored = slots.filter(s => s.listing && (!p.kind || s.listing.kind === p.kind)).map(s => ({
      sponsored: true as const, label: "Sponsored", rel: "sponsored nofollow", placement: "marketplace_top", token: s.token, listing: s.listing }));
    return NextResponse.json({ ...r, sponsored }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/invalid_/.test(m)) return NextResponse.json({ error: "Invalid filter." }, { status: 400 });
    return NextResponse.json({ error: "Marketplace search is unavailable right now." }, { status: 503 });
  }
}
