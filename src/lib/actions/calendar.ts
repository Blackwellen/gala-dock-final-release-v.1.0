"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";

const Entry = z.object({ title: z.string().trim().min(1).max(160), detail: z.string().max(500).default(""), starts_at: z.string().min(1), ends_at: z.string().optional(), event_id: z.string().uuid().optional().or(z.literal("")), layer: z.enum(["meetings", "external"]).default("meetings") });
export async function createCalendarEntry(input: unknown): Promise<ActionResult> {
  const p = Entry.safeParse(input); if (!p.success) return { ok: false, error: "Add a title and start time." };
  const ctx = await getOrganizer();
  const s = new Date(p.data.starts_at), e = p.data.ends_at ? new Date(p.data.ends_at) : new Date(s.getTime() + 36e5);
  if (Number.isNaN(s.getTime()) || e <= s) return { ok: false, error: "The end must be after the start." };
  if (p.data.event_id) { const { data } = await ctx.supabase.from("events").select("id").eq("id", p.data.event_id).eq("workspace_id", ctx.workspace.id).maybeSingle(); if (!data) return { ok: false, error: "Event not found." }; }
  const { error } = await ctx.supabase.from("calendar_entries").insert({ workspace_id: ctx.workspace.id, owner_id: ctx.user.id, title: p.data.title, detail: p.data.detail, starts_at: s.toISOString(), ends_at: e.toISOString(), event_id: p.data.event_id || null, layer: p.data.layer });
  if (error) return { ok: false, error: "Could not add to the calendar." };
  revalidatePath("/organizer/calendar"); return { ok: true, message: "Added to calendar." };
}

export type Impact = { allowed: boolean; title: string; lines: string[]; href?: string };
/** Drag-to-reschedule. Only independent items (tasks, meetings) move directly; dependent items return an impact assessment. */
export async function rescheduleEntry(layer: string, sourceId: string, newStartIso: string): Promise<ActionResult<Impact>> {
  const id = z.string().uuid().safeParse(sourceId); const at = new Date(newStartIso);
  if (!id.success || Number.isNaN(at.getTime())) return { ok: false, error: "Invalid move." };
  const ctx = await getOrganizer(); const sb = ctx.supabase;
  if (layer === "tasks") {
    const { data: t } = await sb.from("tasks").select("id,title,event_id,events(starts_at,name)").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!t) return { ok: false, error: "Task not found." };
    const ev = t.events as unknown as { starts_at: string | null; name: string } | null;
    if (ev?.starts_at && at.toISOString() > ev.starts_at) return { ok: false, error: `“${t.title}” can't be due after ${ev.name} starts.` };
    await sb.from("tasks").update({ due_at: at.toISOString() }).eq("id", t.id);
    revalidatePath("/organizer/calendar"); return { ok: true, message: `Moved “${t.title}”.` };
  }
  if (layer === "meetings") {
    const { data: c } = await sb.from("calendar_entries").select("id,title,starts_at,ends_at").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!c) return { ok: false, error: "Entry not found." };
    const dur = c.ends_at ? new Date(c.ends_at).getTime() - new Date(c.starts_at).getTime() : 36e5;
    await sb.from("calendar_entries").update({ starts_at: at.toISOString(), ends_at: new Date(at.getTime() + dur).toISOString() }).eq("id", c.id);
    revalidatePath("/organizer/calendar"); return { ok: true, message: `Moved “${c.title}”.` };
  }
  if (layer === "events") {
    const { data: e } = await sb.from("events").select("id,name,starts_at,status").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!e) return { ok: false, error: "Event not found." };
    const [{ count: tickets }, { data: items }, { count: shifts }, { count: pays }] = await Promise.all([
      sb.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "valid"),
      sb.from("build_items").select("title,status").eq("event_id", e.id).in("status", ["confirmed", "held"]),
      sb.from("shifts").select("id", { count: "exact", head: true }).eq("event_id", e.id),
      sb.from("payments").select("id", { count: "exact", head: true }).eq("event_id", e.id).neq("status", "paid"),
    ]);
    const lines = [
      tickets ? `${tickets} ticket holders must be notified and offered refunds (postponement workflow).` : "No ticket holders affected.",
      ...(items ?? []).map(b => `${b.title} (${b.status}) — availability on the new date must be re-confirmed; cancellation terms may apply.`),
      shifts ? `${shifts} crew shifts would need rescheduling.` : "",
      pays ? `${pays} scheduled payments have dates tied to the event.` : "",
    ].filter(Boolean);
    return { ok: true, data: { allowed: false, title: `Moving ${e.name} to ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`, lines, href: `/organizer/events/${e.id}?tab=overview` } };
  }
  return { ok: true, data: { allowed: false, title: "This item follows its source record", lines: ["Crew shifts, holds, releases, promotions and payments are rescheduled from their own screens so dependencies stay consistent."] } };
}
