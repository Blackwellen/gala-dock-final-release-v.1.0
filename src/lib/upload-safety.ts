import "server-only";
import { sanitize, scanWith, type Verdict } from "@/lib/files/safety-core";

/**
 * Upload sanitising and malware scanning (release spec §74; Q04). The pure rules live in `src/lib/files/safety-core.ts`.
 * Malware: when CLAMAV_SCAN_URL + CLAMAV_SCAN_TOKEN are configured (the shared Blackwellen ClamAV gateway —
 * docs/operations/oracle-setup.md §Malware scanning), every file is scanned. Unconfigured → files are still sanitised, the verdict is
 * recorded as `not_scanned`, and sensitive/private-document classes stay quarantined (not downloadable) until a clean verdict.
 */
export { sanitize, type Verdict } from "@/lib/files/safety-core";

export const scannerConfigured = () => Boolean(process.env.CLAMAV_SCAN_URL && process.env.CLAMAV_SCAN_TOKEN);
/** Half-configured scanner = misconfiguration → fail closed. */
export const scannerMisconfigured = () => !scannerConfigured() && Boolean(process.env.CLAMAV_SCAN_URL || process.env.CLAMAV_SCAN_TOKEN);

/** Scans with the shared ClamAV gateway. Not configured → `{ ok: true }` (caller records `not_scanned`); misconfigured or unreachable → refused. */
export async function scan(bytes: Uint8Array): Promise<Verdict> {
  if (!scannerConfigured()) return scannerMisconfigured() ? { ok: false, reason: "scanner_unavailable" } : { ok: true, bytes };
  return scanWith({ url: process.env.CLAMAV_SCAN_URL!, token: process.env.CLAMAV_SCAN_TOKEN! }, bytes);
}

/** Sanitise then scan. Returns the bytes to store. */
export async function checkUpload(bytes: Uint8Array, type: string): Promise<Verdict> {
  const s = sanitize(bytes, type); if (!s.ok) return s;
  return scan(s.bytes);
}
export const verdictMessage = (v: Exclude<Verdict, { ok: true }>) => v.reason === "infected" ? "This file was blocked by our malware scanner."
  : v.reason === "active_content" ? v.detail ?? "This file contains active content and can’t be uploaded." : "We couldn’t scan this file right now. Please try again in a minute.";
