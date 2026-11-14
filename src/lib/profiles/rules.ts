/**
 * Q62 profile builders (operator / organiser / customer): pure rules shared by the settings actions, the provider reviews page and
 * the public profile pages. No I/O — tests import it directly.
 */

export const REPLY_MAX = 2000;

/** Provider reply to a review: trimmed, 2–2,000 characters (respond_to_review refuses the same; it used to cut silently at 2,000). */
export function reviewReplyProblem(body: unknown): string | null {
  const b = typeof body === "string" ? body.trim() : "";
  if (b.length < 2) return "Write a reply first.";
  if (b.length > REPLY_MAX) return `Keep your reply under ${REPLY_MAX.toLocaleString("en-GB")} characters.`;
  return null;
}

/** respond_to_review / moderate_review_response errors → copy a provider can act on. */
export function reviewReplyError(message: string | null | undefined): string {
  const m = message ?? "";
  if (/not_authorized/.test(m)) return "Only the workspace owner or a manager can reply to reviews.";
  if (/review_not_published/.test(m)) return "This review isn't published, so it can't be replied to.";
  if (/reply_hidden/.test(m)) return "Gala Dock removed your reply to this review. Contact support if you think that was a mistake.";
  if (/reply_too_long/.test(m)) return `Keep your reply under ${REPLY_MAX.toLocaleString("en-GB")} characters.`;
  if (/empty/.test(m)) return "Write a reply first.";
  if (/rate_limited/.test(m)) return "Too many replies in a short time. Try again later.";
  if (/not_found/.test(m)) return "That review no longer exists.";
  return "Couldn't save your reply. Nothing was changed — please try again.";
}

/** The public page shows a reply only when there is text and moderation hasn't hidden it. */
export function publicReply(r: { provider_response?: string | null; response_status?: string | null }): string | null {
  const t = (r.provider_response ?? "").trim();
  return t && r.response_status !== "hidden" ? t : null;
}

/**
 * Workspace cover image: only an image this workspace uploaded through the files pipeline (/api/files/public-media → event-media
 * bucket, <workspace>/<uuid>.<ext>, type-sniffed, metadata-stripped and scanned). Free-text URLs bypassed the scan and hot-linked
 * third-party images onto public pages.
 */
export function workspaceCoverUrlOk(url: unknown, workspaceId: string): boolean {
  if (typeof url !== "string" || url.length > 500 || !/^[0-9a-f-]{36}$/i.test(workspaceId)) return false;
  let u: URL; try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.search || u.hash) return false;
  return new RegExp(`^/storage/v1/object/public/event-media/${workspaceId.toLowerCase()}/[0-9a-f-]{36}\\.(png|jpg|jpeg|webp)$`, "i").test(u.pathname);
}

/** Organiser website from settings (stored with or without a scheme) → a safe https link, or null. */
export function websiteHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim(); if (!s || s.length > 200) return null;
  let u: URL; try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname)) return null;
  u.protocol = "https:";
  return u.toString();
}

/** schema.org Organization for an organiser profile (only facts shown on the page). */
export function organizerJsonLd(o: { name: string; url: string; description: string | null; image: string | null; website: string | null }) {
  return { "@context": "https://schema.org", "@type": "Organization", name: o.name, url: o.url, ...(o.description ? { description: o.description } : {}),
    ...(o.image ? { image: o.image } : {}), ...(o.website ? { sameAs: [o.website] } : {}) };
}

/** JSON-LD is embedded in a <script>: escape "<" so text can't close the tag. */
export const jsonLdScript = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
