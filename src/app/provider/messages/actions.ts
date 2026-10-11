"use server";

import { getProvider } from "@/lib/provider/context";
import { call, type ActionResult } from "@/lib/workspace/rpc";

export async function sendThreadMessage(threadId: string, data: FormData): Promise<ActionResult> {
  const body = String(data.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Write a message first." };
  const { db } = await getProvider();
  return call(db, "provider_send_message", { p_thread: threadId, p_body: body }, "Message sent");
}
