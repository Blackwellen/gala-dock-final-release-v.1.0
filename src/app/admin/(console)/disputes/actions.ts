"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Admin decisions on booking disputes and cancellation reviews. Permission checks, required reasons and audit rows are enforced
// inside the RPCs (has_admin_permission + audit_events); these wrappers only shape input.
type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES = ["evidence_collection", "review", "resolution_proposed", "escalated"];   // DEC-107: no staff "resolved"

export async function adminUpdateDispute(id: string, status: string, note: string, refund: string, credit: string, terms: string): Promise<Result> {
  if (!UUID.test(id) || !STATUSES.includes(status)) return { ok: false, error: "Choose a valid status." };
  if (note.trim().length < 5) return { ok: false, error: "A reason of at least 5 characters is required." };
  const resolution = status === "resolution_proposed" ? Object.fromEntries(Object.entries({ refund: Number(refund) || undefined, credit: Number(credit) || undefined, terms: terms.trim().slice(0, 500) || undefined }).filter(([, v]) => v !== undefined)) : null;
  if (status === "resolution_proposed" && !Object.keys(resolution ?? {}).length) return { ok: false, error: "Describe the proposed resolution." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_dispute_update" as never, { p_dispute: id, p_status: status, p_note: note.trim().slice(0, 2000), p_resolution: resolution } as never);
  if (error) return { ok: false, error: /recommendation_only/.test(error.message) ? "Staff recommend only — the parties accept or settle, or an independent award is entered and checked." : /not_authorized/.test(error.message) ? "You don’t have permission to decide disputes." : /illegal/.test(error.message) ? "That status change isn’t allowed from the current stage." : "Could not update the dispute." };
  revalidatePath("/admin/disputes", "page");
  return { ok: true };
}

export async function adminDecideCancellation(id: string, accept: boolean, note: string, refund: string): Promise<Result> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  if (note.trim().length < 5) return { ok: false, error: "A reason of at least 5 characters is required." };
  const supabase = await createClient();
  // DEC-107: staff never set the amount; approving applies the booking's cancellation policy.
  void refund;
  const { error } = await supabase.rpc("decide_cancellation" as never, { p_cancellation: id, p_accept: accept, p_note: note.trim().slice(0, 1000), p_refund: null } as never);
  if (error) return { ok: false, error: /recommendation_only/.test(error.message) ? "Staff can’t set a refund amount — the booking policy applies." : /not_authorized|42501/.test(error.message) ? "You don’t have permission to decide cancellations." : "Could not record the decision." };
  revalidatePath("/admin/disputes", "page");
  return { ok: true };
}

/** DEC-107 independent award: entered by one member of staff… */
export async function adminEnterAward(id: string, refund: string, provider: string, reference: string, sha: string): Promise<Result> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const amount = Number(refund);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Enter the refund the award orders (0 if none)." };
  if (provider.trim().length < 2 || reference.trim().length < 3) return { ok: false, error: "Enter the provider or court and the case reference." };
  if (sha && !/^[0-9a-f]{64}$/i.test(sha.trim())) return { ok: false, error: "The document fingerprint must be a SHA-256 (64 hex characters)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("adm_dispute_award_enter" as never, { p_dispute: id, p_refund: amount, p_provider: provider.trim().slice(0, 120), p_reference: reference.trim().slice(0, 120), p_document_sha256: sha.trim() || null } as never);
  if (error) return { ok: false, error: /not_authorized|step_up/.test(error.message) ? "You need dispute permissions and two-step verification." : /not_open/.test(error.message) ? "This dispute is already closed." : "Could not record the award." };
  revalidatePath("/admin/disputes", "page");
  return { ok: true };
}

/** …and checked by a different member of staff before any money moves. */
export async function adminCheckAward(awardId: string, confirm: boolean, note: string): Promise<Result> {
  if (!UUID.test(awardId)) return { ok: false, error: "Not found." };
  if (note.trim().length < 5) return { ok: false, error: "A note of at least 5 characters is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("adm_dispute_award_check" as never, { p_award: awardId, p_confirm: confirm, p_note: note.trim().slice(0, 1000) } as never);
  if (error) return { ok: false, error: /second_person/.test(error.message) ? "A different member of staff must check this award." : /not_authorized|step_up/.test(error.message) ? "You need dispute permissions and two-step verification." : "Could not record the check." };
  revalidatePath("/admin/disputes", "page");
  return { ok: true };
}
