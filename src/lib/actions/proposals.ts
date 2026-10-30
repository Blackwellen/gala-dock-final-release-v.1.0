"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { writeAudit } from "@/lib/audit";
import type { ActionResult } from "./shell";
import { nextNumber } from "@/lib/numbering";
import type { Json } from "@/types/database";

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
    const { error } = await ctx.supabase.from("proposals").update({ title: p.data.title, client_name: p.data.client_name, lead_id: p.data.lead_id || null, content: { ...(d.p.content as object), ...content, wizard_step: stepDone(d.p.content, 1) } }).eq("id", id);
    if (error) return { ok: false, error: "Could not save." };
    return { ok: true, redirect: `/organizer/proposals/new?step=2&id=${id}` };
  }
  const { data: nums } = await ctx.supabase.from("proposals").select("number").eq("workspace_id", ctx.workspace.id);
  const number = nextNumber("PR", (nums ?? []).map(n => n.number));
  const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await ctx.supabase.from("proposals").insert({ workspace_id: ctx.workspace.id, number, title: p.data.title, client_name: p.data.client_name, lead_id: p.data.lead_id || null, status: "draft", valid_until: valid, content: { ...content, wizard_step: 1, line_items: [], options: [], terms: { validity: "30 days", payment: "30% deposit on acceptance, balance 14 days before the event", cancellation: "Deposit non-refundable after signature" } } }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not create the proposal." };
  if (p.data.lead_id) { await ctx.supabase.from("leads").update({ stage: "proposal", probability: 60 }).eq("id", p.data.lead_id).in("stage", ["new", "qualified"]); await ctx.supabase.from("lead_activities").insert({ lead_id: p.data.lead_id, kind: "proposal", title: `Proposal ${number} drafted`, actor_name: ctx.name, actor_id: ctx.user.id }); }
  revalidatePath("/organizer/sales");
  return { ok: true, message: `${number} draft saved.`, redirect: `/organizer/proposals/new?step=2&id=${data.id}` };
}

const Item = z.tuple([z.string().trim().min(1).max(120), z.string().max(240), z.coerce.number().min(0).max(100000), z.coerce.number().min(0).max(1e8)]);
const Opt = z.tuple([z.string().trim().min(1).max(120), z.string().max(240), z.coerce.number().min(0).max(1e8), z.boolean()]);
/** ORG-W02 five-step builder: 1 Client & Event · 2 Services & Options · 3 Pricing & Terms · 4 Presentation · 5 Review & Send.
 *  `content.wizard_step` records the furthest saved step so the wizard resumes there; only step 5 can issue (sendProposal). */
const stepDone = (content: unknown, n: number) => Math.max(Number((content as { wizard_step?: number })?.wizard_step ?? 1) || 1, n);
async function editable(id: string) {
  const d = await draft(id); if (!d) return { error: "Proposal not found." } as const;
  if (d.p.status !== "draft") return { error: "Issued proposals can't be edited. Revise to create a new version." } as const;
  return { d } as const;
}

/** Packages comparison (55.5): mutually exclusive Bronze/Silver/Gold tiers priced on top of the base line items. The client
 *  picks one when accepting; accept_proposal() computes the accepted subtotal/VAT/total from the immutable snapshot. */
const Package = z.object({ key: z.string().regex(/^[a-z0-9_-]{1,24}$/), tier: z.enum(["bronze", "silver", "gold", "custom"]).default("custom"), name: z.string().trim().min(1).max(60), description: z.string().max(300).default(""), price: z.coerce.number().min(0).max(1e8), items: z.array(z.string().trim().min(1).max(120)).max(20).default([]), recommended: z.boolean().default(false) });
export type ProposalPackage = z.infer<typeof Package>;
const Services = z.object({ line_items: z.array(Item).max(60), options: z.array(Opt).max(20), packages: z.array(Package).max(4).optional() })
  .refine(v => v.line_items.length > 0 || (v.packages?.length ?? 0) > 0, { path: ["line_items"] })
  .refine(v => !v.packages || new Set(v.packages.map(x => x.key)).size === v.packages.length, { path: ["packages"] });
export async function saveProposalServices(id: string, input: unknown): Promise<ActionResult> {
  const e = await editable(id); if ("error" in e) return { ok: false, error: e.error }; const { d } = e;
  const p = Services.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "line_items" ? "Add at least one priced line item or package." : p.error.issues[0]?.path[0] === "packages" ? "Each package needs a unique key, a name and a price." : "Check the services and options." };
  const t = await proposalTotals(p.data.line_items as LineItem[], p.data.options as OptionItem[], d.taxRate);
  const { error } = await d.ctx.supabase.from("proposals").update({ ...t, content: { ...(d.p.content as object), line_items: p.data.line_items, options: p.data.options, packages: (p.data.packages ?? (d.p.content as { packages?: ProposalPackage[] }).packages ?? []) as Json, tax_rate: d.taxRate, wizard_step: stepDone(d.p.content, 2) } }).eq("id", id);
  if (error) return { ok: false, error: "Could not save services." };
  return { ok: true, redirect: `/organizer/proposals/new?step=3&id=${id}` };
}

const Terms = z.object({ deposit_pct: z.coerce.number().int().min(0).max(100), terms: z.object({ validity: z.string().max(200), payment: z.string().max(300), cancellation: z.string().max(300), assumptions: z.string().max(500).default(""), exclusions: z.string().max(500).default("") }), valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export async function saveProposalTerms(id: string, input: unknown): Promise<ActionResult> {
  const e = await editable(id); if ("error" in e) return { ok: false, error: e.error }; const { d } = e;
  const p = Terms.safeParse(input); if (!p.success) return { ok: false, error: "Check the deposit, validity date and terms." };
  if (p.data.valid_until < new Date().toISOString().slice(0, 10)) return { ok: false, error: "The validity date must be in the future." };
  const { error } = await d.ctx.supabase.from("proposals").update({ deposit_pct: p.data.deposit_pct, valid_until: p.data.valid_until, content: { ...(d.p.content as object), terms: p.data.terms, wizard_step: stepDone(d.p.content, 3) } }).eq("id", id);
  if (error) return { ok: false, error: "Could not save pricing and terms." };
  return { ok: true, redirect: `/organizer/proposals/new?step=4&id=${id}` };
}

const Presentation = z.object({ template: z.enum(["modern", "classic", "minimal"]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), cover: z.string().max(300).regex(/^\/[A-Za-z0-9/_.-]*$/).or(z.literal("")), headline: z.string().trim().max(160), sections: z.array(z.enum(["overview", "items", "options", "terms", "next_steps"])).max(5) });
export type ProposalPresentation = z.infer<typeof Presentation>;
export async function saveProposalPresentation(id: string, input: unknown): Promise<ActionResult> {
  const e = await editable(id); if ("error" in e) return { ok: false, error: e.error }; const { d } = e;
  const p = Presentation.safeParse(input); if (!p.success) return { ok: false, error: "Check the presentation settings." };
  if (!p.data.sections.includes("items")) return { ok: false, error: "The proposal must show its priced items." };
  const { error } = await d.ctx.supabase.from("proposals").update({ content: { ...(d.p.content as object), presentation: p.data, wizard_step: stepDone(d.p.content, 4) } }).eq("id", id);
  if (error) return { ok: false, error: "Could not save the presentation." };
  return { ok: true, redirect: `/organizer/proposals/new?step=5&id=${id}` };
}

/** Issue: snapshot an immutable version (RPC) and mark sent. Delivery is via the client share link. */
export async function sendProposal(id: string, recipient: string, message: string): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  if (!z.string().email().safeParse(recipient).success) return { ok: false, error: "Enter the recipient's email." };
  const c = d.p.content as { line_items?: unknown[]; packages?: { price: number }[]; wizard_step?: number };
  const hasPackages = (c.packages ?? []).some(x => Number(x.price) > 0);
  if (!hasPackages && (!c.line_items?.length || Number(d.p.total) <= 0)) return { ok: false, error: "Add priced line items before sending." };
  if (c.wizard_step != null && c.wizard_step < 4) return { ok: false, error: "Finish pricing, terms and presentation before sending." };
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
/** Q16: owner/manager revoke of the client link (status-independent), or reissue a fresh link (the old one stops working). */
export async function revokeProposalLink(id: string, reissue = false): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Proposal not found." };
  const ctx = await getOrganizer();
  const { error } = await (ctx.supabase.rpc as unknown as (f: string, a: object) => Promise<{ error: { message: string } | null }>)("proposal_share_revoke", { p_proposal: id, p_reissue: reissue });
  if (error) return { ok: false, error: error.message.includes("not_authorized") ? "Only the owner or a manager can change the client link." : "Could not update the client link." };
  revalidatePath(`/organizer/sales/proposals/${id}`);
  return { ok: true, message: reissue ? "New client link issued. The previous link no longer opens." : "Client link revoked. It now shows “not found”." };
}
export async function duplicateProposal(id: string): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  const { data: nums } = await d.ctx.supabase.from("proposals").select("number").eq("workspace_id", d.ctx.workspace.id);
  const number = nextNumber("PR", (nums ?? []).map(n => n.number));
  const { data, error } = await d.ctx.supabase.from("proposals").insert({ workspace_id: d.ctx.workspace.id, number, title: `${d.p.title} (copy)`.slice(0, 120), client_name: d.p.client_name, lead_id: d.p.lead_id, status: "draft", subtotal: d.p.subtotal, tax: d.p.tax, total: d.p.total, deposit_pct: d.p.deposit_pct, valid_until: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), content: d.p.content }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not duplicate." };
  return { ok: true, message: `${number} created.`, redirect: `/organizer/sales/proposals/${data.id}` };
}
/** Convert an accepted proposal (55.10): one row-locked, idempotent RPC creates the event skeleton (or reuses the lead's event),
 *  links the canonical client and lead, and carries budget lines from the accepted snapshot. A repeat call returns the same event. */
export async function convertProposal(id: string): Promise<ActionResult> {
  const d = await draft(id); if (!d) return { ok: false, error: "Proposal not found." };
  if (!["accepted", "converted"].includes(d.p.status)) return { ok: false, error: "Only accepted proposals can be converted." };
  const { data, error } = await (d.ctx.supabase as unknown as { rpc: (n: string, a: object) => Promise<{ data: { event_id: string; created: boolean; already_converted: boolean } | null; error: { message: string } | null }> }).rpc("convert_proposal_to_event", { p_proposal: id });
  if (error || !data) return { ok: false, error: error?.message.includes("not_accepted") ? "Only accepted proposals can be converted." : "Could not convert the proposal." };
  revalidatePath("/organizer/sales"); revalidatePath(`/organizer/sales/proposals/${id}`);
  return { ok: true, message: data.already_converted ? "Already converted — opening the event." : data.created ? "Converted. Event created with the agreed commercials and budget lines." : "Converted. Linked to the lead's existing event.", redirect: `/organizer/events/${data.event_id}` };
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
