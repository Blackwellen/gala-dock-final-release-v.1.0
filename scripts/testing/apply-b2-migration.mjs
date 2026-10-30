// Applies ONE reviewed lane B batch-2 (Q07 pay tokens, Q16 share tokens) migration to the shared Supabase project and records it in supabase_migrations.schema_migrations
// in the same implicit transaction, so history does not drift. Never logs credentials or database records.
// Usage: node --env-file=.env --env-file=.env.local scripts/testing/apply-b2-migration.mjs <file-name> --dry-run [--exercise <sql-file>] | --apply
// --exercise runs the given SQL after the migration inside the SAME rolled-back transaction (call each new/changed function with realistic args; raise to fail).
import fs from "node:fs/promises";

const REVIEWED = [
  "202610292009_invoice_pay_token_formats.sql",
  "202610292010_share_token_hashing.sql",
  "202610292011_share_revocation_sticky.sql",
  "202610292012_event_type_public_guard.sql",
];
const file = process.argv[2];
if (!REVIEWED.includes(file)) throw new Error(`Not a reviewed lane B batch-2 migration: ${file ?? "(none)"}`);
const dryRun = process.argv.includes("--dry-run");
const exIdx = process.argv.indexOf("--exercise");
const exercise = exIdx > 0 ? await fs.readFile(process.argv[exIdx + 1], "utf8") : "";
if (!dryRun && !process.argv.includes("--apply")) throw new Error("Use --dry-run (rolled-back transaction) or --apply");
if (!process.env.SUPABASE_PROJECT_REF || !process.env.SUPABASE_PAT_KEY) throw new Error("Missing database management configuration");

const [, version, name] = /^(\d{12})_(.+)\.sql$/.exec(file);
const sql = await fs.readFile(`supabase/migrations/${file}`, "utf8");
const tag = "$lane_b_b2_migration$";
if (sql.includes(tag)) throw new Error("Migration text collides with the history quote tag");

const run = async query => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(120_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Database query failed: HTTP ${response.status} ${text.replace(/\s+/g, " ").slice(0, 400)}`);
  return JSON.parse(text);
};

const recorded = await run(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`);
if (recorded[0]?.n) { console.log(`${file} is already recorded in schema_migrations; not re-applying.`); process.exit(0); }

if (dryRun) {
  // Runs the migration inside an explicit transaction that is always rolled back: proves it applies cleanly, changes nothing.
  const result = await run(`begin;
${sql}
;
${exercise}
;
rollback;`);
  if (exercise) console.log(JSON.stringify(result.at?.(-1) ?? result));
  console.log(`Dry run OK (rolled back): ${file}`);
  process.exit(0);
}

// One request = one implicit transaction: the migration and its history row commit together or not at all.
await run(`${sql}\n;\ninsert into supabase_migrations.schema_migrations(version, name, statements) values ('${version}', '${name}', array[${tag}${sql}${tag}]);`);
const check = await run(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`);
if (!check[0]?.n) throw new Error("Migration ran but its history row is missing");
console.log(`Applied and recorded ${file}`);
