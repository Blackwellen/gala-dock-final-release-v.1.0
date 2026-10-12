"use server";

import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { Layer } from "./document";

// "My elements" for Media Studio: uploaded images/GIFs/SVGs and saved layer groups, private or shared with the team.
// Row-level security decides who sees, adds and removes each element.
export type DesignElement = { id: string; kind: "image" | "gif" | "svg" | "group"; title: string; path: string | null; width: number; height: number;
  data: { layers?: Layer[] }; tags: string[]; shared: boolean; mine: boolean; created_at: string };
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp|gif|svg)$/i;

export async function listElements(workspaceId: string | null): Promise<R<DesignElement[]>> {
  const sb = await createClient(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  let q = untyped(sb as never).from("design_elements").select("id,kind,title,path,width,height,data,tags,workspace_id,owner_id,created_at").order("created_at", { ascending: false }).limit(300);
  q = workspaceId && UUID.test(workspaceId) ? q.or(`owner_id.eq.${user.id},workspace_id.eq.${workspaceId}`) : q.eq("owner_id", user.id);
  const { data, error } = await q;
  if (error) return { ok: false, error: "Couldn’t load your elements." };
  return { ok: true, data: ((data ?? []) as (DesignElement & { workspace_id: string | null; owner_id: string })[]).map(e => ({ ...e, shared: !!e.workspace_id, mine: e.owner_id === user.id })) };
}

export async function saveElement(i: { kind: DesignElement["kind"]; title: string; path?: string | null; width: number; height: number; layers?: Layer[]; tags?: string[]; workspaceId?: string | null }): Promise<R<string>> {
  if (!["image", "gif", "svg", "group"].includes(i.kind)) return { ok: false, error: "Unsupported element." };
  if (i.kind === "group" ? !i.layers?.length : !i.path || !PATH.test(i.path)) return { ok: false, error: i.kind === "group" ? "Select something to save first." : "Upload the file first." };
  if (i.workspaceId && !UUID.test(i.workspaceId)) return { ok: false, error: "Workspace not found." };
  const data = i.kind === "group" ? { layers: i.layers!.slice(0, 200) } : {};
  if (JSON.stringify(data).length > 590_000) return { ok: false, error: "That selection is too large to save as one element. Save fewer layers, or remove embedded images." };
  const sb = await createClient();
  const { data: row, error } = await untyped(sb as never).from("design_elements").insert({ kind: i.kind, title: i.title.trim().slice(0, 120) || "Element", path: i.kind === "group" ? null : i.path,
    width: Math.max(0, Math.min(20000, Math.round(i.width))), height: Math.max(0, Math.min(20000, Math.round(i.height))), data,
    tags: (i.tags ?? []).map(t => t.trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 10), workspace_id: i.workspaceId ?? null }).select("id").single();
  if (error || !row) return { ok: false, error: /row-level|42501/.test(error?.message ?? "") ? "You can only save your own uploads." : "Couldn’t save the element." };
  return { ok: true, data: (row as { id: string }).id };
}

export async function updateElement(id: string, patch: { title?: string; shared?: boolean; workspaceId?: string | null }): Promise<R> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const p: Record<string, unknown> = {};
  if (patch.title !== undefined) p.title = patch.title.trim().slice(0, 120) || "Element";
  if (patch.shared !== undefined) p.workspace_id = patch.shared && patch.workspaceId && UUID.test(patch.workspaceId) ? patch.workspaceId : null;
  const { error } = await untyped(sb as never).from("design_elements").update(p).eq("id", id);
  return error ? { ok: false, error: "Only the person who added it can change it." } : { ok: true };
}

export async function deleteElement(id: string): Promise<R> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { error, count } = await untyped(sb as never).from("design_elements").delete({ count: "exact" }).eq("id", id);
  return error || !count ? { ok: false, error: "You can’t remove this element." } : { ok: true };
}
