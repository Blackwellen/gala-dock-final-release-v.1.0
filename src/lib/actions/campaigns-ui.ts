"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Lane D · S4 — Sell › Campaigns UI actions over the Q23 campaign commands (migration 202610291040). Every rule (permissions,
 * finance.write for ad budgets, blockers, optimistic versions, idempotent request ids, link destinations) is enforced in SQL;
 * these validate shape, translate errors and revalidate the event page. Nothing here sends email or SMS.
 */
const Id = z.string().uuid();
const Channel = z.enum(["email", "sms", "social", "ads", "organic", "partner", "poster", "landing"]);
const Goal = z.enum(["awareness", "ticket_sales", "registrations", "followers", "launch", "sell_out"]);
const Iso = z.string().datetime({ offset: true });

const why = (m: string) =>
  /billing_permission_required/.test(m) ? "Only people with finance permission can set an advertising budget."
  : /not_authorized|42501/.test(m) ? "You don't have permission to manage campaigns."
  : /event_not_in_workspace/.test(m) ? "Choose an event from this workspace."
  : /invalid_destination/.test(m) ? "Links can only point to a Gala Dock event, organiser, venue, series or landing page (for example /events/your-event)."
  : /campaign_closed/.test(m) ? "This campaign has finished and can't be edited."
  : /invalid_timezone/.test(m) ? "Choose a valid time zone."
  : /illegal_transition|invalid_transition|state_conflict|stale/.test(m) ? "That status change isn't allowed from the campaign's current state — refresh and try again."
  : /invalid_range/.test(m) ? "Choose a shorter date range."
  : /promotion_blackouts_check|check constraint/.test(m) ? "Check the dates — the end must be after the start."
  : /not_found|P0002/.test(m) ? "Not found." : "Something went wrong. Please try again.";

async function db() { return untyped(await createClient()); }
async function wsOf(eventId: string) {
  const { data } = await (await db()).from("events").select("workspace_id").eq("id", eventId).maybeSingle();
  return (data as { workspace_id: string | null } | null)?.workspace_id ?? null;
}
async function rpc<T>(fn: string, args: Record<string, unknown>, eventId: string): Promise<ActionResult<T>> {
  const { data, error } = await (await db()).rpc(fn, args);
  if (error) return { ok: false, error: why(error.message) };
  revalidatePath(`/organizer/events/${eventId}`);
  return { ok: true, data: data as T };
}

const Step = z.discriminatedUnion("step", [
  z.object({ step: z.literal(1), name: z.string().trim().min(2).max(120), goal: Goal, goal_target: z.number().int().positive().nullable(), event_id: Id.nullable() }),
  z.object({ step: z.literal(2), starts_at: Iso, ends_at: Iso, timezone: z.string().min(2).max(60) }),
  z.object({ step: z.literal(3), audience: z.object({ followers: z.boolean(), consented_contacts: z.boolean(), past_attendees: z.boolean(),
    cities: z.array(z.string().trim().min(1).max(80)).max(20), categories: z.array(z.string().trim().min(1).max(40)).max(20) }).strict() }),
  z.object({ step: z.literal(4), budget_minor: z.number().int().min(0).max(100_000_000),
    channels: z.array(z.object({ channel: Channel, budget_minor: z.number().int().min(0).max(100_000_000) })).min(1).max(8) }),
  z.object({ step: z.literal(5) }),
]);
export type Blocker = { key: string; label: string; step: number; external?: boolean };
export type SetupResult = { ok: boolean; id?: string; version: number; step?: number; conflict?: boolean; replayed?: boolean; blockers?: Blocker[] };

/** One wizard step. `campaignId` null creates (idempotent per `requestId`); `expectedVersion` guards concurrent edits. */
export async function saveCampaignSetupStep(eventId: string, campaignId: string | null, input: unknown, expectedVersion: number | null, requestId: string): Promise<ActionResult<SetupResult>> {
  const p = Step.safeParse(input);
  if (!Id.safeParse(eventId).success || (campaignId && !Id.safeParse(campaignId).success) || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) return { ok: false, error: "Check the campaign details." };
  if (!p.success) return { ok: false, error: p.error.issues[0]?.path.includes("channels") ? "Choose at least one channel." : "Check the campaign details." };
  if (p.data.step === 2 && Date.parse(p.data.ends_at) <= Date.parse(p.data.starts_at)) return { ok: false, error: "The campaign must end after it starts." };
  if (p.data.step === 4 && p.data.channels.reduce((a, c) => a + c.budget_minor, 0) > p.data.budget_minor) return { ok: false, error: "Channel budgets add up to more than the campaign budget." };
  const ws = await wsOf(eventId); if (!ws) return { ok: false, error: "Event not found." };
  const { step, ...patch } = p.data;
  const r = await rpc<SetupResult>("save_campaign_setup", { p_workspace: ws, p_campaign: campaignId, p_step: step, p_patch: patch, p_expected_version: expectedVersion, p_request_id: campaignId ? null : requestId }, eventId);
  if (r.ok && r.data?.conflict) return { ok: false, error: "Someone else changed this campaign — reopen it to see the latest version.", data: r.data };
  return r;
}

const To = z.enum(["draft", "scheduled", "active", "paused", "completed", "cancelled"]);
export async function moveCampaign(eventId: string, campaignId: string, to: string, expectedFrom: string, reason?: string): Promise<ActionResult<{ blockers?: Blocker[] }>> {
  if (!Id.safeParse(campaignId).success || !To.safeParse(to).success || !To.safeParse(expectedFrom).success) return { ok: false, error: "Invalid status." };
  if (to === "cancelled" && (reason ?? "").trim().length < 5) return { ok: false, error: "Give a short reason for cancelling (at least 5 characters)." };
  const r = await rpc<{ ok: boolean; error?: string; blockers?: Blocker[]; changed?: boolean }>("campaign_transition", { p_campaign: campaignId, p_to: to, p_expected: expectedFrom, p_reason: reason?.trim() || null }, eventId);
  if (!r.ok) return r;
  if (r.data && r.data.ok === false) return { ok: false, error: r.data.blockers?.length ? `Resolve first: ${r.data.blockers.map(b => b.label).join("; ")}` : why(r.data.error ?? ""), data: { blockers: r.data.blockers } };
  return { ok: true, message: `Campaign ${to === "active" ? "activated" : to}`, data: {} };
}

export async function createTrackedLink(eventId: string, campaignId: string, channel: string, destination: string, medium: string): Promise<ActionResult<{ code: string; path: string; destination: string }>> {
  if (!Id.safeParse(campaignId).success || !Channel.safeParse(channel).success) return { ok: false, error: "Choose a channel." };
  const dest = destination.trim();
  if (!/^\/(events|organizers|venues|series|p)\/[A-Za-z0-9\-_]{1,120}$/.test(dest)) return { ok: false, error: why("invalid_destination") };
  const med = medium.trim().toLowerCase();
  if (med && !/^[a-z0-9\-_]{1,40}$/.test(med)) return { ok: false, error: "Medium can use lowercase letters, numbers, - and _ only." };
  const r = await rpc<{ code: string; path: string; destination: string }>("campaign_link_create", { p_campaign: campaignId, p_channel: channel, p_destination: dest, p_medium: med || null, p_source: "galadock" }, eventId);
  return r.ok ? { ...r, message: "Tracked link created" } : r;
}

export async function addPromotionBlackout(eventId: string, starts: string, ends: string, reason: string, channel: string | null): Promise<ActionResult<string>> {
  if (!Iso.safeParse(starts).success || !Iso.safeParse(ends).success || Date.parse(ends) <= Date.parse(starts)) return { ok: false, error: "The blackout must end after it starts." };
  if (reason.trim().length < 3 || reason.length > 200) return { ok: false, error: "Add a short reason (3–200 characters)." };
  if (channel && !["email", "sms", "social", "ads"].includes(channel)) return { ok: false, error: "Invalid channel." };
  const ws = await wsOf(eventId); if (!ws) return { ok: false, error: "Event not found." };
  const r = await rpc<string>("save_promotion_blackout", { p_workspace: ws, p_starts: starts, p_ends: ends, p_reason: reason.trim(), p_channel: channel }, eventId);
  return r.ok ? { ...r, message: "Blackout added" } : r;
}

/** Deletes a promotion blackout (202610294040 delete_promotion_blackout): whoever can save one (promotion permission); audited. */
export async function deletePromotionBlackout(eventId: string, blackoutId: string): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(blackoutId).success) return { ok: false, error: "Choose a blackout." };
  const r = await rpc("delete_promotion_blackout", { p_blackout: blackoutId }, eventId);
  return r.ok ? { ok: true, message: "Blackout removed" } : { ok: false, error: /permission/.test(r.error ?? "") ? "Only people who can manage campaigns can remove blackouts (it may already have been removed)." : r.error };
}
