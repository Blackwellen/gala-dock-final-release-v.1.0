import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAppJobs, runDbJobs, type ServiceDb } from "@/lib/foundation";
import { APP_JOB_HANDLERS } from "@/lib/foundation/handlers";
import { withObservability } from "@/lib/observability/http";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Canonical job worker (Q03). Called by pg_cron every minute (foundation-app-jobs) with the CRON_SECRET bearer.
 * Publishes the domain outbox and runs due in-database jobs (pg_cron also does this directly), then runs app-runtime
 * jobs through the handler registry. Leases make overlapping invocations safe.
 */
export const POST = withObservability("cron.jobs", async (request: Request) => {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const db = createAdminClient() as unknown as ServiceDb;
  const kinds = new URL(request.url).searchParams.get("kinds")?.split(",").filter(k => /^[a-z][a-z0-9_.]{2,80}$/.test(k));
  const dbJobs = await runDbJobs(db, { limit: 100, kinds: kinds?.length ? kinds : undefined });
  const appJobs = await runAppJobs(db, APP_JOB_HANDLERS, { limit: 25, kinds: kinds?.length ? kinds : undefined });
  return NextResponse.json({ db: dbJobs, app: appJobs }, { headers: { "Cache-Control": "no-store" } });
}, { kind: "worker" });
export const GET = POST;
