import { NextResponse } from "next/server";
import { eventReport, range, trend, workspaceMetrics } from "@/lib/analytics/server";

/**
 * Q35 workspace dashboard reads. GET ?workspace=<uuid>&from=&to=[&keys=a,b] → active metric values (+ previous period);
 * ?metric=&grain= → trend; ?event=<uuid> → event report. Runs as the signed-in user: the SQL functions check membership and role
 * (finance metrics: owner/manager/finance), so a guessed workspace id returns 403.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const event = q.get("event");
  if (event) {
    if (!UUID.test(event)) return json({ error: "invalid_event" }, 400);
    const r = await eventReport(event);
    return r.ok ? json(r.data) : json({ error: r.error }, r.status);
  }
  const ws = q.get("workspace");
  if (!ws || !UUID.test(ws)) return json({ error: "invalid_workspace" }, 400);
  const span = range(q.get("from"), q.get("to"));
  if (!span) return json({ error: "invalid_range" }, 400);
  const metric = q.get("metric");
  if (metric) {
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(metric)) return json({ error: "invalid_metric" }, 400);
    const g = q.get("grain");
    const r = await trend(metric, ws, span.from, span.to, g === "week" || g === "month" ? g : "day");
    return r.ok ? json(r.data) : json({ error: r.error }, r.status);
  }
  const keys = (q.get("keys") ?? "").split(",").filter(k => /^[a-z][a-z0-9_]{1,62}$/.test(k)).slice(0, 50);
  const r = await workspaceMetrics(ws, span.from, span.to, keys);
  return r.ok ? json(r.data) : json({ error: r.error }, r.status);
}
