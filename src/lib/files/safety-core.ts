/**
 * Pure upload-safety core (Q04, release spec §74). No `server-only` and no environment access, so the hostile-fixture tests
 * import it directly. `src/lib/upload-safety.ts` is the server wrapper (reads CLAMAV_SCAN_URL / CLAMAV_SCAN_TOKEN).
 *  • Images: metadata is stripped losslessly (JPEG APP1/APP13/COM — EXIF incl. GPS, XMP, IPTC; PNG tEXt/iTXt/zTXt/eXIf;
 *    WebP EXIF/XMP chunks), so uploads never leak location or device data.
 *  • PDFs: documents with active content (JavaScript, launch actions, embedded files, rich media, XFA) are refused.
 *  • SVG: refused when it carries scripts, handlers, external references or entity declarations; comments/metadata removed.
 *  • Malware: the shared Blackwellen ClamAV gateway (POST /scan) — fails closed on any error or malformed reply.
 */
export type Verdict = { ok: true; bytes: Uint8Array } | { ok: false; reason: "infected" | "active_content" | "scanner_unavailable"; detail?: string };

function stripJpeg(b: Uint8Array): Uint8Array {
  if (b[0] !== 0xff || b[1] !== 0xd8) return b;
  const out: number[] = [0xff, 0xd8]; let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1]!;
    if (marker === 0xda) { for (let k = i; k < b.length; k++) out.push(b[k]!); return Uint8Array.from(out); }   // start of scan: copy the rest
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;   // APP1 (EXIF/XMP), APP13 (IPTC), COM
    if (!drop) for (let k = i; k < i + 2 + len && k < b.length; k++) out.push(b[k]!);
    i += 2 + len;
  }
  return b;   // unexpected structure: leave untouched rather than corrupt
}
function stripPng(b: Uint8Array): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]; if (!sig.every((v, i) => b[i] === v)) return b;
  const parts: Uint8Array[] = [b.subarray(0, 8)]; let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
    const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
    const end = i + 12 + len; if (end > b.length) return b;
    if (!["tEXt", "iTXt", "zTXt", "eXIf", "tIME"].includes(type)) parts.push(b.subarray(i, end));
    i = end; if (type === "IEND") break;
  }
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
function stripWebp(b: Uint8Array): Uint8Array {
  if (String.fromCharCode(...b.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...b.subarray(8, 12)) !== "WEBP") return b;
  const parts: Uint8Array[] = []; let i = 12;
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(...b.subarray(i, i + 4)), len = b[i + 4]! | (b[i + 5]! << 8) | (b[i + 6]! << 16) | (b[i + 7]! << 24);
    const end = i + 8 + len + (len % 2); if (end > b.length + 1) return b;
    if (type !== "EXIF" && type !== "XMP ") parts.push(b.subarray(i, Math.min(end, b.length)));
    i = end;
  }
  const body = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(12 + body);
  out.set(b.subarray(0, 12)); const size = 4 + body; out[4] = size & 255; out[5] = (size >> 8) & 255; out[6] = (size >> 16) & 255; out[7] = (size >> 24) & 255;
  let o = 12; for (const p of parts) { out.set(p, o); o += p.length; }
  // VP8X, when present, is the first chunk: clear its EXIF (0x08) and XMP (0x04) flags so decoders don't look for removed chunks.
  if (String.fromCharCode(...out.subarray(12, 16)) === "VP8X") out[20] = out[20]! & ~0x0c;
  return out;
}
const ACTIVE_PDF = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|OpenAction\s*<<[^>]*\/S\s*\/JavaScript)\b/;

/** SVG elements (Media Studio "My elements"): always shown through <img>, which never runs scripts; refused anyway if they carry
 *  scripts, event handlers, javascript: links, embedded documents or entity declarations, so a stored file is inert wherever it's opened. */
const ACTIVE_SVG = /<\s*(script|foreignObject|iframe|frame|embed|object|handler|listener|set|animate)\b|\son[a-z]+\s*=|javascript:|<!ENTITY|<!DOCTYPE|\b(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|webp|gif);)/i;
export function sanitize(bytes: Uint8Array, type: string): Verdict {
  if (type === "image/svg+xml") {
    const text = new TextDecoder("utf-8").decode(bytes);
    if (ACTIVE_SVG.test(text)) return { ok: false, reason: "active_content", detail: "SVGs with scripts, links or embedded content aren’t accepted. Export a plain SVG and try again." };
    return { ok: true, bytes: new TextEncoder().encode(text.replace(/<!--[\s\S]*?-->/g, "").replace(/<metadata[\s\S]*?<\/metadata>/gi, "")) };
  }
  if (type === "image/jpeg") return { ok: true, bytes: stripJpeg(bytes) };
  if (type === "image/png") return { ok: true, bytes: stripPng(bytes) };
  if (type === "image/webp") return { ok: true, bytes: stripWebp(bytes) };
  if (type === "application/pdf") {
    const text = new TextDecoder("latin1").decode(bytes);
    if (ACTIVE_PDF.test(text)) return { ok: false, reason: "active_content", detail: "PDFs with scripts, launch actions or embedded files aren’t accepted." };
  }
  return { ok: true, bytes };
}

/** Scan with the ClamAV gateway contract `{ clean: boolean, signature?: string }`. Any HTTP error, timeout or malformed reply is
 *  `scanner_unavailable` (fail closed). `fetchImpl` is injectable so tests can mock the gateway (EICAR reply) without a network. */
export async function scanWith(o: { url: string; token: string; fetchImpl?: typeof fetch; timeoutMs?: number }, bytes: Uint8Array): Promise<Verdict> {
  try {
    const r = await (o.fetchImpl ?? fetch)(`${o.url.replace(/\/+$/, "")}/scan`, { method: "POST", body: new Uint8Array(bytes),
      headers: { Authorization: `Bearer ${o.token}`, "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(o.timeoutMs ?? 20_000) });
    const j = await r.json().catch(() => ({})) as { clean?: boolean; signature?: string };
    if (!r.ok || typeof j.clean !== "boolean") return { ok: false, reason: "scanner_unavailable" };
    return j.clean === true ? { ok: true, bytes } : { ok: false, reason: "infected", detail: typeof j.signature === "string" ? j.signature.slice(0, 120) : undefined };
  } catch { return { ok: false, reason: "scanner_unavailable" }; }
}
