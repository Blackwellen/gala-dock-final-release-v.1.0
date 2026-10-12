"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";

// Media Studio brand kit + design comments (media spec §34, §44, §46). Permissions are enforced in the database functions.
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const UUID = z.string().uuid();
const msg = (m: string) => /not_authorized|42501/.test(m) ? "You don’t have permission to do that." : /rate_limited/.test(m) ? "You’re commenting very quickly — wait a moment."
  : /invalid_/.test(m) ? "Some brand kit values aren’t valid." : "Something went wrong. Please try again.";

export type BrandKit = { colors: { hex: string; name?: string }[]; fonts: { family: string; role?: "heading" | "body" | "accent" }[]; logos: { path: string; name?: string }[] };
const Kit = z.object({
  colors: z.array(z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), name: z.string().max(40).optional() })).max(24),
  fonts: z.array(z.object({ family: z.string().regex(/^[A-Za-z0-9 \-]{2,60}$/), role: z.enum(["heading", "body", "accent"]).optional() })).max(12),
  logos: z.array(z.object({ path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp)$/), name: z.string().max(60).optional() })).max(12),
});

export async function saveBrandKit(workspaceId: string, kit: BrandKit): Promise<R> {
  const k = Kit.safeParse(kit);
  if (!UUID.safeParse(workspaceId).success || !k.success) return { ok: false, error: "Some brand kit values aren’t valid." };
  const sb = await createClient();
  const { error } = await sb.rpc("save_brand_kit" as never, { p_workspace: workspaceId, p_colors: k.data.colors, p_fonts: k.data.fonts, p_logos: k.data.logos } as never);
  if (error) return { ok: false, error: msg(error.message) };
  revalidatePath("/studio/[id]", "page");
  return { ok: true };
}

export type Comment = { id: string; parent_id: string | null; page_id: string | null; layer_id: string | null; body: string; resolved: boolean; created_at: string; author_id: string | null; author: string; mine: boolean };

export async function listComments(designId: string): Promise<R<Comment[]>> {
  if (!UUID.safeParse(designId).success) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await untyped(sb as never).from("design_comments").select("id,parent_id,page_id,layer_id,body,resolved,created_at,author_id")
    .eq("design_id", designId).order("created_at").limit(500);   // RLS: anyone who can open the design
  if (error) return { ok: false, error: msg(error.message) };
  const rows = (data ?? []) as Omit<Comment, "author" | "mine">[];
  const ids = [...new Set(rows.map(r => r.author_id).filter((x): x is string => !!x))];
  const { data: people } = ids.length ? await createAdminClient().from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map(p => [p.id, p.full_name || "Teammate"]));
  return { ok: true, data: rows.map(r => ({ ...r, author: (r.author_id && names.get(r.author_id)) || "Former member", mine: r.author_id === user?.id })) };
}

export async function addComment(designId: string, body: string, at?: { pageId?: string; layerId?: string; parentId?: string }): Promise<R<string>> {
  if (!UUID.safeParse(designId).success || (at?.parentId && !UUID.safeParse(at.parentId).success)) return { ok: false, error: "Not found." };
  const text = body.trim();
  if (!text || text.length > 4000) return { ok: false, error: "Comments must be 1–4,000 characters." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("add_design_comment" as never, { p_design: designId, p_body: text, p_page: at?.pageId ?? null, p_layer: at?.layerId ?? null, p_x: null, p_y: null, p_parent: at?.parentId ?? null } as never);
  if (error) return { ok: false, error: msg(error.message) };
  return { ok: true, data: data as unknown as string };
}

export async function resolveComment(commentId: string, resolved: boolean): Promise<R> {
  if (!UUID.safeParse(commentId).success) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { error } = await sb.rpc("resolve_design_comment" as never, { p_comment: commentId, p_resolved: resolved } as never);
  return error ? { ok: false, error: msg(error.message) } : { ok: true };
}

export async function deleteComment(commentId: string): Promise<R> {
  if (!UUID.safeParse(commentId).success) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { error } = await sb.rpc("delete_design_comment" as never, { p_comment: commentId } as never);
  return error ? { ok: false, error: msg(error.message) } : { ok: true };
}
