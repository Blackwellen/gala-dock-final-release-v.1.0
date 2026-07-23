import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { LibraryTabs } from "../_shared";
import { TEMPLATE_BUCKET, TEMPLATE_KINDS } from "./actions";
import { asTemplateMetadata, templateCategory, formatLabel } from "./template-helpers";
import { TemplatesClient, type TemplateRow, type EventOption } from "./TemplatesClient";
import { TemplatesHeaderActions } from "./TemplatesHeaderActions";

export const metadata = { title: "Templates" };

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: assets }, { data: events }] = await Promise.all([
    supabase
      .from("library_assets")
      .select(
        "id, title, description, kind, mime, size_bytes, storage_path, cover_storage_path, tags, metadata, entity_type, entity_id, owner_user_id, visibility, use_count, last_used_at, locked_at, locked_by_user_id, created_at, updated_at"
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("kind", TEMPLATE_KINDS)
      .order("updated_at", { ascending: false }),
    supabase
      .from("events")
      .select("id, name, start_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(200),
  ]);

  const rows = assets ?? [];
  const assetIds = rows.map((r) => r.id);
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_user_id).filter((v): v is string => Boolean(v))));

  const [{ data: owners }, { data: versions }] = await Promise.all([
    ownerIds.length > 0
      ? supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds)
      : Promise.resolve({ data: [] as { user_id: string; display_name: string | null }[] }),
    assetIds.length > 0
      ? supabase.from("library_versions").select("asset_id, version").in("asset_id", assetIds)
      : Promise.resolve({ data: [] as { asset_id: string; version: number }[] }),
  ]);

  const ownerNameById = new Map((owners ?? []).map((o) => [o.user_id, o.display_name ?? "Team member"]));
  const versionByAsset = new Map<string, number>();
  for (const v of versions ?? []) {
    const current = versionByAsset.get(v.asset_id) ?? 1;
    versionByAsset.set(v.asset_id, Math.max(current, v.version));
  }

  // Resolve cover previews for rows that have one (private bucket -> signed URL).
  const coverUrlByAsset = new Map<string, string>();
  await Promise.all(
    rows
      .filter((r) => r.cover_storage_path)
      .map(async (r) => {
        const path = r.cover_storage_path!;
        if (/^https?:\/\//i.test(path)) {
          coverUrlByAsset.set(r.id, path);
          return;
        }
        const { data } = await supabase.storage.from(TEMPLATE_BUCKET).createSignedUrl(path, 3600);
        if (data?.signedUrl) coverUrlByAsset.set(r.id, data.signedUrl);
      })
  );

  const templates: TemplateRow[] = rows.map((r) => {
    const meta = asTemplateMetadata(r.metadata);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      kind: r.kind,
      category: templateCategory(r.kind, meta),
      eventType: meta.event_type ?? null,
      variables: meta.variables ?? [],
      status: meta.status ?? "approved",
      mime: r.mime,
      sizeBytes: r.size_bytes,
      storagePath: r.storage_path,
      coverUrl: coverUrlByAsset.get(r.id) ?? null,
      format: formatLabel(r.mime, r.storage_path, r.title),
      version: versionByAsset.get(r.id) ?? 1,
      ownerId: r.owner_user_id,
      ownerName: r.owner_user_id ? ownerNameById.get(r.owner_user_id) ?? "Team member" : "Unassigned",
      visibility: r.visibility,
      sharedTeam: meta.shared_team ?? null,
      useCount: r.use_count,
      lastUsedAt: r.last_used_at,
      lockedAt: r.locked_at,
      favouritedBy: meta.favourited_by ?? [],
      tags: r.tags ?? [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      isMine: r.owner_user_id === user.id,
    };
  });

  const eventOptions: EventOption[] = (events ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    startAt: e.start_at,
  }));

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Templates"
        description="Manage reusable event design templates for menus, flyers, posters, decks, signage and digital promotions."
        tabs={<LibraryTabs active="templates" basePath="/event-manager/library" />}
        actions={<TemplatesHeaderActions />}
      />
      <TemplatesClient
        templates={templates}
        events={eventOptions}
        currentUserId={user.id}
        view={view === "list" ? "list" : "grid"}
      />
    </div>
  );
}
