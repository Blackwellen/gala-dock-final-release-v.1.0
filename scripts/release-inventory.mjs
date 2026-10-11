// Generates docs/release/SYSTEM_INVENTORY.md from the codebase and the live database catalogue (release spec §2).
// Usage: node --env-file=.env --env-file=.env.local scripts/release-inventory.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ref = process.env.SUPABASE_PROJECT_REF, pat = process.env.SUPABASE_PAT_KEY;
const sql = async q => { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }); if (!r.ok) throw new Error(await r.text()); return r.json(); };
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };
const rel = p => path.relative(root, p).replace(/\\/g, "/");

// Routes
const app = path.join(root, "src/app");
const files = walk(app);
const toRoute = f => "/" + rel(f).replace(/^src\/app\/?/, "").replace(/\/(page|route)\.tsx?$/, "").split("/").filter(s => !/^\(.*\)$/.test(s) && s !== "").join("/");
const pages = files.filter(f => /\/page\.tsx$/.test(f.replace(/\\/g, "/"))).map(f => ({ route: toRoute(f) || "/", file: rel(f) })).sort((a, b) => a.route.localeCompare(b.route));
const apis = files.filter(f => /\/route\.ts$/.test(f.replace(/\\/g, "/"))).map(f => { const src = fs.readFileSync(f, "utf8"); const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter(m => new RegExp(`export (async function|const) ${m}\\b`).test(src));
  const auth = /CRON_SECRET/.test(src) ? "cron bearer" : /authenticate\(/.test(src) ? "API key" : /getUser\(|requireUser|getOrganizer|getProvider|getAdmin|requireRole|requireAdminPermission|loadPrintable|loadMoney|getCustomer/.test(src) ? "session" : /NODE_ENV !== "development"/.test(src) ? "dev only" : /token/.test(rel(f)) ? "token" : /webhook|constructEvent|stripe-signature/i.test(src) ? "signature" : "public"; return { route: toRoute(f), methods: methods.join(", "), auth, file: rel(f) }; }).sort((a, b) => a.route.localeCompare(b.route));
const portal = r => r.startsWith("/admin") ? "Admin" : r.startsWith("/organizer") ? "Organizer" : r.startsWith("/provider") ? "Provider" : /^\/(account|discover|plan|book|tickets|saved|reviews)/.test(r) ? "Customer" : /^\/(portal|partner|promoter|client)/.test(r) ? "Portals" : /^\/(login|signup|register|mfa|auth|forgot|reset|onboarding|access|continue|invite)/.test(r) ? "Auth/Onboarding" : "Public";

// Server actions
const actionFiles = walk(path.join(root, "src")).filter(f => /\.(ts|tsx)$/.test(f) && /^["']use server["']/m.test(fs.readFileSync(f, "utf8").slice(0, 200)));
const actions = actionFiles.flatMap(f => [...fs.readFileSync(f, "utf8").matchAll(/export async function (\w+)/g)].map(m => ({ name: m[1], file: rel(f) })));

// Database catalogue
const tables = await sql(`select c.relname t, c.relrowsecurity rls, (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) policies,
  (select reltuples::bigint from pg_class x where x.oid=c.oid) est_rows from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1`);
const fns = await sql(`select p.proname f, p.prosecdef definer, array_to_string(array(select r.rolname from pg_roles r where has_function_privilege(r.oid, p.oid, 'execute') and r.rolname in ('anon','authenticated','service_role')), ',') roles
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by 1`);
const jobs = await sql(`select jobname, schedule, active from cron.job order by 1`);
const buckets = await sql(`select id, public from storage.buckets order by 1`);
const tools = await sql(`select id, risk, surface, permission from public.agent_tools order by risk, id`);
const triggers = await sql(`select event_object_table t, trigger_name n from information_schema.triggers where trigger_schema in ('public','auth') group by 1,2 order by 1,2`);

// Tests
const tests = walk(path.join(root, "tests")).filter(f => /\.spec\.ts$/.test(f)).map(f => ({ file: rel(f), count: (fs.readFileSync(f, "utf8").match(/\btest\(/g) ?? []).length }));

const noRls = tables.filter(t => !t.rls);
const lines = [];
lines.push(`# Gala Dock system inventory`, ``, `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`scripts/release-inventory.mjs\` from the codebase and the live database catalogue. Regenerate before each release.`, ``);
lines.push(`## Summary`, ``, `| Item | Count |`, `|---|---|`,
  `| Pages (routes) | ${pages.length} |`, `| API endpoints | ${apis.length} |`, `| Server actions | ${actions.length} |`, `| Database tables (public) | ${tables.length} |`,
  `| Tables with RLS enabled | ${tables.length - noRls.length} / ${tables.length} |`, `| RLS policies | ${tables.reduce((a, t) => a + Number(t.policies), 0)} |`,
  `| SQL functions (public) | ${fns.length} (${fns.filter(f => f.definer).length} security definer) |`, `| Triggers | ${triggers.length} |`, `| Scheduled jobs | ${jobs.length} |`,
  `| Storage buckets | ${buckets.length} |`, `| Agent tools | ${tools.length} |`, `| Test files / tests | ${tests.length} / ${tests.reduce((a, t) => a + t.count, 0)} |`, ``);
if (noRls.length) lines.push(`**Tables without RLS:** ${noRls.map(t => `\`${t.t}\``).join(", ")}. Each must be service-only (no grants to anon/authenticated) or be fixed.`, ``);
lines.push(`## Pages by portal`, ``);
for (const p of ["Public", "Auth/Onboarding", "Customer", "Organizer", "Provider", "Portals", "Admin"]) { const list = pages.filter(x => portal(x.route) === p); lines.push(`### ${p} (${list.length})`, ``, list.map(x => `\`${x.route}\``).join(" · "), ``); }
lines.push(`## API endpoints`, ``, `| Route | Methods | Auth | File |`, `|---|---|---|---|`, ...apis.map(a => `| \`${a.route}\` | ${a.methods} | ${a.auth} | ${a.file} |`), ``);
lines.push(`## Server actions (${actions.length})`, ``, ...Object.entries(actions.reduce((m, a) => ((m[a.file] ??= []).push(a.name), m), {})).map(([f, n]) => `* \`${f}\`: ${n.join(", ")}`), ``);
lines.push(`## Database tables`, ``, `| Table | RLS | Policies | ≈Rows |`, `|---|---|---|---|`, ...tables.map(t => `| \`${t.t}\` | ${t.rls ? "on" : "**off**"} | ${t.policies} | ${Math.max(0, Number(t.est_rows))} |`), ``);
lines.push(`## Functions callable by clients`, ``, `| Function | Definer | Roles |`, `|---|---|---|`, ...fns.filter(f => /anon|authenticated/.test(f.roles)).map(f => `| \`${f.f}\` | ${f.definer ? "yes" : ""} | ${f.roles} |`), ``);
lines.push(`## Scheduled jobs`, ``, `| Job | Schedule | Active |`, `|---|---|---|`, ...jobs.map(j => `| ${j.jobname} | \`${j.schedule}\` | ${j.active} |`), ``);
lines.push(`## Storage buckets`, ``, ...buckets.map(b => `* \`${b.id}\`: ${b.public ? "public" : "private"}`), ``);
lines.push(`## Agent tools`, ``, `| Tool | Risk | Surface | Permission |`, `|---|---|---|---|`, ...tools.map(t => `| \`${t.id}\` | R${t.risk} | ${t.surface} | ${t.permission} |`), ``);
lines.push(`## Triggers`, ``, ...Object.entries(triggers.reduce((m, t) => ((m[t.t] ??= []).push(t.n), m), {})).map(([t, n]) => `* \`${t}\`: ${n.join(", ")}`), ``);
lines.push(`## Tests`, ``, `| File | Tests |`, `|---|---|`, ...tests.map(t => `| ${t.file} | ${t.count} |`), ``);
fs.mkdirSync(path.join(root, "docs/release"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/release/SYSTEM_INVENTORY.md"), lines.join("\n"));
console.log(JSON.stringify({ pages: pages.length, apis: apis.length, actions: actions.length, tables: tables.length, noRls: noRls.map(t => t.t), fns: fns.length, jobs: jobs.length, tools: tools.length, tests: tests.length }));
