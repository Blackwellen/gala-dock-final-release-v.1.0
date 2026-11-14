/**
 * Workspace brand colour → accessible accent (Q67). Pure: no I/O, tests import it directly.
 *
 * The organiser's brand colour is only ever an ACCENT on their own public event page, client portal and poster/studio defaults —
 * never core Gala Dock chrome (header, navigation, primary buttons, status colours). Whatever colour they pick is clamped so that:
 *  - `accent` reaches WCAG AA 4.5:1 against white (so it works as text/links/icons on the light page and as a fill behind white text);
 *  - `onAccent` is the text colour (white or near-black) with the higher contrast on the accent fill;
 *  - `soft` is a light tint for backgrounds/borders (decorative only).
 * Invalid input returns null and the page keeps the design-token defaults.
 */
export const AA = 4.5;
const HEX = /^#([0-9a-f]{6})$/i;
type RGB = [number, number, number];

export function parseHex(hex: unknown): RGB | null {
  const m = typeof hex === "string" ? HEX.exec(hex.trim()) : null;
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]: RGB) {
  const c = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
export function contrast(a: RGB, b: RGB) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
const WHITE: RGB = [255, 255, 255], INK: RGB = [17, 24, 39];   // #111827 = --ink design token

/** Darken towards black (keeping the hue) until the colour reaches `ratio` against `bg`. */
export function clampAgainst(rgb: RGB, bg: RGB = WHITE, ratio = AA): RGB {
  let cur = rgb;
  for (let i = 0; i < 40 && contrast(cur, bg) < ratio; i++) cur = cur.map(v => v * 0.92) as RGB;
  return cur;
}

export type BrandAccent = { accent: string; onAccent: string; soft: string; source: string };
export function brandAccent(hex: unknown): BrandAccent | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const a = clampAgainst(rgb);
  const onAccent = contrast(a, WHITE) >= contrast(a, INK) ? "#ffffff" : toHex(INK);
  const soft = toHex(rgb.map(v => v + (255 - v) * 0.9) as RGB);
  return { accent: toHex(a), onAccent, soft, source: toHex(rgb) };
}

/** CSS custom properties for a wrapper element (React style object). Empty when there is no valid brand colour. */
export function accentVars(hex: unknown): Record<string, string> {
  const b = brandAccent(hex);
  return b ? { "--org-accent": b.accent, "--org-accent-on": b.onAccent, "--org-accent-soft": b.soft } : {};
}

/** Text colour for a fill of any colour (posters): white or ink, whichever reads better. */
export function readableOn(hex: unknown): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#ffffff";
  return contrast(rgb, WHITE) >= contrast(rgb, INK) ? "#ffffff" : toHex(INK);
}
