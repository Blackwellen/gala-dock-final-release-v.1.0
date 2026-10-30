import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { TemplateWizard } from "@/components/organizer/template-wizard";
import { eventTypeLabel } from "@/lib/format";
import { untyped } from "@/lib/workspace/db";

export const metadata = { title: "Save as template" };

export default async function SaveTemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer(); const sb = ctx.supabase;
  const { data: e } = await sb.from("events").select("id,name,event_type,description,cover_image,starts_at,ends_at,venue_name,location,capacity,tags").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) notFound();
  const [prog, tiers, items, shifts, tasks, promos] = await Promise.all([
    sb.from("programme_items").select("id", { count: "exact", head: true }).eq("event_id", id),
    sb.from("ticket_tiers").select("name,price,description").eq("event_id", id).order("sort"),
    sb.from("build_items").select("category").eq("event_id", id),
    sb.from("shifts").select("role").eq("event_id", id),
    sb.from("tasks").select("category").eq("event_id", id),
    sb.from("promotions").select("channel").eq("event_id", id),
  ]);
  // Versioned families (Q14): active workspace templates this save can become the next version of; same-event ones first.
  const { data: fams } = await untyped(sb).from("event_templates").select("family_id,name,version,source_event_id").eq("workspace_id", ctx.workspace.id).eq("status", "active").order("updated_at", { ascending: false }).limit(30) as unknown as { data: { family_id: string; name: string; version: number; source_event_id: string | null }[] | null };
  const families = (fams ?? []).map(f => ({ family_id: f.family_id, name: f.name, version: f.version, same: f.source_event_id === id })).sort((a, b) => Number(b.same) - Number(a.same));
  const cats = [...new Set((items.data ?? []).map(i => i.category))]; const roles = [...new Set((shifts.data ?? []).map(s => s.role).filter(Boolean))];
  const counts = { plan: 4, schedule: prog.count ?? 0, providers: cats.length, tickets: (tiers.data ?? []).length, promotion: [...new Set((promos.data ?? []).map(p => p.channel))].length, staffing: roles.length, risk: (tasks.data ?? []).filter(t => ["risk", "compliance"].includes(t.category)).length };
  const hours = e.starts_at && e.ends_at ? Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 36e5) : null;
  return <div className="tw">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Events", href: "/organizer/events" }, { label: e.name, href: `/organizer/events/${id}` }, { label: "Save as Template" }]} />
    <TemplateWizard step={sp.step === "2" ? 2 : 1} event={{ id, name: e.name, type: eventTypeLabel(e.event_type), description: e.description, cover: e.cover_image, when: e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "", where: [e.venue_name, e.location].filter(Boolean).join(", "), capacity: e.capacity, hours, tags: e.tags ?? [] }}
      counts={counts} families={families} tiers={(tiers.data ?? []).slice(0, 3).map(t => ({ name: t.name, price: Number(t.price), sub: t.description }))} cats={cats} roles={roles} />
  </div>;
}
