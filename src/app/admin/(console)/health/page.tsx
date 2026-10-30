import Link from "next/link";
import type { Metadata } from "next";
import { Restricted } from "@/components/workspace/kit";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { readiness, type Readiness } from "@/lib/release/integrations";
import { dateShort, time } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";
import { Head, Pill } from "../_b/kit";
import { healthContracts, type ComponentState } from "@/lib/release/health-contracts";
import { ActionButton } from "@/components/workspace/actions";
import { setAgentKillSwitch } from "../_d/actions";
import "@/styles/admin-d.css";
import "@/styles/admin-b.css";
import "@/styles/admin-conversations.css";

export const metadata: Metadata = { title: "System health" };
export const dynamic = "force-dynamic";

type Job = { job: string; schedule: string; active: boolean; last_run: string | null; last_status: string | null; failures_24h: number };
const TONE: Record<Readiness, string> = { ready: "resolved", sandbox: "pending", degraded: "open", blocked_external: "closed", not_implemented: "neutral" };
const CTONE: Record<ComponentState, string> = { healthy: "resolved", configured: "resolved", degraded: "open", blocked_external: "closed", not_configured: "neutral", unknown: "pending" };
const LABEL: Record<Readiness, string> = { ready: "Ready", sandbox: "Sandbox", degraded: "Degraded", blocked_external: "Blocked (external)", not_implemented: "Not implemented" };

/** §137 health: integration readiness (live checks), scheduled jobs and operational backlog. Read-only; settings or agent_ops. */
export default async function HealthPage() {
  const admin = await getAdmin();
  if (!admin.permissions.has("settings") && !admin.permissions.has("agent_ops")) return <Restricted area="System health" />;
  const db = untyped(admin.db as never);
  const count = (q: PromiseLike<{ count: number | null; error: unknown }>) => Promise.resolve(q).then(r => (r.error ? null : r.count ?? 0), () => null);
  const [ints, jobs, runs, pay, refunds, mail, contracts, ov, snaps, kill] = await Promise.all([
    readiness(true),
    db.rpc("admin_cron_job_status").then(r => (r.data ?? []) as Job[], () => [] as Job[]),
    count(db.from("agent_runs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "retrying"])),
    count(db.from("payment_orders").select("id", { count: "exact", head: true }).eq("status", "eligible_for_provider_transfer")),
    count(db.from("booking_cancellations").select("id", { count: "exact", head: true }).in("refund_status", ["due", "processing", "failed"])),
    // Q31 S1: admins read delivery metadata only, through admin_email_backlog() (no direct email_outbox access).
    Promise.resolve(db.rpc("admin_email_backlog")).then(r => (r.error ? null : Number((r.data as { queued?: number } | null)?.queued ?? 0) + Number((r.data as { failed?: number } | null)?.failed ?? 0)), () => null),
    healthContracts(db as never, { queue: false }),
    Promise.resolve(db.rpc("admin_ops_overview")).then(r => (r.error ? null : r.data as { dead: number; stuck_running: number; outbox_unpublished: number; outbox_oldest_unpublished: string | null; jobs: Record<string, number> }), () => null),
    Promise.resolve(db.from("service_health_snapshots").select("taken_at,status").order("taken_at", { ascending: false }).limit(48)).then(r => ((r.data ?? []) as { taken_at: string; status: string }[]).reverse(), () => [] as { taken_at: string; status: string }[]),
    Promise.resolve(db.from("agent_runtime_controls").select("kill_switch,reason,set_at").eq("id", 1).maybeSingle()).then(r => r.data as { kill_switch: boolean; reason: string; set_at: string } | null, () => null),
  ]);
  const now = requestTime();
  const stale = (j: Job) => !j.last_run || now - new Date(j.last_run).getTime() > 26 * 3600e3;
  const blocked = ints.filter(i => i.status !== "ready"), critical = blocked.filter(i => i.critical);
  return <div className="adb acv">
    <Head title="System health" subtitle="Integration readiness, scheduled jobs and operational backlog. Checks run live when this page loads." />
    <section className="adb-panel acv-kpis">
      <div><b>{ints.length - blocked.length}/{ints.length}</b><small>Integrations ready</small></div>
      <div><b>{critical.length}</b><small>Critical not ready</small></div>
      <div><b>{jobs.reduce((n, j) => n + Number(j.failures_24h), 0)}</b><small>Job failures (24h)</small></div>
      <div><b>{runs ?? "—"}</b><small>Agent runs active</small></div>
      <div><b>{pay ?? "—"}</b><small>Payouts due</small></div>
      <div><b>{refunds ?? "—"}</b><small>Refunds pending</small></div>
    </section>
    <section className="adb-panel"><div className="adb-sec-h"><h2>Integrations</h2></div>
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Integration</th><th>Purpose</th><th>Status</th><th>Detail</th><th>Needs</th></tr></thead>
        <tbody>{ints.map(i => <tr key={i.key}><td><b>{i.name}</b>{i.critical && <small>Critical</small>}</td><td>{i.purpose}</td><td><Pill status={TONE[i.status]} label={LABEL[i.status]} /></td><td>{i.detail}</td>
          <td><small>{i.env.join(", ")}</small>{i.docs && <small><Link href={i.docs} target="_blank" rel="noreferrer">Setup guide</Link></small>}</td></tr>)}</tbody></table></section>
    <section className="adb-panel"><div className="adb-sec-h"><h2>Service contracts</h2><small>Same contracts as <code>/api/health</code>: env names and states only, never values.</small></div>
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Component</th><th>State</th><th>Detail</th></tr></thead>
        <tbody>{contracts.list.map(c => <tr key={c.key}><td><b>{c.name}</b><small>{c.key}</small></td><td><Pill status={CTONE[c.state]} label={c.state.replace("_", " ")} /></td><td>{c.detail}</td></tr>)}
          {ov && <tr><td><b>Job queue and outbox</b><small>queue</small></td><td><Pill status={ov.dead || ov.stuck_running ? "open" : "resolved"} label={ov.dead || ov.stuck_running ? "degraded" : "healthy"} /></td>
            <td>{ov.dead} dead · {ov.jobs.failed ?? 0} waiting to retry · {ov.stuck_running} stuck · outbox {ov.outbox_unpublished} unpublished · <Link href="/admin/health/jobs">Open job console</Link></td></tr>}</tbody></table>
      <div className="adb-sec-h"><h2>Uptime checks</h2><small>{snaps.length ? `${snaps.length} snapshots from the monitor (one per minute at most, kept 30 days)` : "No monitor snapshots yet — they are recorded when the uptime monitor polls /api/health with the ops bearer."}</small></div>
      {snaps.length > 0 && <div className="add-spark" role="img" aria-label={`${snaps.filter(x => x.status !== "ok").length} of ${snaps.length} recent checks degraded`}>{snaps.map(x => <i key={x.taken_at} className={x.status} style={{ height: x.status === "ok" ? 28 : x.status === "degraded" ? 18 : 10 }} title={`${dateShort(x.taken_at)} ${time(x.taken_at)} · ${x.status}`} />)}</div>}
    </section>
    <section className="adb-panel"><div className="adb-sec-h"><h2>Gala Agent runtime</h2>
      <Pill status={kill?.kill_switch ? "open" : "resolved"} label={kill?.kill_switch ? "Switched off" : "Running"} /></div>
      <p className="add-note">{kill?.kill_switch ? `Switched off ${dateShort(kill.set_at)} ${time(kill.set_at)} — ${kill.reason}. New runs and every agent tool call are refused; nothing is lost.` : "The platform kill switch stops new Gala Agent runs and refuses every agent tool call in every workspace, before any model spend. Workspaces can also switch the agent off for themselves."}</p>
      {admin.permissions.has("agent_ops") && <ActionButton action={setAgentKillSwitch} args={[!kill?.kill_switch]} reason variant={kill?.kill_switch ? "primary" : "danger"}
        confirm={{ title: kill?.kill_switch ? "Switch Gala Agent back on" : "Switch Gala Agent off everywhere", body: kill?.kill_switch ? "Runs can be resumed by their owners; queued runs continue." : "Every workspace’s agent stops at once. Use for incidents (runaway cost, unsafe behaviour, provider outage). Audited with your reason.", cta: kill?.kill_switch ? "Switch on" : "Switch off" }}>{kill?.kill_switch ? "Switch Gala Agent on" : "Switch Gala Agent off"}</ActionButton>}
    </section>
    <section className="adb-panel"><div className="adb-sec-h"><h2>Scheduled jobs</h2><Link className="adb-link" href="/admin/health/jobs">Jobs and dead letters</Link></div>
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Job</th><th>Schedule</th><th>Last run</th><th>Last status</th><th className="r">Failures (24h)</th><th>State</th></tr></thead>
        <tbody>{jobs.length ? jobs.map(j => <tr key={j.job}><td><b>{j.job}</b></td><td><code>{j.schedule}</code></td><td>{j.last_run ? `${dateShort(j.last_run)} ${time(j.last_run)}` : "Never"}</td>
          <td>{j.last_status ?? "—"}</td><td className="r">{j.failures_24h}</td>
          <td><Pill status={!j.active ? "neutral" : Number(j.failures_24h) > 0 ? "open" : stale(j) ? "pending" : "resolved"} label={!j.active ? "Paused" : Number(j.failures_24h) > 0 ? "Failing" : stale(j) ? "Stale" : "Healthy"} /></td></tr>)
          : <tr><td colSpan={6} className="adb-none">No scheduled jobs found.</td></tr>}</tbody></table></section>
    <p className="acv-hint">Email queue: {mail ?? "—"} queued or failed. Uptime monitors can poll <code>/api/health</code> with the CRON_SECRET bearer for the same data as JSON.</p>
  </div>;
}
