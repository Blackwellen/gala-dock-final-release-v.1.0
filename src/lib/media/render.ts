import type { Fill } from "./document";

// Pure render helpers shared by server (library thumbnails) and client (editor, exporter).
export const fillCss = (f: Fill | null | undefined): string => !f ? "transparent" : f.type === "solid" ? f.color
  : `${f.type === "linear" ? `linear-gradient(${f.angle ?? 180}deg` : f.type === "conic" ? `conic-gradient(from ${f.angle ?? 0}deg` : "radial-gradient(circle"},${f.stops.map(s => `${s.color} ${Math.round(s.offset * 100)}%`).join(",")})`;
export const assetSrc = (a: { src: string; path?: string }) => a.path ? `/api/media/asset?path=${encodeURIComponent(a.path)}` : a.src;

/** Contrast ratio guard for QR scannability (§43). */
export function qrContrast(fg: string, bg: string) {
  const lum = (hex: string) => { const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16); return [16, 8, 0].map(s => { const c = ((n >> s) & 255) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i]!, 0); };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}
