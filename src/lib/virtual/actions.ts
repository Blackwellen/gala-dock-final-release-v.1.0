"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { VIRTUAL_PROVIDERS } from "./providers";

type R = { ok: true } | { ok: false; error: string };
const https = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s === "" ? "" : /^https:\/\/\S+$/.test(s) ? s : null; };

/** Saves the event's online session (release spec §124). Host links and notes are stored privately and never shown to attendees. */
export async function saveVirtual(eventId: string, f: FormData): Promise<R> {
  const provider = String(f.get("provider") ?? "manual");
  if (!VIRTUAL_PROVIDERS.some(p => p.key === provider)) return { ok: false, error: "Choose a platform." };
  const join = https(f.get("join_url")), host = https(f.get("host_url")), rec = https(f.get("recording_url"));
  if (join === null || host === null || rec === null) return { ok: false, error: "Links must start with https://." };
  const sb = await createClient();
  const { error } = await sb.rpc("save_event_virtual" as never, { p_event: eventId, p: {
    provider, format: String(f.get("format") ?? "virtual"), external_id: String(f.get("external_id") ?? ""), join_url: join, host_url: host, host_notes: String(f.get("host_notes") ?? ""),
    timezone: String(f.get("timezone") ?? "Europe/London"), capacity: String(f.get("capacity") ?? ""), ticket_required: f.get("ticket_required") === "on",
    opens_minutes_before: String(f.get("opens_minutes_before") ?? "30"), closes_minutes_after: String(f.get("closes_minutes_after") ?? "120"),
    recording_url: rec, replay_available: f.get("replay_available") === "on", replay_until: String(f.get("replay_until") ?? "") ? new Date(String(f.get("replay_until"))).toISOString() : "",
  } } as never);
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "You can’t edit this event." : /check constraint/.test(error.message) ? "Check the values — links must be https:// and numbers positive." : "Couldn’t save the online session." };
  revalidatePath(`/organizer/events/${eventId}/virtual`);
  return { ok: true };
}
