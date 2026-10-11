// Read-only: compares env var NAMES in .env/.env.local with the linked Vercel project's production targets. Never prints values.
// Usage: node scripts/vercel-env-check.mjs
import fs from "node:fs";
import path from "node:path";

const names = file => fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(l => /^[A-Z0-9_]+=.+/.test(l)).map(l => l.slice(0, l.indexOf("="))) : [];
const local = [...new Set([...names(".env"), ...names(".env.local")])].sort();
const LOCAL_ONLY = new Set(["SUPABASE_PAT_KEY", "SUPABASE_PROJECT_REF", "DEMO_ADMIN_PASSWORD", "DEMO_ADMIN_TOTP_SECRET", "DEMO_CREW_PASSWORD", "DEMO_CUSTOMER_PASSWORD",
  "DEMO_ORGANIZER_PASSWORD", "DEMO_PROVIDER_PASSWORD", "DEMO_SUPPORT_ADMIN_PASSWORD", "DEMO_SUPPORT_ADMIN_TOTP_SECRET"]);
const { projects: [project] } = JSON.parse(fs.readFileSync(".vercel/repo.json", "utf8"));
const { token } = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA ?? "", "xdg.data", "com.vercel.cli", "auth.json"), "utf8"));
const r = await fetch(`https://api.vercel.com/v10/projects/${project.id}/env?teamId=${project.orgId}`, { headers: { Authorization: `Bearer ${token}` } });
if (!r.ok) { console.error(`Vercel API ${r.status}`); process.exit(1); }
const envs = (await r.json()).envs;
const prod = new Set(envs.filter(e => e.target?.includes("production")).map(e => e.key));
const missing = local.filter(k => !prod.has(k) && !LOCAL_ONLY.has(k));
const extra = [...prod].filter(k => !local.includes(k)).sort();
console.log(JSON.stringify({ project: project.name ?? project.id, production_count: prod.size, missing_in_production: missing, only_in_vercel: extra }, null, 2));
