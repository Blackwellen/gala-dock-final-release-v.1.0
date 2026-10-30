import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { anonViewerId, isBot, type PlacementKey, type ServedSlot } from "./core";

/**
 * Server-side ad selection (Q23). `serve_ad_slots` is service-only: the browser never chooses or counts anything itself. Each
 * served slot carries a single-use token; the slot's beacon reports a verified view and its link records a click.
 */
export type Viewer = { userId: string | null; anon: string | null; bot: boolean };
const secret = () => process.env.AD_VIEWER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "gala-dock-ad-viewer";

export async function currentViewer(): Promise<Viewer> {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0]!.trim();
  const { data: { user } } = await (await createClient()).auth.getUser();
  return { userId: user?.id ?? null, anon: user ? null : anonViewerId(secret(), ip, ua), bot: isBot(ua) };
}

export type SponsoredEvent = { id: string; name: string; slug: string | null; cover_image: string | null; starts_at: string | null; ends_at: string | null; location: string | null; city: string | null };
export type SponsoredListing = { id: string; name: string; slug: string | null; kind: string; image: string | null; location: string | null; price_from: number | null; price_unit: string | null; rating: number | null; review_count: number | null };
export type Sponsored = ServedSlot & { event?: SponsoredEvent; listing?: SponsoredListing };

/** Serves up to the placement's capacity. Never throws: a failing ad layer must not break the page (organic content renders). */
export async function serveSponsored(placement: PlacementKey, ctx: { city?: string | null; category?: string | null } = {}, exclude: string[] = []): Promise<Sponsored[]> {
  try {
    const v = await currentViewer();
    if (v.bot) return [];
    const db = createAdminClient() as unknown as { rpc(fn: string, a: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>; from(t: string): any };   // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data, error } = await db.rpc("serve_ad_slots", { p_placement: placement, p_user: v.userId, p_anon: v.anon,
      p_ctx: { city: ctx.city || null, category: ctx.category || null }, p_exclude: exclude.filter(x => /^[0-9a-f-]{36}$/i.test(x)) });
    if (error || !Array.isArray(data) || !data.length) return [];
    const slots = data as ServedSlot[];
    const eIds = slots.flatMap(s => s.event_id ? [s.event_id] : []), lIds = slots.flatMap(s => s.listing_id ? [s.listing_id] : []);
    const [{ data: ev }, { data: li }] = await Promise.all([
      eIds.length ? db.from("events").select("id,name,slug,cover_image,starts_at,ends_at,location,city").in("id", eIds) : Promise.resolve({ data: [] }),
      lIds.length ? db.from("listings").select("id,name,slug,kind,image,location,price_from,price_unit,rating,review_count").in("id", lIds) : Promise.resolve({ data: [] }),
    ]);
    const E = new Map(((ev ?? []) as SponsoredEvent[]).map(e => [e.id, e])), L = new Map(((li ?? []) as SponsoredListing[]).map(l => [l.id, l]));
    return slots.map(s => ({ ...s, event: s.event_id ? E.get(s.event_id) : undefined, listing: s.listing_id ? L.get(s.listing_id) : undefined })).filter(s => s.event || s.listing);
  } catch { return []; }
}
