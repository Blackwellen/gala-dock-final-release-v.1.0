"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
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
  const day = o.e.starts_at.slice(0, 10); const at = new Date(`${day}T${p.data.time}:00`);
  const { error } = await o.ctx.supabase.from("programme_items").insert({ event_id: o.e.id, kind: "day_plan", title: p.data.title, detail: p.data.detail, starts_at: at.toISOString() });
  if (error) return { ok: false, error: "Could not add to the day plan." };
  revalidatePath(`/account/events/${o.e.id}/plan`); return { ok: true, message: "Added to your day plan." };
}
