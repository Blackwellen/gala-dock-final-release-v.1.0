import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { siteUrl } from "@/lib/site-url";

export const revalidate = 3600;

/**
 * Public pages only. Reads with the anonymous key (no session), so row-level security decides what is listed: draft, private,
 * unpublished and ended content never appears. Mirrors the filters the public event page applies.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const fixed: MetadataRoute.Sitemap = ["", "/help", "/terms", "/privacy", "/cookies", "/ticket-terms", "/data-retention"]
    .map(path => ({ url: `${base}${path || "/"}`, changeFrequency: path ? "monthly" : "weekly", priority: path ? 0.4 : 1 }));
  try {
    const { url, anonKey } = getSupabaseConfig();
    const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    // Events: only listed ones (Q23 event_distribution — public, published/on sale, type listable, not restricted, not ended) whose
    // surfaces include the sitemap. Unlisted, private, ended and withdrawn events never appear.
    const [{ data: dist }, { data: listings }, { data: facets }, { data: series }, { data: landings }] = await Promise.all([
      db.from("event_distribution").select("workspace_id,surfaces,event:events!inner(id,slug)").eq("status", "listed").limit(5000),
      db.from("listings").select("slug,kind").eq("published", true).not("slug", "is", null).limit(5000),
      db.rpc("directory_facets"),
      db.from("event_series").select("slug").eq("visibility", "public").eq("status", "active").not("slug", "is", null).limit(1000),
      db.from("promo_landing_pages").select("slug").eq("status", "published").limit(1000),
    ]);
    type Dist = { workspace_id: string | null; surfaces: string[] | null; event: { id: string; slug: string | null } | { id: string; slug: string | null }[] };
    const listed = ((dist ?? []) as unknown as Dist[]).filter(d => (d.surfaces ?? []).includes("sitemap"));
    const ev = (d: Dist) => (Array.isArray(d.event) ? d.event[0] : d.event);
    const orgs = [...new Set(listed.filter(d => (d.surfaces ?? []).includes("organizer")).map(d => d.workspace_id).filter(Boolean))];
    const f = (facets ?? {}) as { cities?: { key: string }[]; categories?: { key: string }[] };
    return [
      ...fixed,
      { url: `${base}/events`, changeFrequency: "daily" as const, priority: 0.9 },
      { url: `${base}/events/calendar`, changeFrequency: "daily" as const, priority: 0.6 },
      ...(f.cities ?? []).map(c => ({ url: `${base}/events/in/${encodeURIComponent(c.key)}`, changeFrequency: "daily" as const, priority: 0.7 })),
      ...(f.categories ?? []).map(c => ({ url: `${base}/events/category/${encodeURIComponent(c.key)}`, changeFrequency: "daily" as const, priority: 0.6 })),
      ...listed.map(ev).filter(Boolean).map(e => ({ url: `${base}/events/${e!.slug ?? e!.id}`, changeFrequency: "daily" as const, priority: 0.8 })),
      ...((series ?? []) as { slug: string }[]).map(x => ({ url: `${base}/series/${x.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
      ...((landings ?? []) as { slug: string }[]).map(x => ({ url: `${base}/p/${x.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
      ...(listings ?? []).filter(l => l.kind === "venue" || l.kind === "service")
        .map(l => ({ url: `${base}/${l.kind === "venue" ? "venues" : "services"}/${l.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
      ...orgs.map(id => ({ url: `${base}/organizers/${id}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ];
  } catch {
    return fixed;
  }
}
