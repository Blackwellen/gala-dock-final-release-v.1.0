"use server";
import { z } from "zod";
import { payBooking, requestHold } from "@/lib/marketplace/actions";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";

const Id = z.string().uuid();
const Time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const Requirements = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: Time, end: Time, flexible_dates: z.boolean(),
  guests: z.number().int().min(1).max(100000), adults: z.number().int().min(0).max(100000).optional(), children: z.number().int().min(0).max(100000).optional(),
  setup: z.union([Time, z.literal("")]), breakdown: z.union([Time, z.literal("")]), access: z.enum(["standard", "step_free", "loading_bay", "restricted"]),
  notes: z.string().max(500), answers: z.record(z.string().max(40), z.string().max(40)).refine(a => Object.keys(a).length <= 12),
  alt_dates: z.boolean(), standby_interest: z.boolean(), layout: z.string().max(40).optional(),
});
export type BookingRequirements = z.infer<typeof Requirements>;

async function own(eventId: string, itemId: string) {
  const e = Id.safeParse(eventId), i = Id.safeParse(itemId); if (!e.success || !i.success) return null;
  const ctx = await getCustomer();
  const { data: it } = await ctx.supabase.from("build_items").select("id,event_id,title,status,amount,deposit,listing_id,request_id,events!inner(owner_id,name)").eq("id", i.data).eq("event_id", e.data).maybeSingle();
  if (!it || (it.events as unknown as { owner_id: string }).owner_id !== ctx.user.id) return null;
  return { ctx, it };
}
const bump = (id: string) => { for (const p of ["", "/build", "/money", "/plan", "/messages", "/book"]) revalidatePath(`/account/events/${id}${p}`); revalidatePath("/account/events"); };
const errText = (m: string) => m.includes("not_open") ? "This booking is already confirmed or closed." : m.includes("event_closed") ? "This event can no longer be changed." : m.includes("not_authorized") ? "You can't change this booking." : "Could not save your request.";

/** Save requirements as a draft (Save and exit / Continue) without contacting the provider. */
export async function saveBookingDraft(eventId: string, itemId: string, req: BookingRequirements, option: "request" | "hold" | "standby" = "request"): Promise<ActionResult> {
  const o = await own(eventId, itemId); if (!o) return { ok: false, error: "Booking not found." };
  const r = Requirements.safeParse(req); if (!r.success) return { ok: false, error: "Check the highlighted details." };
  if (r.data.end <= r.data.start && r.data.end > "06:00") return { ok: false, error: "End time must be after the start time." };
  const { error } = await o.ctx.supabase.rpc("customer_save_booking", { p_item: o.it.id, p_requirements: { ...r.data, layout: r.data.answers.layout ?? r.data.layout }, p_option: option, p_submit: false });
  if (error) return { ok: false, error: errText(error.message) };
  bump(eventId); return { ok: true, message: "Saved — you can finish this later." };
}

/** Submit the request to the provider. A conditional hold on a quoted/available line goes through the hold engine
 *  (request_conditional_hold) — no long card authorisations; otherwise the request is sent flagged as a hold request. */
export async function submitBooking(eventId: string, itemId: string, option: "request" | "hold" | "standby", agreed: boolean): Promise<ActionResult> {
  const o = await own(eventId, itemId); if (!o) return { ok: false, error: "Booking not found." };
  if (!agreed) return { ok: false, error: "Please agree to the provider's terms to continue." };
  if (!["request", "hold", "standby"].includes(option)) return { ok: false, error: "Choose a booking option." };
  const { data: pr } = o.it.request_id ? await o.ctx.supabase.from("provider_requests").select("requirements").eq("id", o.it.request_id).maybeSingle() : { data: null };
  const reqs = (pr?.requirements ?? null) as Record<string, unknown> | null;
  if (!reqs?.date) return { ok: false, error: "Complete your requirements first." };
  if (option === "hold" && HOLDABLE.includes(o.it.status)) {
    const r = await requestHold(o.it.id, 48, null, "Requested from the booking flow");
    if (!r.ok) return { ok: false, error: ("error" in r && r.error) || "Could not request a hold." };
    bump(eventId); return { ok: true, message: `Hold requested from ${o.it.title}. Nothing is charged until you confirm.` };
  }
  const { error } = await o.ctx.supabase.rpc("customer_save_booking", { p_item: o.it.id, p_requirements: reqs as Json, p_option: option, p_submit: true });
  if (error) return { ok: false, error: errText(error.message) };
  bump(eventId);
  return { ok: true, message: option === "standby" ? `You're on ${o.it.title}'s standby list.` : option === "hold" ? `Hold request sent to ${o.it.title}. Nothing is charged until you confirm.` : `Request sent to ${o.it.title}. They have 48 hours to respond.` };
}

/** Accept the quote: starts a deposit payment order and returns the Stripe Checkout URL. The webhook confirms the booking
 *  (payment order → ledger → booking confirmed, provider notified); funds are protected until delivery. */
export async function acceptQuote(eventId: string, itemId: string, agreed: boolean): Promise<ActionResult<string>> {
  const o = await own(eventId, itemId); if (!o) return { ok: false, error: "Booking not found." };
  if (!agreed) return { ok: false, error: "Please agree to the provider's terms to continue." };
  if (!["quoted", "available", "held", "quote_received", "quote_revised", "customer_reviewing"].includes(o.it.status) || o.it.amount == null) return { ok: false, error: "There's no quote to accept yet." };
  const r = await payBooking("deposit", { itemId: o.it.id }, `/account/events/${eventId}/book?item=${o.it.id}&step=3`);
  if (!r.ok || !r.data) return { ok: false, error: ("error" in r && r.error) || "Couldn't start the payment. You haven't been charged." };
  return { ok: true, data: r.data, message: "Taking you to secure payment…" };
}

const HOLDABLE = ["available", "quoted", "quote_received", "quote_revised", "customer_reviewing"];

export type Availability = "available" | "limited" | "unavailable" | "unknown";
export async function checkAvailability(listingId: string, date: string, start: string, end: string): Promise<ActionResult<Availability>> {
  const l = Id.safeParse(listingId); if (!l.success || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Time.safeParse(start).success || !Time.safeParse(end).success) return { ok: false, error: "Choose a date and time." };
  const ctx = await getCustomer();
  const s = new Date(`${date}T${start}:00Z`); const e = new Date(`${date}T${end}:00Z`); if (e <= s) e.setUTCDate(e.getUTCDate() + 1);
  const { data, error } = await ctx.supabase.rpc("listing_availability", { p_listing: l.data, p_start: s.toISOString(), p_end: e.toISOString() });
  if (error) return { ok: false, error: "Couldn't check availability." };
  return { ok: true, data: (data ?? "unknown") as Availability };
}
