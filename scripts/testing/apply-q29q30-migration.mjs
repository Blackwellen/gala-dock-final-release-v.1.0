// Applies ONE reviewed Q24–Q26 lifecycle hook + Q29 (virtual/hybrid) + Q30 (API/MCP/webhooks) lane C migration to the
// shared Supabase project and records it in supabase_migrations.schema_migrations in the same implicit transaction, so history does not drift.
// Never logs credentials or database records.
// Usage: node --env-file=.env --env-file=.env.local scripts/testing/apply-q29q30-migration.mjs <file-name> --dry-run [--exercise=<sql file>] | --apply
//   --exercise: SQL run inside the SAME rolled-back dry-run transaction after the migration. It must call every new/changed function with
//   realistic arguments and end with a DO block that raises 'EXERCISE_OK …' — the deliberate error guarantees the rollback and carries the results.
import fs from "node:fs/promises";

const REVIEWED = [
  "202610293019_lifecycle_ops_gating.sql",
  "202610293020_lifecycle_map_gating.sql",
  "202610293021_virtual_sessions_access.sql",
  "202610293022_lifecycle_virtual_sessions.sql",
  "202610293023_api_webhooks_hardening.sql",
];
const file = process.argv[2];
if (!REVIEWED.includes(file)) throw new Error(`Not a reviewed Q29–Q30 migration: ${file ?? "(none)"}`);
const dryRun = process.argv.includes("--dry-run");
if (!dryRun && !process.argv.includes("--apply")) throw new Error("Use --dry-run (rolled-back transaction) or --apply");
if (!process.env.SUPABASE_PROJECT_REF || !process.env.SUPABASE_PAT_KEY) throw new Error("Missing database management configuration");
const exercisePath = process.argv.find(a => a.startsWith("--exercise="))?.slice("--exercise=".length);

const [, version, name] = /^(\d{12})_(.+)\.sql$/.exec(file);
const sql = await fs.readFile(`supabase/migrations/${file}`, "utf8");
const tag = "$lane_c_migration$";
if (sql.includes(tag)) throw new Error("Migration text collides with the history quote tag");

const run = async query => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(180_000) });
  const text = await response.text();
  if (!response.ok) { const err = new Error(`Database query failed: HTTP ${response.status} ${text.replace(/\s+/g, " ").slice(0, 400)}`); err.body = text; throw err; }
  return JSON.parse(text);
};

const recorded = await run(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`);
if (recorded[0]?.n) { console.log(`${file} is already recorded in schema_migrations; not re-applying.`); process.exit(0); }

if (dryRun) {
  if (exercisePath) {
    const exercise = await fs.readFile(exercisePath, "utf8");
    try {
      await run(`begin;\n${sql}\n;\n${exercise}\n;\nrollback;`);
    } catch (e) {
      const body = String(e.body ?? e.message);
      const m = /EXERCISE_OK[^"]*/.exec(body.replace(/\\"/g, "'"));
      if (m) { console.log(`Dry run + exercise OK (rolled back): ${file}\n${m[0].slice(0, 4000)}`); process.exit(0); }
      console.error(`Dry run/exercise FAILED: ${file}\n${body.replace(/\s+/g, " ").slice(0, 3000)}`); process.exit(1);
    }
    throw new Error("Exercise must end by raising EXERCISE_OK (guarantees rollback)");
  }
  await run(`begin;\n${sql}\n;\nrollback;`);
  console.log(`Dry run OK (rolled back): ${file}`);
  process.exit(0);
}

// One request = one implicit transaction: the migration and its history row commit together or not at all.
await run(`${sql}\n;\ninsert into supabase_migrations.schema_migrations(version, name, statements) values ('${version}', '${name}', array[${tag}${sql}${tag}]);`);
const check = await run(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`);
if (!check[0]?.n) throw new Error("Migration ran but its history row is missing");
console.log(`Applied and recorded ${file}`);
