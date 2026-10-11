"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";

const Id = z.string().uuid();
const MANAGE = ["owner", "admin", "manager"];
async function ctxManage() {
  const ctx = await getOrganizer();
  return { ctx, can: MANAGE.includes(String(ctx.role)) };
}
const bump = (id?: string) => { revalidatePath("/organizer/team"); if (id) revalidatePath(`/organizer/team/${id}`); };
const audit = async (ctx: Awaited<ReturnType<typeof getOrganizer>>, event: string, metadata: Record<string, unknown>) => { await ctx.supabase.from("audit_events").insert({ actor_id: ctx.user.id, workspace_id: ctx.workspace.id, event, metadata: metadata as Json }); };

const Person = z.object({ name: z.string().trim().min(2).max(80), role: z.string().trim().max(60), member_type: z.enum(["member", "crew"]), email: z.string().trim().email().max(200).or(z.literal("")), phone: z.string().trim().max(30), location: z.string().trim().max(80), day_rate: z.number().min(0).max(100000).nullable(), skills: z.array(z.string().trim().min(1).max(40)).max(20), bio: z.string().max(600) });

export async function savePerson(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can edit the team." };
  const p = (id ? Person.partial() : Person).safeParse(input) as ReturnType<typeof Person.safeParse>; if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "email" ? "Enter a valid email." : "Check the name and details." };
  if (id) {
    if (!Id.safeParse(id).success) return { ok: false, error: "Person not found." };
    const { error } = await ctx.supabase.from("crew_members").update(p.data).eq("id", id).eq("workspace_id", ctx.workspace.id);
    if (error) return { ok: false, error: "Could not save." };
    await audit(ctx, "team.updated", { crew_id: id }); bump(id); return { ok: true, message: "Profile saved.", data: { id } };
  }
  const { data, error } = await ctx.supabase.from("crew_members").insert({ ...p.data, workspace_id: ctx.workspace.id, status: "available" }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not add this person." };
  await audit(ctx, "team.invited", { crew_id: data.id, email: p.data.email });
  if (p.data.email) await ctx.supabase.from("tasks").insert({ workspace_id: ctx.workspace.id, owner_id: ctx.user.id, title: `Invitation sent — ${p.data.name}`, detail: `Invite ${p.data.email} to ${ctx.workspace.name}`, category: "team_invite", assignee_name: p.data.name, status: "todo", priority: "low" });
  bump(); return { ok: true, message: p.data.email ? `${p.data.name} added — invitation recorded for ${p.data.email}.` : `${p.data.name} added to your team.`, data: { id: data.id }, redirect: `/organizer/team/${data.id}` };
}

export async function setPersonStatus(id: string, status: "active" | "available" | "unavailable" | "deactivated"): Promise<ActionResult> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can change status." };
  if (!Id.safeParse(id).success) return { ok: false, error: "Person not found." };
  if (status === "deactivated") {
    const { count } = await ctx.supabase.from("shifts").select("id", { count: "exact", head: true }).eq("crew_id", id).in("status", ["pending", "confirmed"]).gt("starts_at", new Date().toISOString());
    if (count) return { ok: false, error: `Reassign ${count} upcoming shift${count > 1 ? "s" : ""} before deactivating.` };
  }
  const { error } = await ctx.supabase.from("crew_members").update({ status }).eq("id", id).eq("workspace_id", ctx.workspace.id);
  if (error) return { ok: false, error: "Could not update status." };
  await audit(ctx, `team.${status}`, { crew_id: id }); bump(id); return { ok: true, message: status === "deactivated" ? "Access revoked. History is kept." : "Status updated." };
}

const Assign = z.object({ crew: z.string().uuid(), event: z.string().uuid(), role: z.string().trim().min(2).max(60), starts_at: z.string(), ends_at: z.string() });
/** Assign a person to an event shift; refuses overlapping confirmed/pending shifts and unavailability blocks. */
export async function assignShift(input: unknown, force = false): Promise<ActionResult> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can assign shifts." };
  const p = Assign.safeParse(input); if (!p.success) return { ok: false, error: "Choose an event, role and time." };
  const s = Date.parse(p.data.starts_at), e = Date.parse(p.data.ends_at); if (!(e > s)) return { ok: false, error: "The shift must end after it starts." };
  const { data: ev } = await ctx.supabase.from("events").select("id,name,location,venue_name").eq("id", p.data.event).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!ev) return { ok: false, error: "Event not found." };
  const [{ data: clash }, { data: blocks }] = await Promise.all([
    ctx.supabase.from("shifts").select("id,title").eq("crew_id", p.data.crew).in("status", ["pending", "confirmed"]).lt("starts_at", new Date(e).toISOString()).gt("ends_at", new Date(s).toISOString()),
    ctx.supabase.from("availability_blocks").select("id,kind").eq("crew_id", p.data.crew).lt("starts_at", new Date(e).toISOString()).gt("ends_at", new Date(s).toISOString()),
  ]);
  if (!force && (clash?.length || blocks?.length)) return { ok: false, error: clash?.length ? `Double booking: already on "${clash[0]!.title}" at that time.` : "This person marked themselves unavailable then." };
  const { error } = await ctx.supabase.from("shifts").insert({ workspace_id: ctx.workspace.id, crew_id: p.data.crew, event_id: ev.id, title: ev.name, role: p.data.role, starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString(), location: ev.venue_name || ev.location, status: "pending", headcount: 1 });
  if (error) return { ok: false, error: "Could not create the shift." };
  await ctx.supabase.from("crew_members").update({ status: "active" }).eq("id", p.data.crew).eq("status", "available");
  await audit(ctx, "team.assigned", { crew_id: p.data.crew, event_id: ev.id, role: p.data.role }); bump(p.data.crew);
  return { ok: true, message: `Assigned to ${ev.name} — awaiting confirmation.` };
}

export async function setShiftStatus(id: string, status: "pending" | "confirmed" | "draft" | "unavailable"): Promise<ActionResult> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can update shifts." };
  if (!Id.safeParse(id).success) return { ok: false, error: "Shift not found." };
  const { data, error } = await ctx.supabase.from("shifts").update({ status }).eq("id", id).eq("workspace_id", ctx.workspace.id).select("crew_id").maybeSingle();
  if (error || !data) return { ok: false, error: "Could not update the shift." };
  bump(data.crew_id ?? undefined); return { ok: true, message: `Shift ${status}.` };
}

export async function requestAvailability(crew: string, from: string, to: string, note: string): Promise<ActionResult> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can request availability." };
  if (!Id.safeParse(crew).success || !(Date.parse(to) > Date.parse(from))) return { ok: false, error: "Choose a valid date range." };
  const { data: c } = await ctx.supabase.from("crew_members").select("name").eq("id", crew).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!c) return { ok: false, error: "Person not found." };
  await ctx.supabase.from("tasks").insert({ workspace_id: ctx.workspace.id, owner_id: ctx.user.id, title: `Availability request — ${c.name}`, detail: `${note.slice(0, 400)}\ncrew:${crew}\nfrom:${from}\nto:${to}`, category: "availability_request", assignee_name: c.name, due_at: new Date(Date.parse(from) - 2 * 864e5).toISOString(), priority: "medium", status: "todo" });
  await audit(ctx, "team.availability_requested", { crew_id: crew }); bump(crew);
  return { ok: true, message: `Availability requested from ${c.name}.` };
}

export async function addNote(crew: string, body: string): Promise<ActionResult> {
  const { ctx } = await ctxManage();
  const t = body.trim(); if (!Id.safeParse(crew).success || t.length < 2 || t.length > 1000) return { ok: false, error: "Write a short note." };
  const { data: c } = await ctx.supabase.from("crew_members").select("details").eq("id", crew).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!c) return { ok: false, error: "Person not found." };
  const d = (c.details ?? {}) as Record<string, unknown>; const notes = (d.notes as unknown[] | undefined) ?? [];
  const { error } = await ctx.supabase.from("crew_members").update({ details: { ...d, notes: [{ by: ctx.name, at: new Date().toISOString(), body: t }, ...notes].slice(0, 50) } as Json }).eq("id", crew);
  if (error) return { ok: false, error: "Could not save the note." };
  bump(crew); return { ok: true, message: "Note added." };
}
