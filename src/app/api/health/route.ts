import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { readiness } from "@/lib/release/integrations";
import { maintenanceState } from "@/lib/maintenance";

export const dynamic = "force-dynamic";
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Health (release spec §136–137). Public: liveness + database reachability + maintenance level only (no configuration detail).
 * With the CRON_SECRET bearer (uptime monitor / ops): integration readiness, worker freshness and backlog counts.
 */
export async function GET(request: Request) {
  const t0 = Date.now();
  const db = createAdminClient();
  const { error } = await db.from("workspaces").select("id", { head: true, count: "exact" }).limit(1);
  const ws = await maintenanceState();
  const base = { status: error ? "degraded" : "ok", db: error ? "unreachable" : "ok", maintenance: Math.max(0, ...ws.map(w => w.level)), latency_ms: Date.now() - t0, at: new Date().toISOString() };
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json(base, { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  const ago = (iso: string | null | undefined) => iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null;
  const [ints, jobs, runs, pay, refunds, ticketRefunds, hooks, mail] = await Promise.all([
    readiness(true),
    db.rpc("cron_job_status" as never),
    db.from("agent_runs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "retrying"]),
    db.from("payment_orders" as never).select("id", { count: "exact", head: true }).eq("status", "eligible_for_provider_transfer"),
    db.from("booking_cancellations" as never).select("id", { count: "exact", head: true }).in("refund_status", ["due", "processing", "failed"]),
    db.from("checkout_orders" as never).select("order_ref", { count: "exact", head: true }).in("refund_status", ["due", "processing", "failed"]),
    db.from("webhook_events" as never).select("received_at").order("received_at", { ascending: false }).limit(1),
    db.from("email_outbox" as never).select("id", { count: "exact", head: true }).in("status", ["queued", "failed"]),
  ]);
  return NextResponse.json({ ...base, integrations: ints, workers: jobs.data ?? null,
    backlog: { agent_runs_active: runs.count ?? 0, payouts_due: pay.count ?? 0, refunds_pending: refunds.count ?? 0, ticket_refunds_pending: ticketRefunds.count ?? 0, email_queued: mail.count ?? 0 },
    last_webhook_min_ago: ago((hooks.data as { received_at: string }[] | null)?.[0]?.received_at) }, { headers: { "Cache-Control": "no-store" } });
}
