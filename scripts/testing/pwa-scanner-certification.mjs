// Run after scanner provisioning. Requests only the scanner itself; no files are persisted in Gala Dock storage.
import fs from "node:fs";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const report = { observedUtc: new Date().toISOString(), scope: "Per gateway (main and standby): clean sample (engine health), harmless EICAR detection and unauthenticated denial", status: "blocked_external", checks: [] };
const token = process.env.CLAMAV_SCAN_TOKEN?.trim();
const gateways = [["main", process.env.CLAMAV_SCAN_URL?.trim()], ["standby", process.env.CLAMAV_SCAN_URL_SECONDARY?.trim()]].filter(([, u]) => u);
if (!gateways.length || !process.env.CLAMAV_SCAN_URL?.trim() || !token) report.blocker = "Scanner URL/token are not configured; user deferred provisioning";
else for (const [role, endpoint] of gateways) {
  const push = (c) => report.checks.push({ ...c, gateway: role });
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("invalid_endpoint");
    const base = endpoint.replace(/\/+$/, "");
    const request = async (path, init = {}) => {
      const response = await fetch(base + path, { ...init, redirect: "error", signal: AbortSignal.timeout(35_000) });
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    const auth = { Authorization: `Bearer ${token}` };
    // The public gateway addresses pass only /scan (and the signed /v1 API); /healthz is 404 there. The gateway answers 503 when the engine is
    // down or its signatures are stale, so an explicit clean verdict below is the engine health check.
    const unauthenticated = await request("/scan", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: Buffer.from("unauthenticated probe") });
    push({ name: "authentication_required", passed: unauthenticated.status === 401 });
    const post = bytes => request("/scan", { method: "POST", headers: { ...auth, "Content-Type": "application/octet-stream" }, body: bytes });
    const clean = await post(Buffer.from("Gala Dock isolated clean scanner verification sample"));
    push({ name: "clean_sample_healthy_engine", passed: clean.status === 200 && clean.body?.clean === true });
    const eicar = await post(Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"));
    push({ name: "eicar_detected", passed: eicar.status === 200 && eicar.body?.clean === false && /eicar/i.test(eicar.body?.signature ?? "") });
  } catch { push({ name: "endpoint_reachable", passed: false }); report.blocker = "Scanner endpoint, authentication or engine verification failed; credentials were not logged"; }
}
if (report.checks.length) report.status = report.checks.every(check => check.passed) ? "passed" : "failed";
fs.mkdirSync("artifacts/pwa", { recursive: true });
fs.writeFileSync("artifacts/pwa/certification-scanner.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (report.status !== "passed") process.exitCode = 1;
