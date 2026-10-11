"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Admin decisions on booking disputes and cancellation reviews. Permission checks, required reasons and audit rows are enforced
// inside the RPCs (has_admin_permission + audit_events); these wrappers only shape input.
type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES = ["evidence_collection", "review", "resolution_proposed", "resolved", "escalated"];

export async function adminUpdateDispute(id: string, status: string, note: string, refund: string, credit: string, terms: string): Promise<Result> {
  if (!UUID.test(id) || !STATUSES.includes(status)) return { ok: false, error: "Choose a valid status." };
  if (note.trim().length < 5) return { ok: false, error: "A reason of at least 5 characters is required." };
  const resolution = status === "resolution_proposed" ? Object.fromEntries(Object.entries({ refund: Number(refund) || undefined, credit: Number(credit) || undefined, terms: terms.trim().slice(0, 500) || undefined }).filter(([, v]) => v !== undefined)) : null;
  if (status === "resolution_proposed" && !Object.keys(resolution ?? {}).length) return { ok: false, error: "Describe the proposed resolution." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_dispute_update" as never, { p_dispute: id, p_status: status, p_note: note.trim().slice(0, 2000), p_resolution: resolution } as never);
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "You don’t have permission to decide disputes." : /illegal/.test(error.message) ? "That status change isn’t allowed from the current stage." : "Could not update the dispute." };
  revalidatePath("/admin/disputes", "page");
  return { ok: true };
}

export async function adminDecideCancellation(id: string, accept: boolean, note: string, refund: string): Promise<Result> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  if (note.trim().length < 5) return { ok: false, error: "A reason of at least 5 characters is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_cancellation" as never, { p_cancellation: id, p_accept: accept, p_note: note.trim().slice(0, 1000), p_refund: accept && refund !== "" ? Number(refund) : null } as never);
  if (error) return { ok: false, error: /invalid_refund/.test(error.message) ? "The refund must be between zero and the amount paid." : /not_authorized|42501/.test(error.message) ? "You don’t have permission to decide cancellations." : "Could not record the decision." };
  revalidatePath("/admin/disputes", "page");
  return { ok: true };
}
