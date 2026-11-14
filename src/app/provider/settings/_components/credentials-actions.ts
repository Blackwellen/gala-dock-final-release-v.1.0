"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$/i;

/** Submits an uploaded file as a credential for review. RLS + has_permission enforce who may submit. */
export async function submitCredential(input: { workspaceId: string; credentialKey: string; filePath: string; fileName: string; expiresOn?: string; reference?: string; issuer?: string; cover?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  if (!PATH.test(input.filePath) || !input.filePath.startsWith(`${user.id}/`)) return { error: "Upload the document again." };
  if (!/^[a-z_]+$/.test(input.credentialKey)) return { error: "Unknown credential type." };
  // Q59: compare calendar days in London (the server runs on UTC).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (input.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) || input.expiresOn < today)) return { error: "Enter a future expiry date." };
  const cover = input.cover ? Number(input.cover) : null;
  if (cover !== null && (!Number.isSafeInteger(cover) || cover <= 0 || cover > 1_000_000_000)) return { error: "Enter the cover amount in whole pounds." };
  const { error } = await supabase.from("provider_documents" as never).insert({
    workspace_id: input.workspaceId, credential_key: input.credentialKey, file_path: input.filePath, file_name: input.fileName.slice(0, 120),
    expires_on: input.expiresOn || null, reference: input.reference?.slice(0, 80) || null, issuing_organisation: input.issuer?.slice(0, 120) || null, uploaded_by: user.id,
    ...(cover !== null ? { cover_amount_minor: cover * 100, cover_currency: "GBP" } : {}),
  } as never);
  if (error) return { error: error.message.includes("upload_not_verified") ? "Upload the document again — it could not be verified." : error.code === "42501" ? "You don’t have permission to manage credentials." : "Could not submit the document. Please try again." };
  revalidatePath("/provider/settings");
  return { ok: true };
}

/** Appeals a Trust & Safety action once, before its deadline (trust_appeal checks the caller is the affected party). */
export async function appealEnforcement(input: { actionId: string; statement: string }) {
  const supabase = await createClient();
  const statement = input.statement.trim();
  if (statement.length < 20) return { error: "Explain your appeal in at least 20 characters." };
  const { error } = await supabase.rpc("trust_appeal" as never, { p_action: input.actionId, p_statement: statement.slice(0, 2000) } as never);
  if (error) return { error: /already_appealed/.test(error.message) ? "This action has already been appealed." : /appeal_window_closed/.test(error.message) ? "The appeal window has closed." : "Could not send the appeal. Please try again." };
  revalidatePath("/provider/settings");
  return { ok: true };
}

/** Q59: manual business verification (trust_submit_verification) — the only route to "verified" where Stripe Connect isn't available
 *  (enquiry-only seller countries), and the documented fallback everywhere else. Reviewed by Gala Dock Trust & Safety. */
export async function submitBusinessVerification(input: { workspaceId: string; legalName: string; tradingName?: string; companyNumber?: string }) {
  const supabase = await createClient();
  const legal = input.legalName.trim();
  if (legal.length < 2) return { error: "Enter the business’s legal name." };
  const company = (input.companyNumber ?? "").trim();
  if (company && !/^[A-Za-z0-9 -]{2,20}$/.test(company)) return { error: "Enter the company registration number as shown on the register." };
  const { error } = await supabase.rpc("trust_submit_verification" as never, { p_workspace: input.workspaceId, p_kind: "business",
    p_details: { legal_name: legal.slice(0, 200), trading_name: (input.tradingName ?? "").trim().slice(0, 200), company_number: company }, p_document: null } as never);
  if (error) return { error: /already_under_review/.test(error.message) ? "Your details are already with Gala Dock for review." : /suspended_contact_support/.test(error.message) ? "Verification is suspended — contact support." : /not_authorized/.test(error.message) ? "Only the workspace owner or an admin can submit verification." : "Could not submit your details. Please try again." };
  revalidatePath("/provider/settings");
  return { ok: true };
}
