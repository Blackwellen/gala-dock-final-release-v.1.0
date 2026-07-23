import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { parsePackMeta } from "../pack-filter";
import { PackDetailClient, type PackDetailData, type PackMemberAsset } from "./PackDetailClient";
import type { PickableAsset } from "../EventPacksClient";

export const metadata = { title: "Event Pack" };

export default async function EventPackDetailPage({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: pack } = await supabase
    .from("library_collections")
    .select("id, name, slug, description, auto_filter, created_at, updated_at, created_by, entity_type, entity_id")
    .eq("id", packId)
    .eq("workspace_id", workspaceId)
    .eq("kind", "event_pack")
    .is("deleted_at", null)
    .maybeSingle();

  if (!pack) notFound();

  const { data: members } = await supabase
    .from("library_collection_members")
    .select("asset_id, position")
    .eq("collection_id", packId)
    .order("position", { ascending: true });

  const memberAssetIds = (members ?? []).map((m) => m.asset_id);
  let memberAssets: PackMemberAsset[] = [];
  if (memberAssetIds.length > 0) {
    const { data: assets } = await supabase
      .from("library_assets")
      .select("id, title, kind, mime, size_bytes, visibility, tags, created_at")
      .in("id", memberAssetIds);
    const byId = new Map((assets ?? []).map((a) => [a.id, a]));
    memberAssets = memberAssetIds
      .map((id) => byId.get(id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({
        id: a.id,
        title: a.title,
        kind: a.kind,
        mime: a.mime,
        sizeBytes: a.size_bytes,
        visibility: a.visibility,
        tags: a.tags ?? [],
      }));
  }

  let ownerName = "Workspace member";
  if (pack.created_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", pack.created_by)
      .maybeSingle();
    if (profile?.display_name) ownerName = profile.display_name;
  }

  let eventName: string | null = null;
  if (pack.entity_type === "event" && pack.entity_id) {
    const { data: ev } = await supabase.from("events").select("name").eq("id", pack.entity_id).maybeSingle();
    eventName = ev?.name ?? null;
  }

  const { data: eventRows } = await supabase
    .from("events")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("start_at", { ascending: false })
    .limit(200);

  const { data: pickableRows } = await supabase
    .from("library_assets")
    .select("id, title, kind, mime, size_bytes, tags, visibility, entity_type, entity_id, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);

  const pickableAssets: PickableAsset[] = (pickableRows ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    kind: a.kind,
    mime: a.mime,
    sizeBytes: a.size_bytes,
    tags: a.tags ?? [],
    visibility: a.visibility,
    eventId: a.entity_type === "event" ? a.entity_id : null,
  }));

  const meta = parsePackMeta(pack.auto_filter);

  const data: PackDetailData = {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    createdAt: pack.created_at,
    updatedAt: pack.updated_at,
    ownerName,
    eventId: pack.entity_type === "event" ? pack.entity_id : null,
    eventName,
    smart: meta.smart,
    audience: meta.audience,
    visibility: meta.visibility,
    rules: meta.rules,
    downloads: meta.stats.downloads,
    shares: meta.stats.shares,
    lastDownloadAt: meta.stats.lastDownloadAt,
    lastSharedAt: meta.stats.lastSharedAt,
  };

  return <PackDetailClient pack={data} members={memberAssets} events={eventRows ?? []} assets={pickableAssets} />;
}
