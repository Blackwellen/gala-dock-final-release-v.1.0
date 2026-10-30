"use client";
import { normalisePath, type TrackInput } from "./events";

/**
 * Q35 browser helper: batches product events and sends them to /api/analytics/capture with sendBeacon (fetch keepalive
 * fallback). Never sends query strings, ids in paths or free text; the server re-validates everything. Honours Do Not Track /
 * Global Privacy Control by not sending at all. No cookie or local storage is written by analytics.
 */
const queue: (TrackInput & { at: string })[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function optedOut() {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.doNotTrack === "1" || n.globalPrivacyControl === true;
}

function flush() {
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ events: queue.splice(0, 50), standalone: matchMedia?.("(display-mode: standalone)").matches ?? false });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/analytics/capture", blob)) {
      void fetch("/api/analytics/capture", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch { /* analytics must never break the page */ }
  if (queue.length) timer = setTimeout(flush, 1000);
}

export function track(input: TrackInput) {
  if (typeof window === "undefined" || optedOut()) return;
  queue.push({ ...input, path: normalisePath(input.path ?? location.pathname), at: new Date().toISOString() });
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(flush, 2000);
}

if (typeof window !== "undefined") addEventListener("pagehide", flush);
