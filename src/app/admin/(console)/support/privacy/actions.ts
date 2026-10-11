"use server";
import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/workspace/rpc";

const STATUSES = ["verifying", "in_progress", "extended", "completed", "refused", "withdrawn"];

/** DSAR status change (§89). The RPC enforces support permission, reasons for refusal/extension, the one-off 2-month extension, audit and the requester notification. */
export async function updatePrivacyRequest(id: string, fd: FormData): Promise<ActionResult> {
  const admin = await getAdmin();
  if (!admin.permissions.has("support")) return { ok: false, error: "Privacy requests need the Support permission." };
  const status = String(fd.get("status") ?? ""), note = String(fd.get("note") ?? "").trim();
  if (!STATUSES.includes(status)) return { ok: false, error: "Choose a status." };
  const extend = status === "extended";
  if ((extend || status === "refused") && note.length < 10) return { ok: false, error: "Give a reason of at least 10 characters — it is sent to the requester." };
  const { error } = await untyped(admin.db as never).rpc("update_privacy_request", { p_id: id, p_status: status, p_note: note.slice(0, 1000), p_extend: extend });
  if (error) return { ok: false, error: error.message.includes("reason_required") ? "A reason of at least 10 characters is required." : "Couldn’t update the request." };
  revalidatePath("/admin/support/privacy");
  return { ok: true, message: "Request updated — the requester has been notified" };
}
