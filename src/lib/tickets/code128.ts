// Code 128 (subset B) barcode → SVG, dependency-free (media spec §72: one approved symbology, chosen for scanner compatibility).
// Encodes the same signed credential as the QR, so the barcode is a different *view* of one entitlement — never a second ticket.
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

export function code128Svg(text: string, opts: { height?: number; module?: number; quiet?: number; color?: string } = {}) {
  const { height = 80, module = 2, quiet = 10, color = "#000" } = opts;
  const widths = code128B(text);
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet, rects = "";
  widths.forEach((w, i) => { if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`; x += w; });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${total * module}" height="${height}" preserveAspectRatio="none" role="img" aria-label="Barcode"><rect width="100%" height="100%" fill="#fff"/><g fill="${color}">${rects}</g></svg>`;
}
