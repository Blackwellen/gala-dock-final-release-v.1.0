"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { opsError } from "@/lib/ops/errors";
import type { ActionResult } from "./shell";

/**
 * Ops › Logistics › Public getting-there info (migration 202610294081). One command, event_getting_there_save, re-checks event
 * authority (owners / managers), stores the public notes in events.settings.getting_there and sets which parking areas
 * (general / accessible / mixed only) and shuttles show on the public event page. Form fields: notes + `pa_<id>` / `sh_<id>` checkboxes.
 */
const NOTE = z.string().max(500).default("");
const Body = z.object({ public: z.boolean().default(false), transit: NOTE, shuttle: NOTE, parking: NOTE, dropoff: NOTE, accessible: NOTE, rideshare: NOTE, cycle: NOTE });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveGettingThere(eventId: string, values: Record<string, unknown>): Promise<ActionResult> {
  if (!UUID.test(eventId)) return { ok: false, error: "Event not found." };
  const ctx = await getOrganizer();
  if (!["owner", "admin", "manager"].includes(String(ctx.role))) return { ok: false, error: "Only the event's owners and managers can change the public page." };
  const p = Body.safeParse(values);
  if (!p.success) return { ok: false, error: "Keep each note under 500 characters." };
  const ids = (prefix: string) => Object.entries(values).filter(([k, v]) => k.startsWith(prefix) && v === true).map(([k]) => k.slice(prefix.length)).filter(id => UUID.test(id));
  const r = await untyped(ctx.supabase).rpc("event_getting_there_save", { p_event: eventId, p: { ...p.data, parking_ids: ids("pa_"), shuttle_ids: ids("sh_") } });
  if (r.error) return { ok: false, error: r.error.message === "parking_not_public" ? "Only general, accessible or mixed parking areas can be public."
    : r.error.message === "transport_not_public" ? "Only shuttles can be shown on the public page." : opsError(r.error) };
  revalidatePath(`/organizer/events/${eventId}`);
  const d = (r.data ?? {}) as { public?: boolean; notes?: number; parking?: number; shuttles?: number };
  const parts = [d.public && d.notes ? `${d.notes} note${d.notes === 1 ? "" : "s"}` : "", d.parking ? `${d.parking} parking area${d.parking === 1 ? "" : "s"}` : "", d.shuttles ? `${d.shuttles} shuttle${d.shuttles === 1 ? "" : "s"}` : ""].filter(Boolean);
  return { ok: true, message: parts.length ? `Public page now shows ${parts.join(", ")}.` : "Saved — nothing is shown on the public page yet." };
}
