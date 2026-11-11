import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { bwKey, bwVerify } from "@/lib/observability/bw-hmac";
import { collectOpsHealth } from "@/lib/observability/ops-health";
import { errorReportingHealth } from "@/lib/observability/errors";
import { scannerConfigured, scannerMisconfigured } from "@/lib/upload-safety";

export const dynamic = "force-dynamic";

/**
 * Readiness for Blackwellen Watchtower (`ready:gala_dock`, blackwellen-operations services/watchtower). Only requests signed
 * BW-HMAC-SHA256-V1 with the Watchtower probe key are answered; a reused nonce is refused (stored 10 min in public.idempotency_keys,
 * scope `bw-probe:<key id>`). Unsigned callers get 401; an unconfigured deployment answers 503 so a misconfiguration is visible.
 * HTTP 200 when healthy, degraded or unknown; 503 when down; header X-Health-State. States, counts and ages only.
 * Env (server only): WATCHTOWER_PROBE_KEY_ID (default watchtower-gala_dock), WATCHTOWER_PROBE_SECRET_HEX.
 */
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const key = bwKey(process.env.WATCHTOWER_PROBE_KEY_ID || "watchtower-gala_dock", process.env.WATCHTOWER_PROBE_SECRET_HEX);
  if (!key) return Response.json({ error: "Readiness probes are not configured on this deployment." }, { status: 503, headers: noStore });
  const url = new URL(req.url);
  const target = url.pathname + url.search;
  const v = bwVerify(key, "GET", target, new Uint8Array(), req.headers);
  if (!v.ok) return Response.json({ error: "Unauthorised." }, { status: 401, headers: noStore });

  const admin = createAdminClient();
  const scope = `bw-probe:${key.keyId}`;
  const once = await admin.from("idempotency_keys" as never).insert({ scope, key: v.nonce, request_hash: createHash("sha256").update(target).digest("hex"), status: "completed",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString() } as never);
  if (once.error) {
    if (once.error.code === "23505") return Response.json({ error: "Unauthorised." }, { status: 401, headers: noStore });
    return Response.json({ brand: "gala_dock", status: "down", components: { database: { state: "down" } } }, { status: 503, headers: { ...noStore, "X-Health-State": "down" } });
  }
  void Promise.resolve(admin.from("idempotency_keys" as never).delete().eq("scope", scope).lt("expires_at", new Date().toISOString())).catch(() => undefined);

  const h = await collectOpsHealth(admin as never, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    scanner: { configured: scannerConfigured(), misconfigured: scannerMisconfigured() }, errorReporting: errorReportingHealth().state });
  return Response.json({ brand: "gala_dock", service: "gala-dock-web", generated_at: h.generated_at, status: h.overall, components: h.components,
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null },
    { status: h.overall === "down" ? 503 : 200, headers: { ...noStore, "X-Health-State": h.overall } });
}
