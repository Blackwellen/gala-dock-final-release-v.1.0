// Read-only production health inspection using the existing monitor credential. No private backlog or secrets are retained.
import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const report = { observedUtc: new Date().toISOString(), scope: "Linked production HTTPS health; GET only", checks: [] };
try {
  const project = JSON.parse(fs.readFileSync(".vercel/repo.json", "utf8")).projects[0];
  const token = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA ?? "", "xdg.data", "com.vercel.cli", "auth.json"), "utf8")).token;
  const listed = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(project.id)}/domains?teamId=${encodeURIComponent(project.orgId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!listed.ok) throw new Error("domain_metadata_unavailable");
  const data = await listed.json();
  const domains = (data.domains ?? []).filter(d => d.verified && ["galadock.com", "www.galadock.com"].includes(d.name) && !d.gitBranch);
  for (const domain of domains) {
    const endpoint = `https://${domain.name}/api/health`;
    const response = await fetch(endpoint, { headers: process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {}, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const body = await response.json().catch(() => null);
    const integrations = Array.isArray(body?.integrations) ? body.integrations : [];
    const stripe = integrations.find(i => i.key === "stripe"), scanner = integrations.find(i => i.key === "av_scanner");
    report.checks.push({ endpoint, http: response.status, health: body?.status ?? "not_reported", privateReadiness: integrations.length > 0,
      payment: stripe ? { status: stripe.status, checksActualConnectVariable: stripe.env?.includes("STRIPE_CONNECT_SECRET_KEY") === true, reportedMode: /\bLIVE\b/.test(stripe.detail ?? "") ? "live" : /\bTEST\b/.test(stripe.detail ?? "") ? "test" : "unreported" } : { status: "unverified" },
      scanner: scanner ? { status: scanner.status, critical: scanner.critical === true } : { status: "unverified" } });
  }
  if (!domains.length) report.blocker = "No verified production Gala Dock domain is linked to this project";
} catch { report.blocker = "Read-only production health inspection unavailable"; }
fs.mkdirSync("artifacts/pwa", { recursive: true });
fs.writeFileSync("artifacts/pwa/certification-deployed-health.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
