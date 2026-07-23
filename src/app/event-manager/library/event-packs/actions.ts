"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/types";
import type { LibraryKind } from "../library-utils";
import {
  parsePackMeta,
  serializePackMeta,
  type PackAudience,
  type PackVisibility,
  type PackSmartRules,
  type AssetVisibility,
} from "./pack-filter";

const LIST_PATH = "/event-manager/library/event-packs";

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "pack"
  );
}

async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  base: string
): Promise<string> {
  let slug = base;
  let n = 1;
  for (;;) {
    const { data } = await supabase
      .from("library_collections")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

async function requirePack(workspaceId: string, supabase: Awaited<ReturnType<typeof createClient>>, packId: string) {
  const { data: pack } = await supabase
    .from("library_collections")
    .select("id, name, auto_filter, entity_type, entity_id")
    .eq("id", packId)
    .eq("workspace_id", workspaceId)
    .eq("kind", "event_pack")
    .is("deleted_at", null)
    .maybeSingle();
  if (!pack) throw new Error("Pack not found or access denied");
  return pack;
}

/** Create a manual event pack and (optionally) seed it with the selected files. */
export async function createEventPack(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Pack name is required");
  const description = str(formData.get("description"));
  const eventId = str(formData.get("event_id"));
  const audience = (str(formData.get("audience")) as PackAudience | null) ?? "all";
  const visibility = (str(formData.get("visibility")) as PackVisibility | null) ?? "internal";
  const assetIds = formData.getAll("asset_ids").map(String).filter(Boolean);

  const meta = {
    smart: false,
    audience,
    visibility,
    rules: null,
    stats: { downloads: 0, shares: 0, lastDownloadAt: null, lastSharedAt: null },
  };
  const slug = await uniqueSlug(supabase, workspaceId, slugify(name));

  const { data: pack, error } = await supabase
    .from("library_collections")
    .insert({
      workspace_id: workspaceId,
      kind: "event_pack",
      name,
      slug,
      description,
      created_by: user.id,
      entity_type: eventId ? "event" : null,
      entity_id: eventId,
      auto_filter: serializePackMeta(meta),
    })
    .select("id")
    .single();
  if (error || !pack) throw new Error(error?.message ?? "Failed to create pack");

  if (assetIds.length > 0) {
    const { data: verified } = await supabase
      .from("library_assets")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("id", assetIds);
    const validIds = (verified ?? []).map((a) => a.id);
    if (validIds.length > 0) {
      await supabase.from("library_collection_members").insert(
        validIds.map((assetId, i) => ({ collection_id: pack.id, asset_id: assetId, position: i, added_by: user.id }))
      );
    }
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${pack.id}`);
}

/** Create a smart pack: persist the rule definition in `auto_filter`, then immediately materialize it. */
export async function createSmartPack(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Pack name is required");
  const description = str(formData.get("description"));
  const audience = (str(formData.get("audience")) as PackAudience | null) ?? "all";
  const visibility = (str(formData.get("visibility")) as PackVisibility | null) ?? "internal";
  const eventId = str(formData.get("event_id"));
  const kind = str(formData.get("kind")) as LibraryKind | null;
  const tag = str(formData.get("tag"));
  const assetVisibility = str(formData.get("asset_visibility")) as AssetVisibility | null;

  const rules: PackSmartRules = { eventId, kind, tag, assetVisibility };
  const meta = {
    smart: true,
    audience,
    visibility,
    rules,
    stats: { downloads: 0, shares: 0, lastDownloadAt: null, lastSharedAt: null },
  };
  const slug = await uniqueSlug(supabase, workspaceId, slugify(name));

  const { data: pack, error } = await supabase
    .from("library_collections")
    .insert({
      workspace_id: workspaceId,
      kind: "event_pack",
      name,
      slug,
      description,
      created_by: user.id,
      entity_type: eventId ? "event" : null,
      entity_id: eventId,
      auto_filter: serializePackMeta(meta),
    })
    .select("id")
    .single();
  if (error || !pack) throw new Error(error?.message ?? "Failed to create smart pack");

  await materializeSmartPack(pack.id);

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${pack.id}`);
}

/**
 * Evaluate a smart pack's `auto_filter.rules` against live `library_assets`
 * and sync `library_collection_members` to match: adds newly-matching
 * assets, removes members that no longer match. This is the "smart" part of
 * smart packs — it actually queries Supabase rather than just labelling a
 * static list.
 */
export async function materializeSmartPack(packId: string): Promise<{ matched: number; added: number; removed: number }> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const pack = await requirePack(workspaceId, supabase, packId);
  const meta = parsePackMeta(pack.auto_filter);
  if (!meta.smart || !meta.rules) return { matched: 0, added: 0, removed: 0 };

  let query = supabase.from("library_assets").select("id").eq("workspace_id", workspaceId).is("deleted_at", null);
  if (meta.rules.eventId) query = query.eq("entity_type", "event").eq("entity_id", meta.rules.eventId);
  if (meta.rules.kind) query = query.eq("kind", meta.rules.kind);
  if (meta.rules.tag) query = query.contains("tags", [meta.rules.tag]);
  if (meta.rules.assetVisibility) query = query.eq("visibility", meta.rules.assetVisibility);

  const { data: matches, error } = await query;
  if (error) throw new Error(error.message);
  const matchIds = new Set((matches ?? []).map((m) => m.id));

  const { data: existing } = await supabase
    .from("library_collection_members")
    .select("asset_id")
    .eq("collection_id", packId);
  const existingIds = new Set((existing ?? []).map((m) => m.asset_id));

  const toAdd = [...matchIds].filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !matchIds.has(id));

  if (toAdd.length > 0) {
    const startPos = existingIds.size;
    await supabase
      .from("library_collection_members")
      .insert(toAdd.map((assetId, i) => ({ collection_id: packId, asset_id: assetId, position: startPos + i })));
  }
  if (toRemove.length > 0) {
    await supabase.from("library_collection_members").delete().eq("collection_id", packId).in("asset_id", toRemove);
  }

  await supabase
    .from("library_collections")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", packId)
    .eq("workspace_id", workspaceId);

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${packId}`);
  return { matched: matchIds.size, added: toAdd.length, removed: toRemove.length };
}

/** Add one existing library asset to a pack (manual curation). */
export async function addAssetToPack(packId: string, assetId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  await requirePack(workspaceId, supabase, packId);

  const { data: asset } = await supabase
    .from("library_assets")
    .select("id")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!asset) throw new Error("File not found");

  const { count } = await supabase
    .from("library_collection_members")
    .select("asset_id", { count: "exact", head: true })
    .eq("collection_id", packId);

  const { error } = await supabase
    .from("library_collection_members")
    .insert({ collection_id: packId, asset_id: assetId, position: count ?? 0, added_by: user.id });
  if (error && error.code !== "23505") throw new Error(error.message);

  await supabase
    .from("library_collections")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", packId)
    .eq("workspace_id", workspaceId);

  revalidatePath(`${LIST_PATH}/${packId}`);
  revalidatePath(LIST_PATH);
}

/** Remove a file from a pack. Does not delete the underlying asset. */
export async function removeAssetFromPack(packId: string, assetId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await requirePack(workspaceId, supabase, packId);

  await supabase.from("library_collection_members").delete().eq("collection_id", packId).eq("asset_id", assetId);
  await supabase
    .from("library_collections")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", packId)
    .eq("workspace_id", workspaceId);

  revalidatePath(`${LIST_PATH}/${packId}`);
  revalidatePath(LIST_PATH);
}

/** Reorder a pack's member files (drag-to-reorder / move up-down controls on the detail page). */
export async function reorderPackMembers(packId: string, orderedAssetIds: string[]) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await requirePack(workspaceId, supabase, packId);

  await Promise.all(
    orderedAssetIds.map((assetId, i) =>
      supabase.from("library_collection_members").update({ position: i }).eq("collection_id", packId).eq("asset_id", assetId)
    )
  );

  revalidatePath(`${LIST_PATH}/${packId}`);
}

/** Update a pack's name/description/audience/visibility. */
export async function updateEventPack(packId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const pack = await requirePack(workspaceId, supabase, packId);
  const meta = parsePackMeta(pack.auto_filter);

  const name = str(formData.get("name"));
  const description = formData.has("description") ? str(formData.get("description")) : undefined;
  const audience = str(formData.get("audience")) as PackAudience | null;
  const visibility = str(formData.get("visibility")) as PackVisibility | null;

  if (audience) meta.audience = audience;
  if (visibility) meta.visibility = visibility;

  const patch: TablesUpdate<"library_collections"> = {
    auto_filter: serializePackMeta(meta),
    updated_at: new Date().toISOString(),
  };
  if (name) patch.name = name;
  if (description !== undefined) patch.description = description;

  const { error } = await supabase
    .from("library_collections")
    .update(patch)
    .eq("id", packId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`${LIST_PATH}/${packId}`);
  revalidatePath(LIST_PATH);
}

/** Soft-delete (archive) a pack. Member rows and underlying assets are untouched. */
export async function archiveEventPack(packId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await requirePack(workspaceId, supabase, packId);

  const { error } = await supabase
    .from("library_collections")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", packId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(LIST_PATH);
}

/** Duplicate a pack (metadata + member list), reset to a fresh draft with zeroed stats. */
export async function duplicateEventPack(packId: string): Promise<string> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const pack = await requirePack(workspaceId, supabase, packId);
  const { data: full } = await supabase
    .from("library_collections")
    .select("name, description, entity_type, entity_id")
    .eq("id", packId)
    .single();
  if (!full) throw new Error("Pack not found");

  const meta = parsePackMeta(pack.auto_filter);
  meta.stats = { downloads: 0, shares: 0, lastDownloadAt: null, lastSharedAt: null };

  const slug = await uniqueSlug(supabase, workspaceId, slugify(`${full.name}-copy`));
  const { data: copy, error } = await supabase
    .from("library_collections")
    .insert({
      workspace_id: workspaceId,
      kind: "event_pack",
      name: `${full.name} (Copy)`,
      slug,
      description: full.description,
      created_by: user.id,
      entity_type: full.entity_type,
      entity_id: full.entity_id,
      auto_filter: serializePackMeta(meta),
    })
    .select("id")
    .single();
  if (error || !copy) throw new Error(error?.message ?? "Failed to duplicate pack");

  const { data: members } = await supabase
    .from("library_collection_members")
    .select("asset_id, position")
    .eq("collection_id", packId);
  if (members && members.length > 0) {
    await supabase.from("library_collection_members").insert(
      members.map((m) => ({ collection_id: copy.id, asset_id: m.asset_id, position: m.position, added_by: user.id }))
    );
  }

  revalidatePath(LIST_PATH);
  return copy.id;
}

/** Record a pack download event (increments the pack-level counter stored in `auto_filter.stats`). */
export async function recordPackDownload(packId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const pack = await requirePack(workspaceId, supabase, packId);
  const meta = parsePackMeta(pack.auto_filter);
  meta.stats.downloads += 1;
  meta.stats.lastDownloadAt = new Date().toISOString();

  await supabase
    .from("library_collections")
    .update({ auto_filter: serializePackMeta(meta) })
    .eq("id", packId)
    .eq("workspace_id", workspaceId);

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${packId}`);
}

/**
 * Resolve presigned download URLs for every file in a pack and record the
 * download. Real R2 presigning when configured; degrades to `url: null` per
 * file (surfaced by the client as "storage not configured") otherwise — no
 * fake zip file is produced since true zip bundling isn't wired this pass.
 */
export async function getPackDownloadUrls(
  packId: string
): Promise<{ id: string; title: string; url: string | null }[]> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await requirePack(workspaceId, supabase, packId);

  const { data: members } = await supabase
    .from("library_collection_members")
    .select("asset_id")
    .eq("collection_id", packId)
    .order("position", { ascending: true });
  const assetIds = (members ?? []).map((m) => m.asset_id);
  if (assetIds.length === 0) return [];

  const { data: assets } = await supabase
    .from("library_assets")
    .select("id, title, storage_path")
    .in("id", assetIds);

  const { r2Configured, r2PresignedGet } = await import("@/lib/storage/r2");
  const configured = r2Configured();

  const results = await Promise.all(
    (assets ?? []).map(async (a) => {
      if (!configured || !a.storage_path) return { id: a.id, title: a.title, url: null };
      try {
        const url = await r2PresignedGet({ key: a.storage_path });
        return { id: a.id, title: a.title, url };
      } catch {
        return { id: a.id, title: a.title, url: null };
      }
    })
  );

  await recordPackDownload(packId);
  return results;
}

/**
 * Generate external share links for every file currently in the pack.
 * `library_share_links` is scoped to a single asset, not a collection, so
 * pack-level sharing is modelled pragmatically as "share every file in the
 * pack" rather than a single collection-level link — see release notes for
 * the schema-gap writeup recommending a dedicated collection-scoped share
 * table in a future migration.
 */
export async function sharePackExternally(packId: string): Promise<{ linksCreated: number }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const pack = await requirePack(workspaceId, supabase, packId);

  const { data: members } = await supabase
    .from("library_collection_members")
    .select("asset_id")
    .eq("collection_id", packId);
  const assetIds = (members ?? []).map((m) => m.asset_id);
  if (assetIds.length === 0) throw new Error("Add files to this pack before sharing");

  let linksCreated = 0;
  for (const assetId of assetIds) {
    const { data: existing } = await supabase
      .from("library_share_links")
      .select("id")
      .eq("asset_id", assetId)
      .is("revoked_at", null)
      .maybeSingle();
    if (existing) continue;

    const token = randomBytes(24).toString("base64url");
    const { error } = await supabase
      .from("library_share_links")
      .insert({ asset_id: assetId, token, scope: "download", created_by: user.id });
    if (!error) linksCreated += 1;
  }

  const meta = parsePackMeta(pack.auto_filter);
  if (meta.visibility === "internal") meta.visibility = "shared";
  meta.stats.shares += 1;
  meta.stats.lastSharedAt = new Date().toISOString();

  await supabase
    .from("library_collections")
    .update({ auto_filter: serializePackMeta(meta), updated_at: new Date().toISOString() })
    .eq("id", packId)
    .eq("workspace_id", workspaceId);

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${packId}`);
  return { linksCreated };
}

/** Copy-link quick action: returns (or creates) an active share token for the pack's first file. */
export async function copyPackLink(packId: string): Promise<string> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  await requirePack(workspaceId, supabase, packId);

  const { data: firstMember } = await supabase
    .from("library_collection_members")
    .select("asset_id")
    .eq("collection_id", packId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!firstMember) throw new Error("Add files to this pack first");

  const { data: existing } = await supabase
    .from("library_share_links")
    .select("token")
    .eq("asset_id", firstMember.asset_id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.token;

  const token = randomBytes(24).toString("base64url");
  await supabase
    .from("library_share_links")
    .insert({ asset_id: firstMember.asset_id, token, scope: "view", created_by: user.id });
  return token;
}
