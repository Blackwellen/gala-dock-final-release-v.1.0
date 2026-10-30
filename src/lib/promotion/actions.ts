"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Q23 remainder (domains 136–139, 146–149): typed server actions over the database commands in migrations
 * 202610291039–1041. Every rule (eligibility, permissions, consent, suppression, brand rules, public-media checks,
 * optimistic versions) is enforced in SQL; these actions validate input and translate errors. No email/SMS is ever sent
 * from here — campaign dispatch is fixture-only and runs in the scheduler (campaign_tick).
 */
const Id = z.string().uuid();
const FollowKind = z.enum(["event", "venue", "organizer", "category", "city", "series"]);
const Channel = z.enum(["email", "sms", "social", "ads", "organic", "partner", "poster", "landing"]);
const Goal = z.enum(["awareness", "ticket_sales", "registrations", "followers", "launch", "sell_out"]);
const PosterKind = z.enum(["print", "social", "story", "qr", "launch", "sold_out", "schedule"]);

const why = (m: string) =>
  /not_authorized|42501/.test(m) ? "You don't have permission to do that."
  : /billing_permission_required/.test(m) ? "Only people with billing permission can set an advertising budget."
  : /rate_limited|54000/.test(m) ? "Too many requests — try again shortly."
  : /subject_not_followable/.test(m) ? "That can't be followed right now."
  : /event_not_in_workspace/.test(m) ? "Choose an event from this workspace."
  : /outside_campaign_dates/.test(m) ? "Schedule the message inside the campaign dates."
  : /schedule_in_past/.test(m) ? "Choose a time in the future."
  : /unsafe_content|template_active_content/.test(m) ? "Remove scripts or active links from the content."
  : /invalid_destination/.test(m) ? "Links can only point to Gala Dock event, organiser, venue, series or landing pages."
  : /media_not_publishable/.test(m) ? "This media needs alt text, a licence, approval and a clean file scan before public use."
  : /invalid_colour|font_not_available|invalid_logo_path|invalid_rule/.test(m) ? "Check the brand kit colours, fonts and logos."
  : /campaign_closed/.test(m) ? "This campaign has finished." : /not_found|P0002/.test(m) ? "Not found." : "Something went wrong.";

async function sb() { return untyped(await createClient()); }
async function call<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const { data, error } = await (await sb()).rpc(fn, args);
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true, data: data as T };
}

// ── Directory / calendar (public reads; RLS decides) ──
export type DirectoryEvent = { id: string; name: string; slug: string | null; event_type: string | null; city: string | null; venue_name: string | null; starts_at: string | null; ends_at: string | null; timezone: string | null; cover_image: string | null };
export type DirectoryPage = { scope: string; key: string | null; total: number; events: DirectoryEvent[]; featured: { event_id: string; kind: "editorial" | "sponsored"; label: string; sponsored: boolean }[]; ordering: "chronological" };
const Scope = z.enum(["all", "city", "category", "venue", "organizer", "series"]);
export async function directoryEvents(scope: string, key: string | null, opts: { from?: string; to?: string; limit?: number; offset?: number } = {}) {
  if (!Scope.safeParse(scope).success) return { ok: false, error: "Invalid directory." } as const;
  return call<DirectoryPage>("directory_events", { p_scope: scope, p_key: key, p_from: opts.from ?? null, p_to: opts.to ?? null, p_limit: opts.limit ?? 24, p_offset: opts.offset ?? 0 });
}
export async function relatedEvents(eventId: string, limit = 4) { return Id.safeParse(eventId).success ? call<(DirectoryEvent & { score: number; why: string[] })[]>("directory_related", { p_event: eventId, p_limit: limit }) : { ok: false as const, error: "Invalid event." }; }
export async function directoryFacets() { return call<{ cities: { key: string; events: number }[]; categories: { key: string; events: number }[] }>("directory_facets", {}); }
export async function calendarEvents(range: "today" | "weekend" | "month", tz: string, scope = "all", key: string | null = null, anchor: string | null = null) {
  return call<{ from: string; to: string; days: { date: string; events: DirectoryEvent[] }[] }>("calendar_events", { p_range: range, p_tz: tz, p_scope: scope, p_key: key, p_anchor: anchor, p_limit: 100 });
}

// ── Following ──
export async function follow(kind: string, key: string, alerts = true) {
  if (!FollowKind.safeParse(kind).success || !key || key.length > 80) return { ok: false, error: "Invalid follow." } as const;
  return call<{ ok: true; kind: string; key: string; alerts: boolean }>("follow_subject", { p_kind: kind, p_key: key, p_alerts: alerts });
}
export async function unfollow(kind: string, key: string) { return FollowKind.safeParse(kind).success ? call("unfollow_subject", { p_kind: kind, p_key: key }) : { ok: false as const, error: "Invalid follow." }; }
export async function followerSummary(workspaceId: string) { return call("promotion_follower_summary", { p_workspace: workspaceId }); }

// ── Campaigns ──
const Step = z.discriminatedUnion("step", [
  z.object({ step: z.literal(1), name: z.string().min(2).max(120).optional(), goal: Goal.optional(), goal_target: z.number().int().positive().nullable().optional(), event_id: Id.nullable().optional() }),
  z.object({ step: z.literal(2), starts_at: z.string().datetime({ offset: true }).optional(), ends_at: z.string().datetime({ offset: true }).optional(), timezone: z.string().max(60).optional() }),
  z.object({ step: z.literal(3), audience: z.object({ followers: z.boolean().optional(), consented_contacts: z.boolean().optional(), past_attendees: z.boolean().optional(),
    cities: z.array(z.string().max(80)).max(20).optional(), categories: z.array(z.string().max(40)).max(20).optional() }).strict() }),
  z.object({ step: z.literal(4), budget_minor: z.number().int().min(0).max(100_000_000).optional(),
    channels: z.array(z.object({ channel: Channel, budget_minor: z.number().int().min(0).default(0), partner_id: Id.nullable().optional() })).max(8).optional() }),
  z.object({ step: z.literal(5) }),
]);
export type CampaignSetupResult = { ok: boolean; id: string; version: number; step: number; conflict?: boolean; replayed?: boolean; blockers: { key: string; label: string; step: number; external?: boolean }[] };
export async function saveCampaignStep(workspaceId: string, campaignId: string | null, input: unknown, expectedVersion: number | null, requestId?: string) {
  const p = Step.safeParse(input); if (!p.success || !Id.safeParse(workspaceId).success) return { ok: false, error: "Check the campaign details." } as const;
  const { step, ...patch } = p.data;
  return call<CampaignSetupResult>("save_campaign_setup", { p_workspace: workspaceId, p_campaign: campaignId, p_step: step, p_patch: patch, p_expected_version: expectedVersion, p_request_id: requestId ?? null });
}
export async function transitionCampaign(id: string, to: "draft" | "scheduled" | "active" | "paused" | "completed" | "cancelled", expected?: string, reason?: string) {
  return call<{ ok: boolean; error?: string; blockers?: unknown[]; conflict?: boolean }>("campaign_transition", { p_campaign: id, p_to: to, p_expected: expected ?? null, p_reason: reason ?? null });
}
export async function saveCampaignMessage(campaignId: string, messageId: string | null, m: { channel: "email" | "sms"; subject?: string; body: string; scheduled_at?: string | null }, expectedVersion?: number) {
  if (!m.body || m.body.length > 20000) return { ok: false, error: "Write the message." } as const;
  return call<{ ok: boolean; id: string; status: string; version: number; warnings: { key: string }[] }>("campaign_message_save",
    { p_campaign: campaignId, p_message: messageId, p_channel: m.channel, p_subject: m.subject ?? null, p_body: m.body, p_scheduled_at: m.scheduled_at ?? null, p_expected_version: expectedVersion ?? null });
}
export async function createCampaignLink(campaignId: string, channel: string, destination: string, medium?: string, source?: string) {
  if (!Channel.safeParse(channel).success) return { ok: false, error: "Invalid channel." } as const;
  return call<{ ok: true; id: string; code: string; path: string; destination: string }>("campaign_link_create", { p_campaign: campaignId, p_channel: channel, p_destination: destination, p_medium: medium ?? null, p_source: source ?? "galadock" });
}
export async function campaignReport(id: string) { return call("campaign_report", { p_campaign: id }); }
export async function promotionCalendar(workspaceId: string, from: string, to: string) { return call("promotion_calendar", { p_workspace: workspaceId, p_from: from, p_to: to }); }
export async function saveBlackout(workspaceId: string, starts: string, ends: string, reason: string, channel: string | null = null) { return call<string>("save_promotion_blackout", { p_workspace: workspaceId, p_starts: starts, p_ends: ends, p_reason: reason, p_channel: channel }); }
export async function consentSummary(workspaceId: string) { return call("audience_consent_summary", { p_workspace: workspaceId }); }

// ── Media library, posters, exports, brand ──
export async function publishMedia(assetId: string, meta: { alt_text?: string; licence?: string; licence_holder?: string; licence_expires_at?: string; credit?: string; subject?: string; status?: string; public?: boolean }) {
  return call<{ ok: boolean; problems: string[] }>("media_asset_publish", { p_asset: assetId, p_meta: meta });
}
export async function saveGallery(workspaceId: string, galleryId: string | null, title: string | null, eventId: string | null, listingId: string | null, items: { asset_id: string; sort?: number; caption?: string }[] | null, expectedVersion?: number) {
  return call("save_media_gallery", { p_workspace: workspaceId, p_gallery: galleryId, p_title: title, p_event: eventId, p_listing: listingId, p_items: items, p_expected_version: expectedVersion ?? null });
}
export async function publishGallery(galleryId: string, isPublic: boolean) { return call("publish_media_gallery", { p_gallery: galleryId, p_public: isPublic }); }
export async function posterData(eventId: string, kind: string) { return PosterKind.safeParse(kind).success ? call("poster_data", { p_event: eventId, p_kind: kind }) : { ok: false as const, error: "Invalid poster type." }; }
export async function requestExport(designId: string, format: "png" | "jpg" | "pdf" | "svg" | "webp", preset?: string) { return call<{ ok: true; id: string; upload_prefix: string }>("request_design_export", { p_design: designId, p_format: format, p_preset: preset ?? null }); }
export async function saveBrandKit(workspaceId: string, kit: Record<string, unknown>, expectedVersion: number | null) { return call<{ ok: boolean; version: number; conflict?: boolean }>("save_brand_kit", { p_workspace: workspaceId, p_kit: kit, p_expected_version: expectedVersion }); }
export async function brandCheck(designId: string) { return call<{ ok: boolean; findings: { rule: string; value: string }[] }>("brand_check_design", { p_design: designId }); }
export async function addCampaignAsset(campaignId: string, role: string, designId: string | null, mediaId: string | null) { return call("campaign_asset_add", { p_campaign: campaignId, p_role: role, p_design: designId, p_media: mediaId }); }
export async function saveLandingPage(workspaceId: string, pageId: string | null, page: Record<string, unknown>, expectedVersion?: number) { return call("save_landing_page", { p_workspace: workspaceId, p_page: pageId, p_page_data: page, p_expected_version: expectedVersion ?? null }); }
export async function publishLandingPage(pageId: string, publish: boolean) { return call("publish_landing_page", { p_page: pageId, p_publish: publish }); }
export async function landingPage(slug: string) { return call("landing_page", { p_slug: slug }); }
export async function eventShareCard(eventId: string) { return call<{ title: string; description: string; url: string; image: string | null } | null>("event_share_card", { p_event: eventId }); }
