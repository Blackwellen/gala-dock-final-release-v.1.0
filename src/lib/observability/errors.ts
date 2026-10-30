// Q34 (domains 213/216): error-reporting adapter. Provider-neutral contract with one implementation: the Sentry store API
// (self-hosted GlitchTip on the Oracle ops VM, or Sentry), called without an SDK. Every error is ALSO written as a structured
// log line, so nothing is lost while the provider is BLOCKED_EXTERNAL (no SENTRY_DSN).
// Env contract (names only): SENTRY_DSN (required to send) · SENTRY_ENVIRONMENT, SENTRY_RELEASE, SENTRY_SAMPLE_RATE (optional).
// Privacy: request headers, cookies, query strings and bodies are never sent; message, stack frames and tags are redacted.
import { currentContext, newCorrelationId } from "./context";
import { log } from "./log";
import { redact, redactText } from "./redact";

export type ErrorReportingHealth = { key: "error_tracking"; state: "configured" | "blocked_external" | "misconfigured"; provider: "sentry_store_api" | null;
  env: string[]; optionalEnv: string[]; missing: string[]; issues: string[]; host?: string };

const ENV = ["SENTRY_DSN"], OPTIONAL = ["SENTRY_ENVIRONMENT", "SENTRY_RELEASE", "SENTRY_SAMPLE_RATE"];

function parseDsn(dsn: string | undefined) {
  if (!dsn?.trim()) return null;
  try {
    const u = new URL(dsn.trim()); const key = decodeURIComponent(u.username); const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return { error: "DSN must use https" } as const;
    if (!key || !/^[A-Za-z0-9]+$/.test(project)) return { error: "DSN must look like https://<key>@<host>/<project-id>" } as const;
    return { key, project, endpoint: `${u.protocol}//${u.host}/api/${project}/store/`, host: u.host } as const;
  } catch { return { error: "DSN is not a URL" } as const; }
}

/** Configuration health for /api/health and the admin System health page. Never returns the DSN or its key. */
export function errorReportingHealth(env: Record<string, string | undefined> = process.env): ErrorReportingHealth {
  const p = parseDsn(env.SENTRY_DSN);
  if (!p) return { key: "error_tracking", state: "blocked_external", provider: null, env: ENV, optionalEnv: OPTIONAL, missing: ["SENTRY_DSN"], issues: [] };
  if ("error" in p) return { key: "error_tracking", state: "misconfigured", provider: "sentry_store_api", env: ENV, optionalEnv: OPTIONAL, missing: [], issues: [p.error ?? "invalid"] };
  const rate = env.SENTRY_SAMPLE_RATE, issues: string[] = [];
  if (rate !== undefined && !(Number(rate) >= 0 && Number(rate) <= 1)) issues.push("SENTRY_SAMPLE_RATE must be between 0 and 1");
  return { key: "error_tracking", state: issues.length ? "misconfigured" : "configured", provider: "sentry_store_api", env: ENV, optionalEnv: OPTIONAL, missing: [], issues, host: p.host };
}

export type ErrorContext = { operation?: string; route?: string; routeType?: string; method?: string; path?: string; digest?: string;
  level?: "error" | "warning" | "fatal"; tags?: Record<string, string | number | boolean | undefined>; extra?: Record<string, unknown> };

/** Builds the (redacted) provider payload. Exposed for tests; reportError sends it. */
export function buildErrorEvent(err: unknown, ctx: ErrorContext = {}, env: Record<string, string | undefined> = process.env) {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(redact(err)));
  const c = currentContext();
  return {
    event_id: newCorrelationId().slice(4), timestamp: new Date().toISOString(), platform: "javascript", level: ctx.level ?? "error", logger: "gala-dock",
    environment: env.SENTRY_ENVIRONMENT ?? env.VERCEL_ENV ?? env.NODE_ENV, release: env.SENTRY_RELEASE ?? env.VERCEL_GIT_COMMIT_SHA,
    exception: { values: [{ type: e.name, value: redactText(e.message, 1000),
      stacktrace: e.stack ? { frames: e.stack.split("\n").slice(1, 30).reverse().map(l => ({ function: redactText(l.trim(), 200) })) } : undefined }] },
    tags: Object.fromEntries(Object.entries({ correlation_id: c?.correlationId, operation: ctx.operation ?? c?.operation, kind: c?.kind, route: ctx.route, route_type: ctx.routeType,
      digest: ctx.digest, ...ctx.tags }).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, redactText(String(v), 200)])),
    request: ctx.method || ctx.path ? { method: ctx.method, url: ctx.path ? redactText(ctx.path.split("?")[0], 300) : undefined } : undefined,
    extra: ctx.extra ? redact(ctx.extra, { maxDepth: 4, maxString: 500 }) : undefined,
  };
}

export type ReportResult = { logged: true; sent: boolean; reason?: "blocked_external" | "misconfigured" | "sampled_out" | "send_failed" };

/** Reports an error: always a redacted structured log line; also sent to the provider when configured. Never throws. */
export async function reportError(err: unknown, ctx: ErrorContext = {}, o: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<ReportResult> {
  const env = o.env ?? process.env;
  try {
    const ev = buildErrorEvent(err, ctx, env);
    log.error("error.reported", { operation: ev.tags.operation, error_type: ev.exception.values[0].type, error: ev.exception.values[0].value, route: ctx.route, digest: ctx.digest });
    const h = errorReportingHealth(env);
    if (h.state !== "configured") return { logged: true, sent: false, reason: h.state === "blocked_external" ? "blocked_external" : "misconfigured" };
    const rate = env.SENTRY_SAMPLE_RATE === undefined ? 1 : Number(env.SENTRY_SAMPLE_RATE);
    if (Math.random() >= rate) return { logged: true, sent: false, reason: "sampled_out" };
    const p = parseDsn(env.SENTRY_DSN)!; if ("error" in p) return { logged: true, sent: false, reason: "misconfigured" };
    const r = await (o.fetchImpl ?? fetch)(p.endpoint, { method: "POST", signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=gala-dock/1.1, sentry_key=${p.key}` }, body: JSON.stringify(ev) });
    return r.ok ? { logged: true, sent: true } : { logged: true, sent: false, reason: "send_failed" };
  } catch { return { logged: true, sent: false, reason: "send_failed" }; }
}
