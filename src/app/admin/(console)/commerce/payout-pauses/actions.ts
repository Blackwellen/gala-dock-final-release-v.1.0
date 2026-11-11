"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
export const PAUSE_BASES = ["court_order", "regulator_or_law_enforcement", "payment_provider_instruction", "sanctions_screening", "seller_insolvency", "seller_request"] as const;

/**
 * DEC-107 payout pause. Staff with the commerce permission and two-step verification only (adm_payout_pause re-checks both, plus
 * the legal basis and reference, and audits it). Suspicion alone is never a basis: money stays in the seller's own balance.
 */
export async function pausePayouts(workspaceId: string, basis: string, reference: string, note: string): Promise<Result> {
  if (!UUID.test(workspaceId)) return { ok: false, error: "Enter the seller workspace id." };
  if (!(PAUSE_BASES as readonly string[]).includes(basis)) return { ok: false, error: "Choose the legal basis from the Payment Terms." };
  if (reference.trim().length < 3) return { ok: false, error: "Enter the reference (order number, case or claim reference)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("adm_payout_pause" as never, { p_workspace: workspaceId, p_basis: basis, p_reference: reference.trim().slice(0, 200), p_note: note.trim().slice(0, 1000) || null } as never);
  if (error) return { ok: false, error: /already_paused/.test(error.message) ? "Payouts are already paused for this seller." : /not_authorized|step_up/.test(error.message) ? "You need the commerce permission and two-step verification." : /legal_basis|reference/.test(error.message) ? "A legal basis and a reference are required." : "Could not pause payouts." };
  revalidatePath("/admin/commerce/payout-pauses", "page");
  return { ok: true };
}

export async function liftPause(pauseId: string, note: string): Promise<Result> {
  if (!UUID.test(pauseId)) return { ok: false, error: "Not found." };
  if (note.trim().length < 5) return { ok: false, error: "Give a reason of at least 5 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("adm_payout_unpause" as never, { p_pause: pauseId, p_note: note.trim().slice(0, 1000) } as never);
  if (error) return { ok: false, error: /not_authorized|step_up/.test(error.message) ? "You need the commerce permission and two-step verification." : "Could not lift the pause." };
  revalidatePath("/admin/commerce/payout-pauses", "page");
  return { ok: true };
}
