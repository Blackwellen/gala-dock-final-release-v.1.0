import type { Metadata } from "next";
import { Suspense } from "react";
import { Layers, Skull, Hourglass, Send } from "lucide-react";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { Head, Kpi, TabBar, Pill, Pager } from "../../_b/kit";
import { ParamSelect } from "../../_b/ui";
import { stamp, ago } from "../../_b/format";
import { retryJob, cancelJob, replayOutbox } from "../../_d/actions";
import "@/styles/admin-b.css";
import "@/styles/admin-d.css";

export const metadata: Metadata = { title: "Jobs and dead letters" };
export const dynamic = "force-dynamic";

type Overview = { jobs: Record<string, number>; stuck_running: number; overdue_queued: number; dead: number; outbox_unpublished: number; outbox_oldest_unpublished: string | null; outbox_errors: number;
  outbox_24h: number; processed_24h: number; by_kind: { kind: string; queued: number; failed: number; dead: number; running: number; succeeded_24h: number; last_finished: string | null }[] };
type Job = { id: string; kind: string; status: string; attempts: number; max_attempts: number; run_after: string; created_at: string; finished_at: string | null; lease_until: string | null; last_error: string | null;
  consumer: string | null; event_id: string | null; workspace_id: string | null; correlation_id: string | null; payload_keys: string[]; total: number };
type Ev = { id: string; seq: number; event_type: string; workspace_id: string | null; aggregate_type: string | null; aggregate_id: string | null; actor_type: string; emitted_at: string; published_at: string | null;
  publish_attempts: number; last_error: string | null; consumers: { job_id: string; consumer: string; status: string; attempts: number; processed: boolean }[]; total: number };
const TONE: Record<string, string> = { dead: "failed", failed: "pending", running: "running", queued: "queued", succeeded: "succeeded", cancelled: "cancelled" };

/** Job / dead-letter / outbox console (domains 195.J, 200.7). Read: settings, agent_ops or audit. Retry, cancel and replay:
 *  settings + MFA + reason, audited. Payloads are never shown (keys only); replays skip consumers that already processed the event. */
export default async function JobsPage(props: PageProps<"/admin/health/jobs">) {
  const sp = await props.searchParams;
  const admin = await getAdmin();
  if (!admin.permissions.has("settings") && !admin.permissions.has("agent_ops") && !admin.permissions.has("audit")) return <Restricted area="Jobs and dead letters" />;
  const canAct = admin.permissions.has("settings");
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const tab = s("tab") === "outbox" ? "outbox" : "jobs";
  const status = s("status") || (tab === "jobs" ? "dead" : ""), kind = s("kind"), page = Math.max(1, Number(s("page")) || 1), per = 25;
  const db = untyped(admin.db as never), now = requestTime();
  const [{ data: ov }, list] = await Promise.all([
    db.rpc("admin_ops_overview"),
    tab === "jobs" ? db.rpc("admin_job_list", { p_status: status === "all" ? null : status, p_kind: kind || null, p_limit: per, p_offset: (page - 1) * per })
      : db.rpc("admin_outbox_list", { p_unpublished: status === "unpublished", p_type: kind || null, p_limit: per, p_offset: (page - 1) * per }),
  ]);
  const o = (ov ?? { jobs: {}, by_kind: [] }) as Overview;
  const jobs = tab === "jobs" ? (list.data ?? []) as Job[] : [], evs = tab === "outbox" ? (list.data ?? []) as Ev[] : [];
  const total = Number((tab === "jobs" ? jobs[0]?.total : evs[0]?.total) ?? 0);
  const href = (p: number) => `/admin/health/jobs?${new URLSearchParams({ ...(tab === "outbox" ? { tab } : {}), ...(status ? { status } : {}), ...(kind ? { kind } : {}), page: String(p) })}`;
  const lag = o.outbox_oldest_unpublished ? Math.round((now - new Date(o.outbox_oldest_unpublished).getTime()) / 1000) : 0;

  return <div className="adb add">
    <Head back={{ href: "/admin/health", label: "System health" }} title="Jobs and dead letters" subtitle="Background work: the job queue, dead-lettered jobs and the domain event outbox. Retrying or replaying never re-runs a consumer that already processed an event." />
    <section className="add-kpis">
      <Kpi icon={Skull} tone="red" label="Dead-lettered" value={o.dead} note={o.dead ? "Needs a decision" : "None"} />
      <Kpi icon={Hourglass} tone="amber" label="Waiting to retry" value={o.jobs.failed ?? 0} note={`${o.stuck_running} stuck · ${o.overdue_queued} overdue`} />
      <Kpi icon={Layers} tone="blue" label="Queued / running" value={(o.jobs.queued ?? 0) + (o.jobs.running ?? 0)} note={`${o.jobs.succeeded ?? 0} succeeded (kept 14 days)`} />
      <Kpi icon={Send} tone="purple" label="Outbox unpublished" value={o.outbox_unpublished} note={o.outbox_unpublished ? `Oldest ${lag}s · ${o.outbox_errors} with errors` : `${o.outbox_24h} events / ${o.processed_24h} deliveries (24h)`} />
    </section>
    <TabBar active={tab} tabs={[{ key: "jobs", label: "Jobs", href: "/admin/health/jobs" }, { key: "outbox", label: "Outbox events", href: "/admin/health/jobs?tab=outbox" }]} />
    <section className="adb-panel">
      <div className="adb-sec-h"><h2>{tab === "jobs" ? "Jobs" : "Outbox events"}</h2><span className="add-acts">
        <Suspense>{tab === "jobs"
          ? <ParamSelect param="status" label="Status" value={status} options={[{ value: "dead", label: "Dead-lettered" }, { value: "failed", label: "Waiting to retry" }, { value: "stuck", label: "Stuck (lease lapsed)" }, { value: "queued", label: "Queued" }, { value: "running", label: "Running" }, { value: "succeeded", label: "Succeeded" }, { value: "cancelled", label: "Cancelled" }, { value: "all", label: "All" }]} />
          : <ParamSelect param="status" label="Status" value={status} options={[{ value: "", label: "All events" }, { value: "unpublished", label: "Unpublished" }]} />}</Suspense>
        {tab === "jobs" && <Suspense><ParamSelect param="kind" label="Job kind" value={kind} options={[{ value: "", label: "All kinds" }, ...o.by_kind.map(k => ({ value: k.kind, label: k.kind }))]} /></Suspense>}</span></div>
      {tab === "jobs" ? <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Job</th><th>Status</th><th className="r">Attempts</th><th>Timing</th><th>Error</th><th>Payload keys</th><th /></tr></thead>
        <tbody>{jobs.length ? jobs.map(j => { const stuck = j.status === "running" && j.lease_until && new Date(j.lease_until).getTime() < now;
          return <tr key={j.id}><td><b>{j.kind}</b>{j.consumer && <small>consumer {j.consumer}</small>}<small className="add-mono">{j.id.slice(0, 8)}{j.correlation_id ? ` · ${j.correlation_id.slice(0, 12)}` : ""}</small></td>
            <td><Pill status={stuck ? "failed" : TONE[j.status] ?? j.status} label={stuck ? "stuck" : j.status === "failed" ? "waiting to retry" : j.status} /></td>
            <td className="r">{j.attempts}/{j.max_attempts}</td>
            <td><small>created {ago(j.created_at, now)}</small>{j.finished_at ? <small>finished {stamp(j.finished_at)}</small> : <small>runs {new Date(j.run_after).getTime() > now ? stamp(j.run_after) : "now"}</small>}</td>
            <td><small>{j.last_error ?? "—"}</small></td>
            <td><span className="add-keys">{j.payload_keys.length ? j.payload_keys.map(k => <code key={k}>{k}</code>) : <small>—</small>}</span></td>
            <td>{canAct && <span className="add-acts">
              {["failed", "dead", "cancelled"].includes(j.status) && <ActionButton action={retryJob} args={[j.id]} reason confirm={{ title: j.status === "failed" ? "Retry now" : "Replay dead-lettered job", body: j.status === "failed" ? "Runs the job at the next worker tick instead of waiting for its back-off." : "Re-queues the job with a fresh attempt budget. Refused if its consumer already processed the event.", cta: "Retry" }}>Retry</ActionButton>}
              {(["queued", "failed"].includes(j.status) || stuck) && <ActionButton action={cancelJob} args={[j.id]} reason variant="danger" confirm={{ title: "Cancel job", body: "The job won’t run. It can be replayed later from the Cancelled filter.", cta: "Cancel job" }}>Cancel</ActionButton>}
            </span>}</td></tr>; })
          : <tr><td colSpan={7} className="adb-none">{status === "dead" ? "No dead-lettered jobs — every job either succeeded or is still within its retry budget." : "No jobs match these filters."}</td></tr>}</tbody></table>
      : <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>#</th><th>Event</th><th>Aggregate</th><th>Emitted</th><th>Published</th><th>Consumers</th><th /></tr></thead>
        <tbody>{evs.length ? evs.map(e => { const replayable = !e.published_at || e.consumers.some(c => ["dead", "cancelled"].includes(c.status) && !c.processed);
          return <tr key={e.id}><td className="add-mono">{e.seq}</td><td><b>{e.event_type}</b><small>{e.actor_type}</small></td><td><small>{e.aggregate_type ?? "—"} · <span className="add-mono">{(e.aggregate_id ?? "").slice(0, 12)}</span></small></td>
            <td>{stamp(e.emitted_at)}</td><td>{e.published_at ? <small>{ago(e.published_at, now)}</small> : <Pill status="pending" label={`unpublished · ${e.publish_attempts} tries`} />}{e.last_error && <small>{e.last_error}</small>}</td>
            <td>{e.consumers.length ? e.consumers.map(c => <small key={c.job_id}>{c.consumer}: {c.processed ? "processed" : c.status}</small>) : <small>No subscribers</small>}</td>
            <td>{canAct && replayable && <ActionButton action={replayOutbox} args={[e.id]} reason confirm={{ title: "Replay event", body: e.published_at ? "Re-queues the consumers that dead-lettered or were cancelled. Consumers that already processed it are skipped." : "Clears the publish error so the next worker tick fans it out again.", cta: "Replay" }}>Replay</ActionButton>}</td></tr>; })
          : <tr><td colSpan={7} className="adb-none">No outbox events match.</td></tr>}</tbody></table>}
      {total > per && <Pager total={total} page={page} per={per} href={href} />}
    </section>
    {tab === "jobs" && <section className="adb-panel"><div className="adb-sec-h"><h2>By job kind</h2></div>
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Kind</th><th className="r">Queued</th><th className="r">Running</th><th className="r">Waiting</th><th className="r">Dead</th><th className="r">Succeeded (24h)</th><th>Last finished</th></tr></thead>
        <tbody>{o.by_kind.length ? o.by_kind.map(k => <tr key={k.kind}><td><b>{k.kind}</b></td><td className="r">{k.queued}</td><td className="r">{k.running}</td><td className="r">{k.failed}</td><td className="r">{k.dead}</td><td className="r">{k.succeeded_24h}</td><td>{k.last_finished ? ago(k.last_finished, now) : "—"}</td></tr>)
          : <tr><td colSpan={7} className="adb-none">No jobs recorded.</td></tr>}</tbody></table></section>}
    {!canAct && <p className="add-note">Retry, cancel and replay need the Settings permission.</p>}
  </div>;
}
