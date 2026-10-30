import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapResendEvent, verifySvix } from "@/lib/email/rules";
import { untyped } from "@/lib/workspace/db";
import { withObservability } from "@/lib/observability/http";

/**
 * Q05: Resend delivery events (Svix-signed). Hard bounces and complaints add the address to email_suppressions and suppress its
 * queued mail; every event id is recorded once (replays → duplicate). Needs RESEND_WEBHOOK_SECRET (Resend dashboard → Webhooks);
 * without it the endpoint answers 503 and trusts nothing (BLOCKED_EXTERNAL until the owner adds the webhook).
 */
export const POST = withObservability("webhook.resend", async (request: Request) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  const body = await request.text();
  const id = request.headers.get("svix-id");
  if (!verifySvix({ secret, id, timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature"), body })) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  let payload: unknown; try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const e = mapResendEvent(id!, payload);
  const { data, error } = await untyped(createAdminClient() as never).rpc("email_record_event", { p_id: e.id, p_type: e.type, p_email: e.email, p_provider_id: e.providerId, p_detail: e.detail });
  if (error) return NextResponse.json({ error: "record_failed" }, { status: 500 });
  return NextResponse.json(data ?? {}, { headers: { "Cache-Control": "no-store" } });
}, { kind: "webhook" });
