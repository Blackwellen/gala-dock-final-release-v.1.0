import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { LibraryTabs } from "../_shared";
import { parseBrandMetadata, BRAND_ASSET_BUCKET } from "./brand-assets-utils";
import { BrandAssetsClient, type BrandAssetRow } from "./BrandAssetsClient";
import type { LibraryKind } from "../library-utils";

export const metadata = { title: "Brand Assets" };

// Legacy/demo rows may already carry one of these specific `kind` enum values
// without `metadata.asset_type` set — they're still treated as brand assets
// (tagged "other") so nothing pre-existing silently disappears from the tab.
const LEGACY_BRAND_KINDS: LibraryKind[] = ["asset", "poster", "flyer", "signage", "presentation"];

// The metadata-jsonb brand taxonomy. Any row (regardless of its `kind`
// column) tagged with one of these in `metadata.asset_type` belongs here —
// this is how a plain "image" or "document" kind row becomes a Logo, Colour
// Palette, Typography kit, etc. See brand-assets-utils.ts for the modeling
// rationale (no `brands` table exists in the live schema).
const BRAND_ASSET_TYPES = [
  "logo",
  "brand_kit",
  "colour_palette",
  "typography",
  "social_artwork",
  "sponsor_asset",
  "template",
  "photography",
  "video",
] as const;

export default async function BrandAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const { workspaceId, workspace } = await requireWorkspace();
  const supabase = await createClient();

  const selectCols =
    "id, title, description, kind, mime, size_bytes, storage_path, cover_storage_path, tags, metadata, entity_type, entity_id, collection_id, owner_user_id, visibility, locked_at, locked_by_user_id, use_count, created_at, updated_at";

  const [byKind, byTaxonomy] = await Promise.all([
    supabase
      .from("library_assets")
      .select(selectCols)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("kind", LEGACY_BRAND_KINDS)
      .order("created_at", { ascending: false }),
    supabase
      .from("library_assets")
      .select(selectCols)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .filter("metadata->>asset_type", "in", `(${BRAND_ASSET_TYPES.join(",")})`)
      .order("created_at", { ascending: false }),
  ]);

  const byId = new Map<string, NonNullable<typeof byKind.data>[number]>();
  for (const row of byKind.data ?? []) byId.set(row.id, row);
  for (const row of byTaxonomy.data ?? []) byId.set(row.id, row);
  const merged = Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Resolve owner display names.
  const ownerIds = Array.from(new Set(merged.map((a) => a.owner_user_id).filter((id): id is string => !!id)));
  const ownerNameById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds);
    for (const p of profiles ?? []) ownerNameById.set(p.user_id, p.display_name ?? "Unknown");
  }

  // Resolve linked event names (used to derive the "Brand" grouping label —
  // see brand-assets-utils.ts / build summary for why this isn't a real
  // `brands` table join).
  const eventIds = Array.from(
    new Set(merged.filter((a) => a.entity_type === "event" && a.entity_id).map((a) => a.entity_id as string))
  );
  const eventNameById = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase.from("events").select("id, name").eq("workspace_id", workspaceId).in("id", eventIds);
    for (const e of events ?? []) eventNameById.set(e.id, e.name);
  }

  // Resolve real version counts from library_versions.
  const assetIds = merged.map((a) => a.id);
  const versionCountById = new Map<string, number>();
  if (assetIds.length > 0) {
    const { data: versions } = await supabase.from("library_versions").select("asset_id").in("asset_id", assetIds);
    for (const v of versions ?? []) versionCountById.set(v.asset_id, (versionCountById.get(v.asset_id) ?? 0) + 1);
  }

  // Resolve preview URLs for image-kind assets (private bucket -> signed URL),
  // mirroring how the sibling Templates tab resolves cover previews.
  const previewUrlByAsset = new Map<string, string>();
  await Promise.all(
    merged
      .filter((a) => (a.cover_storage_path || a.storage_path) && (a.kind === "image" || a.mime?.startsWith("image/")))
      .map(async (a) => {
        const path = a.cover_storage_path ?? a.storage_path;
        if (!path) return;
        if (/^https?:\/\//i.test(path)) {
          previewUrlByAsset.set(a.id, path);
          return;
        }
        const { data } = await supabase.storage.from(BRAND_ASSET_BUCKET).createSignedUrl(path, 3600);
        if (data?.signedUrl) previewUrlByAsset.set(a.id, data.signedUrl);
      })
  );

  const rows: BrandAssetRow[] = merged.map((a) => {
    const md = parseBrandMetadata(a.metadata);
    const eventName = a.entity_type === "event" && a.entity_id ? eventNameById.get(a.entity_id) ?? null : null;
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      kind: a.kind,
      mime: a.mime,
      sizeBytes: a.size_bytes,
      storagePath: a.storage_path,
      coverStoragePath: a.cover_storage_path,
      previewUrl: previewUrlByAsset.get(a.id) ?? null,
      tags: a.tags ?? [],
      ownerId: a.owner_user_id,
      ownerName: a.owner_user_id ? ownerNameById.get(a.owner_user_id) ?? "Unknown" : "Unassigned",
      eventId: a.entity_type === "event" ? a.entity_id : null,
      eventName,
      brandLabel: md.brand_name ?? eventName ?? workspace.name,
      visibility: a.visibility,
      lockedAt: a.locked_at,
      lockedByUserId: a.locked_by_user_id,
      useCount: a.use_count ?? 0,
      versionCount: Math.max(1, versionCountById.get(a.id) ?? 1),
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      assetType: md.asset_type,
      approvalStatus: md.approval_status,
      hexColors: md.hex_colors,
      fontNames: md.font_names,
      starred: md.starred,
      approvedBy: md.approved_by ? ownerNameById.get(md.approved_by) ?? null : null,
      approvedAt: md.approved_at,
      rejectedReason: md.rejected_reason,
    };
  });

  // Options for filter dropdowns, resolved from real data.
  const owners = Array.from(new Map(rows.map((r) => [r.ownerId ?? "unassigned", r.ownerName])).entries()).map(
    ([id, name]) => ({ id, name })
  );
  const brands = Array.from(new Set(rows.map((r) => r.brandLabel))).sort();
  const events = Array.from(
    new Map(
      merged
        .filter((a) => a.entity_type === "event" && a.entity_id)
        .map((a) => [a.entity_id as string, eventNameById.get(a.entity_id as string) ?? "Event"])
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Brand Assets"
        description="Centralize logos, colour palettes, typography kits, social artwork, sponsor assets and approved visual identity files."
        tabs={<LibraryTabs active="brand-assets" basePath="/event-manager/library" />}
      />
      <BrandAssetsClient
        rows={rows}
        owners={owners}
        brands={brands}
        events={events}
        workspaceName={workspace.name}
        view={view === "list" ? "list" : "grid"}
      />
    </div>
  );
}
