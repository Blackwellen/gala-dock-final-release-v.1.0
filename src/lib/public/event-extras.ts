import "server-only";
import type { MapEl, MapSpace } from "@/app/provider/venues/_components/venue-map";
import { isPlanV2 } from "@/lib/data/event-plan";

/**
 * Everything the organiser built that a public event page may show, from public-safe sources only:
 *   public_event_plan (published layout + venue structure), published venue spaces, public_event_extras (202610294060:
 *   confirmed sponsors / exhibitors, approved accessibility, days, venues, sub-events, passes), event_virtual_public (sessions,
 *   never join links), Q23 media (public + published galleries, approved public banners, published promo landing pages),
 *   Q40 merch on sale, and Q40 series / parent context.
 * Every row is filtered to its public rule in code as well, so a signed-in member's preview (wider RLS) shows exactly what the public will see.
 */
type Db = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Partner = { kind: "sponsor" | "exhibitor"; name: string; tier: string | null; booth: string | null; logo?: string | null };
export type PublicAccess = { summary: string; step_free: boolean; accessible_toilets: boolean; changing_places: boolean; hearing_loop: boolean; bsl: boolean; captioning: boolean; quiet_space: boolean; assistance_dogs: boolean; accessible_seating: boolean; companion_seats: boolean };
export type Extras = {
  partners: Partner[]; accessibility: PublicAccess | null;
  days: { label: string | null; date: string; starts_at: string | null; ends_at: string | null }[];
  venues: { name: string | null; role: string; starts_at: string | null; ends_at: string | null; listing_slug: string | null }[];
  sub_events: { name: string; slug: string; role: string | null; starts_at: string | null; ends_at: string | null }[];
  passes: { name: string; kind: string; includes: string[] }[];
};
export type VirtualSession = { id: string; title: string; kind: string; track: string | null; starts_at: string; ends_at: string; captions: string | null; sign_language: boolean; transcript: boolean; audio_description: boolean };
export type Photo = { url: string; alt: string; credit: string | null };
export type Banner = { url: string; alt: string; title: string; href: string | null };

const rows = <T,>(q: PromiseLike<{ data: unknown }>): Promise<T[]> => Promise.resolve(q).then(r => (r.data ?? []) as T[], () => []);
const one = <T,>(q: PromiseLike<{ data: unknown }>): Promise<T | null> => Promise.resolve(q).then(r => (r.data ?? null) as T | null, () => null);
const PUBLIC_MEDIA = (a: { usage_scope?: string; status?: string } | null | undefined) => !!a && a.usage_scope === "public" && ["approved", "published"].includes(a.status ?? "");
const LIVE = ["published", "on_sale", "live"];
const EMPTY: Extras = { partners: [], accessibility: null, days: [], venues: [], sub_events: [], passes: [] };

export async function loadEventExtras(client: unknown, e: { id: string; venue_listing_id: string | null; series_id?: string | null; parent_event_id?: string | null }) {
  const sb = client as Db;
  const [plan, extras, virtual, galleries, banners, promos, merch, spaces, series, others, parent] = await Promise.all([
    one<{ overlay?: unknown; base?: unknown }>(sb.rpc("public_event_plan", { p_event: e.id })),
    one<Extras>(sb.rpc("public_event_extras", { p_event: e.id })),
    one<{ format?: string; sessions?: VirtualSession[] }>(sb.rpc("event_virtual_public", { p_event: e.id })),
    rows<{ title: string; media_gallery_items: { sort: number; caption: string | null; media_assets: { url: string; alt_text: string | null; credit: string | null; title: string; usage_scope: string; status: string } | null }[] }>(sb.from("media_galleries").select("id,title,visibility,status,media_gallery_items(sort,caption,media_assets(url,alt_text,credit,title,usage_scope,status))").eq("event_id", e.id).eq("visibility", "public").eq("status", "published").order("created_at")),
    rows<{ url: string; alt_text: string | null; title: string; usage_scope: string; status: string }>(sb.from("media_assets").select("url,alt_text,title,kind,format,usage_scope,status").eq("event_id", e.id).eq("usage_scope", "public").in("status", ["approved", "published"]).or("kind.eq.banner,format.in.(banner,wide)").order("created_at", { ascending: false }).limit(3)),
    rows<{ slug: string; title: string; intro: string | null; status: string; hero: { url: string; alt_text: string | null; usage_scope: string; status: string } | null }>(sb.from("promo_landing_pages").select("slug,title,intro,status,hero:media_assets!promo_landing_pages_hero_asset_id_fkey(url,alt_text,usage_scope,status)").contains("event_ids", [e.id]).eq("status", "published").limit(3)),
    rows<{ id: string; name: string; price_minor: number }>(sb.from("merch_items").select("id,name,price_minor,status").eq("event_id", e.id).eq("status", "on_sale").order("name")),
    e.venue_listing_id ? rows<{ id: string; name: string; capacity_standing: number | null; capacity_seated: number | null; indoor: boolean }>(sb.from("spaces").select("id,name,capacity_standing,capacity_seated,indoor,status").eq("venue_id", e.venue_listing_id).eq("status", "published")) : Promise.resolve([]),
    e.series_id ? one<{ name: string; slug: string | null; kind: string }>(sb.from("event_series").select("name,slug,kind,visibility,status").eq("id", e.series_id).eq("visibility", "public").eq("status", "active").maybeSingle()) : Promise.resolve(null),
    e.series_id ? rows<{ id: string; name: string; slug: string | null; starts_at: string | null; city: string | null; venue_name: string | null }>(sb.from("events_public").select("id,name,slug,starts_at,city,venue_name").eq("series_id", e.series_id).neq("id", e.id).eq("visibility", "public").in("status", LIVE).gte("starts_at", new Date().toISOString()).order("starts_at").limit(6)) : Promise.resolve([]),
    e.parent_event_id ? one<{ name: string; slug: string | null; id: string }>(sb.from("events_public").select("name,slug,id").eq("id", e.parent_event_id).eq("visibility", "public").in("status", LIVE).maybeSingle()) : Promise.resolve(null),
  ]);
  const overlay = plan && isPlanV2(plan.overlay) ? plan.overlay : [], base = plan && Array.isArray(plan.base) ? plan.base as MapEl[] : [];
  const photos: Photo[] = [];
  for (const g of galleries) for (const it of [...(g.media_gallery_items ?? [])].sort((a, b) => a.sort - b.sort)) {
    const a = it.media_assets; if (PUBLIC_MEDIA(a) && a!.url && !photos.some(p => p.url === a!.url)) photos.push({ url: a!.url, alt: a!.alt_text || it.caption || a!.title || "", credit: a!.credit });
  }
  const bannerList: Banner[] = [
    ...banners.filter(PUBLIC_MEDIA).map(b => ({ url: b.url, alt: b.alt_text ?? "", title: b.title, href: null })),
    ...promos.filter(p => PUBLIC_MEDIA(p.hero)).map(p => ({ url: p.hero!.url, alt: p.hero!.alt_text ?? "", title: p.title, href: `/p/${p.slug}` })),
  ];
  return {
    plan: { overlay: overlay as MapEl[], base, spaces: spaces.map(s => ({ id: s.id, name: s.name, capacity: Math.max(s.capacity_standing ?? 0, s.capacity_seated ?? 0), indoor: s.indoor })) as MapSpace[] },
    extras: { ...EMPTY, ...(extras ?? {}) } as Extras,
    virtual: virtual && (virtual.format || (virtual.sessions ?? []).length) ? { format: virtual.format ?? null, sessions: (virtual.sessions ?? []) as VirtualSession[] } : null,
    photos, banners: bannerList, promos: promos.map(p => ({ slug: p.slug, title: p.title })),
    merch: merch.map(m => ({ id: m.id, name: m.name, price: Number(m.price_minor) / 100 })),
    series: series ? { ...series, others } : null, parent,
  };
}
export type EventExtras = Awaited<ReturnType<typeof loadEventExtras>>;
