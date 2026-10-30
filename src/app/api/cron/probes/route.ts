import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { walletCredential, parseCredential, verifySignature } from "@/lib/tickets/credentials";
import { TOOLS } from "@/lib/agent/registry";
import { withObservability } from "@/lib/observability/http";
import { currentCorrelationId } from "@/lib/observability/context";
import { recordResults, runProbes, type TicketCredentialModule } from "@/lib/observability/synthetic";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Synthetic probes (Q34, domain 277). CRON_SECRET bearer only. Read-only / self-cleaning: no charge, email, booking or ticket is
 * created and no AI model is called. Results go to ops_synthetic_runs (feeds the sign-in SLO and the synthetic.failures alert).
 * Schedule after deploy (owner step, docs/operations/observability.md): pg_cron every 15 min → dispatch_worker('/api/cron/probes').
 * `?only=probe.health,probe.login` limits the run.
 */
export const POST = withObservability("cron.probes", async (request: Request) => {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { url, anonKey } = getSupabaseConfig();
  const only = new URL(request.url).searchParams.get("only")?.split(",").filter(k => /^probe\.[a-z_]+$/.test(k));
  const email = process.env.SYNTHETIC_PROBE_EMAIL, password = process.env.SYNTHETIC_PROBE_PASSWORD;
  const service = createAdminClient();
  const results = await runProbes({
    service: service as never, anon: () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }) as never,
    supabaseUrl: url, anonKey, baseUrl: process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin,
    login: email && password ? { email, password } : null,
    ticket: { walletCredential, parseCredential, verifySignature } as unknown as TicketCredentialModule,
    agentToolIds: TOOLS.map(t => t.id), env: process.env,
  }, only?.length ? only : undefined);
  await recordResults(service as never, results, { source: "cron", correlationId: currentCorrelationId(), environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV });
  const failed = results.filter(r => r.status === "failed").map(r => r.check);
  return NextResponse.json({ ok: failed.length === 0, failed, results: results.map(r => ({ check: r.check, status: r.status, duration_ms: r.duration_ms })) }, { headers: { "Cache-Control": "no-store" } });
}, { kind: "worker" });
export const GET = POST;
