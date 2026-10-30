import Link from "next/link";
import { GitBranch, CheckCircle2, AlertTriangle, Clock3, ArrowRight, ShieldCheck, Lock, Route } from "lucide-react";
import { Card, Chip, Empty } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { getDependencyGraph, type DependencyGraph } from "@/lib/events/plan";
import { dateShort, relative } from "@/lib/format";
import type { SectionProps } from "./types";
import { AddDependencyButton, RemoveDependencyButton, ApprovalDecision, TaskDependencyEditor, type DepOptions } from "./dependencies-client";

const KIND: Record<string, string> = { task: "Task", milestone: "Milestone", ticket_tier: "Ticket release", booking: "Booking", payment: "Payment", team: "Team", venue: "Venue", compliance: "Compliance", approval: "Approval" };
const TONE: Record<string, "blue" | "purple" | "green" | "amber" | "pink" | "gray"> = { task: "blue", ticket_tier: "purple", booking: "green", payment: "amber", team: "pink", venue: "green", compliance: "gray", approval: "amber" };
const lag = (m: number) => !m ? "" : m % 1440 === 0 ? `${m / 1440} d` : m % 60 === 0 ? `${m / 60} h` : `${m} min`;
const kindOf = (key: string) => key.split(":")[0] ?? "task";
type EdgeExtra = { id: string; approval_reason: string; approval_decided_at: string | null; created_at: string };

/**
 * Plan › Dependencies (Q14, domain 36): what waits for what. Live from `event_dependency_graph` — nodes, edges, met / blocked and
 * the critical path (longest chain of unmet hard prerequisites). Writes go through add/remove_event_dependency,
 * set_task_dependencies and decide_event_dependency_approval; the database rejects cycles, cross-event items and other roles.
 */
export async function DependenciesSection({ e, d, role }: SectionProps) {
  const client = await createClient(); const db = untyped(client);
  const [g, { data: perm }, { data: extra }] = await Promise.all([
    getDependencyGraph(e.id),
    db.rpc("has_permission", { p_workspace: e.workspace_id, p_permission: "events.write" }),
    db.from("event_dependencies").select("id,approval_reason,approval_decided_at,created_at").eq("event_id", e.id) as unknown as PromiseLike<{ data: EdgeExtra[] | null }>,
  ]);
  const canWrite = perm === true; const canDecide = ["owner", "manager"].includes(role);
  const readOnly = !canWrite ? `Your role (${role}) can view dependencies; owners, managers and members change them.` : null;
  const tasks = d.tasks.map(t => ({ id: t.id, label: t.title, milestone: (t as { milestone?: boolean }).milestone === true, done: t.status === "done" }));
  const options: DepOptions = {
    tasks, tiers: d.tiers.map(t => ({ id: t.id, label: t.name })),
    bookings: d.items.filter(b => !["cancelled", "declined", "suggested"].includes(b.status)).map(b => ({ id: b.id, label: `${b.title} (${b.category})` })),
    shifts: d.shifts.map(s => ({ id: s.id, label: `${s.title || s.role} · ${dateShort(s.starts_at)}` })),
  };
  if (!g.ok || !g.data) return <Card><Empty icon={GitBranch} title="Dependencies unavailable" text={g.error ?? "Could not load the dependency graph."} action={<Link className="k-btn outline" href={`/organizer/events/${e.id}?tab=plan&section=dependencies`}>Try again</Link>} /></Card>;
  const graph: DependencyGraph = g.data;
  const node = new Map(graph.nodes.map(n => [n.key, n]));
  const label = (k: string) => node.get(k)?.label ?? (kindOf(k) === "approval" ? "Approval" : "Removed item");
  const ex = new Map((extra ?? []).map(x => [x.id, x]));
  const blockedBy = new Map(graph.blocked.map(b => [b.key, b.blocked_by]));
  const groups = [...new Set(graph.edges.map(x => x.dependent))].map(k => ({ key: k, edges: graph.edges.filter(x => x.dependent === k) }))
    .sort((a, b) => Number(blockedBy.has(b.key)) - Number(blockedBy.has(a.key)) || label(a.key).localeCompare(label(b.key)));
  const hardUnmet = graph.edges.filter(x => x.hard && !x.met).length;
  const pending = graph.edges.filter(x => x.approval_status === "pending");
  // critical_path is [dependent, its prerequisite, …]: shown in the order work has to happen.
  const path = [...graph.critical_path].reverse();
  const current: Record<string, string[]> = {};
  for (const x of graph.edges) if (kindOf(x.dependent) === "task" && kindOf(x.prerequisite) === "task") (current[x.dependent.slice(5)] ??= []).push(x.prerequisite.slice(5));

  return <div className="dp">
    <div className="dp-kpis" role="list" aria-label="Dependency summary">
      {([[GitBranch, String(graph.edges.length), "Dependencies", "blue"], [CheckCircle2, String(graph.edges.filter(x => x.met).length), "Met", "green"], [AlertTriangle, String(hardUnmet), "Blocking (hard, unmet)", hardUnmet ? "red" : "green"], [ShieldCheck, String(pending.length), "Approvals waiting", pending.length ? "amber" : "gray"]] as const).map(([I, v, l, t]) =>
        <div key={l} role="listitem" className="k-card dp-kpi"><span className={`k-tile sm ${t}`}><I size={14} /></span><span><b>{v}</b><small>{l}</small></span></div>)}
    </div>

    <Card className="dp-path-card"><div className="k-between"><div><h2 className="ov-h" style={{ fontSize: 15.5 }}><Route size={15} /> Critical path</h2><p className="k-small">The longest chain of hard prerequisites still to be met — finish these in order to unblock the end of the chain.</p></div>{path.length > 0 && <Chip tone="red">{path.length} steps</Chip>}</div>
      {path.length ? <ol className="dp-path">{path.map((k, i) => <li key={`${k}-${i}`} className={node.get(k)?.met ? "met" : ""}><span className={`dp-dot ${node.get(k)?.met ? "met" : i === path.length - 1 ? "end" : ""}`} aria-hidden /><span className="dp-path-l"><b>{label(k)}</b><small>{KIND[kindOf(k)]}{node.get(k)?.due_at ? ` · due ${dateShort(node.get(k)!.due_at!)}` : ""}{node.get(k)?.met ? " · met" : ""}</small></span>{i < path.length - 1 && <ArrowRight size={14} className="k-muted dp-arrow" aria-hidden />}</li>)}</ol>
        : <p className="k-small k-muted dp-none"><CheckCircle2 size={14} className="k-green" /> Nothing on the critical path — every hard dependency is met{graph.edges.length ? "" : " (none set yet)"}.</p>}</Card>

    <div className="dp-grid">
      <Card flush><div className="k-between dp-head"><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Dependency graph</h2><p className="k-small">Grouped by the item that waits. Hard dependencies block it (a task can’t be completed, a ticket release can’t go on sale); soft ones only warn.</p></div>
        {canWrite ? <AddDependencyButton eventId={e.id} options={options} /> : <span className="k-xs k-muted dp-ro"><Lock size={12} />{readOnly}</span>}</div>
        {groups.length === 0 ? <Empty icon={GitBranch} title="No dependencies yet" text="Link tasks, ticket releases and bookings to what they wait for — a confirmed venue, a paid deposit, a filled shift or a sign-off — and Gala Dock blocks them until it’s done." action={canWrite ? <AddDependencyButton eventId={e.id} options={options} variant="primary" /> : undefined} />
          : <ul className="dp-groups">{groups.map(gr => { const bl = blockedBy.get(gr.key) ?? []; const soft = gr.edges.some(x => !x.hard && !x.met); return <li key={gr.key} className={`dp-group ${bl.length ? "blocked" : ""}`}>
            <div className="dp-gh"><Chip tone={TONE[kindOf(gr.key)] ?? "blue"}>{KIND[kindOf(gr.key)]}</Chip><b className="k-grow">{label(gr.key)}</b>
              {bl.length ? <Chip tone="red" icon={AlertTriangle}>Blocked</Chip> : soft ? <Chip tone="amber" icon={Clock3}>Waiting (soft)</Chip> : <Chip tone="green" icon={CheckCircle2}>Ready</Chip>}</div>
            {bl.length > 0 && <div className="dp-by"><span className="k-xs k-muted">Blocked by</span>{bl.map(k => <span key={k} className="dp-chip">{label(k)}</span>)}</div>}
            <ul className="dp-edges">{gr.edges.map(x => { const pk = kindOf(x.prerequisite); const xx = ex.get(x.id); return <li key={x.id} className={x.met ? "met" : x.hard ? "unmet" : "soft"}>
              <span className="dp-wait k-xs k-muted">waits for</span>
              <span className="dp-pre"><b>{label(x.prerequisite)}</b><small>{KIND[pk]}{x.lag_minutes ? ` · +${lag(x.lag_minutes)} after` : ""}{x.note ? ` · ${x.note}` : ""}</small>
                {pk === "approval" && <small className={x.approval_status === "approved" ? "k-green" : x.approval_status === "rejected" || x.approval_status === "expired" ? "k-red" : "k-amber"}>Approval {x.approval_status}{x.approval_expires_at && x.approval_status === "pending" ? ` · expires ${dateShort(x.approval_expires_at)}` : ""}{xx?.approval_decided_at ? ` · decided ${relative(xx.approval_decided_at)}` : ""}{xx?.approval_reason ? ` · “${xx.approval_reason}”` : ""}</small>}</span>
              <span className="dp-tags"><Chip tone={x.hard ? "outline" : "gray"}>{x.hard ? "Hard" : "Soft"}</Chip>{x.met ? <Chip tone="green">Met</Chip> : <Chip tone={x.hard ? "red" : "amber"}>Not met</Chip>}</span>
              <span className="dp-act">{pk === "approval" && x.approval_status === "pending" && (canDecide ? <ApprovalDecision id={x.id} label={label(gr.key)} /> : <span className="k-xs k-muted" title="Owners and managers decide approvals">Owner / manager decides</span>)}
                {canWrite && <RemoveDependencyButton id={x.id} label={`${label(gr.key)} → ${label(x.prerequisite)}`} />}</span></li>; })}</ul></li>; })}</ul>}
      </Card>
      <div className="k-col" style={{ gap: 14 }}>
        <Card><h3 className="ov-h">Waiting on others</h3><p className="k-small" style={{ marginBottom: 8 }}>Items blocked right now and what they need.</p>
          {graph.blocked.length ? <ul className="dp-blocked">{graph.blocked.map(b => <li key={b.key}><AlertTriangle size={14} className="k-red" aria-hidden /><span className="k-grow"><b>{label(b.key)}</b><span className="dp-by">{b.blocked_by.map(k => <span key={k} className="dp-chip">{label(k)}</span>)}</span></span></li>)}</ul>
            : <p className="k-small k-muted"><CheckCircle2 size={14} className="k-green" /> Nothing is blocked.</p>}</Card>
        <Card><h3 className="ov-h">Task dependencies</h3><p className="k-small" style={{ marginBottom: 10 }}>Choose a task and tick the tasks it depends on. It can’t be marked done until they are.</p>
          {tasks.length < 2 ? <Empty icon={GitBranch} title="Add tasks first" text="Task dependencies need at least two tasks." action={<Link className="k-btn outline sm" href={`/organizer/events/${e.id}?tab=plan&section=tasks`}>Go to tasks</Link>} />
            : canWrite ? <TaskDependencyEditor tasks={tasks} current={current} /> : <p className="k-xs k-muted">{readOnly}</p>}</Card>
      </div>
    </div>
  </div>;
}
