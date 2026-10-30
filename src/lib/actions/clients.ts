"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "./shell";

// Canonical client records (domain 52). Leads, proposals, events and invoices link to clients(id); the database resolves
// free-text client names to the same record, so these actions only create/edit/merge the canonical row.
const Client = z.object({
  name: z.string().trim().min(1).max(160), kind: z.enum(["company", "individual"]).default("company"),
  email: z.string().trim().toLowerCase().email().max(200).or(z.literal("")).default(""), phone: z.string().trim().max(40).default(""),
  website: z.string().trim().max(200).default(""), owner_name: z.string().trim().max(120).default(""), source: z.string().trim().max(80).default(""),
  notes: z.string().max(4000).default(""), tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
const Billing = z.object({ billing_name: z.string().trim().max(160), billing_email: z.string().trim().toLowerCase().email().max(200).or(z.literal("")), billing_address: z.string().trim().max(500), vat_number: z.string().trim().max(40) });
const Contact = z.object({ name: z.string().trim().max(120), email: z.string().trim().toLowerCase().email().max(200).or(z.literal("")), phone: z.string().trim().max(40).default(""), role: z.string().trim().max(80).default(""), is_primary: z.boolean().default(false) })
  .refine(c => c.name || c.email);
const bump = (id?: string) => { revalidatePath("/organizer/sales/clients"); if (id) revalidatePath(`/organizer/sales/clients/${id}`); };

export async function saveClient(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await getOrganizer(); const db = untyped(ctx.supabase);
  const p = (id ? Client.partial() : Client).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "email" ? "Enter a valid email." : "Add the client's name." };
  if (id) {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Client not found." };
    const { data, error } = await db.from("clients").update(p.data).eq("id", id).eq("workspace_id", ctx.workspace.id).select("id").maybeSingle();
    if (error?.code === "23505") return { ok: false, error: "Another client already has that name — merge them instead." };
    if (error || !data) return { ok: false, error: "Could not save the client." };
    bump(id); return { ok: true, message: "Client saved.", data: { id } };
  }
  const { data, error } = await db.from("clients").insert({ ...p.data, workspace_id: ctx.workspace.id, created_by: ctx.user.id }).select("id").single();
  if (error?.code === "23505") {
    const { data: existing } = await db.from("clients").select("id").eq("workspace_id", ctx.workspace.id).eq("name_key", p.data.name!.trim().replace(/\s+/g, " ").toLowerCase()).neq("status", "merged").maybeSingle();
    return { ok: false, error: "A client with this name already exists.", redirect: existing ? `/organizer/sales/clients/${existing.id}` : undefined };
  }
  if (error || !data) return { ok: false, error: "Could not create the client." };
  await db.from("audit_events").insert({ actor_id: ctx.user.id, workspace_id: ctx.workspace.id, event: "client.created", metadata: { client_id: data.id, source: "manual" } });
  bump(); return { ok: true, message: `${p.data.name} added.`, data: { id: data.id }, redirect: `/organizer/sales/clients/${data.id}` };
}

/** Billing details are finance data: the database refuses changes from members without owner/manager/finance role. */
export async function saveClientBilling(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await getOrganizer(); const p = Billing.safeParse(input);
  if (!p.success || !z.string().uuid().safeParse(id).success) return { ok: false, error: "Check the billing details." };
  const { error } = await untyped(ctx.supabase).from("clients").update(p.data).eq("id", id).eq("workspace_id", ctx.workspace.id);
  if (error) return { ok: false, error: error.message.includes("finance_permission") ? "Only owners, managers or finance can change billing details." : "Could not save billing details." };
  bump(id); return { ok: true, message: "Billing details saved." };
}

export async function addClientContact(clientId: string, input: unknown): Promise<ActionResult> {
  const ctx = await getOrganizer(); const p = Contact.safeParse(input);
  if (!p.success || !z.string().uuid().safeParse(clientId).success) return { ok: false, error: "Add a contact name or email." };
  const db = untyped(ctx.supabase);
  if (p.data.is_primary) await db.from("client_contacts").update({ is_primary: false }).eq("client_id", clientId);
  const { error } = await db.from("client_contacts").insert({ ...p.data, client_id: clientId, workspace_id: ctx.workspace.id });
  if (error) return { ok: false, error: error.code === "23505" ? "That email is already a contact for this client." : "Could not add the contact." };
  bump(clientId); return { ok: true, message: "Contact added." };
}

export async function removeClientContact(clientId: string, contactId: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  if (!z.string().uuid().safeParse(contactId).success) return { ok: false, error: "Contact not found." };
  const { error } = await untyped(ctx.supabase).from("client_contacts").delete().eq("id", contactId).eq("client_id", clientId).eq("workspace_id", ctx.workspace.id);
  if (error) return { ok: false, error: "Could not remove the contact." };
  bump(clientId); return { ok: true, message: "Contact removed." };
}

export async function setClientStatus(id: string, status: "active" | "archived"): Promise<ActionResult> {
  const ctx = await getOrganizer();
  const { error } = await untyped(ctx.supabase).from("clients").update({ status }).eq("id", id).eq("workspace_id", ctx.workspace.id).neq("status", "merged");
  if (error) return { ok: false, error: "Could not update the client." };
  bump(id); return { ok: true, message: status === "archived" ? "Client archived. Their history is kept." : "Client restored." };
}

/** Merge a duplicate into `keep` (owner/manager): leads, proposals, events, invoices and contracts move across. */
export async function mergeClients(keep: string, merge: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  if (!z.string().uuid().safeParse(keep).success || !z.string().uuid().safeParse(merge).success || keep === merge) return { ok: false, error: "Choose two different clients." };
  const { data, error } = await untyped(ctx.supabase).rpc("merge_clients", { p_keep: keep, p_merge: merge });
  if (error) return { ok: false, error: error.message.includes("not_authorized") ? "Only owners and managers can merge clients." : "Could not merge these clients." };
  const r = data as { leads: number; proposals: number; events: number };
  bump(keep); bump(merge);
  return { ok: true, message: `Merged — moved ${r.leads} lead(s), ${r.proposals} proposal(s) and ${r.events} event(s).`, redirect: `/organizer/sales/clients/${keep}` };
}
