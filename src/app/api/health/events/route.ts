import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { bwKey } from "@/lib/observability/bw-hmac";
import { collectOpsHealth } from "@/lib/observability/ops-health";
import { publishHeartbeat } from "@/lib/observability/ops-events";
import { errorReportingHealth } from "@/lib/observability/errors";
import { scannerConfigured, scannerMisconfigured } from "@/lib/upload-safety";

export const dynamic = "force-dynamic";
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Signed heartbeat to the Blackwellen event bus (src/lib/observability/ops-events.ts). CRON_SECRET bearer only.
 * Schedule (pg_cron, every 5 minutes): `select cron.schedule('ops-events', '*\/5 * * * *', $$select public.dispatch_worker('/api/health/events')$$);`
 * Env (server only): BLACKWELLEN_EVENTS_URL, BLACKWELLEN_EVENTS_KEY_ID (default gala_dock-events in Vercel Production, gala_dock-events-staging elsewhere),
 * BLACKWELLEN_EVENTS_SECRET_HEX (the matching key: evt-gala_dock-production / evt-gala_dock-staging in the ops secret store).
 */
export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  // The bus scopes each key to one environment: gala_dock-events = production (the only one Watchtower projects), gala_dock-events-staging = staging.
  const environment = process.env.VERCEL_ENV === "production" ? "production" : "staging";
  const key = bwKey(process.env.BLACKWELLEN_EVENTS_KEY_ID || (environment === "production" ? "gala_dock-events" : "gala_dock-events-staging"), process.env.BLACKWELLEN_EVENTS_SECRET_HEX);
  const endpoint = process.env.BLACKWELLEN_EVENTS_URL?.trim() || null;
  if (!endpoint || !key) return NextResponse.json({ status: "dormant", missing: [!endpoint && "BLACKWELLEN_EVENTS_URL", !key && "BLACKWELLEN_EVENTS_SECRET_HEX"].filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
  const h = await collectOpsHealth(createAdminClient() as never, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    scanner: { configured: scannerConfigured(), misconfigured: scannerMisconfigured() }, errorReporting: errorReportingHealth().state });
  const r = await publishHeartbeat(h, { endpoint, key, environment, send: fetch });
  return NextResponse.json({ ...r, environment, components: Object.fromEntries(Object.entries(h.components).map(([k, c]) => [k, c.state])) },
    { status: r.status === "failed" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
}
