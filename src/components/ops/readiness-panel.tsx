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
export async function ReadinessPanel({ eventId, compact = false, lifecycle = true }: { eventId: string; compact?: boolean; /** Also show what blocks the next lifecycle step (W11). */ lifecycle?: boolean }) {
  const sb = await createClient();
  const { data, error } = await sb.rpc("event_readiness" as never, { p_event: eventId } as never);
  if (error || !data) return null;
  const gates = lifecycle ? await lifecycleGates(sb, eventId) : null;
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
    {gates && gates.groups.length > 0 && <div className="op-feas"><h3>Before it can be published or go on sale</h3>{gates.groups.map(g => <div key={g.title} className="op-gate"><small className="op-gate-h">{g.title}</small><ul>{g.items.map((b, i) => <li key={`${b.key}-${i}`} className="blocker">
      <XCircle size={14} aria-hidden="true" /><span>{b.label}</span>{b.fix?.startsWith("/") ? <Link className="mk-link" href={b.fix}>Fix</Link> : <span />}</li>)}</ul></div>)}</div>}
  </section>;
}

type Blocker = { key: string; label: string; fix?: string };
const COMPOSITION = new Set(["parent_not_published", "series_archived", "pass_component_cancelled", "children_unhandled"]);
const TICKETING = new Set(["tickets", "payouts", "ticketing"]);
/**
 * W11: the lifecycle preconditions (event_lifecycle_blockers — event type, date, venue, stream, programme; ticketing policy,
 * tiers and payouts; Q40 composition) for the event's next step towards selling, grouped. Only before the first publish:
 * already published / on-sale / live events are never re-gated by the database, so nothing is shown for them.
 */
async function lifecycleGates(sb: Awaited<ReturnType<typeof createClient>>, eventId: string) {
  const { data: e } = await sb.from("events").select("status").eq("id", eventId).maybeSingle();
  if (!e || !["draft", "planning", "ready"].includes(e.status)) return null;
  const call = (to: string) => sb.rpc("event_lifecycle_blockers" as never, { p_event: eventId, p_to: to } as never) as unknown as PromiseLike<{ data: Blocker[] | null; error: unknown }>;
  const [pub, sale] = await Promise.all([call("published"), call("on_sale")]);
  if (pub.error && sale.error) return null;
  const seen = new Set<string>(); const all: Blocker[] = [];
  // The type rule "never listed publicly" is not something to fix (those events are shared by private link), so it is left out.
  for (const b of [...(pub.data ?? []), ...(sale.data ?? [])]) if (b && b.key !== "public_listing" && !seen.has(b.key)) { seen.add(b.key); all.push(b); }
  const groups = [
    { title: "Event set-up", items: all.filter(b => !COMPOSITION.has(b.key) && !TICKETING.has(b.key)) },
    { title: "Ticketing", items: all.filter(b => TICKETING.has(b.key)) },
    { title: "Series, passes and sub-events", items: all.filter(b => COMPOSITION.has(b.key)) },
  ].filter(g => g.items.length);
  return { groups };
}

type Conflict = { kind: string; severity: "blocker" | "warning"; shift_id: string | null; event_id: string | null; message: string };
const KIND: Record<string, string> = { overlap: "Double-booked", travel: "Travel time", unavailable: "Unavailable", unfilled: "Unfilled", unconfirmed: "Not confirmed", qualification: "Qualification", missing_role: "Missing role" };

/** Team conflict engine output (§85) for Team, Home, Plan and the Agent. */
export async function TeamConflicts({ workspaceId, eventId, limit = 20, headingId = "tc-h", hideEmpty = false }: { workspaceId: string; eventId?: string; limit?: number; headingId?: string; /** Render nothing when there are no conflicts (pages whose design has no empty "None" strip). */ hideEmpty?: boolean }) {
  const sb = await createClient();
  const { data, error } = await sb.rpc("team_conflicts" as never, { p_workspace: workspaceId } as never);
  if (error) return null;
  const rows = ((data ?? []) as Conflict[]).filter(c => !eventId || c.event_id === eventId).sort((a, b) => Number(b.severity === "blocker") - Number(a.severity === "blocker")).slice(0, limit);
  if (hideEmpty && !rows.length) return null;
  return <section className="op-ready" aria-labelledby={headingId}>
    <header><h2 id={headingId}>Team conflicts</h2><span className={`op-state ${rows.some(r => r.severity === "blocker") ? "blocked" : rows.length ? "attention" : "ready"}`}>{rows.length ? `${rows.length} found` : "None"}</span></header>
    {!rows.length ? <p className="mk-note">No overlapping shifts, travel clashes, unfilled roles or availability conflicts.</p> :
    <ul className="op-domains">{rows.map((c, i) => <li key={`${c.kind}-${c.shift_id ?? c.event_id}-${i}`} className={c.severity === "blocker" ? "blocked" : "attention"}>
      {c.severity === "blocker" ? <XCircle size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
      <div><b>{KIND[c.kind] ?? c.kind}</b><small>{c.message}</small></div>
      {c.event_id && <Link className="mk-link" href={`/organizer/events/${c.event_id}?tab=operations&section=team`}>Fix</Link>}</li>)}</ul>}
  </section>;
}
