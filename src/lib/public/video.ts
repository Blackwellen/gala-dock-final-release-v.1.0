/**
 * Hero / page video (owner decision 2026-10-29): YouTube and Vimeo only, parsed strictly to an id; the embed URL is built here
 * (privacy mode: youtube-nocookie, Vimeo dnt=1) and the raw link is never iframed. Pure — used by the page editor action and the pages.
 */
export type Video = { provider: "youtube" | "vimeo"; id: string; hash?: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/, VM_ID = /^\d{6,12}$/, VM_HASH = /^[0-9a-f]{6,24}$/i;

export function parseVideo(raw: unknown): Video | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  let u: URL; try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase(), seg = u.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return seg.length === 1 && YT_ID.test(seg[0]!) ? { provider: "youtube", id: seg[0]! } : null;
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(host)) {
    const id = seg[0] === "watch" && seg.length === 1 ? u.searchParams.get("v") : ["embed", "shorts", "live"].includes(seg[0] ?? "") && seg.length === 2 ? seg[1]! : null;
    return id && YT_ID.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    if (!seg.length || !VM_ID.test(seg[0]!) || seg.length > 2) return null;
    const hash = seg[1] ?? u.searchParams.get("h") ?? undefined;
    return hash && !VM_HASH.test(hash) ? null : { provider: "vimeo", id: seg[0]!, ...(hash ? { hash } : {}) };
  }
  if (host === "player.vimeo.com") {
    if (seg[0] !== "video" || seg.length !== 2 || !VM_ID.test(seg[1]!)) return null;
    const hash = u.searchParams.get("h") ?? undefined;
    return hash && !VM_HASH.test(hash) ? null : { provider: "vimeo", id: seg[1]!, ...(hash ? { hash } : {}) };
  }
  return null;
}

/** Embed URL we build ourselves from the parsed id (never the stored link). */
export function embedUrl(v: Video): string {
  if (v.provider === "youtube") return `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  return `https://player.vimeo.com/video/${v.id}?dnt=1&autoplay=1${v.hash ? `&h=${v.hash}` : ""}`;
}
/** Canonical watch link (for "open on YouTube / Vimeo"). */
export function watchUrl(v: Video): string {
  return v.provider === "youtube" ? `https://www.youtube.com/watch?v=${v.id}` : `https://vimeo.com/${v.id}${v.hash ? `/${v.hash}` : ""}`;
}
