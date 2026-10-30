import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { workerTick } from "@/lib/agent/runtime";
import { withObservability } from "@/lib/observability/http";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Durable Gala Agent worker (§6–7). Called every minute by pg_cron → pg_net with the CRON_SECRET bearer.
 * Expires stale approvals, applies recorded decisions, fires compiled routines, then claims runs with a lease and advances
 * each by planning or executing steps with idempotency keys. Safe to run concurrently (skip-locked leases) and after restarts.
 */
export const GET = withObservability("agent.worker", async (request: Request) => {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const result = await workerTick();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}, { kind: "worker" });
export const POST = GET;
