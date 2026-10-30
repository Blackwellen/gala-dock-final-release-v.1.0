"use client";

import type { ScanFormat } from "./zxing-decode";

// Camera-frame decoding shared by both scanners (TicketScanner, CheckInScanner). BarcodeDetector is used where the browser has it
// for the formats we need; otherwise the pure-JS zxing fallback is lazy-loaded (its own chunk — it never enters other bundles).
// Frames are read from the local <video> into an offscreen canvas and decoded on the device; nothing is sent anywhere.
export type FrameDecoder = { kind: "native" | "zxing"; detect: (video: HTMLVideoElement) => Promise<string | null> };
type NativeDetector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type NativeCtor = (new (o: { formats: string[] }) => NativeDetector) & { getSupportedFormats?: () => Promise<string[]> };

/** Longest side of the frame handed to zxing: a 56-character Code 128 needs ~670 modules, so 1280 px keeps ≥1.5 px per module
 *  when the barcode fills most of the frame; a QR decodes far smaller. Frames are captured at up to 1280×720 (CAMERA). */
const MAX_SIDE = 1280;
export const CAMERA: MediaStreamConstraints = { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

/** True when the device can open a camera at all (decoding is always possible: native or fallback). */
export const cameraAvailable = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

async function nativeDecoder(formats: ScanFormat[]): Promise<FrameDecoder | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: NativeCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const have = (await Ctor.getSupportedFormats?.()) ?? formats;
    const use = formats.filter(f => have.includes(f));
    if (!use.includes("qr_code")) return null;   // e.g. desktop Chrome exposes the API with no formats
    const det = new Ctor({ formats: use });
    return { kind: "native", detect: async v => (await det.detect(v))[0]?.rawValue ?? null };
  } catch { return null; }   // constructor rejects the formats → fall back
}

async function zxingDecoder(formats: ScanFormat[]): Promise<FrameDecoder> {
  const { createLumaReader, FRAME_CYCLE } = await import("./zxing-decode");
  const reader = createLumaReader(formats);
  let tick = 0;   // one pass per frame (FRAME_CYCLE): full size every other frame, QR rescales between
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas_unavailable");
  return {
    kind: "zxing",
    detect: async v => {
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h || v.readyState < 2) return null;   // HAVE_CURRENT_DATA
      const s = Math.min(1, MAX_SIDE / Math.max(w, h)), cw = Math.round(w * s), ch = Math.round(h * s);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      ctx.drawImage(v, 0, 0, cw, ch);
      return reader.decode(ctx.getImageData(0, 0, cw, ch).data, cw, ch, [FRAME_CYCLE[tick++ % FRAME_CYCLE.length]!]);
    },
  };
}

/** Native BarcodeDetector when it supports the formats, otherwise the zxing fallback. */
export async function createFrameDecoder(formats: ScanFormat[] = ["qr_code", "code_128"]): Promise<FrameDecoder> {
  return (await nativeDecoder(formats)) ?? zxingDecoder(formats);
}

/**
 * Polls the video every `intervalMs` and hands each new code to `onCode` (the scanner's own submit). The same code is ignored
 * for 3 s so a ticket held in front of the camera is submitted once; `active()` stops the loop when the camera is closed.
 */
export function runScanLoop(opts: { decoder: FrameDecoder; video: () => HTMLVideoElement | null; active: () => boolean; onCode: (v: string) => Promise<void>; intervalMs?: number }) {
  const last = { v: "", t: 0 };
  const tick = async () => {
    if (!opts.active()) return;
    const v = opts.video();
    if (v) {
      try {
        const code = await opts.decoder.detect(v);
        if (code && (code !== last.v || Date.now() - last.t > 3000)) { last.v = code; last.t = Date.now(); await opts.onCode(code); }
      } catch { /* frame not ready */ }
    }
    setTimeout(() => void tick(), opts.intervalMs ?? 300);
  };
  void tick();
}
