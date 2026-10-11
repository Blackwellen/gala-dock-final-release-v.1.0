"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/security";

export type ScanResult = { ok: boolean; result?: "admitted" | "duplicate" | "invalid" | "revoked"; attendee?: string; code?: string; checkedInAt?: string | null; error?: string };
/** QR payload: "GD1:<code>:<nonce>" (nonce rotates on transfer/resale). Manual entry accepts the code alone. Requires a connection. */
export async function scanTicket(eventId: string, payload: string): Promise<ScanResult> {
  const id = z.string().uuid().safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  const raw = payload.trim().slice(0, 200);
  const m = /^GD1:([A-Z0-9-]{6,40}):([a-f0-9]{32})$/i.exec(raw);
  const code = (m ? m[1]! : raw).toUpperCase(), nonce = m ? m[2]!.toLowerCase() : null;
  if (!/^[A-Z0-9-]{6,40}$/.test(code)) return { ok: true, result: "invalid" };
  const { supabase, user } = await requireUser();
  if (!(await rateLimit(`scan:${user.id}`, 600, 60))) return { ok: false, error: "Too many scans — slow down." };
  const { data, error } = await supabase.rpc("check_in_ticket", { p_event: id.data, p_code: code, p_nonce: nonce ?? undefined });
  if (error) return { ok: false, error: error.code === "42501" ? "You don't have check-in access for this event." : "Check-in failed — try again." };
  const r = data as { result: ScanResult["result"]; attendee: string; code: string; checked_in_at: string | null };
  revalidatePath(`/organizer/events/${id.data}`); revalidatePath(`/account/events/${id.data}/guests-tickets`);
  return { ok: true, result: r.result, attendee: r.attendee, code: r.code ?? code, checkedInAt: r.checked_in_at };
}
