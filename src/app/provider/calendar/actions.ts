"use server";

import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";

const KINDS = ["blocked", "open", "emergency_window", "maintenance"] as const;
const label: Record<(typeof KINDS)[number], string> = { blocked: "Time blocked", open: "Availability opened", emergency_window: "Emergency window published", maintenance: "Maintenance scheduled" };

/** Creates an availability block via provider_set_availability (validated against workspace ownership). Times are London local. */
export async function setAvailability(data: FormData): Promise<ActionResult> {
  const kind = String(data.get("kind") ?? "") as (typeof KINDS)[number];
  if (!KINDS.includes(kind)) return { ok: false, error: "Choose what you want to do." };
  const target = String(data.get("target") ?? "");
  const [type, id] = target.split(":");
  const start = String(data.get("start") ?? ""), end = String(data.get("end") ?? "");
  const toIso = (local: string) => { const d = new Date(local); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
  const s = toIso(start), e = toIso(end);
  if (!s || !e) return { ok: false, error: "Choose a start and end time." };
  if (new Date(e) <= new Date(s)) return { ok: false, error: "End time must be after the start time." };
  const { db, workspace } = await getProvider();
  const { error } = await db.rpc("provider_set_availability", {
    p_ws: workspace.id, p_kind: kind, p_starts: s, p_ends: e,
    p_listing: type === "listing" ? id : null, p_space: type === "space" ? id : null, p_crew: type === "crew" ? id : null,
    p_note: String(data.get("note") ?? "").slice(0, 500),
  });
  return error ? { ok: false, error: friendly(error) } : { ok: true, message: label[kind] };
}
