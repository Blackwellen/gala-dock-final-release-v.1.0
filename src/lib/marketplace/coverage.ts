// Q57: service coverage for marketplace filters. Pure module (no server imports) so search pages and tests share one rule.
// A supplier's coverage is listings.details.service.coverage ({ mode: local|national|international, radius_miles, base }),
// measured from the listing's own lat/lng. Listings that haven't stated a radius are judged by DEFAULT_RADIUS_MILES.
export type Point = { lat: number; lng: number };
export type CoverageListing = { lat: number | null; lng: number | null; details?: Record<string, unknown> | null };
export const DEFAULT_RADIUS_MILES = 25;

/** UK city centres used when an event has no venue coordinates (same points as the marketplace map). */
export const CITY_POINTS: Record<string, Point> = {
  london: { lat: 51.507, lng: -0.11 }, manchester: { lat: 53.48, lng: -2.24 }, surrey: { lat: 51.31, lng: -0.56 }, birmingham: { lat: 52.49, lng: -1.89 },
  leeds: { lat: 53.8, lng: -1.55 }, liverpool: { lat: 53.41, lng: -2.98 }, bristol: { lat: 51.45, lng: -2.59 }, edinburgh: { lat: 55.95, lng: -3.19 },
  glasgow: { lat: 55.86, lng: -4.25 }, cardiff: { lat: 51.48, lng: -3.18 }, brighton: { lat: 50.82, lng: -0.14 }, newcastle: { lat: 54.98, lng: -1.61 },
};

export function cityPoint(city: string | null | undefined): Point | null {
  const k = String(city ?? "").trim().toLowerCase().split(",")[0]!.trim();
  return CITY_POINTS[k] ?? null;
}

/** Great-circle distance in miles. */
export function milesBetween(a: Point, b: Point): number {
  const r = (d: number) => (d * Math.PI) / 180, R = 3958.8;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How far the supplier says they travel, in miles; Infinity for national/international cover. */
export function coverageMiles(l: CoverageListing): number {
  const c = ((l.details?.service as { coverage?: { mode?: string; radius_miles?: number } } | undefined)?.coverage) ?? null;
  if (c?.mode === "national" || c?.mode === "international") return Infinity;
  const m = Number(c?.radius_miles);
  return Number.isFinite(m) && m > 0 ? m : DEFAULT_RADIUS_MILES;
}

/** Does the supplier cover this point? National/international cover: yes. No coordinates and no national cover: no. */
export function coversPoint(l: CoverageListing, p: Point): boolean {
  const reach = coverageMiles(l);
  if (reach === Infinity) return true;
  if (l.lat == null || l.lng == null) return false;
  return milesBetween({ lat: Number(l.lat), lng: Number(l.lng) }, p) <= reach;
}

/** Is the supplier based within `miles` of the point (the "distance" filter)? */
export function withinMiles(l: CoverageListing, p: Point, miles: number): boolean {
  if (l.lat == null || l.lng == null) return false;
  return milesBetween({ lat: Number(l.lat), lng: Number(l.lng) }, p) <= miles;
}
