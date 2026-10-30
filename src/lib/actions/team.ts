"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";
import { untyped } from "@/lib/workspace/db";

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
  // Q17: one command records the request (task) and notifies the person in-app when their crew record is linked to a login.
  const { error } = await untyped(ctx.supabase).rpc("request_crew_availability", { p_crew: crew, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_note: note.slice(0, 400) });
  if (error) return { ok: false, error: error.message.includes("not_authorized") ? "Person not found." : "Could not send the request." };
  bump(crew);
  return { ok: true, message: "Availability requested." };
}

/** Q17 decision: notes about a person are not crew/shift writes — any active member may add one (crew_notes, RLS member insert). */
export async function addNote(crew: string, body: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  const t = body.trim(); if (!Id.safeParse(crew).success || t.length < 2 || t.length > 1000) return { ok: false, error: "Write a short note." };
  const { error } = await untyped(ctx.supabase).from("crew_notes").insert({ workspace_id: ctx.workspace.id, crew_id: crew, body: t, author_id: ctx.user.id, author_name: ctx.name });
  if (error) return { ok: false, error: "Could not save the note." };
  bump(crew); return { ok: true, message: "Note added." };
}

const pgErr = (m?: string) => /crew_conflict/.test(m ?? "") ? "Double booking: that person already has an overlapping shift or is unavailable then." : /not_authorized/.test(m ?? "") ? "Only workspace managers can do that." : /crew_unavailable/.test(m ?? "") ? "That person is unavailable or deactivated." : /shift_in_progress/.test(m ?? "") ? "This shift has started — check the person out first." : /already_decided/.test(m ?? "") ? "Already decided." : /crew_already_linked/.test(m ?? "") ? "This person already has a login."
  : /crew_not_in_workspace/.test(m ?? "") ? "That person isn't in this workspace." : /not_cancellable/.test(m ?? "") ? "Only pending or approved leave can be cancelled."
  : /crew_email_required/.test(m ?? "") ? "Add an email address to this person first." : /invalid_range/.test(m ?? "") ? "The end must be after the start." : null;

/** Substitution (58.4): move a shift to someone else; the database re-checks capacity under the person's lock. */
export async function reassignShift(shift: string, toCrew: string, reason: string): Promise<ActionResult> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can reassign shifts." };
  if (!Id.safeParse(shift).success || !Id.safeParse(toCrew).success) return { ok: false, error: "Choose a person." };
  const { error } = await untyped(ctx.supabase).rpc("reassign_shift", { p_shift: shift, p_to_crew: toCrew, p_reason: reason.slice(0, 500) });
  if (error) return { ok: false, error: pgErr(error.message) ?? "Could not reassign the shift." };
  bump(toCrew); return { ok: true, message: "Shift reassigned — awaiting confirmation." };
}

export async function decideLeave(request: string, approve: boolean, note: string): Promise<ActionResult<{ conflicts: number }>> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can decide leave." };
  const { data, error } = await untyped(ctx.supabase).rpc("decide_leave", { p_request: request, p_approve: approve, p_note: note.slice(0, 500) });
  if (error) return { ok: false, error: pgErr(error.message) ?? "Could not record the decision." };
  const n = ((data as { conflicting_shifts?: unknown[] })?.conflicting_shifts ?? []).length;
  bump(); return { ok: true, data: { conflicts: n }, message: approve ? (n ? `Leave approved — reassign ${n} overlapping shift${n > 1 ? "s" : ""}.` : "Leave approved.") : "Leave not approved." };
}

/** Invite a crew member to log in. Owner only (same rule as /api/invites); accepting links crew_members.user_id. No email is sent here. */
export async function inviteCrewLogin(crew: string, role: "member" | "manager" | "finance" = "member"): Promise<ActionResult<{ inviteUrl: string }>> {
  const ctx = await getOrganizer();
  if (!Id.safeParse(crew).success) return { ok: false, error: "Person not found." };
  if (String(ctx.role) !== "owner") return { ok: false, error: "Only the workspace owner can invite logins." };
  const { data: c } = await ctx.supabase.from("crew_members").select("email,user_id").eq("id", crew).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!c) return { ok: false, error: "Person not found." };
  if (c.user_id) return { ok: false, error: "This person already has a login." };
  const email = (c.email ?? "").trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Add an email address to this person first." };
  const { createInviteToken } = await import("@/lib/security");
  const { token, hash } = createInviteToken();
  const { error } = await untyped(ctx.supabase).rpc("crew_invite_login", { p_crew: crew, p_token_hash: hash, p_role: role });
  if (error) return { ok: false, error: error.code === "23505" ? "This person already has a pending invitation." : pgErr(error.message) ?? "Could not create the invitation." };
  const { siteUrl } = await import("@/lib/site-url");
  return { ok: true, message: "Invitation link created — share it with them (email delivery isn't configured here).", data: { inviteUrl: `${siteUrl()}/invite/${token}` } };
}

// ── Q17 team-page panels (leave approval, substitution, login invites): form-shaped wrappers for the shared FormDialog / ActionButton. ──
const Reason = z.object({ note: z.string().trim().max(500).default("") });
const fmtLeave = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** Approve or reject a pending leave request; on approval returns the overlapping shifts that now need cover. */
export async function decideLeaveForm(request: string, approve: boolean, values: Record<string, unknown> = {}): Promise<ActionResult> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can decide leave." };
  const n = Reason.safeParse(values); if (!Id.safeParse(request).success || !n.success) return { ok: false, error: "Leave request not found." };
  if (!approve && n.data.note.length < 3) return { ok: false, error: "Add a short reason for the person." };
  const { data, error } = await untyped(ctx.supabase).rpc("decide_leave", { p_request: request, p_approve: approve, p_note: n.data.note });
  if (error) return { ok: false, error: pgErr(error.message) ?? "Could not record the decision." };
  const clashes = ((data as { conflicting_shifts?: { title: string; starts_at: string }[] })?.conflicting_shifts ?? []);
  bump();
  if (!approve) return { ok: true, message: "Leave not approved — they've been notified if they have a login." };
  return { ok: true, message: clashes.length ? `Leave approved — ${clashes.length} overlapping shift${clashes.length > 1 ? "s" : ""} need cover.` : "Leave approved — no shifts clash.",
    data: clashes.length ? { title: "Shifts that now need cover", lines: [...clashes.map(c => `${c.title || "Shift"} (${fmtLeave(c.starts_at)})`), "Reassign them under Shifts needing cover."] } : undefined };
}

export async function cancelLeaveAction(request: string): Promise<ActionResult> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can cancel leave here." };
  if (!Id.safeParse(request).success) return { ok: false, error: "Leave request not found." };
  const { error } = await untyped(ctx.supabase).rpc("cancel_leave", { p_request: request });
  if (error) return { ok: false, error: pgErr(error.message) ?? "Could not cancel the leave." };
  bump(); return { ok: true, message: "Leave cancelled — any availability block it created was removed." };
}

const LeaveForm = z.object({ crew: Id, kind: z.enum(["annual", "sick", "unpaid", "other"]), from: z.string().min(1), to: z.string().min(1), note: z.string().trim().max(500).default("") });
/** Managers can record leave on someone's behalf (e.g. phoned-in sickness); it starts pending like any request. */
export async function recordLeave(values: Record<string, unknown>): Promise<ActionResult> {
  const { ctx, can } = await ctxManage(); if (!can) return { ok: false, error: "Only workspace managers can record leave for someone." };
  const p = LeaveForm.safeParse(values); if (!p.success) return { ok: false, error: "Choose the person, type and dates." };
  const f = Date.parse(p.data.from), t = Date.parse(p.data.to); if (!(t > f)) return { ok: false, error: "The end must be after the start." };
  const { error } = await untyped(ctx.supabase).rpc("request_leave", { p_ws: ctx.workspace.id, p_from: new Date(f).toISOString(), p_to: new Date(t).toISOString(), p_kind: p.data.kind, p_note: p.data.note, p_crew: p.data.crew });
  if (error) return { ok: false, error: pgErr(error.message) ?? "Could not record the leave." };
  bump(p.data.crew); return { ok: true, message: "Leave recorded as pending — approve or reject it below." };
}

export async function reassignShiftForm(shift: string, values: Record<string, unknown> = {}): Promise<ActionResult> {
  const p = z.object({ to: Id, reason: z.string().trim().max(500).default("") }).safeParse(values);
  if (!p.success) return { ok: false, error: "Choose the replacement person." };
  return reassignShift(shift, p.data.to, p.data.reason);
}

export async function inviteLoginForm(crew: string, values: Record<string, unknown> = {}): Promise<ActionResult> {
  const role = z.enum(["member", "manager", "finance"]).catch("member").parse(values.role);
  const r = await inviteCrewLogin(crew, role);
  if (!r.ok || !r.data) return r;
  bump(crew);
  return { ok: true, message: r.message, data: { copy: r.data.inviteUrl, title: "Invitation link — share it with them" } };
}
