// Q55 · Per-photo alt text for listing photos (venues and services). Stored as listings.details.photo_alt: { [photoUrl]: text }.
// Pure, so the server action, the editor and the public page agree and tests/release can load it.

export const PHOTO_ALT_MAX = 140;

/** Only photos still on the listing keep alt text; text is single-line, trimmed and capped; blanks are dropped. */
export function cleanPhotoAlts(photos: string[], alts: unknown): Record<string, string> {
  if (!alts || typeof alts !== "object" || Array.isArray(alts)) return {};
  const src = alts as Record<string, unknown>, out: Record<string, string> = {};
  for (const p of photos) {
    const v = src[p];
    if (typeof v !== "string") continue;
    const t = v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, PHOTO_ALT_MAX);
    if (t) out[p] = t;
  }
  return out;
}

/** Alt text for a public photo: what the provider wrote, else a neutral fallback ("<name> photo 3"). */
export function photoAlt(details: unknown, url: string, fallback: string): string {
  const m = details && typeof details === "object" ? (details as { photo_alt?: unknown }).photo_alt : null;
  const v = m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>)[url] : null;
  return typeof v === "string" && v.trim() ? v.trim().slice(0, PHOTO_ALT_MAX) : fallback;
}
