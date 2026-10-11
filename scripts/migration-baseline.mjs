// Records every file in supabase/migrations as applied in supabase_migrations.schema_migrations (the Supabase CLI history), so
// `supabase db push` / `migration list` see the same state as the database. Migrations here were applied through the Management API,
// which doesn't write history. Idempotent; never runs migration SQL. Usage:
//   node --env-file=.env --env-file=.env.local scripts/migration-baseline.mjs
import fs from "node:fs";
import path from "node:path";

const ref = process.env.SUPABASE_PROJECT_REF, pat = process.env.SUPABASE_PAT_KEY;
if (!ref || !pat) { console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_PAT_KEY."); process.exit(1); }
const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
const rows = fs.readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort().map(f => { const [, v, n] = f.match(/^(\d+)_(.+)\.sql$/); return { v, n }; });
const versions = rows.map(r => r.v);
if (new Set(versions).size !== versions.length) { console.error("Duplicate migration versions — fix before baselining."); process.exit(1); }
const q = s => `'${s.replace(/'/g, "''")}'`;
const sql = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations(version, name, statements) values
${rows.map(r => `(${q(r.v)}, ${q(r.n)}, '{}')`).join(",\n")}
on conflict (version) do update set name = excluded.name;
select count(*)::int as recorded from supabase_migrations.schema_migrations;`;
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }) });
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}: ${text}`); process.exit(1); }
console.log(`files: ${rows.length}`, text);
