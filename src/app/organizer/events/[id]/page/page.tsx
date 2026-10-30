import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { PageEditor } from "@/components/organizer/page-editor";
import { BLOCKS, blockOrder, blockVisible, type Block } from "@/lib/page-blocks";

export const metadata = { title: "Public page editor" };

export default async function PageEditorRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer();
  const { data: e } = await ctx.supabase.from("events").select("id,name,slug,status,visibility,starts_at,ends_at,venue_name,location,cover_image,description,settings").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) notFound();
  const s = (e.settings ?? {}) as Record<string, unknown>;   const order = blockOrder(s);
  const cta = (s.cta ?? {}) as { primary?: string; secondary?: string }; const seo = (s.seo ?? {}) as { title?: string; description?: string };
  return <div className="pe2">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Events", href: "/organizer/events" }, { label: e.name, href: `/organizer/events/${id}` }, { label: "Public Page Editor" }]} />
    <PageEditor tab={sp.tab === "seo" ? "seo" : sp.tab === "preview" ? "preview" : "edit"}
      event={{ id, name: e.name, slug: e.slug, status: e.status, visibility: e.visibility, starts_at: e.starts_at, ends_at: e.ends_at, venue: [e.venue_name, e.location].filter(Boolean).join(", "), cover: e.cover_image, gallery: ((s.gallery as string[]) ?? []).slice(0, 6) }}
      initial={{ order, visible: Object.fromEntries(BLOCKS.map(b => [b, blockVisible(s, b)])) as Record<Block, boolean>, hero: { title: (s.hero_title as string) || e.name, subtitle: (s.subtitle as string) || e.description.slice(0, 200), image: (s.hero_image as string) || e.cover_image, overlay: (s.hero_overlay as "dark") ?? "dark", primary: cta.primary ?? "Buy Tickets", secondary: cta.secondary ?? "View Line Up", video: (s.hero_video as string) ?? "" }, seo: { title: seo.title ?? `${e.name} — Tickets & Info`, description: seo.description ?? e.description.slice(0, 160) } }} />
  </div>;
}
