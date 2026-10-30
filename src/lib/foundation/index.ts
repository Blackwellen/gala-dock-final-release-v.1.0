// Canonical workflow / state / queue foundation (Q03): typed wrappers over the SQL primitives in
// supabase/migrations/202610291007_workflow_foundation.sql. Every function takes a SERVICE-ROLE client (the primitives are
// service-only) so this module stays importable from server code, workers and API-level tests alike.
// See docs/architecture/domain-events.md and docs/architecture/state-machines.md.
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withContext } from "../observability/context";
import { log } from "../observability/log";
import { redactText } from "../observability/redact";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceDb = SupabaseClient<any, any, any>;

const call = async <T>(db: ServiceDb, fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

// ── Correlation IDs (§4.5): UI → service → DB → outbox → queue → integration → audit ──────────────────────────────
const CORRELATION_HEADERS = ["x-correlation-id", "x-request-id", "x-vercel-id"];
export const newCorrelationId = () => `cor_${randomUUID().replace(/-/g, "")}`;
/** Reuses an inbound correlation id when it is well-formed, otherwise mints one. */
export function correlationId(headers?: Headers | null): string {
  for (const h of CORRELATION_HEADERS) { const v = headers?.get(h)?.trim(); if (v && /^[\w.:-]{6,120}$/.test(v)) return v; }
  return newCorrelationId();
}

// ── Database clock ───────────────────────────────────────────────────────────────────────────────────────────────
/** Leases, run_after and next_run_at are database timestamps; compare against this, never the app server's clock. */
export const dbNow = async (db: ServiceDb) => new Date(await call<string>(db, "db_now", {}));

// ── Transactional outbox ─────────────────────────────────────────────────────────────────────────────────────────
export type EmitInput = { type: string; workspaceId: string | null; payload?: Record<string, unknown>; actorId?: string | null; actorType?: "user" | "agent" | "system" | "webhook" | "admin";
  aggregateType?: string; aggregateId?: string; correlationId?: string; causationId?: string };
/**
 * Writes one outbox event in its own transaction. Prefer emitting inside the SQL command that changes state
 * (public.emit_domain_event) — or writing a catalogued audit event, which is captured in the same transaction — so the
 * event exists exactly when the change commits. Use this only for events with no accompanying row change.
 */
export const emitDomainEvent = (db: ServiceDb, e: EmitInput) => call<string>(db, "emit_domain_event", {
  p_type: e.type, p_workspace: e.workspaceId, p_payload: e.payload ?? {}, p_actor: e.actorId ?? null, p_actor_type: e.actorType ?? "system",
  p_aggregate_type: e.aggregateType ?? null, p_aggregate_id: e.aggregateId ?? null, p_correlation: e.correlationId ?? null, p_causation: e.causationId ?? null });

// ── Job queue ────────────────────────────────────────────────────────────────────────────────────────────────────
export type Job = { id: string; kind: string; payload: Record<string, unknown>; status: string; attempts: number; max_attempts: number; consumer: string | null;
  event_id: string | null; workspace_id: string | null; correlation_id: string | null; dedupe_key: string | null; run_after: string; lease_until: string | null };
export type EnqueueOptions = { dedupeKey?: string; runAfter?: Date; workspaceId?: string | null; correlationId?: string; priority?: number };
/** Durable job. A dedupe key makes enqueueing idempotent: the same key returns the existing job id. */
export const enqueueJob = (db: ServiceDb, kind: string, payload: Record<string, unknown> = {}, o: EnqueueOptions = {}) => call<string>(db, "enqueue_job", {
  p_kind: kind, p_payload: payload, p_dedupe_key: o.dedupeKey ?? null, p_run_after: o.runAfter?.toISOString() ?? null, p_workspace: o.workspaceId ?? null,
  p_correlation: o.correlationId ?? null, p_priority: o.priority ?? 100, p_event: null, p_consumer: null });
export const claimJobs = (db: ServiceDb, worker: string, runtime: "db" | "app", o: { limit?: number; kinds?: string[]; leaseSeconds?: number } = {}) =>
  call<Job[]>(db, "claim_jobs", { p_worker: worker, p_runtime: runtime, p_limit: o.limit ?? 10, p_kinds: o.kinds ?? null, p_lease_seconds: o.leaseSeconds ?? null });
export const completeJob = (db: ServiceDb, id: string, worker: string, result: unknown = null) => call<boolean>(db, "complete_job", { p_job: id, p_worker: worker, p_result: result });
export const failJob = (db: ServiceDb, id: string, worker: string, error: string, retry = true) => call<string | null>(db, "fail_job", { p_job: id, p_worker: worker, p_error: error, p_retry: retry });
export const retryDeadJob = (db: ServiceDb, id: string, reason: string) => call<boolean>(db, "retry_dead_job", { p_job: id, p_reason: reason });
/** Publishes the outbox and runs due in-database handlers (also run by pg_cron every minute). */
export const runDbJobs = (db: ServiceDb, o: { limit?: number; kinds?: string[] } = {}) =>
  call<{ published: number; succeeded: number; duplicates: number; failed: number }>(db, "run_db_jobs", { p_limit: o.limit ?? 50, p_kinds: o.kinds ?? null });

/** App-runtime handler. Must be idempotent: delivery is at-least-once (the consumer inbox removes replays of an event). */
export type JobHandler = (job: Job, ctx: { db: ServiceDb; correlationId: string }) => Promise<unknown>;
/** Marker error: do not retry (the job goes straight to the dead-letter state). */
export class PermanentJobError extends Error {}

/** Claims and runs due app-runtime jobs. Unknown kinds fail (and dead-letter after max attempts) rather than vanish. */
export async function runAppJobs(db: ServiceDb, handlers: Record<string, JobHandler>, o: { worker?: string; limit?: number; kinds?: string[]; leaseSeconds?: number } = {}) {
  const worker = o.worker ?? `app:${randomUUID()}`;
  const jobs = await claimJobs(db, worker, "app", { limit: o.limit ?? 20, kinds: o.kinds, leaseSeconds: o.leaseSeconds });
  const out = { claimed: jobs.length, succeeded: 0, duplicates: 0, failed: 0, dead: 0, lost: 0 };
  for (const job of jobs) {
    try {
      if (job.consumer && job.event_id) {
        const { data } = await db.from("consumer_inbox").select("job_id").eq("consumer", job.consumer).eq("event_id", job.event_id).maybeSingle();
        if (data) { await completeJob(db, job.id, worker, { duplicate: true }); out.duplicates++; continue; }
      }
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`No app handler registered for ${job.kind}`);   // retried: a deploy may be rolling out the handler
      // Q34: each job runs in its own observability context so logs/audit/errors carry the job's correlation id end to end.
      const cid = job.correlation_id ?? newCorrelationId(), t0 = Date.now();
      const result = await withContext({ correlationId: cid, operation: `job:${job.kind}`, kind: "job", jobId: job.id, workspaceId: job.workspace_id }, () => handler(job, { db, correlationId: cid }));
      if (await completeJob(db, job.id, worker, result ?? null)) out.succeeded++; else out.lost++;
      withContext({ correlationId: cid, operation: `job:${job.kind}`, kind: "job", jobId: job.id }, () => log.info("job.completed", { kind: job.kind, attempt: job.attempts, duration_ms: Date.now() - t0 }, { sampled: true }));
    } catch (e) {
      // Stored and logged errors are redacted (Q34): handler messages can quote payload values.
      const message = redactText(String((e as Error)?.message ?? e), 2000);
      const status = await failJob(db, job.id, worker, message, !(e instanceof PermanentJobError));
      if (status === "dead") out.dead++; else out.failed++;
      withContext({ correlationId: job.correlation_id ?? newCorrelationId(), operation: `job:${job.kind}`, kind: "job", jobId: job.id }, () =>
        log[status === "dead" ? "error" : "warn"]("job.failed", { kind: job.kind, attempt: job.attempts, status, error: message.slice(0, 300) }));
    }
  }
  return out;
}

// ── Idempotency registry ─────────────────────────────────────────────────────────────────────────────────────────
export const requestHash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
const stableJson = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v ?? null)
  : Array.isArray(v) ? `[${v.map(stableJson).join(",")}]` : `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;

export class IdempotencyError extends Error { constructor(public code: "idempotency_conflict" | "idempotency_in_progress", message: string) { super(message); } }
export type IdempotentResult<T> = { replayed: boolean; status: number; body: T };

/**
 * Runs `fn` at most once per (scope, key) while the key lives (default 24h). A replay returns the stored response;
 * the same key with a different request is a conflict; a concurrent duplicate gets `idempotency_in_progress`.
 * If `fn` throws, the key is released so the caller can retry.
 */
export async function withIdempotency<T>(db: ServiceDb, o: { scope: string; key: string; request: unknown; ttlSeconds?: number; lockSeconds?: number; workspaceId?: string | null; actorId?: string | null },
  fn: () => Promise<{ status: number; body: T }>): Promise<IdempotentResult<T>> {
  const hash = requestHash(o.request);
  const begin = await call<{ state: "started" | "replay" | "in_progress" | "mismatch"; response?: T; status?: number }>(db, "idempotency_begin", {
    p_scope: o.scope, p_key: o.key, p_hash: hash, p_ttl_seconds: o.ttlSeconds ?? 86400, p_lock_seconds: o.lockSeconds ?? 60, p_workspace: o.workspaceId ?? null, p_actor: o.actorId ?? null });
  if (begin.state === "replay") return { replayed: true, status: begin.status ?? 200, body: begin.response as T };
  if (begin.state === "mismatch") throw new IdempotencyError("idempotency_conflict", "This idempotency key was already used for a different request.");
  if (begin.state === "in_progress") throw new IdempotencyError("idempotency_in_progress", "A request with this idempotency key is still being processed.");
  let result: { status: number; body: T };
  try { result = await fn(); } catch (e) {
    await call(db, "idempotency_finish", { p_scope: o.scope, p_key: o.key, p_hash: hash, p_success: false, p_response: null, p_status: null }).catch(() => undefined);
    throw e;
  }
  await call(db, "idempotency_finish", { p_scope: o.scope, p_key: o.key, p_hash: hash, p_success: true, p_response: result.body as unknown, p_status: result.status });
  return { replayed: false, ...result };
}

// ── State machines ───────────────────────────────────────────────────────────────────────────────────────────────
export type TransitionResult = { ok: true; changed: boolean; from?: string; to?: string; state?: string; event_id?: string } | { ok: false; conflict: true; current: string | null };
/**
 * Explicit transition command over public.state_machines: locks the row, checks the expected current state (optimistic
 * concurrency), rejects transitions the machine does not allow, updates through the table's state guard and writes
 * `<machine>.state_changed` to the outbox in the same transaction.
 */
export const transitionState = (db: ServiceDb, machine: string, id: string, to: string, o: { expected?: string; actorId?: string | null; actorType?: string; reason?: string; correlationId?: string } = {}) =>
  call<TransitionResult>(db, "transition_state", { p_machine: machine, p_id: id, p_to: to, p_expected: o.expected ?? null, p_actor: o.actorId ?? null,
    p_actor_type: o.actorType ?? "system", p_reason: o.reason ?? null, p_correlation: o.correlationId ?? null });
