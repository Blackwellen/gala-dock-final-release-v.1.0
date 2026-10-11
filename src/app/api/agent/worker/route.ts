import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { providerSnapshot, askProviderAgent, PROPOSAL_ACTIONS } from "@/lib/provider/agent";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};
const nextFrom = (schedule: string, from: number) => /30 min/i.test(schedule) ? from + 30 * 6e4 : /hour/i.test(schedule) ? from + 36e5 : /week/i.test(schedule) ? from + 7 * 864e5 : from + 864e5;

/**
 * Durable agent worker — call on a schedule with `Authorization: Bearer $CRON_SECRET`.
 * 1) Due routines enqueue runs (idempotent per routine slot). 2) Queued provider runs are claimed atomically, analysed against a
 * workspace-scoped snapshot, and either completed with findings or parked as waiting_approval with proposals.
 * Runs never change bookings, money or listings by themselves; failures retry up to 3 times.
 */
export async function GET(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return json({ error: "Unauthorised" }, 401);
  const db = untyped(createAdminClient() as never);
  const now = Date.now(), done: { run: string; status: string }[] = [];
  const { data: due } = await db.from("agent_routines").select("id,workspace_id,title,detail,schedule,next_run_at").eq("enabled", true).lte("next_run_at", new Date(now).toISOString()).limit(20);
  for (const r of due ?? []) {
    await db.from("agent_runs").insert({ workspace_id: r.workspace_id, surface: "provider", goal: `${r.title}: ${r.detail}`.slice(0, 2000), status: "queued", routine_id: r.id, idempotency_key: `routine:${r.id}:${r.next_run_at}`, plan: [] });
    await db.from("agent_routines").update({ last_run_at: new Date(now).toISOString(), next_run_at: new Date(nextFrom(r.schedule, now)).toISOString() }).eq("id", r.id);
  }
  const { data: runs } = await db.from("agent_runs").select("id,workspace_id,goal,retries").eq("surface", "provider").eq("status", "queued").order("created_at").limit(5);
  for (const run of runs ?? []) {
    const { data: claimed } = await db.from("agent_runs").update({ status: "running", current_step: 1, progress: 10, updated_at: new Date().toISOString() }).eq("id", run.id).eq("status", "queued").select("id");
    if (!claimed?.length) continue; // another worker took it
    try {
      const out = await askProviderAgent(await providerSnapshot(db, run.workspace_id), run.goal);
      if (out === null) {
        await db.from("agent_runs").update({ status: "waiting_external", waiting_reason: "Agent model not configured", progress: 10, updated_at: new Date().toISOString() }).eq("id", run.id);
        done.push({ run: run.id, status: "waiting_external" }); continue;
      }
      const proposals = out.proposals.filter(p => PROPOSAL_ACTIONS.includes(p.action));
      for (const p of proposals) await db.from("agent_approvals").insert({ run_id: run.id, workspace_id: run.workspace_id, title: p.title.slice(0, 140), detail: p.detail.slice(0, 600), action: p.action, payload: p.payload, impact: p.impact.slice(0, 200), status: "pending", expires_at: new Date(now + 72 * 36e5).toISOString() });
      const status = proposals.length ? "waiting_approval" : "completed";
      await db.from("agent_runs").update({ status, progress: proposals.length ? 80 : 100, current_step: 3, result: out.reply.slice(0, 4000), waiting_reason: proposals.length ? "Waiting for your approval" : "",
        plan: [{ step: "Read workspace snapshot", done: true }, { step: "Analyse against goal", done: true }, { step: proposals.length ? `Proposed ${proposals.length} action(s) for approval` : "Report findings", done: !proposals.length }],
        finished_at: proposals.length ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", run.id);
      done.push({ run: run.id, status });
    } catch (e) {
      const retries = (run.retries ?? 0) + 1;
      await db.from("agent_runs").update({ status: retries >= 3 ? "failed" : "queued", retries, errors: [{ at: new Date().toISOString(), message: (e as Error).message.slice(0, 300) }], updated_at: new Date().toISOString() }).eq("id", run.id);
      done.push({ run: run.id, status: retries >= 3 ? "failed" : "retry" });
    }
  }
  return json({ routines: (due ?? []).length, processed: done });
}
