"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { isoToWall, wallToIso } from "@/lib/events/wall-time";
import type { ActionResult } from "./shell";

const Task = z.object({ title: z.string().trim().min(2).max(160), category: z.string().max(40).default("General"), due_at: z.string().optional(), assignee_name: z.string().max(60).default("You") });
async function own(eventId: string) {
  const id = z.string().uuid().safeParse(eventId); if (!id.success) return null;
  const ctx = await getCustomer();
  const { data: e } = await ctx.supabase.from("events").select("id,starts_at").eq("id", id.data).eq("owner_id", ctx.user.id).maybeSingle();
  return e ? { ctx, e } : null;
}
export async function addCustomerTask(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await own(eventId); if (!o) return { ok: false, error: "Event not found." };
  const p = Task.safeParse(input); if (!p.success) return { ok: false, error: "Add a task title." };
  const due = p.data.due_at ? new Date(p.data.due_at) : null;
  if (due && o.e.starts_at && due.toISOString() > o.e.starts_at) return { ok: false, error: "Tasks must be due before the event." };
  const { error } = await o.ctx.supabase.from("tasks").insert({ event_id: o.e.id, owner_id: o.ctx.user.id, title: p.data.title, category: p.data.category, assignee_name: p.data.assignee_name, due_at: due?.toISOString() ?? null });
  if (error) return { ok: false, error: "Could not add the task." };
  revalidatePath(`/account/events/${o.e.id}/plan`); return { ok: true, message: "Task added." };
}
export async function addDayPlanItem(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await own(eventId); if (!o) return { ok: false, error: "Event not found." };
  const p = z.object({ title: z.string().trim().min(2).max(120), detail: z.string().max(120).default(""), time: z.string().regex(/^\d{2}:\d{2}$/) }).safeParse(input);
  if (!p.success || !o.e.starts_at) return { ok: false, error: p.success ? "Set your event date first." : "Add a title and time." };
  // The time is a London wall-clock time on the event's London date (the plan shows times in Europe/London). Parsing it as UTC
  // put every item an hour late during BST, and an event starting after 23:00 UTC landed on the wrong day.
  const at = wallToIso(`${isoToWall(o.e.starts_at).slice(0, 10)}T${p.data.time}`);
  if (!at) return { ok: false, error: "Add a title and time." };
  const { error } = await o.ctx.supabase.from("programme_items").insert({ event_id: o.e.id, kind: "day_plan", title: p.data.title, detail: p.data.detail, starts_at: at });
  if (error) return { ok: false, error: "Could not add to the day plan." };
  revalidatePath(`/account/events/${o.e.id}/plan`); return { ok: true, message: "Added to your day plan." };
}
/** Tick / untick a checklist task on the customer's own event (the organiser `toggleTask` only finds workspace events). */
export async function toggleCustomerTask(eventId: string, taskId: string, done: boolean): Promise<ActionResult> {
  const o = await own(eventId); if (!o) return { ok: false, error: "Event not found." };
  const id = z.string().uuid().safeParse(taskId); if (!id.success) return { ok: false, error: "Task not found." };
  const { data, error } = await o.ctx.supabase.from("tasks").update({ status: done ? "done" : "todo" }).eq("id", id.data).eq("event_id", o.e.id).select("id");
  if (error || !data?.length) return { ok: false, error: "Could not update the task." };
  revalidatePath(`/account/events/${o.e.id}/plan`); revalidatePath("/account/events"); return { ok: true };
}
