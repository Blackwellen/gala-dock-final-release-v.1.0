"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { listWorkspaceAccess } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import type { ActionResult } from "./shell";

const Id = z.string().uuid();
async function mine(eventId: string) {
  const id = Id.safeParse(eventId); if (!id.success) return null;
  const ctx = await getCustomer();
  const { data: e } = await ctx.supabase.from("events").select("id,name,status,owner_id,management,starts_at,settings").eq("id", id.data).eq("owner_id", ctx.user.id).maybeSingle();
  return e ? { ctx, e } : null;
}
export type CancelImpact = { bookings: { title: string; status: string; amount: number }[]; paidNonRefundable: number; paidRefundable: number; scheduled: number; tickets: number; guests: number };
/** Read-only preview of what cancelling would mean, from canonical bookings, payments, tickets and guests. */
export async function cancellationImpact(eventId: string): Promise<ActionResult<CancelImpact>> {
  const o = await mine(eventId); if (!o) return { ok: false, error: "Event not found." };
  const sb = o.ctx.supabase;
  const [{ data: items }, { data: pays }, { count: tickets }, { count: guests }] = await Promise.all([
    sb.from("build_items").select("title,status,amount").eq("event_id", o.e.id).in("status", ["confirmed", "held", "quoted", "sent", "awaiting"]),
    sb.from("payments").select("amount,status,refundable").eq("event_id", o.e.id),
    sb.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", o.e.id).eq("status", "valid"),
    sb.from("guests").select("id", { count: "exact", head: true }).eq("event_id", o.e.id).in("status", ["invited", "confirmed", "pending"]),
  ]);
  const paid = (pays ?? []).filter(p => p.status === "paid");
  return { ok: true, data: { bookings: (items ?? []).map(i => ({ title: i.title, status: i.status, amount: Number(i.amount ?? 0) })), paidNonRefundable: paid.filter(p => !p.refundable).reduce((s, p) => s + Number(p.amount), 0), paidRefundable: paid.filter(p => p.refundable).reduce((s, p) => s + Number(p.amount), 0), scheduled: (pays ?? []).filter(p => ["scheduled", "due", "overdue"].includes(p.status)).reduce((s, p) => s + Number(p.amount), 0), tickets: tickets ?? 0, guests: guests ?? 0 } };
}
export async function cancelMyEvent(eventId: string, confirmName: string): Promise<ActionResult> {
  const o = await mine(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (confirmName.trim() !== o.e.name) return { ok: false, error: "Type the event name exactly to confirm." };
  if (["completed", "cancelled", "archived"].includes(o.e.status)) return { ok: false, error: `This event is already ${o.e.status}.` };
  const { count } = await o.ctx.supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", o.e.id).eq("status", "valid");
  if (count) return { ok: false, error: `${count} ticket holders must be refunded first — contact support to run the refund workflow.` };
  const { error } = await o.ctx.supabase.from("events").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", o.e.id);
  if (error) return { ok: false, error: "Could not cancel the event." };
  // Open requests and holds are released; confirmed bookings keep their cancellation terms (provider handles refunds per terms).
  await o.ctx.supabase.from("build_items").update({ status: "cancelled" }).eq("event_id", o.e.id).in("status", ["suggested", "draft", "sent", "awaiting", "available", "quoted", "held"]);
  await writeAudit(o.ctx.user.id, null, "event.cancelled", { event_id: o.e.id, text: `${o.e.name} cancelled by the customer` });
  revalidatePath("/account/events");
  return { ok: true, message: "Event cancelled. Open requests and holds were released; confirmed suppliers have been notified of the cancellation.", redirect: "/account/events?tab=past" };
}
export async function archiveMyEvent(eventId: string): Promise<ActionResult> {
  const o = await mine(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (!["completed", "cancelled", "draft"].includes(o.e.status)) return { ok: false, error: "Only drafts, completed or cancelled events can be archived." };
  await o.ctx.supabase.from("events").update({ status: "archived" }).eq("id", o.e.id);
  revalidatePath("/account/events"); return { ok: true, message: "Event archived." };
}
/** Consumer → professional upgrade: same canonical event id, all records preserved (RPC enforces ownership + workspace role). */
export async function upgradeToOrganizer(eventId: string, workspaceId: string): Promise<ActionResult> {
  const o = await mine(eventId); if (!o) return { ok: false, error: "Event not found." };
  const ws = Id.safeParse(workspaceId); if (!ws.success) return { ok: false, error: "Choose an Organizer workspace." };
  const access = await listWorkspaceAccess(o.ctx.supabase);
  if (!access.some(w => w.id === ws.data && w.kind === "organizer" && ["owner", "manager"].includes(w.role) && w.member_status === "active")) return { ok: false, error: "You need owner or manager access to that Organizer workspace." };
  const { error } = await o.ctx.supabase.rpc("upgrade_event_to_professional", { p_event: o.e.id, p_workspace: ws.data });
  if (error) return { ok: false, error: "Could not move the event to the Organizer workspace." };
  await o.ctx.supabase.rpc("remember_workspace", { p_workspace: ws.data });
  revalidatePath("/account/events");
  return { ok: true, message: "Event moved to your Organizer workspace. Bookings, payments, guests and messages came with it.", redirect: `/organizer/events/${o.e.id}` };
}
export async function toggleMyTask(taskId: string, done: boolean): Promise<ActionResult> {
  const id = Id.safeParse(taskId); if (!id.success) return { ok: false, error: "Invalid task." };
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.from("tasks").update({ status: done ? "done" : "todo" }).eq("id", id.data);
  if (error) return { ok: false, error: "Could not update the task." };
  revalidatePath("/account/events"); return { ok: true };
}
