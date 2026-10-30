import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function moduleAt(file: string, env: Record<string, string | undefined>, fetcher: typeof fetch) {
  const loaded = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  // Pure in-repo modules (e.g. src/lib/files/safety-core.ts, split out in Q04) load in the same sandbox; anything else is refused.
  const local = (name: string) => name.startsWith("@/lib/") && !/supabase|server/.test(name) ? `src/${name.slice(2)}.ts` : null;
  runInNewContext(code, { module: loaded, exports: loaded.exports, require: (name: string) => { if (name === "server-only") return {}; const f = local(name); if (f) return moduleAt(f, env, fetcher); throw new Error(`Unexpected dependency: ${name}`); }, process: { env }, fetch: fetcher, AbortSignal, Uint8Array, TextDecoder, TextEncoder, Date });
  return loaded.exports;
}
const keys = { STRIPE_CONNECT_SECRET_KEY: "sk_live_fixture", STRIPE_PUBLIC_KEY: "pk_live_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture", CLAMAV_SCAN_URL: "https://scanner.test", CLAMAV_SCAN_TOKEN: "fixture-token" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("readiness checks the same Connect credential used by payments; unrelated keys cannot satisfy it", async () => {
  const m = moduleAt("src/lib/release/integrations.ts", { STRIPE_SECRET_KEY: "sk_live_unused", STRIPE_PUBLIC_KEY: "pk_live_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture" }, async () => response({}));
  const rows = await m.readiness() as Array<{ key: string; status: string; detail: string }>;
  expect(rows.find(r => r.key === "stripe")).toMatchObject({ status: "blocked_external", detail: "Missing: STRIPE_CONNECT_SECRET_KEY" });
});

for (const [secret, publicKey, expected] of [["sk_test_fixture", "pk_test_fixture", "sandbox"], ["sk_live_fixture", "pk_test_fixture", "degraded"], ["invalid", "pk_live_fixture", "degraded"], ["rk_live_fixture", "pk_live_fixture", "ready"]]) {
  test(`payment readiness distinguishes ${secret.split("_").slice(0, 2).join("_")} / ${publicKey.split("_").slice(0, 2).join("_")}`, async () => {
    const m = moduleAt("src/lib/release/integrations.ts", { ...keys, STRIPE_CONNECT_SECRET_KEY: secret, STRIPE_PUBLIC_KEY: publicKey }, async () => response({}));
    const rows = await m.readiness() as Array<{ key: string; status: string }>;
    expect(rows.find(r => r.key === "stripe")?.status).toBe(expected);
  });
}

test("scanner readiness requires a healthy engine rather than HTTP 200 alone", async () => {
  for (const body of [{ ok: true, clamd: "PONG" }, { ok: true, clamd: "ERROR" }, { ok: false }, {}]) {
    const m = moduleAt("src/lib/release/integrations.ts", { CLAMAV_SCAN_URL: keys.CLAMAV_SCAN_URL, CLAMAV_SCAN_TOKEN: keys.CLAMAV_SCAN_TOKEN }, async () => response(body));
    const rows = await m.readiness(true) as Array<{ key: string; status: string; critical: boolean }>;
    expect(rows.find(r => r.key === "av_scanner")).toMatchObject({ critical: true, status: "clamd" in body && body.clamd === "PONG" ? "ready" : "degraded" });
  }
});

test("partial scanner configuration refuses uploads without making an unauthenticated scan", async () => {
  for (const env of [{ CLAMAV_SCAN_URL: keys.CLAMAV_SCAN_URL }, { CLAMAV_SCAN_TOKEN: keys.CLAMAV_SCAN_TOKEN }]) {
    let calls = 0;
    const m = moduleAt("src/lib/upload-safety.ts", env, async () => { calls++; return response({ clean: true }); });
    expect(await m.scan(new Uint8Array([1]))).toEqual({ ok: false, reason: "scanner_unavailable" });
    expect(calls).toBe(0);
  }
});

test("scanner accepts only explicit clean verdicts and refuses infected, malformed and failed responses", async () => {
  for (const [body, status, expected] of [[{ clean: true }, 200, "clean"], [{ clean: false, signature: "Eicar-Test-Signature" }, 200, "infected"], [{ clean: "true" }, 200, "scanner_unavailable"], [{}, 200, "scanner_unavailable"], [{ clean: true }, 503, "scanner_unavailable"]] as const) {
    const m = moduleAt("src/lib/upload-safety.ts", keys, async () => response(body, status));
    const verdict = await m.scan(new Uint8Array([1])) as { ok: boolean; reason?: string };
    expect(verdict.ok).toBe(expected === "clean");
    if (expected !== "clean") expect(verdict.reason).toBe(expected);
  }
});
