import "server-only";
import type { CustomerCtx } from "./context";

export type PublicEvent = { id: string; name: string; slug: string | null; starts_at: string | null; ends_at: string | null; venue_name: string; location: string; city: string; cover_image: string; event_type: string; tags: string[]; settings: Record<string, unknown>; minPrice: number | null; remaining: number; capacity: number; lat?: number; lng?: number };
const CITY: Record<string, [number, number]> = { london: [51.507, -0.12], manchester: [53.48, -2.24], birmingham: [52.49, -1.89], surrey: [51.31, -0.56] };
const DATE_FILTERS = ["tonight", "weekend", "week", "month"] as const;

/** Public, on-sale events with live ticket availability (RLS: public published/on_sale/live only). */
export async function publicEvents(ctx: CustomerCtx, opts: { q?: string; cat?: string; date?: string; city?: string; limit?: number } = {}) {
  let q = ctx.supabase.from("events").select("id,name,slug,starts_at,ends_at,venue_name,location,city,cover_image,event_type,tags,settings").eq("visibility", "public").in("status", ["published", "on_sale", "live"]).gte("ends_at", new Date().toISOString()).order("starts_at");
  if (opts.q) { const t = opts.q.replace(/[%,()]/g, ""); q = q.or(`name.ilike.%${t}%,venue_name.ilike.%${t}%,location.ilike.%${t}%,description.ilike.%${t}%`); }
  if (opts.city) q = q.ilike("location", `%${opts.city}%`);
  if (opts.date && (DATE_FILTERS as readonly string[]).includes(opts.date)) {
    const now = new Date(); const end = new Date(now);
    if (opts.date === "tonight") end.setHours(23, 59, 59); else if (opts.date === "weekend") { const d = (7 - now.getDay()) % 7; end.setDate(now.getDate() + d); end.setHours(23, 59, 59); } else end.setDate(now.getDate() + (opts.date === "week" ? 7 : 31));
    q = q.lte("starts_at", end.toISOString());
  }
  const { data } = await q.limit(opts.limit ?? 60);
  let rows = (data ?? []) as unknown as PublicEvent[];
  if (opts.cat) { const c = opts.cat.toLowerCase(); rows = rows.filter(e => e.event_type.toLowerCase().includes(c) || e.tags.some(t => t.toLowerCase().includes(c))); }
  if (!rows.length) return [];
  const { data: tiers } = await ctx.supabase.from("ticket_tiers").select("event_id,price,quantity,sold,held,status,kind").in("event_id", rows.map(r => r.id));
  return rows.map(e => {
    const t = (tiers ?? []).filter(x => x.event_id === e.id && x.kind !== "comp" && ["on_sale", "scheduled"].includes(x.status));
    const ll = CITY[(e.city || "london").toLowerCase()] ?? CITY.london!;
    const jitter = (e.id.charCodeAt(0) % 9) / 140, jit2 = (e.id.charCodeAt(1) % 9) / 90;
    return { ...e, minPrice: t.length ? Math.min(...t.map(x => Number(x.price))) : null, remaining: t.reduce((s, x) => s + x.quantity - x.sold - x.held, 0), capacity: t.reduce((s, x) => s + x.quantity, 0), lat: ll[0] - .03 + jitter, lng: ll[1] - .06 + jit2 };
  });
}
export async function savedKeys(ctx: CustomerCtx) {
  const { data } = await ctx.supabase.from("saved_items").select("item_key").eq("user_id", ctx.user.id);
  return new Set((data ?? []).map(s => s.item_key));
}
export const CATEGORY_CHIPS = [["tonight", "Tonight"], ["weekend", "This Weekend"], ["music", "Live Music"], ["nightlife", "Clubs & Nightlife"], ["food", "Food & Drink"], ["comedy", "Comedy"], ["family", "Family Friendly"], ["corporate", "Business & Networking"], ["wedding", "Weddings"]] as const;
