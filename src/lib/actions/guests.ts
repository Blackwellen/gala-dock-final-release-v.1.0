"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { rateLimit } from "@/lib/security";
import type { ActionResult } from "./shell";

async function own(eventId: string) {
  const id = z.string().uuid().safeParse(eventId); if (!id.success) return null;
  const ctx = await getCustomer();
  const { data: e } = await ctx.supabase.from("events").select("id,name,capacity,guest_count").eq("id", id.data).eq("owner_id", ctx.user.id).maybeSingle();
  return e ? { ctx, e } : null;
}
const bump = (id: string) => revalidatePath(`/account/events/${id}/guests-tickets`);
const Guest = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().or(z.literal("")).default(""), phone: z.string().max(40).default(""), plus_one: z.coerce.boolean().default(false), group_name: z.string().max(60).default(""), dietary: z.string().max(200).default("") });
export async function addGuest(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await own(eventId); if (!o) return { ok: false, error: "Event not found." };
  const p = Guest.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "email" ? "Enter a valid email." : "Add the guest's name." };
  if (p.data.email) { const { data: dup } = await o.ctx.supabase.from("guests").select("id").eq("event_id", o.e.id).eq("email", p.data.email.toLowerCase()).maybeSingle(); if (dup) return { ok: false, error: "That guest is already on your list." }; }
  const { error } = await o.ctx.supabase.from("guests").insert({ ...p.data, email: p.data.email.toLowerCase(), event_id: o.e.id, status: "draft", tickets: p.data.plus_one ? 2 : 1 });
  if (error) return { ok: false, error: "Could not add the guest." };
  bump(o.e.id); return { ok: true, message: `${p.data.name} added. Send invites when you're ready.` };
}
export async function importGuests(eventId: string, rows: unknown[]): Promise<ActionResult> {
  const o = await own(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) return { ok: false, error: "Import between 1 and 500 guests." };
  const valid = rows.map(r => Guest.safeParse(r)).filter(r => r.success).map(r => r.data);
  if (!valid.length) return { ok: false, error: "No valid rows. Each row needs a name." };
  const { error } = await o.ctx.supabase.from("guests").insert(valid.map(g => ({ ...g, email: g.email.toLowerCase(), event_id: o.e.id, status: "draft" as const, tickets: g.plus_one ? 2 : 1 })));
  if (error) return { ok: false, error: "Import failed — no guests were added." };
  bump(o.e.id); return { ok: true, message: `Imported ${valid.length} guests${rows.length - valid.length ? ` (${rows.length - valid.length} skipped)` : ""}.` };
}
/** Marks draft guests as invited. Email delivery is not configured on this environment, so the UI states that clearly. */
export async function sendInvites(eventId: string, ids?: string[]): Promise<ActionResult> {
  const o = await own(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (!(await rateLimit(`invites:${o.ctx.user.id}`, 20, 3600))) return { ok: false, error: "Too many invite batches — try again later." };
  let q = o.ctx.supabase.from("guests").update({ status: "invited", invited_at: new Date().toISOString() }).eq("event_id", o.e.id).eq("status", "draft");
  if (ids?.length) q = q.in("id", ids.filter(i => /^[0-9a-f-]{36}$/i.test(i)));
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: "Could not send invites." };
  bump(o.e.id); return { ok: true, message: data?.length ? `${data.length} guest${data.length === 1 ? "" : "s"} marked invited. Share your RSVP link — email delivery isn't configured on this environment.` : "Everyone has already been invited." };
}
export async function setGuestStatus(eventId: string, guestId: string, status: "confirmed" | "pending" | "declined" | "invited"): Promise<ActionResult> {
  const o = await own(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (!["confirmed", "pending", "declined", "invited"].includes(status)) return { ok: false, error: "Invalid status." };
  await o.ctx.supabase.from("guests").update({ status }).eq("id", guestId).eq("event_id", o.e.id);
  bump(o.e.id); return { ok: true };
}
export async function removeGuest(eventId: string, guestId: string): Promise<ActionResult> {
  const o = await own(eventId); if (!o) return { ok: false, error: "Event not found." };
  await o.ctx.supabase.from("guests").delete().eq("id", guestId).eq("event_id", o.e.id);
  bump(o.e.id); return { ok: true, message: "Guest removed." };
}
const Tier = z.object({ name: z.string().trim().min(2).max(80), price: z.coerce.number().min(0).max(10000), quantity: z.coerce.number().int().min(1).max(100000), sale_end: z.string().optional() });
export async function createTier(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await own(eventId); if (!o) return { ok: false, error: "Event not found." };
  const p = Tier.safeParse(input); if (!p.success) return { ok: false, error: "Add a name, price and quantity." };
  const { data: tiers } = await o.ctx.supabase.from("ticket_tiers").select("quantity").eq("event_id", o.e.id);
  const total = (tiers ?? []).reduce((s, t) => s + t.quantity, 0) + p.data.quantity;
  if (o.e.capacity && total > o.e.capacity * 2) return { ok: false, error: `Total tickets (${total}) would exceed your venue capacity of ${o.e.capacity}.` };
  if (p.data.price > 0) { const { data: prof } = await o.ctx.supabase.from("profiles").select("id").eq("id", o.ctx.user.id).single(); if (!prof) return { ok: false, error: "Profile not found." }; }
  const { error } = await o.ctx.supabase.from("ticket_tiers").insert({ event_id: o.e.id, name: p.data.name, price: p.data.price, quantity: p.data.quantity, kind: p.data.price === 0 ? "comp" : "general", status: "draft", sale_end: p.data.sale_end ? new Date(p.data.sale_end).toISOString() : null, sort: (tiers?.length ?? 0) });
  if (error) return { ok: false, error: "Could not create the ticket tier." };
  bump(o.e.id); return { ok: true, message: `${p.data.name} created as a draft. Publish it from Ticket setup.` };
}
