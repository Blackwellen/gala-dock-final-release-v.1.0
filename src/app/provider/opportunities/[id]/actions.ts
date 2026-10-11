"use server";

import { getProvider } from "@/lib/provider/context";
import { call, friendly, type ActionResult } from "@/lib/workspace/rpc";
import { respondToRequest } from "../actions";

/** Confirms availability and records a conditional-hold or standby offer for the requester to accept. */
export async function offerOption(itemId: string, kind: "hold" | "standby", hours: string): Promise<ActionResult> {
  const h = Math.min(72, Math.max(2, Number(hours) || 48));
  const note = kind === "hold"
    ? `Available — offering a conditional hold for ${h} hours. Place the hold from your event to secure the date.`
    : "Available as a standby provider — we can step in if your primary provider is unavailable.";
  const { db } = await getProvider();
  const r = await call(db, "provider_respond", { p_item: itemId, p_response: "available", p_note: note }, kind === "hold" ? `Hold offered for ${h} hours` : "Standby offered");
  return r;
}

export async function askClarification(itemId: string, question: string): Promise<ActionResult> {
  if (question.trim().length < 5) return { ok: false, error: "Write your question (at least 5 characters)." };
  return respondToRequest(itemId, "clarification", question.trim());
}

/** Private notes are workspace tasks linked to the opportunity (visible to the provider team only). */
export async function addInternalNote(itemId: string, data: FormData): Promise<ActionResult> {
  const body = String(data.get("note") ?? "").trim();
  if (body.length < 2) return { ok: false, error: "Write a note first." };
  const { db, workspace, userName } = await getProvider();
  const { error } = await db.from("tasks").insert({ workspace_id: workspace.id, title: body.slice(0, 200), detail: JSON.stringify({ kind: "opportunity_note", build_item_id: itemId, body: body.slice(0, 2000) }),
    category: "opportunity_note", assignee_name: userName, status: "done" });
  return error ? { ok: false, error: friendly(error) } : { ok: true, message: "Note saved" };
}

export async function toggleSaved(itemId: string, saved: boolean): Promise<ActionResult> {
  const { db, userId } = await getProvider();
  const key = `opportunity:${itemId}`;
  const { error } = saved ? await db.from("saved_items").delete().eq("user_id", userId).eq("item_key", key) : await db.from("saved_items").insert({ user_id: userId, item_key: key });
  return error ? { ok: false, error: friendly(error) } : { ok: true, message: saved ? "Removed from saved" : "Saved" };
}
