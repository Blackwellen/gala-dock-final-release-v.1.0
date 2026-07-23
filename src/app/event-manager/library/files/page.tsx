import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { LibraryTabs } from "../_shared";
import { formatBytes, formatLibDate, formatRelative, type LibraryKind } from "../library-utils";
import { FilesClient, type FileRow } from "./FilesClient";

export const metadata = { title: "Files" };

const FILE_KINDS: LibraryKind[] = ["image", "video", "audio", "document", "archive"];
const DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB — used when no library_settings row exists yet.

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView } = await searchParams;
  const view: "grid" | "list" = rawView === "list" ? "list" : "grid";

  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("library_assets")
    .select(
      "id, title, kind, mime, size_bytes, storage_path, tags, entity_type, entity_id, owner_user_id, visibility, pinned_at, use_count, last_used_at, created_at, updated_at"
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("kind", FILE_KINDS)
    .order("created_at", { ascending: false });

  const rows = assets ?? [];
  const assetIds = rows.map((a) => a.id);

  // Resolve owner display names.
  const ownerIds = Array.from(new Set(rows.map((a) => a.owner_user_id).filter(Boolean))) as string[];
  const ownerNameById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", ownerIds);
    for (const p of profiles ?? []) ownerNameById.set(p.user_id, p.display_name ?? "Team member");
  }

  // Resolve related event names for assets attached to an event.
  const eventIds = Array.from(
    new Set(rows.filter((a) => a.entity_type === "event" && a.entity_id).map((a) => a.entity_id as string))
  );
  const eventNameById = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", eventIds);
    for (const e of events ?? []) eventNameById.set(e.id, e.name);
  }

  // Active (non-revoked, non-expired) external share links, keyed by asset id.
  const sharedAssetIds = new Set<string>();
  if (assetIds.length > 0) {
    const { data: shareLinks } = await supabase
      .from("library_share_links")
      .select("asset_id, expires_at, revoked_at")
      .in("asset_id", assetIds)
      .is("revoked_at", null);
    const nowMs = new Date().getTime();
    for (const link of shareLinks ?? []) {
      if (link.expires_at && new Date(link.expires_at).getTime() < nowMs) continue;
      sharedAssetIds.add(link.asset_id);
    }
  }

  // Storage quota — reuse library_settings.storage_quota_bytes when the workspace has
  // configured one; otherwise fall back to a sane 100 GB default (schema gap: some
  // workspaces have no library_settings row yet, since it's created lazily on first visit
  // to Library Settings).
  const { data: settings } = await supabase
    .from("library_settings")
    .select("storage_quota_bytes")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const storageQuotaBytes = settings?.storage_quota_bytes ?? DEFAULT_QUOTA_BYTES;

  const files: FileRow[] = rows.map((a) => {
    const eventName = a.entity_type === "event" && a.entity_id ? eventNameById.get(a.entity_id) ?? null : null;
    return {
      id: a.id,
      title: a.title,
      kind: a.kind,
      mime: a.mime,
      sizeBytes: a.size_bytes,
      sizeLabel: formatBytes(a.size_bytes),
      tags: a.tags ?? [],
      ownerId: a.owner_user_id,
      ownerName: a.owner_user_id ? ownerNameById.get(a.owner_user_id) ?? "Team member" : "Unassigned",
      eventId: a.entity_type === "event" ? a.entity_id : null,
      eventName,
      visibility: a.visibility,
      pinned: Boolean(a.pinned_at),
      useCount: a.use_count,
      storagePath: a.storage_path,
      sharedExternally: sharedAssetIds.has(a.id) || a.visibility === "link" || a.visibility === "public_token",
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      dateLabel: formatLibDate(a.created_at),
      updatedLabel: formatLibDate(a.updated_at),
      updatedRelative: formatRelative(a.updated_at),
    };
  });

  const now = new Date().getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const kpis = {
    totalFiles: files.length,
    newThisMonth: files.filter((f) => {
      const created = new Date(f.createdAt).getTime();
      const d = new Date();
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      return created >= monthStart;
    }).length,
    storageUsedBytes: files.reduce((sum, f) => sum + (f.sizeBytes || 0), 0),
    storageQuotaBytes,
    sharedExternallyCount: files.filter((f) => f.sharedExternally).length,
    recentlyUpdatedCount: files.filter((f) => now - new Date(f.updatedAt).getTime() < sevenDaysMs).length,
  };

  const events = Array.from(eventNameById.entries()).map(([id, name]) => ({ id, name }));

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Files"
        description="Store and manage menus, flyers, adverts, posters, PDFs, decks, run-of-show files, contracts and other event assets."
        tabs={<LibraryTabs active="files" basePath="/event-manager/library" />}
      />
      <FilesClient files={files} events={events} view={view} storageQuotaBytes={storageQuotaBytes} kpis={kpis} workspaceId={workspaceId} />
    </div>
  );
}
