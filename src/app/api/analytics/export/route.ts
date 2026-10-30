import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/security";
import { downloadExport, EXPORT_DATASETS, range, requestExport, type ExportDataset } from "@/lib/analytics/server";

/**
 * Q35 export datasets (266.5). POST {dataset, workspace|null, from, to} queues an async export (permission checked at request and
 * generation; 10 per hour; audited). GET ?id= downloads it once ready (permission re-checked, 24 h expiry, audited).
 * Platform-wide exports (workspace null) need the analytics admin permission with MFA.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "cross_site" }, 403);
  const b = await request.json().catch(() => null) as { dataset?: string; workspace?: string | null; from?: string; to?: string; includeDemo?: boolean } | null;
  if (!b || !EXPORT_DATASETS.includes(b.dataset as ExportDataset)) return json({ error: "invalid_dataset" }, 400);
  if (b.workspace != null && !UUID.test(b.workspace)) return json({ error: "invalid_workspace" }, 400);
  const span = range(b.from ?? null, b.to ?? null);
  if (!span) return json({ error: "invalid_range" }, 400);
  const r = await requestExport(b.dataset as ExportDataset, b.workspace ?? null, span.from, span.to, b.includeDemo === true);
  return r.ok ? json({ id: r.data, status: "queued" }, 202) : json({ error: r.error }, r.status);
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) return json({ error: "invalid_id" }, 400);
  const r = await downloadExport(id);
  if (!r.ok) return json({ error: r.error }, r.status);
  if (r.data.status !== "ready" || r.data.csv == null) return json({ status: r.data.status, error: r.data.error ?? null }, r.data.status === "expired" ? 410 : 202);
  return new Response(r.data.csv, { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="gala-dock-${r.data.dataset}-${id.slice(0, 8)}.csv"`, "Cache-Control": "private, no-store" } });
}
