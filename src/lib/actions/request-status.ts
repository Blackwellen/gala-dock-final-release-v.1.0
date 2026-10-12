"use server";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { can } from "@/lib/domain/permissions";
import type { ActionResult } from "./shell";

const NEXT: Record<string, string[]> = { sent: ["closed", "cancelled"], closed: ["sent", "cancelled"], draft: ["cancelled"] };
const MSG: Record<string, string> = { closed: "Request closed to new quotes.", sent: "Request reopened for quotes.", cancelled: "Request cancelled." };

/** Close a marketplace request to new quotes, reopen it, or cancel it. Quotes already received are kept. */
export async function setRequestStatus(requestId: string, status: "closed" | "sent" | "cancelled"): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { ok: false, error: "Request not found." };
  const ctx = await getOrganizer();
  if (!can("organizer", ctx.role, "marketplace.request")) return { ok: false, error: "You don’t have permission to change requests." };
  const { data: r } = await ctx.supabase.from("provider_requests").select("id,status,events!inner(workspace_id)").eq("id", requestId).eq("events.workspace_id", ctx.workspace.id).maybeSingle();
  if (!r) return { ok: false, error: "Request not found." };
  if (!(NEXT[r.status as string] ?? []).includes(status)) return { ok: false, error: `A ${r.status} request can’t be changed to ${status}.` };
  const { error } = await ctx.supabase.from("provider_requests").update({ status }).eq("id", requestId);
  if (error) return { ok: false, error: "Couldn’t update the request." };
  revalidatePath(`/organizer/marketplace/requests/${requestId}`);
  return { ok: true, message: MSG[status] };
}
