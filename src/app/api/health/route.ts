import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readiness } from "@/lib/release/integrations";
import { maintenanceState } from "@/lib/maintenance";
import { healthContracts } from "@/lib/release/health-contracts";
import { errorReportingHealth } from "@/lib/observability/errors";
import { withObservability } from "@/lib/observability/http";

export const dynamic = "force-dynamic";
const bearerOk = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};
/** Ops access: the CRON_SECRET bearer (uptime monitor, workers) or a signed-in platform admin with settings / agent_ops / audit. */
async function opsCaller(request: Request): Promise<"bearer" | "admin" | null> {
  if (bearerOk(request.headers.get("authorization"))) return "bearer";
  if (!request.headers.get("cookie")?.includes("sb-")) return null;
  try { const { data } = await (await createClient()).rpc("ops_can_read" as never); return data === true ? "admin" : null; } catch { return null; }
}
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Health and readiness (release spec §136–137, Q34). Public (anon): liveness, database reachability, maintenance level and
 * latency only — no configuration, versions, counts or names. Ops callers additionally get integration readiness (env NAMES
 * only, never values), contracts, cron freshness against each job's schedule, queue / outbox / dead letters, backups and
 * restore drills, SLO status, open alerts and incidents, the latest synthetic probe results and error-reporting configuration.
 * `?probe=storage` (ops only) also lists storage buckets as a reachability check. One snapshot per minute is kept 30 days.
 */
export const GET = withObservability("api.health", async (request: Request) => {
  const t0 = Date.now();
  const db = createAdminClient();
  const { error } = await db.from("workspaces").select("id", { head: true, count: "exact" }).limit(1);
  const ws = await maintenanceState();
  const base = { status: error ? "degraded" : "ok", db: error ? "unreachable" : "ok", maintenance: Math.max(0, ...ws.map(w => w.level)), latency_ms: Date.now() - t0, at: new Date().toISOString() };
  const caller = await opsCaller(request);
  if (!caller) return NextResponse.json(base, { status: error ? 503 : 200, headers: NO_STORE });
  const ago = (iso: string | null | undefined) => iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null;
  const wantStorage = new URL(request.url).searchParams.get("probe") === "storage";
  const [ints, jobs, runs, pay, refunds, ticketRefunds, hooks, mail, ops, storage] = await Promise.all([
    readiness(true),
    db.rpc("cron_job_status" as never),
    db.from("agent_runs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "retrying"]),
    db.from("payment_orders" as never).select("id", { count: "exact", head: true }).eq("status", "eligible_for_provider_transfer"),
    db.from("booking_cancellations" as never).select("id", { count: "exact", head: true }).in("refund_status", ["due", "processing", "failed"]),
    db.from("checkout_orders" as never).select("order_ref", { count: "exact", head: true }).in("refund_status", ["due", "processing", "failed"]),
    db.from("webhook_events" as never).select("received_at").order("received_at", { ascending: false }).limit(1),
    db.from("email_outbox" as never).select("id", { count: "exact", head: true }).in("status", ["queued", "failed"]),
    db.rpc("ops_health_summary" as never).then(r => (r.error ? null : r.data) as Record<string, unknown> | null, () => null),
    wantStorage ? db.storage.listBuckets().then(r => ({ ok: !r.error, buckets: r.data?.length ?? 0 }), () => ({ ok: false, buckets: 0 })) : Promise.resolve(null),
  ]);
  // Q04/Q05/Q29/Q30 integration contracts (env names only, never values) + Q31 queue health.
  const { raw: contracts, list } = await healthContracts(db as never);
  const errorReporting = errorReportingHealth();
  const openCritical = ((ops?.alerts_open ?? []) as { severity: string }[]).filter(a => a.severity === "critical").length;
  const degraded = Boolean(error) || ints.some(i => i.critical && i.status === "degraded") || list.some(c => c.key === "queue" && c.state === "degraded") || (storage !== null && !storage.ok);
  await db.rpc("record_health_snapshot" as never, { p_status: error ? "down" : degraded ? "degraded" : "ok",
    p_components: { db: base.db, latency_ms: base.latency_ms, maintenance: base.maintenance, integrations: Object.fromEntries(ints.map(i => [i.key, i.status])),
      contracts: Object.fromEntries(list.map(c => [c.key, c.state])), alerts_critical: openCritical, error_reporting: errorReporting.state } } as never).then(() => null, () => null);
  return NextResponse.json({ ...base, status: error ? "degraded" : degraded ? "degraded" : "ok", caller, integrations: ints, contracts, workers: jobs.data ?? null,
    backlog: { agent_runs_active: runs.count ?? 0, payouts_due: pay.count ?? 0, refunds_pending: refunds.count ?? 0, ticket_refunds_pending: ticketRefunds.count ?? 0, email_queued: mail.count ?? 0 },
    last_webhook_min_ago: ago((hooks.data as { received_at: string }[] | null)?.[0]?.received_at),
    error_reporting: { state: errorReporting.state, provider: errorReporting.provider, env: errorReporting.env, optional_env: errorReporting.optionalEnv, issues: errorReporting.issues },
    ...(storage ? { storage } : {}),
    ops }, { headers: NO_STORE });
}, { kind: "route" });
