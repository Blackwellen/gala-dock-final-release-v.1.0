"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Q29 organiser commands (domains 181–184). Every rule lives in the database commands (virtual_session_save, …); these wrappers
 * only validate shape and map errors. Host / speaker links are write-only here — read them with virtual_session_links (editors).
 */
type R<T = { id: string }> = { ok: true; data: T } | { ok: false; error: string };
const https = z.string().trim().regex(/^https:\/\/\S+$/, "Links must start with https://.").or(z.literal(""));
const Session = z.object({
  title: z.string().trim().min(1).max(200), kind: z.enum(["main", "breakout", "workshop", "webinar", "live_audio", "podcast", "remote", "replay"]).default("main"),
  track: z.string().max(80).optional(), starts_at: z.string().datetime({ offset: true }), ends_at: z.string().datetime({ offset: true }),
  status: z.enum(["draft", "scheduled"]).optional(), provider: z.string().max(40).optional(), external_meeting_id: z.string().max(200).optional(),
  join_url: https.optional(), speaker_url: https.optional(), host_url: https.optional(), host_secret_note: z.string().max(2000).optional(),
  access: z.enum(["ticket", "registration", "ticket_or_registration", "invite_only"]).optional(), tier_ids: z.array(z.string().uuid()).max(50).optional(),
  capacity: z.number().int().positive().nullable().optional(), max_devices_per_attendee: z.number().int().min(1).max(5).optional(),
  opens_minutes_before: z.number().int().min(0).max(1440).optional(), closes_minutes_after: z.number().int().min(0).max(1440).optional(),
  captions: z.enum(["none", "live_human", "live_auto", "post_event"]).optional(), caption_languages: z.array(z.string().min(2).max(10)).max(10).optional(),
  sign_language: z.boolean().optional(), transcript: z.boolean().optional(), audio_description: z.boolean().optional(), accessibility_notes: z.string().max(1000).optional(),
  programme_item_id: z.string().uuid().optional(), parent_session_id: z.string().uuid().optional(),
}).partial({ title: true, starts_at: true, ends_at: true });

const map = (m: string) => /not_authorized/.test(m) ? "You can’t change this event’s online sessions." : /https/.test(m) ? "Links must start with https://."
  : /capacity_exceeded/.test(m) ? m.replace(/^.*?(online|in_person)_capacity_exceeded: /, "Capacity: ") : /illegal|transition/.test(m) ? "That status change isn’t allowed."
  : /not_in_event/.test(m) ? "Pick items from this event." : /user_not_found/.test(m) ? "No Gala Dock account uses that email." : "Couldn’t save the online session.";

async function call<T>(fn: string, args: Record<string, unknown>, path?: string): Promise<R<T>> {
  const sb = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, error: map(error.message) };
  if (path) revalidatePath(path);
  return { ok: true, data: data as T };
}

export async function saveVirtualSession(eventId: string, input: unknown, sessionId?: string) {
  const p = Session.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the session details." } as const;
  if (!sessionId && (!p.data.title || !p.data.starts_at || !p.data.ends_at)) return { ok: false, error: "Add a title, start and end." } as const;
  return call<{ id: string }>("virtual_session_save", { p_event: eventId, p: p.data, p_session: sessionId ?? null }, `/organizer/events/${eventId}/virtual`);
}
export async function transitionVirtualSession(sessionId: string, to: "draft" | "scheduled" | "live" | "ended" | "cancelled" | "archived", reason?: string) {
  return call("virtual_session_transition", { p_session: sessionId, p_to: to, p_reason: reason ?? null });
}
export async function assignVirtualRole(sessionId: string, who: { email?: string; user_id?: string; role: "speaker" | "moderator" | "host" | "producer"; display_name?: string }) {
  return call("virtual_role_assign", { p_session: sessionId, p: who });
}
export async function revokeVirtualRole(roleId: string) { return call("virtual_role_revoke", { p_role: roleId }); }
export async function setTierAttendanceMode(tierId: string, mode: "in_person" | "online" | "hybrid" | null) { return call("virtual_tier_mode_set", { p_tier: tierId, p_mode: mode ?? "" }); }
export async function saveVirtualRecording(sessionId: string, input: { title?: string; url?: string; storage_path?: string; status?: "processing" | "available";
  audience?: "attendees" | "registered" | "session_attendees" | "team"; access_from?: string; access_until?: string; captions?: boolean; transcript_path?: string }, recordingId?: string) {
  return call("virtual_recording_save", { p_session: sessionId, p: input, p_recording: recordingId ?? null });
}
export async function transitionVirtualRecording(recordingId: string, to: "available" | "withdrawn") { return call("virtual_recording_transition", { p_recording: recordingId, p_to: to }); }
export async function virtualAttendanceSummary(eventId: string) { return call<unknown[]>("virtual_attendance_summary", { p_event: eventId }); }
