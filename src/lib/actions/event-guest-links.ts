"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createInviteToken } from "@/lib/security";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "./shell";

const Id = z.string().uuid();
const Input = z.object({ label: z.string().trim().max(80).default(""), expires_at: z.string().datetime({ offset: true }).optional(), show_location: z.boolean().default(true), show_programme: z.boolean().default(true) });

/**
 * Issue a private guest link for an event (organiser or the customer who owns it). The 256-bit token is returned once;
 * only its hash is stored. Guests open /guest/<token>, which shows that one event's guest-safe details and nothing else.
 */
export async function createGuestLink(eventId: string, input: unknown = {}): Promise<ActionResult<{ path: string; expires_at: string }>> {
  const id = Id.safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  const p = Input.safeParse(input ?? {}); if (!p.success) return { ok: false, error: "Check the link settings." };
  const { supabase } = await requireUser();
  const { token, hash } = createInviteToken();
  const { data, error } = await untyped(supabase).rpc("create_event_guest_link", { p_event: id.data, p_token_hash: hash, p_label: p.data.label, p_expires_at: p.data.expires_at ?? null, p_show_location: p.data.show_location, p_show_programme: p.data.show_programme });
  if (error) {
    const m = error.message;
    return { ok: false, error: /event_not_shareable/.test(m) ? "Cancelled, archived or restricted events can't be shared." : /too_many_links/.test(m) ? "This event already has 20 active guest links. Revoke one first." : /expiry_in_past/.test(m) ? "Choose an expiry date in the future." : /not_authorized/.test(m) ? "You can't share this event." : "Could not create the guest link." };
  }
  return { ok: true, data: { path: `/guest/${token}`, expires_at: (data as { expires_at: string }).expires_at } };
}

export async function revokeGuestLink(eventId: string, linkId: string): Promise<ActionResult> {
  const id = Id.safeParse(eventId), link = Id.safeParse(linkId);
  if (!id.success || !link.success) return { ok: false, error: "Invalid link." };
  const { supabase } = await requireUser();
  const { error } = await untyped(supabase).rpc("revoke_event_guest_link", { p_link: link.data });
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "You can't manage this event's links." : "Could not revoke the link." };
  revalidatePath(`/organizer/events/${id.data}`); revalidatePath(`/account/events/${id.data}`);
  return { ok: true, message: "Guest link revoked. It stops working immediately." };
}
