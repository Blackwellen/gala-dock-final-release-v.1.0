"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Lane D · S4 — media library, galleries and brand rules (Q23 domains 148–149, migration 202610291041). Public-use checks,
 * gallery publish checks, brand-kit validation and versions are enforced in SQL; these validate shape and translate errors.
 */
const Id = z.string().uuid();
const PROBLEM: Record<string, string> = { alt_text_required: "add alt text", licence_unknown: "choose a licence", licence_expired: "the licence has expired", credit_required: "add a credit or licence holder",
  not_approved: "approve it first", file_missing: "the file is missing", file_unverified: "the file is external or not scanned", file_pending: "the file scan is pending", file_quarantined: "the file failed its scan", file_blocked: "the file is blocked" };
const problems = (p: string[]) => p.map(x => PROBLEM[x] ?? x.replace(/_/g, " ")).join(", ");
const why = (m: string) =>
  /not_authorized|42501/.test(m) ? "You don't have permission to do that."
  : /media_not_publishable: ?(.*)/.test(m) ? `Not ready for public use: ${problems((/media_not_publishable: ?(.*)/.exec(m)?.[1] ?? "").split(","))}.`
  : /gallery_item_not_public/.test(m) ? "Every item in a public gallery must be cleared for public use."
  : /asset_not_in_workspace/.test(m) ? "Choose media from this workspace."
  : /event_not_in_workspace/.test(m) ? "Choose an event from this workspace."
  : /invalid_colour/.test(m) ? "Colours must be 6-digit hex values like #1B64F5."
  : /font_not_available/.test(m) ? "Choose a font from the list or upload it first." : /invalid_logo_path/.test(m) ? "A logo path is invalid." : /invalid_rule/.test(m) ? "Unknown brand rule."
  : /check constraint|22P02|invalid input syntax/.test(m) ? "Check the values entered." : /not_found|P0002/.test(m) ? "Not found." : "Something went wrong. Please try again.";

async function rpc<T>(fn: string, args: Record<string, unknown>, paths: string[]): Promise<ActionResult<T>> {
  const { data, error } = await untyped(await createClient()).rpc(fn, args);
  if (error) return { ok: false, error: why(error.message) };
  paths.forEach(p => revalidatePath(p));
  return { ok: true, data: data as T };
}
const PATHS = ["/organizer/media"];

const Meta = z.object({ alt_text: z.string().trim().max(500), licence: z.enum(["owned", "licensed", "cc_by", "cc_by_sa", "cc0", "stock", "unknown"]), licence_holder: z.string().trim().max(200),
  licence_expires_at: z.string().datetime({ offset: true }).nullable(), credit: z.string().trim().max(200), subject: z.enum(["event", "venue", "provider", "sponsor", "brand", "previous"]),
  status: z.enum(["draft", "approved", "published"]), public: z.boolean() });

/** Saves an asset's rights metadata and, when `public`, clears it for public use (refused with the reasons if it isn't ready). */
export async function saveAssetMetadata(assetId: string, input: unknown): Promise<ActionResult<{ problems: string[] }>> {
  const p = Meta.safeParse(input); if (!Id.safeParse(assetId).success || !p.success) return { ok: false, error: "Check the media details." };
  const { licence_expires_at, ...m } = p.data;
  const r = await rpc<{ ok: boolean; problems: string[] }>("media_asset_publish", { p_asset: assetId, p_meta: { ...m, ...(licence_expires_at ? { licence_expires_at } : {}) } }, PATHS);
  if (!r.ok || !r.data) return r as ActionResult<{ problems: string[] }>;
  if (!r.data.ok) return { ok: false, error: `Saved, but not cleared for public use: ${problems(r.data.problems)}.`, data: { problems: r.data.problems } };
  return { ok: true, message: p.data.public ? "Saved and cleared for public use" : "Media details saved", data: { problems: r.data.problems } };
}

const Items = z.array(z.object({ asset_id: Id, sort: z.number().int().min(0).max(1000), caption: z.string().trim().max(300).optional() })).max(200);
export async function saveGallery(workspaceId: string, galleryId: string | null, title: string, eventId: string | null, items: unknown, expectedVersion: number | null): Promise<ActionResult<{ id: string; version: number }>> {
  const it = Items.safeParse(items);
  if (!Id.safeParse(workspaceId).success || (galleryId && !Id.safeParse(galleryId).success) || (eventId && !Id.safeParse(eventId).success) || !it.success) return { ok: false, error: "Check the gallery." };
  if (title.trim().length < 2 || title.length > 120) return { ok: false, error: "Give the gallery a title (2–120 characters)." };
  const r = await rpc<{ ok: boolean; id: string; version: number; conflict?: boolean }>("save_media_gallery", { p_workspace: workspaceId, p_gallery: galleryId, p_title: title.trim(), p_event: galleryId ? null : eventId, p_listing: null,
    p_items: galleryId ? it.data : (it.data.length ? it.data : null), p_expected_version: expectedVersion }, PATHS);
  if (r.ok && r.data?.conflict) return { ok: false, error: "Someone else changed this gallery — refresh to see the latest version." };
  return r.ok ? { ok: true, message: galleryId ? "Gallery saved" : "Gallery created", data: { id: r.data!.id, version: r.data!.version } } : r as ActionResult<{ id: string; version: number }>;
}

export async function setGalleryPublic(galleryId: string, isPublic: boolean): Promise<ActionResult> {
  if (!Id.safeParse(galleryId).success) return { ok: false, error: "Invalid gallery." };
  const r = await rpc<{ ok: boolean; error?: string; items?: { asset_id: string; problems: string[] }[] }>("publish_media_gallery", { p_gallery: galleryId, p_public: isPublic }, PATHS);
  if (!r.ok || !r.data) return r;
  if (!r.data.ok) return { ok: false, error: r.data.error === "gallery_empty" ? "Add at least one item before publishing." : `${r.data.items?.length ?? 0} item(s) aren't ready for public use: ${problems([...new Set((r.data.items ?? []).flatMap(i => i.problems))])}.` };
  return { ok: true, message: isPublic ? "Gallery published" : "Gallery unpublished" };
}

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Kit = z.object({ colors: z.array(Hex).max(24), fonts: z.array(z.string().min(2).max(60)).max(12),
  rules: z.object({ palette_only: z.boolean(), kit_fonts_only: z.boolean(), min_contrast: z.number().min(1).max(21).optional(), min_logo_px: z.number().int().min(8).max(2000).optional(), logo_clear_space_pct: z.number().min(0).max(100).optional() }).strict() });
/** Saves the brand kit's colours, fonts and rules as a new version; logos, tokens and sponsor marks are kept as they are. */
export async function saveBrandRules(workspaceId: string, input: unknown, expectedVersion: number | null): Promise<ActionResult<{ version: number }>> {
  const p = Kit.safeParse(input); if (!Id.safeParse(workspaceId).success || !p.success) return { ok: false, error: "Check the colours (6-digit hex) and rule values." };
  const sb = untyped(await createClient());
  const { data: cur } = await sb.from("brand_kits").select("logos,tokens,sponsor_marks").eq("workspace_id", workspaceId).maybeSingle();
  const c = (cur ?? {}) as { logos?: unknown; tokens?: unknown; sponsor_marks?: unknown };
  const r = await rpc<{ ok: boolean; version: number; conflict?: boolean }>("save_brand_kit", { p_workspace: workspaceId, p_kit: { ...p.data, logos: c.logos ?? [], tokens: c.tokens ?? {}, sponsor_marks: c.sponsor_marks ?? [] }, p_expected_version: expectedVersion }, PATHS);
  if (r.ok && r.data?.conflict) return { ok: false, error: "The brand kit changed since you opened it — refresh to see the latest version." };
  return r.ok ? { ok: true, message: `Brand kit saved as version ${r.data!.version}`, data: { version: r.data!.version } } : r as ActionResult<{ version: number }>;
}

export async function checkDesignBrand(designId: string): Promise<ActionResult<{ ok: boolean; kit: boolean; kit_version?: number; findings: { rule: string; value: string }[] }>> {
  if (!Id.safeParse(designId).success) return { ok: false, error: "Invalid design." };
  const { data, error } = await untyped(await createClient()).rpc("brand_check_design", { p_design: designId });
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true, data: data as { ok: boolean; kit: boolean; kit_version?: number; findings: { rule: string; value: string }[] } };
}
