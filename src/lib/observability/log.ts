// Q34 (domain 213 Logging): structured JSON logs. One line per event on stdout/stderr (Vercel and Supabase capture them).
// Every line carries ts, level, event, service, env, release and the active correlation id; fields are deep-redacted
// (src/lib/observability/redact.ts) and size-bounded, so no secret, token, email or guest-care field reaches a log.
// Budget: debug is off unless LOG_LEVEL=debug; info lines for high-volume events can be sampled with LOG_SAMPLE_INFO (0–1);
// warn/error are never sampled. Logging never throws and never awaits I/O, so it cannot slow or break a transaction.
import { currentContext } from "./context";
import { redact, redactText } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogLine = { ts: string; level: LogLevel; event: string; service: string; env: string; release?: string; correlation_id?: string;
  operation?: string; kind?: string; job_id?: string; workspace_id?: string; actor_id?: string; msg?: string; [k: string]: unknown };
export type LogSink = (line: LogLine, serialised: string) => void;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_LINE = 8_000;
const EVENT = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

const defaultSink: LogSink = (line, s) => { (line.level === "error" || line.level === "warn" ? console.error : console.log)(s); };
let sink: LogSink = defaultSink;
/** Test hook: capture lines instead of printing. Returns a restore function. */
export function setLogSink(next: LogSink | null) { const prev = sink; sink = next ?? defaultSink; return () => { sink = prev; }; }

const threshold = () => ORDER[(process.env.LOG_LEVEL as LogLevel) in ORDER ? (process.env.LOG_LEVEL as LogLevel) : "info"];
const sampleInfo = () => { const n = Number(process.env.LOG_SAMPLE_INFO ?? "1"); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1; };

export function emit(level: LogLevel, event: string, fields: Record<string, unknown> = {}, o: { sampled?: boolean } = {}): LogLine | null {
  try {
    if (ORDER[level] < threshold()) return null;
    if (level === "info" && o.sampled && Math.random() >= sampleInfo()) return null;
    const ctx = currentContext();
    const { msg, ...rest } = fields;
    const line: LogLine = {
      ts: new Date().toISOString(), level, event: EVENT.test(event) ? event : "log.invalid_event_name",
      service: "gala-dock", env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development", release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
      ...(ctx?.correlationId ? { correlation_id: ctx.correlationId } : {}), ...(ctx?.operation ? { operation: ctx.operation } : {}), ...(ctx?.kind ? { kind: ctx.kind } : {}),
      ...(ctx?.jobId ? { job_id: ctx.jobId } : {}), ...(ctx?.workspaceId ? { workspace_id: ctx.workspaceId } : {}), ...(ctx?.actorId ? { actor_id: ctx.actorId } : {}),
      ...(typeof msg === "string" ? { msg: redactText(msg, 500) } : {}),
      ...(redact(rest, { maxDepth: 5, maxString: 1000, maxKeys: 40, maxArray: 20 }) as Record<string, unknown>),
    };
    let s = JSON.stringify(line);
    if (s.length > MAX_LINE) s = JSON.stringify({ ts: line.ts, level, event: line.event, correlation_id: line.correlation_id, operation: line.operation, truncated: s.length });
    sink(line, s);
    return line;
  } catch { return null; }
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>, o?: { sampled?: boolean }) => emit("info", event, fields, o),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
