import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

/** Global search (§95): one permission-scoped system across records; optional geospatial filter for marketplace listings. */
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 80), ws = sp.get("ws");
  if (q.length < 2) return NextResponse.json({ results: [] }, { headers });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers });
  if (!(await rateLimit(`search:${user.id}`, 240, 60))) return NextResponse.json({ error: "Slow down" }, { status: 429, headers });
  const num = (k: string) => { const v = Number(sp.get(k)); return Number.isFinite(v) && sp.get(k) !== null ? v : null; };
  const { data, error } = await sb.rpc("global_search" as never, { p_q: q, p_workspace: ws && /^[0-9a-f-]{36}$/i.test(ws) ? ws : null, p_limit: 40,
    p_lat: num("lat"), p_lng: num("lng"), p_radius_km: num("r") } as never);
  if (error) return NextResponse.json({ error: "Search failed" }, { status: /not_authorized/.test(error.message) ? 403 : 500, headers });
  return NextResponse.json({ results: data ?? [] }, { headers });
}
