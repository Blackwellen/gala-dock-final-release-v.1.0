"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Sell › Resale & risk: presale / public launch times and the waiting room (D4/B2, migration 202610294041). The audited
 * set_event_launch command decides permission (owner or manager with events.write) and validates; this only shapes input
 * and turns the database reasons into sentences.
 */
const Id = z.string().uuid();
const Iso = z.string().datetime({ offset: true }).nullable();
const Launch = z.object({
  at: Iso, presale_at: Iso,
  waiting_room: z.object({ enabled: z.boolean(), rate_per_minute: z.number().int().min(1, "Admit at least 1 person a minute.").max(10000, "Admit at most 10,000 a minute."),
    admit_minutes: z.number().int().min(2, "Give buyers at least 2 minutes.").max(60, "Give buyers at most 60 minutes.") }),
});
const REASON: [RegExp, string][] = [
  [/not_authorized|42501/, "Only workspace owners and managers can change launch times and the waiting room."],
  [/presale_requires_launch/, "Set the public launch time before adding a presale."],
  [/presale_after_launch/, "The presale must open before the public launch."],
  [/launch_after_event_start/, "Sales can't open after the event starts."],
  [/waiting_room_requires_launch/, "The waiting room needs a launch time — queue admission is counted from it."],
  [/launch_in_progress/, "The launch has started and people are in the waiting room — the launch time can't move now."],
  [/event_closed/, "This event is closed — launch settings can't change."],
  [/invalid_rate|invalid_admit_minutes|invalid_waiting_room|invalid_time|invalid_launch/, "Check the times and waiting-room numbers."],
];

export async function saveEventLaunch(eventId: string, input: unknown): Promise<ActionResult<{ state: string }>> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Invalid event." };
  const p = Launch.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the launch settings." };
  const { data, error } = await untyped(await createClient()).rpc("set_event_launch", { p_event: eventId, p_launch: p.data });
  if (error) return { ok: false, error: REASON.find(([re]) => re.test(error.message))?.[1] ?? "Could not save the launch settings — try again." };
  revalidatePath(`/organizer/events/${eventId}`);
  return { ok: true, data: { state: String((data as { state?: string }).state ?? "") }, message: "Launch settings saved." };
}
