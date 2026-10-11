import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { PromotionWizard } from "@/components/organizer/promotion-wizard";

export const metadata = { title: "New promotion" };

export default async function NewPromotion({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase;
  const { data: events } = await sb.from("events").select("id,name,slug,starts_at,ends_at,venue_name,location,cover_image,capacity,description,settings,tags").eq("workspace_id", ctx.workspace.id).gte("starts_at", new Date().toISOString()).neq("status", "archived").order("starts_at");
  const e = (events ?? []).find(x => x.id === sp.event) ?? (events ?? [])[0];
  const { data: tiers } = e ? await sb.from("ticket_tiers").select("quantity,sold").eq("event_id", e.id) : { data: [] };
  const sold = (tiers ?? []).reduce((a, t) => a + t.sold, 0), cap = (tiers ?? []).reduce((a, t) => a + t.quantity, 0);
  const s = (e?.settings ?? {}) as Record<string, unknown>;
  return <div className="pw2">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Events", href: "/organizer/events" }, ...(e ? [{ label: e.name, href: `/organizer/events/${e.id}` }, { label: "Promotion", href: `/organizer/events/${e.id}/promotion` }] : []), { label: "New Promotion" }]} />
    {e ? <PromotionWizard step={Math.min(3, Math.max(1, Number(sp.step) || 1)) as 1 | 2 | 3} boost={sp.boost ?? ""}
      events={(events ?? []).map(x => ({ id: x.id, name: x.name }))}
      event={{ id: e.id, name: e.name, slug: e.slug, starts_at: e.starts_at!, ends_at: e.ends_at, venue: e.venue_name, location: e.location, cover: e.cover_image, capacity: cap || e.capacity || 0, sold, description: e.description, poster: (s.poster as string) ?? "", gallery: ((s.gallery as string[]) ?? []).slice(0, 8), tags: e.tags ?? [] }} />
      : <div className="k-card mn-lock"><h1>No upcoming events</h1><p>Create an event before planning its promotion.</p></div>}
  </div>;
}
