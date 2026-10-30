import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Public directory reads (Q23 lane A: directory_events, directory_facets, calendar_window/calendar_events, series_page,
 * landing_page, event_share_card). All are SECURITY INVOKER over `event_distribution`, so only listed public events appear —
 * private, draft, restricted and ended events never do. Ranking reasons / scores (directory_related.why/score) are dropped here
 * and must never reach a page. Sponsored rows stay separate from the chronological organic list.
 */
export type DirEvent = { id: string; name: string; slug: string | null; event_type: string | null; city: string | null; venue_name: string | null;
  starts_at: string; ends_at: string | null; timezone: string | null; cover_image: string | null; from_price?: number | null };
export type Featured = { event: DirEvent; kind: "editorial" | "sponsored"; label: string | null; sponsored: boolean };
export type Directory = { total: number; events: DirEvent[]; featured: Featured[] };
export type Facets = { cities: { key: string; events: number }[]; categories: { key: string; events: number }[] };
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpcOf = (sb: SupabaseClient): Rpc => (fn, args) => sb.rpc(fn, args) as unknown as ReturnType<Rpc>;

const EVENT_COLS = "id,name,slug,event_type,city,venue_name,starts_at,ends_at,timezone,cover_image";

/** Lowest public tier price per event (null = no priced tier; 0 = free). One query for a page of events. */
async function withPrices(sb: SupabaseClient, list: DirEvent[]) {
  if (!list.length) return list;
  const { data } = await sb.from("ticket_tiers").select("event_id,price,status").in("event_id", list.map(e => e.id)).not("status", "in", "(draft,hidden)");
  const min = new Map<string, number>();
  for (const t of (data ?? []) as { event_id: string; price: number | string | null }[]) {
    const p = Number(t.price ?? NaN); if (!Number.isFinite(p)) continue;
    min.set(t.event_id, Math.min(min.get(t.event_id) ?? Infinity, p));
  }
  return list.map(e => ({ ...e, from_price: min.has(e.id) ? min.get(e.id)! : null }));
}

export async function directory(sb: SupabaseClient, scope: "all" | "city" | "category" | "venue" | "organizer" | "series", key: string | null,
  opt: { from?: string | null; to?: string | null; limit?: number; offset?: number } = {}): Promise<Directory> {
  const { data, error } = await rpcOf(sb)("directory_events", { p_scope: scope, p_key: key, p_from: opt.from ?? null, p_to: opt.to ?? null, p_limit: opt.limit ?? 24, p_offset: opt.offset ?? 0 });
  if (error || !data) return { total: 0, events: [], featured: [] };
  const d = data as { total: number; events: DirEvent[]; featured: { event_id: string; kind: "editorial" | "sponsored"; label: string | null; sponsored: boolean }[] };
  let featured: Featured[] = [];
  if (d.featured?.length) {
    const { data: fe } = await sb.from("events_public").select(EVENT_COLS).in("id", d.featured.map(f => f.event_id));
    const byId = new Map(((fe ?? []) as DirEvent[]).map(e => [e.id, e]));
    featured = d.featured.flatMap(f => byId.get(f.event_id) ? [{ event: byId.get(f.event_id)!, kind: f.kind, label: f.label, sponsored: f.sponsored }] : []);
  }
  const events = await withPrices(sb, d.events ?? []);
  return { total: Number(d.total ?? 0), events, featured };
}

export async function facets(sb: SupabaseClient): Promise<Facets> {
  const { data } = await rpcOf(sb)("directory_facets");
  const f = (data ?? {}) as Partial<Facets>;
  return { cities: f.cities ?? [], categories: f.categories ?? [] };
}

export type CalendarRange = "today" | "weekend" | "month";
export type CalendarDay = { date: string; events: (DirEvent & { local_start: string })[] };
export type Calendar = { range: CalendarRange; from: string; to: string; local_from: string; local_to: string; total: number; days: CalendarDay[]; featured: Directory["featured"] };

export async function calendar(sb: SupabaseClient, range: CalendarRange, anchor: string | null, scope = "all", key: string | null = null, limit = 100): Promise<Calendar | null> {
  const { data, error } = await rpcOf(sb)("calendar_events", { p_range: range, p_tz: "Europe/London", p_scope: scope, p_key: key, p_anchor: anchor, p_limit: limit });
  if (error || !data) return null;
  const c = data as Omit<Calendar, "featured"> & { featured: unknown };
  return { ...c, total: Number(c.total ?? 0), featured: [] };
}

export type SeriesPage = { id: string; slug: string; name: string; kind: string; description: string | null; branding: Record<string, unknown> | null;
  occurrences: { id: string; name: string; slug: string | null; starts_at: string; city: string | null; venue_name: string | null }[] };
export async function seriesPage(sb: SupabaseClient, slug: string): Promise<SeriesPage | null> {
  const { data, error } = await rpcOf(sb)("series_page", { p_slug: slug });
  return error || !data ? null : data as SeriesPage;
}

export type LandingPage = { slug: string; title: string; intro: string | null; hero: { url: string; alt_text: string | null; credit: string | null } | null;
  events: { id: string; name: string; slug: string | null; starts_at: string; city: string | null; cover_image: string | null }[]; sponsored: { event_id: string; label: string | null }[] };
export async function landingPage(sb: SupabaseClient, slug: string): Promise<LandingPage | null> {
  const { data, error } = await rpcOf(sb)("landing_page", { p_slug: slug });
  return error || !data ? null : data as LandingPage;
}

export type ShareCard = { title: string; description: string; url: string; image: string | null; starts_at: string | null; timezone: string | null; city: string | null; indexable: boolean };
/** Link-preview data for listed public events only; null → no Open Graph preview and noindex. */
export async function shareCard(sb: SupabaseClient, eventId: string): Promise<ShareCard | null> {
  const { data, error } = await rpcOf(sb)("event_share_card", { p_event: eventId });
  return error || !data ? null : data as ShareCard;
}

/** Related listed events — names, dates and images only; the function's score and "why" reasons are discarded here. */
export async function related(sb: SupabaseClient, eventId: string, limit = 4) {
  const { data } = await rpcOf(sb)("directory_related", { p_event: eventId, p_limit: limit });
  return ((data ?? []) as (DirEvent & { score?: number; why?: string[] })[]).map(({ score: _s, why: _w, ...e }) => e as DirEvent);
}

export const cityLabel = (k: string) => k.split(/[-\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
