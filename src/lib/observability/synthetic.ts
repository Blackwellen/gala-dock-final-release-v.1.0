// Q34 (domains 277 Synthetic Monitoring, 278 Chaos Drills): release-critical probes and drills. Every probe is read-only or
// self-cleaning: no charge, email, booking or ticket is ever created, and no AI model is called. Results are recorded with
// public.ops_record_synthetic_run (service role) and feed the sign-in SLO and the `synthetic.failures` alert.
// Dependencies are injected so the same code runs from /api/cron/probes (server), scripts and API-level tests.
import type { SupabaseClient } from "@supabase/supabase-js";
import { redact, redactText } from "./redact";
import { errorReportingHealth } from "./errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;
export type CheckStatus = "ok" | "failed" | "blocked" | "skipped";
export type CheckResult = { check: string; status: CheckStatus; duration_ms: number; detail: Record<string, unknown> };

export type TicketCredentialModule = {
  walletCredential: (ticketId: string, nonce: string, now?: number) => { payload: string };
  parseCredential: (raw: string) => { kind: string } & Record<string, unknown>;
  verifySignature: (p: never, nonce: string, now?: number) => boolean;
};
export type SyntheticDeps = {
  service: Db;                          // service-role client (worker-equivalent)
  anon: () => Db;                       // fresh anonymous client (browser-equivalent)
  supabaseUrl: string; anonKey: string;
  baseUrl?: string;                     // app origin for HTTP probes; HTTP steps are skipped without it
  cronSecret?: string;                  // ops bearer (drills only)
  login?: { email: string; password: string } | null;
  ticket?: TicketCredentialModule | null;
  agentToolIds?: string[] | null;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

const PUBLIC_HEALTH_KEYS = ["at", "db", "latency_ms", "maintenance", "status"];
/** Azure-only contract (mirrors src/lib/agent/llm.ts agentConfigured; owner decision: no other AI provider). */
export const agentContract = (env: Record<string, string | undefined>) => {
  const required = ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AGENT_MODEL_MINI"];
  const missing = required.filter(k => !env[k]?.trim());
  return { configured: missing.length === 0, required, missing };
};

async function timed(check: string, fn: () => Promise<{ status: CheckStatus; detail: Record<string, unknown> }>): Promise<CheckResult> {
  const t0 = Date.now();
  try { const r = await fn(); return { check, status: r.status, duration_ms: Date.now() - t0, detail: redact(r.detail) as Record<string, unknown> }; }
  catch (e) { return { check, status: "failed", duration_ms: Date.now() - t0, detail: redact({ error: (e as Error).message }) as Record<string, unknown> }; }
}
const http = async (d: SyntheticDeps, path: string, init?: RequestInit) =>
  (d.fetchImpl ?? fetch)(`${d.baseUrl!.replace(/\/+$/, "")}${path}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(15_000), cache: "no-store" });

// ── Probes ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const PROBES: Record<string, (d: SyntheticDeps) => Promise<{ status: CheckStatus; detail: Record<string, unknown> }>> = {
  "probe.health": async d => {
    if (!d.baseUrl) return { status: "skipped", detail: { reason: "no base url" } };
    const r = await http(d, "/api/health"); const body = await r.json().catch(() => ({})) as Record<string, unknown>;
    const extra = Object.keys(body).filter(k => !PUBLIC_HEALTH_KEYS.includes(k));
    const ok = r.status === 200 && body.status === "ok" && extra.length === 0 && Boolean(r.headers.get("x-correlation-id"));
    return { status: ok ? "ok" : "failed", detail: { http: r.status, body_status: body.status, leaked_keys: extra, correlation_header: Boolean(r.headers.get("x-correlation-id")) } };
  },
  "probe.login": async d => {
    const f = d.fetchImpl ?? fetch;
    const h = await f(`${d.supabaseUrl}/auth/v1/health`, { headers: { apikey: d.anonKey }, signal: AbortSignal.timeout(10_000) });
    if (!h.ok) return { status: "failed", detail: { auth_health: h.status } };
    if (!d.login) return { status: "ok", detail: { auth_health: h.status, mode: "health_only", note: "probe identity not configured (SYNTHETIC_PROBE_EMAIL / SYNTHETIC_PROBE_PASSWORD)" } };
    const c = d.anon();
    const s = await c.auth.signInWithPassword({ email: d.login.email, password: d.login.password });
    if (s.error || !s.data.session) return { status: "failed", detail: { auth_health: h.status, sign_in: s.error?.status ?? "no_session", code: s.error?.code } };
    const me = await c.auth.getUser();
    await c.auth.signOut();
    return { status: me.data.user ? "ok" : "failed", detail: { auth_health: h.status, mode: "password_sign_in", user_resolved: Boolean(me.data.user) } };
  },
  "probe.checkout": async d => {
    const { data: ev } = await d.service.from("events").select("id").eq("status", "published").gte("starts_at", new Date().toISOString()).limit(1).maybeSingle();
    const steps: Record<string, unknown> = {};
    if (ev) { const r = await d.anon().rpc("event_payment_readiness", { p_event: (ev as { id: string }).id }); steps.readiness_rpc = r.error ? `error ${r.error.code}` : "ok"; }
    else steps.readiness_rpc = "no upcoming published event";
    if (d.baseUrl) {
      const r = await http(d, "/api/checkout/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      steps.session_unauthenticated = r.status;           // must refuse (4xx), never 5xx, never create a session
    }
    const failed = String(steps.readiness_rpc).startsWith("error") || (typeof steps.session_unauthenticated === "number" && (steps.session_unauthenticated < 400 || steps.session_unauthenticated >= 500));
    return { status: failed ? "failed" : "ok", detail: steps };
  },
  "probe.ticket": async d => {
    if (!d.ticket) return { status: "blocked", detail: { reason: "credential module not provided" } };
    const id = "00000000-0000-4000-8000-000000000001", nonce = "probe-nonce";
    const cred = d.ticket.walletCredential(id, nonce).payload;
    const parsed = d.ticket.parseCredential(cred);
    const good = parsed.kind === "wallet" && d.ticket.verifySignature(parsed as never, nonce);
    const forged = cred.slice(0, -4) + (cred.endsWith("AAAA") ? "BBBB" : "AAAA");   // still well-formed, wrong signature
    const fp = d.ticket.parseCredential(forged);
    const rejected = fp.kind !== "wallet" || !d.ticket.verifySignature(fp as never, nonce);
    const staleNonce = !d.ticket.verifySignature(parsed as never, "rotated-nonce");
    return { status: good && rejected && staleNonce ? "ok" : "failed", detail: { signs_and_verifies: good, forged_rejected: rejected, rotated_nonce_rejected: staleNonce } };
  },
  "probe.booking": async d => {
    const r = await d.service.rpc("public_discover", { p_limit: 3 } as never);
    if (r.error) return { status: "failed", detail: { discover: r.error.code } };
    return { status: "ok", detail: { discover: "ok", rows: Array.isArray(r.data) ? r.data.length : r.data && typeof r.data === "object" ? Object.keys(r.data).length : 0 } };
  },
  "probe.agent": async d => {
    const contract = agentContract(d.env ?? {});
    const { data, error } = await d.service.from("agent_tools").select("id");
    if (error) return { status: "failed", detail: { agent_tools: error.code } };
    const db = new Set(((data ?? []) as { id: string }[]).map(x => x.id)), reg = new Set(d.agentToolIds ?? []);
    const drift = d.agentToolIds ? [...reg].filter(x => !db.has(x)).concat([...db].filter(x => !reg.has(x))) : [];
    return { status: drift.length ? "failed" : contract.configured ? "ok" : "blocked",
      detail: { tools_db: db.size, tools_registry: d.agentToolIds?.length ?? null, drift, azure_configured: contract.configured, missing_env: contract.missing, model_called: false } };
  },
  "probe.webhook": async d => {
    const steps: Record<string, unknown> = {};
    if (d.baseUrl) {
      const r = await http(d, "/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "evt_probe_unsigned", type: "probe" }) });
      steps.stripe_unsigned = r.status;                   // 400 (bad signature) or 503 (not configured) — never 2xx
    }
    const { signPayload, verifySignature } = await import("../developer/signature");
    const body = JSON.stringify({ id: "probe", type: "event.updated" });
    const { header } = signPayload(body, ["whsec_probe_secret_value"]);
    steps.developer_signature_ok = verifySignature(header, body, "whsec_probe_secret_value").ok;
    steps.developer_tamper_rejected = !verifySignature(header, body + " ", "whsec_probe_secret_value").ok;
    const unsignedOk = steps.stripe_unsigned === undefined || steps.stripe_unsigned === 400 || steps.stripe_unsigned === 503;
    return { status: unsignedOk && steps.developer_signature_ok && steps.developer_tamper_rejected ? "ok" : "failed", detail: steps };
  },
  "probe.queue": async d => {
    const key = `ops.probe_noop:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const { data: id, error } = await d.service.rpc("enqueue_job", { p_kind: "ops.probe_noop", p_payload: { probe: "synthetic" }, p_dedupe_key: key });
    if (error) return { status: "failed", detail: { enqueue: error.code } };
    const run = await d.service.rpc("run_db_jobs", { p_limit: 5, p_kinds: ["ops.probe_noop"] });
    const { data: j } = await d.service.from("job_queue").select("status,result").eq("id", id as string).maybeSingle();
    const ok = (j as { status?: string } | null)?.status === "succeeded";
    await d.service.from("job_queue").delete().eq("id", id as string);
    return { status: ok ? "ok" : "failed", detail: { run: run.error ? run.error.code : "ok", job_status: (j as { status?: string } | null)?.status ?? "missing" } };
  },
  "probe.backup": async d => {
    const { data, error } = await d.service.rpc("ops_backup_status");
    if (error) return { status: "failed", detail: { rpc: error.code } };
    const db = (data as { database?: { age_hours?: number | null; retention_ok?: boolean; latest_complete?: string } }).database ?? {};
    const fresh = typeof db.age_hours === "number" && db.age_hours <= 26;
    return { status: fresh && db.retention_ok !== false ? "ok" : "failed", detail: { latest: db.latest_complete, age_hours: db.age_hours, retention_ok: db.retention_ok } };
  },
};

export const RELEASE_CRITICAL_PROBES = ["probe.health", "probe.login", "probe.checkout", "probe.ticket", "probe.webhook", "probe.queue", "probe.backup"];

export async function runProbes(d: SyntheticDeps, only?: string[]): Promise<CheckResult[]> {
  const keys = only?.length ? only : Object.keys(PROBES);
  const out: CheckResult[] = [];
  for (const k of keys) { const p = PROBES[k]; if (p) out.push(await timed(k, () => p(d))); }   // sequential: probes are light and must not stampede
  return out;
}

export async function recordResults(service: Db, results: CheckResult[], o: { source: "script" | "test" | "cron" | "health" | "drill"; correlationId?: string; environment?: string }) {
  const ids: string[] = [];
  for (const r of results) {
    const { data, error } = await service.rpc("ops_record_synthetic_run", { p_check: r.check, p_status: r.status, p_duration_ms: r.duration_ms, p_detail: r.detail,
      p_source: o.source, p_correlation: o.correlationId ?? null, p_environment: o.environment ?? null });
    if (error) throw new Error(`record ${r.check}: ${error.message}`);
    ids.push(data as string);
  }
  return ids;
}

// ── Chaos drills (safe, self-cleaning failure injection against the shared project) ───────────────────────────────────
export const DRILLS: Record<string, (d: SyntheticDeps) => Promise<{ status: CheckStatus; detail: Record<string, unknown> }>> = {
  // Queue: failing handler → backoff → dead letter → dead-letter alert fires → operator replay → succeeds → alert resolves.
  "drill.queue": async d => {
    const kind = `test.drill_fail_${Math.random().toString(36).slice(2, 8)}`, rule = `test.drill_dead_${kind.slice(-6)}`;
    const s = d.service, steps: Record<string, unknown> = {};
    await s.from("job_kinds").insert({ kind, runtime: "app", max_attempts: 2, backoff_seconds: [1, 1], lease_seconds: 30, description: "Q34 queue drill (temporary)" });
    await s.from("ops_alert_rules").insert({ key: rule, name: "Drill dead letters", signal: "dead_letter_growth", comparator: ">", threshold: 0, severity: "warning", recipients: "none", description: "Q34 drill" });
    try {
      const { data: id } = await s.rpc("enqueue_job", { p_kind: kind, p_payload: { drill: true } });
      // run_after well in the past: the app host clock can run ahead of the database clock (seen +1.7 s), and claim_jobs uses DB now().
      for (let i = 1; i <= 2; i++) {
        await s.from("job_queue").update({ run_after: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("id", id as string);
        const claimed = await s.rpc("claim_jobs", { p_worker: "drill", p_runtime: "app", p_limit: 1, p_kinds: [kind] });
        steps[`claim_${i}`] = (claimed.data as unknown[] | null)?.length ?? 0;
        // Same path as runAppJobs: the handler's message is redacted before it is stored.
        steps[`fail_${i}`] = (await s.rpc("fail_job", { p_job: id, p_worker: "drill", p_error: redactText("drill: simulated provider timeout for guest someone@example.com (Bearer abcdefghijklmnop)") })).data;
      }
      const { data: dead } = await s.from("job_queue").select("status,last_error").eq("id", id as string).single();
      steps.dead = (dead as { status: string }).status === "dead";
      steps.stored_error_redacted = !/@example\.com|abcdefghijklmnop/.test(String((dead as { last_error: string }).last_error));
      const fired = (await s.rpc("ops_evaluate_alerts", { p_only: [rule] })).data as { fired: string[] };
      steps.alert_fired = fired.fired.includes(rule);
      steps.replayed = (await s.rpc("retry_dead_job", { p_job: id, p_reason: "Q34 queue drill replay" })).data;
      await s.from("job_queue").update({ run_after: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("id", id as string);
      await s.rpc("claim_jobs", { p_worker: "drill", p_runtime: "app", p_limit: 1, p_kinds: [kind] });
      steps.completed = (await s.rpc("complete_job", { p_job: id, p_worker: "drill", p_result: { drill: "recovered" } })).data;
      const resolved = (await s.rpc("ops_evaluate_alerts", { p_only: [rule] })).data as { resolved: string[] };
      steps.alert_resolved = resolved.resolved.includes(rule);
      await s.from("job_queue").delete().eq("id", id as string);
    } finally {
      await s.from("ops_alert_rules").delete().eq("key", rule);
      await s.from("job_queue").delete().eq("kind", kind);
      await s.from("job_kinds").delete().eq("kind", kind);
    }
    const ok = steps.dead === true && steps.stored_error_redacted === true && steps.alert_fired === true && steps.replayed === true && steps.completed === true && steps.alert_resolved === true;
    return { status: ok ? "ok" : "failed", detail: steps };
  },
  // Payments: forged and unsigned Stripe webhooks refused; a replayed event id is claimed once; failure-rate alert path fires/resolves.
  "drill.payment": async d => {
    const s = d.service, steps: Record<string, unknown> = {}, ext = `evt_q34drill_${Date.now()}`, rule = `test.drill_whfail_${Date.now() % 1e6}`;
    if (d.baseUrl) {
      steps.unsigned = (await http(d, "/api/stripe/webhook", { method: "POST", body: "{}" })).status;
      steps.forged = (await http(d, "/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` }, body: JSON.stringify({ id: ext, type: "charge.refunded" }) })).status;
    }
    try {
      steps.first_claim = (await s.rpc("claim_webhook_event", { p_provider: "stripe", p_external_id: ext, p_type: "q34.drill", p_livemode: false })).data;
      steps.replay_claim = (await s.rpc("claim_webhook_event", { p_provider: "stripe", p_external_id: ext, p_type: "q34.drill", p_livemode: false })).data;
      await s.from("ops_alert_rules").insert({ key: rule, name: "Drill webhook failure rate", signal: "webhook_inbound_failure_rate", comparator: ">", threshold: 5, severity: "warning", recipients: "none", description: "Q34 drill" });
      steps.alert_fired = ((await s.rpc("ops_evaluate_alerts", { p_only: [rule], p_synthetic: { [rule]: 40 } })).data as { fired: string[] }).fired.includes(rule);
      steps.alert_resolved = ((await s.rpc("ops_evaluate_alerts", { p_only: [rule], p_synthetic: { [rule]: 0 } })).data as { resolved: string[] }).resolved.includes(rule);
    } finally {
      await s.from("webhook_events").delete().eq("provider", "stripe").eq("external_id", ext);
      await s.from("ops_alert_rules").delete().eq("key", rule);
    }
    const refused = (v: unknown) => v === undefined || v === 400 || v === 503;
    const ok = refused(steps.unsigned) && refused(steps.forged) && steps.first_claim === true && steps.replay_claim === false && steps.alert_fired === true && steps.alert_resolved === true;
    return { status: ok ? "ok" : "failed", detail: steps };
  },
  // Storage / scanner / error tracking unconfigured must read as blocked, never healthy.
  "drill.storage": async d => {
    const steps: Record<string, unknown> = { error_reporting_without_dsn: errorReportingHealth({}).state };
    const env = d.env ?? {};
    if (d.baseUrl && d.cronSecret) {
      const r = await http(d, "/api/health", { headers: { authorization: `Bearer ${d.cronSecret}` } });
      const b = await r.json() as { contracts?: { clamav?: string; r2?: string }; integrations?: { key: string; status: string }[] };
      steps.clamav_contract = b.contracts?.clamav;
      steps.av_scanner_status = b.integrations?.find(i => i.key === "av_scanner")?.status;
      steps.r2_contract = b.contracts?.r2;
      steps.scanner_env_present = Boolean(env.CLAMAV_SCAN_URL && env.CLAMAV_SCAN_TOKEN);
    }
    const { data } = await d.service.rpc("ops_alert_signal", { p_signal: "storage_backup_lag" });
    steps.storage_lag_signal = (data as { value: number }).value;
    const scannerHonest = steps.scanner_env_present === undefined || steps.scanner_env_present === true || (steps.clamav_contract === "BLOCKED_EXTERNAL" && steps.av_scanner_status === "blocked_external");
    return { status: steps.error_reporting_without_dsn === "blocked_external" && scannerHonest ? "ok" : "failed", detail: steps };
  },
  // Auth: wrong password, forged JWT and a missing / wrong ops bearer are all refused; anonymous health stays minimal.
  "drill.auth": async d => {
    const steps: Record<string, unknown> = {};
    const bad = await d.anon().auth.signInWithPassword({ email: "nobody-q34-drill@gala-dock.test", password: "wrong-password-1!" });
    steps.wrong_password_refused = Boolean(bad.error);
    const forgedJwt = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", Buffer.from(JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000", role: "authenticated", aal: "aal2", exp: 4102444800 })).toString("base64url"), "c2lnbmF0dXJl"].join(".");
    const f = d.fetchImpl ?? fetch;
    const r = await f(`${d.supabaseUrl}/rest/v1/rpc/admin_ops_observability`, { method: "POST", headers: { apikey: d.anonKey, authorization: `Bearer ${forgedJwt}`, "content-type": "application/json" }, body: "{}" });
    steps.forged_jwt_status = r.status;
    const anonRpc = await d.anon().rpc("admin_ops_observability");
    steps.anon_rpc_refused = Boolean(anonRpc.error);
    if (d.baseUrl) {
      const h = await http(d, "/api/health", { headers: { authorization: "Bearer not-the-secret" } });
      steps.wrong_bearer_keys = Object.keys(await h.json()).sort();
      steps.cron_without_bearer = (await http(d, "/api/cron/jobs", { method: "POST" })).status;
    }
    const minimal = steps.wrong_bearer_keys === undefined || JSON.stringify(steps.wrong_bearer_keys) === JSON.stringify(PUBLIC_HEALTH_KEYS);
    const ok = steps.wrong_password_refused === true && (r.status === 401 || r.status === 403) && steps.anon_rpc_refused === true && minimal && (steps.cron_without_bearer === undefined || steps.cron_without_bearer === 401);
    return { status: ok ? "ok" : "failed", detail: steps };
  },
  // AI: without the Azure contract the agent is reported unavailable; the probe never calls a model.
  "drill.ai": async d => {
    const none = agentContract({}), current = agentContract(d.env ?? {});
    return { status: !none.configured && none.missing.length === 3 ? "ok" : "failed", detail: { empty_env_unavailable: !none.configured, current_configured: current.configured, model_called: false } };
  },
};

export async function runDrills(d: SyntheticDeps, only?: string[]): Promise<CheckResult[]> {
  const keys = only?.length ? only : Object.keys(DRILLS);
  const out: CheckResult[] = [];
  for (const k of keys) { const p = DRILLS[k]; if (p) out.push(await timed(k, () => p(d))); }
  return out;
}
