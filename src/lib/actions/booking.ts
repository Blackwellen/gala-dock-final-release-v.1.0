"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { stripe, stripeKey } from "@/lib/stripe";
import { stripeCustomer, savedCards } from "@/lib/payments";
import type { ActionResult } from "./shell";

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

/** Submit the request to the provider. A conditional hold places a refundable card authorisation (sandbox). */
export async function submitBooking(eventId: string, itemId: string, option: "request" | "hold" | "standby", agreed: boolean): Promise<ActionResult> {
  const o = await own(eventId, itemId); if (!o) return { ok: false, error: "Booking not found." };
  if (!agreed) return { ok: false, error: "Please agree to the provider's terms to continue." };
  if (!["request", "hold", "standby"].includes(option)) return { ok: false, error: "Choose a booking option." };
  const { data: pr } = o.it.request_id ? await o.ctx.supabase.from("provider_requests").select("requirements").eq("id", o.it.request_id).maybeSingle() : { data: null };
  const reqs = (pr?.requirements ?? null) as Record<string, unknown> | null;
  if (!reqs?.date) return { ok: false, error: "Complete your requirements first." };
  let auth: string | null = null;
  if (option === "hold") {
    const amount = Math.max(50, Math.min(500, Math.round(Number(o.it.deposit || Number(o.it.amount ?? 0) * 0.1))));
    const pay = await authorise(amount, `Hold — ${o.it.title}`, o.it.id, false); if (!pay.ok) return pay; auth = pay.ref;
  }
  const { error } = await o.ctx.supabase.rpc("customer_save_booking", { p_item: o.it.id, p_requirements: { ...reqs, ...(auth ? { authorisation_ref: auth } : {}) }, p_option: option, p_submit: true });
  if (error) { if (auth) await stripe(`payment_intents/${auth}/cancel`, {}).catch(() => null); return { ok: false, error: errText(error.message) }; }
  bump(eventId);
  return { ok: true, message: option === "standby" ? `You're on ${o.it.title}'s standby list.` : option === "hold" ? `Hold requested from ${o.it.title}. Your card is authorised, not charged.` : `Request sent to ${o.it.title}. They have 48 hours to respond.` };
}

/** Accept the quote: charge the deposit (sandbox test card) and confirm the booking atomically on the server. */
export async function acceptQuote(eventId: string, itemId: string, agreed: boolean): Promise<ActionResult> {
  const o = await own(eventId, itemId); if (!o) return { ok: false, error: "Booking not found." };
  if (!agreed) return { ok: false, error: "Please agree to the provider's terms to continue." };
  if (!["quoted", "available", "held"].includes(o.it.status) || o.it.amount == null) return { ok: false, error: "There's no quote to accept yet." };
  const deposit = Math.min(Number(o.it.amount), Number(o.it.deposit) || Math.round(Number(o.it.amount) * 0.3));
  const pay = await authorise(deposit, `Deposit — ${o.it.title}`, o.it.id, true); if (!pay.ok) return pay;
  const { error } = await o.ctx.supabase.rpc("customer_accept_quote", { p_item: o.it.id, p_payment_ref: pay.ref });
  if (error) {
    await stripe("refunds", { payment_intent: pay.ref }).catch(() => null);
    return { ok: false, error: error.message.includes("quote_expired") ? "This quote has expired — ask the provider to refresh it." : error.message.includes("hold_expired") ? "Your hold has expired. Request a new hold or quote." : error.message.includes("venue_required") ? "Confirm your venue before booking suppliers." : error.message.includes("hard_conflict") ? "The provider is no longer available on this date." : "Could not confirm the booking. You have not been charged." };
  }
  bump(eventId); return { ok: true, message: `${o.it.title} is booked. Deposit of £${deposit.toLocaleString("en-GB")} paid.` };
}

/** Charges (or authorises) the customer's default saved card. In Stripe test mode with no saved card, the test card is used. */
async function authorise(amount: number, description: string, itemId: string, capture: boolean): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const key = stripeKey();
  if (!key) return { ok: false, error: "Payments aren't configured yet." };
  const ctx = await getCustomer();
  const card = (await savedCards(ctx)).find(c => c.isDefault);
  if (!card && !key.startsWith("sk_test_")) return { ok: false, error: "Add a card in My Account → Payments to continue." };
  try {
    const cid = card ? await stripeCustomer(ctx) : null;
    const pi = await stripe<{ id: string; status: string }>("payment_intents", { amount: String(Math.round(amount * 100)), currency: "gbp", payment_method: card?.id ?? "pm_card_visa", ...(cid ? { customer: cid } : {}), confirm: "true", capture_method: capture ? "automatic" : "manual", description, "metadata[build_item_id]": itemId, "metadata[user_id]": ctx.user.id, "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never" });
    if (pi.status === "requires_action") { await stripe(`payment_intents/${pi.id}/cancel`, {}).catch(() => null); return { ok: false, error: "Your bank needs to verify this payment. Please use a different card." }; }
    if (!["succeeded", "requires_capture"].includes(pi.status)) return { ok: false, error: "Your card was declined." };
    return { ok: true, ref: pi.id };
  } catch { return { ok: false, error: "Payment couldn't be processed. You have not been charged." }; }
}

export type Availability = "available" | "limited" | "unavailable" | "unknown";
export async function checkAvailability(listingId: string, date: string, start: string, end: string): Promise<ActionResult<Availability>> {
  const l = Id.safeParse(listingId); if (!l.success || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Time.safeParse(start).success || !Time.safeParse(end).success) return { ok: false, error: "Choose a date and time." };
  const ctx = await getCustomer();
  const s = new Date(`${date}T${start}:00Z`); const e = new Date(`${date}T${end}:00Z`); if (e <= s) e.setUTCDate(e.getUTCDate() + 1);
  const { data, error } = await ctx.supabase.rpc("listing_availability", { p_listing: l.data, p_start: s.toISOString(), p_end: e.toISOString() });
  if (error) return { ok: false, error: "Couldn't check availability." };
  return { ok: true, data: (data ?? "unknown") as Availability };
}
