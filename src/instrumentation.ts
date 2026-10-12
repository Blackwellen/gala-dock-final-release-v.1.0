import type { Instrumentation } from "next";

/**
 * Server error reporting (release spec §136) to any Sentry-compatible endpoint — self-hosted GlitchTip on Oracle Cloud or Sentry —
 * via the store API, without an SDK. Enabled by SENTRY_DSN (https://<key>@<host>/<project>). Request headers, cookies and query strings
 * are never sent; only the method, path, route, error and digest.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const dsn = process.env.SENTRY_DSN; if (!dsn) return;
  try {
    const u = new URL(dsn), key = u.username, project = u.pathname.replace(/^\/+/, "");
    if (!key || !project) return;
    const e = err instanceof Error ? err : new Error(String(err));
    const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ""), timestamp: new Date().toISOString(), platform: "javascript", level: "error", logger: "nextjs",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV, release: process.env.VERCEL_GIT_COMMIT_SHA,
      exception: { values: [{ type: e.name, value: e.message.slice(0, 1000), stacktrace: e.stack ? { frames: e.stack.split("\n").slice(1, 30).reverse().map(l => ({ function: l.trim().slice(0, 200) })) } : undefined }] },
      tags: { route: context.routePath, route_type: context.routeType, router: context.routerKind, digest },
      request: { method: request.method, url: request.path.split("?")[0] },
    };
    await fetch(`${u.protocol}//${u.host}/api/${project}/store/`, {
      method: "POST", signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=gala-dock/1.0, sentry_key=${key}` },
      body: JSON.stringify(event),
    });
  } catch { /* reporting must never affect the request */ }
};
