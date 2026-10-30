// Code 128 (subset B) barcode → SVG, dependency-free (media spec §72: one approved symbology, chosen for scanner compatibility).
// Encodes the same signed credential as the QR, so the barcode is a different *view* of one entitlement — never a second ticket.
// Q45-S01: the colour can come from a stored design, so it is validated before it reaches the SVG attribute.
import { safeSvgColor } from "@/lib/security/svg-sanitize";

const P = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];
const START_B = 104, STOP = 106;

/** Returns module widths (bars and spaces alternating, starting with a bar) for printable ASCII text. */
export function code128B(text: string): number[] {
  const codes = [START_B];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error("code128: unsupported character");
    codes.push(c - 32);
  }
  const checksum = codes.reduce((sum, v, i) => sum + (i === 0 ? v : v * i), 0) % 103;
  codes.push(checksum, STOP);
  return codes.flatMap(v => P[v]!.split("").map(Number));
}

/**
 * Quiet zone: 10 modules each side (ISO/IEC 15417 minimum). crispEdges snaps bars to device pixels when the SVG is scaled to fit
 * its card: antialiased fractional bars are unreadable, snapped bars decode from ~1.5 device px per module (decode spec).
 */
export function code128Svg(text: string, opts: { height?: number; module?: number; quiet?: number; color?: string } = {}) {
  const { height = 80, module = 2, quiet = 10 } = opts, color = safeSvgColor(opts.color, "#000");
  const widths = code128B(text);
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet, rects = "";
  widths.forEach((w, i) => { if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`; x += w; });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${total * module}" height="${height}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode"><rect width="100%" height="100%" fill="#fff"/><g fill="${color}">${rects}</g></svg>`;
}

/** Width of the barcode in modules (quiet zones included) — the viewBox width of code128Svg. */
export function code128Modules(text: string, quiet = 10) { return code128B(text).reduce((a, b) => a + b, 0) + quiet * 2; }

/**
 * Enlarged-barcode layout for a viewport (CSS px) and device pixel ratio: lay the bars along whichever side gives more whole
 * device px per module (portrait phones → rotated 90°). `dpx` = device px per module (integer), `module` = CSS px per module.
 */
export function barcodeSheetFit(modules: number, viewportW: number, viewportH: number, dpr: number) {
  // Rotated: bars run the full height (12 px margins); close button and note sit beside them. Flat: full width, bars ≤200 tall.
  const flatLen = viewportW - 32, turnedLen = viewportH - 24;
  const along = (len: number) => Math.max(1, Math.floor((len * dpr) / modules));
  const flat = along(flatLen), turned = along(turnedLen), rotate = turned > flat || (turned === flat && turnedLen > flatLen), dpx = rotate ? turned : flat;
  return { rotate, dpx, module: dpx / dpr, height: Math.round(Math.max(60, Math.min(rotate ? viewportW - 112 : viewportH - 120, 200))) };
}
