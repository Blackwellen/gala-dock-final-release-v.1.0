import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, Chip } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { dateShort, time } from "@/lib/format";

export type Conflict = { kind: string; severity: string; event_id: string | null; event_name: string | null; ref_id: string; starts_at: string | null; message: string };
const TONE: Record<string, "red" | "amber" | "gray"> = { critical: "red", high: "red", medium: "amber", low: "gray" };
const LINK: Record<string, string> = { crew_deactivated: "operations&section=team",
  resource_over_allocated: "operations&section=logistics", resource_unavailable: "operations&section=logistics", run_sheet_delayed: "operations", incident_open: "operations&section=incidents", risk_high: "operations&section=risk" };

/** Server-detected schedule/resource conflicts (operational_conflicts / event_conflicts, Q17). Never computed in the browser. */
/** `skipCrew`: crew rows come from team_conflicts and are already shown by <TeamConflicts> on the same page. */
export async function ConflictsCard({ workspaceId, eventId, title = "Resource & live-ops conflicts", limit = 6, compact, skipCrew }: { workspaceId?: string; eventId?: string; title?: string; limit?: number; compact?: boolean; skipCrew?: boolean }) {
  const db = untyped(await createClient());
  const { data, error } = eventId ? await db.rpc("event_conflicts", { p_event: eventId }) : await db.rpc("operational_conflicts", { p_ws: workspaceId });
  if (error) return null;
  const all = ((data ?? []) as Conflict[]).filter(c => !skipCrew || !c.kind.startsWith("crew_") || c.kind === "crew_deactivated");
  const list = all.slice(0, limit);
  if (!list.length && compact) return null;
  return <Card aria-label={title}>
    <div className="k-between" style={{ marginBottom: 8 }}><h3 className="ov-h">{title}</h3>{all.length ? <Chip tone="red">{all.length}</Chip> : null}</div>
    {list.length ? <ul className="k-col" style={{ gap: 8, listStyle: "none", padding: 0, margin: 0 }}>{list.map(c => <li key={`${c.kind}:${c.ref_id}`} className="k-row" style={{ gap: 8, alignItems: "flex-start" }}>
      <AlertTriangle size={15} className={c.severity === "medium" ? "k-amber" : "k-red"} aria-hidden />
      <span className="k-grow k-small">{c.event_id ? <Link className="k-link" href={`/organizer/events/${c.event_id}?tab=${LINK[c.kind] ?? (c.kind.startsWith("crew_") ? "operations&section=team" : "operations")}`}>{c.message}</Link> : c.message}
        <span className="k-xs k-muted" style={{ display: "block" }}>{c.event_name ?? ""}{c.starts_at ? ` · ${dateShort(c.starts_at)} ${time(c.starts_at)}` : ""}</span></span>
      <Chip tone={TONE[c.severity] ?? "gray"}>{c.severity}</Chip></li>)}</ul>
      : <p className="k-small k-muted k-row" style={{ gap: 6 }}><CheckCircle2 size={14} className="k-green" aria-hidden />No schedule or resource conflicts detected.</p>}
  </Card>;
}
