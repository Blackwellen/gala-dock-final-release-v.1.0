"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "./shell";

// Staff self-service (Q17 / W06): a login linked to a crew record answers, checks in to and requests leave for ITS OWN shifts.
// The database commands (member_respond_shift, shift_check, request_leave) verify crew_members.user_id = auth.uid().
const Id = z.string().uuid();
const bump = () => { revalidatePath("/organizer/team/my-shifts"); revalidatePath("/provider/team/my-shifts"); };
const err = (m?: string) => /not_authorized/.test(m ?? "") ? "This isn't one of your shifts." : /too_early/.test(m ?? "") ? "Check-in opens two hours before the shift starts." : /shift_not_pending/.test(m ?? "") ? "You've already answered this shift." : /not_checked_in/.test(m ?? "") ? "Check in first." : /shift_not_live/.test(m ?? "") ? "This shift isn't active." : null;

export async function respondShift(shift: string, accept: boolean, note = ""): Promise<ActionResult> {
  if (!Id.safeParse(shift).success) return { ok: false, error: "Shift not found." };
  const sb = untyped(await createClient());
  const { error } = await sb.rpc("member_respond_shift", { p_shift: shift, p_accept: accept, p_note: note.slice(0, 500) });
  if (error) return { ok: false, error: err(error.message) ?? "Could not record your answer." };
  bump(); return { ok: true, message: accept ? "Shift confirmed." : "Declined — your manager has been told." };
}
export async function checkShift(shift: string, action: "in" | "out"): Promise<ActionResult> {
  if (!Id.safeParse(shift).success) return { ok: false, error: "Shift not found." };
  const sb = untyped(await createClient());
  const { error } = await sb.rpc("shift_check", { p_shift: shift, p_action: action });
  if (error) return { ok: false, error: err(error.message) ?? "Could not update the shift." };
  bump(); return { ok: true, message: action === "in" ? "Checked in." : "Checked out." };
}
const Leave = z.object({ workspace: Id, from: z.string().min(10), to: z.string().min(10), kind: z.enum(["annual", "sick", "unpaid", "other"]), note: z.string().max(500).default("") });
export async function requestMyLeave(input: unknown): Promise<ActionResult> {
  const p = Leave.safeParse(input); if (!p.success) return { ok: false, error: "Choose dates and a type." };
  const from = Date.parse(p.data.from), to = Date.parse(p.data.to); if (!(to > from)) return { ok: false, error: "The end must be after the start." };
  const sb = untyped(await createClient());
  const { error } = await sb.rpc("request_leave", { p_ws: p.data.workspace, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_kind: p.data.kind, p_note: p.data.note });
  if (error) return { ok: false, error: err(error.message) ?? "Could not send the request." };
  bump(); return { ok: true, message: "Leave requested — your manager will decide." };
}
export async function cancelMyLeave(id: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Request not found." };
  const { error } = await untyped(await createClient()).rpc("cancel_leave", { p_request: id });
  if (error) return { ok: false, error: "Could not cancel." };
  bump(); return { ok: true, message: "Leave cancelled." };
}
