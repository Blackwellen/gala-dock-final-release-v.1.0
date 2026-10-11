import Link from "next/link";
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import "@/styles/marketplace.css";
import "@/styles/ops.css";

type Domain = { key: string; label: string; state: "ready" | "attention" | "blocked" | "not_required"; reason: string; fix: string };
type Feas = { key: string; severity: "blocker" | "warning"; message: string; fix: string };
const ICON = { ready: CheckCircle2, attention: AlertTriangle, blocked: XCircle, not_required: MinusCircle };
const LABEL = { ready: "Ready", attention: "Attention", blocked: "Blocked", not_required: "Not required" };

/** Explainable readiness (§87) + feasibility warnings with fix paths (§88). No opaque score: every domain states why. */
export async function ReadinessPanel({ eventId, compact = false }: { eventId: string; compact?: boolean }) {
  const sb = await createClient();
  const { data, error } = await sb.rpc("event_readiness" as never, { p_event: eventId } as never);
  if (error || !data) return null;
  const r = data as { score: number; state: Domain["state"]; domains: Domain[]; feasibility: Feas[] };
  const shown = compact ? r.domains.filter(d => d.state === "blocked" || d.state === "attention") : r.domains;
  const counts = { ready: 0, attention: 0, blocked: 0, not_required: 0 };
  for (const d of r.domains) counts[d.state]++;
  return <section className="op-ready" aria-labelledby={`rd-${eventId}`}>
    <header><h2 id={`rd-${eventId}`}>Readiness</h2><span className={`op-state ${r.state}`}>{LABEL[r.state]}</span></header>
    <p className="mk-note">{counts.ready} ready · {counts.attention} need attention · {counts.blocked} blocked · {counts.not_required} not required</p>
    <ul className="op-domains">{shown.map(d => { const I = ICON[d.state]; return <li key={d.key} className={d.state}>
      <I size={15} aria-hidden="true" /><div><b>{d.label}</b><small>{d.reason}</small></div>
      {d.state !== "ready" && d.state !== "not_required" && <Link className="mk-link" href={d.fix}>Fix</Link>}<span className="sr-only">{LABEL[d.state]}</span></li>; })}</ul>
    {compact && !shown.length && <p className="mk-note">Everything that’s needed is in place.</p>}
    {r.feasibility.length > 0 && <div className="op-feas"><h3>Feasibility</h3><ul>{r.feasibility.map((f, i) => <li key={`${f.key}-${i}`} className={f.severity}>
      {f.severity === "blocker" ? <XCircle size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}<span>{f.message}</span><Link className="mk-link" href={f.fix}>Fix</Link></li>)}</ul></div>}
  </section>;
}

type Conflict = { kind: string; severity: "blocker" | "warning"; shift_id: string | null; event_id: string | null; message: string };
const KIND: Record<string, string> = { overlap: "Double-booked", travel: "Travel time", unavailable: "Unavailable", unfilled: "Unfilled", qualification: "Qualification", missing_role: "Missing role" };

/** Team conflict engine output (§85) for Team, Home, Plan and the Agent. */
export async function TeamConflicts({ workspaceId, eventId, limit = 20 }: { workspaceId: string; eventId?: string; limit?: number }) {
  const sb = await createClient();
  const { data, error } = await sb.rpc("team_conflicts" as never, { p_workspace: workspaceId } as never);
  if (error) return null;
  const rows = ((data ?? []) as Conflict[]).filter(c => !eventId || c.event_id === eventId).sort((a, b) => Number(b.severity === "blocker") - Number(a.severity === "blocker")).slice(0, limit);
  return <section className="op-ready" aria-labelledby="tc-h">
    <header><h2 id="tc-h">Team conflicts</h2><span className={`op-state ${rows.some(r => r.severity === "blocker") ? "blocked" : rows.length ? "attention" : "ready"}`}>{rows.length ? `${rows.length} found` : "None"}</span></header>
    {!rows.length ? <p className="mk-note">No overlapping shifts, travel clashes, unfilled roles or availability conflicts.</p> :
    <ul className="op-domains">{rows.map((c, i) => <li key={`${c.kind}-${c.shift_id ?? c.event_id}-${i}`} className={c.severity === "blocker" ? "blocked" : "attention"}>
      {c.severity === "blocker" ? <XCircle size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
      <div><b>{KIND[c.kind] ?? c.kind}</b><small>{c.message}</small></div>
      {c.event_id && <Link className="mk-link" href={`/organizer/events/${c.event_id}?tab=operations&section=team`}>Fix</Link>}</li>)}</ul>}
  </section>;
}
