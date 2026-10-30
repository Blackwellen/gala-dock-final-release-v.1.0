"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";
import { BLOCKS } from "@/lib/page-blocks";
import { parseVideo } from "@/lib/public/video";
import { transitionEvent } from "@/lib/events/lifecycle";

const Page = z.object({ event_id: z.string().uuid(), order: z.array(z.enum(BLOCKS)).max(BLOCKS.length), visible: z.record(z.enum(BLOCKS), z.boolean()), hero: z.object({ title: z.string().trim().min(2).max(100), subtitle: z.string().max(200), image: z.string().max(300), overlay: z.enum(["dark", "light", "none"]), primary: z.string().max(30), secondary: z.string().max(30), video: z.string().max(300) }), seo: z.object({ title: z.string().max(70), description: z.string().max(170) }), publish: z.boolean() });

/** Saves the public page layout. Publishing makes a public, ticketed event visible (status published / on_sale). */
export async function savePage(input: unknown): Promise<ActionResult> {
  const p = Page.safeParse(input); if (!p.success) return { ok: false, error: "Check the hero title and links." };
  // The embed is built from the parsed id (src/lib/public/video.ts); anything that does not parse is refused here.
  if (p.data.hero.video && !parseVideo(p.data.hero.video)) return { ok: false, error: "Use a YouTube or Vimeo video link (for example https://youtu.be/… or https://vimeo.com/…)." };
  const ctx = await getOrganizer();
  const { data: e } = await ctx.supabase.from("events").select("id,status,settings,slug,name,visibility").eq("id", p.data.event_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  const s = (e.settings ?? {}) as Record<string, unknown>; const v = p.data.visible;
  const public_page = { ...((s.public_page ?? {}) as Record<string, boolean>), details: v.about !== false, lineup: v.performers !== false, tickets: v.tickets !== false, map: v.map !== false, venue: v.venue !== false, faqs: v.faqs !== false, gallery: v.gallery !== false, related: v.related !== false, programme: v.programme !== false };
  const settings = { ...s, public_page, page_blocks: { order: p.data.order, visible: v }, hero_title: p.data.hero.title, subtitle: p.data.hero.subtitle, ...(p.data.hero.image ? { hero_image: p.data.hero.image } : {}), hero_overlay: p.data.hero.overlay, cta: { primary: p.data.hero.primary, secondary: p.data.hero.secondary }, hero_video: p.data.hero.video, seo: p.data.seo };
  let status = e.status; let slug = e.slug;
  if (p.data.publish) {
    if (e.visibility !== "public") return { ok: false, error: "Make the event public before publishing its page." };
    slug ??= `${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${e.id.slice(0, 4)}`;
    if (["draft", "planning", "ready"].includes(status)) { const { count } = await ctx.supabase.from("ticket_tiers").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "on_sale"); status = count ? "on_sale" : "published"; }
  }
  // Layout and address are saved first (a draft is never lost); the status change goes through the guarded lifecycle command
  // (event_transition: permission, state machine, event-type / ticketing / composition preconditions) instead of a direct write.
  const { error } = await ctx.supabase.from("events").update({ settings: settings as Json, slug, updated_at: new Date().toISOString() }).eq("id", e.id);
  if (error) return { ok: false, error: error.message.includes("slug") ? "That page address is taken." : "Could not save the page." };
  revalidatePath(`/organizer/events/${e.id}/page`); revalidatePath(`/organizer/events/${e.id}`); if (slug) revalidatePath(`/events/${slug}`);
  if (status !== e.status) {
    const t = await transitionEvent(ctx.supabase, e.id, status, e.status);
    if (!t.ok) return { ok: false, error: `Your page is saved but not published yet. ${t.error ?? ""}`.trim(), data: t.data };
  }
  return { ok: true, message: p.data.publish ? "Page published." : "Draft saved." };
}

const Media = z.object({ event_id: z.string().uuid(), url: z.string().regex(/^https:\/\/[^\s]+\/storage\/v1\/object\/public\/event-media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/), title: z.string().trim().min(2).max(80), format: z.string().max(40), data: z.record(z.string(), z.unknown()), gallery: z.boolean(), poster: z.boolean() });
/** Registers a rendered asset (already uploaded to the workspace's event-media folder) in the media library. */
export async function saveMediaAsset(input: unknown): Promise<ActionResult> {
  const p = Media.safeParse(input); if (!p.success) return { ok: false, error: "Could not save the asset." };
  const ctx = await getOrganizer();
  if (!p.data.url.includes(`/event-media/${ctx.workspace.id}/`)) return { ok: false, error: "Asset is not in this workspace." };
  const { data: e } = await ctx.supabase.from("events").select("id,settings,slug").eq("id", p.data.event_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  const { count } = await ctx.supabase.from("media_assets").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("format", p.data.format);
  const { error } = await ctx.supabase.from("media_assets").insert({ workspace_id: ctx.workspace.id, event_id: e.id, title: p.data.title, url: p.data.url, kind: "poster", format: p.data.format, status: "approved", rights: "owned", version: (count ?? 0) + 1, data: p.data.data as Json });
  if (error) return { ok: false, error: "Could not add to the library." };
  if (p.data.gallery || p.data.poster) { const s = (e.settings ?? {}) as Record<string, unknown>; await ctx.supabase.from("events").update({ settings: { ...s, ...(p.data.poster ? { poster: p.data.url } : {}), ...(p.data.gallery ? { gallery: [...new Set([p.data.url, ...((s.gallery as string[]) ?? [])])].slice(0, 12) } : {}) } as Json }).eq("id", e.id); }
  revalidatePath(`/organizer/events/${e.id}/media`); revalidatePath(`/organizer/events/${e.id}/promotion`); if (e.slug) revalidatePath(`/events/${e.slug}`);
  return { ok: true, message: "Saved to your media library." };
}
