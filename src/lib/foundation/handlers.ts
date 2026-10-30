// App-runtime (TypeScript) job handlers for the canonical job queue (Q03). Register a kind in public.job_kinds with
// runtime 'app', then add its handler here. Handlers must be idempotent (at-least-once delivery; the consumer inbox drops
// replayed events). In-database handlers (runtime 'db') live in SQL and run in public.run_db_jobs().
import { PermanentJobError, type JobHandler } from "./index";
import { reconcileDirectCharges } from "@/lib/payments/reconcile-job";
import { processMerchCardRefunds } from "@/lib/payments/merch";
import { invoiceAccruedOverage } from "@/lib/billing/service";
import { deleteObject, deriveThumbnail, scanStoredObject } from "@/lib/files/service";
import { scannerConfigured } from "@/lib/upload-safety";
import { untyped } from "@/lib/workspace/db";
import { normaliseForecast, weatherHealth, weatherProvider } from "@/lib/weather/provider";

export const APP_JOB_HANDLERS: Record<string, JobHandler> = {
  /** Health canary: proves the app worker claims, completes, retries and dead-letters. `{ "fail": true }` fails on purpose. */
  "system.canary": async job => {
    if (job.payload.fail === true) throw new Error("canary failure requested");
    return { ok: true, attempt: job.attempts, echo: job.payload.echo ?? null };
  },
  /** Q07 · daily direct-charge reconciliation (card 128). Enqueued by pg_cron 'payments-reconcile'. Idempotent: each run is a new immutable record. */
  "payments.reconcile": async (job, { db }) => reconcileDirectCharges(db, { days: Math.min(31, Math.max(1, Number(job.payload.days ?? 3))) }),
  /** Q40 → Q07 · queued merchandise card refunds on the organiser's connected account. Idempotent per refund row (Stripe idempotency key). */
  "merch.card_refunds": async (_job, { db }) => processMerchCardRefunds(untyped(db as never)),
  /** Q28 · accrued AI overage of closed months → Stripe invoice items (in the platform key's mode). Idempotent per overage charge. */
  "billing.invoice_overage": async (_job, { db }) => invoiceAccruedOverage(db as never),
  /** Q04 · scan one stored object (quarantine release). Gateway not configured → deferred (re-enqueue with scripts/files/rescan-quarantined.mjs once it is). */
  "files.scan": async (job, { db }) => {
    const { bucket, name } = job.payload as { bucket: string; name: string };
    if (!scannerConfigured()) return { deferred: "scanner_not_configured", bucket, name };
    const { data: o } = await untyped(db as never).from("storage_attribution").select("sniffed_mime,declared_mime").eq("bucket", bucket).eq("name", name).maybeSingle();
    const r = await scanStoredObject(db as never, { bucket, name, mimetype: o?.sniffed_mime ?? o?.declared_mime ?? "application/octet-stream" });
    if (r.result === "retry" || r.result === "error") throw new Error(`files.scan ${r.result}`);
    return r;
  },
  /** Q04 · thumbnail derivative for a released public image (sharp re-encode, metadata-free WebP). */
  "files.derive": async (job, { db }) => deriveThumbnail(db as never, job.payload as { bucket: string; name: string }),
  /** Q04 · retention / erasure deletion through the Storage API (legal hold refuses). */
  "files.delete_object": async (job, { db }) => deleteObject(db as never, job.payload as { bucket: string; name: string; reason: string }),
  /** Q05 · one notification per dedupe key (domain-event fan-out). Retries/replays return the same row; email follows the outbox trigger. */
  "notifications.send": async (job, { db }) => {
    const p = job.payload as { user?: string; kind?: string; title?: string; body?: string | null; link?: string | null; dedupe?: string };
    if (!p.user || !p.kind || !p.title) throw new PermanentJobError("notifications.send: user, kind and title are required");
    const dedupe = p.dedupe ?? `job:${job.id}`;
    const { data, error } = await untyped(db as never).rpc("notify", { p_user: p.user, p_kind: p.kind, p_title: p.title, p_body: p.body ?? null, p_link: p.link ?? null, p_dedupe_key: dedupe });
    if (error) { if (/marketing_not_allowed/.test(error.message)) throw new PermanentJobError(error.message); throw new Error(error.message); }
    return { notification: data, dedupe };
  },
  /** Q26 · weather watches. No provider/adapter configured → watches marked not_configured (BLOCKED_EXTERNAL, visible in readiness). No external calls yet. */
  "weather.poll": async (_job, { db }) => {
    const health = weatherHealth(process.env);
    const provider = weatherProvider(process.env);
    if (!provider) {
      const reason = health.state === "ok" ? "adapter_missing" : health.status;
      const { data, error } = await untyped(db as never).rpc("weather_provider_unavailable", { p_reason: reason });
      if (error) throw new Error(error.message);
      return { deferred: "BLOCKED_EXTERNAL", reason, watches_marked: data };
    }
    const { data: watches, error } = await untyped(db as never).from("weather_watches").select("id,latitude,longitude,window_from,window_to").eq("status", "active").limit(200);
    if (error) throw new Error(error.message);
    let polled = 0;
    for (const w of (watches ?? []) as { id: string; latitude: number | null; longitude: number | null; window_from: string | null; window_to: string | null }[]) {
      if (w.latitude == null || w.longitude == null || !w.window_from || !w.window_to) continue;
      try {
        const forecast = normaliseForecast(await provider.forecast({ latitude: w.latitude, longitude: w.longitude, from: w.window_from, to: w.window_to }));
        await untyped(db as never).rpc("weather_record_forecast", { p_watch: w.id, p_provider: provider.name, p_forecast: forecast, p_error: null });
      } catch (e) {
        await untyped(db as never).rpc("weather_record_forecast", { p_watch: w.id, p_provider: provider.name, p_forecast: null, p_error: String((e as Error).message ?? e).slice(0, 300) });
      }
      polled++;
    }
    return { polled };
  },
};
