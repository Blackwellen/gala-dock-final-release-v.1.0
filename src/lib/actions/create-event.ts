"use server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json, TablesInsert } from "@/types/database";

const Id = z.string().uuid();
const TYPES = ["festival", "party", "nightlife", "corporate", "wedding", "birthday", "childrens_party", "webinar", "community", "conference", "comedy", "custom"] as const;
const S1 = z.object({ name: z.string().trim().min(2).max(100), event_type: z.enum(TYPES), client_name: z.string().max(120), visibility: z.enum(["public", "private"]), goal: z.string().trim().min(10).max(500), cover_image: z.string().max(300) });
const S2 = z.object({ starts_at: z.string(), ends_at: z.string(), timezone: z.string().max(40), flexible_dates: z.boolean(), venue_mode: z.enum(["known", "unknown"]), venue_listing_id: z.string().uuid().nullable(), venue_name: z.string().max(120), location: z.string().max(200), capacity: z.number().int().min(1).max(1_000_000), capacity_type: z.enum(["standing", "seated", "mixed"]), age: z.string().max(10), recurring: z.boolean() });
const S3 = z.object({ model: z.enum(["ticketed", "free", "private", "client"]), currency: z.enum(["GBP", "EUR", "USD"]), budget: z.number().min(0).max(100_000_000), revenue: z.number().min(0).max(100_000_000), profit: z.number().min(-100_000_000).max(100_000_000), avg_price: z.number().min(0).max(100000), tax: z.string().max(40), budget_lines: z.record(z.string().max(40), z.number().min(0)) });
const S4 = z.object({ template_id: z.string().uuid().nullable(), modules: z.record(z.string().max(30), z.boolean()), provider_categories: z.array(z.string().max(40)).max(12), agent_goal: z.string().max(500), publish: z.boolean() });
export type CreateStep1 = z.infer<typeof S1>; export type CreateStep2 = z.infer<typeof S2>; export type CreateStep3 = z.infer<typeof S3>; export type CreateStep4 = z.infer<typeof S4>;

async function own(id: string | null) {
  const ctx = await getOrganizer();
  if (!["owner", "manager", "member"].includes(String(ctx.role))) return null;
  if (!id) return { ctx, e: null };
  if (!Id.safeParse(id).success) return null;
  const { data: e } = await ctx.supabase.from("events").select("id,status,settings,slug,name").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  return e ? { ctx, e } : null;
}

/** Steps 1–3: create the professional event as a draft on step 1, then patch it. */
export async function saveCreateStep(step: 1 | 2 | 3, id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const o = await own(id); if (!o) return { ok: false, error: "You don't have permission to create events here." };
  const s = { ...((o.e?.settings ?? {}) as Record<string, unknown>) }; let patch: Record<string, unknown> = {};
  if (step === 1) {
    const p = S1.safeParse(input); if (!p.success) return { ok: false, error: String(p.error.issues[0]?.path[0]) === "goal" ? "Add a short goal or brief (10+ characters)." : "Give the event a name and type." };
    patch = { name: p.data.name, event_type: p.data.event_type, client_name: p.data.client_name, visibility: p.data.visibility, goal: p.data.goal, description: p.data.goal, ...(p.data.cover_image ? { cover_image: p.data.cover_image } : {}) };
  } else if (step === 2) {
    const p = S2.safeParse(input); if (!p.success) return { ok: false, error: "Check the dates, venue and capacity." };
    const a = Date.parse(p.data.starts_at), b = Date.parse(p.data.ends_at);
    if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return { ok: false, error: "The event must end after it starts." };
    if (a < Date.now() - 864e5) return { ok: false, error: "Choose a future start date." };
    if (p.data.venue_listing_id) { const { data: v } = await o.ctx.supabase.from("listings").select("capacity_max,name,location").eq("id", p.data.venue_listing_id).maybeSingle(); if (v?.capacity_max && p.data.capacity > v.capacity_max) return { ok: false, error: `${v.name} holds up to ${v.capacity_max.toLocaleString("en-GB")}.` }; }
    patch = { starts_at: new Date(a).toISOString(), ends_at: new Date(b).toISOString(), timezone: p.data.timezone, flexible_dates: p.data.flexible_dates, venue_listing_id: p.data.venue_mode === "known" ? p.data.venue_listing_id : null, venue_name: p.data.venue_mode === "known" ? p.data.venue_name : "", location: p.data.location, city: p.data.location.split(",").map(x => x.trim()).filter(Boolean).at(-2) ?? p.data.location.split(",")[0]!.trim(), capacity: p.data.capacity, guest_count: p.data.capacity };
    Object.assign(s, { venue_mode: p.data.venue_mode, capacity_type: p.data.capacity_type, age_limit: p.data.age ? Number(p.data.age.replace(/\D/g, "")) || null : null, recurring: p.data.recurring, venue_confirmed: false });
  } else {
    const p = S3.safeParse(input); if (!p.success) return { ok: false, error: "Check the budget and revenue figures." };
    patch = { budget_total: p.data.budget, revenue_goal: p.data.revenue, target_profit: p.data.profit, currency: p.data.currency };
    Object.assign(s, { commercial_model: p.data.model, avg_ticket_price: p.data.avg_price, tax_treatment: p.data.tax, budget_lines: p.data.budget_lines, ticketed: p.data.model === "ticketed", revenue_target: p.data.revenue });
  }
  patch.settings = s as Json;
  if (!o.e) {
    const { data, error } = await o.ctx.supabase.from("events").insert({ ...patch, owner_id: o.ctx.user.id, workspace_id: o.ctx.workspace.id, management: "professional", status: "draft" } as TablesInsert<"events">).select("id").single();
    if (error || !data) return { ok: false, error: "Could not create the event." };
    revalidatePath("/organizer/events"); return { ok: true, data: { id: data.id } };
  }
  const { error } = await o.ctx.supabase.from("events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", o.e.id);
  if (error) return { ok: false, error: "Could not save this step." };
  revalidatePath("/organizer/events"); return { ok: true, data: { id: o.e.id } };
}

/** Step 4: apply modules (checklist tasks, ticket tier, public page, initial agent run) and move draft → planning. */
export async function finishCreate(id: string, input: unknown): Promise<ActionResult> {
  const o = await own(id); if (!o || !o.e) return { ok: false, error: "Event not found." };
  const p = S4.safeParse(input); if (!p.success) return { ok: false, error: "Check your setup choices." };
  const { data: e } = await o.ctx.supabase.from("events").select("id,name,starts_at,capacity,settings,visibility,event_type").eq("id", id).single();
  if (!e?.starts_at) return { ok: false, error: "Add the date and venue first." };
  const s = (e.settings ?? {}) as Record<string, unknown>; const m = p.data.modules;
  const due = (days: number) => new Date(Date.parse(e.starts_at!) - days * 864e5).toISOString();
  const tasks: [string, string, number, string][] = [["Confirm venue and sign contract", "venue", 90, "high"]];
  if (m.providers) for (const c of p.data.provider_categories) tasks.push([`Shortlist and request quotes: ${c}`, "suppliers", 75, "medium"]);
  if (m.staffing) tasks.push(["Build staffing plan and assign roles", "team", 30, "medium"], ["Send crew briefing pack", "team", 7, "medium"]);
  if (m.promotion) tasks.push(["Publish event page", "promotion", 60, "high"], ["Launch marketing campaign", "promotion", 45, "medium"]);
  if (m.risk) tasks.push(["Complete risk assessment", "risk", 30, "high"], ["Confirm permits, licences and insurance", "risk", 21, "high"]);
  if (m.tickets) tasks.push(["Set up ticket tiers and pricing", "ticketing", 60, "high"]);
  await o.ctx.supabase.from("tasks").insert(tasks.map(([title, category, d, priority]) => ({ event_id: id, workspace_id: o.ctx.workspace.id, owner_id: o.ctx.user.id, title, category, due_at: due(d), priority, status: "todo" })));
  if (m.tickets && s.ticketed !== false) {
    const { count } = await o.ctx.supabase.from("ticket_tiers").select("id", { count: "exact", head: true }).eq("event_id", id);
    if (!count) await o.ctx.supabase.from("ticket_tiers").insert({ event_id: id, name: "General Admission", description: "Standard entry", kind: "general", price: Number(s.avg_ticket_price ?? 0), quantity: Math.max(1, Number(e.capacity ?? 100)), status: "draft", sort: 1 });
  }
  const slug = m.promotion && e.visibility === "public" ? `${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${randomBytes(2).toString("hex")}` : null;
  await o.ctx.supabase.from("events").update({ status: "planning", ...(slug && !o.e.slug ? { slug } : {}), settings: { ...s, modules: m, provider_categories: p.data.provider_categories, template_id: p.data.template_id, public_page: m.promotion ? { details: true, lineup: true, tickets: !!m.tickets, map: true, faqs: true, terms: true } : s.public_page } as Json, updated_at: new Date().toISOString() }).eq("id", id);
  if (p.data.agent_goal.trim().length >= 8) { const { startRun } = await import("./agent"); await startRun({ goal: p.data.agent_goal, scope: ["event"], event_id: id }); }
  revalidatePath("/organizer/events"); revalidatePath("/organizer");
  return { ok: true, message: `${e.name} created with ${tasks.length} starter tasks.`, redirect: `/organizer/events/${id}` };
}
