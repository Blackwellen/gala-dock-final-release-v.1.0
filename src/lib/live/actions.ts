"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Live event mode actions (§86). RLS (can_access_event) and the set_provider_checkin RPC enforce who may act.
type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE = "/organizer/events/[id]/live";
const err = (m?: string): Result => ({ ok: false, error: /not_authorized|42501|row-level/.test(m ?? "") ? "You don’t have permission to do that." : /invalid_status/.test(m ?? "") ? "That status isn’t available to you." : "Couldn’t update — try again." });

export async function setProviderCheckin(itemId: string, status: string, note = "", eta?: string): Promise<Result> {
  if (!UUID.test(itemId)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { error } = await sb.rpc("set_provider_checkin" as never, { p_item: itemId, p_status: status, p_eta: eta ? new Date(eta).toISOString() : null, p_note: note.slice(0, 300) } as never);
  if (error) return err(error.message);
  revalidatePath(LIVE, "page"); revalidatePath("/provider/opportunities/[id]", "page");
  return { ok: true };
}

export async function setProgrammeStatus(eventId: string, itemId: string, status: "upcoming" | "in_progress" | "done" | "delayed"): Promise<Result> {
  if (!UUID.test(eventId) || !UUID.test(itemId)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  // Q17: run_sheet_update records delays / actual times and checks dependencies ('delayed' is tracked, not a programme status).
  const { data: it } = await sb.from("programme_items").select("id").eq("id", itemId).eq("event_id", eventId).maybeSingle();
  if (!it) return { ok: false, error: "Not found." };
  const { error } = await sb.rpc("run_sheet_update" as never, { p_item: itemId, p_status: status } as never);
  if (error) return /dependency_pending/.test(error.message) ? { ok: false, error: "An earlier item this depends on isn't done yet." } : err(error.message);
  revalidatePath(LIVE, "page");
  return { ok: true };
}

export async function reportIncident(eventId: string, title: string, detail: string, severity: "low" | "medium" | "high" | "critical"): Promise<Result> {
  if (!UUID.test(eventId) || title.trim().length < 3) return { ok: false, error: "Give the incident a short title." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("incidents").insert({ event_id: eventId, title: title.trim().slice(0, 140), detail: detail.slice(0, 2000), severity, status: "open", reported_by: user?.id ?? null } as never);
  if (error) return err(error.message);
  revalidatePath(LIVE, "page");
  return { ok: true };
}

export async function resolveIncident(eventId: string, id: string): Promise<Result> {
  if (!UUID.test(eventId) || !UUID.test(id)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { data: inc } = await sb.from("incidents").select("id").eq("id", id).eq("event_id", eventId).maybeSingle();
  if (!inc) return { ok: false, error: "Not found." };
  const { error } = await sb.rpc("incident_transition" as never, { p_incident: id, p_to: "resolved", p_note: "Resolved from live mode" } as never);
  if (error) return err(error.message);
  revalidatePath(LIVE, "page");
  return { ok: true };
}
