"use server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";

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
  const rows = d.items.map(i => ({ event_id: o.e.id, channel: i.channel, title: i.title, audience: i.audience, scheduled_at: new Date(i.scheduled_at).toISOString(), cost: i.cost, est_reach: i.est_reach, content: i.content || d.copy, sponsored: i.cost > 0, status: !d.launch ? "draft" : high(i) ? "requires_approval" : "scheduled", metrics: {} as Json }));
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

const Promoter = z.object({ event_id: z.string().uuid(), name: z.string().trim().min(2).max(60), commission_pct: z.number().min(0).max(50) });
export async function createPromoter(input: unknown): Promise<ActionResult<{ code: string }>> {
  const p = Promoter.safeParse(input); if (!p.success) return { ok: false, error: "Enter the promoter name and commission (0–50%)." };
  const o = await ev(p.data.event_id); if (!o) return { ok: false, error: "Event not found." };
  const code = `${p.data.name.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase() || "PROMO"}${randomBytes(2).toString("hex").toUpperCase()}`;
  const { error } = await o.ctx.supabase.from("promoters").insert({ event_id: o.e.id, name: p.data.name, code, commission_pct: p.data.commission_pct, status: "active" });
  if (error) return { ok: false, error: "Could not create the promoter link." };
  revalidatePath(`/organizer/events/${o.e.id}/promotion`); return { ok: true, message: `Promoter link created: /r/${code}`, data: { code } };
}

const Dist = z.object({ event_id: z.string().uuid(), key: z.string().max(40), on: z.boolean() });
export async function setDistribution(input: unknown): Promise<ActionResult> {
  const p = Dist.safeParse(input); if (!p.success) return { ok: false, error: "Invalid." };
  const o = await ev(p.data.event_id); if (!o) return { ok: false, error: "Event not found." };
  const s = (o.e.settings ?? {}) as Record<string, unknown>; const dist = { ...((s.distribution ?? {}) as Record<string, boolean>), [p.data.key]: p.data.on };
  await o.ctx.supabase.from("events").update({ settings: { ...s, distribution: dist } as Json }).eq("id", o.e.id);
  revalidatePath(`/organizer/events/${o.e.id}/promotion`); return { ok: true };
}
