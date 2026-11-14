"use server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";
import { wallToIso } from "@/lib/events/wall-time";
import { untyped } from "@/lib/workspace/db";
import { sendPortalInvite } from "@/lib/partners/invites";

const Id = z.string().uuid();
const Item = z.object({ channel: z.string().trim().min(2).max(60), title: z.string().trim().min(2).max(80), audience: z.string().max(60), scheduled_at: z.string(), cost: z.number().min(0).max(100000), est_reach: z.string().max(40), content: z.string().max(2000) });
const Plan = z.object({ event_id: z.string().uuid(), goal: z.string().max(60), target: z.number().int().min(0).max(10_000_000), surfaces: z.array(z.string().max(40)).max(12), reminders: z.array(z.string().max(30)).max(6), notes: z.string().max(500), copy: z.string().max(1000), items: z.array(Item).min(1).max(30), consents: z.object({ rights: z.boolean(), terms: z.boolean(), marketing: z.boolean(), paid: z.boolean(), broadcast: z.boolean() }), launch: z.boolean() });

async function ev(eventId: string) {
  const ctx = await getOrganizer(); if (!Id.safeParse(eventId).success) return null;
  const { data: e } = await ctx.supabase.from("events").select("id,name,settings,slug").eq("id", eventId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  return e ? { ctx, e } : null;
}

/** Save (draft) or launch a promotion plan. Paid / broadcast items over £100 or homepage placements become approvals. */
export async function savePromotionPlan(input: unknown): Promise<ActionResult> {
  const p = Plan.safeParse(input); if (!p.success) return { ok: false, error: "Add at least one scheduled action." };
  const o = await ev(p.data.event_id); if (!o) return { ok: false, error: "Event not found." };
  const d = p.data; const paid = d.items.some(i => i.cost > 0);
  if (d.launch && !(d.consents.rights && d.consents.terms && d.consents.marketing && d.consents.broadcast && (!paid || d.consents.paid))) return { ok: false, error: "Please confirm every approval & compliance item before launching." };
  if (d.items.some(i => Number.isNaN(Date.parse(i.scheduled_at)))) return { ok: false, error: "Every action needs a date." };
  const high = (i: z.infer<typeof Item>) => i.cost >= 100 || /homepage|spotlight|broadcast/i.test(i.channel);
  const rows = d.items.map(i => ({ event_id: o.e.id, channel: i.channel, title: i.title, audience: i.audience, scheduled_at: wallToIso(i.scheduled_at)!, cost: i.cost, est_reach: i.est_reach, content: i.content || d.copy, sponsored: i.cost > 0, status: !d.launch ? "draft" : high(i) ? "requires_approval" : "scheduled", metrics: {} as Json }));
  const { error } = await o.ctx.supabase.from("promotions").insert(rows);
  if (error) return { ok: false, error: "Could not save the promotion plan." };
  if (d.launch) for (const r of rows.filter(r => r.status === "requires_approval")) await o.ctx.supabase.from("agent_approvals").insert({ workspace_id: o.ctx.workspace.id, event_id: o.e.id, title: `${r.channel}: ${r.title}`, detail: `Scheduled ${new Date(r.scheduled_at).toLocaleDateString("en-GB")} · reach ${r.est_reach}`, action: "promotion_launch", amount: r.cost || null, impact: r.audience || "Public visibility", status: "pending", payload: { channel: r.channel, event_id: o.e.id } as Json });
  await o.ctx.supabase.from("events").update({ settings: { ...(o.e.settings as Record<string, unknown>), promotion_plan: { goal: d.goal, target: d.target, surfaces: d.surfaces, reminders: d.reminders, notes: d.notes } } as Json }).eq("id", o.e.id);
  revalidatePath(`/organizer/events/${o.e.id}/promotion`); revalidatePath("/organizer/tickets"); revalidatePath("/organizer/agent");
  const needs = rows.filter(r => r.status === "requires_approval").length;
  return { ok: true, message: !d.launch ? "Promotion saved as a draft." : needs ? `Launched. ${needs} high-impact item${needs > 1 ? "s" : ""} sent for approval.` : "Promotion launched and scheduled.", redirect: `/organizer/events/${o.e.id}/promotion` };
}

export async function setPromotionStatus(id: string, status: "draft" | "scheduled" | "completed"): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Not found." };
  const ctx = await getOrganizer();
  const { data, error } = await ctx.supabase.from("promotions").update({ status }).eq("id", id).select("event_id").maybeSingle();
  if (error || !data) return { ok: false, error: "Could not update." };
  revalidatePath(`/organizer/events/${data.event_id}/promotion`); return { ok: true, message: "Updated." };
}

const Promoter = z.object({ event_id: z.string().uuid(), name: z.string().trim().min(2).max(60), commission_pct: z.number().min(0).max(50), email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")) });
export async function createPromoter(input: unknown): Promise<ActionResult<{ code: string }>> {
  const p = Promoter.safeParse(input); if (!p.success) return { ok: false, error: "Enter the promoter name and commission (0–50%)." };
  const o = await ev(p.data.event_id); if (!o) return { ok: false, error: "Event not found." };
  const code = `${p.data.name.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase() || "PROMO"}${randomBytes(2).toString("hex").toUpperCase()}`;
  const { data: row, error } = await o.ctx.supabase.from("promoters").insert({ event_id: o.e.id, name: p.data.name, code, commission_pct: p.data.commission_pct, status: "active" }).select("id").single();
  if (error || !row) return { ok: false, error: "Could not create the promoter link." };
  revalidatePath(`/organizer/events/${o.e.id}/promotion`);
  // Q68: optional login invitation, so the promoter's portal account is linked (promoters.user_id) when they accept.
  if (p.data.email) {
    const inv = await invite(o.ctx, row.id, p.data.email, p.data.name, o.e.name);
    return { ok: true, message: inv.ok ? `Promoter link created and invitation emailed to ${p.data.email}.` : `Promoter link created: /r/${code}. ${inv.error}`, data: { code } };
  }
  return { ok: true, message: `Promoter link created: /r/${code}`, data: { code } };
}

const Dist = z.object({ event_id: z.string().uuid(), key: z.string().max(40), on: z.boolean() });
export async function setDistribution(input: unknown): Promise<ActionResult> {
  const p = Dist.safeParse(input); if (!p.success) return { ok: false, error: "Invalid." };
  const o = await ev(p.data.event_id); if (!o) return { ok: false, error: "Event not found." };
  const s = (o.e.settings ?? {}) as Record<string, unknown>; const dist = { ...((s.distribution ?? {}) as Record<string, boolean>), [p.data.key]: p.data.on };
  await o.ctx.supabase.from("events").update({ settings: { ...s, distribution: dist } as Json }).eq("id", o.e.id);
  revalidatePath(`/organizer/events/${o.e.id}/promotion`); return { ok: true };
}

// ── Q68: promoter login invitations, sales approval and payout runs ─────────────────────────────────────────────────────────
// Promoter commission is the ORGANISER's obligation, settled by the organiser off-platform (bank transfer, PayPal …). Gala Dock
// records sales, approvals and payouts (memo ledger) so organiser and promoter see the same figures; it never holds or pays it.
// The RPCs re-check access: approvals and payouts need owner / manager / finance (promoter_money_role), invites owner / manager.
type Ctx = Awaited<ReturnType<typeof getOrganizer>>;
const PROMO_ERR: [RegExp, string][] = [
  [/not_authorized/, "Only the workspace owner, managers and finance can do this."],
  [/already_linked/, "This promoter already has a login."],
  [/invalid_email/, "Enter a valid email address."],
  [/rate_limited/, "Too many invitations. Please wait and try again later."],
  [/step_up_required|mfa_required/, "Verify your second factor, then try again."],
  [/nothing_to_pay/, "There are no approved sales waiting for a payout."],
  [/reference_required/, "Enter the payment reference (at least 3 characters)."],
  [/payout_hold_active/, "A security review is in progress on this promoter or workspace. Payouts resume when it’s complete."],
  [/invalid_transition/, "That payout has already moved on — refresh the page."],
  [/invalid_method/, "Choose how you paid the promoter."],
];
const promoErr = (m: string) => PROMO_ERR.find(([re]) => re.test(m))?.[1] ?? "Something went wrong. Please try again.";

async function promoterOf(promoterId: string) {
  if (!Id.safeParse(promoterId).success) return null;
  const ctx = await getOrganizer();
  const { data } = await ctx.supabase.from("promoters").select("id,name,event_id,events!inner(id,name,workspace_id)").eq("id", promoterId).eq("events.workspace_id", ctx.workspace.id).maybeSingle();
  const row = data as unknown as { id: string; name: string; event_id: string; events: { name: string } } | null;
  return row ? { ctx, promoter: row } : null;
}
const paths = (eventId: string, promoterId: string) => { revalidatePath(`/organizer/events/${eventId}/promotion`); revalidatePath(`/organizer/events/${eventId}/promotion/promoters/${promoterId}`); };

async function invite(ctx: Ctx, promoterId: string, email: string, name: string, eventName: string) {
  const r = await sendPortalInvite(untyped(ctx.supabase), { rpc: "promoter_invite", args: { p_promoter: promoterId }, email,
    subject: `You’re invited to promote ${eventName} on Gala Dock`, body: `${ctx.workspace.name} has added you (${name}) as a promoter for ${eventName}. Accept this invitation to open your promoter portal: your tracked link, sales and commission.\n\nYour commission is paid to you directly by the organiser, not by Gala Dock.` });
  return r.ok ? { ok: true as const, emailed: r.emailed, link: r.link } : { ok: false as const, error: promoErr(r.error.message) };
}

export async function invitePromoterLogin(promoterId: string, email: string): Promise<ActionResult> {
  const e = z.string().trim().toLowerCase().email().max(254).safeParse(email);
  if (!e.success) return { ok: false, error: "Enter a valid email address." };
  const o = await promoterOf(promoterId); if (!o) return { ok: false, error: "Promoter not found." };
  const r = await invite(o.ctx, o.promoter.id, e.data, o.promoter.name, o.promoter.events.name);
  if (!r.ok) return { ok: false, error: r.error };
  paths(o.promoter.event_id, o.promoter.id);
  return { ok: true, message: r.emailed ? `Invitation emailed to ${e.data}.` : `Invitation created — share this link: ${r.link}` };
}

export async function approvePromoterSales(promoterId: string, saleIds: string[] | null): Promise<ActionResult> {
  if (saleIds && (!Array.isArray(saleIds) || saleIds.length > 500 || saleIds.some(s => !Id.safeParse(s).success))) return { ok: false, error: "Invalid selection." };
  const o = await promoterOf(promoterId); if (!o) return { ok: false, error: "Promoter not found." };
  const { data, error } = await untyped(o.ctx.supabase).rpc("promoter_approve_sales", { p_promoter: o.promoter.id, p_sales: saleIds, p_note: "" });
  if (error) return { ok: false, error: promoErr(error.message) };
  paths(o.promoter.event_id, o.promoter.id);
  const n = Number(data ?? 0);
  return { ok: true, message: n ? `${n} sale${n === 1 ? "" : "s"} approved.` : "Nothing approved — refunded or unissued orders can’t be approved." };
}

export async function createPromoterPayout(promoterId: string, note: string): Promise<ActionResult> {
  const o = await promoterOf(promoterId); if (!o) return { ok: false, error: "Promoter not found." };
  const { data, error } = await untyped(o.ctx.supabase).rpc("promoter_create_payout", { p_promoter: o.promoter.id, p_note: String(note ?? "").slice(0, 120) });
  if (error) return { ok: false, error: promoErr(error.message) };
  paths(o.promoter.event_id, o.promoter.id);
  const r = data as { amount: number; clawback: number };
  return { ok: true, message: `Payout run created for £${Number(r.amount).toFixed(2)}${Number(r.clawback) ? ` (after £${Number(r.clawback).toFixed(2)} clawback)` : ""}. Approve it, pay the promoter yourself, then mark it paid.` };
}

const Transition = z.object({ payout: z.string().uuid(), promoter: z.string().uuid(), action: z.enum(["approve", "mark_paid", "fail"]), reference: z.string().trim().max(300).optional(), method: z.enum(["bank_transfer", "paypal", "cash", "other"]).optional() });
export async function promoterPayoutAction(input: unknown): Promise<ActionResult> {
  const p = Transition.safeParse(input); if (!p.success) return { ok: false, error: "Invalid request." };
  if (p.data.action === "mark_paid" && (p.data.reference ?? "").length < 3) return { ok: false, error: "Enter the payment reference (at least 3 characters)." };
  if (p.data.action === "fail" && (p.data.reference ?? "").length < 3) return { ok: false, error: "Say why the payment failed (at least 3 characters)." };
  const o = await promoterOf(p.data.promoter); if (!o) return { ok: false, error: "Promoter not found." };
  const { error } = await untyped(o.ctx.supabase).rpc("promoter_payout_transition", { p_payout: p.data.payout, p_action: p.data.action, p_reference: p.data.reference || null, p_method: p.data.action === "mark_paid" ? p.data.method ?? "bank_transfer" : null });
  if (error) return { ok: false, error: promoErr(error.message) };
  paths(o.promoter.event_id, o.promoter.id);
  return { ok: true, message: p.data.action === "approve" ? "Payout approved — now pay the promoter and mark it paid." : p.data.action === "mark_paid" ? "Marked paid. The promoter sees it in their portal." : "Payout marked failed — its sales are back to approved." };
}
