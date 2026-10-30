"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { allocate, buildCat, labelOf, occasionLabel, normaliseCats } from "@/lib/plan-model";
import { buildCategoryOf } from "@/lib/build-categories";
import type { ActionResult } from "./shell";
import type { TablesInsert } from "@/types/database";

const Id = z.string().uuid();
const Time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const Cats = z.array(z.string().max(30)).max(12);
const Step1 = z.object({ event_type: z.string().min(2).max(30), name: z.string().max(120), visibility: z.enum(["private", "public"]), agent_help: z.boolean(), description: z.string().max(500) });
// Six-step wizard (design #67 + owner decision 2026-10-28): 1 Occasion & Goal · 2 Date & Location · 3 Guests & Size ·
// 4 Services & Extras · 5 Budget & Priorities · 6 Recommended Build (review + create, no payload). Steps 1–5 save here.
const Step2 = z.object({ date_mode: z.enum(["single", "flexible"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")), flex_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")), start: Time, end: Time, flexible_window: z.boolean(),
  location: z.string().max(120), radius: z.number().int().min(1).max(100) });
const Step3 = z.object({ guests: z.number().int().min(1).max(100000), adults: z.number().int().min(0).max(100000), children: z.number().int().min(0).max(100000), infants: z.number().int().min(0).max(100000), access: Cats });
const Step4 = z.object({ must: Cats, optional: Cats });
const Step5 = z.object({ budget_mode: z.enum(["total", "range", "suggest"]), budget: z.number().min(0).max(100_000_000), budget_min: z.number().min(0).max(100_000_000), budget_max: z.number().min(0).max(100_000_000), style: z.string().max(30) });
export type PlanStep1 = z.infer<typeof Step1>; export type PlanStep2 = z.infer<typeof Step2>; export type PlanStep3 = z.infer<typeof Step3>; export type PlanStep4 = z.infer<typeof Step4>; export type PlanStep5 = z.infer<typeof Step5>;
export type PlanSaveStep = 1 | 2 | 3 | 4 | 5;

/** Event-local (UK) wall time → UTC ISO. */
function londonISO(d: string, t: string) {
  const guess = new Date(`${d}T${t}:00Z`);
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(guess).split(":").map(Number);
  let diff = (h! * 60 + m!) - (Number(t.slice(0, 2)) * 60 + Number(t.slice(3))); if (diff > 720) diff -= 1440; if (diff < -720) diff += 1440;
  return new Date(guess.getTime() - diff * 60000).toISOString();
}
async function mine(eventId: string | null) {
  const ctx = await getCustomer();
  if (!eventId) return { ctx, e: null };
  const id = Id.safeParse(eventId); if (!id.success) return null;
  const { data: e } = await ctx.supabase.from("events").select("id,status,settings,event_type,name").eq("id", id.data).eq("owner_id", ctx.user.id).eq("management", "consumer").maybeSingle();
  return e ? { ctx, e } : null;
}

/** Save one wizard step. Step 1 creates the event as a draft (visible in My Events as "Draft"); each later step is saved before moving on,
 *  and `settings.plan_steps` records the furthest completed step so a reload resumes where the customer left off. */
export async function savePlanStep(step: PlanSaveStep, payload: unknown, eventId: string | null): Promise<ActionResult<{ id: string }>> {
  const o = await mine(eventId); if (!o) return { ok: false, error: "Plan not found." };
  if (step > 1 && !o.e) return { ok: false, error: "Start with the occasion first." };
  const settings = { ...((o.e?.settings ?? {}) as Record<string, unknown>) };
  let patch: Record<string, unknown> = {};
  if (step === 1) {
    const p = Step1.safeParse(payload); if (!p.success) return { ok: false, error: "Choose an occasion to continue." };
    patch = { event_type: p.data.event_type, name: p.data.name.trim() || `My ${occasionLabel(p.data.event_type)}`, visibility: p.data.visibility, description: p.data.description.trim() };
    settings.agent_help = p.data.agent_help;
  } else if (step === 2) {
    const p = Step2.safeParse(payload); if (!p.success) return { ok: false, error: "Check the date and location." };
    const d = p.data;
    if (!d.date) return { ok: false, error: "Choose a date to continue." };
    if (d.date < new Date().toISOString().slice(0, 10)) return { ok: false, error: "Choose a date in the future." };
    if (d.date_mode === "flexible" && d.flex_to && d.flex_to < d.date) return { ok: false, error: "The end of your date range must be after the start." };
    const startISO = londonISO(d.date, d.start);
    let endISO = londonISO(d.date, d.end); if (endISO <= startISO) endISO = new Date(new Date(endISO).getTime() + 864e5).toISOString();
    patch = { starts_at: startISO, ends_at: endISO, flexible_dates: d.date_mode === "flexible" || d.flexible_window, location: d.location.trim(), city: d.location.split(",")[0]!.trim(), timezone: "Europe/London" };
    Object.assign(settings, { date_mode: d.date_mode, flex_to: d.flex_to || null, flexible_window: d.flexible_window, radius_miles: d.radius });
  } else if (step === 3) {
    const p = Step3.safeParse(payload); if (!p.success) return { ok: false, error: "Check your guest numbers." };
    const d = p.data;
    if (d.adults + d.children + d.infants > 0 && d.adults + d.children + d.infants !== d.guests) return { ok: false, error: "Your guest breakdown should add up to the total." };
    patch = { guest_count: d.guests, adults: d.adults || null, children: d.children || null };
    Object.assign(settings, { infants: d.infants, accessibility: d.access, guests_confirmed: true });
  } else if (step === 4) {
    const p = Step4.safeParse(payload); if (!p.success) return { ok: false, error: "Check your services and extras." };
    if (!p.data.must.length) return { ok: false, error: "Choose at least one must-have service." };
    patch = { priorities: p.data.must };
    settings.optional_categories = p.data.optional.filter(c => !p.data.must.includes(c));
  } else {
    const p = Step5.safeParse(payload); if (!p.success) return { ok: false, error: "Check your budget and priorities." };
    const d = p.data;
    if (d.budget_mode === "range" && d.budget_max < d.budget_min) return { ok: false, error: "The maximum should be higher than the minimum." };
    const budget = d.budget_mode === "range" ? Math.round((d.budget_min + d.budget_max) / 2) : d.budget;
    if (!budget) return { ok: false, error: "Enter a budget, or choose Get a suggestion." };
    patch = { budget_total: budget };
    Object.assign(settings, { budget_mode: d.budget_mode, budget_min: d.budget_min, budget_max: d.budget_max, style: d.style });
  }
  if (step === 3 || step === 5) patch.tags = [settings.style as string | undefined, ...((settings.accessibility as string[] | undefined) ?? [])].filter(Boolean);
  settings.plan_steps = Math.max(Number(settings.plan_steps ?? 0) || 0, step);
  patch.settings = settings;
  if (!o.e) {
    const { data, error } = await o.ctx.supabase.from("events").insert({ ...patch, owner_id: o.ctx.user.id, management: "consumer", status: "draft", currency: "GBP" } as TablesInsert<"events">).select("id").single();
    if (error || !data) return { ok: false, error: "Could not start your plan." };
    revalidatePath("/account/events"); return { ok: true, data: { id: data.id } };
  }
  const { error } = await o.ctx.supabase.from("events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", o.e.id);
  if (error) return { ok: false, error: "Could not save this step." };
  revalidatePath("/account/events"); return { ok: true, data: { id: o.e.id } };
}

/** Create the event from the plan (draft → planning) or, for an existing event, add the recommendations to its build.
 *  Adds the best-matching listing per chosen category as a *suggestion* (nothing is requested or booked) plus a checklist. */
export async function createFromPlan(eventId: string, venueId: string | null): Promise<ActionResult> {
  const o = await mine(eventId); if (!o || !o.e) return { ok: false, error: "Plan not found." };
  const { data: e } = await o.ctx.supabase.from("events").select("id,status,event_type,guest_count,budget_total,priorities,settings,starts_at,city").eq("id", o.e.id).single();
  if (!e) return { ok: false, error: "Plan not found." };
  if (e.status === "draft" && (!e.starts_at || !normaliseCats(e.priorities).length || !Number(e.budget_total))) return { ok: false, error: "Complete your date, services and budget first." };
  const s = (e.settings ?? {}) as Record<string, unknown>;
  const cats = [...normaliseCats(e.priorities), ...normaliseCats(s.optional_categories as string[])];
  const alloc = allocate(e.event_type, Number(e.budget_total ?? 0), cats);
  const { data: existing } = await o.ctx.supabase.from("build_items").select("category,listing_id").eq("event_id", e.id).neq("status", "cancelled");
  const have = new Set((existing ?? []).map(i => i.category)); const haveListing = new Set((existing ?? []).map(i => i.listing_id));
  const { data: listings } = await o.ctx.supabase.from("listings").select("id,name,kind,category,image,price_from,price_unit,capacity_max,tags,rating,city").eq("published", true).order("rating", { ascending: false }).limit(200);
  const rows: TablesInsert<"build_items">[] = []; let sort = (existing?.length ?? 0);
  for (const a of alloc) {
    const cat = buildCat(a.key); if (have.has(cat)) continue;
    const pool = (listings ?? []).filter(l => !haveListing.has(l.id) && buildCategoryOf(l.kind, l.category) === cat && (cat !== "venue" || !l.capacity_max || l.capacity_max >= e.guest_count));
    const pick = (cat === "venue" && venueId ? pool.find(l => l.id === venueId) : null) ?? pool.find(l => l.price_from == null || Number(l.price_from) <= a.max) ?? pool[0];
    if (!pick) continue;
    const perGuest = /guest|person/.test(pick.price_unit ?? "");
    rows.push({ event_id: e.id, listing_id: pick.id, category: cat, title: pick.name, package: pick.category, scope: (pick.tags ?? []).slice(0, 4).join(" • "), image: pick.image, amount: pick.price_from == null ? null : perGuest ? Number(pick.price_from) * e.guest_count : Number(pick.price_from), price_basis: perGuest ? "per_person" : "estimate", quote: perGuest ? { per_guest: Number(pick.price_from) } : {}, status: "suggested", role: "primary", sort: ++sort });
    have.add(cat);
  }
  if (rows.length) { const { error } = await o.ctx.supabase.from("build_items").insert(rows); if (error) return { ok: false, error: "Could not add the recommendations." }; }
  const wasDraft = e.status === "draft";
  if (wasDraft) {
    const due = (days: number) => e.starts_at ? new Date(new Date(e.starts_at).getTime() - days * 864e5).toISOString() : null;
    const tasks = [["Shortlist and request venue quotes", "venue", 120, "high"], ...cats.filter(c => c !== "venue").map(c => [`Get quotes for ${labelOf(c).toLowerCase()}`, c, 90, "medium"]), ["Send invitations", "guests", 60, "medium"], ["Confirm final guest numbers", "guests", 14, "high"], ["Finalise day-of timeline", "timeline", 7, "medium"]] as [string, string, number, string][];
    await o.ctx.supabase.from("tasks").insert(tasks.map(([title, category, days, priority]) => ({ event_id: e.id, owner_id: o.ctx.user.id, title, category, due_at: due(days), priority, status: "todo" })));
    await o.ctx.supabase.from("events").update({ status: "planning", settings: { ...s, planned_with_wizard: true, allocation: alloc }, updated_at: new Date().toISOString() }).eq("id", e.id);
  }
  for (const p of ["", "/build", "/plan", "/money"]) revalidatePath(`/account/events/${e.id}${p}`); revalidatePath("/account/events");
  return { ok: true, message: wasDraft ? `Your event is created with ${rows.length} suggestions to review.` : rows.length ? `${rows.length} suggestions added to your build.` : "Your build already covers these categories.", redirect: `/account/events/${e.id}/build` };
}

/** Discard a draft plan (only drafts can be discarded this way). */
export async function discardPlan(eventId: string): Promise<ActionResult> {
  const o = await mine(eventId); if (!o || !o.e) return { ok: false, error: "Plan not found." };
  if (o.e.status !== "draft") return { ok: false, error: "Only draft plans can be discarded." };
  // W13: customers have no DELETE on events (the old delete matched 0 rows and still reported success). A discarded draft is
  // archived instead (draft → archived is a permitted transition); archived plans drop out of My Events and Home.
  const { data: gone, error } = await o.ctx.supabase.from("events").update({ status: "archived" }).eq("id", o.e.id).eq("status", "draft").select("id");
  if (error || !gone?.length) return { ok: false, error: "Couldn’t discard this draft — try again." };
  revalidatePath("/account/events"); return { ok: true, message: "Draft discarded.", redirect: "/plan" };
}
