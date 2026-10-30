import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/security";
import { ipHash } from "@/lib/comms/public";
import { publicDiscover, SEARCH_TYPES } from "@/lib/search/public";

/**
 * Q09 / W01 public category + location discovery (backend for `/events/london`, `/events/london/music`, `/venues/manchester`…).
 * GET /api/public/discover?city=london&category=music&type=event,venue&from=&to=&limit=&offset=
 * City and category accept slugs ("new-york", "live-music"); categories expand through Q02 master data (keys, labels, parents,
 * build categories). Organic only, public records only (live predicate re-checked in SQL), plus facets for the city.
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const s = (k: string, max: number) => { const v = (u.searchParams.get(k) ?? "").trim(); return v ? v.slice(0, max) : null; };
  const city = s("city", 60), category = s("category", 40);
  if ((city && !/^[\p{L}\p{N} '’-]+$/u.test(city)) || (category && !/^[\p{L}\p{N} &_-]+$/u.test(category))) return NextResponse.json({ error: "Invalid city or category." }, { status: 400 });
  const types = (u.searchParams.get("type") ?? "").split(",").map(t => t.trim()).filter(Boolean);
  if (types.some(t => !(SEARCH_TYPES as readonly string[]).includes(t))) return NextResponse.json({ error: "Unknown type." }, { status: 400 });
  const when = (k: string) => { const v = s(k, 40); return v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null; };
  const limit = Math.min(50, Math.max(1, Number(u.searchParams.get("limit") ?? 24) || 24)), offset = Math.min(1000, Math.max(0, Number(u.searchParams.get("offset") ?? 0) || 0));
  if (!(await rateLimit(`public-discover:${ipHash(request)}`, 120, 60))) return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  try {
    const r = await publicDiscover({ city, category, types: types.length ? types : null, from: when("from"), to: when("to"), limit, offset });
    return NextResponse.json({ ...r.value, cache: { hit: r.hit, version: r.version } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Discovery is unavailable right now." }, { status: 503 }); }
}
