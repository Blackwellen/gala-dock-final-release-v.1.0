import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_BUCKET } from "../actions";
import { asTemplateMetadata, templateCategory, formatLabel } from "../template-helpers";
import { TemplateDetailClient, type TemplateDetail, type VersionRow, type LinkedEventUsage } from "./TemplateDetailClient";

export const metadata = { title: "Template" };

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("library_assets")
    .select(
      "id, title, description, kind, mime, size_bytes, storage_path, cover_storage_path, tags, metadata, entity_type, entity_id, owner_user_id, visibility, use_count, last_used_at, locked_at, locked_by_user_id, created_at, updated_at"
    )
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!asset) notFound();

  const [{ data: versions }, { data: usageRows }] = await Promise.all([
    supabase
      .from("library_versions")
      .select("id, version, note, author_user_id, size_bytes, storage_path, created_at")
      .eq("asset_id", templateId)
      .order("version", { ascending: false }),
    supabase
      .from("library_assets")
      .select("id, title, entity_id, created_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .filter("metadata->>source_template_id", "eq", templateId),
  ]);

  const ownerIds = Array.from(
    new Set(
      [asset.owner_user_id, asset.locked_by_user_id, ...(versions ?? []).map((v) => v.author_user_id)].filter(
        (v): v is string => Boolean(v)
      )
    )
  );
  const { data: owners } = ownerIds.length > 0
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds)
    : { data: [] as { user_id: string; display_name: string | null }[] };
  const nameById = new Map((owners ?? []).map((o) => [o.user_id, o.display_name ?? "Team member"]));

  // Resolve linked events for "used for" (this template's own entity_id) and downstream copies.
  const eventIds = Array.from(
    new Set(
      [asset.entity_id, ...(usageRows ?? []).map((r) => r.entity_id)].filter((v): v is string => Boolean(v))
    )
  );
  const { data: linkedEvents } = eventIds.length > 0
    ? await supabase.from("events").select("id, name").in("id", eventIds)
    : { data: [] as { id: string; name: string }[] };
  const eventNameById = new Map((linkedEvents ?? []).map((e) => [e.id, e.name]));

  let coverUrl: string | null = null;
  let fileUrl: string | null = null;
  if (asset.cover_storage_path) {
    coverUrl = /^https?:\/\//i.test(asset.cover_storage_path)
      ? asset.cover_storage_path
      : (await supabase.storage.from(TEMPLATE_BUCKET).createSignedUrl(asset.cover_storage_path, 3600)).data?.signedUrl ?? null;
  }
  if (asset.storage_path) {
    fileUrl = /^https?:\/\//i.test(asset.storage_path)
      ? asset.storage_path
      : (await supabase.storage.from(TEMPLATE_BUCKET).createSignedUrl(asset.storage_path, 3600)).data?.signedUrl ?? null;
  }

  const meta = asTemplateMetadata(asset.metadata);

  const detail: TemplateDetail = {
    id: asset.id,
    title: asset.title,
    description: asset.description,
    kind: asset.kind,
    category: templateCategory(asset.kind, meta),
    eventType: meta.event_type ?? null,
    variables: meta.variables ?? [],
    status: meta.status ?? "approved",
    content: meta.content ?? "",
    mime: asset.mime,
    sizeBytes: asset.size_bytes,
    storagePath: asset.storage_path,
    fileUrl,
    coverUrl,
    format: formatLabel(asset.mime, asset.storage_path, asset.title),
    ownerId: asset.owner_user_id,
    ownerName: asset.owner_user_id ? nameById.get(asset.owner_user_id) ?? "Team member" : "Unassigned",
    visibility: asset.visibility,
    sharedTeam: null,
    useCount: asset.use_count,
    lastUsedAt: asset.last_used_at,
    lockedAt: asset.locked_at,
    lockedByName: asset.locked_by_user_id ? nameById.get(asset.locked_by_user_id) ?? null : null,
    tags: asset.tags ?? [],
    createdAt: asset.created_at,
    updatedAt: asset.updated_at,
    linkedEventName: asset.entity_type === "event" && asset.entity_id ? eventNameById.get(asset.entity_id) ?? null : null,
    isMine: asset.owner_user_id === user.id,
  };

  const versionRows: VersionRow[] = (versions ?? []).map((v) => ({
    id: v.id,
    version: v.version,
    note: v.note,
    authorName: v.author_user_id ? nameById.get(v.author_user_id) ?? "Team member" : "Unknown",
    sizeBytes: v.size_bytes,
    createdAt: v.created_at,
  }));

  const usage: LinkedEventUsage[] = (usageRows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    eventName: r.entity_id ? eventNameById.get(r.entity_id) ?? null : null,
    createdAt: r.created_at,
  }));

  return <TemplateDetailClient template={detail} versions={versionRows} usage={usage} />;
}
