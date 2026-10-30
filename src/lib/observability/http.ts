// Q34 (domains 213/215/218): instrumentation wrappers for route handlers, workers, webhooks and server actions.
// Each wrapped call runs inside an observability context (correlation id from the proxy-set `x-correlation-id` header, or a new
// one), echoes the id on the response, writes one structured `http.request` / `action.completed` line with status and latency,
// and turns an unexpected throw into a redacted error report plus a 500 that carries only the correlation id.
import { CORRELATION_HEADER, correlationFrom, withContext, type ObsContext } from "./context";
import { log } from "./log";
import { reportError } from "./errors";

type Handler<A extends unknown[]> = (request: Request, ...rest: A) => Promise<Response> | Response;

const pathOf = (request: Request) => { try { return new URL(request.url).pathname; } catch { return "?"; } };
const withHeader = (res: Response, id: string) => {
  try { res.headers.set(CORRELATION_HEADER, id); return res; } catch {
    // Immutable headers (e.g. Response.redirect): copy into a new response.
    const h = new Headers(res.headers); h.set(CORRELATION_HEADER, id);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }
};

/** Wraps a route handler (worker, webhook, API). `kind` drives SLO/alert grouping in logs. */
export function withObservability<A extends unknown[]>(operation: string, handler: Handler<A>, o: { kind?: ObsContext["kind"] } = {}) {
  return async (request: Request, ...rest: A): Promise<Response> => {
    const correlationId = correlationFrom(request.headers), t0 = Date.now(), method = request.method, path = pathOf(request);
    return withContext({ correlationId, operation, kind: o.kind ?? "route", startedAt: t0 }, async () => {
      try {
        const res = await handler(request, ...rest);
        const ms = Date.now() - t0;
        (res.status >= 500 ? log.error : res.status >= 400 ? log.warn : log.info)("http.request", { method, path, status: res.status, duration_ms: ms });
        return withHeader(res, correlationId);
      } catch (e) {
        // Next.js control-flow throws (redirect/notFound) carry a digest and must propagate.
        if (e && typeof e === "object" && "digest" in e && /^NEXT_/.test(String((e as { digest: unknown }).digest))) throw e;
        await reportError(e, { operation, method, path });
        log.error("http.request", { method, path, status: 500, duration_ms: Date.now() - t0 });
        return withHeader(Response.json({ error: "internal_error", correlation_id: correlationId }, { status: 500, headers: { "Cache-Control": "no-store" } }), correlationId);
      }
    });
  };
}

/** Correlation id for the current server action / server component request (set by the proxy). */
export async function requestCorrelationId(): Promise<string> {
  try { const { headers } = await import("next/headers"); return correlationFrom(await headers()); } catch { return correlationFrom(null); }
}

/** Wraps a server action: same context, latency log and redacted error report; the original error is re-thrown to the caller. */
export function instrumentAction<A extends unknown[], R>(operation: string, fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const correlationId = await requestCorrelationId(), t0 = Date.now();
    return withContext({ correlationId, operation, kind: "action", startedAt: t0 }, async () => {
      try {
        const r = await fn(...args);
        const failed = r && typeof r === "object" && "error" in (r as object) && Boolean((r as { error?: unknown }).error);
        (failed ? log.warn : log.info)("action.completed", { ok: !failed, duration_ms: Date.now() - t0 }, { sampled: !failed });
        return r;
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && /^NEXT_/.test(String((e as { digest: unknown }).digest))) throw e;
        await reportError(e, { operation });
        throw e;
      }
    });
  };
}
