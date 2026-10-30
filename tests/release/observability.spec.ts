import * as nodeCrypto from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, enrolTotp, signedIn } from "../phase1/helpers";
import { redact, redactText, containsSensitive, REDACTED } from "../../src/lib/observability/redact";
import { setLogSink, log, type LogLine } from "../../src/lib/observability/log";
import { withContext, currentCorrelationId, correlationFrom, isCorrelationId } from "../../src/lib/observability/context";
import { buildErrorEvent, errorReportingHealth, reportError } from "../../src/lib/observability/errors";
import { withObservability } from "../../src/lib/observability/http";
import { budgetRemaining, burnRate, compliance, percentile, sloStatus } from "../../src/lib/observability/slo";
import { DRILLS, PROBES, RELEASE_CRITICAL_PROBES, recordResults, runDrills, runProbes, type TicketCredentialModule } from "../../src/lib/observability/synthetic";
import { TOOLS } from "../../src/lib/agent/registry";

// Q34 Observability / SRE / Continuity (domains 213–222, 277–279). API level only, no browser. The dev server on :3107 serves the
// HTTP probes; the database side runs against the shared project with test-only rules (keys `test.*`, recipients limited to a
// disposable admin) so real alerts are never fired, resolved or acknowledged by the suite. No email, paging or external call.

const db = admin as unknown as SupabaseClient;
type Db = SupabaseClient;
// Synthetic samples, split so secret scanners don't mistake them for real credentials (GitHub push protection, 2026-10-30).
const SECRET_SAMPLES = {
  email: "guest.name@example.com", bearer: "Bearer " + "eyJ" + "hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlc2lnbmF0dXJl",
  stripe: "sk_" + "live_51AbCdEfGhIjKlMnOpQrStUv", whsec: "whs" + "ec_abcdefghijklmnopqrstu", gd: "gd_" + "live_ab12cd34_0123456789abcdef0123456789abcdef",
  card: "4242 4242 4242 4242", phone: "+44 7700 900123", ip: "203.0.113.42",
};

function credentials(): TicketCredentialModule {
  const loaded = { exports: {} as TicketCredentialModule };
  const require = (n: string) => n === "server-only" ? {} : n === "node:crypto" ? nodeCrypto : (() => { throw new Error(`Unexpected dependency ${n}`); })();
  const js = ts.transpileModule(readFileSync("src/lib/tickets/credentials.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(js, { module: loaded, exports: loaded.exports, require, process, Buffer, Date, Math });
  return loaded.exports;
}
const deps = (extra: Record<string, unknown> = {}) => ({
  service: db, anon: () => anon() as unknown as Db, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  baseUrl: BASE, cronSecret: process.env.CRON_SECRET, ticket: credentials(), agentToolIds: TOOLS.map(t => t.id), env: process.env, ...extra,
});

test.describe.configure({ mode: "serial" });

test.describe("Q34 observability, SRE and continuity", () => {
  let opsAdmin: { id: string; email: string }, plain: { id: string; email: string };
  let opsC: Db, plainC: Db;
  const testRules: string[] = [], incidents: string[] = [];

  test.beforeAll(async () => {
    opsAdmin = await createUser("q34-ops", "Q34 Ops Admin");
    plain = await createUser("q34-plain", "Q34 Plain User");
    await db.from("platform_admins").insert({ user_id: opsAdmin.id, title: "Q34 on-call (test)", permissions: ["settings", "audit"] });
    opsC = (await signedIn(opsAdmin.email)) as unknown as Db;
    await enrolTotp(opsC as never, "q34-ops");
    plainC = (await signedIn(plain.email)) as unknown as Db;
  });

  test.afterAll(async () => {
    if (incidents.length) await db.from("ops_incidents").delete().in("id", incidents);
    if (testRules.length) await db.from("ops_alert_rules").delete().in("key", testRules);   // alerts cascade
    await db.from("ops_slo_definitions").delete().like("key", "test.%");
    await db.from("ops_metric_rollups").delete().like("metric_key", "test.%");
    await db.from("notifications").delete().eq("user_id", opsAdmin.id);
    await db.from("platform_admins").delete().eq("user_id", opsAdmin.id);
    await cleanup();
  });

  test("redaction: secrets, tokens, contact and guest-care data never reach a log line or error report", async () => {
    const text = Object.values(SECRET_SAMPLES).join(" | ");
    const scrubbed = redactText(text);
    for (const v of Object.values(SECRET_SAMPLES)) expect(scrubbed).not.toContain(v.replace(/^Bearer /, ""));
    expect(containsSensitive(scrubbed)).toBe(false);
    expect(redactText("https://x.test/cb?token=abc123&ok=1&X-Amz-Signature=deadbeef")).toBe(`https://x.test/cb?token=${REDACTED}&ok=1&X-Amz-Signature=${REDACTED}`);

    const r = redact({ password: "hunter2", api_key: "k", authorization: "Bearer x", has_token: true, tokens: 1200, dietary: "nut allergy", access_needs: "wheelchair",
      guest_name: "Ada", notes: "VIP", email: "a@b.co", nested: { phone: "07700900123", order_ref: "GD-123", msg: `contact ${SECRET_SAMPLES.email}` }, ok: 1 }) as Record<string, unknown>;
    expect(r).toMatchObject({ password: REDACTED, api_key: REDACTED, authorization: REDACTED, has_token: true, tokens: 1200, dietary: REDACTED, access_needs: REDACTED,
      guest_name: REDACTED, notes: REDACTED, email: REDACTED, ok: 1 });
    expect(r.nested).toMatchObject({ phone: REDACTED, order_ref: "GD-123", msg: "contact [email]" });
    const circ: Record<string, unknown> = { a: 1 }; circ.self = circ;
    expect((redact(circ) as Record<string, unknown>).self).toBe("[circular]");
    expect(JSON.stringify(redact({ big: "x".repeat(50_000) })).length).toBeLessThan(3_000);   // log budget

    const lines: string[] = [];
    const restore = setLogSink((_l, s) => lines.push(s));
    try {
      log.error("test.redaction", { msg: `failed for ${SECRET_SAMPLES.email}`, headers: new Headers({ authorization: "Bearer zzz", cookie: "sb=1", "x-trace": "1" }), detail: { secret: "s", token: SECRET_SAMPLES.stripe, note: "care" } });
      log.info("BAD EVENT NAME", {});
    } finally { restore(); }
    expect(lines).toHaveLength(2);
    expect(containsSensitive(lines.join("\n"))).toBe(false);
    expect(lines.join("\n")).not.toMatch(/hunter2|zzz|sk_live|sb=1|care/);
    expect(JSON.parse(lines[0])).toMatchObject({ level: "error", event: "test.redaction", service: "gala-dock", headers: { header_names: ["x-trace"] } });
    expect(JSON.parse(lines[1]).event).toBe("log.invalid_event_name");

    const ev = buildErrorEvent(new Error(`Stripe ${SECRET_SAMPLES.stripe} failed for ${SECRET_SAMPLES.email}`), { path: "/api/x?token=abc", extra: { email: "a@b.co", attempt: 2 } }, {});
    const evs = JSON.stringify(ev);
    expect(evs).not.toMatch(/sk_live|example\.com|token=abc|a@b\.co/);
    expect(ev.request?.url).toBe("/api/x");
    expect(ev.extra).toMatchObject({ email: REDACTED, attempt: 2 });
  });

  test("error-reporting adapter: env contract, BLOCKED_EXTERNAL without a DSN, redacted send when configured (stubbed transport)", async () => {
    expect(errorReportingHealth({})).toMatchObject({ state: "blocked_external", missing: ["SENTRY_DSN"], env: ["SENTRY_DSN"] });
    expect(errorReportingHealth({ SENTRY_DSN: "not a url" }).state).toBe("misconfigured");
    expect(errorReportingHealth({ SENTRY_DSN: "http://k@errors.example/1" }).state).toBe("misconfigured");    // https only
    expect(errorReportingHealth({ SENTRY_DSN: "https://k@errors.example/1", SENTRY_SAMPLE_RATE: "2" }).state).toBe("misconfigured");
    const ok = errorReportingHealth({ SENTRY_DSN: "https://pubkey@errors.example/42" });
    expect(ok).toMatchObject({ state: "configured", host: "errors.example" });
    expect(JSON.stringify(ok)).not.toContain("pubkey");

    const lines: LogLine[] = []; const restore = setLogSink(l => lines.push(l));
    try {
      expect(await reportError(new Error("boom"), {}, { env: {} })).toEqual({ logged: true, sent: false, reason: "blocked_external" });
      const sent: { url: string; body: string; auth: string }[] = [];
      const fetchImpl = (async (url: string, init: RequestInit) => { sent.push({ url, body: String(init.body), auth: String((init.headers as Record<string, string>)["X-Sentry-Auth"]) }); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
      const res = await withContext({ correlationId: "cor_test_report_0001" }, () => reportError(new Error(`charge failed for ${SECRET_SAMPLES.email}`), { operation: "test.op" }, { env: { SENTRY_DSN: "https://pubkey@errors.example/42" }, fetchImpl }));
      expect(res).toEqual({ logged: true, sent: true });
      expect(sent[0].url).toBe("https://errors.example/api/42/store/");
      expect(sent[0].auth).toContain("sentry_key=pubkey");
      expect(sent[0].body).not.toContain("example.com");
      expect(JSON.parse(sent[0].body).tags).toMatchObject({ correlation_id: "cor_test_report_0001", operation: "test.op" });
    } finally { restore(); }
    expect(lines.filter(l => l.event === "error.reported")).toHaveLength(2);
  });

  test("correlation ids: minted or accepted at the edge, echoed, carried through context, wrappers and logs", async () => {
    const minted = await fetch(`${BASE}/api/health`);
    expect(isCorrelationId(minted.headers.get("x-correlation-id"))).toBe(true);
    const given = "cor_q34test_0123456789";
    expect((await fetch(`${BASE}/api/health`, { headers: { "x-correlation-id": given } })).headers.get("x-correlation-id")).toBe(given);
    const bad = (await fetch(`${BASE}/api/health`, { headers: { "x-correlation-id": "bad id<script>" } })).headers.get("x-correlation-id");
    expect(bad).not.toBe("bad id<script>"); expect(isCorrelationId(bad)).toBe(true);
    expect(correlationFrom(new Headers({ "x-request-id": "req_abcdef" }))).toBe("req_abcdef");

    const lines: LogLine[] = []; const restore = setLogSink(l => lines.push(l));
    try {
      // Context survives awaits and nests; the wrapper adopts the inbound id, echoes it and logs status + latency.
      await withContext({ correlationId: "cor_outer_000001", operation: "outer" }, async () => {
        await new Promise(r => setTimeout(r, 5));
        expect(currentCorrelationId()).toBe("cor_outer_000001");
        await withContext({ operation: "inner" }, async () => { log.info("test.inner"); expect(currentCorrelationId()).toBe("cor_outer_000001"); });
      });
      const handler = withObservability("test.route", async () => { log.info("test.handler_ran"); return Response.json({ ok: true }); });
      const res = await handler(new Request("http://x.test/api/thing?secret=1", { headers: { "x-correlation-id": "cor_route_00000001" } }));
      expect(res.headers.get("x-correlation-id")).toBe("cor_route_00000001");
      const boom = withObservability("test.boom", async () => { throw new Error(`db down for ${SECRET_SAMPLES.email}`); });
      const failed = await boom(new Request("http://x.test/api/boom"));
      expect(failed.status).toBe(500);
      const body = await failed.json() as { error: string; correlation_id: string };
      expect(body).toEqual({ error: "internal_error", correlation_id: failed.headers.get("x-correlation-id") });
    } finally { restore(); }
    expect(lines.find(l => l.event === "test.inner")).toMatchObject({ correlation_id: "cor_outer_000001", operation: "inner" });
    expect(lines.find(l => l.event === "test.handler_ran")?.correlation_id).toBe("cor_route_00000001");
    expect(lines.find(l => l.event === "http.request" && l.operation === "test.route")).toMatchObject({ status: 200, path: "/api/thing", correlation_id: "cor_route_00000001" });
    expect(lines.find(l => l.event === "http.request" && l.operation === "test.route")?.path).not.toContain("secret");
    expect(lines.some(l => l.event === "error.reported" && l.operation === "test.boom")).toBe(true);
    expect(JSON.stringify(lines)).not.toContain("example.com");

    // DB leg: a job enqueued with a correlation id keeps it, and the outbox event a catalogued audit row produces carries it.
    const cid = `cor_q34_job_${Date.now()}`;
    const { data: jobId } = await db.rpc("enqueue_job", { p_kind: "ops.probe_noop", p_payload: { probe: "correlation" }, p_dedupe_key: `q34:${cid}`, p_correlation: cid });
    await db.rpc("run_db_jobs", { p_limit: 5, p_kinds: ["ops.probe_noop"] });
    const { data: job } = await db.from("job_queue").select("status,correlation_id").eq("id", jobId as string).single();
    expect(job).toEqual({ status: "succeeded", correlation_id: cid });
    await db.from("job_queue").delete().eq("id", jobId as string);
  });

  test("health: anonymous and wrong-bearer callers get liveness only; the ops bearer gets readiness, cron freshness, queues, backups, SLOs and alerts", async () => {
    const pub = await (await fetch(`${BASE}/api/health`)).json() as Record<string, unknown>;
    expect(Object.keys(pub).sort()).toEqual(["at", "db", "latency_ms", "maintenance", "status"]);
    const wrong = await (await fetch(`${BASE}/api/health`, { headers: { authorization: "Bearer nope" } })).json() as Record<string, unknown>;
    expect(Object.keys(wrong).sort()).toEqual(["at", "db", "latency_ms", "maintenance", "status"]);
    // A signed-in non-admin session cookie is not ops access either (route checks ops_can_read).
    const ops = await (await fetch(`${BASE}/api/health?probe=storage`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).json() as Record<string, unknown> & { ops: Record<string, unknown>; integrations: { key: string; env: string[] }[] };
    expect(ops.caller).toBe("bearer");
    for (const k of ["integrations", "contracts", "workers", "backlog", "error_reporting", "storage", "ops"]) expect(ops).toHaveProperty(k);
    for (const k of ["cron", "queue", "backups", "slo", "alerts_open", "incidents_open", "synthetic_latest"]) expect(ops.ops).toHaveProperty(k);
    expect(ops.storage).toMatchObject({ ok: true });
    // Env NAMES only; Q00 finding fixed: R2 and calendar contracts use the names the code reads.
    expect(ops.integrations.find(i => i.key === "r2")?.env).toEqual(["CLOUDFLARE_R2_S3_API", "CLOUDFLARE_R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]);
    expect(ops.integrations.find(i => i.key === "calendar")?.env.join(",")).toContain("MICROSOFT_CALENDAR_CLIENT_ID");
    const raw = JSON.stringify(ops);
    for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "TICKET_QR_SECRET", "R2_SECRET_ACCESS_KEY"]) { const v = process.env[k]; if (v && v.length > 8) expect(raw).not.toContain(v); }
    expect(containsSensitive(raw.replace(/"[a-f0-9]{8}-[a-f0-9-]{27}"/g, ""))).toBe(false);
    const cron = (ops.ops as { cron: { job: string; state: string; expected_minutes: number }[] }).cron;
    expect(cron.find(c => c.job === "ops-observe")).toMatchObject({ expected_minutes: 5 });
    expect(cron.find(c => c.job === "db-backup")).toMatchObject({ expected_minutes: 1440 });

    // RPC read model: refused for anon and ordinary users, allowed for an ops admin; ops tables are invisible to non-ops users.
    expect((await (anon() as unknown as Db).rpc("admin_ops_observability")).error).not.toBeNull();
    expect((await (anon() as unknown as Db).rpc("ops_health_summary")).error).not.toBeNull();
    expect((await plainC.rpc("admin_ops_observability")).error?.code).toBe("42501");
    expect((await plainC.rpc("ops_evaluate_alerts", {})).error).not.toBeNull();
    expect((await plainC.from("ops_alerts").select("id").limit(1)).data ?? []).toEqual([]);
    expect((await plainC.from("ops_alert_rules").select("key").limit(1)).data ?? []).toEqual([]);
    const view = await opsC.rpc("admin_ops_observability");
    expect(view.error).toBeNull();
    expect((view.data as { runbooks: unknown[]; rules: unknown[] }).runbooks.length).toBe(20);
    expect((view.data as { rules: { key: string }[] }).rules.some(r => r.key.startsWith("test."))).toBe(false);
    expect(((await opsC.from("ops_alert_rules").select("key")).data ?? []).length).toBeGreaterThanOrEqual(19);
  });

  test("SLO arithmetic: TypeScript and SQL agree; rollups drive status and burn-rate states", async () => {
    expect(compliance({ good: 995, bad: 5 })).toBe(0.995);
    expect(burnRate({ good: 90, bad: 10 }, 0.99)).toBe(10);
    expect(budgetRemaining({ good: 999, bad: 1 }, 0.99)).toBe(0.9);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)).toBe(100);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    const cases: [number, number[]][] = [
      [0.99, [990, 10, 90, 10, 9, 1, 900, 10, 45, 5]], [0.999, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]], [0.99, [9800, 200, 50, 50, 5, 5, 400, 100, 20, 20]],
      [0.999, [99990, 10, 100, 2, 10, 1, 600, 2, 50, 1]], [0.95, [1000, 20, 100, 3, 10, 0, 300, 9, 30, 1]], [0.995, [400, 1, 40, 1, 3, 1, 120, 1, 12, 1]],
    ];
    for (const [objective, [g, b, h1g, h1b, m5g, m5b, h6g, h6b, m30g, m30b]] of cases) {
      const { data, error } = await db.rpc("ops_slo_calc", { p_objective: objective, p_good: g, p_bad: b, p_h1_good: h1g, p_h1_bad: h1b, p_m5_good: m5g, p_m5_bad: m5b,
        p_h6_good: h6g, p_h6_bad: h6b, p_m30_good: m30g, p_m30_bad: m30b, p_fast: 14.4, p_slow: 6, p_min_events: 10 });
      expect(error).toBeNull();
      const ts = sloStatus({ key: "x", objective, windowDays: 28 }, { window: { good: g, bad: b }, h1: { good: h1g, bad: h1b }, m5: { good: m5g, bad: m5b }, h6: { good: h6g, bad: h6b }, m30: { good: m30g, bad: m30b } });
      const sql = data as Record<string, unknown>;
      expect({ state: sql.state, compliance: sql.compliance === null ? null : Number(sql.compliance), budget_remaining: Number(sql.budget_remaining), burn_1h: Number(sql.burn_1h),
        burn_6h: Number(sql.burn_6h), events: Number(sql.events), fast: sql.fast_burning, slow: sql.slow_burning })
        .toEqual({ state: ts.state, compliance: ts.compliance, budget_remaining: ts.budget_remaining, burn_1h: ts.burn_1h, burn_6h: ts.burn_6h, events: ts.events, fast: ts.fast_burning, slow: ts.slow_burning });
    }
    expect((await db.rpc("ops_slo_calc", { p_objective: 1, p_good: 1, p_bad: 0, p_h1_good: 0, p_h1_bad: 0, p_m5_good: 0, p_m5_bad: 0, p_h6_good: 0, p_h6_bad: 0, p_m30_good: 0, p_m30_bad: 0 })).error?.code).toBe("22023");

    // Definitions are data: a test SLO over synthetic rollups reaches fast burn, and the real 13 definitions all report.
    const bucket = (minsAgo: number) => new Date(Math.floor((Date.now() - minsAgo * 60_000) / 300_000) * 300_000).toISOString();
    await db.from("ops_slo_definitions").insert({ key: "test.q34_slo", journey: "test", name: "Q34 test SLO", description: "test", metric_key: "test.q34_metric", objective: 0.99, window_days: 1, min_events: 10 });
    await db.from("ops_metric_rollups").insert([
      { metric_key: "test.q34_metric", bucket_start: bucket(0), total: 20, good: 10, bad: 10 },
      { metric_key: "test.q34_metric", bucket_start: bucket(90), total: 100, good: 100, bad: 0 },
      { metric_key: "test.q34_metric", bucket_start: bucket(600), total: 1000, good: 1000, bad: 0 },
    ]);
    const { data: slo } = await db.rpc("ops_slo_status");
    const mine = (slo as { key: string; state: string; fast_burning: boolean; events: number; compliance: number }[]).find(s => s.key === "test.q34_slo")!;
    expect(mine).toMatchObject({ fast_burning: true, events: 1120 });
    expect(Number(mine.compliance)).toBeCloseTo(1110 / 1120, 5);
    expect((slo as { key: string }[]).filter(s => !s.key.startsWith("test.")).map(s => s.key).sort()).toEqual(["agent.success", "api.availability", "booking.integrity", "checkout.completion",
      "jobs.latency", "jobs.success", "marketplace.payments", "messaging.email", "platform.availability", "signin.success", "ticket.scan_sync", "webhooks.inbound", "webhooks.outbound"]);
    await db.from("ops_slo_definitions").delete().eq("key", "test.q34_slo");
    await db.from("ops_metric_rollups").delete().eq("metric_key", "test.q34_metric");

    // The collector derives rollups from canonical tables and rejects unbounded ranges.
    const { data: col, error: cErr } = await db.rpc("ops_collect_metrics", { p_since: new Date(Date.now() - 3600_000).toISOString() });
    expect(cErr).toBeNull(); expect((col as { gauges: number }).gauges).toBe(7);
    expect((await db.rpc("ops_collect_metrics", { p_since: new Date(Date.now() - 40 * 86400_000).toISOString() })).error?.code).toBe("22023");
    expect(((await db.rpc("ops_cron_expected_minutes", { p_schedule: "*/10 2-3 * * *" })).data)).toBe(1440);
  });

  test("alerts: rules fire on synthetic conditions, notify only the on-call admin in-app (no email), dedupe, open an incident, resolve", async () => {
    const key = `test.q34_critical_${Date.now() % 1e6}`, ackKey = `test.q34_ack_${Date.now() % 1e6}`; testRules.push(key, ackKey);
    const ins = await db.from("ops_alert_rules").insert([
      { key, name: "Q34 critical (test)", signal: "none", comparator: ">", threshold: 0, severity: "critical", cooldown_minutes: 60, notify_users: [opsAdmin.id], runbook_key: "payments-outage", auto_incident: true, description: "test" },
      { key: ackKey, name: "Q34 ack (test)", signal: "none", comparator: ">=", threshold: 3, severity: "warning", cooldown_minutes: 5, notify_users: [opsAdmin.id], runbook_key: null, auto_incident: false, description: "test" },
    ]);
    expect(ins.error).toBeNull();
    // Dry run writes nothing.
    const dry = (await db.rpc("ops_evaluate_alerts", { p_only: [key], p_synthetic: { [key]: 5 }, p_dry_run: true })).data as { fired: string[] };
    expect(dry.fired).toEqual([key]);
    expect((await db.from("ops_alerts").select("id").eq("rule_key", key)).data).toEqual([]);

    const fired = (await db.rpc("ops_evaluate_alerts", { p_only: [key, ackKey], p_synthetic: { [key]: 5, [ackKey]: 2 } })).data as { fired: string[]; notified: number; results: { rule: string; breached: boolean }[] };
    expect(fired.fired).toEqual([key]);                                   // 2 < 3: the >= rule does not fire
    expect(fired.notified).toBe(1);
    const { data: alert } = await db.from("ops_alerts").select("id,status,severity,incident_id,notified_count,correlation_id").eq("rule_key", key).single();
    expect(alert).toMatchObject({ status: "open", severity: "critical", notified_count: 1 });
    expect(alert!.incident_id).not.toBeNull(); incidents.push(alert!.incident_id as string);
    const { data: notes } = await db.from("notifications").select("id,kind,link").eq("user_id", opsAdmin.id);
    expect(notes!.filter(n => n.link === `/admin/health?alert=${alert!.id}`)).toHaveLength(1);
    expect(notes!.every(n => n.kind === "admin.ops_alert")).toBe(true);
    expect((await db.from("email_outbox").select("id").in("notification_id", notes!.map(n => n.id))).data).toEqual([]);   // in-app only
    expect((await db.from("domain_outbox").select("event_type").eq("aggregate_id", alert!.id)).data!.map(e => e.event_type)).toContain("ops.alert_fired");
    expect((await db.from("audit_events").select("event,correlation_id").eq("correlation_id", alert!.correlation_id)).data!.map(e => e.event)).toContain("ops.alert_fired");

    // Still breached within the cooldown: no second notification; the real rules were untouched.
    const again = (await db.rpc("ops_evaluate_alerts", { p_only: [key], p_synthetic: { [key]: 9 } })).data as { still_open: string[]; notified: number };
    expect(again).toMatchObject({ still_open: [key], notified: 0 });

    // Acknowledge (ops admin, MFA, reason) suppresses re-notification; a non-admin cannot acknowledge.
    await db.rpc("ops_evaluate_alerts", { p_only: [ackKey], p_synthetic: { [ackKey]: 3 } });
    const { data: ackAlert } = await db.from("ops_alerts").select("id").eq("rule_key", ackKey).single();
    expect((await plainC.rpc("admin_ops_alert_ack", { p_alert: ackAlert!.id, p_reason: "not mine to ack" })).error?.code).toBe("42501");
    expect((await opsC.rpc("admin_ops_alert_ack", { p_alert: ackAlert!.id, p_reason: "On it (Q34 test)" })).error).toBeNull();
    await db.from("ops_alerts").update({ last_notified_at: new Date(Date.now() - 3600_000).toISOString() }).eq("id", ackAlert!.id);
    expect(((await db.rpc("ops_evaluate_alerts", { p_only: [ackKey], p_synthetic: { [ackKey]: 4 } })).data as { notified: number }).notified).toBe(0);

    // Clear → resolved, with an event.
    const res = (await db.rpc("ops_evaluate_alerts", { p_only: [key, ackKey], p_synthetic: { [key]: 0, [ackKey]: 0 } })).data as { resolved: string[] };
    expect(res.resolved.sort()).toEqual([key, ackKey].sort());
    expect((await db.from("ops_alerts").select("status").eq("id", alert!.id).single()).data!.status).toBe("resolved");

    // Every live signal evaluates (dry run) without error.
    const live = (await db.rpc("ops_evaluate_alerts", { p_dry_run: true })).data as { evaluated: number; results: { rule: string; value: number | null }[] };
    expect(live.evaluated).toBeGreaterThanOrEqual(20);
    expect(live.results.filter(r => r.value === null).map(r => r.rule)).toEqual([]);
  });

  test("incidents: MFA ops admin runs the lifecycle with an optimistic version check; invalid transitions and non-admins are refused", async () => {
    expect((await plainC.rpc("admin_ops_incident_open", { p_title: "Not allowed", p_severity: "sev3", p_summary: "nope nope", p_reason: "nope nope" })).error?.code).toBe("42501");
    const open = await opsC.rpc("admin_ops_incident_open", { p_title: "Q34 test: scanner offline at the door", p_severity: "sev2", p_summary: "Door 2 scanners cannot sync (test)", p_runbook: "scanner-offline", p_reason: "Q34 test incident" });
    expect(open.error).toBeNull();
    const id = (open.data as { incident_id: string; reference: string }).incident_id; incidents.push(id);
    expect((open.data as { reference: string }).reference).toMatch(/^INC-\d{8}-\d{4}$/);
    const step = (args: Record<string, unknown>) => opsC.rpc("admin_ops_incident_update", { p_incident: id, ...args });
    expect((await step({ p_action: "commander_assigned", p_note: "Taking command (test)", p_to_status: "investigating", p_expected_version: 1 })).error).toBeNull();
    expect((await step({ p_action: "note", p_note: "stale write (test)", p_expected_version: 1 })).error?.message).toBe("stale_version");
    expect((await step({ p_action: "note", p_note: "jump (test)", p_to_status: "postmortem_done" })).error?.code).toBe("22023");
    expect((await step({ p_action: "containment", p_note: "Offline mode on, manifests refreshed (test)", p_to_status: "contained" })).error).toBeNull();
    expect((await step({ p_action: "runbook_step", p_note: "Step 3 done (test)", p_runbook_step: "refresh offline manifest" })).error).toBeNull();
    expect((await step({ p_action: "recovery", p_note: "Synced 214 offline scans (test)", p_to_status: "resolved" })).error).toBeNull();
    expect((await step({ p_action: "postmortem", p_note: "no url (test)", p_to_status: "postmortem_done" })).error?.code).toBe("22023");
    expect((await step({ p_action: "postmortem", p_note: "Postmortem filed (test)", p_to_status: "postmortem_done", p_postmortem_url: "docs/operations/runbooks.md#scanner-offline" })).error).toBeNull();
    const detail = (await opsC.rpc("admin_ops_incident_detail", { p_incident: id })).data as { status: string; actions: { action: string }[]; runbook: { key: string }; commander: string };
    expect(detail).toMatchObject({ status: "postmortem_done", commander: opsAdmin.id, runbook: { key: "scanner-offline" } });
    expect(detail.actions.map(a => a.action)).toEqual(["declared", "commander_assigned", "containment", "runbook_step", "recovery", "postmortem"]);
    expect((await db.from("domain_outbox").select("event_type").eq("aggregate_id", id)).data!.map(e => e.event_type).sort()).toEqual(
      ["ops.incident_opened", "ops.incident_resolved", "ops.incident_updated", "ops.incident_updated", "ops.incident_updated", "ops.incident_updated"].sort());
    expect((await plainC.rpc("admin_ops_incident_detail", { p_incident: id })).error?.code).toBe("42501");
  });

  test("backups and restore: nightly R2 backup fresh and within retention; drills recorded only against non-live targets", async () => {
    const { data } = await db.rpc("ops_backup_status");
    const b = data as { database: { age_hours: number; retention_ok: boolean; runs: number }; storage: { lagging: number }; restore_tests: { count: number } };
    expect(b.database.age_hours).toBeLessThanOrEqual(26);
    expect(b.database.retention_ok).toBe(true);
    // Storage replication lag is live state (non-zero while the production deployment is paused); the alert signal must agree with it.
    expect(((await db.rpc("ops_alert_signal", { p_signal: "storage_backup_lag" })).data as { value: number }).value).toBe(b.storage.lagging);
    expect((await db.rpc("ops_record_restore_test", { p_backup_kind: "db_logical", p_backup_ref: "2026-10-29", p_target_kind: "scratch_project", p_target_label: "live project", p_status: "passed",
      p_started: new Date().toISOString(), p_finished: new Date().toISOString(), p_rto_seconds: 1, p_rpo_seconds: 1, p_tables: 1, p_rows: 1 })).error?.code).toBe("22023");
    expect((await db.from("ops_restore_tests").insert({ backup_kind: "db_logical", backup_ref: "x", target_kind: "local_scratch", target_label: "xx", target_is_live: true, status: "passed",
      started_at: new Date().toISOString(), finished_at: new Date().toISOString() })).error?.code).toBe("23514");
    expect((await (anon() as unknown as Db).rpc("ops_record_restore_test", { p_backup_kind: "db_logical", p_backup_ref: "x", p_target_kind: "local_scratch", p_target_label: "xx", p_status: "passed",
      p_started: new Date().toISOString(), p_finished: new Date().toISOString(), p_rto_seconds: 1, p_rpo_seconds: 1, p_tables: 1, p_rows: 1 })).error).not.toBeNull();
    // Exit-gate evidence: the scratch restore drill (scripts/ops/restore-drill.mjs) recorded a passing local restore.
    const { data: drills } = await db.from("ops_restore_tests").select("status,target_kind,rto_seconds,rows").eq("target_kind", "local_scratch").eq("status", "passed").order("finished_at", { ascending: false }).limit(1);
    expect(drills).toHaveLength(1);
    expect(drills![0].rows).toBeGreaterThan(10_000);
  });

  test("synthetic probes: every release-critical probe passes and is recorded; failures feed the alert signal", async () => {
    const results = await runProbes(deps() as never);
    const byKey = Object.fromEntries(results.map(r => [r.check, r]));
    for (const k of RELEASE_CRITICAL_PROBES) expect(byKey[k]?.status, `${k}: ${JSON.stringify(byKey[k]?.detail)}`).toBe("ok");
    expect(byKey["probe.booking"].status).toBe("ok");
    expect(["ok", "blocked"]).toContain(byKey["probe.agent"].status);
    expect(byKey["probe.agent"].detail).toMatchObject({ drift: [], model_called: false });
    expect(Object.keys(PROBES).length).toBe(9);
    const ids = await recordResults(db, results, { source: "test", environment: "test" });
    expect(ids).toHaveLength(results.length);
    expect(JSON.stringify(results)).not.toMatch(/@gala-dock\.test|password/i);

    // Login probe with a disposable identity: real password sign-in + sign-out.
    const login = await runProbes(deps({ login: { email: plain.email, password: "Gala-Dock-Test-9!" } }) as never, ["probe.login"]);
    expect(login[0]).toMatchObject({ status: "ok", detail: { mode: "password_sign_in", user_resolved: true } });
    const wrong = await runProbes(deps({ login: { email: plain.email, password: "wrong-password-0!" } }) as never, ["probe.login"]);
    expect(wrong[0].status).toBe("failed");
    // The recorded failure is visible to the synthetic.failures signal (recorded under a test source, then removed).
    const [failId] = await recordResults(db, wrong, { source: "test", environment: "test" });
    expect(((await db.rpc("ops_alert_signal", { p_signal: "synthetic_failures_1h" })).data as { value: number }).value).toBeGreaterThanOrEqual(1);
    await db.from("ops_synthetic_runs").delete().eq("id", failId);
    await db.from("ops_synthetic_runs").delete().in("id", ids.filter((_, i) => results[i].check === "probe.login"));
  });

  test("chaos drills: queue, payment, storage, auth, database and AI failures are handled explicitly and recorded", async () => {
    const results = await runDrills(deps() as never);
    for (const r of results) expect(r.status, `${r.check}: ${JSON.stringify(r.detail)}`).toBe("ok");
    expect(results.map(r => r.check).sort()).toEqual(Object.keys(DRILLS).sort());
    // Database drill: a runaway statement is cancelled by statement_timeout fast, with an explicit error (never a hang).
    const t0 = Date.now();
    const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, { method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "begin; set local statement_timeout = '300ms'; select pg_sleep(3); commit;" }) });
    const text = await r.text(), elapsed = Date.now() - t0;
    const dbDrill = { check: "drill.database", status: (!r.ok && /statement timeout/i.test(text) && elapsed < 2900 ? "ok" : "failed") as "ok" | "failed", duration_ms: elapsed,
      detail: { http: r.status, cancelled_by_timeout: /statement timeout/i.test(text), ms: elapsed } };
    const conn = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, { method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "select (select count(*) from pg_stat_activity)::int used, current_setting('max_connections')::int max" }) });
    const [{ used, max }] = await conn.json() as { used: number; max: number }[];
    (dbDrill.detail as Record<string, unknown>).connections = { used, max, headroom_pct: Math.round(100 * (1 - used / max)) };
    expect(dbDrill.status, JSON.stringify(dbDrill.detail)).toBe("ok");
    expect(used / max).toBeLessThan(0.9);
    await recordResults(db, [...results, dbDrill], { source: "drill", environment: "test" });
  });
});
