// Pure-JS barcode decoding for scanners without BarcodeDetector (iOS Safari, Firefox, most desktop Chrome). Runs entirely on
// the device: pixels in, text out — nothing is uploaded. The same module is used by the Node decode spec
// (tests/release/ticket-scan-decode.spec.ts), so what the tests decode is exactly what the door scanner decodes.
// Library: @zxing/library (Apache-2.0), loaded only through a dynamic import() from frame-decoder.ts.
// Per-format readers rather than MultiFormatReader: the latter console.warns on every frame without a code.
import { BinaryBitmap, Code128Reader, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

export type ScanFormat = "qr_code" | "code_128";
/**
 * zxing's QR finder-pattern search misses ~5% of clean symbols at particular sizes (PURE_BARCODE reads every one of them, so the
 * data is fine); the same image resampled to another scale is found. A camera scanner runs one scale per frame (FRAME_CYCLE)
 * so each tick costs one pass and ~2.4 s of frames covers them all; a still image tries them all in one call.
 */
export const QR_SCALES = [1, 0.7, 0.5, 0.8, 0.6] as const;
/** Per-frame schedule for the camera loop: every other frame is full size (QR + Code 128), the rest cycle the QR rescales. */
export const FRAME_CYCLE = [1, 0.7, 1, 0.5, 1, 0.8, 1, 0.6] as const;
export type LumaReader = { decode: (rgba: ArrayLike<number>, width: number, height: number, scales?: readonly number[]) => string | null };

/** A reader for the given formats. TRY_HARDER: a door is a hard place to scan (glare, angle, small phones). */
export function createLumaReader(formats: ScanFormat[] = ["qr_code", "code_128"]): LumaReader {
  const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);
  const readers = formats.map(f => (f === "qr_code" ? new QRCodeReader() : new Code128Reader()));
  const attempt = (l: Uint8ClampedArray, w: number, h: number, qrOnly: boolean) => {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(l, w, h)));
    for (const r of readers) {
      if (qrOnly && !(r instanceof QRCodeReader)) continue;   // resampling destroys 1D bars; Code 128 reads at full scale only
      try { return r.decode(bitmap, hints).getText(); }
      catch { /* NotFound / Checksum / Format: not this format in this frame */ }
      finally { r.reset(); }
    }
    return null;
  };
  return {
    /** Decodes one image. `scales` (default: all of QR_SCALES) are tried in order; 1 = full size, any format. */
    decode(rgba, width, height, scales = QR_SCALES) {
      // RGBA → 8-bit luminance (BT.601 integer weights). Transparent pixels read as white, as on a screen or paper.
      const lum = new Uint8ClampedArray(width * height);
      for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
        const a = rgba[p + 3]!, y = (rgba[p]! * 306 + rgba[p + 1]! * 601 + rgba[p + 2]! * 117) >> 10;
        lum[i] = a === 255 ? y : (y * a + 255 * (255 - a)) / 255;
      }
      for (const k of scales) {
        if (k === 1) { const hit = attempt(lum, width, height, false); if (hit) return hit; continue; }
        if (!formats.includes("qr_code")) continue;
        const w2 = Math.round(width * k), h2 = Math.round(height * k);
        if (Math.min(w2, h2) < 48) continue;
        const hit = attempt(downsample(lum, width, height, w2, h2), w2, h2, true);
        if (hit) return hit;
      }
      return null;
    },
  };
}

/** Area-average resample of a luminance plane (box filter over each output pixel's source footprint). */
function downsample(src: Uint8ClampedArray, w: number, h: number, w2: number, h2: number) {
  const out = new Uint8ClampedArray(w2 * h2), sx = w / w2, sy = h / h2;
  for (let y = 0; y < h2; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(h, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w2; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(w, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += src[yy * w + xx]!;
      out[y * w2 + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}
