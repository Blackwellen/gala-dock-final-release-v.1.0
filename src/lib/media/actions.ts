"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { PRESETS, blankDoc, posterFromEvent, reflow, type DesignDoc, type EventData, type ImageLayer } from "./document";

// Media Studio actions (media spec §5–17, §49–51). Permissions + optimistic concurrency live in the DB functions.
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (m: string): R<never> => ({ ok: false, error: /version_conflict/.test(m) ? "This design was changed in another tab. Reload to get the latest version." : /not_authorized|42501/.test(m) ? "You don’t have access to this design." : /publishing_restricted/.test(m) ? "Public template publishing is restricted for your account." : /template_not_found/.test(m) ? "That template isn’t available." : "Couldn’t save — try again." });
const bump = () => { revalidatePath("/organizer/media", "page"); revalidatePath("/provider/media", "page"); revalidatePath("/studio/[id]", "page"); };

export async function createDesign(i: { workspaceId: string | null; eventId?: string | null; title?: string; preset?: string; width?: number; height?: number; transparent?: boolean; templateId?: string; fromEvent?: boolean }): Promise<R<string>> {
  if ((i.workspaceId && !UUID.test(i.workspaceId)) || (i.eventId && !UUID.test(i.eventId)) || (i.templateId && !UUID.test(i.templateId))) return { ok: false, error: "Not found." };
  const p = PRESETS.find(x => x.id === i.preset);
  const w = Math.round(Math.min(8000, Math.max(50, i.width ?? p?.w ?? 1080))), h = Math.round(Math.min(8000, Math.max(50, i.height ?? p?.h ?? 1080)));
  let doc: DesignDoc = blankDoc(w, h, i.transparent ? null : { type: "solid", color: "#ffffff" });
  if (i.fromEvent && i.eventId) {
    const sb = await createClient();
    const { data: ev } = await sb.from("events").select("cover_image").eq("id", i.eventId).maybeSingle();
    doc = posterFromEvent(w, h, { imageSrc: ev?.cover_image ?? null });
  }
  const sb = await createClient();
  const { data, error } = await sb.rpc("create_design" as never, { p_workspace: i.workspaceId, p_event: i.eventId ?? null, p_title: i.title ?? (p ? `${p.label} design` : "Untitled design"),
    p_document: doc, p_source: i.templateId ? "template" : "blank", p_template: i.templateId ?? null, p_link_hash: null } as never);
  if (error) return fail(error.message);
  bump(); return { ok: true, data: data as unknown as string };
}

export async function saveDesign(id: string, doc: DesignDoc, expectedVersion: number, title?: string, label?: string): Promise<R<number>> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  if (JSON.stringify(doc).length > 3_800_000) return { ok: false, error: "This design is too large to save. Remove some embedded media." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("save_design" as never, { p_design: id, p_document: doc, p_expected_version: expectedVersion, p_title: title ?? null, p_label: label ?? null } as never);
  if (error) return fail(error.message);
  if (label) bump();
  return { ok: true, data: data as unknown as number };
}

export async function restoreVersion(id: string, version: number): Promise<R<number>> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("restore_design_version" as never, { p_design: id, p_version: version } as never);
  if (error) return fail(error.message);
  bump(); return { ok: true, data: data as unknown as number };
}

/** Duplicate, or create resized format variants (§49) — reflowed proportionally, never stretched; the user reviews the result. */
export async function deriveDesign(id: string, mode: "duplicate" | "variant", presetIds: string[] = []): Promise<R<string[]>> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { data: d } = await untyped(sb as never).from("designs").select("workspace_id,event_id,title,document").eq("id", id).maybeSingle();
  if (!d) return { ok: false, error: "Not found." };
  const targets = mode === "duplicate" ? [null] : presetIds.map(p => PRESETS.find(x => x.id === p)).filter(Boolean);
  const ids: string[] = [];
  for (const t of targets) {
    const doc = d.document as DesignDoc;
    const next: DesignDoc = t ? { ...doc, pages: doc.pages.map(pg => reflow(pg, t.w, t.h)) } : doc;
    const { data, error } = await sb.rpc("create_design" as never, { p_workspace: d.workspace_id, p_event: d.event_id, p_title: t ? `${d.title} — ${t.label}` : `${d.title} (copy)`, p_document: next, p_source: t ? "variant" : "duplicate", p_template: null, p_link_hash: null } as never);
    if (error) return fail(error.message);
    ids.push(data as unknown as string);
  }
  bump(); return { ok: true, data: ids };
}

export async function archiveDesign(id: string): Promise<R> {
  const sb = await createClient();
  const { data: d } = await untyped(sb as never).from("designs").select("id").eq("id", id).maybeSingle();
  if (!d) return { ok: false, error: "Not found." };
  const { data: access } = await sb.rpc("design_access" as never, { p_design: id } as never);
  if (access !== "owner" && access !== "edit") return { ok: false, error: "You can’t archive this design." };
  await untyped(createAdminClient() as never).from("designs").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  bump(); return { ok: true };
}

/**
 * Publish as a template (§8, §51). Private uploads are first copied to a public derivative under templates/, so the public
 * template never exposes the private original; event-bound text reverts to {{placeholders}} in the database function.
 */
export async function publishTemplate(id: string, meta: { title: string; description: string; category: string; tags: string[]; visibility: "private" | "workspace" | "link" | "public" }): Promise<R<string>> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const db = untyped(sb as never), admin = createAdminClient();
  const { data: d } = await db.from("designs").select("document,version").eq("id", id).maybeSingle();
  if (!d) return { ok: false, error: "Not found." };
  if (meta.visibility === "public" || meta.visibility === "link") {
    const doc = d.document as DesignDoc; let changed = false;
    for (const pg of doc.pages) for (const l of pg.layers) {
      if (l.type !== "image" || l.asset.public || !l.asset.path) continue;
      const { data: ok } = await sb.rpc("can_read_media_path" as never, { p_path: l.asset.path } as never);
      if (!ok) continue;
      const file = await admin.storage.from("workspace-files").download(l.asset.path);
      if (file.error || !file.data) continue;
      const dest = `templates/${randomUUID()}.${l.asset.path.split(".").pop()}`;
      const up = await admin.storage.from("event-media").upload(dest, file.data, { contentType: file.data.type, upsert: false });
      if (up.error) continue;
      (l as ImageLayer).asset = { ...l.asset, src: admin.storage.from("event-media").getPublicUrl(dest).data.publicUrl, path: undefined, public: true }; changed = true;
    }
    if (changed) { const r = await saveDesign(id, doc, d.version as number, undefined, "Before publishing template"); if (!r.ok) return r as R<never>; }
  }
  const token = meta.visibility === "link" ? randomUUID().replace(/-/g, "") : null;
  const { data, error } = await sb.rpc("publish_template" as never, { p_design: id, p_title: meta.title, p_description: meta.description, p_category: meta.category, p_tags: meta.tags.slice(0, 10),
    p_visibility: meta.visibility, p_link_hash: token } as never);
  if (error) return fail(error.message);
  bump(); return { ok: true, data: data as unknown as string };
}

export async function reportTemplate(templateId: string, reason: string, detail: string): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.rpc("report_template" as never, { p_template: templateId, p_reason: reason, p_detail: detail } as never);
  return error ? { ok: false, error: "Couldn’t send the report." } : { ok: true };
}

/** Live event data for {{placeholders}} and bound QR codes (§6, §43). */
export async function eventDataFor(eventId: string | null): Promise<EventData> {
  if (!eventId || !UUID.test(eventId)) return {};
  const sb = await createClient();
  const { data: e } = await sb.from("events").select("name,starts_at,venue_name,city,slug,timezone,workspace_id,cover_image,settings").eq("id", eventId).maybeSingle();
  if (!e) return {};
  const { data: tiers } = await sb.from("ticket_tiers").select("price").eq("event_id", eventId).gt("price", 0).order("price").limit(1);
  const { data: ws } = e.workspace_id ? await sb.from("workspaces").select("name").eq("id", e.workspace_id).maybeSingle() : { data: null };
  const tz = e.timezone ?? "Europe/London";
  return {
    "event.name": e.name, "event.venue_name": e.venue_name ?? "", "event.city": e.city ?? "",
    "event.date": e.starts_at ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(new Date(e.starts_at)) : "Date TBC",
    "event.time": e.starts_at ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(e.starts_at)) : "",
    "event.public_url": `https://www.galadock.com/events/${e.slug ?? eventId}`,
    "ticket.starting_price": tiers?.[0] ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(tiers[0].price)) : "Free",
    "organizer.name": ws?.name ?? "",
    ...(() => { const img = ((e.settings ?? {}) as { hero_image?: string }).hero_image || e.cover_image; return img && /^(https:|\/)/.test(img) ? { "event.cover_image": img } : {}; })(),
  };
}

export type TemplateSummary = { id: string; title: string; category: string; usage_count: number; scope: "starter" | "community" | "workspace" | "mine"; document: DesignDoc };
/** Templates the reader may use, for the editor's Templates tab: platform starters, public community, their workspace's and their own. */
export async function listTemplates(scope: "all" | "starter" | "community" | "workspace", q: string, workspaceId: string | null): Promise<R<TemplateSummary[]>> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const term = String(q ?? "").replace(/[%_,()]/g, " ").trim().slice(0, 60);
  let query = untyped(sb as never).from("design_templates").select("id,title,category,usage_count,document,workspace_id,owner_id,visibility").eq("status", "active").order("usage_count", { ascending: false }).limit(48);
  if (scope === "starter") query = query.is("workspace_id", null).is("owner_id", null);
  else if (scope === "community") query = query.eq("visibility", "public").not("owner_id", "is", null);
  else if (scope === "workspace") query = workspaceId && UUID.test(workspaceId) ? query.or(`workspace_id.eq.${workspaceId},owner_id.eq.${user.id}`) : query.eq("owner_id", user.id);
  if (term) query = query.or(`title.ilike.%${term}%,category.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) return fail(error.message);
  return { ok: true, data: ((data ?? []) as (TemplateSummary & { workspace_id: string | null; owner_id: string | null; visibility: string })[]).map(t => ({
    id: t.id, title: t.title, category: t.category, usage_count: t.usage_count, document: t.document,
    scope: !t.workspace_id && !t.owner_id ? "starter" : t.owner_id === user.id ? "mine" : t.visibility === "public" ? "community" : "workspace" })) };
}
export async function templateUsed(id: string): Promise<R> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { error } = await sb.rpc("template_used" as never, { p_template: id } as never);
  return error ? fail(error.message) : { ok: true };
}
