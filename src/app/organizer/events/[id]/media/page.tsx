import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { PosterBuilder } from "@/components/organizer/poster-builder";

export const metadata = { title: "Poster & media builder" };
const TZ = "Europe/London";

export default async function MediaBuilderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer(); const sb = ctx.supabase;
  const { data: e } = await sb.from("events").select("id,name,slug,status,starts_at,ends_at,venue_name,location,cover_image,settings,tags").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) notFound();
  const [{ data: lineup }, { data: tiers }, { data: library }] = await Promise.all([
    sb.from("programme_items").select("title").eq("event_id", id).eq("kind", "programme").order("starts_at"),
    sb.from("ticket_tiers").select("price").eq("event_id", id).gt("price", 0).order("price").limit(1),
    sb.from("media_assets").select("id,url,title,format,version,created_at").eq("event_id", id).order("created_at", { ascending: false }).limit(40),
  ]);
  const { data: prev } = await sb.from("media_assets").select("id,url,title,format,version,created_at,events!inner(name,workspace_id)").neq("event_id", id).eq("events.workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(40);
  const s = (e.settings ?? {}) as Record<string, unknown>;
  const d = e.starts_at ? new Date(e.starts_at) : null; const t = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "";
  const performers = (lineup ?? []).map(l => l.title).filter(x => !/gates|doors|close|open/i.test(x)).slice(0, 4);
  return <div className="pb">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Events", href: "/organizer/events" }, { label: e.name, href: `/organizer/events/${id}` }, { label: "Poster & Media Builder" }]} />
    <PosterBuilder tab={sp.tab === "library" || sp.tab === "previous" ? sp.tab : "create"} workspaceId={ctx.workspace.id} workspaceName={ctx.workspace.name}
      event={{ id, name: e.name, slug: e.slug, status: e.status, when: d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ }).toUpperCase() : "DATE TBC", date: d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "", time: `${t(e.starts_at)}${e.ends_at ? ` – ${t(e.ends_at)}` : ""}`, venue: [e.venue_name, e.location.split(",").map(x => x.trim()).filter(Boolean).at(-2) ?? e.location].filter(Boolean).join(", "), cover: (s.hero_image as string) || e.cover_image || "/assets/gd/hero-neon.webp", tags: e.tags ?? [], performers, price: tiers?.[0]?.price ? Number(tiers[0].price) : null, gallery: ((s.gallery as string[]) ?? []).slice(0, 6) }}
      library={(library ?? []).map(m => ({ id: m.id, url: m.url, title: m.title, format: m.format, version: m.version, at: m.created_at }))}
      previous={(prev ?? []).map(m => ({ id: m.id, url: m.url, title: m.title, format: m.format, version: m.version, at: m.created_at, event: m.events.name }))} />
  </div>;
}
