import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { LibraryTabs } from "../_shared";
import { parsePackMeta } from "./pack-filter";
import { EventPacksClient, type EventPackRow, type PickableAsset } from "./EventPacksClient";

export const metadata = { title: "Event Packs" };

export default async function EventPacksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewParam } = await searchParams;
  const view: "grid" | "list" = viewParam === "list" ? "list" : "grid";

  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: collections } = await supabase
    .from("library_collections")
    .select(
      "id, name, slug, description, auto_filter, created_at, updated_at, created_by, entity_type, entity_id, cover_storage_path"
    )
    .eq("workspace_id", workspaceId)
    .eq("kind", "event_pack")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const packs = collections ?? [];
  const packIds = packs.map((p) => p.id);

  // Member counts + aggregate size + kind variety per pack.
  const membersByPack = new Map<string, { assetId: string; position: number }[]>();
  let allMemberAssetIds: string[] = [];
  if (packIds.length > 0) {
    const { data: members } = await supabase
      .from("library_collection_members")
      .select("collection_id, asset_id, position")
      .in("collection_id", packIds)
      .order("position", { ascending: true });
    for (const m of members ?? []) {
      const list = membersByPack.get(m.collection_id) ?? [];
      list.push({ assetId: m.asset_id, position: m.position });
      membersByPack.set(m.collection_id, list);
    }
    allMemberAssetIds = (members ?? []).map((m) => m.asset_id);
  }

  const assetById = new Map<
    string,
    { id: string; title: string; kind: string; size_bytes: number; visibility: string }
  >();
  if (allMemberAssetIds.length > 0) {
    const { data: assets } = await supabase
      .from("library_assets")
      .select("id, title, kind, size_bytes, visibility")
      .in("id", Array.from(new Set(allMemberAssetIds)));
    for (const a of assets ?? []) assetById.set(a.id, a);
  }

  // Related events (entity_type = 'event').
  const { data: eventRows } = await supabase
    .from("events")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("start_at", { ascending: false })
    .limit(200);
  const events = eventRows ?? [];
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));

  // Owner display names.
  const ownerIds = Array.from(new Set(packs.map((p) => p.created_by).filter((v): v is string => !!v)));
  const ownerNameById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds);
    for (const p of profiles ?? []) ownerNameById.set(p.user_id, p.display_name || "Workspace member");
  }

  const rows: EventPackRow[] = packs.map((p) => {
    const meta = parsePackMeta(p.auto_filter);
    const memberList = membersByPack.get(p.id) ?? [];
    const memberAssets = memberList
      .map((m) => assetById.get(m.assetId))
      .filter((a): a is NonNullable<typeof a> => !!a);
    const totalSizeBytes = memberAssets.reduce((sum, a) => sum + (a.size_bytes ?? 0), 0);
    const kinds = Array.from(new Set(memberAssets.map((a) => a.kind)));

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      slug: p.slug,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      ownerId: p.created_by,
      ownerName: p.created_by ? ownerNameById.get(p.created_by) ?? "Workspace member" : "Workspace member",
      eventId: p.entity_type === "event" ? p.entity_id : null,
      eventName: p.entity_type === "event" && p.entity_id ? eventNameById.get(p.entity_id) ?? null : null,
      fileCount: memberList.length,
      totalSizeBytes,
      smart: meta.smart,
      audience: meta.audience,
      visibility: meta.visibility,
      downloads: meta.stats.downloads,
      shares: meta.stats.shares,
      lastDownloadAt: meta.stats.lastDownloadAt,
      lastSharedAt: meta.stats.lastSharedAt,
      coverStoragePath: p.cover_storage_path,
      memberKinds: kinds,
    };
  });

  // KPIs — all derived from the rows above, no invented figures.
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const totalPacks = rows.length;
  const sharedExternally = rows.filter((r) => r.visibility !== "internal").length;
  const packDownloads = rows.reduce((sum, r) => sum + r.downloads, 0);
  const recentlyUpdated = rows.filter((r) => new Date(r.updatedAt).getTime() >= sevenDaysAgo).length;
  const createdThisMonth = rows.filter((r) => new Date(r.createdAt).getTime() >= monthStart).length;
  const sharedPct = totalPacks > 0 ? Math.round((sharedExternally / totalPacks) * 100) : 0;
  const totalShares = rows.reduce((sum, r) => sum + r.shares, 0);
  const storageBytes = rows.reduce((sum, r) => sum + r.totalSizeBytes, 0);

  // Pickable assets for the Create Pack / Smart Pack file pickers (most recent, not-yet-deleted).
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

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Event Packs"
        description="Bundle files into curated packs for guests, staff, suppliers, speakers, sponsors and internal delivery teams."
        tabs={<LibraryTabs active="event-packs" basePath="/event-manager/library" />}
      />

      <EventPacksClient
        packs={rows}
        events={events}
        assets={pickableAssets}
        view={view}
        kpis={{
          totalPacks,
          sharedExternally,
          sharedPct,
          packDownloads,
          recentlyUpdated,
          createdThisMonth,
          totalShares,
          storageBytes,
        }}
      />
    </div>
  );
}
