"use server";

import { getProvider } from "@/lib/provider/context";
import { call, type ActionResult } from "@/lib/workspace/rpc";

export async function sendDraftQuote(quoteId: string): Promise<ActionResult> {
  const { db } = await getProvider();
  return call(db, "provider_send_quote", { p_quote: quoteId }, "Quote sent to the client");
}

export async function withdrawQuote(quoteId: string): Promise<ActionResult> {
  const { db } = await getProvider();
  return call(db, "provider_withdraw_quote", { p_quote: quoteId }, "Quote withdrawn — the client can no longer accept it");
}
