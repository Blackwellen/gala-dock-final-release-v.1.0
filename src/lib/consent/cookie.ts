/**
 * The `gd_consent` cookie holds every cookie choice a visitor has made, comma-separated (`referral:yes,analytics:no`).
 * Writers must merge — replace only their own purpose — never overwrite the whole value (W01 / coordinator decision 1).
 * Readers: `cookieConsent()` (analytics), `consentOf()` (partner referral), `/r/[code]` (promoter referral).
 */
export const CONSENT_COOKIE = "gd_consent";
export const CONSENT_MAX_AGE = 365 * 86400;
export type ConsentPurpose = "analytics" | "referral";

/** Returns the new cookie value with `purpose` set to yes/no and every other recorded choice kept (order kept, deduped). */
export function mergeConsent(raw: string | null | undefined, purpose: ConsentPurpose, yes: boolean): string {
  let decoded = raw ?? "";
  try { decoded = decodeURIComponent(decoded); } catch { /* keep as is */ }
  const kept: string[] = [];
  for (const part of decoded.split(",").map(s => s.trim())) {
    if (!/^[a-z_]{1,24}:(yes|no)$/.test(part)) continue; // drop anything malformed
    if (part.startsWith(`${purpose}:`) || kept.some(k => k.split(":")[0] === part.split(":")[0])) continue;
    kept.push(part);
  }
  return [...kept, `${purpose}:${yes ? "yes" : "no"}`].join(",");
}

/** Cookie options shared by every writer (strictly necessary to remember the choice: 12 months, httpOnly). */
export const consentCookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure, maxAge: CONSENT_MAX_AGE, path: "/" });
