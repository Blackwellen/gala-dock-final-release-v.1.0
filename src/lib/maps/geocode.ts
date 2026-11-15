import "server-only";
// Q72 · Worldwide place → coordinates, shared by the plan-editor location search (/api/maps/geocode) and the marketplace coverage
// filters (which used to know only 12 UK cities). MapTiler Geocoding when MAP_TILER_API_KEY is set (the same provider as the map
// tiles, already in the processor list), else OpenStreetMap Nominatim (identified, low volume). Results are cached by Next's fetch
// cache for a day per query. Never logs the key; the key never reaches the browser (server-only module).
import { cityPoint, type Point } from "@/lib/marketplace/coverage";

export type GeoHit = { label: string; lat: number; lng: number; country: string | null };

const clean = (q: string) => q.trim().replace(/\s+/g, " ").slice(0, 160);

/** Up to `limit` matches for an address, place or postcode. `country` (ISO-2) narrows the search; `language` sets label language. */
export async function geocodePlace(query: string, opts: { country?: string | null; language?: string; limit?: number; signal?: AbortSignal } = {}): Promise<GeoHit[]> {
  const q = clean(query); if (q.length < 2) return [];
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 10), lang = (opts.language ?? "en").slice(0, 5), cc = /^[A-Za-z]{2}$/.test(opts.country ?? "") ? opts.country!.toLowerCase() : null;
  const key = process.env.MAP_TILER_API_KEY;
  const signal = opts.signal ?? AbortSignal.timeout(6000);
  if (key) {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${key}&limit=${limit}&language=${lang}${cc ? `&country=${cc}` : ""}`;
    const r = await fetch(url, { signal, next: { revalidate: 86400 } });
    if (!r.ok) throw new Error(`geocode_http_${r.status}`);
    const j = await r.json() as { features?: { place_name?: string; text?: string; center?: [number, number]; properties?: { country_code?: string }; context?: { id?: string; short_code?: string }[] }[] };
    return (j.features ?? []).filter(f => f.center).map(f => ({ label: f.place_name ?? f.text ?? q, lng: f.center![0], lat: f.center![1],
      country: (f.properties?.country_code ?? f.context?.find(c => c.id?.startsWith("country"))?.short_code ?? null)?.toUpperCase() ?? null }))
      .filter(h => Number.isFinite(h.lat) && Number.isFinite(h.lng));
  }
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${limit}&accept-language=${lang}${cc ? `&countrycodes=${cc}` : ""}&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "User-Agent": "GalaDock/1.0 (location search)" }, signal, next: { revalidate: 86400 } });
  if (!r.ok) throw new Error(`geocode_http_${r.status}`);
  const j = await r.json() as { display_name: string; lat: string; lon: string; address?: { country_code?: string } }[];
  return j.map(h => ({ label: h.display_name, lat: Number(h.lat), lng: Number(h.lon), country: h.address?.country_code?.toUpperCase() ?? null }))
    .filter(h => Number.isFinite(h.lat) && Number.isFinite(h.lng));
}

/**
 * A point for a city / area name (an event's city, the Location filter). The 12 UK city centres answer instantly (no network);
 * anything else is geocoded worldwide. Null when nothing matches or the geocoder is unavailable — callers then skip the filter
 * rather than hide every supplier.
 */
export async function placePoint(place: string | null | undefined, opts: { country?: string | null } = {}): Promise<Point | null> {
  const p = String(place ?? "").trim(); if (!p) return null;
  const known = cityPoint(p); if (known) return known;
  try { const [hit] = await geocodePlace(p, { country: opts.country, limit: 1, signal: AbortSignal.timeout(3500) }); return hit ? { lat: hit.lat, lng: hit.lng } : null; }
  catch { return null; }
}
