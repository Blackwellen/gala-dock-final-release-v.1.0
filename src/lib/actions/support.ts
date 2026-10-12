"use server";

import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";

const CATEGORIES = ["booking", "ticketing", "payment", "refund", "account", "technical", "other"] as const;

/** Help Centre "Contact support": opens a support case (contact_support RPC — caller must be signed in; workspace attached only if a member). */
export async function contactSupport(input: { subject: string; body: string; category: string; workspaceId?: string | null; source: string }): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  const s = String(input?.subject ?? "").trim(), b = String(input?.body ?? "").trim();
  if (s.length < 3 || s.length > 200 || b.length < 10 || b.length > 5000) return { ok: false, error: "Add a subject and at least a sentence describing the issue." };
  const category = (CATEGORIES as readonly string[]).includes(input.category) ? input.category : "other";
  const ws = typeof input.workspaceId === "string" && /^[0-9a-f-]{36}$/i.test(input.workspaceId) ? input.workspaceId : null;
  const sb = untyped(await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to contact support, or email support@galadock.com." };
  const { data, error } = await sb.rpc("contact_support", { p_subject: s, p_body: b, p_category: category, p_workspace: ws, p_source: String(input.source ?? "Help Centre").slice(0, 60) });
  if (error) return { ok: false, error: /rate_limited/.test(error.message) ? "You’ve sent several requests in the last hour — please wait a little, or email support@galadock.com." : "Couldn’t send your message. Please try again or email support@galadock.com." };
  return { ok: true, reference: String(data) };
}
