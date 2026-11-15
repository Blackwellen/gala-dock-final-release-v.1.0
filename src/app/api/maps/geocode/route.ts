import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";
import { geocodePlace } from "@/lib/maps/geocode";

/** Location finder for the plan editors: address / place / postcode → coordinates. Signed-in editors only, rate limited.
 *  MapTiler geocoding when MAP_TILER_API_KEY is set; OpenStreetMap Nominatim (identified, low volume) otherwise (src/lib/maps/geocode.ts).
 *  Q72: worldwide; optional ?country=XX narrows the search. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 160);
  if (q.length < 3) return NextResponse.json({ results: [] });
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await rateLimit(`geo:${user.id}`, 40, 60))) return NextResponse.json({ error: "Too many searches — wait a moment." }, { status: 429 });
  const country = /^[A-Za-z]{2}$/.test(sp.get("country") ?? "") ? sp.get("country") : null;
  try {
    const hits = await geocodePlace(q, { country, limit: 6 });
    return NextResponse.json({ results: hits.map(h => ({ label: h.label, lat: h.lat, lng: h.lng, country: h.country })) }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch { return NextResponse.json({ error: "Location search is unavailable right now." }, { status: 502 }); }
}
