"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { untyped } from "@/lib/workspace/db";
import { opsError } from "@/lib/ops/errors";
import type { ActionResult } from "./shell";

/**
 * /portal/parties/[id] (Q24): what a sponsor / exhibitor / talent login may do for its OWN party. The database commands
 * (deliverable_add_evidence, deliverable_transition, rider_submit) re-check party_portal_user(), so another party's ids fail.
 */
const Id = z.string().uuid();
const Evidence = z.object({ url: z.string().trim().max(600).regex(/^https:\/\//i).or(z.literal("")).default(""), note: z.string().trim().max(1000).default("") });
const RiderItem = z.object({ category: z.enum(["backline", "audio", "lighting", "video", "power", "staging", "dressing_room", "catering", "drinks", "accommodation", "ground_transport", "flights", "parking", "guest_list", "security", "other"]),
  description: z.string().trim().min(1).max(500), quantity: z.union([z.literal("").transform(() => undefined), z.coerce.number().int().min(1).max(1000).optional()]), required: z.boolean().default(true) });
const Rider = z.object({ kind: z.enum(["technical", "hospitality", "travel"]), summary: z.string().max(2000).default(""), items: z.array(RiderItem).min(1).max(200) });

export async function partyPortalCommand(partyId: string, op: "evidence" | "submit" | "rider", ref: string | null, values: Record<string, unknown> = {}): Promise<ActionResult> {
  const path = `/portal/parties/${partyId}`;
  if (!Id.safeParse(partyId).success || (ref !== null && !Id.safeParse(ref).success)) return { ok: false, error: "Not found." };
  const { supabase } = await requireUser(path);
  const sb = untyped(supabase);
  // Only the party's own linked login reaches this point with a usable record (RLS + my_party_portal()).
  const { data: mine } = await sb.rpc("my_party_portal");
  if (!((mine ?? []) as { id: string }[]).some(p => p.id === partyId)) return { ok: false, error: "Not found." };
  const done = (message: string): ActionResult => { revalidatePath(path); return { ok: true, message }; };
  if (op === "evidence") {
    const p = Evidence.safeParse(values); if (!p.success) return { ok: false, error: "Links must start with https://" };
    if (!p.data.url && p.data.note.length < 3) return { ok: false, error: "Add an https:// link or a note (3+ characters)." };
    const { error } = await sb.rpc("deliverable_add_evidence", { p_deliverable: ref, p: { kind: p.data.url ? "url" : "note", url: p.data.url || undefined, note: p.data.note } });
    return error ? { ok: false, error: opsError(error) } : done("Evidence added — submit it when it's complete.");
  }
  if (op === "submit") {
    const { error } = await sb.rpc("deliverable_transition", { p_deliverable: ref, p_to: "submitted", p_note: null });
    return error ? { ok: false, error: opsError(error) } : done("Submitted to the organiser for approval.");
  }
  const p = Rider.safeParse(values); if (!p.success) return { ok: false, error: "Add at least one item with a description." };
  const { data, error } = await sb.rpc("rider_submit", { p_party: partyId, p_kind: p.data.kind, p_summary: p.data.summary, p_items: p.data.items.map(i => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined))) });
  return error ? { ok: false, error: opsError(error) } : done(`Rider v${(data as { version: number }).version} sent — the organiser will accept it or ask for changes.`);
}
