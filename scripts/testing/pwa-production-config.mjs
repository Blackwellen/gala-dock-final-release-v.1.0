// Read-only readiness inventory. Never prints or stores credential values and never changes remote configuration.
import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const required = ["STRIPE_CONNECT_SECRET_KEY", "STRIPE_PUBLIC_KEY", "STRIPE_WEBHOOK_SECRET", "CLAMAV_SCAN_URL", "CLAMAV_SCAN_TOKEN"];
const present = key => Boolean(process.env[key]?.trim());
const mode = value => /^(?:sk|rk|pk)_live_/.test(value ?? "") ? "live" : /^(?:sk|rk|pk)_test_/.test(value ?? "") ? "test" : value ? "invalid" : "missing";
const report = {
  observedUtc: new Date().toISOString(), scope: "Local production env and read-only linked Vercel variable metadata; presence is not live certification",
  local: Object.fromEntries(required.map(key => [key, { present: present(key) }])),
  paymentModes: { secret: mode(process.env.STRIPE_CONNECT_SECRET_KEY), publishable: mode(process.env.STRIPE_PUBLIC_KEY) },
  remote: { status: "not_checked", production: {} },
};
try {
  const repoFile = ".vercel/repo.json", authFile = path.join(process.env.APPDATA ?? "", "xdg.data", "com.vercel.cli", "auth.json");
  if (!fs.existsSync(repoFile) || !fs.existsSync(authFile)) report.remote.status = "no_link_or_cli_auth";
  else {
    const project = JSON.parse(fs.readFileSync(repoFile, "utf8")).projects?.[0];
    const token = JSON.parse(fs.readFileSync(authFile, "utf8")).token;
    if (!project?.id || !project?.orgId || !token) report.remote.status = "no_link_or_cli_auth";
    else {
      const response = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(project.id)}/env?teamId=${encodeURIComponent(project.orgId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      report.remote.status = response.ok ? "metadata_checked" : `http_${response.status}`;
      if (response.ok) {
        const data = await response.json();
        for (const key of required) {
          const vars = (data.envs ?? []).filter(env => env.key === key && env.target?.includes("production") && !env.gitBranch && !env.customEnvironmentIds?.length);
          report.remote.production[key] = { present: vars.length > 0, valueVerified: false };
        }
      }
    }
  }
} catch { report.remote.status = "metadata_check_unavailable"; }
fs.mkdirSync("artifacts/pwa", { recursive: true });
fs.writeFileSync("artifacts/pwa/signoff-production-config.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
