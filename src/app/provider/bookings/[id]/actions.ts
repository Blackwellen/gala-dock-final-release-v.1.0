"use server";

import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";

/** Records an uploaded file (stored privately via /api/uploads) against a booking the caller can see. */
export async function recordBookingFile(jobId: string, path: string, name: string, kind: string): Promise<ActionResult> {
  const { db, workspace, userId } = await getProvider();
  if (!path.startsWith(`${userId}/`)) return { ok: false, error: "That file doesn’t belong to you." };
  const { data: job } = await db.from("provider_jobs").select("id").eq("id", jobId).eq("workspace_id", workspace.id).maybeSingle();
  if (!job) return { ok: false, error: "Booking not found." };
  const { error } = await db.from("media_assets").insert({ workspace_id: workspace.id, kind: ["evidence", "contract", "run_sheet", "photo"].includes(kind) ? kind : "document",
    title: name.slice(0, 120) || "File", url: path, data: { job_id: jobId }, status: "approved", rights: "owned" });
  return error ? { ok: false, error: friendly(error) } : { ok: true, message: "File added to the booking" };
}
