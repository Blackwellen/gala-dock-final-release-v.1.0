import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Zap, CircleCheck, TriangleAlert, Clock3, Layers, Upload, Play, ChevronDown, Filter, ArrowRight, ChevronRight, CalendarDays, RotateCcw, ChartLine, Pause, ShieldCheck, FileText,
  CalendarCheck, Search, Megaphone, RefreshCw, Headset, Activity, Coins, Shield, PenTool, Plug, Bot, type LucideIcon } from "lucide-react";
import "@/styles/admin-b.css";
import "@/styles/admin-b-agent.css";
import { Donut, Restricted, Sparkline, type Tone } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { delta, requestTime } from "@/lib/workspace/format";
import { Head, Kpi, TabBar, Pill, Pager, buckets, cumulative } from "../_b/kit";
import { ParamSelect, SearchParam, Menu, RowCheck } from "../_b/ui";
import { stamp, ago } from "../_b/format";
import { controlRun, decideAgentApproval, setIntegration, startAdminRun } from "../_b/actions";

export const metadata: Metadata = { title: "Agent & Integrations" };

type Run = { id: string; reference: string | null; agent_name: string; run_type: string; triggered_by: string; surface: string; goal: string; status: string; plan: { status: string }[] | null; current_step: number | null;
  errors: { step?: string; error: string }[] | null; created_at: string; updated_at: string; finished_at: string | null; next_wake_at: string | null; retries: number };
type Approval = { id: string; run_id: string | null; workspace_id: string | null; title: string; detail: string; action: string; status: string; created_at: string };
type Integration = { id: string; name: string; category: string; status: string; metrics: { latency_ms?: number | null; series?: number[]; sort?: number; label?: string }; updated_at: string };

const AGENT: Record<string, [LucideIcon, string]> = {
  "Event Planner Agent": [CalendarCheck, "#7c3aed"], "Supplier Agent": [Search, "#f97316"], "Marketing Agent": [Megaphone, "#e11d74"], "Data Sync Agent": [RefreshCw, "#0ea5e9"], "Support Agent": [Headset, "#14b8a6"],
  "Monitoring Agent": [Activity, "#1e1b4b"], "Finance Agent": [Coins, "#f59e0b"], "Trust Agent": [Shield, "#6d28d9"], "Content Agent": [PenTool, "#ec4899"], "Integration Agent": [Plug, "#2563eb"],
};
const agentOf = (r: Run) => r.agent_name || `${r.surface[0]!.toUpperCase()}${r.surface.slice(1)} Agent`;
const RANGES: Record<string, [string, number]> = { "24h": ["Last 24 hours", 1], "7d": ["Last 7 days", 7], "30d": ["Last 30 days", 30] };
const INT_ICON: Record<string, string> = { ai: "◎", payments: "S", calendar: "▦", marketing: "∞", email: "✉", sms: "◉", storage: "☁", media: "◈" };
const INT_COLOR: Record<string, string> = { ai: "#111827", payments: "#635bff", calendar: "#1a73e8", marketing: "#0866ff", email: "#1a82e2", sms: "#f22f46", storage: "#f38020", media: "#e11d74" };

function duration(r: Run, now: number) {
  const end = r.finished_at ? new Date(r.finished_at).getTime() : ["running", "planning", "waiting_external"].includes(r.status) ? now : new Date(r.updated_at).getTime();
  const secs = Math.max(0, Math.round((end - new Date(r.created_at).getTime()) / 1000));
  if (r.status === "scheduled" || r.status === "queued") return "—";
  const m = Math.floor(secs / 60), s = secs % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
const latency = (ms?: number | null) => ms == null ? "–" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

export default async function AgentPage(props: PageProps<"/admin/agent-integrations">) {
  const sp = await props.searchParams;
  const { db, allowed } = await requireAdminPermission("agent_ops");
  if (!allowed) return <Restricted area="Agent & Integrations" />;
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const now = requestTime(), range = RANGES[s("range")] ? s("range") : "24h", [, days] = RANGES[range]!;
  const since = new Date(now - 2 * days * 864e5).toISOString();
  const [runsAll, approvals, ints] = await Promise.all([
    rows<Run>(db.from("agent_runs").select("id,reference,agent_name,run_type,triggered_by,surface,goal,status,plan,current_step,errors,created_at,updated_at,finished_at,next_wake_at,retries").gte("created_at", since).order("created_at", { ascending: false }).limit(5000)),
    rows<Approval>(db.from("agent_approvals").select("id,run_id,workspace_id,title,detail,action,status,created_at").eq("status", "pending").is("workspace_id", null).order("created_at", { ascending: false }).limit(200)),
    rows<Integration>(db.from("integrations").select("id,name,category,status,metrics,updated_at").order("name")),
  ]);
  const split = now - days * 864e5;
  // Scheduled runs haven't started yet: they live in the run queue, not in run counts or the runs table.
  const started = runsAll.filter(r => r.status !== "scheduled");
  const cur = started.filter(r => new Date(r.created_at).getTime() >= split && new Date(r.created_at).getTime() <= now + 60e3), prev = started.filter(r => new Date(r.created_at).getTime() < split);
  const by = (l: Run[], st: string) => l.filter(r => r.status === st);
  const ok = by(cur, "completed").length, failed = by(cur, "failed").length;
  const finished = ok + failed || 1;
  const incidents = ints.filter(i => i.status === "degraded" || i.status === "down");
  const series = (l: Run[]) => cumulative(buckets(l, r => r.created_at, () => 1, days, 10, now));
  const runRef = (r: Run | undefined) => r?.reference ?? (r ? `RUN-${r.id.slice(0, 5).toUpperCase()}` : "—");
  const runById = new Map(runsAll.map(r => [r.id, r]));

  const tab = ["approvals", "tools", "connections", "failures"].includes(s("tab")) ? s("tab") : "runs";
  const agents = [...new Set(cur.map(agentOf))].sort();
  const agent = s("agent"), status = s("status"), q = s("q").toLowerCase();
  const tool = s("tool").toLowerCase();
  const list = (tab === "failures" ? by(cur, "failed") : cur).filter(r => (!agent || agentOf(r) === agent) && (!status || r.status === status)
    && (!tool || `${r.goal} ${(r.errors ?? []).map(e => e.error).join(" ")}`.toLowerCase().includes(tool.split(" ")[0]!))
    && (!q || `${runRef(r)} ${agentOf(r)} ${r.run_type} ${r.goal} ${(r.errors ?? []).map(e => e.error).join(" ")}`.toLowerCase().includes(q)));
  const per = 10, page = Math.max(1, Number(s("page")) || 1);
  const qp = (extra: Record<string, string | number>) => { const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]); for (const [k, v] of Object.entries(extra)) { if (v === "") u.delete(k); else u.set(k, String(v)); } const str = u.toString(); return `/admin/agent-integrations${str ? `?${str}` : ""}`; };
  const recentFails = by(cur, "failed").filter(r => r.reference || r.errors?.length).slice(0, 4);
  const healthList = [...ints].sort((a, b) => (a.metrics?.sort ?? 99) - (b.metrics?.sort ?? 99) || a.name.localeCompare(b.name));
  const usage = Object.entries(cur.reduce<Record<string, number>>((a, r) => { const k = agentOf(r).replace(" Agent", ""); a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const top = usage.slice(0, 5), other = usage.slice(5).reduce((a, [, v]) => a + v, 0);
  const usageParts: [string, number, Tone][] = [...top.map(([l, v], i) => [l, v, (["purple", "orange", "green", "pink", "teal"] as Tone[])[i]!] as [string, number, Tone]), ...(other ? [["Other", other, "grey"] as [string, number, Tone]] : [])];
  const scheduled = by(runsAll, "scheduled").filter(r => r.next_wake_at).sort((a, b) => new Date(a.next_wake_at!).getTime() - new Date(b.next_wake_at!).getTime());
  const nextIn = scheduled[0]?.next_wake_at ? Math.max(1, Math.round((new Date(scheduled[0].next_wake_at).getTime() - now) / 60000)) : null;

  return <div className="adb adag">
    <Head title="Agent & Integrations" subtitle="Operate Agent runtime, tool health and external connectors."
      actions={<>
        <span className="adb-psel"><CalendarDays aria-hidden="true" /><Suspense><ParamSelect param="range" label="Period" value={range} options={Object.entries(RANGES).map(([value, [label]]) => ({ value, label }))} /></Suspense></span>
        <Link className="adb-btn" href="/admin/agent-integrations/credits"><Coins aria-hidden="true" />Credits &amp; pricing</Link>
        <Link className="adb-btn" href={`/admin/agent-integrations/export?range=${range}`}><Upload aria-hidden="true" />Export</Link>
        <details className="adb-pop"><summary className="adb-btn primary"><Play aria-hidden="true" />New run<ChevronDown aria-hidden="true" /></summary>
          <div className="adb-pop-body"><h3>Start a Gala Agent run</h3>
            <ActionForm action={startAdminRun} className="adb-form" resetOnSuccess>
              <label>Goal<textarea name="goal" required minLength={3} rows={3} placeholder="e.g. Reconcile yesterday’s payouts against Stripe" /></label>
              <fieldset className="adag-tools"><legend>Tools the run may use</legend>{["queues", "connectors", "trust", "support", "marketplace", "reconciliation", "analytics"].map(t => <label key={t}><input type="checkbox" name="tools" value={t} />{t}</label>)}</fieldset>
              <p className="adb-none">Runs are planned first; any change needs approval in the Approvals queue.</p>
              <button className="adb-btn primary" type="submit">Queue run</button>
            </ActionForm></div></details>
      </>} />
    <TabBar active={tab} tabs={[{ key: "runs", label: "Runs", href: "/admin/agent-integrations" }, { key: "approvals", label: "Approvals", href: "/admin/agent-integrations?tab=approvals", count: approvals.length },
      { key: "tools", label: "Tools", href: "/admin/agent-integrations?tab=tools" }, { key: "connections", label: "Connections", href: "/admin/agent-integrations?tab=connections" }, { key: "failures", label: "Failures", href: "/admin/agent-integrations?tab=failures" }]} />
    <section className="adb-kpis adag-kpis">
      <Kpi icon={Zap} tone="blue" label="Total runs" value={cur.length} delta={delta(cur.length, prev.length)} suffix={`vs previous ${range}`} series={series(cur)} />
      <Kpi icon={CircleCheck} tone="green" label="Successful runs" value={ok} delta={delta(ok, by(prev, "completed").length)} note={`${Math.round((100 * ok) / finished)}% success rate`} series={series(by(cur, "completed"))} />
      <Kpi icon={TriangleAlert} tone="red" label="Failed runs" value={failed} delta={delta(failed, by(prev, "failed").length)} invert note={`${Math.round((100 * failed) / (cur.length || 1))}% failure rate`} series={series(by(cur, "failed"))} />
      <Kpi icon={Clock3} tone="orange" label="Pending approvals" value={approvals.length} delta={delta(approvals.filter(a => new Date(a.created_at).getTime() >= split).length, approvals.filter(a => new Date(a.created_at).getTime() < split).length)} invert note="" series={cumulative(buckets(approvals, a => a.created_at, () => 1, days, 10, now))} />
      <Kpi icon={Layers} tone="purple" label="Tool incidents" value={incidents.length} note={incidents.length ? incidents.map(i => i.name).join(", ") : "All connectors healthy"} series={series(by(cur, "failed"))} />
    </section>
    <div className="adag-grid">
      <div className="adag-main">
        {(tab === "runs" || tab === "failures") && <>
          <div className="adag-filters">
            <Suspense><SearchParam placeholder="Search runs, tools, connectors, errors..." /></Suspense>
            <Suspense><ParamSelect param="agent" label="Agent" value={agent} options={[{ value: "", label: "All agents" }, ...agents.map(a => ({ value: a, label: a }))]} /></Suspense>
            <Suspense><ParamSelect param="status" label="Status" value={status} options={[{ value: "", label: "All statuses" }, ...["completed", "failed", "running", "paused", "scheduled", "waiting_approval", "queued", "cancelled"].map(v => ({ value: v, label: v.replace("_", " ").replace(/^\w/, c => c.toUpperCase()) }))]} /></Suspense>
            <Suspense><ParamSelect param="tool" label="Tool" value={s("tool")} options={[{ value: "", label: "All tools" }, ...healthList.map(i => ({ value: i.name, label: i.name }))]} /></Suspense>
            <Suspense><ParamSelect param="range" label="Period" value={range} options={Object.entries(RANGES).map(([value, [label]]) => ({ value, label }))} /></Suspense>
            <span className="adb-btn adag-fbtn"><Filter aria-hidden="true" />Filters</span>
          </div>
          <div className="adb-table-wrap"><table className="adb-table adag-table">
            <colgroup>{[34, 82, 128, 98, 86, 56, 66, 128, 108, 70].map((w, i) => <col key={i} style={{ width: `${(w / 856) * 100}%` }} />)}</colgroup>
            <thead><tr><th><RowCheck label="Select all" /></th><th>Run ID</th><th>Agent</th><th>Type</th><th>Status</th><th>Steps</th><th>Duration</th><th>Started at</th><th>Triggered by</th><th className="r">Actions</th></tr></thead>
            <tbody>{list.slice((page - 1) * per, page * per).map(r => { const [Icon, col] = AGENT[agentOf(r)] ?? [Bot, "#1a1af2"], total = r.plan?.length ?? 0, done = r.plan?.filter(p => p.status === "done").length ?? 0;
              return <tr key={r.id}>
                <td><RowCheck label={`Select ${runRef(r)}`} /></td>
                <td className="adag-m">{runRef(r)}</td>
                <td><span className="adag-agent"><i style={{ background: col }}><Icon aria-hidden="true" /></i>{agentOf(r)}</span></td>
                <td className="adag-m">{r.run_type || r.goal}</td>
                <td><Pill status={r.status} label={r.status === "waiting_approval" ? "Awaiting approval" : undefined} dot={r.status === "failed" || r.status === "paused"} /></td>
                <td className="adag-m">{total ? `${done} / ${total}` : "—"}</td>
                <td className="adag-m">{duration(r, now)}</td>
                <td className="adag-m">{stamp(r.created_at)}</td>
                <td className="adag-m">{r.triggered_by || (r.surface === "admin" ? "Admin" : `${r.surface[0]!.toUpperCase()}${r.surface.slice(1)} workspace`)}</td>
                <td className="r"><Menu label={`Actions for ${runRef(r)}`} entries={[
                  ...(["queued", "planning", "running", "waiting_external", "scheduled"].includes(r.status) && r.surface === "admin" ? [{ kind: "action" as const, label: "Pause run", run: controlRun.bind(null, r.id, "pause") }] : []),
                  ...(r.status === "paused" && r.surface === "admin" ? [{ kind: "action" as const, label: "Resume run", run: controlRun.bind(null, r.id, "resume") }] : []),
                  ...(!["completed", "failed", "cancelled"].includes(r.status) && r.surface === "admin" ? [{ kind: "action" as const, label: "Cancel run", run: controlRun.bind(null, r.id, "cancel"), danger: true }] : []),
                  { kind: "link", label: "View failures", href: qp({ tab: "failures", agent: agentOf(r) }) }]} /></td>
              </tr>; })}</tbody>
          </table></div>
          {!list.length && <p className="adb-none">No runs match these filters.</p>}
          <Pager total={list.length} page={page} per={per} href={p => qp({ page: p })} />
        </>}
        {tab === "approvals" && <section className="adb-panel adag-panel"><h2>Approval queue</h2><p className="adb-none">Approving lets the Agent perform the proposed action; rejecting leaves everything unchanged. Workspace approvals are decided inside each workspace.</p>
          <table className="adb-table"><thead><tr><th>Run</th><th>Agent</th><th>Action</th><th>Detail</th><th>Requested</th><th className="r">Decision</th></tr></thead>
            <tbody>{approvals.map(a => { const r = a.run_id ? runById.get(a.run_id) : undefined; return <tr key={a.id}><td className="adag-m">{runRef(r)}</td><td>{r ? agentOf(r) : "—"}</td><td><b>{a.title}</b></td><td className="adag-m">{a.detail}</td><td className="adag-m">{ago(a.created_at, now)}</td>
              <td className="r adag-dec"><ActionButton action={decideAgentApproval} args={[a.id, true]} variant="primary" className="sm" confirm={{ title: `Approve: ${a.title}`, body: a.detail || "The Agent will perform this action.", cta: "Approve" }}>Approve</ActionButton>
                <ActionButton action={decideAgentApproval} args={[a.id, false]} variant="outline" className="sm" confirm={{ title: `Reject: ${a.title}`, body: "Nothing will be changed.", cta: "Reject" }}>Reject</ActionButton></td></tr>; })}</tbody></table>
          {!approvals.length && <p className="adb-none">No approvals waiting.</p>}</section>}
        {(tab === "tools" || tab === "connections") && <section className="adb-panel adag-panel"><h2>{tab === "tools" ? "Agent tools" : "External connections"}</h2>
          <table className="adb-table"><thead><tr><th>Connector</th><th>Category</th><th>Status</th><th>Latency</th><th>Updated</th><th className="r">Control</th></tr></thead>
            <tbody>{healthList.filter(i => tab === "tools" ? ["ai", "agent", "media", "storage"].includes(i.category) : !["ai", "agent", "media", "storage"].includes(i.category)).map(i => <tr key={i.id}>
              <td><b>{i.name}</b></td><td className="adag-m">{i.category}</td><td><Pill status={i.status} dot /></td><td className="adag-m">{latency(i.metrics?.latency_ms)}</td><td className="adag-m">{ago(i.updated_at, now)}</td>
              <td className="r">{i.status === "disabled" ? <ActionButton action={setIntegration} args={[i.id, true]} reason variant="outline" className="sm" confirm={{ title: `Enable ${i.name}`, body: "The connector is re-enabled for Agent and platform use.", cta: "Enable" }}>Enable</ActionButton>
                : <ActionButton action={setIntegration} args={[i.id, false]} reason variant="danger" className="sm" confirm={{ title: `Disable ${i.name}`, body: "Agent runs and platform features using this connector stop calling it until re-enabled.", cta: "Disable" }}>Disable</ActionButton>}</td></tr>)}</tbody></table></section>}
      </div>
      <aside className="adag-rail">
        <section className="adb-panel adag-fails">
          <div className="adb-sec-h"><h2>Recent failures</h2><Link className="adb-link" href="/admin/agent-integrations?tab=failures">View all <ArrowRight aria-hidden="true" /></Link></div>
          <ul>{recentFails.map(r => { const err = r.errors?.[0]?.error ?? "Run failed", high = /timeout|webhook|down|503/i.test(err);
            return <li key={r.id}><TriangleAlert aria-hidden="true" /><span><small>{runRef(r)} <em>{agentOf(r)}</em></small><b>{err}</b></span><span className="adag-fr"><small>{stamp(r.created_at)}</small><Pill status={high ? "high" : "medium"} label={high ? "High" : "Medium"} /></span>
              <Link href={qp({ tab: "failures", q: runRef(r) })} aria-label={`Open ${runRef(r)}`}><ChevronRight aria-hidden="true" /></Link></li>; })}
            {!recentFails.length && <li className="adb-none">No failed runs in this period.</li>}</ul>
        </section>
        <section className="adb-panel adag-health">
          <div className="adb-sec-h"><h2>Tool &amp; connector health</h2><Link className="adb-link" href="/admin/agent-integrations?tab=connections">View all <ArrowRight aria-hidden="true" /></Link></div>
          <ul>{healthList.slice(0, 8).map(i => <li key={i.id}><i style={{ background: INT_COLOR[i.category] ?? "#1a1af2" }}>{INT_ICON[i.category] ?? i.name[0]}</i><span>{i.name}</span>
            <Pill status={i.status} dot /><Sparkline values={i.metrics?.series?.length ? i.metrics.series : [0, 0]} tone={i.status === "healthy" ? "green" : i.status === "degraded" ? "orange" : "red"} width={46} height={18} /><b>{latency(i.metrics?.latency_ms)}</b></li>)}</ul>
        </section>
      </aside>
    </div>
    <div className="adag-bottom">
      <section className="adb-panel adag-queue">
        <div className="adb-sec-h"><h2>Run queue</h2><Link className="adb-link" href={qp({ tab: "", status: "scheduled" })}>View all <ArrowRight aria-hidden="true" /></Link></div>
        <ul>
          <li><Clock3 aria-hidden="true" /><b>{by(cur, "waiting_approval").length}</b><span>High priority runs</span><em>Waiting for approval</em></li>
          <li><CalendarDays aria-hidden="true" /><b>{scheduled.length}</b><span>Scheduled runs</span><em>{nextIn ? `Next in ${nextIn} minute${nextIn === 1 ? "" : "s"}` : "None scheduled"}</em></li>
          <li className="red"><RotateCcw aria-hidden="true" /><b>{cur.filter(r => r.status === "failed" && r.retries > 0).length}</b><span>Retry queue</span><em>Failed steps to retry</em></li>
          <li><Zap aria-hidden="true" /><b>{by(cur, "running").length}</b><span>Running now</span><em>Across all agents</em></li>
        </ul>
      </section>
      <section className="adb-panel adag-appr">
        <div className="adb-sec-h"><h2>Approval queue</h2><Link className="adb-link" href="/admin/agent-integrations?tab=approvals">View all <ArrowRight aria-hidden="true" /></Link></div>
        <table className="adb-table"><thead><tr><th>Run</th><th>Agent</th><th>Action</th><th className="r">Requested</th></tr></thead>
          <tbody>{approvals.slice(0, 4).map(a => { const r = a.run_id ? runById.get(a.run_id) : undefined, [Icon, col] = r ? AGENT[agentOf(r)] ?? [Bot, "#1a1af2"] : [Bot, "#1a1af2"];
            return <tr key={a.id}><td className="adag-m">{runRef(r)}</td><td><span className="adag-agent sm"><i style={{ background: col }}><Icon aria-hidden="true" /></i>{r ? agentOf(r) : "—"}</span></td><td><Link href="/admin/agent-integrations?tab=approvals">{a.title}</Link></td><td className="r adag-m">{ago(a.created_at, now)}</td></tr>; })}</tbody></table>
        {!approvals.length && <p className="adb-none">No approvals waiting.</p>}
      </section>
      <section className="adb-panel adag-usage">
        <div className="adb-sec-h"><h2>Agent usage ({range})</h2><Link className="adb-link" href={qp({ tab: "" })}>View all <ArrowRight aria-hidden="true" /></Link></div>
        <div className="adag-usage-b"><Donut size={112} thickness={16} parts={usageParts.map(([label, value, tone]) => ({ label, value, tone }))} center={<><b>{cur.length}</b><small>Total runs</small></>} />
          <ul>{usageParts.map(([l, v, tone]) => <li key={l}><i className={`adag-dot ${tone}`} />{l}<b>{Math.round((100 * v) / (cur.length || 1))}%</b></li>)}</ul></div>
      </section>
      <section className="adb-panel adag-qa"><h2>Quick actions</h2>
        <Link href={`/admin/agent-integrations/export?range=${range}`}><ChartLine aria-hidden="true" />Run health report</Link>
        <Link href={qp({ tab: "", status: "running" })}><Pause aria-hidden="true" />Pause non-critical runs</Link>
        <Link href="/admin/settings?tab=agent"><ShieldCheck aria-hidden="true" />Manage tool permissions</Link>
        <Link href="/admin/agent-integrations?tab=connections"><FileText aria-hidden="true" />View integration logs</Link>
      </section>
    </div>
  </div>;
}
