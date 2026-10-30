import type { Instrumentation } from "next";

/**
 * Stripe go-live (lane A2, migration 202610295001): the PRODUCTION server records its Stripe mode — derived from the platform key
 * prefix, never configured separately — in public.stripe_platform_mode, the fallback the database uses for callers that do not send
 * the per-request mode header (page reads under RLS, pg_cron). Preview and local servers never write it (they share the database).
 * A flip (test → live, or back on rollback) re-mirrors workspaces.payout_status for the new mode. Not awaited: never delays boot.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL_ENV !== "production") return;
  void (async () => {
    try {
      const { platformMode } = await import("./lib/payments/stripe-mode");
      const mode = platformMode(process.env);
      if (mode === "unconfigured") return;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return;
      // Plain client here: src/lib/supabase/admin.ts is `server-only`, which instrumentation is not compiled to allow.
      const { createClient } = await import("@supabase/supabase-js");
      const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await db.rpc("stripe_set_platform_mode", { p_livemode: mode === "live", p_source: "production_boot" });
      if (error) console.error(JSON.stringify({ level: "error", msg: "stripe_platform_mode_sync_failed", code: error.message.slice(0, 80) }));
    } catch { /* never affect boot */ }
  })();
}

/**
 * Server error reporting (release spec §136; Q34 domain 213/216) through the provider-neutral adapter in
 * src/lib/observability/errors.ts: always a redacted structured log line, plus the Sentry store API (self-hosted GlitchTip on the
 * Oracle ops VM, or Sentry) when SENTRY_DSN is set. Request headers, cookies, query strings and bodies are never sent; only the
 * method, path, route, error, digest and the request's correlation id.
 * The adapter uses Node-only modules (AsyncLocalStorage), so it is imported only inside the Node.js runtime branch; the Edge
 * build eliminates the branch (NEXT_RUNTIME is inlined at build time).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { reportError } = await import("./lib/observability/errors");
      const { withContext, isCorrelationId } = await import("./lib/observability/context");
      const h = request.headers as Record<string, string | string[] | undefined>;
      const raw = h["x-correlation-id"]; const cid = Array.isArray(raw) ? raw[0] : raw;
      const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
      await withContext({ correlationId: isCorrelationId(cid) ? cid : undefined, operation: context.routePath, kind: "route" }, () =>
        reportError(err, { route: context.routePath, routeType: context.routeType, method: request.method, path: request.path, digest, tags: { router: context.routerKind } }));
    } catch { /* reporting must never affect the request */ }
  }
};
