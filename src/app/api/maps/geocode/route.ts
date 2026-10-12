import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

type Hit = { label: string; lat: number; lng: number };

/** Location finder for the plan editors: address / place / postcode → coordinates. Signed-in editors only, rate limited.
 *  MapTiler geocoding when MAP_TILER_API_KEY is set; OpenStreetMap Nominatim (identified, low volume) otherwise. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 160);
  if (q.length < 3) return NextResponse.json({ results: [] });
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await rateLimit(`geo:${user.id}`, 40, 60))) return NextResponse.json({ error: "Too many searches — wait a moment." }, { status: 429 });
  const key = process.env.MAP_TILER_API_KEY;
  let results: Hit[] = [];
  try {
    if (key) {
      const r = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${key}&limit=6&language=en`, { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
      const j = await r.json() as { features?: { place_name?: string; text?: string; center?: [number, number] }[] };
      results = (j.features ?? []).filter(f => f.center).map(f => ({ label: f.place_name ?? f.text ?? q, lng: f.center![0], lat: f.center![1] }));
    } else {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": "GalaDock/1.0 (plan editor location search)" }, signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
      const j = await r.json() as { display_name: string; lat: string; lon: string }[];
      results = j.map(h => ({ label: h.display_name, lat: Number(h.lat), lng: Number(h.lon) }));
    }
  } catch { return NextResponse.json({ error: "Location search is unavailable right now." }, { status: 502 }); }
  return NextResponse.json({ results: results.filter(h => Number.isFinite(h.lat) && Number.isFinite(h.lng)) }, { headers: { "Cache-Control": "private, max-age=300" } });
}
