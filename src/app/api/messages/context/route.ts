import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { sameOrigin } from "@/lib/security";
import { untyped } from "@/lib/workspace/db";

const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Q05 context messaging: event / booking / quote / listing threads. One canonical thread per context and pair of parties
 * (advisory-locked in send_context_message); `clientMsgId` makes retries idempotent (same id → same message, no duplicate).
 * Attachments must be the caller's own verified uploads (post_message enforces the path rule; downloads use the Q04 gate).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const sb = untyped(await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  if (!(await hasRequiredAssurance(sb as never))) return json({ error: "Complete multi-factor authentication first." }, 403);
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const context = String(b?.context ?? ""), id = String(b?.contextId ?? "");
  if (!["event", "booking", "quote", "listing"].includes(context) || !UUID.test(id)) return json({ error: "Unknown conversation context." }, 400);
  const opt = (k: string) => typeof b?.[k] === "string" && UUID.test(b[k] as string) ? b[k] as string : null;
  const attachments = Array.isArray(b?.attachments) ? (b!.attachments as { path?: unknown; name?: unknown }[]).slice(0, 10).map(a => ({ path: String(a.path ?? ""), name: String(a.name ?? "file").slice(0, 120) })) : [];
  const { data, error } = await sb.rpc("send_context_message", { p_context: context, p_context_id: id, p_body: String(b?.body ?? "").slice(0, 8000), p_attachments: attachments,
    p_as_workspace: opt("asWorkspace"), p_to_workspace: opt("toWorkspace"), p_client_msg_id: opt("clientMsgId"), p_subject: typeof b?.subject === "string" ? b.subject.slice(0, 140) : null });
  if (error) {
    const m = error.message;
    const status = /not_authorized|not_allowed/.test(m) ? 403 : /not_found/.test(m) ? 404 : /rate_limited/.test(m) ? 429 : /empty_message|invalid_|counterpart_required/.test(m) ? 400 : 500;
    return json({ error: status === 403 ? "You can’t message in this context." : status === 404 ? "Not found." : status === 429 ? "You’re sending messages too quickly." : status === 400 ? "Check the message and try again." : "Couldn’t send the message." }, status);
  }
  return json(data);
}
