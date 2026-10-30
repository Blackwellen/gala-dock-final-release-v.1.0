// Q41/Q43 backfill: recompute agent_routines.next_run_at with the shared parser (src/lib/agent/schedule.ts), Europe/London.
// Idempotent and bounded (≤ 500 routines per pass, enabled routines only). Dry run by default: prints old → new and writes nothing.
//   node --env-file=.env --env-file=.env.local scripts/agent/backfill-routine-schedules.mjs            # dry run
//   node --env-file=.env --env-file=.env.local scripts/agent/backfill-routine-schedules.mjs --apply    # write
// It never creates runs or calls the model. Note: applying moves interval routines (e.g. "Every 30 min") to their real cadence, so the
// live worker will run them that often — confirm with the owner before applying on demo workspaces.
import { createClient } from "@supabase/supabase-js";
import { parseSchedule, nextRunAt, FAR_FUTURE_ISO } from "../../src/lib/agent/schedule.ts";

const apply = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const now = new Date();
const occ = async (wsId) => {
  const since = new Date(Date.now() - 3 * 864e5).toISOString(), until = new Date(Date.now() + 90 * 864e5).toISOString();
  const { data: ws } = await db.from("workspaces").select("kind").eq("id", wsId).maybeSingle();
  if (ws?.kind === "provider") return (await db.from("provider_jobs").select("id,starts_at,ends_at").eq("workspace_id", wsId).in("status", ["held", "confirmed", "active"]).gte("starts_at", since).lte("starts_at", until).limit(500)).data ?? [];
  return (await db.from("events").select("id,starts_at,ends_at").eq("workspace_id", wsId).not("starts_at", "is", null).not("status", "in", "(cancelled,archived)").gte("starts_at", since).lte("starts_at", until).limit(500)).data ?? [];
};
const { data: routines, error } = await db.from("agent_routines").select("id,workspace_id,title,schedule,trigger,enabled,next_run_at,last_run_at").eq("enabled", true).order("created_at").limit(500);
if (error) throw error;
const rows = [];
for (const r of routines) {
  const spec = parseSchedule(r.schedule, r.trigger);
  const next = spec ? nextRunAt(spec, now, { lastRun: r.last_run_at ? new Date(r.last_run_at) : null, occurrences: spec.kind === "relative" ? await occ(r.workspace_id) : undefined })?.at ?? null : null;
  const to = (next ?? new Date(FAR_FUTURE_ISO)).toISOString();
  const same = r.next_run_at && Math.abs(new Date(r.next_run_at).getTime() - new Date(to).getTime()) < 60000;
  rows.push({ id: r.id.slice(0, 8), title: r.title.slice(0, 40), schedule: r.schedule, parsed: spec?.kind ?? "UNPARSEABLE", from: r.next_run_at, to, change: !same });
  if (apply && !same) { const u = await db.from("agent_routines").update({ next_run_at: to }).eq("id", r.id).eq("enabled", true); if (u.error) throw u.error; }
}
console.table(rows);
console.log(apply ? `applied ${rows.filter(x => x.change).length} change(s)` : `dry run: ${rows.filter(x => x.change).length} change(s) would be written (pass --apply)`);
