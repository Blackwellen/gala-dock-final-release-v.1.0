import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { untyped } from "@/lib/workspace/db";
import { eventDataFor } from "@/lib/media/actions";
import { Studio } from "@/components/media/studio";
import type { DesignDoc } from "@/lib/media/document";

export const metadata = { title: "Studio · Gala Dock" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Gala Dock Studio (media spec §4): one editor for every portal; access is decided by design_access(). */
export default async function StudioPage({ params }: PageProps<"/studio/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireUser(`/studio/${id}`);
  const db = untyped(supabase as never);
  const [{ data: d }, { data: access }] = await Promise.all([
    db.from("designs").select("id,title,version,document,workspace_id,event_id").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.rpc("design_access" as never, { p_design: id } as never),
  ]);
  if (!d || !access) notFound();
  const [{ data: versions }, { data: ws }, eventData, { data: ev }] = await Promise.all([
    db.from("design_versions").select("version,label,created_at").eq("design_id", id).order("version", { ascending: false }).limit(40),
    d.workspace_id ? supabase.from("workspaces").select("kind").eq("id", d.workspace_id).maybeSingle() : Promise.resolve({ data: null }),
    eventDataFor(d.event_id),
    d.event_id ? db.from("events").select("cover_image,gallery,settings").eq("id", d.event_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const gallery = ev ? [...new Set([((ev.settings ?? {}) as { hero_image?: string }).hero_image, ev.cover_image, ...((ev.gallery as string[]) ?? [])].filter((s): s is string => !!s && /^(https:|\/)/.test(s)))].slice(0, 24) : [];
  const back = ws?.kind === "provider" ? "/provider/media" : "/organizer/media";
  return <Studio back={back} eventData={eventData} assets={gallery.map((src, i) => ({ src, title: `Event image ${i + 1}` }))}
    versions={(versions ?? []) as { version: number; label: string; created_at: string }[]}
    design={{ id: d.id, title: d.title, version: d.version, document: d.document as DesignDoc, canEdit: access === "owner" || access === "edit", eventId: d.event_id }} />;
}
