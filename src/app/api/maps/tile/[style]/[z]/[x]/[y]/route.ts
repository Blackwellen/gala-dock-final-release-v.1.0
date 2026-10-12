import { NextResponse } from "next/server";
import { isMapStyle } from "@/lib/maps/styles";

// MapTiler raster endpoints per style (256px tiles). The key stays server-side; responses are cached at the edge.
const MT: Record<string, (z: number, x: number, y: number, k: string) => string> = {
  streets: (z, x, y, k) => `https://api.maptiler.com/maps/streets-v2/256/${z}/${x}/${y}.png?key=${k}`,
  light: (z, x, y, k) => `https://api.maptiler.com/maps/basic-v2-light/256/${z}/${x}/${y}.png?key=${k}`,
  outdoor: (z, x, y, k) => `https://api.maptiler.com/maps/outdoor-v2/256/${z}/${x}/${y}.png?key=${k}`,
  satellite: (z, x, y, k) => `https://api.maptiler.com/tiles/satellite-v2/${z}/${x}/${y}.jpg?key=${k}`,
  hybrid: (z, x, y, k) => `https://api.maptiler.com/maps/hybrid/256/${z}/${x}/${y}.jpg?key=${k}`,
};

/** Street-map tile proxy for plan editors and public maps. Same-site requests only, so the map key can't be borrowed by other sites. */
export async function GET(req: Request, { params }: { params: Promise<{ style: string; z: string; x: string; y: string }> }) {
  const p = await params; const z = Number(p.z), x = Number(p.x), y = Number(p.y.replace(/\.(png|jpg)$/, ""));
  if (!isMapStyle(p.style) || !Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 20 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return new NextResponse(null, { status: 404 });
  const site = req.headers.get("sec-fetch-site"), ref = req.headers.get("referer");
  const own = new URL(req.url).host;
  if ((site && !["same-origin", "same-site", "none"].includes(site)) || (ref && new URL(ref).host !== own)) return new NextResponse(null, { status: 403 });
  const key = process.env.MAP_TILER_API_KEY;
  if (!key) {
    // Development fallback: OpenStreetMap standard tiles (streets only). Production should set MAP_TILER_API_KEY.
    if (p.style !== "streets" && p.style !== "light") return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(`https://tile.openstreetmap.org/${Math.min(z, 19)}/${x}/${y}.png`, { status: 302, headers: { "Cache-Control": "public, max-age=86400" } });
  }
  const res = await fetch(MT[p.style](z, x, y, key), { next: { revalidate: 604800 } }).catch(() => null);
  if (!res?.ok) return new NextResponse(null, { status: res?.status === 404 ? 404 : 502, headers: { "Cache-Control": "public, max-age=60" } });
  return new NextResponse(await res.arrayBuffer(), { headers: { "Content-Type": res.headers.get("content-type") ?? "image/png", "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable" } });
}
