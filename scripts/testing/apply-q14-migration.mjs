// Applies ONE reviewed Q14 (lane D: event core) migration to the shared Supabase project and records it in
// supabase_migrations.schema_migrations in the same implicit transaction, so history does not drift. Never logs credentials or records.
// Usage:
//   node --env-file=.env --env-file=.env.local scripts/testing/apply-q14-migration.mjs <file-name> --dry-run | --apply
//   node --env-file=.env --env-file=.env.local scripts/testing/apply-q14-migration.mjs --seed-machine=event --dry-run | --apply
// --seed-machine applies only that machine's rows + guard trigger from the generator output (scripts/gen-foundation-sql.mjs,
// the same text as 209912310001_state_seed.sql), so machines other lanes add concurrently are left to their own apply step.
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

const REVIEWED = [
  "202610294001_event_lifecycle.sql",
  "202610294002_programme_integrity.sql",
  "202610294003_event_duplicate.sql",
  "202610294004_ended_events_job.sql",
  "202610294005_event_guest_links.sql",
  "202610294006_readiness_compliance.sql",
];
const dryRun = process.argv.includes("--dry-run");
if (!dryRun && !process.argv.includes("--apply")) throw new Error("Use --dry-run (rolled-back transaction) or --apply");
if (!process.env.SUPABASE_PROJECT_REF || !process.env.SUPABASE_PAT_KEY) throw new Error("Missing database management configuration");

const run = async query => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(120_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Database query failed: HTTP ${response.status} ${text.replace(/\s+/g, " ").slice(0, 400)}`);
  return JSON.parse(text);
};

const seedArg = process.argv.find(a => a.startsWith("--seed-machine="));
if (seedArg) {
  const machine = seedArg.split("=")[1];
  if (machine !== "event") throw new Error(`Not a reviewed Q14 machine: ${machine}`);
  const generated = execFileSync(process.execPath, ["scripts/gen-foundation-sql.mjs"], { encoding: "utf8" });
  const statements = generated.split(/;\n/).map(s => s.trim()).filter(Boolean);
  const mine = statements.filter(s => s.includes(`values ('${machine}',`) || s.includes(`values\n  ('${machine}',`) || /\bon public\.events\b/.test(s) && /events_state_guard/.test(s));
  if (mine.length !== 4) throw new Error(`Expected 4 generated statements for ${machine}, found ${mine.length}`);
  const sql = [`delete from public.state_transitions where machine = '${machine}'`, `delete from public.state_machines where machine = '${machine}'`, ...mine].join(";\n") + ";";
  await run(dryRun ? `begin;\n${sql}\nrollback;` : sql);
  const rows = await run(`select (select count(*)::int from public.state_transitions where machine = '${machine}') as transitions, (select mode from public.state_machines where machine = '${machine}') as mode`);
  console.log(`${dryRun ? "Dry run OK (rolled back)" : "Seeded"} machine ${machine}: ${JSON.stringify(rows[0])}`);
  process.exit(0);
}

const file = process.argv[2];
if (!REVIEWED.includes(file)) throw new Error(`Not a reviewed Q14 migration: ${file ?? "(none)"}`);
const [, version, name] = /^(\d{12})_(.+)\.sql$/.exec(file);
const sql = await fs.readFile(`supabase/migrations/${file}`, "utf8");
const tag = "$lane_d_migration$";
if (sql.includes(tag)) throw new Error("Migration text collides with the history quote tag");
if (/^\s*(begin|commit)\s*;/im.test(sql)) throw new Error("Migration must not manage its own transaction");

const recorded = await run(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`);
if (recorded[0]?.n) { console.log(`${file} is already recorded in schema_migrations; not re-applying.`); process.exit(0); }

if (dryRun) {
  // Runs the migration inside an explicit transaction that is always rolled back: proves it applies cleanly, changes nothing.
  await run(`begin;\n${sql}\n;\nrollback;`);
  console.log(`Dry run OK (rolled back): ${file}`);
  process.exit(0);
}

// One request = one implicit transaction: the migration and its history row commit together or not at all.
await run(`${sql}\n;\ninsert into supabase_migrations.schema_migrations(version, name, statements) values ('${version}', '${name}', array[${tag}${sql}${tag}]);`);
const check = await run(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`);
if (!check[0]?.n) throw new Error("Migration ran but its history row is missing");
console.log(`Applied and recorded ${file}`);
