// Run after scanner provisioning. Requests only the scanner itself; no files are persisted in Gala Dock storage.
import fs from "node:fs";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const report = { observedUtc: new Date().toISOString(), scope: "Authenticated ClamAV engine health, clean sample, harmless EICAR detection and unauthenticated denial", status: "blocked_external", checks: [] };
const endpoint = process.env.CLAMAV_SCAN_URL?.trim(), token = process.env.CLAMAV_SCAN_TOKEN?.trim();
if (!endpoint || !token) report.blocker = "Scanner URL/token are not configured; user deferred provisioning";
else {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("invalid_endpoint");
    const base = endpoint.replace(/\/+$/, "");
    const request = async (path, init = {}) => {
      const response = await fetch(base + path, { ...init, redirect: "error", signal: AbortSignal.timeout(35_000) });
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    const auth = { Authorization: `Bearer ${token}` };
    const health = await request("/healthz", { headers: auth });
    report.checks.push({ name: "healthy_engine", passed: health.status === 200 && health.body?.ok === true && health.body?.clamd === "PONG" });
    // The shared Blackwellen gateway's /healthz is public (engine status only); authentication is enforced on /scan.
    const unauthenticated = await request("/scan", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: Buffer.from("unauthenticated probe") });
    report.checks.push({ name: "authentication_required", passed: unauthenticated.status === 401 });
    const post = bytes => request("/scan", { method: "POST", headers: { ...auth, "Content-Type": "application/octet-stream" }, body: bytes });
    const clean = await post(Buffer.from("Gala Dock isolated clean scanner verification sample"));
    report.checks.push({ name: "clean_sample", passed: clean.status === 200 && clean.body?.clean === true });
    const eicar = await post(Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"));
    report.checks.push({ name: "eicar_detected", passed: eicar.status === 200 && eicar.body?.clean === false && /eicar/i.test(eicar.body?.signature ?? "") });
    report.status = report.checks.every(check => check.passed) ? "passed" : "failed";
  } catch { report.status = "failed"; report.blocker = "Scanner endpoint, authentication or engine verification failed; credentials were not logged"; }
}
fs.mkdirSync("artifacts/pwa", { recursive: true });
fs.writeFileSync("artifacts/pwa/certification-scanner.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (report.status !== "passed") process.exitCode = 1;
