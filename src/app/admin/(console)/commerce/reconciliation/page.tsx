import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/admin-a-base.css";
import "@/styles/admin-reconciliation.css";
import { Restricted } from "@/components/workspace/kit";
import { requireAdminPermission } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { stripeLive } from "@/lib/stripe";
import { requestTime } from "@/lib/workspace/format";

export const metadata: Metadata = { title: "Reconciliation" };

type Run = { id: string; scope: string; started_at: string; finished_at: string | null; status: string; checked: number; variances: number; error: string | null };
type Item = { id: number; run_id: string; source_type: string; source_ref: string; stripe_account_id: string | null; stripe_object_id: string | null; variance: string; severity: string; expected: unknown; actual: unknown; created_at: string };

const RUN_TONE: Record<string, [string, string]> = { clean: ["Clean", "green"], variances: ["Variances", "amber"], failed: ["Failed", "red"], running: ["Running", "blue"] };
const SEV_TONE: Record<string, string> = { critical: "red", warning: "amber", info: "grey" };
const SEVERITIES = ["all", "critical", "warning", "info"] as const;
/** Human labels for the variance codes written by src/lib/payments/reconcile-core.ts (unknown codes fall back to the code). */
const VARIANCE: Record<string, string> = {
  amount_mismatch: "Amount differs from Stripe", currency_mismatch: "Currency differs", payment_intent_mismatch: "PaymentIntent differs",
  booking_paid_without_charge: "Marked paid, no Stripe charge", charge_without_booking_update: "Stripe charge, not marked paid",
  refund_mismatch: "Refund differs from Stripe", wrong_account_context: "Charged in the wrong account", missing_seller_connected_account: "Seller connected account missing",
  legacy_platform_collection: "Collected on the platform (legacy)", unexpected_transfer: "Platform transfer on a direct charge",
  missing_application_fee: "Application fee missing", application_fee_mismatch: "Application fee differs",
};
const when = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(iso)) : "—";
const label = (code: string) => VARIANCE[code] ?? code.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
/** Compact "key: expected → actual" lines for the keys that differ; never prints whole payloads. */
function diff(expected: unknown, actual: unknown) {
  const e = (expected && typeof expected === "object" ? expected : {}) as Record<string, unknown>, a = (actual && typeof actual === "object" ? actual : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(e), ...Object.keys(a)])].filter(k => JSON.stringify(e[k]) !== JSON.stringify(a[k])).slice(0, 4);
  const v = (x: unknown) => x === undefined || x === null ? "—" : typeof x === "object" ? JSON.stringify(x).slice(0, 40) : String(x).slice(0, 40);
  return keys.map(k => `${k}: ${v(e[k])} → ${v(a[k])}`);
}

/**
 * W08 · Direct-charge reconciliation (Q07 card 128). Read-only view over the immutable `reconciliation_runs` / `reconciliation_items`
 * written by the `payments.reconcile` job (pg_cron 'payments-reconcile'); RLS = commerce admins only. Nothing here changes money.
 */
export default async function ReconciliationPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAdminPermission("commerce");
  if (!ctx.allowed) return <Restricted area="Commerce" />;
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const db = untyped(ctx.db as never);
  const { data: runData, error: runErr } = await db.from("reconciliation_runs").select("id,scope,started_at,finished_at,status,checked,variances,error").eq("livemode", stripeLive()).order("started_at", { ascending: false }).limit(30);
  const runs = (runData ?? []) as Run[];
  const runId = runs.some(r => r.id === s("run")) ? s("run") : runs[0]?.id ?? "";
  const severity = (SEVERITIES as readonly string[]).includes(s("severity")) ? s("severity") : "all";
  let items: Item[] = [];
  if (runId) {
    let q = db.from("reconciliation_items").select("id,run_id,source_type,source_ref,stripe_account_id,stripe_object_id,variance,severity,expected,actual,created_at").eq("run_id", runId);
    if (severity !== "all") q = q.eq("severity", severity);
    const { data } = await q.order("severity").order("id").limit(200);
    items = (data ?? []) as Item[];
  }
  const run = runs.find(r => r.id === runId);
  const last = runs[0];
  const now = requestTime(), since = now - 30 * 864e5;
  const recent = runs.filter(r => Date.parse(r.started_at) >= since);
  const failedRuns = recent.filter(r => r.status === "failed").length;
  const varianceTotal = recent.reduce((a, r) => a + Number(r.variances || 0), 0);
  const href = (p: Record<string, string>) => `/admin/commerce/reconciliation?${new URLSearchParams({ ...(runId ? { run: runId } : {}), ...(severity !== "all" ? { severity } : {}), ...p }).toString()}`;
  const stale = last ? now - Date.parse(last.started_at) > 36 * 36e5 : true;

  return <div className="aa arc">
    <header className="ws-page-head"><div><Link className="aa-back" href="/admin/commerce">← Commerce</Link><h1>Payment reconciliation</h1>
      <p>Daily check of direct charges against Stripe in each seller’s connected account: amounts, application fees, the account charged, and any platform transfer on a direct order. Results are immutable; fix the cause, and the next run confirms it.</p></div>
      <div className="aa-head-actions"><Link className="arc-btn" href="/admin/health/jobs?status=all&kind=payments.reconcile">Job history</Link></div></header>

    <section className="arc-kpis" aria-label="Reconciliation summary">
      <div className="arc-kpi"><span>Last run</span><b>{last ? when(last.started_at) : "Never"}</b>{last ? <span className={`aa-status ${RUN_TONE[last.status]?.[1] ?? "grey"}`}>{RUN_TONE[last.status]?.[0] ?? last.status}</span> : <small>No run recorded yet</small>}</div>
      <div className="arc-kpi"><span>Payments checked (last run)</span><b>{last ? Number(last.checked).toLocaleString("en-GB") : "—"}</b><small>{last?.finished_at ? `finished ${when(last.finished_at)}` : last ? "not finished" : "—"}</small></div>
      <div className="arc-kpi"><span>Variances (30 days)</span><b className={varianceTotal ? "warn" : ""}>{varianceTotal.toLocaleString("en-GB")}</b><small>{recent.length} run{recent.length === 1 ? "" : "s"}</small></div>
      <div className="arc-kpi"><span>Failed runs (30 days)</span><b className={failedRuns ? "bad" : ""}>{failedRuns}</b><small>{failedRuns ? "see the run error below" : "none"}</small></div>
    </section>

    {stale && <p className="arc-warn" role="status">{last ? `The last run started ${when(last.started_at)} — more than 36 hours ago. Check the payments.reconcile job and the Stripe configuration.` : "No reconciliation run has been recorded. The payments.reconcile job runs daily once Stripe is configured for the platform; until then there is nothing to compare."}</p>}
    {runErr && <p role="alert" className="arc-warn">Couldn’t load reconciliation runs.</p>}

    <div className="arc-grid">
      <section className="aa-table-card arc-runs" aria-labelledby="arc-runs-h">
        <h2 id="arc-runs-h">Runs</h2>
        {runs.length ? <ul>{runs.map(r => <li key={r.id}><Link href={`/admin/commerce/reconciliation?run=${r.id}`} aria-current={r.id === runId ? "true" : undefined}>
          <span><b>{when(r.started_at)}</b><small>{r.scope.replace(/_/g, " ")} · {Number(r.checked).toLocaleString("en-GB")} checked</small></span>
          <span className={`aa-status ${RUN_TONE[r.status]?.[1] ?? "grey"}`}>{r.status === "variances" ? `${r.variances} variance${r.variances === 1 ? "" : "s"}` : RUN_TONE[r.status]?.[0] ?? r.status}</span></Link></li>)}</ul>
          : <p className="aa-empty">No runs yet.</p>}
      </section>

      <section className="aa-table-card arc-items" aria-labelledby="arc-items-h">
        <div className="arc-items-head"><h2 id="arc-items-h">{run ? `Variances — run ${when(run.started_at)}` : "Variances"}</h2>
          <nav className="aa-pills" aria-label="Severity">{SEVERITIES.map(v => <Link key={v} href={href({ severity: v === "all" ? "" : v })} className={severity === v ? "on" : undefined} aria-current={severity === v ? "page" : undefined}>{v === "all" ? "All" : v[0]!.toUpperCase() + v.slice(1)}</Link>)}</nav></div>
        {run?.error && <p className="arc-warn" role="alert">Run error: {run.error.slice(0, 300)}</p>}
        {!run ? <p className="aa-empty">Select a run to see its variances.</p> : items.length === 0 ? <p className="aa-empty">{run.status === "clean" ? "Clean run — every checked payment matched Stripe." : severity !== "all" ? `No ${severity} variances in this run.` : run.status === "running" ? "This run is still in progress." : "No variances recorded for this run."}</p>
          : <div className="arc-scroll"><table className="aa-table">
            <thead><tr><th scope="col" style={{ width: 90 }}>Severity</th><th scope="col">Variance</th><th scope="col">Source</th><th scope="col">Stripe</th><th scope="col">Difference</th></tr></thead>
            <tbody>{items.map(i => <tr key={i.id}>
              <td data-label="Severity"><span className={`aa-chip ${SEV_TONE[i.severity] ?? "grey"}`}>{i.severity}</span></td>
              <td data-label="Variance"><b>{label(i.variance)}</b><small className="aa-muted arc-code">{i.variance}</small></td>
              <td data-label="Source"><span className="arc-mono">{i.source_type.replace(/_/g, " ")}</span><small className="arc-mono">{i.source_ref}</small></td>
              <td data-label="Stripe"><span className="arc-mono">{i.stripe_object_id ?? "—"}</span><small className="arc-mono">{i.stripe_account_id ?? "platform"}</small></td>
              <td data-label="Difference">{diff(i.expected, i.actual).map(l => <small key={l} className="arc-mono arc-line">{l}</small>)}</td>
            </tr>)}</tbody></table>
            {items.length === 200 && <p className="aa-muted arc-cap">Showing the first 200 variances for this run.</p>}</div>}
      </section>
    </div>
  </div>;
}
