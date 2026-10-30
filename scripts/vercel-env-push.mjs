// Pushes local env vars (.env, then .env.local overrides) to the linked Vercel project via the REST API.
// Values are never printed. Existing entries for each key are replaced.
// Usage: node scripts/vercel-env-push.mjs [--only NAME,...] [--dry-run]
import fs from "node:fs";
import path from "node:path";

const parse = file => Object.fromEntries(fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/)
  .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }) : []);
const vars = { ...parse(".env"), ...parse(".env.local") };
const EXCLUDE = new Set(["SUPABASE_PAT_KEY"]); // management token: local scripts only
// Stripe Connect must be configured explicitly. Never promote a sandbox credential to a production key.
// The app reads RESEND_API_KEY; .env names the Resend key RESEND_API.
if (vars.RESEND_API && !vars.RESEND_API_KEY) vars.RESEND_API_KEY = vars.RESEND_API;

const argIndex = process.argv.indexOf("--only");
const only = argIndex > 0 ? process.argv[argIndex + 1].split(",") : null;
const dryRun = process.argv.includes("--dry-run");

const { projects: [project] } = JSON.parse(fs.readFileSync(".vercel/repo.json", "utf8"));
const authFile = path.join(process.env.APPDATA ?? "", "xdg.data", "com.vercel.cli", "auth.json");
const { token } = JSON.parse(fs.readFileSync(authFile, "utf8"));
const api = async (method, url, body) => {
  const response = await fetch(`https://api.vercel.com${url}${url.includes("?") ? "&" : "?"}teamId=${project.orgId}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
  return data;
};

const existing = (await api("GET", `/v10/projects/${project.id}/env`)).envs;
let failed = 0;
for (const [key, value] of Object.entries(vars)) {
  if (EXCLUDE.has(key) || !value || (only && !only.includes(key))) continue;
  if (dryRun) { console.log(`would set ${key}`); continue; }
  try {
    for (const env of existing.filter(e => e.key === key)) await api("DELETE", `/v9/projects/${project.id}/env/${env.id}`);
    await api("POST", `/v10/projects/${project.id}/env`, { key, value, type: "sensitive", target: ["production", "preview"] });
    await api("POST", `/v10/projects/${project.id}/env`, { key, value, type: "encrypted", target: ["development"] });
    console.log(`ok   ${key}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${key}: ${String(error instanceof Error ? error.message : error).replaceAll(value, "<value>")}`);
  }
}
process.exitCode = failed ? 1 : 0;
