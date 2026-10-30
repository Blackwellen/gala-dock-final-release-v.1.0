// Shared by the scan decode spec (tests/release/ticket-scan-decode.spec.ts) and the camera spec (tests/e2e/scanner-camera.spec.ts):
// render a ticket credential exactly as the app does (qrcode SVG, code128Svg, print PNG, PDF image), rasterise it with sharp,
// and decode it with the same on-device decoder the scanners lazy-load (src/lib/tickets/zxing-decode.ts).
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import QRCode from "qrcode";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFDict, PDFArray } from "pdf-lib";
import { createLumaReader, type ScanFormat } from "../../src/lib/tickets/zxing-decode";
import { code128Svg } from "../../src/lib/tickets/code128";

export type Raw = { data: Uint8Array; width: number; height: number };

/** Any image buffer → RGBA pixels on white (transparent areas read as paper/screen white). */
export async function toRaw(input: Buffer | ReturnType<typeof sharp>): Promise<Raw> {
  const s = Buffer.isBuffer(input) ? sharp(input) : input;
  const { data, info } = await s.flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const readers = new Map<string, ReturnType<typeof createLumaReader>>();
/** Decodes with the scanner's fallback decoder. */
export function decode(img: Raw, formats: ScanFormat[] = ["qr_code", "code_128"]) {
  const key = formats.join();
  if (!readers.has(key)) readers.set(key, createLumaReader(formats));
  return readers.get(key)!.decode(img.data, img.width, img.height);
}

/**
 * Decode the way the camera loop does: consecutive frames of a hand-held code differ slightly in size, and the scanner keeps the
 * first hit. `render(px)` draws the code; sizes px, ±3 % and ±6 % stand in for five consecutive frames. Returns the text and
 * the number of frames it took (1 = first frame).
 */
export async function decodeFrames(render: (px: number) => Promise<Buffer>, px: number, formats?: ScanFormat[]) {
  const sizes = [px, Math.round(px * 1.03), Math.round(px * 0.97), Math.round(px * 1.06), Math.round(px * 0.94)];
  for (let i = 0; i < sizes.length; i++) { const t = decode(await toRaw(await render(sizes[i]!)), formats); if (t) return { text: t, frames: i + 1 }; }
  return { text: null, frames: sizes.length };
}

/** The wallet QR exactly as TicketCredential renders it (qrcode SVG, ECC M, margin 1), rasterised at `px` × `px`. */
export async function qrSvg(payload: string) { return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 1 }); }
export async function qrPng(payload: string, px: number) {
  return sharp(Buffer.from(await qrSvg(payload)), { density: 600 }).resize(px, px, { fit: "fill" }).png().toBuffer();
}

/**
 * The Code 128 SVG exactly as TicketCredential renders it (height 90, module 1), drawn at `width` × `height` px — i.e. what the
 * browser rasterises after CSS scales it to its card (width: auto; max-width: 100%). The SVG's own size attributes are replaced,
 * so librsvg applies the same viewBox scaling and shape-rendering as a browser.
 */
export function barcodeSvg(payload: string, height = 90) { return code128Svg(payload, { height, module: 1 }); }
export function barcodeNaturalWidth(payload: string) { return Number(/width="(\d+)"/.exec(barcodeSvg(payload))![1]); }
export async function barcodePng(payload: string, width: number, height: number) {
  const svg = barcodeSvg(payload, 90).replace(/ width="\d+" height="\d+"/, ` width="${width}" height="${height}"`);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * A camera-like frame: the code on a phone-screen white card, slightly rotated, on a grey background, softly blurred.
 * `codePx` is the code's size in the frame; the rest is background, as when door staff hold the phone up to a ticket.
 */
export async function cameraFrame(code: Buffer, opts: { width?: number; height?: number; rotate?: number; blur?: number; pad?: number } = {}) {
  const { width = 1280, height = 720, rotate = 6, blur = 0.6, pad = 24 } = opts;
  const card = await sharp(code).extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#ffffff" }).rotate(rotate, { background: { r: 118, g: 122, b: 130, alpha: 1 } }).png().toBuffer();
  const m = await sharp(card).metadata();
  const scale = Math.min(1, (width * 0.9) / m.width!, (height * 0.9) / m.height!);
  const placed = scale < 1 ? await sharp(card).resize(Math.round(m.width! * scale)).png().toBuffer() : card;
  const pm = await sharp(placed).metadata();
  const frame = await sharp({ create: { width, height, channels: 3, background: { r: 118, g: 122, b: 130 } } })
    .composite([{ input: placed, left: Math.round((width - pm.width!) / 2), top: Math.round((height - pm.height!) / 2) }]).png().toBuffer();
  return blur > 0 ? sharp(frame).blur(blur).png().toBuffer() : frame;
}

/** The print page's QR: the data URL in /account/tickets/[id]/print (static print credential, 600 px PNG). */
export function printPageQr(html: string) {
  const m = /src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/.exec(html);
  return m ? Buffer.from(m[1]!, "base64") : null;
}

/**
 * Extracts the raster images embedded in a PDF (pdf-lib writes PNGs as FlateDecode RGB/Gray XObjects with an SMask for alpha).
 * Returns RGBA pixels per image (alpha dropped: the QR is opaque on white). Handles PNG predictors if a writer used them.
 */
export async function pdfImages(bytes: Uint8Array): Promise<Raw[]> {
  const doc = await PDFDocument.load(bytes);
  const out: Raw[] = [];
  const masks = new Set<string>();
  const all = doc.context.enumerateIndirectObjects();
  for (const [, obj] of all) if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("SMask"))) masks.add(String(obj.dict.get(PDFName.of("SMask"))));
  for (const [ref, obj] of all) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image") || masks.has(String(ref))) continue;
    const num = (k: string) => (obj.dict.get(PDFName.of(k)) as PDFNumber | undefined)?.asNumber();
    const w = num("Width")!, h = num("Height")!, bpc = num("BitsPerComponent") ?? 8;
    const cs = obj.dict.get(PDFName.of("ColorSpace")), filter = obj.dict.get(PDFName.of("Filter"));
    const channels = cs === PDFName.of("DeviceGray") ? 1 : cs === PDFName.of("DeviceRGB") ? 3 : 0;
    const flate = filter === PDFName.of("FlateDecode") || (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === PDFName.of("FlateDecode"));
    if (!channels || bpc !== 8 || !flate) continue;
    let px: Uint8Array = inflateSync(obj.contents);
    const parms = obj.dict.get(PDFName.of("DecodeParms"));
    const predictor = parms instanceof PDFDict ? (parms.get(PDFName.of("Predictor")) as PDFNumber | undefined)?.asNumber() ?? 1 : 1;
    if (predictor >= 10) px = unfilterPng(px, w, h, channels);
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const r = px[i * channels]!, g = channels === 3 ? px[i * 3 + 1]! : r, b = channels === 3 ? px[i * 3 + 2]! : r;
      rgba.set([r, g, b, 255], i * 4);
    }
    out.push({ data: rgba, width: w, height: h });
  }
  return out;
}
function unfilterPng(src: Uint8Array, w: number, h: number, bpp: number) {
  const stride = w * bpp, out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = src[y * (stride + 1)]!, row = src.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp]! : 0, b = y ? out[o - stride + x]! : 0, c = x >= bpp && y ? out[o - stride + x - bpp]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      out[o + x] = (row[x]! + pred) & 255;
    }
  }
  return out;
}

/**
 * A Y4M (YUV4MPEG2, 4:2:0) clip for Chromium's --use-file-for-fake-video-capture. Each entry of `frames` is shown for `repeat`
 * frames at `fps`; Chromium loops the file, so a sequence [code, blank] makes the scanner see the ticket, lose it, see it again.
 */
export async function y4m(frames: Buffer[], opts: { width?: number; height?: number; fps?: number; repeat?: number } = {}) {
  const { width = 1280, height = 720, fps = 10, repeat = 20 } = opts;
  const parts: Buffer[] = [Buffer.from(`YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg\n`)];
  for (const f of frames) {
    const { data } = await sharp(f).resize(width, height, { fit: "contain", background: "#767a82" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const Y = Buffer.alloc(width * height), U = Buffer.alloc((width / 2) * (height / 2)), V = Buffer.alloc((width / 2) * (height / 2));
    for (let i = 0; i < width * height; i++) { const r = data[i * 3]!, g = data[i * 3 + 1]!, b = data[i * 3 + 2]!; Y[i] = Math.max(0, Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b))); }
    for (let y = 0; y < height / 2; y++) for (let x = 0; x < width / 2; x++) {
      let r = 0, g = 0, b = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) { const p = ((y * 2 + dy) * width + x * 2 + dx) * 3; r += data[p]!; g += data[p + 1]!; b += data[p + 2]!; }
      r /= 4; g /= 4; b /= 4;
      U[y * (width / 2) + x] = Math.max(0, Math.min(255, Math.round(-0.169 * r - 0.331 * g + 0.5 * b + 128)));
      V[y * (width / 2) + x] = Math.max(0, Math.min(255, Math.round(0.5 * r - 0.419 * g - 0.081 * b + 128)));
    }
    const frame = Buffer.concat([Buffer.from("FRAME\n"), Y, U, V]);
    for (let i = 0; i < repeat; i++) parts.push(frame);
  }
  return Buffer.concat(parts);
}
