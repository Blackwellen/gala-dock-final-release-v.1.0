import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/security";

/**
 * Q37 push registration for the signed-in user. POST {endpoint, p256dh, auth, platform, label} → push_register (allow-listed push
 * services only, bound to the session, ≤10 devices, 20/hour). DELETE ?id= → push_unregister (own devices only).
 */
type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const statusOf = (e: { message: string; code?: string }) => e.code === "42501" ? 401 : e.code === "54000" ? 429 : 400;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "cross_site" }, 403);
  const b = await request.json().catch(() => null) as { endpoint?: string; p256dh?: string; auth?: string; platform?: string; label?: string } | null;
  if (!b?.endpoint || !b.p256dh || !b.auth) return json({ error: "invalid_subscription" }, 400);
  const { data, error } = await ((await createClient()) as unknown as Rpc).rpc("push_register", {
    p_endpoint: String(b.endpoint), p_p256dh: String(b.p256dh), p_auth: String(b.auth), p_platform: String(b.platform ?? "unknown"), p_label: String(b.label ?? "").slice(0, 60) });
  return error ? json({ error: error.message }, statusOf(error)) : json({ id: data }, 201);
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "cross_site" }, 403);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "invalid_id" }, 400);
  const { data, error } = await ((await createClient()) as unknown as Rpc).rpc("push_unregister", { p_subscription: id, p_reason: "user" });
  return error ? json({ error: error.message }, statusOf(error)) : json({ removed: data === true });
}
