import { AlertTriangle, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { TeamConflicts } from "@/components/ops/readiness-panel";
import { ConflictsCard } from "./conflicts-card";

/**
 * W03 consistency: Home, Calendar and the event Operations tab showed the full team-conflict and live-ops lists above the page's
 * designed first row, pushing the design layout down by 150–300px. This keeps the same server-detected conflicts (team_conflicts,
 * operational_conflicts / event_conflicts — never computed in the browser) behind a one-line disclosure with the counts.
 * Renders nothing when there are no conflicts.
 */
export async function ConflictsStrip({ workspaceId, eventId, limit = 5 }: { workspaceId: string; eventId?: string; limit?: number }) {
  const db = untyped(await createClient());
  const [team, ops] = await Promise.all([
    db.rpc("team_conflicts", { p_workspace: workspaceId }),
    eventId ? db.rpc("event_conflicts", { p_event: eventId }) : db.rpc("operational_conflicts", { p_ws: workspaceId }),
  ]);
  const teamRows = ((team.data ?? []) as { event_id: string | null; severity: string }[]).filter(c => !eventId || c.event_id === eventId);
  const opsRows = ((ops.data ?? []) as { kind: string; severity: string }[]).filter(c => eventId || !c.kind.startsWith("crew_") || c.kind === "crew_deactivated");
  // On an event, event_conflicts already includes the crew rows from the same engine, so only that list is shown.
  const nTeam = team.error || eventId ? 0 : teamRows.length, nOps = ops.error ? 0 : opsRows.length;
  if (!nTeam && !nOps) return null;
  const urgent = (!eventId && teamRows.some(r => r.severity === "blocker")) || opsRows.some(r => ["high", "critical"].includes(r.severity));
  const parts = [nTeam ? `${nTeam} team conflict${nTeam === 1 ? "" : "s"}` : "", nOps ? `${nOps} ${eventId ? "event" : "live-ops"} conflict${nOps === 1 ? "" : "s"}` : ""].filter(Boolean);
  return <details className={`o-conf-strip${urgent ? " urgent" : ""}`}>
    <summary><AlertTriangle size={15} aria-hidden /><b>Needs attention</b><span>{parts.join(" · ")}</span><span className="o-conf-more">Review<ChevronDown size={14} aria-hidden /></span></summary>
    <div className="o-conf-body">
      {nTeam > 0 && <TeamConflicts workspaceId={workspaceId} eventId={eventId} limit={limit} headingId={eventId ? "tc-ev-h" : "tc-ws-h"} hideEmpty />}
      {nOps > 0 && <ConflictsCard workspaceId={eventId ? undefined : workspaceId} eventId={eventId} title={eventId ? "Conflicts for this event" : "Resource & live-ops conflicts"} limit={limit} compact skipCrew={!eventId} />}
    </div>
  </details>;
}
