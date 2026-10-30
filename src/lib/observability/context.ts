// Q34 (domain 215 Tracing): request / job context carried through async work with AsyncLocalStorage, so every log line,
// error report and audit row written while handling one request or job shares its correlation id.
// Flow: proxy mints/accepts `x-correlation-id` → route handler / server action (withObservability, actionContext) →
// writeAudit / emit_domain_event (correlation_id) → domain_outbox → job_queue.correlation_id → job handler context → logs.

export type ObsContext = {
  correlationId: string;
  /** What is running: a route ("GET /api/health"), a worker ("cron.payments"), a job kind ("job:files.scan") or an action. */
  operation?: string;
  kind?: "route" | "action" | "worker" | "webhook" | "job" | "probe" | "script";
  /** Opaque ids only (never emails or names). */
  actorId?: string | null;
  workspaceId?: string | null;
  jobId?: string | null;
  startedAt?: number;
};

type Store<T> = { getStore(): T | undefined; run<R>(value: T, fn: () => R): R };
// No static Node import: this module is reachable from edge-compiled code (instrumentation), which must not trace node:* modules.
// Next.js exposes AsyncLocalStorage on globalThis in both runtimes; plain Node (scripts, tests) uses getBuiltinModule.
function makeStore<T>(): Store<T> {
  const g = globalThis as { AsyncLocalStorage?: new () => Store<T> };
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => { AsyncLocalStorage?: new () => Store<T> } } }).process;
  const Ctor = g.AsyncLocalStorage ?? proc?.getBuiltinModule?.("node:async_hooks")?.AsyncLocalStorage;
  return Ctor ? new Ctor() : { getStore: () => undefined, run: (_v, fn) => fn() };
}
const store = makeStore<ObsContext>();

export const CORRELATION_HEADER = "x-correlation-id";
const INBOUND = [CORRELATION_HEADER, "x-request-id", "x-vercel-id"];
const WELL_FORMED = /^[\w.:-]{6,120}$/;

export const newCorrelationId = () => `cor_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
export const isCorrelationId = (v: unknown): v is string => typeof v === "string" && WELL_FORMED.test(v);

/** Reuses a well-formed inbound id (proxy-minted, uptime monitor, Vercel) or mints one. Never trusts malformed input. */
export function correlationFrom(headers?: Headers | null): string {
  for (const h of INBOUND) { const v = headers?.get(h)?.trim(); if (isCorrelationId(v)) return v; }
  return newCorrelationId();
}

export const currentContext = (): ObsContext | undefined => store.getStore();
export const currentCorrelationId = (): string | undefined => store.getStore()?.correlationId;

/** Runs fn inside a context; nested calls inherit unspecified fields from the parent. */
export function withContext<T>(ctx: Partial<ObsContext> & { correlationId?: string }, fn: () => T): T {
  const parent = store.getStore();
  const next: ObsContext = { ...parent, ...ctx, correlationId: ctx.correlationId ?? parent?.correlationId ?? newCorrelationId(), startedAt: ctx.startedAt ?? Date.now() };
  return store.run(next, fn);
}
