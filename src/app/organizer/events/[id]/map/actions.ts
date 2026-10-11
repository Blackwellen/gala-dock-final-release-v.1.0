"use server";

import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { planSeats } from "@/components/venue-plan/inventory";
import type { MapEl } from "@/app/provider/venues/_components/venue-map";

const MSG: Record<string, string> = {
  not_authorized: "You don’t have permission to edit this event’s layout.", seats_in_use: "Some sold or held seats would be removed or re-tiered — keep them in the plan.",
  invalid_tier: "A ticket tier on the plan doesn’t belong to this event.", too_many_seats: "That’s more seats than a single event plan supports.", invalid_elements: "The plan couldn’t be read — reload and try again.",
};

/** Saves the event layout (overlay above the venue's locked plan). Publishing syncs reserved-seat inventory for ticketing. */
export async function saveEventPlan(eventId: string, overlay: MapEl[], publish: boolean): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { ok: false, error: "Event not found." };
  const ctx = await getOrganizer();
  let seats;
  try { seats = planSeats(overlay); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const clean = overlay.slice(0, 2000).map(e => ({ ...e, label: String(e.label ?? "").slice(0, 60) }));
  const { data, error } = await untyped(ctx.supabase).rpc("organizer_save_event_plan", { p_event: eventId, p_structure: { format: "plan-v2" }, p_overlay: clean, p_seats: seats, p_publish: publish });
  if (error) { const k = Object.keys(MSG).find(x => error.message.includes(x)); return { ok: false, error: k ? MSG[k] + (error.details ? ` (${error.details})` : "") : "Couldn’t save the layout. Please try again." }; }
  revalidatePath(`/organizer/events/${eventId}`);
  return { ok: true, message: publish ? `Layout v${data} published · ${seats.length.toLocaleString("en-GB")} reserved seats synced` : `Layout saved as draft v${data}` };
}
