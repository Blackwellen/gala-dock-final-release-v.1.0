/**
 * Q63 global search: pure helpers shared by the top-bar search (src/components/search/global-search.tsx) and its tests.
 * Client-safe (no server imports).
 */
export type SearchHit = { kind: string; id: string; title: string; subtitle: string; link: string };

export const GROUP_LABEL: Record<string, string> = {
  event: "Events", person: "Guests", client: "Clients", venue: "Venues", service: "Services", provider: "Providers", booking: "Bookings",
  ticket: "Tickets", lead: "Leads", proposal: "Proposals", contract: "Contracts", invoice: "Invoices", file: "Media",
  user: "Users", workspace: "Workspaces", case: "Support cases",
};
export const groupLabel = (kind: string) => GROUP_LABEL[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

/** The admin console's top bar searches platform records (admin_global_search) instead of a workspace. */
export const ADMIN_SEAT = "admin";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MIN_QUERY = 2;
export const normaliseQuery = (q: string) => q.replace(/\s+/g, " ").trim().slice(0, 80);
export const isSearchable = (q: string) => normaliseQuery(q).length >= MIN_QUERY;

/** Request URL for a query in a seat: a workspace id, the admin console, or null (personal/customer). */
export function searchUrl(q: string, seat?: string | null) {
  const p = new URLSearchParams({ q: normaliseQuery(q) });
  if (seat === ADMIN_SEAT) p.set("scope", "admin");
  else if (seat && UUID.test(seat)) p.set("ws", seat);
  return `/api/search?${p.toString()}`;
}

/**
 * Groups hits by kind, groups ordered by their best (first) hit, and returns the flat list in the SAME order the panel renders,
 * so ↑/↓ move visually one row at a time. (The API orders by score across kinds; grouping without re-flattening made the
 * keyboard jump between groups.) Duplicate kind+id pairs are dropped.
 */
export function groupHits(hits: SearchHit[]) {
  const groups = new Map<string, SearchHit[]>(), seen = new Set<string>();
  for (const h of hits) {
    const key = `${h.kind}:${h.id}`;
    if (seen.has(key) || !h.link) continue;
    seen.add(key);
    const list = groups.get(h.kind);
    if (list) list.push(h); else groups.set(h.kind, [h]);
  }
  const ordered = [...groups.entries()].map(([kind, list]) => ({ kind, label: groupLabel(kind), hits: list }));
  return { groups: ordered, flat: ordered.flatMap(g => g.hits) };
}

/** Wrapping arrow-key movement over n options (−1 = nothing active). */
export function moveActive(current: number, delta: 1 | -1, n: number) {
  if (n <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : n - 1;
  return (current + delta + n) % n;
}

/** User-facing message for a failed search response (never the raw server error). */
export function errorMessage(status: number) {
  if (status === 401) return "Your session has ended. Sign in again to search.";
  if (status === 403) return "You don't have access to search this workspace.";
  if (status === 429) return "You're searching very fast. Wait a moment and try again.";
  return "Search isn't available right now. Try again.";
}

export const shortcutLabel = (platform: string) => (/mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K");

// ── recents: the last results a person opened, per seat, in this browser only ─────────────────────────────────────────────────
export const RECENT_MAX = 6;
export const RECENT_PREFIX = "gd_gs_recent:";   // cleared on sign-out (src/components/pwa.tsx)
export const recentKey = (seat?: string | null) => `${RECENT_PREFIX}${seat || "personal"}`;
/** People records (guests, clients, leads, users, support cases) are never kept on the device. */
export const RECENT_PII = new Set(["person", "client", "lead", "user", "case"]);
/** Only internal app paths are ever stored or replayed (never an absolute or protocol-relative URL). */
export const safeLink = (link: unknown): link is string => typeof link === "string" && link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\");

export function pushRecent(list: SearchHit[], hit: SearchHit, max = RECENT_MAX): SearchHit[] {
  if (!safeLink(hit.link) || RECENT_PII.has(hit.kind)) return list;
  const item = { kind: hit.kind, id: hit.id, title: hit.title, subtitle: hit.subtitle, link: hit.link };
  return [item, ...list.filter(r => !(r.kind === hit.kind && r.id === hit.id))].slice(0, max);
}

export function parseRecents(raw: string | null): SearchHit[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(r => r && typeof r.kind === "string" && !RECENT_PII.has(r.kind) && typeof r.id === "string" && typeof r.title === "string" && safeLink(r.link))
      .map(r => ({ kind: r.kind, id: r.id, title: r.title, subtitle: typeof r.subtitle === "string" ? r.subtitle : "", link: r.link })).slice(0, RECENT_MAX);
  } catch { return []; }
}
