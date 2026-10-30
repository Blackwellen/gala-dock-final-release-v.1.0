import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { assertPublicUrl } from "@/lib/developer/ssrf";
import { signPayload } from "@/lib/developer/signature";
import { WEBHOOK_API_VERSION } from "@/lib/developer/webhook-catalogue";
import { withObservability } from "@/lib/observability/http";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Webhook delivery worker (release spec §100). Signature: header `Gala-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`,
 * plus `Gala-Event-Id` (stable across retries — dedupe on it) and `Gala-Event-Type`. 2xx within 10s = delivered.
 * Retries with exponential backoff; dead after 8 attempts; endpoints auto-disable after sustained failure (see finish_webhook_delivery).
 * Q30: during a secret rotation the previous secret also signs (two v1 values, 24 h); receivers reject t older than 300 s.
 */
export const POST = withObservability("cron.webhooks", async (request: Request) => {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const db = untyped(createAdminClient() as never);
  const { data } = await db.rpc("claim_webhook_batch", { p_limit: 50 });
  let delivered = 0, failed = 0;
  await Promise.all(((data ?? []) as { delivery_id: string; url: string; secret: string; payload: unknown; event_id: string; event_type: string; endpoint_id: string }[]).map(async d => {
    const body = JSON.stringify(d.payload);
    const { data: secrets } = await db.rpc("webhook_signing_secrets", { p_endpoint: d.endpoint_id });
    const sig = signPayload(body, ((secrets as string[] | null)?.length ? (secrets as string[]) : [d.secret]));
    let okRes = false, status = 0, snippet = "";
    try {
      await assertPublicUrl(d.url);   // DNS may have changed since creation
      const r = await fetch(d.url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", "User-Agent": "GalaDock-Webhooks/1.0", "Gala-Signature": sig.header, "Gala-Event-Id": d.event_id, "Gala-Event-Type": d.event_type, "Gala-Api-Version": WEBHOOK_API_VERSION }, body });
      status = r.status; okRes = r.ok; snippet = (await r.text().catch(() => "")).slice(0, 300);
    } catch (e) { snippet = (e as Error).message.slice(0, 300); }
    await db.rpc("finish_webhook_delivery", { p_delivery: d.delivery_id, p_ok: okRes, p_status: status || null, p_snippet: snippet });
    if (okRes) delivered++; else failed++;
  }));
  return NextResponse.json({ delivered, failed }, { headers: { "Cache-Control": "no-store" } });
}, { kind: "worker" });
export const GET = POST;
