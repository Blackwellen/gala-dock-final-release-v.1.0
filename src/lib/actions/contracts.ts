"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security";
import { hashIp, signatureHealth } from "@/lib/contracts/signature-provider";
import type { ActionResult } from "./shell";

// Contracts (domain 56). Every state change is a database command (contract_* RPCs): status machine, immutable versions,
// append-only signatures and audit live in Postgres; these actions validate input and translate errors.
const Uuid = z.string().uuid();
const Party = z.object({ role: z.enum(["organizer", "client", "other"]), name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(200).or(z.literal("")).default(""), organisation: z.string().trim().max(160).default(""), signs: z.boolean().default(true), signing_order: z.number().int().min(1).max(10).default(1) });
const Create = z.object({ title: z.string().trim().min(2).max(160), client_id: Uuid.optional().or(z.literal("")), proposal_id: Uuid.optional().or(z.literal("")), event_id: Uuid.optional().or(z.literal("")), template_id: Uuid.optional().or(z.literal("")),
  body: z.string().max(100000).default(""), value: z.coerce.number().min(0).max(1e9).default(0), expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")), parties: z.array(Party).max(10).default([]) });
const ERR: [string, string][] = [
  ["approval_required", "This contract needs internal approval of the current version before it can be sent."], ["client_signer_required", "Add a client signer with an email address."],
  ["client_email_required", "Client signers need an email address."], ["empty_contract", "Add the contract text first."], ["contract_not_draft", "Only drafts can be edited. Revise the contract to make changes."],
  ["contract_signed_immutable", "Signed contracts can't be changed. Renew it to create a new contract."], ["cannot_self_approve", "Someone else must approve your request (or the workspace owner)."],
  ["not_authorized", "You don't have permission for this contract action."], ["contract_not_open", "This contract isn't open for signature."], ["reason_required", "Add a reason."],
  ["only_signed_contracts_renew", "Only signed contracts can be renewed."], ["contract_not_revisable", "Only sent, declined or expired contracts can be revised."], ["contract_not_voidable", "Signed or void contracts can't be voided."],
  ["typed_name_required", "Type your full name to sign."], ["not_your_party", "You can only sign for the organiser party."], ["already_decided", "This approval has already been decided."],
];
const msg = (e: { message: string } | null, fallback: string) => ERR.find(([k]) => e?.message.includes(k))?.[1] ?? fallback;
const bump = (id?: string) => { revalidatePath("/organizer/sales/contracts"); if (id) revalidatePath(`/organizer/sales/contracts/${id}`); };
const opt = (v?: string) => (v ? v : undefined);

export async function createContract(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = Create.safeParse(input); if (!p.success) return { ok: false, error: "Add a contract title and check the parties." };
  const ctx = await getOrganizer();
  const { data, error } = await untyped(ctx.supabase).rpc("contract_create", { p_ws: ctx.workspace.id, p: { ...p.data, client_id: opt(p.data.client_id), proposal_id: opt(p.data.proposal_id), event_id: opt(p.data.event_id), template_id: opt(p.data.template_id), expires_at: opt(p.data.expires_at) } });
  if (error || !data) return { ok: false, error: msg(error, "Could not create the contract.") };
  bump(); return { ok: true, message: "Contract draft created.", data: { id: data as string }, redirect: `/organizer/sales/contracts/${data}` };
}
export async function saveContractText(id: string, body: string, variables: Record<string, string> = {}): Promise<ActionResult> {
  if (!Uuid.safeParse(id).success || body.length > 100000) return { ok: false, error: "Contract not found." };
  const vars = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,40}$/), z.string().max(2000)).safeParse(variables); if (!vars.success) return { ok: false, error: "Variables must be simple names." };
  const ctx = await getOrganizer();
  const { data, error } = await untyped(ctx.supabase).rpc("contract_save_version", { p_contract: id, p_body: body, p_variables: vars.data });
  if (error) return { ok: false, error: msg(error, "Could not save the contract text.") };
  bump(id); return { ok: true, message: `Saved as version ${data}.` };
}
export async function setContractParties(id: string, parties: unknown): Promise<ActionResult> {
  const p = z.array(Party).max(10).safeParse(parties); if (!p.success || !Uuid.safeParse(id).success) return { ok: false, error: "Check the parties (name, role and client email)." };
  const ctx = await getOrganizer();
  const { error } = await untyped(ctx.supabase).rpc("contract_set_parties", { p_contract: id, p_parties: p.data });
  if (error) return { ok: false, error: msg(error, "Could not save the parties.") };
  bump(id); return { ok: true, message: "Parties saved." };
}
export async function sendContract(id: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  const { error } = await untyped(ctx.supabase).rpc("contract_send", { p_contract: id });
  if (error) return { ok: false, error: msg(error, "Could not send the contract.") };
  const h = signatureHealth();
  bump(id); return { ok: true, message: h.state === "ok" ? "Sent for signature." : "Sent. Copy the signing link for the client — no e-signature provider or email delivery is configured on this environment." };
}
export async function requestContractApproval(id: string, reason: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  const { error } = await untyped(ctx.supabase).rpc("contract_request_approval", { p_contract: id, p_reason: reason.slice(0, 500) });
  if (error) return { ok: false, error: error.code === "23505" ? "An approval request is already pending." : msg(error, "Could not request approval.") };
  bump(id); return { ok: true, message: "Approval requested." };
}
export async function decideContractApproval(contractId: string, approvalId: string, approve: boolean, note: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  const { error } = await untyped(ctx.supabase).rpc("contract_decide_approval", { p_approval: approvalId, p_approve: approve, p_note: note.slice(0, 500) });
  if (error) return { ok: false, error: msg(error, "Could not record the decision.") };
  bump(contractId); return { ok: true, message: approve ? "Approved." : "Rejected." };
}
export async function signContractInternal(id: string, partyId: string, typedName: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  const { data, error } = await untyped(ctx.supabase).rpc("contract_sign_internal", { p_contract: id, p_party: partyId, p_typed_name: typedName.trim().slice(0, 120) });
  if (error) return { ok: false, error: msg(error, "Could not sign.") };
  bump(id); return { ok: true, message: data === "signed" ? "Signed — all parties have signed." : "Signed. Waiting for the other parties." };
}
export async function reviseContract(id: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  const { error } = await untyped(ctx.supabase).rpc("contract_revise", { p_contract: id });
  if (error) return { ok: false, error: msg(error, "Could not revise.") };
  bump(id); return { ok: true, message: "Back to draft. The old signing link no longer works." };
}
export async function voidContract(id: string, reason: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  const { error } = await untyped(ctx.supabase).rpc("contract_void", { p_contract: id, p_reason: reason.trim().slice(0, 500) });
  if (error) return { ok: false, error: msg(error, "Could not void.") };
  bump(id); return { ok: true, message: "Contract voided." };
}
/** Q16: owner/manager revoke of a sent contract's signing link. Revise and send again to issue a new link. */
export async function revokeContractLink(id: string): Promise<ActionResult> {
  if (!Uuid.safeParse(id).success) return { ok: false, error: "Contract not found." };
  const ctx = await getOrganizer();
  const { error } = await untyped(ctx.supabase).rpc("contract_share_revoke", { p_contract: id });
  if (error) return { ok: false, error: msg(error, "Could not revoke the link.") };
  bump(id); return { ok: true, message: "Signing link revoked. Revise and send again to issue a new link." };
}
export async function renewContract(id: string, termEnds?: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  const { data, error } = await untyped(ctx.supabase).rpc("contract_renew", { p_contract: id, p_term_ends: termEnds && /^\d{4}-\d{2}-\d{2}$/.test(termEnds) ? termEnds : null });
  if (error || !data) return { ok: false, error: msg(error, "Could not renew.") };
  bump(); return { ok: true, message: "Renewal draft created.", redirect: `/organizer/sales/contracts/${data}` };
}

/** Client signing link (/contract/[token]). Service-only database functions, called from the server with rate limiting. */
export async function signContractByToken(token: string, name: string, email: string, version: number, accept: boolean, reason = ""): Promise<ActionResult<{ result: string }>> {
  if (!/^[0-9a-f]{48}$/.test(token)) return { ok: false, error: "Invalid link." };
  const h = await headers(); const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`contract-sign:${hashIp(ip)}`, 10, 3600))) return { ok: false, error: "Too many attempts. Try again later." };
  const { data, error } = await untyped(createAdminClient() as never).rpc("contract_sign_by_token", { p_token: token, p_name: name.trim().slice(0, 120), p_email: email.trim().toLowerCase().slice(0, 200), p_version: version, p_accept: accept, p_ip_hash: hashIp(ip), p_user_agent: (h.get("user-agent") ?? "").slice(0, 300), p_reason: reason.slice(0, 500) });
  if (error) return { ok: false, error: error.message.includes("not_a_signer") ? "That email isn't a signer on this contract." : error.message.includes("version_changed") ? "This contract was updated. Refresh to read the latest version." : error.message.includes("invalid_input") ? "Enter your full name and email." : "This contract can't be signed." };
  return { ok: true, data: { result: String(data) } };
}
