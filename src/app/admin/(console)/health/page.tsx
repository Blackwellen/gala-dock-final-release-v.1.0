import Link from "next/link";
import type { Metadata } from "next";
import { Restricted } from "@/components/workspace/kit";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { readiness, type Readiness } from "@/lib/release/integrations";
import { dateShort, time } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";
import { Head, Pill } from "../_b/kit";
import "@/styles/admin-b.css";
import "@/styles/admin-conversations.css";

export const metadata: Metadata = { title: "System health" };
export const dynamic = "force-dynamic";

type Job = { job: string; schedule: string; active: boolean; last_run: string | null; last_status: string | null; failures_24h: number };
const TONE: Record<Readiness, string> = { ready: "resolved", sandbox: "pending", degraded: "open", blocked_external: "closed", not_implemented: "neutral" };
const LABEL: Record<Readiness, string> = { ready: "Ready", sandbox: "Sandbox", degraded: "Degraded", blocked_external: "Blocked (external)", not_implemented: "Not implemented" };

/** §137 health: integration readiness (live checks), scheduled jobs and operational backlog. Read-only; settings or agent_ops. */
export default async function HealthPage() {
  const admin = await getAdmin();
  if (!admin.permissions.has("settings") && !admin.permissions.has("agent_ops")) return <Restricted area="System health" />;
  const db = untyped(admin.db as never);
  const count = (q: PromiseLike<{ count: number | null; error: unknown }>) => Promise.resolve(q).then(r => (r.error ? null : r.count ?? 0), () => null);
  const [ints, jobs, runs, pay, refunds, mail] = await Promise.all([
    readiness(true),
    db.rpc("admin_cron_job_status").then(r => (r.data ?? []) as Job[], () => [] as Job[]),
    count(db.from("agent_runs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "retrying"])),
    count(db.from("payment_orders").select("id", { count: "exact", head: true }).eq("status", "eligible_for_provider_transfer")),
    count(db.from("booking_cancellations").select("id", { count: "exact", head: true }).in("refund_status", ["due", "processing", "failed"])),
    count(db.from("email_outbox").select("id", { count: "exact", head: true }).in("status", ["queued", "failed"])),
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
      <table className="adb-table"><thead><tr><th>Integration</th><th>Purpose</th><th>Status</th><th>Detail</th><th>Needs</th></tr></thead>
        <tbody>{ints.map(i => <tr key={i.key}><td><b>{i.name}</b>{i.critical && <small>Critical</small>}</td><td>{i.purpose}</td><td><Pill status={TONE[i.status]} label={LABEL[i.status]} /></td><td>{i.detail}</td>
          <td><small>{i.env.join(", ")}</small>{i.docs && <small><Link href={i.docs} target="_blank" rel="noreferrer">Setup guide</Link></small>}</td></tr>)}</tbody></table></section>
    <section className="adb-panel"><div className="adb-sec-h"><h2>Scheduled jobs</h2></div>
      <table className="adb-table"><thead><tr><th>Job</th><th>Schedule</th><th>Last run</th><th>Last status</th><th className="r">Failures (24h)</th><th>State</th></tr></thead>
        <tbody>{jobs.length ? jobs.map(j => <tr key={j.job}><td><b>{j.job}</b></td><td><code>{j.schedule}</code></td><td>{j.last_run ? `${dateShort(j.last_run)} ${time(j.last_run)}` : "Never"}</td>
          <td>{j.last_status ?? "—"}</td><td className="r">{j.failures_24h}</td>
          <td><Pill status={!j.active ? "neutral" : Number(j.failures_24h) > 0 ? "open" : stale(j) ? "pending" : "resolved"} label={!j.active ? "Paused" : Number(j.failures_24h) > 0 ? "Failing" : stale(j) ? "Stale" : "Healthy"} /></td></tr>)
          : <tr><td colSpan={6} className="adb-none">No scheduled jobs found.</td></tr>}</tbody></table></section>
    <p className="acv-hint">Email queue: {mail ?? "—"} queued or failed. Uptime monitors can poll <code>/api/health</code> with the CRON_SECRET bearer for the same data as JSON.</p>
  </div>;
}
