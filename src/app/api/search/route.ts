import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

/**
 * Global search (§95, Q63): one permission-scoped system across records; optional geospatial filter for marketplace listings.
 * ?ws=<workspace id> searches that workspace (membership re-checked in SQL); ?scope=admin searches platform records for a platform
 * admin at aal2 (admin_global_search re-checks); neither = the caller's personal records + the public marketplace.
 */
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80), ws = sp.get("ws"), admin = sp.get("scope") === "admin";
  if (q.length < 2) return NextResponse.json({ results: [] }, { headers });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers });
  if (!(await rateLimit(`search:${user.id}`, 240, 60))) return NextResponse.json({ error: "Slow down" }, { status: 429, headers: { ...headers, "Retry-After": "30" } });
  const num = (k: string) => { const raw = sp.get(k); const v = Number(raw); return raw !== null && raw !== "" && Number.isFinite(v) ? v : null; };
  const lat = num("lat"), lng = num("lng"), r = num("r");
  const { data, error } = admin
    ? await sb.rpc("admin_global_search" as never, { p_q: q, p_limit: 40 } as never)
    : await sb.rpc("global_search" as never, { p_q: q, p_workspace: ws && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ws) ? ws : null, p_limit: 40,
        p_lat: lat !== null && lat >= -90 && lat <= 90 ? lat : null, p_lng: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
        p_radius_km: r !== null && r >= 1 && r <= 500 ? Math.round(r) : null } as never);
  if (error) return NextResponse.json({ error: "Search failed" }, { status: /not_authorized/.test(error.message) ? 403 : 500, headers });
  return NextResponse.json({ results: data ?? [] }, { headers });
}
