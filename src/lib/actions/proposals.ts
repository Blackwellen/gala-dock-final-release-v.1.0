"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { writeAudit } from "@/lib/audit";
import type { ActionResult } from "./shell";
import { nextNumber } from "@/lib/numbering";

export type LineItem = [string, string, number, number]; // name, description, qty, unit price
export type OptionItem = [string, string, number, boolean]; // name, description, price, included
const Uuid = z.string().uuid();

/** Server-authoritative totals. Tax rate comes from workspace settings (default UK VAT 20%), never from the client. */
export async function proposalTotals(items: LineItem[], options: OptionItem[], taxRate: number) {
  const sub = items.reduce((s, [, , q, u]) => s + Math.max(0, q) * Math.max(0, u), 0) + options.filter(o => o[3]).reduce((s, o) => s + Math.max(0, o[2]), 0);
  const subtotal = Math.round(sub * 100) / 100, tax = Math.round(sub * taxRate) / 100;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}
async function draft(id: string) {
  const ok = Uuid.safeParse(id); if (!ok.success) return null;
  const ctx = await getOrganizer();
  const { data: p } = await ctx.supabase.from("proposals").select("*").eq("id", ok.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
  return p ? { ctx, p, taxRate: Number((ctx.workspace.settings as Record<string, unknown>)?.tax_rate ?? 20) } : null;
}

const Step1 = z.object({ title: z.string().trim().min(2).max(120), client_name: z.string().trim().min(1).max(120), contact_name: z.string().max(120).default(""), contact_email: z.string().email().or(z.literal("")).default(""), lead_id: z.string().uuid().optional().or(z.literal("")), event_type: z.string().max(40).default("Event"), date: z.string().optional(), flexible: z.coerce.boolean().default(false), location: z.string().max(160).default(""), venue: z.string().max(160).default(""), attendance: z.string().max(60).default(""), attendance_type: z.string().max(40).default(""), summary: z.string().max(1000).default("") });
export async function saveProposalClient(id: string | null, input: unknown): Promise<ActionResult> {
  const p = Step1.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "contact_email" ? "Enter a valid contact email." : "Add a proposal name and client." };
  const ctx = await getOrganizer();
  if (p.data.lead_id) { const { data: lead } = await ctx.supabase.from("leads").select("id").eq("id", p.data.lead_id).eq("workspace_id", ctx.workspace.id).maybeSingle(); if (!lead) return { ok: false, error: "Linked lead not found." }; }
  const content = { client: { contact_name: p.data.contact_name, contact_email: p.data.contact_email }, event_type: p.data.event_type, date: p.data.date ?? "", flexible: p.data.flexible, venue: p.data.venue || p.data.location, location: p.data.location, attendance: p.data.attendance, attendance_type: p.data.attendance_type, summary: p.data.summary };
  if (id) {
    const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
    if (d.p.status !== "draft") return { ok: false, error: "This proposal has been issued. Revise it to make changes." };
    const { error } = await ctx.supabase.from("proposals").update({ title: p.data.title, client_name: p.data.client_name, lead_id: p.data.lead_id || null, content: { ...(d.p.content as object), ...content } }).eq("id", id);
    if (error) return { ok: false, error: "Could not save." };
    return { ok: true, redirect: `/organizer/proposals/new?step=2&id=${id}` };
  }
  const { data: nums } = await ctx.supabase.from("proposals").select("number").eq("workspace_id", ctx.workspace.id);
  const number = nextNumber("PR", (nums ?? []).map(n => n.number));
  const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await ctx.supabase.from("proposals").insert({ workspace_id: ctx.workspace.id, number, title: p.data.title, client_name: p.data.client_name, lead_id: p.data.lead_id || null, status: "draft", valid_until: valid, content: { ...content, line_items: [], options: [], terms: { validity: "30 days", payment: "30% deposit on acceptance, balance 14 days before the event", cancellation: "Deposit non-refundable after signature" } } }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not create the proposal." };
  if (p.data.lead_id) { await ctx.supabase.from("leads").update({ stage: "proposal", probability: 60 }).eq("id", p.data.lead_id).in("stage", ["new", "qualified"]); await ctx.supabase.from("lead_activities").insert({ lead_id: p.data.lead_id, kind: "proposal", title: `Proposal ${number} drafted`, actor_name: ctx.name, actor_id: ctx.user.id }); }
  revalidatePath("/organizer/sales");
  return { ok: true, message: `${number} draft saved.`, redirect: `/organizer/proposals/new?step=2&id=${data.id}` };
}

const Item = z.tuple([z.string().trim().min(1).max(120), z.string().max(240), z.coerce.number().min(0).max(100000), z.coerce.number().min(0).max(1e8)]);
const Opt = z.tuple([z.string().trim().min(1).max(120), z.string().max(240), z.coerce.number().min(0).max(1e8), z.boolean()]);
const Step2 = z.object({ line_items: z.array(Item).min(1).max(60), options: z.array(Opt).max(20), deposit_pct: z.coerce.number().int().min(0).max(100), terms: z.object({ validity: z.string().max(200), payment: z.string().max(300), cancellation: z.string().max(300), assumptions: z.string().max(500).default(""), exclusions: z.string().max(500).default("") }), valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export async function saveProposalPricing(id: string, input: unknown): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  if (d.p.status !== "draft") return { ok: false, error: "Issued proposals can't be edited. Revise to create a new version." };
  const p = Step2.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "line_items" ? "Add at least one priced line item." : "Check the pricing fields." };
  if (p.data.valid_until < new Date().toISOString().slice(0, 10)) return { ok: false, error: "The validity date must be in the future." };
  const t = await proposalTotals(p.data.line_items as LineItem[], p.data.options as OptionItem[], d.taxRate);
  const { error } = await d.ctx.supabase.from("proposals").update({ ...t, deposit_pct: p.data.deposit_pct, valid_until: p.data.valid_until, content: { ...(d.p.content as object), line_items: p.data.line_items, options: p.data.options, terms: p.data.terms, tax_rate: d.taxRate } }).eq("id", id);
  if (error) return { ok: false, error: "Could not save pricing." };
  return { ok: true, redirect: `/organizer/proposals/new?step=3&id=${id}` };
}

/** Issue: snapshot an immutable version (RPC) and mark sent. Delivery is via the client share link. */
export async function sendProposal(id: string, recipient: string, message: string): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  if (!z.string().email().safeParse(recipient).success) return { ok: false, error: "Enter the recipient's email." };
  const c = d.p.content as { line_items?: unknown[] };
  if (!c.line_items?.length || Number(d.p.total) <= 0) return { ok: false, error: "Add priced line items before sending." };
  await d.ctx.supabase.from("proposals").update({ content: { ...(d.p.content as object), sent_to: recipient, message: message.slice(0, 2000) } }).eq("id", id);
  const { data: v, error } = await d.ctx.supabase.rpc("issue_proposal", { p_proposal: id });
  if (error) return { ok: false, error: error.message.includes("already_issued") ? "Already issued — revise it to send a new version." : "Could not issue the proposal." };
  if (d.p.lead_id) await d.ctx.supabase.from("lead_activities").insert({ lead_id: d.p.lead_id, kind: "proposal", title: `Proposal ${d.p.number} v${v} sent`, detail: `To ${recipient}`, actor_name: d.ctx.name, actor_id: d.ctx.user.id });
  await writeAudit(d.ctx.user.id, d.ctx.workspace.id, "proposal.issued", { proposal_id: id, version: v, recipient });
  revalidatePath("/organizer/sales"); revalidatePath(`/organizer/sales/proposals/${id}`);
  return { ok: true, message: `v${v} issued. Share the client link to collect acceptance — email delivery isn't configured on this environment.`, redirect: `/organizer/sales/proposals/${id}` };
}
export async function reviseProposal(id: string): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  const { error } = await d.ctx.supabase.rpc("revise_proposal", { p_proposal: id });
  if (error) return { ok: false, error: error.message.includes("accepted_locked") ? "Accepted proposals are locked. Create a change order instead." : "Could not revise." };
  revalidatePath(`/organizer/sales/proposals/${id}`); return { ok: true, message: "Now editing a new draft version. The issued version is preserved.", redirect: `/organizer/proposals/new?step=2&id=${id}` };
}
export async function withdrawProposal(id: string): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  const { error } = await d.ctx.supabase.rpc("withdraw_proposal", { p_proposal: id });
  if (error) return { ok: false, error: "Only sent or viewed proposals can be withdrawn." };
  revalidatePath(`/organizer/sales/proposals/${id}`); return { ok: true, message: "Proposal withdrawn. The client link no longer accepts." };
}
export async function duplicateProposal(id: string): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  const { data: nums } = await d.ctx.supabase.from("proposals").select("number").eq("workspace_id", d.ctx.workspace.id);
  const number = nextNumber("PR", (nums ?? []).map(n => n.number));
  const { data, error } = await d.ctx.supabase.from("proposals").insert({ workspace_id: d.ctx.workspace.id, number, title: `${d.p.title} (copy)`.slice(0, 120), client_name: d.p.client_name, lead_id: d.p.lead_id, status: "draft", subtotal: d.p.subtotal, tax: d.p.tax, total: d.p.total, deposit_pct: d.p.deposit_pct, valid_until: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), content: d.p.content }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not duplicate." };
  return { ok: true, message: `${number} created.`, redirect: `/organizer/sales/proposals/${data.id}` };
}
/** Convert an accepted proposal: creates one event carrying the agreed commercials (or uses the lead's event). */
export async function convertProposal(id: string): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  if (d.p.status !== "accepted") return { ok: false, error: "Only accepted proposals can be converted." };
  const c = d.p.content as { event_type?: string; date?: string; venue?: string; location?: string; attendance?: string; summary?: string; line_items?: LineItem[] };
  let eventId = d.p.event_id;
  if (!eventId && d.p.lead_id) { const { data: lead } = await d.ctx.supabase.from("leads").select("event_id").eq("id", d.p.lead_id).single(); eventId = lead?.event_id ?? null; }
  if (!eventId) {
    const lines = Object.fromEntries((c.line_items ?? []).map(([n, , q, u]) => [n, q * u]));
    const type = (c.event_type ?? "").toLowerCase().includes("festival") ? "festival" : (c.event_type ?? "").toLowerCase().includes("wedding") ? "wedding" : (c.event_type ?? "").toLowerCase().includes("corporate") ? "corporate" : "custom";
    const { data: ev, error } = await d.ctx.supabase.from("events").insert({ owner_id: d.ctx.user.id, workspace_id: d.ctx.workspace.id, management: "professional", name: d.p.title, event_type: type, status: "planning", visibility: "private", client_name: d.p.client_name, venue_name: c.venue ?? "", location: c.location ?? "", starts_at: c.date ? new Date(c.date).toISOString() : null, description: c.summary ?? "", revenue_goal: Number(d.p.total), budget_total: Number(d.p.subtotal), lead_id: d.p.lead_id, settings: { from_proposal: d.p.number, budget_lines: lines, client_contract_value: Number(d.p.total) } }).select("id").single();
    if (error || !ev) return { ok: false, error: "Could not create the event." };
    eventId = ev.id;
    if (d.p.lead_id) await d.ctx.supabase.from("leads").update({ stage: "won", probability: 100, event_id: eventId }).eq("id", d.p.lead_id);
  }
  const { error } = await d.ctx.supabase.rpc("mark_proposal_converted", { p_proposal: id, p_event: eventId! });
  if (error) return { ok: false, error: "Could not link the event." };
  await writeAudit(d.ctx.user.id, d.ctx.workspace.id, "proposal.converted", { proposal_id: id, event_id: eventId });
  revalidatePath("/organizer/sales"); return { ok: true, message: "Converted. Agreed commercials carried into the event budget.", redirect: `/organizer/events/${eventId}` };
}
export async function toggleProposalOption(id: string, index: number, on: boolean): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  if (d.p.status !== "draft") return { ok: false, error: "Issued proposals are locked. Revise to change options." };
  const c = d.p.content as { line_items?: LineItem[]; options?: OptionItem[] }; const options = [...(c.options ?? [])];
  if (!options[index]) return { ok: false, error: "Option not found." };
  options[index] = [options[index]![0], options[index]![1], options[index]![2], on];
  const t = await proposalTotals(c.line_items ?? [], options, d.taxRate);
  await d.ctx.supabase.from("proposals").update({ ...t, content: { ...(d.p.content as object), options } }).eq("id", id);
  revalidatePath(`/organizer/sales/proposals/${id}`); return { ok: true };
}
