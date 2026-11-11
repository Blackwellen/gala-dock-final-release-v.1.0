/**
 * Component health for the Blackwellen operations layer (Watchtower readiness probe and the event-bus heartbeat), built from Gala Dock's
 * own ops data (public.ops_health_summary: cron freshness, queue health, open alerts/incidents, synthetic probes) plus the database, Supabase
 * Auth and the malware scanner. Same component vocabulary as Gigvora (blackwellen-operations docs/gigvora-watchtower-hermes-integration.md).
 * Output holds component names, states, counts, ages and alert rule keys only: no personal data, URLs or keys.
 * `summarise` is pure (tests); `collectOpsHealth` reads the data with the service-role client.
 */
export type State = "healthy" | "degraded" | "down" | "unknown";
export type Component = { state: State; detail?: string; count?: number; oldest_minutes?: number | null; rule_keys?: string[]; informational?: boolean };
export type OpsHealth = { overall: State; generated_at: string; components: Record<string, Component> };

type CronRow = { job?: string; active?: boolean; state?: string };
type Summary = {
  cron?: CronRow[] | null; queue?: { state?: string; dead?: number; stuck_running?: number } | null;
  alerts_open?: { rule?: string; severity?: string }[] | null; incidents_open?: { severity?: string }[] | null;
  synthetic_latest?: { check?: string; critical?: boolean; status?: string | null }[] | null;
};
export type HealthInputs = {
  now: number; dbOk: boolean; auth: "healthy" | "down"; summary: Summary | null;
  scanner: { configured: boolean; misconfigured: boolean }; awaitingScan: { count: number; oldestAt: string | null } | null;
  errorReporting: string;
};

const RANK: Record<State, number> = { healthy: 0, unknown: 1, degraded: 2, down: 3 };
const worst = (a: State, b: State): State => (RANK[b] > RANK[a] ? b : a);

export function summarise(i: HealthInputs): OpsHealth {
  const c: Record<string, Component> = {};
  c.database = { state: i.dbOk ? "healthy" : "down" };
  c.auth = { state: i.auth };
  const s = i.summary;
  if (!s) {
    c.ops_data = { state: i.dbOk ? "unknown" : "down", detail: "ops summary unavailable" };
  } else {
    const active = (s.cron ?? []).filter(r => r.active !== false && r.state !== "inactive");
    const missed = active.filter(r => r.state === "missed").length, failing = active.filter(r => r.state === "failing").length;
    const fresh = active.filter(r => r.state === "fresh").length;
    c.cron = { state: missed || failing ? "degraded" : fresh ? "healthy" : "unknown", count: active.length,
      detail: `${fresh} fresh, ${missed} missed, ${failing} failing, ${active.length - fresh - missed - failing} never run` };
    const q = s.queue ?? {};
    c.queue = { state: q.state === "healthy" ? "healthy" : q.state === "degraded" ? "degraded" : "unknown", detail: `dead ${q.dead ?? 0}, stuck ${q.stuck_running ?? 0}` };
    const alerts = s.alerts_open ?? [];
    const crit = alerts.filter(a => a.severity === "critical"), warn = alerts.filter(a => a.severity === "warning");
    // Gala Dock's own alert rules: webhook failures (payments), reconciliation, cron, email backlog, backups, SLO burn (error spikes), health.
    c.alerts = { state: crit.length ? "down" : warn.length ? "degraded" : "healthy", count: alerts.length,
      rule_keys: [...new Set([...crit, ...warn].map(a => String(a.rule ?? "")).filter(k => /^[a-z0-9_.]{1,80}$/.test(k)))].slice(0, 20) };
    const inc = s.incidents_open ?? [];
    c.incidents = { state: inc.length ? "degraded" : "healthy", count: inc.length };
    const syn = (s.synthetic_latest ?? []).filter(r => r.status);
    const synFailed = syn.filter(r => r.status === "failed" && r.critical);
    c.synthetic = { state: !syn.length ? "unknown" : synFailed.length ? "degraded" : "healthy", count: syn.length,
      rule_keys: synFailed.map(r => String(r.check ?? "")).filter(k => /^[a-z0-9_.]{1,80}$/.test(k)).slice(0, 20) };
  }
  // Malware scanning (shared Blackwellen AV gateway). Unconfigured = private documents stay quarantined (423), so it is never "healthy".
  if (i.scanner.misconfigured) c.file_scanning = { state: "down", detail: "scanner half-configured: uploads refused" };
  else if (!i.scanner.configured) c.file_scanning = { state: "degraded", detail: "scanner not configured: private files held unscanned", count: i.awaitingScan?.count ?? 0 };
  else if (!i.awaitingScan) c.file_scanning = { state: "unknown", detail: "scan backlog unreadable" };
  else {
    const age = i.awaitingScan.oldestAt ? Math.round((i.now - new Date(i.awaitingScan.oldestAt).getTime()) / 60000) : null;
    c.file_scanning = { state: age === null || age <= 60 ? "healthy" : age <= 24 * 60 ? "degraded" : "down", count: i.awaitingScan.count, oldest_minutes: age };
  }
  c.error_reporting = { state: i.errorReporting === "configured" ? "healthy" : "unknown", detail: i.errorReporting, informational: true };
  const overall = Object.values(c).filter(x => !x.informational).reduce<State>((a, x) => worst(a, x.state), "healthy");
  return { overall, generated_at: new Date(i.now).toISOString(), components: c };
}

type Admin = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

export async function collectOpsHealth(admin: Admin, o: { supabaseUrl?: string; anonKey?: string; scanner: { configured: boolean; misconfigured: boolean }; errorReporting: string; now?: number }): Promise<OpsHealth> {
  const now = o.now ?? Date.now();
  const [db, summary, awaiting, auth] = await Promise.all([
    Promise.resolve(admin.from("workspaces").select("id", { head: true, count: "exact" }).limit(1)).then((r: { error: unknown }) => !r.error, () => false),
    Promise.resolve(admin.rpc("ops_health_summary")).then((r: { error: unknown; data: unknown }) => (r.error ? null : r.data) as Summary | null, () => null),
    Promise.resolve(admin.from("storage_attribution").select("quarantined_at", { count: "exact" }).like("quarantine_reason", "awaiting_scan%")
      .is("released_at", null).is("deleted_at", null).order("quarantined_at", { ascending: true }).limit(1))
      .then((r: { error: unknown; count: number | null; data: { quarantined_at: string | null }[] | null }) => r.error ? null : { count: r.count ?? 0, oldestAt: r.data?.[0]?.quarantined_at ?? null }, () => null),
    o.supabaseUrl ? fetch(`${o.supabaseUrl}/auth/v1/health`, { headers: { apikey: o.anonKey ?? "" }, signal: AbortSignal.timeout(5000), cache: "no-store" })
      .then(r => (r.ok ? "healthy" : "down") as "healthy" | "down", () => "down" as const) : Promise.resolve("down" as const),
  ]);
  return summarise({ now, dbOk: db, auth, summary, scanner: o.scanner, awaitingScan: awaiting, errorReporting: o.errorReporting });
}
