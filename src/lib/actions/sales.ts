"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer, type OrganizerCtx } from "@/lib/data/context";
import { writeAudit } from "@/lib/audit";
import type { ActionResult } from "./shell";
import { nextNumber } from "@/lib/numbering";

const STAGES = ["new", "qualified", "proposal", "negotiating", "won", "lost"] as const;
const PROB: Record<string, number> = { new: 20, qualified: 40, proposal: 60, negotiating: 75, won: 100, lost: 0 };
async function ownLead(id: string) {
  const ok = z.string().uuid().safeParse(id); if (!ok.success) return null;
  const ctx = await getOrganizer();
  const { data: lead } = await ctx.supabase.from("leads").select("*").eq("id", ok.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
  return lead ? { ctx, lead } : null;
}
const log = (ctx: OrganizerCtx, leadId: string, kind: string, title: string, detail = "") => ctx.supabase.from("lead_activities").insert({ lead_id: leadId, kind, title, detail, actor_name: ctx.name, actor_id: ctx.user.id });
const bump = (id?: string) => { revalidatePath("/organizer/sales"); if (id) revalidatePath(`/organizer/sales/leads/${id}`); };

const NewLead = z.object({ name: z.string().trim().min(2).max(120), client_name: z.string().trim().min(1).max(120), contact_name: z.string().max(120).default(""), contact_email: z.string().email().or(z.literal("")).default(""), contact_phone: z.string().max(40).default(""), event_type: z.string().max(40).default("Event"), value: z.coerce.number().min(0).max(1e9).default(0), expected_date: z.string().optional(), location: z.string().max(160).default(""), guests: z.string().max(60).default(""), budget: z.string().max(60).default(""), source: z.string().max(60).default("Manual"), stage: z.enum(STAGES).default("new") });
export async function createLead(input: unknown): Promise<ActionResult> {
  const p = NewLead.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "contact_email" ? "Enter a valid email address." : "Add a lead name and client." };
  const ctx = await getOrganizer();
  const { data: refs } = await ctx.supabase.from("leads").select("reference").eq("workspace_id", ctx.workspace.id);
  const reference = nextNumber("LD", (refs ?? []).map(r => r.reference));
  const { data, error } = await ctx.supabase.from("leads").insert({ ...p.data, expected_date: p.data.expected_date || null, workspace_id: ctx.workspace.id, reference, probability: PROB[p.data.stage], owner_name: ctx.name, tags: [p.data.event_type] }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not create the lead." };
  await log(ctx, data.id, "enquiry", "Lead created", p.data.source);
  bump(); return { ok: true, message: `${reference} created.`, redirect: `/organizer/sales/leads/${data.id}` };
}

export async function moveLead(id: string, stage: string): Promise<ActionResult> {
  const o = await ownLead(id); if (!o) return { ok: false, error: "Lead not found." };
  if (!STAGES.includes(stage as typeof STAGES[number])) return { ok: false, error: "Unknown stage." };
  if (o.lead.stage === stage) return { ok: true };
  if (stage === "won" && !o.lead.event_id) return { ok: false, error: "Choose whether to create a new event or link an existing one — open the lead and use Convert." };
  if (stage === "lost") return { ok: false, error: "Mark a lead lost from its profile so the reason is recorded." };
  if (["won", "lost"].includes(o.lead.stage)) return { ok: false, error: `This lead is already ${o.lead.stage}. Reopen it from its profile first.` };
  const { error } = await o.ctx.supabase.from("leads").update({ stage, probability: PROB[stage] }).eq("id", o.lead.id);
  if (error) return { ok: false, error: "Could not move the lead." };
  await log(o.ctx, o.lead.id, "stage", `Stage changed: ${o.lead.stage} → ${stage}`);
  bump(o.lead.id); return { ok: true, message: `Moved to ${stage}.` };
}

export async function loseLead(id: string, reason: string): Promise<ActionResult> {
  const o = await ownLead(id); if (!o) return { ok: false, error: "Lead not found." };
  if (!reason.trim()) return { ok: false, error: "Add a reason so the team can learn from it." };
  await o.ctx.supabase.from("leads").update({ stage: "lost", probability: 0, details: { ...(o.lead.details as object), lost_reason: reason.slice(0, 300) } }).eq("id", o.lead.id);
  await log(o.ctx, o.lead.id, "stage", "Marked as lost", reason.slice(0, 300));
  bump(o.lead.id); return { ok: true, message: "Lead marked as lost." };
}

export async function scheduleFollowUp(id: string, at: string, note: string): Promise<ActionResult> {
  const o = await ownLead(id); if (!o) return { ok: false, error: "Lead not found." };
  const when = new Date(at); if (Number.isNaN(when.getTime())) return { ok: false, error: "Choose a date and time." };
  const title = note.trim() || "Follow up";
  await o.ctx.supabase.from("leads").update({ next_action: title.slice(0, 120), next_action_at: when.toISOString() }).eq("id", o.lead.id);
  await o.ctx.supabase.from("tasks").insert({ workspace_id: o.ctx.workspace.id, title: `${title} — ${o.lead.client_name}`, due_at: when.toISOString(), assignee_name: o.lead.owner_name, category: "sales", priority: "medium" });
  await log(o.ctx, o.lead.id, "task", "Follow-up scheduled", `${title} · ${when.toLocaleString("en-GB")}`);
  bump(o.lead.id); return { ok: true, message: "Follow-up scheduled and added to tasks." };
}

export async function assignLead(id: string, owner: string): Promise<ActionResult> {
  const o = await ownLead(id); if (!o) return { ok: false, error: "Lead not found." };
  const { data: m } = await o.ctx.supabase.from("crew_members").select("name").eq("workspace_id", o.ctx.workspace.id).eq("member_type", "member").eq("name", owner).maybeSingle();
  if (!m && owner !== o.ctx.name) return { ok: false, error: "Assign leads to workspace members only." };
  await o.ctx.supabase.from("leads").update({ owner_name: owner }).eq("id", o.lead.id);
  await log(o.ctx, o.lead.id, "note", `Assigned to ${owner}`);
  bump(o.lead.id); return { ok: true, message: `Assigned to ${owner}.` };
}

export async function addLeadNote(id: string, kind: "note" | "call" | "email" | "meeting", title: string, detail: string): Promise<ActionResult> {
  const o = await ownLead(id); if (!o) return { ok: false, error: "Lead not found." };
  if (!title.trim()) return { ok: false, error: "Add a short summary." };
  await log(o.ctx, o.lead.id, kind, title.slice(0, 200), detail.slice(0, 2000));
  bump(o.lead.id); return { ok: true, message: "Activity logged." };
}

/** Win/convert: explicitly create ONE canonical event or link an existing one. Never duplicates. */
export async function convertLead(id: string, mode: "create" | "link", eventId?: string): Promise<ActionResult> {
  const o = await ownLead(id); if (!o) return { ok: false, error: "Lead not found." };
  if (o.lead.event_id) return { ok: false, error: "This lead is already linked to an event.", redirect: `/organizer/events/${o.lead.event_id}` };
  let target = eventId ?? null;
  if (mode === "link") {
    const ok = z.string().uuid().safeParse(eventId); if (!ok.success) return { ok: false, error: "Choose an event to link." };
    const { data: ev } = await o.ctx.supabase.from("events").select("id,lead_id").eq("id", ok.data).eq("workspace_id", o.ctx.workspace.id).maybeSingle();
    if (!ev) return { ok: false, error: "Event not found." };
    if (ev.lead_id && ev.lead_id !== o.lead.id) return { ok: false, error: "That event is already linked to another lead." };
    await o.ctx.supabase.from("events").update({ lead_id: o.lead.id }).eq("id", ev.id);
  } else {
    const typeKey = o.lead.event_type.toLowerCase().includes("festival") ? "festival" : o.lead.event_type.toLowerCase().includes("wedding") ? "wedding" : o.lead.event_type.toLowerCase().includes("conference") ? "conference" : o.lead.event_type.toLowerCase().includes("corporate") ? "corporate" : "custom";
    const { data: ev, error } = await o.ctx.supabase.from("events").insert({ owner_id: o.ctx.user.id, workspace_id: o.ctx.workspace.id, management: "professional", name: o.lead.name, event_type: typeKey, status: "draft", visibility: "private", client_name: o.lead.client_name, location: o.lead.location, starts_at: o.lead.expected_date ? `${o.lead.expected_date}T18:00:00Z` : null, lead_id: o.lead.id, revenue_goal: o.lead.value || null, settings: { from_lead: o.lead.reference } }).select("id").single();
    if (error || !ev) return { ok: false, error: "Could not create the event." };
    target = ev.id;
  }
  await o.ctx.supabase.from("leads").update({ stage: "won", probability: 100, event_id: target }).eq("id", o.lead.id);
  await o.ctx.supabase.from("proposals").update({ event_id: target }).eq("lead_id", o.lead.id).eq("status", "accepted");
  await log(o.ctx, o.lead.id, "stage", mode === "create" ? "Won — event created" : "Won — linked to existing event");
  await writeAudit(o.ctx.user.id, o.ctx.workspace.id, "lead.converted", { lead_id: o.lead.id, event_id: target, mode });
  bump(o.lead.id); return { ok: true, message: "Lead won and converted.", redirect: `/organizer/events/${target}` };
}
