import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { untyped } from "@/lib/workspace/db";
import { eventDataFor, businessDataFor } from "@/lib/media/actions";
import { Studio } from "@/components/media/studio";
import type { DesignDoc } from "@/lib/media/document";
import type { BrandKit } from "@/lib/media/collab";
import type { CustomFont } from "@/components/media/brand-panel";

export const metadata = { title: "Studio · Gala Dock" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Gala Dock Studio (media spec §4): one editor for every portal; access is decided by design_access(). */
export default async function StudioPage({ params, searchParams }: PageProps<"/studio/[id]">) {
  const { id } = await params;
  const openComments = (await searchParams).comments === "1";
  if (!UUID.test(id)) notFound();
  const { supabase, user } = await requireUser(`/studio/${id}`);
  const db = untyped(supabase as never);
  const [{ data: d }, { data: access }] = await Promise.all([
    db.from("designs").select("id,title,version,document,workspace_id,event_id").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.rpc("design_access" as never, { p_design: id } as never),
  ]);
  if (!d || !access) notFound();
  const [{ data: versions }, { data: ws }, evData, bizData, { data: ev }] = await Promise.all([
    db.from("design_versions").select("version,label,created_at").eq("design_id", id).order("version", { ascending: false }).limit(40),
    d.workspace_id ? supabase.from("workspaces").select("kind").eq("id", d.workspace_id).maybeSingle() : Promise.resolve({ data: null }),
    eventDataFor(d.event_id),
    businessDataFor(d.workspace_id as string | null),
    d.event_id ? db.from("events").select("cover_image,gallery,settings").eq("id", d.event_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // Brand kit + custom fonts of the design's workspace (members read; owners/managers edit).
  const [{ data: kit }, { data: fonts }, { data: member }] = d.workspace_id ? await Promise.all([
    db.from("brand_kits").select("colors,fonts,logos").eq("workspace_id", d.workspace_id).maybeSingle(),
    db.from("uploaded_fonts").select("id,family,weight,style").eq("workspace_id", d.workspace_id).order("family"),
    supabase.from("workspace_members").select("role").eq("workspace_id", d.workspace_id).eq("user_id", user.id).eq("status", "active").maybeSingle(),
  ]) : [{ data: null }, { data: [] }, { data: null }];
  const eventData = { ...bizData, ...evData };
  const gallery = ev ? [...new Set([((ev.settings ?? {}) as { hero_image?: string }).hero_image, ev.cover_image, ...((ev.gallery as string[]) ?? [])].filter((s): s is string => !!s && /^(https:|\/)/.test(s)))].slice(0, 24) : [];
  const back = ws?.kind === "provider" ? "/provider/media" : "/organizer/media";
  const brand = d.workspace_id ? { workspaceId: d.workspace_id as string, canManage: ["owner", "manager"].includes(member?.role ?? ""),
    kit: { colors: kit?.colors ?? [], fonts: kit?.fonts ?? [], logos: kit?.logos ?? [] } as BrandKit, fonts: (fonts ?? []) as CustomFont[] } : null;
  return <Studio back={back} brand={brand} openComments={openComments} workspaceId={(d.workspace_id as string | null) ?? null} eventData={eventData} assets={gallery.map((src, i) => ({ src, title: `Event image ${i + 1}` }))}
    versions={(versions ?? []) as { version: number; label: string; created_at: string }[]}
    design={{ id: d.id, title: d.title, version: d.version, document: d.document as DesignDoc, canEdit: access === "owner" || access === "edit", eventId: d.event_id }} />;
}
