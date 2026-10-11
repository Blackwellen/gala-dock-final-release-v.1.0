"use server";

import { getProvider } from "@/lib/provider/context";
import { call, type ActionResult } from "@/lib/workspace/rpc";

const RESPONSES = ["available", "unavailable", "declined", "clarification"] as const;
type Response = (typeof RESPONSES)[number];
const label: Record<Response, string> = {
  available: "Marked available — the requester has been notified",
  unavailable: "Marked unavailable",
  declined: "Request declined",
  clarification: "Clarification requested",
};

/** Records a response through provider_respond; late replies are refused and the request becomes Expired / No response. */
export async function respondToRequest(itemId: string, response: string, note = ""): Promise<ActionResult> {
  if (!RESPONSES.includes(response as Response)) return { ok: false, error: "Unknown response." };
  const { db } = await getProvider();
  return call(db, "provider_respond", { p_item: itemId, p_response: response, p_note: note.slice(0, 2000) }, label[response as Response]);
}

export async function releaseHold(itemId: string): Promise<ActionResult> {
  const { db } = await getProvider();
  return call(db, "provider_release_hold", { p_item: itemId }, "Hold released — the date is free again");
}
