import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

/** Blackwellen ops wiring (Watchtower readiness, event-bus heartbeat): pure modules only, no network, no app server. */
function load(file: string): Record<string, any> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const req = (n: string) => n === "node:crypto" ? crypto : n === "./bw-hmac" ? load("src/lib/observability/bw-hmac.ts") : n === "./ops-health" ? {} : (() => { throw new Error(`Unexpected dependency: ${n}`); })();
  runInNewContext(code, { module: m, exports: m.exports, require: req, Buffer, TextEncoder, URL, AbortSignal, Date, Headers });
  return m.exports as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
}
const hmac = load("src/lib/observability/bw-hmac.ts");
const health = load("src/lib/observability/ops-health.ts");
const events = load("src/lib/observability/ops-events.ts");
const SECRET = "00112233445566778899aabbccddeeff".repeat(2);
const TS = 1762819200, NONCE = "abcdefabcdef0123456789";

test("BW-HMAC-SHA256-V1 matches the ops library (vectors from blackwellen-operations bwlib.hmacsig.sign)", () => {
  const key = hmac.bwKey("watchtower-gala_dock", SECRET);
  expect(hmac.bwSign(key, "GET", "/api/health/ready", new Uint8Array(), TS * 1000, NONCE)["X-BW-Signature"]).toBe("v1=477e848d53fc2602bda919c83a353fd8df8dd663fe2dc4bdb4b00edd894a52ea");
  expect(hmac.bwSign(key, "POST", "/v1/events", new TextEncoder().encode('{"a":1}'), TS * 1000, NONCE)["X-BW-Signature"]).toBe("v1=b3f4c7791e7355d1b1c1c259738f79038095048a2a2a7697861a092e63f1696c");
});

test("readiness signature: valid accepted; other target, other key, stale or tampered refused; short or odd secrets stay dormant", () => {
  const key = hmac.bwKey("watchtower-gala_dock", SECRET);
  const h = new Headers(hmac.bwSign(key, "GET", "/api/health/ready", new Uint8Array(), TS * 1000, NONCE));
  expect(hmac.bwVerify(key, "GET", "/api/health/ready", new Uint8Array(), h, TS * 1000)).toEqual({ ok: true, nonce: NONCE });
  expect(hmac.bwVerify(key, "GET", "/api/health", new Uint8Array(), h, TS * 1000)).toMatchObject({ ok: false, reason: "signature" });
  expect(hmac.bwVerify(hmac.bwKey("watchtower-gigvora", SECRET), "GET", "/api/health/ready", new Uint8Array(), h, TS * 1000)).toMatchObject({ ok: false, reason: "key" });
  expect(hmac.bwVerify(key, "GET", "/api/health/ready", new Uint8Array(), h, (TS + 301) * 1000)).toMatchObject({ ok: false, reason: "stale" });
  const bad = new Headers(h); bad.set("x-bw-signature", "v1=" + "0".repeat(64));
  expect(hmac.bwVerify(key, "GET", "/api/health/ready", new Uint8Array(), bad, TS * 1000)).toMatchObject({ ok: false, reason: "signature" });
  expect(hmac.bwKey("k", "abcd")).toBeNull();
  expect(hmac.bwKey("k", undefined)).toBeNull();
});

const base = { now: Date.parse("2026-11-11T12:00:00Z"), dbOk: true, auth: "healthy", errorReporting: "blocked_external",
  scanner: { configured: true, misconfigured: false }, awaitingScan: { count: 0, oldestAt: null },
  summary: { cron: [{ job: "a", active: true, state: "fresh" }], queue: { state: "healthy", dead: 0 }, alerts_open: [], incidents_open: [], synthetic_latest: [{ check: "probe.health", critical: true, status: "ok" }] } };

test("component health: healthy baseline; error reporting is informational; never green without data", () => {
  const h = health.summarise(base);
  expect(h.overall).toBe("healthy");
  expect(h.components.error_reporting).toMatchObject({ state: "unknown", informational: true });
  expect(health.summarise({ ...base, summary: null }).overall).toBe("unknown");
  expect(health.summarise({ ...base, summary: { ...base.summary, cron: [{ active: true, state: "never_run" }] } }).components.cron.state).toBe("unknown");
});

test("component health: AV, webhook/payment alerts, backlog and outages map to the states Watchtower alerts on", () => {
  expect(health.summarise({ ...base, scanner: { configured: false, misconfigured: false } })).toMatchObject({ overall: "degraded", components: { file_scanning: { state: "degraded" } } });
  expect(health.summarise({ ...base, scanner: { configured: false, misconfigured: true } }).overall).toBe("down");
  expect(health.summarise({ ...base, awaitingScan: { count: 3, oldestAt: "2026-11-11T10:00:00Z" } }).components.file_scanning).toMatchObject({ state: "degraded", count: 3, oldest_minutes: 120 });
  expect(health.summarise({ ...base, awaitingScan: { count: 1, oldestAt: "2026-11-09T10:00:00Z" } }).overall).toBe("down");
  const crit = health.summarise({ ...base, summary: { ...base.summary, alerts_open: [{ rule: "webhooks.inbound_failure_rate", severity: "critical" }, { rule: "slo.burn", severity: "warning" }] } });
  expect(crit.overall).toBe("down");
  expect(crit.components.alerts.rule_keys).toEqual(["webhooks.inbound_failure_rate", "slo.burn"]);
  expect(health.summarise({ ...base, dbOk: false }).overall).toBe("down");
  expect(health.summarise({ ...base, auth: "down" }).overall).toBe("down");
  expect(health.summarise({ ...base, summary: { ...base.summary, cron: [{ active: true, state: "missed" }] } }).overall).toBe("degraded");
});

test("heartbeat envelope: v1.0 shape, brand gala_dock, production-only idempotency per minute, no sensitive payload keys", async () => {
  const h = health.summarise({ ...base, summary: { ...base.summary, alerts_open: [{ rule: "payments.reconciliation_stale", severity: "warning" }] } });
  const e = events.heartbeatEnvelope(h, "production", base.now);
  expect(e).toMatchObject({ schema_version: "1.0", brand: "gala_dock", environment: "production", service: "gala-dock-web", event_type: "service.heartbeat",
    severity_hint: "P2", occurred_at: "2026-11-11T12:00:00Z", idempotency_key: "heartbeat:production:2026-11-11T12:00" });
  expect(e.payload).toMatchObject({ overall: "degraded", alert_rules_open: ["payments.reconciliation_stale"] });
  const forbidden = /(pass(word|wd)?|secret|token|api[_-]?key|authorization|cookie|private[_-]?key|credential|bearer|service[_-]?role|session|otp|card|iban|ssn|sql|query|cmd|command|shell|exec|path|filepath|table|redirect)/i;
  const keys: string[] = []; const walk = (o: unknown) => { if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) { keys.push(k); walk(v); } };
  walk(e.payload);
  expect(keys.filter(k => forbidden.test(k))).toEqual([]);
  // Dormant without endpoint/key; signed POST to the bus target otherwise.
  expect(await events.publishHeartbeat(h, { endpoint: null, key: null, environment: "production", send: fetch })).toEqual({ status: "dormant" });
  let seen: { url: string; headers: Record<string, string> } | null = null;
  const key = hmac.bwKey("gala_dock-events", SECRET);
  const r = await events.publishHeartbeat(h, { endpoint: "https://events.example.test/v1/events", key, environment: "production", now: () => base.now,
    send: (async (url: string, init: RequestInit) => { seen = { url, headers: init.headers as Record<string, string> }; return new Response("{}", { status: 202 }); }) as unknown as typeof fetch });
  expect(r).toMatchObject({ status: "sent", http: 202, overall: "degraded" });
  expect(seen!.headers["X-BW-Key-Id"]).toBe("gala_dock-events");
});
