"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import { untyped } from "@/lib/workspace/db";
import { isTimezone } from "@/lib/master-data";

const MODS = ["plan", "schedule", "providers", "tickets", "promotion", "staffing", "risk"] as const;
const Save = z.object({ event_id: z.string().uuid(), name: z.string().trim().min(3).max(80), description: z.string().max(500), event_types: z.array(z.string().trim().min(1).max(30)).min(1).max(10), modules: z.record(z.enum(MODS), z.boolean()), family_id: z.string().uuid().optional() });

/**
 * Save an event's reusable structure as a (versioned) template through `save_event_template`: programme shape and task list
 * with offsets relative to the start, task dependencies, ticket tier shapes, allow-listed settings, budget category names,
 * provider categories, role counts and promotion channels. Guests, money, bookings, messages, dates and PII are never copied.
 */
export async function saveTemplate(input: unknown): Promise<ActionResult> {
  const p = Save.safeParse(input); if (!p.success) return { ok: false, error: String(p.error.issues[0]?.path[0]) === "event_types" ? "Choose at least one event type." : "Give the template a name (3+ characters)." };
  const ctx = await getOrganizer();
  const { data: e } = await ctx.supabase.from("events").select("id").eq("id", p.data.event_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  const { error } = await untyped(ctx.supabase).rpc("save_event_template", { p_event: e.id, p_name: p.data.name, p_description: p.data.description, p_event_types: p.data.event_types, p_modules: p.data.modules, p_family: p.data.family_id ?? null });
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "You don't have permission to save templates in this workspace." : /template_not_found/.test(error.message) ? "That template no longer exists." : "Could not save the template." };
  revalidatePath("/organizer/events"); return { ok: true, message: `Template "${p.data.name}" saved.`, redirect: "/organizer/events?tab=templates" };
}

/** Archive a whole template family — every version, active and superseded (`archive_event_template_family`, 202610294040).
 * Events already made from it are untouched. */
export async function archiveTemplate(templateId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(templateId).success) return { ok: false, error: "Invalid template." };
  const ctx = await getOrganizer();
  const { data, error } = await untyped(ctx.supabase).rpc("archive_event_template_family", { p_template: templateId });
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "You don't have permission to archive templates in this workspace." : /not_found/.test(error.message) ? "Gala Dock starter templates can't be archived; only your workspace's own templates can." : "Could not archive the template." };
  const n = (data as { versions_archived?: number } | null)?.versions_archived ?? 0;
  revalidatePath("/organizer/events"); return { ok: true, message: n > 1 ? `Template archived (all ${n} versions).` : "Template archived." };
}

const FromTpl = z.object({ template_id: z.string().uuid(), name: z.string().trim().min(2).max(120),
  starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Choose the start date and time."), timezone: z.string().refine(isTimezone, "Choose a timezone."), request_id: z.string().uuid().optional() });
/** New private draft event from a template at a required start date: programme, tasks and ticket windows keep their offsets. */
export async function createEventFromTemplate(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = FromTpl.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Choose a name and start date." };
  const ctx = await getOrganizer();
  const { data, error } = await untyped(ctx.supabase).rpc("create_event_from_template", { p_template: p.data.template_id, p_workspace: ctx.workspace.id, p_name: p.data.name, p_starts_local: p.data.starts_at, p_timezone: p.data.timezone, p_request_id: p.data.request_id ?? null });
  if (error) return { ok: false, error: /start_in_past/.test(error.message) ? "The start date must be in the future." : /start_date_required/.test(error.message) ? "Choose the start date and time." : /invalid_timezone/.test(error.message) ? "Choose a valid timezone." : /invalid_name/.test(error.message) ? "Give the event a name (2+ characters)." : /not_authorized/.test(error.message) ? "You can't use this template here (it may have been archived, or your role can't create events)." : "Could not create the event." };
  const r = data as { id: string };
  revalidatePath("/organizer/events");
  return { ok: true, data: { id: r.id }, message: "Draft event created from the template.", redirect: `/organizer/events/${r.id}` };
}
