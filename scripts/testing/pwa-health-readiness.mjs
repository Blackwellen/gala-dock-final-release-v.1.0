// Real production HTTP checks; GET requests only. Never stores authorization or backlog data.
import assert from "node:assert/strict";
import fs from "node:fs";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const base = process.env.E2E_BASE_URL ?? "http://localhost:3120";
if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET is required for private readiness assertions");
const get = headers => fetch(`${base}/api/health`, { headers, signal: AbortSignal.timeout(30_000) });
const report = { observedUtc: new Date().toISOString(), base, checks: [], integrations: [] };
for (const [label, headers] of [["public", {}], ["wrong_bearer", { Authorization: "Bearer invalid-fixture" }]]) {
  const response = await get(headers), body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.db, "ok");
  assert.equal("integrations" in body, false);
  assert.equal("workers" in body, false);
  assert.equal("backlog" in body, false);
  assert.match(response.headers.get("cache-control") ?? "", /(?:^|,)\s*no-store\s*(?:,|$)/);
  report.checks.push({ label, result: "PASS" });
}
const response = await get({ Authorization: `Bearer ${process.env.CRON_SECRET}` }), body = await response.json();
assert.equal(response.status, 200);
assert.ok(Array.isArray(body.integrations));
const stripe = body.integrations.find(i => i.key === "stripe"), scanner = body.integrations.find(i => i.key === "av_scanner");
assert.ok(stripe?.env.includes("STRIPE_CONNECT_SECRET_KEY"));
assert.equal(stripe?.env.includes("STRIPE_SECRET_KEY"), false);
assert.equal(scanner?.critical, true);
if (!process.env.STRIPE_CONNECT_SECRET_KEY?.trim()) assert.equal(stripe.status, "blocked_external");
if (!process.env.CLAMAV_SCAN_URL?.trim() || !process.env.CLAMAV_SCAN_TOKEN?.trim()) assert.equal(scanner.status, "blocked_external");
report.checks.push({ label: "authenticated_readiness", result: "PASS" });
report.integrations = [stripe, scanner].map(i => ({ key: i.key, critical: i.critical, status: i.status }));
fs.mkdirSync("artifacts/pwa", { recursive: true });
fs.writeFileSync("artifacts/pwa/signoff-health-readiness.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
