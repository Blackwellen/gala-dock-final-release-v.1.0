import "server-only";
import type { Db } from "@/lib/workspace/db";
import { csvCell } from "@/lib/provider/csv";

/**
 * Q53 workspace export of Gala Agent activity (enterprise gap: owners could see runs on screen but not take them away). One CSV row
 * per run and per governed tool call, read through the person's own RLS client (agent_tool_calls is owners / managers only).
 * Tool arguments are never exported — only the tool, decision, outcome and refusal code, like the audit trail.
 */
export async function agentActivityCsv(db: Db, workspaceId: string, days: number) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const [{ data: runs }, { data: calls }] = await Promise.all([
    db.from("agent_runs").select("id,created_at,finished_at,mode,status,goal,summary,user_id,tokens,cost_cents,retries").eq("workspace_id", workspaceId).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    db.from("agent_tool_calls").select("run_id,started_at,tool_id,risk,decision,status,refusal,actor_id,duration_ms").eq("workspace_id", workspaceId).gte("started_at", since).order("started_at", { ascending: false }).limit(20000),
  ]);
  const cols = ["record", "run_id", "at", "finished_at", "mode_or_tool", "risk", "decision", "status", "refusal", "person", "goal", "summary", "tokens", "cost_pence", "retries_or_ms"];
  const line = (v: unknown[]) => v.map(csvCell).join(",");
  const out = [cols.join(",")];
  for (const r of (runs ?? []) as Record<string, unknown>[])
    out.push(line(["run", r.id, r.created_at, r.finished_at, r.mode, "", "", r.status, "", r.user_id, String(r.goal ?? "").slice(0, 500), String(r.summary ?? "").slice(0, 1000), r.tokens, r.cost_cents, r.retries]));
  for (const c of (calls ?? []) as Record<string, unknown>[])
    out.push(line(["tool_call", c.run_id, c.started_at, "", c.tool_id, c.risk, c.decision, c.status, c.refusal, c.actor_id, "", "", "", "", c.duration_ms]));
  return out.join("\n");
}

export const csvResponse = (body: string, name: string) => new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8",
  "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
export const exportDays = (url: string) => ({ "7d": 7, "30d": 30, "90d": 90, "365d": 365 } as Record<string, number>)[new URL(url).searchParams.get("range") ?? "30d"] ?? 30;
