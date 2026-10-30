import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/admin/context";
import { sameOrigin } from "@/lib/security";
import { evaluateExperiment, experimentsOverview, transitionExperiment, type ExperimentAction } from "@/lib/experiments/server";

/**
 * Q36 Admin → Settings → Experiments data (settings permission). GET → overview (status, variants, assignment/exposure counts,
 * last guardrail check, kill switch, holdouts); GET ?id= → evaluation per variant and guardrail. POST {id, action, reason} →
 * lifecycle action (MFA + reason; pricing/legal need a second admin's approval; audited).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: ExperimentAction[] = ["submit", "approve", "reject", "start", "pause", "resume", "stop", "complete", "archive", "reopen"];
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("settings")) return json({ error: "forbidden" }, 403);
  const id = new URL(request.url).searchParams.get("id");
  const r = id ? (UUID.test(id) ? await evaluateExperiment(id) : { ok: false as const, error: "invalid_id" }) : await experimentsOverview();
  return r.ok ? json(r.data) : json({ error: r.error }, 400);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "cross_site" }, 403);
  const ctx = await getAdmin();
  if (!ctx.permissions.has("settings")) return json({ error: "forbidden" }, 403);
  const b = await request.json().catch(() => null) as { id?: string; action?: string; reason?: string } | null;
  if (!b?.id || !UUID.test(b.id) || !ACTIONS.includes(b.action as ExperimentAction)) return json({ error: "invalid_request" }, 400);
  const r = await transitionExperiment(b.id, b.action as ExperimentAction, String(b.reason ?? ""));
  return r.ok ? json(r.data) : json({ error: r.error }, /not_authorized|four_eyes|approval/.test(r.error) ? 403 : 400);
}
